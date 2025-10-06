//! Binario de escaneo dirigido: EVENT_SWAP, BRIDGED_STABLE, TWAP
//! No interfiere con tu binario principal. Ejecutar con:
//! cargo run --bin mev-scanner --features scanners
//! (para eventos EVM vía WS): --features evm

use eyre::Result;
use std::{fs::File, io::BufReader};
use mev_engine_minimal::{scanners, types::ScanConfig};

#[tokio::main]
async fn main() -> Result<()> {
    // 1) Cargar configuración local (no toca tu config actual)
    let path = std::env::var("MEV_SCANNER_CONFIG").unwrap_or_else(|_| "mev-scanner-config.json".to_string());
    let cfg: ScanConfig = serde_json::from_reader(BufReader::new(File::open(&path)?))?;

    // 2) BRIDGED STABLES ⇒ generar parejas (USDC vs USDC.e, USDbC, etc.) y loguear
    let bridged = scanners::bridged_scanner::bridged_pairs(&cfg);
    for (chain_id, a, b) in bridged {
        println!("{}", serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339(),
            "reason": "BRIDGED_STABLE_PAIR",
            "chain_id": chain_id,
            "a": a, "b": b
        }).to_string());
    }

    // 3) TWAP pools priorizados
    let twap = scanners::twap_scanner::pick_twap_pools(&cfg);
    for (chain_id, pool_addr) in twap {
        println!("{}", serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339(),
            "reason": "TWAP_POOL_CANDIDATE",
            "chain_id": chain_id,
            "pool": pool_addr
        }).to_string());
    }

    // 4) EVENTOS EVM por WS (opcional, solo si se compila con --features evm y hay WS)
    #[cfg(feature = "evm")]
    {
        use scanners::event_scanner::EventScanner;
        use std::time::Duration;
        for ch in cfg.chains.iter().filter(|c| c.ws.is_some()) {
            let ws = ch.ws.clone().unwrap();
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
