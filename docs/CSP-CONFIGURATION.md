# Content Security Policy (CSP) - Configuración para Next.js

## ⚠️ PROBLEMA CRÍTICO RESUELTO

### Síntoma
La aplicación se quedaba con el spinner de carga infinito. Las páginas no cargaban y mostraban pantalla en blanco.

### Causa Raíz
El **Content Security Policy (CSP)** bloqueaba los scripts inline de Next.js necesarios para:
- Hidratación del HTML
- Hot Module Replacement (HMR)
- Inicialización de componentes React

**Error en consola del navegador:**
```
Refused to execute inline script because it violates the following Content Security Policy directive: 
"script-src 'self' 'unsafe-eval'". Either the 'unsafe-inline' keyword... is required to enable inline execution.
```

### Solución Aplicada ✅

En `next.config.js`, el CSP fue corregido agregando `'unsafe-inline'`:

```javascript
{
  key: 'Content-Security-Policy',
  value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss: blob:; worker-src 'self' blob:; frame-ancestors 'none';",
}
```

**Elementos críticos del CSP para Next.js:**

| Directiva | Valor | Propósito |
|-----------|-------|-----------|
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline'` | Permite scripts Next.js (hidratación, HMR) |
| `worker-src` | `'self' blob:` | Monaco Editor web workers |
| `connect-src` | `'self' https: wss: blob:` | APIs, WebSockets, workers |
| `style-src` | `'self' 'unsafe-inline'` | CSS inline de componentes |

## 🔒 Balance Seguridad vs Funcionalidad

### ¿Por qué 'unsafe-inline'?

Next.js genera scripts inline para:
1. **Hidratación del HTML** - Convertir HTML estático en interactivo
2. **Self-hosted fonts** - Optimización de fuentes
3. **HMR (desarrollo)** - Hot reloading

**Alternativas más seguras (futuro):**
- Usar nonces (`nonce-xxx`) generados dinámicamente
- Migrar a CSP con hashes SHA-256 de scripts específicos

## ⚠️ REGLAS PARA EVITAR REGRESIONES

### ❌ NUNCA hacer esto:
```javascript
// CSP SIN 'unsafe-inline' - ROMPE Next.js
script-src 'self' 'unsafe-eval';  // ❌ Bloquea hidratación
```

### ✅ SIEMPRE verificar:
1. **Antes de modificar CSP**: Probar en `/admin/chains` y otras páginas
2. **Después de cambios de seguridad**: Ejecutar test e2e
3. **En producción**: Verificar que no hay errores CSP en consola

## 🧪 Checklist de Verificación

Cuando modifiques headers de seguridad:

- [ ] La página `/admin/chains` carga sin spinner infinito
- [ ] La consola del navegador NO muestra errores CSP
- [ ] Monaco Editor funciona (worker-src blob)
- [ ] WebSockets funcionan (connect-src wss)
- [ ] Tema dark/light funciona correctamente

## 📋 Configuración Completa Actual

```javascript
// next.config.js - Headers de Seguridad
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(), payment=()',
        },
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss: blob:; worker-src 'self' blob:; frame-ancestors 'none';",
        },
        {
          key: 'Cache-Control',
          value: 'no-cache, no-store, must-revalidate',
        },
      ],
    },
  ];
}
```

## 🔗 Referencias

- [Next.js Security Headers](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator (Google)](https://csp-evaluator.withgoogle.com/)

---

**Última actualización:** 6 de Octubre 2025  
**Estado:** ✅ Funcional y verificado
