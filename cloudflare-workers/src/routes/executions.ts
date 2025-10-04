import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../index';
import { rustApiService } from '../services/rustApi';
import { dbService } from '../services/database';
import { websocketService } from '../services/websocket';
import { validateRequest } from '../utils/validation';
import { successResponse, errorResponse } from '../utils/response';
import { recordMetric } from '../utils/monitoring';

const executionsRouter = new Hono<{ Bindings: Env }>();

const ExecutionQuerySchema = z.object({
  chainId: z.string().optional(),
  status: z.enum(['pending', 'submitted', 'confirmed', 'failed', 'expired']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.string().default('200'),
  offset: z.string().default('0'),
  sortBy: z.enum(['createdAt', 'profitUsd', 'gasUsd', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const ExecutionCreateSchema = z.object({
  opportunityId: z.string(),
  chainId: z.number(),
  estimatedProfit: z.number(),
  estimatedGas: z.number(),
  strategy: z.string(),
  params: z.record(z.any()),
});

const ExecutionUpdateSchema = z.object({
  status: z.enum(['submitted', 'confirmed', 'failed', 'expired']),
  txHash: z.string().optional(),
  actualProfit: z.number().optional(),
  actualGas: z.number().optional(),
  error: z.string().optional(),
});

executionsRouter.get('/', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  
  try {
    const query = validateRequest(ExecutionQuerySchema, c.req.query());
    
    const filters: any = {};
    
    if (query.chainId) {
      filters.chainId = parseInt(query.chainId);
    }
    
    if (query.status) {
      filters.status = query.status;
    }
    
    if (query.from) {
      filters.from = new Date(query.from).getTime();
    }
    
    if (query.to) {
      filters.to = new Date(query.to).getTime();
    }
    
    const executions = await dbService.getExecutions(env.DB, {
      ...filters,
      limit: parseInt(query.limit),
      offset: parseInt(query.offset),
      sortBy: query.sortBy,
      order: query.order,
    });
    
    const stats = await calculateExecutionStats(executions);
    
    c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    
    await recordMetric(env.METRICS, {
      type: 'api_request',
      endpoint: '/api/executions',
      status: 'success',
      duration: Date.now() - startTime,
      count: executions.length,
    });
    
    return successResponse(c, {
      executions,
      stats,
      metadata: {
        total: stats.totalExecutions,
        limit: parseInt(query.limit),
        offset: parseInt(query.offset),
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: '/api/executions',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

executionsRouter.get('/:id', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  const id = c.req.param('id');
  
  try {
    const execution = await dbService.getExecution(env.DB, id);
    
    if (!execution) {
      return errorResponse(c, new Error('Execution not found'), 404);
    }
    
    const details = await rustApiService.getExecutionDetails(env.RUST_ENGINE_URL, id);
    
    const combined = {
      ...execution,
      ...details,
      events: details.events || [],
      gasBreakdown: details.gasBreakdown || {},
      profitBreakdown: details.profitBreakdown || {},
    };
    
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    await recordMetric(env.METRICS, {
      type: 'api_request',
      endpoint: '/api/executions/:id',
      status: 'success',
      duration: Date.now() - startTime,
    });
    
    return successResponse(c, combined);
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: '/api/executions/:id',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

executionsRouter.post('/', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  
  try {
    const body = await validateRequest(ExecutionCreateSchema, await c.req.json());
    
    const executionId = crypto.randomUUID();
    
    const execution = {
      id: executionId,
      status: 'pending' as const,
      chainId: body.chainId,
      opportunityId: body.opportunityId,
      strategy: body.strategy,
      estimatedProfitUsd: body.estimatedProfit,
      estimatedGasUsd: body.estimatedGas,
      params: body.params,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await dbService.createExecution(env.DB, execution);
    
    const submitResult = await rustApiService.submitExecution(env.RUST_ENGINE_URL, {
      id: executionId,
      ...body,
    });
    
    if (submitResult.success) {
      await dbService.updateExecution(env.DB, executionId, {
        status: 'submitted',
        txHash: submitResult.txHash,
        updatedAt: Date.now(),
      });
      
      await websocketService.broadcastExecution(env, {
        type: 'execution_submitted',
        data: {
          id: executionId,
          txHash: submitResult.txHash,
          chainId: body.chainId,
        },
      });
    } else {
      await dbService.updateExecution(env.DB, executionId, {
        status: 'failed',
        error: submitResult.error,
        updatedAt: Date.now(),
      });
    }
    
    await recordMetric(env.METRICS, {
      type: 'execution_created',
      chainId: body.chainId,
      strategy: body.strategy,
      estimatedProfit: body.estimatedProfit,
      success: submitResult.success,
      duration: Date.now() - startTime,
    });
    
    return successResponse(c, {
      executionId,
      status: submitResult.success ? 'submitted' : 'failed',
      txHash: submitResult.txHash,
      error: submitResult.error,
      message: submitResult.success ? 'Execution submitted successfully' : 'Execution failed',
    }, 201);
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: 'POST /api/executions',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

executionsRouter.put('/:id', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  const id = c.req.param('id');
  
  try {
    const body = await validateRequest(ExecutionUpdateSchema, await c.req.json());
    
    const existing = await dbService.getExecution(env.DB, id);
    
    if (!existing) {
      return errorResponse(c, new Error('Execution not found'), 404);
    }
    
    const updates = {
      status: body.status,
      txHash: body.txHash,
      profitUsd: body.actualProfit,
      gasUsd: body.actualGas,
      error: body.error,
      updatedAt: Date.now(),
    };
    
    await dbService.updateExecution(env.DB, id, updates);
    
    if (body.status === 'confirmed') {
      await websocketService.broadcastExecution(env, {
        type: 'execution_confirmed',
        data: {
          id,
          txHash: body.txHash,
          profitUsd: body.actualProfit,
          gasUsd: body.actualGas,
        },
      });
    }
    
    await recordMetric(env.METRICS, {
      type: 'execution_updated',
      executionId: id,
      status: body.status,
      duration: Date.now() - startTime,
    });
    
    return successResponse(c, {
      message: 'Execution updated successfully',
      execution: {
        id,
        ...updates,
      },
    });
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: 'PUT /api/executions/:id',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

executionsRouter.get('/stats/summary', async (c) => {
  const env = c.env;
  
  try {
    const { timeframe = '24h' } = c.req.query();
    
    const since = getTimeframeSince(timeframe);
    
    const executions = await dbService.getExecutions(env.DB, {
      from: since,
      limit: 10000,
    });
    
    const stats = {
      total: executions.length,
      successful: executions.filter(e => e.status === 'confirmed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      pending: executions.filter(e => e.status === 'pending' || e.status === 'submitted').length,
      totalProfitUsd: executions
        .filter(e => e.status === 'confirmed' && e.profitUsd)
        .reduce((sum, e) => sum + (e.profitUsd || 0), 0),
      totalGasUsd: executions
        .filter(e => e.status === 'confirmed' && e.gasUsd)
        .reduce((sum, e) => sum + (e.gasUsd || 0), 0),
      averageProfitUsd: 0,
      successRate: 0,
      chainBreakdown: {} as Record<number, any>,
      strategyBreakdown: {} as Record<string, any>,
      hourlyTrend: [] as any[],
    };
    
    if (stats.successful > 0) {
      stats.averageProfitUsd = stats.totalProfitUsd / stats.successful;
      stats.successRate = (stats.successful / stats.total) * 100;
    }
    
    executions.forEach(e => {
      if (!stats.chainBreakdown[e.chainId]) {
        stats.chainBreakdown[e.chainId] = {
          total: 0,
          successful: 0,
          failed: 0,
          profitUsd: 0,
        };
      }
      
      stats.chainBreakdown[e.chainId].total++;
      
      if (e.status === 'confirmed') {
        stats.chainBreakdown[e.chainId].successful++;
        stats.chainBreakdown[e.chainId].profitUsd += e.profitUsd || 0;
      } else if (e.status === 'failed') {
        stats.chainBreakdown[e.chainId].failed++;
      }
    });
    
    const hourlyData = new Map<number, any>();
    const now = Date.now();
    
    for (let i = 0; i < 24; i++) {
      const hourStart = now - ((23 - i) * 3600000);
      hourlyData.set(Math.floor(hourStart / 3600000), {
        hour: new Date(hourStart).toISOString(),
        executions: 0,
        profit: 0,
      });
    }
    
    executions.forEach(e => {
      const hour = Math.floor(e.createdAt / 3600000);
      if (hourlyData.has(hour)) {
        const data = hourlyData.get(hour);
        data.executions++;
        if (e.status === 'confirmed' && e.profitUsd) {
          data.profit += e.profitUsd;
        }
      }
    });
    
    stats.hourlyTrend = Array.from(hourlyData.values());
    
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    return successResponse(c, stats);
  } catch (error) {
    return errorResponse(c, error);
  }
});

function calculateExecutionStats(executions: any[]): any {
  const stats = {
    totalExecutions: executions.length,
    successfulExecutions: 0,
    failedExecutions: 0,
    pendingExecutions: 0,
    totalProfitUsd: 0,
    totalGasUsd: 0,
    netProfitUsd: 0,
    averageProfitUsd: 0,
    maxProfitUsd: 0,
    minProfitUsd: Number.MAX_VALUE,
  };
  
  executions.forEach(e => {
    if (e.status === 'confirmed') {
      stats.successfulExecutions++;
      if (e.profitUsd) {
        stats.totalProfitUsd += e.profitUsd;
        stats.maxProfitUsd = Math.max(stats.maxProfitUsd, e.profitUsd);
        stats.minProfitUsd = Math.min(stats.minProfitUsd, e.profitUsd);
      }
      if (e.gasUsd) {
        stats.totalGasUsd += e.gasUsd;
      }
    } else if (e.status === 'failed' || e.status === 'expired') {
      stats.failedExecutions++;
    } else {
      stats.pendingExecutions++;
    }
  });
  
  if (stats.successfulExecutions > 0) {
    stats.averageProfitUsd = stats.totalProfitUsd / stats.successfulExecutions;
    stats.netProfitUsd = stats.totalProfitUsd - stats.totalGasUsd;
  }
  
  if (stats.minProfitUsd === Number.MAX_VALUE) {
    stats.minProfitUsd = 0;
  }
  
  return stats;
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

export { executionsRouter };