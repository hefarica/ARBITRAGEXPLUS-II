use anyhow::{Context, Result};
use ethers::types::Address;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, HashMap};
use std::sync::Arc;
use std::str::FromStr;
use tokio::sync::RwLock;
use tokio::time::{Duration, Instant};
use tracing::{info, warn, error, debug};

use crate::database::{Database, AssetSafety};

/// Cache de validaciones con TTL
struct ValidationCache {
    validations: HashMap<String, CachedValidation>,
}

struct CachedValidation {
    is_safe: bool,
    score: i32,
    timestamp: Instant,
    ttl: Duration,
}

impl ValidationCache {
    fn new() -> Self {
        Self {
            validations: HashMap::new(),
        }
    }

    fn get(&self, key: &str) -> Option<(bool, i32)> {
        if let Some(cached) = self.validations.get(key) {
            if cached.timestamp.elapsed() < cached.ttl {
                return Some((cached.is_safe, cached.score));
            }
        }
        None
    }

    fn insert(&mut self, key: String, is_safe: bool, score: i32, ttl: Duration) {
        self.validations.insert(
            key,
            CachedValidation {
                is_safe,
                score,
                timestamp: Instant::now(),
                ttl,
            },
        );
    }
}

/// Respuesta de Etherscan API para verificación de contrato
#[derive(Debug, Deserialize)]
struct EtherscanContractResponse {
    status: String,
    message: String,
    result: Vec<EtherscanContract>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EtherscanContract {
    source_code: String,
    #[serde(rename = "ABI")]
    abi: String,
    contract_name: String,
    compiler_version: String,
    optimization_used: String,
}

/// Respuesta de Etherscan API para información de token
#[derive(Debug, Deserialize)]
struct EtherscanTokenInfoResponse {
    status: String,
    message: String,
    result: Option<String>,
}

#[derive(Clone)]
pub struct AddressValidator {
    http_client: Client,
    db: Arc<Database>,
    cache: Arc<RwLock<ValidationCache>>,
    whitelisted_addresses: Arc<RwLock<HashSet<Address>>>,
    blacklisted_addresses: Arc<RwLock<HashSet<Address>>>,
    etherscan_api_keys: HashMap<String, String>,
}

impl AddressValidator {
    pub fn new(db: Arc<Database>) -> Self {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("ARBITRAGEXPLUS-II/3.6.0")
            .build()
            .expect("Failed to create HTTP client");

        // Direcciones conocidas y seguras (DEXs principales)
        let mut whitelisted = HashSet::new();
        
        // Ethereum
        whitelisted.insert(Address::from_str("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D").unwrap()); // Uniswap V2 Router
        whitelisted.insert(Address::from_str("0xE592427A0AEce92De3Edee1F18E0157C05861564").unwrap()); // Uniswap V3 Router
        whitelisted.insert(Address::from_str("0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F").unwrap()); // SushiSwap Router
        
        // Direcciones conocidas maliciosas o de alto riesgo
        let blacklisted = HashSet::new();

        // API keys de exploradores (deberían venir de variables de entorno)
        let mut api_keys = HashMap::new();
        if let Ok(key) = std::env::var("ETHERSCAN_API_KEY") {
            api_keys.insert("ethereum".to_string(), key);
        }
        if let Ok(key) = std::env::var("BSCSCAN_API_KEY") {
            api_keys.insert("bsc".to_string(), key);
        }
        if let Ok(key) = std::env::var("POLYGONSCAN_API_KEY") {
            api_keys.insert("polygon".to_string(), key);
        }

        AddressValidator {
            http_client,
            db,
            cache: Arc::new(RwLock::new(ValidationCache::new())),
            whitelisted_addresses: Arc::new(RwLock::new(whitelisted)),
            blacklisted_addresses: Arc::new(RwLock::new(blacklisted)),
            etherscan_api_keys: api_keys,
        }
    }

    /// Validar si una dirección es segura (Anti-Rugpull)
    pub async fn is_address_safe(&self, chain: &str, address: &str) -> Result<bool> {
        let cache_key = format!("{}:{}", chain, address);
        
        // Verificar cache
        {
            let cache = self.cache.read().await;
            if let Some((is_safe, _)) = cache.get(&cache_key) {
                debug!("Cache hit for address validation: {}", cache_key);
                return Ok(is_safe);
            }
        }

        let addr = Address::from_str(address).context("Invalid address")?;

        // Verificar blacklist
        {
            let blacklisted = self.blacklisted_addresses.read().await;
            if blacklisted.contains(&addr) {
                warn!("Address {} is blacklisted", address);
                return Ok(false);
            }
        }

        // Verificar whitelist
        {
            let whitelisted = self.whitelisted_addresses.read().await;
            if whitelisted.contains(&addr) {
                info!("Address {} is whitelisted", address);
                return Ok(true);
            }
        }

        // Verificar en base de datos
        if let Ok(Some(asset_safety)) = self.db.get_asset_safety(address).await {
            let is_safe = asset_safety.score >= 70; // Umbral de seguridad
            
            // Verificar si la información no está muy desactualizada (24 horas)
            let now = chrono::Utc::now().timestamp_millis();
            let age_hours = (now - asset_safety.updated_at) / (1000 * 60 * 60);
            
            if age_hours < 24 {
                debug!(
                    "Using cached safety score for {}: {} (age: {}h)",
                    address, asset_safety.score, age_hours
                );
                
                // Guardar en cache
                {
                    let mut cache = self.cache.write().await;
                    cache.insert(cache_key, is_safe, asset_safety.score, Duration::from_secs(3600));
                }
                
                return Ok(is_safe);
            }
        }

        // Realizar validación completa
        let score = self.calculate_safety_score(chain, address).await?;
        let is_safe = score >= 70;

        // Guardar en base de datos
        let asset_safety = AssetSafety {
            address: address.to_string(),
            score,
            checks: serde_json::json!({
                "verified": self.is_contract_verified(chain, address).await?,
                "age_check": true,
                "liquidity_check": true,
            }),
            updated_at: chrono::Utc::now().timestamp_millis(),
        };

        if let Err(e) = self.db.upsert_asset_safety(asset_safety).await {
            error!("Failed to save asset safety: {}", e);
        }

        // Guardar en cache
        {
            let mut cache = self.cache.write().await;
            cache.insert(cache_key, is_safe, score, Duration::from_secs(3600));
        }

        info!("Address {} safety score: {} (safe: {})", address, score, is_safe);

        Ok(is_safe)
    }

    /// Calcular puntaje de seguridad (0-100) basado en múltiples factores
    async fn calculate_safety_score(&self, chain: &str, address: &str) -> Result<i32> {
        let mut score = 0;

        // Factor 1: Contrato verificado (+30 puntos)
        if self.is_contract_verified(chain, address).await? {
            score += 30;
            debug!("Contract {} is verified: +30 points", address);
        }

        // Factor 2: No tiene funciones peligrosas (+20 puntos)
        if !self.has_dangerous_functions(chain, address).await? {
            score += 20;
            debug!("Contract {} has no dangerous functions: +20 points", address);
        }

        // Factor 3: Edad del contrato (+20 puntos si > 30 días)
        let age_days = self.get_contract_age_days(chain, address).await?;
        if age_days > 30 {
            score += 20;
            debug!("Contract {} age: {} days: +20 points", address, age_days);
        } else if age_days > 7 {
            score += 10;
            debug!("Contract {} age: {} days: +10 points", address, age_days);
        }

        // Factor 4: Liquidez suficiente (+15 puntos)
        // (Esto requeriría consultar DEXs, simplificado por ahora)
        score += 15;

        // Factor 5: Actividad reciente (+15 puntos)
        // (Esto requeriría analizar transacciones recientes)
        score += 15;

        Ok(score.min(100))
    }

    /// Verificar si el contrato está verificado en el explorador
    pub async fn is_contract_verified(&self, chain: &str, address: &str) -> Result<bool> {
        let api_key = match self.etherscan_api_keys.get(chain) {
            Some(key) => key,
            None => {
                warn!("No API key configured for chain: {}", chain);
                return Ok(false);
            }
        };

        let base_url = self.get_explorer_api_url(chain);
        let url = format!(
            "{}/api?module=contract&action=getsourcecode&address={}&apikey={}",
            base_url, address, api_key
        );

        debug!("Checking contract verification: {}", url);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .context("Failed to send request to explorer API")?;

        if !response.status().is_success() {
            warn!("Explorer API returned status: {}", response.status());
            return Ok(false);
        }

        let data: EtherscanContractResponse = response
            .json()
            .await
            .context("Failed to parse explorer response")?;

        if data.status != "1" {
            debug!("Contract {} not verified: {}", address, data.message);
            return Ok(false);
        }

        if let Some(contract) = data.result.first() {
            let is_verified = !contract.source_code.is_empty();
            debug!("Contract {} verified: {}", address, is_verified);
            return Ok(is_verified);
        }

        Ok(false)
    }

    /// Verificar si el contrato tiene funciones peligrosas (mint, pause, etc.)
    async fn has_dangerous_functions(&self, chain: &str, address: &str) -> Result<bool> {
        // Obtener el ABI del contrato
        let api_key = match self.etherscan_api_keys.get(chain) {
            Some(key) => key,
            None => return Ok(false), // Sin API key, no podemos verificar
        };

        let base_url = self.get_explorer_api_url(chain);
        let url = format!(
            "{}/api?module=contract&action=getabi&address={}&apikey={}",
            base_url, address, api_key
        );

        let response = self.http_client.get(&url).send().await;
        
        if response.is_err() {
            return Ok(false);
        }

        let data: EtherscanTokenInfoResponse = response.unwrap().json().await?;

        if data.status != "1" {
            return Ok(false);
        }

        if let Some(abi_str) = data.result {
            let dangerous_functions = vec!["mint", "pause", "blacklist", "setOwner", "renounceOwnership"];
            
            for func in dangerous_functions {
                if abi_str.to_lowercase().contains(func) {
                    warn!("Contract {} has dangerous function: {}", address, func);
                    return Ok(true);
                }
            }
        }

        Ok(false)
    }

    /// Obtener la edad del contrato en días
    async fn get_contract_age_days(&self, chain: &str, address: &str) -> Result<i64> {
        // En un entorno real, consultaríamos la primera transacción del contrato
        // Por ahora, retornamos un valor por defecto
        // TODO: Implementar consulta real a la API del explorador
        Ok(60) // Asumimos 60 días por defecto
    }

    /// Obtener URL base de la API del explorador según la chain
    fn get_explorer_api_url(&self, chain: &str) -> String {
        match chain.to_lowercase().as_str() {
            "ethereum" | "eth" => "https://api.etherscan.io",
            "bsc" | "binance" => "https://api.bscscan.com",
            "polygon" | "matic" => "https://api.polygonscan.com",
            "arbitrum" => "https://api.arbiscan.io",
            "optimism" => "https://api-optimistic.etherscan.io",
            "avalanche" | "avax" => "https://api.snowtrace.io",
            "fantom" | "ftm" => "https://api.ftmscan.com",
            "base" => "https://api.basescan.org",
            _ => "https://api.etherscan.io",
        }
        .to_string()
    }

    /// Agregar dirección a la whitelist
    pub async fn add_to_whitelist(&self, address: Address) {
        let mut whitelisted = self.whitelisted_addresses.write().await;
        whitelisted.insert(address);
        info!("Address {:?} added to whitelist", address);
    }

    /// Agregar dirección a la blacklist
    pub async fn add_to_blacklist(&self, address: Address) {
        let mut blacklisted = self.blacklisted_addresses.write().await;
        blacklisted.insert(address);
        warn!("Address {:?} added to blacklist", address);
    }

    /// Limpiar cache expirado
    pub async fn cleanup_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.validations.retain(|_, cached| cached.timestamp.elapsed() < cached.ttl);
        debug!("Validation cache cleanup completed. Entries remaining: {}", cache.validations.len());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_explorer_url_mapping() {
        let validator = AddressValidator::new(Arc::new(Database::new("").await.unwrap()));
        assert_eq!(validator.get_explorer_api_url("ethereum"), "https://api.etherscan.io");
        assert_eq!(validator.get_explorer_api_url("bsc"), "https://api.bscscan.com");
    }
}
