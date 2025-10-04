use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: String,
    pub mode: String,
    pub database: DatabaseConfig,
    pub rpc_endpoints: Vec<RpcEndpoint>,
    pub chains: ChainsConfig,
    pub strategies: StrategiesConfig,
    pub risk: RiskConfig,
    pub execution: ExecutionConfig,
    pub monitoring: MonitoringConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub connection_string: String,
    pub max_connections: u32,
    pub min_connections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcEndpoint {
    pub chain: String,
    pub url: String,
    pub weight: u32,
    pub max_requests_per_second: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainsConfig {
    pub enabled: Vec<String>,
    pub ethereum: ChainConfig,
    pub arbitrum: ChainConfig,
    pub optimism: ChainConfig,
    pub polygon: ChainConfig,
    pub base: ChainConfig,
    pub bsc: ChainConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub multicall3_address: String,
    pub flashloan_providers: Vec<String>,
    pub max_gas_price_gwei: f64,
    pub min_profit_threshold_eth: f64,
    pub block_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategiesConfig {
    pub enabled: Vec<String>,
    pub dex_arb: DexArbConfig,
    pub flash_loan_arb: FlashLoanArbConfig,
    pub triangular_arb: TriangularArbConfig,
    pub cross_chain_arb: CrossChainArbConfig,
    pub liquidation: LiquidationConfig,
    pub sandwich: SandwichConfig,
    pub backrun: BackrunConfig,
    pub jit_liquidity: JitLiquidityConfig,
    pub cex_dex_arb: CexDexArbConfig,
    pub nft_arb: NftArbConfig,
    pub mev_share: MevShareConfig,
    pub atomic_arb: AtomicArbConfig,
    pub statistical_arb: StatisticalArbConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DexArbConfig {
    pub enabled: bool,
    pub dexes: Vec<String>,
    pub min_roi: f64,
    pub max_slippage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashLoanArbConfig {
    pub enabled: bool,
    pub providers: Vec<String>,
    pub max_leverage_multiplier: u32,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriangularArbConfig {
    pub enabled: bool,
    pub max_hops: u32,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossChainArbConfig {
    pub enabled: bool,
    pub bridges: Vec<String>,
    pub min_roi: f64,
    pub max_bridge_time_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidationConfig {
    pub enabled: bool,
    pub protocols: Vec<String>,
    pub min_health_factor: f64,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandwichConfig {
    pub enabled: bool,
    pub min_target_size_usd: f64,
    pub max_frontrun_gas_gwei: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackrunConfig {
    pub enabled: bool,
    pub target_types: Vec<String>,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitLiquidityConfig {
    pub enabled: bool,
    pub protocols: Vec<String>,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CexDexArbConfig {
    pub enabled: bool,
    pub exchanges: Vec<String>,
    pub min_roi: f64,
    pub max_latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NftArbConfig {
    pub enabled: bool,
    pub marketplaces: Vec<String>,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MevShareConfig {
    pub enabled: bool,
    pub relays: Vec<String>,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtomicArbConfig {
    pub enabled: bool,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticalArbConfig {
    pub enabled: bool,
    pub confidence_threshold: f64,
    pub min_roi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskConfig {
    pub max_position_size_eth: f64,
    pub max_daily_loss_eth: f64,
    pub enable_kill_switch: bool,
    pub kill_switch_loss_threshold_eth: f64,
    pub required_safety_score: u32,
    pub blacklisted_tokens: Vec<String>,
    pub whitelisted_tokens: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    pub max_concurrent_trades: u32,
    pub default_slippage: f64,
    pub private_mempool: bool,
    pub relays: Vec<String>,
    pub gas_strategy: String,
    pub max_priority_fee_gwei: f64,
    pub target_block_delay: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringConfig {
    pub enable_alerts: bool,
    pub alert_channels: Vec<String>,
    pub metrics_retention_days: u32,
    pub enable_grafana: bool,
    pub prometheus_endpoint: String,
}

impl Config {
    pub async fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let content = fs::read_to_string(path)
            .context("Failed to read config file")?;
        
        let config: Config = toml::from_str(&content)
            .context("Failed to parse config file")?;
        
        config.validate()?;
        
        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        if self.rpc_endpoints.is_empty() {
            anyhow::bail!("No RPC endpoints configured");
        }
        
        if self.chains.enabled.is_empty() {
            anyhow::bail!("No chains enabled");
        }
        
        if self.strategies.enabled.is_empty() {
            anyhow::bail!("No strategies enabled");
        }
        
        if self.risk.max_position_size_eth <= 0.0 {
            anyhow::bail!("Invalid max position size");
        }
        
        Ok(())
    }

    pub fn get_chain_config(&self, chain: &str) -> Option<ChainConfig> {
        match chain {
            "ethereum" => Some(self.chains.ethereum.clone()),
            "arbitrum" => Some(self.chains.arbitrum.clone()),
            "optimism" => Some(self.chains.optimism.clone()),
            "polygon" => Some(self.chains.polygon.clone()),
            "base" => Some(self.chains.base.clone()),
            "bsc" => Some(self.chains.bsc.clone()),
            _ => None,
        }
    }

    pub fn is_strategy_enabled(&self, strategy: &str) -> bool {
        self.strategies.enabled.contains(&strategy.to_string())
    }

    pub fn get_rpc_endpoints_for_chain(&self, chain: &str) -> Vec<RpcEndpoint> {
        self.rpc_endpoints
            .iter()
            .filter(|e| e.chain == chain)
            .cloned()
            .collect()
    }
}