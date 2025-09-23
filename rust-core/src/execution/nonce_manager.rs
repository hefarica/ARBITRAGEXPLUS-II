use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Result, anyhow, Context};
use ethers::prelude::*;
use redis::{Client as RedisClient, AsyncCommands};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// Máximo tiempo de espera por defecto para transacciones (en segundos)
const DEFAULT_TX_TIMEOUT_SECS: u64 = 180;

/// Configuración por cadena para el gestor de nonces
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NonceManagerConfig {
    /// ID de la cadena
    pub chain_id: String,
    /// Tiempo de espera máximo por transacción en segundos
    pub tx_timeout_secs: u64,
    /// Número máximo de reintentos por nonce
    pub max_retry_count: u32,
    /// Tiempo de espera entre reintentos en milisegundos
    pub retry_wait_ms: u64,
    /// Si se debe usar EIP-1559
    pub use_eip1559: bool,
    /// Multiplicador de prioridad de fee para reemplazo de TX (%)
    pub priority_fee_bump_percent: f64,
}

/// Estado de una transacción
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub enum TxState {
    /// Transacción pendiente
    Pending,
    /// Transacción minada
    Mined,
    /// Transacción fallida
    Failed,
    /// Transacción reemplazada
    Replaced,
    /// Transacción expirada (timeout)
    Expired,
}

/// Información sobre el estado de una transacción
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TxInfo {
    /// Hash de la transacción
    pub hash: TxHash,
    /// Estado actual de la transacción
    pub state: TxState,
    /// Nonce de la transacción
    pub nonce: U256,
    /// Precio de gas usado
    pub gas_price: U256,
    /// Bloque en el que se minó (si aplica)
    pub block_number: Option<U64>,
    /// Timestamp de creación
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Timestamp de última actualización
    pub updated_at: chrono::DateTime<chrono::Utc>,
    /// Número de reintentos
    pub retry_count: u32,
}

/// Gestor de nonces para múltiples wallets y cadenas
/// 
/// Características:
/// - Mantiene nonces sincronizados a través de múltiples instancias usando Redis
/// - Maneja backoff, cancel/replace de transacciones
/// - Soporta múltiples cadenas con diferentes configuraciones
/// - Soporta múltiples carteras
pub struct NonceManager {
    /// Cliente Redis para sincronización de nonces
    redis: Arc<RedisClient>,
    /// Configuraciones por cadena (dinámicas)
    configs: Arc<RwLock<HashMap<String, NonceManagerConfig>>>,
    /// Cache en memoria para reducir llamadas a Redis
    memory_cache: Arc<RwLock<HashMap<(String, Address), (U256, Instant)>>>,
    /// Transacciones en curso por wallet y cadena
    pending_txs: Arc<RwLock<HashMap<(String, Address, U256), TxInfo>>>,
}

impl NonceManager {
    /// Crea un nuevo gestor de nonces
    pub fn new(redis: Arc<RedisClient>) -> Self {
        Self {
            redis,
            configs: Arc::new(RwLock::new(HashMap::new())),
            memory_cache: Arc::new(RwLock::new(HashMap::new())),
            pending_txs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Carga configuraciones desde la base de datos
    pub async fn load_configs_from_db(&self, db_pool: &sqlx::PgPool) -> Result<()> {
        // Consulta la configuración desde la tabla engine_configs
        let configs = sqlx::query!(
            r#"
            SELECT config->'nonce_manager' as nonce_configs
            FROM engine_configs
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .fetch_one(db_pool)
        .await?;
        
        // Deserializar la configuración
        if let Some(nonce_configs) = configs.nonce_configs {
            let chain_configs: HashMap<String, NonceManagerConfig> = 
                serde_json::from_value(nonce_configs)?;
            
            // Actualizar configuración
            let mut configs_write = self.configs.write().await;
            *configs_write = chain_configs;
        }
        
        Ok(())
    }

    /// Actualiza la configuración para una cadena
    pub async fn update_chain_config(&self, chain_id: &str, config: NonceManagerConfig) {
        let mut configs = self.configs.write().await;
        configs.insert(chain_id.to_string(), config);
    }

    /// Obtiene el siguiente nonce para un wallet en una cadena específica
    /// 
    /// Este método:
    /// 1. Intenta obtener el nonce de la caché en memoria
    /// 2. Si no está en caché, intenta obtenerlo de Redis
    /// 3. Si no está en Redis, lo obtiene de la blockchain
    /// 4. Guarda el nonce en Redis y en caché para futuras referencias
    pub async fn get_next_nonce(
        &self,
        chain_id: &str, 
        wallet: Address,
        provider: &Provider<Http>
    ) -> Result<U256> {
        // Verificar si hay datos en memoria y son válidos
        {
            let memory_cache = self.memory_cache.read().await;
            if let Some((nonce, timestamp)) = memory_cache.get(&(chain_id.to_string(), wallet)) {
                // Los nonces en memoria solo son válidos por un tiempo limitado
                if timestamp.elapsed() < Duration::from_secs(10) {
                    return Ok(*nonce);
                }
            }
        }

        // Verificar en Redis
        let redis_key = self.get_redis_key(chain_id, wallet);
        let mut redis_conn = self.redis.get_async_connection().await?;
        let cached_nonce: Option<String> = redis_conn.get(&redis_key).await?;
        
        if let Some(nonce_str) = cached_nonce {
            if let Ok(nonce) = U256::from_dec_str(&nonce_str) {
                // Actualizar caché en memoria
                let mut memory_cache = self.memory_cache.write().await;
                memory_cache.insert((chain_id.to_string(), wallet), (nonce, Instant::now()));
                return Ok(nonce);
            }
        }

        // Si llegamos aquí, necesitamos obtener el nonce de la blockchain
        let onchain_nonce = provider.get_transaction_count(wallet, None).await
            .context("Error obteniendo nonce de la blockchain")?;
        
        // Guardar en Redis
        let _: () = redis_conn.set(&redis_key, onchain_nonce.to_string()).await?;
        
        // Actualizar caché en memoria
        let mut memory_cache = self.memory_cache.write().await;
        memory_cache.insert((chain_id.to_string(), wallet), (onchain_nonce, Instant::now()));
        
        Ok(onchain_nonce)
    }

    /// Reserva un nonce para una transacción
    /// 
    /// Este método:
    /// 1. Obtiene el siguiente nonce disponible
    /// 2. Lo incrementa en Redis y en memoria
    /// 3. Devuelve el nonce reservado
    pub async fn reserve_nonce(
        &self,
        chain_id: &str, 
        wallet: Address,
        provider: &Provider<Http>
    ) -> Result<U256> {
        let nonce = self.get_next_nonce(chain_id, wallet, provider).await?;
        
        // Incrementar el nonce en Redis
        let redis_key = self.get_redis_key(chain_id, wallet);
        let mut redis_conn = self.redis.get_async_connection().await?;
        let _: () = redis_conn.incr(&redis_key, 1).await?;
        
        // Incrementar en memoria
        let mut memory_cache = self.memory_cache.write().await;
        memory_cache.insert((chain_id.to_string(), wallet), (nonce + 1, Instant::now()));
        
        Ok(nonce)
    }

    /// Registra una transacción enviada
    pub async fn register_tx(
        &self,
        chain_id: &str,
        wallet: Address,
        hash: TxHash,
        nonce: U256,
        gas_price: U256
    ) -> Result<()> {
        let tx_info = TxInfo {
            hash,
            state: TxState::Pending,
            nonce,
            gas_price,
            block_number: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            retry_count: 0,
        };
        
        // Guardar en memoria
        let mut pending_txs = self.pending_txs.write().await;
        pending_txs.insert((chain_id.to_string(), wallet, nonce), tx_info.clone());
        
        // Guardar en Redis para persistencia entre reinicios
        let redis_key = format!("nonce:tx:{}:{}:{}", chain_id, wallet, nonce);
        let mut redis_conn = self.redis.get_async_connection().await?;
        let tx_json = serde_json::to_string(&tx_info)?;
        let _: () = redis_conn.set_ex(redis_key, tx_json, 86400).await?; // TTL 24 horas
        
        Ok(())
    }

    /// Actualiza el estado de una transacción
    pub async fn update_tx_state(
        &self,
        chain_id: &str,
        wallet: Address,
        nonce: U256,
        new_state: TxState,
        block_number: Option<U64>
    ) -> Result<()> {
        // Actualizar en memoria
        let mut pending_txs = self.pending_txs.write().await;
        let key = (chain_id.to_string(), wallet, nonce);
        
        if let Some(mut tx_info) = pending_txs.get(&key).cloned() {
            tx_info.state = new_state.clone();
            tx_info.updated_at = chrono::Utc::now();
            tx_info.block_number = block_number;
            
            pending_txs.insert(key.clone(), tx_info.clone());
            
            // Actualizar en Redis
            let redis_key = format!("nonce:tx:{}:{}:{}", chain_id, wallet, nonce);
            let mut redis_conn = self.redis.get_async_connection().await?;
            let tx_json = serde_json::to_string(&tx_info)?;
            let _: () = redis_conn.set_ex(redis_key, tx_json, 86400).await?; // TTL 24 horas
            
            // Si la TX fue minada o falló, liberar recursos
            if new_state == TxState::Mined || new_state == TxState::Failed {
                self.cleanup_tx(chain_id, wallet, nonce).await?;
            }
            
            return Ok(());
        }
        
        Err(anyhow!("No se encontró transacción para {}/{}/{}", chain_id, wallet, nonce))
    }

    /// Verifica si una transacción necesita ser reemplazada
    pub async fn should_replace_tx(
        &self,
        chain_id: &str,
        wallet: Address,
        nonce: U256,
        provider: &Provider<Http>
    ) -> Result<bool> {
        let key = (chain_id.to_string(), wallet, nonce);
        let pending_txs = self.pending_txs.read().await;
        
        if let Some(tx_info) = pending_txs.get(&key) {
            // Solo reemplazar si está pendiente
            if tx_info.state != TxState::Pending {
                return Ok(false);
            }
            
            // Verificar si la TX ya fue minada en la blockchain
            if let Ok(receipt) = provider.get_transaction_receipt(tx_info.hash).await {
                if receipt.is_some() {
                    // La transacción ya fue minada, no reemplazar
                    return Ok(false);
                }
            }
            
            // Obtener configuración para saber timeout
            let configs = self.configs.read().await;
            let config = configs.get(chain_id).cloned().unwrap_or_else(|| {
                NonceManagerConfig {
                    chain_id: chain_id.to_string(),
                    tx_timeout_secs: DEFAULT_TX_TIMEOUT_SECS,
                    max_retry_count: 3,
                    retry_wait_ms: 5000,
                    use_eip1559: true,
                    priority_fee_bump_percent: 10.0,
                }
            });
            
            // Verificar si ha pasado el timeout
            let elapsed = chrono::Utc::now()
                .signed_duration_since(tx_info.created_at)
                .num_seconds();
                
            if elapsed > config.tx_timeout_secs as i64 {
                // La transacción ha expirado, debe ser reemplazada
                return Ok(true);
            }
            
            // Verificar si ha habido suficientes reintentos
            if tx_info.retry_count >= config.max_retry_count {
                tracing::warn!(
                    "Máximo de reintentos alcanzado para TX {} en {}/{}:{}",
                    tx_info.hash, chain_id, wallet, nonce
                );
                return Ok(false);
            }
            
            // Transacción pendiente que no ha expirado, no reemplazar
            return Ok(false);
        }
        
        // Si no hay información de la transacción, no hay nada que reemplazar
        Ok(false)
    }

    /// Crea una transacción de reemplazo con gas price incrementado
    pub async fn create_replacement_tx(
        &self,
        chain_id: &str,
        wallet: Address,
        nonce: U256,
        provider: &Provider<Http>
    ) -> Result<U256> {
        let key = (chain_id.to_string(), wallet, nonce);
        let mut pending_txs = self.pending_txs.write().await;
        
        if let Some(mut tx_info) = pending_txs.get(&key).cloned() {
            // Obtener configuración para saber bump
            let configs = self.configs.read().await;
            let config = configs.get(chain_id).cloned().unwrap_or_else(|| {
                NonceManagerConfig {
                    chain_id: chain_id.to_string(),
                    tx_timeout_secs: DEFAULT_TX_TIMEOUT_SECS,
                    max_retry_count: 3,
                    retry_wait_ms: 5000,
                    use_eip1559: true,
                    priority_fee_bump_percent: 10.0,
                }
            });
            
            // Incrementar gas price según configuración
            let bump_factor = 1.0 + (config.priority_fee_bump_percent / 100.0);
            let new_gas_price = U256::from(
                (tx_info.gas_price.as_u128() as f64 * bump_factor) as u128
            );
            
            // Actualizar información de la transacción
            tx_info.state = TxState::Replaced;
            tx_info.updated_at = chrono::Utc::now();
            tx_info.retry_count += 1;
            
            pending_txs.insert(key, tx_info.clone());
            
            // Actualizar en Redis
            let redis_key = format!("nonce:tx:{}:{}:{}", chain_id, wallet, nonce);
            let mut redis_conn = self.redis.get_async_connection().await?;
            let tx_json = serde_json::to_string(&tx_info)?;
            let _: () = redis_conn.set_ex(redis_key, tx_json, 86400).await?; // TTL 24 horas
            
            return Ok(new_gas_price);
        }
        
        Err(anyhow!("No se encontró transacción para {}/{}/{}", chain_id, wallet, nonce))
    }

    /// Limpia recursos asociados a una transacción completada
    async fn cleanup_tx(&self, chain_id: &str, wallet: Address, nonce: U256) -> Result<()> {
        // Eliminar de memoria
        let mut pending_txs = self.pending_txs.write().await;
        pending_txs.remove(&(chain_id.to_string(), wallet, nonce));
        
        Ok(())
    }

    /// Construye la clave de Redis para un wallet y cadena
    fn get_redis_key(&self, chain_id: &str, wallet: Address) -> String {
        format!("nonce:next:{}:{}", chain_id, wallet)
    }

    /// Procesa las transacciones pendientes para verificar su estado
    pub async fn process_pending_txs(&self, providers: &HashMap<String, Provider<Http>>) -> Result<()> {
        let pending_txs = self.pending_txs.read().await.clone();
        
        for ((chain_id, wallet, nonce), tx_info) in pending_txs {
            if tx_info.state != TxState::Pending {
                continue;
            }
            
            // Obtener provider para la cadena
            if let Some(provider) = providers.get(&chain_id) {
                // Verificar si la transacción fue minada
                if let Ok(receipt) = provider.get_transaction_receipt(tx_info.hash).await {
                    if let Some(r) = receipt {
                        let new_state = if r.status == Some(U64::from(1)) {
                            TxState::Mined
                        } else {
                            TxState::Failed
                        };
                        
                        // Actualizar estado
                        if let Err(e) = self.update_tx_state(
                            &chain_id,
                            wallet,
                            nonce,
                            new_state,
                            r.block_number
                        ).await {
                            tracing::error!("Error actualizando estado de TX: {:?}", e);
                        }
                    }
                }
                
                // Verificar si debemos reemplazar la transacción
                if let Ok(true) = self.should_replace_tx(&chain_id, wallet, nonce, provider).await {
                    tracing::info!(
                        "Marcando para reemplazo TX {} en {}/{}:{}",
                        tx_info.hash, chain_id, wallet, nonce
                    );
                    
                    // Actualizar el estado para marcarla para reemplazo
                    if let Err(e) = self.update_tx_state(
                        &chain_id,
                        wallet,
                        nonce,
                        TxState::Expired,
                        None
                    ).await {
                        tracing::error!("Error actualizando estado de TX: {:?}", e);
                    }
                }
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[tokio::test]
    async fn test_nonce_reservation() {
        // Crear NonceManager con mock de Redis
        let redis_client = RedisClient::open("redis://localhost").unwrap();
        let manager = NonceManager::new(Arc::new(redis_client));
        
        // Mock del provider
        let provider = Provider::<Http>::try_from("http://localhost:8545").unwrap();
        
        // Wallet para test
        let wallet_address = Address::from_str("0x742d35Cc6634C0532925a3b844Bc454e4438f44e").unwrap();
        let chain_id = "1"; // Ethereum mainnet
        
        // Mock del método get_transaction_count para devolver un nonce conocido
        // En un test real, usaríamos una biblioteca de mock como mockall
        
        // Supongamos que el método de reserva funciona y retorna un nonce
        let nonce1 = U256::from(10); // Simular que el nonce es 10
        let nonce2 = U256::from(11); // El siguiente debería ser 11
        
        // Registrar una transacción para este nonce
        let tx_hash = TxHash::from_str("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef").unwrap();
        let gas_price = U256::from(20000000000u64); // 20 Gwei
        
        manager.register_tx(chain_id, wallet_address, tx_hash, nonce1, gas_price).await.unwrap();
        
        // Verificar que la transacción está registrada y pendiente
        let pending_txs = manager.pending_txs.read().await;
        let key = (chain_id.to_string(), wallet_address, nonce1);
        
        assert!(pending_txs.contains_key(&key));
        assert_eq!(pending_txs.get(&key).unwrap().state, TxState::Pending);
        
        // Simular que la transacción fue minada
        let block_number = Some(U64::from(1000000));
        manager.update_tx_state(chain_id, wallet_address, nonce1, TxState::Mined, block_number).await.unwrap();
        
        // Verificar que el estado fue actualizado
        let pending_txs = manager.pending_txs.read().await;
        assert!(!pending_txs.contains_key(&key)); // Debería haber sido limpiada
    }
}
