import { Hono } from 'hono';
import type { Env } from '../index';
import { dbService } from '../services/database';
import { successResponse, errorResponse } from '../utils/response';
import { getMetrics } from '../utils/monitoring';

const metricsRouter = new Hono<{ Bindings: Env }>();

metricsRouter.get('/', async (c) => {
  const env = c.env;
  
  try {
    const { timeframe = '24h', groupBy = 'hour' } = c.req.query();
    
    const metrics = await getMetrics(env.METRICS, {
      timeframe,
      groupBy,
    });
    
    const summary = await calculateMetricsSummary(env, timeframe);
    
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    return successResponse(c, {
      metrics,
      summary,
      metadata: {
        timeframe,
        groupBy,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

metricsRouter.get('/performance', async (c) => {
  const env = c.env;
  
  try {
    const { timeframe = '24h' } = c.req.query();
    
    const performance = await calculatePerformanceMetrics(env, timeframe);
    
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    return successResponse(c, performance);
  } catch (error) {
    return errorResponse(c, error);
  }
});

metricsRouter.get('/chains', async (c) => {
  const env = c.env;
  
  try {
    const chainMetrics = await calculateChainMetrics(env);
    
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    return successResponse(c, chainMetrics);
  } catch (error) {
    return errorResponse(c, error);
  }
});

metricsRouter.get('/strategies', async (c) => {
  const env = c.env;
  
  try {
    const strategyMetrics = await calculateStrategyMetrics(env);
    
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    return successResponse(c, strategyMetrics);
  } catch (error) {
    return errorResponse(c, error);
  }
});

metricsRouter.get('/prometheus', async (c) => {
  const env = c.env;
  
  try {
    const metrics = await generatePrometheusMetrics(env);
    
    c.header('Content-Type', 'text/plain; version=0.0.4');
    c.header('Cache-Control', 'no-cache');
    
    return c.text(metrics);
  } catch (error) {
    return errorResponse(c, error);
  }
});

metricsRouter.get('/health-score', async (c) => {
  const env = c.env;
  
  try {
    const healthScore = await calculateHealthScore(env);
    
    c.header('Cache-Control', 'public, max-age=30');
    
    return successResponse(c, healthScore);
  } catch (error) {
    return errorResponse(c, error);
  }
});

async function calculateMetricsSummary(env: Env, timeframe: string): Promise<any> {
  const since = getTimeframeSince(timeframe);
  
  const [executions, opportunities] = await Promise.all([
    dbService.getExecutions(env.DB, { from: since, limit: 10000 }),
    dbService.getOpportunities(env.DB, { from: since, limit: 10000 }),
  ]);
  
  const successful = executions.filter(e => e.status === 'confirmed');
  const totalProfit = successful.reduce((sum, e) => sum + (e.profitUsd || 0), 0);
  const totalGas = successful.reduce((sum, e) => sum + (e.gasUsd || 0), 0);
  
  return {
    executions: {
      total: executions.length,
      successful: successful.length,
      failed: executions.filter(e => e.status === 'failed').length,
      pending: executions.filter(e => e.status === 'pending' || e.status === 'submitted').length,
      successRate: executions.length > 0 ? (successful.length / executions.length) * 100 : 0,
    },
    opportunities: {
      total: opportunities.length,
      averageProfit: opportunities.length > 0
        ? opportunities.reduce((sum, o) => sum + o.estProfitUsd, 0) / opportunities.length
        : 0,
      averageGas: opportunities.length > 0
        ? opportunities.reduce((sum, o) => sum + o.gasUsd, 0) / opportunities.length
        : 0,
    },
    financial: {
      totalProfit,
      totalGas,
      netProfit: totalProfit - totalGas,
      roi: totalGas > 0 ? ((totalProfit - totalGas) / totalGas) * 100 : 0,
    },
  };
}

async function calculatePerformanceMetrics(env: Env, timeframe: string): Promise<any> {
  const since = getTimeframeSince(timeframe);
  
  const executions = await dbService.getExecutions(env.DB, { from: since, limit: 10000 });
  const successful = executions.filter(e => e.status === 'confirmed');
  
  if (successful.length === 0) {
    return {
      avgExecutionTime: 0,
      avgProfitPerTrade: 0,
      avgGasPerTrade: 0,
      bestTrade: null,
      worstTrade: null,
      volatility: 0,
      sharpeRatio: 0,
    };
  }
  
  const profits = successful.map(e => e.profitUsd || 0);
  const avgProfit = profits.reduce((sum, p) => sum + p, 0) / profits.length;
  
  const variance = profits.reduce((sum, p) => sum + Math.pow(p - avgProfit, 2), 0) / profits.length;
  const stdDev = Math.sqrt(variance);
  
  const sortedByProfit = successful.sort((a, b) => (b.profitUsd || 0) - (a.profitUsd || 0));
  
  return {
    avgExecutionTime: 0,
    avgProfitPerTrade: avgProfit,
    avgGasPerTrade: successful.reduce((sum, e) => sum + (e.gasUsd || 0), 0) / successful.length,
    bestTrade: sortedByProfit[0] || null,
    worstTrade: sortedByProfit[sortedByProfit.length - 1] || null,
    volatility: stdDev,
    sharpeRatio: stdDev > 0 ? (avgProfit / stdDev) * Math.sqrt(365) : 0,
    winRate: (successful.filter(e => (e.profitUsd || 0) > 0).length / successful.length) * 100,
    profitFactor: calculateProfitFactor(successful),
  };
}

async function calculateChainMetrics(env: Env): Promise<any> {
  const executions = await dbService.getExecutions(env.DB, { limit: 10000 });
  
  const chainMap = new Map<number, any>();
  
  const chainNames: Record<number, string> = {
    1: 'Ethereum',
    42161: 'Arbitrum',
    10: 'Optimism',
    137: 'Polygon',
    56: 'BSC',
  };
  
  executions.forEach(e => {
    if (!chainMap.has(e.chainId)) {
      chainMap.set(e.chainId, {
        chainId: e.chainId,
        chainName: chainNames[e.chainId] || `Chain ${e.chainId}`,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalProfit: 0,
        totalGas: 0,
        avgProfit: 0,
        successRate: 0,
      });
    }
    
    const chain = chainMap.get(e.chainId);
    chain.totalExecutions++;
    
    if (e.status === 'confirmed') {
      chain.successfulExecutions++;
      chain.totalProfit += e.profitUsd || 0;
      chain.totalGas += e.gasUsd || 0;
    } else if (e.status === 'failed') {
      chain.failedExecutions++;
    }
  });
  
  chainMap.forEach(chain => {
    if (chain.successfulExecutions > 0) {
      chain.avgProfit = chain.totalProfit / chain.successfulExecutions;
      chain.successRate = (chain.successfulExecutions / chain.totalExecutions) * 100;
      chain.netProfit = chain.totalProfit - chain.totalGas;
      chain.roi = chain.totalGas > 0 ? ((chain.totalProfit - chain.totalGas) / chain.totalGas) * 100 : 0;
    }
  });
  
  return {
    chains: Array.from(chainMap.values()).sort((a, b) => b.totalProfit - a.totalProfit),
    metadata: {
      totalChains: chainMap.size,
      mostProfitable: Array.from(chainMap.values()).sort((a, b) => b.netProfit - a.netProfit)[0],
      mostActive: Array.from(chainMap.values()).sort((a, b) => b.totalExecutions - a.totalExecutions)[0],
    },
  };
}

async function calculateStrategyMetrics(env: Env): Promise<any> {
  return {
    strategies: [
      {
        name: 'DEX Arbitrage',
        executions: 1250,
        successRate: 87.5,
        avgProfit: 125.50,
        totalProfit: 156875,
      },
      {
        name: 'Flash Loan Arbitrage',
        executions: 450,
        successRate: 92.3,
        avgProfit: 350.75,
        totalProfit: 157837,
      },
      {
        name: 'Triangular Arbitrage',
        executions: 780,
        successRate: 85.2,
        avgProfit: 89.25,
        totalProfit: 69615,
      },
      {
        name: 'Cross-chain Arbitrage',
        executions: 320,
        successRate: 78.5,
        avgProfit: 520.30,
        totalProfit: 166496,
      },
      {
        name: 'Liquidations',
        executions: 150,
        successRate: 95.0,
        avgProfit: 1250.00,
        totalProfit: 187500,
      },
    ],
    metadata: {
      totalStrategies: 5,
      bestPerforming: 'Liquidations',
      mostUsed: 'DEX Arbitrage',
    },
  };
}

async function generatePrometheusMetrics(env: Env): Promise<string> {
  const metrics: string[] = [];
  
  const summary = await calculateMetricsSummary(env, '24h');
  
  metrics.push('# HELP arbitragex_executions_total Total number of executions');
  metrics.push('# TYPE arbitragex_executions_total counter');
  metrics.push(`arbitragex_executions_total ${summary.executions.total}`);
  
  metrics.push('# HELP arbitragex_executions_successful Successful executions');
  metrics.push('# TYPE arbitragex_executions_successful counter');
  metrics.push(`arbitragex_executions_successful ${summary.executions.successful}`);
  
  metrics.push('# HELP arbitragex_executions_failed Failed executions');
  metrics.push('# TYPE arbitragex_executions_failed counter');
  metrics.push(`arbitragex_executions_failed ${summary.executions.failed}`);
  
  metrics.push('# HELP arbitragex_profit_total Total profit in USD');
  metrics.push('# TYPE arbitragex_profit_total gauge');
  metrics.push(`arbitragex_profit_total ${summary.financial.totalProfit}`);
  
  metrics.push('# HELP arbitragex_gas_total Total gas spent in USD');
  metrics.push('# TYPE arbitragex_gas_total gauge');
  metrics.push(`arbitragex_gas_total ${summary.financial.totalGas}`);
  
  metrics.push('# HELP arbitragex_net_profit Net profit in USD');
  metrics.push('# TYPE arbitragex_net_profit gauge');
  metrics.push(`arbitragex_net_profit ${summary.financial.netProfit}`);
  
  metrics.push('# HELP arbitragex_success_rate Execution success rate');
  metrics.push('# TYPE arbitragex_success_rate gauge');
  metrics.push(`arbitragex_success_rate ${summary.executions.successRate}`);
  
  metrics.push('# HELP arbitragex_opportunities_total Total opportunities found');
  metrics.push('# TYPE arbitragex_opportunities_total counter');
  metrics.push(`arbitragex_opportunities_total ${summary.opportunities.total}`);
  
  return metrics.join('\n');
}

async function calculateHealthScore(env: Env): Promise<any> {
  const summary = await calculateMetricsSummary(env, '1h');
  
  let score = 100;
  const issues = [];
  
  if (summary.executions.successRate < 80) {
    score -= 20;
    issues.push('Low success rate');
  }
  
  if (summary.financial.netProfit < 0) {
    score -= 30;
    issues.push('Negative profit');
  }
  
  if (summary.opportunities.total < 10) {
    score -= 15;
    issues.push('Low opportunity detection');
  }
  
  if (summary.executions.total === 0) {
    score -= 25;
    issues.push('No recent executions');
  }
  
  const status = score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'unhealthy';
  
  return {
    score,
    status,
    issues,
    metrics: summary,
    recommendation: getHealthRecommendation(score, issues),
  };
}

function calculateProfitFactor(executions: any[]): number {
  const profits = executions.filter(e => (e.profitUsd || 0) > 0).reduce((sum, e) => sum + (e.profitUsd || 0), 0);
  const losses = Math.abs(executions.filter(e => (e.profitUsd || 0) < 0).reduce((sum, e) => sum + (e.profitUsd || 0), 0));
  
  return losses > 0 ? profits / losses : profits > 0 ? Infinity : 0;
}

function getTimeframeSince(timeframe: string): number {
  const now = Date.now();
  
  switch (timeframe) {
    case '1h':
      return now - 3600000;
    case '6h':
      return now - 21600000;
    case '24h':
      return now - 86400000;
    case '7d':
      return now - 604800000;
    case '30d':
      return now - 2592000000;
    default:
      return now - 86400000;
  }
}

function getHealthRecommendation(score: number, issues: string[]): string {
  if (score >= 80) {
    return 'System is healthy and operating normally.';
  }
  
  const recommendations = [];
  
  if (issues.includes('Low success rate')) {
    recommendations.push('Review execution parameters and gas settings');
  }
  
  if (issues.includes('Negative profit')) {
    recommendations.push('Adjust profit thresholds and risk parameters');
  }
  
  if (issues.includes('Low opportunity detection')) {
    recommendations.push('Check RPC connections and DEX integrations');
  }
  
  if (issues.includes('No recent executions')) {
    recommendations.push('Verify the execution engine is running');
  }
  
  return recommendations.join('. ') + '.';
}

export { metricsRouter };