import { AlertWebSocketServer } from './websocket';

let wsServerInstance: AlertWebSocketServer | null = null;

export function setWebSocketServer(instance: AlertWebSocketServer) {
  wsServerInstance = instance;
}

export function getWebSocketServer(): AlertWebSocketServer | null {
  return wsServerInstance;
}
