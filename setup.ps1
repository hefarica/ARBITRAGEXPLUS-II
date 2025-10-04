# ArbitrageX Supreme V3.6 - Script de Instalación Automatizada para Windows
# Versión: 1.0
# Descripción: Instala Node.js, dependencias y configura el entorno local

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ArbitrageX Supreme V3.6 - Instalación Local" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Función para verificar si Node.js está instalado
function Test-NodeJS {
    Write-Host "Verificando instalación de Node.js..." -ForegroundColor Yellow
    try {
        $nodeVersion = node -v 2>$null
        if ($nodeVersion) {
            Write-Host "✓ Node.js encontrado: $nodeVersion" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "✗ Node.js no está instalado" -ForegroundColor Red
        return $false
    }
    return $false
}

# Función para instalar Node.js
function Install-NodeJS {
    Write-Host ""
    Write-Host "Instalando Node.js..." -ForegroundColor Yellow
    
    # Intentar instalar con winget primero
    Write-Host "Intentando instalar con winget..." -ForegroundColor Cyan
    try {
        $wingetInstall = winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Node.js instalado exitosamente con winget" -ForegroundColor Green
            
            # Refrescar variables de entorno
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            Start-Sleep -Seconds 3
            return $true
        }
    } catch {
        Write-Host "winget no disponible, intentando con chocolatey..." -ForegroundColor Yellow
    }
    
    # Si winget falla, intentar con chocolatey
    try {
        $chocoInstalled = Get-Command choco -ErrorAction SilentlyContinue
        if ($chocoInstalled) {
            choco install nodejs-lts -y
            Write-Host "✓ Node.js instalado exitosamente con chocolatey" -ForegroundColor Green
            
            # Refrescar variables de entorno
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            return $true
        } else {
            Write-Host "✗ Chocolatey no está instalado" -ForegroundColor Red
            Write-Host ""
            Write-Host "Por favor, instala Node.js manualmente desde: https://nodejs.org/" -ForegroundColor Yellow
            Write-Host "Luego ejecuta este script nuevamente." -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "✗ Error al instalar Node.js" -ForegroundColor Red
        Write-Host "Por favor, instala Node.js manualmente desde: https://nodejs.org/" -ForegroundColor Yellow
        return $false
    }
}

# Función para instalar dependencias del proyecto
function Install-Dependencies {
    Write-Host ""
    Write-Host "Instalando dependencias del proyecto..." -ForegroundColor Yellow
    
    try {
        npm install
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Dependencias instaladas correctamente" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ Error al instalar dependencias" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "✗ Error al ejecutar npm install" -ForegroundColor Red
        return $false
    }
}

# Función para configurar variables de entorno
function Configure-Environment {
    Write-Host ""
    Write-Host "Configurando variables de entorno..." -ForegroundColor Yellow
    
    $envFile = ".env.local"
    
    # Solicitar URLs al usuario
    Write-Host ""
    Write-Host "Ingresa las URLs de tu backend (presiona Enter para usar valores por defecto):" -ForegroundColor Cyan
    Write-Host ""
    
    $apiUrl = Read-Host "URL de tu API Backend [http://localhost:3000]"
    if ([string]::IsNullOrWhiteSpace($apiUrl)) {
        $apiUrl = "http://localhost:3000"
    }
    
    $cfUrl = Read-Host "URL de Cloudflare Workers [https://arbitragex-supreme.workers.dev]"
    if ([string]::IsNullOrWhiteSpace($cfUrl)) {
        $cfUrl = "https://arbitragex-supreme.workers.dev"
    }
    
    $wsUrl = Read-Host "URL de WebSocket [wss://arbitragex-supreme.workers.dev/ws]"
    if ([string]::IsNullOrWhiteSpace($wsUrl)) {
        $wsUrl = "wss://arbitragex-supreme.workers.dev/ws"
    }
    
    # Crear archivo .env.local
    $envContent = @"
# ArbitrageX Supreme V3.6 - Configuración Local
# Generado automáticamente por setup.ps1

# URL de la API del backend
NEXT_PUBLIC_API_URL=$apiUrl

# URL de Cloudflare Workers
NEXT_PUBLIC_CF_URL=$cfUrl

# URL de WebSocket
NEXT_PUBLIC_WS_URL=$wsUrl

# Puerto de desarrollo
PORT=3000
"@
    
    try {
        Set-Content -Path $envFile -Value $envContent -Encoding UTF8
        Write-Host "✓ Archivo .env.local creado correctamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "Configuración guardada:" -ForegroundColor Cyan
        Write-Host "  API URL: $apiUrl" -ForegroundColor White
        Write-Host "  CF URL:  $cfUrl" -ForegroundColor White
        Write-Host "  WS URL:  $wsUrl" -ForegroundColor White
        return $true
    } catch {
        Write-Host "✗ Error al crear archivo .env.local" -ForegroundColor Red
        return $false
    }
}

# Función para iniciar el servidor de desarrollo
function Start-DevServer {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  Iniciando servidor de desarrollo..." -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "El dashboard estará disponible en: http://localhost:3000" -ForegroundColor Green
    Write-Host "Presiona Ctrl+C para detener el servidor" -ForegroundColor Yellow
    Write-Host ""
    
    npm run dev:local
}

# ===== EJECUCIÓN PRINCIPAL =====

# Verificar e instalar Node.js si es necesario
if (-not (Test-NodeJS)) {
    if (-not (Install-NodeJS)) {
        Write-Host ""
        Write-Host "Instalación cancelada. Instala Node.js manualmente y vuelve a ejecutar este script." -ForegroundColor Red
        exit 1
    }
    
    # Verificar nuevamente después de instalar
    if (-not (Test-NodeJS)) {
        Write-Host ""
        Write-Host "✗ Node.js no se detectó después de la instalación" -ForegroundColor Red
        Write-Host "  Cierra y vuelve a abrir PowerShell, luego ejecuta este script nuevamente" -ForegroundColor Yellow
        exit 1
    }
}

# Instalar dependencias
if (-not (Install-Dependencies)) {
    Write-Host ""
    Write-Host "Instalación cancelada debido a errores." -ForegroundColor Red
    exit 1
}

# Configurar entorno
if (-not (Configure-Environment)) {
    Write-Host ""
    Write-Host "Instalación cancelada debido a errores." -ForegroundColor Red
    exit 1
}

# Preguntar si desea iniciar el servidor ahora
Write-Host ""
$startNow = Read-Host "¿Deseas iniciar el servidor de desarrollo ahora? (S/N) [S]"
if ([string]::IsNullOrWhiteSpace($startNow) -or $startNow -eq "S" -or $startNow -eq "s") {
    Start-DevServer
} else {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  Instalación completada exitosamente!" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Para iniciar el servidor manualmente, ejecuta:" -ForegroundColor Yellow
    Write-Host "  npm run dev:local" -ForegroundColor White
    Write-Host ""
}
