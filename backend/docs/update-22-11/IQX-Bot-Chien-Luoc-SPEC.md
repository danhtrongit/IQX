# IQX · SPEC: Bot và Chiến lược v2.0

## Chiến lược · Backtest theo rổ · Bot chọn chiến lược · Giữ tối đa · T+2 · Thông báo

**Phiên bản:** 2.0 · 08/11/2026
**Dành cho:** AI Dev triển khai trên codebase iqx.vn.
**HTML mẫu đi kèm:** `IQX-Bot-Chien-Luoc-MAU-v2.0.html`.
- File HTML là chuẩn **nội dung và hành vi**. Không chép CSS hay layout.
- Giá cổ phiếu, kết quả backtest, số liệu Bot trong file mẫu là **minh họa**.
- Khung "Điều khiển mô phỏng" trên trang Bot của file mẫu **không** thuộc giao diện thật (§15).

**Spec này gộp và thay thế:**

| Tài liệu | Quan hệ |
|---|---|
| `IQX-Bo-Bot-SPEC-v1.2.md` + `IQX-Bo-Bot-MAU-v1.2.html` (chưa lên web) | **Thay hoàn toàn.** Phần còn dùng đã chép vào đây |
| `IQX-Chien-Luoc-Backtest-Bot-SPEC-v1.0.md` + HTML mẫu đi kèm (chưa gửi dev) | **Thay hoàn toàn** |
| `IQX-BACKTEST-SPEC.md` (as-is, 08/11/2026) | Chế độ `single` 1 mã, cấu hình chung, khớp `next_open`, vốn do người dùng nhập, `fee_preset`, `research`: **thay** |
| `IQX-Tab-IQX-Loc-Backtest-SPEC.md` v1.1 | **Sửa** theo §12 |
| Bộ Bot v1.0 (`IQX-Bo-Bot-SPEC-v1.0.md`) | Giữ hiệu lực, **trừ** các đoạn ghi ở §1.3 |

**Giữ nguyên, không thuộc phạm vi:** `IQX_CHI_BAO_SPEC_v3.md` (đã lên web: dòng điều kiện, toán tử, miền nhập, hàm tính, form Chỉnh), Bộ lọc v1.1 (trừ §13), Bản tin v4, Flashback, quyền Premium và cờ tính năng hiện có của trang Chiến lược. Tab **Cảnh báo** của Chiến lược giữ như web hiện tại.

> **Tóm tắt**
> 1. Thêm **Chiến lược** = Rổ mã + Điều kiện Mua + Điều kiện Bán + **Giữ tối đa**. Hai nguồn: **Chiến lược IQX** (quản trị viên soạn) và **Chiến lược của tôi** (người dùng soạn trong Backtest, tối đa 20, mỗi lần Lưu là một bản).
> 2. **Backtest chạy trên cả rổ** (VN30, VN100, danh mục đã lưu), theo **đúng luật Bot**, khớp **giá đóng cửa cùng phiên**, vốn **cố định 100.000.000 đ**, có **T+2** và **giữ tối đa**. Giá lấy từ **kho VN100 của Flashback**.
> 3. Backtest có 2 tab: **IQX** (chỉ xem và chạy thử) và **Chỉ báo** (tạo, sửa, lưu, xóa chiến lược của tôi).
> 4. **Bot chỉ chọn chiến lược.** Bỏ trên Bot: danh mục mua mới, giới hạn nắm giữ, 16 chỉ báo, Luyện tập. Bot có **Lịch phiên** cho biết phiên gần nhất và phiên tới chạy chiến lược nào, bản nào. **Không có nút bật/tạm dừng Bot.**
> 5. Giữ từ Bot v1.2: **T+2**, cách đếm phiên giữ, đến hạn chưa khớp, cảnh báo khi hạ giữ tối đa, bảng Đang giữ/Lịch sử/Nhật ký, **Thông báo** (chuông, email).
> 6. **Bỏ hẳn Luyện tập (mini).**
> 7. Backtest và Bot dùng **chung một module luật** và **chung nguồn giá**. Bỏ cấu hình chung (`shared_config`). Dữ liệu cũ chuyển thành chiến lược để Bot chạy liền mạch.

---

## 0. Quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | **Backtest là nơi tạo và sửa chiến lược. Bot chỉ chọn.** Không chỗ nào trên Bot sửa điều kiện |
| Q2 | **Kết quả Backtest phải là cách Bot sẽ chạy.** Cùng luật vốn, thứ tự ưu tiên, phí, nguồn giá, cách đếm phiên. Khác nhau là lỗi |
| Q3 | Chiến lược gồm **rổ, Mua, Bán, giữ tối đa**. Luật vốn (12% NAV, 2 lệnh, 30%) cố định, không thuộc chiến lược |
| Q4 | **Khớp giá đóng cửa cùng phiên** ở cả Bot và Backtest. Bỏ khớp mở cửa phiên sau |
| Q5 | **Vốn Backtest cố định 100.000.000 đ**, bằng vốn Bot |
| Q6 | **Giữ tối đa** 3–250 phiên, số nguyên, không tắt được. Phiên khớp Mua là **phiên 0**. Chiến lược mới và chiến lược IQX mặc định **30** |
| Q7 | **T+2**: mua phiên T, bán sớm nhất phiên T+2. Tín hiệu Bán trước T+2 **không dời**; phiên T+2 xét lại bằng dữ liệu phiên đó |
| Q8 | **Ưu tiên mua** khi hơn 2 mã cùng đạt: **GTGD TB20 cao hơn**, bằng nhau thì mã A→Z |
| Q9 | **Tiền bán dùng mua lại được ngay** trong cùng phiên |
| Q10 | Dữ liệu giá Backtest **và Bot** lấy từ **kho VN100 của Flashback**. Chỉ mã thuộc kho mới được backtest và được Bot mua |
| Q11 | **Chiến lược của tôi:** Bot luôn dùng **bản mới nhất** từ phiên kế tiếp. **Chiến lược IQX:** Bot giữ phiên bản đã chọn; có bản mới thì người dùng tự bấm Cập nhật |
| Q12 | **Giờ chốt phiên tới** = giờ nền tảng cập nhật dữ liệu phiên vào kho |
| Q13 | **Hạ giữ tối đa** (đổi chiến lược, bản mới, cập nhật IQX, giữ như phiên gần nhất) làm vị thế đến hạn ở phiên tới: **cảnh báo, liệt kê, bắt xác nhận** ở cả giao diện và API |
| Q14 | Chiến lược IQX ban đầu: 5 chiến lược của spec Tab IQX, **rổ VN30, giữ tối đa 30**, quản trị viên sửa được |
| Q15 | Quản trị viên **ẩn** chiến lược IQX: Bot đang dùng vẫn chạy tiếp, có nhãn "IQX đã ngừng cung cấp" |
| Q16 | **Không có bật/tạm dừng Bot.** Bot chạy theo chiến lược đã chọn; chưa chọn thì không mua mới |
| Q17 | **Bỏ hẳn Luyện tập (mini)** và mọi nút Luyện tập |
| Q18 | **Bỏ** "Tạo cảnh báo từ kết quả backtest" |
| Q19 | **Thông báo** giữ nguyên Bot v1.2: 2 loại (Bản tin cuối phiên, Bot giao dịch), kênh Trên web và Email |
| Q20 | Vị thế mở **trước ngày chuyển đổi** tính hạn từ **phiên áp dụng P**, không tính từ ngày mua thật (E3 của v1.2) |
| Q21 | Ngày mã **tạm ngừng giao dịch vẫn được đếm** vào thời gian giữ |
| Q22 | Chỉ báo v3 **đã lên web**: chuyển đổi không tạm dừng Bot |

---

## 1. Phạm vi

### 1.1. Làm trong đợt này

- Chiến lược, phiên bản, Lịch phiên Bot.
- Backtest theo rổ, 2 tab IQX / Chỉ báo, Lưu, Xóa, Lần chạy đã lưu, Lịch sử bản.
- Module luật dùng chung Bot và Backtest: T+2, giữ tối đa, ưu tiên GTGD TB20, khớp đóng cửa.
- Nguồn giá kho VN100 cho Backtest và Bot.
- Bot: bỏ cấu hình tại chỗ, thêm chọn chiến lược, Lịch phiên, bảng Đang giữ/Lịch sử/Nhật ký theo v1.2.
- Thông báo: thẻ THÔNG BÁO, chuông, email.
- Quản trị Mẫu IQX: thêm rổ, giữ tối đa, ẩn.
- Chuyển đổi dữ liệu một lần.
- Rà câu chữ Học viện.

### 1.2. Không làm

- Nút bán hoặc thanh lý thủ công vị thế Bot; cắt lỗ, chốt lời, trailing.
- Quy tắc giá trần/sàn và thanh khoản.
- Thông báo cho sự kiện khác (Bot lỗi, vị thế sắp đến hạn, chiến lược IQX có bản mới, cảnh báo kỹ thuật); kênh Zalo, Telegram, push.
- Danh mục dạng bộ lọc tự cập nhật; mua theo mã trong bản tin; rổ khác VN30/VN100.
- Dữ liệu thành phần rổ theo thời điểm cho Backtest (dùng thành phần hiện tại, có cảnh báo).

### 1.3. Đoạn của Bot v1.0 bị thay

| Vị trí v1.0 | Nội dung mới |
|---|---|
| 1.1 "Thoát vị thế Bot" | Bán khi điều kiện Bán của chiến lược đạt **hoặc** hết giữ tối đa. Không cắt lỗ/chốt lời/trailing. Sớm nhất phiên T+2 |
| 1.1 "Mini thời gian giữ" và mục 11 (Luyện tập) | **Bỏ** |
| 7 (cấu hình chỉ báo trên Bot, master, công tắc Mua/Bán) | **Bỏ.** Bot chọn chiến lược (§5) |
| 7.4 `expected_revision` cấu hình chung | Thay bằng phiên bản chiến lược và lịch phiên (§6) |
| 8.1 "…không max holding tự sinh", "không tự bán vì giữ lâu" | Bỏ hai cụm này. Giữ: không stop, trailing, chốt lời; không bán vì rời rổ, vì lãi/lỗ một mức, vì mất điều kiện Mua |
| 8.2 bảng hành vi | Thay bằng §3.6 |
| 8.3 "Stop/target/trailing/max holding" | Stop/target/trailing tắt. **Max holding bật** theo chiến lược |
| 8.5 bước 5–6 | Thay bằng §3.2 |
| Nguồn mua mới (VN30 / danh mục đã áp dụng) | Rổ của chiến lược (§2.2) |
| 18.1 "Phí/lô/bước giá/thanh toán" | Thanh toán chứng khoán chốt T+2. Phí theo §3.1 |
| Ca B03, B15, P06, P13 và mọi ca mini | Theo §16.7 |

---

## 2. Dữ liệu giá và rổ mã

### 2.1. Nguồn

- Backtest **và Bot** đọc giá ngày từ **kho VN100 của Flashback**. Không dùng chuỗi VND→VCI của adapter cũ (`Q/market-data.adapter.ts`) cho Backtest nữa.
- Dùng đúng phần quy đổi đơn vị đang có ở Flashback (`flashback.market-data.ts`, `SOURCE_SCALE`). Mọi giá trong engine tính bằng **đồng**. Việc này xử lý nghi vấn R1 của spec Backtest as-is.
- Snapshot lần chạy ghi: `data_store = "flashback_vn100"`, `price_unit = "VND"`, `adjusted` (đúng theo kho), `data_as_of` (phiên cuối có trong kho).
- VN-Index dùng làm so sánh lấy từ cùng kho nếu có; không có thì dùng nguồn hiện tại, ghi cảnh báo `MARKET_CONTEXT_UNAVAILABLE`.
- **Lịch phiên giao dịch** lấy từ kho (`Asia/Ho_Chi_Minh`). Không dùng ngày lịch, không +24h, không tự bỏ cuối tuần.

### 2.2. Rổ mã

| Loại | Tập mã |
|---|---|
| **VN30**, **VN100** | Bot: thành phần **hiệu lực tại phiên Bot chạy** (rổ cơ cấu thì tự dùng thành phần mới). Backtest: thành phần **hiện tại** cho cả quá khứ, cảnh báo `UNIVERSE_CURRENT_MEMBERS` |
| **Danh mục đã lưu** (Chiến lược › Bộ lọc › Lưu danh mục) | **Chép vào bản chiến lược lúc lưu**, đã lọc VN100. Không đổi theo khi danh mục bên Bộ lọc đổi hoặc bị xóa |

- **Chỉ mã thuộc kho VN100.** (VN100 đều là mã HOSE nên quy tắc "chỉ mua mã HOSE" của v1.2 vẫn đúng.)
- Danh mục đã lưu có mã ngoài VN100: bỏ các mã đó, báo ngay dưới ô Rổ: `Bỏ {n} mã ngoài VN100 (không có trong kho dữ liệu): {mã, mã}. Backtest và Bot chỉ dùng {m} mã còn lại.`
- Sau khi lọc còn 0 mã: không cho Chạy, không cho Lưu: `Danh mục này không có mã nào thuộc VN100.` (`UNIVERSE_EMPTY`).
- Rổ rỗng ở phiên Bot chạy (ví dụ mọi mã bị hủy niêm yết): không mua mới, vẫn xử lý bán. Nhật ký ghi `Rổ mua không có mã`.
- Bộ lọc **được xóa** danh mục kể cả khi có chiến lược tạo từ nó (thay quy tắc chặn xóa của Bộ lọc v1.1 §0.1 và ca U07 của v1.2).

### 2.3. Khoảng thời gian Backtest

- `Từ ngày` sớm nhất = phiên thứ **451** của kho (450 phiên đầu dùng khởi động chỉ báo). `Đến ngày` muộn nhất = `data_as_of`.
- `Đến ngày > Từ ngày`, tối đa 3653 ngày.
- Mặc định: `Đến ngày` = `data_as_of`; `Từ ngày` lùi 2 năm.

---

## 3. Luật mô phỏng (module chung Backtest và Bot)

Đặt toàn bộ luật này trong **một module dùng chung**. Bot gọi module mỗi phiên; Backtest gọi cho từng phiên trong khoảng. Chỗ nào code Bot hiện tại khác thì **sửa Bot theo** (§17 mục 3).

### 3.1. Tham số cố định

| Tham số | Giá trị |
|---|---|
| Vốn ban đầu | **100.000.000 đ** |
| Ngân sách mỗi lệnh mua | **12% NAV** tham chiếu, gồm phí |
| Lệnh mua tối đa mỗi phiên | **2** lần mua thành công |
| Tỷ trọng tối đa khi mua | **30% NAV** mỗi mã |
| Phí | Mua **0,15%**, bán **0,25%** (đã gồm thuế). Dùng cấu hình phí của Bot (`buy_fee_rate_bps`, `sell_fee_rate_bps`, `sell_tax_rate_bps`); dev xác nhận tổng bằng 0,15% / 0,25% |
| Lô | 100 cổ phiếu |
| Khớp lệnh | **Giá đóng cửa của chính phiên có tín hiệu** |
| Thanh toán chứng khoán | **T+2** |
| Tiền bán | Cộng vào tiền khả dụng, **dùng mua ngay** trong cùng phiên |

### 3.2. Cách đếm phiên giữ

```text
entry_session   = phiên khớp Mua (giữ 0)
anchor_session  = entry_session, hoặc phiên áp dụng P với vị thế mở trước chuyển đổi (§11)
held(t)         = số phiên hợp lệ từ entry_session đến t      (hiển thị "Thực giữ")
counted(t)      = số phiên hợp lệ từ anchor_session đến t     (dùng tính hạn)
sellable_from   = entry_session + 2 phiên                      (T+2)
due(t)          = counted(t) >= N(t)                           (N = giữ tối đa của chiến lược ở phiên t)
```

- Ngày nghỉ, lễ không phải phiên, không đếm. Ngày mã tạm ngừng giao dịch **vẫn đếm** (Q21).
- Vì Bot khớp giá đóng cửa, vị thế đến hạn được bán **ở chính phiên có counted = N**.
- Ví dụ N = 30: mua phiên 10 → đến hạn và bán ở giá đóng cửa phiên 40, thời gian giữ 30. Mua thứ Năm, thứ Sáu và thứ Hai nghỉ: bán được từ thứ Tư.
- N lấy từ **chiến lược và bản của phiên đó** (dòng lịch đã khóa, §6.4). Chạy lại cùng phiên dùng đúng bản đó; không trộn bản.
- Đổi chiến lược hoặc bản **không** đặt lại `entry_session` / `anchor_session`.

### 3.3. Thứ tự xử lý mỗi phiên D

Tín hiệu tính khi có giá đóng cửa phiên D, chỉ dùng nến tới phiên D.

```text
1. BÁN, với từng vị thế đầu lượt:
   a. D < sellable_from: không bán. Nếu điều kiện Bán đạt: ghi "chờ T+2" vào Nhật ký. Không dời tín hiệu.
   b. due = counted(D) >= N.
   c. sell_signal = điều kiện Bán của chiến lược (true / false / null).
   d. sell_signal == true hoặc due → bán toàn bộ ở giá đóng cửa D.
        exit_reason  = 'indicator' nếu sell_signal == true, ngược lại 'max_holding'
        exit_reasons = mọi lý do đang đúng (cả hai khi cùng đến hạn)
   e. sell_signal == null và không due: ghi "chưa đánh giá được", giữ vị thế.
   f. Không có giá đóng cửa hợp lệ ở D (tạm ngừng): không bán, ghi "Đến hạn, chưa khớp" nếu due, thử lại mỗi phiên kế tiếp.
   Tiền bán = số CP × giá × (1 − phí bán), cộng ngay vào tiền khả dụng.
2. NAV = tiền khả dụng + Σ (số CP × giá đóng cửa D). Thiếu giá một vị thế: theo v1.0 (ca B14), không mua mới bằng NAV giả; vẫn xử lý Bán.
3. CHỌN MUA. Ứng viên = mã trong rổ có điều kiện Mua == true, không đang giữ, không vừa bán trong phiên D.
   Sắp xếp GTGD TB20 giảm dần (TB 20 phiên gần nhất, tính cả D, của giá đóng cửa × khối lượng khớp); bằng nhau thì A→Z.
4. MUA lần lượt:
   - đã đủ 2 lần mua thành công → bỏ qua: "Đã đủ 2 lệnh mua trong phiên"
   - ngân sách = min(12% × NAV, tiền khả dụng); số CP = làm tròn xuống bội 100 của ngân sách / (giá × (1 + phí mua))
   - số CP < 100 → bỏ qua: "Không đủ tiền mặt cho 1 lô" (tiền < giá × 100 × (1 + phí)) hoặc "12% NAV không đủ mua 1 lô (giá cao)"
   - giá trị mua > 30% NAV → bỏ qua: "Vượt trần 30% NAV mỗi mã"
5. Ghi điểm tài sản cuối phiên D.
```

- Lệnh bán do hết hạn **không dùng suất Mua**; số lệnh Bán không giới hạn.
- **Thiếu dữ liệu chỉ báo Bán hoặc lỗi quyền phía Bán không chặn bán theo hạn.** Bán theo hạn không phụ thuộc chỉ báo.
- Mua và Bán cùng đúng ở mã đang trống: chỉ xét Mua. Mã đang giữ: chỉ xét Bán, không mua thêm.

### 3.4. Logic điều kiện

- Theo Chỉ báo v3 và engine hiện có: AND các dòng đang bật trong một thẻ, AND các thẻ trong một phía, logic ba trị. Chỉ `true` mới kích hoạt.
- **Phía Mua** của chiến lược phải có ít nhất **một dòng đang bật** (giao diện và máy chủ; sửa R7 của spec as-is). Ngoại lệ duy nhất: chiến lược chuyển đổi "chỉ bán" ở §11.
- **Phía Bán** được phép trống: vị thế chỉ bán khi hết hạn.

### 3.5. Cuối khoảng thời gian (chỉ Backtest)

Không ép bán. Vị thế còn mở tạm tính theo giá đóng cửa phiên cuối, chưa trừ phí bán.

### 3.6. Bảng hành vi Bot (thay bảng 8.2 v1.0)

| Trạng thái | Hành vi |
|---|---|
| **Chưa chọn chiến lược** (§5.6) | Không mua mới. Vị thế đang giữ bán khi hết hạn, N = 30 |
| Chiến lược có Mua, không có Bán | Mua khi điều kiện đạt. Bán khi hết hạn |
| Chiến lược có Mua và Bán | Xét Bán (điều kiện hoặc hạn) rồi xét Mua |
| Chiến lược "chỉ bán" (chỉ từ chuyển đổi, §11) | Không mua mới. Bán khi điều kiện Bán đạt hoặc hết hạn |

### 3.7. Đổi chiến lược hoặc bản

- Không bán ngay, không tạo lệnh lúc đổi.
- Từ phiên áp dụng, mọi vị thế (kể cả mã ngoài rổ mới) bán theo điều kiện Bán và giữ tối đa của chiến lược/bản mới; `counted` tính tiếp.
- Mã đang giữ không thuộc rổ hiện tại: cột "Phạm vi hiện tại" hiện `Ngoài nguồn mua`.

---

## 4. Backtest: giao diện

Route giữ `/chien-luoc?tab=backtest`. Bỏ tham số `symbol` (xem §13 cho liên kết từ Bộ lọc).

### 4.1. Bố cục

- **Cột trái:** hai nút tab `IQX` · `Chỉ báo 16`. Mặc định **Chỉ báo**.
- **Khu chính**, từ trên xuống:
  1. Thanh trên cùng (§4.2, §4.3).
  2. Dải thông tin IQX (chỉ tab IQX).
  3. Ô thiết lập: **Rổ mã · Từ ngày · Đến ngày · Vốn ban đầu (VND)**.
  4. Dòng rổ: tên rổ, số mã, 10 mã đầu, `Xem danh sách`, cảnh báo mã ngoài VN100.
  5. Hai khung **Điều kiện Mua** (xanh) · **Điều kiện Bán** (đỏ), đầu khung `{n} chỉ báo` và nhãn `AND`.
  6. Hàng **Giữ tối đa** `[30] phiên` · `▶ Chạy` · `Lưu ▾` (chỉ tab Chỉ báo) · dòng luật (§4.5).
  7. Kết quả (§4.7).
- **Ô Vốn ban đầu:** `100.000.000`, **khóa**, chú thích khi rê chuột `Cố định bằng vốn Bot`.
- **Bỏ:** ô Cổ phiếu, ô kiểu khớp lệnh, ô Phí, nút `Về cấu hình đã lưu`, nút `Lưu cho Bot`, nút `Tạo cảnh báo`.
- Hai tab giữ **trạng thái và kết quả riêng**. `Từ ngày`, `Đến ngày` dùng chung.

### 4.2. Tab IQX: chỉ xem và chạy thử

**Cột trái:** chiến lược IQX đang hiện, theo `sort_order`. Mỗi thẻ:

| Phần | Nội dung |
|---|---|
| Tiêu đề | Huy hiệu `IQX` + tên |
| Ý tưởng | 1 câu |
| Tóm tắt | `Mua: {tên chỉ báo nối +}` / `Bán: {tên chỉ báo} · giữ tối đa {N} phiên` / `Rổ {VN30}` |
| Nhãn | `▶ Đang chạy trên Bot` / `→ Phiên tới` nếu khớp lịch Bot |

- Bấm cả thẻ để chọn; thẻ đang chọn có viền nhấn. **Không có nút Dùng.**
- Chân cột: `Chiến lược dựng sẵn bởi IQX: bấm để xem điều kiện và chạy thử, không chỉnh được. Chọn cho Bot ở trang Bot. Tham khảo để học, không phải khuyến nghị đầu tư.`

**Khu chính:**
- Thanh trên cùng: `[IQX] Chiến lược IQX · {tên}` · `v{n}` · nhãn `Chỉ xem · chạy thử` · bên phải `Bot đang chạy: {tên} · {bản}` (hoặc `Bot: chưa chọn chiến lược`) · `Lần chạy đã lưu` · `Lịch sử phiên bản`.
- Dải: `{ý tưởng} Chiến lược IQX không chỉnh được; bấm Chạy để xem hiệu quả.` + `Xem thêm` (Nguồn gốc, Khi nào dễ sai, dòng miễn trừ).
- Rổ mã, Giữ tối đa: giá trị của chiến lược, **khóa**.
- Thẻ chỉ báo **chỉ đọc**: không có `Chỉnh`, `✕`, chỉ hiện dòng đang bật.
- **Không có Lưu.** Chỉ `▶ Chạy`, dùng phiên bản hiện hành.
- `Lịch sử phiên bản`: bảng v / thời điểm xuất bản / lý do, đánh dấu hiện hành và phiên bản Bot đang dùng. Chỉ xem.
- Bot "Chi tiết" (§5.4) mở được chiến lược IQX **đã ẩn** mà Bot đang dùng: khu chính hiển thị và chạy được; cột trái không có thẻ đó.

### 4.3. Tab Chỉ báo: tạo, sửa, lưu, xóa

**Cột trái:** thư viện chỉ báo **giữ nguyên giao diện hiện tại** (ô tìm, nhóm, thẻ `✓/+ Mua`, `✓/+ Bán`). **Không có nút Luyện tập.**

**Thanh trên cùng:** `Chiến lược` + **nút tên chiến lược ▾** (chỉ hiện **tên**, hoặc `Chiến lược mới`) · bên phải `Bot đang chạy: …` · `Lần chạy đã lưu` · `Lịch sử bản`.

**Bấm nút tên chiến lược:**

```text
CHIẾN LƯỢC ĐÃ LƯU (2/20)
  RSI + SMA20   ▶ Đang chạy trên Bot  → Phiên tới        🗑 (khóa)
  Bản mới nhất 08/11 13:20 · VN30
  Bollinger VN100                                        🗑
  Bản mới nhất 03/11 21:10 · VN100
──────────
＋ Tạo chiến lược mới
Không xóa được chiến lược Bot đang chạy hoặc sẽ chạy phiên tới.
```

- Bấm một dòng: mở **bản mới nhất** vào bản nháp.
- `＋ Tạo chiến lược mới`: bản nháp trống, rổ VN30, giữ tối đa 30. Khóa khi đủ 20: `Đã đủ 20 chiến lược. Xóa bớt trước khi tạo mới.`
- Bản nháp đang khác bản đã mở (hoặc chiến lược mới có dòng bật): hỏi `Thay bản nháp đang chỉnh?` / `Rổ mã, Điều kiện Mua, Bán và Giữ tối đa của bản nháp sẽ được thay bằng {tên}. Chiến lược đã lưu và Bot không đổi.` / `Hủy` · `Thay`.
- `🗑` xóa (§4.6).

**Khu chính:**
- Rổ: `VN30`, `VN100`, hoặc danh mục đã lưu (nhóm riêng, ghi số mã).
- Thẻ chỉ báo đủ `Chỉnh`, `✕`; dòng tắt vẫn hiện (gạch ngang).
- Giữ tối đa: số nguyên 3–250. Sai: `Giữ tối đa phải từ 3 đến 250 phiên, số nguyên.`, trả giá trị cũ. Không tự kẹp.
- Khung Mua trống: `Chưa có điều kiện Mua. Bấm + Mua ở cột Chỉ báo bên trái.`; nút Chạy khóa: `Cần ít nhất một dòng Mua đang bật để chạy.`
- Khung Bán trống: `Chưa có điều kiện Bán. Bấm + Bán ở cột Chỉ báo. Không có điều kiện Bán thì vị thế được bán khi đủ Giữ tối đa.`
- Rời trang khi bản nháp khác bản đã lưu: hỏi bỏ bản nháp.

### 4.4. Lưu ▾ (chỉ tab Chỉ báo)

**Nguyên tắc: chỉ lưu cấu hình đã chạy.** Bản nháp phải **đã chạy thành công sau lần sửa cuối** (`config_hash` lần chạy = `config_hash` bản nháp). Không thỏa: mọi mục khóa, kèm `Bản nháp đã sửa sau lần chạy (hoặc chưa chạy). Bấm Chạy trước khi Lưu.` Máy chủ kiểm tra bằng `from_run_id` (§10.3).

| Mục | Hiện khi | Khóa thêm khi | Kết quả |
|---|---|---|---|
| `Lưu thành bản mới của "{tên}"` | Đang mở chiến lược của tôi | Bản nháp **giống** bản đang mở: `Chưa có thay đổi so với bản đang mở.` | Tạo bản mới (§6.2) |
| `Lưu thành chiến lược mới…` | Luôn | Đủ 20 chiến lược | Hỏi tên (§4.4.1), tạo chiến lược + bản 1 |
| `Dùng chiến lược này cho Bot` | Đang mở **bản mới nhất** của chiến lược của tôi, chưa sửa | Đã là chiến lược phiên tới: `Đã là chiến lược của Bot ở phiên tới.` | Đặt cho Bot từ phiên tới (§6.3) |
| `Lưu và dùng cho Bot…` | Bản nháp khác bản đã lưu, hoặc chiến lược mới | | Lưu (bản mới hoặc chiến lược mới) rồi đặt cho Bot từ phiên tới |

#### 4.4.1. Hộp đặt tên

- `Tên chiến lược (tối đa 40 ký tự)`, bắt buộc, cắt khoảng trắng hai đầu.
- Không trùng (không phân biệt hoa thường) với chiến lược **chưa xóa** của chính người dùng: `Tên này đã có trong chiến lược của bạn.`
- Gợi ý: chiến lược mới để trống; đang sửa chiến lược thì `{tên} (2)`.
- Câu dưới ô: `Lưu: rổ mã, Điều kiện Mua, Bán và Giữ tối đa. Lần chạy vừa rồi được gắn với bản này.` (danh mục đã lưu thêm `(chép danh sách mã hiện tại)`).

#### 4.4.2. Lưu bản mới cho chiến lược phiên tới của Bot

- Tiêu đề: `Lưu bản mới cho chiến lược đang dùng trên Bot`
- Nội dung:
  - `Chiến lược {tên} đang được Bot dùng.`
  - `Bản này sẽ được Bot dùng từ phiên {Thứ 2 09/11}. Phiên gần nhất ({Thứ 6 06/11}) vẫn ghi nhận bản cũ.`
  - `Lưu trước giờ chốt dữ liệu của phiên {Thứ 2 09/11} thì áp dụng cho phiên đó. Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của bản mới; số phiên đã giữ vẫn tính tiếp.`
  - **Khối hạ giữ tối đa** (§6.5) nếu có.
- Nút: `Hủy` · `Lưu thành chiến lược mới` · `Lưu và áp dụng phiên tới`.
- Toast: `Đã lưu bản {08/11 13:47}. Bot dùng bản này từ phiên {Thứ 2 09/11}.` (hoặc `Đã lưu bản {…}.`).

### 4.5. Dòng luật cạnh nút Chạy

`T+2 · có phí · khớp giá đóng cửa cùng phiên · vốn 100 triệu, 12% NAV mỗi lệnh, tối đa 2 lệnh mua mỗi phiên, tối đa 30% mỗi mã.` Tab Chỉ báo thêm: `Chỉnh ở đây chỉ đổi bản nháp; Bot đổi khi bạn lưu và chọn cho Bot.`

### 4.6. Xóa chiến lược

- **Khóa** khi chiến lược nằm ở **phiên gần nhất hoặc phiên tới** của Bot. Rê chuột: `Đang dùng trên Bot. Đổi chiến lược của Bot trước khi xóa.` API: `409 STRATEGY_IN_USE`.
- Hộp: `Xóa chiến lược?` / `Xóa {tên} và toàn bộ {n} bản của chiến lược này khỏi danh sách.` / `Kết quả backtest đã chạy và lịch sử giao dịch, nhật ký của Bot vẫn giữ tên chiến lược để tra cứu. Không hoàn tác được.` / `Hủy` · `Xóa chiến lược` (màu nguy hiểm).
- **Xóa mềm** (`deleted_at`): không hiện ở danh sách nào, không tính giới hạn 20, tên dùng lại được. Lần chạy, lịch phiên, nhật ký, giao dịch vẫn tham chiếu và hiện tên cũ.
- Xóa đúng chiến lược đang mở: nội dung trên màn hình thành **chiến lược mới chưa lưu**. Toast: `Đã xóa "{tên}". Nội dung đang mở được giữ ở dạng bản nháp chưa lưu.`

### 4.7. Kết quả

**Tiêu đề:** `Kết quả · {nhãn}`; dòng dưới `Rổ {tên} ({m} mã) · {từ} – {đến} · {N} phiên · giữ tối đa {N} phiên · khớp giá đóng cửa cùng phiên`. Cấu hình đổi sau lần chạy: nhãn `Cấu hình đã đổi sau lần chạy này · cần chạy lại`.

Nhãn: tab IQX `Chiến lược IQX · {tên} v{n}`; chiến lược chưa sửa `{tên} · bản {thời điểm}`; bản nháp `Bản nháp · sửa từ {tên}` hoặc `Bản nháp`.

**7 chỉ số** (điểm %, 1 chữ số thập phân):

| Ô | Công thức |
|---|---|
| Tổng lợi nhuận | `(V_cuối / 100.000.000 − 1) × 100`, gồm vị thế mở theo giá đóng cửa cuối |
| Lợi nhuận năm hóa | `((V_cuối / V_0)^(252/N) − 1) × 100`; **N < 60 phiên thì `—`** |
| Sụt giảm lớn nhất | `min_t (V_t / đỉnh_t − 1) × 100`, đỉnh khởi tạo bằng vốn |
| Giao dịch đã đóng | Số vòng mua–bán đã đóng trên toàn rổ |
| Tỷ lệ thắng | Lệnh lãi sau phí / lệnh đã đóng × 100; chưa có thì `—` |
| Mua và giữ rổ | Phiên đầu chia đều vốn cho các mã trong rổ (sau lọc), theo tỷ lệ, có phí mua, không bán: trung bình `giá_t / giá_đầu`, chia `(1 + phí mua)` |
| VN-Index | `(VNI_t / VNI_đầu − 1) × 100` |

**Biểu đồ:** 3 đường cùng trục %: Chiến lược, Mua và giữ rổ, VN-Index; rê chuột hiện ngày và 3 giá trị.

**5 tab:**

| Tab | Nội dung |
|---|---|
| `Giao dịch ({n})` | Mã · Ngày mua · Giá mua · KL · Ngày bán · Giá bán · Số phiên giữ · Lý do bán (`Điều kiện Bán` / `Hết thời gian giữ`, thêm `(cùng đến hạn)` khi cả hai) · Lãi/lỗ · %. Mới nhất trước, 20 dòng/trang. Chân: `{k} lệnh bán do hết thời gian giữ`. Bấm dòng: biểu đồ mã |
| `Theo mã` | Mã · Lệnh đã đóng · Thắng · Lãi/lỗ đã chốt · Tạm tính · Đóng góp vào vốn (%) |
| `Vị thế còn mở ({n})` | Mã · Ngày mua · Giá mua · KL · Giá cuối kỳ · Đã giữ `{h}/{N} phiên` · Tạm tính · %; chân: tiền mặt cuối kỳ |
| `Lệnh mua bị bỏ qua ({n})` | Đếm theo lý do, bảng Ngày · Mã · Lý do (60 dòng gần nhất). Chân: `Khi có hơn 2 mã đạt điều kiện Mua trong cùng phiên, ưu tiên mã có GTGD trung bình 20 phiên cao hơn.` |
| `Giả định` | Luật §3 bằng lời (phiên mua là phiên 0; T+2; tiền bán dùng ngay), nguồn dữ liệu, dòng đậm `Giả định khớp đúng giá đóng cửa; thực tế có thể khác.`, cảnh báo §4.8 |

**Biểu đồ mã:** giá đóng cửa trong khoảng; ▲ xanh mua; ▼ đỏ bán theo điều kiện; ▼ cam bán do hết thời gian giữ.

Cuối khối: `Kết quả quá khứ không bảo đảm kết quả tương lai.`

### 4.8. Cảnh báo dữ liệu

| Mã | Khi nào | Câu |
|---|---|---|
| `UNIVERSE_CURRENT_MEMBERS` | Rổ VN30/VN100 | `Rổ dùng thành phần hiện tại cho cả quá khứ (chưa có dữ liệu thành phần rổ theo thời điểm). Kết quả có thể đẹp hơn thực tế.` |
| `UNIVERSE_SNAPSHOT` | Danh mục đã lưu | `Danh mục đã lưu: danh sách mã được chép vào chiến lược khi lưu và dùng cho cả quá khứ.` |
| `SYMBOLS_EXCLUDED` | Có mã ngoài VN100 | `Bỏ {n} mã ngoài VN100: {…}` |
| `SYMBOL_SHORT_HISTORY` | Mã lên sàn muộn | `{mã}: chỉ có dữ liệu từ {ngày}` |
| `MARKET_CONTEXT_UNAVAILABLE` | Không có VN-Index | Như hiện tại |

Bỏ `PRICES_NOT_ADJUSTED` nếu kho đã điều chỉnh giá.

### 4.9. Lần chạy đã lưu

- Nút ở thanh trên cùng (cả hai tab). **Mỗi lần Chạy thành công đều được lưu**, bất biến.
- Lọc: `Chiến lược đang mở` (mặc định) · `Tất cả`.
- Cột: Thời điểm · Chiến lược · bản (hoặc Bản nháp) · Rổ · khoảng · Tổng LN · Sụt giảm · Số GD · thao tác.
- `Xem` (lần chạy của chiến lược đang mở): nạp kết quả vào khối Kết quả, không đổi bản nháp. `Mở chiến lược` (của chiến lược khác).
- **Lần chạy cũ** (trước đợt này: 1 mã, cấu hình chung, chưa T+2/giữ tối đa): nhãn `Cấu hình cũ`, nút `Xem số liệu` → hộp chỉ có Tổng lợi nhuận, Sụt giảm, Số giao dịch và `Chạy trên 1 mã theo cấu hình chung trước đây. Chỉ xem, không chạy lại.` Không tính lại.

### 4.10. Lịch sử bản (tab Chỉ báo)

- Bảng các bản, mới nhất trước: thời điểm (nhãn `mới nhất`) · ghi chú (`Từ Chiến lược IQX …`, `Khôi phục từ bản …`, `Chuyển từ thiết lập Bot cũ`) + `Rổ … · giữ tối đa …` · trên Bot (`▶ Đang chạy trên Bot`, `→ Phiên tới`) · `Mở` · `Khôi phục thành bản mới` (bản cũ; tạo bản mới, áp dụng §4.4.2 nếu là chiến lược phiên tới).
- Chiến lược mới: `Chiến lược mới chưa có bản nào. Chạy rồi bấm Lưu để tạo bản đầu tiên.`

---

## 5. Bot: giao diện

### 5.1. Bỏ

- Thẻ **DANH MỤC MUA MỚI**, hộp **Đổi danh mục**, hộp **Xem danh sách**.
- Thẻ **GIỚI HẠN NẮM GIỮ** và modal **Giới hạn nắm giữ của Bot**.
- Danh sách **16 chỉ báo**, công tắc, nút **Luyện tập**, nút **Cấu hình**, modal cấu hình chỉ báo.
- Hai khung **Điều kiện mua / Điều kiện bán** dưới linh thú, dòng "Cấu hình chờ hiệu lực".
- Nhãn trạng thái `Đã bật Mua và Bán` của thẻ linh thú. **Không có công tắc bật/tạm dừng Bot.**

### 5.2. Giữ

- 4 ô đầu trang: Vốn bot ban đầu, Tiền mặt, Giá trị danh mục, Tổng lợi nhuận.
- Thẻ linh thú (hình, tên, câu mô tả). Câu mô tả: `Học kiến thức. Chọn chiến lược cho Bot.`
- Chip dưới linh thú chỉ còn: `Chiến lược: {tên}` (hoặc `Chiến lược: chưa chọn`) · `{n} mã đang giữ`.

### 5.3. Lịch phiên (dưới thẻ linh thú)

Hai dòng, **không** thêm rổ, giữ tối đa hay câu giải thích:

| Dòng | Nội dung |
|---|---|
| Phiên gần nhất · `{Thứ 6 06/11}` | `{[IQX]} {tên} · {bản}` hoặc `Chưa chọn chiến lược` |
| Phiên tới · `{Thứ 2 09/11}` | Giống: `{tên} · {bản}` + `không đổi`. Khác: `{tên} · {bản}` + `● có thay đổi` + `Xem khác biệt` · `Giữ như phiên gần nhất`. Chưa chọn: `Chưa chọn chiến lược · chọn ở danh sách bên phải` |

- `{bản}`: chiến lược của tôi `bản dd/mm HH:mm`; chiến lược IQX `v{n}`.
- **Xem khác biệt:** liệt kê khác nhau: Rổ mã, Giữ tối đa, từng dòng Mua/Bán bị bỏ (gạch, đỏ) hoặc thêm (xanh); giống nhau thì `Hai bản giống nhau về điều kiện.`
- **Giữ như phiên gần nhất:** hộp xác nhận (kèm khối hạ giữ tối đa nếu có), rồi phiên tới = đúng chiến lược và bản của phiên gần nhất (ghim). Toast `Phiên tới giữ như phiên gần nhất.`
- **Chiến lược IQX có phiên bản mới hơn** bản phiên tới: khung `Chiến lược IQX · {tên} có bản v{m}.` + `Xem khác biệt` · `Cập nhật từ phiên {…}` (hộp xác nhận, kèm khối hạ giữ tối đa nếu có).

### 5.4. Cột phải: hai khung tên chiến lược

**CHIẾN LƯỢC IQX** và **CHIẾN LƯỢC CỦA TÔI**. Mỗi dòng:

| Phần | Nội dung |
|---|---|
| Tên | Huy hiệu `IQX` (khung IQX) + tên |
| `Chi tiết` | Mở Backtest: IQX → tab IQX, chọn đúng chiến lược; của tôi → tab Chỉ báo, bản mới nhất (hỏi nếu bản nháp đang khác) |
| `Dùng` | Ẩn khi đã là chiến lược phiên tới. Bấm: hộp §6.3 |
| Nhãn | `▶ Đang chạy` (phiên gần nhất), `→ Từ phiên {…}` (phiên tới, khi khác) |

- Dòng đang chạy có nền nhấn.
- Khung IQX: chiến lược `shown`, **cộng** chiến lược đã ẩn nếu Bot đang/sắp chạy nó (nhãn `IQX đã ngừng cung cấp`, **không có Dùng**). Chân: `Tham khảo để học, không phải khuyến nghị đầu tư.`
- Khung Của tôi: chiến lược chưa xóa. Chân: `＋ Tạo chiến lược trong Backtest` → Backtest, tab Chỉ báo, chiến lược mới.
- Dưới hai khung: thẻ **THÔNG BÁO** (§8.2).

### 5.5. Danh mục Bot: 3 tab

Thẻ `Danh mục Bot`, tab `Đang giữ` · `Lịch sử` · `Nhật ký`, nút ⓘ mở **Nguyên tắc Bot** (§5.7).

**Đang giữ** (theo v1.2):

| Cột | Nội dung |
|---|---|
| Mã | Bấm mở **Chi tiết vị thế** |
| Số CP · Giá vốn · Giá tham chiếu · Lãi / Lỗ (đ, %) | Như hiện tại |
| **Đã giữ** | `{counted} / {N} phiên`; dòng nhỏ `Thực giữ {held} phiên` khi anchor khác entry |
| **Trạng thái bán** | `Chờ T+2` + `Bán được từ dd/mm` · `Có thể bán` + `Đến hạn dd/mm` · `Đến hạn` + `Bán ở phiên xử lý kế tiếp` · `Đến hạn, chưa khớp` + lý do (tạm ngừng giao dịch) |
| Nguồn mua lúc mở | Rổ của chiến lược khi mua |
| Phạm vi hiện tại | `Trong nguồn mua` / `Ngoài nguồn mua` (so với rổ chiến lược phiên gần nhất) |

N là giữ tối đa của chiến lược phiên gần nhất (chưa chọn chiến lược: 30). Ngày "đến hạn", "bán được từ" tính bằng **lịch phiên thật** phía máy chủ.

**Chi tiết vị thế:** Phiên mua · Bán được từ (T+2) · Đã giữ · Mốc tính hạn (nếu khác ngày mua) · Giới hạn (`{N} phiên · {tên chiến lược}`) · Đến hạn · Nguồn mua lúc mở.

**Lịch sử** (các giao dịch đã bán): Mã · Số CP · Ngày mua · Ngày bán · Giá mua · Giá bán · **Thời gian giữ** · Lãi / Lỗ (sau phí) · **Lý do bán** (`Điều kiện Bán` / `Hết thời gian giữ`, `(cùng đến hạn)`) · Chiến lược · bản · `Chi tiết`.
**Chi tiết giao dịch Bán:** Phiên mua · Phiên bán · Thời gian giữ · Lý do bán · Giới hạn khi bán · Chiến lược · bản.

**Nhật ký** (mỗi phiên một dòng): Phiên · Chiến lược · bản · Rổ (tên · số mã) · Kết quả (ví dụ `Mua TCB · 1 đến hạn chưa khớp (KDH tạm ngừng giao dịch)`, `Bán VPB (Điều kiện Bán)`, `Không có lệnh`, `Chưa chọn chiến lược · không mua mới`, `Rổ mua không có mã`). Kết quả đếm riêng: số bán do hết hạn, số vị thế chờ T+2, số đến hạn chưa khớp, cùng các lý do v1.0 (thiếu dữ liệu, vốn/lô…).

### 5.6. Chưa chọn chiến lược

Áp dụng cho tài khoản Bot mới và tài khoản chuyển đổi không có điều kiện nào (§11).
- Lịch phiên hiện `Chưa chọn chiến lược`; chip `Chiến lược: chưa chọn`.
- Bot không mua mới; vị thế đang giữ (nếu có) bán khi hết hạn N = 30.
- Bấm `Dùng` ở một chiến lược: áp dụng từ phiên tới như §6.3.

### 5.7. Modal Nguyên tắc Bot

Chỉ nhãn và giá trị:

| Nhãn | Giá trị |
|---|---|
| Vốn khởi tạo | 100.000.000 đồng · tài khoản riêng |
| Chiến lược | Chọn ở Bot · tạo và sửa ở Backtest · Chiến lược IQX hoặc chiến lược của bạn |
| Nguồn mua mới | Rổ của chiến lược: VN30, VN100 hoặc danh mục đã lưu · chỉ mã VN100 · ưu tiên GTGD TB20 cao |
| Mua | AND các điều kiện Mua của chiến lược |
| Bán | Khi điều kiện Bán đạt hoặc hết thời gian giữ · mọi mã đang giữ |
| Giữ tối đa | Theo chiến lược · 3 đến 250 phiên · phiên mua là phiên 0 |
| Ngân sách mỗi lần mua | 12% giá trị danh mục tham chiếu, gồm phí |
| Mua mới mỗi phiên | Tối đa 2 lần mua thành công |
| Tỷ trọng khi mua | Tối đa 30% mỗi mã |
| Mã đang nắm giữ | Không mua thêm |
| Khớp lệnh | Giá đóng cửa cùng phiên |
| Thanh toán | T+2 · cổ phiếu mua phiên T bán được từ phiên T+2 |
| Đổi chiến lược | Có hiệu lực từ phiên tới · không tạo lệnh ngay |
| Cắt lỗ / chốt lời tự động | Không sử dụng |
| Thông báo | Khi bản tin lên web và khi phiên Bot có lệnh khớp |

**Nguyên tắc trình bày:** giao diện gọn. Không thêm câu giải thích vào thẻ, bảng, ô nhập. Quy tắc chỉ nằm ở modal này và Học viện. Chỉ hiển thị nhãn, số liệu, trạng thái và cảnh báo bắt buộc.

---

## 6. Phiên bản và Lịch phiên

### 6.1. Quy tắc

| Trường hợp | Phiên tới dùng |
|---|---|
| Chiến lược **của tôi** | **Bản mới nhất** tại giờ chốt dữ liệu của phiên đó (`follow_latest = true`) |
| Sau **Giữ như phiên gần nhất** | Bản được ghim (`follow_latest = false`). Lưu bản mới và chọn `Lưu và áp dụng phiên tới` thì trở lại `follow_latest = true` |
| Chiến lược **IQX** | **Phiên bản đã chọn** (ghim). Có bản mới: thông báo ở Lịch phiên, người dùng tự Cập nhật |
| Đổi chiến lược (`Dùng`) | Chiến lược mới, theo các dòng trên |

### 6.2. Lưu bản mới

- Dòng mới trong `user_strategy_versions`, `version = latest + 1`. Bản cũ không đổi.
- Gửi `expected_latest_version`; lệch: `409 STRATEGY_VERSION_CONFLICT`, giao diện `Chiến lược vừa được lưu ở nơi khác. Tải lại để xem bản mới nhất.`

### 6.3. Đổi chiến lược của Bot

- Hộp: `Đổi chiến lược của Bot?` / `Từ phiên {Thứ 2 09/11}, Bot dùng {tên}.` / `Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của chiến lược mới.` / khối hạ giữ tối đa (§6.5) nếu có / `Hủy` · `Dùng cho Bot`.
- Toast: `Bot dùng {tên} từ phiên {…}.` Không đổi phiên gần nhất, không tạo lệnh.

### 6.4. Giờ chốt và khóa lịch

- **Giờ chốt dữ liệu** = giờ nền tảng cập nhật dữ liệu phiên vào kho (§17). Giờ Việt Nam.
- **Phiên tới:** phiên giao dịch kế tiếp Bot chưa chạy. Hôm nay là ngày giao dịch và chưa tới giờ chốt thì phiên tới là **hôm nay**.
- Tại giờ chốt của ngày D, job Bot:
  1. lấy dòng lịch phiên D, giải `follow_latest` thành bản cụ thể;
  2. **khóa** dòng (`locked_at`), chạy luật §3 bằng đúng bản đó;
  3. tạo dòng phiên tới cho ngày giao dịch kế tiếp, chép từ dòng vừa khóa (giữ `follow_latest` và bản ghim).
- Mọi thao tác (Lưu áp dụng, Dùng, Giữ như phiên gần nhất, Cập nhật IQX) chỉ ghi vào dòng **phiên tới** chưa khóa.
- Thao tác trùng lúc job khóa: gửi `expected_next_session`; lệch: `409 SCHEDULE_SESSION_LOCKED`, giao diện tải lại lịch, báo `Phiên {…} vừa chốt. Thay đổi áp dụng từ phiên {…}.`, rồi tính lại khối hạ giữ tối đa cho phiên mới.
- Chạy lại job cùng phiên: dùng dòng đã khóa; không bán lại, không ghi trùng, không gửi lại thông báo.

### 6.5. Hạ giữ tối đa (thay v1.2 §2.7)

Khi thao tác làm **giữ tối đa của phiên tới nhỏ hơn** giữ tối đa phiên tới hiện tại (đổi chiến lược, lưu bản mới áp dụng, cập nhật IQX, giữ như phiên gần nhất):

- **Máy chủ** tính danh sách vị thế có `counted(phiên tới) >= N mới` và `< N cũ`, đã qua T+2, có giá. Trả về: mã, số phiên tính hạn, phiên sẽ bán.
- Hộp xác nhận thêm khối: `{k} vị thế sẽ được bán ở phiên {Thứ 2 09/11} vì đã giữ từ {N} phiên trở lên: {HDB (12 phiên), …}.` + ô `Tôi hiểu các vị thế trên sẽ được bán.` Nút xác nhận **chỉ bật khi đã tích**.
- API nhận `confirm_due_positions = [mã…]`; thiếu hoặc khác danh sách máy chủ tính lại lúc ghi thì `409 DUE_POSITIONS_CHANGED`, giao diện hiện lại danh sách.
- Tăng giữ tối đa: không cần xác nhận thêm.
- Không áp ngược: không làm lại giao dịch đã chốt.

---

## 7. Chiến lược IQX và Quản trị

### 7.1. Dữ liệu khởi tạo

- 5 chiến lược của spec Tab IQX §3.4 (Theo xu hướng, Phá đỉnh, Động lượng MACD, Hồi phục quá bán, Theo dòng tiền), giữ điều kiện, ý tưởng, nguồn gốc, khi nào dễ sai.
- Cả 5: `universe = VN30`, `max_holding = 30`. Tạo **v2** với `reason = "Thêm rổ mã; giữ tối đa 30 phiên"`, hoặc sửa v1 nếu chưa xuất bản ra production (dev chọn, báo lại).
- Rổ chiến lược IQX chỉ là `VN30` hoặc `VN100`.

### 7.2. Quản trị · Mẫu IQX (bổ sung spec Tab IQX §5)

- Bảng tab **Chiến lược IQX** thêm cột **Rổ mã**, **Giữ tối đa**. Cột "Người dùng bấm Dùng · 30 ngày" đổi thành **Bot đang dùng** (số Bot có chiến lược này ở phiên tới) và **Lần chạy thử · 30 ngày**. Sự kiện `iqx_template_used` thay bằng `iqx_strategy_run`, `iqx_strategy_assigned`.
- Chế độ soạn dùng **đúng form tab Chỉ báo** của Backtest, gồm ô Rổ (VN30/VN100) và Giữ tối đa. Ẩn Lưu ▾, danh sách chiến lược đã lưu, Lần chạy đã lưu. Giữ Chạy để thử (không lưu).
- Kiểm tra khi xuất bản: `universe ∈ {VN30, VN100}`; `max_holding` 3–250; ít nhất một dòng Mua và một dòng Bán đang bật.
- Hộp xuất bản luôn thêm: `Bot của người dùng đang dùng phiên bản cũ không đổi theo; người dùng thấy thông báo có bản mới ở Lịch phiên.`
- **Ẩn:** biến mất khỏi tab IQX của Backtest và danh sách chọn của Bot; Bot đang/sắp chạy vẫn chạy phiên bản đã ghim, nhãn `IQX đã ngừng cung cấp`; không chọn mới được (`409 IQX_TEMPLATE_HIDDEN`). Nội dung hộp: `Mục này biến mất khỏi tab IQX của Backtest và danh sách chọn của Bot. Bot đang chạy chiến lược này vẫn chạy tiếp phiên bản đã chọn, có nhãn "IQX đã ngừng cung cấp"; người dùng không chọn mới được.`

---

## 8. Thông báo (giữ Bot v1.2 §8)

### 8.1. Hai loại

| Loại | Gửi khi | Nội dung trên web | Mở tới |
|---|---|---|---|
| **Bản tin cuối phiên** | Bản tin của phiên được **Public lần đầu** (Bản tin v4 §3.6). Public lại hoặc gỡ: **không** gửi thêm | `Bản tin cuối phiên dd/mm` · `VN-Index {điểm} ({±%}) · {n} mã trong 3 bộ lọc` | Phân tích thị trường › tab Bản tin của ngày đó (bản đã gỡ thì mở bản gần nhất) |
| **Bot giao dịch** | Lượt Bot của phiên **đã commit** và có **ít nhất 1 lệnh khớp** | `Bot giao dịch · phiên dd/mm` · `Mua HPG, FPT · Bán VNM (hết thời gian giữ)` | Bot › tab Lịch sử |

**Không gửi:** phiên Bot không có lệnh; lệnh bị chặn (T+2, đến hạn chưa khớp, thiếu tiền); đổi chiến lược, lưu bản, chiến lược IQX có bản mới; Bot lỗi; chuyển đổi dữ liệu.

**Chống trùng:** tối đa **1 tin mỗi loại mỗi phiên** cho mỗi tài khoản; khóa duy nhất (`user`, `loại`, `phiên`). Chạy lại job không gửi lại. Lượt lỗi giữa chừng chỉ gửi sau khi commit.

### 8.2. Thẻ THÔNG BÁO ở panel Bot

- Vị trí: dưới hai khung chiến lược.
- Chỉ nhãn và công tắc:

  ```text
  THÔNG BÁO                      [công tắc tổng]
  Bản tin cuối phiên             [công tắc]
  Bot giao dịch                  [công tắc]
  Gửi qua  [Trên web] [Email]
  ```

- Công tắc tổng tắt: mọi dòng mờ, khóa, không gửi gì kể cả trong chuông. Bật lại khi cả hai loại đang tắt thì bật cả hai. Tắt cả hai loại: công tắc tổng tự tắt.
- `Trên web` luôn bật, không bấm được. `Email` bật/tắt, gửi tới email tài khoản; chưa có email xác thực thì khóa, ghi `Chưa có email`.
- Mặc định: tổng bật, 2 loại bật, Email tắt.
- Cài đặt **không** thuộc chiến lược. Đổi có hiệu lực ngay.

### 8.3. Chuông

- Biểu tượng chuông trên thanh trên, cạnh nút Tìm mã; số tin chưa đọc (ẩn khi 0). Có ở mọi trang có thanh trên.
- Bấm: danh sách tối đa 50 tin mới nhất (biểu tượng loại, tiêu đề, một dòng nội dung, chấm xanh khi chưa đọc).
- Bấm một tin: đánh dấu đã đọc, mở đúng chỗ (§8.1).
- `Đánh dấu đã đọc`; `Cài đặt thông báo` (mở trang Bot, cuộn tới thẻ THÔNG BÁO; điện thoại thì mở panel).
- Trạng thái đã đọc lưu theo tài khoản, đồng bộ giữa thiết bị.

### 8.4. Email

- Gửi kèm khi bật Email, cùng thời điểm tin trên web.
- **Bản tin cuối phiên:** tiêu đề `Bản tin cuối phiên dd/mm: VN-Index {điểm} ({±%})`; thân: VN-Index đóng cửa và thay đổi, khối lượng, số mã trong 3 bộ lọc, nút **Đọc bản tin**.
- **Bot giao dịch:** tiêu đề `Bot giao dịch phiên dd/mm: mua {a}, bán {b}`; thân: bảng **Lệnh · Mã · Giá khớp · Khối lượng · Lý do** (Điều kiện Mua / Điều kiện Bán / Hết thời gian giữ), chiến lược đang chạy, tài sản Bot, nút **Xem Bot**.
- Chân: `Bạn nhận email này vì đã bật thông báo {loại}.` · link **Tắt thông báo này** (token ký số, dùng một lần, tắt đúng loại, không cần đăng nhập; trang kết quả `Đã tắt thông báo {loại}.`) · `Không phải khuyến nghị đầu tư.` (Bot thêm `Giao dịch mô phỏng.`).
- Bản tin gửi từ địa chỉ bản tin, Bot từ địa chỉ Bot. Dev chọn dịch vụ gửi và xác nhận tên miền.
- Gửi lỗi: thử lại tối đa 3 lần, ghi log; không ảnh hưởng tin trên web.

### 8.5. Dữ liệu và API

| Đối tượng | Trường |
|---|---|
| Cài đặt thông báo | `enabled`, `types.bulletin`, `types.bot_trades`, `channels.email`, `updated_at` |
| Tin thông báo | `id`, `user_id`, `type` (`bulletin`, `bot_trades`), `trade_date`, `title`, `body`, `link`, `read_at`, `created_at`; **duy nhất** (`user_id`, `type`, `trade_date`) |
| Email đã gửi | `notification_id`, `status`, `attempts`, `sent_at` |

API: `GET/PUT me/notification-settings` · `GET me/notifications?limit=50` · `POST me/notifications/read` (một tin hoặc tất cả) · `GET notifications/unsubscribe?token=`.

---

## 9. Bỏ

| Nơi | Bỏ |
|---|---|
| Bot | Thẻ Danh mục mua mới, Giới hạn nắm giữ; danh sách 16 chỉ báo, công tắc, Luyện tập, Cấu hình; khung Điều kiện Mua/Bán dưới linh thú; nhãn "Đã bật Mua và Bán"; "Chờ hiệu lực" và nút Hủy thay đổi |
| Luyện tập (mini) | **Toàn bộ tính năng** (v1.0 mục 11, v1.2 §5), route, dữ liệu lượt mini chỉ giữ ở dạng lưu trữ |
| Backtest | Ô Cổ phiếu, Vốn nhập tay, kiểu khớp, Phí; `Lưu cho Bot`; `Về cấu hình đã lưu`; `Tạo cảnh báo`; nút `Dùng` của chiến lược IQX |
| Cấu hình | `shared_config` làm nguồn cấu hình Bot/Backtest; `effective_config_sessions` (thay bằng `bot_strategy_schedule`); `exit.max_holding_sessions` ở cấu hình chung (v1.2) |
| API | `PATCH shared-config` từ giao diện; API đổi danh mục mua mới, đổi giới hạn nắm giữ, bật/tắt chỉ báo của Bot; `shared_revision`, `symbol`, `assumptions`, `research` trong `POST /backtests`; API mini |
| Thanh dưới bản mẫu v1.2 | "Backtest · Lưu cho Bot" rút gọn |

Bảng và endpoint cũ để **chỉ đọc** tới khi chuyển đổi xong (§11), rồi gỡ.

---

## 10. Dữ liệu và API

Tên bảng là tên logic; dev map vào schema thật, không tạo bảng song song chỉ vì khác tên.

### 10.1. Bảng mới

**`user_strategies`**: `id` uuid · `user_id` · `name` varchar(40) (duy nhất theo `(user_id, lower(name))` khi `deleted_at IS NULL`) · `latest_version` · `origin` jsonb nullable (`{type:"iqx_strategy", id, version}`) · `created_at`, `updated_at` · `deleted_at`. Giới hạn 20 chưa xóa, kiểm trong giao dịch (`409 STRATEGY_LIMIT`).

**`user_strategy_versions`** (bất biến, trigger chặn UPDATE/DELETE): `strategy_id`, `version` (PK ghép) · `content` jsonb (§10.2) · `config_hash` · `from_run_id` (bắt buộc với bản người dùng lưu; null với bản chuyển đổi) · `note` · `created_at` (nhãn bản).

**`bot_strategy_schedule`**: `bot_id`, `session_date` (PK ghép) · `strategy_source` (`iqx` | `user` | null = chưa chọn) · `strategy_id` · `version` (null khi `follow_latest` và chưa khóa) · `follow_latest` · `locked_at` · `updated_at`, `updated_by`. Mỗi bot tối đa **một** dòng chưa khóa.

### 10.2. `content` chiến lược

```json
{
  "universe": { "type": "vn30" | "vn100" | "saved_list",
                "list_id": "…", "list_name": "…", "symbols": ["ACB", "…"] },
  "buy":  [ /* thẻ chỉ báo theo định dạng lưu điều kiện của Chỉ báo v3 §1.4 */ ],
  "sell": [ /* như trên, được phép rỗng */ ],
  "max_holding": 30
}
```

- `saved_list.symbols`: đã lọc VN100, chép lúc lưu.
- Dùng chung cho `iqx_template_versions.content.definition` (chiến lược IQX chỉ `vn30` | `vn100`).

### 10.3. API người dùng (`/api/v2/strategy`, giữ guard: cờ tính năng, xác thực, Premium)

| Method | Path | Request | Hành vi |
|---|---|---|---|
| GET | `/strategies` | | Chiến lược chưa xóa: `id, name, latest_version, latest_saved_at, universe_label, on_bot {last, next}` |
| POST | `/strategies` | `name, content, from_run_id` | Tạo chiến lược + bản 1 |
| PATCH | `/strategies/:id` | `name` | Đổi tên (để sẵn) |
| DELETE | `/strategies/:id` | | Xóa mềm; `409 STRATEGY_IN_USE` |
| GET | `/strategies/:id/versions` | | Danh sách bản |
| GET | `/strategies/:id/versions/:v` | | Nội dung bản |
| POST | `/strategies/:id/versions` | `content, from_run_id, expected_latest_version, apply_next?, confirm_due_positions?` | Tạo bản mới; `apply_next` đặt lại `follow_latest = true` cho phiên tới |
| GET | `/iqx?kind=strategy` | | Như spec Tab IQX §4.2, thêm `universe`, `max_holding` |
| POST | `/backtests` | xem dưới | Chạy và lưu |
| GET | `/backtests?strategy_source=&strategy_id=&limit=` | | Lần chạy, lọc theo chiến lược; cũ có `legacy: true` |
| GET | `/backtests/:id` · `/backtests/:id/trades` | | Như hiện tại, thêm `per_symbol`, `open_positions`, `skipped_orders`, `basket_buy_hold` |

**`from_run_id`:** của chính user, `succeeded`, `config_hash` khớp `content`. Sai: `422 RUN_REQUIRED`.

**`POST /backtests`:**

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

- Vốn, phí, khớp lệnh, T+2 lấy từ module luật.
- Snapshot: `strategy_ref`, `content`, `config_hash`, `universe_resolved`, `excluded_symbols`, `data_store`, `data_as_of`, `price_unit`, `adjusted`, `rules_version`, cảnh báo §4.8.
- Giữ idempotency, bất biến, thứ tự lỗi của spec as-is §3.3–3.5.
- Giao dịch Backtest lưu `exit_reason`, `exit_reasons[]`, `holding_sessions`, `max_holding_at_exit`.

### 10.4. API Bot

| Method | Path | Request | Hành vi |
|---|---|---|---|
| GET | `/bots/:id/schedule` | | `{ last, next: {…, follow_latest, cutoff_at}, iqx_update: {latest_version} \| null }`; mỗi phần có `source, id, name, version, version_label, hidden` hoặc `null` (chưa chọn) |
| GET | `/bots/:id/schedule/next/impact` | `source, id, version?` | Danh sách vị thế sẽ đến hạn nếu đổi (§6.5) |
| PUT | `/bots/:id/schedule/next` | `source, id, version?, expected_next_session, confirm_due_positions?` | Đặt chiến lược phiên tới. `user`: `follow_latest = true`; `iqx`: ghim `version` (mặc định hiện hành) |
| POST | `/bots/:id/schedule/next/keep-last` | `expected_next_session, confirm_due_positions?` | Chép phiên gần nhất, ghim bản |
| GET | `/bots/:id/positions` | | Thêm `entry_session`, `anchor_session`, `anchor_reason`, `sellable_from_session`, `counted`, `held`, `due_session`, `sell_state` |
| GET | `/bots/:id/closed-trades` | `offset, limit` | Tab Lịch sử |
| GET | `/bots/:id/log` | `offset, limit` | Tab Nhật ký, có `strategy_ref`, `time_exits`, `t2_blocked`, `due_unfilled`, `universe_empty` |

**Sổ sách** (giữ v1.2 §2.6): vị thế lưu `entry_session`, `anchor_session`, `anchor_reason` (`entry` | `policy_cutover`), `sellable_from_session`; giao dịch Bán lưu `exit_reason`, `exit_reasons[]`, `holding_sessions`, `counted_sessions`, `max_holding_at_exit`, `strategy_source`, `strategy_id`, `strategy_version`. Máy chủ **không nhận** `sellable_from`, `due`, `anchor` do client gửi.

### 10.5. Mã lỗi mới

| HTTP | `code` | Khi nào |
|---|---|---|
| 409 | `STRATEGY_NAME_TAKEN` · `STRATEGY_LIMIT` · `STRATEGY_IN_USE` · `STRATEGY_VERSION_CONFLICT` | §4.4, §4.6, §6.2 |
| 404 | `STRATEGY_NOT_FOUND` | Không có, đã xóa, của user khác |
| 422 | `RUN_REQUIRED` · `STRATEGY_INVALID` · `UNIVERSE_EMPTY` · `DATE_RANGE_INVALID` | §4.4, §3.4, §2.2, §2.3 |
| 409 | `IQX_TEMPLATE_HIDDEN` · `SCHEDULE_SESSION_LOCKED` · `DUE_POSITIONS_CHANGED` | §7.2, §6.4, §6.5 |
| 422 | `DUE_CONFIRM_REQUIRED` | Có vị thế đến hạn mà thiếu `confirm_due_positions` |

### 10.6. Giới hạn thực thi

- Rổ tối đa **100 mã**.
- Dev đo VN100 × 10 năm; vượt ngân sách 30 giây của executor thì cache chỉ báo theo `(mã, chỉ báo, tham số, data_as_of)` hoặc nâng ngân sách; báo số đo.

---

## 11. Chuyển đổi dữ liệu (một lần)

### 11.1. Mốc

- P = phiên hợp lệ đầu tiên có ngày lớn hơn ngày deploy. Từ P mọi Bot chạy theo spec này. Lượt đã khóa trước P không đổi giữa chừng.
- Chỉ báo v3 **đã lên web**: **không** tạm dừng Bot.

### 11.2. Nhóm dữ liệu

| Hiện trạng | Chuyển đích |
|---|---|
| Bot có cấu hình hiệu lực với **ít nhất 1 dòng Mua** bật | Tạo chiến lược **`Chiến lược của tôi (từ thiết lập cũ)`** bản 1, `note = "Chuyển từ thiết lập Bot cũ"`: `buy`, `sell` từ revision **đang hiệu lực** với Bot; `universe` từ danh mục mua mới hiện tại (VN30/VN100/danh mục đã áp dụng → lọc VN100); `max_holding = 30`. Lịch: phiên gần nhất (khóa) và phiên tới `follow_latest = true` |
| Có revision **mới hơn** đã lưu nhưng chưa hiệu lực | Thêm bản 2 từ revision đó, `note = "Chuyển từ cấu hình chung chưa áp dụng"`. Phiên tới dùng bản 2, giống hành vi cũ |
| Bot **không có dòng Mua** nhưng có dòng Bán | Tạo chiến lược trên dạng **"chỉ bán"** (`buy` rỗng, cờ `sell_only = true`): Bot không mua mới, bán theo điều kiện Bán hoặc hết hạn (§3.6). Mở trong Backtest phải thêm Mua mới chạy/lưu được |
| Bot **không có dòng nào** bật | **Chưa chọn chiến lược** (§5.6) |
| Vị thế Bot mở trước P | `anchor_session = P`, `anchor_reason = policy_cutover` (Q20). Hạn đầu tiên sớm nhất là P + 30. Giao diện hiện `Thực giữ` |
| Vị thế mua ở P−1, P−2 | T+2 theo `entry_session` thật |
| Giao dịch Bot đã chốt | Giữ nguyên; `exit_reason` trống hoặc `legacy`; không backfill |
| Lần chạy Backtest cũ | Giữ nguyên, `legacy = true`, hiển thị §4.9 |
| Lượt mini | Lưu trữ chỉ đọc ở DB, không hiển thị |
| Cài đặt thông báo | Tạo mặc định: tổng bật, Bản tin bật, Bot giao dịch bật, Email tắt |
| Cảnh báo đã ghim `backtest_run` / `shared_revision` | Theo trả lời §17 mục 8 |

### 11.3. An toàn

- Trước khi chạy: dry-run, đếm tài khoản, vị thế, revision, số tài khoản rơi vào từng nhóm §11.2, số tài khoản có mã ngoài VN100 bị lọc khỏi rổ.
- Sau khi chạy: đối soát; kiểm tra **không có lệnh nào sinh ra** lúc chuyển đổi và **không có thông báo nào** được gửi.
- Rollback không xóa revision, chiến lược hay giao dịch đã khớp.

---

## 12. Sửa spec Tab IQX v1.1

| Mục | Sửa thành |
|---|---|
| §3.1 | Giữ 2 tab `IQX · Chỉ báo 16`; mặc định Chỉ báo |
| §3.2 | Bỏ nút `Dùng`; bấm cả thẻ để chọn; tóm tắt thêm `Rổ {…}` |
| §3.3 | Thay bằng §4.2: chỉ xem và chạy thử, không điền bản nháp, không lưu |
| §3.4 | Giữ điều kiện; giữ tối đa cả 5 = **30**; thêm rổ VN30 |
| §3.5 | "Mua và giữ {mã}" → **Mua và giữ rổ** và **VN-Index** |
| §4.1 | `content` chiến lược theo §10.2 |
| §4.3 | Snapshot: `strategy_ref`; bản chiến lược của tôi: `origin` |
| §5.2, §5.3 | Theo §7.2 |
| §2.3 mục 6, dòng "Đi cặp với" | Theo §13 |

---

## 13. Liên kết từ Bộ lọc

- Bỏ "bấm một mã trong kết quả → Backtest mã đó".
- Thêm nút **`Backtest với rổ là kết quả này`** ở đầu bảng kết quả: mở Backtest, tab Chỉ báo, chiến lược mới (hỏi nếu bản nháp đang khác); rổ = các mã thuộc VN100 trong kết quả (kiểu `saved_list`, `list_name = "Kết quả bộ lọc {tên hoặc 'chưa lưu'} · {dd/mm}"`), cảnh báo mã bị bỏ; không tự chạy.
- Bỏ dòng `Đi cặp với` và `pair_slug` khỏi giao diện (giữ cột DB).
- Bỏ chặn xóa danh mục Bot đang dùng (§2.2).

---

## 14. Học viện: rà câu chữ (thay v1.2 §10)

- Rà toàn bộ nội dung đang phát hành. Sửa mọi câu còn nói:
  - Bot/Luyện tập giữ tối đa 60 phiên, hoặc Bot không có thời gian giữ;
  - bán được ở T+1;
  - cấu hình chỉ báo trên Bot, công tắc chỉ báo, danh mục mua mới trên Bot;
  - Lưu trong Backtest ghi thẳng vào Bot, "Lưu cho Bot";
  - Luyện tập (mini), Backtest một mã, khớp mở cửa phiên sau.
- Sửa theo nội dung mới: chiến lược soạn và lưu ở Backtest, Bot chọn chiến lược; giữ tối đa thuộc chiến lược (mặc định 30, 3–250); mua phiên T bán sớm nhất T+2; Backtest chạy trên cả rổ, khớp giá đóng cửa.
- Sửa lời giảng: câu hỏi không đổi thì giữ `question_version`, chỉ tăng `content_version`. Không cấp lại xu, không bắt thi lại.
- Dev bàn giao danh sách câu đã sửa; không có thì ghi rõ.

---

## 15. HTML mẫu v2.0

- File `IQX-Bot-Chien-Luoc-MAU-v2.0.html`, một file, 3 trang: **Backtest**, **Bot**, **Quản trị · Mẫu IQX**. Chuông ở thanh trên.
- Thư viện chỉ báo trong mẫu là bản rút gọn để chạy được; **làm thật theo Chỉ báo v3** và giao diện thư viện hiện có.
- Bot trong mẫu lấy số liệu tĩnh; bảng, trạng thái bán, chi tiết vị thế, Nhật ký là minh họa hành vi.
- Trang Quản trị trong mẫu chỉ minh họa sửa Rổ, Giữ tối đa, Ẩn/Hiện. Danh sách đầy đủ, chế độ soạn bằng form Backtest, thống kê theo §7.2 và spec Tab IQX §5.
- **Khung "Điều khiển mô phỏng"** (không thuộc giao diện thật): `Sang phiên tới` (khóa lịch, tăng số phiên giữ, bán KDH do hết thời gian giữ khi có giá lại, mua FPT, sinh tin "Bot giao dịch") · `Bản tin mới` (bấm hai lần chỉ có 1 tin) · `Mẫu email` · `Tài khoản Bot mới` (trạng thái chưa chọn chiến lược).

**Cách thử nhanh:**
1. Bot → `Dùng` ở **Bollinger VN100** (giữ tối đa 10): hộp liệt kê 4 vị thế sẽ bán, phải tích mới bấm được.
2. Bot → `Sang phiên tới`: Lịch phiên khóa, chuông có tin `Bot giao dịch · Mua FPT · Bán KDH (hết thời gian giữ)`; bấm tin mở tab Lịch sử.
3. Quản trị → sửa giữ tối đa chiến lược IQX đang dùng → Bot hiện `có bản v2`, bấm Cập nhật.
4. Backtest → tab IQX chọn chiến lược, Chạy; tab Chỉ báo → nút tên chiến lược → tạo mới, thêm chỉ báo, Chạy, Lưu ▾.
5. Rổ "Tăng trưởng mở rộng": báo bỏ 4 mã ngoài VN100.

---

## 16. Nghiệm thu

Mỗi ca cần input, expected/actual, file hoặc hàm test và môi trường. Đây là yêu cầu, không phải kết quả đã đạt.

### 16.1. Luật (test golden, chạy cho cả Backtest và đường chạy Bot)

| ID | Đầu vào | Kết quả bắt buộc |
|---|---|---|
| R01 | Mua phiên 10, N = 30, không Bán | Bán ở close phiên 40; giữ 30; lý do Hết thời gian giữ. Phiên 39 chưa bán |
| R02 | Như R01, điều kiện Bán đạt phiên 25 | Bán phiên 25, Điều kiện Bán; không bán lần hai |
| R03 | Phiên 40 cả Bán và hạn cùng đạt | Một giao dịch; lý do chính Điều kiện Bán; `exit_reasons` có cả hai; một lần phí |
| R04 | Đến hạn; điều kiện Bán null | Vẫn bán theo hạn |
| R05 | Đến hạn; chỉ báo Bán lỗi quyền | Vẫn bán theo hạn; ghi cả lỗi quyền |
| R06 | Đến hạn; mã tạm ngừng 3 phiên | Không bán, không bịa giá; "Đến hạn, chưa khớp"; thử lại mỗi phiên; bán ở phiên đầu có giá; số phiên giữ vẫn tăng |
| R07 | 2 Mua trong phiên và 3 vị thế đến hạn | Bán đủ 3; không ảnh hưởng 2 suất Mua |
| R08 | Mua T, Bán đạt ở T+1 | T+1 không bán, Nhật ký ghi chờ T+2; T+2 xét lại bằng dữ liệu T+2 |
| R09 | Mua thứ Năm; thứ Sáu, thứ Hai nghỉ | `sellable_from` là thứ Tư |
| R10 | Bán ở T+2, cùng phiên có Mua mã khác | Tiền bán dùng được ngay |
| R11 | 5 mã cùng đạt Mua, GTGD TB20 khác nhau (và 2 mã bằng nhau) | Mua 2 mã GTGD TB20 cao nhất; bằng nhau theo A→Z |
| R12 | Mã vừa bán trong phiên cũng đạt Mua | Không mua lại cùng phiên |
| R13 | Lệnh bị bỏ qua | Ghi đúng 3 lý do |
| R14 | Retry job cùng phiên sau khi đã bán do hạn | Không bán lại, không ghi trùng, dùng cùng bản chiến lược |
| R15 | **Backtest = Bot:** Bot replay 60 phiên lịch sử với một chiến lược | Lệnh và NAV từng phiên **trùng** Backtest cùng chiến lược, cùng khoảng |
| R16 | Giá theo đồng | `price_unit = VND`; `entry_price` FPT ở hàng chục nghìn |
| R17 | Vị thế ngoài rổ hiện tại | Bán theo điều kiện Bán/hạn như mọi vị thế |

### 16.2. Backtest

| ID | Kết quả bắt buộc |
|---|---|
| S01 | Tab mặc định Chỉ báo; thư viện giống hiện tại, không có Luyện tập |
| S02 | Tab IQX: chỉ chiến lược đang hiện; thẻ chỉ báo không có Chỉnh/✕; Rổ, Giữ tối đa khóa; không có Lưu; Chạy được |
| S03 | Chuyển tab không mất bản nháp, kết quả của tab kia |
| S04 | Nút tên chiến lược chỉ hiện tên; danh sách đủ, có nhãn Bot, 🗑, ＋ Tạo mới |
| S05 | Xóa: chiến lược Bot đang/sắp dùng không xóa được (cả API → 409); xóa chiến lược khác: biến mất, tên dùng lại được, lần chạy cũ vẫn hiện tên |
| S06 | Lưu khóa khi chưa chạy hoặc sửa sau chạy; sửa rồi sửa lại đúng như lần chạy thì mở; API `from_run_id` sai → 422 |
| S07 | Lưu bản mới cho chiến lược phiên tới → hộp §4.4.2; Lịch phiên Bot đổi ngay |
| S08 | Giới hạn 20, trùng tên, hai tab trình duyệt cùng lưu → đúng lỗi |
| S09 | Danh mục có mã ngoài VN100 → câu cảnh báo, kết quả chỉ trên mã còn lại, bản lưu có `symbols` đã lọc |
| S10 | Ô Vốn khóa 100.000.000; không còn Cổ phiếu, khớp lệnh, phí, Tạo cảnh báo |
| S11 | Backtest N = 5: mọi giao dịch đã đóng có giữ ≤ 5; không giao dịch nào bán trước nến entry+2 |
| S12 | 7 chỉ số (năm hóa `—` khi N < 60), biểu đồ 3 đường, 5 tab, biểu đồ mã 3 loại điểm |
| S13 | Lần chạy đã lưu: lọc đúng; Xem nạp kết quả; lần chạy cũ chỉ xem số liệu |
| S14 | Lịch sử bản: Mở, Khôi phục thành bản mới (tạo bản mới, không sửa bản cũ) |

### 16.3. Bot

| ID | Kết quả bắt buộc |
|---|---|
| B01 | Không còn danh mục mua mới, giới hạn nắm giữ, 16 chỉ báo, Luyện tập, Cấu hình, khung điều kiện, nhãn "Đã bật Mua và Bán", không có công tắc bật/tạm dừng |
| B02 | Hai khung tên; Chi tiết mở đúng tab và chiến lược; Dùng → xác nhận → Lịch phiên đổi |
| B03 | Lịch phiên: giống → `không đổi`; khác → `● có thay đổi`; Xem khác biệt đúng; Giữ như phiên gần nhất hoạt động |
| B04 | Hạ giữ tối đa (Dùng, Lưu áp dụng, Cập nhật IQX, Giữ như phiên gần nhất) có vị thế đến hạn: liệt kê đúng `counted` tại phiên tới; nút khóa tới khi tích; API thiếu xác nhận → 422 |
| B05 | Như B04, danh sách đổi giữa lúc xem và lúc lưu → 409, hiện lại |
| B06 | Tăng giữ tối đa: không cần xác nhận |
| B07 | Quản trị xuất bản bản mới chiến lược IQX Bot đang dùng → Bot vẫn bản cũ, có thông báo, Cập nhật thì phiên tới đổi |
| B08 | Quản trị ẩn chiến lược IQX Bot đang dùng → Bot vẫn chạy, nhãn `IQX đã ngừng cung cấp`, không có Dùng; biến mất khỏi tab IQX |
| B09 | Giờ chốt: lưu trước giờ chốt của D → phiên D dùng bản mới; sau → D+1; ngày lễ bị bỏ qua |
| B10 | Đang giữ: cột Đã giữ (`counted / N`, Thực giữ) và Trạng thái bán đúng 4 trạng thái; Chi tiết vị thế đủ dòng |
| B11 | Lịch sử: Thời gian giữ, Lý do bán (`cùng đến hạn`), chiến lược · bản; Chi tiết giao dịch Bán |
| B12 | Nhật ký: mỗi phiên một dòng, có chiến lược · bản, rổ, kết quả đếm riêng hết hạn / chờ T+2 / chưa khớp |
| B13 | Tài khoản mới: chưa chọn chiến lược, không mua; chọn chiến lược → phiên tới chạy |
| B14 | Modal Nguyên tắc Bot đúng §5.7 |

### 16.4. Thông báo (giữ v1.2)

| ID | Đầu vào | Kết quả bắt buộc |
|---|---|---|
| T01 | Mặc định; phiên Bot mua 2, bán 1 (hết hạn) | Đúng 1 tin `Bot giao dịch · phiên dd/mm`, nội dung `Mua A, B · Bán C (hết thời gian giữ)`; chưa đọc +1 |
| T02 | Phiên Bot không có lệnh | Không có tin |
| T03 | Retry job sau T01 | Không tin, không email thứ hai |
| T04 | Tắt "Bot giao dịch" | Không tin Bot; bản tin vẫn nhận |
| T05 | Tắt công tắc tổng | Không tin nào |
| T06 | Bản tin Public, Public lại, gỡ | Chỉ 1 tin |
| T07 | Bật Email, phiên có lệnh | Email đúng §8.4; link tắt đúng loại, không cần đăng nhập; dùng lại token báo đã dùng |
| T08 | Chưa xác thực email | Nút Email khóa, `Chưa có email` |
| T09 | Bấm tin Bot | Mở Bot › Lịch sử; đã đọc trên mọi thiết bị |
| T10 | `Cài đặt thông báo` ở trang khác, 390 px | Đi tới Bot, mở panel, cuộn tới thẻ THÔNG BÁO |
| T11 | Chuyển đổi dữ liệu | Không tin, không email |
| T12 | Đổi chiến lược, lưu bản, IQX có bản mới | Không tin |

### 16.5. Chuyển đổi

| ID | Kết quả bắt buộc |
|---|---|
| M01 | Bot có Mua: 1 chiến lược (hoặc 2 bản nếu có revision chưa hiệu lực); phiên tới ra **cùng lệnh** như trước chuyển đổi (trừ mã ngoài VN100 bị lọc) |
| M02 | Vị thế mở trước P đã giữ thực 80 phiên: không bán ở P; đến hạn P+30; UI hiện Thực giữ |
| M03 | Bot chỉ có Bán: chiến lược "chỉ bán", không mua mới, vẫn bán theo điều kiện/hạn |
| M04 | Bot không có điều kiện: chưa chọn chiến lược |
| M05 | Không lệnh, không thông báo lúc chuyển đổi; lịch sử bán trước P không đổi |
| M06 | Lần chạy cũ hiện `Cấu hình cũ`; cài đặt thông báo mặc định đúng |

### 16.6. Màn hình nhỏ và bàn phím

| ID | Kết quả bắt buộc |
|---|---|
| V01 | 360/390/900/1024/1440 px: không cuộn ngang trang ở Backtest (hai tab, danh sách chiến lược, menu Lưu), Bot (bảng cuộn nội bộ), chuông, Quản trị |
| V02 | Hộp có bản nháp/xác nhận: Escape hỏi bỏ; focus quay về nút mở |

### 16.7. Ca cũ bỏ hoặc sửa

- **Bỏ:** mọi ca mini (v1.0 P-xx liên quan mini, P06, P13; v1.2 X29–X32, X27, L08); ca danh mục mua mới U01–U07, U09; ca Lưu cho Bot L01–L07, L09, L10; X12–X18 (đổi N trên Bot), X23–X25, X28 (thay bằng S06, S13, B04–B06).
- **Sửa:** B03 (v1.0): không Bán, giá giảm sâu, giữ hơn N phiên → bán theo hạn N của chiến lược. B15: Bot và Backtest cùng khớp đóng cửa, cùng T+2 và giữ tối đa.
- Các ca v1.0 khác giữ nguyên.

---

## 17. Dev cần xác nhận trước khi làm

| # | Nội dung |
|---|---|
| 1 | **Giờ chốt dữ liệu** mỗi ngày; nguồn lịch ngày giao dịch |
| 2 | Kho VN100 Flashback: có OHLCV, khối lượng; giá đã điều chỉnh chưa; đơn vị; lưu từ năm nào; còn giữ mã đã rời VN100; có VN-Index |
| 3 | Code Bot so với §3: 12% NAV, 2 lệnh/phiên, 30%/mã, ưu tiên GTGD TB20, tiền bán dùng ngay, khớp đóng cửa, T+2, phí. Liệt kê chỗ khác để sửa |
| 4 | Bot đang đọc giá từ đâu; kế hoạch chuyển sang kho VN100 |
| 5 | Thời gian chạy VN100 × 10 năm |
| 6 | Chiến lược IQX đã xuất bản ra production chưa (§7.1) |
| 7 | Số liệu dry-run chuyển đổi (§11.3) |
| 8 | `strategy_alerts` đang tham chiếu `backtest_run`/`shared_revision`: cách xử lý khi bỏ "Tạo cảnh báo từ backtest" và cấu hình chung |
| 9 | Route, dữ liệu và chỗ gọi của Luyện tập (mini) cần gỡ |
| 10 | Dịch vụ gửi email và tên miền gửi |

**Bàn giao:** trả lời bảng trên; danh sách file đã sửa và migration; kết quả test §16 (đặc biệt R01–R17, B04–B05, M01–M06, T01–T12); danh sách câu Học viện đã sửa. Không báo "đã test" nếu chưa chạy test.

---

## 18. Định nghĩa hoàn thành

1. Backtest chạy trên rổ theo đúng §3; **R15 chứng minh Backtest và Bot ra cùng lệnh**.
2. Bot chỉ chọn chiến lược; Lịch phiên, giờ chốt, phiên bản đúng §6; hạ giữ tối đa có cảnh báo và xác nhận ở cả UI lẫn API.
3. T+2 và giữ tối đa đúng ở engine (không chỉ là nhãn).
4. Chiến lược IQX, Quản trị, ẩn đúng §7.
5. Thông báo đúng §8: 2 loại, chuông, email, không trùng, tắt được bằng link.
6. Chuyển đổi đúng §11: một lần, không sinh lệnh, không gửi thông báo.
7. Luyện tập (mini) đã gỡ; câu chữ Học viện đã rà.

**Chưa hoàn thành nếu:**
- Backtest và Bot cho lệnh khác nhau trên cùng dữ liệu.
- Đếm theo ngày lịch, hoặc T+2 chỉ là nhãn mà engine vẫn bán ở T+1.
- Bán đồng loạt vị thế cũ lúc deploy.
- Lưu được bản nháp chưa chạy.
- Bot tự đổi theo bản mới của chiến lược IQX.
- Thông báo gửi trùng khi chạy lại job, hoặc gửi khi chuyển đổi.

---

### Câu giao việc ngắn cho AI Dev

> Triển khai **Bot và Chiến lược v2.0** theo spec này và `IQX-Bot-Chien-Luoc-MAU-v2.0.html`. Spec này thay Bot v1.2 (chưa lên web).
> - **Chiến lược** = rổ + Mua + Bán + giữ tối đa. Backtest 2 tab: **IQX** chỉ xem, chạy thử; **Chỉ báo** tạo, sửa, lưu theo bản, xóa (tối đa 20), chọn ở nút tên chiến lược.
> - **Backtest chạy trên cả rổ**, giá từ **kho VN100 Flashback**, khớp **đóng cửa cùng phiên**, vốn **cố định 100 triệu**, **T+2**, **giữ tối đa**, ưu tiên **GTGD TB20**, trong **một module luật dùng chung với Bot** (§3).
> - **Bot chỉ chọn chiến lược**, có **Lịch phiên**, cảnh báo khi hạ giữ tối đa, bảng Đang giữ/Lịch sử/Nhật ký theo §5.5. Bỏ danh mục mua mới, giới hạn nắm giữ, 16 chỉ báo trên Bot. Không có bật/tạm dừng.
> - Giữ **Thông báo** (§8). **Gỡ Luyện tập (mini).** Bỏ Tạo cảnh báo từ backtest.
> - Chuyển đổi một lần theo §11, không sinh lệnh, không gửi thông báo.
>
> Trả lời §17 trước khi làm. Test R15 phải chứng minh **Backtest và Bot ra cùng lệnh**.
