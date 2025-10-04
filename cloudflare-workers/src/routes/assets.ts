import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../index';
import { rustApiService } from '../services/rustApi';
import { dbService } from '../services/database';
import { kvService } from '../services/kv';
import { validateRequest } from '../utils/validation';
import { successResponse, errorResponse } from '../utils/response';
import { recordMetric } from '../utils/monitoring';

const assetsRouter = new Hono<{ Bindings: Env }>();

const AssetSafetyQuerySchema = z.object({
  addresses: z.string().optional(),
  chainId: z.string().optional(),
  forceRefresh: z.string().optional(),
  batchSize: z.string().default('50'),
});

const AssetCheckSchema = z.object({
  addresses: z.array(z.string()).min(1).max(100),
  chainId: z.number().optional(),
});

assetsRouter.get('/safety', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  
  try {
    const query = validateRequest(AssetSafetyQuerySchema, c.req.query());
    
    const addresses = query.addresses ? query.addresses.split(',') : [];
    const forceRefresh = query.forceRefresh === 'true';
    
    if (addresses.length === 0) {
      const allAssets = await dbService.getAssetSafety(env.DB);
      
      c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      
      await recordMetric(env.METRICS, {
        type: 'api_request',
        endpoint: '/api/assets/safety',
        status: 'success',
        duration: Date.now() - startTime,
        count: allAssets.length,
      });
      
      return successResponse(c, {
        assets: allAssets,
        metadata: {
          total: allAssets.length,
          timestamp: Date.now(),
        },
      });
    }
    
    const results = await evaluateAssetsSafety(env, addresses, forceRefresh);
    
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    
    await recordMetric(env.METRICS, {
      type: 'api_request',
      endpoint: '/api/assets/safety',
      status: 'success',
      duration: Date.now() - startTime,
      count: results.length,
    });
    
    return successResponse(c, {
      assets: results,
      metadata: {
        total: results.length,
        evaluated: addresses.length,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: '/api/assets/safety',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

assetsRouter.post('/safety/check', async (c) => {
  const startTime = Date.now();
  const env = c.env;
  
  try {
    const body = await validateRequest(AssetCheckSchema, await c.req.json());
    
    const batchSize = 20;
    const batches = [];
    
    for (let i = 0; i < body.addresses.length; i += batchSize) {
      batches.push(body.addresses.slice(i, i + batchSize));
    }
    
    const results = await Promise.all(
      batches.map(batch => performSafetyChecks(env, batch, body.chainId))
    );
    
    const flatResults = results.flat();
    
    await dbService.upsertAssetSafety(env.DB, flatResults);
    
    for (const asset of flatResults) {
      await kvService.set(
        env.CACHE_KV,
        `asset:${asset.address}`,
        asset,
        parseInt(env.CACHE_TTL_ASSETS || '300')
      );
    }
    
    await recordMetric(env.METRICS, {
      type: 'api_request',
      endpoint: '/api/assets/safety/check',
      status: 'success',
      duration: Date.now() - startTime,
      count: flatResults.length,
    });
    
    return successResponse(c, {
      assets: flatResults,
      metadata: {
        evaluated: body.addresses.length,
        passed: flatResults.filter(a => a.score >= 70).length,
        failed: flatResults.filter(a => a.score < 70).length,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    await recordMetric(env.METRICS, {
      type: 'api_error',
      endpoint: '/api/assets/safety/check',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    });
    
    return errorResponse(c, error);
  }
});

assetsRouter.get('/blacklist', async (c) => {
  const env = c.env;
  
  try {
    const blacklistKey = 'asset_blacklist';
    const blacklist = await kvService.get(env.CONFIG_KV, blacklistKey) || [];
    
    c.header('Cache-Control', 'public, max-age=3600');
    
    return successResponse(c, {
      blacklist,
      metadata: {
        count: blacklist.length,
        updatedAt: await kvService.getMetadata(env.CONFIG_KV, blacklistKey),
      },
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

assetsRouter.post('/blacklist', async (c) => {
  const env = c.env;
  
  try {
    const { addresses, reason } = await c.req.json();
    
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Invalid addresses array');
    }
    
    const blacklistKey = 'asset_blacklist';
    const currentBlacklist = await kvService.get(env.CONFIG_KV, blacklistKey) || [];
    
    const newEntries = addresses.map(address => ({
      address,
      reason,
      addedAt: Date.now(),
    }));
    
    const updatedBlacklist = [...currentBlacklist, ...newEntries];
    
    await kvService.set(
      env.CONFIG_KV,
      blacklistKey,
      updatedBlacklist,
      0
    );
    
    for (const address of addresses) {
      await dbService.updateAssetSafety(env.DB, address, {
        score: 0,
        checks: { blacklisted: true, reason },
        updatedAt: Date.now(),
      });
    }
    
    return successResponse(c, {
      message: 'Assets added to blacklist',
      added: addresses.length,
      total: updatedBlacklist.length,
    });
  } catch (error) {
    return errorResponse(c, error);
  }
});

async function evaluateAssetsSafety(env: Env, addresses: string[], forceRefresh: boolean): Promise<any[]> {
  const results = [];
  
  for (const address of addresses) {
    if (!forceRefresh) {
      const cached = await kvService.get(env.CACHE_KV, `asset:${address}`);
      if (cached) {
        results.push(cached);
        continue;
      }
    }
    
    const safety = await performSafetyChecks(env, [address]);
    results.push(...safety);
    
    for (const asset of safety) {
      await kvService.set(
        env.CACHE_KV,
        `asset:${asset.address}`,
        asset,
        parseInt(env.CACHE_TTL_ASSETS || '300')
      );
    }
  }
  
  return results;
}

async function performSafetyChecks(env: Env, addresses: string[], chainId?: number): Promise<any[]> {
  const checks = await Promise.all([
    checkLiquidity(env, addresses, chainId),
    checkContractVerification(env, addresses, chainId),
    checkHolderDistribution(env, addresses, chainId),
    checkTradingVolume(env, addresses, chainId),
    checkBlacklist(env, addresses),
    checkRugPullIndicators(env, addresses, chainId),
  ]);
  
  const results = addresses.map(address => {
    const addressChecks = {
      liquidity: checks[0][address] || { passed: false, score: 0 },
      verified: checks[1][address] || { passed: false, score: 0 },
      distribution: checks[2][address] || { passed: false, score: 0 },
      volume: checks[3][address] || { passed: false, score: 0 },
      blacklisted: checks[4][address] || false,
      rugpull: checks[5][address] || { risk: 'high', score: 0 },
    };
    
    const totalScore = calculateSafetyScore(addressChecks);
    
    return {
      address,
      score: totalScore,
      checks: addressChecks,
      updatedAt: Date.now(),
    };
  });
  
  return results;
}

async function checkLiquidity(env: Env, addresses: string[], chainId?: number): Promise<any> {
  try {
    const data = await rustApiService.checkTokenLiquidity(env.RUST_ENGINE_URL, addresses, chainId);
    return data;
  } catch {
    return addresses.reduce((acc, addr) => ({
      ...acc,
      [addr]: { passed: false, score: 0, error: 'Failed to check liquidity' },
    }), {});
  }
}

async function checkContractVerification(env: Env, addresses: string[], chainId?: number): Promise<any> {
  try {
    const data = await rustApiService.checkContractVerification(env.RUST_ENGINE_URL, addresses, chainId);
    return data;
  } catch {
    return addresses.reduce((acc, addr) => ({
      ...acc,
      [addr]: { passed: false, score: 0, error: 'Failed to check verification' },
    }), {});
  }
}

async function checkHolderDistribution(env: Env, addresses: string[], chainId?: number): Promise<any> {
  try {
    const data = await rustApiService.checkHolderDistribution(env.RUST_ENGINE_URL, addresses, chainId);
    return data;
  } catch {
    return addresses.reduce((acc, addr) => ({
      ...acc,
      [addr]: { passed: false, score: 0, error: 'Failed to check distribution' },
    }), {});
  }
}

async function checkTradingVolume(env: Env, addresses: string[], chainId?: number): Promise<any> {
  try {
    const data = await rustApiService.checkTradingVolume(env.RUST_ENGINE_URL, addresses, chainId);
    return data;
  } catch {
    return addresses.reduce((acc, addr) => ({
      ...acc,
      [addr]: { passed: false, score: 0, error: 'Failed to check volume' },
    }), {});
  }
}

async function checkBlacklist(env: Env, addresses: string[]): Promise<any> {
  const blacklistKey = 'asset_blacklist';
  const blacklist = await kvService.get(env.CONFIG_KV, blacklistKey) || [];
  const blacklistedAddresses = new Set(blacklist.map((b: any) => b.address.toLowerCase()));
  
  return addresses.reduce((acc, addr) => ({
    ...acc,
    [addr]: blacklistedAddresses.has(addr.toLowerCase()),
  }), {});
}

async function checkRugPullIndicators(env: Env, addresses: string[], chainId?: number): Promise<any> {
  try {
    const data = await rustApiService.checkRugPullIndicators(env.RUST_ENGINE_URL, addresses, chainId);
    return data;
  } catch {
    return addresses.reduce((acc, addr) => ({
      ...acc,
      [addr]: { risk: 'unknown', score: 0, error: 'Failed to check rugpull indicators' },
    }), {});
  }
}

function calculateSafetyScore(checks: any): number {
  if (checks.blacklisted) return 0;
  
  const weights = {
    liquidity: 0.25,
    verified: 0.15,
    distribution: 0.20,
    volume: 0.20,
    rugpull: 0.20,
  };
  
  let totalScore = 0;
  
  totalScore += (checks.liquidity.score || 0) * weights.liquidity;
  totalScore += (checks.verified.score || 0) * weights.verified;
  totalScore += (checks.distribution.score || 0) * weights.distribution;
  totalScore += (checks.volume.score || 0) * weights.volume;
  
  const rugpullScore = checks.rugpull.risk === 'low' ? 100 :
                       checks.rugpull.risk === 'medium' ? 50 : 0;
  totalScore += rugpullScore * weights.rugpull;
  
  return Math.round(totalScore);
}

export { assetsRouter };