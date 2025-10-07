use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, Instant};
use tracing::{info, warn, error, debug};

/// Cache de precios con TTL
struct PriceCache {
    prices: HashMap<String, CachedPrice>,
}

struct CachedPrice {
    price: f64,
    timestamp: Instant,
    ttl: Duration,
}

impl PriceCache {
    fn new() -> Self {
        Self {
            prices: HashMap::new(),
        }
    }

    fn get(&self, key: &str) -> Option<f64> {
        if let Some(cached) = self.prices.get(key) {
            if cached.timestamp.elapsed() < cached.ttl {
                return Some(cached.price);
            }
        }
        None
    }

    fn insert(&mut self, key: String, price: f64, ttl: Duration) {
        self.prices.insert(
            key,
            CachedPrice {
                price,
                timestamp: Instant::now(),
                ttl,
            },
        );
    }
}

/// Cliente para obtener precios de múltiples fuentes
pub struct PriceFeedClient {
    http_client: Client,
    cache: Arc<RwLock<PriceCache>>,
    dexscreener_base_url: String,
    geckoterminal_base_url: String,
}

/// Respuesta de DexScreener API
#[derive(Debug, Deserialize)]
struct DexScreenerResponse {
    pairs: Option<Vec<DexScreenerPair>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DexScreenerPair {
    chain_id: String,
    dex_id: String,
    price_usd: Option<String>,
    price_native: Option<String>,
    liquidity: Option<DexScreenerLiquidity>,
    volume: Option<DexScreenerVolume>,
    #[serde(rename = "priceChange")]
    price_change: Option<DexScreenerPriceChange>,
}

#[derive(Debug, Deserialize)]
struct DexScreenerLiquidity {
    usd: Option<f64>,
    base: Option<f64>,
    quote: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DexScreenerVolume {
    h24: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DexScreenerPriceChange {
    h24: Option<f64>,
}

/// Respuesta de GeckoTerminal API
#[derive(Debug, Deserialize)]
struct GeckoTerminalResponse {
    data: Option<GeckoTerminalData>,
}

#[derive(Debug, Deserialize)]
struct GeckoTerminalData {
    attributes: Option<GeckoTerminalAttributes>,
}

#[derive(Debug, Deserialize)]
struct GeckoTerminalAttributes {
    base_token_price_usd: Option<String>,
    quote_token_price_usd: Option<String>,
    #[serde(rename = "reserve_in_usd")]
    reserve_in_usd: Option<String>,
}

/// Información de precio agregada
#[derive(Debug, Clone, Serialize)]
pub struct PriceInfo {
    pub price_usd: f64,
    pub liquidity_usd: Option<f64>,
    pub volume_24h: Option<f64>,
    pub price_change_24h: Option<f64>,
    pub source: String,
    pub timestamp: i64,
}

impl Default for PriceFeedClient {
    fn default() -> Self {
        Self::new()
    }
}

impl PriceFeedClient {
    pub fn new() -> Self {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("ARBITRAGEXPLUS-II/3.6.0")
            .build()
            .expect("Failed to create HTTP client");

        Self {
            http_client,
            cache: Arc::new(RwLock::new(PriceCache::new())),
            dexscreener_base_url: "https://api.dexscreener.com/latest".to_string(),
            geckoterminal_base_url: "https://api.geckoterminal.com/api/v2".to_string(),
        }
    }

    /// Obtener precio de un token desde DexScreener
    pub async fn get_price_dexscreener(
        &self,
        chain: &str,
        token_address: &str,
    ) -> Result<Option<PriceInfo>> {
        let cache_key = format!("dexscreener:{}:{}", chain, token_address);
        
        // Verificar cache
        {
            let cache = self.cache.read().await;
            if let Some(price) = cache.get(&cache_key) {
                debug!("Cache hit for {}", cache_key);
                return Ok(Some(PriceInfo {
                    price_usd: price,
                    liquidity_usd: None,
                    volume_24h: None,
                    price_change_24h: None,
                    source: "dexscreener_cached".to_string(),
                    timestamp: chrono::Utc::now().timestamp(),
                }));
            }
        }

        // Mapeo de nombres de chain a chain_id de DexScreener
        let chain_id = self.map_chain_to_dexscreener(chain);
        
        let url = format!(
            "{}/dex/tokens/{}",
            self.dexscreener_base_url, token_address
        );

        debug!("Fetching price from DexScreener: {}", url);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .context("Failed to send request to DexScreener")?;

        if !response.status().is_success() {
            warn!("DexScreener API returned status: {}", response.status());
            return Ok(None);
        }

        let data: DexScreenerResponse = response
            .json()
            .await
            .context("Failed to parse DexScreener response")?;

        if let Some(pairs) = data.pairs {
            // Filtrar por chain y buscar el par con mayor liquidez
            let filtered_pairs: Vec<_> = pairs
                .into_iter()
                .filter(|p| p.chain_id.to_lowercase() == chain_id.to_lowercase())
                .collect();

            if let Some(best_pair) = filtered_pairs
                .iter()
                .max_by(|a, b| {
                    let liq_a = a.liquidity.as_ref().and_then(|l| l.usd).unwrap_or(0.0);
                    let liq_b = b.liquidity.as_ref().and_then(|l| l.usd).unwrap_or(0.0);
                    liq_a.partial_cmp(&liq_b).unwrap_or(std::cmp::Ordering::Equal)
                })
            {
                if let Some(price_str) = &best_pair.price_usd {
                    if let Ok(price) = price_str.parse::<f64>() {
                        // Guardar en cache (TTL: 30 segundos)
                        {
                            let mut cache = self.cache.write().await;
                            cache.insert(cache_key, price, Duration::from_secs(30));
                        }

                        return Ok(Some(PriceInfo {
                            price_usd: price,
                            liquidity_usd: best_pair.liquidity.as_ref().and_then(|l| l.usd),
                            volume_24h: best_pair.volume.as_ref().and_then(|v| v.h24),
                            price_change_24h: best_pair
                                .price_change
                                .as_ref()
                                .and_then(|pc| pc.h24),
                            source: "dexscreener".to_string(),
                            timestamp: chrono::Utc::now().timestamp(),
                        }));
                    }
                }
            }
        }

        Ok(None)
    }

    /// Obtener precio de un pool desde GeckoTerminal
    pub async fn get_price_geckoterminal(
        &self,
        network: &str,
        pool_address: &str,
    ) -> Result<Option<PriceInfo>> {
        let cache_key = format!("geckoterminal:{}:{}", network, pool_address);
        
        // Verificar cache
        {
            let cache = self.cache.read().await;
            if let Some(price) = cache.get(&cache_key) {
                debug!("Cache hit for {}", cache_key);
                return Ok(Some(PriceInfo {
                    price_usd: price,
                    liquidity_usd: None,
                    volume_24h: None,
                    price_change_24h: None,
                    source: "geckoterminal_cached".to_string(),
                    timestamp: chrono::Utc::now().timestamp(),
                }));
            }
        }

        let network_id = self.map_chain_to_geckoterminal(network);
        
        let url = format!(
            "{}/networks/{}/pools/{}",
            self.geckoterminal_base_url, network_id, pool_address
        );

        debug!("Fetching price from GeckoTerminal: {}", url);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .context("Failed to send request to GeckoTerminal")?;

        if !response.status().is_success() {
            warn!("GeckoTerminal API returned status: {}", response.status());
            return Ok(None);
        }

        let data: GeckoTerminalResponse = response
            .json()
            .await
            .context("Failed to parse GeckoTerminal response")?;

        if let Some(pool_data) = data.data {
            if let Some(attrs) = pool_data.attributes {
                if let Some(price_str) = attrs.base_token_price_usd {
                    if let Ok(price) = price_str.parse::<f64>() {
                        // Guardar en cache (TTL: 30 segundos)
                        {
                            let mut cache = self.cache.write().await;
                            cache.insert(cache_key, price, Duration::from_secs(30));
                        }

                        let liquidity = attrs
                            .reserve_in_usd
                            .and_then(|s| s.parse::<f64>().ok());

                        return Ok(Some(PriceInfo {
                            price_usd: price,
                            liquidity_usd: liquidity,
                            volume_24h: None,
                            price_change_24h: None,
                            source: "geckoterminal".to_string(),
                            timestamp: chrono::Utc::now().timestamp(),
                        }));
                    }
                }
            }
        }

        Ok(None)
    }

    /// Obtener precio con fallback: intenta DexScreener primero, luego GeckoTerminal
    pub async fn get_price_with_fallback(
        &self,
        chain: &str,
        token_address: &str,
        pool_address: Option<&str>,
    ) -> Result<Option<PriceInfo>> {
        // Intentar DexScreener primero
        match self.get_price_dexscreener(chain, token_address).await {
            Ok(Some(price)) => {
                info!(
                    "Got price for {} on {}: ${} from DexScreener",
                    token_address, chain, price.price_usd
                );
                return Ok(Some(price));
            }
            Ok(None) => {
                debug!("No price found on DexScreener, trying GeckoTerminal");
            }
            Err(e) => {
                warn!("DexScreener error: {}, trying GeckoTerminal", e);
            }
        }

        // Fallback a GeckoTerminal si tenemos pool_address
        if let Some(pool_addr) = pool_address {
            match self.get_price_geckoterminal(chain, pool_addr).await {
                Ok(Some(price)) => {
                    info!(
                        "Got price for {} on {}: ${} from GeckoTerminal",
                        token_address, chain, price.price_usd
                    );
                    return Ok(Some(price));
                }
                Ok(None) => {
                    warn!("No price found on GeckoTerminal either");
                }
                Err(e) => {
                    error!("GeckoTerminal error: {}", e);
                }
            }
        }

        Ok(None)
    }

    /// Mapear nombre de chain a chain_id de DexScreener
    fn map_chain_to_dexscreener(&self, chain: &str) -> String {
        match chain.to_lowercase().as_str() {
            "ethereum" | "eth" => "ethereum",
            "bsc" | "binance" => "bsc",
            "polygon" | "matic" => "polygon",
            "arbitrum" => "arbitrum",
            "optimism" => "optimism",
            "avalanche" | "avax" => "avalanche",
            "base" => "base",
            "fantom" | "ftm" => "fantom",
            "celo" => "celo",
            "moonbeam" => "moonbeam",
            "cronos" => "cronos",
            _ => chain,
        }
        .to_string()
    }

    /// Mapear nombre de chain a network_id de GeckoTerminal
    fn map_chain_to_geckoterminal(&self, chain: &str) -> String {
        match chain.to_lowercase().as_str() {
            "ethereum" | "eth" => "eth",
            "bsc" | "binance" => "bsc",
            "polygon" | "matic" => "polygon_pos",
            "arbitrum" => "arbitrum",
            "optimism" => "optimism",
            "avalanche" | "avax" => "avax",
            "base" => "base",
            "fantom" | "ftm" => "ftm",
            "celo" => "celo",
            _ => chain,
        }
        .to_string()
    }

    /// Limpiar cache expirado
    pub async fn cleanup_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.prices.retain(|_, cached| cached.timestamp.elapsed() < cached.ttl);
        debug!("Cache cleanup completed. Entries remaining: {}", cache.prices.len());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_price_feed_client_creation() {
        let client = PriceFeedClient::new();
        assert_eq!(client.dexscreener_base_url, "https://api.dexscreener.com/latest");
    }
}
