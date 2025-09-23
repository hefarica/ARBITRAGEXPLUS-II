// lib/env-arr.ts
export function envJsonArray(name: string): unknown[] {
  try {
    const raw = process.env[name];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function firstFromArrayStr(arr: unknown[]): string | undefined {
  // Devuelve el primer string válido del array (sin inventar nada)
  const s = arr.find((x) => typeof x === "string" && x.length > 0);
  return s as string | undefined;
}
