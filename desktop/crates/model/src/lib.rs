//! Domain types shared by every crate: symbols, quotes, bars, orders.
//!
//! Numeric fields are `Option` because the upstream feed sends `null` outside
//! trading hours; a missing value is never coerced to zero.

use serde::Deserialize;

/// One market index snapshot (`/market-data/overview/market-index`).
#[derive(Debug, Clone, Deserialize)]
pub struct IndexSnapshot {
    pub symbol: String,
    pub board: Option<String>,
    pub price: Option<f64>,
    pub ref_price: Option<f64>,
    pub change: Option<f64>,
    pub change_percent: Option<f64>,
    pub total_value_million_vnd: Option<f64>,
    pub total_stock_increase: Option<u32>,
    pub total_stock_decline: Option<u32>,
    pub total_stock_no_change: Option<u32>,
    pub total_stock_ceiling: Option<u32>,
    pub total_stock_floor: Option<u32>,
    /// ISO-8601 UTC timestamp of the snapshot.
    pub time: Option<String>,
}

/// Foreign investor net flow of one symbol (`/market-data/overview/foreign/top`).
#[derive(Debug, Clone, Deserialize)]
pub struct ForeignFlow {
    pub symbol: String,
    pub exchange: Option<String>,
    pub company_name: Option<String>,
    pub net_value_vnd: Option<f64>,
    pub match_price: Option<f64>,
    pub ref_price: Option<f64>,
}

/// Top foreign net buy and net sell lists.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ForeignTop {
    #[serde(default)]
    pub net_buy: Vec<ForeignFlow>,
    #[serde(default)]
    pub net_sell: Vec<ForeignFlow>,
}

/// Direction of a price against its reference, used for semantic coloring.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Up,
    Down,
    Flat,
}

impl Direction {
    pub fn of(value: Option<f64>, reference: Option<f64>) -> Option<Self> {
        let (value, reference) = (value?, reference?);
        let diff = value - reference;
        Some(if diff.abs() < 1e-9 {
            Self::Flat
        } else if diff > 0.0 {
            Self::Up
        } else {
            Self::Down
        })
    }

    pub fn of_change(change: Option<f64>) -> Option<Self> {
        Self::of(change, Some(0.0))
    }
}
