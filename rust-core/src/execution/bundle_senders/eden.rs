use ethers::prelude::*;
use anyhow::{Result, anyhow};
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use crate::execution::bundle_senders::SendResult;

/// Implementación de envío de transacciones a través de Eden Network
/// 
/// Eden Network es un relay privado que proporciona acceso prioritario 
/// a mempools y servicios de MEV protection para transacciones
pub struct EdenSender {
    /// URL del endpoint de Eden
    endpoint: String,
    /// Cliente HTTP para comunicación con Eden API
    client: reqwest::Client,
    /// Clave de autenticación (opcional)
    auth_key: Option<String>,
}

/// Configuración para un bundle en Eden Network
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdenConfig {
    /// Prioridad del slot (1-255, donde 1 es la más alta)
    pub slot_priority: u8,
    /// Tiempo máximo de espera (en segundos)
    pub max_wait_time_secs: u64,
    /// Miner reward (en wei)
    pub miner_reward_wei: Option<U256>,
}

impl EdenSender {
    /// Crea un nuevo sender de Eden Network
    pub fn new(endpoint: &str, auth_key: Option<&str>) -> Result<Self> {
        // Validar el endpoint
        if !endpoint.starts_with("https://") {
            return Err(anyhow!("El endpoint de Eden Network debe usar HTTPS"));
        }

        // Crear cliente HTTP con timeout
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()?;

        Ok(Self {
            endpoint: endpoint.to_string(),
            client,
            auth_key: auth_key.map(String::from),
        })
    }

    /// Simula un bundle en Eden Network
    async fn simulate_bundle(
        &self,
        txs: &[TypedTransaction],
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>
    ) -> Result<EdenSimulationResult> {
        // Firmar todas las transacciones
        let mut signed_tx_data = Vec::new();
        for tx in txs {
            let signature = signer.signer().sign_transaction(tx).await?;
            let signed_tx = tx.rlp_signed(&signature);
            signed_tx_data.push(format!("0x{}", hex::encode(signed_tx)));
        }

        // Construir payload de simulación
        let simulation_payload = EdenSimulationRequest {
            tx_list: signed_tx_data,
            state_block_tag: "latest".to_string(),
            gas_price: None, // Usar gas price por defecto
            gas_limit: None, // Usar gas limit por defecto
            timestamp: None, // Usar timestamp actual
        };

        // Enviar solicitud de simulación
        let mut req = self.client.post(&format!("{}/v1/simulate", self.endpoint))
            .json(&simulation_payload)
            .header("Accept", "application/json");
            
        // Añadir autenticación si está configurada
        if let Some(key) = &self.auth_key {
            req = req.header("Authorization", format!("Bearer {}", key));
        }

        // Enviar solicitud y procesar respuesta
        let response = req.send().await?;
        
        // Verificar status HTTP
        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Error en simulación Eden: {} - {}", 
                response.status(), error_text));
        }

        // Parsear respuesta
        let result = response.json::<EdenSimulationResult>().await?;
        
        // Verificar que la simulación fue exitosa
        if !result.success {
            return Err(anyhow!("La simulación en Eden falló: {}", 
                result.error.unwrap_or_default()));
        }

        Ok(result)
    }

    /// Envía un bundle a Eden Network
    async fn send_eden_bundle(
        &self,
        txs: &[TypedTransaction],
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
        config: Option<&EdenConfig>,
    ) -> Result<String> {
        // Firmar todas las transacciones
        let mut signed_tx_data = Vec::new();
        for tx in txs {
            let signature = signer.signer().sign_transaction(tx).await?;
            let signed_tx = tx.rlp_signed(&signature);
            signed_tx_data.push(format!("0x{}", hex::encode(signed_tx)));
        }

        // Obtener configuración o usar valores por defecto
        let slot_priority = config.map(|c| c.slot_priority).unwrap_or(10);
        let max_wait_blocks = config.map(|c| {
            // Convertir segundos a bloques aproximados (asumiendo 15s/bloque)
            (c.max_wait_time_secs / 15).max(1) as u64
        }).unwrap_or(5); // Default: esperar hasta 5 bloques

        // Construir payload de envío
        let bundle_payload = EdenBundleRequest {
            tx_list: signed_tx_data,
            slot_priority,
            max_block_number: None, // Usar máximo por defecto
            max_wait_blocks,
            miner_reward: config.and_then(|c| c.miner_reward_wei.map(|r| r.to_string())),
        };

        // Enviar solicitud de bundle
        let mut req = self.client.post(&format!("{}/v1/bundles", self.endpoint))
            .json(&bundle_payload)
            .header("Accept", "application/json");
            
        // Añadir autenticación si está configurada
        if let Some(key) = &self.auth_key {
            req = req.header("Authorization", format!("Bearer {}", key));
        }

        // Enviar solicitud y procesar respuesta
        let response = req.send().await?;
        
        // Verificar status HTTP
        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Error enviando bundle a Eden: {} - {}", 
                response.status(), error_text));
        }

        // Parsear respuesta
        let result = response.json::<EdenSendResponse>().await?;

        Ok(result.bundle_id)
    }
}

#[async_trait::async_trait]
impl crate::execution::bundle_senders::BundleSender for EdenSender {
    fn relay_type(&self) -> crate::execution::bundle_senders::RelayType {
        crate::execution::bundle_senders::RelayType::Eden
    }
    
    async fn send_transaction(
        &self,
        tx: &TypedTransaction,
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult> {
        // Para Eden, enviamos una transacción como un bundle de un solo elemento
        self.send_bundle(&[tx.clone()], signer).await
    }
    
    async fn send_bundle(
        &self,
        txs: &[TypedTransaction],
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult> {
        // Primero, simular el bundle para verificar que es válido
        let simulation = self.simulate_bundle(txs, signer).await?;
        
        // Configuración con valores predeterminados seguros
        let config = EdenConfig {
            slot_priority: 5, // Prioridad alta pero no máxima
            max_wait_time_secs: 180, // 3 minutos
            miner_reward_wei: None, // Sin recompensa adicional
        };
        
        // Si la simulación es exitosa, enviar el bundle
        let bundle_id = self.send_eden_bundle(txs, signer, Some(&config)).await?;
        
        let first_tx = txs.first().ok_or_else(|| anyhow!("Bundle vacío"))?;
        let tx_hash = first_tx.hash();
        
        // Calcular probabilidad de inclusión basada en la simulación y configuración
        let inclusion_probability = match config.slot_priority {
            1..=3 => 0.95,  // Muy alta para prioridad máxima
            4..=10 => 0.85, // Alta para prioridad media-alta
            11..=20 => 0.75, // Media para prioridad media
            _ => 0.65,      // Moderada para prioridad baja
        };
        
        // Tiempo estimado basado en configuración y simulación
        let estimated_time = if simulation.estimated_wait_time_ms.is_some() {
            // Convertir de ms a segundos y redondear hacia arriba
            (simulation.estimated_wait_time_ms.unwrap() as f64 / 1000.0).ceil() as u64
        } else {
            // Valor predeterminado basado en slot_priority
            match config.slot_priority {
                1..=3 => 15,    // ~1 bloque
                4..=10 => 30,   // ~2 bloques
                11..=20 => 45,  // ~3 bloques
                _ => 60,        // ~4 bloques
            }
        };
        
        Ok(SendResult {
            tx_hash,
            simulation_id: Some(bundle_id),
            relay_details: Some("eden_network".into()),
            inclusion_probability,
            estimated_time_to_inclusion: estimated_time,
        })
    }
    
    async fn check_health(&self) -> Result<bool> {
        // Para verificar salud, hacer una solicitud simple al endpoint de estado
        let mut req = self.client.get(&format!("{}/v1/status", self.endpoint))
            .header("Accept", "application/json");
            
        // Añadir autenticación si está configurada
        if let Some(key) = &self.auth_key {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
            
        let res = req.send().await;
            
        match res {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }
    
    fn name(&self) -> &str {
        "Eden Network"
    }
}

// Estructuras para serialización/deserialización

#[derive(Debug, Serialize)]
struct EdenSimulationRequest {
    tx_list: Vec<String>,
    state_block_tag: String,
    gas_price: Option<String>,
    gas_limit: Option<u64>,
    timestamp: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct EdenSimulationResult {
    success: bool,
    error: Option<String>,
    state_block_number: Option<u64>,
    gas_used: Option<u64>,
    gas_price: Option<String>,
    value: Option<String>,
    estimated_wait_time_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
struct EdenBundleRequest {
    tx_list: Vec<String>,
    slot_priority: u8,
    max_block_number: Option<u64>,
    max_wait_blocks: u64,
    miner_reward: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EdenSendResponse {
    bundle_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_new_sender() {
        // Test con endpoint válido
        let sender = EdenSender::new(
            "https://api.edennetwork.io",
            None
        );
        assert!(sender.is_ok());
        
        // Test con endpoint inválido
        let sender = EdenSender::new(
            "http://insecure-endpoint.com", 
            None
        );
        assert!(sender.is_err());
    }
}
