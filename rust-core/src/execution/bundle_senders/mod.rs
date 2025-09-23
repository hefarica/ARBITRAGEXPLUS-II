/// Módulo de Bundle Senders para envío de transacciones
///
/// Este módulo contiene implementaciones para diferentes mecanismos
/// de envío de transacciones, incluyendo relays privados (Flashbots, MEV-Share, Eden)
/// y envío público estándar como fallback.

pub mod flashbots;
pub mod mev_share;
pub mod eden;
pub mod public_fallback;

use anyhow::Result;
use ethers::prelude::*;
use ethers::types::transaction::eip2718::TypedTransaction;
use serde::{Deserialize, Serialize};

/// Resultado del envío de una transacción
#[derive(Debug, Clone)]
pub struct SendResult {
    /// Hash de la transacción
    pub tx_hash: TxHash,
    /// ID de la simulación o del bundle (si aplica)
    pub simulation_id: Option<String>,
    /// Detalles adicionales específicos del relay
    pub relay_details: Option<String>,
    /// Estimación de probabilidad de inclusión (0.0-1.0)
    pub inclusion_probability: f64,
    /// Tiempo estimado para la inclusión (en segundos)
    pub estimated_time_to_inclusion: u64,
}

/// Tipos de relays soportados
#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum RelayType {
    /// Flashbots Protect (o Flashbots compatible)
    Flashbots,
    /// MEV-Share (o compatible)
    MevShare,
    /// Eden Network
    Eden,
    /// Envío público (fallback)
    Public,
}

/// Configuración para un relay
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RelayConfig {
    /// Tipo de relay
    pub relay_type: RelayType,
    /// URL del endpoint
    pub endpoint: String,
    /// Clave de autenticación (si es necesaria)
    pub auth_key: Option<String>,
    /// Prioridad (menor = mayor prioridad)
    pub priority: u8,
    /// Peso para distribución de carga (0-100)
    pub weight: u8,
}

/// Interfaz común para todos los relays
#[async_trait::async_trait]
pub trait BundleSender: Send + Sync {
    /// Devuelve el tipo de relay
    fn relay_type(&self) -> RelayType;
    
    /// Envía una transacción
    async fn send_transaction(
        &self,
        tx: &TypedTransaction,
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult>;
    
    /// Envía un bundle de transacciones
    async fn send_bundle(
        &self,
        txs: &[TypedTransaction],
        signer: &SignerMiddleware<Provider<Http>, Wallet<SigningKey>>,
    ) -> Result<SendResult>;
    
    /// Verifica si el relay está activo
    async fn check_health(&self) -> Result<bool>;
    
    /// Obtiene el nombre del relay
    fn name(&self) -> &str;
}

/// Factory para crear senders según configuración dinámica
pub fn create_sender(config: &RelayConfig) -> Result<Box<dyn BundleSender>> {
    match config.relay_type {
        RelayType::Flashbots => {
            Ok(Box::new(flashbots::FlashbotsSender::new(
                &config.endpoint,
                config.auth_key.as_deref(),
            )?))
        },
        RelayType::MevShare => {
            Ok(Box::new(mev_share::MevShareSender::new(
                &config.endpoint,
                config.auth_key.as_deref(),
            )?))
        },
        RelayType::Eden => {
            Ok(Box::new(eden::EdenSender::new(
                &config.endpoint,
                config.auth_key.as_deref(),
            )?))
        },
        RelayType::Public => {
            Ok(Box::new(public_fallback::PublicSender::new(&config.endpoint)?))
        },
    }
}
