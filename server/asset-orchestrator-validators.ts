import { AssetCandidate, PairPlan, ValidationResult, PoolRef, POLICY_PARAMS, BASE_QUOTE_TOKENS } from "./asset-orchestrator-types";
import { db } from "./db";
import { engineConfig } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export class AssetValidator {
  private config: any;

  async loadConfig() {
    const [cfg] = await db
      .select()
      .from(engineConfig)
      .where(eq(engineConfig.isActive, true))
      .orderBy(desc(engineConfig.updatedAt))
      .limit(1);

    if (cfg) {
      this.config = typeof cfg.config === 'string' ? JSON.parse(cfg.config) : cfg.config;
    }
  }

  validate1_PreConfig(asset: AssetCandidate): ValidationResult {
    if (!this.config) {
      return {
        valid: false,
        reason: "NOT_CONFIGURED",
        message: "Sistema no configurado - ejecutar loadConfig()"
      };
    }

    const chain = this.config.chains?.find((c: any) => c.chainId === asset.chainId);
    if (!chain) {
      return {
        valid: false,
        reason: "NOT_CONFIGURED",
        message: `Chain ${asset.chainId} no configurado en el sistema`
      };
    }

    if (!chain.enabled) {
      return {
        valid: false,
        reason: "NOT_CONFIGURED",
        message: `Chain ${asset.chainId} está deshabilitado`
      };
    }

    const configuredDexes = chain.dexes || [];
    const assetDexes = asset.dexes || [];

    const hasDexMatch = assetDexes.some((dex: string) =>
      configuredDexes.some((cd: any) => cd.dexId?.toLowerCase() === dex.toLowerCase())
    );

    if (!hasDexMatch && assetDexes.length > 0) {
      return {
        valid: false,
        reason: "NOT_CONFIGURED",
        message: `Ningún DEX del asset (${assetDexes.join(", ")}) está configurado en chain ${asset.chainId}`
      };
    }

    return { valid: true };
  }

  validate2_Liquidity(asset: AssetCandidate): ValidationResult {
    const richPools = asset.pools.filter(p => p.liquidityUsd >= POLICY_PARAMS.TVL_MIN_USD);

    if (richPools.length === 0) {
      return {
        valid: false,
        reason: "LOW_LIQ",
        message: `Sin pools con liquidez ≥ $${(POLICY_PARAMS.TVL_MIN_USD / 1_000_000).toFixed(1)}M (encontrados ${asset.pools.length} pools)`
      };
    }

    return {
      valid: true,
      data: { richPools }
    };
  }

  validate3_SafetyScore(asset: AssetCandidate): ValidationResult {
    if (asset.score < POLICY_PARAMS.MIN_SAFETY_SCORE) {
      return {
        valid: false,
        reason: "LOW_SCORE",
        message: `Score ${asset.score} < ${POLICY_PARAMS.MIN_SAFETY_SCORE} requerido. Flags: ${asset.flags.join(", ")}`
      };
    }

    return { valid: true };
  }

  validate4_GeneratePairs(asset: AssetCandidate): ValidationResult {
    const candidates = BASE_QUOTE_TOKENS
      .filter(q => q !== asset.symbol)
      .map(quote => ({
        token_in: asset.symbol,
        token_out: quote
      }));

    if (candidates.length === 0) {
      return {
        valid: false,
        reason: "NO_PAIRS",
        message: `No se pueden generar pares base/quote para ${asset.symbol}`
      };
    }

    return {
      valid: true,
      data: { pairCandidates: candidates }
    };
  }

  validate5_ProfitPrecheck(pairs: PairPlan[]): ValidationResult {
    const profitable = pairs.filter(p => p.est_profit_bps >= POLICY_PARAMS.ROI_MIN_BPS);

    if (profitable.length === 0) {
      return {
        valid: false,
        reason: "NO_PROFIT",
        message: `Ningún par supera ROI mínimo de ${POLICY_PARAMS.ROI_MIN_BPS} bps. Mejor: ${Math.max(...pairs.map(p => p.est_profit_bps))} bps`
      };
    }

    return {
      valid: true,
      data: { profitablePairs: profitable }
    };
  }

  validate6_Atomicity(pair: PairPlan): ValidationResult {
    const reasons: string[] = [];

    if (pair.hops < POLICY_PARAMS.MIN_HOPS || pair.hops > POLICY_PARAMS.MAX_HOPS) {
      reasons.push(`HOPS_INVALID:${pair.hops}`);
    }

    if (!pair.route || pair.route.length !== pair.hops) {
      reasons.push("ROUTE_MISMATCH");
    }

    if (pair.pools_used.length < pair.hops) {
      reasons.push("POOLS_MISSING");
    }

    const unsupportedDexes = pair.route.filter(dex =>
      !["uniswapv2", "uniswapv3", "sushiswap", "pancakeswap", "aerodrome", "velodrome", "balancer", "curve"].includes(dex.toLowerCase())
    );

    if (unsupportedDexes.length > 0) {
      reasons.push(`DEX_UNSUPPORTED:${unsupportedDexes.join(",")}`);
    }

    if (reasons.length > 0) {
      return {
        valid: false,
        reason: "NOT_ATOMIC",
        message: `Ruta no ejecutable atómicamente: ${reasons.join("; ")}`,
        data: { reasons }
      };
    }

    return { valid: true };
  }

  async runFullPipeline(asset: AssetCandidate): Promise<ValidationResult> {
    await this.loadConfig();

    const r1 = this.validate1_PreConfig(asset);
    if (!r1.valid) return r1;

    const r2 = this.validate2_Liquidity(asset);
    if (!r2.valid) return r2;

    const r3 = this.validate3_SafetyScore(asset);
    if (!r3.valid) return r3;

    const r4 = this.validate4_GeneratePairs(asset);
    if (!r4.valid) return r4;

    return { valid: true, data: { passed: "all_checks" } };
  }
}

export function estimatePairProfit(
  tokenInSymbol: string,
  tokenOutSymbol: string,
  route: PoolRef[]
): PairPlan {
  let grossMultiplier = 1.0;

  for (const pool of route) {
    const outOverIn = 1.0007;
    const feeFraction = pool.feeBps / 10000;
    grossMultiplier *= outOverIn * (1 - feeFraction);
  }

  const gasUsd = 5.0;
  const netMultiplier = grossMultiplier * (1 - POLICY_PARAMS.GAS_COST_FRACTION);
  const profitBps = (netMultiplier - 1) * 10000;
  const grossBps = (grossMultiplier - 1) * 10000;

  return {
    trace_id: `${tokenInSymbol}_${tokenOutSymbol}_${route.map(r => r.dex).join("_")}`,
    token_in: tokenInSymbol,
    token_out: tokenOutSymbol,
    token_in_address: route[0]?.token0 || "",
    token_out_address: route[route.length - 1]?.token1 || "",
    route: route.map(r => r.dex),
    hops: route.length,
    est_profit_bps: Math.round(profitBps * 100) / 100,
    est_gross_bps: Math.round(grossBps * 100) / 100,
    est_gas_usd: gasUsd,
    est_slippage_bps: POLICY_PARAMS.SLIPPAGE_BPS,
    atomic: route.length >= POLICY_PARAMS.MIN_HOPS && route.length <= POLICY_PARAMS.MAX_HOPS,
    pools_used: route
  };
}
