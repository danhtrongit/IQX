//! Capsule chips. Data chips are opaque so market numbers never sit on glass.

use gpui::{Div, FontWeight, Hsla, SharedString, div, prelude::*, px};

use crate::theme::{Theme, numeric};

/// Opaque capsule carrying a market value inside glass chrome (DESIGN §4.4).
pub fn data_chip(
    theme: &Theme,
    label: impl Into<SharedString>,
    value: impl Into<SharedString>,
    change: impl Into<SharedString>,
    change_color: Hsla,
) -> Div {
    div()
        .h(px(20.))
        .px_2()
        .flex()
        .items_center()
        .gap(px(6.))
        .rounded_full()
        .bg(theme.card)
        .border_1()
        .border_color(theme.border)
        .text_size(px(11.))
        .child(div().text_color(theme.muted_foreground).child(label.into()))
        .child(div().font(numeric(FontWeight::MEDIUM)).child(value.into()))
        .child(div().font(numeric(FontWeight::MEDIUM)).text_color(change_color).child(change.into()))
}

/// Small neutral tag, e.g. the exchange of an index.
pub fn board_tag(theme: &Theme, text: impl Into<SharedString>) -> Div {
    div()
        .px(px(6.))
        .h(px(18.))
        .flex()
        .items_center()
        .rounded_full()
        .bg(theme.secondary)
        .text_size(px(11.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(theme.muted_foreground)
        .child(text.into())
}
