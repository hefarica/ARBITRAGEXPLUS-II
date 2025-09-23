// lib/api-arrays.ts
import axios, { AxiosError } from "axios";
import { z } from "zod";
import { OpportunitySchema, AssetSafetySchema, ExecutionSchema } from "./schemas";

const instance = axios.create({
  baseURL: "/api/proxy",            // SOLO proxy interno
  timeout: 12_000,
  validateStatus: (s) => s >= 200 && s < 300,
});

instance.interceptors.response.use(undefined, async (err: AxiosError) => {
  const cfg: any = err.config || {};
  if (cfg.__retryCount >= 2) throw err;
  cfg.__retryCount = (cfg.__retryCount ?? 0) + 1;
  const delay = 300 * Math.pow(2, cfg.__retryCount) + Math.random()*200;
  await new Promise(r => setTimeout(r, delay));
  return instance(cfg);
});

const forbidMock = (payload: unknown) => {
  const s = JSON.stringify(payload ?? "").toLowerCase();
  const banned = ["mock","simulated","dummy","placeholder","fake_data","hardcode"];
  if (banned.some(k => s.includes(k))) throw new Error("Mock/Simulated data detected.");
};

export async function fetchOpportunities() {
  const { data } = await instance.get("/opportunities");
  forbidMock(data);
  // Debe ser ARRAY
  const arr = z.array(OpportunitySchema);
  return arr.parse(data);
}

export async function fetchAssetSafetyMany(addresses: string[]) {
  // Multi-get vía array de params
  const { data } = await instance.post("/asset-safety", { addresses });
  forbidMock(data);
  const arr = z.array(AssetSafetySchema);
  return arr.parse(data);
}

export async function fetchExecutions() {
  const { data } = await instance.get("/executions");
  forbidMock(data);
  const arr = z.array(ExecutionSchema);
  return arr.parse(data);
}

export async function postConfigPreset(name: string, jsonArr: unknown[]) {
  // Solo arrays para presets
  const { data } = await instance.post(`/config/presets/${encodeURIComponent(name)}` , jsonArr);
  forbidMock(data);
  // Permite que el backend responda array de confirmaciones
  return z.array(z.any()).parse(data);
}
