import { z, ZodError, ZodSchema } from 'zod';
import { ValidationError } from './response';

export function validateRequest<T>(
  schema: ZodSchema<T>,
  data: unknown
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(
        'Invalid request data',
        formatZodError(error)
      );
    }
    throw error;
  }
}

export async function validateRequestAsync<T>(
  schema: ZodSchema<T>,
  data: unknown
): Promise<T> {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(
        'Invalid request data',
        formatZodError(error)
      );
    }
    throw error;
  }
}

export function validatePartial<T>(
  schema: ZodSchema<T>,
  data: unknown
): Partial<T> {
  const partialSchema = schema.partial();
  return validateRequest(partialSchema, data);
}

export function isValid<T>(
  schema: ZodSchema<T>,
  data: unknown
): data is T {
  try {
    schema.parse(data);
    return true;
  } catch {
    return false;
  }
}

function formatZodError(error: ZodError): any {
  const formatted: Record<string, string[]> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(err.message);
  });
  
  return {
    fields: formatted,
    issues: error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
    })),
  };
}

export const commonSchemas = {
  uuid: z.string().uuid(),
  
  email: z.string().email(),
  
  url: z.string().url(),
  
  ethereumAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  
  chainId: z.number().int().positive(),
  
  timestamp: z.number().int().positive(),
  
  bigNumber: z.string().regex(/^\d+$/),
  
  percentage: z.number().min(0).max(100),
  
  pagination: z.object({
    page: z.string().default('1').transform(Number),
    limit: z.string().default('20').transform(Number),
    sortBy: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
  
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
  
  apiKey: z.string().min(32),
  
  jwtToken: z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/),
};

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s\-\.@]/g, '');
}

export function validateEthereumAddress(address: string): boolean {
  if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return false;
  }
  
  const addressLowerCase = address.toLowerCase();
  
  if (address === addressLowerCase || address === address.toUpperCase()) {
    return true;
  }
  
  return validateEthereumChecksum(address);
}

function validateEthereumChecksum(address: string): boolean {
  try {
    const addressHash = keccak256(address.slice(2).toLowerCase());
    
    for (let i = 0; i < 40; i++) {
      const char = address[i + 2];
      const hashChar = addressHash[i];
      
      if (
        (parseInt(hashChar, 16) >= 8 && char !== char.toUpperCase()) ||
        (parseInt(hashChar, 16) < 8 && char !== char.toLowerCase())
      ) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

function keccak256(input: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = crypto.subtle.digest('SHA-256', data);
  
  return Array.from(new Uint8Array(hashBuffer as any))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function validateTransactionHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export function validateChainId(chainId: number): boolean {
  const validChainIds = [1, 5, 10, 56, 137, 42161, 43114];
  return validChainIds.includes(chainId);
}

export function validateBigNumber(value: string): boolean {
  try {
    const num = BigInt(value);
    return num >= 0n;
  } catch {
    return false;
  }
}

export function validateSlippage(slippage: number): boolean {
  return slippage >= 0 && slippage <= 100;
}

export function validateGasPrice(gasPrice: string): boolean {
  try {
    const price = BigInt(gasPrice);
    return price > 0n && price <= 10000000000000n;
  } catch {
    return false;
  }
}

export const requestValidators = {
  opportunity: z.object({
    chainId: commonSchemas.chainId,
    dexIn: z.string().min(1),
    dexOut: z.string().min(1),
    baseToken: commonSchemas.ethereumAddress,
    quoteToken: commonSchemas.ethereumAddress,
    amountIn: commonSchemas.bigNumber,
    estProfitUsd: z.number().positive(),
    gasUsd: z.number().positive(),
  }),
  
  execution: z.object({
    opportunityId: commonSchemas.uuid,
    chainId: commonSchemas.chainId,
    estimatedProfit: z.number().positive(),
    estimatedGas: z.number().positive(),
    strategy: z.string().min(1),
    params: z.record(z.any()),
  }),
  
  assetCheck: z.object({
    addresses: z.array(commonSchemas.ethereumAddress).min(1).max(100),
    chainId: commonSchemas.chainId.optional(),
  }),
  
  configUpdate: z.object({
    version: z.string(),
    mode: z.enum(['development', 'staging', 'production']),
    chains: z.record(z.any()),
    strategies: z.record(z.any()),
    risk: z.record(z.any()),
    execution: z.record(z.any()),
    monitoring: z.record(z.any()),
  }),
};

export class InputValidator {
  private schema: ZodSchema;
  
  constructor(schema: ZodSchema) {
    this.schema = schema;
  }
  
  validate(data: unknown): any {
    return validateRequest(this.schema, data);
  }
  
  async validateAsync(data: unknown): Promise<any> {
    return validateRequestAsync(this.schema, data);
  }
  
  isValid(data: unknown): boolean {
    return isValid(this.schema, data);
  }
  
  partial(data: unknown): any {
    return validatePartial(this.schema, data);
  }
}