# ArbitrageX Supreme V3.6 Dashboard

## Overview
ArbitrageX Supreme V3.6 is a Next.js-based frontend dashboard for monitoring and configuring a DeFi arbitrage/MEV trading system. It provides real-time visibility into arbitrage opportunities, asset safety (Anti-Rugpull system), execution history, and system configuration. The project aims to scale from 5 hardcoded trading pairs to 100+ blockchains with dynamic, database-driven configuration. Its core purpose is to provide a comprehensive interface for managing a high-frequency, low-latency DeFi trading operation.

## User Preferences
Preferred communication style: Simple, everyday language (Spanish preferred).

## System Architecture

### Core Architecture
The system utilizes a 3-tier architecture:
1.  **Core Layer:** Rust MEV engine, internal APIs (Node/Fastify), relay clients, simulation, PostgreSQL, Redis, smart contracts, Docker, Nginx, and observability (Prometheus/Grafana/Alertmanager).
2.  **Edge Layer (Cloudflare):** Secure API proxy with JWT, rate limiting, firewall, DDoS protection, CDN, caching (D1, KV, R2), real-time Pub/Sub + WebSocket, and controlled degradation.
3.  **UI Layer (Next.js Frontend):** Consumes REST endpoints from the Edge layer for real-time visualization of opportunities, strategies, metrics, configuration, and alerting.

### Frontend Framework & UI
-   **Next.js 14 (App Router), TypeScript, React 18:** Modern, type-safe, and optimized frontend development.
-   **Radix UI Primitives, Shadcn/ui, TailwindCSS:** Accessible, unstyled components with a utility-first CSS approach, supporting dark/light themes.

### State Management & Data Handling
-   **TanStack Query:** Server state management with caching, refetching, and deduplication.
-   **Real-time Updates:** Polling for opportunities/executions, with WebSocket support for future push updates.
-   **Zod Schemas:** Runtime validation of all API responses.
-   **Strict Type Checking:** TypeScript strict mode for data integrity.

### API Architecture
-   **Dual API Strategy:** Cloudflare Workers edge endpoints (`/cf/*`) and fallback direct backend API (`/api/*`).
-   **Engine API (`/cf/engine/*`):** RESTful API for managing chains, assets, trading pairs, and policies via database-driven configuration.
-   **Proxy Layer:** Next.js API routes act as a proxy with request retry logic and token-bucket rate limiting.

### Database-Driven Configuration
The system heavily relies on a PostgreSQL database for dynamic configuration management, including:
-   **Chain Management:** Add, update, remove chains, manage RPCs and DEXs.
-   **Asset Management:** Upsert assets, assess risk (Anti-Rugpull).
-   **Pair Management:** Generate, upsert, and validate trading pairs with real pool addresses.
-   **Policy Management:** Upsert and retrieve system policies (e.g., min profit, slippage).
-   **State & Metrics:** Retrieve engine state and performance data.

### Key Pages & Features
-   **Dashboard:** Real-time opportunity feed, summary statistics, live table view.
-   **Asset Safety:** Token safety evaluation using a multi-criteria Rugpull Likelihood Index (RLI), with search and filter.
-   **Executions:** Historical execution data with P&L tracking and filtering.
-   **Configuration:** JSON-based editor (Monaco Editor) for system settings, with presets and validation.
-   **Admin Pages:** Dedicated UIs for managing blockchains, RPCs, DEXs, assets, and pairs, including auto-discovery and health checks.

### Security & Performance
-   **Security Headers:** CSP, X-Frame-Options.
-   **Environment Variable Isolation:** API URLs/tokens not exposed client-side.
-   **Validation at Boundaries:** External data validation.
-   **Performance Optimizations:** SWC minification, image optimization, code splitting, dynamic imports.

### Development Practices
-   ESLint, Prettier, TypeScript Path Aliases, Hot Module Replacement for a streamlined development workflow.

## External Dependencies

### Core Framework & Libraries
-   **Next.js 14.0.4**
-   **React 18.2**
-   **TypeScript**
-   **axios** (HTTP client)
-   **zod** (Schema validation)

### UI/Styling
-   **@radix-ui/react-\*** (20+ primitive components)
-   **lucide-react** (Icons)
-   **next-themes** (Theme management)
-   **class-variance-authority** (Variant styling)
-   **tailwindcss-animate** (Animations)
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
-   **PostgreSQL (Neon):** Primary database for configurations (chains, RPCs, DEXs, assets, pairs, policies).
-   **Redis:** Caching layer (backend dependency).
-   **DeFi Llama API:** For blockchain auto-discovery and DEX suggestions.
-   **GoPlus Security API:** For automated token risk scoring (Anti-Rugpull).
-   **DexScreener API & GeckoTerminal API:** For robust pool address validation and multi-DEX pool discovery.
-   **Grafana (Optional):** Metrics visualization.
-   **Prometheus (Optional):** Metrics collection.

## Recent Changes (October 2025)

### Multi-Pool Discovery with Quote-Specific Filtering (Latest Update - October 5, 2025)
- **Achievement**: Sistema expandido de 5 pares hardcodeados a **12 pools únicos** con filtrado correcto por stablecoin
- **Solution Implemented**: Multi-pool discovery with canonical token variants + quote-specific filtering
- **Technical Details**:
  - **Canonical Token System**: `canonical-tokens.ts` provides chain-specific addresses (USDC, USDC.e, USDT variants) for precise pool discovery
  - **Quote-Specific Filtering**: Each pair searches only for its specific stablecoin variants (WETH/USDC finds only USDC pools, WETH/USDT finds only USDT pools)
  - **Multi-Pool Discovery**: `findPoolsByAddress()` searches across quote variants, finds ALL fee tiers (Uniswap V3: 0.05%, 0.3%, 1%)
  - **Deduplication Key**: `${dexId}|${pairAddress}` ensures each unique pool is tracked separately (same DEX, different fee tier = different pool)
  - **Unique Naming**: Pool address suffix (last 6 chars) distinguishes identical pairs: `WBNB/USDC @ pancakeswap (0612C4)` vs `(B2FC5b)`
- **Current Pairs & Pools**:
  - **Binance WBNB/USDC**: 7 pools (3 PancakeSwap, 1 Biswap, 3 Uniswap fee tiers)
  - **Ethereum WETH/USDC**: 2 pools (Uniswap with different fee tiers)
  - **Ethereum WETH/USDT**: 3 pools (Uniswap with different fee tiers)
  - **Motor Verification**: RUST engine correctly scans 12 unique pools: "Scan complete. Scanned 12 pairs, found 0 opportunities"
- **Impact**: Sistema busca correctamente pools por stablecoin específica, evitando mezcla incorrecta de USDC/USDT. Cada fee tier es pool único para maximizar oportunidades de arbitraje.