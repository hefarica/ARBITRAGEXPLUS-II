# ArbitrageX Supreme V3.6 Dashboard

## Overview
ArbitrageX Supreme V3.6 is a Next.js-based frontend dashboard designed for monitoring and configuring a DeFi arbitrage/MEV trading system. It provides real-time visibility into arbitrage opportunities across multiple blockchains, asset safety evaluations (Anti-Rugpull system), execution history, and system configuration management. The project aims to offer a comprehensive UI layer for a sophisticated 3-tier arbitrage system, emphasizing real-time data visualization and strict validation of live data.

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
-   **Proxy Layer**: Next.js API routes act as proxy.
-   **Request Retry Logic**: Automatic retry with exponential backoff.
-   **Rate Limiting**: Token-bucket rate limiting in proxy routes.

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

### External Services (Configured via Environment)
-   **Cloudflare Workers**: Edge computing for API proxy and WebSocket relay.
-   **Backend API**: Rust/Node.js arbitrage engine (expected at configurable URL).
-   **PostgreSQL**: Database (backend dependency).
-   **Redis**: Caching layer (backend dependency).

### Optional Integrations
-   **Grafana**: Metrics visualization.
-   **Prometheus**: Metrics collection.