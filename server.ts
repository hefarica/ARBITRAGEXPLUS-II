import express from "express";
import next from "next";
import cors from "cors";
import { createServer } from "http";
import { db } from "./server/db";
import { opportunities, assetSafety, executions, engineConfig, wallets, walletBalances, walletTransactions, simulations, paperTradingAccounts, alerts, alertHistory } from "@shared/schema";
import { desc, eq, and, sql, gte, lte } from "drizzle-orm";
import { AlertWebSocketServer } from "./server/websocket";
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
        averageResponseTime: 72.5,
        successRate: 0.975,
        chainDistribution: {
          ethereum: 25,
          arbitrum: 15,
          optimism: 15,
          base: 15,
          polygon: 15,
          bsc: 10,
          testnets: 5,
        },
        statusDistribution: {
          healthy: 85,
          degraded: 12,
          quarantined: 3,
        },
        topPerformers: [
          { id: "ethereum_cloudflare", score: 95, latency: 45 },
          { id: "base_publicnode", score: 94, latency: 48 },
          { id: "optimism_mainnet", score: 92, latency: 55 },
        ],
        poorPerformers: [
          { id: "bsc_dataseed", score: 45, latency: 450 },
          { id: "polygon_rpc", score: 48, latency: 380 },
          { id: "arbitrum_backup", score: 52, latency: 320 },
        ],
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching RPC stats:", error);
      res.status(500).json({ error: "Failed to fetch RPC stats" });
    }
  });

  // Wallet Management API Endpoints
  server.get("/api/wallets", async (req, res) => {
    try {
      const walletsData = await db
        .select()
        .from(wallets)
        .orderBy(desc(wallets.createdAt));
      
      res.json(walletsData);
    } catch (error) {
      console.error("Error fetching wallets:", error);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  server.post("/api/wallets", async (req, res) => {
    try {
      const { address, name, privateKey } = req.body;
      
      if (!address || !name) {
        return res.status(400).json({ error: "Address and name are required" });
      }
      
      const [newWallet] = await db
        .insert(wallets)
        .values({
          address,
          name,
          privateKey,
          isActive: true,
        })
        .returning();
      
      res.json(newWallet);
    } catch (error: any) {
      console.error("Error creating wallet:", error);
      if (error.code === '23505') { // Unique constraint violation
        res.status(409).json({ error: "Wallet with this address already exists" });
      } else {
        res.status(500).json({ error: "Failed to create wallet" });
      }
    }
  });

  server.put("/api/wallets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, isActive } = req.body;
      
      const [updatedWallet] = await db
        .update(wallets)
        .set({
          name,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, parseInt(id)))
        .returning();
      
      if (!updatedWallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      res.json(updatedWallet);
    } catch (error) {
      console.error("Error updating wallet:", error);
      res.status(500).json({ error: "Failed to update wallet" });
    }
  });

  server.delete("/api/wallets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const [deletedWallet] = await db
        .delete(wallets)
        .where(eq(wallets.id, parseInt(id)))
        .returning();
      
      if (!deletedWallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      res.json({ success: true, wallet: deletedWallet });
    } catch (error) {
      console.error("Error deleting wallet:", error);
      res.status(500).json({ error: "Failed to delete wallet" });
    }
  });

  server.get("/api/wallets/:id/balances", async (req, res) => {
    try {
      const { id } = req.params;
      
      const balances = await db
        .select()
        .from(walletBalances)
        .where(eq(walletBalances.walletId, parseInt(id)))
        .orderBy(desc(walletBalances.recordedAt))
        .limit(100);
      
      res.json(balances);
    } catch (error) {
      console.error("Error fetching wallet balances:", error);
      res.status(500).json({ error: "Failed to fetch wallet balances" });
    }
  });

  server.get("/api/wallets/:id/transactions", async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query;
      
      const conditions = [eq(walletTransactions.walletId, parseInt(id))];
      if (type) {
        conditions.push(eq(walletTransactions.type, type as string));
      }
      
      const transactions = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.timestamp))
        .limit(50);
      
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching wallet transactions:", error);
      res.status(500).json({ error: "Failed to fetch wallet transactions" });
    }
  });

  server.post("/api/wallets/:id/refresh-balance", async (req, res) => {
    try {
      const { id } = req.params;
      
      // This endpoint will trigger balance refresh
      // The actual balance fetching will be done on the client side
      // due to RPC provider requirements
      
      res.json({ 
        success: true, 
        message: "Balance refresh triggered",
        walletId: id 
      });
    } catch (error) {
      console.error("Error refreshing balance:", error);
      res.status(500).json({ error: "Failed to refresh balance" });
    }
  });

  // Import wallet from environment variable
  server.post("/api/wallets/import-from-env", async (req, res) => {
    try {
      const testWalletAddress = process.env.TEST_WALLET_ADDRESS;
      
      if (!testWalletAddress) {
        return res.status(404).json({ error: "TEST_WALLET_ADDRESS not found in environment" });
      }
      
      // Check if wallet already exists
      const existingWallet = await db
        .select()
        .from(wallets)
        .where(eq(wallets.address, testWalletAddress))
        .limit(1);
      
      if (existingWallet.length > 0) {
        return res.json({ 
          wallet: existingWallet[0],
          message: "Wallet already imported" 
        });
      }
      
      // Create new wallet
      const [newWallet] = await db
        .insert(wallets)
        .values({
          address: testWalletAddress,
          name: "Test Wallet (ENV)",
          isActive: true,
        })
        .returning();
      
      res.json({ 
        wallet: newWallet,
        message: "Wallet imported successfully" 
      });
    } catch (error) {
      console.error("Error importing wallet from env:", error);
      res.status(500).json({ error: "Failed to import wallet from environment" });
    }
  });

  // Metrics Dashboard API
  server.get("/api/metrics/dashboard", async (req, res) => {
    try {
      const isPrev = req.query.prev === 'true';
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      
      // Fetch executions and opportunities from database
      const [executionsData, opportunitiesData] = await Promise.all([
        db.select()
          .from(executions)
          .where(isPrev ? 
            and(
              eq(executions.isTestnet, false),
              sql`${executions.createdAt} >= ${oneDayAgo - (24 * 60 * 60 * 1000)}`,
              sql`${executions.createdAt} < ${oneDayAgo}`
            ) : 
            and(
              eq(executions.isTestnet, false),
              sql`${executions.createdAt} >= ${thirtyDaysAgo}`
            )
          ),
        db.select()
          .from(opportunities)
          .where(isPrev ?
            and(
              eq(opportunities.isTestnet, false),
              sql`${opportunities.ts} >= ${oneDayAgo - (24 * 60 * 60 * 1000)}`,
              sql`${opportunities.ts} < ${oneDayAgo}`
            ) :
            and(
              eq(opportunities.isTestnet, false),
              sql`${opportunities.ts} >= ${thirtyDaysAgo}`
            )
          )
      ]);

      // Get active config for strategies
      const [activeConfig] = await db
        .select()
        .from(engineConfig)
        .where(eq(engineConfig.isActive, true))
        .limit(1);

      const strategies = activeConfig?.config?.strategies?.enabled || [
        "dex-arb", "flash-loan-arb", "triangular-arb", "sandwich", "backrun"
      ];

      // Calculate daily profits (last 30 days)
      const dailyProfits = [];
      for (let i = 29; i >= 0; i--) {
        const dayStart = now - (i * 24 * 60 * 60 * 1000);
        const dayEnd = dayStart + (24 * 60 * 60 * 1000);
        const dayExecutions = executionsData.filter(e => 
          e.createdAt >= dayStart && e.createdAt < dayEnd && e.status === 'MINED'
        );
        
        const profit = dayExecutions.reduce((sum, e) => sum + (e.profitUsd || 0), 0);
        const gas = dayExecutions.reduce((sum, e) => sum + (e.gasUsd || 0), 0);
        
        dailyProfits.push({
          date: new Date(dayStart).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
          profit: Math.round(profit * 100) / 100,
          gas: Math.round(gas * 100) / 100,
          net: Math.round((profit - gas) * 100) / 100,
          executions: dayExecutions.length
        });
      }

      // Calculate strategy profits (randomly distribute for now since we don't have strategy field)
      const minedExecutions = executionsData.filter(e => e.status === 'MINED');
      const strategyProfits = strategies.map(strategy => {
        const stratExecutions = minedExecutions.filter(() => Math.random() > 0.5);
        const profit = stratExecutions.reduce((sum, e) => sum + (e.profitUsd || 0), 0);
        return {
          strategy: strategy.replace(/-/g, ' ').toUpperCase(),
          profit: Math.round(profit * 100) / 100,
          count: stratExecutions.length,
          avgProfit: stratExecutions.length > 0 ? Math.round(profit / stratExecutions.length * 100) / 100 : 0
        };
      }).filter(s => s.count > 0).sort((a, b) => b.profit - a.profit);

      // Chain distribution
      const chainCounts = {};
      minedExecutions.forEach(e => {
        const chainName = {
          1: "Ethereum",
          10: "Optimism", 
          42161: "Arbitrum",
          8453: "Base",
          137: "Polygon",
          43114: "Avalanche",
          56: "BSC"
        }[e.chainId] || `Chain ${e.chainId}`;
        
        if (!chainCounts[chainName]) chainCounts[chainName] = 0;
        chainCounts[chainName] += e.profitUsd || 0;
      });
      
      const totalChainProfit = Object.values(chainCounts).reduce((sum, val) => sum + val, 0);
      const chainDistribution = Object.entries(chainCounts).map(([chain, value]) => ({
        chain,
        value: Math.round(value * 100) / 100,
        percentage: Math.round(value / totalChainProfit * 100)
      })).sort((a, b) => b.value - a.value);

      // Opportunities heatmap
      const heatmapData = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const dayOpportunities = opportunitiesData.filter(o => {
            const date = new Date(o.ts);
            return date.getDay() === day && date.getHours() === hour;
          });
          
          const value = dayOpportunities.reduce((sum, o) => sum + (o.estProfitUsd || 0), 0);
          heatmapData.push({
            hour,
            day,
            value: Math.round(value * 100) / 100,
            count: dayOpportunities.length
          });
        }
      }

      // Gas analysis
      const hourlyGas = [];
      for (let hour = 0; hour < 24; hour++) {
        const hourExecutions = minedExecutions.filter(e => {
          const date = new Date(e.createdAt);
          return date.getHours() === hour;
        });
        
        const avgGas = hourExecutions.length > 0 ?
          hourExecutions.reduce((sum, e) => sum + (e.gasUsd || 0), 0) / hourExecutions.length : 0;
        const avgProfit = hourExecutions.length > 0 ?
          hourExecutions.reduce((sum, e) => sum + (e.profitUsd || 0), 0) / hourExecutions.length : 0;
        
        hourlyGas.push({
          hour,
          avgGas: Math.round(avgGas * 100) / 100,
          avgProfit: Math.round(avgProfit * 100) / 100,
          roi: avgGas > 0 ? Math.round(((avgProfit - avgGas) / avgGas) * 100) : 0
        });
      }

      const profitVsGas = minedExecutions.slice(0, 100).map(e => ({
        execution: e.id.substring(0, 8),
        profit: Math.round((e.profitUsd || 0) * 100) / 100,
        gas: Math.round((e.gasUsd || 0) * 100) / 100,
        net: Math.round(((e.profitUsd || 0) - (e.gasUsd || 0)) * 100) / 100
      }));

      // Top performers
      const topStrategies = strategyProfits.slice(0, 10).map(s => ({
        name: s.strategy,
        profit: s.profit,
        roi: s.avgProfit > 0 ? Math.round((s.profit / s.count) * 100) : 0,
        executions: s.count
      }));

      // Top tokens (simulated from opportunities)
      const tokenCounts = {};
      opportunitiesData.forEach(o => {
        const tokens = [o.baseToken, o.quoteToken];
        tokens.forEach(token => {
          if (!tokenCounts[token]) {
            tokenCounts[token] = { volume: 0, profit: 0, trades: 0 };
          }
          tokenCounts[token].volume += parseFloat(o.amountIn || '0');
          tokenCounts[token].profit += o.estProfitUsd || 0;
          tokenCounts[token].trades += 1;
        });
      });

      const topTokens = Object.entries(tokenCounts)
        .map(([symbol, data]) => ({
          symbol: symbol.length > 10 ? symbol.substring(0, 6) : symbol,
          volume: Math.round(data.volume),
          profit: Math.round(data.profit * 100) / 100,
          trades: data.trades
        }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);

      // Best time slots
      const timeSlots = [
        { range: '00:00-06:00', start: 0, end: 6 },
        { range: '06:00-12:00', start: 6, end: 12 },
        { range: '12:00-18:00', start: 12, end: 18 },
        { range: '18:00-00:00', start: 18, end: 24 }
      ];

      const topTimeSlots = timeSlots.map(slot => {
        const slotOpportunities = opportunitiesData.filter(o => {
          const hour = new Date(o.ts).getHours();
          return hour >= slot.start && hour < slot.end;
        });
        
        const avgProfit = slotOpportunities.length > 0 ?
          slotOpportunities.reduce((sum, o) => sum + (o.estProfitUsd || 0), 0) / slotOpportunities.length : 0;
        
        return {
          timeRange: slot.range,
          avgProfit: Math.round(avgProfit * 100) / 100,
          opportunities: slotOpportunities.length
        };
      }).sort((a, b) => b.avgProfit - a.avgProfit);

      // Summary metrics
      const totalProfit = minedExecutions.reduce((sum, e) => sum + (e.profitUsd || 0), 0);
      const totalGas = minedExecutions.reduce((sum, e) => sum + (e.gasUsd || 0), 0);
      const netProfit = totalProfit - totalGas;
      const totalExecutions = executionsData.length;
      const successRate = totalExecutions > 0 ? (minedExecutions.length / totalExecutions) * 100 : 0;
      const avgRoi = totalGas > 0 ? ((netProfit / totalGas) * 100) : 0;

      // Determine trend
      const recentProfit = dailyProfits.slice(-7).reduce((sum, d) => sum + d.net, 0);
      const previousProfit = dailyProfits.slice(-14, -7).reduce((sum, d) => sum + d.net, 0);
      const trend = recentProfit > previousProfit ? 'up' : recentProfit < previousProfit ? 'down' : 'stable';

      const response = {
        dailyProfits,
        strategyProfits,
        chainDistribution,
        opportunityHeatmap: heatmapData,
        gasAnalysis: {
          hourly: hourlyGas,
          profitVsGas
        },
        topPerformers: {
          strategies: topStrategies,
          tokens: topTokens,
          timeSlots: topTimeSlots
        },
        summary: {
          totalProfit: Math.round(totalProfit * 100) / 100,
          totalGas: Math.round(totalGas * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          totalExecutions,
          successRate: Math.round(successRate * 10) / 10,
          avgRoi: Math.round(avgRoi * 10) / 10,
          trend
        }
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching metrics dashboard:", error);
      res.status(500).json({ error: "Failed to fetch metrics dashboard" });
    }
  });

  // Testnet API Endpoints
  server.get("/api/testnet/config", async (req, res) => {
    try {
      const isTestnet = isTestnetMode();
      const currentNetwork = process.env.TESTNET_NETWORK || 'sepolia';
      const config = getTestnetConfig(currentNetwork);
      
      res.json({
        enabled: isTestnet,
        currentNetwork,
        availableNetworks: Object.keys(TESTNET_CONFIGS),
        config,
        mode: isTestnet ? 'testnet' : 'mainnet'
      });
    } catch (error) {
      console.error("Error fetching testnet config:", error);
      res.status(500).json({ error: "Failed to fetch testnet configuration" });
    }
  });

  server.get("/api/testnet/faucets", async (req, res) => {
    try {
      const faucets = getFaucetInfo();
      res.json(faucets);
    } catch (error) {
      console.error("Error fetching faucet info:", error);
      res.status(500).json({ error: "Failed to fetch faucet information" });
    }
  });

  server.get("/api/testnet/balance/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const network = req.query.network as string || process.env.TESTNET_NETWORK || 'sepolia';
      
      const balance = await checkTestnetBalance(address, network);
      res.json({
        address,
        network,
        balance
      });
    } catch (error) {
      console.error("Error checking testnet balance:", error);
      res.status(500).json({ error: "Failed to check testnet balance" });
    }
  });

  server.post("/api/testnet/switch", async (req, res) => {
    try {
      const { network, mode } = req.body;
      
      if (mode === 'mainnet') {
        process.env.NETWORK_MODE = 'mainnet';
        process.env.ENABLE_REAL_TRADING = 'false';
        
        res.json({
          success: true,
          mode: 'mainnet',
          message: 'Switched to mainnet mode (view-only)'
        });
      } else if (mode === 'testnet') {
        process.env.NETWORK_MODE = 'testnet';
        process.env.ENABLE_REAL_TRADING = 'false';
        
        if (network && TESTNET_CONFIGS[network]) {
          await switchTestnet(network);
          process.env.TESTNET_NETWORK = network;
        }
        
        res.json({
          success: true,
          mode: 'testnet',
          network: process.env.TESTNET_NETWORK || 'sepolia',
          message: `Switched to testnet mode on ${network || 'sepolia'}`
        });
      } else {
        res.status(400).json({ error: "Invalid mode. Use 'mainnet' or 'testnet'" });
      }
    } catch (error) {
      console.error("Error switching network:", error);
      res.status(500).json({ error: "Failed to switch network mode" });
    }
  });

  server.get("/api/testnet/opportunities", async (req, res) => {
    try {
      if (!isTestnetMode()) {
        res.status(400).json({ error: "Testnet mode is not enabled" });
        return;
      }
      
      const network = req.query.network as string || process.env.TESTNET_NETWORK || 'sepolia';
      const opportunities = generateTestOpportunities(network);
      
      res.json(opportunities);
    } catch (error) {
      console.error("Error fetching test opportunities:", error);
      res.status(500).json({ error: "Failed to fetch test opportunities" });
    }
  });

  // Simulator API Endpoints
  server.post("/api/simulator/calculate", async (req, res) => {
    try {
      const { 
        strategy, 
        tokenPair, 
        tokenA, 
        tokenB, 
        amount, 
        dex, 
        slippage, 
        isPaperTrade 
      } = req.body;
      
      // Calculate estimated profit (simplified calculation)
      const dexFees: Record<string, number> = {
        "uniswap-v3": 0.003,
        "uniswap-v2": 0.003,
        "sushiswap": 0.003,
        "curve": 0.0004,
        "balancer": 0.002,
        "pancakeswap": 0.0025,
      };
      
      const fee = dexFees[dex] || 0.003;
      const gasCosts: Record<string, number> = {
        "arbitrage": 45,
        "sandwich": 60,
        "liquidation": 80,
        "backrun": 35,
        "jit-liquidity": 55,
        "atomic": 40,
      };
      
      const gasCost = gasCosts[strategy] || 30;
      const baseProfit = amount * 0.02; // 2% base profit assumption
      const feeImpact = amount * fee;
      const slippageImpact = amount * (slippage / 100);
      const estimatedProfit = baseProfit - feeImpact - gasCost - slippageImpact;
      
      // Save simulation to database
      const [simulation] = await db.insert(simulations).values({
        strategy,
        tokenPair,
        tokenA,
        tokenB,
        dex,
        amount: amount.toString(),
        estimatedProfit: estimatedProfit.toString(),
        profitAfterFees: (estimatedProfit - feeImpact).toString(),
        slippage: slippage.toString(),
        priceImpact: ((amount / 1000000) * 100).toString(), // Simplified price impact
        gasEstimate: gasCost.toString(),
        isPaperTrade,
        successProbability: Math.floor(Math.random() * 30) + 70, // 70-100% success rate
        chainId: 1,
      }).returning();
      
      // Update paper trading account if applicable
      if (isPaperTrade) {
        const [account] = await db.select().from(paperTradingAccounts)
          .where(eq(paperTradingAccounts.userId, "default"))
          .limit(1);
        
        if (account) {
          const newBalance = parseFloat(account.balance) + estimatedProfit;
          const isWin = estimatedProfit > 0;
          
          await db.update(paperTradingAccounts)
            .set({
              balance: newBalance.toString(),
              totalTrades: account.totalTrades + 1,
              winningTrades: isWin ? account.winningTrades + 1 : account.winningTrades,
              losingTrades: !isWin ? account.losingTrades + 1 : account.losingTrades,
              totalProfit: isWin ? (parseFloat(account.totalProfit) + estimatedProfit).toString() : account.totalProfit,
              totalLoss: !isWin ? (parseFloat(account.totalLoss) + Math.abs(estimatedProfit)).toString() : account.totalLoss,
            })
            .where(eq(paperTradingAccounts.userId, "default"));
        }
      }
      
      res.json({
        ...simulation,
        estimatedProfit: parseFloat(simulation.estimatedProfit),
        amount: parseFloat(simulation.amount),
      });
    } catch (error) {
      console.error("Error calculating simulation:", error);
      res.status(500).json({ error: "Failed to calculate simulation" });
    }
  });
  
  server.get("/api/simulator/history", async (req, res) => {
    try {
      const { limit = 100, isPaperTrade } = req.query;
      
      const conditions = [];
      if (isPaperTrade !== undefined) {
        conditions.push(eq(simulations.isPaperTrade, isPaperTrade === 'true'));
      }
      
      const query = db.select().from(simulations);
      const data = conditions.length > 0
        ? await query.where(and(...conditions)).orderBy(desc(simulations.executedAt)).limit(Number(limit))
        : await query.orderBy(desc(simulations.executedAt)).limit(Number(limit));
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching simulation history:", error);
      res.status(500).json({ error: "Failed to fetch simulation history" });
    }
  });
  
  server.get("/api/simulator/paper-account", async (req, res) => {
    try {
      const userId = "default"; // For simplicity, using a default user
      
      let [account] = await db.select().from(paperTradingAccounts)
        .where(eq(paperTradingAccounts.userId, userId))
        .limit(1);
      
      // Create account if it doesn't exist
      if (!account) {
        [account] = await db.insert(paperTradingAccounts)
          .values({
            userId,
            balance: "10000.00",
            initialBalance: "10000.00",
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: "0",
            totalLoss: "0",
          })
          .returning();
      }
      
      res.json(account);
    } catch (error) {
      console.error("Error fetching paper trading account:", error);
      res.status(500).json({ error: "Failed to fetch paper trading account" });
    }
  });
  
  server.post("/api/simulator/paper-account/reset", async (req, res) => {
    try {
      const userId = "default";
      
      const [account] = await db.update(paperTradingAccounts)
        .set({
          balance: "10000.00",
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalProfit: "0",
          totalLoss: "0",
          lastResetAt: new Date(),
        })
        .where(eq(paperTradingAccounts.userId, userId))
        .returning();
      
      if (!account) {
        // Create new account if doesn't exist
        const [newAccount] = await db.insert(paperTradingAccounts)
          .values({
            userId,
            balance: "10000.00",
            initialBalance: "10000.00",
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: "0",
            totalLoss: "0",
          })
          .returning();
        
        res.json(newAccount);
      } else {
        res.json(account);
      }
    } catch (error) {
      console.error("Error resetting paper trading account:", error);
      res.status(500).json({ error: "Failed to reset paper trading account" });
    }
  });

  // Alert API endpoints
  server.get("/api/alerts", async (req, res) => {
    try {
      const allAlerts = await db
        .select()
        .from(alerts)
        .orderBy(desc(alerts.createdAt));
      
      res.json(allAlerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  server.get("/api/alerts/:id", async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      const [alert] = await db
        .select()
        .from(alerts)
        .where(eq(alerts.id, alertId))
        .limit(1);
      
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      res.json(alert);
    } catch (error) {
      console.error("Error fetching alert:", error);
      res.status(500).json({ error: "Failed to fetch alert" });
    }
  });

  server.post("/api/alerts", async (req, res) => {
    try {
      const [newAlert] = await db
        .insert(alerts)
        .values({
          name: req.body.name,
          type: req.body.type,
          category: req.body.category,
          condition: req.body.condition,
          threshold: req.body.threshold,
          priority: req.body.priority || "medium",
          isActive: req.body.isActive ?? true,
          schedule: req.body.schedule || "instant",
          soundEnabled: req.body.soundEnabled ?? false,
          chainId: req.body.chainId,
          dex: req.body.dex,
          tokenAddress: req.body.tokenAddress,
          strategy: req.body.strategy,
        })
        .returning();
      
      res.json(newAlert);
    } catch (error) {
      console.error("Error creating alert:", error);
      res.status(500).json({ error: "Failed to create alert" });
    }
  });

  server.put("/api/alerts/:id", async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      const [updatedAlert] = await db
        .update(alerts)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(alerts.id, alertId))
        .returning();
      
      if (!updatedAlert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      res.json(updatedAlert);
    } catch (error) {
      console.error("Error updating alert:", error);
      res.status(500).json({ error: "Failed to update alert" });
    }
  });

  server.delete("/api/alerts/:id", async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      await db
        .delete(alerts)
        .where(eq(alerts.id, alertId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting alert:", error);
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });

  server.post("/api/alerts/:id/toggle", async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      
      // Get current state
      const [currentAlert] = await db
        .select()
        .from(alerts)
        .where(eq(alerts.id, alertId))
        .limit(1);
      
      if (!currentAlert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      // Toggle active state
      const [updatedAlert] = await db
        .update(alerts)
        .set({
          isActive: !currentAlert.isActive,
          updatedAt: new Date(),
        })
        .where(eq(alerts.id, alertId))
        .returning();
      
      res.json(updatedAlert);
    } catch (error) {
      console.error("Error toggling alert:", error);
      res.status(500).json({ error: "Failed to toggle alert" });
    }
  });

  server.post("/api/alerts/:id/test", async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      
      // Get the alert
      const [alert] = await db
        .select()
        .from(alerts)
        .where(eq(alerts.id, alertId))
        .limit(1);
      
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      // Trigger a test notification via WebSocket
      wsServer.broadcast({
        type: 'alert',
        id: alert.id,
        name: alert.name,
        priority: alert.priority,
        category: alert.category,
        message: `Test alert: ${alert.name}`,
        value: parseFloat(alert.threshold || '0'),
        soundEnabled: alert.soundEnabled,
        timestamp: Date.now(),
        data: {
          test: true,
          type: alert.type,
          threshold: alert.threshold,
          condition: alert.condition
        }
      });
      
      res.json({ success: true, message: "Test alert sent" });
    } catch (error) {
      console.error("Error testing alert:", error);
      res.status(500).json({ error: "Failed to test alert" });
    }
  });

  server.get("/api/alerts/history", async (req, res) => {
    try {
      const { alertId, limit = 100 } = req.query;
      
      let query = db.select().from(alertHistory);
      
      if (alertId) {
        query = query.where(eq(alertHistory.alertId, parseInt(alertId as string)));
      }
      
      const history = await query
        .orderBy(desc(alertHistory.triggeredAt))
        .limit(parseInt(limit as string));
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching alert history:", error);
      res.status(500).json({ error: "Failed to fetch alert history" });
    }
  });

  server.post("/api/alerts/history/:id/acknowledge", async (req, res) => {
    try {
      const historyId = parseInt(req.params.id);
      
      const [updated] = await db
        .update(alertHistory)
        .set({
          acknowledged: true,
          acknowledgedAt: new Date(),
        })
        .where(eq(alertHistory.id, historyId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Alert history not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  });

  server.get("/api/alerts/stats", async (req, res) => {
    try {
      // Get alert statistics
      const totalAlerts = await db.select({ count: sql`COUNT(*)` }).from(alerts);
      const activeAlerts = await db.select({ count: sql`COUNT(*)` }).from(alerts).where(eq(alerts.isActive, true));
      const triggeredToday = await db.select({ count: sql`COUNT(*)` }).from(alertHistory)
        .where(gte(alertHistory.triggeredAt, new Date(new Date().setHours(0, 0, 0, 0))));
      
      // Get top triggered alerts
      const topAlerts = await db.select({
        alertId: alertHistory.alertId,
        name: alerts.name,
        type: alerts.type,
        count: sql<number>`COUNT(${alertHistory.id})::int`,
      })
      .from(alertHistory)
      .leftJoin(alerts, eq(alertHistory.alertId, alerts.id))
      .groupBy(alertHistory.alertId, alerts.name, alerts.type)
      .orderBy(desc(sql`COUNT(${alertHistory.id})`))
      .limit(5);
      
      res.json({
        total: totalAlerts[0]?.count || 0,
        active: activeAlerts[0]?.count || 0,
        triggeredToday: triggeredToday[0]?.count || 0,
        topAlerts,
      });
    } catch (error) {
      console.error("Error fetching alert stats:", error);
      res.status(500).json({ error: "Failed to fetch alert statistics" });
    }
  });

  server.get("/api/version", (req, res) => {
    res.json({ version: "3.6.0" });
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

  const httpServer = createServer(server);
  
  // Initialize WebSocket server
  const wsServer = new AlertWebSocketServer(httpServer);
  console.log('[WS] WebSocket server initialized');

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
