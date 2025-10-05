import { Router } from "express";
import { db } from "./db";
import { chains, chainRpcs, chainDexes, assets, pairs, policies, configVersions } from "@shared/schema";
import { eq, and, sql, gte, inArray } from "drizzle-orm";

export const engineApiRouter = Router();

// GET /api/engine/state - Returns complete engine configuration state
engineApiRouter.get("/state", async (req, res) => {
  try {
    const [chainsData, rpcsData, dexesData, assetsData, pairsData, policiesData] = await Promise.all([
      db.select().from(chains),
      db.select().from(chainRpcs).where(eq(chainRpcs.isActive, true)),
      db.select().from(chainDexes).where(eq(chainDexes.isActive, true)),
      db.select().from(assets).where(gte(assets.riskScore, 0)),
      db.select().from(pairs).where(eq(pairs.enabled, true)),
      db.select().from(policies),
    ]);

    const state = {
      chains: chainsData.map(chain => ({
        id: chain.id,
        name: chain.name,
        chainId: chain.chainId,
        evm: chain.evm,
        metamask: chain.metamaskJson,
        rpcs: rpcsData.filter(r => r.chainId === chain.chainId).map(r => ({
          url: r.url,
          latencyMs: r.lastLatencyMs,
          lastOkAt: r.lastOkAt,
        })),
        dexes: dexesData.filter(d => d.chainId === chain.chainId).map(d => d.dex),
      })),
      assets: assetsData.map(asset => ({
        chainId: asset.chainId,
        address: asset.address,
        symbol: asset.symbol,
        decimals: asset.decimals,
        name: asset.name,
        riskScore: asset.riskScore,
        riskFlags: asset.riskFlags,
      })),
      pairs: pairsData.map(pair => ({
        chainId: pair.chainId,
        base: pair.baseAddr,
        quote: pair.quoteAddr,
        enabled: pair.enabled,
      })),
      policies: policiesData.reduce((acc, p) => {
        acc[p.key] = p.valueJson;
        return acc;
      }, {} as Record<string, any>),
      timestamp: Date.now(),
    };

    res.json(state);
  } catch (error) {
    console.error("Error fetching engine state:", error);
    res.status(500).json({ error: "Failed to fetch engine state" });
  }
});

// POST /api/engine/addChain - Add new blockchain
engineApiRouter.post("/addChain", async (req, res) => {
  try {
    const { name, chainId, evm = true, metamask, rpcPool = [], dexes = [] } = req.body;

    if (!name || !chainId) {
      return res.status(400).json({ error: "name and chainId are required" });
    }

    if (rpcPool.length < 5) {
      return res.status(400).json({ error: "Minimum 5 RPCs required" });
    }

    if (dexes.length < 2) {
      return res.status(400).json({ error: "Minimum 2 DEXs required" });
    }

    const [chain] = await db.insert(chains).values({
      name,
      chainId: Number(chainId),
      evm,
      metamaskJson: metamask || null,
    }).onConflictDoUpdate({
      target: chains.chainId,
      set: {
        name,
        evm,
        metamaskJson: metamask || null,
        updatedAt: sql`now()`,
      },
    }).returning();

    for (const url of rpcPool) {
      await db.insert(chainRpcs).values({
        chainId: Number(chainId),
        url,
        isActive: true,
      }).onConflictDoNothing();
    }

    for (const dex of dexes) {
      await db.insert(chainDexes).values({
        chainId: Number(chainId),
        dex,
        isActive: true,
      }).onConflictDoNothing();
    }

    res.json({ success: true, chain, message: "Chain added successfully" });
  } catch (error) {
    console.error("Error adding chain:", error);
    res.status(500).json({ error: "Failed to add chain" });
  }
});

// POST /api/engine/updateChain - Update existing blockchain (merge idempotent)
engineApiRouter.post("/updateChain", async (req, res) => {
  try {
    const { chainId, name, evm, metamask, rpcPool, dexes } = req.body;

    if (!chainId) {
      return res.status(400).json({ error: "chainId is required" });
    }

    const existingChain = await db.select().from(chains).where(eq(chains.chainId, Number(chainId))).limit(1);
    
    if (existingChain.length === 0) {
      return res.status(404).json({ error: "Chain not found" });
    }

    await db.update(chains)
      .set({
        ...(name && { name }),
        ...(evm !== undefined && { evm }),
        ...(metamask && { metamaskJson: metamask }),
        updatedAt: sql`now()`,
      })
      .where(eq(chains.chainId, Number(chainId)));

    if (rpcPool && Array.isArray(rpcPool)) {
      for (const url of rpcPool) {
        await db.insert(chainRpcs).values({
          chainId: Number(chainId),
          url,
          isActive: true,
        }).onConflictDoNothing();
      }
    }

    if (dexes && Array.isArray(dexes)) {
      for (const dex of dexes) {
        await db.insert(chainDexes).values({
          chainId: Number(chainId),
          dex,
          isActive: true,
        }).onConflictDoNothing();
      }
    }

    res.json({ success: true, message: "Chain updated successfully" });
  } catch (error) {
    console.error("Error updating chain:", error);
    res.status(500).json({ error: "Failed to update chain" });
  }
});

// POST /api/engine/removeChain - Remove blockchain
engineApiRouter.post("/removeChain", async (req, res) => {
  try {
    const { chainId } = req.body;

    if (!chainId) {
      return res.status(400).json({ error: "chainId is required" });
    }

    await db.delete(chains).where(eq(chains.chainId, Number(chainId)));

    res.json({ success: true, message: "Chain removed successfully" });
  } catch (error) {
    console.error("Error removing chain:", error);
    res.status(500).json({ error: "Failed to remove chain" });
  }
});

// POST /api/engine/addRpc - Add RPC endpoint
engineApiRouter.post("/addRpc", async (req, res) => {
  try {
    const { chainId, url } = req.body;

    if (!chainId || !url) {
      return res.status(400).json({ error: "chainId and url are required" });
    }

    await db.insert(chainRpcs).values({
      chainId: Number(chainId),
      url,
      isActive: true,
    }).onConflictDoNothing();

    res.json({ success: true, message: "RPC added successfully" });
  } catch (error) {
    console.error("Error adding RPC:", error);
    res.status(500).json({ error: "Failed to add RPC" });
  }
});

// POST /api/engine/removeRpc - Remove RPC endpoint
engineApiRouter.post("/removeRpc", async (req, res) => {
  try {
    const { chainId, url } = req.body;

    if (!chainId || !url) {
      return res.status(400).json({ error: "chainId and url are required" });
    }

    await db.delete(chainRpcs)
      .where(and(
        eq(chainRpcs.chainId, Number(chainId)),
        eq(chainRpcs.url, url)
      ));

    res.json({ success: true, message: "RPC removed successfully" });
  } catch (error) {
    console.error("Error removing RPC:", error);
    res.status(500).json({ error: "Failed to remove RPC" });
  }
});

// POST /api/engine/addDex - Add DEX
engineApiRouter.post("/addDex", async (req, res) => {
  try {
    const { chainId, dex } = req.body;

    if (!chainId || !dex) {
      return res.status(400).json({ error: "chainId and dex are required" });
    }

    await db.insert(chainDexes).values({
      chainId: Number(chainId),
      dex,
      isActive: true,
    }).onConflictDoNothing();

    res.json({ success: true, message: "DEX added successfully" });
  } catch (error) {
    console.error("Error adding DEX:", error);
    res.status(500).json({ error: "Failed to add DEX" });
  }
});

// POST /api/engine/removeDex - Remove DEX
engineApiRouter.post("/removeDex", async (req, res) => {
  try {
    const { chainId, dex } = req.body;

    if (!chainId || !dex) {
      return res.status(400).json({ error: "chainId and dex are required" });
    }

    await db.delete(chainDexes)
      .where(and(
        eq(chainDexes.chainId, Number(chainId)),
        eq(chainDexes.dex, dex)
      ));

    res.json({ success: true, message: "DEX removed successfully" });
  } catch (error) {
    console.error("Error removing DEX:", error);
    res.status(500).json({ error: "Failed to remove DEX" });
  }
});

// POST /api/engine/assets/upsert - Bulk upsert assets
engineApiRouter.post("/assets/upsert", async (req, res) => {
  try {
    const { assets: assetsList } = req.body;

    if (!Array.isArray(assetsList)) {
      return res.status(400).json({ error: "assets must be an array" });
    }

    for (const asset of assetsList) {
      const { chainId, address, symbol, decimals = 18, name } = asset;
      
      if (!chainId || !address || !symbol) {
        continue;
      }

      await db.insert(assets).values({
        chainId: Number(chainId),
        address: address.toLowerCase(),
        symbol,
        decimals,
        name: name || symbol,
        riskScore: 0,
        riskFlags: [],
      }).onConflictDoUpdate({
        target: [assets.chainId, assets.address],
        set: {
          symbol,
          decimals,
          ...(name && { name }),
          updatedAt: sql`now()`,
        },
      });
    }

    res.json({ success: true, inserted: assetsList.length, message: "Assets upserted successfully" });
  } catch (error) {
    console.error("Error upserting assets:", error);
    res.status(500).json({ error: "Failed to upsert assets" });
  }
});

// POST /api/engine/assets/risk - Update risk scoring
engineApiRouter.post("/assets/risk", async (req, res) => {
  try {
    const { assets: assetsList } = req.body;

    if (!Array.isArray(assetsList)) {
      return res.status(400).json({ error: "assets must be an array" });
    }

    for (const asset of assetsList) {
      const { chainId, address, riskScore, riskFlags } = asset;
      
      if (!chainId || !address) {
        continue;
      }

      await db.update(assets)
        .set({
          ...(riskScore !== undefined && { riskScore }),
          ...(riskFlags && { riskFlags }),
          lastReviewAt: Date.now(),
          updatedAt: sql`now()`,
        })
        .where(and(
          eq(assets.chainId, Number(chainId)),
          eq(assets.address, address.toLowerCase())
        ));
    }

    res.json({ success: true, updated: assetsList.length, message: "Risk scores updated successfully" });
  } catch (error) {
    console.error("Error updating risk scores:", error);
    res.status(500).json({ error: "Failed to update risk scores" });
  }
});

// GET /api/engine/assets - Query assets with filters
engineApiRouter.get("/assets", async (req, res) => {
  try {
    const { chain, min_score, flags_exclude } = req.query;

    let query = db.select().from(assets);
    const conditions = [];

    if (chain) {
      conditions.push(eq(assets.chainId, Number(chain as string)));
    }

    if (min_score) {
      conditions.push(gte(assets.riskScore, parseInt(min_score as string)));
    }

    const data = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    let filtered = data;
    if (flags_exclude) {
      const excludeFlags = (flags_exclude as string).split(',');
      filtered = data.filter(asset => {
        const assetFlags = Array.isArray(asset.riskFlags) ? asset.riskFlags : [];
        return !assetFlags.some((flag: string) => excludeFlags.includes(flag));
      });
    }

    res.json(filtered);
  } catch (error) {
    console.error("Error querying assets:", error);
    res.status(500).json({ error: "Failed to query assets" });
  }
});

// POST /api/engine/pairs/generate - Generate safe pairs from assets
engineApiRouter.post("/pairs/generate", async (req, res) => {
  try {
    const { chainId, policy_key = "default_risk" } = req.body;

    const policyData = await db.select().from(policies).where(eq(policies.key, policy_key)).limit(1);
    const policy = policyData[0]?.valueJson || {
      min_risk_score: 70,
      exclude_flags: ["mintable", "proxy_upgradable", "owner_can_pause", "low_liquidity", "honeypot_risk"],
    };

    const safeAssets = await db.select().from(assets)
      .where(and(
        chainId ? eq(assets.chainId, Number(chainId)) : sql`1=1`,
        gte(assets.riskScore, policy.min_risk_score || 70)
      ));

    const bluechips = ["WETH", "WBTC", "ETH"];
    const stables = ["USDC", "USDT", "DAI", "USDE"];

    const baseAssets = safeAssets.filter(a => bluechips.includes(a.symbol.toUpperCase()));
    const quoteAssets = safeAssets.filter(a => stables.includes(a.symbol.toUpperCase()));

    const generatedPairs = [];
    for (const base of baseAssets) {
      for (const quote of quoteAssets) {
        if (base.chainId === quote.chainId) {
          await db.insert(pairs).values({
            chainId: base.chainId,
            baseAddr: base.address,
            quoteAddr: quote.address,
            enabled: true,
          }).onConflictDoNothing();

          generatedPairs.push({
            chainId: base.chainId,
            base: base.symbol,
            quote: quote.symbol,
          });
        }
      }
    }

    res.json({ success: true, generated: generatedPairs.length, pairs: generatedPairs });
  } catch (error) {
    console.error("Error generating pairs:", error);
    res.status(500).json({ error: "Failed to generate pairs" });
  }
});

// POST /api/engine/pairs/upsert - Manual pair management
engineApiRouter.post("/pairs/upsert", async (req, res) => {
  try {
    const { pairs: pairsList } = req.body;

    if (!Array.isArray(pairsList)) {
      return res.status(400).json({ error: "pairs must be an array" });
    }

    for (const pair of pairsList) {
      const { chainId, base, quote, enabled = true } = pair;
      
      if (!chainId || !base || !quote) {
        continue;
      }

      await db.insert(pairs).values({
        chainId: Number(chainId),
        baseAddr: base.toLowerCase(),
        quoteAddr: quote.toLowerCase(),
        enabled,
      }).onConflictDoUpdate({
        target: [pairs.chainId, pairs.baseAddr, pairs.quoteAddr],
        set: {
          enabled,
          updatedAt: sql`now()`,
        },
      });
    }

    res.json({ success: true, upserted: pairsList.length, message: "Pairs upserted successfully" });
  } catch (error) {
    console.error("Error upserting pairs:", error);
    res.status(500).json({ error: "Failed to upsert pairs" });
  }
});

// GET /api/engine/policies - Get all policies
engineApiRouter.get("/policies", async (req, res) => {
  try {
    const data = await db.select().from(policies);
    
    const policiesMap = data.reduce((acc, p) => {
      acc[p.key] = p.valueJson;
      return acc;
    }, {} as Record<string, any>);

    res.json(policiesMap);
  } catch (error) {
    console.error("Error fetching policies:", error);
    res.status(500).json({ error: "Failed to fetch policies" });
  }
});

// POST /api/engine/policies/upsert - Update policies
engineApiRouter.post("/policies/upsert", async (req, res) => {
  try {
    const { key, value, description } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: "key and value are required" });
    }

    await db.insert(policies).values({
      key,
      valueJson: value,
      description: description || null,
    }).onConflictDoUpdate({
      target: policies.key,
      set: {
        valueJson: value,
        description: description || null,
        updatedAt: sql`now()`,
      },
    });

    res.json({ success: true, message: "Policy updated successfully" });
  } catch (error) {
    console.error("Error upserting policy:", error);
    res.status(500).json({ error: "Failed to upsert policy" });
  }
});

// GET /api/engine/perf - Performance metrics (p50/p90/p99)
engineApiRouter.get("/perf", async (req, res) => {
  try {
    const rpcs = await db.select().from(chainRpcs).where(eq(chainRpcs.isActive, true));
    
    const latencies = rpcs
      .map(r => r.lastLatencyMs)
      .filter(l => l !== null && l !== undefined) as number[];

    latencies.sort((a, b) => a - b);

    const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
    const p90 = latencies[Math.floor(latencies.length * 0.90)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    res.json({
      scan_ns: {
        p50: p50 * 1_000_000,
        p90: p90 * 1_000_000,
        p99: p99 * 1_000_000,
      },
      opp_eval_ns: {
        p50: p50 * 1_000_000,
        p90: p90 * 1_000_000,
        p99: p99 * 1_000_000,
      },
      total_rpcs: rpcs.length,
      active_rpcs: rpcs.filter(r => r.lastOkAt && (Date.now() - r.lastOkAt < 300000)).length,
    });
  } catch (error) {
    console.error("Error fetching performance metrics:", error);
    res.status(500).json({ error: "Failed to fetch performance metrics" });
  }
});
