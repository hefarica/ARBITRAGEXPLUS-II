-- ArbitrageX MEV System - D1 Database Schema
-- Version: 3.6.0
-- Compatible with shared/schema.ts

-- Drop existing tables if they exist
DROP TABLE IF EXISTS opportunities;
DROP TABLE IF EXISTS asset_safety;
DROP TABLE IF EXISTS executions;
DROP TABLE IF EXISTS engine_config;

-- Create opportunities table
CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  dex_in TEXT NOT NULL,
  dex_out TEXT NOT NULL,
  base_token TEXT NOT NULL,
  quote_token TEXT NOT NULL,
  amount_in TEXT NOT NULL,
  est_profit_usd REAL NOT NULL,
  gas_usd REAL NOT NULL,
  ts INTEGER NOT NULL
);

-- Create indexes for opportunities
CREATE INDEX idx_opportunities_chain_id ON opportunities(chain_id);
CREATE INDEX idx_opportunities_timestamp ON opportunities(ts DESC);
CREATE INDEX idx_opportunities_profit ON opportunities(est_profit_usd DESC);
CREATE INDEX idx_opportunities_base_token ON opportunities(base_token);
CREATE INDEX idx_opportunities_quote_token ON opportunities(quote_token);
CREATE INDEX idx_opportunities_dex_in ON opportunities(dex_in);
CREATE INDEX idx_opportunities_dex_out ON opportunities(dex_out);

-- Create asset_safety table
CREATE TABLE asset_safety (
  address TEXT PRIMARY KEY,
  score INTEGER NOT NULL,
  checks TEXT NOT NULL, -- JSON string
  updated_at INTEGER NOT NULL
);

-- Create indexes for asset_safety
CREATE INDEX idx_asset_safety_score ON asset_safety(score DESC);
CREATE INDEX idx_asset_safety_updated ON asset_safety(updated_at DESC);

-- Create executions table
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  tx_hash TEXT,
  chain_id INTEGER NOT NULL,
  profit_usd REAL,
  gas_usd REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create indexes for executions
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_chain_id ON executions(chain_id);
CREATE INDEX idx_executions_created_at ON executions(created_at DESC);
CREATE INDEX idx_executions_updated_at ON executions(updated_at DESC);
CREATE INDEX idx_executions_tx_hash ON executions(tx_hash);
CREATE INDEX idx_executions_profit ON executions(profit_usd DESC);

-- Create engine_config table
CREATE TABLE engine_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  config TEXT NOT NULL, -- JSON string
  is_active BOOLEAN NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for engine_config
CREATE INDEX idx_engine_config_version ON engine_config(version);
CREATE INDEX idx_engine_config_active ON engine_config(is_active);
CREATE INDEX idx_engine_config_created ON engine_config(created_at DESC);
CREATE INDEX idx_engine_config_updated ON engine_config(updated_at DESC);

-- Insert default configuration
INSERT INTO engine_config (version, config, is_active, created_at, updated_at)
VALUES (
  '3.6.0',
  json('{"version":"3.6.0","mode":"production","chains":{"enabled":["ethereum","arbitrum","optimism","polygon","bsc"],"ethereum":{"rpc":"wss://eth-mainnet.alchemyapi.io/v2/...","maxGasPrice":"150","minProfitThreshold":"0.015"},"arbitrum":{"rpc":"wss://arb-mainnet.alchemyapi.io/v2/...","maxGasPrice":"2","minProfitThreshold":"0.01"},"optimism":{"rpc":"wss://opt-mainnet.alchemyapi.io/v2/...","maxGasPrice":"2","minProfitThreshold":"0.01"},"polygon":{"rpc":"wss://polygon-mainnet.alchemyapi.io/v2/...","maxGasPrice":"300","minProfitThreshold":"0.012"},"bsc":{"rpc":"wss://bsc-mainnet.alchemyapi.io/v2/...","maxGasPrice":"10","minProfitThreshold":"0.018"}},"strategies":{"enabled":["dex-arb","flash-loan-arb","triangular-arb","cross-chain-arb","liquidation","backrun","jit-liquidity","cex-dex-arb","mev-share","atomic-arb","statistical-arb"]},"risk":{"maxPositionSize":"100","maxDailyLoss":"500","enableKillSwitch":true,"killSwitchLossThreshold":"1000","requiredSafetyScore":70,"blacklistedTokens":[],"whitelistedTokens":["WETH","USDC","USDT","DAI","WBTC"]},"execution":{"maxConcurrentTrades":5,"defaultSlippage":0.005,"privateMempool":true,"relays":["flashbots","bloxroute","mev-share"],"gasStrategy":"adaptive","maxPriorityFeePerGas":"3","targetBlockDelay":1},"monitoring":{"enableAlerts":true,"alertChannels":["telegram","discord","email"],"metricsRetention":30,"enableGrafana":true,"prometheusEndpoint":"http://localhost:9090"}}'),
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO migrations (name) VALUES ('0001_initial');