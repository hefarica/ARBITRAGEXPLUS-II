export type ChainId = number;
export type DexId = string;

export interface PoolRef {
  dex: DexId;
  address: string;
  feeBps: number;
  liquidityUsd: number;
  token0: string;
  token1: string;
}

export interface AssetCandidate {
  trace_id: string;
  chainId: ChainId;
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  score: number;
  flags: string[];
  pools: PoolRef[];
  dexes: DexId[];
}

export interface PairPlan {
  trace_id: string;
  token_in: string;
  token_out: string;
  token_in_address: string;
  token_out_address: string;
  route: DexId[];
  hops: number;
  est_profit_bps: number;
  est_gross_bps: number;
  est_gas_usd: number;
  est_slippage_bps: number;
  atomic: boolean;
  reasons_block?: string[];
  pools_used: PoolRef[];
}

export type ValidationReason =
  | "NOT_CONFIGURED"
  | "LOW_LIQ"
  | "LOW_SCORE"
  | "NO_PAIRS"
  | "NO_PROFIT"
  | "NOT_ATOMIC";

export interface ValidationResult {
  valid: boolean;
  reason?: ValidationReason;
  message?: string;
  data?: any;
}

export interface AssetWithValidation extends AssetCandidate {
  validation_status: "pending" | "validating" | "valid" | "rejected";
  validation_reason?: ValidationReason;
  validation_message?: string;
  validated_at?: number;
  pairs?: PairPlan[];
}

export interface AuditEvent {
  ts: number;
  trace_id: string;
  op: "discover" | "validate" | "approve" | "reject" | "generate_pairs" | "add_to_trading";
  asset?: Partial<AssetCandidate>;
  pair?: Partial<PairPlan>;
  result?: ValidationResult;
  reason?: string;
  user?: string;
}

export const BASE_QUOTE_TOKENS = [
  "USDC",
  "USDT",
  "DAI",
  "WETH",
  "ETH",
  "WBTC",
  "BTC"
];

export const POLICY_PARAMS = {
  TVL_MIN_USD: 1_000_000,
  ROI_MIN_BPS: 5,
  GAS_COST_FRACTION: 0.0002,
  MIN_SAFETY_SCORE: 70,
  MAX_HOPS: 3,
  MIN_HOPS: 2,
  SLIPPAGE_BPS: 50,
  GAS_SAFETY_BPS: 20
};
