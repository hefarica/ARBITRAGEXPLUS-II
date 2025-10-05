import { pgTable, text, integer, decimal, timestamp, boolean, jsonb, doublePrecision, bigint, varchar, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  dexIn: text("dex_in").notNull(),
  dexOut: text("dex_out").notNull(),
  baseToken: text("base_token").notNull(),
  quoteToken: text("quote_token").notNull(),
  amountIn: text("amount_in").notNull(),
  estProfitUsd: doublePrecision("est_profit_usd").notNull(),
  gasUsd: doublePrecision("gas_usd").notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  isTestnet: boolean("is_testnet").default(false),
});

export const assetSafety = pgTable("asset_safety", {
  address: text("address").primaryKey(),
  score: integer("score").notNull(),
  checks: jsonb("checks").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const executions = pgTable("executions", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  txHash: text("tx_hash"),
  chainId: integer("chain_id").notNull(),
  profitUsd: doublePrecision("profit_usd"),
  gasUsd: doublePrecision("gas_usd"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  isTestnet: boolean("is_testnet").default(false),
});

export const engineConfig = pgTable("engine_config", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  version: text("version").notNull().default("1.0.0"),
  config: jsonb("config").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  networkMode: text("network_mode").default("mainnet"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rpcHealth = pgTable("rpc_health", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  chainId: integer("chain_id").notNull(),
  status: text("status").notNull(),
  healthScore: integer("health_score").notNull(),
  latencyP50: real("latency_p50"),
  latencyP95: real("latency_p95"),
  errorRate: real("error_rate"),
  totalRequests: bigint("total_requests", { mode: "number" }),
  failedRequests: bigint("failed_requests", { mode: "number" }),
  lastCheck: bigint("last_check", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = typeof opportunities.$inferInsert;

export type AssetSafety = typeof assetSafety.$inferSelect;
export type InsertAssetSafety = typeof assetSafety.$inferInsert;

export type Execution = typeof executions.$inferSelect;
export type InsertExecution = typeof executions.$inferInsert;

export type EngineConfig = typeof engineConfig.$inferSelect;
export type InsertEngineConfig = typeof engineConfig.$inferInsert;

export type RpcHealth = typeof rpcHealth.$inferSelect;
export type InsertRpcHealth = typeof rpcHealth.$inferInsert;

// Wallet Management Tables
export const wallets = pgTable("wallets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  address: varchar("address", { length: 42 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  privateKey: text("private_key"), // Should be encrypted in production
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const walletBalances = pgTable("wallet_balances", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  walletId: integer("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  chainId: integer("chain_id").notNull(),
  chainName: varchar("chain_name", { length: 50 }).notNull(),
  balance: text("balance").notNull(), // Store as string for precision
  balanceUsd: doublePrecision("balance_usd"),
  gasBalance: text("gas_balance"), // Native token balance
  gasBalanceUsd: doublePrecision("gas_balance_usd"),
  tokenBalances: jsonb("token_balances").default("[]"), // Array of token balances
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  walletId: integer("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  txHash: varchar("tx_hash", { length: 66 }).notNull(),
  chainId: integer("chain_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'in', 'out', 'swap'
  from: varchar("from_address", { length: 42 }).notNull(),
  to: varchar("to_address", { length: 42 }).notNull(),
  value: text("value").notNull(),
  valueUsd: doublePrecision("value_usd"),
  gasUsed: text("gas_used"),
  gasPrice: text("gas_price"),
  gasCost: text("gas_cost"),
  gasCostUsd: doublePrecision("gas_cost_usd"),
  blockNumber: bigint("block_number", { mode: "number" }),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

export type WalletBalance = typeof walletBalances.$inferSelect;
export type InsertWalletBalance = typeof walletBalances.$inferInsert;

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;

// Trading Simulator Tables
export const simulations = pgTable("simulations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  tokenPair: varchar("token_pair", { length: 100 }).notNull(),
  tokenA: varchar("token_a", { length: 42 }).notNull(),
  tokenB: varchar("token_b", { length: 42 }).notNull(),
  dex: varchar("dex", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
  estimatedProfit: decimal("estimated_profit", { precision: 20, scale: 6 }).notNull(),
  profitAfterFees: decimal("profit_after_fees", { precision: 20, scale: 6 }),
  slippage: decimal("slippage", { precision: 5, scale: 4 }).notNull(),
  priceImpact: decimal("price_impact", { precision: 10, scale: 6 }),
  gasEstimate: decimal("gas_estimate", { precision: 20, scale: 6 }).notNull(),
  gasPrice: text("gas_price"),
  poolLiquidity: text("pool_liquidity"),
  volume24h: text("volume_24h"),
  isPaperTrade: boolean("is_paper_trade").notNull().default(false),
  successProbability: integer("success_probability"), // 0-100
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  chainId: integer("chain_id").notNull().default(1),
});

export const paperTradingAccounts = pgTable("paper_trading_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id", { length: 100 }).notNull().default("default"),
  balance: decimal("balance", { precision: 20, scale: 6 }).notNull().default("10000.00"),
  initialBalance: decimal("initial_balance", { precision: 20, scale: 6 }).notNull().default("10000.00"),
  totalTrades: integer("total_trades").notNull().default(0),
  winningTrades: integer("winning_trades").notNull().default(0),
  losingTrades: integer("losing_trades").notNull().default(0),
  totalProfit: decimal("total_profit", { precision: 20, scale: 6 }).notNull().default("0"),
  totalLoss: decimal("total_loss", { precision: 20, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastResetAt: timestamp("last_reset_at").notNull().defaultNow(),
});

export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = typeof simulations.$inferInsert;

export type PaperTradingAccount = typeof paperTradingAccounts.$inferSelect;
export type InsertPaperTradingAccount = typeof paperTradingAccounts.$inferInsert;

// Alerts System Tables
export const alerts = pgTable("alerts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // price, opportunity, gas, wallet, risk
  category: varchar("category", { length: 50 }).notNull(),
  condition: jsonb("condition").notNull(), // JSON object with condition details
  threshold: decimal("threshold", { precision: 20, scale: 6 }),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"), // low, medium, high, critical
  isActive: boolean("is_active").notNull().default(true),
  schedule: varchar("schedule", { length: 20 }).default("instant"), // instant, 5min, hourly
  soundEnabled: boolean("sound_enabled").notNull().default(false),
  chainId: integer("chain_id"),
  dex: varchar("dex", { length: 50 }),
  tokenAddress: varchar("token_address", { length: 42 }),
  strategy: varchar("strategy", { length: 50 }),
  lastTriggered: timestamp("last_triggered"),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const alertHistory = pgTable("alert_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  alertId: integer("alert_id").notNull().references(() => alerts.id, { onDelete: "cascade" }),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  value: decimal("value", { precision: 20, scale: 6 }),
  message: text("message").notNull(),
  data: jsonb("data"), // Additional context data
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
});

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

export type AlertHistory = typeof alertHistory.$inferSelect;
export type InsertAlertHistory = typeof alertHistory.$inferInsert;

// Chain Management System Tables
export const chains = pgTable("chains", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  chainId: bigint("chain_id", { mode: "number" }).notNull().unique(),
  evm: boolean("evm").notNull().default(true),
  metamaskJson: jsonb("metamask_json"), // MetaMask add network params
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chainRpcs = pgTable("chain_rpcs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chainId: bigint("chain_id", { mode: "number" }).notNull().references(() => chains.chainId, { onDelete: "cascade" }),
  url: text("url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLatencyMs: real("last_latency_ms"),
  lastOkAt: bigint("last_ok_at", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chainDexes = pgTable("chain_dexes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chainId: bigint("chain_id", { mode: "number" }).notNull().references(() => chains.chainId, { onDelete: "cascade" }),
  dex: varchar("dex", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Assets with Anti-Rugpull Risk Scoring
export const assets = pgTable("assets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chainId: bigint("chain_id", { mode: "number" }).notNull().references(() => chains.chainId, { onDelete: "cascade" }),
  address: varchar("address", { length: 42 }).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  decimals: integer("decimals").notNull().default(18),
  name: varchar("name", { length: 200 }),
  riskScore: integer("risk_score").notNull().default(0), // 0-100, higher is safer
  riskFlags: jsonb("risk_flags").default("[]"), // ["mintable", "proxy_upgradable", etc]
  sourcesJson: jsonb("sources_json").default("{}"), // Metadata sources
  lastReviewAt: bigint("last_review_at", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Trading Pairs for Scanning
export const pairs = pgTable("pairs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chainId: bigint("chain_id", { mode: "number" }).notNull().references(() => chains.chainId, { onDelete: "cascade" }),
  baseAddr: varchar("base_addr", { length: 42 }).notNull(),
  quoteAddr: varchar("quote_addr", { length: 42 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// System Policies (ROI, risk thresholds, slippage, gas buffer, etc)
export const policies = pgTable("policies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  valueJson: jsonb("value_json").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Config Versioning for Rollback Support
export const configVersions = pgTable("config_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  versionId: varchar("version_id", { length: 50 }).notNull().unique(),
  snapshotJson: jsonb("snapshot_json").notNull(),
  createdBy: varchar("created_by", { length: 100 }).default("system"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Chain = typeof chains.$inferSelect;
export type InsertChain = typeof chains.$inferInsert;

export type ChainRpc = typeof chainRpcs.$inferSelect;
export type InsertChainRpc = typeof chainRpcs.$inferInsert;

export type ChainDex = typeof chainDexes.$inferSelect;
export type InsertChainDex = typeof chainDexes.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

export type Pair = typeof pairs.$inferSelect;
export type InsertPair = typeof pairs.$inferInsert;

export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = typeof policies.$inferInsert;

export type ConfigVersion = typeof configVersions.$inferSelect;
export type InsertConfigVersion = typeof configVersions.$inferInsert;
