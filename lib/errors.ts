/**
 * Definiciones de errores para ARBITRAGEX SUPREME V3.6
 * 
 * Este archivo contiene clases de error personalizadas para manejar
 * diferentes tipos de errores en la aplicación.
 */

/**
 * Error básico de la aplicación del que extienden los demás
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error para datos inválidos o que no cumplen con requisitos de validación
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error para cuando la API no está disponible
 */
export class ApiUnavailableError extends AppError {
  constructor(message: string = 'API no disponible') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

/**
 * Error para cuando hay un problema de autenticación
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Error de autenticación') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error para cuando hay un problema de autorización
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'No tienes permisos para realizar esta acción') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Error para problemas con blockchain o transacciones
 */
export class BlockchainError extends AppError {
  public txHash?: string;
  
  constructor(message: string, txHash?: string) {
    super(message);
    this.name = 'BlockchainError';
    this.txHash = txHash;
  }
}

/**
 * Error para problemas con flash loans
 */
export class FlashLoanError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'FlashLoanError';
  }
}

/**
 * Error para problemas con RPC o nodos
 */
export class RpcError extends AppError {
  public rpcUrl?: string;
  
  constructor(message: string, rpcUrl?: string) {
    super(message);
    this.name = 'RpcError';
    this.rpcUrl = rpcUrl;
  }
}

/**
 * Error para activos que no cumplen con los requisitos de seguridad
 */
export class AssetSecurityError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'AssetSecurityError';
  }
}

/**
 * Tipo para manejar errores en componentes async
 */
export type AsyncErrorHandler = (error: Error) => void;

/**
 * Función para determinar el mensaje de error según su tipo
 * @param error Error capturado
 * @returns Mensaje de error formateado para mostrar al usuario
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error instanceof ValidationError) {
      return `Error de validación: ${error.message}`;
    } else if (error instanceof ApiUnavailableError) {
      return `Servicio no disponible: ${error.message}`;
    } else if (error instanceof AuthenticationError) {
      return `Error de autenticación: ${error.message}`;
    } else if (error instanceof AuthorizationError) {
      return `Error de autorización: ${error.message}`;
    } else if (error instanceof BlockchainError) {
      return `Error blockchain: ${error.message}`;
    } else if (error instanceof FlashLoanError) {
      return `Error de flash loan: ${error.message}`;
    } else if (error instanceof RpcError) {
      return `Error de RPC: ${error.message}`;
    } else if (error instanceof AssetSecurityError) {
      return `Error de seguridad de activo: ${error.message}`;
    }
    return error.message;
  }
  return String(error);
}
