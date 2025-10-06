use super::PnL;

/// Simula un 2-legs con closures de cotización (quote_1, quote_2).
/// - `amount_in_usd`: tamaño de entrada (USD nocional).
/// - `fee_bps_leg`: fee por leg (bps). Ej.: 30 bps = 0.30%.
/// - `gas_usd`: costo de gas fijo estimado para la tx atómica.
/// - `quote_1`: función que entrega salida tras el leg 1.
/// - `quote_2`: función que entrega salida tras el leg 2.
/// Devuelve (mejor_amount_in, PnL).
pub fn simulate_2leg<F1, F2>(
    amount_in_usd: f64,
    fee_bps_leg: f64,
    gas_usd: f64,
    quote_1: F1,
    quote_2: F2,
) -> (f64, PnL)
where
    F1: Fn(f64) -> f64,
    F2: Fn(f64) -> f64,
{
    // Búsqueda simple en grilla (podrías reemplazar por tu optimizador real)
    let steps = 20usize;
    let min_in = amount_in_usd * 0.10;
    let max_in = amount_in_usd * 1.50;
    let fee_frac = fee_bps_leg / 10_000.0;

    let mut best_x = min_in;
    let mut best_pnl = PnL { gross_usd: 0.0, fee_usd: 0.0, gas_usd, net_usd: f64::NEG_INFINITY };
    let dx = (max_in - min_in) / steps as f64;
    let mut x = min_in;
    for _ in 0..=steps {
        let leg1_out = quote_1(x);
        let leg2_out = quote_2(leg1_out);
        let gross = leg2_out - x;
        let fee = (x * fee_frac) + (leg1_out * fee_frac);
        let net = gross - fee - gas_usd;
        if net > best_pnl.net_usd {
            best_pnl = PnL { gross_usd: gross, fee_usd: fee, gas_usd, net_usd: net };
            best_x = x;
        }
        x += dx;
    }
    (best_x, best_pnl)
}
