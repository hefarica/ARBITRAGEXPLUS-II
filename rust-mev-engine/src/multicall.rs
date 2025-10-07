use anyhow::{Result, Context};
use ethers::prelude::*;
use ethers::types::{Address, Bytes, U256};
use std::sync::Arc;
use tracing::{info, debug, warn};

// Multicall3 ABI
abigen!(
    Multicall3,
    r#"[
        struct Call { address target; bytes callData; }
        struct Result { bool success; bytes returnData; }
        function aggregate3(Call[] calldata calls) external payable returns (Result[] memory returnData)
        function getBlockHash(uint256 blockNumber) external view returns (bytes32 blockHash)
        function getBlockNumber() external view returns (uint256 blockNumber)
        function getCurrentBlockCoinbase() external view returns (address coinbase)
        function getCurrentBlockDifficulty() external view returns (uint256 difficulty)
        function getCurrentBlockGasLimit() external view returns (uint256 gaslimit)
        function getCurrentBlockTimestamp() external view returns (uint256 timestamp)
        function getEthBalance(address addr) external view returns (uint256 balance)
        function getLastBlockHash() external view returns (bytes32 blockHash)
    ]"#
);

pub struct MulticallManager {
    contracts: std::collections::HashMap<u64, Address>,
    max_batch_size: usize,
}

impl MulticallManager {
    pub fn new() -> Self {
        let mut contracts = std::collections::HashMap::new();
        
        // Multicall3 addresses for different chains
        // These are the real deployed addresses
        contracts.insert(1, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // Ethereum
        contracts.insert(42161, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // Arbitrum
        contracts.insert(10, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // Optimism
        contracts.insert(8453, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // Base
        contracts.insert(137, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // Polygon
        contracts.insert(56, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // BSC
        contracts.insert(43114, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // Avalanche
        contracts.insert(250, "0xcA11bde05977b3631167028862bE2a173976CA11".parse().unwrap()); // Fantom

        MulticallManager {
            contracts,
            max_batch_size: 500,
        }
    }

    pub async fn batch_call<M: Middleware + 'static>(
        &self,
        provider: Arc<M>,
        chain_id: u64,
        calls: Vec<MulticallRequest>,
    ) -> Result<Vec<MulticallResponse>> {
        let multicall_address = self.contracts
            .get(&chain_id)
            .ok_or_else(|| anyhow::anyhow!("No multicall contract for chain {}", chain_id))?;

        debug!("Executing {} calls via Multicall3 on chain {}", calls.len(), chain_id);

        let mut results = Vec::new();
        
        // Process in batches
        for chunk in calls.chunks(self.max_batch_size) {
            let batch_results = self.execute_batch(
                provider.clone(),
                *multicall_address,
                chunk.to_vec()
            ).await?;
            
            results.extend(batch_results);
        }

        Ok(results)
    }

    async fn execute_batch<M: Middleware + 'static>(
        &self,
        provider: Arc<M>,
        multicall_address: Address,
        calls: Vec<MulticallRequest>,
    ) -> Result<Vec<MulticallResponse>> {
        let multicall = Multicall3::new(multicall_address, provider);
        
        let mut multicall_calls = Vec::new();
        for call in &calls {
            multicall_calls.push(Call {
                target: call.target,
                call_data: call.call_data.clone(),
            });
        }

        let results = multicall
            .aggregate_3(multicall_calls)
            .call()
            .await
            .context("Failed to execute multicall")?;

        let mut responses = Vec::new();
        for (i, result) in results.iter().enumerate() {
            responses.push(MulticallResponse {
                target: calls[i].target,
                success: result.0,
                return_data: result.1.clone(),
            });
        }

        Ok(responses)
    }

    pub async fn get_balances<M: Middleware + 'static>(
        &self,
        provider: Arc<M>,
        chain_id: u64,
        token_addresses: Vec<Address>,
        wallet_addresses: Vec<Address>,
    ) -> Result<Vec<BalanceResult>> {
        let multicall_address = self.contracts
            .get(&chain_id)
            .ok_or_else(|| anyhow::anyhow!("No multicall contract for chain {}", chain_id))?;

        let erc20_balance_of_selector = ethers::abi::Function {
            name: "balanceOf".to_string(),
            inputs: vec![ethers::abi::Param {
                name: "account".to_string(),
                kind: ethers::abi::ParamType::Address,
                internal_type: None,
            }],
            outputs: vec![ethers::abi::Param {
                name: "balance".to_string(),
                kind: ethers::abi::ParamType::Uint(256),
                internal_type: None,
            }],
            constant: None,
            state_mutability: ethers::abi::StateMutability::View,
        };

        let mut calls = Vec::new();
        let mut call_info = Vec::new();

        for token in &token_addresses {
            for wallet in &wallet_addresses {
                let call_data = erc20_balance_of_selector
                    .encode_input(&[ethers::abi::Token::Address(*wallet)])
                    .context("Failed to encode balanceOf call")?;

                calls.push(MulticallRequest {
                    target: *token,
                    call_data: call_data.into(),
                });

                call_info.push((*token, *wallet));
            }
        }

        let responses = self.batch_call(provider, chain_id, calls).await?;
        
        let mut results = Vec::new();
        for (i, response) in responses.iter().enumerate() {
            let (token, wallet) = call_info[i];
            
            let balance = if response.success && response.return_data.len() >= 32 {
                U256::from_big_endian(&response.return_data)
            } else {
                U256::zero()
            };

            results.push(BalanceResult {
                token,
                wallet,
                balance,
                success: response.success,
            });
        }

        Ok(results)
    }

    pub async fn get_prices<M: Middleware + 'static>(
        &self,
        provider: Arc<M>,
        chain_id: u64,
        pair_addresses: Vec<Address>,
    ) -> Result<Vec<PriceResult>> {
        let get_reserves_selector = ethers::abi::Function {
            name: "getReserves".to_string(),
            inputs: vec![],
            outputs: vec![
                ethers::abi::Param {
                    name: "_reserve0".to_string(),
                    kind: ethers::abi::ParamType::Uint(112),
                    internal_type: None,
                },
                ethers::abi::Param {
                    name: "_reserve1".to_string(),
                    kind: ethers::abi::ParamType::Uint(112),
                    internal_type: None,
                },
                ethers::abi::Param {
                    name: "_blockTimestampLast".to_string(),
                    kind: ethers::abi::ParamType::Uint(32),
                    internal_type: None,
                },
            ],
            constant: None,
            state_mutability: ethers::abi::StateMutability::View,
        };

        let mut calls = Vec::new();
        for pair in &pair_addresses {
            let call_data = get_reserves_selector
                .encode_input(&[])
                .context("Failed to encode getReserves call")?;

            calls.push(MulticallRequest {
                target: *pair,
                call_data: call_data.into(),
            });
        }

        let responses = self.batch_call(provider, chain_id, calls).await?;
        
        let mut results = Vec::new();
        for (i, response) in responses.iter().enumerate() {
            let pair = pair_addresses[i];
            
            if response.success && response.return_data.len() >= 64 {
                let reserve0 = U256::from_big_endian(&response.return_data[0..32]);
                let reserve1 = U256::from_big_endian(&response.return_data[32..64]);
                
                results.push(PriceResult {
                    pair,
                    reserve0,
                    reserve1,
                    success: true,
                });
            } else {
                results.push(PriceResult {
                    pair,
                    reserve0: U256::zero(),
                    reserve1: U256::zero(),
                    success: false,
                });
            }
        }

        Ok(results)
    }

    pub async fn check_allowances<M: Middleware + 'static>(
        &self,
        provider: Arc<M>,
        chain_id: u64,
        token: Address,
        owner: Address,
        spenders: Vec<Address>,
    ) -> Result<Vec<AllowanceResult>> {
        let allowance_selector = ethers::abi::Function {
            name: "allowance".to_string(),
            inputs: vec![
                ethers::abi::Param {
                    name: "owner".to_string(),
                    kind: ethers::abi::ParamType::Address,
                    internal_type: None,
                },
                ethers::abi::Param {
                    name: "spender".to_string(),
                    kind: ethers::abi::ParamType::Address,
                    internal_type: None,
                },
            ],
            outputs: vec![ethers::abi::Param {
                name: "remaining".to_string(),
                kind: ethers::abi::ParamType::Uint(256),
                internal_type: None,
            }],
            constant: None,
            state_mutability: ethers::abi::StateMutability::View,
        };

        let mut calls = Vec::new();
        for spender in &spenders {
            let call_data = allowance_selector
                .encode_input(&[
                    ethers::abi::Token::Address(owner),
                    ethers::abi::Token::Address(*spender),
                ])
                .context("Failed to encode allowance call")?;

            calls.push(MulticallRequest {
                target: token,
                call_data: call_data.into(),
            });
        }

        let responses = self.batch_call(provider, chain_id, calls).await?;
        
        let mut results = Vec::new();
        for (i, response) in responses.iter().enumerate() {
            let spender = spenders[i];
            
            let allowance = if response.success && response.return_data.len() >= 32 {
                U256::from_big_endian(&response.return_data)
            } else {
                U256::zero()
            };

            results.push(AllowanceResult {
                token,
                owner,
                spender,
                allowance,
                success: response.success,
            });
        }

        Ok(results)
    }
}

#[derive(Debug, Clone)]
pub struct MulticallRequest {
    pub target: Address,
    pub call_data: Bytes,
}

#[derive(Debug, Clone)]
pub struct MulticallResponse {
    pub target: Address,
    pub success: bool,
    pub return_data: Bytes,
}

#[derive(Debug, Clone)]
pub struct BalanceResult {
    pub token: Address,
    pub wallet: Address,
    pub balance: U256,
    pub success: bool,
}

#[derive(Debug, Clone)]
pub struct PriceResult {
    pub pair: Address,
    pub reserve0: U256,
    pub reserve1: U256,
    pub success: bool,
}

#[derive(Debug, Clone)]
pub struct AllowanceResult {
    pub token: Address,
    pub owner: Address,
    pub spender: Address,
    pub allowance: U256,
    pub success: bool,
}