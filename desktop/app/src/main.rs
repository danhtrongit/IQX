//! IQX desktop entry point.

mod assets;
mod components;
mod state;
mod theme;
mod utils;
mod views;

use gpui::{
    App, Application, Bounds, KeyBinding, Menu, MenuItem, TitlebarOptions,
    WindowBackgroundAppearance, WindowBounds, WindowOptions, actions, point, prelude::*, px, size,
};

actions!(iqx, [Quit]);

fn main() {
    Application::new().with_assets(assets::Assets).run(|cx: &mut App| {
        theme::load_fonts(cx);

        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.bind_keys([KeyBinding::new("cmd-q", Quit, None)]);
        cx.set_menus(vec![Menu { name: "IQX".into(), items: vec![MenuItem::action("Thoát IQX", Quit)] }]);

        let bounds = Bounds::centered(None, size(px(1360.), px(860.)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                titlebar: Some(TitlebarOptions {
                    title: Some("IQX".into()),
                    appears_transparent: true,
                    traffic_light_position: Some(point(px(20.), px(19.))),
                }),
                window_background: WindowBackgroundAppearance::Blurred,
                window_min_size: Some(size(px(1024.), px(680.))),
                app_id: Some("vn.iqx.desktop".into()),
                ..Default::default()
            },
            |window, cx| cx.new(|cx| views::Shell::new(window, cx)),
        )
        .expect("open main window");

        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.activate(true);
    });
}
