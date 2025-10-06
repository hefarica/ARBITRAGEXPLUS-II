//! Búsqueda de tamaño óptimo (grid search rápido)
//! f(x) debe devolver PnL neto (incluye fees y gas).
pub fn grid_search<F>(f: F, min: f64, max: f64, steps: usize) -> (f64, f64)
where F: Fn(f64) -> f64 {
    assert!(max > min && steps > 0);
    let mut best_x = min;
    let mut best_v = f(min);
    let dx = (max - min) / steps as f64;
    let mut x = min;
    for _ in 0..=steps {
        let v = f(x);
        if v > best_v { best_v = v; best_x = x; }
        x += dx;
    }
    (best_x, best_v)
}
