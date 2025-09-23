// lib/schemas.ts
import { z } from "zod";

export const OpportunitySchema = z.object({
  id: z.string().min(1),
  chainId: z.number().int().nonnegative(),
  dexIn: z.string().min(1),
  dexOut: z.string().min(1),
  baseToken: z.string().toLowerCase().regex(/^0x[a-f0-9]{40}$/),
  quoteToken: z.string().toLowerCase().regex(/^0x[a-f0-9]{40}$/),
  amountIn: z.string().regex(/^\d+(\.\d+)?$/),
  estProfitUsd: z.number(),
  gasUsd: z.number(),
  ts: z.number().int(),
});

export const AssetSafetySchema = z.object({
  address: z.string().toLowerCase().regex(/^0x[a-f0-9]{40}$/),
  score: z.number().min(0).max(100),
  checks: z.array(z.object({
    id: z.string().min(1),
    passed: z.boolean(),
    weight: z.number().min(0).max(1),
    note: z.string().optional()
  })),
  updatedAt: z.number().int()
});

export const ExecutionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["PENDING","SENT","MINED","REVERTED","FAILED"]),
  txHash: z.string().toLowerCase().regex(/^0x[a-f0-9]{64}$/).optional(),
  chainId: z.number().int().nonnegative(),
  profitUsd: z.number().optional(),
  gasUsd: z.number().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type Opportunity = z.infer<typeof OpportunitySchema>;
export type AssetSafety = z.infer<typeof AssetSafetySchema>;
export type Execution = z.infer<typeof ExecutionSchema>;
