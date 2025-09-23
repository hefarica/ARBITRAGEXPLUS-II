# ARBITRAGEX SUPREME V3.6 - Frontend Dashboard

![version](https://img.shields.io/badge/version-3.6.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![status](https://img.shields.io/badge/status-production-green)

Dashboard de monitoreo y configuración para el sistema de arbitraje automático ArbitrageX Supreme V3.6. Este proyecto forma parte del ecosistema ArbitrageX Supreme, que incluye:

1. Backend (CONTABO-BACKEND): Motor Rust, API, Docker, PostgreSQL, Redis
2. Edge (Cloudflare): Workers para proxy, WebSockets y cache
3. Frontend (Lovable Dashboard): Este repositorio - UI para monitoreo y configuración

## Características

- 📊 Dashboard en tiempo real para monitoreo de oportunidades de arbitraje
- 🔒 Sistema Anti-Rugpull (Asset Safety) para evaluación de riesgo de tokens
- 📈 Métricas detalladas de ejecuciones y rendimiento
- 👛 Gestión de wallets de ejecución y tesorería
- ⚙️ Panel de configuración con presets y edición avanzada
- 🚀 WebSockets para actualizaciones en tiempo real
- 🌙 Soporte para tema claro/oscuro
- 📱 Diseño responsive

## Tecnologías

- **Next.js 14**: Framework React con App Router
- **TypeScript**: Tipado estático
- **TailwindCSS**: Utilidades de CSS
- **Shadcn/ui**: Componentes de UI accesibles y personalizables
- **TanStack Query**: Gestión de estado del servidor y cache
- **Axios**: Cliente HTTP
- **Monaco Editor**: Editor de código para configuraciones JSON
- **React-Query**: Para fetching de datos eficiente

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/hefarica/show-my-github-gems.git
cd show-my-github-gems

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con las URLs de la API y Cloudflare Workers
```

## Variables de entorno

```
# URL para la API del backend (selector-api)
NEXT_PUBLIC_API_URL=http://localhost:3000

# URL para los Workers de Cloudflare (opcional si se usa despliegue local)
NEXT_PUBLIC_CF_URL=https://arbitragex-supreme.workers.dev

# URL para conexiones WebSocket (opcional si se usa despliegue local)
NEXT_PUBLIC_WS_URL=wss://arbitragex-supreme.workers.dev/ws
```

## Uso en desarrollo

```bash
# Iniciar servidor de desarrollo
npm run dev
```

El dashboard estará disponible en [http://localhost:3100](http://localhost:3100).

## Estructura del proyecto

```
LOVABLE-DASHBOARD/
├── app/                      # App Router de Next.js
│   ├── layout.tsx            # Layout principal
│   ├── page.tsx              # Página principal (Dashboard)
│   ├── config/               # Página de configuración
│   ├── assets/               # Página de Asset Safety
│   ├── executions/           # Página de ejecuciones
│   ├── wallets/              # Página de wallets
│   ├── metrics/              # Página de métricas avanzadas
│   └── providers.tsx         # Providers (React Query, Tema)
├── components/               # Componentes reutilizables
│   ├── ui/                   # Componentes de UI básicos
│   ├── header.tsx            # Encabezado de la aplicación
│   └── sidebar.tsx           # Barra lateral de navegación
├── lib/                      # Funciones y utilidades
│   ├── api.ts                # Cliente API con validación de datos
│   ├── ws.ts                 # Cliente WebSocket
│   ├── errors.ts             # Definiciones de errores
│   └── utils.ts              # Utilidades generales
├── public/                   # Archivos estáticos
│   └── presets/              # Presets de configuración
└── README.md                 # Este archivo
```

## Integración con el backend

Este frontend se comunica con:

1. **CONTABO-BACKEND**: API REST alojada en servidor Contabo VPS
2. **CLOUDFLARE-SUPREME**: Edge computing para proxying y caching

Para instrucciones de despliegue del backend, consulta el [repositorio del backend](https://github.com/hefarica/ARBITRAGEX-CONTABO-BACKEND).

## Seguridad y validación de datos

La aplicación implementa validaciones estrictas para garantizar que solo se utilicen datos reales:

- Verificación de conectividad con los endpoints
- Validación de estados HTTP
- Verificación de integridad de los datos recibidos
- Sin mocks o datos de prueba en producción

## Reglas Anti-Rugpull

El sistema Anti-Rugpull evalúa la seguridad de los tokens mediante análisis on-chain, asignando un puntaje de seguridad (0-100) basado en:

- Edad del token
- Verificación del contrato
- Funciones peligrosas (mint, pausa, etc.)
- Distribución y bloqueo de liquidez
- Actividad y volumen

Se recomienda un puntaje mínimo de 70 para operaciones en producción.

## Compilación para producción

```bash
# Compilar para producción
npm run build

# Iniciar servidor de producción
npm start
```

## Licencia

MIT
