use anyhow::Result;
use chrono::Utc;
use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::thread;
use std::time::Duration;

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
    chain_id: i32,
    dex_in: String,
    dex_out: String,
    base_token: String,
    quote_token: String,
    amount_in: String,
    est_profit_usd: f64,
    gas_usd: f64,
    ts: i64,
}

const POPULAR_PAIRS: &[(&str, i32, &str, &str, &str)] = &[
    // (name, chain_id, token0, token1, pair_address)
    ("WETH/USDC", 1, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"),
    ("WETH/USDT", 1, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xdAC17F958D2ee523a2206206994597C13D831ec7", "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36"),
    ("WMATIC/USDC", 137, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", "0xa374094527e1673a86de625aa59517c5de346d32"),
    ("WETH/USDC", 42161, "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443"),
    ("WETH/USDC", 10, "0x4200000000000000000000000000000000000006", "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", "0x85149247691df622eaf1a8bd0cafd40bc45154a9"),
];

async fn fetch_dex_prices(pair_address: &str, chain_id: i32) -> Result<Vec<DexPair>> {
    let chain_name = match chain_id {
        1 => "ethereum",
        137 => "polygon",
        42161 => "arbitrum",
        10 => "optimism",
        8453 => "base",
        _ => "ethereum",
    };

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

fn calculate_arbitrage(pairs: &[DexPair]) -> Option<Opportunity> {
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

    let chain_id_num: i32 = buy_pair.chain_id.parse().unwrap_or(1);

    Some(Opportunity {
        chain_id: chain_id_num,
        dex_in: buy_pair.dex_id.clone(),
        dex_out: sell_pair.dex_id.clone(),
        base_token: "".to_string(),
        quote_token: "".to_string(),
        amount_in: format!("{:.2}", trade_size),
        est_profit_usd: net_profit,
        gas_usd: gas_cost,
        ts: Utc::now().timestamp_millis(),
    })
}

fn store_opportunity(client: &mut Client, opp: &Opportunity, base_token: &str, quote_token: &str) -> Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    
    client.execute(
        "INSERT INTO opportunities (id, chain_id, dex_in, dex_out, base_token, quote_token, amount_in, est_profit_usd, gas_usd, ts, is_testnet) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        &[
            &id,
            &opp.chain_id,
            &opp.dex_in,
            &opp.dex_out,
            &base_token,
            &quote_token,
            &opp.amount_in,
            &opp.est_profit_usd,
            &opp.gas_usd,
            &opp.ts,
            &false,
        ],
    )?;

    println!("✅ Stored opportunity: {} → {} on chain {}, profit: ${:.2}", 
        opp.dex_in, opp.dex_out, opp.chain_id, opp.est_profit_usd);

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();

    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let mut db_client = Client::connect(&database_url, NoTls)?;

    println!("🚀 MEV Engine Minimal v3.6.0 - RUST");
    println!("📊 Scanning {} popular pairs...", POPULAR_PAIRS.len());
    println!("🔄 Scan interval: 30 seconds\n");

    loop {
        println!("🔍 Starting scan cycle...");
        let mut found = 0;

        for (name, chain_id, token0, token1, pair_addr) in POPULAR_PAIRS {
            match fetch_dex_prices(pair_addr, *chain_id).await {
                Ok(pairs) => {
                    if let Some(opp) = calculate_arbitrage(&pairs) {
                        match store_opportunity(&mut db_client, &opp, token0, token1) {
                            Ok(_) => found += 1,
                            Err(e) => eprintln!("❌ Error storing opportunity: {}", e),
                        }
                    }
                }
                Err(e) => {
                    eprintln!("⚠️  Error fetching {}: {}", name, e);
                }
            }

            tokio::time::sleep(Duration::from_millis(1000)).await;
        }

        println!("🎯 Scan complete. Found {} opportunities\n", found);
        
        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}
