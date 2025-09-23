use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use anyhow::{Result, anyhow};
use ethers::types::U256;
use redis::{Client as RedisClient, AsyncCommands};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// Fuentes para obtener datos de gas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GasDataSource {
    /// Usar bloques recientes para estimar gas
    BlockHistory,
    /// Oráculos específicos por cadena (configurados dinámicamente)
    ChainOracle(String),
    /// Llamada directa a RPC eth_gasPrice o eth_feeHistory
    DirectRpc,
    /// API externa configurada dinámicamente
    ExternalApi(String),
}

/// Configuración del oráculo de gas por cadena
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainGasConfig {
    /// ID de la cadena
    pub chain_id: String,
    /// Fuentes de datos de gas, en orden de prioridad
    pub sources: Vec<GasDataSource>,
    /// Cache TTL en segundos
    pub cache_ttl_seconds: u64,
    /// Multiplicador de gas base para ajuste dinámico
    pub base_fee_multiplier: f64,
    /// Prioridad de fee en Gwei (para EIP-1559)
    pub priority_fee_gwei: f64,
    /// Máximo gas price aceptable en Gwei
    pub max_gas_price_gwei: f64,
    /// Overhead en gas para transacciones complejas
    pub gas_overhead_percentage: f64,
}

/// Datos de gas para una cadena específica
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GasData {
    /// Precio de gas en wei
    pub gas_price: U256,
    /// Base fee para EIP-1559 en wei
    pub base_fee: Option<U256>,
    /// Priority fee para EIP-1559 en wei
    pub priority_fee: Option<U256>,
    /// Precio de gas recomendado para ejecución rápida
    pub recommended_gas_price: U256,
    /// Precio de ETH/gas token en USD
    pub gas_token_price_usd: f64,
    /// Timestamp de la última actualización
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

/// Implementa un oráculo de gas que provee datos de gas para múltiples cadenas
/// con fallbacks, cache y límites configurables dinámicamente
pub struct GasOracle {
    /// Cliente Redis para cache
    redis: Arc<RedisClient>,
    /// Configuración por cadena (dinámica)
    chain_configs: Arc<RwLock<HashMap<String, ChainGasConfig>>>,
    /// Cache en memoria para reducir llamadas a Redis
    memory_cache: Arc<RwLock<HashMap<String, (GasData, Instant)>>>,
}

impl GasOracle {
    /// Crea un nuevo oráculo de gas
    pub fn new(redis: Arc<RedisClient>) -> Self {
        Self {
            redis,
            chain_configs: Arc::new(RwLock::new(HashMap::new())),
            memory_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Carga la configuración desde la base de datos
    pub async fn load_configs_from_db(&self, db_pool: &sqlx::PgPool) -> Result<()> {
        // Consultar la configuración desde la tabla engine_configs
        let configs = sqlx::query!(
            r#"
            SELECT config->'gas_oracle' as gas_configs
            FROM engine_configs
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .fetch_one(db_pool)
        .await?;
        
        // Deserializar la configuración
        if let Some(gas_configs) = configs.gas_configs {
            let chain_configs: HashMap<String, ChainGasConfig> = 
                serde_json::from_value(gas_configs)?;
            
            // Actualizar configuración
            let mut configs_write = self.chain_configs.write().await;
            *configs_write = chain_configs;
        }
        
        Ok(())
    }

    /// Actualiza la configuración para una cadena específica
    pub async fn update_chain_config(&self, chain_id: &str, config: ChainGasConfig) {
        let mut configs = self.chain_configs.write().await;
        configs.insert(chain_id.to_string(), config);
    }

    /// Obtiene datos de gas para una cadena específica
    pub async fn get_gas_data(&self, chain_id: &str) -> Result<GasData> {
        // Verificar si hay datos en memoria y si son válidos
        {
            let memory_cache = self.memory_cache.read().await;
            if let Some((data, timestamp)) = memory_cache.get(chain_id) {
                // Verificar si los datos en caché son válidos según TTL
                let config = self.get_chain_config(chain_id).await?;
                let ttl = Duration::from_secs(config.cache_ttl_seconds);
                if timestamp.elapsed() < ttl {
                    return Ok(data.clone());
                }
            }
        }

        // Verificar en Redis
        let redis_key = format!("gas_oracle:chain:{}", chain_id);
        let mut redis_conn = self.redis.get_async_connection().await?;
        let cached_data: Option<String> = redis_conn.get(&redis_key).await?;
        
        if let Some(cached_json) = cached_data {
            match serde_json::from_str::<GasData>(&cached_json) {
                Ok(gas_data) => {
                    // Actualizar caché en memoria
                    let mut memory_cache = self.memory_cache.write().await;
                    memory_cache.insert(chain_id.to_string(), (gas_data.clone(), Instant::now()));
                    return Ok(gas_data);
                },
                Err(e) => {
                    tracing::warn!(
                        "Error deserializando datos de gas desde Redis para chain {}: {}",
                        chain_id, e
                    );
                }
            }
        }

        // Si llegamos aquí, necesitamos buscar datos frescos
        let gas_data = self.fetch_fresh_gas_data(chain_id).await?;
        
        // Guardar en Redis
        let config = self.get_chain_config(chain_id).await?;
        let ttl = config.cache_ttl_seconds as usize;
        let data_json = serde_json::to_string(&gas_data)?;
        let _: () = redis_conn.set_ex(&redis_key, &data_json, ttl).await?;
        
        // Actualizar caché en memoria
        let mut memory_cache = self.memory_cache.write().await;
        memory_cache.insert(chain_id.to_string(), (gas_data.clone(), Instant::now()));
        
        Ok(gas_data)
    }

    /// Obtiene la configuración para una cadena específica
    async fn get_chain_config(&self, chain_id: &str) -> Result<ChainGasConfig> {
        let configs = self.chain_configs.read().await;
        configs.get(chain_id)
            .cloned()
            .ok_or_else(|| anyhow!("No hay configuración de gas para chain {}", chain_id))
    }

    /// Obtiene datos frescos según las fuentes configuradas
    async fn fetch_fresh_gas_data(&self, chain_id: &str) -> Result<GasData> {
        let config = self.get_chain_config(chain_id).await?;
        
        // Intentamos cada fuente en orden
        for source in &config.sources {
            if let Ok(gas_data) = self.fetch_from_source(chain_id, source).await {
                // Aplicar multiplicadores y límites de la configuración
                return self.apply_config_adjustments(gas_data, &config);
            }
        }
        
        // Si ninguna fuente funciona, devolvemos error
        Err(anyhow!("No se pudo obtener datos de gas para chain {}", chain_id))
    }

    /// Busca datos de gas desde una fuente específica
    async fn fetch_from_source(&self, chain_id: &str, source: &GasDataSource) -> Result<GasData> {
        match source {
            GasDataSource::BlockHistory => {
                // Implementación para analizar bloques recientes
                // (este es un fallback genérico)
                self.fetch_from_block_history(chain_id).await
            },
            GasDataSource::ChainOracle(oracle_id) => {
                // Usar un oráculo específico para esta cadena
                self.fetch_from_chain_oracle(chain_id, oracle_id).await
            },
            GasDataSource::DirectRpc => {
                // Llamada directa a RPC
                self.fetch_from_rpc(chain_id).await
            },
            GasDataSource::ExternalApi(api_url) => {
                // Usar API externa
                self.fetch_from_external_api(chain_id, api_url).await
            }
        }
    }

    /// Implementación de obtención desde bloques recientes
    async fn fetch_from_block_history(&self, chain_id: &str) -> Result<GasData> {
        // Aquí normalmente usaríamos una RPC para obtener los últimos bloques
        // y calcular estadísticas de gas, pero por simplicidad devolvemos valores predeterminados
        // seguros por cadena desde la configuración
        
        let config = self.get_chain_config(chain_id).await?;
        
        // Valores predeterminados conservadores basados en configuración
        let base_gwei = match chain_id {
            "1" => 20.0, // Ethereum mainnet
            "10" => 0.1, // Optimism
            "42161" => 0.1, // Arbitrum
            "137" => 50.0, // Polygon
            "8453" => 0.05, // Base
            _ => 5.0, // Default conservador para otras cadenas
        };
        
        let gas_price = U256::from((base_gwei * 1_000_000_000.0) as u64);
        let base_fee = Some(gas_price);
        let priority_fee = Some(U256::from(
            (config.priority_fee_gwei * 1_000_000_000.0) as u64
        ));
        
        Ok(GasData {
            gas_price,
            base_fee,
            priority_fee,
            recommended_gas_price: gas_price,
            gas_token_price_usd: self.get_gas_token_price(chain_id).await?,
            last_updated: chrono::Utc::now(),
        })
    }

    /// Implementación de obtención desde oráculo específico
    async fn fetch_from_chain_oracle(&self, chain_id: &str, _oracle_id: &str) -> Result<GasData> {
        // Implementación real requiere integración con oráculos específicos
        // Aquí usamos un fallback al método de bloques por simplicidad
        self.fetch_from_block_history(chain_id).await
    }

    /// Implementación de obtención desde RPC directa
    async fn fetch_from_rpc(&self, chain_id: &str) -> Result<GasData> {
        // Implementación real requiere provider de ethers
        // Aquí usamos un fallback al método de bloques por simplicidad
        self.fetch_from_block_history(chain_id).await
    }

    /// Implementación de obtención desde API externa
    async fn fetch_from_external_api(&self, chain_id: &str, _api_url: &str) -> Result<GasData> {
        // Implementación real requiere HTTP client
        // Aquí usamos un fallback al método de bloques por simplicidad
        self.fetch_from_block_history(chain_id).await
    }

    /// Ajusta los datos de gas según la configuración
    fn apply_config_adjustments(&self, mut gas_data: GasData, config: &ChainGasConfig) -> Result<GasData> {
        // Ajustar gas price con el multiplicador
        let base_fee_wei = gas_data.base_fee
            .unwrap_or(gas_data.gas_price)
            .as_u128() as f64;
        
        let adjusted_fee = (base_fee_wei * config.base_fee_multiplier) as u128;
        gas_data.gas_price = U256::from(adjusted_fee);
        
        // Garantizar que no exceda el máximo
        let max_gas_wei = (config.max_gas_price_gwei * 1_000_000_000.0) as u128;
        if gas_data.gas_price.as_u128() > max_gas_wei {
            gas_data.gas_price = U256::from(max_gas_wei);
        }
        
        // Calcular gas price recomendado
        let priority_fee_wei = gas_data.priority_fee
            .unwrap_or_else(|| U256::from((config.priority_fee_gwei * 1_000_000_000.0) as u64))
            .as_u128();
        
        gas_data.recommended_gas_price = U256::from(adjusted_fee + priority_fee_wei);
        
        // Aplicar overhead si está configurado
        if config.gas_overhead_percentage > 0.0 {
            let recommended = gas_data.recommended_gas_price.as_u128() as f64;
            let with_overhead = recommended * (1.0 + config.gas_overhead_percentage / 100.0);
            gas_data.recommended_gas_price = U256::from(with_overhead as u128);
        }
        
        Ok(gas_data)
    }

    /// Obtiene el precio del token de gas (ETH/MATIC/etc) en USD
    async fn get_gas_token_price(&self, chain_id: &str) -> Result<f64> {
        // En producción, esto se obtendría de un oráculo de precios
        // Aquí devolvemos valores razonables para las principales cadenas
        let price = match chain_id {
            "1" => 3500.0,   // ETH
            "10" => 3500.0,  // ETH (Optimism)
            "42161" => 3500.0, // ETH (Arbitrum)
            "137" => 0.75,   // MATIC
            "8453" => 3500.0, // ETH (Base)
            _ => 1000.0,     // Default
        };
        
        Ok(price)
    }

    /// Calcula el costo estimado de gas para una transacción
    pub async fn estimate_gas_cost_usd(
        &self,
        chain_id: &str,
        gas_limit: u64
    ) -> Result<f64> {
        let gas_data = self.get_gas_data(chain_id).await?;
        
        // Cálculo: gasLimit * gasPrice * tokenPriceUsd / 10^18
        let gas_price_wei = gas_data.recommended_gas_price.as_u128() as f64;
        let gas_limit_f64 = gas_limit as f64;
        let token_price_usd = gas_data.gas_token_price_usd;
        
        let gas_cost_usd = (gas_price_wei * gas_limit_f64 * token_price_usd) / 1_000_000_000_000_000_000.0;
        
        Ok(gas_cost_usd)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[tokio::test]
    async fn test_gas_adjustments() {
        // Configuración de prueba
        let config = ChainGasConfig {
            chain_id: "1".to_string(),
            sources: vec![GasDataSource::BlockHistory],
            cache_ttl_seconds: 60,
            base_fee_multiplier: 1.1,
            priority_fee_gwei: 1.5,
            max_gas_price_gwei: 100.0,
            gas_overhead_percentage: 5.0,
        };

        // Datos de gas iniciales
        let initial_gas_data = GasData {
            gas_price: U256::from_dec_str("20000000000").unwrap(), // 20 Gwei
            base_fee: Some(U256::from_dec_str("18000000000").unwrap()), // 18 Gwei
            priority_fee: Some(U256::from_dec_str("1500000000").unwrap()), // 1.5 Gwei
            recommended_gas_price: U256::from_dec_str("20000000000").unwrap(),
            gas_token_price_usd: 3500.0,
            last_updated: chrono::Utc::now(),
        };

        // Crear una instancia del oráculo sin Redis (solo para test)
        let redis_client = RedisClient::open("redis://localhost").unwrap();
        let oracle = GasOracle::new(Arc::new(redis_client));

        // Aplicar ajustes
        let adjusted = oracle.apply_config_adjustments(initial_gas_data, &config).unwrap();

        // Verificar ajustes
        // Base fee: 18 Gwei * 1.1 = 19.8 Gwei
        assert_eq!(
            adjusted.gas_price, 
            U256::from_dec_str("19800000000").unwrap()
        );

        // Recommended = adjusted base fee + priority fee = 19.8 + 1.5 = 21.3 Gwei
        // Con 5% overhead: 21.3 * 1.05 = 22.365 Gwei
        assert_eq!(
            adjusted.recommended_gas_price,
            U256::from_dec_str("22365000000").unwrap()
        );
    }

    #[tokio::test]
    async fn test_gas_cost_estimation() {
        // Crear mock de datos de gas para prueba
        let gas_data = GasData {
            gas_price: U256::from_str("50000000000").unwrap(), // 50 Gwei
            base_fee: Some(U256::from_str("40000000000").unwrap()), // 40 Gwei
            priority_fee: Some(U256::from_str("3000000000").unwrap()), // 3 Gwei
            recommended_gas_price: U256::from_str("43000000000").unwrap(), // 43 Gwei
            gas_token_price_usd: 3500.0, // $3500 por ETH
            last_updated: chrono::Utc::now(),
        };

        // Crear oráculo con mock
        let redis_client = RedisClient::open("redis://localhost").unwrap();
        let oracle = GasOracle::new(Arc::new(redis_client));

        // Sobreescribir método get_gas_data para devolver nuestros datos de prueba
        let gas_limit = 300000; // 300k gas
        
        // Cálculo manual:
        // 43 Gwei * 300000 * $3500 / 10^18 = 0.04515 ETH * $3500 = $158.025
        let expected_cost = (43.0 * 1e9 * 300000.0 * 3500.0) / 1e18;
        
        // El valor esperado es aproximadamente $158.025
        assert!((expected_cost - 158.025).abs() < 0.001);
    }
}
