use anyhow::{Result, Context};
use prometheus::{
    Encoder, TextEncoder, Counter, Gauge, Histogram, HistogramOpts,
    register_counter, register_gauge, register_histogram,
};
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use tracing::{info, warn, error, debug};
use warp::Reply;

pub struct Monitoring {
    // Counters
    opportunities_found: Counter,
    opportunities_executed: Counter,
    transactions_sent: Counter,
    transactions_successful: Counter,
    transactions_failed: Counter,
    bundles_sent: Counter,
    validation_failures: Counter,
    reverted_transactions: Counter,
    
    // Gauges
    active_opportunities: Gauge,
    pending_executions: Gauge,
    total_profit_usd: Gauge,
    gas_price_gwei: HashMap<String, Gauge>,
    last_block_number: HashMap<String, Gauge>,
    
    // Histograms
    opportunity_profit_histogram: Histogram,
    execution_latency_histogram: Histogram,
    rpc_latency_histogram: Histogram,
    
    // Custom metrics
    strategy_metrics: Arc<RwLock<HashMap<String, StrategyMetrics>>>,
    chain_metrics: Arc<RwLock<HashMap<String, ChainMetrics>>>,
}

#[derive(Debug, Clone)]
pub struct StrategyMetrics {
    pub opportunities_found: u64,
    pub opportunities_executed: u64,
    pub success_rate: f64,
    pub total_profit_usd: f64,
    pub average_profit_usd: f64,
}

#[derive(Debug, Clone)]
pub struct ChainMetrics {
    pub last_scanned_block: u64,
    pub transactions_processed: u64,
    pub opportunities_found: u64,
    pub average_gas_price: f64,
    pub is_healthy: bool,
}

impl Monitoring {
    pub fn new() -> Self {
        // Register Prometheus metrics
        let opportunities_found = register_counter!(
            "mev_opportunities_found_total",
            "Total number of MEV opportunities found"
        ).expect("Failed to register opportunities_found counter");
        
        let opportunities_executed = register_counter!(
            "mev_opportunities_executed_total",
            "Total number of MEV opportunities executed"
        ).expect("Failed to register opportunities_executed counter");
        
        let transactions_sent = register_counter!(
            "mev_transactions_sent_total",
            "Total number of transactions sent"
        ).expect("Failed to register transactions_sent counter");
        
        let transactions_successful = register_counter!(
            "mev_transactions_successful_total",
            "Total number of successful transactions"
        ).expect("Failed to register transactions_successful counter");
        
        let transactions_failed = register_counter!(
            "mev_transactions_failed_total",
            "Total number of failed transactions"
        ).expect("Failed to register transactions_failed counter");
        
        let bundles_sent = register_counter!(
            "mev_bundles_sent_total",
            "Total number of bundles sent to relays"
        ).expect("Failed to register bundles_sent counter");
        
        let validation_failures = register_counter!(
            "mev_validation_failures_total",
            "Total number of validation failures"
        ).expect("Failed to register validation_failures counter");
        
        let reverted_transactions = register_counter!(
            "mev_reverted_transactions_total",
            "Total number of reverted transactions"
        ).expect("Failed to register reverted_transactions counter");
        
        let active_opportunities = register_gauge!(
            "mev_active_opportunities",
            "Number of currently active opportunities"
        ).expect("Failed to register active_opportunities gauge");
        
        let pending_executions = register_gauge!(
            "mev_pending_executions",
            "Number of pending executions"
        ).expect("Failed to register pending_executions gauge");
        
        let total_profit_usd = register_gauge!(
            "mev_total_profit_usd",
            "Total profit in USD"
        ).expect("Failed to register total_profit_usd gauge");
        
        let opportunity_profit_histogram = register_histogram!(
            HistogramOpts::new(
                "mev_opportunity_profit_usd",
                "Distribution of opportunity profits in USD"
            )
            .buckets(vec![1.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0])
        ).expect("Failed to register opportunity_profit_histogram");
        
        let execution_latency_histogram = register_histogram!(
            HistogramOpts::new(
                "mev_execution_latency_ms",
                "Execution latency in milliseconds"
            )
            .buckets(vec![10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0])
        ).expect("Failed to register execution_latency_histogram");
        
        let rpc_latency_histogram = register_histogram!(
            HistogramOpts::new(
                "mev_rpc_latency_ms",
                "RPC call latency in milliseconds"
            )
            .buckets(vec![5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0])
        ).expect("Failed to register rpc_latency_histogram");
        
        // Initialize chain-specific gauges
        let mut gas_price_gwei = HashMap::new();
        let mut last_block_number = HashMap::new();
        
        for chain in &["ethereum", "arbitrum", "optimism", "polygon", "base", "bsc"] {
            gas_price_gwei.insert(
                chain.to_string(),
                register_gauge!(
                    format!("mev_gas_price_gwei_{}", chain),
                    format!("Current gas price in Gwei for {}", chain)
                ).expect("Failed to register gas price gauge")
            );
            
            last_block_number.insert(
                chain.to_string(),
                register_gauge!(
                    format!("mev_last_block_{}", chain),
                    format!("Last scanned block number for {}", chain)
                ).expect("Failed to register block number gauge")
            );
        }
        
        Monitoring {
            opportunities_found,
            opportunities_executed,
            transactions_sent,
            transactions_successful,
            transactions_failed,
            bundles_sent,
            validation_failures,
            reverted_transactions,
            active_opportunities,
            pending_executions,
            total_profit_usd,
            gas_price_gwei,
            last_block_number,
            opportunity_profit_histogram,
            execution_latency_histogram,
            rpc_latency_histogram,
            strategy_metrics: Arc::new(RwLock::new(HashMap::new())),
            chain_metrics: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    // Counter methods
    pub fn increment_opportunities_found(&self) {
        self.opportunities_found.inc();
    }
    
    pub fn increment_opportunities_executed(&self) {
        self.opportunities_executed.inc();
    }
    
    pub fn increment_transactions_sent(&self) {
        self.transactions_sent.inc();
    }
    
    pub fn increment_transactions_successful(&self) {
        self.transactions_successful.inc();
    }
    
    pub fn increment_transactions_failed(&self) {
        self.transactions_failed.inc();
    }
    
    pub fn increment_bundles_sent(&self) {
        self.bundles_sent.inc();
    }

    pub fn increment_validation_failures(&self) {
        self.validation_failures.inc();
    }

    pub fn increment_reverted_transactions(&self) {
        self.reverted_transactions.inc();
    }
    
    // Gauge methods
    pub fn set_active_opportunities(&self, count: f64) {
        self.active_opportunities.set(count);
    }
    
    pub fn set_pending_executions(&self, count: f64) {
        self.pending_executions.set(count);
    }
    
    pub fn add_profit(&self, profit_usd: f64) {
        self.total_profit_usd.add(profit_usd);
    }
    
    pub fn set_gas_price(&self, chain: &str, price_gwei: f64) {
        if let Some(gauge) = self.gas_price_gwei.get(chain) {
            gauge.set(price_gwei);
        }
    }
    
    pub fn set_last_scanned_block(&self, chain: &str, block_number: u64) {
        if let Some(gauge) = self.last_block_number.get(chain) {
            gauge.set(block_number as f64);
        }
        
        // Update chain metrics
        let mut metrics = self.chain_metrics.write();
        metrics.entry(chain.to_string())
            .and_modify(|m| m.last_scanned_block = block_number)
            .or_insert_with(|| ChainMetrics {
                last_scanned_block: block_number,
                transactions_processed: 0,
                opportunities_found: 0,
                average_gas_price: 0.0,
                is_healthy: true,
            });
    }
    
    // Histogram methods
    pub fn record_opportunity_profit(&self, profit_usd: f64) {
        self.opportunity_profit_histogram.observe(profit_usd);
    }
    
    pub fn record_execution_latency(&self, latency_ms: f64) {
        self.execution_latency_histogram.observe(latency_ms);
    }
    
    pub fn record_rpc_latency(&self, latency_ms: f64) {
        self.rpc_latency_histogram.observe(latency_ms);
    }
    
    // Strategy metrics
    pub fn process_opportunity(&self, strategy: &str) {
        let mut metrics = self.strategy_metrics.write();
        metrics.entry(strategy.to_string())
            .and_modify(|m| m.opportunities_found += 1)
            .or_insert_with(|| StrategyMetrics {
                opportunities_found: 1,
                opportunities_executed: 0,
                success_rate: 0.0,
                total_profit_usd: 0.0,
                average_profit_usd: 0.0,
            });
    }
    
    pub fn record_execution(&self, strategy: &str, success: bool, profit_usd: Option<f64>) {
        let mut metrics = self.strategy_metrics.write();
        
        metrics.entry(strategy.to_string())
            .and_modify(|m| {
                m.opportunities_executed += 1;
                if success {
                    if let Some(profit) = profit_usd {
                        m.total_profit_usd += profit;
                        m.average_profit_usd = m.total_profit_usd / m.opportunities_executed as f64;
                    }
                }
                let successful = if success { 
                    m.opportunities_executed - 1 + 1 
                } else { 
                    m.opportunities_executed - 1 
                };
                m.success_rate = successful as f64 / m.opportunities_executed as f64;
            })
            .or_insert_with(|| StrategyMetrics {
                opportunities_found: 0,
                opportunities_executed: 1,
                success_rate: if success { 1.0 } else { 0.0 },
                total_profit_usd: profit_usd.unwrap_or(0.0),
                average_profit_usd: profit_usd.unwrap_or(0.0),
            });
    }
    
    // Chain metrics
    pub fn process_chain_transaction(&self, chain: &str) {
        let mut metrics = self.chain_metrics.write();
        metrics.entry(chain.to_string())
            .and_modify(|m| m.transactions_processed += 1)
            .or_insert_with(|| ChainMetrics {
                last_scanned_block: 0,
                transactions_processed: 1,
                opportunities_found: 0,
                average_gas_price: 0.0,
                is_healthy: true,
            });
    }
    
    pub fn set_chain_health(&self, chain: &str, is_healthy: bool) {
        let mut metrics = self.chain_metrics.write();
        metrics.entry(chain.to_string())
            .and_modify(|m| m.is_healthy = is_healthy)
            .or_insert_with(|| ChainMetrics {
                last_scanned_block: 0,
                transactions_processed: 0,
                opportunities_found: 0,
                average_gas_price: 0.0,
                is_healthy,
            });
    }
    
    // Export metrics for Prometheus
    pub fn export_metrics(&self) -> impl Reply {
        let encoder = TextEncoder::new();
        let metric_families = prometheus::gather();
        let mut buffer = Vec::new();
        
        encoder.encode(&metric_families, &mut buffer)
            .expect("Failed to encode metrics");
        
        // Add custom metrics
        let strategy_metrics = self.strategy_metrics.read();
        let chain_metrics = self.chain_metrics.read();
        
        // Format custom metrics as Prometheus text format
        let mut custom_metrics = String::new();
        
        // Strategy metrics
        for (strategy, metrics) in strategy_metrics.iter() {
            custom_metrics.push_str(&format!(
                "# TYPE mev_strategy_opportunities_found gauge\n\
                mev_strategy_opportunities_found{{strategy=\"{}\"}} {}\n",
                strategy, metrics.opportunities_found
            ));
            custom_metrics.push_str(&format!(
                "# TYPE mev_strategy_success_rate gauge\n\
                mev_strategy_success_rate{{strategy=\"{}\"}} {}\n",
                strategy, metrics.success_rate
            ));
            custom_metrics.push_str(&format!(
                "# TYPE mev_strategy_total_profit_usd gauge\n\
                mev_strategy_total_profit_usd{{strategy=\"{}\"}} {}\n",
                strategy, metrics.total_profit_usd
            ));
        }
        
        // Chain metrics
        for (chain, metrics) in chain_metrics.iter() {
            custom_metrics.push_str(&format!(
                "# TYPE mev_chain_transactions_processed counter\n\
                mev_chain_transactions_processed{{chain=\"{}\"}} {}\n",
                chain, metrics.transactions_processed
            ));
            custom_metrics.push_str(&format!(
                "# TYPE mev_chain_is_healthy gauge\n\
                mev_chain_is_healthy{{chain=\"{}\"}} {}\n",
                chain, if metrics.is_healthy { 1 } else { 0 }
            ));
        }
        
        buffer.extend_from_slice(custom_metrics.as_bytes());
        
        warp::reply::with_header(
            buffer,
            "Content-Type",
            "text/plain; version=0.0.4"
        )
    }
    
    // Get summary metrics for API
    pub fn get_summary(&self) -> MetricsSummary {
        let strategy_metrics = self.strategy_metrics.read();
        let chain_metrics = self.chain_metrics.read();
        
        MetricsSummary {
            total_opportunities_found: self.opportunities_found.get() as u64,
            total_opportunities_executed: self.opportunities_executed.get() as u64,
            total_transactions_sent: self.transactions_sent.get() as u64,
            total_transactions_successful: self.transactions_successful.get() as u64,
            total_transactions_failed: self.transactions_failed.get() as u64,
            total_bundles_sent: self.bundles_sent.get() as u64,
            total_profit_usd: self.total_profit_usd.get(),
            active_opportunities: self.active_opportunities.get() as u64,
            pending_executions: self.pending_executions.get() as u64,
            strategy_metrics: strategy_metrics.clone().into_iter().collect(),
            chain_metrics: chain_metrics.clone().into_iter().collect(),
        }
    }
}

impl Clone for Monitoring {
    fn clone(&self) -> Self {
        Monitoring {
            opportunities_found: self.opportunities_found.clone(),
            opportunities_executed: self.opportunities_executed.clone(),
            transactions_sent: self.transactions_sent.clone(),
            transactions_successful: self.transactions_successful.clone(),
            transactions_failed: self.transactions_failed.clone(),
            bundles_sent: self.bundles_sent.clone(),
            active_opportunities: self.active_opportunities.clone(),
            pending_executions: self.pending_executions.clone(),
            total_profit_usd: self.total_profit_usd.clone(),
            gas_price_gwei: self.gas_price_gwei.clone(),
            last_block_number: self.last_block_number.clone(),
            opportunity_profit_histogram: self.opportunity_profit_histogram.clone(),
            execution_latency_histogram: self.execution_latency_histogram.clone(),
            rpc_latency_histogram: self.rpc_latency_histogram.clone(),
            strategy_metrics: self.strategy_metrics.clone(),
            chain_metrics: self.chain_metrics.clone(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MetricsSummary {
    pub total_opportunities_found: u64,
    pub total_opportunities_executed: u64,
    pub total_transactions_sent: u64,
    pub total_transactions_successful: u64,
    pub total_transactions_failed: u64,
    pub total_bundles_sent: u64,
    pub total_profit_usd: f64,
    pub active_opportunities: u64,
    pub pending_executions: u64,
    pub strategy_metrics: Vec<(String, StrategyMetrics)>,
    pub chain_metrics: Vec<(String, ChainMetrics)>,
}