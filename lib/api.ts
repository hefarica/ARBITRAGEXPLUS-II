/**
 * API client para ARBITRAGEX SUPREME V3.6
 * 
 * Este módulo proporciona funciones para comunicarse con la API del backend a través
 * de los Workers de Cloudflare, implementando las reglas de validación de datos reales.
 */

import { ValidationError } from "./errors";

// URL base para las solicitudes a la API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const CF_BASE_URL = process.env.NEXT_PUBLIC_CF_URL || "";

/**
 * Interfaz para las opciones de las solicitudes fetch
 */
interface FetchOptions extends RequestInit {
  token?: string;
  params?: Record<string, string>;
  validateData?: boolean;
}

/**
 * Validador de datos para asegurar que las respuestas son reales
 */
function isValidData(data: any): boolean {
  // Si es un array, validar cada elemento
  if (Array.isArray(data)) {
    return data.length === 0 || data.every(item => item !== null && typeof item === 'object');
  }
  
  // Si es un objeto, verificar que no esté vacío
  if (data && typeof data === 'object') {
    return Object.keys(data).length > 0;
  }
  
  return false;
}

/**
 * Función para realizar peticiones HTTP con validación y manejo de errores
 */
async function fetchWithValidation(url: string, options: FetchOptions = {}): Promise<Response> {
  const { params, token, validateData = true, ...fetchOptions } = options;
  
  // Construir URL con parámetros de consulta si existen
  let fullUrl = url;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      fullUrl += `?${queryString}`;
    }
  }
  
  // Configurar headers
  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Realizar la petición
  const response = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
  });
  
  // Verificar si la respuesta es exitosa
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
  }
  
  return response;
}

/**
 * GET request genérico con validación de datos
 */
export async function apiGet<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const baseUrl = path.startsWith('/cf') ? CF_BASE_URL : API_BASE_URL;
  const url = `${baseUrl}${path}`;
  
  const response = await fetchWithValidation(url, {
    ...options,
    method: 'GET',
  });
  
  const data = await response.json();
  
  // Validar que los datos son reales si se requiere
  if (options.validateData !== false && !isValidData(data)) {
    throw new ValidationError('Los datos recibidos no parecen válidos');
  }
  
  return data as T;
}

/**
 * POST request genérico
 */
export async function apiPost<T>(path: string, body: any, options: FetchOptions = {}): Promise<T> {
  const baseUrl = path.startsWith('/cf') ? CF_BASE_URL : API_BASE_URL;
  const url = `${baseUrl}${path}`;
  
  const response = await fetchWithValidation(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  
  // Validar que los datos son reales si se requiere
  if (options.validateData !== false && !isValidData(data)) {
    throw new ValidationError('Los datos recibidos no parecen válidos');
  }
  
  return data as T;
}

/**
 * PUT request genérico
 */
export async function apiPut<T>(path: string, body: any, options: FetchOptions = {}): Promise<T> {
  const baseUrl = path.startsWith('/cf') ? CF_BASE_URL : API_BASE_URL;
  const url = `${baseUrl}${path}`;
  
  const response = await fetchWithValidation(url, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  
  // Validar que los datos son reales si se requiere
  if (options.validateData !== false && !isValidData(data)) {
    throw new ValidationError('Los datos recibidos no parecen válidos');
  }
  
  return data as T;
}

/**
 * DELETE request genérico
 */
export async function apiDelete<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const baseUrl = path.startsWith('/cf') ? CF_BASE_URL : API_BASE_URL;
  const url = `${baseUrl}${path}`;
  
  const response = await fetchWithValidation(url, {
    ...options,
    method: 'DELETE',
  });
  
  const data = await response.json();
  
  // Validar que los datos son reales si se requiere
  if (options.validateData !== false && !isValidData(data)) {
    throw new ValidationError('Los datos recibidos no parecen válidos');
  }
  
  return data as T;
}

/**
 * Función para verificar si el backend está en línea
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    return response.ok;
  } catch (error) {
    console.error('Error checking backend health:', error);
    return false;
  }
}

/**
 * Función para obtener la versión del backend
 */
export async function getApiVersion(): Promise<string> {
  try {
    const data = await apiGet<{ version: string }>('/api/version');
    return data.version;
  } catch (error) {
    console.error('Error fetching API version:', error);
    return 'unknown';
  }
}
