import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env } from '../index';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (c: Context) => string;
}

const endpointLimits: Record<string, RateLimitConfig> = {
  '/api/opportunities': { windowMs: 60000, maxRequests: 120 },
  '/api/assets': { windowMs: 60000, maxRequests: 60 },
  '/api/executions': { windowMs: 60000, maxRequests: 60 },
  '/api/config': { windowMs: 60000, maxRequests: 30 },
  '/api/metrics': { windowMs: 60000, maxRequests: 100 },
};

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const env = c.env;
  const path = c.req.path;
  
  const config = getConfigForPath(path) || {
    windowMs: 60000,
    maxRequests: parseInt(env.MAX_REQUESTS_PER_MINUTE || '100'),
  };
  
  const key = generateKey(c, config);
  const bucket = await getTokenBucket(env.RATE_LIMIT_KV, key, config);
  
  if (!bucket.allowed) {
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', new Date(bucket.resetAt).toISOString());
    c.header('Retry-After', Math.ceil((bucket.resetAt - Date.now()) / 1000).toString());
    
    throw new HTTPException(429, {
      message: 'Too many requests',
    });
  }
  
  c.header('X-RateLimit-Limit', config.maxRequests.toString());
  c.header('X-RateLimit-Remaining', bucket.remaining.toString());
  c.header('X-RateLimit-Reset', new Date(bucket.resetAt).toISOString());
  
  return next();
}

function getConfigForPath(path: string): RateLimitConfig | null {
  for (const [pattern, config] of Object.entries(endpointLimits)) {
    if (path.startsWith(pattern)) {
      return config;
    }
  }
  return null;
}

function generateKey(c: Context, config: RateLimitConfig): string {
  if (config.keyGenerator) {
    return config.keyGenerator(c);
  }
  
  const auth = c.get('auth');
  if (auth?.userId) {
    return `user:${auth.userId}:${c.req.path}`;
  }
  
  const ip = c.req.header('CF-Connecting-IP') || 
              c.req.header('X-Forwarded-For') || 
              'unknown';
  
  return `ip:${ip}:${c.req.path}`;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

async function getTokenBucket(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig
): Promise<TokenBucket> {
  const now = Date.now();
  const bucketKey = `rate_limit:${key}`;
  
  const stored = await kv.get(bucketKey);
  let bucket: any = stored ? JSON.parse(stored) : null;
  
  if (!bucket) {
    bucket = {
      tokens: config.maxRequests - 1,
      lastRefill: now,
      windowStart: now,
    };
  } else {
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timePassed / (config.windowMs / config.maxRequests));
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(config.maxRequests, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
    
    if (now - bucket.windowStart > config.windowMs) {
      bucket.tokens = config.maxRequests - 1;
      bucket.windowStart = now;
      bucket.lastRefill = now;
    } else if (bucket.tokens > 0) {
      bucket.tokens--;
    }
  }
  
  const allowed = bucket.tokens >= 0;
  
  await kv.put(bucketKey, JSON.stringify(bucket), {
    expirationTtl: Math.ceil(config.windowMs / 1000) + 60,
  });
  
  return {
    tokens: bucket.tokens,
    lastRefill: bucket.lastRefill,
    allowed,
    remaining: Math.max(0, bucket.tokens),
    resetAt: bucket.windowStart + config.windowMs,
  };
}

export function createRateLimiter(config: RateLimitConfig) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const env = c.env;
    const key = generateKey(c, config);
    const bucket = await getTokenBucket(env.RATE_LIMIT_KV, key, config);
    
    if (!bucket.allowed) {
      throw new HTTPException(429, {
        message: 'Rate limit exceeded',
      });
    }
    
    return next();
  };
}