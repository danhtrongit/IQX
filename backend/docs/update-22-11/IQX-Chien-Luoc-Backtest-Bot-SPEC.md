# IQX · SPEC: Chiến lược, Backtest theo rổ, Bot chọn chiến lược

**Phiên bản:** 1.0 · 08/11/2026
**Dành cho:** AI Dev triển khai trên codebase iqx.vn.
**HTML mẫu đi kèm:** `IQX-Chien-Luoc-Backtest-Bot-MAU.html`.
- File HTML là chuẩn **nội dung và hành vi**. Không chép CSS hay layout.
- Giá cổ phiếu, kết quả backtest, số liệu Bot trong file mẫu là **minh họa**.
- Thanh "Điều khiển mô phỏng" trên trang Bot của file mẫu **không** thuộc giao diện thật.

**Thay thế và sửa các tài liệu:**

| Tài liệu | Phần bị thay hoặc sửa |
|---|---|
| `IQX-BACKTEST-SPEC.md` (as-is, 08/11/2026) | Chế độ `single` 1 mã, cấu hình chung, khớp `next_open`, vốn do người dùng nhập, `fee_preset`: **thay toàn bộ** bằng spec này |
| `IQX-Bo-Bot-SPEC-v1.2.md` | §4 (Backtest bản nháp, Lưu cho Bot, Về cấu hình đã lưu) và phần cấu hình chỉ báo, danh mục mua mới trên Bot: **thay** |
| `IQX-Tab-IQX-Loc-Backtest-SPEC.md` v1.1 | §2.3 mục 6, §3, §4.1 nội dung chiến lược, §5.3: **sửa** theo §11 của spec này |

**Giữ nguyên, không thuộc phạm vi:** spec Chỉ báo v3 (định nghĩa dòng điều kiện, miền giá trị, form Chỉnh), hàm tính chỉ báo, Bộ lọc (trừ §12), Flashback, Học viện, quyền Premium và cờ tính năng hiện có của trang Chiến lược.

> **Tóm tắt**
> 1. Thêm khái niệm **Chiến lược**: Rổ mã + Điều kiện Mua + Điều kiện Bán + Giữ tối đa. Hai nguồn: **Chiến lược IQX** (quản trị viên soạn) và **Chiến lược của tôi** (người dùng soạn trong Backtest, tối đa 20, mỗi lần Lưu là một bản).
> 2. **Backtest chạy trên cả rổ** (VN30, VN100, danh mục đã lưu bên Bộ lọc), theo **đúng luật Bot**, khớp **giá đóng cửa cùng phiên**, vốn **cố định 100.000.000 đ**. Dữ liệu giá lấy từ **kho VN100 của Flashback**.
> 3. Backtest có 2 tab: **IQX** (chỉ xem và chạy thử) và **Chỉ báo** (tạo, sửa, lưu, xóa chiến lược của tôi).
> 4. **Bot chỉ chọn chiến lược.** Bỏ khung danh mục mua mới và danh sách 16 chỉ báo trên Bot. Bot có **Lịch phiên** cho biết phiên gần nhất và phiên tới chạy chiến lược nào, bản nào.
> 5. Backtest và Bot dùng **chung một module luật** và **chung nguồn giá**.
> 6. Bỏ cấu hình chung (`shared_config`) dùng chung Bot và Backtest. Dữ liệu cũ được chuyển đổi để Bot không gián đoạn.

---

## 0. Nguyên tắc

1. **Backtest là nơi tạo và sửa chiến lược. Bot chỉ chọn.** Không có chỗ nào trên Bot sửa điều kiện.
2. **Kết quả Backtest phải là cách Bot sẽ chạy.** Cùng luật vốn, cùng thứ tự ưu tiên, cùng phí, cùng nguồn giá, cùng cách đếm phiên. Mọi khác biệt giữa Backtest và Bot là lỗi.
3. **Không có thay đổi ngầm.** Người dùng luôn thấy phiên tới Bot chạy chiến lược nào, bản nào. Chiến lược IQX đổi phiên bản không tự đổi Bot của người dùng.
4. **Bản đã lưu và lần chạy đã lưu là bất biến.** Không sửa, chỉ tạo mới. Xóa chiến lược là xóa mềm.
5. **Không làm giao diện riêng cho mẫu.** Chiến lược IQX hiển thị bằng đúng thẻ chỉ báo của form, ở chế độ chỉ đọc.
6. **Pháp lý:** mọi chỗ hiện chiến lược IQX có dòng `Tham khảo để học, không phải khuyến nghị đầu tư.` Kết quả Backtest có dòng `Kết quả quá khứ không bảo đảm kết quả tương lai.`

---

## 1. Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| **Chiến lược** | Bộ 4 phần: `universe` (rổ mã), `buy` (thẻ chỉ báo Mua), `sell` (thẻ chỉ báo Bán), `max_holding` (giữ tối đa, phiên) |
| **Chiến lược IQX** | Chiến lược do quản trị viên soạn, xuất bản theo phiên bản `v1, v2…` (bảng `iqx_templates`, spec Tab IQX §4) |
| **Chiến lược của tôi** | Chiến lược người dùng lưu từ Backtest. Tối đa **20** chiến lược chưa xóa mỗi người dùng |
| **Bản** | Một lần lưu của chiến lược của tôi. Bất biến. Hiển thị theo thời điểm lưu `dd/mm HH:mm` (thêm `/yyyy` nếu khác năm hiện tại) |
| **Bản nháp** | Nội dung đang chỉnh trong tab Chỉ báo, chưa lưu. Chỉ ở giao diện |
| **Lần chạy** | Một lần bấm Chạy. Lưu bất biến trong `backtest_runs` |
| **Kho VN100** | Kho dữ liệu giá ngày của Flashback (đang dùng cho Flashback), luôn cập nhật tới phiên gần nhất |
| **Giờ chốt dữ liệu** | Giờ nền tảng cập nhật dữ liệu phiên trong ngày vào kho. Bot tính tín hiệu của phiên D tại giờ này của ngày D |
| **Phiên gần nhất** | Phiên giao dịch gần nhất mà Bot **đã chạy** (đã qua giờ chốt dữ liệu). Đã khóa |
| **Phiên tới** | Phiên giao dịch kế tiếp mà Bot **chưa chạy**. Nếu hôm nay là ngày giao dịch và chưa tới giờ chốt dữ liệu thì phiên tới là **hôm nay** |
| **Lịch phiên** | Bảng ghi mỗi phiên Bot dùng chiến lược nào, bản nào |

---

## 2. Dữ liệu giá

### 2.1 Nguồn

- Backtest **và Bot** đọc giá ngày từ **kho VN100 của Flashback**. Không dùng chuỗi VND→VCI của adapter cũ (`Q/market-data.adapter.ts`) cho Backtest nữa.
- Dùng đúng phần quy đổi đơn vị giá đang có ở Flashback (`flashback.market-data.ts`, `SOURCE_SCALE`). Mọi giá trong engine tính bằng **đồng**. Việc này xử lý luôn nghi vấn R1 của spec Backtest as-is.
- Ghi vào snapshot của lần chạy: `data_store = "flashback_vn100"`, `price_unit = "VND"`, `adjusted` (đúng theo kho), `data_as_of` (phiên cuối cùng có trong kho).
- VN-Index dùng làm so sánh lấy từ cùng kho nếu có. Không có thì dùng nguồn hiện tại và ghi cảnh báo `MARKET_CONTEXT_UNAVAILABLE` như cũ.

### 2.2 Phạm vi mã

- **Chỉ mã có trong kho VN100** mới được backtest và được Bot mua.
- Rổ **VN30**, **VN100**: dùng danh sách thành phần **hiện tại** cho cả quá khứ, vì chưa có dữ liệu thành phần rổ theo thời điểm. Ghi cảnh báo `UNIVERSE_CURRENT_MEMBERS` (§4.8).
- **Danh mục đã lưu bên Bộ lọc** có thể chứa mã ngoài VN100:
  - giữ lại các mã thuộc kho VN100, bỏ các mã còn lại;
  - giao diện báo ngay dưới ô Rổ: `Bỏ {n} mã ngoài VN100 (không có trong kho dữ liệu): {mã, mã}. Backtest và Bot chỉ dùng {m} mã còn lại.`;
  - sau khi lọc mà còn 0 mã thì không cho Chạy, không cho Lưu: `Danh mục này không có mã nào thuộc VN100.` (lỗi `UNIVERSE_EMPTY`).

### 2.3 Khoảng thời gian

- `Từ ngày` sớm nhất = phiên thứ **451** của kho (450 phiên đầu dùng làm dữ liệu khởi động cho chỉ báo, theo `warmup 450` hiện có). `Đến ngày` muộn nhất = `data_as_of`.
- `Đến ngày > Từ ngày`, tối đa 3653 ngày như hiện tại.
- Mặc định: `Đến ngày` = `data_as_of`; `Từ ngày` = `Đến ngày` lùi 2 năm.

### 2.4 Dev cần xác nhận về kho (xem §15)

Kho có đủ OHLCV và khối lượng không, giá đã điều chỉnh hay chưa, lưu từ năm nào, còn giữ dữ liệu mã đã rời VN100 không.

---

## 3. Luật mô phỏng (module chung Backtest và Bot)

Đặt toàn bộ luật này trong **một module dùng chung**. Bot gọi module này mỗi phiên; Backtest gọi module này cho từng phiên trong khoảng thời gian. Chỗ nào code Bot hiện tại khác luật dưới đây thì **sửa Bot theo**.

### 3.1 Tham số cố định

| Tham số | Giá trị |
|---|---|
| Vốn ban đầu | **100.000.000 đ**. Người dùng không đổi |
| Ngân sách mỗi lệnh mua | **12% NAV** tại thời điểm tính lệnh |
| Số lệnh mua tối đa mỗi phiên | **2** |
| Tỷ trọng tối đa mỗi mã | **30% NAV** |
| Phí | Mua **0,15%**, bán **0,25%** (đã gồm thuế). Dùng chung cấu hình phí của Bot (`buy_fee_rate_bps`, `sell_fee_rate_bps`, `sell_tax_rate_bps`); dev xác nhận tổng bằng 0,15% / 0,25% |
| Lô | 100 cổ phiếu, không lô lẻ |
| Khớp lệnh | **Giá đóng cửa của chính phiên có tín hiệu** |
| Thanh toán | **T+2**: mã mua ở phiên P chỉ được bán từ phiên P+2 (đếm theo phiên giao dịch) |
| Tiền bán | Dùng mua lại được **ngay trong cùng phiên** |

### 3.2 Thứ tự xử lý mỗi phiên D

Tín hiệu tính khi có giá đóng cửa phiên D, chỉ dùng nến tới phiên D.

1. **Bán trước.** Với từng mã đang giữ (mua ở phiên P), số phiên đã giữ `held = D − P` (đếm phiên giao dịch):
   - `held < 2` (chưa về theo T+2): không bán.
   - Ngược lại, bán toàn bộ nếu:
     - điều kiện Bán của chiến lược đạt (`=== true`), **hoặc**
     - `held ≥ max_holding`.
   - Lý do bán: `Điều kiện Bán` nếu điều kiện Bán đạt (kể cả khi cũng đủ giữ tối đa), còn lại `Giữ tối đa`.
   - Tiền bán = `số CP × giá đóng cửa × (1 − phí bán)`, cộng ngay vào tiền mặt.
2. **Tính NAV** = tiền mặt + Σ (số CP × giá đóng cửa D).
3. **Chọn mã mua.** Ứng viên = mã trong rổ có điều kiện Mua đạt (`=== true`), **không** đang giữ, **không** vừa bán trong phiên D.
   - Sắp xếp theo **GTGD trung bình 20 phiên** (trung bình của giá đóng cửa × khối lượng, 20 phiên tới D) **giảm dần**. Bằng nhau thì theo mã chứng khoán A→Z.
4. **Mua lần lượt** theo thứ tự trên:
   - Đã mua đủ 2 mã trong phiên: bỏ qua, lý do `Đã đủ 2 lệnh mua trong phiên`.
   - Ngân sách = `min(12% × NAV, tiền mặt)`. Số CP = làm tròn xuống bội 100 của `ngân sách / (giá × (1 + phí mua))`.
   - Số CP < 100: bỏ qua, lý do `Không đủ tiền mặt cho 1 lô` nếu tiền mặt < giá × 100 × (1 + phí mua), còn lại `12% NAV không đủ mua 1 lô (giá cao)`.
   - Giá trị mua > 30% NAV: bỏ qua, lý do `Vượt trần 30% NAV mỗi mã`.
   - Không mua thêm mã đang giữ.
5. **Ghi điểm tài sản** cuối phiên D bằng giá đóng cửa D.

### 3.3 Logic điều kiện

- Giữ nguyên spec Chỉ báo v3 và engine hiện có: AND các dòng đang bật trong một thẻ, AND các thẻ trong một phía, logic ba trị (Kleene). Chỉ `true` mới kích hoạt; `null` (thiếu dữ liệu) không bao giờ là tín hiệu.
- **Phía Mua** phải có ít nhất **một dòng đang bật**. Kiểm tra ở cả giao diện và máy chủ (sửa luôn R7 của spec as-is).
- **Phía Bán** được phép trống. Khi trống, vị thế chỉ bán khi đủ Giữ tối đa.
- `max_holding`: số nguyên **3–250**.

### 3.4 Cuối khoảng thời gian (chỉ Backtest)

- Không ép bán. Vị thế còn mở tạm tính theo giá đóng cửa phiên cuối, chưa trừ phí bán.

### 3.5 Bot khi đổi chiến lược hoặc đổi bản

- Mã đang giữ **không** bán ngay. Từ phiên áp dụng, mã đang giữ được bán theo **điều kiện Bán và Giữ tối đa của chiến lược/bản mới**; số phiên đã giữ **tính tiếp từ ngày mua thật**.
- Mã đang giữ không thuộc rổ mới vẫn bán theo luật trên. Cột "Phạm vi hiện tại" hiện `Ngoài nguồn mua` (giữ như Bot đang có).

---

## 4. Backtest: giao diện

Route giữ nguyên `/chien-luoc?tab=backtest`. Bỏ tham số `symbol` (xem §12 cho liên kết từ Bộ lọc).

### 4.1 Bố cục

- **Cột trái:** hai nút tab `IQX` · `Chỉ báo 16`. Tab mặc định: **Chỉ báo**.
- **Khu chính**, từ trên xuống:
  1. Thanh trên cùng (§4.2, §4.3).
  2. Dải thông tin IQX (chỉ tab IQX).
  3. Ô thiết lập: **Rổ mã · Từ ngày · Đến ngày · Vốn ban đầu (VND)**.
  4. Dòng rổ: tên rổ, số mã, 10 mã đầu, nút `Xem danh sách`, cảnh báo mã ngoài VN100 (nếu có).
  5. Hai khung **Điều kiện Mua** (xanh) · **Điều kiện Bán** (đỏ). Đầu khung ghi `{n} chỉ báo` và nhãn `AND`.
  6. Hàng **Giữ tối đa** `[30] phiên` · `▶ Chạy` · `Lưu ▾` (chỉ tab Chỉ báo) · dòng luật (§4.5).
  7. Kết quả (§4.7).
- **Ô Vốn ban đầu:** hiện `100.000.000`, **khóa**, chú thích khi rê chuột `Cố định bằng vốn Bot`.
- **Bỏ:** ô Cổ phiếu, ô chọn kiểu khớp lệnh, ô Phí, nút `Về cấu hình đã lưu`, nút `Tạo cảnh báo`.
- Hai tab giữ **trạng thái và kết quả riêng**. Chuyển tab không làm mất bản nháp hay kết quả của tab kia. `Từ ngày`, `Đến ngày` dùng chung.

### 4.2 Tab IQX: chỉ xem và chạy thử

**Cột trái:** danh sách Chiến lược IQX đang hiện (`visibility = shown`), theo `sort_order`. Mỗi thẻ:

| Phần | Nội dung |
|---|---|
| Tiêu đề | Huy hiệu `IQX` + tên |
| Ý tưởng | 1 câu |
| Tóm tắt | `Mua: {tên chỉ báo nối +}` / `Bán: {tên chỉ báo} · giữ tối đa {N} phiên` / `Rổ {VN30}` |
| Nhãn | `▶ Đang chạy trên Bot` hoặc `→ Phiên tới` nếu khớp lịch Bot |

- Bấm cả thẻ để chọn; thẻ đang chọn có viền nhấn. **Không có nút Dùng.**
- Chân cột: `Chiến lược dựng sẵn bởi IQX: bấm để xem điều kiện và chạy thử, không chỉnh được. Chọn cho Bot ở trang Bot. Tham khảo để học, không phải khuyến nghị đầu tư.`

**Khu chính khi đang ở tab IQX:**
- Thanh trên cùng: `[IQX] Chiến lược IQX · {tên}` · `v{n}` · nhãn `Chỉ xem · chạy thử` · bên phải `Bot đang chạy: {tên} · {bản}` · nút `Lần chạy đã lưu` · nút `Lịch sử phiên bản`.
- Dải thông tin: `{ý tưởng} Chiến lược IQX không chỉnh được; bấm Chạy để xem hiệu quả.` + `Xem thêm` (Nguồn gốc, Khi nào dễ sai, dòng miễn trừ).
- **Rổ mã** và **Giữ tối đa**: hiện giá trị của chiến lược, **khóa**.
- Thẻ chỉ báo: **chỉ đọc**. Không có nút `Chỉnh`, `✕`. Chỉ hiện các dòng đang bật.
- **Không có** nút Lưu. Chỉ có `▶ Chạy`.
- Chạy dùng phiên bản hiện hành của chiến lược IQX.
- `Lịch sử phiên bản`: bảng phiên bản (v, thời điểm xuất bản, lý do), đánh dấu phiên bản hiện hành và phiên bản Bot đang dùng. Chỉ xem.
- Bot "Chi tiết" (§5.3) có thể mở một chiến lược IQX **đã ẩn** mà Bot đang chạy: khu chính vẫn hiển thị và chạy được; cột trái không có thẻ của chiến lược đó.

### 4.3 Tab Chỉ báo: tạo, sửa, lưu, xóa

**Cột trái:** thư viện chỉ báo **giữ nguyên giao diện hiện tại** (ô tìm, nhóm, thẻ với nút `✓/+ Mua`, `✓/+ Bán`). **Bỏ hẳn nút Luyện tập.**

**Thanh trên cùng:**
- `Chiến lược` + **nút tên chiến lược ▾**. Nút chỉ hiện **tên** (hoặc `Chiến lược mới` khi chưa lưu). Không hiện bản, nhãn Bot hay trạng thái trong nút.
- Bên phải: `Bot đang chạy: {tên} · {bản}` · `Lần chạy đã lưu` · `Lịch sử bản`.

**Bấm nút tên chiến lược** mở danh sách:

```
CHIẾN LƯỢC ĐÃ LƯU (2/20)
  RSI + SMA20   ▶ Đang chạy trên Bot  → Phiên tới        🗑 (khóa)
  Bản mới nhất 08/11 13:20 · VN30
  Bollinger VN100                                        🗑
  Bản mới nhất 03/11 21:10 · VN100
──────────
＋ Tạo chiến lược mới
Không xóa được chiến lược Bot đang chạy hoặc sẽ chạy phiên tới.
```

- **Bấm một dòng:** mở **bản mới nhất** của chiến lược đó vào bản nháp.
- **＋ Tạo chiến lược mới:** bản nháp trống, rổ VN30, giữ tối đa 30. Khóa khi đã có 20 chiến lược, kèm câu `Đã đủ 20 chiến lược. Xóa bớt trước khi tạo mới.`
- Nếu bản nháp đang khác bản đã mở (hoặc là chiến lược mới có ít nhất một dòng bật), hỏi trước khi thay:
  - Tiêu đề: `Thay bản nháp đang chỉnh?`
  - Nội dung: `Rổ mã, Điều kiện Mua, Bán và Giữ tối đa của bản nháp sẽ được thay bằng {tên}. Chiến lược đã lưu và Bot không đổi.`
  - Nút: `Hủy` · `Thay`
- **🗑 Xóa** (§4.6).

**Khu chính:**
- Rổ mã: chọn `VN30`, `VN100`, hoặc một danh mục đã lưu bên Bộ lọc (nhóm riêng trong ô chọn, ghi số mã).
- Thẻ chỉ báo: đầy đủ `Chỉnh`, `✕` như hiện tại. Dòng tắt vẫn hiện (gạch ngang).
- Giữ tối đa: ô số nguyên 3–250. Sai thì báo `Giữ tối đa phải từ 3 đến 250 phiên, số nguyên.` và trả về giá trị cũ.
- Khung Mua trống: `Chưa có điều kiện Mua. Bấm + Mua ở cột Chỉ báo bên trái.` Nút Chạy khóa, kèm `Cần ít nhất một dòng Mua đang bật để chạy.`
- Khung Bán trống: `Chưa có điều kiện Bán. Bấm + Bán ở cột Chỉ báo. Không có điều kiện Bán thì vị thế được bán khi đủ Giữ tối đa.`

### 4.4 Lưu ▾ (chỉ tab Chỉ báo)

**Điều kiện chung:** bản nháp phải **đã chạy thành công sau lần sửa cuối** (`config_hash` của lần chạy gần nhất = `config_hash` của bản nháp). Không thỏa thì mọi mục bị khóa, kèm câu `Bản nháp đã sửa sau lần chạy (hoặc chưa chạy). Bấm Chạy trước khi Lưu.` Máy chủ kiểm tra lại bằng `from_run_id` (§10.3).

| Mục | Hiện khi | Khóa thêm khi | Kết quả |
|---|---|---|---|
| `Lưu thành bản mới của "{tên}"` | Đang mở một chiến lược của tôi | Bản nháp **giống** bản đang mở: `Chưa có thay đổi so với bản đang mở.` | Tạo bản mới (§6.2) |
| `Lưu thành chiến lược mới…` | Luôn | Đã có 20 chiến lược | Hỏi tên (§4.4.1), tạo chiến lược với bản đầu tiên |
| `Dùng chiến lược này cho Bot` | Đang mở chiến lược của tôi và bản nháp **giống** bản mới nhất | Chiến lược đã là chiến lược phiên tới của Bot | Đặt cho Bot từ phiên tới (§6.3), có xác nhận |
| `Lưu và dùng cho Bot…` | Bản nháp **khác** bản đã lưu, hoặc là chiến lược mới | | Lưu (bản mới hoặc chiến lược mới), rồi đặt cho Bot từ phiên tới |

#### 4.4.1 Hộp đặt tên

- Ô `Tên chiến lược (tối đa 40 ký tự)`. Bắt buộc, cắt khoảng trắng hai đầu.
- Không trùng (không phân biệt hoa thường) với chiến lược **chưa xóa** của chính người dùng: `Tên này đã có trong chiến lược của bạn.`
- Tên gợi ý: chiến lược mới: trống; đang sửa một chiến lược: `{tên} (2)`.
- Câu dưới ô: `Lưu: rổ mã, Điều kiện Mua, Bán và Giữ tối đa. Lần chạy vừa rồi được gắn với bản này.` Với danh mục đã lưu thêm `(chép danh sách mã hiện tại)`.

#### 4.4.2 Lưu bản mới cho chiến lược Bot đang dùng ở phiên tới

Khi lưu bản mới (hoặc chọn `Lưu và dùng cho Bot…`) cho chiến lược đang là **chiến lược phiên tới** của Bot, hiện hộp:

- Tiêu đề: `Lưu bản mới cho chiến lược đang dùng trên Bot`
- Nội dung:
  - `Chiến lược {tên} đang được Bot dùng.`
  - `Bản này sẽ được Bot dùng từ phiên {Thứ 2 09/11}. Phiên gần nhất ({Thứ 6 06/11}) vẫn ghi nhận bản cũ.`
  - `Lưu trước giờ chốt dữ liệu của phiên {Thứ 2 09/11} thì áp dụng cho phiên đó. Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của bản mới; số phiên đã giữ vẫn tính tiếp.`
- Nút: `Hủy` · `Lưu thành chiến lược mới` · `Lưu và áp dụng phiên tới`

Toast sau khi lưu: `Đã lưu bản {08/11 13:47}. Bot dùng bản này từ phiên {Thứ 2 09/11}.` (hoặc `Đã lưu bản {…}.` khi chiến lược không dùng trên Bot).

### 4.5 Dòng luật cạnh nút Chạy

`T+2 · có phí · khớp giá đóng cửa cùng phiên · vốn 100 triệu, 12% NAV mỗi lệnh, tối đa 2 lệnh mua mỗi phiên, tối đa 30% mỗi mã.` Ở tab Chỉ báo thêm: `Chỉnh ở đây chỉ đổi bản nháp; Bot đổi khi bạn lưu và chọn cho Bot.`

### 4.6 Xóa chiến lược

- Nút 🗑 ở từng dòng của danh sách (§4.3).
- **Khóa** khi chiến lược đang là chiến lược **phiên gần nhất hoặc phiên tới** của Bot. Rê chuột: `Đang dùng trên Bot. Đổi chiến lược của Bot trước khi xóa.` Máy chủ trả `409 STRATEGY_IN_USE`.
- Hộp xác nhận:
  - Tiêu đề: `Xóa chiến lược?`
  - Nội dung: `Xóa {tên} và toàn bộ {n} bản của chiến lược này khỏi danh sách.` / `Kết quả backtest đã chạy và lịch sử giao dịch, nhật ký của Bot vẫn giữ tên chiến lược để tra cứu. Không hoàn tác được.`
  - Nút: `Hủy` · `Xóa chiến lược` (màu nguy hiểm)
- **Xóa mềm:** ghi `deleted_at`. Chiến lược đã xóa không hiện ở danh sách nào, không tính vào giới hạn 20, tên được dùng lại. Lần chạy, lịch phiên, nhật ký vẫn tham chiếu và hiện tên cũ.
- Nếu xóa đúng chiến lược đang mở: nội dung trên màn hình giữ lại thành **chiến lược mới chưa lưu**. Toast: `Đã xóa "{tên}". Nội dung đang mở được giữ ở dạng bản nháp chưa lưu.`

### 4.7 Kết quả

**Tiêu đề:** `Kết quả · {nhãn lần chạy}`, dòng dưới: `Rổ {tên} ({m} mã) · {từ} – {đến} · {N} phiên · giữ tối đa {N} phiên · khớp giá đóng cửa cùng phiên`. Nếu bản nháp/chiến lược đã đổi sau lần chạy: nhãn `Cấu hình đã đổi sau lần chạy này · cần chạy lại`.

Nhãn lần chạy:
- Tab IQX: `Chiến lược IQX · {tên} v{n}`
- Chiến lược của tôi chưa sửa: `{tên} · bản {thời điểm}`
- Bản nháp: `Bản nháp · sửa từ {tên}` hoặc `Bản nháp` (chiến lược mới)

**7 chỉ số** (đơn vị điểm %, 1 chữ số thập phân):

| Ô | Công thức |
|---|---|
| Tổng lợi nhuận | `(V_cuối / 100.000.000 − 1) × 100`, V gồm vị thế mở theo giá đóng cửa cuối |
| Lợi nhuận năm hóa | `((V_cuối / V_0)^(252/N) − 1) × 100`. **N < 60 phiên thì hiện `—`** (sửa R8) |
| Sụt giảm lớn nhất | `min_t (V_t / đỉnh_t − 1) × 100`, đỉnh khởi tạo bằng vốn |
| Giao dịch đã đóng | Số vòng mua–bán đã đóng trên toàn rổ |
| Tỷ lệ thắng | `số lệnh lãi sau phí / số lệnh đã đóng × 100`; chưa có lệnh thì `—` |
| Mua và giữ rổ | Phiên đầu chia đều vốn cho các mã trong rổ (sau lọc VN100), mua theo tỷ lệ (không làm tròn lô), có phí mua, không bán. Giá trị = trung bình `giá_t / giá_đầu`, chia `(1 + phí mua)` |
| VN-Index | `(VNI_t / VNI_đầu − 1) × 100` |

Hai ô so sánh (Mua và giữ rổ, VN-Index) có nền khác để phân biệt.

**Biểu đồ:** 3 đường cùng trục %: Chiến lược, Mua và giữ rổ, VN-Index. Rê chuột hiện ngày và 3 giá trị. Không dùng xanh/đỏ cho đường.

**5 tab kết quả:**

| Tab | Nội dung |
|---|---|
| `Giao dịch ({n})` | Mã · Ngày mua · Giá mua · KL · Ngày bán · Giá bán · Số phiên giữ · Lý do bán (`Điều kiện Bán` / `Giữ tối đa`) · Lãi/lỗ (đ) · %. Mới nhất lên trước, 20 dòng/trang. Chân bảng: `{k} lệnh bán do Giữ tối đa`. Bấm dòng: mở biểu đồ mã |
| `Theo mã` | Mã · Lệnh đã đóng · Thắng · Lãi/lỗ đã chốt · Tạm tính (đang giữ) · Đóng góp vào vốn (%). Chỉ mã đã từng mua. Bấm dòng: biểu đồ mã |
| `Vị thế còn mở ({n})` | Mã · Ngày mua · Giá mua · KL · Giá cuối kỳ · Đã giữ `{h}/{N} phiên` · Tạm tính · %. Chân: tiền mặt cuối kỳ |
| `Lệnh mua bị bỏ qua ({n})` | Đếm theo lý do (nhãn), rồi bảng Ngày · Mã · Lý do (60 dòng gần nhất). Chân: `Khi có hơn 2 mã đạt điều kiện Mua trong cùng phiên, ưu tiên mã có GTGD trung bình 20 phiên cao hơn.` |
| `Giả định` | Danh sách luật §3 bằng lời, nguồn dữ liệu, dòng in đậm `Giả định khớp đúng giá đóng cửa; thực tế có thể khác.`, và các cảnh báo dữ liệu (§4.8) |

**Biểu đồ mã** (hộp): đường giá đóng cửa trong khoảng chạy, ▲ xanh tại điểm mua, ▼ đỏ tại điểm bán do điều kiện Bán, ▼ cam tại điểm bán do Giữ tối đa.

Cuối khối kết quả: `Kết quả quá khứ không bảo đảm kết quả tương lai.`

### 4.8 Cảnh báo dữ liệu

| Mã | Khi nào | Câu hiển thị |
|---|---|---|
| `UNIVERSE_CURRENT_MEMBERS` | Rổ VN30/VN100 | `Rổ dùng thành phần hiện tại cho cả quá khứ (chưa có dữ liệu thành phần rổ theo thời điểm). Kết quả có thể đẹp hơn thực tế.` |
| `UNIVERSE_SNAPSHOT` | Danh mục đã lưu | `Danh mục đã lưu: danh sách mã được chép vào chiến lược khi lưu và dùng cho cả quá khứ.` |
| `SYMBOLS_EXCLUDED` | Có mã ngoài VN100 bị bỏ | `Bỏ {n} mã ngoài VN100: {…}` |
| `SYMBOL_SHORT_HISTORY` | Một mã có ít dữ liệu hơn khoảng chạy (lên sàn muộn) | `{mã}: chỉ có dữ liệu từ {ngày}` |
| `MARKET_CONTEXT_UNAVAILABLE` | Không có VN-Index | Giữ như hiện tại |

Bỏ cảnh báo `PRICES_NOT_ADJUSTED` nếu kho đã điều chỉnh giá (đặt theo §2.1).

### 4.9 Lần chạy đã lưu

- Nút `Lần chạy đã lưu` ở thanh trên cùng (cả hai tab). **Mỗi lần bấm Chạy thành công đều được lưu** (bất biến, như hiện tại).
- Hộp danh sách, có 2 nút lọc: `Chiến lược đang mở` (mặc định) · `Tất cả`.
- Cột: Thời điểm · Chiến lược · bản (hoặc Bản nháp) · Rổ · khoảng · Tổng LN · Sụt giảm · Số GD · thao tác.
- Thao tác:
  - Lần chạy của chiến lược đang mở: `Xem` → nạp kết quả đó vào khối Kết quả (không đổi bản nháp). Nếu cấu hình khác bản nháp hiện tại thì hiện nhãn `Cấu hình đã đổi sau lần chạy này · cần chạy lại`.
  - Lần chạy của chiến lược khác (lọc Tất cả): `Mở chiến lược` → mở chiến lược đó (có hỏi nếu bản nháp đang khác).
  - **Lần chạy cũ** (trước cập nhật, 1 mã, cấu hình chung): nhãn `Cấu hình cũ`, nút `Xem số liệu` → hộp chỉ có Tổng lợi nhuận, Sụt giảm, Số giao dịch và câu `Chạy trên 1 mã theo cấu hình chung trước đây. Chỉ xem, không chạy lại.`
- Câu chân: `Mỗi lần bấm Chạy được lưu lại, không sửa được. Lần chạy theo cấu hình cũ (1 mã) chỉ xem số liệu, không chạy lại.`

### 4.10 Lịch sử bản (tab Chỉ báo)

- Bảng các bản của chiến lược đang mở, mới nhất lên trước: Bản (thời điểm, nhãn `mới nhất`) · Ghi chú (`Từ Chiến lược IQX …`, `Khôi phục từ bản …`, `Chuyển từ thiết lập Bot cũ`) + `Rổ … · giữ tối đa …` · Trên Bot (`▶ Đang chạy trên Bot`, `→ Phiên tới`) · thao tác.
- Thao tác: `Mở` (nạp bản đó vào bản nháp, có hỏi nếu đang sửa) · `Khôi phục thành bản mới` (chỉ với bản không phải mới nhất): tạo bản mới có nội dung bằng bản cũ; áp dụng quy tắc §4.4.2 nếu chiến lược là chiến lược phiên tới của Bot.
- Chiến lược mới chưa lưu: `Chiến lược mới chưa có bản nào. Chạy rồi bấm Lưu để tạo bản đầu tiên.`

---

## 5. Bot: giao diện

### 5.1 Bỏ

- Khung **Danh mục mua mới** (nguồn mua, Xem danh sách, Danh mục đã lưu).
- Danh sách **16 chỉ báo** ở cột phải, cùng công tắc, nút **Luyện tập**, nút **Cấu hình**.
- Hai khung **Điều kiện mua / Điều kiện bán** dưới linh thú.

### 5.2 Giữ

- 4 ô đầu trang: Vốn bot ban đầu, Tiền mặt, Giá trị danh mục, Tổng lợi nhuận.
- Thẻ linh thú (hình, tên, câu mô tả, nhãn `Đã bật Mua và Bán`). Chip dưới linh thú chỉ còn: `Chiến lược: {tên}` · `{n} mã đang giữ`.

### 5.3 Cột phải: hai khung tên chiến lược

**CHIẾN LƯỢC IQX** và **CHIẾN LƯỢC CỦA TÔI**. Mỗi dòng:

| Phần | Nội dung |
|---|---|
| Tên | Huy hiệu `IQX` (khung IQX) + tên |
| Nút `Chi tiết` | Mở Backtest: chiến lược IQX → tab IQX, chọn đúng chiến lược; chiến lược của tôi → tab Chỉ báo, mở bản mới nhất (có hỏi nếu bản nháp đang khác) |
| Nút `Dùng` | Ẩn khi chiến lược đã là chiến lược phiên tới. Bấm: hộp xác nhận (§6.3) |
| Nhãn | `▶ Đang chạy` (phiên gần nhất), `→ Từ phiên {Thứ 2 09/11}` (phiên tới, khi khác phiên gần nhất) |

- Dòng đang chạy có nền nhấn.
- Khung IQX: chỉ hiện chiến lược `shown`, **cộng** chiến lược đã ẩn nếu Bot đang chạy hoặc sẽ chạy nó. Chiến lược đã ẩn có nhãn `IQX đã ngừng cung cấp` và **không có nút Dùng**. Chân khung: `Tham khảo để học, không phải khuyến nghị đầu tư.`
- Khung Của tôi: chiến lược chưa xóa. Chân: `＋ Tạo chiến lược trong Backtest` → Backtest, tab Chỉ báo, chiến lược mới.

### 5.4 Lịch phiên (dưới thẻ linh thú)

Hai dòng, **không** thêm rổ, giữ tối đa hay câu giải thích:

| Dòng | Nội dung |
|---|---|
| Phiên gần nhất · `{Thứ 6 06/11}` | `{[IQX]} {tên} · {bản}` |
| Phiên tới · `{Thứ 2 09/11}` | Giống: `{tên} · {bản}` + nhãn `không đổi`. Khác: `{tên} · {bản}` + nhãn `● có thay đổi` + nút `Xem khác biệt` · `Giữ như phiên gần nhất` |

- `{bản}`: chiến lược của tôi `bản dd/mm HH:mm`; chiến lược IQX `v{n}`.
- **Xem khác biệt:** hộp liệt kê khác nhau giữa hai bản: Rổ mã, Giữ tối đa, từng dòng điều kiện Mua/Bán bị bỏ (gạch, đỏ) hoặc thêm (xanh). Giống nhau thì `Hai bản giống nhau về điều kiện.`
- **Giữ như phiên gần nhất:** đặt phiên tới = đúng chiến lược và bản của phiên gần nhất (ghim bản). Toast `Phiên tới giữ như phiên gần nhất.`
- **Chiến lược IQX có phiên bản mới** hơn phiên bản Bot sẽ dùng phiên tới: thêm khung dưới dòng Phiên tới: `Chiến lược IQX · {tên} có bản v{m}.` + `Xem khác biệt` · `Cập nhật từ phiên {…}`. Bấm Cập nhật: phiên tới dùng v{m}.

### 5.5 Danh mục Bot: 3 tab

Thẻ `Danh mục Bot` với tab `Đang giữ` · `Lịch sử` · `Nhật ký` (và nút ⓘ như hiện tại).

| Tab | Cột |
|---|---|
| **Đang giữ** | Giữ **đúng các cột hiện có**: Mã · Số CP · Giá vốn · Giá tham chiếu · Lãi / Lỗ (đ và %) · Đã giữ (`{h} phiên`) · Nguồn mua lúc mở · Phạm vi hiện tại (`Trong nguồn mua` / `Ngoài nguồn mua`). "Nguồn mua" = rổ của chiến lược |
| **Lịch sử** (mới: các giao dịch đã bán) | Mã · Số CP · Ngày mua · Ngày bán · Giá mua · Giá bán · Số phiên giữ · Lãi / Lỗ (đ, % sau phí) · Lý do bán (`Điều kiện Bán` / `Giữ tối đa`) · Chiến lược · bản |
| **Nhật ký** | Phiên · Sự kiện (`Mua {mã}`, `Bán {mã}`, `Bắt đầu phiên`, `Đổi chiến lược`) · Số CP · Giá khớp · Chiến lược · bản |

Mỗi lệnh của Bot lưu kèm `strategy_source`, `strategy_id`, `strategy_version`, `exit_reason`.

---

## 6. Phiên bản và lịch phiên

### 6.1 Quy tắc chính

| Trường hợp | Phiên tới dùng |
|---|---|
| Chiến lược **của tôi** | **Bản mới nhất** của chiến lược tại giờ chốt dữ liệu của phiên đó (`follow_latest = true`) |
| Chiến lược của tôi sau khi bấm **Giữ như phiên gần nhất** | Bản được ghim (`follow_latest = false`). Lưu bản mới cho chiến lược này và xác nhận `Lưu và áp dụng phiên tới` thì trở lại `follow_latest = true` |
| Chiến lược **IQX** | **Phiên bản đã chọn** (ghim). Xuất bản phiên bản mới không đổi Bot; người dùng thấy thông báo và tự bấm Cập nhật |
| Đổi sang chiến lược khác (`Dùng`) | Chiến lược mới, theo hai dòng trên |

### 6.2 Lưu bản mới

- Tạo dòng mới trong `user_strategy_versions` với `version = latest + 1`. Bản cũ không đổi.
- Gửi kèm `expected_latest_version`. Lệch (lưu ở hai tab trình duyệt) thì `409 STRATEGY_VERSION_CONFLICT`, giao diện báo `Chiến lược vừa được lưu ở nơi khác. Tải lại để xem bản mới nhất.`

### 6.3 Đổi chiến lược của Bot

- Hộp xác nhận: tiêu đề `Đổi chiến lược của Bot?`; nội dung `Từ phiên {Thứ 2 09/11}, Bot dùng {tên}.` / `Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của chiến lược mới.`; nút `Hủy` · `Dùng cho Bot`.
- Toast: `Bot dùng {tên} từ phiên {…}.`
- Không đổi phiên gần nhất. Không tạo lệnh ngay.

### 6.4 Giờ chốt và khóa lịch

- **Giờ chốt dữ liệu** = giờ nền tảng cập nhật dữ liệu phiên vào kho (dev xác nhận, §15). Mọi so sánh thời gian theo giờ Việt Nam.
- Tại giờ chốt dữ liệu của ngày giao dịch D, job Bot:
  1. lấy dòng lịch của phiên D (phiên tới), giải `follow_latest` thành số bản cụ thể;
  2. **khóa** dòng đó (`locked_at`), dùng nó để chạy luật §3;
  3. tạo dòng phiên tới mới cho ngày giao dịch kế tiếp, chép từ dòng vừa khóa (giữ nguyên `follow_latest` và phiên bản ghim).
- Lưu, đổi chiến lược, Giữ như phiên gần nhất, Cập nhật IQX: chỉ ghi vào dòng **phiên tới** chưa khóa. Thao tác sau giờ chốt của D tự rơi vào phiên kế tiếp.
- Ngày nghỉ và ngày lễ: dùng lịch ngày giao dịch của kho. Nhãn phiên hiện thứ và ngày (`Thứ 2 09/11`).
- Một thao tác đúng lúc job đang khóa: job khóa trong một giao dịch DB; thao tác của người dùng gửi `expected_next_session`, lệch thì `409 SCHEDULE_SESSION_LOCKED`, giao diện tải lại lịch và báo `Phiên {…} vừa chốt. Thay đổi áp dụng từ phiên {…}.` rồi thử lại cho phiên mới.

---

## 7. Chiến lược IQX

- Dùng **5 chiến lược** của spec Tab IQX §3.4 (Theo xu hướng, Phá đỉnh, Động lượng MACD, Hồi phục quá bán, Theo dòng tiền), giữ nguyên điều kiện Mua/Bán, ý tưởng, nguồn gốc, khi nào dễ sai.
- **Đổi dữ liệu khởi tạo:** cả 5 chiến lược `universe = VN30`, `max_holding = 30`. Tạo **v2** với `reason = "Thêm rổ mã; giữ tối đa 30 phiên"` (hoặc sửa v1 nếu chưa xuất bản ra production; dev chọn và báo lại).
- Rổ của chiến lược IQX chỉ được là `VN30` hoặc `VN100`.

---

## 8. Quản trị · Mẫu IQX (bổ sung cho spec Tab IQX §5)

- Bảng danh sách tab **Chiến lược IQX** thêm cột **Rổ mã** và **Giữ tối đa**.
- Chế độ soạn (spec Tab IQX §5.3) dùng **đúng form tab Chỉ báo** của Backtest, gồm ô Rổ (chỉ VN30/VN100) và ô Giữ tối đa. Ẩn nút Lưu ▾, danh sách chiến lược đã lưu, Lần chạy đã lưu. Giữ Chạy để thử (kết quả không lưu).
- Kiểm tra khi xuất bản (bổ sung): `universe ∈ {VN30, VN100}`; `max_holding` 3–250; ít nhất một dòng Mua và một dòng Bán đang bật (giữ như spec Tab IQX).
- Hộp xác nhận xuất bản luôn thêm: `Bot của người dùng đang dùng phiên bản cũ không đổi theo; người dùng thấy thông báo có bản mới ở Lịch phiên.`
- **Ẩn** một chiến lược IQX:
  - biến mất khỏi tab IQX của Backtest và khỏi danh sách chọn của Bot;
  - **Bot đang chạy (hoặc sẽ chạy phiên tới) chiến lược đó vẫn chạy tiếp** phiên bản đã ghim; tên có nhãn `IQX đã ngừng cung cấp`; người dùng không chọn mới được (`409 IQX_TEMPLATE_HIDDEN`);
  - nội dung hộp xác nhận Ẩn: `Mục này biến mất khỏi tab IQX của Backtest và danh sách chọn của Bot. Bot đang chạy chiến lược này vẫn chạy tiếp phiên bản đã chọn, có nhãn "IQX đã ngừng cung cấp"; người dùng không chọn mới được.`
- Cột "Người dùng bấm Dùng · 30 ngày" (spec Tab IQX §5.2) đổi thành **"Bot đang dùng"** (số Bot có chiến lược này ở phiên tới) và **"Lần chạy thử · 30 ngày"** (số lần chạy Backtest ở tab IQX). Sự kiện `iqx_template_used` thay bằng `iqx_strategy_run` và `iqx_strategy_assigned`.

---

## 9. Bỏ

| Nơi | Bỏ |
|---|---|
| Bot | Khung Danh mục mua mới; danh sách 16 chỉ báo; công tắc chỉ báo; nút Luyện tập; nút Cấu hình; khung Điều kiện Mua/Bán dưới linh thú |
| Backtest | Ô Cổ phiếu; ô Vốn nhập tay; ô chọn khớp lệnh (`next_open`/`same_close`); ô Phí (`standard`/`none`); nút `Lưu cho Bot`; nút `Về cấu hình đã lưu`; nút `Tạo cảnh báo` (tạo cảnh báo từ kết quả backtest); nút `Dùng` của chiến lược IQX |
| Cấu hình | `shared_config` làm nguồn cấu hình của Bot và Backtest; `effective_config_sessions` (thay bằng `bot_strategy_schedule`) |
| API | `PATCH /api/v2/strategy/shared-config` từ giao diện; `shared_revision`, `symbol`, `assumptions` trong `POST /backtests`; chế độ `research` |
| Học viện | Mọi nút Luyện tập gắn với chỉ báo trên Bot/Backtest |

Giữ bảng và endpoint cũ ở chế độ **chỉ đọc** cho tới khi chuyển đổi xong (§10.5), rồi gỡ.

---

## 10. Dữ liệu và API

Tên bảng là tên logic; dev map vào schema thật, theo quy ước migration hiện có.

### 10.1 Bảng mới

**`user_strategies`**

| Cột | Ghi chú |
|---|---|
| `id` uuid PK | |
| `user_id` | FK `users`, ON DELETE CASCADE |
| `name` varchar(40) | Duy nhất theo `(user_id, lower(name))` **khi `deleted_at IS NULL`** (partial unique index) |
| `latest_version` int | |
| `origin` jsonb nullable | `{type:"iqx_strategy", id, version}` khi bản đầu tạo từ chiến lược IQX (chỉ hiển thị, thống kê) |
| `created_at`, `updated_at` | |
| `deleted_at` timestamptz nullable | Xóa mềm |

Giới hạn 20 chiến lược `deleted_at IS NULL` mỗi user: kiểm tra trong giao dịch khi tạo (`409 STRATEGY_LIMIT`).

**`user_strategy_versions`** (bất biến: trigger chặn UPDATE/DELETE như `backtest_runs`)

| Cột | Ghi chú |
|---|---|
| `strategy_id`, `version` | PK ghép |
| `content` jsonb | `{universe, buy, sell, max_holding}` (§10.2) |
| `config_hash` char(64) | sha256 của `canonicalJson(content)` |
| `from_run_id` uuid nullable | Lần chạy được dùng để lưu. Bắt buộc với bản do người dùng lưu; null với bản do chuyển đổi |
| `note` varchar(120) nullable | `Khôi phục từ bản …`, `Chuyển từ thiết lập Bot cũ` |
| `created_at` | Thời điểm lưu, dùng làm nhãn bản |

**`bot_strategy_schedule`**

| Cột | Ghi chú |
|---|---|
| `bot_id`, `session_date` | PK ghép |
| `strategy_source` | `iqx` \| `user` |
| `strategy_id` | id `iqx_templates` hoặc `user_strategies` |
| `version` int nullable | Null khi `follow_latest = true` và chưa khóa |
| `follow_latest` bool | Chỉ có nghĩa với `user` |
| `locked_at` timestamptz nullable | Có giá trị = phiên đã chạy; khi đó `version` NOT NULL |
| `updated_at`, `updated_by` | |

Ràng buộc: mỗi bot có tối đa **một** dòng chưa khóa (phiên tới).

### 10.2 `content` của chiến lược (dùng chung cho `user_strategy_versions.content` và `iqx_template_versions.content.definition`)

```json
{
  "universe": { "type": "vn30" | "vn100" | "saved_list",
                "list_id": "…", "list_name": "…", "symbols": ["ACB", "…"] },
  "buy":  [ /* thẻ chỉ báo theo định dạng lưu điều kiện của Bot (Chỉ báo v3 §1.4) */ ],
  "sell": [ /* như trên, được phép rỗng */ ],
  "max_holding": 30
}
```

- `saved_list`: `symbols` là danh sách **đã lọc VN100**, chép vào lúc lưu. Không đổi theo khi danh mục bên Bộ lọc đổi.
- Chiến lược IQX: chỉ `vn30` | `vn100`; trường `max_hold` cũ của spec Tab IQX đổi thành `max_holding` trong `definition`.

### 10.3 API người dùng (`/api/v2/strategy`, giữ guard hiện có: cờ tính năng, xác thực, Premium)

| Method | Path | Request | Hành vi |
|---|---|---|---|
| GET | `/strategies` | | Chiến lược chưa xóa của user: `id, name, latest_version, latest_saved_at, universe_label, on_bot: {last, next}` |
| POST | `/strategies` | `name, content, from_run_id` | Tạo chiến lược + bản 1. Kiểm tra tên, giới hạn, `from_run_id` |
| PATCH | `/strategies/:id` | `name` | Đổi tên (giao diện chưa dùng; để sẵn) |
| DELETE | `/strategies/:id` | | Xóa mềm. `409 STRATEGY_IN_USE` nếu nằm ở dòng phiên gần nhất hoặc phiên tới của Bot |
| GET | `/strategies/:id/versions` | | Danh sách bản: `version, created_at, note, universe_label, max_holding, on_bot` |
| GET | `/strategies/:id/versions/:v` | | Nội dung một bản |
| POST | `/strategies/:id/versions` | `content, from_run_id, expected_latest_version` | Tạo bản mới |
| GET | `/iqx?kind=strategy` | | Như spec Tab IQX §4.2, thêm `universe`, `max_holding` |
| POST | `/backtests` | xem dưới | Chạy và lưu lần chạy |
| GET | `/backtests?strategy_source=&strategy_id=&limit=` | | Lần chạy, lọc theo chiến lược; không lọc = tất cả. Lần chạy cũ có `legacy: true` |
| GET | `/backtests/:id` | | Như hiện tại, thêm `per_symbol`, `open_positions`, `skipped_orders`, `basket_buy_hold` |
| GET | `/backtests/:id/trades` | `offset, limit` | Như hiện tại |

**Kiểm tra `from_run_id`** (POST strategies/versions): lần chạy thuộc chính user, `status = succeeded`, `config_hash` của lần chạy = `config_hash(content)`. Sai thì `422 RUN_REQUIRED` với thông điệp `Bản nháp đã sửa sau lần chạy. Bấm Chạy trước khi Lưu.`

**`POST /backtests` body (thay `backtestRunBodySchema`):**

```json
{
  "idempotency_key": "…",
  "strategy": { "source": "iqx", "id": "phadinh", "version": 2 }
           | { "source": "user", "id": "uuid", "version": 3 }
           | { "source": "draft", "content": { … }, "base": { "id": "uuid", "version": 3 } | null },
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD"
}
```

- Không còn `shared_revision`, `symbol`, `assumptions`, `research`. Vốn, phí, khớp lệnh lấy từ module luật (§3).
- Chạy ở tab IQX: `source = "iqx"` với phiên bản hiện hành (hoặc phiên bản Bot đang dùng nếu mở từ Bot "Chi tiết" một chiến lược đã ẩn).
- Snapshot lưu: `strategy_ref`, `content` đã dùng, `config_hash`, `universe_resolved` (danh sách mã thực dùng), `excluded_symbols`, `data_store`, `data_as_of`, `price_unit`, `adjusted`, `rules_version`, cảnh báo §4.8.
- Giữ idempotency, bất biến, thứ tự xử lý lỗi của spec as-is §3.3–3.5.

### 10.4 API Bot

| Method | Path | Request | Hành vi |
|---|---|---|---|
| GET | `/bots/:id/schedule` | | `{ last: {session_date, source, id, name, version, version_label, hidden}, next: {…, follow_latest, cutoff_at}, iqx_update: {latest_version} \| null }` |
| PUT | `/bots/:id/schedule/next` | `source, id, version?, expected_next_session` | Đặt chiến lược phiên tới. `user`: `follow_latest = true`. `iqx`: ghim `version` (mặc định phiên bản hiện hành). `409 IQX_TEMPLATE_HIDDEN` nếu chọn mới chiến lược IQX đã ẩn |
| POST | `/bots/:id/schedule/next/keep-last` | `expected_next_session` | Chép dòng phiên gần nhất, ghim bản |
| GET | `/bots/:id/closed-trades` | `offset, limit` | Tab Lịch sử |
| GET | `/bots/:id/log` | `offset, limit` | Tab Nhật ký, có `strategy_ref` |

Bỏ khỏi Bot: endpoint đổi danh mục mua mới và bật/tắt, cấu hình chỉ báo.

### 10.5 Chuyển đổi dữ liệu (migration)

Với mỗi user có Bot:
1. Tạo `user_strategies` tên **`Chiến lược của tôi (từ thiết lập cũ)`**, bản 1, `note = "Chuyển từ thiết lập Bot cũ"`:
   - `buy`, `sell`: từ revision cấu hình **đang có hiệu lực với Bot** (không phải bản nháp mới nhất);
   - `universe`: từ danh mục mua mới hiện tại của Bot (VN30 / VN100 / danh mục đã lưu → lọc VN100);
   - `max_holding = 250` (gần nhất với hành vi hiện tại là không giới hạn), để vị thế đang giữ không bị bán ép ngay.
2. Tạo dòng `bot_strategy_schedule` đã khóa cho phiên gần nhất và dòng phiên tới `follow_latest = true`, cùng chiến lược này.
3. User có revision **mới hơn** revision Bot đang dùng (đã lưu nhưng chưa hiệu lực): tạo thêm bản 2 từ revision đó, `note = "Chuyển từ cấu hình chung chưa áp dụng"`. Vì `follow_latest`, phiên tới sẽ dùng bản 2, giống hành vi cũ.
4. Báo cáo sau migration: số user, số user có danh mục mua chứa mã ngoài VN100 (bị lọc), số user rơi vào bước 3.

Lần chạy backtest cũ giữ nguyên, gắn `legacy = true` (suy từ `shared_revision IS NOT NULL`), hiển thị theo §4.9. Không chạy lại.

User chưa có Bot: không tạo gì; danh sách chiến lược trống.

### 10.6 Mã lỗi mới

| HTTP | `code` | Khi nào |
|---|---|---|
| 409 | `STRATEGY_NAME_TAKEN` | Trùng tên |
| 409 | `STRATEGY_LIMIT` | Đã có 20 chiến lược |
| 409 | `STRATEGY_IN_USE` | Xóa chiến lược Bot đang/sắp dùng |
| 409 | `STRATEGY_VERSION_CONFLICT` | `expected_latest_version` lệch |
| 404 | `STRATEGY_NOT_FOUND` | Không có, đã xóa, hoặc của user khác |
| 422 | `RUN_REQUIRED` | `from_run_id` không hợp lệ |
| 422 | `STRATEGY_INVALID` | Nội dung sai (dùng bộ kiểm tra chỉ báo hiện có; thêm: Mua cần ≥ 1 dòng bật; `max_holding` 3–250; rổ hợp lệ) |
| 422 | `UNIVERSE_EMPTY` | Rổ sau khi lọc VN100 không còn mã |
| 422 | `DATE_RANGE_INVALID` | Ngoài khoảng của kho (§2.3) |
| 409 | `IQX_TEMPLATE_HIDDEN` | Chọn mới chiến lược IQX đã ẩn |
| 409 | `SCHEDULE_SESSION_LOCKED` | Phiên tới vừa khóa |

### 10.7 Giới hạn thực thi

- Rổ tối đa **100 mã** (nâng giới hạn 30 của chế độ `system` cũ).
- Dev đo thời gian chạy VN100 × 10 năm. Nếu vượt ngân sách 30 giây của executor hiện tại: tính sẵn chỉ báo theo mã và cache theo `(mã, chỉ báo, tham số, data_as_of)`, hoặc nâng ngân sách; báo lại số đo.

---

## 11. Sửa spec Tab IQX v1.1

| Mục | Sửa thành |
|---|---|
| §3.1 Vị trí | Giữ 2 tab `IQX · Chỉ báo 16`. Tab mặc định: Chỉ báo |
| §3.2 Thẻ | Bỏ nút `Dùng`; cả thẻ bấm được để chọn. Tóm tắt thêm `Rổ {…}` |
| §3.3 Bấm "Dùng" | **Thay bằng §4.2 của spec này**: chọn để xem chỉ đọc và chạy thử, không điền vào bản nháp, không lưu |
| §3.4 Danh sách | Giữ điều kiện; `Giữ tối đa` cả 5 = **30**; thêm `Rổ = VN30` |
| §3.5 Mua và giữ {mã} | Thay bằng **Mua và giữ rổ** và **VN-Index** (§4.7) |
| §4.1 `content` chiến lược | Thêm `universe`; `max_holding` theo §10.2 |
| §4.3 Nguồn gốc | Snapshot lần chạy: `strategy_ref`; bản chiến lược của tôi: `origin` |
| §5.2 Cột thống kê | Theo §8 của spec này |
| §5.3 Chế độ soạn | Thêm ô Rổ, Giữ tối đa; ẩn các phần theo §8; bỏ câu "ẩn thẻ Danh mục mua mới của Bot" |
| §2.3 mục 6 và dòng "Đi cặp với" | Theo §12 của spec này |

---

## 12. Liên kết từ Bộ lọc

- Bỏ hành vi "bấm một mã trong kết quả Bộ lọc → Backtest mã đó" (Backtest không còn chạy 1 mã).
- Thêm nút **`Backtest với rổ là kết quả này`** ở đầu bảng kết quả Bộ lọc:
  - mở Backtest, tab Chỉ báo, **chiến lược mới** (có hỏi nếu bản nháp đang khác);
  - rổ = các mã trong kết quả hiện tại thuộc VN100 (kiểu `saved_list`, `list_name = "Kết quả bộ lọc {tên bộ lọc hoặc 'chưa lưu'} · {dd/mm}"`), kèm cảnh báo mã bị bỏ như §2.2;
  - không tự chạy.
- Bỏ dòng `Đi cặp với` và trường `pair_slug` của Bộ lọc IQX khỏi giao diện (giữ cột trong DB, không dùng).

---

## 13. Thông điệp

| Chỗ | Chữ |
|---|---|
| Chân tab IQX | `Chiến lược dựng sẵn bởi IQX: bấm để xem điều kiện và chạy thử, không chỉnh được. Chọn cho Bot ở trang Bot. Tham khảo để học, không phải khuyến nghị đầu tư.` |
| Nhãn tab IQX | `Chỉ xem · chạy thử` |
| Dải IQX | `{ý tưởng} Chiến lược IQX không chỉnh được; bấm Chạy để xem hiệu quả.` |
| Mã ngoài VN100 | `Bỏ {n} mã ngoài VN100 (không có trong kho dữ liệu): {…}. Backtest và Bot chỉ dùng {m} mã còn lại.` |
| Rổ rỗng | `Danh mục này không có mã nào thuộc VN100.` |
| Mua trống | `Cần ít nhất một dòng Mua đang bật để chạy.` |
| Khóa Lưu | `Bản nháp đã sửa sau lần chạy (hoặc chưa chạy). Bấm Chạy trước khi Lưu.` |
| Chưa đổi | `Chưa có thay đổi so với bản đang mở.` |
| Đủ 20 | `Đã đủ 20 chiến lược. Xóa bớt trước khi tạo mới.` |
| Xóa khóa | `Đang dùng trên Bot. Đổi chiến lược của Bot trước khi xóa.` |
| Giả định | `Giả định khớp đúng giá đóng cửa; thực tế có thể khác.` |
| Kết quả | `Kết quả quá khứ không bảo đảm kết quả tương lai.` |
| IQX ẩn trên Bot | `IQX đã ngừng cung cấp` |
| Đổi Bot | `Từ phiên {…}, Bot dùng {tên}.` / `Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của chiến lược mới.` |
| Phiên vừa chốt | `Phiên {…} vừa chốt. Thay đổi áp dụng từ phiên {…}.` |

Các câu khác lấy đúng theo file HTML mẫu.

---

## 14. Nghiệm thu

### 14.1 Luật mô phỏng (test golden, chạy cho cả module Backtest và đường chạy Bot)

1. Rổ 3 mã dựng tay, 30 phiên: kết quả khớp tính tay cho: bán trước mua sau; tiền bán dùng ngay trong phiên; 12% NAV; tối đa 2 lệnh; thứ tự theo GTGD 20 phiên (và hòa thì A→Z); lô 100; phí.
2. T+2: mua phiên P, điều kiện Bán đạt ở P+1 → không bán; đạt ở P+2 → bán ở P+2.
3. Giữ tối đa N: không có điều kiện Bán → bán đúng phiên `P + N`, lý do `Giữ tối đa`. Điều kiện Bán và Giữ tối đa cùng đạt → lý do `Điều kiện Bán`.
4. Mã vừa bán trong phiên không được mua lại cùng phiên.
5. Lệnh bị bỏ qua ghi đúng 3 lý do.
6. **Backtest = Bot:** cho Bot chạy lại (replay) 60 phiên lịch sử với một chiến lược; lệnh và NAV từng phiên **trùng** với Backtest cùng chiến lược, cùng khoảng.
7. Giá theo đồng: lần chạy có `price_unit = VND`; `entry_price` của FPT ở mức hàng chục nghìn (không phải hàng chục).

### 14.2 Backtest

8. Tab mặc định Chỉ báo; thư viện chỉ báo giống hệt hiện tại, **không có Luyện tập**.
9. Tab IQX: chỉ chiến lược đang hiện; bấm thẻ → thẻ chỉ báo không có Chỉnh/✕; Rổ, Giữ tối đa khóa; không có Lưu; Chạy được.
10. Chuyển tab không mất bản nháp, không mất kết quả của tab kia.
11. Nút tên chiến lược chỉ hiện tên; danh sách có đủ chiến lược đã lưu, nhãn Bot, 🗑, ＋ Tạo mới.
12. Xóa: chiến lược Bot đang/sắp dùng không xóa được (cả gọi API thẳng → 409). Xóa chiến lược khác: biến mất, tên dùng lại được, lần chạy cũ vẫn hiện tên.
13. Lưu: khóa khi chưa chạy hoặc sửa sau khi chạy; API với `from_run_id` sai → 422.
14. Lưu bản mới cho chiến lược phiên tới của Bot → hộp §4.4.2; Lịch phiên trên Bot đổi ngay.
15. Giới hạn 20, trùng tên, hai tab trình duyệt cùng lưu → đúng lỗi.
16. Danh mục có mã ngoài VN100 → câu cảnh báo, kết quả chỉ trên mã còn lại; bản lưu có `symbols` đã lọc.
17. Ô Vốn khóa 100.000.000; không còn ô Cổ phiếu, khớp lệnh, phí, Tạo cảnh báo.
18. 7 chỉ số, biểu đồ 3 đường, 5 tab kết quả, biểu đồ mã có 3 loại điểm.
19. Lần chạy đã lưu: lọc đúng; Xem nạp kết quả; lần chạy cũ chỉ xem số liệu.
20. Lịch sử bản: Mở, Khôi phục thành bản mới (tạo bản mới, không sửa bản cũ).

### 14.3 Bot

21. Không còn danh mục mua mới, 16 chỉ báo, Luyện tập, Cấu hình, khung điều kiện.
22. Hai khung tên; Chi tiết mở đúng tab và đúng chiến lược; Dùng → xác nhận → Lịch phiên đổi.
23. Lịch phiên: giống → `không đổi`; khác → `● có thay đổi`, Xem khác biệt liệt kê đúng, Giữ như phiên gần nhất hoạt động.
24. Quản trị xuất bản v mới của chiến lược IQX Bot đang dùng → Bot vẫn bản cũ, có thông báo, bấm Cập nhật thì phiên tới đổi.
25. Quản trị ẩn chiến lược IQX Bot đang dùng → Bot vẫn chạy, nhãn `IQX đã ngừng cung cấp`, không có nút Dùng; chiến lược biến mất khỏi tab IQX.
26. Giờ chốt: lưu trước giờ chốt của D → phiên D dùng bản mới; lưu sau → phiên D+1. Ngày lễ bị bỏ qua.
27. Tab Lịch sử và Nhật ký có chiến lược · bản và lý do bán.

### 14.4 Chuyển đổi

28. User có Bot: sau migration có đúng 1 (hoặc 2, §10.5 bước 3) bản; Bot phiên tới chạy ra **cùng lệnh** như trước migration với cùng dữ liệu (trừ mã ngoài VN100 bị lọc).
29. Lần chạy cũ hiện ở Lần chạy đã lưu với nhãn `Cấu hình cũ`.

### 14.5 Màn hình nhỏ

30. 390 px: không cuộn ngang cả trang ở Backtest (hai tab, danh sách chiến lược, menu Lưu), Bot, Quản trị.

---

## 15. Dev cần xác nhận trước khi làm

| # | Nội dung |
|---|---|
| 1 | **Giờ chốt dữ liệu**: giờ nền tảng cập nhật dữ liệu phiên vào kho mỗi ngày; lịch ngày giao dịch lấy từ đâu |
| 2 | Kho VN100 của Flashback: có OHLCV và khối lượng; giá đã điều chỉnh hay chưa; đơn vị; lưu từ năm nào; có giữ mã đã rời VN100; có VN-Index không |
| 3 | Code Bot hiện tại so với §3: 12% NAV, 2 lệnh/phiên, 30%/mã, ưu tiên GTGD 20 phiên, tiền bán dùng ngay, khớp giá đóng cửa, T+2, phí. Liệt kê chỗ khác để sửa theo |
| 4 | Bot đang đọc giá từ đâu; kế hoạch chuyển sang kho VN100 |
| 5 | Thời gian chạy VN100 × 10 năm (§10.7) |
| 6 | Chiến lược IQX đã xuất bản ra production chưa (§7: tạo v2 hay sửa v1) |
| 7 | Số user bị ảnh hưởng bởi lọc VN100 khi chuyển đổi (§10.5 bước 4) |
| 8 | Tính năng cảnh báo hiện có (`strategy_alerts`) đang tham chiếu `backtest_run`/`shared_revision`: cách xử lý khi bỏ "Tạo cảnh báo từ backtest" và bỏ cấu hình chung (cảnh báo cũ ngừng hay giữ chỉ đọc) |

Bàn giao:
- trả lời bảng trên;
- danh sách file đã sửa và migration;
- kết quả test §14, đặc biệt test golden §14.1 (mục 1–7) và test chuyển đổi §14.4.

Không báo "đã test" nếu chưa chạy test.

---

### Câu giao việc ngắn cho AI Dev

> Triển khai **Chiến lược** theo spec này và `IQX-Chien-Luoc-Backtest-Bot-MAU.html`:
> - **Backtest chạy trên cả rổ** (VN30, VN100, danh mục đã lưu lọc VN100), dữ liệu từ **kho VN100 của Flashback**, khớp **giá đóng cửa cùng phiên**, vốn **cố định 100 triệu**, theo **đúng luật Bot** (§3) đặt trong **một module dùng chung với Bot**.
> - Backtest 2 tab: **IQX** chỉ xem và chạy thử; **Chỉ báo** tạo, sửa, lưu theo bản, xóa chiến lược của tôi (tối đa 20). Chọn chiến lược ở **nút tên chiến lược** trên thanh trên cùng.
> - **Bot chỉ chọn chiến lược** (khung IQX và Của tôi, nút Chi tiết, Dùng), có **Lịch phiên** (§5.4, §6). Bỏ danh mục mua mới, 16 chỉ báo, Luyện tập trên Bot.
> - Thêm Giữ tối đa, lệnh bị bỏ qua, Mua và giữ rổ, Lần chạy đã lưu, tab Lịch sử của Bot. Bỏ Tạo cảnh báo từ backtest.
> - Chuyển đổi cấu hình Bot cũ thành chiến lược bản 1 để Bot không gián đoạn (§10.5).
>
> Trước khi làm, trả lời §15. Test golden §14.1 phải chứng minh **Backtest và Bot ra cùng lệnh**.
