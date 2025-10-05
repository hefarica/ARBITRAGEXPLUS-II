import { db } from "./db";
import { chains, chainRpcs, chainDexes, assets, pairs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

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
  async exportToJson(): Promise<EngineConfig> {
    const activeChains = await db.query.chains.findMany({
      where: eq(chains.isActive, true),
    });

    const configChains: ConfigChain[] = [];
    let totalDexs = 0;

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
          topPairs.push({
            name: `${baseAsset.symbol}/${quoteAsset.symbol}`,
            token0: pair.baseAddr,
            token1: pair.quoteAddr,
            pairAddress: pair.pairAddr || "0x0000000000000000000000000000000000000000",
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
