use super::PnL;

/// Simulación de 3-legs con closures de cotización (quote_a, quote_b, quote_c).
/// Incluye gas y fees por leg de manera simple.
pub fn simulate_3leg<F1, F2, F3>(
    amount_in_usd: f64,
    fee_bps_leg: f64,
    gas_usd: f64,
    quote_a: F1,
    quote_b: F2,
    quote_c: F3,
) -> (f64, PnL)
where
    F1: Fn(f64) -> f64,
    F2: Fn(f64) -> f64,
    F3: Fn(f64) -> f64,
{
    let steps = 20usize;
    let min_in = amount_in_usd * 0.10;
    let max_in = amount_in_usd * 1.50;
    let fee_frac = fee_bps_leg / 10_000.0;

    let mut best_x = min_in;
    let mut best_pnl = PnL { gross_usd: 0.0, fee_usd: 0.0, gas_usd, net_usd: f64::NEG_INFINITY };
    let dx = (max_in - min_in) / steps as f64;
    let mut x = min_in;
    for _ in 0..=steps {
        let o1 = quote_a(x);
        let o2 = quote_b(o1);
        let o3 = quote_c(o2);
        let gross = o3 - x;
        let fee = (x * fee_frac) + (o1 * fee_frac) + (o2 * fee_frac);
        let net = gross - fee - gas_usd;
        if net > best_pnl.net_usd {
            best_pnl = PnL { gross_usd: gross, fee_usd: fee, gas_usd, net_usd: net };
            best_x = x;
        }
        x += dx;
    }
    (best_x, best_pnl)
}
