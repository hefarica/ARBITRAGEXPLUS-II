import { db } from "./db";
import { chains, chainRpcs, chainDexes, assets, pairs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { poolValidator } from "./pool-validator";
import { getCanonicalTokens, getWNative, getStablecoins } from "./canonical-tokens";

interface ConfigPair {
  name: string;
  token0: string;
  token1: string;
  pairAddress: string;
}

interface ConfigChain {
  name: string;
  chainId: number;
  dexs: string[];
  topPairs: ConfigPair[];
}

interface EngineConfig {
  chains: ConfigChain[];
  totalChains: number;
  totalDexs: number;
  lastUpdated: number;
}

export class EngineConfigService {
  async exportToJson(validatePools: boolean = true): Promise<EngineConfig> {
    const activeChains = await db.query.chains.findMany({
      where: eq(chains.isActive, true),
    });

    const configChains: ConfigChain[] = [];
    let totalDexs = 0;
    const validationErrors: string[] = [];

    for (const chain of activeChains) {
      const activeDexes = await db.query.chainDexes.findMany({
        where: and(
          eq(chainDexes.chainId, chain.chainId),
          eq(chainDexes.isActive, true)
        ),
      });

      const dexs = activeDexes.map((d) => d.dex);
      totalDexs += dexs.length;

      const chainPairs = await db.query.pairs.findMany({
        where: and(
          eq(pairs.chainId, chain.chainId),
          eq(pairs.enabled, true)
        ),
      });

      const topPairs: ConfigPair[] = [];

      for (const pair of chainPairs) {
        const baseAsset = await db.query.assets.findFirst({
          where: and(
            eq(assets.chainId, chain.chainId),
            eq(assets.address, pair.baseAddr)
          ),
        });

        const quoteAsset = await db.query.assets.findFirst({
          where: and(
            eq(assets.chainId, chain.chainId),
            eq(assets.address, pair.quoteAddr)
          ),
        });

        if (baseAsset && quoteAsset) {
          const canonicalTokens = getCanonicalTokens(Number(chain.chainId));
          
          if (!canonicalTokens) {
            console.warn(`⚠️ No canonical tokens defined for chain ${chain.chainId}, using legacy method`);
            const availablePools = await poolValidator.findCorrectPoolAddress(
              Number(chain.chainId),
              pair.baseAddr,
              pair.quoteAddr,
              500
            );

            for (const pool of availablePools.slice(0, 3)) {
              topPairs.push({
                name: `${baseAsset.symbol}/${quoteAsset.symbol} @ ${pool.dexId}`,
                token0: pair.baseAddr,
                token1: pair.quoteAddr,
                pairAddress: pool.poolAddress!,
              });
            }
            continue;
          }

          const quoteAddresses = getStablecoins(Number(chain.chainId));
          
          console.log(`🔍 Finding pools for ${baseAsset.symbol}/${quoteAsset.symbol} across ${dexs.length} DEXs on ${chain.name}...`);
          console.log(`   Using canonical addresses: base=${pair.baseAddr}, quote=${quoteAddresses.join(',')}`);
          
          const availablePools = await poolValidator.findPoolsByAddress(
            Number(chain.chainId),
            pair.baseAddr,
            quoteAddresses
          );

          console.table(availablePools.map(p => ({
            dex: p.dexId,
            pair: p.poolAddress?.substring(0, 10) + '...',
            liq: p.liquidity ? `$${(p.liquidity / 1000000).toFixed(2)}M` : 'N/A',
            vol24h: p.volume24h ? `$${(p.volume24h / 1000000).toFixed(2)}M` : 'N/A'
          })));

          const seenDexPool = new Set<string>();

          for (const dexName of dexs) {
            const dexNameLower = dexName.toLowerCase().replace(/\s+/g, '');
            
            const matchingPools = availablePools.filter(pool => {
              const poolDexLower = (pool.dexId || '').toLowerCase().replace(/\s+/g, '');
              return poolDexLower.includes(dexNameLower) || dexNameLower.includes(poolDexLower);
            });

            if (matchingPools.length > 0) {
              for (const pool of matchingPools) {
                const key = `${pool.dexId}|${pool.poolAddress}`;
                
                if (seenDexPool.has(key)) {
                  continue;
                }

                if (validatePools) {
                  const validation = await poolValidator.validatePoolAddress(
                    Number(chain.chainId),
                    pool.poolAddress!,
                    pair.baseAddr,
                    pair.quoteAddr
                  );

                  if (!validation.isValid) {
                    const error = `🚨 CRITICAL: Invalid pool for ${baseAsset.symbol}/${quoteAsset.symbol} on ${pool.dexId} (${chain.name}): ${pool.poolAddress} - ${validation.error}`;
                    validationErrors.push(error);
                    console.error(error);
                    continue;
                  }
                }

                topPairs.push({
                  name: `${baseAsset.symbol}/${quoteAsset.symbol} @ ${pool.dexId}`,
                  token0: pair.baseAddr,
                  token1: pair.quoteAddr,
                  pairAddress: pool.poolAddress!,
                });
                
                seenDexPool.add(key);
                console.log(`✅ ${baseAsset.symbol}/${quoteAsset.symbol} @ ${pool.dexId}: ${pool.poolAddress} (Liquidity: $${pool.liquidity?.toLocaleString()})`);
              }
            } else {
              console.warn(`⚠️ No pool found for ${baseAsset.symbol}/${quoteAsset.symbol} on ${dexName} (searched in ${availablePools.length} total pools)`);
            }
          }

          console.log(`📊 Summary: ${seenDexPool.size} unique pools added for ${baseAsset.symbol}/${quoteAsset.symbol}`);

          if (seenDexPool.size === 0 && pair.pairAddr && pair.pairAddr !== "0x0000000000000000000000000000000000000000") {
            console.log(`📝 Using fallback pool address for ${baseAsset.symbol}/${quoteAsset.symbol}`);
            topPairs.push({
              name: `${baseAsset.symbol}/${quoteAsset.symbol}`,
              token0: pair.baseAddr,
              token1: pair.quoteAddr,
              pairAddress: pair.pairAddr,
            });
          }
        }
      }

      configChains.push({
        name: chain.name,
        chainId: Number(chain.chainId),
        dexs,
        topPairs,
      });
    }

    if (validationErrors.length > 0) {
      throw new Error(`Pool validation failed:\n${validationErrors.join('\n')}`);
    }

    const config: EngineConfig = {
      chains: configChains,
      totalChains: configChains.length,
      totalDexs,
      lastUpdated: Date.now(),
    };

    return config;
  }

  async writeConfigFile(config: EngineConfig): Promise<void> {
    const configPath = path.join(process.cwd(), "mev-scan-config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Config exported to ${configPath}`);
  }

  async exportAndWrite(): Promise<EngineConfig> {
    const config = await this.exportToJson();
    await this.writeConfigFile(config);
    return config;
  }
}

export const engineConfigService = new EngineConfigService();
