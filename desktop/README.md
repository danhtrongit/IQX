# IQX Desktop

App desktop viết bằng Rust, ưu tiên hiệu năng. Gọi thẳng backend `/api/v2` (Bearer token).
Thiết kế giao diện (Liquid Glass): xem [DESIGN.md](DESIGN.md).

```
desktop/
├── Cargo.toml        workspace, profile release
├── DESIGN.md         design system Liquid Glass
├── app/              binary: giao diện
│   ├── assets/       fonts/, icons/
│   └── src/
│       ├── components/   widget dùng lại (bảng, ô giá, nút, input)
│       ├── views/        màn hình (bảng giá, chart, watchlist, bộ lọc, bot)
│       ├── state/        state ứng dụng, store từ API + realtime
│       ├── theme/        token màu, chữ, khoảng cách (theo frontend/DESIGN.md)
│       └── utils/        định dạng số, giá, ngày vi-VN
└── crates/
    ├── model/        kiểu dữ liệu dùng chung
    ├── indicator/    chỉ báo kỹ thuật
    ├── api/          client REST + WebSocket + token
    └── chart/        engine chart GPU
```

Phụ thuộc: `app` → `api`, `chart`, `indicator` → `model`.

```sh
cargo run -p app            # bản dev
cargo build -p app --release # bản tối ưu: target/release/app
```

Cần Rust stable (máy dev dùng `rustup` của Homebrew: thêm `/opt/homebrew/opt/rustup/bin` vào `PATH`). GPUI bật `runtime_shaders` để không cần Metal Toolchain của Xcode; muốn biên dịch shader sẵn thì chạy `xcodebuild -downloadComponent MetalToolchain` rồi bỏ feature này.

API mặc định `https://iqx.vn/api/v2`, đổi bằng biến môi trường `IQX_API_URL`.
