import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function successResponse(
  c: Context,
  data: any,
  statusCode: number = 200,
  headers: Record<string, string> = {}
) {
  const response = {
    success: true,
    data,
    timestamp: Date.now(),
  };
  
  Object.entries(headers).forEach(([key, value]) => {
    c.header(key, value);
  });
  
  return c.json(response, statusCode);
}

export function errorResponse(
  c: Context,
  error: Error | string | unknown,
  statusCode: number = 500,
  headers: Record<string, string> = {}
) {
  const response = {
    success: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
      code: getErrorCode(error),
      details: getErrorDetails(error),
    },
    timestamp: Date.now(),
  };
  
  Object.entries(headers).forEach(([key, value]) => {
    c.header(key, value);
  });
  
  return c.json(response, statusCode);
}

export function errorHandler(err: Error, c: Context) {
  console.error('Error occurred:', err);
  
  if (err instanceof HTTPException) {
    const response = err.getResponse();
    
    return c.json({
      success: false,
      error: {
        message: err.message,
        code: `HTTP_${response.status}`,
        details: response.body,
      },
      timestamp: Date.now(),
    }, response.status);
  }
  
  if (err.name === 'ValidationError') {
    return errorResponse(c, err, 400);
  }
  
  if (err.name === 'UnauthorizedError') {
    return errorResponse(c, err, 401);
  }
  
  if (err.name === 'ForbiddenError') {
    return errorResponse(c, err, 403);
  }
  
  if (err.name === 'NotFoundError') {
    return errorResponse(c, err, 404);
  }
  
  if (err.name === 'ConflictError') {
    return errorResponse(c, err, 409);
  }
  
  if (err.name === 'RateLimitError') {
    return errorResponse(c, err, 429);
  }
  
  return errorResponse(c, err, 500);
}

export function notFoundHandler(c: Context) {
  return c.json({
    success: false,
    error: {
      message: 'Resource not found',
      code: 'NOT_FOUND',
      path: c.req.path,
    },
    timestamp: Date.now(),
  }, 404);
}

export function paginatedResponse(
  c: Context,
  data: any[],
  pagination: {
    page: number;
    limit: number;
    total: number;
  },
  metadata: Record<string, any> = {}
) {
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const hasNext = pagination.page < totalPages;
  const hasPrev = pagination.page > 1;
  
  return successResponse(c, {
    items: data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages,
      hasNext,
      hasPrev,
    },
    metadata: {
      ...metadata,
      timestamp: Date.now(),
    },
  });
}

export function streamResponse(
  c: Context,
  generator: AsyncGenerator<any>,
  options: {
    contentType?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  c.header('Content-Type', options.contentType || 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      c.header(key, value);
    });
  }
  
  (async () => {
    try {
      for await (const chunk of generator) {
        const message = `data: ${JSON.stringify(chunk)}\n\n`;
        await writer.write(encoder.encode(message));
      }
    } catch (error) {
      const errorMessage = `data: ${JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Stream error',
      })}\n\n`;
      await writer.write(encoder.encode(errorMessage));
    } finally {
      await writer.close();
    }
  })();
  
  return new Response(readable, {
    headers: c.header(),
  });
}

export function redirectResponse(
  c: Context,
  url: string,
  permanent: boolean = false
) {
  return c.redirect(url, permanent ? 301 : 302);
}

export function fileResponse(
  c: Context,
  data: ArrayBuffer | string,
  filename: string,
  contentType: string = 'application/octet-stream'
) {
  c.header('Content-Type', contentType);
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  
  return c.body(data);
}

export function csvResponse(
  c: Context,
  data: any[],
  filename: string = 'export.csv'
) {
  const csv = arrayToCsv(data);
  return fileResponse(c, csv, filename, 'text/csv');
}

export function jsonLinesResponse(
  c: Context,
  data: any[],
  filename: string = 'export.jsonl'
) {
  const jsonLines = data.map(item => JSON.stringify(item)).join('\n');
  return fileResponse(c, jsonLines, filename, 'application/x-ndjson');
}

function getErrorCode(error: any): string {
  if (error instanceof Error) {
    if ('code' in error) {
      return String(error.code);
    }
    return error.name || 'UNKNOWN_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

function getErrorDetails(error: any): any {
  if (error instanceof Error) {
    if ('details' in error) {
      return error.details;
    }
    if ('cause' in error) {
      return error.cause;
    }
  }
  return null;
}

function arrayToCsv(data: any[]): string {
  if (data.length === 0) {
    return '';
  }
  
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        
        if (value === null || value === undefined) {
          return '';
        }
        
        const stringValue = String(value);
        
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
      }).join(',')
    ),
  ].join('\n');
  
  return csv;
}

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details?: any;
  
  constructor(message: string, code: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(message, 'UNAUTHORIZED', 401, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(message, 'FORBIDDEN', 403, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Not found', details?: any) {
    super(message, 'NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Conflict', details?: any) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Too many requests', details?: any) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details);
    this.name = 'RateLimitError';
  }
}