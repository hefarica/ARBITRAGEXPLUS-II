import { useEffect, useRef, useState, useCallback } from 'react';

export type AlertPriority = 'low' | 'medium' | 'high' | 'critical';
export type AlertType = 'price' | 'opportunity' | 'gas' | 'wallet' | 'risk';

export interface AlertNotification {
  id: string;
  name: string;
  priority: AlertPriority;
  category: string;
  message: string;
  value: number;
  soundEnabled: boolean;
  timestamp: number;
  data?: any;
}

export interface WebSocketStatus {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  lastPing: number;
}

interface UseWebSocketOptions {
  onAlert?: (alert: AlertNotification) => void;
  onStatusChange?: (status: WebSocketStatus) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export function useAlertWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onAlert,
    onStatusChange,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5
  } = options;

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const pingInterval = useRef<NodeJS.Timeout>();
  
  const [status, setStatus] = useState<WebSocketStatus>({
    connected: false,
    reconnecting: false,
    error: null,
    lastPing: 0
  });

  const [unreadCount, setUnreadCount] = useState(0);
  const [recentAlerts, setRecentAlerts] = useState<AlertNotification[]>([]);

  const updateStatus = useCallback((updates: Partial<WebSocketStatus>) => {
    const newStatus = { ...status, ...updates };
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [status, onStatusChange]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/alerts`;
      
      console.log('[WS Client] Connecting to:', wsUrl);
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('[WS Client] Connected');
        reconnectAttempts.current = 0;
        updateStatus({
          connected: true,
          reconnecting: false,
          error: null
        });

        // Start ping interval
        pingInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('[WS Client] Error parsing message:', error);
        }
      };

      ws.current.onerror = (error) => {
        console.error('[WS Client] Error:', error);
        updateStatus({
          error: 'WebSocket connection error'
        });
      };

      ws.current.onclose = () => {
        console.log('[WS Client] Disconnected');
        updateStatus({
          connected: false,
          error: 'Connection lost'
        });

        if (pingInterval.current) {
          clearInterval(pingInterval.current);
        }

        // Auto reconnect
        if (autoReconnect && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          updateStatus({ reconnecting: true });
          
          console.log(`[WS Client] Reconnecting... (attempt ${reconnectAttempts.current})`);
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };
    } catch (error) {
      console.error('[WS Client] Connection error:', error);
      updateStatus({
        connected: false,
        error: 'Failed to establish connection'
      });
    }
  }, [autoReconnect, maxReconnectAttempts, reconnectDelay, updateStatus]);

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'connection':
        console.log('[WS Client] Connection confirmed:', data);
        break;
        
      case 'pong':
        updateStatus({ lastPing: Date.now() });
        break;
        
      case 'alert':
        const alert: AlertNotification = {
          id: data.id || Math.random().toString(36),
          name: data.name,
          priority: data.priority,
          category: data.category,
          message: data.message,
          value: data.value,
          soundEnabled: data.soundEnabled,
          timestamp: data.timestamp,
          data: data.data
        };
        
        // Add to recent alerts
        setRecentAlerts(prev => [alert, ...prev.slice(0, 49)]);
        setUnreadCount(prev => prev + 1);
        
        // Play sound if enabled
        if (alert.soundEnabled && (alert.priority === 'high' || alert.priority === 'critical')) {
          playAlertSound(alert.priority);
        }
        
        // Call handler
        onAlert?.(alert);
        break;
        
      default:
        console.log('[WS Client] Unknown message type:', data.type);
    }
  }, [onAlert, updateStatus]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    if (pingInterval.current) {
      clearInterval(pingInterval.current);
    }
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    updateStatus({
      connected: false,
      reconnecting: false,
      error: null
    });
  }, [updateStatus]);

  const sendMessage = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn('[WS Client] Cannot send message - not connected');
    }
  }, []);

  const testAlert = useCallback((priority: AlertPriority = 'medium') => {
    sendMessage({
      type: 'test-alert',
      priority
    });
  }, [sendMessage]);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearRecentAlerts = useCallback(() => {
    setRecentAlerts([]);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status,
    unreadCount,
    recentAlerts,
    connect,
    disconnect,
    sendMessage,
    testAlert,
    clearUnread,
    clearRecentAlerts
  };
}

// Helper function to play alert sounds
function playAlertSound(priority: AlertPriority) {
  try {
    const audio = new Audio();
    
    // Different sounds for different priorities
    const soundMap = {
      low: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      medium: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      high: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      critical: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
    };
    
    audio.src = soundMap[priority];
    audio.volume = 0.5;
    audio.play().catch(e => console.warn('Could not play alert sound:', e));
  } catch (error) {
    console.warn('Alert sound playback failed:', error);
  }
}