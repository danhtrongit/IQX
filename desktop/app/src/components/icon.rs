//! Lucide icons bundled in `assets/icons`, tinted by the text color.

use gpui::{Hsla, Pixels, Svg, prelude::*, svg};

pub fn icon(name: &'static str, size: Pixels, color: Hsla) -> Svg {
    svg().path(format!("icons/{name}.svg")).size(size).flex_none().text_color(color)
}
