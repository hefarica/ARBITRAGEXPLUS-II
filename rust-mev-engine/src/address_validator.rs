use ethers::types::Address;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Clone)]
pub struct AddressValidator {
    // En un entorno de producción, esto podría ser una base de datos
    // o un servicio externo que mantenga una lista de direcciones seguras/conocidas.
    whitelisted_addresses: Arc<RwLock<HashSet<Address>>>,
    blacklisted_addresses: Arc<RwLock<HashSet<Address>>>,
}

impl AddressValidator {
    pub fn new() -> Self {
        let mut whitelisted = HashSet::new();
        // Ejemplo: Añadir una dirección de contrato DEX conocida y segura
        whitelisted.insert("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D".parse().unwrap()); // Uniswap V2 Router
        whitelisted.insert("0xE592427A0AEce92De3Edee1F18E0157C05861564".parse().unwrap()); // Uniswap V3 Router

        let blacklisted = HashSet::new();
        // Ejemplo: Añadir una dirección de contrato malicioso conocida
        // blacklisted.insert("0xBadAddress12345678901234567890123456789012".parse().unwrap());

        AddressValidator {
            whitelisted_addresses: Arc::new(RwLock::new(whitelisted)),
            blacklisted_addresses: Arc::new(RwLock::new(blacklisted)),
        }
    }

    pub async fn is_address_safe(&self, address: &Address) -> bool {
        let blacklisted = self.blacklisted_addresses.read().await;
        if blacklisted.contains(address) {
            warn!("Address {:?} is blacklisted.", address);
            return false;
        }
        drop(blacklisted);

        // Para contratos que no están en la lista negra, se puede implementar
        // una lógica de validación más profunda, como verificar el código del contrato,
        // la reputación, o si es un contrato proxy conocido.
        // Por ahora, si no está en la lista negra, lo consideramos 'seguro' para la simulación.
        true
    }

    pub async fn is_contract_verified(&self, address: &Address) -> bool {
        // En un entorno real, esto implicaría consultar un servicio como Etherscan API
        // para verificar si el código fuente del contrato ha sido verificado.
        // Para esta simulación, asumimos que los contratos en la whitelist están verificados.
        let whitelisted = self.whitelisted_addresses.read().await;
        if whitelisted.contains(address) {
            info!("Contract {:?} is whitelisted and assumed verified.", address);
            return true;
        }
        false
    }

    pub async fn add_to_whitelist(&self, address: Address) {
        let mut whitelisted = self.whitelisted_addresses.write().await;
        whitelisted.insert(address);
        info!("Address {:?} added to whitelist.", address);
    }

    pub async fn add_to_blacklist(&self, address: Address) {
        let mut blacklisted = self.blacklisted_addresses.write().await;
        blacklisted.insert(address);
        warn!("Address {:?} added to blacklist.", address);
    }
}

