# Errores de Integración Pendientes - ARBITRAGEXPLUS-II

## Resumen Ejecutivo

**Total de errores críticos**: 35  
**Categorías principales**: 7

---

## 1. Métodos Faltantes en Database (3 errores)

### Error 1.1: `get_pending_executions`

```
error[E0599]: no method named `get_pending_executions` found for struct `Arc<Database>`
```

**Ubicación**: `src/executor.rs`  
**Solución**: Implementar método en `database.rs`:

```rust
pub async fn get_pending_executions(&self, limit: i64) -> Result<Vec<Execution>> {
    let query = r#"
        SELECT id, opportunity_id, status, strategy, chain, 
               target_chain, tx_hash, chain_id, amount_in, 
               profit_usd, gas_usd, created_at, updated_at, metadata
        FROM executions 
        WHERE status = 'pending' 
        ORDER BY created_at ASC 
        LIMIT $1
    "#;
    
    let rows = self.client.query(query, &[&limit]).await?;
    // Mapear rows a Vec<Execution>
}
```

### Error 1.2: `mark_opportunity_pending`

```
error[E0599]: no method named `mark_opportunity_pending` found for struct `Arc<Database>`
```

**Ubicación**: `src/executor.rs`  
**Solución**: Implementar método en `database.rs`:

```rust
pub async fn mark_opportunity_pending(&self, opportunity_id: &str) -> Result<()> {
    let query = r#"
        UPDATE opportunities 
        SET metadata = jsonb_set(metadata, '{status}', '"pending"'), 
            ts = $2 
        WHERE id = $1
    "#;
    
    let now = chrono::Utc::now().timestamp_millis();
    self.client.execute(query, &[&opportunity_id, &now]).await?;
    Ok(())
}
```

---

## 2. Métodos Faltantes en Executor (2 errores)

### Error 2.1: `build_kit_de_armado_bundle`

```
error[E0599]: no method named `build_kit_de_armado_bundle` found for reference `&executor::Executor`
```

**Ubicación**: `src/executor.rs` línea ~647  
**Causa**: El método existe pero está fuera del `impl Executor`  
**Solución**: Verificar que esté dentro del bloque `impl Executor { ... }`

### Error 2.2: `simulate_transaction`

```
error[E0599]: no method named `simulate_transaction` found for reference `&executor::Executor`
```

**Ubicación**: `src/executor.rs` línea ~675  
**Causa**: El método existe pero está fuera del `impl Executor`  
**Solución**: Mover dentro del `impl Executor { ... }`

---

## 3. Campos Faltantes en Estructuras (10 errores)

### Error 3.1-3.3: ExecutionConfig

```
error[E0609]: no field `flashbots_enabled` on type `ExecutionConfig`
error[E0609]: no field `bloxroute_enabled` on type `ExecutionConfig`
error[E0609]: no field `mev_share_enabled` on type `ExecutionConfig`
```

**Ubicación**: `src/config.rs`  
**Solución**: Agregar campos a `ExecutionConfig`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    pub max_gas_price_gwei: f64,
    pub max_slippage_percent: f64,
    pub flashbots_enabled: bool,      // AGREGAR
    pub bloxroute_enabled: bool,      // AGREGAR
    pub mev_share_enabled: bool,      // AGREGAR
    pub simulation_required: bool,
    pub dry_run: bool,
}
```

### Error 3.4: Execution.kit_de_armado

```
error[E0609]: no field `kit_de_armado` on type `&Execution`
```

**Ubicación**: `src/database.rs`  
**Solución**: Agregar campo opcional a `Execution`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Execution {
    pub id: String,
    pub opportunity_id: Option<String>,
    pub status: String,
    pub strategy: String,
    pub chain: String,
    pub target_chain: Option<String>,
    pub tx_hash: Option<String>,
    pub chain_id: i32,
    pub amount_in: String,
    pub profit_usd: Option<f64>,
    pub gas_usd: Option<f64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub metadata: Option<serde_json::Value>,
    pub kit_de_armado: Option<serde_json::Value>,  // AGREGAR
}
```

### Error 3.5-3.6: ArbitrageKit

```
error[E0609]: no field `pasos` on type `&ArbitrageKit`
error[E0609]: no field `chain` on type `&ArbitrageKit`
```

**Ubicación**: `src/types.rs`  
**Solución**: Agregar campos a `ArbitrageKit`:

```rust
#[derive(Debug, Clone)]
pub struct ArbitrageKit {
    pub id: String,
    pub chain: String,                              // AGREGAR
    pub operations: Vec<ArbitrageOperation>,
    pub pasos: Vec<Paso>,                          // AGREGAR
    pub estimated_profit: f64,
    pub estimated_gas_cost: f64,
    pub blockchain_id: String,
    pub timestamp: u64,
    pub validated_addresses: HashMap<String, Address>,
}

// AGREGAR estructura Paso
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paso {
    pub contrato: String,
    pub valor: String,
    pub calldata: String,
}
```

### Error 3.7: GasOracle.gas_oracle

```
error[E0609]: no field `gas_oracle` on type `&executor::GasOracle`
```

**Ubicación**: `src/executor.rs`  
**Causa**: Referencia circular o campo mal nombrado  
**Solución**: Revisar código que accede a `self.gas_oracle.gas_oracle` y cambiar a método correcto

### Error 3.8-3.9: Tupla de simulación

```
error[E0609]: no field `success` on type `&(bool, ethers::types::Bytes)`
error[E0609]: no field `return_data` on type `&(bool, ethers::types::Bytes)`
```

**Ubicación**: `src/executor.rs`  
**Causa**: Acceso a tupla como si fuera struct  
**Solución**: Usar índices de tupla:

```rust
// En lugar de:
let success = result.success;
let data = result.return_data;

// Usar:
let success = result.0;
let data = result.1;
```

### Error 3.10-3.11: Inicializadores incompletos

```
error[E0063]: missing fields `address_validator` and `data_fetcher` in initializer of `MevScanner`
error[E0063]: missing fields `reverted_transactions` and `validation_failures` in initializer of `Monitoring`
```

**Ubicación**: `src/mev_scanner.rs:485`, `src/monitoring.rs:417`  
**Causa**: Inicializadores de structs en tests o funciones auxiliares incompletos  
**Solución**: Agregar campos faltantes en los inicializadores

---

## 4. Método Faltante en StrategiesConfig (3 errores)

### Error 4.1-4.3: `is_strategy_enabled`

```
error[E0599]: no method named `is_strategy_enabled` found for reference `&StrategiesConfig`
```

**Ubicación**: `src/config.rs` (usado en múltiples lugares)  
**Solución**: Implementar método en `impl StrategiesConfig`:

```rust
impl StrategiesConfig {
    pub fn is_strategy_enabled(&self, strategy: &str) -> bool {
        match strategy {
            "dex-arb" | "dex_arbitrage" => self.dex_arbitrage_enabled,
            "cross-chain" | "cross_chain" => self.cross_chain_enabled,
            "liquidation" => self.liquidation_enabled,
            "sandwich" => self.sandwich_enabled,
            "frontrun" => self.frontrun_enabled,
            _ => false,
        }
    }
}
```

---

## 5. Errores de Tipos Incompatibles (8 errores)

### Error 5.1-5.8: Mismatched types

```
error[E0308]: mismatched types
```

**Ubicación**: Múltiples archivos  
**Causas comunes**:
- Conversión entre `String` y `&str`
- Conversión entre `U256` y `f64`
- Opcionales (`Option<T>`) vs valores directos
- Referencias vs valores owned

**Soluciones generales**:

```rust
// String <-> &str
let s: String = string_ref.to_string();
let s: &str = &owned_string;

// U256 <-> f64
let f: f64 = u256_value.as_u128() as f64;
let u: U256 = U256::from((f_value as u128));

// Option handling
let value = optional.unwrap_or_default();
let value = optional.ok_or_else(|| anyhow!("Missing value"))?;

// Referencias
let owned = reference.clone();
let reference = &owned_value;
```

---

## 6. Errores de Argumentos (4 errores)

### Error 6.1-6.4: Argumentos incorrectos

```
error[E0061]: this method takes 2 arguments but 1 argument was supplied
```

**Ubicación**: Múltiples archivos  
**Solución**: Revisar firmas de métodos y agregar argumentos faltantes

**Ejemplo**:
```rust
// Si el método espera:
fn validate_address(&self, chain: &str, address: &str) -> Result<bool>

// Y se llama como:
validator.validate_address(address)

// Corregir a:
validator.validate_address(chain, address)
```

---

## 7. Otros Errores (5 errores)

### Error 7.1: Valor movido (risk_level)

```
error[E0382]: use of moved value: `risk_level`
```

**Solución**: Clonar el valor antes de moverlo:

```rust
let risk_level_clone = risk_level.clone();
// Usar risk_level_clone en lugar de risk_level la segunda vez
```

### Error 7.2: Trait Debug no implementado

```
error[E0277]: `T` doesn't implement `std::fmt::Debug`
```

**Solución**: Agregar bound de trait:

```rust
// En lugar de:
fn foo<T>(value: T) -> Result<()>

// Usar:
fn foo<T: std::fmt::Debug>(value: T) -> Result<()>
```

### Error 7.3: Tipo numérico ambiguo

```
error[E0689]: can't call method `max` on ambiguous numeric type `{float}`
```

**Solución**: Especificar tipo explícitamente:

```rust
// En lugar de:
let x = 0.0;
let max_value = x.max(other);

// Usar:
let x: f64 = 0.0;
let max_value = x.max(other);
```

### Error 7.4: Clone no satisfecho para DashMap

```
error[E0599]: the method `clone` exists for struct `DashMap<...>`, but its trait bounds were not satisfied
```

**Causa**: `DashMap<String, AtomicUsize>` no es clonable porque `AtomicUsize` no implementa `Clone`  
**Solución**: Usar `Arc` para compartir:

```rust
// En lugar de:
round_robin_indices: self.round_robin_indices.clone()

// Usar:
round_robin_indices: Arc::clone(&self.round_robin_indices)
```

### Error 7.5-7.6: Valores movidos (db, rpc_manager)

```
error[E0382]: borrow of moved value: `db`
error[E0382]: borrow of moved value: `rpc_manager`
```

**Solución**: Clonar Arc antes de mover:

```rust
let db_clone = Arc::clone(&db);
let rpc_clone = Arc::clone(&rpc_manager);

// Usar db_clone y rpc_clone en los lugares donde se mueve
```

---

## Resumen por Prioridad

### 🔴 Alta Prioridad (Bloquean funcionalidad core) - 8 errores

1. **Métodos faltantes en Database** (2 métodos)
   - `get_pending_executions`
   - `mark_opportunity_pending`

2. **Campos faltantes en ExecutionConfig** (3 campos)
   - `flashbots_enabled`
   - `bloxroute_enabled`
   - `mev_share_enabled`

3. **Campos faltantes en ArbitrageKit** (2 campos + 1 struct)
   - `chain`
   - `pasos`
   - Struct `Paso`

4. **Método is_strategy_enabled** (1 método)

### 🟡 Media Prioridad (Afectan features específicas) - 7 errores

5. **Métodos fuera de impl block** (2 métodos)
   - `build_kit_de_armado_bundle`
   - `simulate_transaction`

6. **Campo kit_de_armado en Execution** (1 campo)

7. **Acceso a tuplas** (2 correcciones)
   - `result.success` → `result.0`
   - `result.return_data` → `result.1`

8. **Inicializadores incompletos** (2 correcciones)

### 🟢 Baja Prioridad (Ajustes menores) - 20 errores

9. **Tipos incompatibles** (8 conversiones)
10. **Argumentos incorrectos** (4 ajustes)
11. **Valores movidos** (3 clones)
12. **Otros** (5 ajustes)

---

## Estimación de Tiempo

| Prioridad | Errores | Tiempo Estimado |
|-----------|---------|-----------------|
| 🔴 Alta | 8 | 2-3 horas |
| 🟡 Media | 7 | 1-2 horas |
| 🟢 Baja | 20 | 2-3 horas |
| **TOTAL** | **35** | **5-8 horas** |

---

## Plan de Acción Recomendado

### Fase 1: Alta Prioridad (2-3 horas)

1. **Implementar métodos en Database** (30 min)
   - `get_pending_executions`
   - `mark_opportunity_pending`

2. **Agregar campos a ExecutionConfig** (15 min)
   - `flashbots_enabled`, `bloxroute_enabled`, `mev_share_enabled`

3. **Agregar campos a ArbitrageKit** (30 min)
   - `chain`, `pasos`
   - Crear struct `Paso`

4. **Implementar is_strategy_enabled** (15 min)

5. **Compilar y verificar** (30 min)

### Fase 2: Media Prioridad (1-2 horas)

6. **Mover métodos dentro de impl Executor** (20 min)
7. **Agregar campo kit_de_armado** (10 min)
8. **Corregir acceso a tuplas** (15 min)
9. **Completar inicializadores** (15 min)
10. **Compilar y verificar** (30 min)

### Fase 3: Baja Prioridad (2-3 horas)

11. **Corregir tipos incompatibles** (60 min)
12. **Ajustar argumentos** (30 min)
13. **Resolver valores movidos** (30 min)
14. **Otros ajustes** (30 min)
15. **Compilación final y testing** (30 min)

---

## Comandos Útiles

```bash
# Compilar y ver solo errores críticos
cargo check 2>&1 | grep "^error\[E" | grep -v "unused"

# Contar errores por tipo
cargo check 2>&1 | grep "^error\[E" | cut -d: -f1 | sort | uniq -c

# Ver errores de un archivo específico
cargo check 2>&1 | grep "src/database.rs"

# Limpiar y recompilar
cargo clean && cargo check
```

---

**Última actualización**: 6 de octubre de 2025  
**Estado**: 35 errores críticos pendientes  
**Progreso**: 31.7% de reducción desde el inicio (167 → 114 total, 35 críticos)
