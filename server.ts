import express from "express";
import path from "path";
import next from "next";
import cors from "cors";
import { createServer } from "http";
import { db } from "./server/db";
import { opportunities, assetSafety, executions, engineConfig, wallets, walletBalances, walletTransactions, simulations, paperTradingAccounts, alerts, alertHistory, users, exchanges } from "@shared/schema";
import { desc, eq, and, sql, gte, lte } from "drizzle-orm";
import { subDays } from "date-fns";
import { AlertWebSocketServer } from "./server/websocket";
import { setWebSocketServer } from "./server/websocket-instance";
import { mevScanner } from "./server/mev-scanner";
import { arbitrageScanner } from "./server/arbitrage-scanner";
import { ChainDexFetcher } from "./server/chain-dex-fetcher";
import { engineApiRouter } from "./server/engine-api";
import { rpcHealthMonitor } from "./server/rpc-health-monitor";
import { assetOrchestratorRouter } from "./server/asset-orchestrator-api";
import { simulatorApiRouter } from "./server/simulator-api";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BSC",
  137: "Polygon",
  42161: "Arbitrum",
  43114: "Avalanche",
  8453: "Base",
};
import { 
  getTestnetConfig, 
  getFaucetInfo, 
  checkTestnetBalance,
  isTestnetMode,
  switchTestnet,
  generateTestOpportunities,
  TESTNET_CONFIGS
} from "./lib/testnet";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "5000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();

  server.use(cors());
  server.use(express.json({ limit: '10mb' }));
  
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  const RATE_LIMIT_WINDOW = 60000;
  const RATE_LIMIT_MAX = 100;

  server.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const clientData = rateLimitMap.get(ip);

    if (clientData) {
      if (now > clientData.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      } else if (clientData.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests' });
      } else {
        clientData.count++;
      }
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }

    if (rateLimitMap.size > 10000) {
      const oldestKey = Array.from(rateLimitMap.keys())[0];
      rateLimitMap.delete(oldestKey);
    }

    next();
  });
  
  server.use((req, res, next) => {
    console.log(`📥 Request: ${req.method} ${req.url}`);
    next();
  });
  
  server.use("/cf/engine", engineApiRouter);
  server.use("/api/engine", engineApiRouter); // Also mount on /api/engine for convenience
  server.use("/cf/orchestrator", assetOrchestratorRouter);
  server.use("/api/simulator", simulatorApiRouter);

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

  server.get("/api/assets/safety", async (req, res) => {
    try {
      const data = await db
        .select()
        .from(assetSafety)
        .orderBy(desc(assetSafety.updatedAt));
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching asset safety:", error);
      res.status(500).json({ error: "Failed to fetch asset safety" });
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

  server.get("/api/executions", async (req, res) => {
    try {
      const { chainId, status } = req.query;
      
      const conditions = [];
      if (chainId && chainId !== '') {
        conditions.push(eq(executions.chainId, parseInt(chainId as string)));
      }
      if (status && status !== '') {
        conditions.push(eq(executions.status, status as string));
      }
      
      const query = db.select().from(executions);
      const data = conditions.length > 0
        ? await query.where(and(...conditions)).orderBy(desc(executions.createdAt)).limit(200)
        : await query.orderBy(desc(executions.createdAt)).limit(200);
      
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

  // RPC Health API Endpoints
  server.get("/api/rpc/health", async (req, res) => {
    try {
      // Mock data for now - would be replaced with actual Rust API call
      const rpcHealth = {
        rpcs: [
          {
            id: "ethereum_cloudflare",
            url: "https://cloudflare-eth.com",
            chainId: 1,
            status: "healthy",
            healthScore: 95,
            latencyP50: 45,
            latencyP95: 120,
            errorRate: 0.01,
            lastCheck: Date.now() - 5000,
            totalRequests: 15234,
            failedRequests: 152,
          },
          {
            id: "ethereum_ankr",
            url: "https://rpc.ankr.com/eth",
            chainId: 1,
            status: "healthy",
            healthScore: 88,
            latencyP50: 62,
            latencyP95: 180,
            errorRate: 0.02,
            lastCheck: Date.now() - 5000,
            totalRequests: 12543,
            failedRequests: 251,
          },
          {
            id: "arbitrum_official",
            url: "https://arb1.arbitrum.io/rpc",
            chainId: 42161,
            status: "degraded",
            healthScore: 65,
            latencyP50: 120,
            latencyP95: 350,
            errorRate: 0.08,
            lastCheck: Date.now() - 5000,
            totalRequests: 8932,
            failedRequests: 714,
          },
          {
            id: "optimism_mainnet",
            url: "https://mainnet.optimism.io",
            chainId: 10,
            status: "healthy",
            healthScore: 92,
            latencyP50: 55,
            latencyP95: 140,
            errorRate: 0.015,
            lastCheck: Date.now() - 5000,
            totalRequests: 10234,
            failedRequests: 153,
          },
        ],
        summary: {
          totalRpcs: 100,
          healthyCount: 85,
          degradedCount: 12,
          quarantinedCount: 3,
          averageLatency: 72.5,
          averageErrorRate: 0.025,
        },
      };

      res.json(rpcHealth);
    } catch (error) {
      console.error("Error fetching RPC health:", error);
      res.status(500).json({ error: "Failed to fetch RPC health" });
    }
  });

  server.get("/api/rpc/metrics", async (req, res) => {
    try {
      const metrics = {
        totalRequests: 1234567,
        successRate: 0.975,
        averageLatency: 72.5,
        p50Latency: 45,
        p95Latency: 180,
        p99Latency: 350,
        requestsPerSecond: 128.5,
        errorsByType: {
          timeout: 1234,
          connection: 567,
          rateLimit: 890,
          other: 234,
        },
        requestsByChain: {
          ethereum: 456789,
          arbitrum: 234567,
          optimism: 189234,
          base: 156789,
          polygon: 134567,
          bsc: 63245,
        },
      };

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching RPC metrics:", error);
      res.status(500).json({ error: "Failed to fetch RPC metrics" });
    }
  });

  server.post("/api/rpc/toggle/:rpcId", async (req, res) => {
    try {
      const { rpcId } = req.params;
      const { enabled } = req.body;

      // Mock response - would be replaced with actual Rust API call
      res.json({ 
        success: true, 
        rpcId, 
        enabled,
        message: `RPC ${rpcId} ${enabled ? 'enabled' : 'disabled'} successfully`
      });
    } catch (error) {
      console.error("Error toggling RPC:", error);
      res.status(500).json({ error: "Failed to toggle RPC" });
    }
  });

  server.get("/api/rpc/stats", async (req, res) => {
    try {
      const stats = {
        totalRpcs: 100,
        activeRpcs: 97,
        totalRequestsToday: 12345678,
        totalRequestsHour: 512340,
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching RPC stats:", error);
      res.status(500).json({ error: "Failed to fetch RPC stats" });
    }
  });

  server.get("/api/wallets", async (req, res) => {
    try {
      const data = await db.select().from(wallets).orderBy(wallets.name);
      res.json(data);
    } catch (error) {
      console.error("Error fetching wallets:", error);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  server.get("/api/wallet-balances", async (req, res) => {
    try {
      const data = await db.select().from(walletBalances).orderBy(walletBalances.updatedAt);
      res.json(data);
    } catch (error) {
      console.error("Error fetching wallet balances:", error);
      res.status(500).json({ error: "Failed to fetch wallet balances" });
    }
  });

  server.get("/api/wallet-transactions", async (req, res) => {
    try {
      const data = await db.select().from(walletTransactions).orderBy(walletTransactions.timestamp);
      res.json(data);
    } catch (error) {
      console.error("Error fetching wallet transactions:", error);
      res.status(500).json({ error: "Failed to fetch wallet transactions" });
    }
  });

  server.get("/api/simulations", async (req, res) => {
    try {
      const data = await db.select().from(simulations).orderBy(simulations.timestamp);
      res.json(data);
    } catch (error) {
      console.error("Error fetching simulations:", error);
      res.status(500).json({ error: "Failed to fetch simulations" });
    }
  });

  server.get("/api/paper-trading-accounts", async (req, res) => {
    try {
      const data = await db.select().from(paperTradingAccounts).orderBy(paperTradingAccounts.name);
      res.json(data);
    } catch (error) {
      console.error("Error fetching paper trading accounts:", error);
      res.status(500).json({ error: "Failed to fetch paper trading accounts" });
    }
  });

  server.get("/api/alerts", async (req, res) => {
    try {
      const data = await db.select().from(alerts).orderBy(alerts.createdAt);
      res.json(data);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  server.get("/api/alert-history", async (req, res) => {
    try {
      const data = await db.select().from(alertHistory).orderBy(alertHistory.timestamp);
      res.json(data);
    } catch (error) {
      console.error("Error fetching alert history:", error);
      res.status(500).json({ error: "Failed to fetch alert history" });
    }
  });

  server.get("/api/testnet/config", async (req, res) => {
    try {
      const config = getTestnetConfig();
      res.json(config);
    } catch (error) {
      console.error("Error fetching testnet config:", error);
      res.status(500).json({ error: "Failed to fetch testnet config" });
    }
  });

  server.post("/api/testnet/switch", async (req, res) => {
    try {
      const { chainId } = req.body;
      switchTestnet(chainId);
      res.json({ success: true, message: `Switched to testnet ${chainId}` });
    } catch (error) {
      console.error("Error switching testnet:", error);
      res.status(500).json({ error: "Failed to switch testnet" });
    }
  });

  server.get("/api/testnet/faucet", async (req, res) => {
    try {
      const faucetInfo = getFaucetInfo();
      res.json(faucetInfo);
    } catch (error) {
      console.error("Error fetching faucet info:", error);
      res.status(500).json({ error: "Failed to fetch faucet info" });
    }
  });

  server.get("/api/testnet/balance", async (req, res) => {
    try {
      const { address, chainId } = req.query;
      if (!address || !chainId) {
        return res.status(400).json({ error: "Address and chainId are required" });
      }
      const balance = await checkTestnetBalance(address as string, parseInt(chainId as string));
      res.json({ balance });
    } catch (error) {
      console.error("Error checking testnet balance:", error);
      res.status(500).json({ error: "Failed to check testnet balance" });
    }
  });

  server.post("/api/testnet/generate-opportunities", async (req, res) => {
    try {
      const opportunities = generateTestOpportunities();
      res.json({ success: true, opportunities });
    } catch (error) {
      console.error("Error generating test opportunities:", error);
      res.status(500).json({ error: "Failed to generate test opportunities" });
    }
  });

  server.get("/api/arbitrage/export", async (req, res) => {
    try {
      const opportunitiesData = await db.select().from(opportunities).orderBy(desc(opportunities.ts));
      const csv = opportunitiesData.map(op => Object.values(op).join(",")).join("\n");
      res.header("Content-Type", "text/csv");
      res.attachment("arbitrage_opportunities.csv");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting arbitrage opportunities:", error);
      res.status(500).json({ error: "Failed to export arbitrage opportunities" });
    }
  });

  server.get("/api/user/rebalance", async (req, res) => {
    try {
      const [userConfig] = await db.select().from(users).limit(1);
      res.json({ autoRebalance: userConfig?.autoRebalance || false });
    } catch (error) {
      console.error("Error fetching user rebalance config:", error);
      res.status(500).json({ error: "Failed to fetch user rebalance config" });
    }
  });

  server.patch("/api/user/rebalance", async (req, res) => {
    try {
      const { autoRebalance } = req.body;
      await db.update(users).set({ autoRebalance }).where(eq(users.id, 1)); // Assuming a single user for simplicity
      res.json({ success: true, autoRebalance });
    } catch (error) {
      console.error("Error updating user rebalance config:", error);
      res.status(500).json({ error: "Failed to update user rebalance config" });
    }
  });

  server.get("/api/exchanges/status", async (req, res) => {
    try {
      const data = await db.select().from(exchanges).orderBy(exchanges.name);
      res.json(data);
    } catch (error) {
      console.error("Error fetching exchange statuses:", error);
      res.status(500).json({ error: "Failed to fetch exchange statuses" });
    }
  });

  // Serve Super Frontend
  server.get("/pro", (req, res) => {
    res.sendFile(path.resolve(__dirname, "..", "super-frontend", "index.html"));
  });

  server.all("*", (req, res) => {
    return handle(req, res);
  });
});
