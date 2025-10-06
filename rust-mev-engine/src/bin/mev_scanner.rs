//! Binario de escaneo dirigido: EVENT_SWAP, BRIDGED_STABLE, TWAP
//! No interfiere con tu binario principal. Ejecutar con:
//! cargo run --bin mev-scanner --features scanners
//! (para eventos EVM vía WS): --features evm

use eyre::Result;
use std::{env, fs::File, io::BufReader};
use mev_engine_minimal::{scanners, types::ScanConfig, logging, simulate};
use serde::Deserialize;

fn env_bool(k: &str, default_: bool) -> bool {
    env::var(k).ok().map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(default_)
}
fn env_f64(k: &str, default_: f64) -> f64 {
    env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(default_)
}

#[tokio::main]
async fn main() -> Result<()> {
    // 1) Cargar configuración local (no toca tu config actual)
    let path = std::env::var("MEV_SCANNER_CONFIG").unwrap_or_else(|_| "mev-scanner-config.json".to_string());
    let mut cfg: ScanConfig = serde_json::from_reader(BufReader::new(File::open(&path)?))?;
    // Merge defaults (arrays de assets/pares) para evitar "relojes desincronizados"
    merge_defaults_into_cfg(&mut cfg)?;
    
    // Si vienen en config, exporta a ENV (para el logger HTTP)
    if let Some(url) = cfg.postUrl.as_ref() { env::set_var("MEV_POST_URL", url); }
    if let Some(key) = cfg.postApiKey.as_ref() { env::set_var("MEV_POST_API_KEY", key); }

    // 2) BRIDGED STABLES ⇒ generar parejas (USDC vs USDC.e, USDbC, etc.) y loguear
    let bridged = scanners::bridged_scanner::bridged_pairs(&cfg);
    for (chain_id, a, b) in bridged {
        logging::jsonlog::log_line(serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339(),
            "reason": "BRIDGED_STABLE_PAIR",
            "chain_id": chain_id,
            "a": a, "b": b
        }))?;
    }

    // 3) TWAP pools priorizados
    let twap = scanners::twap_scanner::pick_twap_pools(&cfg);
    for (chain_id, pool_addr) in twap {
        logging::jsonlog::log_line(serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339(),
            "reason": "TWAP_POOL_CANDIDATE",
            "chain_id": chain_id,
            "pool": pool_addr
        }))?;
    }

    // 3.1) SIMULACIÓN OPCIONAL (2-legs / 3-legs) con grilla + gas/fees
    if env_bool("MEV_SIMULATE", false) {
        let gas_usd = env_f64("GAS_USD", 0.01);         // costo gas estimado por tx
        let fee_bps_leg = env_f64("FEE_BPS_PER_LEG", 30.0); // 0.30% por leg (demo)
        let thr_min_usd = env_f64("THRESH_MIN_USD", 1.0);   // objetivo mínimo neto

        // EJEMPLO: simular un 2-legs genérico con cotos ficticios (sustituir por quotes reales)
        let (best_x, pnl) = simulate::two_leg::simulate_2leg(
            10.0,  // amount_in USD
            fee_bps_leg,
            gas_usd,
            // q1: pool barato ⇒ +5 bps
            |x| x * (1.0005),
            // q2: pool caro ⇒ -3 bps (al vender)
            |y| y * (0.9970)
        );
        logging::jsonlog::log_line(serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339(),
            "reason": "SIM_2LEG_SAMPLE",
            "best_in": best_x,
            "pnl_usd": pnl.net_usd,
            "gas_usd": pnl.gas_usd
        }))?;

        if pnl.net_usd >= thr_min_usd {
            logging::jsonlog::log_line(serde_json::json!({
                "ts": chrono::Utc::now().to_rfc3339(),
                "reason": "OPPORTUNITY",
                "kind": "2-legs",
                "net_usd": pnl.net_usd
            }))?;
        }
    }

    // 4) EVENTOS EVM por WS (opcional, solo si se compila con --features evm y hay WS)
    #[cfg(feature = "evm")]
    {
        use scanners::event_scanner::EventScanner;
        use std::time::Duration;
        for ch in cfg.chains.iter().filter(|c| c.ws_url.is_some()) {
            let ws = ch.ws_url.clone().unwrap();
            let pools_clone = ch.pools.clone();
            // lanzar en tasks independientes para cada chain con WS
            tokio::spawn(async move {
                if let Ok(scanner) = EventScanner::connect(&ws).await {
                    // Si no hay pools definidos, el scanner solo valida conexión
                    let pools = pools_clone.iter().filter_map(|p| p.parse().ok()).collect::<Vec<ethers::types::Address>>();
                    let _ = scanner.watch_pools(pools).await;
                }
            });
        }
        // Mantener vivo el proceso si se activó WS
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
struct DefaultAsset { symbol: String, address: String, decimals: u8 }
#[derive(Debug, Deserialize)]
struct DefaultChain {
    chain_id: u64,
    name: String,
    assets: Vec<DefaultAsset>,
    #[allow(dead_code)]
    default_pairs: Vec<(String,String)>,
    #[allow(dead_code)]
    default_tri_routes: Vec<Vec<String>>,
}
#[derive(Debug, Deserialize)]
struct DefaultCfgRoot {
    chains: Vec<DefaultChain>,
    #[serde(default, alias="bridged_groups")] bridgedGroups: std::collections::BTreeMap<String, Vec<String>>,
    #[serde(default, alias="prioritize_dex")] prioritizeDex: Vec<String>
}

fn merge_defaults_into_cfg(cfg: &mut ScanConfig) -> Result<()> {
    let defaults_path = env::var("DEFAULTS_JSON").unwrap_or_else(|_| "default-assets-and-pairs.json".to_string());
    let Ok(f) = File::open(&defaults_path) else {
        println!(r#"{{"reason":"DEFAULTS_SKIP","msg":"file_not_found","path":"{}"}}"#, defaults_path);
        return Ok(());
    };
    let def: DefaultCfgRoot = serde_json::from_reader(BufReader::new(f))?;
    // 1) bridged/prioritize
    if cfg.bridgedGroups.is_empty() { cfg.bridgedGroups = def.bridgedGroups; }
    if cfg.prioritizeDex.is_empty() { cfg.prioritizeDex = def.prioritizeDex; }
    // 2) assets por chain (si faltan)
    for dc in def.chains {
        // busca chain existente
        if let Some(c) = cfg.chains.iter_mut().find(|c| c.chain_id == dc.chain_id) {
            for a in dc.assets {
                let exists = c.assets.iter().any(|x| x.address.eq_ignore_ascii_case(&a.address));
                if !exists {
                    c.assets.push(mev_engine_minimal::types::AssetCfg {
                        address: a.address,
                        symbol: Some(a.symbol),
                    });
                }
            }
        } else {
            // crea chain mínima para que el escáner la tome
            cfg.chains.push(mev_engine_minimal::types::ChainCfg{
                chain_id: dc.chain_id,
                name: dc.name,
                ws_url: None,
                pools: vec![],
                assets: dc.assets.into_iter().map(|a| mev_engine_minimal::types::AssetCfg{ address: a.address, symbol: Some(a.symbol) }).collect()
            });
        }
    }
    println!(r#"{{"reason":"DEFAULTS_MERGED"}}"#);
    Ok(())
}
