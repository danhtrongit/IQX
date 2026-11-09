//! Home: market overview (indices, breadth, foreign flows) from real API data.

use gpui::{Div, FontWeight, Hsla, SharedString, div, prelude::*, px, relative};
use model::{Direction, ForeignFlow, IndexSnapshot};

use crate::{
    components::{board_tag, panel, panel_header, skeleton},
    state::MarketState,
    theme::{HEADING, Theme, numeric},
    utils,
};

const FOREIGN_ROWS: usize = 8;

pub fn index_name(symbol: &str) -> &str {
    match symbol {
        "VNINDEX" => "VN-Index",
        "HNXIndex" => "HNX-Index",
        "HNXUpcomIndex" => "UPCoM-Index",
        other => other,
    }
}

pub fn render(theme: &Theme, market: &MarketState) -> impl IntoElement {
    let indices: Div = match &market.indices {
        Some(list) if !list.is_empty() => list.iter().fold(row(), |row, index| row.child(index_card(theme, index))),
        Some(_) => empty_panel(theme, "Chưa có dữ liệu chỉ số."),
        None if market.is_first_load() => (0..4).fold(row(), |row, _| row.child(index_skeleton(theme))),
        None => empty_panel(theme, "Không tải được chỉ số. Bấm Làm mới để thử lại."),
    };

    let foreign: Div = match &market.foreign {
        Some(top) => row()
            .child(foreign_panel(theme, "Khối ngoại mua ròng", &top.net_buy))
            .child(foreign_panel(theme, "Khối ngoại bán ròng", &top.net_sell)),
        None if market.is_first_load() => row().child(table_skeleton(theme)).child(table_skeleton(theme)),
        None => empty_panel(theme, "Không tải được giao dịch khối ngoại. Bấm Làm mới để thử lại."),
    };

    div()
        .id("home")
        .size_full()
        .overflow_y_scroll()
        .p_3()
        .flex()
        .flex_col()
        .gap_3()
        .child(panel_header(theme, "Chỉ số chính", "Điểm, thay đổi so với tham chiếu, độ rộng thị trường"))
        .child(indices)
        .child(div().pt_2().child(panel_header(theme, "Giao dịch khối ngoại", "Phiên gần nhất · giá nghìn VND, giá trị tỷ VND")))
        .child(foreign)
}

fn row() -> Div {
    div().flex().gap_3()
}

fn empty_panel(theme: &Theme, message: &'static str) -> Div {
    panel(theme).p_4().text_color(theme.muted_foreground).child(message)
}

fn index_card(theme: &Theme, index: &IndexSnapshot) -> impl IntoElement {
    let color = theme.direction(Direction::of(index.price, index.ref_price));
    let value = index.total_value_million_vnd.map(|million| million * 1e6);

    panel(theme)
        .flex_1()
        .min_w(px(180.))
        .p_3()
        .flex()
        .flex_col()
        .gap_2()
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .font_family(HEADING)
                        .text_size(px(15.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(SharedString::from(index_name(&index.symbol).to_owned())),
                )
                .children(index.board.clone().map(|board| board_tag(theme, board))),
        )
        .child(
            div()
                .font(numeric(FontWeight::SEMIBOLD))
                .text_size(px(26.))
                .line_height(px(32.))
                .text_color(color)
                .child(utils::opt_number(index.price, 2)),
        )
        .child(
            div()
                .flex()
                .gap_2()
                .font(numeric(FontWeight::MEDIUM))
                .text_color(color)
                .child(utils::opt_signed(index.change, 2))
                .child(utils::opt_percent(index.change_percent)),
        )
        .child(
            div()
                .flex()
                .justify_between()
                .text_size(px(12.))
                .child(div().text_color(theme.muted_foreground).child("Giá trị khớp"))
                .child(div().font(numeric(FontWeight::MEDIUM)).child(format!("{} tỷ", utils::billions(value)))),
        )
        .child(breadth(theme, index))
}

fn breadth(theme: &Theme, index: &IndexSnapshot) -> impl IntoElement {
    let up = index.total_stock_increase;
    let flat = index.total_stock_no_change;
    let down = index.total_stock_decline;
    let total = up.unwrap_or(0) + flat.unwrap_or(0) + down.unwrap_or(0);

    let bar = if total == 0 {
        div().h(px(6.)).rounded_full().bg(theme.muted)
    } else {
        let part = |count: Option<u32>, color: Hsla| {
            div().h_full().w(relative(count.unwrap_or(0) as f32 / total as f32)).bg(color)
        };
        div()
            .h(px(6.))
            .flex()
            .rounded_full()
            .overflow_hidden()
            .bg(theme.muted)
            .child(part(up, theme.price_up))
            .child(part(flat, theme.price_ref))
            .child(part(down, theme.price_down))
    };

    let count = |value: Option<u32>| value.map_or_else(|| utils::MISSING.to_owned(), |v| v.to_string());
    let legend = |label: &'static str, value: Option<u32>, color: Hsla| {
        div()
            .flex()
            .items_center()
            .gap(px(4.))
            .child(div().size(px(6.)).rounded_full().bg(color))
            .child(div().text_color(theme.muted_foreground).child(label))
            .child(div().font(numeric(FontWeight::MEDIUM)).child(count(value)))
    };

    div()
        .flex()
        .flex_col()
        .gap(px(6.))
        .pt_1()
        .child(bar)
        .child(
            div()
                .flex()
                .justify_between()
                .text_size(px(11.))
                .child(legend("Tăng", up, theme.price_up))
                .child(legend("Đứng", flat, theme.price_ref))
                .child(legend("Giảm", down, theme.price_down)),
        )
        .child(
            div()
                .flex()
                .justify_between()
                .text_size(px(11.))
                .child(legend("Trần", index.total_stock_ceiling, theme.price_ceiling))
                .child(legend("Sàn", index.total_stock_floor, theme.price_floor)),
        )
}

fn foreign_panel(theme: &Theme, title: &'static str, rows: &[ForeignFlow]) -> impl IntoElement {
    let header = div()
        .h(px(28.))
        .px_3()
        .flex()
        .items_center()
        .gap_3()
        .border_b_1()
        .border_color(theme.border)
        .text_size(px(11.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(theme.muted_foreground)
        .child(div().flex_1().child("Mã"))
        .child(div().w(px(72.)).text_right().child("Giá"))
        .child(div().w(px(96.)).text_right().child("GT ròng"));

    let mut table = div().flex().flex_col().child(header);
    if rows.is_empty() {
        table = table.child(
            div().p_3().text_color(theme.muted_foreground).child("Chưa có dữ liệu phiên này."),
        );
    }
    for flow in rows.iter().take(FOREIGN_ROWS) {
        let price_color = theme.direction(Direction::of(flow.match_price, flow.ref_price));
        let net_color = theme.direction(Direction::of_change(flow.net_value_vnd));
        table = table.child(
            div()
                .id(SharedString::from(format!("{title}-{}", flow.symbol)))
                .h(px(28.))
                .px_3()
                .flex()
                .items_center()
                .gap_3()
                .text_size(px(12.))
                .hover(|style| style.bg(theme.muted))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .items_baseline()
                        .gap_2()
                        .child(
                            div()
                                .w(px(40.))
                                .flex_none()
                                .font_weight(FontWeight::SEMIBOLD)
                                .child(flow.symbol.clone()),
                        )
                        .child(
                            div()
                                .min_w_0()
                                .truncate()
                                .text_size(px(11.))
                                .text_color(theme.muted_foreground)
                                .child(flow.company_name.clone().unwrap_or_default()),
                        ),
                )
                .child(
                    div()
                        .w(px(72.))
                        .text_right()
                        .font(numeric(FontWeight::MEDIUM))
                        .text_color(price_color)
                        .child(utils::board_price(flow.match_price)),
                )
                .child(
                    div()
                        .w(px(96.))
                        .text_right()
                        .font(numeric(FontWeight::MEDIUM))
                        .text_color(net_color)
                        .child(utils::signed_billions(flow.net_value_vnd)),
                ),
        );
    }

    panel(theme).flex_1().min_w_0().child(
        div()
            .flex()
            .flex_col()
            .child(
                div()
                    .px_3()
                    .pt_3()
                    .pb_2()
                    .text_size(px(13.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(title),
            )
            .child(table),
    )
}

fn index_skeleton(theme: &Theme) -> impl IntoElement {
    panel(theme)
        .flex_1()
        .min_w(px(180.))
        .p_3()
        .flex()
        .flex_col()
        .gap_3()
        .child(skeleton(theme, px(90.), px(16.)))
        .child(skeleton(theme, px(140.), px(28.)))
        .child(skeleton(theme, px(110.), px(14.)))
        .child(skeleton(theme, px(160.), px(6.)))
}

fn table_skeleton(theme: &Theme) -> impl IntoElement {
    (0..FOREIGN_ROWS).fold(
        panel(theme).flex_1().p_3().flex().flex_col().gap_3().child(skeleton(theme, px(150.), px(16.))),
        |panel, _| panel.child(skeleton(theme, px(260.), px(14.))),
    )
}
