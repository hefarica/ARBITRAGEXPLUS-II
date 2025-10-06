use eyre::Result;
use fs2::FileExt;
use std::{fs::{OpenOptions, create_dir_all}, io::Write, path::Path};

/// Imprime y persiste una línea JSON en logs/mev-scanner.jsonl (append seguro).
pub fn log_line(v: serde_json::Value) -> Result<()> {
    let s = v.to_string();
    println!("{}", s);
    let log_dir = Path::new("logs");
    if !log_dir.exists() { create_dir_all(log_dir)?; }
    let p = log_dir.join("mev-scanner.jsonl");
    let f = OpenOptions::new().create(true).append(true).open(p)?;
    f.lock_exclusive()?; // bloqueo simple para procesos concurrentes
    writeln!(&f, "{}", s)?;
    f.unlock()?;
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
