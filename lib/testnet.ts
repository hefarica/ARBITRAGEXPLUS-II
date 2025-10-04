/**
 * ArbitrageX Supreme V3.6 - Testnet Helper Functions
 * 
 * This module provides helper functions for testnet operations including
 * network switching, balance checking, and transaction simulation.
 */

import { ethers } from "ethers";

export interface TestnetConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  faucetUrl: string;
  nativeToken: string;
  tokens: Record<string, string>;
  contracts: Record<string, string>;
}

export interface TestnetMode {
  enabled: boolean;
  currentNetwork: string;
  availableNetworks: string[];
}

export const TESTNET_CONFIGS: Record<string, TestnetConfig> = {
  sepolia: {
    chainId: 11155111,
    name: "Sepolia",
    rpcUrl: "https://rpc.sepolia.org",
    explorer: "https://sepolia.etherscan.io",
    faucetUrl: "https://sepoliafaucet.com",
    nativeToken: "ETH",
    tokens: {
      WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      USDT: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
      DAI: "0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6",
      UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"
    },
    contracts: {
      uniswapV3Factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
      uniswapV3Router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
      uniswapV3Quoter: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3"
    }
  },
  mumbai: {
    chainId: 80001,
    name: "Mumbai",
    rpcUrl: "https://rpc-mumbai.maticvigil.com",
    explorer: "https://mumbai.polygonscan.com",
    faucetUrl: "https://faucet.polygon.technology/",
    nativeToken: "MATIC",
    tokens: {
      WMATIC: "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
      USDC: "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23",
      USDT: "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832",
      DAI: "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F"
    },
    contracts: {
      quickswapFactory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
      quickswapRouter: "0x8954AfA98594b838bda56FE4C12a09D7739D179b"
    }
  },
  arbitrum_goerli: {
    chainId: 421613,
    name: "Arbitrum Goerli",
    rpcUrl: "https://goerli-rollup.arbitrum.io/rpc",
    explorer: "https://goerli.arbiscan.io",
    faucetUrl: "https://faucet.arbitrum.io",
    nativeToken: "ETH",
    tokens: {
      WETH: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3",
      USDC: "0x8FB1E3fC51F3b789dED7557E680551d93Ea9d892",
      USDT: "0x533046F316590C19d99c74eE661c6d541b64471C"
    },
    contracts: {
      uniswapV3Factory: "0x4893376342d5D7b3e31d4184c08b265e5aB2A3f6",
      uniswapV3Router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
    }
  },
  optimism_goerli: {
    chainId: 420,
    name: "Optimism Goerli",
    rpcUrl: "https://goerli.optimism.io",
    explorer: "https://goerli-optimism.etherscan.io",
    faucetUrl: "https://optimismfaucet.xyz",
    nativeToken: "ETH",
    tokens: {},
    contracts: {}
  },
  bsc_testnet: {
    chainId: 97,
    name: "BSC Testnet",
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
    explorer: "https://testnet.bscscan.com",
    faucetUrl: "https://testnet.bnbchain.org/faucet-smart",
    nativeToken: "BNB",
    tokens: {
      WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      BUSD: "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7",
      USDT: "0x7ef95a0FEE0Dd31b22626fA2e10Ee6A223F8a684",
      DAI: "0x8a9424745056Eb399FD19a0EC26A14316684e274"
    },
    contracts: {
      pancakeswapFactory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
      pancakeswapRouter: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1"
    }
  },
  base_goerli: {
    chainId: 84531,
    name: "Base Goerli",
    rpcUrl: "https://goerli.base.org",
    explorer: "https://goerli.basescan.org",
    faucetUrl: "https://faucet.quicknode.com/base/goerli",
    nativeToken: "ETH",
    tokens: {},
    contracts: {}
  }
};

/**
 * Get the current network mode from environment
 */
export function getNetworkMode(): TestnetMode {
  const isTestnet = process.env.NETWORK_MODE === 'testnet';
  const currentNetwork = process.env.TESTNET_NETWORK || 'sepolia';
  
  return {
    enabled: isTestnet,
    currentNetwork,
    availableNetworks: Object.keys(TESTNET_CONFIGS)
  };
}

/**
 * Check if we're in testnet mode
 */
export function isTestnetMode(): boolean {
  return process.env.NETWORK_MODE === 'testnet';
}

/**
 * Get configuration for a specific testnet
 */
export function getTestnetConfig(network?: string): TestnetConfig | null {
  const networkName = network || process.env.TESTNET_NETWORK || 'sepolia';
  return TESTNET_CONFIGS[networkName] || null;
}

/**
 * Switch to a different testnet
 */
export async function switchTestnet(network: string): Promise<boolean> {
  if (!TESTNET_CONFIGS[network]) {
    throw new Error(`Unknown testnet: ${network}`);
  }
  
  // Update environment variable
  process.env.TESTNET_NETWORK = network;
  
  // Return success
  return true;
}

/**
 * Create a provider for the current testnet
 */
export function getTestnetProvider(network?: string): ethers.JsonRpcProvider {
  const config = getTestnetConfig(network);
  if (!config) {
    throw new Error(`No configuration found for network: ${network}`);
  }
  
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

/**
 * Check balance for an address on a testnet
 */
export async function checkTestnetBalance(
  address: string,
  network?: string
): Promise<{
  native: string;
  tokens: Record<string, string>;
}> {
  const config = getTestnetConfig(network);
  if (!config) {
    throw new Error(`No configuration found for network: ${network}`);
  }
  
  const provider = getTestnetProvider(network);
  
  // Get native token balance
  const nativeBalance = await provider.getBalance(address);
  const formattedNative = ethers.formatEther(nativeBalance);
  
  // Get token balances
  const tokenBalances: Record<string, string> = {};
  
  for (const [symbol, tokenAddress] of Object.entries(config.tokens)) {
    try {
      // ERC20 ABI for balanceOf function
      const abi = ["function balanceOf(address) view returns (uint256)"];
      const contract = new ethers.Contract(tokenAddress, abi, provider);
      const balance = await contract.balanceOf(address);
      tokenBalances[symbol] = ethers.formatUnits(balance, 18);
    } catch (error) {
      tokenBalances[symbol] = "0";
    }
  }
  
  return {
    native: formattedNative,
    tokens: tokenBalances
  };
}

/**
 * Generate a test transaction for simulation
 */
export function generateTestTransaction(
  from: string,
  to: string,
  value: string,
  network?: string
): ethers.TransactionRequest {
  const config = getTestnetConfig(network);
  if (!config) {
    throw new Error(`No configuration found for network: ${network}`);
  }
  
  return {
    from,
    to,
    value: ethers.parseEther(value),
    chainId: config.chainId,
    gasLimit: 21000,
    maxFeePerGas: ethers.parseUnits("50", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
  };
}

/**
 * Simulate a transaction on testnet
 */
export async function simulateTransaction(
  tx: ethers.TransactionRequest,
  network?: string
): Promise<{
  success: boolean;
  estimatedGas?: bigint;
  error?: string;
}> {
  try {
    const provider = getTestnetProvider(network);
    const estimatedGas = await provider.estimateGas(tx);
    
    return {
      success: true,
      estimatedGas
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get faucet information for all testnets
 */
export function getFaucetInfo(): Array<{
  network: string;
  name: string;
  url: string;
  nativeToken: string;
}> {
  return Object.entries(TESTNET_CONFIGS).map(([key, config]) => ({
    network: key,
    name: config.name,
    url: config.faucetUrl,
    nativeToken: config.nativeToken
  }));
}

/**
 * Format testnet transaction for display
 */
export function formatTestnetTransaction(
  tx: any,
  network?: string
): {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  explorerUrl: string;
} {
  const config = getTestnetConfig(network);
  
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: ethers.formatEther(tx.value || "0"),
    gasUsed: tx.gasUsed ? tx.gasUsed.toString() : "0",
    explorerUrl: config ? `${config.explorer}/tx/${tx.hash}` : ""
  };
}

/**
 * Create a test wallet
 */
export function createTestWallet(): {
  address: string;
  privateKey: string;
  mnemonic: string;
} {
  const wallet = ethers.Wallet.createRandom();
  
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || ""
  };
}

/**
 * Import wallet from private key
 */
export function importWallet(privateKey: string, network?: string): ethers.Wallet {
  const provider = getTestnetProvider(network);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get test opportunities for demonstration
 */
export function generateTestOpportunities(network?: string): any[] {
  const config = getTestnetConfig(network);
  if (!config) return [];
  
  // Generate some mock opportunities for testing
  return [
    {
      id: `test-opp-${Date.now()}-1`,
      chainId: config.chainId,
      dexIn: "Uniswap V3",
      dexOut: "SushiSwap",
      baseToken: "WETH",
      quoteToken: "USDC",
      amountIn: "1.0",
      estProfitUsd: 12.5,
      gasUsd: 2.3,
      ts: Date.now(),
      isTestnet: true
    },
    {
      id: `test-opp-${Date.now()}-2`,
      chainId: config.chainId,
      dexIn: "Curve",
      dexOut: "Balancer",
      baseToken: "USDC",
      quoteToken: "DAI",
      amountIn: "1000",
      estProfitUsd: 8.2,
      gasUsd: 1.8,
      ts: Date.now(),
      isTestnet: true
    },
    {
      id: `test-opp-${Date.now()}-3`,
      chainId: config.chainId,
      dexIn: "Uniswap V3",
      dexOut: "Curve",
      baseToken: "USDT",
      quoteToken: "USDC",
      amountIn: "500",
      estProfitUsd: 5.7,
      gasUsd: 1.2,
      ts: Date.now(),
      isTestnet: true
    }
  ];
}

/**
 * Validate testnet address
 */
export function isValidTestnetAddress(address: string): boolean {
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get testnet chain name by ID
 */
export function getTestnetNameByChainId(chainId: number): string | null {
  for (const [key, config] of Object.entries(TESTNET_CONFIGS)) {
    if (config.chainId === chainId) {
      return config.name;
    }
  }
  return null;
}