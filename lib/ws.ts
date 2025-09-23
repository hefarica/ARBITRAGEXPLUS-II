/**
 * Cliente WebSocket para ARBITRAGEX SUPREME V3.6
 * 
 * Este módulo proporciona una interfaz para recibir actualizaciones en tiempo real
 * de oportunidades de arbitraje y otros eventos del sistema.
 */

import { useEffect, useState, useCallback, useRef } from 'react';

// URL base para conexiones WebSocket
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://arbitragex-supreme.workers.dev/ws';

// Tipos de mensajes que pueden enviarse/recibirse por WebSocket
export enum WebSocketMessageType {
  OPPORTUNITY = 'opportunity',
  FILL = 'fill',
  FAIL = 'fail',
  ALERT = 'alert',
  CONFIG_CHANGE = 'config_change',
  HEALTH = 'health',
  METRICS = 'metrics'
}

// Interfaz para los mensajes WebSocket
export interface WebSocketMessage<T = any> {
  type: WebSocketMessageType;
  data: T;
  timestamp: string;
}

// Opciones de configuración del cliente WebSocket
export interface WebSocketOptions {
  token?: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  filterTypes?: WebSocketMessageType[];
}

// Estado de conexión del WebSocket
export enum WebSocketConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

/**
 * Hook para utilizar WebSocket con React
 * 
 * @param options Opciones de configuración
 * @returns Estado y funciones para interactuar con WebSocket
 */
export function useWebSocket(options: WebSocketOptions = {}) {
  // Extraer opciones con valores por defecto
  const {
    token,
    reconnectDelay = 2000,
    maxReconnectAttempts = 5,
    filterTypes
  } = options;
  
  // Estado para almacenar mensajes recibidos
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  
  // Estado de la conexión
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>(
    WebSocketConnectionState.DISCONNECTED
  );
  
  // Contador de intentos de reconexión
  const reconnectAttemptsRef = useRef(0);
  
  // Referencia al objeto WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  
  // Función para conectar al WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    
    setConnectionState(WebSocketConnectionState.CONNECTING);
    
    // Construir URL con token de autenticación si existe
    let wsUrl = WS_BASE_URL;
    if (token) {
      wsUrl += `?token=${token}`;
    }
    
    // Crear nueva conexión WebSocket
    const ws = new WebSocket(wsUrl);
    
    // Manejar evento de apertura
    ws.onopen = () => {
      setConnectionState(WebSocketConnectionState.CONNECTED);
      reconnectAttemptsRef.current = 0;
      
      // Enviar mensaje para filtrar tipos de mensajes si se especificó
      if (filterTypes && filterTypes.length > 0) {
        ws.send(JSON.stringify({
          action: 'subscribe',
          types: filterTypes
        }));
      }
    };
    
    // Manejar mensajes recibidos
    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        // Verificar que el mensaje tiene el formato correcto
        if (!message.type || message.data === undefined) {
          console.error('Mensaje WebSocket inválido:', message);
          return;
        }
        
        // Filtrar mensajes si se especificaron filtros
        if (filterTypes && !filterTypes.includes(message.type as WebSocketMessageType)) {
          return;
        }
        
        // Añadir timestamp si no existe
        if (!message.timestamp) {
          message.timestamp = new Date().toISOString();
        }
        
        // Añadir nuevo mensaje a la lista
        setMessages(prevMessages => [...prevMessages, message]);
        
      } catch (error) {
        console.error('Error al procesar mensaje WebSocket:', error);
      }
    };
    
    // Manejar errores
    ws.onerror = (error) => {
      console.error('Error de WebSocket:', error);
      setConnectionState(WebSocketConnectionState.FAILED);
    };
    
    // Manejar cierre de conexión
    ws.onclose = (event) => {
      console.warn(`WebSocket cerrado: ${event.code} - ${event.reason}`);
      setConnectionState(WebSocketConnectionState.DISCONNECTED);
      
      // Intentar reconectar si el cierre no fue intencional
      if (!event.wasClean && reconnectAttemptsRef.current < maxReconnectAttempts) {
        setConnectionState(WebSocketConnectionState.RECONNECTING);
        reconnectAttemptsRef.current += 1;
        
        setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    };
    
    // Guardar referencia
    wsRef.current = ws;
    
  }, [token, reconnectDelay, maxReconnectAttempts, filterTypes]);
  
  // Función para desconectar
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setConnectionState(WebSocketConnectionState.DISCONNECTED);
    }
  }, []);
  
  // Función para enviar mensaje
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket no conectado. No se puede enviar mensaje.');
    }
  }, []);
  
  // Función para limpiar mensajes
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);
  
  // Conectar al montar y desconectar al desmontar
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  return {
    messages,
    connectionState,
    connect,
    disconnect,
    sendMessage,
    clearMessages
  };
}

/**
 * Hook para filtrar mensajes WebSocket por tipo
 * 
 * @param messages Lista completa de mensajes
 * @param type Tipo de mensaje a filtrar
 * @returns Lista filtrada de mensajes
 */
export function useWebSocketMessagesByType<T = any>(
  messages: WebSocketMessage[],
  type: WebSocketMessageType
): WebSocketMessage<T>[] {
  return messages.filter(message => message.type === type) as WebSocketMessage<T>[];
}

/**
 * Cliente WebSocket standalone (sin React)
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private reconnectDelay: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private listeners: Map<WebSocketMessageType, Function[]> = new Map();
  private connectionStateListeners: Function[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  constructor(options: WebSocketOptions = {}) {
    const {
      token,
      reconnectDelay = 2000,
      maxReconnectAttempts = 5
    } = options;
    
    this.url = WS_BASE_URL;
    this.token = token;
    this.reconnectDelay = reconnectDelay;
    this.maxReconnectAttempts = maxReconnectAttempts;
  }
  
  /**
   * Conectar al WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.setConnectionState(WebSocketConnectionState.CONNECTING);
    
    // Construir URL con token de autenticación si existe
    let wsUrl = this.url;
    if (this.token) {
      wsUrl += `?token=${this.token}`;
    }
    
    // Crear nueva conexión WebSocket
    this.ws = new WebSocket(wsUrl);
    
    // Configurar handlers
    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onerror = this.handleError.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
  }
  
  /**
   * Desconectar del WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.setConnectionState(WebSocketConnectionState.DISCONNECTED);
    }
  }
  
  /**
   * Suscribirse a un tipo específico de mensaje
   */
  subscribe<T = any>(type: WebSocketMessageType, callback: (data: T) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    
    const listeners = this.listeners.get(type)!;
    listeners.push(callback);
    
    // Si ya estamos conectados, enviar solicitud de suscripción
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        types: [type]
      }));
    }
    
    // Devolver función para cancelar suscripción
    return () => {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Suscribirse a cambios en el estado de conexión
   */
  onConnectionStateChange(callback: (state: WebSocketConnectionState) => void): () => void {
    this.connectionStateListeners.push(callback);
    
    return () => {
      const index = this.connectionStateListeners.indexOf(callback);
      if (index !== -1) {
        this.connectionStateListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Enviar mensaje al WebSocket
   */
  sendMessage(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket no conectado. No se puede enviar mensaje.');
    }
  }
  
  /**
   * Manejador de evento de apertura
   */
  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.setConnectionState(WebSocketConnectionState.CONNECTED);
    
    // Enviar suscripciones activas
    const types = Array.from(this.listeners.keys());
    if (types.length > 0 && this.ws) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        types
      }));
    }
  }
  
  /**
   * Manejador de mensaje recibido
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // Verificar formato del mensaje
      if (!message.type || message.data === undefined) {
        console.error('Mensaje WebSocket inválido:', message);
        return;
      }
      
      // Notificar a los listeners del tipo específico
      const listeners = this.listeners.get(message.type as WebSocketMessageType);
      if (listeners) {
        listeners.forEach(callback => {
          try {
            callback(message.data);
          } catch (error) {
            console.error('Error en listener de WebSocket:', error);
          }
        });
      }
      
    } catch (error) {
      console.error('Error al procesar mensaje WebSocket:', error);
    }
  }
  
  /**
   * Manejador de error
   */
  private handleError(event: Event): void {
    console.error('Error de WebSocket:', event);
    this.setConnectionState(WebSocketConnectionState.FAILED);
  }
  
  /**
   * Manejador de cierre de conexión
   */
  private handleClose(event: CloseEvent): void {
    console.warn(`WebSocket cerrado: ${event.code} - ${event.reason}`);
    this.ws = null;
    this.setConnectionState(WebSocketConnectionState.DISCONNECTED);
    
    // Intentar reconectar si el cierre no fue intencional
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.setConnectionState(WebSocketConnectionState.RECONNECTING);
      this.reconnectAttempts++;
      
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    }
  }
  
  /**
   * Actualizar estado de conexión y notificar a los listeners
   */
  private setConnectionState(state: WebSocketConnectionState): void {
    this.connectionStateListeners.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('Error en listener de estado de conexión:', error);
      }
    });
  }
}
