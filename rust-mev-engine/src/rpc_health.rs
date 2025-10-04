use anyhow::{Result, Context};
use ethers::providers::{Provider, Ws, Middleware};
use ethers::types::{BlockNumber, U256};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tracing::{info, warn, error, debug};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Quarantined,
}

#[derive(Debug, Clone)]
pub struct HealthMetrics {
    pub success: bool,
    pub latency_ms: Option<f64>,
    pub block_height: Option<u64>,
    pub error: Option<String>,
    pub check_type: HealthCheckType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthCheckType {
    BlockNumber,
    NetVersion,
    BlockByNumber,
}

#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    failure_count: u32,
    success_count: u32,
    state: CircuitState,
    last_state_change: Instant,
    failure_threshold: u32,
    success_threshold: u32,
    timeout: Duration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

impl CircuitBreaker {
    pub fn new() -> Self {
        Self {
            failure_count: 0,
            success_count: 0,
            state: CircuitState::Closed,
            last_state_change: Instant::now(),
            failure_threshold: 5,
            success_threshold: 3,
            timeout: Duration::from_secs(60),
        }
    }

    pub fn record_success(&mut self) {
        match self.state {
            CircuitState::HalfOpen => {
                self.success_count += 1;
                if self.success_count >= self.success_threshold {
                    self.state = CircuitState::Closed;
                    self.failure_count = 0;
                    self.success_count = 0;
                    self.last_state_change = Instant::now();
                    debug!("Circuit breaker closed after successful recovery");
                }
            }
            CircuitState::Closed => {
                self.failure_count = 0;
            }
            CircuitState::Open => {}
        }
    }

    pub fn record_failure(&mut self) {
        match self.state {
            CircuitState::Closed => {
                self.failure_count += 1;
                if self.failure_count >= self.failure_threshold {
                    self.state = CircuitState::Open;
                    self.last_state_change = Instant::now();
                    warn!("Circuit breaker opened after {} failures", self.failure_count);
                }
            }
            CircuitState::HalfOpen => {
                self.state = CircuitState::Open;
                self.success_count = 0;
                self.last_state_change = Instant::now();
                debug!("Circuit breaker re-opened after failure in half-open state");
            }
            CircuitState::Open => {}
        }
    }

    pub fn should_allow_request(&mut self) -> bool {
        match self.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                if self.last_state_change.elapsed() > self.timeout {
                    self.state = CircuitState::HalfOpen;
                    self.last_state_change = Instant::now();
                    debug!("Circuit breaker entering half-open state");
                    true
                } else {
                    false
                }
            }
            CircuitState::HalfOpen => true,
        }
    }

    pub fn is_open(&self) -> bool {
        self.state == CircuitState::Open
    }
}

pub struct HealthChecker {
    circuit_breakers: dashmap::DashMap<String, CircuitBreaker>,
}

impl HealthChecker {
    pub fn new() -> Self {
        Self {
            circuit_breakers: dashmap::DashMap::new(),
        }
    }

    pub async fn check_health(&self, provider: &Arc<Provider<Ws>>) -> HealthMetrics {
        let provider_id = format!("{:p}", provider.as_ref());
        
        // Get or create circuit breaker for this provider
        let mut breaker_entry = self.circuit_breakers.entry(provider_id.clone()).or_insert_with(CircuitBreaker::new);
        
        if !breaker_entry.should_allow_request() {
            return HealthMetrics {
                success: false,
                latency_ms: None,
                block_height: None,
                error: Some("Circuit breaker is open".to_string()),
                check_type: HealthCheckType::BlockNumber,
            };
        }

        // Perform multiple health checks
        let checks = vec![
            self.check_block_number(provider).await,
            self.check_net_version(provider).await,
            self.check_block_by_number(provider).await,
        ];

        // Aggregate results
        let mut total_latency = 0.0;
        let mut successful_checks = 0;
        let mut latest_block = None;
        let mut errors = Vec::new();

        for check in checks {
            if check.success {
                successful_checks += 1;
                if let Some(latency) = check.latency_ms {
                    total_latency += latency;
                }
                if let Some(height) = check.block_height {
                    latest_block = Some(height);
                }
            } else if let Some(error) = check.error {
                errors.push(error);
            }
        }

        let success = successful_checks >= 2; // Require at least 2 successful checks
        let avg_latency = if successful_checks > 0 {
            Some(total_latency / successful_checks as f64)
        } else {
            None
        };

        // Update circuit breaker
        if success {
            breaker_entry.record_success();
        } else {
            breaker_entry.record_failure();
        }

        HealthMetrics {
            success,
            latency_ms: avg_latency,
            block_height: latest_block,
            error: if errors.is_empty() { None } else { Some(errors.join("; ")) },
            check_type: HealthCheckType::BlockNumber,
        }
    }

    async fn check_block_number(&self, provider: &Arc<Provider<Ws>>) -> HealthMetrics {
        let start = Instant::now();
        
        match provider.get_block_number().await {
            Ok(block_number) => {
                let latency_ms = start.elapsed().as_millis() as f64;
                HealthMetrics {
                    success: true,
                    latency_ms: Some(latency_ms),
                    block_height: Some(block_number.as_u64()),
                    error: None,
                    check_type: HealthCheckType::BlockNumber,
                }
            }
            Err(e) => {
                HealthMetrics {
                    success: false,
                    latency_ms: None,
                    block_height: None,
                    error: Some(format!("Failed to get block number: {}", e)),
                    check_type: HealthCheckType::BlockNumber,
                }
            }
        }
    }

    async fn check_net_version(&self, provider: &Arc<Provider<Ws>>) -> HealthMetrics {
        let start = Instant::now();
        
        match provider.get_net_version().await {
            Ok(_version) => {
                let latency_ms = start.elapsed().as_millis() as f64;
                HealthMetrics {
                    success: true,
                    latency_ms: Some(latency_ms),
                    block_height: None,
                    error: None,
                    check_type: HealthCheckType::NetVersion,
                }
            }
            Err(e) => {
                HealthMetrics {
                    success: false,
                    latency_ms: None,
                    block_height: None,
                    error: Some(format!("Failed to get net version: {}", e)),
                    check_type: HealthCheckType::NetVersion,
                }
            }
        }
    }

    async fn check_block_by_number(&self, provider: &Arc<Provider<Ws>>) -> HealthMetrics {
        let start = Instant::now();
        
        match provider.get_block(BlockNumber::Latest).await {
            Ok(Some(block)) => {
                let latency_ms = start.elapsed().as_millis() as f64;
                let block_height = block.number.map(|n| n.as_u64());
                
                HealthMetrics {
                    success: true,
                    latency_ms: Some(latency_ms),
                    block_height,
                    error: None,
                    check_type: HealthCheckType::BlockByNumber,
                }
            }
            Ok(None) => {
                HealthMetrics {
                    success: false,
                    latency_ms: None,
                    block_height: None,
                    error: Some("Block not found".to_string()),
                    check_type: HealthCheckType::BlockByNumber,
                }
            }
            Err(e) => {
                HealthMetrics {
                    success: false,
                    latency_ms: None,
                    block_height: None,
                    error: Some(format!("Failed to get block: {}", e)),
                    check_type: HealthCheckType::BlockByNumber,
                }
            }
        }
    }

    pub async fn check_quorum<T, F, Fut>(
        &self,
        providers: Vec<Arc<Provider<Ws>>>,
        operation: F,
    ) -> Result<T>
    where
        F: Fn(Arc<Provider<Ws>>) -> Fut + Clone,
        Fut: std::future::Future<Output = Result<T>>,
        T: PartialEq + Clone,
    {
        if providers.is_empty() {
            anyhow::bail!("No providers available for quorum check");
        }

        let required_agreements = (providers.len() * 2 + 2) / 3; // 2/3 quorum
        let mut results = Vec::new();

        // Execute operation on all providers
        for provider in providers {
            let op = operation.clone();
            let result = op(provider).await;
            results.push(result);
        }

        // Count successful responses and find consensus
        let mut response_counts: std::collections::HashMap<String, (usize, T)> = std::collections::HashMap::new();
        
        for result in results {
            if let Ok(value) = result {
                let key = format!("{:?}", &value);
                if let Some((count, _)) = response_counts.get_mut(&key) {
                    *count += 1;
                } else {
                    response_counts.insert(key, (1, value));
                }
            }
        }

        // Find the response with most agreements
        let consensus = response_counts
            .into_iter()
            .max_by_key(|(_, (count, _))| *count)
            .map(|(_, (count, value))| (count, value));

        match consensus {
            Some((count, value)) if count >= required_agreements => Ok(value),
            Some((count, _)) => {
                anyhow::bail!(
                    "Insufficient quorum: {} agreements out of {} required",
                    count,
                    required_agreements
                )
            }
            None => anyhow::bail!("No successful responses from providers"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LatencyHistogram {
    buckets: Vec<f64>,
    counts: Vec<usize>,
}

impl LatencyHistogram {
    pub fn new() -> Self {
        Self {
            buckets: vec![10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0],
            counts: vec![0; 9],
        }
    }

    pub fn record(&mut self, latency_ms: f64) {
        for (i, &bucket) in self.buckets.iter().enumerate() {
            if latency_ms <= bucket {
                self.counts[i] += 1;
                return;
            }
        }
        // If latency is higher than all buckets, count in the last one
        if !self.counts.is_empty() {
            let last_idx = self.counts.len() - 1;
            self.counts[last_idx] += 1;
        }
    }

    pub fn get_percentile(&self, percentile: f64) -> f64 {
        let total: usize = self.counts.iter().sum();
        if total == 0 {
            return 0.0;
        }

        let target = (total as f64 * percentile / 100.0) as usize;
        let mut cumulative = 0;

        for (i, &count) in self.counts.iter().enumerate() {
            cumulative += count;
            if cumulative >= target {
                return self.buckets[i];
            }
        }

        self.buckets.last().copied().unwrap_or(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker() {
        let mut breaker = CircuitBreaker::new();
        
        // Initially closed
        assert!(breaker.should_allow_request());
        
        // Record failures to open the circuit
        for _ in 0..5 {
            breaker.record_failure();
        }
        assert!(!breaker.should_allow_request());
        assert!(breaker.is_open());
        
        // After timeout, should enter half-open
        breaker.last_state_change = Instant::now() - Duration::from_secs(61);
        assert!(breaker.should_allow_request());
        
        // Successful requests in half-open should close the circuit
        for _ in 0..3 {
            breaker.record_success();
        }
        assert!(breaker.should_allow_request());
        assert!(!breaker.is_open());
    }

    #[test]
    fn test_latency_histogram() {
        let mut hist = LatencyHistogram::new();
        
        hist.record(5.0);
        hist.record(15.0);
        hist.record(30.0);
        hist.record(75.0);
        hist.record(150.0);
        
        // Test percentiles
        let p50 = hist.get_percentile(50.0);
        assert!(p50 <= 50.0 && p50 >= 25.0);
        
        let p95 = hist.get_percentile(95.0);
        assert!(p95 <= 250.0 && p95 >= 100.0);
    }
}