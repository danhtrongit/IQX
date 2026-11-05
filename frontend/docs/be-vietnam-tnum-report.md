# `tabular-nums` với Be Vietnam Pro

Đo ngày 05/11/2026. Từ ngày này `tabular-nums` đã có tác dụng với Be Vietnam Pro.

## Nguyên nhân

Be Vietnam Pro không có chữ số đều ngay từ bản gốc, @fontsource không bỏ mất gì liên quan.

| Nguồn | Tính năng GSUB | Glyph chữ số đều |
|---|---|---|
| `@fontsource/be-vietnam-pro` 5.3.0, latin | `ccmp dnom frac liga locl numr` | Không |
| Như trên, vietnamese và latin-ext | Không có GSUB, cũng không có chữ số | Không |
| Google Fonts, `ofl/bevietnampro`, v1.002 | `aalt case ccmp dnom frac liga locl numr ordn sinf ss01 subs sups` | Không |
| Mã nguồn `bettergui/BeVietnamPro`, `.glyphs` | Không có chuỗi `tnum` nào | Không |

Fontsource có bỏ `aalt case ordn sinf ss01 subs sups` khi cắt subset, nhưng không có `tnum` nào để bỏ. Bề rộng chữ số ở độ đậm 400 đi từ 385 (số 1) đến 710 (số 4) trên 1000 đơn vị em.

## Ảnh hưởng

Bảng giá chạy với dữ liệu giả lập vì máy đo không kết nối được `iqx.vn`. Cửa sổ 1440 x 1000, bảng 12px, cùng một bộ dữ liệu ở trước và sau.

| Chỉ số | Trước | Sau |
|---|---|---|
| Dấu thập phân lệch trong một cột giá | 3,55 đến 3,97 px | 0 đến 0,02 px |
| Bề rộng bảng (đã có thanh cuộn ngang) | 1650 px | 1681 px, tăng 1,9% |
| Chiều cao hàng | 33 px | 33 px |
| Ô bị tràn trong bảng | 0 | 0 |

Số đo sau giống nhau ở Chromium, Firefox và WebKit. Lệch như vậy làm số nhảy ngang khi giá cập nhật, và các hàng trong một cột không thẳng hàng theo hàng đơn vị.

Ảnh: [bảng giá, giao diện sáng](assets/be-vietnam-tnum/board-light.png), [bảng giá, giao diện tối](assets/be-vietnam-tnum/board-dark.png), [tab Nắm giữ](assets/be-vietnam-tnum/holdings.png).

`tabular-nums` xuất hiện 529 lần trong 188 tệp, nên các bảng số khác cũng đổi theo. Ngoài bảng giá, chỉ tab Nắm giữ và bảng Chỉ số thị trường đã được xem bằng ảnh.

## Các phương án

Chi phí tính cho cả bốn độ đậm 400 đến 700, đo trên tệp woff2.

| Phương án | Thêm dung lượng | Thêm request | Hình chữ số | Sửa code |
|---|---|---|---|---|
| **Vá `tnum` vào bản latin (đã chọn)** | **756 B** | **0** | Giữ nguyên | Không sửa chỗ dùng |
| Font riêng chỉ chữ số Be Vietnam Pro, `unicode-range` | 13,8 KB | Tới 4 | Giữ nguyên | `.tabular-nums` phải đổi `font-family`, đè lên `font-heading` |
| Font riêng chỉ chữ số Inter, cắt subset | 6,6 KB | Tới 4 | Khác | Như trên |
| Inter nguyên bản latin | 97 KB | Tới 4 | Khác | Như trên |
| Dùng chữ số Space Grotesk (đã có `tnum`) | 0 B nếu trang đã tải font tiêu đề | 0 | Khác rõ | Đổi luật font |

Bản vá thêm mười glyph ghép `zero.tf` đến `nine.tf`, dùng lại nét gốc, nên chỉ thêm 136 đến 248 B mỗi tệp. Bề rộng ô là trung bình các chữ số trừ số 1: 661, 667, 674 và 687 ứng với 400, 500, 600 và 700. Chữ số mặc định không đổi.

## Đánh đổi

- Số 1 hẹp nên có khoảng trống hai bên, ví dụ `-1.20` và `61.00` thấy rõ hơn trước. Roboto hay Helvetica cũng vậy ở chữ số đều. Muốn lấp khoảng trống phải vẽ thêm chân cho số 1, tức đổi hình chữ, chưa làm.
- Dự án phải tự giữ bốn tệp font. Khi nâng cấp `@fontsource/be-vietnam-pro` cần chạy lại `scripts/patch-be-vietnam-tnum.py`.
- Canvas vẫn không dùng được `tabular-nums`, nên IQLine vẫn tự căn chữ số.

## Lỗi có sẵn, chưa sửa

Thẻ chỉ số trên bảng giá đã bị cắt chữ ở bề rộng 1440px trở xuống, từ trước khi có thay đổi này. Với dữ liệu giống thật, phần tràn ở 1440px là 10 đến 25 px trước và 13 đến 28 px sau; ở 1280px là 50 đến 65 px trước và 53 đến 68 px sau. Từ 1600px không tràn.

Chưa kiểm tra bằng ảnh các ô cố định bề rộng như `dupont-view.tsx` (`w-14`) và `analysis-report.tsx` (`w-10`).
