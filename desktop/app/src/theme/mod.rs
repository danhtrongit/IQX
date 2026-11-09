//! Design tokens: colors, typography, spacing (mirrors frontend/DESIGN.md).
//!
//! Hex values are the sRGB conversion of the OKLCH tokens in
//! `frontend/src/index.css`; glass tokens follow `desktop/DESIGN.md` §3.

use std::{borrow::Cow, sync::Arc};

use gpui::{App, Font, FontFeatures, FontWeight, Hsla, WindowAppearance, font, rgb};

pub const SANS: &str = "Be Vietnam Pro";
pub const HEADING: &str = "Space Grotesk";

const FONT_FILES: [&[u8]; 5] = [
    include_bytes!("../../assets/fonts/BeVietnamPro-Regular.ttf"),
    include_bytes!("../../assets/fonts/BeVietnamPro-Medium.ttf"),
    include_bytes!("../../assets/fonts/BeVietnamPro-SemiBold.ttf"),
    include_bytes!("../../assets/fonts/BeVietnamPro-Bold.ttf"),
    include_bytes!("../../assets/fonts/SpaceGrotesk-Variable.ttf"),
];

pub fn load_fonts(cx: &App) {
    let fonts = FONT_FILES.iter().map(|bytes| Cow::Borrowed(*bytes)).collect();
    cx.text_system().add_fonts(fonts).expect("bundled fonts are valid");
}

/// Be Vietnam Pro with tabular digits (`tnum`, added by our font patch).
pub fn numeric(weight: FontWeight) -> Font {
    Font {
        features: FontFeatures(Arc::new(vec![("tnum".into(), 1)])),
        weight,
        ..font(SANS)
    }
}

fn hex(value: u32) -> Hsla {
    rgb(value).into()
}

#[derive(Clone, Copy)]
pub struct Theme {
    pub background: Hsla,
    pub foreground: Hsla,
    pub card: Hsla,
    pub secondary: Hsla,
    pub muted: Hsla,
    pub muted_foreground: Hsla,
    pub border: Hsla,
    pub primary: Hsla,
    pub primary_foreground: Hsla,

    pub price_up: Hsla,
    pub price_down: Hsla,
    pub price_ref: Hsla,
    pub price_ceiling: Hsla,
    pub price_floor: Hsla,

    /// z0 tint over the OS window material.
    pub window_tint: Hsla,
    pub glass_regular: Hsla,
    pub glass_selected: Hsla,
    pub glass_hover: Hsla,
    pub glass_highlight: Hsla,
    pub glass_hairline: Hsla,
    pub glass_shadow: Hsla,
}

impl Theme {
    pub fn for_appearance(appearance: WindowAppearance) -> Self {
        match appearance {
            WindowAppearance::Light | WindowAppearance::VibrantLight => Self::light(),
            WindowAppearance::Dark | WindowAppearance::VibrantDark => Self::dark(),
        }
    }

    pub fn dark() -> Self {
        let background = hex(0x0A1018);
        let border = hex(0x293342);
        let primary = hex(0x0090F6);
        let foreground = hex(0xEDF2F8);
        Self {
            background,
            foreground,
            card: hex(0x121A26),
            secondary: hex(0x1A2433),
            muted: hex(0x1A2433),
            muted_foreground: hex(0x9BA6B1),
            border,
            primary,
            primary_foreground: hex(0x0B1320),
            price_up: hex(0x32D74B),
            price_down: hex(0xFF453A),
            price_ref: hex(0xFFD60A),
            price_ceiling: hex(0xBF5AF2),
            price_floor: hex(0x64D2FF),
            window_tint: background.alpha(0.42),
            glass_regular: background.alpha(0.72),
            glass_selected: primary.alpha(0.18),
            glass_hover: foreground.alpha(0.06),
            glass_highlight: hex(0xFFFFFF).alpha(0.14),
            glass_hairline: border.alpha(0.6),
            glass_shadow: hex(0x000000).alpha(0.35),
        }
    }

    pub fn light() -> Self {
        let white = hex(0xFFFFFF);
        let border = hex(0xDBDEE2);
        let primary = hex(0x0066DB);
        let foreground = hex(0x21272F);
        Self {
            background: hex(0xF2F4F7),
            foreground,
            card: white,
            secondary: hex(0xECEFF2),
            muted: hex(0xE7EAEE),
            muted_foreground: hex(0x5B616A),
            border,
            primary,
            primary_foreground: white,
            price_up: hex(0x15803D),
            price_down: hex(0xC62828),
            price_ref: hex(0x8A6B0F),
            price_ceiling: hex(0x9333EA),
            price_floor: hex(0x0369A1),
            window_tint: hex(0xF2F4F7).alpha(0.45),
            glass_regular: white.alpha(0.72),
            glass_selected: primary.alpha(0.12),
            glass_hover: foreground.alpha(0.05),
            glass_highlight: white.alpha(0.70),
            glass_hairline: border.alpha(0.8),
            glass_shadow: hex(0x0F172A).alpha(0.12),
        }
    }

    pub fn direction(&self, direction: Option<model::Direction>) -> Hsla {
        match direction {
            Some(model::Direction::Up) => self.price_up,
            Some(model::Direction::Down) => self.price_down,
            Some(model::Direction::Flat) => self.price_ref,
            None => self.muted_foreground,
        }
    }
}
