import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import * as api from "../lib/api-arrays";

vi.mock("axios", () => {
  const m = {
    create: () => ({
      get: vi.fn(),
      post: vi.fn(),
      interceptors: { response: { use: () => {} } },
    }),
  };
  return { default: m };
});

describe("Arrays-only policy", () => {
  it("rechaza objetos sueltos (no arrays) en /opportunities", async () => {
    const inst = (axios as any).default.create();
    inst.get.mockResolvedValueOnce({ data: { not: "an array" }, status: 200 });
    await expect(api.fetchOpportunities()).rejects.toBeTruthy();
  });

  it("acepta arrays válidos", async () => {
    const inst = (axios as any).default.create();
    inst.get.mockResolvedValueOnce({
      data: [{
        id:"x", chainId:1, dexIn:"A", dexOut:"B",
        baseToken:"0x".padEnd(42,'0'), quoteToken:"0x".padEnd(42,'0'),
        amountIn:"1.0", estProfitUsd:1, gasUsd:0.1, ts: Date.now()
      }],
      status: 200
    });
    const res = await api.fetchOpportunities();
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(1);
  });

  it("bloquea 'mock' en payload", async () => {
    const inst = (axios as any).default.create();
    inst.get.mockResolvedValueOnce({
      data: [{ id:"1", chainId:1, dexIn:"a", dexOut:"b", baseToken:"0x".padEnd(42,'0'), quoteToken:"0x".padEnd(42,'0'), amountIn:"1", estProfitUsd:1, gasUsd:0.1, ts: Date.now(), __mock:true }],
      status: 200
    });
    await expect(api.fetchOpportunities()).rejects.toThrow(/Mock\/Simulated/);
  });
});
