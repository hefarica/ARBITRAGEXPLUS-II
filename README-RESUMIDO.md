# Diagrama de Flujo de Arquitectura (Resumido)

Este documento contiene un diagrama de flujo ASCII que representa una visión general de la arquitectura del sistema MEV ArbitrageX Supreme.

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

