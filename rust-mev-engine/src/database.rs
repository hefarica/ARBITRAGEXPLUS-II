use anyhow::{Result, Context};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::r2d2::{self, ConnectionManager, Pool};
use diesel::pg::PgConnection;
use serde::{Deserialize, Serialize};
use std::env;
use tracing::{info, error, debug};

// Database schema definitions matching Next.js app
table! {
    opportunities (id) {
        id -> Text,
        chain_id -> Int4,
        strategy -> Text,
        dex_in -> Text,
        dex_out -> Text,
        base_token -> Text,
        quote_token -> Text,
        amount_in -> Text,
        est_profit_usd -> Float8,
        gas_usd -> Float8,
        ts -> Int8,
        metadata -> Nullable<Jsonb>,
    }
}

table! {
    asset_safety (address) {
        address -> Text,
        score -> Int4,
        checks -> Jsonb,
        updated_at -> Int8,
    }
}

table! {
    executions (id) {
        id -> Text,
        opportunity_id -> Nullable<Text>,
        status -> Text,
        strategy -> Text,
        chain -> Text,
        target_chain -> Nullable<Text>,
        tx_hash -> Nullable<Text>,
        chain_id -> Int4,
        amount_in -> Text,
        profit_usd -> Nullable<Float8>,
        gas_usd -> Nullable<Float8>,
        created_at -> Int8,
        updated_at -> Int8,
        metadata -> Nullable<Jsonb>,
    }
}

table! {
    engine_config (id) {
        id -> Int4,
        version -> Text,
        config -> Jsonb,
        is_active -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = opportunities)]
pub struct Opportunity {
    pub id: String,
    pub chain_id: i32,
    pub strategy: String,
    pub dex_in: String,
    pub dex_out: String,
    pub base_token: String,
    pub quote_token: String,
    pub amount_in: String,
    pub est_profit_usd: f64,
    pub gas_usd: f64,
    pub ts: i64,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = asset_safety)]
pub struct AssetSafety {
    pub address: String,
    pub score: i32,
    pub checks: serde_json::Value,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = executions)]
pub struct Execution {
    pub id: String,
    pub opportunity_id: Option<String>,
    pub status: String,
    pub strategy: String,
    pub chain: String,
    pub target_chain: Option<String>,
    pub tx_hash: Option<String>,
    pub chain_id: i32,
    pub amount_in: String,
    pub profit_usd: Option<f64>,
    pub gas_usd: Option<f64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = engine_config)]
pub struct EngineConfig {
    pub id: i32,
    pub version: String,
    pub config: serde_json::Value,
    pub is_active: bool,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

pub struct Database {
    pool: Pool<ConnectionManager<PgConnection>>,
}

impl Database {
    pub fn new(database_url: &str) -> Result<Self> {
        info!("Connecting to PostgreSQL database");
        
        let manager = ConnectionManager::<PgConnection>::new(database_url);
        let pool = Pool::builder()
            .max_size(20)
            .min_idle(Some(5))
            .connection_timeout(std::time::Duration::from_secs(10))
            .build(manager)
            .context("Failed to create database connection pool")?;
        
        Ok(Database { pool })
    }

    pub fn run_migrations(&self) -> Result<()> {
        info!("Running database migrations");
        // In production, would use diesel_migrations
        Ok(())
    }

    pub async fn insert_opportunity(&self, opp: Opportunity) -> Result<()> {
        let pool = self.pool.clone();
        
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            diesel::insert_into(opportunities::table)
                .values(&opp)
                .on_conflict(opportunities::id)
                .do_update()
                .set((
                    opportunities::est_profit_usd.eq(&opp.est_profit_usd),
                    opportunities::gas_usd.eq(&opp.gas_usd),
                    opportunities::ts.eq(&opp.ts),
                ))
                .execute(&mut conn)?;
            
            debug!("Inserted opportunity: {}", opp.id);
            Ok::<(), anyhow::Error>(())
        })
        .await??;
        
        Ok(())
    }

    pub async fn get_recent_opportunities(&self, limit: i64) -> Result<Vec<Opportunity>> {
        let pool = self.pool.clone();
        
        let opportunities = tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            opportunities::table
                .order(opportunities::ts.desc())
                .limit(limit)
                .load::<Opportunity>(&mut conn)
                .context("Failed to load opportunities")
        })
        .await??;
        
        Ok(opportunities)
    }

    pub async fn insert_asset_safety(&self, asset: AssetSafety) -> Result<()> {
        let pool = self.pool.clone();
        
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            diesel::insert_into(asset_safety::table)
                .values(&asset)
                .on_conflict(asset_safety::address)
                .do_update()
                .set((
                    asset_safety::score.eq(&asset.score),
                    asset_safety::checks.eq(&asset.checks),
                    asset_safety::updated_at.eq(&asset.updated_at),
                ))
                .execute(&mut conn)?;
            
            Ok::<(), anyhow::Error>(())
        })
        .await??;
        
        Ok(())
    }

    pub async fn get_asset_safety(&self, address: &str) -> Result<Option<AssetSafety>> {
        let pool = self.pool.clone();
        let addr = address.to_string();
        
        let asset = tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            asset_safety::table
                .filter(asset_safety::address.eq(addr))
                .first::<AssetSafety>(&mut conn)
                .optional()
                .context("Failed to load asset safety")
        })
        .await??;
        
        Ok(asset)
    }

    pub async fn insert_execution(&self, exec: Execution) -> Result<()> {
        let pool = self.pool.clone();
        
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            diesel::insert_into(executions::table)
                .values(&exec)
                .execute(&mut conn)?;
            
            debug!("Inserted execution: {}", exec.id);
            Ok::<(), anyhow::Error>(())
        })
        .await??;
        
        Ok(())
    }

    pub async fn update_execution_status(
        &self,
        execution_id: &str,
        status: &str,
        tx_hash: Option<String>,
        profit: Option<f64>,
    ) -> Result<()> {
        let pool = self.pool.clone();
        let exec_id = execution_id.to_string();
        let new_status = status.to_string();
        
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            diesel::update(executions::table.filter(executions::id.eq(exec_id)))
                .set((
                    executions::status.eq(new_status),
                    executions::tx_hash.eq(tx_hash),
                    executions::profit_usd.eq(profit),
                    executions::updated_at.eq(chrono::Utc::now().timestamp_millis()),
                ))
                .execute(&mut conn)?;
            
            Ok::<(), anyhow::Error>(())
        })
        .await??;
        
        Ok(())
    }

    pub async fn get_recent_executions(&self, limit: i64) -> Result<Vec<Execution>> {
        let pool = self.pool.clone();
        
        let executions = tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            executions::table
                .order(executions::created_at.desc())
                .limit(limit)
                .load::<Execution>(&mut conn)
                .context("Failed to load executions")
        })
        .await??;
        
        Ok(executions)
    }

    pub async fn get_pending_executions(&self) -> Result<Vec<Execution>> {
        let pool = self.pool.clone();
        
        let executions = tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            executions::table
                .filter(executions::status.eq("pending"))
                .order(executions::created_at.asc())
                .load::<Execution>(&mut conn)
                .context("Failed to load pending executions")
        })
        .await??;
        
        Ok(executions)
    }

    pub async fn mark_opportunity_pending(&self, opportunity_id: &str) -> Result<()> {
        let pool = self.pool.clone();
        let opp_id = opportunity_id.to_string();
        
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            // Create execution record
            let execution = Execution {
                id: format!("exec_{}", uuid::Uuid::new_v4()),
                opportunity_id: Some(opp_id.clone()),
                status: "pending".to_string(),
                strategy: "".to_string(), // Would be filled from opportunity
                chain: "ethereum".to_string(),
                target_chain: None,
                tx_hash: None,
                chain_id: 1,
                amount_in: "0".to_string(),
                profit_usd: None,
                gas_usd: None,
                created_at: chrono::Utc::now().timestamp_millis(),
                updated_at: chrono::Utc::now().timestamp_millis(),
                metadata: None,
            };
            
            diesel::insert_into(executions::table)
                .values(&execution)
                .execute(&mut conn)?;
            
            Ok::<(), anyhow::Error>(())
        })
        .await??;
        
        Ok(())
    }

    pub async fn get_active_config(&self) -> Result<Option<EngineConfig>> {
        let pool = self.pool.clone();
        
        let config = tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            engine_config::table
                .filter(engine_config::is_active.eq(true))
                .order(engine_config::updated_at.desc())
                .first::<EngineConfig>(&mut conn)
                .optional()
                .context("Failed to load active config")
        })
        .await??;
        
        Ok(config)
    }

    pub async fn save_config(&self, config: serde_json::Value) -> Result<()> {
        let pool = self.pool.clone();
        
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            // Deactivate all existing configs
            diesel::update(engine_config::table)
                .set(engine_config::is_active.eq(false))
                .execute(&mut conn)?;
            
            // Insert new config
            let new_config = EngineConfig {
                id: 0, // Will be auto-generated
                version: config["version"].as_str().unwrap_or("1.0.0").to_string(),
                config,
                is_active: true,
                created_at: chrono::Utc::now().naive_utc(),
                updated_at: chrono::Utc::now().naive_utc(),
            };
            
            diesel::insert_into(engine_config::table)
                .values(&new_config)
                .execute(&mut conn)?;
            
            Ok::<(), anyhow::Error>(())
        })
        .await??;
        
        Ok(())
    }

    pub async fn get_metrics(&self) -> Result<DatabaseMetrics> {
        let pool = self.pool.clone();
        
        let metrics = tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            
            let total_opportunities: i64 = opportunities::table
                .count()
                .get_result(&mut conn)?;
            
            let total_executions: i64 = executions::table
                .count()
                .get_result(&mut conn)?;
            
            let successful_executions: i64 = executions::table
                .filter(executions::status.eq("success"))
                .count()
                .get_result(&mut conn)?;
            
            let total_profit: Option<f64> = executions::table
                .select(diesel::dsl::sum(executions::profit_usd))
                .first(&mut conn)?;
            
            Ok::<DatabaseMetrics, anyhow::Error>(DatabaseMetrics {
                total_opportunities,
                total_executions,
                successful_executions,
                total_profit_usd: total_profit.unwrap_or(0.0),
            })
        })
        .await??;
        
        Ok(metrics)
    }
}

impl Clone for Database {
    fn clone(&self) -> Self {
        Database {
            pool: self.pool.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseMetrics {
    pub total_opportunities: i64,
    pub total_executions: i64,
    pub successful_executions: i64,
    pub total_profit_usd: f64,
}

// UUID support
mod uuid {
    use uuid::Uuid as UuidCrate;
    
    pub struct Uuid;
    
    impl Uuid {
        pub fn new_v4() -> String {
            UuidCrate::new_v4().to_string()
        }
    }
}