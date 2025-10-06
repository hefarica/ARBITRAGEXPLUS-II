#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Permite sobreescribir el path de config con MEV_SCANNER_CONFIG
export MEV_SCANNER_CONFIG="${MEV_SCANNER_CONFIG:-$REPO_ROOT/mev-scanner-config.json}"

echo "[mev-scanner] using config: $MEV_SCANNER_CONFIG"
cd "$REPO_ROOT/rust-mev-engine"

# Solo escáner básico (bridged, twap, sin WS):
cargo run --bin mev-scanner --features scanners

# Para habilitar eventos EVM por WS (si ya configuraste las URLs):
# cargo run --bin mev-scanner --features evm
