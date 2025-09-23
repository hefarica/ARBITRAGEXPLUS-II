// app/api/proxy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { envJsonArray, firstFromArrayStr } from "@/lib/env-arr";

export const runtime = "nodejs";

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }

async function handle(req: NextRequest, method: "GET" | "POST") {
  // ARRAYS desde ENV
  const allowPaths = envJsonArray("ARX_PROXY_ALLOW_PATHS_JSON").filter(isNonEmptyString);
  const upstreams = envJsonArray("ARX_UPSTREAM_BASES_JSON").filter(isNonEmptyString);
  const rateRules = envJsonArray("ARX_RATE_LIMITS_JSON");
  const extraHeaders = envJsonArray("ARX_PROXY_EXTRA_HEADERS_JSON");

  // Sin arrays válidos → deny-all
  if (allowPaths.length === 0 || upstreams.length === 0) {
    return NextResponse.json({ error: "proxy_not_configured_arrays" }, { status: 503 });
  }

  // Rate limit token-bucket in-memory por IP (solo si hay regla)
  const rule = parseRateRule(rateRules);
  if (rule && !consumeToken(ipOf(req), rule)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const path = new URL(req.url).pathname.replace(/^\/api\/proxy/, "") || "/";
  if (!allowPaths.some(p => path === p || path.startsWith(p + "/"))) {
    return NextResponse.json({ error: "forbidden_path" }, { status: 403 });
  }

  // Elegimos el primer upstream válido del ARRAY (sin inventar)
  const upstream = firstFromArrayStr(upstreams)!;
  const target = new URL(upstream + path);
  target.search = new URL(req.url).search;

  const headers: Record<string,string> = { "Accept":"application/json" };
  for (const h of extraHeaders) {
    if (h && typeof h.key === "string" && typeof h.value === "string") headers[h.key] = h.value;
  }

  const init: RequestInit = {
    method,
    headers,
    body: method === "POST" ? await req.text() : undefined,
    cache: "no-store",
    redirect: "follow",
  };

  const res = await fetch(String(target), init);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return NextResponse.json({ error: "bad_upstream_type" }, { status: 502 });
  }

  const data = await res.json().catch(() => ({ error: "invalid_json_upstream" }));
  // El proxy NO transforma: solo pasa arrays tal cual
  return NextResponse.json(data, { status: res.status });
}

/* ===== Helpers (solo arrays / sin hardcodeos) ===== */

const RATE_BUCKET = new Map<string, { tokens:number; ts:number }>();

function parseRateRule(arr: unknown[]): { windowMs:number; tokens:number } | null {
  const obj = arr.find(
    (x:any) => x && typeof x.windowMs === "number" && typeof x.tokens === "number"
  ) as any;
  return obj ? { windowMs: obj.windowMs, tokens: obj.tokens } : null;
}

function consumeToken(key: string, rule: { windowMs:number; tokens:number }) {
  const now = Date.now();
  const st = RATE_BUCKET.get(key) ?? { tokens: rule.tokens, ts: now };
  const refill = Math.floor((now - st.ts) / rule.windowMs) * rule.tokens;
  st.tokens = Math.min(rule.tokens, st.tokens + Math.max(0, refill));
  st.ts = now;
  if (st.tokens <= 0) { RATE_BUCKET.set(key, st); return false; }
  st.tokens -= 1; RATE_BUCKET.set(key, st); return true;
}

function ipOf(req: NextRequest): string {
  return req.ip || req.headers.get("x-forwarded-for") || "unknown";
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}
