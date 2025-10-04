import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import { db } from './db';
import { alerts, alertHistory, opportunities, executions, walletBalances } from '@shared/schema';
import { eq, and, or, gte, lte, gt, lt, desc } from 'drizzle-orm';

interface WSClient {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  lastPing: number;
}

interface AlertCondition {
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  field: string;
  value: number;
  metric?: string;
}

export class AlertWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/alerts'
    });

    this.initialize();
  }

  private initialize() {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = Math.random().toString(36).substring(7);
      const client: WSClient = {
        id: clientId,
        ws,
        isAlive: true,
        lastPing: Date.now()
      };

      this.clients.set(clientId, client);
      console.log(`[WS] Client connected: ${clientId}`);

      // Send initial connection success
      this.sendToClient(client, {
        type: 'connection',
        status: 'connected',
        clientId,
        timestamp: Date.now()
      });

      // Setup ping/pong for connection health
      ws.on('pong', () => {
        client.isAlive = true;
        client.lastPing = Date.now();
      });

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(client, data);
        } catch (error) {
          console.error('[WS] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`[WS] Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error(`[WS] Client error ${clientId}:`, error);
      });
    });

    // Start heartbeat check
    this.startHeartbeat();

    // Start alert checking
    this.startAlertChecking();
  }

  private handleClientMessage(client: WSClient, data: any) {
    switch (data.type) {
      case 'ping':
        this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
        break;
      case 'subscribe':
        // Client subscribing to specific alert types
        console.log(`[WS] Client ${client.id} subscribed to:`, data.categories);
        break;
      case 'test-alert':
        // Test alert functionality
        this.sendToClient(client, {
          type: 'alert',
          priority: data.priority || 'medium',
          title: 'Test Alert',
          message: 'This is a test alert notification',
          timestamp: Date.now(),
          data: data
        });
        break;
      default:
        console.log(`[WS] Unknown message type: ${data.type}`);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          console.log(`[WS] Terminating inactive client: ${client.id}`);
          client.ws.terminate();
          this.clients.delete(client.id);
          return;
        }

        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000); // Check every 30 seconds
  }

  private async startAlertChecking() {
    // Check alerts every 30 seconds
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAllAlerts();
      } catch (error) {
        console.error('[WS] Error checking alerts:', error);
      }
    }, 30000);

    // Initial check
    await this.checkAllAlerts();
  }

  private async checkAllAlerts() {
    try {
      // Get all active alerts
      const activeAlerts = await db
        .select()
        .from(alerts)
        .where(eq(alerts.isActive, true));

      for (const alert of activeAlerts) {
        await this.checkAlertCondition(alert);
      }
    } catch (error) {
      console.error('[WS] Error in checkAllAlerts:', error);
    }
  }

  private async checkAlertCondition(alert: any) {
    try {
      const condition = alert.condition as AlertCondition;
      let triggered = false;
      let value: number = 0;
      let message = '';

      switch (alert.type) {
        case 'opportunity':
          // Check opportunities
          const opps = await db
            .select()
            .from(opportunities)
            .orderBy(desc(opportunities.ts))
            .limit(10);

          for (const opp of opps) {
            if (this.evaluateCondition(opp.estProfitUsd, condition)) {
              triggered = true;
              value = opp.estProfitUsd;
              message = `Opportunity detected: $${opp.estProfitUsd.toFixed(2)} profit on ${opp.dexIn}→${opp.dexOut}`;
              break;
            }
          }
          break;

        case 'gas':
          // Check gas prices (mock for now, replace with real gas oracle)
          const gasPrice = Math.random() * 100; // Mock gas price
          if (this.evaluateCondition(gasPrice, condition)) {
            triggered = true;
            value = gasPrice;
            message = `Gas price alert: ${gasPrice.toFixed(2)} Gwei`;
          }
          break;

        case 'wallet':
          // Check wallet balances
          const balances = await db
            .select()
            .from(walletBalances)
            .orderBy(desc(walletBalances.recordedAt))
            .limit(1);

          if (balances.length > 0) {
            const balance = parseFloat(balances[0].balance);
            if (this.evaluateCondition(balance, condition)) {
              triggered = true;
              value = balance;
              message = `Wallet balance alert: ${balance.toFixed(4)} ETH`;
            }
          }
          break;

        case 'risk':
          // Check for risky tokens or conditions
          const riskScore = Math.random() * 100; // Mock risk score
          if (this.evaluateCondition(riskScore, condition)) {
            triggered = true;
            value = riskScore;
            message = `Risk alert: Score ${riskScore.toFixed(0)}/100`;
          }
          break;

        case 'price':
          // Price alerts for specific tokens
          const price = Math.random() * 1000; // Mock price
          if (this.evaluateCondition(price, condition)) {
            triggered = true;
            value = price;
            message = `Price alert for ${alert.tokenAddress}: $${price.toFixed(2)}`;
          }
          break;
      }

      if (triggered) {
        await this.triggerAlert(alert, value, message);
      }
    } catch (error) {
      console.error('[WS] Error checking alert condition:', error);
    }
  }

  private evaluateCondition(value: number, condition: AlertCondition): boolean {
    switch (condition.operator) {
      case 'gt':
        return value > condition.value;
      case 'lt':
        return value < condition.value;
      case 'gte':
        return value >= condition.value;
      case 'lte':
        return value <= condition.value;
      case 'eq':
        return Math.abs(value - condition.value) < 0.0001;
      default:
        return false;
    }
  }

  private async triggerAlert(alert: any, value: number, message: string) {
    try {
      // Check if alert was recently triggered (cooldown period)
      if (alert.lastTriggered) {
        const cooldownMs = alert.schedule === '5min' ? 300000 : 
                          alert.schedule === 'hourly' ? 3600000 : 
                          60000; // Default 1 minute for instant
        
        const timeSinceLastTrigger = Date.now() - new Date(alert.lastTriggered).getTime();
        if (timeSinceLastTrigger < cooldownMs) {
          return; // Still in cooldown
        }
      }

      // Update alert
      await db
        .update(alerts)
        .set({
          lastTriggered: new Date(),
          triggerCount: (alert.triggerCount || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(alerts.id, alert.id));

      // Save to history
      await db
        .insert(alertHistory)
        .values({
          alertId: alert.id,
          value: value.toString(),
          message,
          data: {
            alertName: alert.name,
            type: alert.type,
            priority: alert.priority,
            threshold: alert.threshold
          }
        });

      // Broadcast to all connected clients
      this.broadcast({
        type: 'alert',
        id: alert.id,
        name: alert.name,
        priority: alert.priority,
        category: alert.category,
        message,
        value,
        soundEnabled: alert.soundEnabled,
        timestamp: Date.now(),
        data: {
          type: alert.type,
          threshold: alert.threshold,
          condition: alert.condition
        }
      });

      console.log(`[WS] Alert triggered: ${alert.name} - ${message}`);
    } catch (error) {
      console.error('[WS] Error triggering alert:', error);
    }
  }

  private sendToClient(client: WSClient, data: any) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  public broadcast(data: any) {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  public getConnectionCount(): number {
    return this.clients.size;
  }

  public shutdown() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.clients.forEach((client) => {
      client.ws.close();
    });
    
    this.wss.close();
  }
}