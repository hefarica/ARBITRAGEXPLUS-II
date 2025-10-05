# Compilación Externa del Motor MEV Rust

## ⚠️ Problema

Replit no tiene suficiente memoria/CPU para compilar el motor Rust MEV completo. Necesitamos compilar en un sistema externo y subir el binario.

## Opciones de Compilación

### Opción 1: GitHub Actions (Automático) ✅ RECOMENDADO

1. Haz push de este código a GitHub
2. Ve a Actions → "Build Rust MEV Engine" → Run workflow
3. El binario se subirá automáticamente a `binaries/mev-engine`
4. Haz pull en Replit para obtener el binario

### Opción 2: Compilar en Windows con WSL2

**WSL es la ÚNICA forma confiable de compilar para Linux desde Windows.**

1. Instala WSL2:
```powershell
# En PowerShell como Administrador
wsl --install -d Ubuntu
# Reinicia Windows después de installar
```

2. Dentro de WSL Ubuntu:
```bash
# Instala Rust en WSL
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Navega al proyecto (ajusta la ruta a tu usuario)
cd /mnt/c/Users/TuUsuario/Downloads/rust-mev-engine

# Restaura Cargo.toml completo
[ -f Cargo.toml.full ] && mv Cargo.toml.full Cargo.toml

# Instala dependencias Linux
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev libpq-dev

# Compila (tomará 10-20 minutos)
cargo build --release

# Verifica el binario
ls -lh target/release/mev-engine
file target/release/mev-engine  # Debe decir: ELF 64-bit LSB executable
```

3. Sube a Replit (elige uno):

**Vía Git:**
```bash
mkdir -p binaries
cp target/release/mev-engine binaries/
git add binaries/mev-engine
git commit -m "Add compiled MEV engine"
git push
```

**Vía Upload Manual:**
- Abre Replit, crea carpeta `binaries/`
- Sube el archivo desde: `\\wsl$\Ubuntu\home\tuusuario\...\target\release\mev-engine`
- Ejecuta en Replit: `chmod +x binaries/mev-engine`

### Opción 3: Compilar en Linux

**Ubuntu/Debian:**

```bash
# Instala Rust si no lo tienes
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

cd rust-mev-engine

# Restaura Cargo.toml completo
[ -f Cargo.toml.full ] && mv Cargo.toml.full Cargo.toml

# Instala dependencias
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev libpq-dev

# Compila (10-20 minutos)
cargo build --release

# Verifica
file target/release/mev-engine  # Debe: ELF 64-bit LSB executable
```

**Sube a Replit:**
```bash
# Vía git
mkdir -p binaries
cp target/release/mev-engine binaries/
git add binaries/mev-engine
git commit -m "Add MEV engine binary"
git push
```

### Opción 4: Compilar en macOS con Docker

**macOS NO puede cross-compilar fácilmente a Linux. Usa Docker:**

```bash
# Instala Docker Desktop para Mac
# https://www.docker.com/products/docker-desktop

cd rust-mev-engine

# Restaura Cargo.toml
[ -f Cargo.toml.full ] && mv Cargo.toml.full Cargo.toml

# Compila en contenedor Linux
docker run --rm \
  -v "$PWD":/workspace \
  -w /workspace \
  rust:1.88 \
  bash -c "apt-get update && \
    apt-get install -y pkg-config libssl-dev libpq-dev && \
    cargo build --release"

# El binario está en: target/release/mev-engine
# Súbelo a Replit via git o upload manual
```

### Opción 5: Usar Motor Minimal (Solo para pruebas rápidas)

Si tienes acceso a una máquina Linux con más recursos:

```bash
cd rust-mev-engine

# Compila versión minimal (menos dependencias)
cargo build --release --bin mev-engine-minimal

# Sube a Replit en binaries/
```

## Configuración Después de Compilar

1. Crea archivo `.env` en `rust-mev-engine/`:

```env
DATABASE_URL=tu_url_de_postgres_replit
RUST_LOG=info
PORT=8080
```

2. Ejecuta el motor:

```bash
./binaries/mev-engine
```

3. El motor detectará oportunidades y las guardará en PostgreSQL

## Verificación

El motor debe:
- ✅ Conectar a PostgreSQL de Replit
- ✅ Escanear 100+ RPCs de múltiples chains
- ✅ Detectar oportunidades de arbitraje
- ✅ Guardarlas en tabla `opportunities`

Verifica logs:
```bash
tail -f rust-mev-engine/logs/mev-engine.log
```
