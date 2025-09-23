# Changelog

## [3.6.0] - 2025-09-23

### Added
- Frontend completo con Next.js 14 App Router
- Sistema Anti-Rugpull con evaluación automática de tokens
- Dashboard de oportunidades de arbitraje en tiempo real
- WebSockets para actualizaciones en vivo
- Paneles de Grafana para visualización de métricas
- Validación estricta de datos reales según las reglas absolutas
- Tema oscuro/claro para la interfaz de usuario
- Presets de configuración predefinidos
- Historial de ejecuciones con métricas detalladas
- Panel de gestión de wallet y tesorería
- Integración con servicios edge de Cloudflare

### Changed
- Arquitectura mejorada de 3 capas (Backend/Edge/Frontend)
- Refactorización completa del motor de detección de oportunidades
- Optimización del rendimiento en sistemas de producción
- Mejora del Circuit Breaker para manejo de fallos
- Sistema de prioridades dinámicas para blockchains

### Fixed
- Corrección del issue #42: Fallos intermitentes en la conexión WebSocket
- Validación correcta de tokens con alto riesgo de rugpull
- Gestión adecuada de errores en las llamadas a RPC
- Eliminación de datos simulados/falsos en toda la aplicación
- Mejora de la estabilidad en conexiones a blockchain

### Security
- Implementación de validación estricta para todas las llamadas API
- Manejo seguro de claves privadas vía variables de entorno
- Validación SHA-256 para integridad de datos
- Rate limiting inteligente para proteger contra ataques DoS
- Auditoría completa de seguridad en todos los componentes

## [3.5.2] - 2025-08-15

### Added
- Soporte para nuevas blockchains: Mantle, Blast, Mode
- Integración con la nueva versión de Uniswap V4
- Alertas por Telegram para eventos críticos

### Fixed
- Corrección de cálculos de slippage en pares de baja liquidez
- Mejora del rendimiento en la detección de oportunidades

## [3.5.1] - 2025-07-22

### Added
- Nuevo endpoint para análisis histórico de oportunidades
- Mejora en la predicción de éxito de transacciones

### Security
- Parche de seguridad para vulnerabilidad en el manejo de credenciales
- Actualización de dependencias críticas

## [3.5.0] - 2025-06-30

### Added
- Motor inicial de evaluación de riesgos para tokens
- Integración básica con Cloudflare Workers
- Primer versión del dashboard con React

### Changed
- Migración de Express a Fastify para mejor rendimiento
- Actualización del motor core a Rust 1.78

### Removed
- Descontinuación del soporte para la API legacy v2
