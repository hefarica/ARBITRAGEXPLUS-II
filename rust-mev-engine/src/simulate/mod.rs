pub mod two_leg;
pub mod three_leg;

#[derive(Debug, Clone, Copy)]
pub struct PnL {
    pub gross_usd: f64,
    pub fee_usd: f64,
    pub gas_usd: f64,
    pub net_usd: f64,
}
