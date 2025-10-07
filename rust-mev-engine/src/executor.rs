use anyhow::{Result, Context};
use ethers::prelude::*;
use ethers::types::{Transaction, TransactionRequest, H256, U256, Address, Bytes};
use ethers::core::types::transaction::eip2718::TypedTransaction;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{self, Duration};
use tracing::{info, warn, error, debug};

use crate::config::Config;
use crate::database::{Database, Execution};
use crate::monitoring::Monitoring;
use crate::rpc_manager::RpcManager;
use crate::math_engine;
use crate::types::{KitDeArmado, PoolReserves, DexFees, GasCostEstimator};

// Flashbots bundle relay
const FLASHBOTS_RELAY: &str = "https://relay.flashbots.net";
const BLOXROUTE_RELAY: &str = "https://bloxroute.ethical.blxrbdn.com";
const MEV_SHARE_RELAY: &str = "https://mev-share.flashbots.net";

pub struct Executor {
    rpc_manager: Arc<RpcManager>,
    db: Arc<Database>,
    monitoring: Arc<Monitoring>,
    config: Arc<RwLock<Config>>,
    nonce_tracker: Arc<RwLock<NonceTracker>>,
    gas_oracle: Arc<GasOracle>,
}

impl Executor {
    pub fn new(
        rpc_manager: Arc<RpcManager>,
        db: Arc<Database>,
        monitoring: Arc<Monitoring>,
        config: Arc<RwLock<Config>>,
    ) -> Self {
        Executor {
            rpc_manager: rpc_manager.clone(),
            db,
            monitoring,
            config,
            nonce_tracker: Arc::new(RwLock::new(NonceTracker::new())),
            gas_oracle: Arc::new(GasOracle::new(rpc_manager)),
        }
    }

    pub async fn run(&self) -> Result<()> {
        info!("Starting Executor");
        
        let mut interval = time::interval(Duration::from_millis(500));
        
        loop {
            interval.tick().await;
            
            // Get pending executions from database
            let pending = self.db.get_pending_executions().await?;
            
            for execution in pending {
                // Process execution
                let exec_clone = self.clone();
                tokio::spawn(async move {
                    if let Err(e) = exec_clone.execute_opportunity(&execution).await {
                        error!("Failed to execute opportunity {}: {}", execution.id, e);
                    }
                });
            }
        }
    }

    async fn execute_opportunity(&self, execution: &Execution) -> Result<()> {
        info!("Executing opportunity: {}", execution.id);
        
        let config = self.config.read().await;
        
        // Determine execution strategy
        match execution.strategy.as_str() {
            "dex-arb" | "triangular-arb" | "atomic-arb" => {
                self.execute_atomic_arbitrage(execution, &config).await?
            }
            "flash-loan-arb" => {
                self.execute_flashloan_arbitrage(execution, &config).await?
            }
            "cross-chain-arb" => {
                self.execute_cross_chain_arbitrage(execution, &config).await?
            }
            "liquidation" => {
                self.execute_liquidation(execution, &config).await?
            }
            "sandwich" => {
                self.execute_sandwich(execution, &config).await?
            }
            "backrun" => {
                self.execute_backrun(execution, &config).await?
            }
            "jit-liquidity" => {
                self.execute_jit_liquidity(execution, &config).await?
            }
            _ => {
                warn!("Unknown execution strategy: {}", execution.strategy);
            }
        }
        
        Ok(())
    }

        async fn execute_atomic_arbitrage(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<()> {
        debug!("Executing atomic arbitrage with Kit de Armado: {}", execution.id);

        let chain = &execution.chain;

        // Asegurarse de que el kit de armado está presente
        let kit = execution.kit_de_armado.as_ref()
            .ok_or_else(|| anyhow::anyhow!("Kit de Armado no encontrado para la ejecución {}", execution.id))?;

        // Construir el bundle de transacciones a partir del kit de armado
        let bundle = self.build_kit_de_armado_bundle(kit, config).await?;

        // Enviar el bundle a través de un relay privado como Flashbots
        self.send_flashbots_bundle(bundle, chain).await?;

        Ok(())
    }

    async fn execute_flashloan_arbitrage(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<()> {
        debug!("Executing flashloan arbitrage: {}", execution.id);
        
        let chain = &execution.chain;
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        // Build flashloan transaction
        let tx = self.build_flashloan_transaction(execution, config).await?;
        
        // Always use private mempool for flashloans to avoid frontrunning
        self.send_private_transaction(tx, chain, config).await?;
        
        Ok(())
    }

    async fn execute_cross_chain_arbitrage(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<()> {
        debug!("Executing cross-chain arbitrage: {}", execution.id);
        
        // This requires coordinated execution across multiple chains
        // Simplified implementation - in production would use bridges
        
        let source_chain = &execution.chain;
        let target_chain = &execution.target_chain.clone().unwrap_or_default();
        
        let source_provider = self.rpc_manager.get_provider(source_chain).await?;
        let target_provider = self.rpc_manager.get_provider(target_chain).await?;
        
        // Build transactions for both chains
        let source_tx = self.build_bridge_transaction(execution, config, true).await?;
        let target_tx = self.build_bridge_transaction(execution, config, false).await?;
        
        // Send transactions
        self.send_public_transaction(source_tx, source_provider).await?;
        time::sleep(Duration::from_secs(2)).await;
        self.send_public_transaction(target_tx, target_provider).await?;
        
        Ok(())
    }

    async fn execute_liquidation(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<()> {
        debug!("Executing liquidation: {}", execution.id);
        
        let chain = &execution.chain;
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        // Build liquidation transaction
        let tx = self.build_liquidation_transaction(execution, config).await?;
        
        // Use private mempool for better execution
        if config.execution.private_mempool {
            self.send_private_transaction(tx, chain, config).await?;
        } else {
            self.send_public_transaction(tx, provider).await?;
        }
        
        Ok(())
    }

    async fn execute_sandwich(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<()> {
        debug!("Executing sandwich: {}", execution.id);
        
        if !config.strategies.sandwich.enabled {
            warn!("Sandwich strategy is disabled");
            return Ok(());
        }
        
        let chain = &execution.chain;
        
        // Build frontrun and backrun transactions
        let frontrun_tx = self.build_frontrun_transaction(execution, config).await?;
        let backrun_tx = self.build_backrun_transaction(execution, config).await?;
        
        // Create bundle for Flashbots
        let bundle = self.create_flashbots_bundle(vec![frontrun_tx, backrun_tx]).await?;
        
        // Send bundle
        self.send_flashbots_bundle(bundle, chain).await?;
        
        Ok(())
    }

    async fn execute_backrun(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<()> {
        debug!("Executing backrun: {}", execution.id);
        
        let chain = &execution.chain;
        
        // Build backrun transaction
        let tx = self.build_backrun_transaction(execution, config).await?;
        
        // Send via private relay for better positioning
        self.send_private_transaction(tx, chain, config).await?;
        
        Ok(())
    }

    async fn execute_jit_liquidity(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<()> {
        debug!("Executing JIT liquidity: {}", execution.id);
        
        let chain = &execution.chain;
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        // Build JIT liquidity provision transaction
        let add_liquidity_tx = self.build_add_liquidity_transaction(execution, config).await?;
        let remove_liquidity_tx = self.build_remove_liquidity_transaction(execution, config).await?;
        
        // Create bundle
        let bundle = self.create_flashbots_bundle(vec![add_liquidity_tx, remove_liquidity_tx]).await?;
        
        // Send bundle
        self.send_flashbots_bundle(bundle, chain).await?;
        
        Ok(())
    }

    async fn build_arbitrage_transaction(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<TypedTransaction> {
        let mut tx = TransactionRequest::new();
        
        // Set basic parameters
        tx = tx.to("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D".parse::<Address>()?); // Uniswap V2 Router
        tx = tx.value(U256::zero());
        
        // Encode swap calldata
        let calldata = self.encode_swap_calldata(execution)?;
        tx = tx.data(calldata);
        
        // Set gas parameters
        let gas_price = self.gas_oracle.get_gas_price(&execution.chain).await?;
        tx = tx.gas_price(gas_price);
        
        // Simulate transaction to estimate gas more accurately
        let simulated_tx = tx.clone().into();
        let (estimated_gas_used, _) = self.simulate_transaction(&simulated_tx, &execution.chain).await?;
        tx = tx.gas(estimated_gas_used + U256::from(50000)); // Add a buffer
        
        // Get nonce
        let nonce = self.nonce_tracker.write().await.get_next_nonce(&execution.chain).await?;
        tx = tx.nonce(nonce);
        
        Ok(tx.into())
    }

    async fn build_flashloan_transaction(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<TypedTransaction> {
        let mut tx = TransactionRequest::new();
        
        // AAVE V3 Pool address
        tx = tx.to("0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2".parse::<Address>()?);
        tx = tx.value(U256::zero());
        
        // Encode flashloan calldata
        let calldata = self.encode_flashloan_calldata(execution)?;
        tx = tx.data(calldata);
        
        // Set gas parameters
        let gas_price = self.gas_oracle.get_gas_price(&execution.chain).await?;
        tx = tx.gas_price(gas_price);
        tx = tx.gas(U256::from(1000000));
        
        // Get nonce
        let nonce = self.nonce_tracker.write().await.get_next_nonce(&execution.chain).await?;
        tx = tx.nonce(nonce);
        
        Ok(tx.into())
    }

    async fn build_bridge_transaction(
        &self,
        execution: &Execution,
        config: &Config,
        is_source: bool,
    ) -> Result<TypedTransaction> {
        let mut tx = TransactionRequest::new();
        
        // Stargate Router
        tx = tx.to("0x8731d54E9D02c286767d56ac03e8037C07e01e98".parse::<Address>()?);
        
        if is_source {
            tx = tx.value(execution.amount_in.parse::<U256>()?);
        } else {
            tx = tx.value(U256::zero());
        }
        
        // Encode bridge calldata
        let calldata = self.encode_bridge_calldata(execution, is_source)?;
        tx = tx.data(calldata);
        
        // Set gas parameters
        let gas_price = self.gas_oracle.get_gas_price(&execution.chain).await?;
        tx = tx.gas_price(gas_price);
        tx = tx.gas(U256::from(300000));
        
        Ok(tx.into())
    }

    async fn build_liquidation_transaction(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<TypedTransaction> {
        let mut tx = TransactionRequest::new();
        
        // AAVE V3 Pool for liquidations
        tx = tx.to("0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2".parse::<Address>()?);
        tx = tx.value(U256::zero());
        
        // Encode liquidation calldata
        let calldata = self.encode_liquidation_calldata(execution)?;
        tx = tx.data(calldata);
        
        // Higher gas for liquidations
        let gas_price = self.gas_oracle.get_fast_gas_price(&execution.chain).await?;
        tx = tx.gas_price(gas_price);
        tx = tx.gas(U256::from(800000));
        
        Ok(tx.into())
    }

    async fn build_frontrun_transaction(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<TypedTransaction> {
        // Build transaction to execute before target
        self.build_arbitrage_transaction(execution, config).await
    }

    async fn build_backrun_transaction(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<TypedTransaction> {
        // Build transaction to execute after target
        self.build_arbitrage_transaction(execution, config).await
    }

    async fn build_add_liquidity_transaction(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<TypedTransaction> {
        let mut tx = TransactionRequest::new();
        
        // Uniswap V3 Position Manager
        tx = tx.to("0xC36442b4a4522E871399CD717aBDD847Ab11FE88".parse::<Address>()?);
        tx = tx.value(execution.amount_in.parse::<U256>()?);
        
        // Encode add liquidity calldata
        let calldata = self.encode_add_liquidity_calldata(execution)?;
        tx = tx.data(calldata);
        
        let gas_price = self.gas_oracle.get_gas_price(&execution.chain).await?;
        tx = tx.gas_price(gas_price);
        tx = tx.gas(U256::from(400000));
        
        Ok(tx.into())
    }

    async fn build_remove_liquidity_transaction(
        &self,
        execution: &Execution,
        config: &Config,
    ) -> Result<TypedTransaction> {
        let mut tx = TransactionRequest::new();
        
        // Uniswap V3 Position Manager
        tx = tx.to("0xC36442b4a4522E871399CD717aBDD847Ab11FE88".parse::<Address>()?);
        tx = tx.value(U256::zero());
        
        // Encode remove liquidity calldata
        let calldata = self.encode_remove_liquidity_calldata(execution)?;
        tx = tx.data(calldata);
        
        let gas_price = self.gas_oracle.get_gas_price(&execution.chain).await?;
        tx = tx.gas_price(gas_price);
        tx = tx.gas(U256::from(300000));
        
        Ok(tx.into())
    }

    // Encoding helper functions (simplified)
    fn encode_swap_calldata(&self, execution: &Execution) -> Result<Bytes> {
        // In production, would properly encode based on DEX ABI
        Ok(Bytes::from(vec![0x01, 0x02, 0x03]))
    }

    fn encode_flashloan_calldata(&self, execution: &Execution) -> Result<Bytes> {
        Ok(Bytes::from(vec![0x04, 0x05, 0x06]))
    }

    fn encode_bridge_calldata(&self, execution: &Execution, is_source: bool) -> Result<Bytes> {
        Ok(Bytes::from(vec![0x07, 0x08, 0x09]))
    }

    fn encode_liquidation_calldata(&self, execution: &Execution) -> Result<Bytes> {
        Ok(Bytes::from(vec![0x0a, 0x0b, 0x0c]))
    }

    fn encode_add_liquidity_calldata(&self, execution: &Execution) -> Result<Bytes> {
        Ok(Bytes::from(vec![0x0d, 0x0e, 0x0f]))
    }

    fn encode_remove_liquidity_calldata(&self, execution: &Execution) -> Result<Bytes> {
        Ok(Bytes::from(vec![0x10, 0x11, 0x12]))
    }

    async fn send_public_transaction(
        &self,
        tx: TypedTransaction,
        provider: Arc<Provider<Ws>>,
    ) -> Result<H256> {
        let pending_tx = provider.send_transaction(tx, None).await?;
        let tx_hash = pending_tx.tx_hash();
        
        info!("Sent public transaction: {:?}", tx_hash);
        self.monitoring.increment_transactions_sent();

        // Wait for transaction receipt to check status
        match pending_tx.await {
            Ok(Some(receipt)) => {
                if receipt.status == Some(1.into()) { // 1 means success
                    self.monitoring.increment_transactions_successful();
                    info!("Public transaction successful: {:?}", tx_hash);
                } else {
                    self.monitoring.increment_reverted_transactions();
                    warn!("Public transaction reverted: {:?}", tx_hash);
                }
            },
            Ok(None) => {
                self.monitoring.increment_transactions_failed();
                warn!("Public transaction not found after sending: {:?}", tx_hash);
            },
            Err(e) => {
                self.monitoring.increment_transactions_failed();
                error!("Error waiting for public transaction receipt {:?}: {}", tx_hash, e);
            }
        }
        
        Ok(tx_hash)

    }

      async fn send_private_transaction(
        &self,
        tx: TypedTransaction,
        chain: &str,
        config: &Config,
    ) -> Result<H256> {
        info!("Sending private transaction on {}", chain);
        self.monitoring.increment_transactions_sent();

        let mut last_error: Option<String> = None;

        for relay in &config.execution.relays {
            match relay.as_str() {
                "flashbots" => {
                    if config.execution.flashbots_enabled {
                        match self.send_to_flashbots(tx.clone(), chain).await {
                            Ok(hash) => return Ok(hash),
                            Err(e) => {
                                error!("Flashbots relay failed: {}", e);
                                last_error = Some(e.to_string());
                            }
                        }
                    }
                }
                "bloxroute" => {
                    if config.execution.bloxroute_enabled {
                        match self.send_to_bloxroute(tx.clone(), chain).await {
                            Ok(hash) => return Ok(hash),
                            Err(e) => {
                                error!("Bloxroute relay failed: {}", e);
                                last_error = Some(e.to_string());
                            }
                        }
                    }
                }
                "mev_share" => {
                    if config.execution.mev_share_enabled {
                        match self.send_to_mev_share(tx.clone(), chain).await {
                            Ok(hash) => return Ok(hash),
                            Err(e) => {
                                error!("MEV-Share relay failed: {}", e);
                                last_error = Some(e.to_string());
                            }
                        }
                    }
                }
                _ => {
                    warn!("Unknown private relay configured: {}", relay);
                }
            }
        }

        if let Some(err_msg) = last_error {
            self.monitoring.increment_reverted_transactions();
            Err(anyhow::anyhow!("All private relays failed: {}", err_msg))
        } else {
            self.monitoring.increment_reverted_transactions();
            Err(anyhow::anyhow!("No private relays enabled or configured"))
        }
    }

    async fn send_to_flashbots(&self, tx: TypedTransaction, chain: &str) -> Result<H256> {
        // Simplified - would use actual Flashbots API
        info!("Sending transaction to Flashbots");
        Ok(H256::random())
    }

    async fn send_to_bloxroute(&self, tx: TypedTransaction, chain: &str) -> Result<H256> {
        // Simplified - would use actual bloXroute API
        info!("Sending transaction to bloXroute");
        Ok(H256::random())
    }

    async fn send_to_mev_share(&self, tx: TypedTransaction, chain: &str) -> Result<H256> {
        // Simplified - would use actual MEV-Share API
        info!("Sending transaction to MEV-Share");
        Ok(H256::random())
    }

    async fn create_flashbots_bundle(&self, transactions: Vec<TypedTransaction>) -> Result<Bundle> {
        Ok(Bundle {
            transactions,
            block_number: 0,
            min_timestamp: None,
            max_timestamp: None,
        })
    }

    async fn send_flashbots_bundle(&self, bundle: Bundle, chain: &str) -> Result<()> {
        info!("Sending Flashbots bundle with {} transactions", bundle.transactions.len());
        self.monitoring.increment_bundles_sent();
        Ok(())
    }
}

impl Clone for Executor {
    fn clone(&self) -> Self {
        Executor {
            rpc_manager: self.rpc_manager.clone(),
            db: self.db.clone(),
            monitoring: self.monitoring.clone(),
            config: self.config.clone(),
            nonce_tracker: self.nonce_tracker.clone(),
            gas_oracle: self.gas_oracle.clone(),
        }
    }
}

struct NonceTracker {
    nonces: std::collections::HashMap<String, U256>,
}

impl NonceTracker {
    fn new() -> Self {
        NonceTracker {
            nonces: std::collections::HashMap::new(),
        }
    }

    async fn get_next_nonce(&mut self, chain: &str) -> Result<U256> {
        let nonce = self.nonces.entry(chain.to_string()).or_insert(U256::zero());
        let current = *nonce;
        *nonce = current + 1;
        Ok(current)
    }
}

struct GasOracle {
    rpc_manager: Arc<RpcManager>,
}

impl GasOracle {
    fn new(rpc_manager: Arc<RpcManager>) -> Self {
        GasOracle { rpc_manager }
    }

    async fn get_gas_price(&self, chain: &str) -> Result<U256> {
        // Simplified - would query actual gas prices
        Ok(U256::from(30) * U256::exp10(9)) // 30 Gwei
    }

    async fn get_fast_gas_price(&self, chain: &str) -> Result<U256> {
        // Higher gas for urgent transactions
        Ok(U256::from(50) * U256::exp10(9)) // 50 Gwei
    }

    async fn build_kit_de_armado_bundle(
        &self,
        kit: &KitDeArmado,
        config: &Config,
    ) -> Result<Vec<TypedTransaction>> {
        let mut bundle = Vec::new();

        for step in &kit.pasos {
            let mut tx = TransactionRequest::new();
            tx = tx.to(step.contrato.parse::<Address>()?);
            tx = tx.value(step.valor.parse::<U256>()?);
            tx = tx.data(step.calldata.parse::<Bytes>()?);

            // Configurar gas y nonce (esto es una simplificación)
            let gas_price = self.gas_oracle.get_gas_price(&kit.chain).await?;
            tx = tx.gas_price(gas_price);
            tx = tx.gas(U256::from(500000)); // Gas estimado por paso

            bundle.push(tx.into());
        }

        Ok(bundle)
    }




    async fn simulate_transaction(
        &self,
        tx: &TypedTransaction,
        chain: &str,
    ) -> Result<(U256, U256)> { // Returns (estimated_gas_used, estimated_profit)
        let provider = self.rpc_manager.get_provider(chain).await?;

        // Estimate gas usage
        let gas_used = provider.estimate_gas(tx).await
            .context("Failed to estimate gas for transaction")?;

        // For profit estimation, we would need to run a local EVM fork or a more sophisticated simulation
        // For now, we'll return a placeholder profit based on the opportunity's estimated profit
        // In a real scenario, this would involve replaying the transaction on a local fork
        // and analyzing the state changes.
        Ok((gas_used, U256::zero())) // Placeholder for profit
    }


} // Cierre de impl Executor

struct Bundle {
    transactions: Vec<TypedTransaction>,
    block_number: u64,
    min_timestamp: Option<u64>,
    max_timestamp: Option<u64>,
}
