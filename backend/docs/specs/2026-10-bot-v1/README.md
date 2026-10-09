# Bộ spec "Chỉnh sửa Bot" (07/10/2026)

Bản lưu các đặc tả đã dùng để triển khai đợt Bot / Học viện / Chiến lược / Shop-Xu-Linh thú.
Báo cáo triển khai: [HANDOFF.md](HANDOFF.md).

| File | Nội dung |
|---|---|
| `IQX-Bo-Bot-SPEC.md` | Bộ Bot và nền giao dịch mới (không trứng, 16 chỉ báo, nguồn mua VN30/danh mục, mini luyện tập) |
| `IQX-Bo-Hoc-Vien-SPEC.md` | Khung Học viện 13 chương / 71 bài |
| `IQX-Bo-Chien-Luoc-SPEC.md` | Trang Chiến lược: Cảnh báo, Backtest, Bộ lọc |
| `IQX-Bo-Shop-Xu-Linh-Thu-SPEC.md` | Shop, xu học tập, linh thú |
| `chapters/IQX-Hoc-Vien-Chuong-{1..4}-SPEC*.md` | Gói nội dung Chương 1–4 |

Các file HTML mẫu đi kèm (không đưa vào repository vì dung lượng và chứa ảnh nhúng) được nhận diện bằng SHA-256:

| HTML mẫu | SHA-256 |
|---|---|
| `IQX-Bo-Bot.html` | `ca3fb11834939db45eb3cdf2b679fbf775ae298d7d540943a8d82669b4703b47` |
| `IQX-Bo-Chien-Luoc-MAU.html` | `53e0d805afe62cce40674b655aa28c4cab2aefb5cfa51782cabb9a1df6b7970f` |
| `IQX-Bo-Hoc-Vien-MAU.html` | `fac092943f80b7e774e0d945a87e6d6db96c5e85596b60275c2c4872ca245a31` |
| `IQX-Bo-Shop-Xu-Linh-Thu-MAU.html` | `8ad52324ff6e2e6233d78c5d240c401e9d031f28bce538f2af0f35179d9ca5e3` |
| `chapters/IQX-Hoc-Vien-Chuong-1-MAU-v2.0.html` | `af4da733c6065cad6f381916395a3a2fe3cf737fa0d9bf6f8596a6f7ef5eaff0` |
| `chapters/IQX-Hoc-Vien-Chuong-2-MAU-v2.0.html` | `81e155f0eb06542c9de984c1ac9a288d0fe62415345535edb6a31c05972a24e1` |
| `chapters/IQX-Hoc-Vien-Chuong-3-MAU-v2.0.html` | `61ad365c039425c06a6f86ff74f230821ff9d1f8370b259e233d25a9093dbbc9` |
| `chapters/IQX-Hoc-Vien-Chuong-4-MAU.html` | `65f30d146bd77f8b22a3ee2b0b6b0a216e9b0fdd3d524fc64722ec34ce32b722` |

Nội dung Chương 1–4 đã được trích xuất có kiểm chứng vào `backend/src/modules/academy/content/packages/`
(xem `backend/scripts/academy-import/README.md`); ảnh hướng dẫn nằm ở `frontend/public/assets/academy/`.
