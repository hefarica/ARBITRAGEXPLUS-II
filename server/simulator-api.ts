import express from "express";
import { db } from "./db";
import { dryRunSessions, dryRunTrades, opportunities } from "@shared/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { logMonitor } from "./log-monitor";

export const simulatorApiRouter = express.Router();

// GET /simulator/sessions - List all dry-run sessions
simulatorApiRouter.get("/sessions", async (req, res) => {
  try {
    const sessions = await db
      .select()
      .from(dryRunSessions)
      .orderBy(desc(dryRunSessions.createdAt));
    
    res.json({ success: true, sessions });
  } catch (error: any) {
    console.error("Error fetching dry-run sessions:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch sessions" });
  }
});

// POST /simulator/sessions - Create new dry-run session
simulatorApiRouter.post("/sessions", async (req, res) => {
  try {
    const {
      name,
      startCapitalUsd = 10000,
      chains = [],
      dexes = [],
      minProfitUsd = 5,
      maxGasUsd = 10,
      riskPerTrade = 0.01
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Session name is required" });
    }

    // VALIDATE: All numeric values must be finite (reject NaN, Infinity)
    if (!Number.isFinite(startCapitalUsd) || startCapitalUsd <= 0) {
      return res.status(400).json({ 
        error: "Invalid startCapitalUsd: must be a positive finite number",
        value: startCapitalUsd 
      });
    }

    if (!Number.isFinite(minProfitUsd) || minProfitUsd < 0) {
      return res.status(400).json({ 
        error: "Invalid minProfitUsd: must be a non-negative finite number",
        value: minProfitUsd 
      });
    }

    if (!Number.isFinite(maxGasUsd) || maxGasUsd < 0) {
      return res.status(400).json({ 
        error: "Invalid maxGasUsd: must be a non-negative finite number",
        value: maxGasUsd 
      });
    }

    if (!Number.isFinite(riskPerTrade) || riskPerTrade <= 0 || riskPerTrade > 1) {
      return res.status(400).json({ 
        error: "Invalid riskPerTrade: must be a finite number between 0 and 1",
        value: riskPerTrade 
      });
    }

    const [session] = await db.insert(dryRunSessions).values({
      name,
      startCapitalUsd: startCapitalUsd.toString(),
      currentCapitalUsd: startCapitalUsd.toString(),
      chains: JSON.stringify(chains),
      dexes: JSON.stringify(dexes),
      minProfitUsd: minProfitUsd.toString(),
      maxGasUsd: maxGasUsd.toString(),
      riskPerTrade: riskPerTrade.toString(),
      status: "active",
    }).returning();

    console.log(`✅ Created dry-run session: ${name} with $${startCapitalUsd} capital`);

    res.json({
      success: true,
      session,
      message: `Session "${name}" created successfully`
    });
  } catch (error: any) {
    console.error("Error creating dry-run session:", error);
    res.status(500).json({ error: error?.message || "Failed to create session" });
  }
});

// GET /simulator/sessions/:id - Get session details with metrics
simulatorApiRouter.get("/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [session] = await db
      .select()
      .from(dryRunSessions)
      .where(eq(dryRunSessions.id, Number(id)));

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Get recent trades for this session
    const recentTrades = await db
      .select()
      .from(dryRunTrades)
      .where(eq(dryRunTrades.sessionId, Number(id)))
      .orderBy(desc(dryRunTrades.executedAt))
      .limit(50);

    res.json({
      success: true,
      session,
      recentTrades,
      metrics: {
        winRate: session.winRate || 0,
        profitFactor: session.profitFactor || 0,
        avgProfitPerTrade: session.avgProfitPerTrade || "0",
        netProfitUsd: session.netProfitUsd || "0",
        maxDrawdown: session.maxDrawdown || "0",
        totalTrades: session.executedTrades || 0,
      }
    });
  } catch (error: any) {
    console.error("Error fetching session details:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch session" });
  }
});

// PATCH /simulator/sessions/:id - Update session status (pause/resume/stop)
simulatorApiRouter.patch("/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "paused", "stopped"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: active, paused, or stopped" });
    }

    const updates: any = { status, updatedAt: new Date() };

    if (status === "stopped") {
      updates.stoppedAt = new Date();
    }

    await db
      .update(dryRunSessions)
      .set(updates)
      .where(eq(dryRunSessions.id, Number(id)));

    console.log(`✅ Session ${id} status changed to: ${status}`);

    res.json({
      success: true,
      message: `Session ${status} successfully`
    });
  } catch (error: any) {
    console.error("Error updating session:", error);
    res.status(500).json({ error: error?.message || "Failed to update session" });
  }
});

// GET /simulator/sessions/:id/trades - Get all trades for a session
simulatorApiRouter.get("/sessions/:id/trades", async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const trades = await db
      .select()
      .from(dryRunTrades)
      .where(eq(dryRunTrades.sessionId, Number(id)))
      .orderBy(desc(dryRunTrades.executedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({ success: true, trades, count: trades.length });
  } catch (error: any) {
    console.error("Error fetching session trades:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch trades" });
  }
});

// POST /simulator/sessions/:id/record-trade - Record a simulated trade
simulatorApiRouter.post("/sessions/:id/record-trade", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      opportunityId,
      chainId,
      chainName,
      dexIn,
      dexOut,
      baseToken,
      quoteToken,
      amountInUsd,
      estimatedProfitUsd,
      gasEstimatedUsd,
      slippagePercent,
      priceImpactPercent,
      executionStatus = "simulated",
      failureReason,
      successProbability,
      detectedAt,
    } = req.body;

    // Get current session
    const [session] = await db
      .select()
      .from(dryRunSessions)
      .where(eq(dryRunSessions.id, Number(id)));

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== "active") {
      return res.status(400).json({ error: "Session is not active" });
    }

    // Calculate capital before/after
    const currentCapital = parseFloat(session.currentCapitalUsd);
    const netProfit = parseFloat(estimatedProfitUsd) - parseFloat(gasEstimatedUsd);
    const capitalAfter = currentCapital + netProfit;

    // Record trade
    const [trade] = await db.insert(dryRunTrades).values({
      sessionId: Number(id),
      opportunityId,
      chainId,
      chainName,
      dexIn,
      dexOut,
      baseToken,
      quoteToken,
      amountInUsd: amountInUsd.toString(),
      estimatedProfitUsd: estimatedProfitUsd.toString(),
      actualProfitUsd: netProfit.toString(),
      gasEstimatedUsd: gasEstimatedUsd.toString(),
      slippagePercent,
      priceImpactPercent,
      executionStatus,
      failureReason,
      successProbability,
      capitalBeforeUsd: session.currentCapitalUsd,
      capitalAfterUsd: capitalAfter.toString(),
      detectedAt,
    }).returning();

    // Update session metrics
    const isSuccess = netProfit > 0;
    const isFailure = netProfit < 0;

    const newTotalOpportunities = session.totalOpportunities + 1;
    const newExecutedTrades = session.executedTrades + 1;
    const newSuccessfulTrades = session.successfulTrades + (isSuccess ? 1 : 0);
    const newFailedTrades = session.failedTrades + (isFailure ? 1 : 0);
    const newTotalProfit = parseFloat(session.totalProfitUsd) + (netProfit > 0 ? netProfit : 0);
    const newTotalLoss = parseFloat(session.totalLossUsd) + (netProfit < 0 ? Math.abs(netProfit) : 0);
    const newNetProfit = parseFloat(session.netProfitUsd) + netProfit;
    const newAvgProfit = newNetProfit / newExecutedTrades;
    const newWinRate = (newSuccessfulTrades / newExecutedTrades) * 100;
    const newProfitFactor = newTotalLoss > 0 ? newTotalProfit / newTotalLoss : newTotalProfit;

    await db.update(dryRunSessions).set({
      currentCapitalUsd: capitalAfter.toString(),
      totalOpportunities: newTotalOpportunities,
      executedTrades: newExecutedTrades,
      successfulTrades: newSuccessfulTrades,
      failedTrades: newFailedTrades,
      totalProfitUsd: newTotalProfit.toString(),
      totalLossUsd: newTotalLoss.toString(),
      netProfitUsd: newNetProfit.toString(),
      avgProfitPerTrade: newAvgProfit.toString(),
      winRate: newWinRate,
      profitFactor: newProfitFactor,
      updatedAt: new Date(),
    }).where(eq(dryRunSessions.id, Number(id)));

    console.log(`📊 Recorded trade for session ${id}: ${netProfit > 0 ? '+' : ''}$${netProfit.toFixed(2)}`);

    res.json({
      success: true,
      trade,
      metrics: {
        capitalBefore: currentCapital,
        capitalAfter,
        netProfit,
        winRate: newWinRate,
        profitFactor: newProfitFactor,
      }
    });
  } catch (error: any) {
    console.error("Error recording trade:", error);
    res.status(500).json({ error: error?.message || "Failed to record trade" });
  }
});

// GET /simulator/stats - Get aggregated statistics across all sessions
simulatorApiRouter.get("/stats", async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Number(days));

    // Get recent sessions
    const recentSessions = await db
      .select()
      .from(dryRunSessions)
      .where(gte(dryRunSessions.createdAt, cutoffDate))
      .orderBy(desc(dryRunSessions.createdAt));

    // Calculate aggregate stats
    const totalSessions = recentSessions.length;
    const activeSessions = recentSessions.filter((s) => s.status === "active").length;
    const totalTrades = recentSessions.reduce((sum: number, s) => sum + s.executedTrades, 0);
    const totalProfit = recentSessions.reduce((sum: number, s) => sum + parseFloat(s.netProfitUsd || "0"), 0);
    const avgWinRate = recentSessions.length > 0
      ? recentSessions.reduce((sum: number, s) => sum + (s.winRate || 0), 0) / recentSessions.length
      : 0;

    // Get best performing session
    const bestSession = recentSessions.length > 0
      ? recentSessions.reduce((best, s) => 
          parseFloat(s.netProfitUsd || "0") > parseFloat(best.netProfitUsd || "0") ? s : best
        )
      : null;

    res.json({
      success: true,
      stats: {
        totalSessions,
        activeSessions,
        totalTrades,
        totalProfitUsd: totalProfit.toFixed(2),
        avgWinRate: avgWinRate.toFixed(2),
        bestSession: bestSession ? {
          id: bestSession.id,
          name: bestSession.name,
          netProfitUsd: bestSession.netProfitUsd,
          winRate: bestSession.winRate,
        } : null,
      },
      recentSessions: recentSessions.slice(0, 10),
    });
  } catch (error: any) {
    console.error("Error fetching simulator stats:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch stats" });
  }
});

// DELETE /simulator/sessions/:id - Delete a session and all its trades
simulatorApiRouter.delete("/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db
      .delete(dryRunSessions)
      .where(eq(dryRunSessions.id, Number(id)));

    console.log(`✅ Deleted dry-run session ${id} and all its trades`);

    res.json({
      success: true,
      message: `Session ${id} deleted successfully`
    });
  } catch (error: any) {
    console.error("Error deleting session:", error);
    res.status(500).json({ error: error?.message || "Failed to delete session" });
  }
});

// GET /simulator/monitor/stats - Get log monitoring statistics
simulatorApiRouter.get("/monitor/stats", async (req, res) => {
  try {
    const stats = logMonitor.getStats();
    const recentMinutes = parseInt(req.query.minutes as string) || 5;
    const recentSkips = logMonitor.getRecentSkips(recentMinutes);

    res.json({
      success: true,
      monitor: {
        totalSkips: stats.totalSkips,
        skipsByType: stats.skipsByType,
        recentSkips: {
          count: recentSkips.length,
          timeWindow: `${recentMinutes} minutes`,
          details: recentSkips.slice(0, 20), // Last 20 skips
        },
        lastAlert: stats.lastAlert,
      }
    });
  } catch (error: any) {
    console.error("Error fetching monitor stats:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch monitor stats" });
  }
});

// POST /simulator/monitor/reset - Reset monitoring statistics
simulatorApiRouter.post("/monitor/reset", async (req, res) => {
  try {
    logMonitor.reset();
    console.log("✅ Log monitor statistics reset");

    res.json({
      success: true,
      message: "Monitor statistics reset successfully"
    });
  } catch (error: any) {
    console.error("Error resetting monitor:", error);
    res.status(500).json({ error: error?.message || "Failed to reset monitor" });
  }
});
