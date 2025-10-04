import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { decode, verify } from 'jose';
import type { Env } from '../index';

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const env = c.env;
  const path = c.req.path;
  
  const publicEndpoints = [
    '/health',
    '/api/opportunities',
    '/api/assets/safety',
    '/api/metrics/prometheus',
  ];
  
  const isPublic = publicEndpoints.some(endpoint => path.startsWith(endpoint));
  
  if (isPublic && c.req.method === 'GET') {
    return next();
  }
  
  const apiKey = c.req.header('X-API-Key');
  const authHeader = c.req.header('Authorization');
  
  if (apiKey) {
    const validKey = await validateApiKey(env, apiKey);
    if (validKey) {
      c.set('auth', { type: 'api-key', userId: validKey.userId });
      return next();
    }
  }
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    
    try {
      const payload = await validateJWT(env, token);
      c.set('auth', {
        type: 'jwt',
        userId: payload.sub,
        permissions: payload.permissions || [],
      });
      return next();
    } catch (error) {
      throw new HTTPException(401, {
        message: 'Invalid or expired token',
      });
    }
  }
  
  throw new HTTPException(401, {
    message: 'Authentication required',
  });
}

async function validateApiKey(env: Env, apiKey: string): Promise<any | null> {
  const storedKey = await env.CONFIG_KV.get(`api_key:${apiKey}`);
  
  if (!storedKey) {
    return null;
  }
  
  const keyData = JSON.parse(storedKey);
  
  if (keyData.expiresAt && keyData.expiresAt < Date.now()) {
    await env.CONFIG_KV.delete(`api_key:${apiKey}`);
    return null;
  }
  
  await env.CONFIG_KV.put(
    `api_key:${apiKey}`,
    JSON.stringify({
      ...keyData,
      lastUsed: Date.now(),
      usageCount: (keyData.usageCount || 0) + 1,
    }),
    { expirationTtl: 86400 * 30 }
  );
  
  return keyData;
}

async function validateJWT(env: Env, token: string): Promise<any> {
  const secret = new TextEncoder().encode(env.JWT_SECRET || 'default-secret-change-me');
  
  const { payload } = await verify(token, secret, {
    issuer: 'arbitragex',
    audience: 'api.arbitragex.io',
  });
  
  return payload;
}

export async function requirePermission(permission: string) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth) {
      throw new HTTPException(401, {
        message: 'Authentication required',
      });
    }
    
    if (auth.type === 'api-key') {
      return next();
    }
    
    if (!auth.permissions || !auth.permissions.includes(permission)) {
      throw new HTTPException(403, {
        message: `Permission '${permission}' required`,
      });
    }
    
    return next();
  };
}