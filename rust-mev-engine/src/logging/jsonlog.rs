use eyre::Result;
use fs2::FileExt;
use std::{fs::{OpenOptions, create_dir_all}, io::Write, path::PathBuf, env};

/// Imprime y persiste una línea JSON en logs/mev-scanner.jsonl (append seguro).
pub fn log_line(v: serde_json::Value) -> Result<()> {
    let s = v.to_string();
    println!("{}", s);
    
    // Buscar la raíz del proyecto (donde está mev-scanner-config.json)
    let log_dir = if let Ok(config_path) = env::var("MEV_SCANNER_CONFIG") {
        PathBuf::from(config_path).parent().unwrap_or(std::path::Path::new(".")).join("logs")
    } else {
        PathBuf::from("../logs") // fallback para cuando se ejecuta desde rust-mev-engine/
    };
    
    if !log_dir.exists() { create_dir_all(&log_dir)?; }
    let p = log_dir.join("mev-scanner.jsonl");
    let f = OpenOptions::new().create(true).append(true).open(p)?;
    f.lock_exclusive()?; // bloqueo simple para procesos concurrentes
    writeln!(&f, "{}", s)?;
    fs2::FileExt::unlock(&f)?; // usar método estático para evitar conflicto
    // Enviar a backend si está configurado
    post_if_configured(&v);
    Ok(())
}

#[cfg(feature = "http")]
fn post_if_configured(v: &serde_json::Value) {
    if let Ok(url) = std::env::var("MEV_POST_URL") {
        let key = std::env::var("MEV_POST_API_KEY").ok();
        // disparar en background; errores se ignoran (quedan en log local)
        tokio::spawn({
            let payload = v.clone();
            async move {
                let _ = crate::logging::http_post::post_json(&url, key.as_deref(), &payload).await;
            }
        });
    }
}

#[cfg(not(feature = "http"))]
fn post_if_configured(_v: &serde_json::Value) {}
