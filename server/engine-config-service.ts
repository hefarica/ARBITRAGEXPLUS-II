import { db } from "./db";
import { chains, chainRpcs, chainDexes, assets, pairs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { poolValidator } from "./pool-validator";

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
          const pairAddress = pair.pairAddr || "0x0000000000000000000000000000000000000000";

          if (validatePools && pair.pairAddr && pair.pairAddr !== "0x0000000000000000000000000000000000000000") {
            console.log(`🔍 Validating pool ${baseAsset.symbol}/${quoteAsset.symbol} on ${chain.name}...`);
            const validation = await poolValidator.validatePoolAddress(
              Number(chain.chainId),
              pair.pairAddr,
              pair.baseAddr,
              pair.quoteAddr
            );

            if (!validation.isValid) {
              const error = `🚨 CRITICAL: Invalid pool address for ${baseAsset.symbol}/${quoteAsset.symbol} on ${chain.name} (Chain ${chain.chainId}): ${pair.pairAddr} - ${validation.error}`;
              validationErrors.push(error);
              console.error(error);
            } else if (validation.warnings && validation.warnings.length > 0) {
              console.warn(`⚠️ Pool ${baseAsset.symbol}/${quoteAsset.symbol}:`, validation.warnings.join(', '));
            } else {
              console.log(`✅ Pool ${baseAsset.symbol}/${quoteAsset.symbol} validated successfully`);
            }
          }

          topPairs.push({
            name: `${baseAsset.symbol}/${quoteAsset.symbol}`,
            token0: pair.baseAddr,
            token1: pair.quoteAddr,
            pairAddress,
          });
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
