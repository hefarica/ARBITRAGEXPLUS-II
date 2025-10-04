import type { Env } from '../index';

export const websocketService = {
  async broadcastExecution(env: Env, message: any): Promise<void> {
    const id = env.WEBSOCKET_HANDLER.idFromName('global');
    const stub = env.WEBSOCKET_HANDLER.get(id);
    
    await stub.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  },
  
  async broadcastOpportunity(env: Env, opportunity: any): Promise<void> {
    const message = {
      type: 'opportunity',
      data: opportunity,
      timestamp: Date.now(),
    };
    
    await websocketService.broadcastExecution(env, message);
  },
  
  async getConnectedClients(env: Env): Promise<number> {
    const id = env.WEBSOCKET_HANDLER.idFromName('global');
    const stub = env.WEBSOCKET_HANDLER.get(id);
    
    const response = await stub.fetch('http://internal/stats');
    const stats = await response.json();
    
    return stats.connectedClients || 0;
  },
  
  async sendToClient(env: Env, clientId: string, message: any): Promise<void> {
    const id = env.WEBSOCKET_HANDLER.idFromName('global');
    const stub = env.WEBSOCKET_HANDLER.get(id);
    
    await stub.fetch(`http://internal/send/${clientId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  },
  
  createMessage(type: string, data: any, metadata?: any) {
    return {
      id: crypto.randomUUID(),
      type,
      data,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        version: '3.6.0',
      },
    };
  },
  
  async createChannel(env: Env, channelName: string): Promise<string> {
    const id = env.WEBSOCKET_HANDLER.idFromName(channelName);
    const stub = env.WEBSOCKET_HANDLER.get(id);
    
    const response = await stub.fetch('http://internal/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: channelName }),
    });
    
    const result = await response.json();
    return result.channelId;
  },
  
  async subscribeToChannel(
    env: Env,
    clientId: string,
    channelName: string
  ): Promise<void> {
    const id = env.WEBSOCKET_HANDLER.idFromName('global');
    const stub = env.WEBSOCKET_HANDLER.get(id);
    
    await stub.fetch('http://internal/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        channel: channelName,
      }),
    });
  },
  
  async unsubscribeFromChannel(
    env: Env,
    clientId: string,
    channelName: string
  ): Promise<void> {
    const id = env.WEBSOCKET_HANDLER.idFromName('global');
    const stub = env.WEBSOCKET_HANDLER.get(id);
    
    await stub.fetch('http://internal/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        channel: channelName,
      }),
    });
  },
  
  async broadcastToChannel(
    env: Env,
    channelName: string,
    message: any
  ): Promise<void> {
    const id = env.WEBSOCKET_HANDLER.idFromName('global');
    const stub = env.WEBSOCKET_HANDLER.get(id);
    
    await stub.fetch(`http://internal/broadcast/${channelName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  },
  
  parseMessage(data: string | ArrayBuffer): any | null {
    try {
      if (typeof data === 'string') {
        return JSON.parse(data);
      }
      
      const decoder = new TextDecoder();
      const text = decoder.decode(data);
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      return null;
    }
  },
  
  createErrorMessage(error: Error | string, code?: string) {
    return websocketService.createMessage('error', {
      message: error instanceof Error ? error.message : error,
      code: code || 'UNKNOWN_ERROR',
      stack: error instanceof Error ? error.stack : undefined,
    });
  },
  
  createSuccessMessage(data: any, message?: string) {
    return websocketService.createMessage('success', {
      message: message || 'Operation completed successfully',
      result: data,
    });
  },
  
  async handlePing(env: Env, clientId: string): Promise<void> {
    await websocketService.sendToClient(
      env,
      clientId,
      websocketService.createMessage('pong', {
        clientId,
        serverTime: Date.now(),
      })
    );
  },
  
  createSubscriptionManager(env: Env) {
    const subscriptions = new Map<string, Set<string>>();
    
    return {
      subscribe(clientId: string, channel: string) {
        if (!subscriptions.has(channel)) {
          subscriptions.set(channel, new Set());
        }
        subscriptions.get(channel)!.add(clientId);
      },
      
      unsubscribe(clientId: string, channel: string) {
        const clients = subscriptions.get(channel);
        if (clients) {
          clients.delete(clientId);
          if (clients.size === 0) {
            subscriptions.delete(channel);
          }
        }
      },
      
      unsubscribeAll(clientId: string) {
        for (const [channel, clients] of subscriptions) {
          clients.delete(clientId);
          if (clients.size === 0) {
            subscriptions.delete(channel);
          }
        }
      },
      
      getSubscribers(channel: string): string[] {
        const clients = subscriptions.get(channel);
        return clients ? Array.from(clients) : [];
      },
      
      getSubscriptions(clientId: string): string[] {
        const channels = [];
        for (const [channel, clients] of subscriptions) {
          if (clients.has(clientId)) {
            channels.push(channel);
          }
        }
        return channels;
      },
      
      async broadcast(channel: string, message: any) {
        const clients = this.getSubscribers(channel);
        
        await Promise.all(
          clients.map(clientId =>
            websocketService.sendToClient(env, clientId, message)
          )
        );
      },
    };
  },
};