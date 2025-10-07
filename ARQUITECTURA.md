# 🏗️ Arquitectura del Sistema MEV ArbitrageX Supreme V3.6

## 1. Visión General

Sistema de arbitraje MEV multichain con **3 capas principales** que operan en conjunto para detectar, simular y ejecutar oportunidades de arbitraje en 100+ blockchains.

```mermaid
graph TD
    A[🌐 Frontend (Next.js/React)] -->|HTTP/WebSocket| B(🔧 Backend (Node.js));
    B -->|Config Export (JSON)| C(⚙️ Rust MEV Engine);
    C -->|RPC Calls| D(🌍 Blockchains);
    C -->|Detección de Oportunidades| B;
    B -->|Datos en Tiempo Real| A;
    B -->|Query/Update| E(🗄️ PostgreSQL);
```

## 2. Flujos por Página del Frontend

### 2.1. Flujo de Datos del Dashboard Principal (`app/page.tsx`)

El dashboard principal muestra las oportunidades de arbitraje en tiempo real.

1.  **Carga Inicial:**
    *   El componente `Dashboard` utiliza el hook `useOpportunities()` de `TanStack Query` para realizar una petición `GET` a `/api/opportunities`.
    *   El backend (en `server/server.ts`) recibe la petición y llama al `dry-run-processor.ts`.
    *   El `dry-run-processor` consulta la base de datos PostgreSQL para obtener las oportunidades detectadas más recientes.
    *   Los datos se devuelven al frontend y se muestran en el dashboard.

2.  **Actualizaciones en Tiempo Real:**
    *   El `Dashboard` establece una conexión WebSocket con el servidor (`ws://...`).
    *   Cuando el `rust-mev-engine` detecta una nueva oportunidad, la envía al `dry-run-processor`.
    *   El `dry-run-processor` valida la oportunidad y la emite a través del WebSocket.
    *   El frontend recibe la nueva oportunidad y actualiza la interfaz de usuario automáticamente.

### 2.2. Flujo de Datos de Asset Safety (`app/asset-safety/page.tsx`)

La página de Asset Safety muestra una evaluación de riesgo de los tokens.

1.  El componente `AssetSafetyPage` utiliza el hook `useQuery(['assets'])` para realizar una petición `GET` a `/api/engine/assets`.
2.  El backend (`engine-api.ts`) recibe la petición y consulta la tabla `assets` en la base de datos PostgreSQL.
3.  Los datos, incluyendo el `safety_score`, se devuelven al frontend y se muestran en la tabla de activos.

### 2.3. Flujo de Datos de Configuración (`app/config/page.tsx`)

La página de configuración permite al usuario editar la configuración del motor MEV.

1.  **Exportación de Configuración:**
    *   El `ConfigEditor` realiza una petición `GET` a `/api/engine/export`.
    *   El backend (`engine-api.ts`) exporta la configuración actual de la base de datos PostgreSQL como un archivo JSON.

2.  **Importación de Configuración:**
    *   El `ConfigEditor` realiza una petición `POST` a `/api/engine/import` con el nuevo archivo de configuración JSON.
    *   El backend (`engine-api.ts`) valida el JSON, actualiza la base de datos PostgreSQL y dispara un reinicio automático del `rust-mev-engine` para aplicar la nueva configuración.

## 3. Flujos End-to-End y Módulos Core

### 3.1. Detección de Oportunidades (Scanner → Processor → UI)

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

### 3.2. Simulación (Dry-Run) (Session → Execution → Stats)

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

## 4. Apéndice: Payloads y Config JSON

### 4.1. Ejemplo de `mev-scanner-config.json`

```json
{
  "chains": [
    {
      "name": "Ethereum",
      "rpc_url": "https://mainnet.infura.io/v3/YOUR_PROJECT_ID",
      "chain_id": 1
    }
  ],
  "dexes": [
    {
      "name": "UniswapV2",
      "router_address": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    }
  ],
  "assets": [
    {
      "symbol": "WETH",
      "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    },
    {
      "symbol": "DAI",
      "address": "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    }
  ],
  "pairs": [
    {
      "asset1": "WETH",
      "asset2": "DAI",
      "dex": "UniswapV2"
    }
  ]
}
```

### 4.2. Ejemplo de Payload de Oportunidad (JSON)

```json
{
  "opportunity_id": "arb-12345",
  "type": "arbitrage",
  "path": ["WETH", "DAI", "WETH"],
  "profit_usd": 22.74,
  "dexes": ["UniswapV2", "KyberSwap"],
  "transactions": [
    {
      "dex": "UniswapV2",
      "from_asset": "WETH",
      "to_asset": "DAI",
      "amount_in": 100
    },
    {
      "dex": "KyberSwap",
      "from_asset": "DAI",
      "to_asset": "WETH",
      "amount_in": 122.83
    }
  ]
}
```

## 5. Tabla de Mejoras Recientes

| Módulo | Descripción | Impacto |
|---|---|---|
| **MathEngine** | Nuevo motor matemático en Rust con cálculo diferencial para optimización de oportunidades. | Maximiza el beneficio potencial en cada operación. |
| **DataFetcher** | Módulo para adquisición de datos en tiempo real de DefiLlama y Dexscreener. | Asegura que el bot opere con precios y liquidez actualizados. |
| **AddressValidator** | Valida direcciones de contratos contra listas blancas y negras para prevenir interacciones con contratos maliciosos. | Aumenta la seguridad y reduce el riesgo de pérdida de fondos. |
| **KitDeArmado** | Estructura de datos para la construcción de transacciones atómicas y complejas. | Permite la ejecución de estrategias de arbitraje más sofisticadas. |

## 6. Apéndice: Diagrama de Flujo ASCII

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

