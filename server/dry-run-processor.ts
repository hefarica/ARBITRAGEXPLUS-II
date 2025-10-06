import { db } from "./db";
import { dryRunSessions, dryRunTrades, opportunities, chains } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export class DryRunProcessor {
  private processingEnabled: boolean = true;

  constructor() {
    console.log("🔬 Dry-Run Processor initialized");
  }

  async processOpportunity(opportunity: {
    id: string;
    chainId: number;
    dexIn: string;
    dexOut: string;
    baseToken: string;
    quoteToken: string;
    amountIn: string;
    estProfitUsd: number;
    gasUsd: number;
    ts: number;
  }) {
    if (!this.processingEnabled) {
      return;
    }

    // STRICT VALIDATION: Reject opportunities with ANY missing, invalid, or non-finite real data
    // Use Number.isFinite to reject NaN, Infinity, and non-numeric values
    if (!opportunity.id || !opportunity.chainId || 
        !opportunity.dexIn || !opportunity.dexOut ||
        !opportunity.baseToken || !opportunity.quoteToken ||
        !opportunity.amountIn || 
        !Number.isFinite(opportunity.estProfitUsd) || 
        !Number.isFinite(opportunity.gasUsd) ||
        !opportunity.ts) {
      console.warn('⚠️  Skipping opportunity with incomplete or invalid real data:', {
        hasId: !!opportunity.id,
        hasChainId: !!opportunity.chainId,
        hasDexIn: !!opportunity.dexIn,
        hasDexOut: !!opportunity.dexOut,
        hasBaseToken: !!opportunity.baseToken,
        hasQuoteToken: !!opportunity.quoteToken,
        hasAmountIn: !!opportunity.amountIn,
        hasProfitUsd: Number.isFinite(opportunity.estProfitUsd),
        hasGasUsd: Number.isFinite(opportunity.gasUsd),
        profitValue: opportunity.estProfitUsd,
        gasValue: opportunity.gasUsd,
      });
      return; // Skip - do not process incomplete or invalid data
    }

    try {
      // Get all active dry-run sessions
      const activeSessions = await db
        .select()
        .from(dryRunSessions)
        .where(eq(dryRunSessions.status, "active"));

      if (activeSessions.length === 0) {
        return; // No active sessions to process
      }

      // Get real chain name from database - do NOT fabricate
      const [chainData] = await db
        .select()
        .from(chains)
        .where(eq(chains.chainId, opportunity.chainId))
        .limit(1);

      if (!chainData || !chainData.name) {
        console.warn(`⚠️  Skipping opportunity - no real chain data found for chainId ${opportunity.chainId}`);
        return; // Skip - do not invent chain name
      }

      const chainName = chainData.name;

      // Process opportunity for each active session
      for (const session of activeSessions) {
        await this.processForSession(session, opportunity, chainName);
      }
    } catch (error) {
      console.error("Error processing opportunity for dry-run:", error);
    }
  }

  private async processForSession(
    session: any,
    opportunity: any,
    chainName: string
  ) {
    try {
      // Parse session filters
      const sessionChains = JSON.parse(session.chains as string || "[]");
      const sessionDexes = JSON.parse(session.dexes as string || "[]");
      
      // Filter by chain if specified
      if (sessionChains.length > 0 && !sessionChains.includes(opportunity.chainId)) {
        return; // Skip - chain not in session filter
      }

      // Filter by DEX if specified
      if (sessionDexes.length > 0) {
        const matchesDex = sessionDexes.includes(opportunity.dexIn) || 
                          sessionDexes.includes(opportunity.dexOut);
        if (!matchesDex) {
          return; // Skip - DEX not in session filter
        }
      }

      const netProfitUsd = opportunity.estProfitUsd - opportunity.gasUsd;

      // Check if opportunity meets session criteria
      const minProfit = parseFloat(session.minProfitUsd || "0");
      const maxGas = parseFloat(session.maxGasUsd || "999999");

      if (netProfitUsd < minProfit) {
        // Update total opportunities counter but don't execute
        await db.update(dryRunSessions).set({
          totalOpportunities: session.totalOpportunities + 1,
          updatedAt: new Date(),
        }).where(eq(dryRunSessions.id, session.id));
        return; // Skip - profit too low
      }

      if (opportunity.gasUsd > maxGas) {
        // Update total opportunities counter but don't execute
        await db.update(dryRunSessions).set({
          totalOpportunities: session.totalOpportunities + 1,
          updatedAt: new Date(),
        }).where(eq(dryRunSessions.id, session.id));
        return; // Skip - gas too high
      }

      // Validate amountIn is a real finite number
      const amountIn = parseFloat(opportunity.amountIn);
      if (!Number.isFinite(amountIn) || amountIn <= 0) {
        console.warn(`⚠️  Skipping opportunity - invalid amountIn: ${opportunity.amountIn}`);
        // Update counter but don't execute
        await db.update(dryRunSessions).set({
          totalOpportunities: session.totalOpportunities + 1,
          updatedAt: new Date(),
        }).where(eq(dryRunSessions.id, session.id));
        return;
      }

      // Calculate trade size based on risk per trade
      const currentCapital = parseFloat(session.currentCapitalUsd);
      const riskPerTrade = parseFloat(session.riskPerTrade || "0.01");
      const maxTradeSize = currentCapital * riskPerTrade;

      // Determine execution status based on real profit/gas data
      const executionStatus = netProfitUsd > 0 ? "would_succeed" : "would_fail";

      // Calculate capital before/after
      const capitalAfter = currentCapital + netProfitUsd;

      // Record the simulated trade with ONLY real validated data
      // NO fabricated slippage, price impact, success probability, or chain names
      await db.insert(dryRunTrades).values({
        sessionId: session.id,
        opportunityId: opportunity.id,
        chainId: opportunity.chainId,
        chainName,
        dexIn: opportunity.dexIn,
        dexOut: opportunity.dexOut,
        baseToken: opportunity.baseToken,
        quoteToken: opportunity.quoteToken,
        amountInUsd: Math.min(amountIn, maxTradeSize).toString(),
        estimatedProfitUsd: opportunity.estProfitUsd.toString(),
        actualProfitUsd: netProfitUsd.toString(),
        gasEstimatedUsd: opportunity.gasUsd.toString(),
        slippagePercent: null, // Only set if scanner provides real data
        priceImpactPercent: null, // Only set if scanner provides real data
        executionStatus,
        successProbability: null, // Only set if scanner provides real data
        capitalBeforeUsd: session.currentCapitalUsd,
        capitalAfterUsd: capitalAfter.toString(),
        metadata: JSON.stringify({
          timestamp: new Date().toISOString(),
          note: "Metrics calculated from real scanner data only"
        }),
        detectedAt: opportunity.ts,
      });

      // Update session metrics
      const isSuccess = netProfitUsd > 0;
      const isFailure = netProfitUsd < 0;

      const newTotalOpportunities = session.totalOpportunities + 1;
      const newExecutedTrades = session.executedTrades + 1;
      const newSuccessfulTrades = session.successfulTrades + (isSuccess ? 1 : 0);
      const newFailedTrades = session.failedTrades + (isFailure ? 1 : 0);
      const newTotalProfit = parseFloat(session.totalProfitUsd) + (netProfitUsd > 0 ? netProfitUsd : 0);
      const newTotalLoss = parseFloat(session.totalLossUsd) + (netProfitUsd < 0 ? Math.abs(netProfitUsd) : 0);
      const newNetProfit = parseFloat(session.netProfitUsd) + netProfitUsd;
      const newAvgProfit = newNetProfit / newExecutedTrades;
      const newWinRate = (newSuccessfulTrades / newExecutedTrades) * 100;
      const newProfitFactor = newTotalLoss > 0 ? newTotalProfit / newTotalLoss : newTotalProfit;

      // Calculate max drawdown
      const currentDrawdown = Math.max(0, parseFloat(session.startCapitalUsd) - capitalAfter);
      const newMaxDrawdown = Math.max(parseFloat(session.maxDrawdown || "0"), currentDrawdown);

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
        maxDrawdown: newMaxDrawdown.toString(),
        updatedAt: new Date(),
      }).where(eq(dryRunSessions.id, session.id));

      console.log(`🔬 Dry-run trade for session "${session.name}": ${netProfitUsd > 0 ? '+' : ''}$${netProfitUsd.toFixed(2)} | Capital: $${capitalAfter.toFixed(2)} | Win Rate: ${newWinRate.toFixed(1)}%`);

    } catch (error) {
      console.error(`Error processing opportunity for session ${session.id}:`, error);
    }
  }

  enable() {
    this.processingEnabled = true;
    console.log("✅ Dry-run processor enabled");
  }

  disable() {
    this.processingEnabled = false;
    console.log("⏸️  Dry-run processor disabled");
  }

  isEnabled() {
    return this.processingEnabled;
  }
}

export const dryRunProcessor = new DryRunProcessor();
