//! Honest empty state for sections that are not built yet.

use gpui::{App, ClickEvent, FontWeight, Window, div, prelude::*, px};

use crate::{
    components::panel,
    theme::{HEADING, Theme},
};

pub fn render(
    theme: &Theme,
    title: &'static str,
    on_back: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    div().size_full().flex().items_center().justify_center().child(
        panel(theme)
            .w(px(420.))
            .p_6()
            .flex()
            .flex_col()
            .items_center()
            .gap_3()
            .child(
                div()
                    .font_family(HEADING)
                    .text_size(px(18.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(title),
            )
            .child(
                div()
                    .text_color(theme.muted_foreground)
                    .text_center()
                    .child("Màn hình này chưa có trên bản desktop. Dữ liệu đầy đủ vẫn có trên iqx.vn."),
            )
            .child(
                div()
                    .id("back-home")
                    .mt_2()
                    .h(px(32.))
                    .px_4()
                    .flex()
                    .items_center()
                    .rounded(px(6.))
                    .bg(theme.primary)
                    .text_color(theme.primary_foreground)
                    .font_weight(FontWeight::SEMIBOLD)
                    .cursor_pointer()
                    .hover(|style| style.opacity(0.9))
                    .child("Về Tổng quan")
                    .on_click(on_back),
            ),
    )
}
