use ethers::prelude::*;
use anyhow::{Result, anyhow};
use std::sync::Arc;
use std::time::Duration;
use std::str::FromStr;
use serde::{Deserialize, Serialize};
use crate::execution::bundle_senders::SendResult;

/// Implementación de envío de transacciones a través de Flashbots Protect
/// 
/// Flashbots Protect permite el envío privado de transacciones para evitar
/// ataques de frontrunning, proporciona simulación, y garantiza privacidad.
pub struct FlashbotsSender {
    /// URL del endpoint de Flashbots
    endpoint: String,
    /// Middleware para comunicación con Flashbots
    middleware: Option<Arc<FlashbotsMiddleware<SignerMiddleware<Provider<Http>, Wallet<SigningKey>>>>>,
    /// Clave de autenticación (opcional)
    auth_key: Option<String>,
}

/// Configuración para crear un bundle de Flashbots
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashbotsConfig {
    /// Bloque objetivo para la inclusión
    pub target_block: Option<u64>,
    /// Reemplazo de bundles anteriores
    pub replace_bundle: bool,
    /// Revelar bundle a otros builders
    pub privacy_mode: FlashbotsPrivacyMode,
    /// Recompensa para el builder en wei
    pub builder_reward_wei: Option<U256>,
}

/// Nivel de privacidad para Flashbots
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FlashbotsPrivacyMode {
    /// Privado (solo Flashbots)
    Private,
    /// Público (compartido con otros builders)
    Public,
    /// Compartido con builders específicos
    Shared(Vec<String>),
}

impl FlashbotsSender {
    /// Crea un nuevo sender de Flashbots
    pub fn new(endpoint: &str, auth_key: Option<&str>) -> Result<Self> {
        // Validar el endpoint
        if !endpoint.starts_with("https://") {
            return Err(anyhow!("El endpoint de Flashbots debe usar HTTPS"));
        }

        Ok(Self {
            endpoint: endpoint.to_string(),
            middleware: None,
            auth_key: auth_key.map(String::from),
        })
    }

    /// Inicializa el middleware con un signer
    async fn initialize_middleware(
        &mut self, 
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<Arc<FlashbotsMiddleware<SignerMiddleware<Provider<Http>, Wallet<SigningKey>>>>> {
        // Si ya tenemos un middleware, lo devolvemos
        if let Some(middleware) = &self.middleware {
            return Ok(middleware.clone());
        }

        // Crear una copia del provider
        let provider = signer.provider().clone();

        // Crear una wallet de autenticación
        let auth_wallet = if let Some(key) = &self.auth_key {
            let auth_key = SigningKey::from_bytes(
                &hex::decode(key.trim_start_matches("0x"))
                    .map_err(|e| anyhow!("Error decodificando clave de autenticación: {}", e))?
            )?;
            Wallet::from(auth_key)
        } else {
            // Sin clave de autenticación específica, usar una nueva
            Wallet::new(&mut rand::thread_rng())
        };

        // Crear middleware Flashbots
        let flashbots = FlashbotsMiddleware::new(
            provider,
            Url::from_str(&self.endpoint)?,
            auth_wallet,
            SignerMiddleware::new(
                Provider::try_from(self.endpoint.clone())?,
                signer.signer().clone(),
            ),
        );

        let arc_middleware = Arc::new(flashbots);
        self.middleware = Some(arc_middleware.clone());

        Ok(arc_middleware)
    }

    /// Simula una transacción a través de Flashbots
    async fn simulate_transaction(
        &mut self, 
        tx: &TypedTransaction,
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<flashbots::FlashbotsSimulation> {
        let fb_middleware = self.initialize_middleware(signer).await?;

        // Firmar la transacción
        let signature = signer.signer().sign_transaction(tx).await?;
        let signed_tx = tx.rlp_signed(&signature);
        
        // Simular
        let simulation = fb_middleware.simulate_bundle(
            vec![signed_tx],
            None, // Usar latest block
        ).await?;

        // Validar resultado
        if simulation.simulate_success() {
            Ok(simulation)
        } else {
            Err(anyhow!(
                "La simulación falló: {:?}", 
                simulation.simulation_error()
            ))
        }
    }
}

#[async_trait::async_trait]
impl crate::execution::bundle_senders::BundleSender for FlashbotsSender {
    fn relay_type(&self) -> crate::execution::bundle_senders::RelayType {
        crate::execution::bundle_senders::RelayType::Flashbots
    }
    
    async fn send_transaction(
        &self,
        tx: &TypedTransaction,
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult> {
        // Para Flashbots, enviar una sola transacción es como enviar un bundle de una
        self.send_bundle(&[tx.clone()], signer).await
    }
    
    async fn send_bundle(
        &self,
        txs: &[TypedTransaction],
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult> {
        // Clonar self para poder modificar middleware
        let mut sender = Self {
            endpoint: self.endpoint.clone(),
            middleware: self.middleware.clone(),
            auth_key: self.auth_key.clone(),
        };
        
        let fb_middleware = sender.initialize_middleware(signer).await?;
        
        // Firmar todas las transacciones
        let mut signed_txs = Vec::new();
        for tx in txs {
            let signature = signer.signer().sign_transaction(tx).await?;
            signed_txs.push(tx.rlp_signed(&signature));
        }
        
        // Configuración de bundle básica (target = next block)
        let block_num = signer.provider().get_block_number().await?;
        let target_block = block_num + 1;
        
        // Enviar bundle para el siguiente bloque
        let send_bundle_response = fb_middleware
            .send_bundle(signed_txs, target_block)
            .await?;
            
        // Validar resultado
        let bundle_hash = send_bundle_response.bundle_hash();
        
        if bundle_hash.is_none() {
            return Err(anyhow!("Error enviando bundle: hash vacío"));
        }
        
        // Calcular probabilidad de inclusión basado en el block number actual y el target
        let inclusion_probability = 0.8; // Valor ejemplar; en producción se calcularía en base a gas, congestión, etc.
        
        let first_tx = txs.first().ok_or_else(|| anyhow!("Bundle vacío"))?;
        let tx_hash = first_tx.hash();
        
        Ok(SendResult {
            tx_hash,
            simulation_id: Some(format!("{:?}", bundle_hash.unwrap())),
            relay_details: Some("flashbots_protect".into()),
            inclusion_probability,
            estimated_time_to_inclusion: 15, // ~15s por bloque en Ethereum
        })
    }
    
    async fn check_health(&self) -> Result<bool> {
        // Para verificar la salud, hacemos una solicitud simple al endpoint
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?;
            
        let res = client.get(&format!("{}/status", self.endpoint))
            .send()
            .await;
            
        match res {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }
    
    fn name(&self) -> &str {
        "Flashbots Protect"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    
    #[tokio::test]
    async fn test_new_sender() {
        // Test de creación con endpoint válido
        let sender = FlashbotsSender::new(
            "https://relay.flashbots.net",
            None
        );
        assert!(sender.is_ok());
        
        // Test con endpoint inválido
        let sender = FlashbotsSender::new(
            "http://insecure-endpoint.com",
            None
        );
        assert!(sender.is_err());
    }
}
