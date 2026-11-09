# IQX Desktop

App desktop viết bằng Rust, ưu tiên hiệu năng. Gọi thẳng backend `/api/v2` (Bearer token).

```
desktop/
├── Cargo.toml        workspace, profile release
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
cargo run -p app
```
