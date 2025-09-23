use crate::opportunity::arbitrage_opportunity::ArbitrageOpportunity;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

/// Configuración dinámica del guardián de rentabilidad
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfitabilityConfig {
    /// Umbral mínimo de EV (Expected Value) en USD para ejecutar la oportunidad
    pub min_ev_usd: f64,
    /// Porcentaje de haircut para aplicar al EV (margen de seguridad)
    pub haircut_percentage: f64,
    /// Factor máximo de slippage esperado
    pub max_slippage_bps: u16,
    /// Gas máximo a pagar por transacción en USD
    pub max_gas_usd: f64,
    /// Tarifa máxima de flash loan en bps
    pub max_flash_fee_bps: u16,
    /// Propina máxima para el builder/validator en USD
    pub max_builder_tip_usd: f64,
}

/// Guardian de rentabilidad para evaluar si una oportunidad es viable económicamente
pub struct ProfitabilityGuard {
    /// Conexión a la base de datos para persistir resultados
    db_pool: Arc<PgPool>,
    /// Configuración dinámica que puede ser actualizada en tiempo real
    config: Arc<RwLock<ProfitabilityConfig>>,
}

impl ProfitabilityGuard {
    /// Crea un nuevo guardián de rentabilidad
    pub fn new(db_pool: Arc<PgPool>, config: ProfitabilityConfig) -> Self {
        Self {
            db_pool,
            config: Arc::new(RwLock::new(config)),
        }
    }

    /// Actualiza la configuración dinámicamente
    pub async fn update_config(&self, new_config: ProfitabilityConfig) {
        let mut config = self.config.write().await;
        *config = new_config;
    }

    /// Carga la configuración desde la base de datos
    pub async fn load_config_from_db(&self) -> anyhow::Result<()> {
        // Cargar desde tabla engine_configs en PostgreSQL
        let config: ProfitabilityConfig = sqlx::query_as!(
            ProfitabilityConfigDb,
            r#"
            SELECT 
                (config->'profitability'->>'min_ev_usd')::FLOAT as min_ev_usd,
                (config->'profitability'->>'haircut_percentage')::FLOAT as haircut_percentage,
                (config->'profitability'->>'max_slippage_bps')::INT as max_slippage_bps,
                (config->'profitability'->>'max_gas_usd')::FLOAT as max_gas_usd,
                (config->'profitability'->>'max_flash_fee_bps')::INT as max_flash_fee_bps,
                (config->'profitability'->>'max_builder_tip_usd')::FLOAT as max_builder_tip_usd
            FROM engine_configs
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .fetch_one(self.db_pool.as_ref())
        .await?
        .into();

        self.update_config(config).await;
        Ok(())
    }

    /// Evalúa si una oportunidad es rentable
    /// 
    /// Calcula el EV neto como:
    /// EV neto = spread - gas - flash fee - slippage estimado - tips al builder - haircut de seguridad
    pub async fn is_profitable(
        &self,
        opportunity: &ArbitrageOpportunity,
        gas_cost_usd: f64,
        flash_fee_usd: f64,
        builder_tip_usd: f64,
    ) -> (bool, f64) {
        let config = self.config.read().await;

        // Cálculo del valor esperado neto
        let raw_ev = opportunity.expected_value_usd;
        
        // Estimación de slippage en USD basado en los bps configurados
        let slippage_usd = raw_ev * (config.max_slippage_bps as f64 / 10_000.0);
        
        // Haircut de seguridad (margen adicional para imprevistos)
        let haircut_usd = raw_ev * (config.haircut_percentage / 100.0);
        
        // Cálculo final del EV neto
        let net_ev = raw_ev - gas_cost_usd - flash_fee_usd - slippage_usd - builder_tip_usd - haircut_usd;

        // Métricas detalladas para logging y dashboards
        let profitability_metrics = ProfitabilityMetrics {
            opportunity_id: opportunity.id.clone(),
            raw_ev_usd: raw_ev,
            gas_cost_usd,
            flash_fee_usd,
            estimated_slippage_usd: slippage_usd,
            builder_tip_usd,
            haircut_usd,
            net_ev_usd: net_ev,
            is_profitable: net_ev >= config.min_ev_usd,
        };
        
        // Asincronamente guardar las métricas (sin bloquear)
        let db_pool = self.db_pool.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::save_metrics(&db_pool, &profitability_metrics).await {
                tracing::error!(
                    "Error guardando métricas de rentabilidad: {:?} para opp_id: {}",
                    e,
                    profitability_metrics.opportunity_id
                );
            }
        });

        // La oportunidad es rentable si el EV neto es mayor que el mínimo configurado
        (net_ev >= config.min_ev_usd, net_ev)
    }

    /// Guardar métricas de rentabilidad en la base de datos
    async fn save_metrics(db_pool: &PgPool, metrics: &ProfitabilityMetrics) -> anyhow::Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO opportunity_scores (
                opportunity_id, raw_ev_usd, gas_cost_usd, flash_fee_usd,
                estimated_slippage_usd, builder_tip_usd, haircut_usd,
                net_ev_usd, is_profitable
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9
            )
            "#,
            metrics.opportunity_id,
            metrics.raw_ev_usd,
            metrics.gas_cost_usd,
            metrics.flash_fee_usd,
            metrics.estimated_slippage_usd,
            metrics.builder_tip_usd,
            metrics.haircut_usd,
            metrics.net_ev_usd,
            metrics.is_profitable,
        )
        .execute(db_pool)
        .await?;

        Ok(())
    }
}

// Estructura para leer datos desde PostgreSQL
struct ProfitabilityConfigDb {
    min_ev_usd: f64,
    haircut_percentage: f64,
    max_slippage_bps: i32,
    max_gas_usd: f64,
    max_flash_fee_bps: i32,
    max_builder_tip_usd: f64,
}

impl From<ProfitabilityConfigDb> for ProfitabilityConfig {
    fn from(db: ProfitabilityConfigDb) -> Self {
        Self {
            min_ev_usd: db.min_ev_usd,
            haircut_percentage: db.haircut_percentage,
            max_slippage_bps: db.max_slippage_bps as u16,
            max_gas_usd: db.max_gas_usd,
            max_flash_fee_bps: db.max_flash_fee_bps as u16,
            max_builder_tip_usd: db.max_builder_tip_usd,
        }
    }
}

// Estructura para las métricas detalladas de rentabilidad
#[derive(Debug)]
struct ProfitabilityMetrics {
    opportunity_id: String,
    raw_ev_usd: f64,
    gas_cost_usd: f64,
    flash_fee_usd: f64,
    estimated_slippage_usd: f64,
    builder_tip_usd: f64,
    haircut_usd: f64,
    net_ev_usd: f64,
    is_profitable: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opportunity::arbitrage_opportunity::ArbitrageOpportunity;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_profitability_calculation() {
        // Crear configuración de prueba
        let config = ProfitabilityConfig {
            min_ev_usd: 5.0,
            haircut_percentage: 10.0,
            max_slippage_bps: 20, // 0.2%
            max_gas_usd: 30.0,
            max_flash_fee_bps: 30, // 0.3%
            max_builder_tip_usd: 0.5,
        };

        // Mock de oportunidad
        let opportunity = ArbitrageOpportunity {
            id: Uuid::new_v4().to_string(),
            expected_value_usd: 100.0,
            // otros campos requeridos...
            chain_id: "1".to_string(),
            router_address: "0x".to_string(),
            status: crate::opportunity::arbitrage_opportunity::OpportunityStatus::Detected,
            source_dex: "uniswap_v2".to_string(),
            target_dex: "sushiswap".to_string(),
            token_in: "0x".to_string(),
            token_out: "0x".to_string(),
            amount_in: 1000.0,
            created_at: chrono::Utc::now(),
        };

        let gas_cost_usd = 10.0;
        let flash_fee_usd = 2.0;
        let builder_tip_usd = 0.5;

        // Crear el ProfitabilityGuard con la configuración de prueba
        // (usamos un mock de PgPool para el test)
        let mock_pool = Arc::new(MockPgPool {});
        let guard = ProfitabilityGuard::new(Arc::new(mock_pool), config);

        // Evaluar la rentabilidad
        let (is_profitable, net_ev) = guard.is_profitable(&opportunity, gas_cost_usd, flash_fee_usd, builder_tip_usd).await;

        // Cálculos esperados:
        // Raw EV: 100.0
        // Gas cost: 10.0
        // Flash fee: 2.0
        // Slippage: 100.0 * 20/10000 = 0.2
        // Builder tip: 0.5
        // Haircut: 100.0 * 0.1 = 10.0
        // Net EV = 100.0 - 10.0 - 2.0 - 0.2 - 0.5 - 10.0 = 77.3

        // Verificar resultados
        assert!(is_profitable);
        assert_eq!(net_ev, 77.3);
    }

    // Mock de PgPool para tests
    struct MockPgPool {}
    impl sqlx::Executor<'_> for MockPgPool {
        type Database = sqlx::Postgres;
        fn execute<'e, 'q: 'e>(
            &'q self,
            _query: sqlx::query::Query<'q, Self::Database, sqlx::postgres::PgArguments>,
        ) -> futures::future::BoxFuture<'e, Result<sqlx::postgres::PgQueryResult, sqlx::Error>> {
            Box::pin(async { Ok(sqlx::postgres::PgQueryResult::default()) })
        }
        // Otros métodos requeridos...
    }
}
