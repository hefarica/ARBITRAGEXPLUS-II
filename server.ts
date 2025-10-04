import express from "express";
import next from "next";
import cors from "cors";
import { db } from "./server/db";
import { opportunities, assetSafety, executions, engineConfig } from "@shared/schema";
import { desc, eq } from "drizzle-orm";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "5000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();

  server.use(cors());
  server.use(express.json());

  server.get("/cf/opportunities", async (req, res) => {
    try {
      const data = await db
        .select()
        .from(opportunities)
        .orderBy(desc(opportunities.ts))
        .limit(100);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      res.status(500).json({ error: "Failed to fetch opportunities" });
    }
  });

  server.get("/cf/assets", async (req, res) => {
    try {
      const data = await db
        .select()
        .from(assetSafety)
        .orderBy(desc(assetSafety.updatedAt));
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching assets:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  server.get("/cf/executions", async (req, res) => {
    try {
      const data = await db
        .select()
        .from(executions)
        .orderBy(desc(executions.createdAt))
        .limit(200);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching executions:", error);
      res.status(500).json({ error: "Failed to fetch executions" });
    }
  });

  server.get("/api/config", async (req, res) => {
    try {
      const [config] = await db
        .select()
        .from(engineConfig)
        .where(eq(engineConfig.isActive, true))
        .orderBy(desc(engineConfig.updatedAt))
        .limit(1);
      
      if (!config) {
        return res.status(404).json({ error: "No active configuration found" });
      }
      
      res.json(config.config);
    } catch (error) {
      console.error("Error fetching config:", error);
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  });

  server.get("/api/config/default", async (req, res) => {
    const defaultConfig = {
      version: "3.6.0",
      mode: "production",
      chains: {
        enabled: ["ethereum", "arbitrum", "optimism", "polygon", "bsc"],
        ethereum: {
          rpc: "wss://eth-mainnet.alchemyapi.io/v2/...",
          maxGasPrice: "150",
          minProfitThreshold: "0.015"
        },
        arbitrum: {
          rpc: "wss://arb-mainnet.alchemyapi.io/v2/...",
          maxGasPrice: "2",
          minProfitThreshold: "0.01"
        },
        optimism: {
          rpc: "wss://opt-mainnet.alchemyapi.io/v2/...",
          maxGasPrice: "2",
          minProfitThreshold: "0.01"
        },
        polygon: {
          rpc: "wss://polygon-mainnet.alchemyapi.io/v2/...",
          maxGasPrice: "300",
          minProfitThreshold: "0.012"
        },
        bsc: {
          rpc: "wss://bsc-mainnet.alchemyapi.io/v2/...",
          maxGasPrice: "10",
          minProfitThreshold: "0.018"
        }
      },
      strategies: {
        enabled: [
          "dex-arb",
          "flash-loan-arb",
          "triangular-arb",
          "cross-chain-arb",
          "liquidation",
          "sandwich",
          "backrun",
          "jit-liquidity",
          "cex-dex-arb",
          "nft-arb",
          "mev-share",
          "atomic-arb",
          "statistical-arb"
        ],
        "dex-arb": {
          enabled: true,
          dexes: ["uniswap-v3", "sushiswap", "curve", "balancer"],
          minRoi: 0.015,
          maxSlippage: 0.005
        },
        "flash-loan-arb": {
          enabled: true,
          providers: ["aave-v3", "balancer", "uniswap-v3"],
          maxLeverageMultiplier: 5,
          minRoi: 0.02
        },
        "triangular-arb": {
          enabled: true,
          maxHops: 3,
          minRoi: 0.018
        },
        "cross-chain-arb": {
          enabled: true,
          bridges: ["stargate", "hop", "across"],
          minRoi: 0.025,
          maxBridgeTime: 600
        },
        liquidation: {
          enabled: true,
          protocols: ["aave-v3", "compound-v3", "euler"],
          minHealthFactor: 1.05,
          minRoi: 0.03
        },
        sandwich: {
          enabled: false,
          minTargetSize: "50000",
          maxFrontrunGas: "300"
        },
        backrun: {
          enabled: true,
          targetTypes: ["liquidation", "large-swap", "oracle-update"],
          minRoi: 0.012
        },
        "jit-liquidity": {
          enabled: true,
          protocols: ["uniswap-v3"],
          minRoi: 0.025
        },
        "cex-dex-arb": {
          enabled: true,
          exchanges: ["binance", "coinbase"],
          minRoi: 0.02,
          maxLatency: 500
        },
        "nft-arb": {
          enabled: false,
          marketplaces: ["opensea", "blur"],
          minRoi: 0.05
        },
        "mev-share": {
          enabled: true,
          relays: ["flashbots", "bloxroute"],
          minRoi: 0.015
        },
        "atomic-arb": {
          enabled: true,
          minRoi: 0.012
        },
        "statistical-arb": {
          enabled: true,
          confidenceThreshold: 0.95,
          minRoi: 0.02
        }
      },
      risk: {
        maxPositionSize: "100",
        maxDailyLoss: "500",
        enableKillSwitch: true,
        killSwitchLossThreshold: "1000",
        requiredSafetyScore: 70,
        blacklistedTokens: [],
        whitelistedTokens: ["WETH", "USDC", "USDT", "DAI", "WBTC"]
      },
      execution: {
        maxConcurrentTrades: 5,
        defaultSlippage: 0.005,
        privateMempool: true,
        relays: ["flashbots", "bloxroute", "mev-share"],
        gasStrategy: "adaptive",
        maxPriorityFeePerGas: "3",
        targetBlockDelay: 1
      },
      monitoring: {
        enableAlerts: true,
        alertChannels: ["telegram", "discord", "email"],
        metricsRetention: 30,
        enableGrafana: true,
        prometheusEndpoint: "http://localhost:9090"
      }
    };

    res.json(defaultConfig);
  });

  server.post("/api/config", async (req, res) => {
    try {
      const newConfig = req.body;
      
      await db
        .update(engineConfig)
        .set({ isActive: false })
        .where(eq(engineConfig.isActive, true));
      
      const [created] = await db
        .insert(engineConfig)
        .values({
          config: newConfig,
          isActive: true,
          version: newConfig.version || "1.0.0",
          updatedAt: new Date(),
        })
        .returning();
      
      res.json(created.config);
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ error: "Failed to update configuration" });
    }
  });

  server.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  server.all("*", async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
