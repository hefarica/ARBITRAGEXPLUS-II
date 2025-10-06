use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize, Clone)]
pub struct AssetCfg {
    pub address: String,
    #[serde(default)]
    pub symbol: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChainCfg {
    pub chain_id: u64,
    #[serde(default)]
    pub name: String,
    // Acepta "ws", "wss" o "ws_url"
    #[serde(default, alias = "ws", alias = "wss")]
    pub ws_url: Option<String>,
    // Acepta "pools", "pool_addresses" o "pairs"
    #[serde(default, alias = "pool_addresses", alias = "pairs")]
    pub pools: Vec<String>,
    #[serde(default)]
    pub assets: Vec<AssetCfg>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ScanConfig {
    pub chains: Vec<ChainCfg>,
    // Acepta bridgedGroups y bridged_groups
    #[serde(default, alias = "bridged_groups")]
    pub bridgedGroups: BTreeMap<String, Vec<String>>,
    // Acepta prioritizeDex y prioritize_dex
    #[serde(default, alias = "prioritize_dex")]
    pub prioritizeDex: Vec<String>,

    // Opcional: también puedes definirlo en config en lugar de ENV
    #[serde(default, alias = "post_url")]
    pub postUrl: Option<String>,
    #[serde(default, alias = "post_api_key")]
    pub postApiKey: Option<String>,
}
