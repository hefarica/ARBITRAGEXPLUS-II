use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};

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


use ethers::types::Address;

// Representación de una Blockchain
#[derive(Debug, Clone)]
pub struct Blockchain {
    pub id: String,
    pub name: String,
    pub rpc_url: String,
    pub chain_id: u64,
    pub dex_protocols: Vec<DexProtocol>,
    pub monitored_assets: Vec<Asset>,
}

// Representación de un Protocolo DEX
#[derive(Debug, Clone)]
pub struct DexProtocol {
    pub id: String,
    pub name: String,
    pub router_address: Address, // Dirección del router del DEX
    pub factory_address: Address, // Dirección de la fábrica de pools
    // Otros detalles específicos del DEX (ej. tipo de AMM, fees)
    pub fee_rate: f64, // Tasa de comisión por swap
}

// Representación de un Activo (Token)
#[derive(Debug, Clone, PartialEq)]
pub struct Asset {
    pub symbol: String,
    pub address: Address,
    pub decimals: u8,
    pub price_usd: f64, // Precio en tiempo real
}

// Representación de un Pool de Liquidez
#[derive(Debug, Clone)]
pub struct LiquidityPool {
    pub address: Address,
    pub token0: Asset,
    pub token1: Asset,
    pub reserve0: f64,
    pub reserve1: f64,
    pub fee: f64,
    pub dex_id: String, // ID del DEX al que pertenece
}

// Una operación atómica dentro de un kit de armado
#[derive(Debug, Clone)]
pub enum ArbitrageOperation {
    Flashloan {
        token: Asset,
        amount: f64,
        provider: String,
        provider_address: Address,
    },
    Swap {
        dex: DexProtocol,
        token_in: Asset,
        amount_in: f64,
        token_out: Asset,
        min_amount_out: f64,
        pool_address: Address,
    },
    Liquidation {
        protocol: String,
        protocol_address: Address,
        collateral: Asset,
        debt: Asset,
        amount_to_liquidate: f64,
    },
    // ... otras operaciones
}

// Un Kit de Armado de Arbitraje
#[derive(Debug, Clone)]
pub struct ArbitrageKit {
    pub id: String,
    pub operations: Vec<ArbitrageOperation>,
    pub estimated_profit: f64,
    pub estimated_gas_cost: f64,
    pub blockchain_id: String,
    pub timestamp: u64,
    pub validated_addresses: HashMap<String, Address>, // Direcciones validadas para el kit
}

// HashMap para almacenar y acceder rápidamente a los datos
pub type BlockchainMap = HashMap<String, Blockchain>;
pub type DexProtocolMap = HashMap<String, DexProtocol>;
pub type AssetMap = HashMap<String, Asset>;
pub type LiquidityPoolMap = HashMap<String, LiquidityPool>;



// Estructuras para el motor matemático
#[derive(Debug, Clone)]
pub struct PoolReserves {
    pub reserve_a: f64,
    pub reserve_b: f64,
}

#[derive(Debug, Clone)]
pub struct DexFees {
    pub fee_rate_pool1: f64,
    pub fee_rate_pool2: f64,
}

#[derive(Debug, Clone)]
pub struct GasCostEstimator {
    pub fixed_cost: f64,
}


impl GasCostEstimator {
    pub fn estimate_cost(&self, _x_in: f64) -> f64 {
        // En un bot real, esto sería dinámico y dependería de x_in y la congestión de la red
        self.fixed_cost
    }
}


// Type alias para compatibilidad con código existente
pub type KitDeArmado = ArbitrageKit;
