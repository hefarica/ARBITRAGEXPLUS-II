import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../index';
import { dbService } from '../services/database';
import { kvService } from '../services/kv';
import { validateRequest } from '../utils/validation';
import { successResponse, errorResponse } from '../utils/response';
import { recordMetric } from '../utils/monitoring';

const configRouter = new Hono<{ Bindings: Env }>();

const ConfigSchema = z.object({
  version: z.string(),
  mode: z.enum(['development', 'staging', 'production']),
  chains: z.object({
    enabled: z.array(z.string()),
    ethereum: z.object({
      rpc: z.string(),
      maxGasPrice: z.string(),
      minProfitThreshold: z.string(),
    }).optional(),
    arbitrum: z.object({
      rpc: z.string(),
      maxGasPrice: z.string(),
      minProfitThreshold: z.string(),
    }).optional(),
    optimism: z.object({
      rpc: z.string(),
      maxGasPrice: z.string(),
      minProfitThreshold: z.string(),
    }).optional(),
    polygon: z.object({
      rpc: z.string(),
      maxGasPrice: z.string(),
      minProfitThreshold: z.string(),
    }).optional(),
    bsc: z.object({
      rpc: z.string(),
      maxGasPrice: z.string(),
      minProfitThreshold: z.string(),
    }).optional(),
  }),
  strategies: z.record(z.any()),
  risk: z.object({
    maxPositionSize: z.string(),
    maxDailyLoss: z.string(),
    enableKillSwitch: z.boolean(),
    killSwitchLossThreshold: z.string(),
    requiredSafetyScore: z.number(),
    blacklistedTokens: z.array(z.string()),
    whitelistedTokens: z.array(z.string()),
  }),
  execution: z.object({
    maxConcurrentTrades: z.number(),
    defaultSlippage: z.number(),
    privateMempool: z.boolean(),
    relays: z.array(z.string()),
    gasStrategy: z.enum(['fixed', 'adaptive', 'aggressive']),
    maxPriorityFeePerGas: z.string(),
    targetBlockDelay: z.number(),
  }),
  monitoring: z.object({
    enableAlerts: z.boolean(),
    alertChannels: z.array(z.string()),
    metricsRetention: z.number(),
    enableGrafana: z.boolean(),
    prometheusEndpoint: z.string(),
  }),
});

configRouter.get('/', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  
  try {
    const cacheKey = 'config:active';
    const cached = await kvService.get(env.CACHE_KV, cacheKey);
    
    if (cached) {
      c.header('X-Cache-Status', 'HIT');
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      
      await recordMetric(env.METRICS, {
        type: 'api_request',
        endpoint: '/api/config',
        status: 'cache_hit',
        duration: Date.now() - startTime,
      });
      
      return successResponse(c, cached);
    }
    
    c.header('X-Cache-Status', 'MISS');
    
    const config = await dbService.getActiveConfig(env.DB);
    
    if (!config) {
      return successResponse(c, getDefaultConfig());
    }
    
    await kvService.set(
      env.CACHE_KV,
      cacheKey,
      config,
      parseInt(env.CACHE_TTL_CONFIG || '60')
    );
    
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    
    await recordMetric(env.METRICS, {
      type: 'api_request',
      endpoint: '/api/config',
      status: 'success',
      duration: Date.now() - startTime,
    });
    
    return successResponse(c, config);
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: '/api/config',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

configRouter.put('/', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  
  try {
    const body = await validateRequest(ConfigSchema, await c.req.json());
    
    await dbService.deactivateConfigs(env.DB);
    
    const newConfig = await dbService.createConfig(env.DB, {
      version: body.version,
      config: body,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    await kvService.delete(env.CACHE_KV, 'config:active');
    
    await kvService.set(
      env.CONFIG_KV,
      'config:backup:' + Date.now(),
      body,
      86400 * 30
    );
    
    await recordMetric(env.METRICS, {
      type: 'config_updated',
      version: body.version,
      mode: body.mode,
      duration: Date.now() - startTime,
    });
    
    return successResponse(c, {
      message: 'Configuration updated successfully',
      config: newConfig,
    });
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: 'PUT /api/config',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

configRouter.get('/history', async (c) => {
  const env = c.env;
  
  try {
    const { limit = '10' } = c.req.query();
    
    const configs = await dbService.getConfigHistory(env.DB, parseInt(limit));
    
    c.header('Cache-Control', 'public, max-age=300');
    
    return successResponse(c, {
      configs,
      metadata: {
        total: configs.length,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

configRouter.post('/rollback/:version', async (c) => {
  const env = c.env;
  const version = c.req.param('version');
  
  try {
    const config = await dbService.getConfigByVersion(env.DB, version);
    
    if (!config) {
      return errorResponse(c, new Error('Configuration version not found'), 404);
    }
    
    await dbService.deactivateConfigs(env.DB);
    
    await dbService.updateConfig(env.DB, config.id, {
      isActive: true,
      updatedAt: Date.now(),
    });
    
    await kvService.delete(env.CACHE_KV, 'config:active');
    
    await recordMetric(env.METRICS, {
      type: 'config_rollback',
      version,
    });
    
    return successResponse(c, {
      message: 'Configuration rolled back successfully',
      config,
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

configRouter.get('/presets', async (c) => {
  const env = c.env;
  
  try {
    const presets = [
      {
        id: 'conservative',
        name: 'Conservative',
        description: 'Low risk, stable returns',
        config: getConservativePreset(),
      },
      {
        id: 'balanced',
        name: 'Balanced',
        description: 'Moderate risk and returns',
        config: getBalancedPreset(),
      },
      {
        id: 'aggressive',
        name: 'Aggressive',
        description: 'High risk, maximum returns',
        config: getAggressivePreset(),
      },
    ];
    
    c.header('Cache-Control', 'public, max-age=3600');
    
    return successResponse(c, presets);
  } catch (error) {
    return errorResponse(c, error);
  }
});

configRouter.post('/presets/:id', async (c) => {
  const env = c.env;
  const presetId = c.req.param('id');
  
  try {
    let presetConfig: any;
    
    switch (presetId) {
      case 'conservative':
        presetConfig = getConservativePreset();
        break;
      case 'balanced':
        presetConfig = getBalancedPreset();
        break;
      case 'aggressive':
        presetConfig = getAggressivePreset();
        break;
      default:
        return errorResponse(c, new Error('Invalid preset ID'), 400);
    }
    
    await dbService.deactivateConfigs(env.DB);
    
    const newConfig = await dbService.createConfig(env.DB, {
      version: presetConfig.version,
      config: presetConfig,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    await kvService.delete(env.CACHE_KV, 'config:active');
    
    await recordMetric(env.METRICS, {
      type: 'preset_applied',
      preset: presetId,
    });
    
    return successResponse(c, {
      message: `${presetId} preset applied successfully`,
      config: newConfig,
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

function getDefaultConfig() {
  return {
    version: '3.6.0',
    mode: 'production',
    chains: {
      enabled: ['ethereum', 'arbitrum', 'optimism', 'polygon', 'bsc'],
      ethereum: {
        rpc: 'wss://eth-mainnet.alchemyapi.io/v2/...',
        maxGasPrice: '150',
        minProfitThreshold: '0.015'
      },
      arbitrum: {
        rpc: 'wss://arb-mainnet.alchemyapi.io/v2/...',
        maxGasPrice: '2',
        minProfitThreshold: '0.01'
      },
      optimism: {
        rpc: 'wss://opt-mainnet.alchemyapi.io/v2/...',
        maxGasPrice: '2',
        minProfitThreshold: '0.01'
      },
      polygon: {
        rpc: 'wss://polygon-mainnet.alchemyapi.io/v2/...',
        maxGasPrice: '300',
        minProfitThreshold: '0.012'
      },
      bsc: {
        rpc: 'wss://bsc-mainnet.alchemyapi.io/v2/...',
        maxGasPrice: '10',
        minProfitThreshold: '0.018'
      }
    },
    strategies: {
      enabled: [
        'dex-arb',
        'flash-loan-arb',
        'triangular-arb',
        'cross-chain-arb',
        'liquidation',
        'backrun',
        'jit-liquidity',
        'cex-dex-arb',
        'mev-share',
        'atomic-arb',
        'statistical-arb'
      ],
    },
    risk: {
      maxPositionSize: '100',
      maxDailyLoss: '500',
      enableKillSwitch: true,
      killSwitchLossThreshold: '1000',
      requiredSafetyScore: 70,
      blacklistedTokens: [],
      whitelistedTokens: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC']
    },
    execution: {
      maxConcurrentTrades: 5,
      defaultSlippage: 0.005,
      privateMempool: true,
      relays: ['flashbots', 'bloxroute', 'mev-share'],
      gasStrategy: 'adaptive',
      maxPriorityFeePerGas: '3',
      targetBlockDelay: 1
    },
    monitoring: {
      enableAlerts: true,
      alertChannels: ['telegram', 'discord', 'email'],
      metricsRetention: 30,
      enableGrafana: true,
      prometheusEndpoint: 'http://localhost:9090'
    }
  };
}

function getConservativePreset() {
  const config = getDefaultConfig();
  config.version = '3.6.0-conservative';
  config.risk.maxPositionSize = '50';
  config.risk.maxDailyLoss = '100';
  config.risk.requiredSafetyScore = 85;
  config.execution.maxConcurrentTrades = 2;
  config.execution.defaultSlippage = 0.002;
  return config;
}

function getBalancedPreset() {
  const config = getDefaultConfig();
  config.version = '3.6.0-balanced';
  config.risk.maxPositionSize = '100';
  config.risk.maxDailyLoss = '500';
  config.risk.requiredSafetyScore = 70;
  config.execution.maxConcurrentTrades = 5;
  config.execution.defaultSlippage = 0.005;
  return config;
}

function getAggressivePreset() {
  const config = getDefaultConfig();
  config.version = '3.6.0-aggressive';
  config.risk.maxPositionSize = '500';
  config.risk.maxDailyLoss = '2000';
  config.risk.requiredSafetyScore = 50;
  config.execution.maxConcurrentTrades = 10;
  config.execution.defaultSlippage = 0.01;
  config.execution.gasStrategy = 'aggressive';
  return config;
}

export { configRouter };