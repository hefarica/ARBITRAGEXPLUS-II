@echo off
chcp 65001 >nul
cls

echo ╔══════════════════════════════════════════════════════════╗
echo ║     ArbitrageX - Conectar Motor MEV Local a Replit      ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

if "%1"=="" (
    set METHOD=ngrok
) else (
    set METHOD=%1
)

if "%METHOD%"=="ngrok" goto :ngrok
if "%METHOD%"=="cloudflare" goto :cloudflare
if "%METHOD%"=="tailscale" goto :tailscale
goto :error

:ngrok
echo 📡 CONFIGURACIÓN CON NGROK
echo ════════════════════════════════════════════════════════════
echo.
echo PASO 1: Instalar ngrok
echo   choco install ngrok
echo   O descarga de: https://ngrok.com/download
echo.
echo PASO 2: Inicia tu motor MEV (en PowerShell o CMD):
echo   cd rust-mev-engine
echo   cargo run --release
echo   (Se ejecutará en puerto 8080)
echo.
echo PASO 3: En otra ventana, expón el puerto:
echo   ngrok http 8080
echo.
echo PASO 4: Copia la URL que te da ngrok
echo   Ejemplo: https://abc123.ngrok-free.app
echo.
echo PASO 5: En Replit, actualiza .env.local:
echo   NEXT_PUBLIC_API_URL=https://abc123.ngrok-free.app
echo   NEXT_PUBLIC_CF_URL=https://abc123.ngrok-free.app
echo.
echo ✅ ¡Listo! Tu PC estará conectada a Replit
goto :end

:cloudflare
echo 🌐 CONFIGURACIÓN CON CLOUDFLARE TUNNEL
echo ════════════════════════════════════════════════════════════
echo.
echo PASO 1: Instalar cloudflared
echo   winget install Cloudflare.cloudflared
echo.
echo PASO 2: Inicia tu motor MEV:
echo   cd rust-mev-engine
echo   cargo run --release
echo.
echo PASO 3: Crea el túnel (en otra ventana):
echo   cloudflared tunnel --url http://localhost:8080
echo.
echo PASO 4: Copia la URL 
echo   Ejemplo: https://random-name.trycloudflare.com
echo.
echo PASO 5: En Replit, actualiza .env.local:
echo   NEXT_PUBLIC_API_URL=https://random-name.trycloudflare.com
echo.
echo ✅ Cloudflare es más estable que ngrok (no expira)
goto :end

:tailscale
echo 🔐 CONFIGURACIÓN CON TAILSCALE (Más Seguro)
echo ════════════════════════════════════════════════════════════
echo.
echo PASO 1: Instalar Tailscale
echo   Descarga de: https://tailscale.com/download/windows
echo.
echo PASO 2: Activa Tailscale:
echo   Abre Tailscale y loguéate
echo.
echo PASO 3: Obtén tu IP de Tailscale:
echo   tailscale ip -4
echo   (algo como 100.x.x.x)
echo.
echo PASO 4: En Replit (terminal):
echo   tailscale up
echo.
echo PASO 5: En Replit, actualiza .env.local:
echo   NEXT_PUBLIC_API_URL=http://100.x.x.x:8080
echo   (usa tu IP de Tailscale)
echo.
echo ✅ Tailscale crea una VPN privada (más seguro)
goto :end

:error
echo ❌ Método no válido
echo Uso: connect-local.bat [ngrok^|cloudflare^|tailscale]
goto :end

:end
echo.
echo ════════════════════════════════════════════════════════════
echo 📌 COMPARACIÓN DE MÉTODOS:
echo ════════════════════════════════════════════════════════════
echo.
echo NGROK:
echo   ✅ Más fácil de configurar
echo   ❌ URL cambia cada vez que reinicias
echo   💰 Gratis con límites
echo.
echo CLOUDFLARE:
echo   ✅ URL más estable
echo   ✅ Sin límites estrictos
echo   🔧 Un poco más complejo
echo.
echo TAILSCALE:
echo   ✅ Más seguro (VPN privada)
echo   ✅ Conexión directa
echo   🔐 Requiere cuenta (gratis)
echo.
echo IMPORTANTE:
echo • Tu PC debe estar encendida
echo • Windows Firewall puede pedir permisos
echo • Reinicia el servidor en Replit después de cambiar .env.local
echo.
pause