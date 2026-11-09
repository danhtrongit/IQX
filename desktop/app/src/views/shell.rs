//! Window shell (`desktop/DESIGN.md` §4): toolbar, sidebar, content, status bar.

use gpui::{
    AnyElement, Context, Div, Entity, FontWeight, SharedString, Window, WindowControlArea, div,
    prelude::*, px,
};
use model::Direction;

use crate::{
    components::{data_chip, glass_bar, glass_panel, icon},
    state::MarketState,
    theme::{HEADING, SANS, Theme},
    utils,
};

use super::{home, placeholder};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Overview,
    PriceBoard,
    Chart,
    Watchlist,
    Screener,
    Bots,
    Account,
    Settings,
}

impl Section {
    pub fn label(self) -> &'static str {
        match self {
            Self::Overview => "Tổng quan",
            Self::PriceBoard => "Bảng giá",
            Self::Chart => "Biểu đồ",
            Self::Watchlist => "Danh mục theo dõi",
            Self::Screener => "Bộ lọc",
            Self::Bots => "Bot",
            Self::Account => "Tài khoản",
            Self::Settings => "Cài đặt",
        }
    }

    fn icon(self) -> &'static str {
        match self {
            Self::Overview => "layout-dashboard",
            Self::PriceBoard => "table-2",
            Self::Chart => "chart-candlestick",
            Self::Watchlist => "star",
            Self::Screener => "list-filter",
            Self::Bots => "bot",
            Self::Account => "circle-user",
            Self::Settings => "settings",
        }
    }
}

const NAV_GROUPS: [(&str, &[Section]); 2] = [
    ("THỊ TRƯỜNG", &[Section::Overview, Section::PriceBoard, Section::Chart]),
    ("ĐẦU TƯ", &[Section::Watchlist, Section::Screener, Section::Bots]),
];
const NAV_FOOTER: [Section; 2] = [Section::Account, Section::Settings];

const TOOLBAR_HEIGHT: f32 = 52.;
const STATUS_HEIGHT: f32 = 28.;
const SIDEBAR_WIDTH: f32 = 232.;
/// Room for the macOS traffic lights at the left of the toolbar.
const TRAFFIC_LIGHTS_WIDTH: f32 = 84.;

pub struct Shell {
    section: Section,
    market: Entity<MarketState>,
}

impl Shell {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let market = cx.new(MarketState::new);
        cx.observe(&market, |_, _, cx| cx.notify()).detach();
        cx.observe_window_appearance(window, |_, _, cx| cx.notify()).detach();
        Self { section: Section::Overview, market }
    }

    fn select(&mut self, section: Section, cx: &mut Context<Self>) {
        if self.section != section {
            self.section = section;
            cx.notify();
        }
    }

    fn toolbar(&self, theme: &Theme, market: &MarketState) -> Div {
        let subtitle: SharedString = match market.data_time().and_then(utils::vn_time) {
            Some(time) => format!("Dữ liệu lúc {time} · nguồn VCI qua IQX").into(),
            None if market.refreshing => "Đang tải dữ liệu…".into(),
            None => "Chưa có dữ liệu".into(),
        };
        let refreshing = market.refreshing;
        let entity = self.market.clone();

        glass_bar(theme)
            .h(px(TOOLBAR_HEIGHT))
            .border_b_1()
            .border_color(theme.glass_hairline)
            .flex()
            .items_center()
            .gap_3()
            .pl(px(TRAFFIC_LIGHTS_WIDTH))
            .pr_3()
            .child(
                div()
                    .flex_1()
                    .h_full()
                    .flex()
                    .flex_col()
                    .justify_center()
                    .window_control_area(WindowControlArea::Drag)
                    .child(
                        div()
                            .font_family(HEADING)
                            .text_size(px(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(self.section.label()),
                    )
                    .child(div().text_size(px(11.)).text_color(theme.muted_foreground).child(subtitle)),
            )
            .child(
                div()
                    .id("refresh")
                    .h(px(30.))
                    .px_3()
                    .flex()
                    .items_center()
                    .gap_2()
                    .rounded_full()
                    .border_1()
                    .border_color(theme.glass_hairline)
                    .text_size(px(13.))
                    .font_weight(FontWeight::MEDIUM)
                    .cursor_pointer()
                    .hover(|style| style.bg(theme.glass_hover))
                    .when(refreshing, |this| this.opacity(0.6))
                    .child(icon("refresh-cw", px(16.), theme.foreground))
                    .child(if refreshing { "Đang tải…" } else { "Làm mới" })
                    .on_click(move |_, _, cx| entity.update(cx, |state, cx| state.refresh(cx))),
            )
    }

    fn nav_item(&self, theme: &Theme, section: Section, cx: &Context<Self>) -> impl IntoElement + use<> {
        let selected = self.section == section;
        div()
            .id(section.label())
            .h(px(32.))
            .px(px(10.))
            .flex()
            .items_center()
            .gap(px(10.))
            .rounded_full()
            .text_size(px(13.))
            .font_weight(FontWeight::MEDIUM)
            .cursor_pointer()
            .when(selected, |this| this.bg(theme.glass_selected))
            .when(!selected, |this| this.hover(|style| style.bg(theme.glass_hover)))
            .child(icon(
                section.icon(),
                px(16.),
                if selected { theme.primary } else { theme.muted_foreground },
            ))
            .child(section.label())
            .on_click(cx.listener(move |this, _, _, cx| this.select(section, cx)))
    }

    fn sidebar(&self, theme: &Theme, cx: &Context<Self>) -> Div {
        let mut nav = div().flex().flex_col().gap(px(2.));
        for (title, sections) in NAV_GROUPS {
            nav = nav.child(
                div()
                    .px(px(10.))
                    .pt_3()
                    .pb_1()
                    .text_size(px(11.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.muted_foreground)
                    .child(title),
            );
            for section in sections {
                nav = nav.child(self.nav_item(theme, *section, cx));
            }
        }
        let mut footer = div().flex().flex_col().gap(px(2.));
        for section in NAV_FOOTER {
            footer = footer.child(self.nav_item(theme, section, cx));
        }

        glass_panel(theme, px(14.))
            .w(px(SIDEBAR_WIDTH))
            .flex_none()
            .flex()
            .flex_col()
            .justify_between()
            .p_2()
            .child(nav)
            .child(footer)
    }

    fn status_bar(&self, theme: &Theme, market: &MarketState) -> Div {
        let (dot, status): (_, SharedString) = if let Some(error) = &market.error {
            (theme.price_down, format!("Lỗi kết nối: {error}").into())
        } else if market.indices.is_some() {
            (theme.price_up, "Đã kết nối · tự làm mới mỗi 30 giây".into())
        } else {
            (theme.price_ref, "Đang kết nối…".into())
        };

        let mut chips = div().flex().items_center().gap_2();
        for index in market.indices.iter().flatten().take(2) {
            chips = chips.child(data_chip(
                theme,
                home::index_name(&index.symbol).to_owned(),
                utils::opt_number(index.price, 2),
                utils::opt_percent(index.change_percent),
                theme.direction(Direction::of_change(index.change)),
            ));
        }

        glass_bar(theme)
            .h(px(STATUS_HEIGHT))
            .border_t_1()
            .border_color(theme.glass_hairline)
            .px_3()
            .flex()
            .items_center()
            .justify_between()
            .gap_3()
            .text_size(px(11.))
            .text_color(theme.muted_foreground)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .min_w_0()
                    .child(div().size(px(6.)).flex_none().rounded_full().bg(dot))
                    .child(div().truncate().child(status)),
            )
            .child(chips)
    }
}

impl Render for Shell {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = Theme::for_appearance(window.appearance());
        let market = self.market.clone();
        let market = market.read(cx);
        let toolbar = self.toolbar(&theme, market);
        let status = self.status_bar(&theme, market);

        let content: AnyElement = match self.section {
            Section::Overview => home::render(&theme, market).into_any_element(),
            other => placeholder::render(&theme, other.label(), cx.listener(|this, _, _, cx| {
                this.select(Section::Overview, cx)
            }))
            .into_any_element(),
        };

        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(theme.window_tint)
            .text_color(theme.foreground)
            .font_family(SANS)
            .text_size(px(13.))
            .child(toolbar)
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .gap_2()
                    .p_2()
                    .child(self.sidebar(&theme, cx))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .rounded(px(14.))
                            .bg(theme.background)
                            .border_1()
                            .border_color(theme.glass_hairline)
                            .overflow_hidden()
                            .child(content),
                    ),
            )
            .child(status)
    }
}
