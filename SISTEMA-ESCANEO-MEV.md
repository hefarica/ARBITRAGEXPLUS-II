# Sistema de Escaneo Dirigido MEV - Guía Rápida

## 🎯 Características Principales

### 1. Detección de Oportunidades
- **Bridged Stables**: USDC vs USDC.e/USDbC en 5 chains (Base, Arbitrum, Polygon, Optimism, Avalanche)
- **TWAP Pools**: Prioriza pools Aerodrome, Velodrome, Balancer, Curve
- **Event Scanner**: Detección tiempo real vía WebSocket (opcional con `--features evm`)

### 2. Simulación de Arbitraje
- **2-legs**: Compra barata → Vende cara (con grid search 20 steps)
- **3-legs**: Ciclos triangulares con Bellman-Ford
- **PnL preciso**: Calcula fees, gas, spread neto

### 3. Logger JSON + HTTP
- **Persistencia**: `logs/mev-scanner.jsonl` con file locking
- **HTTP POST**: Envío automático al backend si `MEV_POST_URL` configurado
- **Eventos**: `BRIDGED_STABLE_PAIR`, `TWAP_POOL_CANDIDATE`, `SIM_2LEG_SAMPLE`, `OPPORTUNITY`

## 🚀 Uso Rápido

### Escaneo Básico (sin simulación)
```bash
./scripts/run-mev-scanner.sh
```

### Escaneo + Simulación (con variables tunables)
```bash
# Ejecutar con valores por defecto
./scripts/run-mev-scanner-sim.sh

# Personalizar parámetros
MEV_SIMULATE=1 \
THRESH_MIN_USD=2.0 \
GAS_USD=0.015 \
FEE_BPS_PER_LEG=25 \
./scripts/run-mev-scanner-sim.sh
```

### Con HTTP POST al Backend
```bash
MEV_POST_URL=http://localhost:3000/api/mev/opportunities \
MEV_POST_API_KEY=tu_api_key_aqui \
./scripts/run-mev-scanner-sim.sh
```

## 📊 Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MEV_SCANNER_CONFIG` | `mev-scanner-config.json` | Path del archivo de configuración |
| `MEV_SIMULATE` | `false` | Activar simulación 2/3-legs |
| `THRESH_MIN_USD` | `1.00` | PnL mínimo neto para considerar oportunidad |
| `GAS_USD` | `0.01` | Costo estimado de gas por transacción |
| `FEE_BPS_PER_LEG` | `30` | Fee en basis points por leg (30 = 0.30%) |
| `MEV_POST_URL` | - | URL para POST de oportunidades |
| `MEV_POST_API_KEY` | - | API key para autenticación |

## 📁 Estructura de Logs

### Formato JSONL
Cada línea es un objeto JSON con estructura:
```json
{"ts":"2025-10-06T02:50:26Z","reason":"BRIDGED_STABLE_PAIR","chain_id":8453,"a":"0x833...","b":"0xd9a..."}
{"ts":"2025-10-06T02:50:26Z","reason":"SIM_2LEG_SAMPLE","best_in":1.0,"pnl_usd":-0.018,"gas_usd":0.01}
{"ts":"2025-10-06T02:50:26Z","reason":"OPPORTUNITY","kind":"2-legs","net_usd":1.5}
```

### Tipos de Eventos
- **`BRIDGED_STABLE_PAIR`**: Par detectado de stablecoins bridgeadas
- **`TWAP_POOL_CANDIDATE`**: Pool TWAP priorizado
- **`EVENT_SWAP`**: Evento swap capturado por WebSocket (con `--features evm`)
- **`SIM_2LEG_SAMPLE`**: Resultado de simulación 2-legs
- **`OPPORTUNITY`**: Oportunidad rentable detectada (PnL > threshold)

## 🔧 Features de Compilación

```bash
# Básico (bridged + TWAP)
cargo run --bin mev-scanner --features scanners

# Con WebSocket para eventos
cargo run --bin mev-scanner --features "scanners,evm"

# Con HTTP POST al backend
cargo run --bin mev-scanner --features "scanners,http"

# Completo
cargo run --bin mev-scanner --features "scanners,evm,http"
```

## 📝 Configuración

### mev-scanner-config.json
```json
{
  "chains": [
    {
      "chain_id": 8453,
      "name": "base",
      "ws_url": "wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY",
      "pools": [],
      "assets": [
        {"address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "symbol": "USDC"},
        {"address": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "symbol": "USDbC"}
      ]
    }
  ],
  "bridgedGroups": {
    "USDC": ["USDC", "USDbC", "USDC.e"]
  },
  "prioritizeDex": ["aerodrome", "velodrome", "balancer", "curve"],
  "postUrl": "http://localhost:3000/api/mev/opportunities",
  "postApiKey": "optional_api_key"
}
```

**Nota**: Acepta tanto camelCase (`bridgedGroups`) como snake_case (`bridged_groups`)

## 🎨 Próximos Pasos

1. **Agregar cotizadores reales**: Reemplazar closures de prueba con llamadas a DexScreener/GeckoTerminal
2. **Conectar router de ejecución**: Enchufar contrato/SDK para ejecutar operaciones atómicas
3. **Dashboard UI**: Visualizar oportunidades en tiempo real desde los logs JSON/HTTP
4. **Optimización de parámetros**: Tunear `GAS_USD`, `FEE_BPS_PER_LEG` por chain/DEX
