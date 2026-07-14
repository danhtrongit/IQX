# SPEC — Dashboard Phân tích Báo cáo Tài chính (iqx.vn)

> Tài liệu đặc tả cho developer. Mục tiêu: xây dashboard phân tích BCTC hướng nhà đầu tư,
> theo kiến trúc "kể chuyện 2 lớp", giao diện **nền tối (dark theme)**.
> Kèm file `SYSTEM_PROMPT_ai_generate.md` để đẩy lên AI sinh nội dung chữ.
>
> **Phiên bản:** đã cập nhật đầy đủ theo các quyết định thiết kế mới nhất (dark theme, bỏ verdict tag,
> bỏ nhãn "AI viết", thứ tự khối, khối bức tranh tài chính có lịch sử + nguồn tăng trưởng, khối cổ tức, chất lượng lợi nhuận).

---

## 0. Tóm tắt sản phẩm

Dashboard biến 3 báo cáo tài chính (Cân đối kế toán, Kết quả kinh doanh, Lưu chuyển tiền tệ)
thành một trang phân tích dễ hiểu cho nhà đầu tư cá nhân, trả lời 5 câu hỏi cốt lõi:

1. Công ty khỏe hay yếu?
2. Kiếm tiền thế nào, có bền không?
3. Tài chính có an toàn không?
4. Giá đắt hay rẻ?
5. Nhà đầu tư nhận được gì?

**Triết lý thiết kế:**
- **Không tổ chức theo công cụ phân tích** (DuPont, Altman...), mà **tổ chức theo câu hỏi của nhà đầu tư**.
- **2 lớp (progressive disclosure):** lớp trên = kết luận đời thường + chart; lớp dưới = chi tiết cho analyst (ẩn trong "Xem chi tiết").
- **Không dùng tên mô hình học thuật ở lớp người dùng.** Altman/Piotroski/Beneish/DuPont/Sloan → diễn giải thành ngôn ngữ thường. Chỉ được xuất hiện trong drilldown nếu thật cần.
- **Mỗi khối: kết luận chữ → chart "thay đổi theo thời gian" → chart "so với ngành".**
- Ngôn ngữ mặc định: **tiếng Việt**.

**Ràng buộc dữ liệu quan trọng:** đầu vào **CHỈ có 3 báo cáo tài chính, KHÔNG có thuyết minh**.
Mọi chỉ tiêu phải tính được từ 3 báo cáo này. Chỉ tiêu cần thuyết minh (nợ xấu theo nhóm, CAR chi tiết,
CASA, cơ cấu doanh thu theo mảng...) → hoặc bỏ, hoặc dùng số đại diện và **ghi chú rõ là ước tính**.

---

## 1. Phân loại template

Hệ thống có **2 template**. Bộ định tuyến (Sector Router) chọn template dựa trên đặc điểm BCTC.

| Template | Áp dụng | Cách nhận diện |
|----------|---------|----------------|
| **A — Phi ngân hàng** | ~95% mã: sản xuất, bán lẻ, CNTT/dịch vụ, BĐS, tiện ích, chứng khoán, bảo hiểm | Mặc định |
| **B — Ngân hàng** | NHTM | BCTC có "Thu nhập lãi thuần", "Cho vay khách hàng", "Tiền gửi khách hàng"; KHÔNG có "Doanh thu bán hàng / Giá vốn" theo cách thông thường |

**Logic router (pseudocode):**
```
if has_line_item("Thu nhập lãi thuần") and has_line_item("Cho vay khách hàng"):
    template = "B"   # Ngân hàng
else:
    template = "A"   # Phi ngân hàng
```

### 1.1. Ngành phụ trong Template A (chỉ ảnh hưởng NGƯỠNG + DIỄN GIẢI, không đổi khối)

Trong Template A, nhận diện ngành phụ để điều chỉnh **ngưỡng benchmark** và **câu chữ diễn giải** —
KHÔNG thêm/bớt khối. 7 ngành phụ:

| Ngành phụ | Nhận diện (từ BCĐKT/KQKD) | Điều chỉnh diễn giải |
|-----------|---------------------------|----------------------|
| Sản xuất | Mặc định | Nhấn vòng quay tài sản, biên gộp |
| CNTT/Dịch vụ | TSCĐ/Tổng TS < 20% và HTK/TS thấp | "Nhẹ tài sản"; kỳ thu tiền dài do khách nước ngoài |
| Bán lẻ | Chu kỳ tiền mặt < 0 và HTK cao | **Chu kỳ tiền mặt âm là ĐIỂM TỐT** (không cảnh báo) |
| Bất động sản | "Người mua trả tiền trước" lớn | **Dòng tiền âm nhiều năm là BÌNH THƯỜNG** (đang xây dự án); nới ngưỡng dòng tiền |
| Chứng khoán | Có "Tài sản tài chính FVTPL" | Không phân tích biên gộp; nhấn tài sản tài chính, đòn bẩy |
| Bảo hiểm | Có "Dự phòng nghiệp vụ" | Nhấn thu nhập đầu tư; hạn chế phân tích sâu (thiếu thuyết minh) |
| Tiện ích | TSCĐ/Tổng TS cao | Nhấn biên EBITDA ổn định |

> **Lưu ý dev:** ngành phụ chỉ là tham số điều chỉnh (`sub_sector`), không rẽ nhánh cấu trúc.
> Chứng khoán & bảo hiểm dùng chung khung Template A nhưng nhiều chỉ tiêu sẽ mỏng do thiếu thuyết minh — chấp nhận và ghi chú.

---

## 2. Cấu trúc & thứ tự khối

Cả hai template đều có **8 khối** (Khối 0 = thẻ điểm, không đánh số hiển thị; Khối 1–7 đánh số).

### 2.1. Thứ tự khối (BLOCK_ORDER)

Thứ tự hiện tại (đặt Định giá sớm, ngay sau Câu chuyện):

```
0  Thẻ điểm sức khỏe        (không đánh số)
01 Câu chuyện doanh nghiệp
02 Giá đang đắt hay rẻ?      (Định giá)
03 Bức tranh tài chính
04 Kinh doanh có ổn không?   (A) / Ngân hàng kiếm tiền thế nào? (B)
05 Tiền có thật không?       (A) / Vận hành có hiệu quả không? (B)
06 Sức khỏe tài chính        (A) / Chất lượng tài sản (B)
07 Cổ đông nhận được gì?     (Cổ tức)
```

> **Dev NÊN làm thứ tự khối cấu hình được** (mảng trong config), không hard-code.
> Cấu hình thay thế đáng cân nhắc: chuyển Định giá xuống gần cuối (sau Sức khỏe) để con số định giá
> thuyết phục hơn khi người đọc đã hiểu nền tảng — `BLOCK_ORDER = [0,1,3,4,5,6,2,7]`.

### 2.2. Template A — Phi ngân hàng

| # | Khối | Câu hỏi người dùng | Nguồn dữ liệu |
|---|------|--------------------|--------------| 
| 0 | Thẻ điểm sức khỏe | Tổng quan nhanh | Tổng hợp |
| 1 | Câu chuyện doanh nghiệp | Bức tranh bằng lời | AI (tổng hợp) |
| 2 | Giá đang đắt hay rẻ? | Định giá | KQKD + giá thị trường |
| 3 | Bức tranh tài chính | To cỡ nào, tiền của ai, phình to đến từ đâu | BCĐKT |
| 4 | Kinh doanh có ổn không? | Tăng trưởng, biên LN, chất lượng LN | KQKD |
| 5 | Tiền có thật không? | Lãi trên sổ vs tiền mặt | LCTT |
| 6 | Sức khỏe tài chính | Nợ / trụ được / chất lượng sổ sách | BCĐKT + LCTT |
| 7 | Cổ đông nhận được gì? | Cổ tức | LCTT |

### 2.3. Template B — Ngân hàng

Giữ NGUYÊN khung câu hỏi, thứ tự và thiết kế; đổi nội dung 4 khối (đánh dấu ★).

| # | Khối | Khác biệt so với A | Nguồn |
|---|------|--------------------|-------|
| 0 | Thẻ điểm sức khỏe | ★ 5 chiều: Tăng trưởng · Sinh lời · Chất lượng tài sản · An toàn vốn · Định giá | Tổng hợp |
| 1 | Câu chuyện | Như A | AI |
| 2 | Giá đang đắt hay rẻ? | ★ Dùng P/B & Justified P/B (không DCF) | BCĐKT + giá |
| 3 | Bức tranh tài chính | ★ Tài sản = cho vay; nguồn vốn = tiền gửi huy động | BCĐKT |
| 4 | Ngân hàng kiếm tiền thế nào? | ★ Thay "Kinh doanh": NIM + cơ cấu thu nhập lãi/ngoài lãi | KQKD ngân hàng |
| 5 | Vận hành có hiệu quả không? | ★ Thay "Dòng tiền" (vô nghĩa với NH): CIR (chi phí/thu nhập), PPOP | KQKD |
| 6 | Chất lượng tài sản có tốt không? | ★ Thay "Sức khỏe": nợ xấu + bộ đệm dự phòng | KQKD + BCĐKT |
| 7 | Cổ đông nhận được gì? | Như A (NH thường chia cổ phiếu) | LCTT |

---

## 3. Đặc tả từng khối (chi tiết dữ liệu + chart)

> Ký hiệu nguồn: **[CĐ]** Cân đối, **[KQ]** Kết quả KD, **[LC]** Lưu chuyển tiền tệ, **[TT]** Thị trường.
> Mọi chỉ tiêu tính cho **5 năm gần nhất** để vẽ lịch sử.
>
> **QUAN TRỌNG — quy ước hiển thị kết luận:**
> - **KHÔNG hiển thị "verdict tag/badge" ở góc trên bên phải mỗi khối.** (Đã bỏ theo yêu cầu.)
>   Kết luận của khối nằm trong **câu trả lời văn** ngay dưới tiêu đề, không phải ở một pill riêng.
> - Khối 1 **KHÔNG hiển thị nhãn "AI viết · N từ".** Câu chuyện bắt đầu thẳng bằng câu lead.
> - Tiêu đề mỗi khối đứng một mình bên trái (không có phần tử đối trọng bên phải).

### KHỐI 0 — Thẻ điểm sức khỏe

- **Hero:** mã, tên, sàn, ngành, giá hiện tại [TT], giá hợp lý (từ Khối định giá), % upside.
- **Kết luận 1 câu:** do AI viết, ≤ 30 từ, nêu bật điểm mạnh nhất + lưu ý lớn nhất.
- **Radar 5 trục** (điểm 0–100 mỗi trục):
  - Template A: Kinh doanh · Sinh lời · Dòng tiền · An toàn tài chính · Định giá
  - Template B: Tăng trưởng · Sinh lời · Chất lượng tài sản · An toàn vốn · Định giá
- Bên phải radar: 5 thanh ngang (1 thanh mỗi trục) + nhãn định tính (Tốt/Xuất sắc/Hợp lý...).
- **Nhãn điểm tổng** dưới radar: "Sức khỏe: [mức] · X.X / 5" + dòng đếm "x xanh · y vàng · z đỏ". (Nhãn này GIỮ — nó thuộc thẻ điểm, không phải verdict tag của khối.)
- **Cách chấm điểm mỗi trục:** so với ngưỡng ngành → map về 0–100. Ngưỡng cấu hình theo `sub_sector`.

### KHỐI 1 — Câu chuyện doanh nghiệp

- **1 khối liền mạch** (không chia cột, KHÔNG nhãn "AI viết"). Gồm:
  - Câu lead (1 câu lớn, serif).
  - 3 đoạn văn AI (~220–240 từ tổng): đoạn 1 kinh doanh/tăng trưởng, đoạn 2 dòng tiền/an toàn, đoạn 3 định giá + rủi ro theo dõi.
  - Đường kẻ ngăn.
  - 2 danh sách trong cùng khung (2 cột trên desktop, 1 cột mobile): **◆ Điểm khỏe** (4–5 gạch đầu dòng) và **◆ Cần theo dõi** (1–3 gạch).
- Nội dung do AI sinh (xem system prompt). Số liệu chèn inline, KHÔNG bịa.

### KHỐI 2 — Giá đang đắt hay rẻ?

**Template A:**
- Câu trả lời văn: vùng giá hợp lý (bear–base–bull), giá hiện tại nằm đâu (không dùng verdict pill).
- **Football field:** 4 phương pháp — DCF, RIM (thu nhập thặng dư), P/E band 5 năm, Sàn sổ sách. Mỗi phương pháp 1 dải bear–bull, vạch giá hiện tại (màu đỏ/amber) xuyên qua tất cả các dải.
- 3 metric card: giá hiện tại, giá hợp lý (trung vị), upside %.
- Drilldown: bảng 4 phương pháp × bear/base/bull + phân tích độ nhạy.

**Template B:**
- **P/B hiện tại**, **P/B hợp lý (Justified P/B = (ROE − g)/(Ke − g))**, **P/E hiện tại**.
- Mỗi metric có thanh so với trung vị ngành.
- Diễn giải: vì sao ROE cao → P/B hợp lý cao là chính đáng.

### KHỐI 3 — Bức tranh tài chính

**Template A** — trả lời "phình to cỡ nào & đến từ đâu":
- **Chart cột chồng TUYỆT ĐỐI 5 năm** (số tiền thật, KHÔNG phải %): mỗi năm 1 cột = tổng tài sản, chia 3 dải xếp chồng: Vốn cổ đông / Nợ khác / Nợ vay. Có trục y (mốc tiền). Ghi nhãn % ở cột đầu & cột cuối (cột cuối ghi đủ 3 dải làm cột tham chiếu). → thấy quy mô phình + cơ cấu cùng lúc.
- **Dải "phần tăng thêm đến từ đâu":** tách khoản tăng tổng tài sản trong 5 năm thành 3 nguồn, mỗi nguồn 1 thanh + số tiền + %: **Lợi nhuận giữ lại** (tốt nhất) / **Nợ vận hành** / **Vay nợ**. → insight chất lượng tăng trưởng.
- **3 số tổng:** Tổng tài sản, Vốn chủ, Nợ phải trả — kèm bội số so với năm gốc (gấp X lần).
- **Tài sản nằm ở đâu (hiện tại):** 4 thanh ngang (grid 2 cột) — Tiền & ĐTNH / Phải thu / TSCĐ / Khác (% tổng TS). **HIỆN TRỰC TIẾP, không ẩn trong drilldown.**

**Template B:**
- Tài sản dùng làm gì (thanh ngang): Cho vay KH / Chứng khoán ĐT / Tiền & gửi NHNN-TCTD / Khác.
- Nguồn vốn từ đâu (stacked bar ngang): Tiền gửi huy động / Vốn chủ / Vay & phát hành khác.
- 3 số tổng: Tổng tài sản, Cho vay khách hàng, Vốn chủ.

### KHỐI 4 — Kinh doanh (A) / Kiếm tiền thế nào (B)

**Template A:**
- Câu trả lời văn.
- **Combo chart 5 năm:** cột doanh thu + 2 đường (biên gộp, biên LN sau thuế). Nhãn số doanh thu đặt TRONG lòng cột (tránh đè lên đường). → tăng trưởng + biên cùng lúc.
- 3 metric có so ngành: Tăng trưởng doanh thu, Biên LN gộp, ROE.
- **Chất lượng lợi nhuận (HIỆN TRỰC TIẾP):** thanh cơ cấu LN trước thuế = Cốt lõi vs Một lần (bán TS, hoàn nhập dự phòng...) + so ngành. → LN bền hay ảo.
- Drilldown: cơ cấu chi phí (common-size), phân rã ROE (được phép ghi "DuPont" ở đây — vì là lớp analyst).

**Template B:**
- **NIM 5 năm** (đường).
- Cơ cấu thu nhập (thanh): Lãi thuần / Phí dịch vụ / Ngoại hối & khác (+ so ngành).
- 3 metric: NIM, ROA, ROE (so ngành).

### KHỐI 5 — Tiền có thật không? (A) / Vận hành hiệu quả (B)

**Template A:**
- Câu trả lời văn (nhấn: đây là câu hỏi quan trọng hay bị bỏ qua).
- **Đường Lợi nhuận vs Tiền mặt 5 năm** (2 đường): đường tiền từ KD nên nằm trên/bám đường lợi nhuận.
- 3 metric: Tiền từ KD/Lợi nhuận (>1 là tốt), Dòng tiền tự do/Doanh thu, **"Phần lãi chưa thành tiền"** (= chỉ số dồn tích; TUYỆT ĐỐI không gọi "Sloan").
- Drilldown: cầu nối (waterfall) LN sau thuế → +khấu hao → ±vốn lưu động → tiền từ KD → −chi đầu tư → dòng tiền tự do.

**Template B:**
- **CIR 5 năm** (đường, đi xuống = tốt).
- CIR so ngành (thấp = hiệu quả).
- (Tùy chọn) PPOP.

### KHỐI 6 — Sức khỏe tài chính (A) / Chất lượng tài sản (B)

**Template A** — verdict tổng (chỉ câu văn, KHÔNG badge) + 3 câu hỏi con:
- **6A. Công ty có nợ nhiều không?** → DuoPanel: (trái) đường nợ ròng/EBITDA 5 năm, vượt mốc 0 = dư tiền | (phải) thanh nợ/vốn chủ so ngành (cao nhất / trung vị / công ty).
- **6B. Gặp khó có trụ được không?** → DuoPanel: (trái) cột khả năng trả lãi vay 5 năm | (phải) thanh thanh khoản (tài sản dễ bán/nợ ngắn hạn) so ngành.
- **6C. Chất lượng sổ sách có ổn không?** → checklist 3 mục ✓/⚠ (lãi khớp tiền? / pha loãng CP? / khách trả chậm dần?) + DuoPanel: (trái) đường số ngày thu tiền công ty vs trung vị ngành | (phải) ô "Ý nghĩa" kèm mốc cảnh báo.

**Template B** — verdict tổng (câu văn) + 2 câu hỏi con:
- **6A. Nợ cho vay có bị xấu nhiều không?** → DuoPanel: (trái) tỷ lệ nợ xấu 5 năm có đường ngưỡng 3% | (phải) so ngành (công ty / trung vị / ngưỡng cảnh báo).
- **6B. Có dự phòng đủ không?** → 3 metric: Bao phủ nợ xấu, Chi phí dự phòng/lợi nhuận, Đòn bẩy.
- **BẮT BUỘC ghi chú:** nợ xấu chi tiết & CAR là ước tính do thiếu thuyết minh; chi phí dự phòng lấy từ KQKD.

### KHỐI 7 — Cổ đông nhận được gì? (cả A & B)

- Câu trả lời văn.
- **Chart cổ tức 5 năm** (cột): A = cổ tức tiền mặt (đồng/cp); B = tỷ lệ cổ tức (thường bằng cổ phiếu).
- Chỉ số (2 stat): Tỷ suất cổ tức (so ngành), Tỷ lệ chi trả (payout). B: ghi rõ hình thức chủ yếu (tiền/cổ phiếu).

---

## 4. Thư viện thành phần UI (component)

Dev implement các component tái sử dụng sau (dùng chung cả 2 template):

| Component | Mô tả | Props chính |
|-----------|-------|-------------|
| `HeroCard` | Danh thiếp + giá + kết luận 1 câu | ticker, name, price, fairValue, verdict |
| `RadarScorecard` | Radar 5 trục + 5 thanh + nhãn điểm tổng | dims[], score |
| `AiMemo` | Khối câu chuyện + điểm khỏe/theo dõi (KHÔNG nhãn "AI viết") | lead, paragraphs[], strengths[], watchlist[] |
| `QuestionBlock` | Khung 1 khối: tiêu đề + câu trả lời văn + nội dung (KHÔNG verdict pill) | question, answer, children |
| `SubQuestion` | Câu hỏi con (6A/6B...): mã + tiêu đề + câu trả lời (KHÔNG tag) | code, question, answer, children |
| `DuoPanel` | 2 cột: "thay đổi 5 năm" \| "so ngành" | left, right |
| `ComboBarLine` | Cột + đường chồng (doanh thu + biên) | bars[], lines[] |
| `StackedBarAbsolute` | Cột chồng tuyệt đối 5 năm (có trục y) | series[], labels[] |
| `LineChart` | Đường 1–2 series + đường ngưỡng | series[], threshold |
| `PeerBar` | Thanh xếp hạng so ngành (công ty/median/best/ngưỡng) | rows[] |
| `MetricCard` | 1 số + thanh so ngành | label, value, unit, peer{} |
| `Waterfall` | Cầu nối dòng tiền | steps[] |
| `FootballField` | Dải định giá 4 phương pháp + vạch giá hiện tại | methods[], currentPrice |
| `Checklist` | Danh sách ✓/⚠ | items[] |
| `Drilldown` | `<details>` gập/mở "Xem chi tiết" | summary, children |

**Nguyên tắc chart:** ưu tiên SVG nội tuyến (nhẹ, kiểm soát màu qua biến CSS). Nếu dùng lib chart, chọn 1 lib nhẹ và đảm bảo màu lấy từ design tokens (để tự đổi theo theme).

---

## 5. Hệ thiết kế (design tokens) — DARK THEME (mặc định)

Giao diện mặc định **nền tối**. Toàn bộ màu điều khiển qua biến CSS `:root` — đây là điểm mấu chốt để
đổi/thêm theme chỉ bằng cách thay bộ token.

```css
:root{
  /* nền & khung */
  --paper:#0e0f0e;       /* nền trang (đen) */
  --card:#171917;        /* nền card */
  --ink:#ecebe3;         /* chữ chính (trắng ngà) */
  --ink-soft:#b4b2a6;    /* chữ phụ */
  --ink-faint:#7f8177;   /* chữ mờ / caption */
  --line:#2b2d28;        /* đường kẻ */
  --line-strong:#3d403a; /* đường kẻ đậm / dải trung tính trong chart */

  /* màu ngữ nghĩa — ĐÃ LÀM SÁNG để nổi trên nền đen */
  --green:#4fae7e;   --green-bg:#16271e;   /* tốt / cờ xanh */
  --amber:#d29a3f;   --amber-bg:#2b2312;   /* lưu ý / cờ vàng */
  --red:#d8635a;     --red-bg:#2c1613;     /* cảnh báo / cờ đỏ */
  --accent:#5b9bd0;  --accent-soft:#152430;/* nhấn / dữ liệu phụ (xanh dương) */

  /* font */
  --serif:'Fraunces',serif;         /* tiêu đề, câu lead */
  --body:'Newsreader',Georgia,serif; /* body */
  --mono:'IBM Plex Mono',monospace;  /* số */
  --sans:'IBM Plex Sans',sans-serif; /* nhãn, UI */
}
```

**Nếu cần hỗ trợ light theme sau này:** chỉ tách bộ token thứ hai và toggle. Bộ light tham chiếu (bản gốc):
```
--paper:#f7f5ef; --card:#fffdf8; --ink:#1a1c1a; --ink-soft:#4a4d48; --ink-faint:#8a8d86;
--line:#dcd8cc; --line-strong:#c5c0b1;
--green:#2f6b4f; --green-bg:#e6efe7; --amber:#9a6b1e; --amber-bg:#f5ecd8;
--red:#a33a32; --red-bg:#f3e2df; --accent:#1f4a6b; --accent-soft:#e4ecf2;
```

**QUAN TRỌNG — không hard-code màu trong SVG:** mọi `fill`/`stroke` trong chart phải trỏ về biến CSS
(vd `stroke="var(--line)"`), KHÔNG viết mã màu trực tiếp. Trong bản mẫu HTML còn vài chỗ hard-code ở
lưới radar (`stroke="#2b2d28"`, `#3d403a"`) và `fill:#fff` trong dải stacked bar — khi code lại NÊN
chuyển hết sang biến để theme tự áp. (`fill:#fff` trên dải màu đậm có thể giữ vì nền dải luôn đậm.)

**Quy ước màu ngữ nghĩa:** xanh lá = tốt/an toàn, vàng = cần lưu ý, đỏ = cảnh báo, xanh dương = trung tính/dữ liệu.
Chấm tròn = giá trị doanh nghiệp; vạch/đường đứt = trung vị ngành hoặc ngưỡng.

**Hiệu ứng nền:** 2 vệt radial-gradient rất nhẹ ở góc (xanh dương + đỏ, độ mờ ~5-6%) tạo chiều sâu.

**Responsive:** desktop 2 cột (DuoPanel, memo-flags), mobile 1 cột. Max-width ~1080px.

---

## 6. Pipeline xử lý (gợi ý luồng)

```
1. Nhận 3 BCTC (5 năm) → chuẩn hóa về schema line-item thống nhất (map mã TT200/TT22 → biến).
2. Sector Router → chọn Template A/B; nếu A → detect sub_sector.
3. Compute layer → tính toàn bộ chỉ tiêu + chuỗi 5 năm (deterministic, KHÔNG để AI tự tính).
4. Benchmark layer → so từng chỉ tiêu với trung vị/percentile ngành (theo sub_sector).
5. Threshold layer → gán màu xanh/vàng/đỏ cho từng chỉ tiêu theo ngưỡng ngành.
6. AI layer → sinh phần chữ (kết luận 1 câu, câu chuyện, câu trả lời từng khối, điểm khỏe/theo dõi)
   TỪ số liệu đã tính. Xem SYSTEM_PROMPT.
7. Render layer → đổ dữ liệu + chữ vào component theo BLOCK_ORDER của template, áp design tokens (dark).
```

**Nguyên tắc bất biến:** AI **chỉ bình luận trên số đã tính**, tuyệt đối không tự tính lại ratio hay bịa số.
Mọi con số hiển thị đến từ compute layer (bước 3), không đến từ AI.

---

## 7. Xử lý dữ liệu thiếu / edge case

- **Thiếu thuyết minh (mặc định):** chỉ tiêu cần thuyết minh → dùng đại diện từ 3 BC + gắn cờ `is_estimated=true` → UI hiện ghi chú "(ước tính, do thiếu thuyết minh)".
- **Công ty < 5 năm niêm yết:** vẽ số năm có; không nội suy giả.
- **Giá trị âm / bất thường** (vốn chủ âm, LN âm): hiển thị trung thực, đổi màu cảnh báo, AI diễn giải.
- **Ngành phụ đặc biệt (BĐS, bán lẻ):** áp ngưỡng riêng để tránh cảnh báo giả (dòng tiền âm ở BĐS, CCC âm ở bán lẻ).
- **Chứng khoán/bảo hiểm:** một số khối sẽ mỏng; hiển thị phần tính được, ghi chú phần không có.

---

## 8. Tuân thủ & tuyên bố miễn trừ

- Footer mỗi trang: nêu rõ chỉ tiêu tính từ 3 BCTC, phần chữ do AI viết trên số đã tính, ngưỡng/so ngành mang tính tham chiếu.
- **KHÔNG đưa khuyến nghị mua/bán/giữ.** Dashboard dừng ở "hiểu", không "quyết định".
- Với Template B: luôn kèm ghi chú giới hạn thiếu thuyết minh ở khối chất lượng tài sản.

---

## 9. Bàn giao

Bộ file mẫu (HTML tĩnh, nền tối, đã dựng — dùng làm nguồn chân lý về layout/spacing/màu; số liệu là minh họa):
- `template_A_phi_ngan_hang_FPT_dark.html`
- `template_B_ngan_hang_VCB_dark.html`

File system prompt cho AI sinh nội dung: `SYSTEM_PROMPT_ai_generate.md`.

**Checklist khớp mẫu khi code:**
- [ ] Nền tối, màu qua biến CSS, không hard-code màu trong SVG.
- [ ] KHÔNG có verdict tag/badge ở góc phải khối.
- [ ] Khối 1 KHÔNG có nhãn "AI viết · N từ".
- [ ] Khối 3 (A): cột chồng tuyệt đối + dải nguồn tăng trưởng + tài sản nằm đâu (hiện trực tiếp).
- [ ] Khối 4 (A): chất lượng lợi nhuận hiện trực tiếp.
- [ ] Khối 6: verdict là câu văn, không badge; câu hỏi con không tag.
- [ ] Không có tên mô hình học thuật ở lớp người dùng (chỉ drilldown khối 4 được nhắc "DuPont").
- [ ] Thứ tự khối lấy từ config, không hard-code.
