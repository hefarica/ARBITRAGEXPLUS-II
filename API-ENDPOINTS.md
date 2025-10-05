# ArbitrageX Supreme V3.6 - API Endpoints Reference

## 🎯 Sistema de Configuración Dinámica

**Frontend → Database → RUST Engine** con auto-reload en tiempo real.

Todos los endpoints marcados con ✨ **AUTO-RELOAD** actualizan automáticamente el archivo `mev-scan-config.json` y reinician el motor RUST MEV.

---

## 🔗 Chains Management

### POST /api/engine/addChain ✨
Agrega nueva blockchain con RPCs y DEXs.

**Request:**
```json
{
  "name": "Ethereum",
  "chainId": 1,
  "evm": true,
  "metamask": { "chainName": "Ethereum Mainnet", "nativeCurrency": {...} },
  "rpcPool": ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"],
  "dexes": ["uniswap-v2", "uniswap-v3", "sushiswap"]
}
```

**Response:**
```json
{
  "success": true,
  "chain": { "chainId": 1, "name": "Ethereum", ... },
  "message": "Chain added successfully"
}
```

---

### POST /api/engine/updateChain ✨
Actualiza configuración de blockchain existente.

**Request:**
```json
{
  "chainId": 1,
  "name": "Ethereum Mainnet",
  "rpcPool": ["https://new-rpc.com"],
  "dexes": ["pancakeswap-v2"]
}
```

---

### POST /api/engine/removeChain ✨
Elimina blockchain completa (cascade: RPCs, DEXs, Assets, Pairs).

**Request:**
```json
{
  "chainId": 1
}
```

---

### POST /api/engine/chains/toggle ✨
Activa o desactiva blockchain (mantiene datos pero no exporta al RUST engine).

**Request:**
```json
{
  "chainId": 1,
  "isActive": false
}
```

---

## 🏪 DEXs Management

### POST /api/engine/addDex ✨
Agrega DEX a blockchain específica.

**Request:**
```json
{
  "chainId": 56,
  "dex": "pancakeswap-v2"
}
```

---

### POST /api/engine/removeDex ✨
Remueve DEX de blockchain.

**Request:**
```json
{
  "chainId": 56,
  "dex": "pancakeswap-v2"
}
```

---

### POST /api/engine/dexes/add ✨
Agrega múltiples DEXs a blockchain (bulk operation).

**Request:**
```json
{
  "chainId": 56,
  "dexes": ["pancakeswap-v2", "biswap", "uniswap-v3"]
}
```

---

### GET /api/engine/dexes/suggest/:chainId
Sugiere top DEXs por TVL usando DeFi Llama API.

**Response:**
```json
{
  "suggestions": [
    { "name": "PancakeSwap", "tvl": 2500000000 },
    { "name": "Uniswap V3", "tvl": 1800000000 }
  ]
}
```

---

## 💎 Assets Management

### POST /api/engine/assets/upsert ✨
Bulk upsert de assets (tokens).

**Request:**
```json
{
  "assets": [
    {
      "chainId": 1,
      "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "symbol": "WETH",
      "decimals": 18,
      "name": "Wrapped Ether"
    },
    {
      "chainId": 1,
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "decimals": 6,
      "name": "USD Coin"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "inserted": 2,
  "message": "Assets upserted successfully and config reloaded"
}
```

---

### POST /api/engine/assets/risk
Actualiza risk scoring de assets (Anti-Rugpull system).

**Request:**
```json
{
  "assets": [
    {
      "chainId": 1,
      "address": "0x...",
      "riskScore": 85,
      "riskFlags": ["low_liquidity", "honeypot_risk"]
    }
  ]
}
```

---

### POST /api/engine/assets/scan
Escanea assets con GoPlus Security API (automated rugpull detection).

**Request:**
```json
{
  "chainId": 1,
  "addresses": ["0x...", "0x..."]
}
```

**Response:**
```json
{
  "success": true,
  "scanned": 2,
  "results": [
    {
      "address": "0x...",
      "riskScore": 92,
      "flags": [],
      "honeypot": false
    }
  ]
}
```

---

### GET /api/engine/assets
Query assets con filtros opcionales.

**Query Params:**
- `chain` - Filter by chainId
- `min_score` - Minimum risk score (0-100)
- `flags_exclude` - Comma-separated flags to exclude

**Response:**
```json
{
  "assets": [
    {
      "chainId": 1,
      "address": "0x...",
      "symbol": "WETH",
      "riskScore": 95,
      "riskFlags": []
    }
  ]
}
```

---

## 🔄 Pairs Management

### POST /api/engine/pairs/generate ✨
Genera pares automáticamente desde safe assets (bluechips × stablecoins).

**Request:**
```json
{
  "chainId": 1,
  "policy_key": "default_risk"
}
```

**Response:**
```json
{
  "success": true,
  "generated": 12,
  "pairs": [
    { "chainId": 1, "base": "WETH", "quote": "USDC" },
    { "chainId": 1, "base": "WETH", "quote": "USDT" }
  ],
  "message": "Pairs generated and config reloaded"
}
```

---

### POST /api/engine/pairs/upsert ✨
Upsert manual de pares con validación opcional.

**Request:**
```json
{
  "pairs": [
    {
      "chainId": 56,
      "base": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      "quote": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      "pairAddr": "0x...",
      "enabled": true
    }
  ],
  "skipValidation": false
}
```

**Response:**
```json
{
  "success": true,
  "upserted": 1,
  "message": "Pairs upserted successfully and config reloaded"
}
```

---

### POST /api/engine/pairs/validate
Valida pool address antes de guardar (DexScreener + GeckoTerminal).

**Request:**
```json
{
  "chainId": 1,
  "poolAddress": "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  "baseTokenAddress": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "quoteTokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
}
```

**Response:**
```json
{
  "isValid": true,
  "dexId": "uniswap-v3",
  "liquidity": 73711540.19,
  "volume24h": 150000000,
  "source": "dexscreener",
  "warnings": []
}
```

---

### POST /api/engine/pairs/find
Encuentra pool addresses correctos para un par de tokens.

**Request:**
```json
{
  "chainId": 1,
  "baseTokenAddress": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "quoteTokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "minLiquidity": 1000
}
```

**Response:**
```json
{
  "success": true,
  "pools": [
    {
      "dexId": "uniswap-v3",
      "poolAddress": "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
      "liquidity": 73711540.19
    }
  ],
  "count": 3
}
```

---

## ⚙️ Policies Management

### GET /api/engine/policies
Obtiene todas las políticas del sistema.

**Response:**
```json
{
  "default_risk": {
    "min_risk_score": 70,
    "exclude_flags": ["honeypot_risk", "low_liquidity"]
  },
  "min_profit": {
    "threshold_usd": 50,
    "roi_percent": 2.5
  }
}
```

---

### POST /api/engine/policies/upsert ✨
Actualiza o crea política de sistema.

**Request:**
```json
{
  "key": "min_profit",
  "value": {
    "threshold_usd": 100,
    "roi_percent": 3.0
  },
  "description": "Minimum profit requirements for arbitrage execution"
}
```

---

## 🔧 Engine Configuration

### POST /api/engine/config/export ✨
**Trigger manual** de export y reload del motor RUST MEV.

**Request:** `{}`

**Response:**
```json
{
  "success": true,
  "message": "Configuration exported and MEV engine reloaded successfully",
  "stats": {
    "totalChains": 2,
    "totalDexs": 9,
    "totalPairs": 12
  }
}
```

**Uso:** Llama este endpoint desde frontend para forzar actualización cuando sea necesario.

---

## 📊 Performance & Monitoring

### GET /api/engine/perf
Obtiene métricas de performance (p50/p90/p99).

**Response:**
```json
{
  "scan_ns": {
    "p50": 15000000,
    "p90": 25000000,
    "p99": 45000000
  },
  "opp_eval_ns": {
    "p50": 10000000,
    "p90": 18000000,
    "p99": 32000000
  },
  "total_rpcs": 15,
  "active_rpcs": 12
}
```

---

### POST /api/engine/rpcs/healthcheck
Chequea salud y latencia de todos los RPCs.

**Request:**
```json
{
  "chainId": 1,
  "timeout": 5000
}
```

**Response:**
```json
{
  "total": 5,
  "healthy": 4,
  "unhealthy": 1,
  "rpcs": [
    {
      "url": "https://eth.llamarpc.com",
      "isHealthy": true,
      "latencyMs": 45,
      "blockNumber": 18500000
    }
  ]
}
```

---

## 🎯 Canonical Token System

**File:** `server/canonical-tokens.ts`

Direcciones canónicas por chain (NO símbolos) para evitar ambigüedades:

```typescript
CANONICAL_TOKENS = {
  1: {  // Ethereum
    WNATIVE: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
    USDC: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],  // USDC nativo
    USDT: ["0xdAC17F958D2ee523a2206206994597C13D831ec7"]
  },
  56: {  // Binance Smart Chain
    WNATIVE: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",  // WBNB
    USDC: ["0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"],
    USDT: ["0x55d398326f99059fF775485246999027B3197955"]
  },
  10: {  // Optimism
    WNATIVE: "0x4200000000000000000000000000000000000006",  // WETH
    USDC: [
      "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",  // USDC.e bridged
      "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"   // USDC nativo
    ],
    USDT: ["0x94b008aA00579c1307B0EF2c499aD98a8ce58e58"]
  }
}
```

**Función de Quote-Specific Filtering:**
- WETH/USDC → busca solo variantes USDC (`canonicalTokens.USDC`)
- WETH/USDT → busca solo variantes USDT (`canonicalTokens.USDT`)
- Evita mezclar pools USDC con USDT

---

## 📈 Current System Status

**Configuration Actual (Verificada):**
```
Total Chains: 9 (2 active)
Total DEXs: 12
Total Unique Pools: 12

Binance (Chain 56):
  - 7 pools WBNB/USDC
    - 3 PancakeSwap (diferentes fee tiers)
    - 1 Biswap
    - 3 Uniswap V3 (fee tiers: 0.05%, 0.3%, 1%)

Ethereum (Chain 1):
  - 5 pools
    - 2 WETH/USDC @ Uniswap (fee tiers diferentes)
    - 3 WETH/USDT @ Uniswap (fee tiers diferentes)
```

**Motor RUST MEV Engine Status:**
- ✅ Escanea 12 pares únicos correctamente
- ✅ Intervalo: 10 segundos
- ✅ Auto-reload funcionando
- ✅ Latencia objetivo: <250ms

---

## 🚀 Next Steps para Expansión

### Para agregar más pares:

1. **Agregar Assets:**
```bash
POST /api/engine/assets/upsert
{
  "assets": [
    { "chainId": 1, "address": "0x...", "symbol": "DAI", ... }
  ]
}
```

2. **Generar Pares Automáticamente:**
```bash
POST /api/engine/pairs/generate
{ "chainId": 1 }
```

3. **El sistema automáticamente:**
   - ✅ Descubre pools por dirección (DexScreener)
   - ✅ Valida liquidez y volumen
   - ✅ Exporta a `mev-scan-config.json`
   - ✅ Reinicia motor RUST MEV
   - ✅ Comienza escaneo inmediato

### Para agregar más chains:

1. **Actualizar `canonical-tokens.ts`** con addresses de la nueva chain
2. **Agregar chain vía API:**
```bash
POST /api/engine/addChain
{
  "name": "Polygon",
  "chainId": 137,
  "rpcPool": ["https://polygon-rpc.com"],
  "dexes": ["quickswap", "sushiswap"]
}
```
3. **Agregar assets y generar pares**

---

**Todas las operaciones son idempotentes y seguras para ejecutar múltiples veces.**
