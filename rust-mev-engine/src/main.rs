#![allow(dead_code)]
#![allow(unused_variables)]
#![allow(unused_imports)]

use anyhow::Result;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::signal;
use tokio::sync::RwLock;
use tracing::{info, error};
use warp::Filter;

use crate::config::Config;
use crate::database::Database;
use crate::monitoring::Monitoring;
use crate::rpc_manager::RpcManager;
use crate::mev_scanner::MevScanner;
use crate::opportunity_detector::OpportunityDetector;
use crate::executor::Executor;

#[derive(Clone)]
struct AppState {
    config: Arc<RwLock<Config>>,
    rpc_manager: Arc<RpcManager>,
    db: Arc<Database>,
    monitoring: Arc<Monitoring>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .json()
        .init();

    info!("Starting MEV Engine v3.6.0");

    // Load configuration
    let config = Config::load("config/config.toml").await?;
    info!("Configuration loaded from config/config.toml");

    // Initialize database
    let db = Database::new(&config.database.connection_string)?;
    info!("Connected to PostgreSQL database");

    // Run migrations
    db.run_migrations()?;
    info!("Database migrations completed");

    // Initialize monitoring
    let monitoring = Monitoring::new();
    info!("Monitoring initialized");

    // Initialize RPC manager with 100+ endpoints
    let rpc_manager = RpcManager::new(&config.rpc_endpoints).await?;
    info!("RPC Manager initialized with {} endpoints", config.rpc_endpoints.len());

    // Create app state
    let state = AppState {
        config: Arc::new(RwLock::new(config.clone())),
        rpc_manager: Arc::new(rpc_manager),
        db: Arc::new(db),
        monitoring: Arc::new(monitoring.clone()),
    };

    // Start MEV scanner
    let scanner_state = state.clone();
    tokio::spawn(async move {
        let scanner = mev_scanner::MevScanner::new(
            scanner_state.rpc_manager.clone(),
            scanner_state.db.clone(),
            scanner_state.monitoring.clone(),
            scanner_state.config.clone(),
        );
        
        if let Err(e) = scanner.run().await {
            error!("MEV Scanner error: {}", e);
        }
    });

    // Start opportunity detector
    let detector_state = state.clone();
    tokio::spawn(async move {
        let detector = opportunity_detector::OpportunityDetector::new(
            detector_state.db.clone(),
            detector_state.monitoring.clone(),
            detector_state.config.clone(),
        );
        
        if let Err(e) = detector.run().await {
            error!("Opportunity Detector error: {}", e);
        }
    });

    // Start executor
    let executor_state = state.clone();
    tokio::spawn(async move {
        let executor = executor::Executor::new(
            executor_state.rpc_manager.clone(),
            executor_state.db.clone(),
            executor_state.monitoring.clone(),
            executor_state.config.clone(),
        );
        
        if let Err(e) = executor.run().await {
            error!("Executor error: {}", e);
        }
    });

    // Build REST API routes
    let health = warp::path("health")
        .map(|| warp::reply::json(&serde_json::json!({
            "status": "healthy",
            "version": "3.6.0",
            "timestamp": chrono::Utc::now()
        })));

    let metrics = warp::path("metrics")
        .map({
            let monitoring = state.monitoring.clone();
            move || monitoring.export_metrics()
        });

    let opportunities = warp::path("opportunities")
        .and(warp::get())
        .map({
            let db = state.db.clone();
            move || {
                let db = db.clone();
                async move {
                    match db.get_recent_opportunities(100).await {
                        Ok(opps) => warp::reply::json(&opps),
                        Err(e) => {
                            error!("Failed to get opportunities: {}", e);
                            warp::reply::json(&serde_json::json!({
                                "error": "Failed to fetch opportunities"
                            }))
                        }
                    }
                }
            }
        });

    let executions = warp::path("executions")
        .and(warp::get())
        .map({
            let db = state.db.clone();
            move || {
                let db = db.clone();
                async move {
                    match db.get_recent_executions(200).await {
                        Ok(execs) => warp::reply::json(&execs),
                        Err(e) => {
                            error!("Failed to get executions: {}", e);
                            warp::reply::json(&serde_json::json!({
                                "error": "Failed to fetch executions"
                            }))
                        }
                    }
                }
            }
        });

    let config_get = warp::path("config")
        .and(warp::get())
        .map({
            let config = state.config.clone();
            move || {
                let config = config.clone();
                async move {
                    let cfg = config.read().await;
                    warp::reply::json(&*cfg)
                }
            }
        });

    let config_update = warp::path("config")
        .and(warp::post())
        .and(warp::body::json())
        .map({
            let config = state.config.clone();
            move |new_config: Config| {
                let config = config.clone();
                async move {
                    let mut cfg = config.write().await;
                    *cfg = new_config;
                    warp::reply::json(&serde_json::json!({
                        "status": "updated"
                    }))
                }
            }
        });

    // Combine all routes
    let routes = health
        .or(metrics)
        .or(opportunities)
        .or(executions)
        .or(config_get)
        .or(config_update)
        .with(warp::cors().allow_any_origin());

    // Start REST API server on port 8080
    let addr: SocketAddr = "0.0.0.0:8080".parse()?;
    info!("Starting REST API on {}", addr);

    let (_, server) = warp::serve(routes)
        .bind_with_graceful_shutdown(addr, async {
            signal::ctrl_c()
                .await
                .expect("Failed to listen for ctrl+c");
            info!("Shutdown signal received");
        });

    // Run server
    server.await;

    info!("MEV Engine stopped");
    Ok(())
}