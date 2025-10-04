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
