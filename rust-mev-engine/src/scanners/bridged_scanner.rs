use std::collections::BTreeMap;
use crate::types::{ScanConfig, AssetCfg};

/// Devuelve todas las parejas de *misma familia* (p.ej., USDC vs USDC.e) por chain.
pub fn bridged_pairs(cfg: &ScanConfig) -> Vec<(u64, String, String)> {
    let mut out = vec![];
    // Construir set de símbolos permitidos por familia (USDC, USDbC, USDC.e, etc.)
    let mut allow: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (fam, variants) in cfg.bridgedGroups.iter() {
        allow.insert(fam.to_uppercase(), variants.iter().map(|v| v.to_uppercase()).collect());
    }
    for ch in &cfg.chains {
        // Agrupar assets por FAMILIA (si el símbolo está en alguna familia bridged)
        let mut by_fam: BTreeMap<String, Vec<&AssetCfg>> = BTreeMap::new();
        for a in &ch.assets {
            if let Some(sym) = &a.symbol {
                let s = sym.to_uppercase();
                for (fam, variants) in allow.iter() {
                    if variants.iter().any(|x| &s == x) {
                        by_fam.entry(fam.clone()).or_default().push(a);
                    }
                }
            }
        }
        for (_fam, veca) in by_fam {
            for i in 0..veca.len() {
                for j in (i+1)..veca.len() {
                    out.push((ch.chain_id, veca[i].address.clone(), veca[j].address.clone()));
                }
            }
        }
    }
    out
}
