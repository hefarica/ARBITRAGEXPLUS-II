import { db } from "../server/db";
import { opportunities, assetSafety, executions, engineConfig } from "@shared/schema";
import { randomUUID } from "crypto";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    const defaultConfig = {
      version: "3.6.0",
      mode: "production",
      chains: {
        enabled: ["ethereum", "arbitrum", "optimism", "polygon", "bsc"],
        ethereum: {
          rpc: "https://cloudflare-eth.com",
          maxGasPrice: "150",
          minProfitThreshold: "0.015"
        },
        arbitrum: {
          rpc: "https://arbitrum-one-rpc.publicnode.com",
          maxGasPrice: "2",
          minProfitThreshold: "0.01"
        }
      },
      strategies: {
        enabled: ["dex-arb", "flash-loan-arb", "triangular-arb"],
        "dex-arb": {
          enabled: true,
          dexes: ["uniswap-v3", "sushiswap"],
          minRoi: 0.015
        },
        "flash-loan-arb": {
          enabled: true,
          providers: ["aave-v3"],
          minRoi: 0.02
        }
      },
      risk: {
        maxPositionSize: "100",
        maxDailyLoss: "500",
        requiredSafetyScore: 70
      }
    };

    const [config] = await db.insert(engineConfig).values({
      version: "3.6.0",
      config: defaultConfig,
      isActive: true
    }).returning();
    console.log("✓ Created default engine config");

    const now = Date.now();
    const sampleOpportunities = [
      {
        id: randomUUID(),
        chainId: 1,
        dexIn: "uniswap-v3",
        dexOut: "sushiswap",
        baseToken: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        quoteToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        amountIn: "1.5",
        estProfitUsd: 45.50,
        gasUsd: 12.30,
        ts: now
      },
      {
        id: randomUUID(),
        chainId: 42161,
        dexIn: "aave-v3",
        dexOut: "curve",
        baseToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        quoteToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        amountIn: "5000",
        estProfitUsd: 150.25,
        gasUsd: 0.85,
        ts: now + 1000
      },
      {
        id: randomUUID(),
        chainId: 137,
        dexIn: "quickswap",
        dexOut: "sushiswap",
        baseToken: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
        quoteToken: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        amountIn: "10000",
        estProfitUsd: 125.80,
        gasUsd: 0.15,
        ts: now + 2000
      }
    ];

    for (const opp of sampleOpportunities) {
      await db.insert(opportunities).values(opp);
    }
    console.log("✓ Created sample opportunities");

    const sampleAssets = [
      {
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        score: 95,
        checks: [
          { id: "liquidity", passed: true, weight: 0.3 },
          { id: "oracle", passed: true, weight: 0.2 },
          { id: "age", passed: true, weight: 0.2 },
          { id: "holders", passed: true, weight: 0.15 },
          { id: "audit", passed: true, weight: 0.15 }
        ],
        updatedAt: now
      },
      {
        address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        score: 98,
        checks: [
          { id: "liquidity", passed: true, weight: 0.3 },
          { id: "oracle", passed: true, weight: 0.2 },
          { id: "age", passed: true, weight: 0.2 },
          { id: "holders", passed: true, weight: 0.15 },
          { id: "audit", passed: true, weight: 0.15 }
        ],
        updatedAt: now
      },
      {
        address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        score: 82,
        checks: [
          { id: "liquidity", passed: true, weight: 0.3 },
          { id: "oracle", passed: true, weight: 0.2 },
          { id: "age", passed: true, weight: 0.2 },
          { id: "holders", passed: true, weight: 0.15 },
          { id: "audit", passed: false, weight: 0.15, note: "No recent audit" }
        ],
        updatedAt: now
      }
    ];

    for (const asset of sampleAssets) {
      await db.insert(assetSafety).values(asset);
    }
    console.log("✓ Created sample assets");

    const sampleExecutions = [
      {
        id: randomUUID(),
        status: "MINED",
        txHash: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
        chainId: 1,
        profitUsd: 82.30,
        gasUsd: 12.45,
        createdAt: now - 3600000,
        updatedAt: now - 3500000
      },
      {
        id: randomUUID(),
        status: "MINED",
        txHash: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567891",
        chainId: 42161,
        profitUsd: 345.00,
        gasUsd: 0.85,
        createdAt: now - 1800000,
        updatedAt: now - 1700000
      },
      {
        id: randomUUID(),
        status: "PENDING",
        chainId: 137,
        profitUsd: undefined,
        gasUsd: 0.15,
        createdAt: now - 60000,
        updatedAt: now - 60000
      }
    ];

    for (const exec of sampleExecutions) {
      await db.insert(executions).values(exec);
    }
    console.log("✓ Created sample executions");

    console.log("🎉 Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seed();
