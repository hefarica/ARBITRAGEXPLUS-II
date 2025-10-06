use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize, Clone)]
pub struct AssetCfg { 
    pub address: String, 
    #[serde(default)] 
    pub symbol: Option<String> 
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChainCfg {
    pub chain_id: u64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)] 
    pub ws: Option<String>,
    #[serde(default)] 
    pub pools: Vec<String>,
    #[serde(default)] 
    pub assets: Vec<AssetCfg>,
}

#[derive(Debug, Deserialize)]
pub struct ScanConfig {
    pub chains: Vec<ChainCfg>,
    #[serde(default)] 
    pub bridgedGroups: BTreeMap<String, Vec<String>>,
    #[serde(default)] 
    pub prioritizeDex: Vec<String>,
}
