import { Router } from "express";
import { db } from "./db";
import { chains, chainRpcs, chainDexes, assets, pairs, policies, configVersions } from "@shared/schema";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { engineConfigService } from "./engine-config-service";
import { poolValidator } from "./pool-validator";
import { mevScanner } from "./mev-scanner";

export const engineApiRouter = Router();

// GET /api/engine/state - Returns complete engine configuration state
engineApiRouter.get("/state", async (req, res) => {
  try {
    const [chainsData, rpcsData, allDexesData, assetsData, pairsData, policiesData] = await Promise.all([
      db.select().from(chains),
      db.select().from(chainRpcs),
      db.select().from(chainDexes),
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
        isActive: chain.isActive,
        metamask: chain.metamaskJson,
        rpcs: rpcsData.filter(r => r.chainId === chain.chainId).map(r => ({
          url: r.url,
          isActive: r.isActive,
          latencyMs: r.lastLatencyMs,
          lastOkAt: r.lastOkAt,
        })),
        dexes: allDexesData.filter(d => d.chainId === chain.chainId).map(d => ({
          name: d.dex,
          isActive: d.isActive,
        })),
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

// POST /api/engine/assets/scan - Automated anti-rugpull scanning with GoPlus API
engineApiRouter.post("/assets/scan", async (req, res) => {
  try {
    const { chainId, addresses } = req.body;

    if (!chainId || !addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: "chainId and addresses array are required" });
    }

    console.log(`🔎 Scanning ${addresses.length} assets on chain ${chainId} for rugpull risks...`);

    const results = [];

    for (const address of addresses) {
      try {
        // Call GoPlus Security API
        const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}`;
        const params = new URLSearchParams({ contract_addresses: address.toLowerCase() });
        
        const response = await fetch(`${url}?${params}`);
        const data = await response.json();

        if (data.code !== 1 || !data.result || !data.result[address.toLowerCase()]) {
          console.log(`⚠️  ${address}: API returned no data`);
          results.push({ address, error: "No security data available" });
          continue;
        }

        const tokenData = data.result[address.toLowerCase()];

        // Calculate risk score (0-100, higher is safer)
        let score = 100;
        const flags = [];

        // Critical risks (-50 points each)
        if (tokenData.is_honeypot === "1") {
          score -= 50;
          flags.push("honeypot");
        }
        if (tokenData.is_proxy === "1" && tokenData.can_take_back_ownership === "1") {
          score -= 50;
          flags.push("proxy_upgradable");
        }

        // High risks (-20 points each)
        if (tokenData.is_mintable === "1") {
          score -= 20;
          flags.push("mintable");
        }
        if (tokenData.is_blacklisted === "1") {
          score -= 20;
          flags.push("blacklist_function");
        }
        if (tokenData.transfer_pausable === "1") {
          score -= 20;
          flags.push("pausable");
        }

        // Medium risks (-10 points each)
        if (tokenData.is_anti_whale === "1") {
          score -= 10;
          flags.push("anti_whale");
        }
        if (tokenData.external_call === "1") {
          score -= 10;
          flags.push("external_call");
        }

        // Tax warnings (-5 points each)
        const buyTax = parseFloat(tokenData.buy_tax || "0");
        const sellTax = parseFloat(tokenData.sell_tax || "0");
        if (buyTax > 0.1) {
          score -= 5;
          flags.push(`high_buy_tax_${(buyTax * 100).toFixed(0)}pct`);
        }
        if (sellTax > 0.1) {
          score -= 5;
          flags.push(`high_sell_tax_${(sellTax * 100).toFixed(0)}pct`);
        }

        // Ensure score is between 0-100
        score = Math.max(0, Math.min(100, score));

        // Update database
        await db.update(assets)
          .set({
            riskScore: score,
            riskFlags: flags,
            lastReviewAt: Date.now(),
            updatedAt: sql`now()`,
          })
          .where(and(
            eq(assets.chainId, Number(chainId)),
            eq(assets.address, address.toLowerCase())
          ));

        results.push({
          address,
          score,
          flags,
          holderCount: tokenData.holder_count || "unknown",
          buyTax: (buyTax * 100).toFixed(2) + "%",
          sellTax: (sellTax * 100).toFixed(2) + "%",
        });

        console.log(
          `${score >= 70 ? "✅" : score >= 40 ? "⚠️ " : "❌"} ${address}: Score ${score}/100, Flags: ${flags.join(", ") || "none"}`
        );
      } catch (error: any) {
        console.error(`❌ Error scanning ${address}:`, error?.message);
        results.push({ address, error: error?.message || "Scan failed" });
      }
    }

    res.json({
      success: true,
      scanned: addresses.length,
      results,
    });
  } catch (error) {
    console.error("Error scanning assets:", error);
    res.status(500).json({ error: "Failed to scan assets" });
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
    const policy = (policyData[0]?.valueJson as any) || {
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

// POST /api/engine/pairs/validate - Validate pool address before saving
engineApiRouter.post("/pairs/validate", async (req, res) => {
  try {
    const { chainId, poolAddress, baseTokenAddress, quoteTokenAddress } = req.body;

    if (!chainId || !poolAddress) {
      return res.status(400).json({ error: "chainId and poolAddress are required" });
    }

    const validation = await poolValidator.validatePoolAddress(
      Number(chainId),
      poolAddress,
      baseTokenAddress,
      quoteTokenAddress
    );

    res.json(validation);
  } catch (error) {
    console.error("Error validating pool:", error);
    res.status(500).json({ error: "Failed to validate pool address" });
  }
});

// POST /api/engine/pairs/find - Find correct pool addresses for a token pair
engineApiRouter.post("/pairs/find", async (req, res) => {
  try {
    const { chainId, baseTokenAddress, quoteTokenAddress, minLiquidity } = req.body;

    if (!chainId || !baseTokenAddress || !quoteTokenAddress) {
      return res.status(400).json({ error: "chainId, baseTokenAddress, and quoteTokenAddress are required" });
    }

    const pools = await poolValidator.findCorrectPoolAddress(
      Number(chainId),
      baseTokenAddress,
      quoteTokenAddress,
      minLiquidity || 1000
    );

    res.json({ success: true, pools, count: pools.length });
  } catch (error) {
    console.error("Error finding pools:", error);
    res.status(500).json({ error: "Failed to find pool addresses" });
  }
});

// POST /api/engine/pairs/upsert - Manual pair management WITH VALIDATION
engineApiRouter.post("/pairs/upsert", async (req, res) => {
  try {
    const { pairs: pairsList, skipValidation = false } = req.body;

    if (!Array.isArray(pairsList)) {
      return res.status(400).json({ error: "pairs must be an array" });
    }

    const results = [];
    const errors = [];

    for (const pair of pairsList) {
      const { chainId, base, quote, pairAddr, enabled = true } = pair;
      
      if (!chainId || !base || !quote) {
        errors.push({ pair, error: "Missing required fields: chainId, base, quote" });
        continue;
      }

      if (pairAddr && !skipValidation) {
        const validation = await poolValidator.validatePoolAddress(
          Number(chainId),
          pairAddr,
          base,
          quote
        );

        if (!validation.isValid) {
          errors.push({ 
            pair, 
            error: `❌ INVALID POOL ADDRESS: ${validation.error}`,
            warnings: validation.warnings 
          });
          console.error(`🚨 VALIDATION FAILED for ${base}/${quote} on chain ${chainId}:`, validation.error);
          continue;
        }

        if (validation.warnings && validation.warnings.length > 0) {
          console.warn(`⚠️ WARNINGS for ${base}/${quote}:`, validation.warnings);
        }
      }

      await db.insert(pairs).values({
        chainId: Number(chainId),
        baseAddr: base.toLowerCase(),
        quoteAddr: quote.toLowerCase(),
        pairAddr: pairAddr ? pairAddr.toLowerCase() : null,
        enabled,
      }).onConflictDoUpdate({
        target: [pairs.chainId, pairs.baseAddr, pairs.quoteAddr],
        set: {
          pairAddr: pairAddr ? pairAddr.toLowerCase() : sql`pair_addr`,
          enabled,
          updatedAt: sql`now()`,
        },
      });

      results.push({ pair, status: 'upserted' });
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Failed to upsert ${errors.length} pairs due to validation errors`,
        upserted: results.length,
        errors 
      });
    }

    res.json({ success: true, upserted: results.length, message: "Pairs upserted successfully" });
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

// POST /api/engine/rpcs/healthcheck - Check health and latency of all RPCs
engineApiRouter.post("/rpcs/healthcheck", async (req, res) => {
  try {
    const { chainId, timeout = 5000 } = req.body;

    console.log(`🏥 Starting RPC health check${chainId ? ` for chain ${chainId}` : " for all chains"}...`);

    let rpcsToCheck;
    if (chainId) {
      rpcsToCheck = await db.select().from(chainRpcs).where(eq(chainRpcs.chainId, Number(chainId)));
    } else {
      rpcsToCheck = await db.select().from(chainRpcs);
    }

    const results = {
      total: rpcsToCheck.length,
      healthy: 0,
      unhealthy: 0,
      rpcs: [] as any[],
    };

    for (const rpc of rpcsToCheck) {
      const startTime = Date.now();
      let isHealthy = false;
      let latencyMs = null;
      let error = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(rpc.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            latencyMs = Date.now() - startTime;
            isHealthy = true;
            results.healthy++;
          } else {
            error = "No result in response";
            results.unhealthy++;
          }
        } else {
          error = `HTTP ${response.status}`;
          results.unhealthy++;
        }
      } catch (err: any) {
        error = err.name === "AbortError" ? "Timeout" : err.message;
        results.unhealthy++;
      }

      // Update RPC in database
      await db.update(chainRpcs)
        .set({
          lastLatencyMs: latencyMs,
          lastOkAt: isHealthy ? Date.now() : rpc.lastOkAt,
          isActive: isHealthy,
        })
        .where(eq(chainRpcs.id, rpc.id));

      results.rpcs.push({
        id: rpc.id,
        chainId: rpc.chainId,
        url: rpc.url,
        healthy: isHealthy,
        latencyMs: latencyMs,
        error: error,
      });

      console.log(
        isHealthy
          ? `✅ ${rpc.url}: ${latencyMs}ms`
          : `❌ ${rpc.url}: ${error}`
      );
    }

    res.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("Error running health check:", error);
    res.status(500).json({ error: "Failed to run health check" });
  }
});

// POST /api/engine/discover - Auto-discover blockchains from DeFi Llama
engineApiRouter.post("/discover", async (req, res) => {
  try {
    const { minTvl = 100_000_000, limit = 20 } = req.body;

    console.log(`🔍 Discovering blockchains with TVL > $${minTvl.toLocaleString()}...`);

    // Fetch chains from DeFi Llama
    const response = await fetch("https://api.llama.fi/v2/chains");
    if (!response.ok) {
      throw new Error(`DeFi Llama API error: ${response.status}`);
    }

    const chainsData = await response.json();
    
    // Filter and sort by TVL
    const eligibleChains = chainsData
      .filter((chain: any) => {
        const tvl = chain.tvl || 0;
        const hasChainId = chain.chainId && !isNaN(parseInt(chain.chainId));
        return tvl >= minTvl && hasChainId;
      })
      .sort((a: any, b: any) => (b.tvl || 0) - (a.tvl || 0))
      .slice(0, limit);

    const discovered = [];
    const errors = [];

    for (const chain of eligibleChains) {
      try {
        const chainId = parseInt(chain.chainId);
        
        // Check if chain already exists
        const existing = await db.select().from(chains).where(eq(chains.chainId, chainId));
        if (existing.length > 0) {
          console.log(`⏭️  Skipping ${chain.name} (already exists)`);
          continue;
        }

        // Fetch RPCs from chainlist.org
        const chainlistResponse = await fetch(`https://chainid.network/chains.json`);
        const chainlistData = await chainlistResponse.json();
        const chainInfo = chainlistData.find((c: any) => c.chainId === chainId);

        const rpcs = chainInfo?.rpc
          ?.filter((rpc: string) => rpc.startsWith("https://") && !rpc.includes("${"))
          .slice(0, 5) || [];

        if (rpcs.length < 3) {
          console.log(`⚠️  ${chain.name}: Not enough public RPCs (${rpcs.length}/3 minimum)`);
          errors.push({ chain: chain.name, reason: "Insufficient RPCs" });
          continue;
        }

        // Insert chain
        const [newChain] = await db.insert(chains).values({
          name: chain.name,
          chainId: chainId,
          evm: true,
        }).returning();

        // Insert RPCs
        for (const rpc of rpcs) {
          await db.insert(chainRpcs).values({
            chainId: chainId,
            url: rpc,
            isActive: true,
          });
        }

        discovered.push({
          name: chain.name,
          chainId: chainId,
          tvl: chain.tvl,
          rpcs: rpcs.length,
        });

        console.log(`✅ Added ${chain.name} (TVL: $${(chain.tvl / 1e9).toFixed(2)}B, RPCs: ${rpcs.length})`);
      } catch (error: any) {
        console.error(`❌ Error adding ${chain.name}:`, error);
        errors.push({ chain: chain.name, reason: error?.message || "Unknown error" });
      }
    }

    res.json({
      success: true,
      discovered: discovered.length,
      chains: discovered,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error discovering chains:", error);
    res.status(500).json({ error: "Failed to discover chains" });
  }
});

// POST /api/engine/export - Export DB configuration to mev-scan-config.json
engineApiRouter.post("/export", async (req, res) => {
  try {
    console.log("📤 Exporting configuration from database to JSON...");
    const config = await engineConfigService.exportAndWrite();
    
    res.json({
      success: true,
      config,
      message: "Configuration exported to mev-scan-config.json"
    });
  } catch (error: any) {
    console.error("Error exporting config:", error);
    res.status(500).json({ error: error?.message || "Failed to export configuration" });
  }
});

// POST /api/engine/reload - Reload RUST MEV engine with new configuration
engineApiRouter.post("/reload", async (req, res) => {
  try {
    console.log("🔄 Reloading MEV engine...");
    
    // Stop the current scanner
    mevScanner.stop();
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start with new configuration
    mevScanner.start();
    
    res.json({
      success: true,
      message: "MEV engine reloaded successfully",
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error("Error reloading MEV engine:", error);
    res.status(500).json({ error: error?.message || "Failed to reload MEV engine" });
  }
});

// POST /api/engine/chains/toggle - Activate/Deactivate blockchain
engineApiRouter.post("/chains/toggle", async (req, res) => {
  try {
    const { chainId, isActive } = req.body;
    
    if (chainId === undefined || isActive === undefined) {
      return res.status(400).json({ error: "chainId and isActive are required" });
    }

    await db.update(chains)
      .set({ 
        isActive,
        updatedAt: new Date()
      })
      .where(eq(chains.chainId, chainId));

    const action = isActive ? "activated" : "deactivated";
    console.log(`✅ Chain ${chainId} ${action}`);

    res.json({
      success: true,
      chainId,
      isActive,
      message: `Chain ${action} successfully`
    });
  } catch (error: any) {
    console.error("Error toggling chain:", error);
    res.status(500).json({ error: error?.message || "Failed to toggle chain" });
  }
});
