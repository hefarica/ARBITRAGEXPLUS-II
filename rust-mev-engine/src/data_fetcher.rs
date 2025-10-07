use anyhow::{Result, Context, bail};
use ethers::prelude::*;
use ethers::types::{Address, U256};
use ethers::abi::Abi;
use std::sync::Arc;
use std::str::FromStr;
use tracing::{info, debug};

use crate::rpc_manager::RpcManager;
use crate::types::PoolReserves;

/// ABI para Uniswap V2 Pair (getReserves)
const UNISWAP_V2_PAIR_ABI: &str = r#"[
    {
        "constant": true,
        "inputs": [],
        "name": "getReserves",
        "outputs": [
            {"internalType": "uint112", "name": "_reserve0", "type": "uint112"},
            {"internalType": "uint112", "name": "_reserve1", "type": "uint112"},
            {"internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32"}
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "token0",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "token1",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    }
]"#;

/// ABI para ERC20 (balanceOf, decimals)
const ERC20_ABI: &str = r#"[
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    }
]"#;

#[derive(Clone)]
pub struct DataFetcher {
    rpc_manager: Arc<RpcManager>,
}

impl DataFetcher {
    pub fn new(rpc_manager: Arc<RpcManager>) -> Self {
        DataFetcher { rpc_manager }
    }

    /// Obtener reservas reales de un pool Uniswap V2-like
    pub async fn get_pool_reserves(
        &self,
        chain: &str,
        pool_address: &str,
        token_a: &str,
        token_b: &str,
    ) -> Result<PoolReserves> {
        debug!(
            "Fetching real reserves for pool {} on chain {} ({}/{})",
            pool_address, chain, token_a, token_b
        );

        let provider = self.rpc_manager.get_provider(chain).await?;
        
        // Parsear dirección del pool
        let pool_addr = Address::from_str(pool_address)
            .context("Invalid pool address")?;

        // Crear contrato del pool
        let abi: Abi = serde_json::from_str(UNISWAP_V2_PAIR_ABI)
            .context("Failed to parse Uniswap V2 ABI")?;
        
        let contract = Contract::new(pool_addr, abi, provider.clone());

        // Llamar a getReserves()
        let reserves: (u128, u128, u32) = contract
            .method::<_, (u128, u128, u32)>("getReserves", ())?
            .call()
            .await
            .context("Failed to call getReserves on pool contract")?;

        let (reserve0_raw, reserve1_raw, _timestamp) = reserves;

        // Obtener token0 y token1 del pool para saber el orden
        let token0: Address = contract
            .method::<_, Address>("token0", ())?
            .call()
            .await
            .context("Failed to get token0 from pool")?;

        let token1: Address = contract
            .method::<_, Address>("token1", ())?
            .call()
            .await
            .context("Failed to get token1 from pool")?;

        debug!(
            "Pool reserves: reserve0={}, reserve1={}, token0={:?}, token1={:?}",
            reserve0_raw, reserve1_raw, token0, token1
        );

        // Obtener decimales de los tokens
        let decimals0 = self.get_token_decimals(chain, &format!("{:?}", token0)).await?;
        let decimals1 = self.get_token_decimals(chain, &format!("{:?}", token1)).await?;

        // Convertir a f64 considerando decimales
        let reserve_a = reserve0_raw as f64 / 10f64.powi(decimals0 as i32);
        let reserve_b = reserve1_raw as f64 / 10f64.powi(decimals1 as i32);

        // Determinar el orden correcto según token_a y token_b
        let token_a_addr = Address::from_str(token_a).context("Invalid token_a address")?;
        
        let (final_reserve_a, final_reserve_b) = if token0 == token_a_addr {
            (reserve_a, reserve_b)
        } else {
            (reserve_b, reserve_a)
        };

        info!(
            "Real reserves for {}/{} on {}: reserve_a={:.6}, reserve_b={:.6}",
            token_a, token_b, chain, final_reserve_a, final_reserve_b
        );

        Ok(PoolReserves {
            reserve_a: final_reserve_a,
            reserve_b: final_reserve_b,
        })
    }

    /// Obtener decimales de un token ERC20
    pub async fn get_token_decimals(&self, chain: &str, token_address: &str) -> Result<u8> {
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        let token_addr = Address::from_str(token_address)
            .context("Invalid token address")?;

        let abi: Abi = serde_json::from_str(ERC20_ABI)
            .context("Failed to parse ERC20 ABI")?;
        
        let contract = Contract::new(token_addr, abi, provider);

        let decimals: u8 = contract
            .method::<_, u8>("decimals", ())?
            .call()
            .await
            .context("Failed to get token decimals")?;

        debug!("Token {} decimals: {}", token_address, decimals);

        Ok(decimals)
    }

    /// Obtener símbolo de un token ERC20
    pub async fn get_token_symbol(&self, chain: &str, token_address: &str) -> Result<String> {
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        let token_addr = Address::from_str(token_address)
            .context("Invalid token address")?;

        let abi: Abi = serde_json::from_str(ERC20_ABI)
            .context("Failed to parse ERC20 ABI")?;
        
        let contract = Contract::new(token_addr, abi, provider);

        let symbol: String = contract
            .method::<_, String>("symbol", ())?
            .call()
            .await
            .context("Failed to get token symbol")?;

        debug!("Token {} symbol: {}", token_address, symbol);

        Ok(symbol)
    }

    /// Obtener balance de un token para una dirección
    pub async fn get_token_balance(
        &self,
        chain: &str,
        token_address: &str,
        holder_address: &str,
    ) -> Result<f64> {
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        let token_addr = Address::from_str(token_address)
            .context("Invalid token address")?;
        
        let holder_addr = Address::from_str(holder_address)
            .context("Invalid holder address")?;

        let abi: Abi = serde_json::from_str(ERC20_ABI)
            .context("Failed to parse ERC20 ABI")?;
        
        let contract = Contract::new(token_addr, abi, provider);

        let balance: U256 = contract
            .method::<_, U256>("balanceOf", holder_addr)?
            .call()
            .await
            .context("Failed to get token balance")?;

        // Obtener decimales para convertir correctamente
        let decimals = self.get_token_decimals(chain, token_address).await?;
        
        let balance_f64 = balance.as_u128() as f64 / 10f64.powi(decimals as i32);

        debug!(
            "Token {} balance for {}: {:.6}",
            token_address, holder_address, balance_f64
        );

        Ok(balance_f64)
    }

    /// Verificar si un contrato existe en la blockchain
    pub async fn contract_exists(&self, chain: &str, address: &str) -> Result<bool> {
        let provider = self.rpc_manager.get_provider(chain).await?;
        
        let addr = Address::from_str(address)
            .context("Invalid contract address")?;

        let code = provider
            .get_code(addr, None)
            .await
            .context("Failed to get contract code")?;

        let exists = !code.is_empty();
        
        debug!("Contract {} exists on {}: {}", address, chain, exists);

        Ok(exists)
    }

    /// Obtener el precio actual de un par usando la fórmula x*y=k
    pub async fn calculate_pool_price(
        &self,
        chain: &str,
        pool_address: &str,
        token_a: &str,
        token_b: &str,
    ) -> Result<f64> {
        let reserves = self.get_pool_reserves(chain, pool_address, token_a, token_b).await?;
        
        if reserves.reserve_a == 0.0 || reserves.reserve_b == 0.0 {
            bail!("Pool has zero reserves");
        }

        // Precio de token_a en términos de token_b
        let price = reserves.reserve_b / reserves.reserve_a;

        debug!(
            "Calculated price for {}/{} on pool {}: {:.6}",
            token_a, token_b, pool_address, price
        );

        Ok(price)
    }

    /// Simular un swap usando la fórmula AMM x*y=k
    pub async fn simulate_swap(
        &self,
        chain: &str,
        pool_address: &str,
        token_in: &str,
        token_out: &str,
        amount_in: f64,
        fee_rate: f64, // Por ejemplo, 0.003 para 0.3%
    ) -> Result<f64> {
        let reserves = self.get_pool_reserves(chain, pool_address, token_in, token_out).await?;
        
        // Aplicar fee
        let amount_in_with_fee = amount_in * (1.0 - fee_rate);
        
        // Fórmula AMM: amount_out = (reserve_out * amount_in_with_fee) / (reserve_in + amount_in_with_fee)
        let amount_out = (reserves.reserve_b * amount_in_with_fee) / (reserves.reserve_a + amount_in_with_fee);

        debug!(
            "Simulated swap: {} {} -> {:.6} {} (fee: {:.2}%)",
            amount_in,
            token_in,
            amount_out,
            token_out,
            fee_rate * 100.0
        );

        Ok(amount_out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_abi_parsing() {
        let abi: Result<Abi, _> = serde_json::from_str(UNISWAP_V2_PAIR_ABI);
        assert!(abi.is_ok());

        let abi: Result<Abi, _> = serde_json::from_str(ERC20_ABI);
        assert!(abi.is_ok());
    }
}
