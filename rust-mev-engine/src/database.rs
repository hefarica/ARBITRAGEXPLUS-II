use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio_postgres::{Client, NoTls, Row};
use tracing::{info, error, debug};


/// Estructura principal para manejar la conexión a PostgreSQL
pub struct Database {
    client: Arc<Client>,
}

/// Oportunidad de arbitraje detectada
#[derive(Debug, Clone, Serialize, Deserialize)]
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

/// Información de seguridad de un asset (Anti-Rugpull)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetSafety {
    pub address: String,
    pub score: i32,
    pub checks: serde_json::Value,
    pub updated_at: i64,
}

/// Ejecución de una transacción
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub kit_de_armado: Option<serde_json::Value>,
}

/// Configuración del motor MEV
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub id: i32,
    pub version: String,
    pub config: serde_json::Value,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Database {
    /// Crear una nueva conexión a la base de datos PostgreSQL
    pub async fn new(database_url: &str) -> Result<Self> {
        info!("Connecting to PostgreSQL database...");
        
        let (client, connection) = tokio_postgres::connect(database_url, NoTls)
            .await
            .context("Failed to connect to PostgreSQL")?;

        // Spawn la conexión en un task separado
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                error!("PostgreSQL connection error: {}", e);
            }
        });

        info!("Successfully connected to PostgreSQL database");

        Ok(Database {
            client: Arc::new(client),
        })
    }

    /// Insertar una nueva oportunidad de arbitraje
    pub async fn insert_opportunity(&self, opp: Opportunity) -> Result<()> {
        let query = r#"
            INSERT INTO opportunities (
                id, chain_id, strategy, dex_in, dex_out, 
                base_token, quote_token, amount_in, 
                est_profit_usd, gas_usd, ts, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO UPDATE SET
                est_profit_usd = EXCLUDED.est_profit_usd,
                gas_usd = EXCLUDED.gas_usd,
                ts = EXCLUDED.ts,
                metadata = EXCLUDED.metadata
        "#;

        self.client
            .execute(
                query,
                &[
                    &opp.id,
                    &opp.chain_id,
                    &opp.strategy,
                    &opp.dex_in,
                    &opp.dex_out,
                    &opp.base_token,
                    &opp.quote_token,
                    &opp.amount_in,
                    &opp.est_profit_usd,
                    &opp.gas_usd,
                    &opp.ts,
                    &opp.metadata,
                ],
            )
            .await
            .context("Failed to insert opportunity")?;

        debug!("Inserted opportunity: {}", opp.id);
        Ok(())
    }

    /// Obtener las últimas N oportunidades
    pub async fn get_recent_opportunities(&self, limit: i64) -> Result<Vec<Opportunity>> {
        let query = r#"
            SELECT id, chain_id, strategy, dex_in, dex_out, 
                   base_token, quote_token, amount_in, 
                   est_profit_usd, gas_usd, ts, metadata
            FROM opportunities
            ORDER BY ts DESC
            LIMIT $1
        "#;

        let rows = self.client
            .query(query, &[&limit])
            .await
            .context("Failed to fetch recent opportunities")?;

        let opportunities = rows
            .iter()
            .map(|row| self.row_to_opportunity(row))
            .collect::<Result<Vec<_>>>()?;

        Ok(opportunities)
    }

    /// Insertar o actualizar información de seguridad de un asset
    pub async fn upsert_asset_safety(&self, asset: AssetSafety) -> Result<()> {
        let query = r#"
            INSERT INTO asset_safety (address, score, checks, updated_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (address) DO UPDATE SET
                score = EXCLUDED.score,
                checks = EXCLUDED.checks,
                updated_at = EXCLUDED.updated_at
        "#;

        self.client
            .execute(
                query,
                &[&asset.address, &asset.score, &asset.checks, &asset.updated_at],
            )
            .await
            .context("Failed to upsert asset safety")?;

        debug!("Upserted asset safety for: {}", asset.address);
        Ok(())
    }

    /// Obtener información de seguridad de un asset
    pub async fn get_asset_safety(&self, address: &str) -> Result<Option<AssetSafety>> {
        let query = r#"
            SELECT address, score, checks, updated_at
            FROM asset_safety
            WHERE address = $1
        "#;

        let row = self.client
            .query_opt(query, &[&address])
            .await
            .context("Failed to fetch asset safety")?;

        match row {
            Some(r) => Ok(Some(AssetSafety {
                address: r.get(0),
                score: r.get(1),
                checks: r.get(2),
                updated_at: r.get(3),
            })),
            None => Ok(None),
        }
    }

    /// Insertar una nueva ejecución
    pub async fn insert_execution(&self, exec: Execution) -> Result<()> {
        let query = r#"
            INSERT INTO executions (
                id, opportunity_id, status, strategy, chain, 
                target_chain, tx_hash, chain_id, amount_in, 
                profit_usd, gas_usd, created_at, updated_at, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        "#;

        self.client
            .execute(
                query,
                &[
                    &exec.id,
                    &exec.opportunity_id,
                    &exec.status,
                    &exec.strategy,
                    &exec.chain,
                    &exec.target_chain,
                    &exec.tx_hash,
                    &exec.chain_id,
                    &exec.amount_in,
                    &exec.profit_usd,
                    &exec.gas_usd,
                    &exec.created_at,
                    &exec.updated_at,
                    &exec.metadata,
                ],
            )
            .await
            .context("Failed to insert execution")?;

        debug!("Inserted execution: {}", exec.id);
        Ok(())
    }

    /// Actualizar el estado de una ejecución
    pub async fn update_execution_status(
        &self,
        id: &str,
        status: &str,
        tx_hash: Option<&str>,
        profit_usd: Option<f64>,
    ) -> Result<()> {
        let query = r#"
            UPDATE executions
            SET status = $2, tx_hash = $3, profit_usd = $4, updated_at = $5
            WHERE id = $1
        "#;

        let updated_at = chrono::Utc::now().timestamp_millis();

        self.client
            .execute(query, &[&id, &status, &tx_hash, &profit_usd, &updated_at])
            .await
            .context("Failed to update execution status")?;

        debug!("Updated execution {} to status: {}", id, status);
        Ok(())
    }

    /// Obtener la configuración activa del motor
    pub async fn get_active_config(&self) -> Result<Option<EngineConfig>> {
        let query = r#"
            SELECT id, version, config, is_active, created_at, updated_at
            FROM engine_config
            WHERE is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        "#;

        let row = self.client
            .query_opt(query, &[])
            .await
            .context("Failed to fetch active config")?;

        match row {
            Some(r) => Ok(Some(EngineConfig {
                id: r.get(0),
                version: r.get(1),
                config: r.get(2),
                is_active: r.get(3),
                created_at: r.get(4),
                updated_at: r.get(5),
            })),
            None => Ok(None),
        }
    }

    /// Obtener oportunidades por chain_id
    pub async fn get_opportunities_by_chain(&self, chain_id: i32, limit: i64) -> Result<Vec<Opportunity>> {
        let query = r#"
            SELECT id, chain_id, strategy, dex_in, dex_out, 
                   base_token, quote_token, amount_in, 
                   est_profit_usd, gas_usd, ts, metadata
            FROM opportunities
            WHERE chain_id = $1
            ORDER BY ts DESC
            LIMIT $2
        "#;

        let rows = self.client
            .query(query, &[&chain_id, &limit])
            .await
            .context("Failed to fetch opportunities by chain")?;

        let opportunities = rows
            .iter()
            .map(|row| self.row_to_opportunity(row))
            .collect::<Result<Vec<_>>>()?;

        Ok(opportunities)
    }

    /// Obtener estadísticas de ejecuciones
    pub async fn get_execution_stats(&self) -> Result<serde_json::Value> {
        let query = r#"
            SELECT 
                COUNT(*) as total_executions,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COALESCE(SUM(profit_usd), 0) as total_profit,
                COALESCE(AVG(profit_usd), 0) as avg_profit
            FROM executions
        "#;

        let row = self.client
            .query_one(query, &[])
            .await
            .context("Failed to fetch execution stats")?;

        let stats = serde_json::json!({
            "total_executions": row.get::<_, i64>(0),
            "successful": row.get::<_, i64>(1),
            "failed": row.get::<_, i64>(2),
            "pending": row.get::<_, i64>(3),
            "total_profit": row.get::<_, f64>(4),
            "avg_profit": row.get::<_, f64>(5),
        });

        Ok(stats)
    }

    /// Helper para convertir Row a Opportunity
    fn row_to_opportunity(&self, row: &Row) -> Result<Opportunity> {
        Ok(Opportunity {
            id: row.get(0),
            chain_id: row.get(1),
            strategy: row.get(2),
            dex_in: row.get(3),
            dex_out: row.get(4),
            base_token: row.get(5),
            quote_token: row.get(6),
            amount_in: row.get(7),
            est_profit_usd: row.get(8),
            gas_usd: row.get(9),
            ts: row.get(10),
            metadata: row.get(11),
        })
    }

    /// Verificar la salud de la conexión a la base de datos
    pub async fn health_check(&self) -> Result<bool> {
        let query = "SELECT 1";
        
        match self.client.query_one(query, &[]).await {
            Ok(_) => {
                debug!("Database health check: OK");
                Ok(true)
            }
            Err(e) => {
                error!("Database health check failed: {}", e);
                Ok(false)
            }
        }
    }

    /// Obtener ejecuciones pendientes
    pub async fn get_pending_executions(&self, limit: i64) -> Result<Vec<Execution>> {
        let query = r#"
            SELECT id, opportunity_id, status, strategy, chain, target_chain, 
                   tx_hash, chain_id, amount_in, profit_usd, gas_usd, 
                   created_at, updated_at, metadata
            FROM executions 
            WHERE status = 'pending' 
            ORDER BY created_at ASC 
            LIMIT $1
        "#;
        
        let rows = self.client.query(query, &[&limit]).await?;
        
        let mut executions = Vec::new();
        for row in rows {
            executions.push(Execution {
                id: row.get(0),
                opportunity_id: row.get(1),
                status: row.get(2),
                strategy: row.get(3),
                chain: row.get(4),
                target_chain: row.get(5),
                tx_hash: row.get(6),
                chain_id: row.get(7),
                amount_in: row.get(8),
                profit_usd: row.get(9),
                gas_usd: row.get(10),
                created_at: row.get(11),
                updated_at: row.get(12),
                metadata: row.get(13),
                kit_de_armado: None,
            });
        }
        
        Ok(executions)
    }

    /// Marcar oportunidad como pendiente
    pub async fn mark_opportunity_pending(&self, opportunity_id: &str) -> Result<()> {
        let query = r#"
            UPDATE opportunities 
            SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb), 
                '{status}', 
                '"pending"'
            ),
            ts = $2 
            WHERE id = $1
        "#;
        
        let now = chrono::Utc::now().timestamp_millis();
        self.client.execute(query, &[&opportunity_id, &now]).await?;
        
        info!("Marked opportunity {} as pending", opportunity_id);
        Ok(())
    }
}
