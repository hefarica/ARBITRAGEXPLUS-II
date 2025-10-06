# 🏗️ Arquitectura del Sistema MEV ArbitrageX Supreme V3.6

## 📋 Visión General

Sistema de arbitraje MEV multichain con **3 capas principales** que operan en conjunto para detectar, simular y ejecutar oportunidades de arbitraje en 100+ blockchains.

---

## 🎯 Arquitectura de 3 Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                      🌐 CAPA UI (Frontend)                       │
│                    Next.js 14 + React 18                         │
├─────────────────────────────────────────────────────────────────┤
│  • Dashboard en tiempo real                                      │
│  • Configuración dinámica (Chains, Assets, Pairs, Policies)     │
│  • Monitoreo de oportunidades 2-leg y 3-leg                      │
│  • Sistema de simulación (Dry-Run)                               │
│  • Anti-Rugpull (Asset Safety)                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ⚡ CAPA EDGE (Cloudflare)                       │
│              Workers + WebSocket Relay + CDN                     │
├─────────────────────────────────────────────────────────────────┤
│  • API Proxy con JWT                                             │
│  • Rate Limiting (100 req/min)                                   │
│  • DDoS Protection                                               │
│  • Real-time Pub/Sub                                             │
│  • Edge Caching                                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   🔧 CAPA CORE (Backend)                         │
│         Rust MEV Engine + Node.js APIs + PostgreSQL              │
├─────────────────────────────────────────────────────────────────┤
│  • Motor MEV en Rust (Bellman-Ford, Grid Optimizer)             │
│  • Node.js/Fastify APIs                                          │
│  • PostgreSQL (configuración dinámica)                           │
│  • Redis (caching)                                               │
│  • Smart Contracts                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Datos Completo

### 1️⃣ **Configuración Dinámica** (Frontend → DB → Rust Engine)

```
Usuario (Frontend)
    ↓
Configuración JSON Editor
    ↓
POST /api/engine/config
    ↓
PostgreSQL Database
    ↓
Auto-reload Trigger
    ↓
Rust MEV Engine restart
    ↓
Config cargada en memoria
```

### 2️⃣ **Detección de Oportunidades** (Scanner → Processor → UI)

```
Rust MEV Scanner (cada 5-10s)
    ↓
Escanea pools en chains activas
    ↓
Detecta diferencias de precio
    ↓
Calcula arbitraje (Bellman-Ford)
    ↓
Optimiza trade size (Grid Search)
    ↓
Valida con Number.isFinite()
    ↓
Envía a Dry-Run Processor
    ↓
Validación triple (datos reales)
    ↓
WebSocket → Frontend
    ↓
Dashboard actualizado en tiempo real
```

### 3️⃣ **Simulación (Dry-Run)** (Session → Execution → Stats)

```
Usuario crea sesión simulada
    ↓
POST /api/simulator/sessions
    ↓
Validación Number.isFinite()
    ↓
Sesión almacenada en memoria
    ↓
Oportunidades detectadas
    ↓
DryRunProcessor evalúa
    ↓
Ejecuta trade simulado
    ↓
Actualiza capital virtual
    ↓
Registra estadísticas (P&L)
    ↓
GET /api/simulator/stats
```

---

## 🗂️ Estructura de Archivos del Proyecto

```
arbitragex-supreme/
│
├── 📁 app/                          # Next.js App Router
│   ├── page.tsx                     # Dashboard principal
│   ├── asset-safety/                # Anti-Rugpull
│   ├── executions/                  # Historial trades
│   ├── config/                      # Editor JSON
│   └── admin/                       # Gestión chains/assets/pairs
│
├── 📁 server/                       # Backend Node.js
│   ├── server.ts                    # Express server principal
│   ├── arbitrage-scanner.ts         # Scanner MEV (Rust wrapper)
│   ├── dry-run-processor.ts         # Simulador de trades
│   ├── simulator-api.ts             # API sesiones simuladas
│   ├── log-monitor.ts               # Monitor de warnings ⭐ NUEVO
│   ├── engine-api.ts                # API configuración dinámica
│   └── __tests__/                   # Tests de validación ⭐ NUEVO
│       └── validation.test.js
│
├── 📁 shared/                       # Código compartido
│   └── schema.ts                    # Zod schemas (validación)
│
├── 📁 components/                   # Componentes React
│   ├── ui/                          # Componentes base (Radix UI)
│   ├── dashboard/                   # Componentes dashboard
│   └── admin/                       # Componentes admin
│
├── 📁 lib/                          # Utilidades
│   ├── api.ts                       # Cliente HTTP (axios)
│   └── utils.ts                     # Helpers
│
├── 📁 hooks/                        # React Hooks
│   ├── useOpportunities.ts          # TanStack Query
│   └── useSimulator.ts              # Estado simulador
│
├── 📁 mev-scanner-rs/               # Motor Rust MEV
│   ├── src/
│   │   ├── main.rs                  # Entry point
│   │   ├── scanner/                 # Estrategias scan
│   │   ├── arbitrage/               # Algoritmos (Bellman-Ford)
│   │   └── simulator/               # Simulador 2-leg/3-leg
│   └── Cargo.toml
│
└── 📁 public/                       # Assets estáticos
    └── config/
        └── mev-scanner-config.json  # Config Rust engine
```

---

## 🔐 Sistemas de Validación (3 Capas)

### ✅ **Capa 1: Validación en Scanner**
```typescript
// server/arbitrage-scanner.ts
if (!Number.isFinite(profit) || !Number.isFinite(gas)) {
  return null; // Skip silenciosamente
}
```

### ✅ **Capa 2: Validación en Processor**
```typescript
// server/dry-run-processor.ts
if (!Number.isFinite(opp.estProfitUsd)) {
  logMonitor.recordSkip('invalid_amount', opp.id);
  return; // Skip con log
}
```

### ✅ **Capa 3: Validación en API** ⭐ NUEVO
```typescript
// server/simulator-api.ts (líneas 43-70)
if (!Number.isFinite(startCapitalUsd) || startCapitalUsd <= 0) {
  return res.status(400).json({ 
    error: 'Invalid startCapitalUsd: must be positive finite number',
    value: startCapitalUsd 
  });
}
```

---

## 🔍 Sistema de Monitoreo ⭐ NUEVO

```
LogMonitor (EventEmitter)
    ↓
Registra skip por tipo:
  • incomplete_data
  • invalid_chain
  • invalid_amount
    ↓
Threshold alert (> 10 skips/min)
    ↓
Reporte periódico (cada 5 min)
    ↓
Endpoints de estadísticas:
  • GET /api/simulator/monitor/stats?minutes=10
  • POST /api/simulator/monitor/reset
```

---

## 🗄️ Base de Datos (PostgreSQL)

### Tablas Principales

```sql
chains              -- Blockchains configuradas
├── id (serial)
├── name
├── chain_id
└── is_active

rpcs                -- RPCs por chain
├── id
├── chain_id (FK)
└── url

dexes               -- DEXs por chain
├── id
├── chain_id (FK)
└── dex_id

assets              -- Tokens
├── id
├── chain_id (FK)
├── address
└── safety_score

pairs               -- Trading pairs
├── id
├── chain_id (FK)
├── base_token_addr
└── quote_token_addr

dry_run_sessions    -- Sesiones simuladas
├── id
├── name
├── start_capital_usd
└── current_capital_usd
```

---

## 🚀 Flujo de Ejecución en Tiempo Real

```
┌──────────────┐
│   Usuario    │
│   (Browser)  │
└──────┬───────┘
       │
       │ WebSocket
       ↓
┌──────────────────┐
│  Next.js Server  │
│  (Port 5000)     │
└────────┬─────────┘
         │
         │ REST API
         ↓
┌─────────────────────────┐
│   Express Backend       │
│   • /api/opportunities  │
│   • /api/simulator/*    │
│   • /api/engine/*       │
└────────┬────────────────┘
         │
         ├─→ PostgreSQL (config)
         │
         ├─→ Redis (cache)
         │
         └─→ Rust MEV Scanner
                  │
                  └─→ RPCs Blockchain
                       (BSC, ETH, Polygon...)
```

---

## 🎨 Tecnologías por Capa

### **Frontend (UI Layer)**
- Next.js 14 (App Router)
- React 18
- TypeScript
- TailwindCSS + Radix UI
- TanStack Query (estado servidor)
- Zod (validación runtime)

### **Edge Layer**
- Cloudflare Workers
- WebSocket relay
- JWT authentication
- Rate limiting

### **Backend (Core Layer)**
- **Rust**: MEV engine (Bellman-Ford, Grid Search)
- **Node.js**: Express APIs, WebSocket server
- **PostgreSQL**: Configuración dinámica
- **Redis**: Caching

---

## 📊 Métricas y KPIs

El sistema trackea:

- ✅ Oportunidades detectadas (2-leg, 3-leg)
- ✅ Profit estimado (USD)
- ✅ Gas cost (USD)
- ✅ ROI potencial
- ✅ Sesiones simuladas activas
- ✅ P&L por sesión
- ✅ Skip warnings (monitoreo) ⭐ NUEVO
- ✅ RPC health (latencia)

---

## 🔄 Ciclo de Vida de una Oportunidad

```
1. DETECCIÓN (Rust Scanner)
   ↓
2. VALIDACIÓN (Number.isFinite)
   ↓
3. PROCESAMIENTO (DryRunProcessor)
   ↓
4. SIMULACIÓN (si sesión activa)
   ↓
5. REGISTRO (stats + logs)
   ↓
6. VISUALIZACIÓN (WebSocket → UI)
```

---

## 🛡️ Seguridad

- ✅ JWT authentication (Cloudflare edge)
- ✅ Rate limiting (100 req/min)
- ✅ CSP headers
- ✅ Number.isFinite() validación (previene NaN/Infinity)
- ✅ Environment variables isolation
- ✅ No mock data en producción

---

## 📈 Escalabilidad

**Actual**: 1 chain (BSC), 6 pairs  
**Target**: 100+ chains, 10,000+ pairs

El sistema está diseñado para escalar horizontalmente mediante:
- Configuración 100% dinámica desde DB
- Auto-reload del motor Rust
- Caching en Redis
- CDN en Cloudflare
- Pool discovery automático

---

## 🔧 Comandos Principales

```bash
# Desarrollo
npm run dev              # Inicia Next.js + Express

# Testing
npm test                 # Ejecuta tests de validación

# Base de datos
npm run db:push          # Sincroniza schema Drizzle
npm run db:studio        # UI visual para DB

# Producción
npm run build            # Build optimizado
npm start                # Servidor producción
```

---

## 📝 Estado Actual del Sistema

### ✅ Completado
- Sistema de validación triple (scanner → processor → API)
- Monitoreo de logs con alertas automáticas
- Tests de validación Number.isFinite()
- Dry-run simulator funcional
- Anti-Rugpull (GoPlus API)
- RPC health monitoring
- WebSocket real-time updates

### 🚧 En Desarrollo
- Expansión a 100+ chains
- Auto-discovery masivo de DEXs
- Machine learning para predicción
- Ejecución automática (actualmente solo simulación)

---

**Sistema production-ready** con validación completa y monitoreo activo ✨
