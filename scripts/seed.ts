import { db } from "../server/db";
import { opportunities, assetSafety, executions, engineConfig } from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  const defaultConfig = {
    version: "3.6.0",
    mode: "production",
    chains: {
      enabled: ["ethereum", "arbitrum", "optimism", "polygon", "bsc"],
      ethereum: {
        rpc: "wss://eth-mainnet.alchemyapi.io/v2/demo",
        maxGasPrice: "150",
        minProfitThreshold: "0.015"
      },
      arbitrum: {
        rpc: "wss://arb-mainnet.alchemyapi.io/v2/demo",
        maxGasPrice: "2",
        minProfitThreshold: "0.01"
      }
    },
    strategies: {
      enabled: ["dex-arb", "flash-loan-arb"],
      "dex-arb": {
        enabled: true,
        dexes: ["uniswap-v3", "sushiswap"],
        minRoi: 0.015
      }
    },
    risk: {
      maxPositionSize: "100",
      maxDailyLoss: "500"
    }
  };

  const [config] = await db.insert(engineConfig).values({
    version: "3.6.0",
    config: defaultConfig,
    isActive: true
  }).returning();
  console.log("✓ Created default config");

  const sampleOpportunities = [
    {
      chain: "ethereum",
      strategy: "dex-arb",
      tokenIn: "WETH",
      tokenOut: "USDC",
      amountIn: "1.5",
      expectedAmountOut: "2850.75",
      roi: "2.45",
      expectedValue: "45.50",
      route: "Uniswap V3 → SushiSwap",
      gasEstimate: "0.015",
      expiresAt: new Date(Date.now() + 30000),
      status: "active"
    },
    {
      chain: "arbitrum",
      strategy: "flash-loan-arb",
      tokenIn: "USDC",
      tokenOut: "WETH",
      amountIn: "5000",
      expectedAmountOut: "2.65",
      roi: "3.20",
      expectedValue: "150.25",
      route: "Aave V3 Flash → Curve → Uniswap V3",
      gasEstimate: "0.002",
      expiresAt: new Date(Date.now() + 45000),
      status: "active"
    },
    {
      chain: "polygon",
      strategy: "triangular-arb",
      tokenIn: "MATIC",
      tokenOut: "USDT",
      amountIn: "10000",
      expectedAmountOut: "7520",
      roi: "1.85",
      expectedValue: "125.80",
      route: "QuickSwap → SushiSwap → Curve",
      gasEstimate: "0.05",
      expiresAt: new Date(Date.now() + 60000),
      status: "active"
    }
  ];

  for (const opp of sampleOpportunities) {
    await db.insert(opportunities).values(opp);
  }
  console.log("✓ Created sample opportunities");

  const sampleAssets = [
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      chain: "ethereum",
      symbol: "USDC",
      name: "USD Coin",
      riskLevel: "low",
      riskScore: 95,
      liquidity: "50000000000",
      holders: 2500000,
      contractAge: 1825,
      hasOracle: true,
      hasMintFunction: true,
      isProxy: true
    },
    {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      chain: "ethereum",
      symbol: "WETH",
      name: "Wrapped Ether",
      riskLevel: "low",
      riskScore: 98,
      liquidity: "75000000000",
      holders: 850000,
      contractAge: 2100,
      hasOracle: true,
      hasMintFunction: false,
      isProxy: false
    },
    {
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      chain: "ethereum",
      symbol: "UNI",
      name: "Uniswap",
      riskLevel: "medium",
      riskScore: 82,
      liquidity: "1500000000",
      holders: 425000,
      contractAge: 1200,
      hasOracle: true,
      hasMintFunction: true,
      isProxy: false
    }
  ];

  for (const asset of sampleAssets) {
    await db.insert(assetSafety).values(asset);
  }
  console.log("✓ Created sample assets");

  const sampleExecutions = [
    {
      txHash: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
      chain: "ethereum",
      strategy: "dex-arb",
      route: "Uniswap V3 → SushiSwap",
      amountIn: "2.0",
      amountOut: "3805.50",
      estimatedProfit: "85.50",
      actualProfit: "82.30",
      gasCost: "0.025",
      status: "mined",
      blockNumber: 18500000
    },
    {
      txHash: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567891",
      chain: "arbitrum",
      strategy: "flash-loan-arb",
      route: "Aave V3 Flash → Curve",
      amountIn: "10000",
      amountOut: "10350",
      estimatedProfit: "350",
      actualProfit: "345",
      gasCost: "0.005",
      status: "mined",
      blockNumber: 125000000
    },
    {
      txHash: "0x3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567892",
      chain: "polygon",
      strategy: "triangular-arb",
      route: "QuickSwap → SushiSwap → Curve",
      amountIn: "15000",
      amountOut: "15180",
      estimatedProfit: "180",
      actualProfit: null,
      gasCost: "0.08",
      status: "pending",
      blockNumber: null
    }
  ];

  for (const exec of sampleExecutions) {
    await db.insert(executions).values(exec);
  }
  console.log("✓ Created sample executions");

  console.log("Database seeded successfully!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Error seeding database:", error);
  process.exit(1);
});
