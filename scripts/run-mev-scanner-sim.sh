#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Config del scanner
export MEV_SCANNER_CONFIG="${MEV_SCANNER_CONFIG:-$REPO_ROOT/mev-scanner-config.json}"

# Flags de simulación (puedes tunearlos desde el dashboard en el futuro)
export MEV_SIMULATE="${MEV_SIMULATE:-1}"
export THRESH_MIN_USD="${THRESH_MIN_USD:-1.00}"
export GAS_USD="${GAS_USD:-0.01}"
export FEE_BPS_PER_LEG="${FEE_BPS_PER_LEG:-30}"

echo "[mev-scanner-sim] config=$MEV_SCANNER_CONFIG MEV_SIMULATE=$MEV_SIMULATE THRESH_MIN_USD=$THRESH_MIN_USD GAS_USD=$GAS_USD FEE_BPS_PER_LEG=$FEE_BPS_PER_LEG"
cd "$REPO_ROOT/rust-mev-engine"

# Detectar si hay POST HTTP habilitado y compilar con features correctas
if [ -n "${MEV_POST_URL:-}" ]; then
    echo "[mev-scanner-sim] HTTP POST enabled to $MEV_POST_URL"
    cargo run --bin mev-scanner --features "scanners,http"
else
    cargo run --bin mev-scanner --features scanners
fi
