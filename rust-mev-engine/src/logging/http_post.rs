#![cfg(feature = "http")]
use eyre::Result;
use once_cell::sync::Lazy;
use reqwest_opt::Client;
use std::time::Duration;

static CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("http client")
});

pub async fn post_json(url: &str, api_key: Option<&str>, payload: &serde_json::Value) -> Result<()> {
    let mut req = CLIENT.post(url).json(payload);
    if let Some(k) = api_key {
        req = req.header("Authorization", format!("Bearer {}", k));
    }
    let resp = req.send().await?;
    if !resp.status().is_success() {
        eyre::bail!("http status {}", resp.status());
    }
    Ok(())
}
