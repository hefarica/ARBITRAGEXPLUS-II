# ArbitrageX Supreme V3.6 Dashboard

## Overview
ArbitrageX Supreme V3.6 is a Next.js-based frontend dashboard for monitoring and configuring a DeFi arbitrage/MEV trading system. It provides real-time visibility into arbitrage opportunities, asset safety (Anti-Rugpull system), execution history, and system configuration. The project aims to scale from 5 hardcoded trading pairs to 100+ blockchains with dynamic, database-driven configuration, providing a comprehensive interface for managing a high-frequency, low-latency DeFi trading operation.

## Recent Changes (Oct 6, 2025)

### RPC Health Monitor Automático - Sistema Anti-Sleep (Oct 6, 2025)

**Sistema de Health Check Automático:**
- ✅ **RPC Health Monitor automático**: Verifica salud de RPCs cada 3 minutos sin intervención manual
- ✅ **Solo chains activas**: El monitor solo verifica RPCs de blockchains que están activas, ahorrando recursos
- ✅ **Actualización automática de BD**: Actualiza `lastLatencyMs`, `lastOkAt` y `isActive` en cada verificación
- ✅ **Prevención de sleep**: Los RPCs ya no se "duermen" o quedan en 0/5 - se mantienen activos automáticamente
- ✅ **Logs detallados**: Muestra latencia de cada RPC y conteo de healthy/unhealthy en consola
- ✅ **Inicialización inmediata**: Se ejecuta al iniciar el servidor y luego cada 3 minutos
- ✅ **Singleton pattern**: Servicio único `rpcHealthMonitor` en `server/rpc-health-monitor.ts`
- ✅ **Health check manual optimizado**: Eliminado del inicio de página para evitar race conditions

### DEX Management System Enhancement & Auto-Activation

**Admin Chains UI & UX Improvements (Oct 6, 2025):**
- ✅ **Auto-activación de RPCs**: Cuando activas/desactivas una blockchain, todos sus RPCs se activan/desactivan automáticamente
- ✅ **Modal de DEXs con auto-cierre**: Modal se cierra automáticamente después de guardar con éxito
- ✅ **Mensaje de confirmación mejorado**: Muestra "✅ X DEX(s) guardados para [Blockchain]" con cantidad exacta
- ✅ Modal de DEXs mejorado: Ahora muestra TODOS los DEXs disponibles en una sola vista
- ✅ Pre-selección automática: DEXs ya agregados aparecen pre-seleccionados con checkbox marcado
- ✅ Endpoint PUT /cf/engine/dexes/set: SET completo idempotente - reemplaza lista completa de DEXs atómicamente
- ✅ Arquitectura idempotente: Frontend envía array de DEXs seleccionados → Backend hace DELETE + INSERT en transacción
- ✅ Auto-reload integrado: Al guardar cambios de DEXs → actualiza DB → exporta config → recarga motor RUST → broadcast WebSocket
- ✅ **BUG FIX CRÍTICO**: Agregada ruta GET /cf/engine/chains que faltaba y causaba 404s en dashboard
- ✅ Express routing funcionando correctamente: server.use("/cf/engine", engineApiRouter) maneja rutas antes de Next.js

### PRD EXTENDIDO + MEV Engine Manager System - 100% Complete (Oct 5, 2025)

**Core Infrastructure:**
- ✅ Engine config service rewritten with dual-format JSON (PRD + backward compatibility)
- ✅ Database schema extended with ref_pools, config_snapshots, config_active tables
- ✅ RefPools service with auto-recompute and manual override support
- ✅ Triple validation framework (frontend schema, backend RPC quorum, engine-ready)
- ✅ Versioned snapshots with compare-and-swap for atomic updates
- ✅ Backward compatibility maintained with existing RUST MEV engine

**MEV Engine Manager Implementation:**
- ✅ WebSocket config.applied events: Real-time broadcast when configuration is applied
- ✅ Singleton WebSocket instance: Global access via websocket-instance.ts
- ✅ autoSaveAndReload() enhanced: Snapshots + validation + reload + WebSocket emission
- ✅ config-schema.json: Comprehensive JSON schema with strict validation (flexible quorum for development)
- ✅ Endpoint /config/export with dryRun: Validate without applying (dryRun=true)
- ✅ Unified CRUD pattern: All write endpoints use autoSaveAndReload() → emit config.applied
- ✅ E2E testing script: scripts/test-config-flow.ts validates complete upsert → reload → WS flow
- ✅ /config/rollback enhanced: Emits WebSocket events on rollback

**Validation System:**
- ✅ Errors for critical failures (invalid addresses, duplicate pools, invalid feeBps)
- ✅ Warnings for recommendations (RPC quorum, WSS availability)
- ✅ Non-blocking validation: System works with minimal RPCs, warns about quorum

**Arbitrage Detection System:**
- ✅ **REAL DATA INTEGRATION**: Sistema integrado 100% con DexScreener API (300 req/min, sin API key)
- ✅ PriceFeedService: Servicio de precios con caching (30s TTL), batching (30 pools/request), rate limiting
- ✅ Arbitrage simulator: Cálculo matemático preciso de 2-leg y 3-leg con precios reales on-chain
- ✅ Auto-scanner: Scans every 5 seconds fetching live prices from DexScreener
- ✅ Endpoint /cf/engine/opportunities/scan: REST API for on-demand scanning
- ✅ Filtering: Only returns opportunities with net_pnl_bps > 5, gas < 0.0005 ETH, atomic_safe=true
- ✅ Multi-chain support: Scans all configured chains (BSC, Ethereum, etc.) with real pool data
- ✅ JSON format output: Compatible with user specification (route, legs, input_token, amount_in/out, net_pnl, gas_cost, reason, execution method)
- ✅ **PRODUCTION READY**: Sistema verifica precios reales cada 5 segundos. Actualmente NO detecta oportunidades porque spreads reales (~13 bps) < costos (fees 60 bps + gas 40 bps). Sistema funciona correctamente - simplemente no hay arbitraje rentable en pools WBNB/USDC actuales.
- 💡 **Para detectar oportunidades reales**: Agregar más pares de tokens (ETH/USDT, BTC/USDC, etc.), más DEXs, o esperar volatilidad de mercado que genere spreads > 100 bps

**System Status:**
- ✅ Motor RUST funcionando: 8 chains, 12 DEXs, 12 unique pools scanned without errors
- ✅ WebSocket server operational with config.applied broadcast
- ✅ All CRUD endpoints updated with unified autoSaveAndReload pattern
- ✅ Arbitrage scanner running: Auto-scans every 5 seconds, broadcasts via WebSocket
- ✅ Express server handling API routes correctly before Next.js handler

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
-   **Chain Management:** Add, update, remove chains, manage RPCs and DEXs.
-   **Asset Management:** Upsert assets, assess risk (Anti-Rugpull).
-   **Pair Management:** Generate, upsert, and validate trading pairs with real pool addresses.
-   **Policy Management:** Upsert and retrieve system policies (roiMinBps, gasSafetyBps, slippageBps, sizeGrid, capPctTvl, bundleMaxBlocks, gasUnitsHintRoundtripV2).
-   **State & Metrics:** Retrieve engine state and performance data.
-   **Dynamic Configuration System:** Frontend-driven configuration updates database, which triggers auto-reload and restarts the Rust MEV engine with an updated `mev-scan-config.json`. This includes a robust 3-layer architecture for configuration: Frontend Admin UI, PostgreSQL, and Rust MEV Engine.
-   **Versioned Snapshots:** Configurations are versioned with ISO timestamps, enabling rollback functionality with compare-and-swap atomic operations.
-   **Canonical Token System:** Manages chain-specific token addresses and variants for precise pool discovery.
-   **Multi-Pool Discovery:** Supports discovering multiple pools and fee tiers for a given trading pair, with quote-specific filtering to avoid mixing different stablecoins.
-   **Reference Pools System:** Auto-computes best WNATIVE↔TOKEN pools for gas pricing with scoring (liquidity, volume, update freshness), supporting manual override and full lifecycle management.
-   **Triple Validation Framework:** Frontend schema validation, backend consistency checks (RPC quorum, blocklists, USDC mix prevention), and engine-ready format validation.
-   **JSON Contract Format:** Exports dual-format JSON with PRD-compliant structure (version ISO, alias, wnative, rpcPool wss/https, pools with feeBps, policies, risk, refPools) and backward compatibility fields for legacy RUST engine.

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