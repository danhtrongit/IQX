use std::{sync::Arc, time::Duration};

use api::Client;
use gpui::{Context, Task};
use model::{ForeignTop, IndexSnapshot};

/// Indices shown on the home screen, in display order.
pub const HOME_INDICES: [&str; 4] = ["VNINDEX", "VN30", "HNXIndex", "HNXUpcomIndex"];
const POLL_INTERVAL: Duration = Duration::from_secs(30);

/// Market overview data for the home screen, polled from the IQX API.
pub struct MarketState {
    client: Arc<Client>,
    pub indices: Option<Vec<IndexSnapshot>>,
    pub foreign: Option<ForeignTop>,
    /// Last request error; data from the previous successful poll is kept.
    pub error: Option<String>,
    pub refreshing: bool,
    _poll: Task<()>,
}

impl MarketState {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let poll = cx.spawn(async move |this, cx| {
            loop {
                if this.update(cx, |state, cx| state.refresh(cx)).is_err() {
                    break;
                }
                cx.background_executor().timer(POLL_INTERVAL).await;
            }
        });
        Self {
            client: Arc::new(Client::from_env()),
            indices: None,
            foreign: None,
            error: None,
            refreshing: false,
            _poll: poll,
        }
    }

    pub fn is_first_load(&self) -> bool {
        self.indices.is_none() && self.error.is_none()
    }

    /// Time of the newest index snapshot, ISO-8601 UTC.
    pub fn data_time(&self) -> Option<&str> {
        self.indices.as_ref()?.iter().filter_map(|i| i.time.as_deref()).max()
    }

    pub fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.refreshing {
            return;
        }
        self.refreshing = true;
        cx.notify();

        let client = self.client.clone();
        let request = cx.background_executor().spawn(async move {
            (client.market_index(&HOME_INDICES), client.foreign_top("ONE_DAY"))
        });
        cx.spawn(async move |this, cx| {
            let (indices, foreign) = request.await;
            this.update(cx, |state, cx| {
                let mut errors = Vec::new();
                match indices {
                    Ok(mut list) => {
                        list.sort_by_key(|i| HOME_INDICES.iter().position(|s| *s == i.symbol));
                        state.indices = Some(list);
                    }
                    Err(e) => errors.push(e.to_string()),
                }
                match foreign {
                    Ok(top) => state.foreign = Some(top),
                    Err(e) => errors.push(e.to_string()),
                }
                state.error = (!errors.is_empty()).then(|| errors.join("; "));
                state.refreshing = false;
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}
