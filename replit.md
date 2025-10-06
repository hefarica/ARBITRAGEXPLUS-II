# ARBITRAGEXPLUS-II

## Overview
ARBITRAGEXPLUS-II es un sistema MEV de alto rendimiento que integra un motor Rust con cálculo diferencial, adquisición de datos en tiempo real, validación de contratos, y un frontend Next.js para monitoreo y configuración de arbitraje DeFi/MEV multichain. It provides real-time visibility into arbitrage opportunities, asset safety (Anti-Rugpull system), execution history, and system configuration. The project aims to scale from a limited number of trading pairs to 100+ blockchains with dynamic, database-driven configuration, offering a comprehensive interface for managing high-frequency, low-latency DeFi trading.

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
-   **Chain Management:** Add, update, remove chains, manage RPCs and DEXs, with automatic RPC health monitoring.
-   **Asset Management:** Upsert assets, assess risk (Anti-Rugpull).
-   **Pair Management:** Generate, upsert, and validate trading pairs with real pool addresses.
-   **Policy Management:** Upsert and retrieve system policies (e.g., ROI, gas safety, slippage).
-   **Dynamic Configuration System:** Frontend-driven configuration updates the database, which triggers auto-reload and restarts the Rust MEV engine. Configurations are versioned with ISO timestamps for rollback.
-   **Canonical Token System:** Manages chain-specific token addresses for precise pool discovery.
-   **Multi-Pool Discovery:** Supports discovering multiple pools and fee tiers for a given trading pair.
-   **Reference Pools System:** Auto-computes best WNATIVE↔TOKEN pools for gas pricing.
-   **Triple Validation Framework:** Frontend schema validation, backend consistency checks, and engine-ready format validation.
-   **JSON Contract Format:** Exports dual-format JSON for PRD-compliance and backward compatibility.

### MEV Scanner and Simulation
-   **`mev-scanner` binary:** Advanced strategies (`event_scanner`, `bridged_scanner`, `twap_scanner`).
-   **Arbitrage Algorithms:** Bellman-Ford for 3-leg negative cycles.
-   **Optimization:** Grid Search Optimizer for trade size.
-   **Simulation:** Modules for 2-leg and 3-leg arbitrage with precise PnL calculation.
-   **Logging:** JSON logging with HTTP POST to backend.
-   **Configuration:** Independent `mev-scanner-config.json` with flexible Serde aliases.

### Key Pages & Features
-   **Dashboard:** Real-time opportunity feed and summary statistics.
-   **Asset Safety:** Token safety evaluation using a multi-criteria Rugpull Likelihood Index.
-   **Executions:** Historical execution data with P&L tracking.
-   **Configuration:** JSON-based editor for system settings, presets, and validation.
-   **Admin Pages:** UIs for managing blockchains, RPCs, DEXs, assets, and pairs, including auto-discovery and health checks.
-   **Asset & Pair Orchestrator:** Validates assets and generates executable trading pairs based on strict rules (liquidity, safety score, profit, atomicity). Features an audit trail and configurable policy parameters.
-   **Mass Blockchain Discovery:** Endpoint to discover and configure multiple blockchains, RPCs, and DEXs simultaneously, with options for batch activation/deactivation.
-   **End-to-End Defaults System:** Pre-configured assets and pairs for multiple chains are merged into the system configuration at runtime.

### Security & Performance
-   **Security Headers:** CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy.
-   **Environment Variable Isolation:** API URLs/tokens not exposed client-side.
-   **Validation at Boundaries:** External data validation.
-   **Performance Optimizations:** SWC minification, image optimization, code splitting.
-   **Rate Limiting:** 100 req/min per IP with X-RateLimit headers.
-   **Rust Build Hardening:** Strict rustflags, LTO optimizations, panic=abort.
-   **SBOM (Software Bill of Materials):** Scripts for generating SBOM for Rust and Node.js dependencies.

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