# IQLine: báo cáo Giai đoạn 0

Ngày đo: 2026-11-05. Thiết kế: [iqline-design.md](iqline-design.md). Bản thử: `frontend/spike/iqline/`, không nằm trong bản build sản phẩm.

## Kết luận

**Canvas 2D đủ nhanh, không cần Worker, WASM hay WebGL.** Trên Chrome có GPU, mọi tình huống đều giữ 120 khung hình mỗi giây, kể cả 50.000 nến.

Giai đoạn 0 **chưa đóng**, còn hai việc:

| Việc còn lại | Lý do | Ảnh hưởng |
|---|---|---|
| Kiểm tra kênh `ohlc` | Luồng DNSE trên production đã ngắt từ 2026-10-26 (xem dưới), phải khôi phục trước | Chưa dùng được kênh `ohlc` |
| Đo trên điện thoại thật | Mới có giả lập CPU, không giả lập được GPU | Chưa kết luận mục tiêu điện thoại |

## So với mục tiêu §14

| Mục tiêu | Ngưỡng | Kết quả | Đánh giá |
|---|---|---|---|
| 5.000 nến, 5 chỉ báo, máy tính | Dưới 8 ms | Chrome p95 2,7 ms; WebKit 6 ms; Firefox 45 ms | Đạt trên Chrome, WebKit; Firefox xem ghi chú |
| Cùng dữ liệu, điện thoại | Dưới 16 ms | Giả lập CPU x4: p95 6,9 ms | Chưa kết luận |
| 50.000 nến, máy tính | Dưới 16 ms | Chrome p95 7,5 ms; WebKit 17 ms; Firefox 77 ms | Đạt trên Chrome, WebKit sát ngưỡng |
| Lõi vẽ | Dưới 60 KB gzip | Bản thử 8,3 KB, gồm cả 16 chỉ báo | Còn dư nhiều, nhưng chưa có đủ tính năng |
| Thời gian hiện biểu đồ | Không chậm hơn TradingView | Mốc TradingView: 1,3 đến 1,7 giây | Có mốc, so sánh ở Giai đoạn 4 |

## Số đo

Mọi tình huống gồm nến, khối lượng, MA, EMA, Bollinger, RSI, MACD và 20 hình vẽ. "Luồng chính" là thời gian dựng cảnh và gọi lệnh vẽ của một khung hình. "Nhịp" là khoảng cách giữa hai `requestAnimationFrame` khi kéo liên tục, đã gồm áp lực từ phần raster.

**Chrome 156, có GPU, màn hình 120 Hz. Máy tính 1440x900 DPR 2; điện thoại giả lập 390x844 DPR 3, CPU chậm 4 lần (ms, p95):**

| Dữ liệu | Số nến hiện | Luồng chính | Nhịp | Chrome không GPU, nhịp |
|---|---|---|---|---|
| 5.000 nến VCB 5 phút | 200 | 0,5 | 9,2 | 16,8 |
| | 1.000 | 1,0 | 9,3 | 16,8 |
| | 5.000 | 2,7 | 9,3 | 50,1 |
| 50.000 nến 1 phút (ghép HPG, FPT, VCB) | 500 | 0,7 | 9,3 | 16,8 |
| | 5.000 | 3,8 | 9,3 | 50,1 |
| | 50.000 | 7,5 | 9,2 | 83,4 |
| 35.442 nến VCB 1 phút (nguyên bản) | 500 | 0,8 | 9,2 | 16,8 |
| | 35.000 | 8,1 | 9,2 | 66,8 |
| Điện thoại, 5.000 nến VCB 5 phút | 120 | 1,7 | 9,2 | 33,4 |
| | 500 | 2,2 | 9,1 | 50,1 |
| | 5.000 | 6,9 | 9,2 | 133,3 |

**Trình duyệt khác, bản Playwright không có giao diện (ms, p95, luồng chính / nhịp):**

| Dữ liệu | Số nến hiện | WebKit 26.6 | Firefox 155 |
|---|---|---|---|
| 5.000 nến | 200 | 1 / 18 | 8 / 9,3 |
| | 1.000 | 2 / 18 | 18 / 25 |
| | 5.000 | 6 / 18 | 45 / 50 |
| 50.000 nến | 500 | 1 / 17 | 11 / 16,7 |
| | 5.000 | 6 / 17 | 51 / 50,9 |
| | 50.000 | 17 / 19 | 77 / 83,3 |

**Khác:**

- Tính 5 chỉ báo: 7 ms với 5.000 nến, 30 ms với 50.000 nến. Khung hình đầu: 15 đến 18 ms.
- TradingView, trang `/bieu-do?symbol=VCB`, không dùng cache, 3 lần: biểu đồ hiện sau 1,3 đến 1,7 giây. Thư viện tải 1.252 KB qua 104 yêu cầu; phần ứng dụng 586 KB, font 209 KB, API 24 KB.
- TradingView khi kéo: nhịp p50 8,3 ms, p95 9,2 ms. Có bong bóng hướng dẫn hiện lên trong lúc đo, nên chỉ xem đây là mốc tham khảo.

**Giới hạn của các số đo:**

- Máy đo là máy phát triển, nhanh hơn máy người dùng phổ biến.
- Nhịp đạt trần màn hình nên chỉ biết là còn dư, không biết dư bao nhiêu.
- Firefox bản Playwright có vẻ raster đồng bộ trên CPU (luồng chính gần bằng nhịp), nên số có thể khác bản Firefox thật. Chưa đo bản thật.
- Bản thử chưa có chú giải DOM, chưa có tương tác đầy đủ.
- Không dùng `getImageData` để ép raster khi đo Chrome. Lần đo đầu dùng cách này khiến Chrome rơi về raster phần mềm và cho số sai (kéo 1.000 nến p50 25 ms so với 8,3 ms thật).

## Kết luận cho thiết kế

**1. Cách vẽ đã chọn hiệu quả, giữ cho Giai đoạn 1.** Gom lệnh theo màu vào mảng số dùng lại giữa các khung hình; gộp nến theo cột pixel khi hẹp dưới 1px; chỉ thêm đỉnh khi cột có biên độ thấy được; `clip` theo từng ô.

**2. Máy không có GPU là điểm yếu.** Chrome không GPU vẫn giữ 60 khung hình khi hiện tới 1.000 nến, nhưng còn 12 đến 20 khung hình khi thu nhỏ toàn bộ. Giai đoạn 1 nên thử giới hạn DPR về 2, và bỏ tô vùng Bollinger khi đang gộp nến. Hai cách này chưa được đo.

**3. Be Vietnam Pro không có chữ số đều, `tabular-nums` không có tác dụng.** Ở cả ba trình duyệt và bốn độ đậm 400 đến 700, chữ số trong DOM có bật `tabular-nums` vẫn chênh nhau 3,2 đến 3,6 px ở cỡ 11px, bằng đúng khi không bật. Ví dụ ở độ đậm 400: số `1` rộng 4,2 px, số `4` rộng 7,8 px. Canvas cũng vậy, và đặt `font-variant-numeric` hay `font-feature-settings` trên phần tử canvas không đổi gì. IQLine tự căn từng chữ số theo bề rộng lớn nhất; đã đo, không tốn thêm thời gian thấy được (0,2 ms mỗi khung ở cả hai cách). Yêu cầu `tabular-nums` trong `DESIGN.md` cũng không có tác dụng ở các bảng số trên toàn ứng dụng; đây là vấn đề riêng ngoài IQLine. Đã sửa ở DOM ngày 05/11/2026, xem `be-vietnam-tnum-report.md`; Canvas vẫn phải tự căn.

**4. API nến khác giả định ở §8:**

| Quan sát | Hệ quả |
|---|---|
| Một yêu cầu trả hết dữ liệu trong khoảng, không phân trang: 1 phút khoảng 3,5 MB và 4 giây | Adapter phải tự chia khoảng ngày, không xin cả lịch sử |
| Khung trong ngày chỉ về tới 5 năm trước. VCB 1 phút có 35.442 nến trong 160 ngày, gồm các ngày rời rạc như 2021-11-05, 2021-12-31 | Trục cách đều sẽ ghép các ngày xa nhau; cần vạch ngăn khi nhảy ngày. 50.000 nến 1 phút hiện chưa có thật, mức cao nhất đo được là 37.389 |
| Ngày có từ 2013 với VCB, 2017 với VNINDEX | `noMoreHistory` phải suy ra từ dữ liệu trả về |
| Nến ngày có `time` là 00:00 UTC, tức 07:00 giờ Việt Nam | Định dạng ngày phải theo `Asia/Ho_Chi_Minh` |
| VNINDEX 1 phút có nến lúc 12 giờ và 15 giờ, ngoài phiên `0900-1130,1300-1445` | Không dùng chuỗi phiên để lọc nến, chỉ để ngoại suy phần tương lai |
| Dữ liệu 4 file kiểm tra không có nến sai, trùng hay lệch thứ tự | Vẫn giữ bước lọc như `datafeed.ts` |

**5. Realtime chưa dùng được.** Nghe `wss://iqx.vn/api/v2/market-data/ws` từ 14:28:40 đến 14:31:40 với VCB, FPT, VNINDEX, VN30 ở các kênh `ohlc`, `tick` và VNINDEX ở kênh `index`: kết nối mở, trả `pong`, không báo lỗi, nhưng **không có khung dữ liệu nào**, dù khoảng 80 giây đầu còn phiên khớp liên tục. REST vẫn có nến 14:29.

Log cho biết lý do: `iqx-v2-market-ingest` không kết nối được DNSE, ghi `Realtime upstream unavailable: Error` khoảng 20 giây một lần (khoảng 4.280 dòng mỗi ngày) từ 2026-10-26 05:29 UTC, ngay sau lần khởi động lại khi phát hành bản `20261026-userfix`. Trước đó tiến trình chạy không có cảnh báo. Thư mục `modules/realtime` không có commit nào kể từ 2026-10-15, và từ máy chủ vẫn gọi tới được các máy của DNSE. **Chưa biết lỗi cụ thể**, vì `realtime.bridge.ts` chỉ ghi `error.name`, không ghi nội dung lỗi. Khả năng đăng nhập DNSE bị từ chối là giả thuyết, chưa kiểm chứng. API và Redis vẫn hoạt động, nên bảng giá chạy bằng đường dự phòng REST trong suốt thời gian này.

Đọc code cho thấy thêm:

- `ohlc` chỉ đăng ký topic `ohlc/stock/1`: nến 1 phút của cổ phiếu, không có chỉ số. Khung khác phải tự gộp từ nến 1 phút.
- `normalize.ts` nhân giá lên 1.000 (58.000), còn REST trả theo nghìn đồng (58). Adapter phải đổi về một đơn vị.
- Client hiện chưa có kênh `ohlc` trong kiểu `RealtimeChannel`.

Vì vậy, IQLine 1.0 **giữ thăm dò 15 giây làm đường chính** như TradingView hiện tại. Kênh `ohlc` chỉ bật khi đã kiểm chứng.

## Layout đã lưu trên production

Đọc ngày 2026-11-05 bằng `spike/iqline/layout-stats.sql`: giao dịch chỉ đọc, chỉ xuất số đếm.

120 layout của 27 người dùng trên 61 mã, tất cả đều có `charts`. p95 25,8 KB, lớn nhất 40,8 KB. Kiểu hiển thị của cả 120 layout đều là nến.

| Chỉ báo | Lượt thêm | Số người | Trong danh sách IQLine |
|---|---|---|---|
| Volume | 120 | 27 | Có |
| RSI | 12 | 5 | Có |
| Moving Average | 11 | 5 | Có |
| Volume Profile theo vùng nhìn thấy | 5 | 2 | Thêm mới |
| Bollinger Bands | 4 | 3 | Có |
| MACD | 3 | 3 | Có |
| BB Width, Donchian, Chaikin Money Flow | 1 mỗi loại | 1 | Có |
| Ichimoku Cloud, Volatility O-H-L-C | 1 mỗi loại | 1 | Không chuyển |

| Hình vẽ | Số hình | Số người | Trong danh sách IQLine |
|---|---|---|---|
| Đường xu hướng | 3 | 2 | Có |
| Thước đo giá | 1 | 1 | Có |
| Hình chữ nhật | 1 | 1 | Có |
| Volume Profile cố định | 1 | 1 | Không chuyển |

**Kết luận:** danh sách §9 và §10 đã chốt. Việc chuyển dữ liệu nhỏ hơn dự kiến, chỉ 6 hình vẽ trên toàn hệ thống, nên bộ chuyển đổi chỉ cần xử lý 3 loại hình và 9 loại chỉ báo.

**Giới hạn:** mẫu nhỏ, chỉ gồm người đã lưu, không cho biết tần suất dùng và không gồm bản lưu trên trình duyệt của khách. Vì vậy số liệu không đủ để bỏ các tính năng chưa ai lưu; phạm vi đầy đủ giữ nguyên, chỉ xếp chúng ưu tiên sau.

## Việc tiếp theo

1. **Realtime:** sau khi khôi phục luồng DNSE, chạy lại trong phiên khớp liên tục, 09:00 đến 11:30 hoặc 13:00 đến 14:30.

   ```bash
   node frontend/spike/iqline/ws-probe.mjs /tmp/ws-frames.json 120
   ```

2. **Điện thoại thật:** mở bản thử qua mạng nội bộ trên một máy tầm trung, gọi `window.iqlineSpike.cadence({ visible: 5000 })`.

## Chạy lại bản thử

```bash
cd frontend
node spike/iqline/fetch-data.mjs
npx vite build --config spike/iqline/vite.config.ts
node spike/iqline/run-bench.mjs chrome-headed
node spike/iqline/tv-baseline.mjs
```

Tham số của `run-bench.mjs`: `chromium` (không GPU), `chrome-headed` (có GPU, mở cửa sổ), `firefox`, `webkit`. Kết quả và ảnh chụp nằm ở `spike/iqline/results/`, không commit.
