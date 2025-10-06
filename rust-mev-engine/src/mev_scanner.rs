use anyhow::{Result, Context};
use ethers::prelude::*;
use ethers::types::{Transaction, H256, U256, Address};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{self, Duration};
use tracing::{info, warn, error, debug};
use futures::StreamExt;

use crate::config::Config;
use crate::database::{Database, Opportunity};
use crate::monitoring::Monitoring;
use crate::multicall::{MulticallManager, PriceResult};
use crate::data_fetcher::DataFetcher;
use crate::rpc_manager::RpcManager;
use crate::math_engine;
use crate::math_engine;
use crate::types::{PoolReserves, DexFees, GasCostEstimator};
use crate::address_validator::AddressValidator;

pub struct MevScanner {
    rpc_manager: Arc<RpcManager>,
    db: Arc<Database>,
    monitoring: Arc<Monitoring>,
    config: Arc<RwLock<Config>>,
    multicall: Arc<MulticallManager>,
    dex_registry: DexRegistry,
    address_validator: AddressValidator,
    data_fetcher: DataFetcher,
}

impl MevScanner {
    pub fn new(
        rpc_manager: Arc<RpcManager>,
        db: Arc<Database>,
        monitoring: Arc<Monitoring>,
        config: Arc<RwLock<Config>>,
    ) -> Self {
        MevScanner {
            rpc_manager,
            db,
            monitoring,
            config,
            multicall: Arc::new(MulticallManager::new()),
            dex_registry: DexRegistry::new(),
            address_validator: AddressValidator::new(),
            data_fetcher: DataFetcher::new(rpc_manager.clone()),
        }
    }

    pub async fn run(&self) -> Result<()> {
        info!("Starting MEV Scanner");
        
        let config = self.config.read().await;
        let enabled_chains = config.chains.enabled.clone();
        drop(config);

        // Start scanner for each chain
        let mut handles = Vec::new();
        
        for chain in enabled_chains {
            let scanner = self.clone();
            let chain_clone = chain.clone();
            
            let handle = tokio::spawn(async move {
                if let Err(e) = scanner.scan_chain(&chain_clone).await {
                    error!("Scanner error for chain {}: {}", chain_clone, e);
                }
            });
            
            handles.push(handle);
        }

        // Wait for all scanners
        for handle in handles {
            let _ = handle.await;
        }

        Ok(())
    }

    async fn scan_chain(&self, chain: &str) -> Result<()> {
        info!("Starting scanner for chain: {}", chain);
        
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        // Get chain config
        let config = self.config.read().await;
        let chain_config = config.get_chain_config(chain)
            .ok_or_else(|| anyhow::anyhow!("No config for chain {}", chain))?;
        let chain_id = chain_config.chain_id;
        drop(config);

        // Subscribe to pending transactions
        let mut stream = provider.subscribe_pending_txs().await?;
        
        // Also periodically scan blocks
        let mut block_interval = time::interval(Duration::from_millis(chain_config.block_time_ms));
        
        loop {
            tokio::select! {
                Some(tx_hash) = stream.next() => {
                    self.process_pending_transaction(chain, chain_id, tx_hash, provider.clone()).await;
                }
                _ = block_interval.tick() => {
                    self.scan_latest_block(chain, chain_id, provider.clone()).await;
                }
            }
        }
    }

    async fn process_pending_transaction(
        &self,
        chain: &str,
        chain_id: u64,
        tx_hash: H256,
        provider: Arc<Provider<Ws>>,
    ) {
        debug!("Processing pending tx: {:?} on {}", tx_hash, chain);
        
        // Get transaction details
        let tx = match provider.get_transaction(tx_hash).await {
            Ok(Some(tx)) => tx,
            Ok(None) => return,
            Err(e) => {
                warn!("Failed to get transaction {}: {}", tx_hash, e);
                return;
            }
        };

        // Check if transaction is interesting for MEV
        if let Some(opportunities) = self.analyze_transaction(chain, chain_id, &tx).await {
            for opp in opportunities {
                // Save to database
                if let Err(e) = self.db.insert_opportunity(opp).await {
                    error!("Failed to save opportunity: {}", e);
                }
                
                // Update metrics
                self.monitoring.increment_opportunities_found();
            }
        }
    }

    async fn scan_latest_block(
        &self,
        chain: &str,
        chain_id: u64,
        provider: Arc<Provider<Ws>>,
    ) {
        debug!("Scanning latest block on {}", chain);
        
        let block_number = match provider.get_block_number().await {
            Ok(num) => num,
            Err(e) => {
                warn!("Failed to get block number: {}", e);
                return;
            }
        };

        // Scan DEX pools for arbitrage opportunities
        self.scan_dex_arbitrage(chain, chain_id, provider.clone()).await;
        
        // Scan lending protocols for liquidations
        self.scan_liquidations(chain, chain_id, provider.clone()).await;
        
        // Update metrics
        self.monitoring.set_last_scanned_block(chain, block_number.as_u64());
    }

    async fn analyze_transaction(
        &self,
        chain: &str,
        chain_id: u64,
        tx: &Transaction,
    ) -> Option<Vec<Opportunity>> {
        let config = self.config.read().await;
        let strategies = &config.strategies;
        let mut opportunities = Vec::new();

        // Sandwich attack detection
        if strategies.sandwich.enabled && strategies.is_strategy_enabled("sandwich") {
            if let Some(opp) = self.detect_sandwich_opportunity(chain, chain_id, tx).await {
                opportunities.push(opp);
            }
        }

        // Backrun opportunity detection
        if strategies.backrun.enabled && strategies.is_strategy_enabled("backrun") {
            if let Some(opp) = self.detect_backrun_opportunity(chain, chain_id, tx).await {
                opportunities.push(opp);
            }
        }

        // JIT liquidity opportunity
        if strategies.jit_liquidity.enabled && strategies.is_strategy_enabled("jit-liquidity") {
            if let Some(opp) = self.detect_jit_opportunity(chain, chain_id, tx).await {
                opportunities.push(opp);
            }
        }

        if opportunities.is_empty() {
            None
        } else {
            Some(opportunities)
        }
    }

    async fn detect_sandwich_opportunity(
        &self,
        chain: &str,
        chain_id: u64,
        tx: &Transaction,
    ) -> Option<Opportunity> {
        // Check if transaction is a large swap on a known DEX
                if let Some(to_addr) = tx.to {
            if !self.address_validator.is_address_safe(&to_addr).await {
                return None;
            }
            if !self.dex_registry.is_dex_router(&to_addr) {
                return None;
            }
        } else {
            return None;
        }

        // Decode swap parameters
        // This is simplified - in production you'd decode the actual calldata
        let value = tx.value;
        if value < U256::from(50000) * U256::exp10(18) { // Less than 50k USD worth
            return None;
        }

        Some(Opportunity {
            id: format!("sandwich_{}_{}", chain, tx.hash),
            chain_id: chain_id as i32,
            strategy: "sandwich".to_string(),
            dex_in: self.dex_registry.get_dex_name(&tx.to?).unwrap_or("unknown".to_string()),
            dex_out: self.dex_registry.get_dex_name(&tx.to?).unwrap_or("unknown".to_string()),
            base_token: format!("{:?}", tx.to.unwrap_or_default()),
            quote_token: "WETH".to_string(),
            amount_in: value.to_string(),
            est_profit_usd: 100.0, // Simplified estimate
            gas_usd: 50.0,
            ts: chrono::Utc::now().timestamp_millis(),
            metadata: serde_json::json!({
                "type": "sandwich",
                "target_tx": format!("{:?}", tx.hash),
                "target_value": value.to_string(),
            }),
        })
    }

    async fn detect_backrun_opportunity(
        &self,
        chain: &str,
        chain_id: u64,
        tx: &Transaction,
    ) -> Option<Opportunity> {
        // Check if transaction creates an arbitrage opportunity
        // For example, after a large swap that moves the price
        
        if let Some(to_addr) = tx.to {
            if !self.address_validator.is_address_safe(&to_addr).await {
                return None;
            }
            if !self.dex_registry.is_dex_router(&to_addr) {
                return None;
            }
        } else {
            return None;
        }

        Some(Opportunity {
            id: format!("backrun_{}_{}", chain, tx.hash),
            chain_id: chain_id as i32,
            strategy: "backrun".to_string(),
            dex_in: self.dex_registry.get_dex_name(&tx.to?).unwrap_or("unknown".to_string()),
            dex_out: "SushiSwap".to_string(),
            base_token: format!("{:?}", tx.to.unwrap_or_default()),
            quote_token: "USDC".to_string(),
            amount_in: tx.value.to_string(),
            est_profit_usd: 75.0,
            gas_usd: 30.0,
            ts: chrono::Utc::now().timestamp_millis(),
            metadata: serde_json::json!({
                "type": "backrun",
                "target_tx": format!("{:?}", tx.hash),
            }),
        })
    }

    async fn detect_jit_opportunity(
        &self,
        chain: &str,
        chain_id: u64,
        tx: &Transaction,
    ) -> Option<Opportunity> {
        // Check if transaction is adding/removing liquidity from Uniswap V3
        let uniswap_v3_positions = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88".parse::<Address>().ok()?;
        
        if let Some(to_addr) = tx.to {
            if !self.address_validator.is_address_safe(&to_addr).await {
                return None;
            }
            if to_addr != uniswap_v3_positions {
                return None;
            }
        } else {
            return None;
        }

        Some(Opportunity {
            id: format!("jit_{}_{}", chain, tx.hash),
            chain_id: chain_id as i32,
            strategy: "jit-liquidity".to_string(),
            dex_in: "Uniswap V3".to_string(),
            dex_out: "Uniswap V3".to_string(),
            base_token: "WETH".to_string(),
            quote_token: "USDC".to_string(),
            amount_in: tx.value.to_string(),
            est_profit_usd: 150.0,
            gas_usd: 80.0,
            ts: chrono::Utc::now().timestamp_millis(),
            metadata: serde_json::json!({
                "type": "jit-liquidity",
                "target_tx": format!("{:?}", tx.hash),
            }),
        })
    }

    async fn scan_dex_arbitrage(
        &self,
        chain: &str,
        chain_id: u64,
        provider: Arc<Provider<Ws>>,
    ) {
        debug!("Scanning for DEX arbitrage on {}", chain);
        
        // Get prices from multiple DEXs
        let pairs = self.dex_registry.get_common_pairs(chain);
        
        for (token0, token1) in pairs {
            let prices = self.get_prices_across_dexs(chain_id, provider.clone(), &token0, &token1).await;
            
            if let Ok(prices) = prices {
                // Find arbitrage opportunities
                for i in 0..prices.len() {
                    for j in i+1..prices.len() {
                    // Aquí integramos el cálculo diferencial para encontrar la cantidad óptima y el beneficio
                    // Esto es una simplificación. En un bot real, se necesitarían las reservas reales de los pools
                    // y se modelaría la función de beneficio de forma más precisa.

                    // Obtener reservas de pools en tiempo real usando DataFetcher
                    let pool1_reserves = match self.data_fetcher.get_pool_reserves(chain, &prices[i].0, &token0, &token1).await {
                        Ok(res) => res,
                        Err(e) => {
                            warn!("Failed to get pool1 reserves for {}/{}: {}", token0, token1, e);
                            continue;
                        }
                    };
                    let pool2_reserves = match self.data_fetcher.get_pool_reserves(chain, &prices[j].0, &token1, &token0).await {
                        Ok(res) => res,
                        Err(e) => {
                            warn!("Failed to get pool2 reserves for {}/{}: {}", token1, token0, e);
                            continue;
                        }
                    };
                    let dex_fees = DexFees { fee_rate_pool1: 0.003, fee_rate_pool2: 0.003 };
                    let gas_estimator = GasCostEstimator { fixed_cost: 20.0 }; // Costo de gas en USD

                    let profit_function = |x_in: f64| {
                        math_engine::calculate_profit(
                            x_in,
                            &pool1_reserves,
                            &pool2_reserves,
                            &dex_fees,
                            &gas_estimator,
                        )
                    };

                    let initial_guess = 1.0; // Cantidad inicial de Token A a probar (ej. 1 WETH)
                    let tolerance = 1e-6;
                    let max_iterations = 1000;
                    let step_size = 0.1;

                    if let Some(optimal_x) = math_engine::find_optimal_x(profit_function, initial_guess, tolerance, max_iterations, step_size) {
                        let max_profit = profit_function(optimal_x);

                        if max_profit > 0.0 { // Umbral de beneficio mínimo
                            info!("Arbitrage opportunity detected: {} -> {} (Optimal Amount: {:.6}, Profit: {:.6} USD)", prices[i].0, prices[j].0, optimal_x, max_profit);

                            let opp = Opportunity {
                                id: format!("arb_{}_{}_{}", chain, prices[i].0, prices[j].0),
                                chain_id: chain_id as i32,
                                strategy: "dex-arb".to_string(),
                                dex_in: prices[i].0.clone(),
                                dex_out: prices[j].0.clone(),
                                base_token: token0.clone(),
                                quote_token: token1.clone(),
                                amount_in: optimal_x.to_string(), // Cantidad óptima calculada
                                est_profit_usd: max_profit,
                                gas_usd: gas_estimator.estimate_cost(optimal_x),
                                ts: chrono::Utc::now().timestamp_millis(),
                                metadata: serde_json::json!({
                                    "type": "dex-arb",
                                    "optimal_amount_in": optimal_x,
                                    "estimated_profit_usd": max_profit,
                                }),
                            };
                            
                            if let Err(e) = self.db.insert_opportunity(opp).await {
                                error!("Failed to save arbitrage opportunity: {}", e);
                            }
                        }
                    } else { 
                            debug!("No profitable opportunity after optimization for {} -> {}", prices[i].0, prices[j].0);
                        }
                    } else {
                        debug!("Could not find optimal amount for arbitrage opportunity: {} -> {}", prices[i].0, prices[j].0);
                    }                   } else { 
                            debug!("No profitable opportunity after optimization for {} -> {}", prices[i].0, prices[j].0);
                        }
                    } else {
                        debug!("Could not find optimal amount for arbitrage opportunity: {} -> {}", prices[i].0, prices[j].0);
                    }
                    }
                }
            }
        }
    }

    async fn scan_liquidations(
        &self,
        chain: &str,
        chain_id: u64,
        provider: Arc<Provider<Ws>>,
    ) {
        debug!("Scanning for liquidations on {}", chain);
        
        // Check Aave V3 positions
        // In production, you'd query the actual lending pool contract
        let sample_liquidation = Opportunity {
            id: format!("liq_{}_{}", chain, chrono::Utc::now().timestamp_millis()),
            chain_id: chain_id as i32,
            strategy: "liquidation".to_string(),
            dex_in: "Aave V3".to_string(),
            dex_out: "Uniswap V3".to_string(),
            base_token: "WETH".to_string(),
            quote_token: "USDC".to_string(),
            amount_in: "5000000000000000000".to_string(), // 5 ETH
            est_profit_usd: 250.0,
            gas_usd: 100.0,
            ts: chrono::Utc::now().timestamp_millis(),
            metadata: serde_json::json!({
                "type": "liquidation",
                "protocol": "aave-v3",
                "health_factor": 1.02,
            }),
        };
        
        if let Err(e) = self.db.insert_opportunity(sample_liquidation).await {
            error!("Failed to save liquidation opportunity: {}", e);
        }
    }

    async fn get_prices_across_dexs(
        &self,
        chain_id: u64,
        provider: Arc<Provider<Ws>>,
        token0: &str,
        token1: &str,
    ) -> Result<Vec<(String, f64)>> {
        let mut prices = Vec::new();
        
        // Get Uniswap V2 price
        prices.push(("Uniswap V2".to_string(), 3000.0)); // Simplified
        
        // Get Uniswap V3 price
        prices.push(("Uniswap V3".to_string(), 3010.0)); // Simplified
        
        // Get SushiSwap price
        prices.push(("SushiSwap".to_string(), 2995.0)); // Simplified
        
        Ok(prices)
    }
}

impl Clone for MevScanner {
    fn clone(&self) -> Self {
        MevScanner {
            rpc_manager: self.rpc_manager.clone(),
            db: self.db.clone(),
            monitoring: self.monitoring.clone(),
            config: self.config.clone(),
            multicall: self.multicall.clone(),
            dex_registry: self.dex_registry.clone(),
        }
    }
}

#[derive(Clone)]
struct DexRegistry {
    routers: HashMap<Address, String>,
    pairs: HashMap<String, Vec<(String, String)>>,
}

impl DexRegistry {
    fn new() -> Self {
        let mut routers = HashMap::new();
        let mut pairs = HashMap::new();
        
        // Uniswap V2 Router
        routers.insert(
            "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D".parse().unwrap(),
            "Uniswap V2".to_string()
        );
        
        // Uniswap V3 Router
        routers.insert(
            "0xE592427A0AEce92De3Edee1F18E0157C05861564".parse().unwrap(),
            "Uniswap V3".to_string()
        );
        
        // SushiSwap Router
        routers.insert(
            "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F".parse().unwrap(),
            "SushiSwap".to_string()
        );
        
        // Common trading pairs
        pairs.insert("ethereum".to_string(), vec![
            ("WETH".to_string(), "USDC".to_string()),
            ("WETH".to_string(), "USDT".to_string()),
            ("WETH".to_string(), "DAI".to_string()),
            ("WBTC".to_string(), "WETH".to_string()),
        ]);
        
        DexRegistry { routers, pairs }
    }
    
    fn is_dex_router(&self, address: &Address) -> bool {
        self.routers.contains_key(address)
    }
    
    fn get_dex_name(&self, address: &Address) -> Option<String> {
        self.routers.get(address).cloned()
    }
    
    fn get_common_pairs(&self, chain: &str) -> Vec<(String, String)> {
        self.pairs.get(chain).cloned().unwrap_or_default()
    }
}