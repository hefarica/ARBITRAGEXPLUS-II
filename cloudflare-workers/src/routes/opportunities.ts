import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../index';
import { rustApiService } from '../services/rustApi';
import { kvService } from '../services/kv';
import { dbService } from '../services/database';
import { validateRequest } from '../utils/validation';
import { successResponse, errorResponse } from '../utils/response';
import { recordMetric } from '../utils/monitoring';

const opportunitiesRouter = new Hono<{ Bindings: Env }>();

const OpportunityQuerySchema = z.object({
  chainId: z.string().optional(),
  minProfit: z.string().optional(),
  maxGas: z.string().optional(),
  dex: z.string().optional(),
  token: z.string().optional(),
  limit: z.string().default('100'),
  offset: z.string().default('0'),
  sortBy: z.enum(['profit', 'gas', 'timestamp', 'score']).default('profit'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

opportunitiesRouter.get('/', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  
  try {
    const query = validateRequest(OpportunityQuerySchema, c.req.query());
    
    const cacheKey = `opportunities:${JSON.stringify(query)}`;
    const cached = await kvService.get(env.CACHE_KV, cacheKey);
    
    if (cached) {
      c.header('X-Cache-Status', 'HIT');
      c.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
      
      await recordMetric(env.METRICS, {
        type: 'api_request',
        endpoint: '/api/opportunities',
        status: 'cache_hit',
        duration: Date.now() - startTime,
      });
      
      return successResponse(c, cached);
    }
    
    c.header('X-Cache-Status', 'MISS');
    
    const [dbData, rustData] = await Promise.all([
      dbService.getOpportunities(env.DB, {
        chainId: query.chainId ? parseInt(query.chainId) : undefined,
        limit: parseInt(query.limit),
        offset: parseInt(query.offset),
      }),
      rustApiService.fetchOpportunities(env.RUST_ENGINE_URL, query),
    ]);
    
    const merged = mergeOpportunities(dbData, rustData);
    
    const filtered = applyFilters(merged, {
      minProfit: query.minProfit ? parseFloat(query.minProfit) : undefined,
      maxGas: query.maxGas ? parseFloat(query.maxGas) : undefined,
      dex: query.dex,
      token: query.token,
    });
    
    const scored = await scoreOpportunities(filtered, env);
    
    const sorted = sortOpportunities(scored, query.sortBy, query.order);
    
    const paginated = sorted.slice(
      parseInt(query.offset),
      parseInt(query.offset) + parseInt(query.limit)
    );
    
    const response = {
      opportunities: paginated,
      metadata: {
        total: sorted.length,
        limit: parseInt(query.limit),
        offset: parseInt(query.offset),
        cached: false,
        timestamp: Date.now(),
      },
    };
    
    await kvService.set(
      env.CACHE_KV,
      cacheKey,
      response,
      parseInt(env.CACHE_TTL_OPPORTUNITIES || '5')
    );
    
    c.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
    
    await recordMetric(env.METRICS, {
      type: 'api_request',
      endpoint: '/api/opportunities',
      status: 'success',
      duration: Date.now() - startTime,
      count: paginated.length,
    });
    
    return successResponse(c, response);
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: '/api/opportunities',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

opportunitiesRouter.get('/stream', async (c) => {
  const env = c.env;
  
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  const sendSSE = (data: any) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(message));
  };
  
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  
  const interval = setInterval(async () => {
    try {
      const opportunities = await rustApiService.fetchOpportunities(
        env.RUST_ENGINE_URL,
        { limit: '10' }
      );
      
      sendSSE({
        type: 'opportunities',
        data: opportunities,
        timestamp: Date.now(),
      });
    } catch (error) {
      sendSSE({
        type: 'error',
        message: 'Failed to fetch opportunities',
        timestamp: Date.now(),
      });
    }
  }, 5000);
  
  c.req.raw.signal.addEventListener('abort', () => {
    clearInterval(interval);
    writer.close();
  });
  
  return new Response(readable, {
    headers: c.header(),
  });
});

opportunitiesRouter.post('/subscribe', async (c) => {
  const env = c.env;
  
  try {
    const body = await c.req.json();
    const { filters, webhookUrl } = body;
    
    const subscriptionId = crypto.randomUUID();
    
    await env.CONFIG_KV.put(
      `subscription:${subscriptionId}`,
      JSON.stringify({
        filters,
        webhookUrl,
        createdAt: Date.now(),
        active: true,
      }),
      { expirationTtl: 86400 }
    );
    
    return successResponse(c, {
      subscriptionId,
      message: 'Subscription created successfully',
      expiresIn: 86400,
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

function mergeOpportunities(dbData: any[], rustData: any[]): any[] {
  const merged = new Map();
  
  for (const opp of dbData) {
    merged.set(opp.id, opp);
  }
  
  for (const opp of rustData) {
    if (!merged.has(opp.id)) {
      merged.set(opp.id, opp);
    } else {
      const existing = merged.get(opp.id);
      merged.set(opp.id, {
        ...existing,
        ...opp,
        updatedAt: Date.now(),
      });
    }
  }
  
  return Array.from(merged.values());
}

function applyFilters(opportunities: any[], filters: any): any[] {
  return opportunities.filter(opp => {
    if (filters.minProfit && opp.estProfitUsd < filters.minProfit) return false;
    if (filters.maxGas && opp.gasUsd > filters.maxGas) return false;
    if (filters.dex && !opp.dexIn.includes(filters.dex) && !opp.dexOut.includes(filters.dex)) return false;
    if (filters.token && !opp.baseToken.includes(filters.token) && !opp.quoteToken.includes(filters.token)) return false;
    return true;
  });
}

async function scoreOpportunities(opportunities: any[], env: Env): Promise<any[]> {
  const assetScores = new Map();
  
  const uniqueTokens = new Set<string>();
  opportunities.forEach(opp => {
    uniqueTokens.add(opp.baseToken);
    uniqueTokens.add(opp.quoteToken);
  });
  
  const tokenAddresses = Array.from(uniqueTokens);
  const safetyData = await dbService.getAssetSafety(env.DB, tokenAddresses);
  
  safetyData.forEach(asset => {
    assetScores.set(asset.address, asset.score);
  });
  
  return opportunities.map(opp => {
    const baseScore = assetScores.get(opp.baseToken) || 50;
    const quoteScore = assetScores.get(opp.quoteToken) || 50;
    const avgSafetyScore = (baseScore + quoteScore) / 2;
    
    const profitScore = Math.min(100, (opp.estProfitUsd / 100) * 100);
    const gasScore = Math.max(0, 100 - (opp.gasUsd / 50) * 100);
    const freshness = Math.max(0, 100 - ((Date.now() - opp.ts) / 60000) * 10);
    
    const totalScore = (
      profitScore * 0.35 +
      gasScore * 0.25 +
      avgSafetyScore * 0.25 +
      freshness * 0.15
    );
    
    return {
      ...opp,
      score: Math.round(totalScore),
      safetyScore: Math.round(avgSafetyScore),
      profitScore: Math.round(profitScore),
      gasScore: Math.round(gasScore),
      freshnessScore: Math.round(freshness),
    };
  });
}

function sortOpportunities(opportunities: any[], sortBy: string, order: string): any[] {
  return opportunities.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'profit':
        comparison = a.estProfitUsd - b.estProfitUsd;
        break;
      case 'gas':
        comparison = a.gasUsd - b.gasUsd;
        break;
      case 'timestamp':
        comparison = a.ts - b.ts;
        break;
      case 'score':
        comparison = (a.score || 0) - (b.score || 0);
        break;
    }
    
    return order === 'desc' ? -comparison : comparison;
  });
}

export { opportunitiesRouter };