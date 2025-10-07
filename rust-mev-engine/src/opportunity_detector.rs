use anyhow::Result;
use priority_queue::PriorityQueue;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use tokio::time::{self, Duration};
use tracing::{info, error, debug};

use crate::config::Config;
use crate::database::{Database, Opportunity};
use crate::monitoring::Monitoring;

#[derive(Debug, Clone)]
pub struct OpportunityScore {
    pub opportunity_id: String,
    pub total_score: f64,
    pub profit_score: f64,
    pub risk_score: f64,
    pub gas_efficiency_score: f64,
    pub timing_score: f64,
}

impl PartialEq for OpportunityScore {
    fn eq(&self, other: &Self) -> bool {
        self.opportunity_id == other.opportunity_id
    }
}

impl Eq for OpportunityScore {}

impl Ord for OpportunityScore {
    fn cmp(&self, other: &Self) -> Ordering {
        self.total_score.partial_cmp(&other.total_score).unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for OpportunityScore {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct OpportunityDetector {
    db: Arc<Database>,
    monitoring: Arc<Monitoring>,
    config: Arc<RwLock<Config>>,
    priority_queue: Arc<Mutex<PriorityQueue<String, i32>>>,
    opportunity_scores: Arc<RwLock<HashMap<String, OpportunityScore>>>,
}

impl OpportunityDetector {
    pub fn new(
        db: Arc<Database>,
        monitoring: Arc<Monitoring>,
        config: Arc<RwLock<Config>>,
    ) -> Self {
        OpportunityDetector {
            db,
            monitoring,
            config,
            priority_queue: Arc::new(Mutex::new(PriorityQueue::new())),
            opportunity_scores: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn run(&self) -> Result<()> {
        info!("Starting Opportunity Detector");
        
        let mut interval = time::interval(Duration::from_millis(100));
        
        loop {
            interval.tick().await;
            
            // Process new opportunities from database
            if let Err(e) = self.process_opportunities().await {
                error!("Error processing opportunities: {}", e);
            }
            
            // Execute top opportunities
            if let Err(e) = self.execute_top_opportunities().await {
                error!("Error executing opportunities: {}", e);
            }
        }
    }

    async fn process_opportunities(&self) -> Result<()> {
        // Fetch recent opportunities from database
        let opportunities = self.db.get_recent_opportunities(1000).await?;
        
        for opp in opportunities {
            // Calculate scores
            let score = self.calculate_opportunity_score(&opp).await?;
            
            // Add to priority queue
            let priority = (score.total_score * 1000.0) as i32;
            
            let mut queue = self.priority_queue.lock().await;
            queue.push(opp.id.clone(), priority);
            
            // Store score details
            let mut scores = self.opportunity_scores.write().await;
            scores.insert(opp.id.clone(), score);
            
            // Update metrics
            self.monitoring.process_opportunity(&opp.strategy);
        }
        
        Ok(())
    }

    async fn calculate_opportunity_score(&self, opp: &Opportunity) -> Result<OpportunityScore> {
        let config = self.config.read().await;
        
        // Calculate profit score (0-100)
        let profit_score = self.calculate_profit_score(opp, &config);
        
        // Calculate risk score (0-100)
        let risk_score = self.calculate_risk_score(opp, &config);
        
        // Calculate gas efficiency score (0-100)
        let gas_efficiency_score = self.calculate_gas_efficiency_score(opp);
        
        // Calculate timing score (0-100)
        let timing_score = self.calculate_timing_score(opp);
        
        // Calculate total weighted score
        let total_score = 
            profit_score * 0.4 +
            risk_score * 0.3 +
            gas_efficiency_score * 0.2 +
            timing_score * 0.1;
        
        Ok(OpportunityScore {
            opportunity_id: opp.id.clone(),
            total_score,
            profit_score,
            risk_score,
            gas_efficiency_score,
            timing_score,
        })
    }

    fn calculate_profit_score(&self, opp: &Opportunity, config: &Config) -> f64 {
        // Base score on profit vs minimum threshold
        let min_profit = match opp.strategy.as_str() {
            "dex-arb" => config.strategies.dex_arb.min_roi * 1000.0,
            "flash-loan-arb" => config.strategies.flash_loan_arb.min_roi * 1000.0,
            "triangular-arb" => config.strategies.triangular_arb.min_roi * 1000.0,
            "cross-chain-arb" => config.strategies.cross_chain_arb.min_roi * 1000.0,
            "liquidation" => config.strategies.liquidation.min_roi * 1000.0,
            "sandwich" => 50.0,
            "backrun" => config.strategies.backrun.min_roi * 1000.0,
            "jit-liquidity" => config.strategies.jit_liquidity.min_roi * 1000.0,
            "cex-dex-arb" => config.strategies.cex_dex_arb.min_roi * 1000.0,
            "nft-arb" => config.strategies.nft_arb.min_roi * 1000.0,
            "mev-share" => config.strategies.mev_share.min_roi * 1000.0,
            "atomic-arb" => config.strategies.atomic_arb.min_roi * 1000.0,
            "statistical-arb" => config.strategies.statistical_arb.min_roi * 1000.0,
            _ => 10.0,
        };
        
        let net_profit = opp.est_profit_usd - opp.gas_usd;
        
        if net_profit <= 0.0 {
            return 0.0;
        }
        
        // Score from 0-100 based on profit multiple
        let profit_multiple = net_profit / min_profit;
        (profit_multiple.min(5.0) * 20.0).min(100.0)
    }

    fn calculate_risk_score(&self, opp: &Opportunity, config: &Config) -> f64 {
        let mut risk_score: f64 = 100.0;
        
        // Deduct points for high gas costs
        if opp.gas_usd > 100.0 {
            risk_score -= 20.0;
        } else if opp.gas_usd > 50.0 {
            risk_score -= 10.0;
        }
        
        // Deduct points for certain strategies
        match opp.strategy.as_str() {
            "sandwich" => risk_score -= 30.0, // High risk, ethically questionable
            "cross-chain-arb" => risk_score -= 20.0, // Bridge risk
            "liquidation" => risk_score -= 15.0, // Competition risk
            "nft-arb" => risk_score -= 25.0, // Illiquidity risk
            _ => {}
        }
        
        // Check if tokens are whitelisted
        if config.risk.whitelisted_tokens.contains(&opp.base_token) {
            risk_score += 10.0;
        }
        if config.risk.whitelisted_tokens.contains(&opp.quote_token) {
            risk_score += 10.0;
        }
        
        // Check if tokens are blacklisted
        if config.risk.blacklisted_tokens.contains(&opp.base_token) ||
           config.risk.blacklisted_tokens.contains(&opp.quote_token) {
            return 0.0; // No risk score for blacklisted tokens
        }
        
        risk_score.max(0.0).min(100.0)
    }

    fn calculate_gas_efficiency_score(&self, opp: &Opportunity) -> f64 {
        let profit_to_gas_ratio = opp.est_profit_usd / opp.gas_usd.max(1.0);
        
        // Score based on profit to gas ratio
        if profit_to_gas_ratio > 10.0 {
            100.0
        } else if profit_to_gas_ratio > 5.0 {
            80.0
        } else if profit_to_gas_ratio > 3.0 {
            60.0
        } else if profit_to_gas_ratio > 2.0 {
            40.0
        } else if profit_to_gas_ratio > 1.5 {
            20.0
        } else {
            0.0
        }
    }

    fn calculate_timing_score(&self, opp: &Opportunity) -> f64 {
        // Calculate age of opportunity in milliseconds
        let now = chrono::Utc::now().timestamp_millis();
        let age_ms = now - opp.ts;
        
        // Opportunities lose value over time
        if age_ms < 100 {
            100.0 // Very fresh
        } else if age_ms < 500 {
            80.0
        } else if age_ms < 1000 {
            60.0
        } else if age_ms < 5000 {
            40.0
        } else if age_ms < 10000 {
            20.0
        } else {
            0.0 // Too old
        }
    }

    async fn execute_top_opportunities(&self) -> Result<()> {
        let mut queue = self.priority_queue.lock().await;
        let config = self.config.read().await;
        let max_concurrent = config.execution.max_concurrent_trades as usize;
        drop(config);
        
        let mut executed_count = 0;
        
        while executed_count < max_concurrent {
            if let Some((opportunity_id, priority)) = queue.pop() {
                if priority <= 0 {
                    break; // No profitable opportunities
                }
                
                debug!("Executing opportunity {} with priority {}", opportunity_id, priority);
                
                // Mark as pending execution in database
                if let Err(e) = self.db.mark_opportunity_pending(&opportunity_id).await {
                    error!("Failed to mark opportunity as pending: {}", e);
                    continue;
                }
                
                executed_count += 1;
                
                // Update metrics
                self.monitoring.increment_opportunities_executed();
            } else {
                break; // No more opportunities
            }
        }
        
        Ok(())
    }

    pub async fn get_top_opportunities(&self, limit: usize) -> Result<Vec<OpportunityScore>> {
        let queue = self.priority_queue.lock().await;
        let scores = self.opportunity_scores.read().await;
        
        let mut top_opportunities = Vec::new();
        
        for (opp_id, _) in queue.iter().take(limit) {
            if let Some(score) = scores.get(opp_id) {
                top_opportunities.push(score.clone());
            }
        }
        
        Ok(top_opportunities)
    }

    pub async fn calculate_slippage_adjusted_profit(
        &self,
        opp: &Opportunity,
        slippage: f64,
    ) -> f64 {
        let adjusted_profit = opp.est_profit_usd * (1.0 - slippage);
        adjusted_profit - opp.gas_usd
    }

    pub async fn assess_execution_risk(&self, opp: &Opportunity) -> ExecutionRisk {
        let config = self.config.read().await;
        
        // Check various risk factors
        let mut risk_factors = Vec::new();
        let mut risk_level = RiskLevel::Low;
        
        // Gas price risk
        if opp.gas_usd > 100.0 {
            risk_factors.push("High gas cost".to_string());
            risk_level = RiskLevel::Medium;
        }
        
        // Token safety risk
        if !config.risk.whitelisted_tokens.contains(&opp.base_token) {
            risk_factors.push("Non-whitelisted base token".to_string());
            risk_level = risk_level.max(RiskLevel::Medium);
        }
        
        // Strategy-specific risks
        match opp.strategy.as_str() {
            "sandwich" => {
                risk_factors.push("Sandwich attack - high competition".to_string());
                risk_level = RiskLevel::High;
            }
            "cross-chain-arb" => {
                risk_factors.push("Cross-chain bridge risk".to_string());
                risk_level = risk_level.max(RiskLevel::Medium);
            }
            "liquidation" => {
                risk_factors.push("Liquidation competition risk".to_string());
                risk_level = risk_level.max(RiskLevel::Medium);
            }
            _ => {}
        }
        
        // Slippage risk
        let expected_slippage = self.estimate_slippage(opp).await;
        if expected_slippage > 0.02 {
            risk_factors.push(format!("High expected slippage: {:.1}%", expected_slippage * 100.0));
            risk_level = risk_level.max(RiskLevel::Medium);
        }
        
        let risk_level_clone = risk_level.clone();
        ExecutionRisk {
            level: risk_level,
            factors: risk_factors,
            recommended_action: match risk_level_clone {
                RiskLevel::Low => "Execute with standard parameters".to_string(),
                RiskLevel::Medium => "Execute with increased slippage tolerance".to_string(),
                RiskLevel::High => "Consider skipping or use minimal position size".to_string(),
            },
        }
    }

    async fn estimate_slippage(&self, opp: &Opportunity) -> f64 {
        // Simplified slippage estimation based on opportunity type and size
        match opp.strategy.as_str() {
            "dex-arb" => 0.005,
            "flash-loan-arb" => 0.008,
            "triangular-arb" => 0.01,
            "cross-chain-arb" => 0.015,
            "liquidation" => 0.02,
            "sandwich" => 0.003,
            "backrun" => 0.005,
            "jit-liquidity" => 0.008,
            _ => 0.01,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExecutionRisk {
    pub level: RiskLevel,
    pub factors: Vec<String>,
    pub recommended_action: String,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}