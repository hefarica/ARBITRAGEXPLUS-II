use ethers::prelude::*;
use anyhow::{Result, anyhow};
use std::time::Duration;
use std::str::FromStr;
use crate::execution::bundle_senders::SendResult;

/// Implementación de envío de transacciones públicas (fallback)
/// 
/// Este sender se utiliza como último recurso cuando los relays privados
/// no están disponibles o fallan. Envía transacciones directamente a través
/// de los métodos estándar de la red pública.
pub struct PublicSender {
    /// URL del endpoint público RPC
    endpoint: String,
    /// Provider RPC (usado para verificación de salud)
    provider: Option<Provider<Http>>,
}

impl PublicSender {
    /// Crea un nuevo sender público
    pub fn new(endpoint: &str) -> Result<Self> {
        // Validar el endpoint
        if !endpoint.starts_with("http://") && !endpoint.starts_with("https://") {
            return Err(anyhow!("El endpoint RPC debe comenzar con http:// o https://"));
        }

        Ok(Self {
            endpoint: endpoint.to_string(),
            provider: None,
        })
    }

    /// Inicializa el provider si aún no se ha hecho
    async fn ensure_provider(&mut self) -> Result<Provider<Http>> {
        if self.provider.is_none() {
            self.provider = Some(Provider::<Http>::try_from(&self.endpoint)?);
        }
        
        Ok(self.provider.clone().unwrap())
    }

    /// Espera y verifica la inclusión de una transacción
    async fn wait_for_inclusion(
        &self,
        tx_hash: TxHash,
        provider: &Provider<Http>,
        max_attempts: usize,
    ) -> Result<bool> {
        for i in 0..max_attempts {
            // Esperar entre intentos (tiempo exponencial de backoff)
            if i > 0 {
                tokio::time::sleep(Duration::from_secs(2u64.pow(i as u32))).await;
            }
            
            // Verificar si la transacción se ha incluido
            match provider.get_transaction_receipt(tx_hash).await {
                Ok(Some(receipt)) => {
                    // La transacción se ha incluido
                    return Ok(receipt.status == Some(U64::from(1)));
                }
                Ok(None) => {
                    // La transacción aún no se ha incluido
                    continue;
                }
                Err(e) => {
                    tracing::warn!(
                        "Error verificando inclusión de TX {}: {}",
                        tx_hash, e
                    );
                    // Continuar intentando, podría ser un error temporal
                    continue;
                }
            }
        }
        
        // Después de todos los intentos, la transacción no se ha incluido
        tracing::warn!(
            "TX {} no se incluyó después de {} intentos",
            tx_hash, max_attempts
        );
        Ok(false)
    }
}

#[async_trait::async_trait]
impl crate::execution::bundle_senders::BundleSender for PublicSender {
    fn relay_type(&self) -> crate::execution::bundle_senders::RelayType {
        crate::execution::bundle_senders::RelayType::Public
    }
    
    async fn send_transaction(
        &self,
        tx: &TypedTransaction,
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult> {
        // Enviar la transacción normalmente a través del signer
        let pending_tx = signer.send_transaction(tx.clone(), None).await?;
        let tx_hash = pending_tx.tx_hash();
        
        // Para transacciones públicas, la probabilidad de inclusión depende de muchos factores
        // Aquí usamos una estimación basada en congestionamiento, gasPrice, etc.
        let network_congestion = self.estimate_network_congestion(signer.provider()).await?;
        let inclusion_probability = match network_congestion {
            NetworkCongestion::Low => 0.95,
            NetworkCongestion::Medium => 0.80,
            NetworkCongestion::High => 0.60,
        };
        
        // Estimación de tiempo de inclusión
        let estimated_time = match network_congestion {
            NetworkCongestion::Low => 15,     // ~15s (1 bloque)
            NetworkCongestion::Medium => 45,  // ~45s (3 bloques)
            NetworkCongestion::High => 120,   // ~2min (8 bloques)
        };
        
        Ok(SendResult {
            tx_hash,
            simulation_id: None, // No hay simulación para envíos públicos
            relay_details: Some("public_mempool".into()),
            inclusion_probability,
            estimated_time_to_inclusion: estimated_time,
        })
    }
    
    async fn send_bundle(
        &self,
        txs: &[TypedTransaction],
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult> {
        if txs.is_empty() {
            return Err(anyhow!("No se pueden enviar bundles vacíos"));
        }
        
        // El método público no soporta bundles reales, así que enviamos cada TX individualmente
        let mut results = Vec::new();
        for tx in txs {
            match self.send_transaction(tx, signer).await {
                Ok(result) => results.push(result),
                Err(e) => {
                    tracing::error!("Error enviando TX pública: {}", e);
                }
            }
        }
        
        if results.is_empty() {
            return Err(anyhow!("Todas las transacciones del bundle fallaron"));
        }
        
        // Devolvemos la información de la primera transacción como representativa del bundle
        Ok(results.remove(0))
    }
    
    async fn check_health(&self) -> Result<bool> {
        // Para verificar salud, intentamos obtener el número de bloque actual
        let mut sender = Self {
            endpoint: self.endpoint.clone(),
            provider: self.provider.clone(),
        };
        
        let provider = sender.ensure_provider().await?;
        
        match provider.get_block_number().await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
    
    fn name(&self) -> &str {
        "Public RPC Fallback"
    }
}

impl PublicSender {
    /// Estima el nivel de congestionamiento de la red
    async fn estimate_network_congestion(&self, provider: &Provider<Http>) -> Result<NetworkCongestion> {
        // En producción, esto analizaría baseFee, pendingTxCount, gasPrice, etc.
        // Para simplificar, usamos solo el baseFee como indicador
        
        // Obtenemos el último bloque para analizar el baseFee
        let block = provider.get_block(BlockNumber::Latest).await?
            .ok_or_else(|| anyhow!("No se pudo obtener el último bloque"))?;
            
        // baseFee es un buen indicador del congestionamiento
        let congestion = if let Some(base_fee) = block.base_fee_per_gas {
            let base_fee_gwei = base_fee.as_u128() as f64 / 1_000_000_000.0;
            
            // Estos umbrales varían por cadena, pero son aproximados para Ethereum
            if base_fee_gwei < 20.0 {
                NetworkCongestion::Low
            } else if base_fee_gwei < 100.0 {
                NetworkCongestion::Medium
            } else {
                NetworkCongestion::High
            }
        } else {
            // Si no hay baseFee (no EIP-1559), usamos un valor por defecto
            NetworkCongestion::Medium
        };
        
        Ok(congestion)
    }
}

/// Nivel estimado de congestionamiento de la red
enum NetworkCongestion {
    /// Bajo congestionamiento (transacciones se incluyen rápidamente)
    Low,
    /// Medio congestionamiento
    Medium,
    /// Alto congestionamiento (transacciones pueden tardar varios bloques)
    High,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_new_sender() {
        // Test con endpoint válido HTTP
        let sender = PublicSender::new("http://localhost:8545");
        assert!(sender.is_ok());
        
        // Test con endpoint válido HTTPS
        let sender = PublicSender::new("https://mainnet.infura.io/v3/example");
        assert!(sender.is_ok());
        
        // Test con endpoint inválido
        let sender = PublicSender::new("invalid-url");
        assert!(sender.is_err());
    }
}
