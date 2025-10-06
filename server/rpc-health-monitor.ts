import { db } from "./db";
import { chains, chainRpcs } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Automatic RPC Health Monitor
 * Periodically checks health of RPCs for ACTIVE chains only
 * Updates database with latency and health status
 */
class RpcHealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs = 3 * 60 * 1000; // 3 minutes
  private rpcTimeoutMs = 5000; // 5 second timeout per RPC

  /**
   * Start the automatic health monitoring
   */
  start() {
    if (this.isRunning) {
      console.log("⏭️  RPC Health Monitor already running");
      return;
    }

    console.log(`🏥 Starting RPC Health Monitor (checks every ${this.checkIntervalMs / 1000}s)`);
    this.isRunning = true;

    // Run immediately on start
    this.runHealthCheck();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runHealthCheck();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the health monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("🛑 RPC Health Monitor stopped");
  }

  /**
   * Run a complete health check cycle
   */
  private async runHealthCheck() {
    try {
      console.log("🔍 RPC Health Monitor: Starting health check...");

      // Get only ACTIVE chains
      const activeChains = await db
        .select()
        .from(chains)
        .where(eq(chains.isActive, true));

      if (activeChains.length === 0) {
        console.log("⚠️  No active chains found, skipping health check");
        return;
      }

      const chainIds = activeChains.map(c => c.chainId);

      // Get all RPCs for active chains
      const rpcsToCheck = await db
        .select()
        .from(chainRpcs)
        .where(eq(chainRpcs.isActive, true));

      // Filter RPCs to only those belonging to active chains
      const activeRpcs = rpcsToCheck.filter(rpc => chainIds.includes(rpc.chainId));

      console.log(`🔍 Checking ${activeRpcs.length} RPCs across ${activeChains.length} active chain(s)...`);

      let healthyCount = 0;
      let unhealthyCount = 0;

      // Check each RPC
      for (const rpc of activeRpcs) {
        const result = await this.checkSingleRpc(rpc);
        
        // Update database
        await db
          .update(chainRpcs)
          .set({
            lastLatencyMs: result.latencyMs,
            lastOkAt: result.isHealthy ? Date.now() : rpc.lastOkAt,
            isActive: result.isHealthy,
            updatedAt: new Date(),
          })
          .where(eq(chainRpcs.id, rpc.id));

        if (result.isHealthy) {
          healthyCount++;
          console.log(`✅ ${rpc.url}: ${result.latencyMs}ms`);
        } else {
          unhealthyCount++;
          console.log(`❌ ${rpc.url}: ${result.error}`);
        }
      }

      console.log(`✅ Health check complete: ${healthyCount} healthy, ${unhealthyCount} unhealthy`);
    } catch (error) {
      console.error("❌ Error in RPC health check:", error);
    }
  }

  /**
   * Check health of a single RPC endpoint
   */
  private async checkSingleRpc(rpc: any): Promise<{
    isHealthy: boolean;
    latencyMs: number | null;
    error: string | null;
  }> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.rpcTimeoutMs);

      const response = await fetch(rpc.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          const latencyMs = Date.now() - startTime;
          return { isHealthy: true, latencyMs, error: null };
        } else {
          return { isHealthy: false, latencyMs: null, error: "No result in response" };
        }
      } else {
        return { isHealthy: false, latencyMs: null, error: `HTTP ${response.status}` };
      }
    } catch (err: any) {
      const error = err.name === "AbortError" ? "Timeout" : err.message;
      return { isHealthy: false, latencyMs: null, error };
    }
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      nextCheckIn: this.isRunning ? `${Math.round(this.checkIntervalMs / 1000)}s` : "N/A",
    };
  }
}

// Export singleton instance
export const rpcHealthMonitor = new RpcHealthMonitor();
