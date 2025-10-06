# ArbitrageX Supreme V3.6 Dashboard

## Overview
ArbitrageX Supreme V3.6 is a Next.js-based frontend dashboard for monitoring and configuring a DeFi arbitrage/MEV trading system. It provides real-time visibility into arbitrage opportunities, asset safety (Anti-Rugpull system), execution history, and system configuration. The project aims to scale from 5 hardcoded trading pairs to 100+ blockchains with dynamic, database-driven configuration, providing a comprehensive interface for managing a high-frequency, low-latency DeFi trading operation.

## User Preferences
Preferred communication style: Simple, everyday language (Spanish preferred).

## System Architecture

### Core Architecture
The system employs a 3-tier architecture:
-   **Core Layer:** Rust MEV engine, internal APIs (Node/Fastify), PostgreSQL, Redis, and smart contracts.
-   **Edge Layer (Cloudflare):** Secure API proxy with JWT, rate limiting, firewall, DDoS protection, CDN, caching, and real-time Pub/Sub + WebSocket.
-   **UI Layer (Next.js Frontend):** Consumes REST endpoints for real-time visualization and configuration.

### Frontend Framework & UI
-   **Next.js 14 (App Router), TypeScript, React 18:** Modern and type-safe frontend development.
-   **Radix UI Primitives, Shadcn/ui, TailwindCSS:** Accessible, unstyled components with a utility-first CSS approach, supporting dark/light themes.

### State Management & Data Handling
-   **TanStack Query:** Server state management with caching.
-   **Real-time Updates:** Polling for opportunities/executions, with future WebSocket support.
-   **Zod Schemas:** Runtime validation of API responses.

### API Architecture
-   **Dual API Strategy:** Cloudflare Workers edge endpoints (`/cf/*`) and fallback direct backend API (`/api/*`).
-   **Engine API (`/cf/engine/*`):** RESTful API for managing chains, assets, trading pairs, and policies via database-driven configuration.
-   **Proxy Layer:** Next.js API routes act as a proxy with request retry logic and token-bucket rate limiting.

### Database-Driven Configuration
The system relies on a PostgreSQL database for dynamic configuration, including:
-   **Chain Management:** Add, update, remove chains, manage RPCs and DEXs. Automatic RPC health monitoring and activation/deactivation.
-   **Asset Management:** Upsert assets, assess risk (Anti-Rugpull).
-   **Pair Management:** Generate, upsert, and validate trading pairs with real pool addresses.
-   **Policy Management:** Upsert and retrieve system policies (roiMinBps, gasSafetyBps, slippageBps, sizeGrid, capPctTvl, bundleMaxBlocks, gasUnitsHintRoundtripV2).
-   **State & Metrics:** Retrieve engine state and performance data.
-   **Dynamic Configuration System:** Frontend-driven configuration updates database, which triggers auto-reload and restarts the Rust MEV engine with an updated `mev-scan-config.json`. This includes a robust 3-layer architecture for configuration: Frontend Admin UI, PostgreSQL, and Rust MEV Engine.
-   **Versioned Snapshots:** Configurations are versioned with ISO timestamps, enabling rollback functionality with compare-and-swap atomic operations.
-   **Canonical Token System:** Manages chain-specific token addresses and variants for precise pool discovery.
-   **Multi-Pool Discovery:** Supports discovering multiple pools and fee tiers for a given trading pair, with quote-specific filtering.
-   **Reference Pools System:** Auto-computes best WNATIVE↔TOKEN pools for gas pricing with scoring, supporting manual override and full lifecycle management.
-   **Triple Validation Framework:** Frontend schema validation, backend consistency checks (RPC quorum, blocklists, USDC mix prevention), and engine-ready format validation.
-   **JSON Contract Format:** Exports dual-format JSON with PRD-compliant structure and backward compatibility fields for legacy RUST engine.

### MEV Scanner and Simulation
-   **`mev-scanner` binary:** Advanced strategies including `event_scanner` (Uniswap V3-like `EVENT_SWAP`), `bridged_scanner` (USDC/USDC.e/USDbC pairs), and `twap_scanner` (prioritizing TWAP pools).
-   **Arbitrage Algorithms:** Bellman-Ford for 3-leg negative cycles.
-   **Optimization:** Grid Search Optimizer for trade size.
-   **Simulation:** Modules for 2-leg and 3-leg arbitrage with precise PnL calculation (including fees, estimated gas, gross/net spread).
-   **Logging:** JSON logging with `jsonlog.rs` and HTTP POST to backend with `http_post.rs`.
-   **Configuration:** Independent `mev-scanner-config.json` with flexible Serde aliases for compatibility.

### Key Pages & Features
-   **Dashboard:** Real-time opportunity feed and summary statistics.
-   **Asset Safety:** Token safety evaluation using a multi-criteria Rugpull Likelihood Index.
-   **Executions:** Historical execution data with P&L tracking.
-   **Configuration:** JSON-based editor for system settings, presets, and validation.
-   **Admin Pages:** UIs for managing blockchains, RPCs, DEXs, assets, and pairs, including auto-discovery and health checks.

### Security & Performance
-   **Security Headers:** CSP, X-Frame-Options.
-   **Environment Variable Isolation:** API URLs/tokens not exposed client-side.
-   **Validation at Boundaries:** External data validation.
-   **Performance Optimizations:** SWC minification, image optimization, code splitting.

## External Dependencies

### Core Framework & Libraries
-   **Next.js 14.0.4**
-   **React 18.2**
-   **TypeScript**
-   **axios** (HTTP client)
-   **zod** (Schema validation)

### UI/Styling
-   **@radix-ui/react-\*** (Primitive components)
-   **lucide-react** (Icons)
-   **next-themes** (Theme management)
-   **TailwindCSS, PostCSS**

### Data & Visualization
-   **@tanstack/react-query** (v5.15.0)
-   **recharts** (v2.10.3)

### Developer Tools
-   **@monaco-editor/react** (Code editor)
-   **@tanstack/react-query-devtools**

### External Services & Integrations
-   **Cloudflare Workers:** Edge computing for API proxy and WebSocket relay.
-   **Backend API:** Rust/Node.js arbitrage engine.
-   **PostgreSQL (Neon):** Primary database for configurations.
-   **Redis:** Caching layer (backend dependency).
-   **DeFi Llama API:** For blockchain auto-discovery and DEX suggestions.
-   **GoPlus Security API:** For automated token risk scoring (Anti-Rugpull).
-   **DexScreener API & GeckoTerminal API:** For robust pool address validation and multi-DEX pool discovery.

## Recent Changes (Oct 6, 2025)

### Asset & Pair Orchestrator v2.0 - Validación Estricta End-to-End (Oct 6, 2025)

**Sistema de Validación de 6 Reglas Obligatorias:**
- ✅ **Pipeline determinístico**: Solo se monitorea lo verificable y ejecutable atómicamente
- ✅ **Regla 1 (NOT_CONFIGURED)**: Chain y DEX deben estar configurados y activos
- ✅ **Regla 2 (LOW_LIQ)**: Pools con TVL ≥ $1M USD requerido
- ✅ **Regla 3 (LOW_SCORE)**: Safety score ≥ 70 (Anti-Rugpull obligatorio)
- ✅ **Regla 4 (NO_PAIRS)**: Generación de pares base/quote (USDC, WETH, WBTC, DAI, USDT)
- ✅ **Regla 5 (NO_PROFIT)**: Profit estimado ≥ 5 bps después de gas y fees
- ✅ **Regla 6 (NOT_ATOMIC)**: Ejecutable atómicamente (2-3 hops, DEXs soportados, routing válido)

**Arquitectura del Orchestrator:**
- 📄 **Tipos TypeScript**: AssetCandidate, PairPlan, ValidationResult, AuditEvent
- 🔍 **Validadores**: AssetValidator con pipeline completo en `server/asset-orchestrator-validators.ts`
- 🔄 **Generación de Rutas**: Sistema de routing ejecutable con conectividad secuencial verificada
  - Primer hop: asset → intermediate (pool contiene asset)
  - Segundo hop: intermediate → quote (pool contiene intermediate AND quote)
  - Validación hop-por-hop con TOKEN_MISMATCH / FINAL_TOKEN_MISMATCH
- 🛣️ **API Endpoints**:
  - `POST /cf/orchestrator/validate` - Validación completa de asset con rutas ejecutables
  - `POST /cf/orchestrator/discover` - Descubrimiento de nuevos assets
  - `POST /cf/orchestrator/pairs/plan` - Generación y validación de pares atómicos
  - `POST /cf/orchestrator/add-to-trading` - Agregar asset validado a trading
  - `GET /cf/orchestrator/audit?trace_id=X&limit=100` - Audit trail completo

**Trazabilidad y Audit Trail:**
- ✅ **trace_id único**: `${chainId}:${address}` para cada asset
- ✅ **Audit log append-only**: `logs/asset-orchestrator-audit.jsonl`
- ✅ **Eventos trazables**: discover, validate, approve, reject, generate_pairs, add_to_trading
- ✅ **Estado persistente**: validation_status, validation_reason, validation_message, validated_at

**UI Admin Assets Rediseñada:**
- ✅ **Dashboard con métricas**: Total, Validados, Rechazados, Pares Atómicos
- ✅ **Estados visuales**: Badges (No Configurado, Alto Riesgo, Listo)
- ✅ **Validación on-demand**: Botón "Validar" por asset
- ✅ **Detalles completos**: Dialog con trace_id, razones de rechazo, pares validados
- ✅ **Agregar a trading**: Solo assets con validation_status === "valid"

**Parámetros de Política Configurables:**
```typescript
TVL_MIN_USD: 1_000_000,      // $1M liquidez mínima
ROI_MIN_BPS: 5,              // 0.05% profit neto mínimo
GAS_COST_FRACTION: 0.0002,   // 0.02% estimado de gas
MIN_SAFETY_SCORE: 70,        // Score Anti-Rugpull mínimo
MAX_HOPS: 3,                 // Máximo 3 saltos
MIN_HOPS: 2,                 // Mínimo 2 saltos
SLIPPAGE_BPS: 50,           // 0.5% slippage
GAS_SAFETY_BPS: 20          // 0.2% margen de gas
```

**Bugs Críticos Corregidos Durante Implementación:**
1. ✅ **Propagación de datos**: richPools y pairCandidates ahora se propagan correctamente desde runFullPipeline
2. ✅ **Routing ejecutable**: Rutas ahora se generan con conectividad secuencial (asset→intermediate→quote)
3. ✅ **Firma de estimatePairProfit**: Actualizada a 5 parámetros (tokenInSymbol, tokenOutSymbol, assetAddress, quoteAddress, route)
4. ✅ **Validación de atomicidad**: validate6_Atomicity ahora verifica conectividad hop-por-hop
5. ✅ **Token matching**: Verificación de que token final coincide con quote esperado
6. ✅ **Compatibilidad de endpoints**: Ambos /validate y /pairs/plan usan nueva firma correctamente

**Archivos Clave:**
- `server/asset-orchestrator-types.ts` - Tipos, constantes, BASE_QUOTE_TOKENS, POLICY_PARAMS
- `server/asset-orchestrator-validators.ts` - Pipeline de 6 reglas, estimatePairProfit, runFullPipeline
- `server/asset-orchestrator-api.ts` - Endpoints REST con generación de rutas ejecutables
- `app/admin/assets/page.tsx` - UI del orchestrator con estados de validación
- `logs/asset-orchestrator-audit.jsonl` - Audit trail append-only

### Security Hardening + CSP Fix (Oct 6, 2025)

**Content Security Policy (CSP) corregido:**
- ✅ **script-src 'unsafe-inline'**: Agregado para permitir scripts inline de Next.js (hidratación, HMR)
- ✅ **worker-src 'self' blob:**: Monaco Editor workers funcionando
- ✅ **connect-src 'self' https: wss: blob:**: WebSockets y blob connections habilitados
- ✅ **Página Admin Blockchains funcional**: Carga correcta de 9+ blockchains con RPCs, DEXs y health status

**Headers de Seguridad (next.config.js):**
- ✅ **CSP completo**: default-src, script-src, style-src, img-src, font-src, connect-src, worker-src
- ✅ **HSTS**: max-age=31536000; includeSubDomains
- ✅ **X-Frame-Options**: DENY (protección clickjacking)
- ✅ **Referrer-Policy**: strict-origin-when-cross-origin
- ✅ **Permissions-Policy**: cámara, micrófono, geolocalización deshabilitados

**Rate Limiting (server.ts):**
- ✅ **100 req/min por IP** (ventana 60s, memoria limitada a 10k IPs)
- ✅ **Headers X-RateLimit**: Limit, Remaining, Reset
- ✅ **429 Too Many Requests** con Retry-After

**Rust Build Hardening (.cargo/config.toml):**
- ✅ **rustflags estrictos**: -D warnings, optimizaciones LTO
- ✅ **Release profile**: panic=abort, strip symbols, codegen-units=1

**SBOM (Software Bill of Materials):**
- ✅ **scripts/generate-sbom-rust.sh**: cargo tree + CycloneDX
- ✅ **scripts/generate-sbom-node.sh**: npm list + audit

### Sistema de Defaults End-to-End + Dependencias Corregidas (Patches 0005 + 0006)

**Archivo de Defaults (`default-assets-and-pairs.json`):**
- ✅ **6 chains con assets y pares precargados**: Base, Arbitrum, Avalanche, Optimism, Polygon, BSC
- ✅ **Merge automático en runtime**: Si faltan assets/pares en config actual, los agrega sin sobrescribir
- ✅ **Grupos bridged preconfigurados**: USDC → [USDC, USDbC, USDC.e]
- ✅ **DEXs priorizados**: aerodrome, velodrome, balancer, curve, uniswapv3, etc.
- ✅ **Variable DEFAULTS_JSON**: Configurable para apuntar a archivo personalizado

**Integración en mev-scanner:**
- ✅ **Función merge_defaults_into_cfg()**: Fusiona defaults con config actual al inicio
- ✅ **12 pares bridged detectados**: Antes 5, ahora muchos más por combinaciones adicionales
- ✅ **Evento DEFAULTS_MERGED**: Log JSON confirma carga exitosa
- ✅ **Chains adicionales**: BSC y otras chains ahora disponibles automáticamente

**Dependencias Corregidas (Cargo.toml):**
- ✅ **Runtime no-opcional**: tokio, serde, serde_json, eyre, chrono, etc. ahora siempre disponibles
- ✅ **Fix "unresolved crate"**: Evita errores de compilación en CI/CD
- ✅ **Features simplificadas**: scanners, evm, http ya no necesitan dep: prefixes
- ✅ **async fn main()**: Ya incluye #[tokio::main] en minimal.rs

**Uso:**
```bash
# Con defaults automáticos
DEFAULTS_JSON="$(pwd)/default-assets-and-pairs.json" ./scripts/run-mev-scanner-sim.sh

# Verifica log de merge
grep "DEFAULTS_MERGED" logs/mev-scanner.jsonl
```