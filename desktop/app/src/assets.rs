//! Bundled assets served to GPUI (`svg().path("icons/…")`).

use std::borrow::Cow;

use gpui::{AssetSource, Result, SharedString};

macro_rules! icons {
    ($($name:literal),* $(,)?) => {
        &[$((concat!("icons/", $name, ".svg"), include_bytes!(concat!("../assets/icons/", $name, ".svg")))),*]
    };
}

const FILES: &[(&str, &[u8])] = icons![
    "bot",
    "chart-candlestick",
    "circle-user",
    "layout-dashboard",
    "list-filter",
    "refresh-cw",
    "settings",
    "star",
    "table-2",
];

pub struct Assets;

impl AssetSource for Assets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        Ok(FILES.iter().find(|(p, _)| *p == path).map(|(_, bytes)| Cow::Borrowed(*bytes)))
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        Ok(FILES.iter().filter(|(p, _)| p.starts_with(path)).map(|(p, _)| (*p).into()).collect())
    }
}
