import { Context, Next } from 'hono';
import type { Env } from '../index';

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => string | null);
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  optionsSuccessStatus?: number;
}

const defaultOptions: CorsOptions = {
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposeHeaders: [],
  maxAge: 86400,
  credentials: false,
  optionsSuccessStatus: 204,
};

export function corsMiddleware(options: CorsOptions = {}) {
  const config = { ...defaultOptions, ...options };
  
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const origin = c.req.header('Origin') || '';
    
    const allowedOrigin = getAllowedOrigin(origin, config.origin);
    
    if (allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
    }
    
    if (config.credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }
    
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', config.allowMethods!.join(', '));
      c.header('Access-Control-Allow-Headers', config.allowHeaders!.join(', '));
      
      if (config.maxAge) {
        c.header('Access-Control-Max-Age', config.maxAge.toString());
      }
      
      return c.body(null, config.optionsSuccessStatus);
    }
    
    if (config.exposeHeaders && config.exposeHeaders.length > 0) {
      c.header('Access-Control-Expose-Headers', config.exposeHeaders.join(', '));
    }
    
    return next();
  };
}

function getAllowedOrigin(
  requestOrigin: string,
  configOrigin: string | string[] | ((origin: string) => string | null) | undefined
): string | null {
  if (!configOrigin || configOrigin === '*') {
    return '*';
  }
  
  if (typeof configOrigin === 'string') {
    return configOrigin === requestOrigin ? requestOrigin : null;
  }
  
  if (Array.isArray(configOrigin)) {
    return configOrigin.includes(requestOrigin) ? requestOrigin : null;
  }
  
  if (typeof configOrigin === 'function') {
    return configOrigin(requestOrigin);
  }
  
  return null;
}