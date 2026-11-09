//! Opaque content surfaces (z1): panels, headers, loading skeletons.

use gpui::{Div, FontWeight, SharedString, div, prelude::*, px};

use crate::theme::{HEADING, Theme};

/// Opaque `card` panel, 10 px radius, hairline border.
pub fn panel(theme: &Theme) -> Div {
    div().rounded(px(10.)).bg(theme.card).border_1().border_color(theme.border).overflow_hidden()
}

pub fn panel_header(
    theme: &Theme,
    title: impl Into<SharedString>,
    subtitle: impl Into<SharedString>,
) -> Div {
    div()
        .flex()
        .items_center()
        .gap_2()
        .child(div().w(px(3.)).h(px(16.)).rounded(px(1.)).bg(theme.primary))
        .child(
            div()
                .font_family(HEADING)
                .text_size(px(15.))
                .font_weight(FontWeight::SEMIBOLD)
                .child(title.into()),
        )
        .child(div().text_size(px(11.)).text_color(theme.muted_foreground).child(subtitle.into()))
}

/// Content-shaped placeholder block while the first response is loading.
pub fn skeleton(theme: &Theme, width: gpui::Pixels, height: gpui::Pixels) -> Div {
    div().w(width).h(height).rounded(px(4.)).bg(theme.muted)
}
