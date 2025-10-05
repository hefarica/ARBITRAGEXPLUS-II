# ArbitrageX Supreme V3.6 Dashboard

## Overview
ArbitrageX Supreme V3.6 is a Next.js-based frontend dashboard designed for monitoring and configuring a DeFi arbitrage/MEV trading system. It provides real-time visibility into arbitrage opportunities across multiple blockchains, asset safety evaluations (Anti-Rugpull system), execution history, and system configuration management. The project is expanding from 5 hardcoded trading pairs to support 100+ blockchains with dynamic configuration through a database-driven backend infrastructure.

## User Preferences
Preferred communication style: Simple, everyday language (Spanish preferred).

## System Architecture

### Core Architecture
The system employs a 3-tier architecture:
1.  **Core Layer (VPS Contabo):** Houses the main Rust MEV engine, internal APIs (Node/Fastify), relay clients (Flashbots/bloXroute/MEV-Share), simulation modules, PostgreSQL, Redis, smart contracts, Docker Compose, Nginx, and observability tools (Prometheus/Grafana/Alertmanager).
2.  **Edge Layer (Cloudflare):** Provides a secure API proxy with JWT, rate limiting, firewall, DDoS protection, global CDN, smart caching (D1, KV, R2), real-time Pub/Sub + WebSocket relay, and controlled degradation.
3.  **UI Layer (This Dashboard - Replit/Cloudflare Pages):** A Next.js frontend consuming REST endpoints from the Edge layer, offering real-time visualization of opportunities, strategies, and metrics, configuration management, and alerting.

### Frontend Framework
-   **Next.js 14 with App Router**: Modern React framework for optimized production builds.
-   **TypeScript**: Full type safety.
-   **React 18**: Latest React features.

### UI Component System
-   **Radix UI Primitives**: Accessible, unstyled components.
-   **Shadcn/ui**: Pre-built components based on Radix UI.
-   **TailwindCSS**: Utility-first CSS with custom design tokens.
-   **Dark/Light Theme**: System-level theme support via `next-themes`.

### State Management & Data Fetching
-   **TanStack Query (React Query)**: Server state management with caching, background refetching, and deduplication.
-   **Real-time Updates**: Polling (2-5 second intervals) for opportunities and executions; WebSocket support structure for future push updates.

### Data Validation & Safety
-   **Zod Schemas**: Runtime validation of all API responses.
-   **Anti-Mock Policy**: Rejection of simulated/mock data.
-   **Array-First API Design**: Endpoints return arrays.
-   **Strict Type Checking**: TypeScript strict mode with explicit type definitions.

### API Architecture
-   **Dual API Strategy**: Primary Cloudflare Workers edge endpoints (`/cf/*`) and fallback direct backend API (`/api/*`).
-   **Engine API** (`/cf/engine/*`): RESTful configuration API for managing chains, assets, trading pairs, and policies.
-   **Proxy Layer**: Next.js API routes act as proxy.
-   **Request Retry Logic**: Automatic retry with exponential backoff.
-   **Rate Limiting**: Token-bucket rate limiting in proxy routes.

### Engine API Endpoints (Database-Driven Configuration)
-   **Chain Management**: `POST /cf/engine/addChain`, `POST /cf/engine/updateChain`, `POST /cf/engine/removeChain`
-   **RPC Management**: `POST /cf/engine/addRpc`, `POST /cf/engine/removeRpc`
-   **DEX Management**: `POST /cf/engine/addDex`, `POST /cf/engine/removeDex`
-   **Asset Management**: `POST /cf/engine/assets/upsert`, `POST /cf/engine/assets/risk`
-   **Pair Management**: `POST /cf/engine/pairs/generate`, `POST /cf/engine/pairs/upsert`
-   **Policy Management**: `POST /cf/engine/policies/upsert`, `GET /cf/engine/policies`
-   **State & Metrics**: `GET /cf/engine/state`, `GET /cf/engine/perf`

### Key Pages & Features
-   **Dashboard**: Real-time opportunity feed, summary statistics, live table view.
-   **Asset Safety**: Token safety evaluation using Rugpull Likelihood Index (RLI) with multi-criteria scoring, search, and filter capabilities.
-   **Executions**: Historical execution data with profit/loss tracking, status, and chain-specific filtering.
-   **Configuration**: JSON-based configuration editor using Monaco Editor, preset configurations, and real-time validation.

### Environment Configuration
-   **Array-Based Environment Variables**: Configuration via JSON arrays.
-   **No Hardcoded Defaults**: System fails safely if not configured.

### Security Considerations
-   **CSP Headers**, **X-Frame-Options**, no **Powered-By Header**.
-   **Environment Variable Isolation**: API URLs and tokens not exposed to client.
-   **Validation at Boundaries**: External data validated before use.

### Performance Optimizations
-   **SWC Minification**, **Image Optimization** (AVIF, WebP).
-   **Code Splitting**, **Dynamic Imports**, **Efficient Re-renders**.

### Development Experience
-   **ESLint Configuration**, **Prettier Integration**, **TypeScript Path Aliases**, **Hot Module Replacement**.

## External Dependencies

### Core Framework & Runtime
-   **Next.js 14.0.4**
-   **React 18.2**
-   **TypeScript**

### UI Component Libraries
-   **@radix-ui/react-\*** (20+ primitive components)
-   **lucide-react** (Icon library)
-   **next-themes** (Theme management)
-   **class-variance-authority** (Variant-based styling)
-   **tailwindcss-animate** (Animation utilities)

### Data & State Management
-   **@tanstack/react-query** (v5.15.0)
-   **axios** (HTTP client)
-   **zod** (Schema validation)

### Data Visualization
-   **recharts** (v2.10.3)

### Developer Tools
-   **@monaco-editor/react** (Code editor)
-   **@tanstack/react-query-devtools**

### Build & Development
-   **TailwindCSS**
-   **PostCSS**
-   **ESLint**
-   **Prettier**

### Database Schema (PostgreSQL via Neon)
-   **chains**: Blockchain configurations with chain_id, name, EVM compatibility
-   **chain_rpcs**: RPC endpoints per chain with latency tracking and health monitoring
-   **chain_dexes**: DEX configurations per chain with active status
-   **assets**: Token metadata with anti-rugpull risk scoring (0-100 scale)
-   **pairs**: Trading pairs with enable/disable control
-   **policies**: System policies (min profit, slippage, gas limits) with JSON values
-   **config_versions**: Configuration versioning for rollback capability
-   **Unique Constraints**: 
    - `assets(chain_id, address)` - Prevents duplicate tokens per chain
    - `pairs(chain_id, base_addr, quote_addr)` - Prevents duplicate trading pairs

### External Services (Configured via Environment)
-   **Cloudflare Workers**: Edge computing for API proxy and WebSocket relay.
-   **Backend API**: Rust/Node.js arbitrage engine (expected at configurable URL).
-   **PostgreSQL (Neon)**: Primary database for configuration, chains, assets, and pairs.
-   **Redis**: Caching layer (backend dependency).

### Optional Integrations
-   **Grafana**: Metrics visualization.
-   **Prometheus**: Metrics collection.

## Recent Changes (October 5, 2025)

### Backend Infrastructure Expansion
-   **Database Schema**: Expanded from 3 tables to 10 tables for comprehensive configuration management
-   **Engine API**: Implemented 14 RESTful endpoints for chain/asset/pair/policy management
-   **Route Migration**: Moved all engine endpoints from `/api/engine/*` to `/cf/engine/*` to avoid Next.js routing conflicts
-   **Unique Constraints**: Added composite UNIQUE constraints on assets and pairs tables for reliable upsert operations
-   **Real Data Only**: All endpoints validated with real Ethereum tokens (WETH, USDC, USDT) and public RPC endpoints

### Testing Status
-   ✅ Chain addition with 5+ RPCs and multiple DEXs
-   ✅ Asset upsert with real token addresses
-   ✅ Trading pair configuration
-   ✅ Policy management (min_profit_usd, max_slippage_bps)
-   ✅ State retrieval with full chain/asset/pair/policy data