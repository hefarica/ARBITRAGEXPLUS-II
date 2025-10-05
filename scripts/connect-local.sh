#!/bin/bash

# Script para conectar tu máquina local con el dashboard de Replit
# Uso: ./connect-local.sh [ngrok|cloudflare|tailscale]

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     ArbitrageX - Conectar Motor MEV Local a Replit      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

METHOD=${1:-ngrok}

case $METHOD in
  ngrok)
    echo "📡 Configurando con NGROK..."
    echo ""
    echo "1. Asegúrate de tener ngrok instalado:"
    echo "   - Windows: choco install ngrok"
    echo "   - Mac: brew install ngrok"
    echo "   - Linux: snap install ngrok"
    echo ""
    echo "2. Inicia tu motor MEV local:"
    echo "   cd rust-mev-engine"
    echo "   cargo run --release"
    echo ""
    echo "3. En otra terminal, expón el puerto:"
    echo "   ngrok http 8080"
    echo ""
    echo "4. Copia la URL que te da ngrok (https://xxxxx.ngrok.io)"
    echo ""
    echo "5. Actualiza .env.local en Replit:"
    echo "   NEXT_PUBLIC_API_URL=https://xxxxx.ngrok.io"
    echo ""
    echo "✅ ¡Listo! Tu máquina local estará conectada a Replit"
    ;;
    
  cloudflare)
    echo "🌐 Configurando con CLOUDFLARE TUNNEL..."
    echo ""
    echo "1. Instala cloudflared:"
    echo "   - Windows: winget install Cloudflare.cloudflared"
    echo "   - Mac: brew install cloudflared"
    echo "   - Linux: sudo apt install cloudflared"
    echo ""
    echo "2. Inicia tu motor MEV local:"
    echo "   cd rust-mev-engine"
    echo "   cargo run --release"
    echo ""
    echo "3. Crea el túnel:"
    echo "   cloudflared tunnel --url http://localhost:8080"
    echo ""
    echo "4. Copia la URL (https://xxxxx.trycloudflare.com)"
    echo ""
    echo "5. Actualiza .env.local en Replit:"
    echo "   NEXT_PUBLIC_API_URL=https://xxxxx.trycloudflare.com"
    echo ""
    echo "✅ Cloudflare Tunnel es más estable que ngrok"
    ;;
    
  tailscale)
    echo "🔐 Configurando con TAILSCALE (más seguro)..."
    echo ""
    echo "1. Instala Tailscale en tu máquina:"
    echo "   https://tailscale.com/download"
    echo ""
    echo "2. Activa Tailscale:"
    echo "   tailscale up"
    echo ""
    echo "3. Obtén tu IP de Tailscale:"
    echo "   tailscale ip -4"
    echo ""
    echo "4. En Replit, activa Tailscale:"
    echo "   tailscale up"
    echo ""
    echo "5. Actualiza .env.local con tu IP:"
    echo "   NEXT_PUBLIC_API_URL=http://100.x.x.x:8080"
    echo ""
    echo "✅ Tailscale es la opción más segura (VPN privada)"
    ;;
    
  *)
    echo "❌ Método no válido. Usa: ngrok, cloudflare o tailscale"
    exit 1
    ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📌 NOTAS IMPORTANTES:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "• NGROK: Gratis pero URLs cambian cada vez"
echo "• Cloudflare: Gratis y más estable"
echo "• Tailscale: Más seguro, requiere cuenta gratuita"
echo ""
echo "• Tu máquina debe estar encendida para que funcione"
echo "• El firewall de Windows puede pedir permisos"
echo "• Reinicia el servidor de Replit después de cambiar .env.local"
echo ""