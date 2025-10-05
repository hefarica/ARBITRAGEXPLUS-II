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
-   **Chain Management:** Add, update, remove chains, manage RPCs and DEXs.
-   **Asset Management:** Upsert assets, assess risk (Anti-Rugpull).
-   **Pair Management:** Generate, upsert, and validate trading pairs with real pool addresses.
-   **Policy Management:** Upsert and retrieve system policies.
-   **State & Metrics:** Retrieve engine state and performance data.
-   **Dynamic Configuration System:** Frontend-driven configuration updates database, which triggers auto-reload and restarts the Rust MEV engine with an updated `mev-scan-config.json`. This includes a robust 3-layer architecture for configuration: Frontend Admin UI, PostgreSQL, and Rust MEV Engine.
-   **Versioned Snapshots:** Configurations are versioned with ISO timestamps, enabling rollback functionality.
-   **Canonical Token System:** Manages chain-specific token addresses and variants for precise pool discovery.
-   **Multi-Pool Discovery:** Supports discovering multiple pools and fee tiers for a given trading pair, with quote-specific filtering to avoid mixing different stablecoins.

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