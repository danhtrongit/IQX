//! Glass chrome (`desktop/DESIGN.md` §3.1): tint, hairline, top highlight, shadow.

use gpui::{BoxShadow, Div, Pixels, div, linear_color_stop, linear_gradient, point, prelude::*, px};

use crate::theme::Theme;

/// 1 px specular line along the top edge, fading out toward the corners.
fn highlight(theme: &Theme, inset: Pixels) -> Div {
    let clear = theme.glass_highlight.alpha(0.0);
    div()
        .absolute()
        .top_0()
        .left(inset)
        .right(inset)
        .h(px(1.))
        .bg(linear_gradient(
            90.,
            linear_color_stop(clear, 0.),
            linear_color_stop(theme.glass_highlight, 0.5),
        ))
        .child(
            div().absolute().top_0().left_1_2().right_0().h(px(1.)).bg(linear_gradient(
                90.,
                linear_color_stop(theme.glass_highlight, 0.),
                linear_color_stop(clear, 1.),
            )),
        )
}

/// Floating glass panel (sidebar, palettes) with concentric radius.
pub fn glass_panel(theme: &Theme, radius: Pixels) -> Div {
    div()
        .relative()
        .rounded(radius)
        .bg(theme.glass_regular)
        .border_1()
        .border_color(theme.glass_hairline)
        .shadow(vec![BoxShadow {
            color: theme.glass_shadow,
            offset: point(px(0.), px(8.)),
            blur_radius: px(24.),
            spread_radius: px(0.),
        }])
        .child(highlight(theme, radius))
}

/// Edge-to-edge glass bar (toolbar, status bar).
pub fn glass_bar(theme: &Theme) -> Div {
    div().relative().w_full().flex_none().bg(theme.glass_regular).child(highlight(theme, px(0.)))
}
