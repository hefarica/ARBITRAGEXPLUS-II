@echo off
echo ╔══════════════════════════════════════════════════════════╗
echo ║         ArbitrageX - Motor MEV Local → Replit           ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

echo 🚀 PASO 1: Iniciando Motor MEV en puerto 8080...
echo ════════════════════════════════════════════════════════════
cd rust-mev-engine
start /B cargo run --release

timeout /t 5 >nul

echo.
echo ✅ Motor MEV iniciándose en http://localhost:8080
echo.
echo 🌐 PASO 2: Exponiendo con ngrok...
echo ════════════════════════════════════════════════════════════
echo.
echo Ejecuta en otra ventana CMD:
echo.
echo   ngrok http 8080
echo.
echo Te dará una URL como:
echo   https://abc123.ngrok-free.app
echo.
echo 📝 PASO 3: Actualiza en Replit el archivo .env.local:
echo ════════════════════════════════════════════════════════════
echo.
echo   NEXT_PUBLIC_API_URL=https://abc123.ngrok-free.app
echo   NEXT_PUBLIC_CF_URL=https://abc123.ngrok-free.app
echo.
echo Luego reinicia el servidor en Replit
echo.
pause