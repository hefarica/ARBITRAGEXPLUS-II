import { db } from "./db";
import { refPools, assets } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { poolValidator } from "./pool-validator";
import { getWNative, getCanonicalTokens } from "./canonical-tokens";

export class RefPoolsService {
  async recomputeRefPools(chainId: number): Promise<number> {
    console.log(`🔄 Recomputing reference pools for chain ${chainId}...`);
    
    const wnative = getWNative(chainId);
    if (!wnative) {
      console.warn(`⚠️ No WNATIVE defined for chain ${chainId}`);
      return 0;
    }

    const chainAssets = await db.query.assets.findMany({
      where: eq(assets.chainId, chainId),
    });

    const refPoolsToInsert = [];
    const wnativeLower = wnative.toLowerCase();

    for (const asset of chainAssets) {
      if (asset.address.toLowerCase() === wnativeLower) {
        continue;
      }

      try {
        const pools = await poolValidator.findCorrectPoolAddress(
          chainId,
          wnative,
          asset.address,
          1000
        );

        if (pools.length === 0) {
          continue;
        }

        const bestPool = pools.reduce((best, current) => {
          const bestLiq = best.liquidity || 0;
          const currentLiq = current.liquidity || 0;
          return currentLiq > bestLiq ? current : best;
        });

        if (!bestPool.poolAddress) {
          continue;
        }

        const feeBps = this.inferFeeBps(bestPool.dexId);
        
        refPoolsToInsert.push({
          chainId: BigInt(chainId),
          token: asset.address.toLowerCase(),
          pairAddress: bestPool.poolAddress.toLowerCase(),
          feeBps,
          dexId: bestPool.dexId || "unknown",
          score: bestPool.liquidity || 0,
          source: "auto",
        });

        console.log(`✅ Ref pool for ${asset.symbol}: ${bestPool.dexId} (${bestPool.poolAddress?.slice(0, 10)}...) - $${bestPool.liquidity?.toLocaleString()}`);
      } catch (error: any) {
        console.error(`❌ Error finding ref pool for ${asset.symbol}:`, error?.message);
      }
    }

    if (refPoolsToInsert.length === 0) {
      console.log(`⚠️ No reference pools found for chain ${chainId}`);
      return 0;
    }

    await db.delete(refPools).where(eq(refPools.chainId, chainId));

    for (const pool of refPoolsToInsert) {
      await db.insert(refPools).values(pool).onConflictDoUpdate({
        target: [refPools.chainId, refPools.token],
        set: {
          pairAddress: pool.pairAddress,
          feeBps: pool.feeBps,
          dexId: pool.dexId,
          score: pool.score,
          source: pool.source,
          updatedAt: sql`now()`,
        },
      });
    }

    console.log(`✅ Recomputed ${refPoolsToInsert.length} reference pools for chain ${chainId}`);
    return refPoolsToInsert.length;
  }

  async getRefPools(chainId: number) {
    return await db.query.refPools.findMany({
      where: eq(refPools.chainId, chainId),
    });
  }

  async upsertRefPool(
    chainId: number,
    token: string,
    pairAddress: string,
    feeBps: number,
    dexId: string,
    score?: number
  ) {
    await db.insert(refPools).values({
      chainId: BigInt(chainId),
      token: token.toLowerCase(),
      pairAddress: pairAddress.toLowerCase(),
      feeBps,
      dexId,
      score,
      source: "manual",
    }).onConflictDoUpdate({
      target: [refPools.chainId, refPools.token],
      set: {
        pairAddress: pairAddress.toLowerCase(),
        feeBps,
        dexId,
        score,
        source: "manual",
        updatedAt: sql`now()`,
      },
    });
  }

  private inferFeeBps(dexId: string): number {
    const dexLower = dexId.toLowerCase();
    
    if (dexLower.includes("v3")) {
      return 30;
    } else if (dexLower.includes("v2")) {
      return 30;
    } else if (dexLower.includes("pancakeswap")) {
      return 25;
    } else if (dexLower.includes("uniswap")) {
      return 30;
    } else if (dexLower.includes("sushiswap")) {
      return 30;
    } else if (dexLower.includes("curve")) {
      return 4;
    }
    
    return 30;
  }
}

export const refPoolsService = new RefPoolsService();
