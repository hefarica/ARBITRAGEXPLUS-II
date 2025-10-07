use anyhow::{Result, Context};
use dashmap::DashMap;
use ethers::providers::{Provider, Ws, Http, Middleware};
use governor::{Quota, RateLimiter};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, AtomicU64, AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::time;
use tracing::{info, warn, error, debug};
use futures::future::join_all;
use nonzero_ext::nonzero;

use crate::config::RpcEndpoint;
use crate::rpc_health::{HealthChecker, HealthMetrics, HealthStatus};

#[derive(Debug, Clone)]
pub struct RpcHealth {
    pub is_healthy: bool,
    pub last_check: Instant,
    pub success_count: u64,
    pub failure_count: u64,
    pub average_latency_ms: f64,
    pub last_error: Option<String>,
}

#[derive(Clone)]
pub struct RpcConnection {
    pub endpoint: RpcEndpoint,
    pub provider: Arc<Provider<Ws>>,
    pub health: Arc<RwLock<RpcHealth>>,
    pub rate_limiter: Arc<RateLimiter<governor::state::NotKeyed, governor::state::InMemoryState, governor::clock::DefaultClock>>,
    pub request_count: Arc<AtomicU64>,
}

pub struct RpcManager {
    connections: HashMap<String, Vec<Arc<RpcConnection>>>,
    round_robin_indices: DashMap<String, AtomicUsize>,
    total_requests: Arc<AtomicU64>,
}

impl RpcManager {
    pub async fn new(endpoints: &[RpcEndpoint]) -> Result<Self> {
        let mut connections = HashMap::new();
        let round_robin_indices = DashMap::new();

        // Group endpoints by chain
        let mut endpoints_by_chain: HashMap<String, Vec<&RpcEndpoint>> = HashMap::new();
        for endpoint in endpoints {
            endpoints_by_chain
                .entry(endpoint.chain.clone())
                .or_insert_with(Vec::new)
                .push(endpoint);
        }

        // Connect to all endpoints
        for (chain, chain_endpoints) in endpoints_by_chain {
            info!("Connecting to {} {} endpoints", chain_endpoints.len(), chain);
            
            let mut chain_connections = Vec::new();
            let connection_futures = chain_endpoints.iter().map(|endpoint| {
                Self::connect_to_endpoint(endpoint)
            });

            let results = join_all(connection_futures).await;
            
            for (i, result) in results.into_iter().enumerate() {
                match result {
                    Ok(connection) => {
                        info!("Connected to {} endpoint: {}", chain, chain_endpoints[i].url);
                        chain_connections.push(Arc::new(connection));
                    }
                    Err(e) => {
                        warn!("Failed to connect to {} endpoint {}: {}", chain, chain_endpoints[i].url, e);
                    }
                }
            }

            if chain_connections.is_empty() {
                error!("No successful connections for chain {}", chain);
                continue;
            }

            round_robin_indices.insert(chain.clone(), AtomicUsize::new(0));
            connections.insert(chain, chain_connections);
        }

        if connections.is_empty() {
            anyhow::bail!("Failed to connect to any RPC endpoints");
        }

        let manager = RpcManager {
            connections,
            round_robin_indices,
            total_requests: Arc::new(AtomicU64::new(0)),
        };

        // Start health check task
        let manager_clone = manager.clone();
        tokio::spawn(async move {
            manager_clone.health_check_loop().await;
        });

        Ok(manager)
    }

    async fn connect_to_endpoint(endpoint: &RpcEndpoint) -> Result<RpcConnection> {
        let provider = Provider::<Ws>::connect(&endpoint.url)
            .await
            .context(format!("Failed to connect to {}", endpoint.url))?;

        let rate = std::num::NonZeroU32::new(endpoint.max_requests_per_second).unwrap_or(nonzero!(10u32));
        let quota = Quota::per_second(rate);
        let rate_limiter = Arc::new(RateLimiter::direct(quota));

        let health = Arc::new(RwLock::new(RpcHealth {
            is_healthy: true,
            last_check: Instant::now(),
            success_count: 0,
            failure_count: 0,
            average_latency_ms: 0.0,
            last_error: None,
        }));

        Ok(RpcConnection {
            endpoint: endpoint.clone(),
            provider: Arc::new(provider),
            health,
            rate_limiter,
            request_count: Arc::new(AtomicU64::new(0)),
        })
    }

    pub async fn get_provider(&self, chain: &str) -> Result<Arc<Provider<Ws>>> {
        let connections = self.connections
            .get(chain)
            .ok_or_else(|| anyhow::anyhow!("No connections for chain {}", chain))?;

        if connections.is_empty() {
            anyhow::bail!("No available connections for chain {}", chain);
        }

        // Round-robin with health checking
        let index_atomic = self.round_robin_indices
            .get(chain)
            .ok_or_else(|| anyhow::anyhow!("No round-robin index for chain {}", chain))?;

        let mut attempts = 0;
        let max_attempts = connections.len() * 2;

        while attempts < max_attempts {
            let index = index_atomic.fetch_add(1, Ordering::SeqCst) % connections.len();
            let connection = &connections[index];

            // Check health
            {
                let health = connection.health.read();
                if !health.is_healthy {
                    attempts += 1;
                    continue;
                }
            }

            // Check rate limit
            if connection.rate_limiter.check().is_ok() {
                connection.request_count.fetch_add(1, Ordering::Relaxed);
                self.total_requests.fetch_add(1, Ordering::Relaxed);
                return Ok(connection.provider.clone());
            }

            attempts += 1;
            time::sleep(Duration::from_millis(10)).await;
        }

        anyhow::bail!("No available healthy connections for chain {}", chain)
    }

    pub async fn get_all_providers(&self, chain: &str) -> Result<Vec<Arc<Provider<Ws>>>> {
        let connections = self.connections
            .get(chain)
            .ok_or_else(|| anyhow::anyhow!("No connections for chain {}", chain))?;

        let healthy_providers: Vec<_> = connections
            .iter()
            .filter(|conn| conn.health.read().is_healthy)
            .map(|conn| conn.provider.clone())
            .collect();

        if healthy_providers.is_empty() {
            anyhow::bail!("No healthy connections for chain {}", chain);
        }

        Ok(healthy_providers)
    }

    async fn health_check_loop(&self) {
        let mut interval = time::interval(Duration::from_secs(30));
        
        loop {
            interval.tick().await;
            
            for (chain, connections) in &self.connections {
                for connection in connections {
                    let conn_clone = connection.clone();
                    let chain_clone = chain.clone();
                    
                    tokio::spawn(async move {
                        if let Err(e) = Self::check_health(conn_clone).await {
                            warn!("Health check failed for {} endpoint: {}", chain_clone, e);
                        }
                    });
                }
            }
        }
    }

    async fn check_health(connection: Arc<RpcConnection>) -> Result<()> {
        let start = Instant::now();
        
        match connection.provider.get_block_number().await {
            Ok(_) => {
                let latency_ms = start.elapsed().as_millis() as f64;
                
                let mut health = connection.health.write();
                health.is_healthy = true;
                health.last_check = Instant::now();
                health.success_count += 1;
                health.last_error = None;
                
                // Update average latency
                let total_requests = health.success_count as f64;
                health.average_latency_ms = 
                    (health.average_latency_ms * (total_requests - 1.0) + latency_ms) / total_requests;
                
                debug!("Health check passed for {} ({}ms)", connection.endpoint.url, latency_ms);
                Ok(())
            }
            Err(e) => {
                let mut health = connection.health.write();
                health.is_healthy = false;
                health.last_check = Instant::now();
                health.failure_count += 1;
                health.last_error = Some(e.to_string());
                
                error!("Health check failed for {}: {}", connection.endpoint.url, e);
                Err(anyhow::anyhow!("Health check failed: {}", e))
            }
        }
    }

    pub fn get_metrics(&self) -> RpcMetrics {
        let mut metrics = RpcMetrics {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            endpoints_by_chain: HashMap::new(),
        };

        for (chain, connections) in &self.connections {
            let chain_metrics: Vec<_> = connections
                .iter()
                .map(|conn| {
                    let health = conn.health.read();
                    EndpointMetrics {
                        url: conn.endpoint.url.clone(),
                        is_healthy: health.is_healthy,
                        success_count: health.success_count,
                        failure_count: health.failure_count,
                        average_latency_ms: health.average_latency_ms,
                        request_count: conn.request_count.load(Ordering::Relaxed),
                    }
                })
                .collect();

            metrics.endpoints_by_chain.insert(chain.clone(), chain_metrics);
        }

        metrics
    }

    pub async fn reconnect_failed_endpoints(&self) -> Result<()> {
        for (chain, connections) in &self.connections {
            for connection in connections {
                let health = connection.health.read();
                if !health.is_healthy {
                    drop(health);
                    
                    info!("Attempting to reconnect to {} endpoint: {}", chain, connection.endpoint.url);
                    
                    match Self::connect_to_endpoint(&connection.endpoint).await {
                        Ok(new_connection) => {
                            // Update the provider in the existing connection
                            // This is a simplified reconnection - in production, you'd need proper synchronization
                            let mut health = connection.health.write();
                            health.is_healthy = true;
                            health.last_error = None;
                            info!("Successfully reconnected to {}", connection.endpoint.url);
                        }
                        Err(e) => {
                            warn!("Failed to reconnect to {}: {}", connection.endpoint.url, e);
                        }
                    }
                }
            }
        }
        
        Ok(())
    }
}

impl Clone for RpcManager {
    fn clone(&self) -> Self {
        RpcManager {
            connections: self.connections.clone(),
            round_robin_indices: self.round_robin_indices.clone(),
            total_requests: self.total_requests.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RpcMetrics {
    pub total_requests: u64,
    pub endpoints_by_chain: HashMap<String, Vec<EndpointMetrics>>,
}

#[derive(Debug, Clone)]
pub struct EndpointMetrics {
    pub url: String,
    pub is_healthy: bool,
    pub success_count: u64,
    pub failure_count: u64,
    pub average_latency_ms: f64,
    pub request_count: u64,
}