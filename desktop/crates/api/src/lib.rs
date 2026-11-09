//! IQX backend client: REST, realtime WebSocket, auth tokens.

use std::{fmt, time::Duration};

use model::{ForeignTop, IndexSnapshot};
use serde::{Deserialize, de::DeserializeOwned};

/// Production API, overridable with the `IQX_API_URL` environment variable.
pub const DEFAULT_BASE_URL: &str = "https://iqx.vn/api/v2";

#[derive(Debug, Clone)]
pub struct Error(String);

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Deserialize)]
struct Envelope<T> {
    data: T,
}

pub struct Client {
    base_url: String,
    agent: ureq::Agent,
}

impl Client {
    pub fn new(base_url: impl Into<String>) -> Self {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(15)))
            .user_agent(concat!("IQX-Desktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .into();
        Self { base_url: base_url.into().trim_end_matches('/').to_owned(), agent }
    }

    pub fn from_env() -> Self {
        Self::new(std::env::var("IQX_API_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_owned()))
    }

    fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let mut response = self.agent.get(&url).call().map_err(|e| Error(format!("{path}: {e}")))?;
        let envelope: Envelope<T> =
            response.body_mut().read_json().map_err(|e| Error(format!("{path}: {e}")))?;
        Ok(envelope.data)
    }

    /// Index snapshots, e.g. `["VNINDEX", "VN30", "HNXIndex", "HNXUpcomIndex"]`.
    pub fn market_index(&self, symbols: &[&str]) -> Result<Vec<IndexSnapshot>> {
        self.get(&format!("/market-data/overview/market-index?symbols={}", symbols.join(",")))
    }

    /// Top foreign net buy/sell; `time_frame` is `ONE_DAY`, `ONE_WEEK`, `ONE_MONTH`, `YTD` or `ONE_YEAR`.
    pub fn foreign_top(&self, time_frame: &str) -> Result<ForeignTop> {
        self.get(&format!("/market-data/overview/foreign/top?time_frame={time_frame}"))
    }
}
