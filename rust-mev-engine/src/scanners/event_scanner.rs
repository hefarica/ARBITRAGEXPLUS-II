#![cfg(feature = "evm")]
use eyre::Result;
use ethers::providers::{Provider, Ws};
use ethers::types::{Filter, Address};
use futures_util::StreamExt;

pub struct EventScanner {
    provider: Provider<Ws>,
}

impl EventScanner {
    pub async fn connect(ws_url: &str) -> Result<Self> {
        let provider = Provider::<Ws>::connect(ws_url).await?;
        Ok(Self { provider })
    }

    /// Observa eventos Swap (UniswapV3-like). Si `pools` está vacío, solo valida la conexión.
    pub async fn watch_pools(&self, pools: Vec<Address>) -> Result<()> {
        if pools.is_empty() {
            println!(r#"{{"reason":"EVENT_WS_OK"}}"#);
            return Ok(())
        }
        let filter = Filter::new()
            .address(pools)
            .event("Swap(address,int256,int256,uint160,uint128,int24)");
        let mut sub = self.provider.subscribe_logs(&filter).await?;
        while let Some(Ok(log)) = sub.next().await {
            println!("{}", serde_json::json!({
                "ts": chrono::Utc::now().to_rfc3339(),
                "reason": "EVENT_SWAP",
                "pool": format!("{:?}", log.address)
            }).to_string());
        }
        Ok(())
    }
}
