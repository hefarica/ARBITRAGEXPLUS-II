import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';

import { opportunitiesRouter } from './routes/opportunities';
import { assetsRouter } from './routes/assets';
import { executionsRouter } from './routes/executions';
import { configRouter } from './routes/config';
import { metricsRouter } from './routes/metrics';

import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { cacheMiddleware } from './middleware/cache';
import { errorHandler, notFoundHandler } from './utils/response';

export interface Env {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  CONFIG_KV: KVNamespace;
  WEBSOCKET_HANDLER: DurableObjectNamespace;
  METRICS: AnalyticsEngineDataset;
  
  API_VERSION: string;
  RUST_ENGINE_URL: string;
  JWT_SECRET: string;
  API_KEY: string;
  ENVIRONMENT: string;
  MAX_REQUESTS_PER_MINUTE: string;
  CACHE_TTL_OPPORTUNITIES: string;
  CACHE_TTL_ASSETS: string;
  CACHE_TTL_CONFIG: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', prettyJSON());

app.use('*', cors({
  origin: (origin) => {
    const allowedOrigins = [
      'https://arbitragex.io',
      'https://app.arbitragex.io',
      'https://staging.arbitragex.io',
      'http://localhost:3000',
      'http://localhost:5000'
    ];
    
    if (!origin) return null;
    
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    
    if (origin.endsWith('.arbitragex.io')) {
      return origin;
    }
    
    return null;
  },
  allowHeaders: ['X-API-Key', 'Authorization', 'Content-Type', 'X-Request-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
  credentials: true,
}));

app.use('/api/*', rateLimitMiddleware);

app.use('/api/*', authMiddleware);

app.route('/api/opportunities', opportunitiesRouter);
app.route('/api/assets', assetsRouter);
app.route('/api/executions', executionsRouter);
app.route('/api/config', configRouter);
app.route('/api/metrics', metricsRouter);

app.get('/health', async (c) => {
  const env = c.env;
  
  try {
    const dbCheck = await env.DB.prepare('SELECT 1').first();
    const kvCheck = await env.CACHE_KV.get('health_check');
    
    const rustEngineHealth = await fetch(`${env.RUST_ENGINE_URL}/health`, {
      method: 'GET',
      headers: {
        'User-Agent': 'ArbitrageX-CF-Worker/3.6.0',
      },
      signal: AbortSignal.timeout(5000),
    }).then(r => r.ok).catch(() => false);
    
    const status = {
      status: 'healthy',
      version: env.API_VERSION,
      environment: env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck !== null,
        kv: true,
        rustEngine: rustEngineHealth,
      }
    };
    
    const allHealthy = Object.values(status.checks).every(v => v === true);
    
    return c.json(status, allHealthy ? 200 : 503);
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

app.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }
  
  const id = c.env.WEBSOCKET_HANDLER.idFromName('global');
  const stub = c.env.WEBSOCKET_HANDLER.get(id);
  return stub.fetch(c.req.raw);
});

app.get('/', (c) => {
  return c.json({
    name: 'ArbitrageX MEV Workers',
    version: c.env.API_VERSION,
    environment: c.env.ENVIRONMENT || 'development',
    endpoints: {
      health: '/health',
      opportunities: '/api/opportunities',
      assets: '/api/assets',
      executions: '/api/executions',
      config: '/api/config',
      metrics: '/api/metrics',
      websocket: '/ws'
    },
    documentation: 'https://docs.arbitragex.io/api',
  });
});

app.onError(errorHandler);
app.notFound(notFoundHandler);

export class WebSocketHandler {
  state: DurableObjectState;
  sessions: Set<WebSocket>;
  env: Env;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }
  
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      await this.handleSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response('Not found', { status: 404 });
  }
  
  async handleSession(webSocket: WebSocket) {
    webSocket.accept();
    this.sessions.add(webSocket);
    
    webSocket.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to ArbitrageX MEV WebSocket',
      timestamp: Date.now(),
    }));
    
    webSocket.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        await this.handleMessage(webSocket, data);
      } catch (error) {
        webSocket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }));
      }
    });
    
    webSocket.addEventListener('close', () => {
      this.sessions.delete(webSocket);
    });
  }
  
  async handleMessage(webSocket: WebSocket, data: any) {
    switch (data.type) {
      case 'subscribe':
        webSocket.send(JSON.stringify({
          type: 'subscribed',
          channel: data.channel,
          timestamp: Date.now(),
        }));
        break;
        
      case 'ping':
        webSocket.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now(),
        }));
        break;
        
      default:
        webSocket.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type',
        }));
    }
  }
  
  broadcast(message: any) {
    const msg = JSON.stringify(message);
    this.sessions.forEach(session => {
      try {
        session.send(msg);
      } catch (error) {
        this.sessions.delete(session);
      }
    });
  }
}

export default app;