#![allow(dead_code)]
#![allow(unused_variables)]
#![allow(unused_imports)]
#![allow(non_snake_case)]

use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
struct DexPair {
    #[serde(rename = "chainId")]
    chain_id: String,
    #[serde(rename = "dexId")]
    dex_id: String,
    #[serde(rename = "priceUsd")]
    price_usd: String,
    liquidity: Option<Liquidity>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Liquidity {
    usd: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DexScreenerResponse {
    pairs: Option<Vec<DexPair>>,
}

#[derive(Debug)]
struct Opportunity {
    chain_id: i64,
    dex_in: String,
    dex_out: String,
    base_token: String,
    quote_token: String,
    amount_in: String,
    est_profit_usd: f64,
    gas_usd: f64,
    ts: i64,
}

#[derive(Debug, Deserialize)]
struct PairConfig {
    name: String,
    token0: String,
    token1: String,
    #[serde(rename = "pairAddress")]
    pair_address: String,
}

#[derive(Debug, Deserialize)]
struct ChainConfig {
    name: String,
    #[serde(rename = "chainId")]
    chain_id: i64,
    dexs: Vec<String>,
    #[serde(rename = "topPairs")]
    top_pairs: Vec<PairConfig>,
}

#[derive(Debug, Deserialize)]
struct ScanConfig {
    chains: Vec<ChainConfig>,
    #[serde(rename = "totalChains")]
    total_chains: i32,
    #[serde(rename = "totalDexs")]
    total_dexs: i32,
    #[serde(rename = "lastUpdated")]
    last_updated: i64,
}

fn load_scan_config() -> Result<ScanConfig> {
    let config_path = Path::new("mev-scan-config.json");
    
    if !config_path.exists() {
        anyhow::bail!("❌ Config file 'mev-scan-config.json' not found. Generate it via API endpoint first.");
    }
    
    let config_str = fs::read_to_string(config_path)?;
    let config: ScanConfig = serde_json::from_str(&config_str)?;
    
    if config.total_chains == 0 {
        anyhow::bail!("❌ Config file is empty. Generate a valid configuration via API endpoint.");
    }
    
    println!("✅ Loaded config: {} chains, {} DEXs", config.total_chains, config.total_dexs);
    Ok(config)
}

fn chain_id_to_name(chain_id: i64) -> &'static str {
    match chain_id {
        1 => "ethereum",
        5 => "goerli",
        10 => "optimism",
        18 => "thundercore",
        25 => "cronos",
        30 => "rootstock",
        40 => "telos",
        42 => "lukso",
        46 => "darwinia",
        50 => "xdc",
        56 => "bsc",
        57 => "syscoin",
        59 => "eos",
        60 => "gochain",
        61 => "ethereumclassic",
        66 => "okc",
        82 => "meter",
        88 => "viction",
        100 => "gnosis",
        106 => "velas",
        108 => "thundercore",
        122 => "fuse",
        128 => "heco",
        137 => "polygon",
        146 => "sonic",
        148 => "shimmer",
        169 => "manta",
        183 => "ethernity",
        196 => "xlayer",
        199 => "bittorrent",
        204 => "opbnb",
        246 => "energyweb",
        250 => "fantom",
        252 => "fraxtal",
        255 => "kroma",
        288 => "boba",
        324 => "zksync",
        336 => "shiden",
        361 => "theta",
        369 => "pulsechain",
        592 => "astar",
        1030 => "conflux",
        1088 => "metis",
        1101 => "polygon-zkevm",
        1111 => "wemix",
        1116 => "core",
        1284 => "moonbeam",
        1285 => "moonriver",
        2001 => "milkomeda",
        2020 => "ronin",
        2222 => "kava",
        2611 => "redlight",
        3797 => "alvey",
        4200 => "merlin",
        4689 => "iotex",
        5000 => "mantle",
        7700 => "canto",
        8217 => "klaytn",
        8453 => "base",
        9001 => "evmos",
        10200 => "gnosis-chiado",
        11235 => "haqq",
        17777 => "eos-evm",
        23294 => "oasis-sapphire",
        34443 => "mode",
        42161 => "arbitrum",
        42170 => "arbitrum-nova",
        42220 => "celo",
        42262 => "oasis-emerald",
        42766 => "zkfair",
        43114 => "avalanche",
        44787 => "celo-alfajores",
        47805 => "rei",
        53935 => "dfk",
        59144 => "linea",
        60808 => "bob",
        73772 => "swimmer",
        80002 => "polygon-amoy",
        80084 => "berachain",
        81457 => "blast",
        103090 => "crystaleum",
        167000 => "taiko",
        245022934_i64 => "neon-evm",
        534352 => "scroll",
        7777777 => "zora",
        888888888_i64 => "vision",
        1313161554_i64 => "aurora",
        1351057110_i64 => "skale",
        1666600000_i64 => "harmony",
        11155111 => "sepolia",
        11297108109_i64 => "palm",
        _ => "ethereum",
    }
}

async fn fetch_dex_prices(pair_address: &str, chain_id: i64) -> Result<Vec<DexPair>> {
    let chain_name = chain_id_to_name(chain_id);

    let url = format!("https://api.dexscreener.com/latest/dex/pairs/{}/{}", chain_name, pair_address);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;
    
    let response: DexScreenerResponse = client
        .get(&url)
        .send()
        .await?
        .json()
        .await?;
    
    Ok(response.pairs.unwrap_or_default())
}

fn calculate_arbitrage(pairs: &[DexPair], token0: &str, token1: &str, chain_id: i64) -> Option<Opportunity> {
    if pairs.len() < 2 {
        return None;
    }

    let mut with_prices: Vec<_> = pairs
        .iter()
        .filter_map(|p| {
            p.price_usd.parse::<f64>().ok().map(|price| (p, price))
        })
        .collect();

    with_prices.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

    if with_prices.len() < 2 {
        return None;
    }

    let (buy_pair, buy_price) = with_prices.first()?;
    let (sell_pair, sell_price) = with_prices.last()?;

    if buy_price == &0.0 {
        return None;
    }

    let price_diff = (sell_price - buy_price) / buy_price;

    if price_diff < 0.005 {
        return None;
    }

    let buy_liquidity = buy_pair.liquidity.as_ref()?.usd.unwrap_or(0.0);
    let sell_liquidity = sell_pair.liquidity.as_ref()?.usd.unwrap_or(0.0);
    
    let trade_size = buy_liquidity.min(sell_liquidity) * 0.01;
    let gross_profit = trade_size * price_diff;
    let gas_cost = 15.0;
    let net_profit = gross_profit - gas_cost;

    if net_profit <= 0.0 {
        return None;
    }

    Some(Opportunity {
        chain_id,
        dex_in: buy_pair.dex_id.clone(),
        dex_out: sell_pair.dex_id.clone(),
        base_token: token0.to_string(),
        quote_token: token1.to_string(),
        amount_in: format!("{:.2}", trade_size),
        est_profit_usd: net_profit,
        gas_usd: gas_cost,
        ts: Utc::now().timestamp_millis(),
    })
}

fn log_opportunity(opp: &Opportunity, pair_name: &str, _unused: &str) {
    println!("✅ OPPORTUNITY FOUND:");
    println!("   Chain: {}", opp.chain_id);
    println!("   Route: {} → {}", opp.dex_in, opp.dex_out);
    println!("   Pair: {}", pair_name);
    println!("   BaseToken: {}", opp.base_token);
    println!("   QuoteToken: {}", opp.quote_token);
    println!("   Profit: ${:.2} USD", opp.est_profit_usd);
    println!("   ROI: {:.2}%", (opp.est_profit_usd / opp.est_profit_usd.max(1.0)) * 100.0);
    println!();
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();

    println!("🚀 MEV Engine Minimal v3.6.0 - RUST (Dynamic Multi-Chain)");
    
    let config = load_scan_config()?;
    
    println!("📊 Dynamic Config: {} chains with {} DEXs", config.total_chains, config.total_dexs);
    println!("🔄 Scan interval: 10 seconds");
    println!("⚡ Real-time arbitrage detection active\n");

    loop {
        println!("🔍 Starting scan cycle...");
        let mut found = 0;
        let mut scanned = 0;

        for chain in &config.chains {
            for pair in &chain.top_pairs {
                scanned += 1;
                
                print!("   📡 Escaneando {} en {} (Chain {})... ", pair.name, chain.name, chain.chain_id);
                
                match fetch_dex_prices(&pair.pair_address, chain.chain_id).await {
                    Ok(pairs) => {
                        if pairs.is_empty() {
                            println!("❌ Sin datos");
                        } else {
                            let dex_names: Vec<String> = pairs.iter()
                                .map(|p| p.dex_id.clone())
                                .collect::<std::collections::HashSet<_>>()
                                .into_iter()
                                .collect();
                            
                            println!("✅ {} DEXs: [{}]", dex_names.len(), dex_names.join(", "));
                            
                            if let Some(opp) = calculate_arbitrage(&pairs, &pair.token0, &pair.token1, chain.chain_id) {
                                log_opportunity(&opp, &pair.name, "");
                                found += 1;
                            }
                        }
                    }
                    Err(e) => {
                        println!("⚠️  Error: {}", e);
                    }
                }

                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }

        println!("🎯 Scan complete. Scanned {} pairs, found {} opportunities\n", scanned, found);
        
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}
