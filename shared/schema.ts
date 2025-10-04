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
