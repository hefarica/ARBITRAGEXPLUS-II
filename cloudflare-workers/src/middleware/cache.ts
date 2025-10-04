import { Context, Next } from 'hono';
import type { Env } from '../index';

interface CacheConfig {
  ttl?: number;
  staleWhileRevalidate?: number;
  key?: (c: Context) => string;
  condition?: (c: Context) => boolean;
  vary?: string[];
}

const endpointCacheConfig: Record<string, CacheConfig> = {
  '/api/opportunities': {
    ttl: 5,
    staleWhileRevalidate: 10,
    vary: ['Accept', 'Authorization'],
  },
  '/api/assets/safety': {
    ttl: 300,
    staleWhileRevalidate: 600,
    vary: ['Accept'],
  },
  '/api/config': {
    ttl: 60,
    staleWhileRevalidate: 300,
    vary: ['Accept', 'Authorization'],
  },
  '/api/metrics': {
    ttl: 60,
    staleWhileRevalidate: 120,
    vary: ['Accept'],
  },
};

export function cacheMiddleware(config: CacheConfig = {}) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return next();
    }
    
    const path = c.req.path;
    const pathConfig = endpointCacheConfig[path] || config;
    
    if (pathConfig.condition && !pathConfig.condition(c)) {
      return next();
    }
    
    const cacheKey = generateCacheKey(c, pathConfig);
    const cache = caches.default;
    
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      const age = getCacheAge(cachedResponse);
      const ttl = pathConfig.ttl || 60;
      const swr = pathConfig.staleWhileRevalidate || 0;
      
      if (age < ttl) {
        c.header('X-Cache-Status', 'HIT');
        c.header('Age', age.toString());
        return cachedResponse;
      }
      
      if (age < ttl + swr) {
        c.header('X-Cache-Status', 'STALE');
        c.header('Age', age.toString());
        
        c.executionCtx.waitUntil(
          refreshCache(c, cache, cacheKey, pathConfig)
        );
        
        return cachedResponse;
      }
    }
    
    await next();
    
    if (c.res.status === 200) {
      const response = c.res.clone();
      
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', generateCacheControl(pathConfig));
      
      if (pathConfig.vary) {
        headers.set('Vary', pathConfig.vary.join(', '));
      }
      
      const cachedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      
      c.executionCtx.waitUntil(
        cache.put(cacheKey, cachedResponse)
      );
      
      c.header('X-Cache-Status', 'MISS');
    }
  };
}

function generateCacheKey(c: Context, config: CacheConfig): string {
  if (config.key) {
    return config.key(c);
  }
  
  const url = new URL(c.req.url);
  const params = url.searchParams;
  params.sort();
  
  const vary = config.vary || [];
  const varyHeaders = vary.map(h => `${h}:${c.req.header(h) || ''}`).join('|');
  
  return `${url.origin}${url.pathname}?${params.toString()}#${varyHeaders}`;
}

function generateCacheControl(config: CacheConfig): string {
  const directives = [];
  
  directives.push('public');
  
  if (config.ttl) {
    directives.push(`max-age=${config.ttl}`);
  }
  
  if (config.staleWhileRevalidate) {
    directives.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }
  
  return directives.join(', ');
}

function getCacheAge(response: Response): number {
  const date = response.headers.get('Date');
  if (!date) return 0;
  
  const age = response.headers.get('Age');
  if (age) return parseInt(age);
  
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000);
}

async function refreshCache(
  c: Context<{ Bindings: Env }>,
  cache: Cache,
  cacheKey: string,
  config: CacheConfig
): Promise<void> {
  try {
    const request = new Request(c.req.url, {
      method: c.req.method,
      headers: c.req.raw.headers,
    });
    
    const response = await fetch(request);
    
    if (response.status === 200) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', generateCacheControl(config));
      
      if (config.vary) {
        headers.set('Vary', config.vary.join(', '));
      }
      
      const cachedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      
      await cache.put(cacheKey, cachedResponse);
    }
  } catch (error) {
    console.error('Failed to refresh cache:', error);
  }
}

export function invalidateCache(pattern: string) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    await next();
    
    if (c.res.status >= 200 && c.res.status < 300) {
      const cache = caches.default;
      
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const keys = await cache.keys();
            const toDelete = keys.filter(key => 
              key.url.includes(pattern)
            );
            
            await Promise.all(
              toDelete.map(key => cache.delete(key))
            );
          } catch (error) {
            console.error('Failed to invalidate cache:', error);
          }
        })()
      );
    }
  };
}