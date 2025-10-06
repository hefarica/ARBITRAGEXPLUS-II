import express from "express";
import { AssetValidator, estimatePairProfit } from "./asset-orchestrator-validators";
import {
  AssetCandidate,
  PairPlan,
  AssetWithValidation,
  AuditEvent,
  BASE_QUOTE_TOKENS,
  PoolRef
} from "./asset-orchestrator-types";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const router = express.Router();
const validator = new AssetValidator();

const AUDIT_DIR = join(process.cwd(), "logs");
const AUDIT_FILE = join(AUDIT_DIR, "asset-orchestrator-audit.jsonl");

if (!existsSync(AUDIT_DIR)) {
  mkdirSync(AUDIT_DIR, { recursive: true });
}

function appendAudit(event: AuditEvent) {
  try {
    appendFileSync(AUDIT_FILE, JSON.stringify(event) + "\n");
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

router.post("/validate", async (req, res) => {
  const startTime = Date.now();
  const { asset } = req.body as { asset: AssetCandidate };

  if (!asset || !asset.address || !asset.chainId) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "Asset con address y chainId requeridos"
    });
  }

  asset.trace_id = asset.trace_id || `${asset.chainId}:${asset.address}`;

  appendAudit({
    ts: Date.now(),
    trace_id: asset.trace_id,
    op: "validate",
    asset: { symbol: asset.symbol, address: asset.address, chainId: asset.chainId }
  });

  try {
    const result = await validator.runFullPipeline(asset);

    if (!result.valid) {
      appendAudit({
        ts: Date.now(),
        trace_id: asset.trace_id,
        op: "reject",
        result,
        reason: result.reason
      });

      return res.json({
        valid: false,
        reason: result.reason,
        message: result.message,
        asset: {
          ...asset,
          validation_status: "rejected",
          validation_reason: result.reason,
          validation_message: result.message,
          validated_at: Date.now()
        }
      });
    }

    const pairCandidates = result.data?.pairCandidates || [];
    const plans: PairPlan[] = [];

    for (const candidate of pairCandidates) {
      const richPools = asset.pools.filter(p => p.liquidityUsd >= 1_000_000);

      if (richPools.length >= 2) {
        const route = richPools.slice(0, 2);
        const plan = estimatePairProfit(candidate.token_in, candidate.token_out, route);

        const atomicityResult = validator.validate6_Atomicity(plan);
        plan.atomic = atomicityResult.valid;
        plan.reasons_block = atomicityResult.data?.reasons || [];

        plans.push(plan);
      }
    }

    const profitResult = validator.validate5_ProfitPrecheck(plans);

    if (!profitResult.valid) {
      appendAudit({
        ts: Date.now(),
        trace_id: asset.trace_id,
        op: "reject",
        result: profitResult,
        reason: profitResult.reason
      });

      return res.json({
        valid: false,
        reason: profitResult.reason,
        message: profitResult.message,
        plans,
        asset: {
          ...asset,
          validation_status: "rejected",
          validation_reason: profitResult.reason,
          validation_message: profitResult.message,
          validated_at: Date.now()
        }
      });
    }

    const atomicPlans = (profitResult.data?.profitablePairs || []).filter((p: PairPlan) => p.atomic);

    if (atomicPlans.length === 0) {
      appendAudit({
        ts: Date.now(),
        trace_id: asset.trace_id,
        op: "reject",
        result: { valid: false, reason: "NOT_ATOMIC" },
        reason: "NOT_ATOMIC"
      });

      return res.json({
        valid: false,
        reason: "NOT_ATOMIC",
        message: "Ningún par rentable es ejecutable atómicamente",
        plans,
        asset: {
          ...asset,
          validation_status: "rejected",
          validation_reason: "NOT_ATOMIC",
          validation_message: "Ningún par rentable es ejecutable atómicamente",
          validated_at: Date.now()
        }
      });
    }

    appendAudit({
      ts: Date.now(),
      trace_id: asset.trace_id,
      op: "approve",
      result: { valid: true },
      asset: { symbol: asset.symbol, pairs: atomicPlans.length }
    });

    const validatedAsset: AssetWithValidation = {
      ...asset,
      validation_status: "valid",
      validated_at: Date.now(),
      pairs: atomicPlans
    };

    return res.json({
      valid: true,
      asset: validatedAsset,
      plans: atomicPlans,
      stats: {
        total_pairs: plans.length,
        profitable_pairs: profitResult.data?.profitablePairs.length || 0,
        atomic_pairs: atomicPlans.length,
        duration_ms: Date.now() - startTime
      }
    });

  } catch (error: any) {
    console.error("Validation error:", error);

    appendAudit({
      ts: Date.now(),
      trace_id: asset.trace_id,
      op: "reject",
      result: { valid: false, reason: "NOT_CONFIGURED" },
      reason: error.message
    });

    return res.status(500).json({
      error: "VALIDATION_FAILED",
      message: error.message
    });
  }
});

router.post("/discover", async (req, res) => {
  const { address, chainId } = req.body;

  if (!address || !chainId) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "address y chainId requeridos"
    });
  }

  const trace_id = `${chainId}:${address}`;

  appendAudit({
    ts: Date.now(),
    trace_id,
    op: "discover",
    asset: { address, chainId }
  });

  try {
    const asset: AssetCandidate = {
      trace_id,
      chainId,
      address,
      symbol: "UNKNOWN",
      decimals: 18,
      name: "Unknown Token",
      score: 50,
      flags: [],
      pools: [],
      dexes: []
    };

    return res.json({
      success: true,
      asset,
      message: "Asset discovered - validar antes de agregar"
    });

  } catch (error: any) {
    console.error("Discovery error:", error);
    return res.status(500).json({
      error: "DISCOVERY_FAILED",
      message: error.message
    });
  }
});

router.post("/pairs/plan", async (req, res) => {
  const { asset, forceRegenerate } = req.body as { asset: AssetCandidate; forceRegenerate?: boolean };

  if (!asset) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "asset requerido"
    });
  }

  try {
    const pairCandidates = BASE_QUOTE_TOKENS
      .filter(q => q !== asset.symbol)
      .map(quote => ({ token_in: asset.symbol, token_out: quote }));

    const plans: PairPlan[] = [];
    const richPools = asset.pools.filter(p => p.liquidityUsd >= 1_000_000);

    for (const candidate of pairCandidates) {
      if (richPools.length >= 2) {
        const route = richPools.slice(0, 2);
        const plan = estimatePairProfit(candidate.token_in, candidate.token_out, route);

        const atomicityResult = validator.validate6_Atomicity(plan);
        plan.atomic = atomicityResult.valid;
        plan.reasons_block = atomicityResult.data?.reasons || [];

        plans.push(plan);
      }
    }

    appendAudit({
      ts: Date.now(),
      trace_id: asset.trace_id,
      op: "generate_pairs",
      asset: { symbol: asset.symbol, pairs: plans.length }
    });

    return res.json({
      success: true,
      plans,
      stats: {
        total: plans.length,
        atomic: plans.filter(p => p.atomic).length,
        profitable: plans.filter(p => p.est_profit_bps >= 5).length
      }
    });

  } catch (error: any) {
    console.error("Pair planning error:", error);
    return res.status(500).json({
      error: "PLANNING_FAILED",
      message: error.message
    });
  }
});

router.post("/add-to-trading", async (req, res) => {
  const { asset, pairs } = req.body as { asset: AssetWithValidation; pairs: PairPlan[] };

  if (!asset || !pairs || pairs.length === 0) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "asset y pairs requeridos"
    });
  }

  if (asset.validation_status !== "valid") {
    return res.status(400).json({
      error: "NOT_VALIDATED",
      message: "Asset debe estar validado antes de agregar a trading"
    });
  }

  appendAudit({
    ts: Date.now(),
    trace_id: asset.trace_id,
    op: "add_to_trading",
    asset: { symbol: asset.symbol, address: asset.address, chainId: asset.chainId },
    result: { valid: true, data: { pairs: pairs.length } }
  });

  return res.json({
    success: true,
    message: `Asset ${asset.symbol} con ${pairs.length} pares agregado a trading`,
    asset,
    pairs
  });
});

router.get("/audit", (req, res) => {
  const { limit = 100, trace_id } = req.query;

  try {
    if (!existsSync(AUDIT_FILE)) {
      return res.json({ events: [] });
    }

    const content = require("fs").readFileSync(AUDIT_FILE, "utf-8");
    const lines = content.trim().split("\n").filter((l: string) => l);

    let events = lines.map((l: string) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter((e: any) => e !== null);

    if (trace_id) {
      events = events.filter((e: AuditEvent) => e.trace_id === trace_id);
    }

    events = events.slice(-Number(limit));

    return res.json({
      events,
      total: events.length
    });

  } catch (error: any) {
    console.error("Audit query error:", error);
    return res.status(500).json({
      error: "AUDIT_QUERY_FAILED",
      message: error.message
    });
  }
});

export { router as assetOrchestratorRouter };
