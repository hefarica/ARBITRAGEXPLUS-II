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


## Directrices de Colaboración para el Agente (con Manus AI)

Para asegurar un flujo de trabajo colaborativo eficiente en el repositorio de GitHub `https://github.com/hefarica/ARBITRAGEXPLUS-II.git` con Manus AI, tu agente debe seguir estas directrices:

### 1. Sincronización de Cambios Remotos (Pull):

Antes de iniciar cualquier tarea o realizar modificaciones significativas, tu agente **DEBE** realizar un `git pull --rebase` para obtener los últimos cambios del repositorio remoto. Esto asegura que siempre esté trabajando con la versión más actualizada del código y minimiza los conflictos.

**Acción Requerida:**
```bash
cd /ruta/al/repositorio/ARBITRAGEXPLUS-II
git pull --rebase
```

**Frecuencia:**
*   Al inicio de cada sesión de trabajo.
*   Antes de comenzar una nueva tarea o subtarea importante.
*   Si se detecta que el repositorio remoto ha sido actualizado (por ejemplo, a través de notificaciones o un `git fetch`).

### 2. Realización de Cambios y Commits:

Tu agente **DEBE** realizar cambios de manera incremental, enfocándose en tareas específicas. Cada conjunto de cambios lógicos **DEBE** ser commiteado con un mensaje claro y descriptivo.

**Acción Requerida:**
```bash
cd /ruta/al/repositorio/ARBITRAGEXPLUS-II
git add .
git commit -m "[Tipo]: Descripción concisa de los cambios realizados"
```

**Formato del Mensaje de Commit:**
*   Utilizar prefijos estandarizados para el tipo de cambio (ej. `feat:` para nuevas funcionalidades, `fix:` para correcciones de errores, `docs:` para documentación, `refactor:` para refactorización de código, `chore:` para tareas de mantenimiento).
*   La descripción debe ser clara y concisa, explicando *qué* se hizo y *por qué*.

### 3. Envío de Cambios al Repositorio Remoto (Push):

Una vez que los cambios locales han sido commiteados y se ha verificado que no hay conflictos con la rama remota (después de un `git pull --rebase` exitoso), tu agente **DEBE** enviar sus cambios al repositorio remoto.

**Acción Requerida:**
```bash
cd /ruta/al/repositorio/ARBITRAGEXPLUS-II
git push
```

**Frecuencia:**
*   Después de completar una tarea o subtarea lógica.
*   Regularmente para compartir el progreso y evitar grandes divergencias.

### 4. Comunicación de Cambios Significativos y Conflictos:

Tu agente **DEBE** comunicar proactivamente cualquier cambio significativo que realice o cualquier conflicto que encuentre.

**Acción Requerida:**
*   **Cambios Significativos**: Si tu agente implementa una nueva funcionalidad importante, refactoriza una sección crítica del código o toma una decisión de diseño relevante, **DEBE** generar un breve resumen de estos cambios y comunicarlo al usuario (quien a su vez lo comunicará a Manus AI).
*   **Conflictos de Fusión (Merge Conflicts)**: Si un `git pull --rebase` resulta en conflictos que tu agente no puede resolver automáticamente o que requieren una decisión de diseño, **DEBE** notificar al usuario, describiendo el conflicto y las opciones de resolución.

**Formato de Comunicación (al usuario):**
```markdown
**[URGENTE/INFO]: Actualización del Repositorio ARBITRAGEXPLUS-II**

**Tipo de Actualización:** [Cambio Significativo / Conflicto de Fusión]

**Descripción:**
[Detalles de los cambios realizados o del conflicto encontrado. Incluir archivos afectados, módulos, y cualquier implicación relevante.]

**Acciones Sugeridas (si aplica):**
[Por ejemplo: "Se requiere revisión manual de los cambios en X archivo", "Se necesita una decisión sobre cómo resolver el conflicto en Y módulo".]
```

### 5. Reconocimiento de Cambios de Manus AI:

Tu agente **DEBE** estar preparado para integrar los cambios realizados por Manus AI. El `git pull --rebase` regular es la principal herramienta para esto. Si se encuentran cambios inesperados o que afectan la lógica de su trabajo, **DEBE** analizar el `git log` y el `git diff` para entender las modificaciones y adaptar su plan de trabajo si es necesario.

**Acción Requerida:**
```bash
cd /ruta/al/repositorio/ARBITRAGEXPLUS-II
git log --oneline -n 5 # Para ver los últimos 5 commits
git diff HEAD~1 # Para ver los cambios del último commit
```

Al seguir estas directrices, tu agente y Manus AI pueden trabajar de manera eficiente y coordinada en el desarrollo del bot MEV, asegurando que el repositorio `ARBITRAGEXPLUS-II` evolucione de manera robusta y sin interrupciones.

