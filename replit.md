# ArbitrageX Supreme V3.6 Dashboard

## Overview

ArbitrageX Supreme V3.6 is a Next.js-based frontend dashboard for monitoring and configuring a DeFi arbitrage trading system. The application provides real-time visibility into arbitrage opportunities across multiple blockchains, asset safety evaluation (Anti-Rugpull system), execution history, and system configuration management.

This is the frontend component of a three-tier architecture:
1. **Backend** (Rust/Node.js): Core arbitrage engine with PostgreSQL and Redis
2. **Edge** (Cloudflare Workers): API proxy, WebSocket relay, and caching layer
3. **Frontend** (This repository): Next.js dashboard for monitoring and control

The dashboard emphasizes real-time data visualization, strict validation of live data (rejecting mock/simulated data), and a responsive, accessible user interface.

## User Preferences

Preferred communication style: Simple, everyday language (Spanish preferred).

## Recent Changes

### October 4, 2025 - Migración a Replit
- Migrado desde Vercel a entorno Replit
- Configurado puerto 5000 y binding 0.0.0.0 para compatibilidad con Replit
- Removido output: 'standalone' de next.config.js
- Agregados headers Cache-Control para mejor manejo de caché en iframe
- Actualizado configuración de imágenes de `domains` a `remotePatterns`
- Creado componente tooltip.tsx faltante
- Configurado workflow de desarrollo en puerto 5000
- Variables de entorno requeridas: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_CF_URL, NEXT_PUBLIC_WS_URL

## System Architecture

### Frontend Framework
- **Next.js 14 with App Router**: Modern React framework providing file-based routing, server components, and optimized production builds
- **TypeScript**: Full type safety across the application with strict mode enabled
- **React 18**: Latest React features including concurrent rendering and automatic batching

### UI Component System
- **Radix UI Primitives**: Accessible, unstyled component primitives for complex UI elements (dialogs, dropdowns, tooltips, etc.)
- **Shadcn/ui**: Pre-built accessible components built on Radix UI with customizable styling
- **TailwindCSS**: Utility-first CSS framework with custom design tokens for consistent theming
- **Dark/Light Theme**: System-level theme support via next-themes with manual toggle capability

### State Management & Data Fetching
- **TanStack Query (React Query)**: Server state management with automatic caching, background refetching, and request deduplication
- **Query Configuration**: 5-minute stale time, retry on failure (1 attempt), no refetch on window focus to reduce API load
- **Real-time Updates**: Polling-based refresh (2-5 second intervals) for opportunities and executions
- **WebSocket Support**: Library structure exists for WebSocket connections (lib/ws.ts) for future real-time push updates

### Data Validation & Safety
- **Zod Schemas**: Runtime validation of all API responses to ensure type safety and data integrity
- **Anti-Mock Policy**: Explicit rejection of simulated/mock data through string pattern detection
- **Array-First API Design**: All endpoints expected to return arrays rather than single objects, enforced through validation
- **Strict Type Checking**: TypeScript strict mode with explicit type definitions for all data structures

### API Architecture
- **Dual API Strategy**: 
  - Primary: Cloudflare Workers edge endpoints (`/cf/*` routes)
  - Fallback: Direct backend API (`/api/*` routes)
- **Proxy Layer**: Next.js API routes act as proxy with environment-based routing
- **Request Retry Logic**: Automatic retry with exponential backoff for failed requests
- **Rate Limiting**: Token-bucket rate limiting in proxy routes based on environment configuration
- **Path Whitelisting**: Configurable allowed paths through environment arrays

### Key Pages & Features

**Dashboard (/)**: 
- Real-time opportunity feed with ROI, expected value, and risk metrics
- Summary statistics cards (opportunity count, average ROI, average EV)
- Live table view with chain, strategy, route, and timing information

**Asset Safety (/assets)**:
- Token safety evaluation using Rugpull Likelihood Index (RLI)
- Multi-criteria scoring (age, liquidity, oracle support, contract features)
- Search and filter capabilities by chain and risk level
- Progress bars visualizing safety scores

**Executions (/executions)**:
- Historical execution data with profit/loss tracking
- Status-based filtering (pending, mined, reverted, failed)
- Chain-specific filtering and search functionality
- Detailed metrics on gas costs and actual vs estimated profits

**Configuration (/config)**:
- JSON-based configuration editor using Monaco Editor
- Preset configurations (Aggressive-Flash, L2-Bluechips, Stables-Only)
- Real-time validation before applying changes
- Tabbed interface for quick presets vs advanced editing

### Environment Configuration
- **Array-Based Environment Variables**: Configuration via JSON arrays in environment variables
- **No Hardcoded Defaults**: System fails safely when arrays are not configured
- **First-Valid-Item Selection**: Utility functions extract first valid string/object from arrays
- **Flexible Deployment**: Same codebase adapts to different environments through configuration

### Security Considerations
- **CSP Headers**: Content Security Policy headers configured in next.config.js
- **X-Frame-Options**: Clickjacking protection enabled
- **No Powered-By Header**: Framework fingerprinting disabled
- **Environment Variable Isolation**: API URLs and tokens never exposed to client
- **Validation at Boundaries**: All external data validated before use

### Performance Optimizations
- **SWC Minification**: Faster build times and smaller bundle sizes
- **Image Optimization**: AVIF and WebP format support with remote pattern configuration
- **Code Splitting**: Automatic code splitting via Next.js App Router
- **Dynamic Imports**: Monaco Editor loaded client-side only to reduce initial bundle
- **Efficient Re-renders**: Memoization and proper React Query cache configuration

### Development Experience
- **ESLint Configuration**: Strict linting rules with Prettier integration
- **Import Ordering**: Automatic import organization by type
- **TypeScript Path Aliases**: `@/*` alias for cleaner imports
- **Hot Module Replacement**: Fast refresh during development

## External Dependencies

### Core Framework & Runtime
- **Next.js 14.0.4**: React framework with App Router
- **React 18.2**: UI library
- **TypeScript**: Type safety and developer experience

### UI Component Libraries
- **@radix-ui/react-***: 20+ primitive components (dialog, dropdown, select, tabs, toast, tooltip, etc.)
- **lucide-react**: Icon library with 300+ icons
- **next-themes**: Theme management for dark/light mode switching
- **class-variance-authority**: Variant-based component styling
- **tailwindcss-animate**: Animation utilities for Tailwind

### Data & State Management
- **@tanstack/react-query**: Server state management and caching (v5.15.0)
- **axios**: HTTP client with interceptors and retry logic
- **zod**: Schema validation for runtime type checking

### Data Visualization
- **recharts**: Charting library for profit breakdowns and metrics (v2.10.3)

### Developer Tools
- **@monaco-editor/react**: Code editor for JSON configuration editing
- **@tanstack/react-query-devtools**: Development tools for debugging queries

### Build & Development
- **TailwindCSS**: Utility-first CSS framework
- **PostCSS**: CSS transformations (autoprefixer, preset-env)
- **ESLint**: Code linting with Next.js and Prettier rules
- **Prettier**: Code formatting

### Testing (Configured)
- **Vitest**: Test framework for unit tests
- Tests validate array-only policies and mock data rejection

### External Services (Configured via Environment)
- **Cloudflare Workers**: Edge computing for API proxy and WebSocket relay
- **Backend API**: Rust/Node.js arbitrage engine (expected at configurable URL)
- **PostgreSQL**: Database (backend dependency, not directly accessed)
- **Redis**: Caching layer (backend dependency, not directly accessed)

### Optional Integrations
- **Grafana**: Metrics visualization (external service, links may be embedded)
- **Prometheus**: Metrics collection (backend integration)