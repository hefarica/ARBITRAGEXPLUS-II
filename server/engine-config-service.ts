import { db } from "./db";
import { chains, chainRpcs, chainDexes, assets, pairs, policies, refPools } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { poolValidator } from "./pool-validator";
import { getCanonicalTokens, getWNative } from "./canonical-tokens";

interface RpcPool {
  wss: string[];
  https: string[];
}

interface ConfigPool {
  dexId: string;
  pairAddress: string;
  feeBps: number;
}

interface LegacyPair {
  name: string;
  token0: string;
  token1: string;
  pairAddress: string;
}

interface ConfigAsset {
  address: string;
  symbol: string;
  decimals: number;
  tags?: string[];
}

interface ConfigDex {
  dexId: string;
  enabled: boolean;
  quoter?: string;
}

interface SizeGrid {
  min: number;
  max: number;
  steps: number;
}

interface ConfigPolicies {
  roiMinBps: number;
  gasSafetyBps: number;
  slippageBps: number;
  sizeGrid: SizeGrid;
  capPctTvl: number;
  bundleMaxBlocks: number;
  gasUnitsHintRoundtripV2?: number;
}

interface ConfigRisk {
  blocklists: string[];
  taxLike: string[];
  allowBridgedSymbols: boolean;
}

interface ConfigRefPool {
  token: string;
  pairAddress: string;
  feeBps: number;
  dexId: string;
}

interface ConfigChain {
  name: string;
  chainId: number;
  alias: string;
  wnative: string;
  rpcPool: RpcPool;
  dexs: string[];
  dexes: ConfigDex[];
  assets: ConfigAsset[];
  pools: ConfigPool[];
  topPairs: LegacyPair[];
  policies: ConfigPolicies;
  risk: ConfigRisk;
  refPools: ConfigRefPool[];
}

interface EngineConfig {
  version: string;
  chains: ConfigChain[];
  totalChains: number;
  totalDexs: number;
  lastUpdated: number;
}

export class EngineConfigService {
  async exportToJson(): Promise<EngineConfig> {
    const version = new Date().toISOString();
    console.log(`📦 Exporting configuration with version: ${version}`);
    
    const activeChains = await db.query.chains.findMany({
      where: eq(chains.isActive, true),
    });

    const configChains: ConfigChain[] = [];

    for (const chain of activeChains) {
      const chainConfig = await this.buildChainConfig(chain);
      if (chainConfig) {
        configChains.push(chainConfig);
      }
    }

    const totalDexs = configChains.reduce((sum, chain) => sum + chain.dexs.length, 0);
    
    const config: EngineConfig = {
      version,
      chains: configChains,
      totalChains: configChains.length,
      totalDexs,
      lastUpdated: Date.now(),
    };

    return config;
  }

  private async buildChainConfig(chain: any): Promise<ConfigChain | null> {
    const wnative = getWNative(Number(chain.chainId));
    if (!wnative) {
      console.warn(`⚠️ No WNATIVE defined for chain ${chain.chainId}, skipping...`);
      return null;
    }

    const [rpcs, dexes, chainAssets, chainPairs, chainPolicies, chainRefPools] = await Promise.all([
      db.query.chainRpcs.findMany({
        where: and(
          eq(chainRpcs.chainId, chain.chainId),
          eq(chainRpcs.isActive, true)
        ),
      }),
      db.query.chainDexes.findMany({
        where: and(
          eq(chainDexes.chainId, chain.chainId),
          eq(chainDexes.isActive, true)
        ),
      }),
      db.query.assets.findMany({
        where: eq(assets.chainId, chain.chainId),
      }),
      db.query.pairs.findMany({
        where: and(
          eq(pairs.chainId, chain.chainId),
          eq(pairs.enabled, true)
        ),
      }),
      this.getChainPolicies(Number(chain.chainId)),
      db.query.refPools.findMany({
        where: eq(refPools.chainId, chain.chainId),
      }),
    ]);

    const rpcPool = this.buildRpcPool(rpcs);
    const configDexes = dexes.map(d => ({
      dexId: d.dex,
      enabled: true,
    }));

    const configAssets = chainAssets.map(a => ({
      address: a.address.toLowerCase(),
      symbol: a.symbol,
      decimals: a.decimals,
      tags: this.inferAssetTags(a, wnative),
    }));

    const { configPools, legacyPairs } = await this.buildConfigPools(
      Number(chain.chainId),
      chainPairs,
      dexes.map(d => d.dex)
    );

    const configRefPools = chainRefPools.map(rp => ({
      token: rp.token.toLowerCase(),
      pairAddress: rp.pairAddress.toLowerCase(),
      feeBps: rp.feeBps,
      dexId: rp.dexId,
    }));

    const configRisk = await this.getChainRisk(Number(chain.chainId));

    const chainConfig: ConfigChain = {
      name: chain.name,
      chainId: Number(chain.chainId),
      alias: chain.name.toLowerCase().replace(/\s+/g, '-'),
      wnative: wnative.toLowerCase(),
      rpcPool,
      dexs: dexes.map(d => d.dex),
      dexes: configDexes,
      assets: configAssets,
      pools: configPools,
      topPairs: legacyPairs,
      policies: chainPolicies,
      risk: configRisk,
      refPools: configRefPools,
    };

    return chainConfig;
  }

  private buildRpcPool(rpcs: any[]): RpcPool {
    const wss: string[] = [];
    const https: string[] = [];

    for (const rpc of rpcs) {
      const url = rpc.url;
      if (url.startsWith("wss://") || url.startsWith("ws://")) {
        wss.push(url);
      } else if (url.startsWith("https://") || url.startsWith("http://")) {
        https.push(url);
      }
    }

    return { wss, https };
  }

  private inferAssetTags(asset: any, wnative: string): string[] {
    const tags: string[] = [];
    
    if (asset.address.toLowerCase() === wnative.toLowerCase()) {
      tags.push("wnative");
    }

    const symbolUpper = asset.symbol.toUpperCase();
    if (["USDC", "USDT", "DAI", "USDE", "BUSD", "USDbC"].includes(symbolUpper)) {
      tags.push("stable");
    }

    if (asset.riskScore >= 80) {
      tags.push("safe");
    }

    return tags;
  }

  private async buildConfigPools(
    chainId: number,
    chainPairs: any[],
    dexes: string[]
  ): Promise<{ configPools: ConfigPool[]; legacyPairs: LegacyPair[] }> {
    const configPools: ConfigPool[] = [];
    const legacyPairs: LegacyPair[] = [];
    const canonicalTokens = getCanonicalTokens(chainId);

    for (const pair of chainPairs) {
      const baseAsset = await db.query.assets.findFirst({
        where: and(
          eq(assets.chainId, chainId),
          eq(assets.address, pair.baseAddr)
        ),
      });

      const quoteAsset = await db.query.assets.findFirst({
        where: and(
          eq(assets.chainId, chainId),
          eq(assets.address, pair.quoteAddr)
        ),
      });

      if (!baseAsset || !quoteAsset) continue;

      const pairQuoteLower = pair.quoteAddr.toLowerCase();
      let pairQuoteVariants: string[] = [];

      if (canonicalTokens) {
        if (canonicalTokens.USDC.some(addr => addr.toLowerCase() === pairQuoteLower)) {
          pairQuoteVariants = canonicalTokens.USDC;
        } else if (canonicalTokens.USDT.some(addr => addr.toLowerCase() === pairQuoteLower)) {
          pairQuoteVariants = canonicalTokens.USDT;
        } else {
          pairQuoteVariants = [pair.quoteAddr];
        }
      } else {
        pairQuoteVariants = [pair.quoteAddr];
      }

      const availablePools = await poolValidator.findPoolsByAddress(
        chainId,
        pair.baseAddr,
        pairQuoteVariants
      );

      const seenDexPool = new Set<string>();

      for (const dexName of dexes) {
        const dexNameLower = dexName.toLowerCase().replace(/\s+/g, '');
        
        const matchingPools = availablePools.filter(pool => {
          const poolDexLower = (pool.dexId || '').toLowerCase().replace(/\s+/g, '');
          return poolDexLower.includes(dexNameLower) || dexNameLower.includes(poolDexLower);
        });

        for (const pool of matchingPools) {
          const key = `${pool.dexId}|${pool.poolAddress}`;
          
          if (seenDexPool.has(key) || !pool.poolAddress) {
            continue;
          }

          const feeBps = this.extractFeeBps(pool);
          
          configPools.push({
            dexId: pool.dexId || "unknown",
            pairAddress: pool.poolAddress.toLowerCase(),
            feeBps,
          });
          
          const poolAddressShort = pool.poolAddress.slice(-6);
          legacyPairs.push({
            name: `${baseAsset.symbol}/${quoteAsset.symbol} @ ${dexNameLower} (${poolAddressShort})`,
            token0: pair.baseAddr.toLowerCase(),
            token1: pair.quoteAddr.toLowerCase(),
            pairAddress: pool.poolAddress.toLowerCase(),
          });
          
          seenDexPool.add(key);
        }
      }
    }

    return { configPools, legacyPairs };
  }

  private extractFeeBps(pool: any): number {
    if (pool.feeTier !== undefined && pool.feeTier !== null) {
      return pool.feeTier;
    }

    const dexLower = (pool.dexId || "").toLowerCase();
    
    if (dexLower.includes("pancakeswap")) return 25;
    if (dexLower.includes("uniswap-v3")) return 30;
    if (dexLower.includes("curve")) return 4;
    if (dexLower.includes("balancer")) return 30;
    
    return 30;
  }

  private async getChainPolicies(chainId: number): Promise<ConfigPolicies> {
    const policyData = await db.query.policies.findFirst({
      where: eq(policies.key, `chain_${chainId}_policies`),
    });

    if (policyData && policyData.valueJson) {
      const parsed = policyData.valueJson as any;
      return {
        roiMinBps: parsed.roiMinBps || 300,
        gasSafetyBps: parsed.gasSafetyBps || 200,
        slippageBps: parsed.slippageBps || 30,
        sizeGrid: parsed.sizeGrid || { min: 0.05, max: 15, steps: 9 },
        capPctTvl: parsed.capPctTvl || 0.02,
        bundleMaxBlocks: parsed.bundleMaxBlocks || 2,
        gasUnitsHintRoundtripV2: parsed.gasUnitsHintRoundtripV2,
      };
    }

    return {
      roiMinBps: 300,
      gasSafetyBps: 200,
      slippageBps: 30,
      sizeGrid: { min: 0.05, max: 15, steps: 9 },
      capPctTvl: 0.02,
      bundleMaxBlocks: 2,
      gasUnitsHintRoundtripV2: 215000,
    };
  }

  private async getChainRisk(chainId: number): Promise<ConfigRisk> {
    const riskData = await db.query.policies.findFirst({
      where: eq(policies.key, `chain_${chainId}_risk`),
    });

    if (riskData && riskData.valueJson) {
      const parsed = riskData.valueJson as any;
      return {
        blocklists: parsed.blocklists || [],
        taxLike: parsed.taxLike || [],
        allowBridgedSymbols: parsed.allowBridgedSymbols !== false,
      };
    }

    return {
      blocklists: [],
      taxLike: [],
      allowBridgedSymbols: true,
    };
  }

  async writeConfigFile(config: EngineConfig): Promise<void> {
    const configPath = path.join(process.cwd(), "mev-scan-config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Config exported to ${configPath} (version: ${config.version})`);
  }

  async exportAndWrite(): Promise<EngineConfig> {
    const config = await this.exportToJson();
    await this.writeConfigFile(config);
    return config;
  }

  async validateConfig(config: EngineConfig): Promise<{ valid: boolean; errors: string[]; warnings?: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.version) {
      errors.push("Missing version field");
    }

    for (const chain of config.chains) {
      if (!chain.wnative || chain.wnative.length !== 42) {
        errors.push(`Chain ${chain.chainId}: invalid wnative address`);
      }

      if (!chain.rpcPool.https || chain.rpcPool.https.length < 1) {
        errors.push(`Chain ${chain.chainId}: need at least 1 HTTPS RPC`);
      } else if (chain.rpcPool.https.length < 2) {
        warnings.push(`Chain ${chain.chainId}: recommended at least 2 HTTPS RPCs for quorum`);
      }

      if (!chain.rpcPool.wss || chain.rpcPool.wss.length < 1) {
        warnings.push(`Chain ${chain.chainId}: recommended at least 1 WSS RPC for real-time updates`);
      } else if (chain.rpcPool.wss.length < 2) {
        warnings.push(`Chain ${chain.chainId}: recommended at least 2 WSS RPCs for quorum`);
      }

      const policies = chain.policies;
      if (policies.sizeGrid.min >= policies.sizeGrid.max) {
        errors.push(`Chain ${chain.chainId}: sizeGrid min must be < max`);
      }

      if (policies.sizeGrid.steps < 3) {
        errors.push(`Chain ${chain.chainId}: sizeGrid steps must be >= 3`);
      }

      const poolKeys = new Set<string>();
      for (const pool of chain.pools) {
        const key = `${pool.dexId}|${pool.pairAddress}`;
        if (poolKeys.has(key)) {
          errors.push(`Chain ${chain.chainId}: duplicate pool ${key}`);
        }
        poolKeys.add(key);

        if (pool.feeBps < 0 || pool.feeBps > 10000) {
          errors.push(`Chain ${chain.chainId}: invalid feeBps ${pool.feeBps} for pool ${pool.pairAddress}`);
        }
      }

      if (!chain.risk.allowBridgedSymbols) {
        const usdcVariants = new Set<string>();
        for (const asset of chain.assets) {
          if (asset.symbol.toUpperCase().includes("USDC")) {
            usdcVariants.add(asset.address);
          }
        }

        if (usdcVariants.size > 1) {
          errors.push(`Chain ${chain.chainId}: allowBridgedSymbols=false but found multiple USDC variants`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export const engineConfigService = new EngineConfigService();
