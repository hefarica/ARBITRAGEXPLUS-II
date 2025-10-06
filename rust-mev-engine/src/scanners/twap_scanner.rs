use crate::types::ScanConfig;

/// Marca como candidatos los pools de las DEX priorizadas (TWAP/estable).
/// Aquí solo propagamos direcciones que ya vengan en la config; el cruce real lo haces en tu engine.
pub fn pick_twap_pools(cfg: &ScanConfig) -> Vec<(u64, String)> {
    let _dex_whitelist: Vec<String> = cfg.prioritizeDex.iter().map(|s| s.to_lowercase()).collect();
    let mut out = vec![];
    for ch in &cfg.chains {
        for p in &ch.pools {
            out.push((ch.chain_id, p.clone()));
        }
    }
    out
}
