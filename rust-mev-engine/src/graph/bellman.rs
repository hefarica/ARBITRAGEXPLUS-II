//! Bellman-Ford para detectar ciclo negativo en pesos w = -ln(price_neto)
//! edges: (u, v, w) con u,v ∈ [0..n)
pub fn negative_cycle(edges: &[(usize,usize,f64)], n: usize) -> Option<Vec<usize>> {
    let mut dist = vec![0.0; n];
    let mut parent = vec![None; n];
    let mut x = None;
    for _ in 0..n {
        x = None;
        for &(u,v,w) in edges {
            if dist[v] > dist[u] + w {
                dist[v] = dist[u] + w;
                parent[v] = Some(u);
                x = Some(v);
            }
        }
        if x.is_none() { break; }
    }
    // Si hubo relajación en la n-ésima iteración → hay ciclo
    if let Some(mut v) = x {
        for _ in 0..n { v = parent[v].unwrap(); }
        let start = v;
        let mut cyc = vec![start];
        let mut u = parent[start].unwrap();
        while u != start {
            cyc.push(u);
            u = parent[u].unwrap();
        }
        cyc.reverse();
        return Some(cyc);
    }
    None
}
