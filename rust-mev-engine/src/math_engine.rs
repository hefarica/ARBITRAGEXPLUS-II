use crate::types::{PoolReserves, DexFees, GasCostEstimator};

/// Calcula el beneficio neto para una cantidad dada de token de entrada (x_in)
/// en una ruta de arbitraje A -> B -> A.
/// Se asume un modelo de AMM x*y=k (Uniswap V2).
pub fn calculate_profit(
    x_in: f64,
    pool1_reserves: &PoolReserves,
    pool2_reserves: &PoolReserves,
    dex_fees: &DexFees,
    gas_estimator: &GasCostEstimator,
) -> f64 {
    if x_in <= 0.0 {
        return -f64::INFINITY; // No se puede operar con cantidad no positiva
    }

    // Swap 1: A -> B en Pool 1
    // amount_b_out = (x_in * reserve_b_pool1) / (reserve_a_pool1 + x_in) * (1 - fee_rate_pool1)
    let amount_b_out = (x_in * pool1_reserves.reserve_b) / (pool1_reserves.reserve_a + x_in) * (1.0 - dex_fees.fee_rate_pool1);

    if amount_b_out <= 0.0 {
        return -f64::INFINITY; // No hay salida del primer swap
    }

    // Swap 2: B -> A en Pool 2
    // amount_a_out = (amount_b_out * reserve_a_pool2) / (reserve_b_pool2 + amount_b_out) * (1 - fee_rate_pool2)
    let amount_a_out = (amount_b_out * pool2_reserves.reserve_a) / (pool2_reserves.reserve_b + amount_b_out) * (1.0 - dex_fees.fee_rate_pool2);

    // Beneficio bruto
    let gross_profit = amount_a_out - x_in;

    // Costo de gas
    let gas_cost = gas_estimator.estimate_cost(x_in);

    // Beneficio neto
    gross_profit - gas_cost
}

/// Calcula la derivada numérica de una función f(x) en un punto x
/// utilizando el método de diferencia central.
/// h es el tamaño del paso, debe ser pequeño.
pub fn numerical_derivative<F>(f: F, x: f64, h: f64) -> f64
where
    F: Fn(f64) -> f64, // F es un closure o función que toma f64 y devuelve f64
{
    (f(x + h) - f(x - h)) / (2.0 * h)
}

/// Encuentra la cantidad óptima de entrada (x_in) que maximiza el beneficio.
/// Utiliza un método iterativo basado en la derivada numérica.
pub fn find_optimal_x<F>(
    profit_fn: F, // La función de beneficio
    initial_guess: f64,
    tolerance: f64, // Tolerancia para la derivada (cercana a cero)
    max_iterations: usize,
    step_size: f64, // Tamaño del paso para ajustar x en cada iteración
) -> Option<f64>
where
    F: Fn(f64) -> f64 + Copy, // Copiar el closure para usarlo en numerical_derivative
{
    let mut x = initial_guess;
    let h = 1e-6; // Pequeño paso para la derivada numérica

    for _ in 0..max_iterations {
        let derivative = numerical_derivative(profit_fn, x, h);

        if derivative.abs() < tolerance {
            // Si la derivada es cercana a cero, hemos encontrado un punto crítico
            return Some(x);
        }

        // Ajustar x en la dirección del gradiente para maximizar la función
        // Multiplicamos por step_size para controlar la velocidad de convergencia
        x += derivative * step_size;

        // Asegurarse de que x_in no sea negativo o cero
        if x <= 0.0 {
            return None; // No se encontró un óptimo válido en el rango positivo
        }
    }

    None // No se encontró un óptimo dentro del número máximo de iteraciones
}

