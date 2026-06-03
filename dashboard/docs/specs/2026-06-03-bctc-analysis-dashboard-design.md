# Thiết kế: Dashboard Phân tích BCTC (2 template) — làm giàu trang "Tài chính"

- **Ngày:** 2026-06-03
- **Nhánh làm việc:** `main`
- **Phạm vi spec:** Toàn bộ kiến trúc + roadmap 5 phase; **chi tiết tới hết Phase 1** (MVP không-AI). Phase 2–4 phác thảo ở mức thiết kế.
- **Tài liệu nguồn:** `~/Downloads/BCTC/huong_dan_dashboard_bctc_2_template.docx` (guide kỹ thuật), `dashboard_bctc_fpt (1).html` (prototype Template A), `dashboard_bctc_vcb.html` (prototype Template B). Phân tích đầy đủ (8 agent) đã chạy; xem mục 16.

## 1. Bối cảnh

Bộ tài liệu BCTC đặc tả một **dashboard phân tích Báo cáo tài chính dạng "research terminal" 5 lớp**, dùng **2 template** do Sector Router tự chọn:

- **Template A — Standard**: ~95% mã (mọi ngành phi-ngân hàng), 9 module, ~30 KPI, chuẩn TT200.
- **Template B — Ngân hàng**: ngân hàng thương mại, 7 module, ~20 KPI, chuẩn TT22.

Cả hai chỉ dùng **dữ liệu thuần số từ 3 báo cáo** (BCĐKT, KQKD, LCTT) — không cần thuyết minh. Nguyên tắc cốt lõi của guide: **AI không tự tính ratio, chỉ bình luận trên số đã pre-compute** (deterministic), và mỗi module có commentary riêng (60–150 từ) thay vì một memo lớn duy nhất.

**Hiện trạng IQX:** trang cổ phiếu `/co-phieu/:symbol` ([stock.tsx](../../src/pages/stock.tsx)) có 3 tab top-level: Biểu đồ / Tổng quan / **Tài chính**. Tab "Tài chính" ([stock-financials.tsx](../../src/components/stock/stock-financials.tsx)) hiện chỉ là **bảng tính thô** KQKD/CDKT/LCTT + tab "Chỉ số" (2 biểu đồ recharts + bảng 6 kỳ). **Không có module phân tích, không có AI trên BCTC.** AI hiện tại (`/ai/insight`) chỉ phân tích giá/dòng tiền/tin tức, payload **không chứa số liệu BCTC**.

**Nền tảng đã sẵn (điểm tựa):**
- Backend FastAPI proxy **toàn bộ cây line-item từ VCI/Vietcap**: `GET /api/v1/market-data/fundamentals/{symbol}/{balance_sheet|income_statement|cash_flow|ratio}` trả về `Content` với mỗi dòng có `FieldCode` (vd `bsa1`, `isa3`, `cfa1`; ngân hàng `isb*`), `Value1..ValueN`. Có cờ `is_bank` ở `/company/{symbol}/overview` và `/details`. Nguồn: [vietcap.py](../../../backend/app/services/market_data/sources/vietcap.py), normalizer [vci_finance_normalize.py](../../../backend/app/services/market_data/sources/vci_finance_normalize.py).
- LLM proxy hoàn chỉnh: [proxy_client.py](../../../backend/app/services/ai/proxy_client.py) `chat_completion`, prompt markdown trong `backend/docs/ai/`, payload builders, cache Redis TTL, endpoint POST gate `PremiumUser` ([ai_analysis.py](../../../backend/app/api/v1/endpoints/ai_analysis.py)). **Chạy một model env duy nhất** (không có tiering Sonnet/Haiku).
- Frontend: `PremiumGate` + `usePremiumStatus` ([premium-gate.tsx](../../src/components/premium/premium-gate.tsx)), recharts wrapper ([chart.tsx](../../src/components/ui/chart.tsx)), theme dark-first OKLCH + Tahoma + `tabular-nums` ([index.css](../../src/index.css), [DESIGN.md](../../DESIGN.md)).

**Khoảng trống lớn nhất không phải dữ liệu mà là tính toán:** chưa có gì tính ~30/20 KPI; ~80% Template A & ~75% Template B **tính được** từ 3 báo cáo IQX đã có. Rủi ro #1: guide viết công thức theo mã **TT200/TT22**, còn IQX có **FieldCode riêng của VCI** → cần một bảng ánh xạ + harness kiểm định trước khi đụng UI.

## 2. Mục tiêu & quyết định đã chốt

**Mục tiêu:** đưa dashboard phân tích BCTC 5 lớp (2 template, có AI commentary) vào tab "Tài chính", giúp đọc một mã trong 5–10 phút với độ sâu tương đương 2–3 giờ phân tích thủ công.

**Quyết định sản phẩm (đã chốt với người dùng 2026-06-03):**
1. **Phạm vi:** roadmap đầy đủ 5 phase, đặc tả chi tiết tới hết Phase 1.
2. **Vị trí:** làm giàu tab "Tài chính" (giữ bảng thô làm sub-view), **không** dùng cửa sổ kéo–thả, **không** route mới.
3. **Premium:** **phân tầng** — thô + Snapshot cơ bản + Forensic Panel miễn phí; AI/Forensic Trinity/Định giá/Sub-sector gate premium.
4. **Template:** làm **A và B song song**, dùng chung engine; mỗi phase chạy cả hai template.
5. **Thiết kế:** **Editorial-in-dark** — giữ cấu trúc research-note (tiêu đề serif, đánh số lớp ①–⑤, AI memo có accent) nhưng re-skin nền tối theo token OKLCH của IQX.

**Nền tảng kỹ thuật (đã chốt):**
1. **Engine tính KPI ở backend (Python)** — nguồn sự thật duy nhất cho cả UI và AI; bật cache + validation.
2. **Tái dùng LLM proxy hiện có** với payload + prompt MỚI chứa KPI đã tính; bỏ tiering Sonnet/Haiku.
3. **Định giá lùi Phase 4**, bản rút gọn (RIM + P/E band) trước; Football Field đầy đủ chỉ khi Phase 0 xác nhận có giá lịch sử + β.
4. **Dữ liệu thiếu:** hiện "N/M"/"N/A" + badge "cần review"; ngân hàng có "blind-spots box" (NPL nhóm, CASA, CAR) làm upsell — không bao giờ ẩn nguyên module.

## 3. Kiến trúc tổng thể

```
VCI/Vietcap (proxy đã có)                          BACKEND (Python/FastAPI)
  3 statements (isa/bsa/cfa | isb)  ─►  [1] FieldCode Mapper   (map A + map B → khái niệm)
  is_bank flag                          [2] Sector Router      (is_bank + chữ ký dòng + sub-sector)
                                        [3] KPI Engine         (~30 A / ~20 B, hàm thuần)
                                        [4] Validation Harness (identity, sanity, outlier → flags)
                                        [5] Redis cache (TTL theo quý)
                                              │
                       GET /market-data/bctc/{symbol}  ─► { template, sector, snapshot[],
                                              │              modules[], forensic{},
                                              │              valuation{}, flags[], meta }
                                              ▼
   FRONTEND (React) — tab "Tài chính" → sub-view "Phân tích"
        render 5 lớp theo template (A/B), badge ngưỡng & flags
                                              │
   AI:  payload = CHỈ KPI đã pre-compute  ─►  LLM proxy (đã có) ─► post-flight guard
        GET /ai/bctc/{symbol} (memo)           PremiumUser gate    ─► cache ─► commentary
        GET /ai/bctc/{symbol}/module/{id}
```

## 4. Backend

### 4.1 FieldCode Mapper (rủi ro #1 — làm trước trong Phase 0)
- Hai từ điển khai báo dạng **data** (YAML/JSON commit trong repo, không hard-code rải rác): `bctc_map_nonbank` (`isa*/bsa*/cfa*`) và `bctc_map_bank` (`isb*`).
- Mỗi entry: `concept` (vd `gross_profit`, `customer_loans`) → `field_code` VCI + `tt_code` (TT200/TT22 để truy guide) + ghi chú dấu dương/âm (vd dự phòng là số âm).
- Đặt tại `backend/app/services/bctc/mapping/` cạnh normalizer hiện có.

### 4.2 KPI Engine (`backend/app/services/bctc/`)
- `kpi_nonbank.py`, `kpi_bank.py`: hàm thuần, input = line items đã map (5 năm), output = KPI + Δ YoY/CAGR + phân loại ngưỡng xanh/vàng/đỏ (ngưỡng để trong config, điều chỉnh được theo ngành).
- `forensic.py`: Altman Z′, Piotroski F (0–9), Beneish M.
- `valuation.py`: RIM, P/E band, (DCF/Book/Football Field — Phase 4, tùy dữ liệu).
- Đầu ra chuẩn hóa: dedupe 3 chỗ ratio đang trùng (Tổng quan, Chỉ số, forecast rail) về một model ratio dùng chung.

### 4.3 Validation Harness
- BCĐKT identity (Tổng TS = Tổng NV, lệch < 0.5%), CF identity (< 1%), sanity range (0<GM<1, 0<ROE<0.5, ngân hàng 1%<NIM<8%), cờ outlier YoY>200%.
- Sinh `flags[]` (level: info/warn/error, scope: ticker/field/period) để UI hiển thị badge "cần review". **Build cùng lúc với KPI engine, không làm sau.**

### 4.4 Sector Router
- Bank vs non-bank: ưu tiên `is_bank`; đối chiếu chữ ký dòng (Cho vay KH + Tiền gửi KH + Thu nhập lãi thuần). Lưu ý: CTCK/Bảo hiểm phải về Template A (không nhầm sang B).
- Sub-sector (chỉ Template A, cho Module 7): heuristic 7 nhóm (Bảo hiểm/Chứng khoán/BĐS/Tiện ích/Bán lẻ/CNTT-DV/Sản xuất-default) theo guide §2.4; fallback "mixed sector" cho tập đoàn.

### 4.5 AI payload + prompt
- `build_bctc_payload(symbol)`: **chỉ** KPI đã tính + ngưỡng + Δ + flags (KHÔNG gửi line item thô) → đảm bảo determinism.
- Prompt markdown mới `backend/docs/ai/bctc-memo.md` (memo tổng 200–250 từ) + `bctc-module.md` (commentary từng module 60–150 từ), theo cấu trúc 5 phần của guide (Mục đích / Input / Cách tính / AI phân tích gì / Ví dụ output).
- **Post-flight guard** (regex/rule trên output): chặn số không có trong payload (chống bịa số), chặn "Mua/Bán/Giữ", chặn từ mơ hồ theo danh sách. Output vi phạm → loại & retry/giảm cấp về "không có nhận định".

### 4.6 Endpoint
- `GET /api/v1/market-data/bctc/{symbol}` → `{ template, sector, snapshot[], modules[], forensic{}, valuation{}, flags[], meta }`. **Miễn phí** (số đã tính).
- `GET /api/v1/ai/bctc/{symbol}` (memo) + `GET /api/v1/ai/bctc/{symbol}/module/{moduleId}` → **gate `PremiumUser`** như các route AI hiện có; cache `REDIS_TTL_AI_*`.

### 4.7 Caching & hiệu năng
- KPI cache TTL theo quý (làm mới khi có kỳ mới). AI gọi song song nhiều module + cache để kiểm soát chi phí/độ trễ (vì 1 model, 8+ commentary/mã).

## 5. Frontend — làm giàu tab "Tài chính"

### 5.1 Điểm gắn
- Trong [stock-financials.tsx](../../src/components/stock/stock-financials.tsx), thêm nhóm sub-view **"Phân tích"** (mặc định) và **"Số liệu thô"** (KQKD/CDKT/LCTT/Chỉ số hiện tại). Không đụng routing [stock.tsx](../../src/pages/stock.tsx) (vẫn `activeTab === "financials"`).

### 5.2 Ngôn ngữ hình ảnh (editorial-in-dark)
- Thêm 1 token font serif hiển thị (tiêu đề module/ticker); đánh số lớp ①–⑤; AI memo có accent trái; **map toàn bộ sang token OKLCH dark IQX** (`bg-card`, `text-foreground`, `border-border`...).
- 5 màu trạng thái tài chính tái dùng cho ngưỡng: emerald=tốt/xanh, red=xấu/đỏ, amber=cảnh báo/vàng (giữ nguyên fuchsia/cyan cho trần/sàn ở chỗ khác). Số dùng `tabular-nums` + Tahoma.
- Lưu ý: `features/market` và AI charts hiện hard-code slate/cyan — khi build trong khu vực nào thì theo quy ước khu vực đó.

### 5.3 Component theo lớp (`dashboard/src/components/bctc/`)
- Lớp ①: `snapshot-grid.tsx` (6 ô KPI + badge ngưỡng + sparkline SVG).
- Lớp ②: `ai-memo.tsx` (memo có accent, trạng thái loading/premium).
- Lớp ③ (A): `common-size.tsx`, `dupont-chain.tsx` (SVG chuỗi 5 bước + attribution bars), `working-capital-cycle.tsx` (SVG segmented bar DSO/DIO/DPO/CCC), `cashflow-bridge.tsx` (waterfall), `forensic-trinity.tsx` (3 scorecard), `subsector-spotlight.tsx`, `football-field.tsx` (SVG).
- Lớp ③ (B): `bank-toi-mix.tsx`, `bank-nim-decomp.tsx`, `bank-ppop-cor.tsx`, `bank-dupont.tsx`, `bank-blind-spots.tsx`.
- Lớp ④: `forensic-panel.tsx` (2 cột xanh/đỏ, rule-based).
- Lớp ⑤: `valuation-summary.tsx` (bảng + football field / justified P/B + ma trận NIM×CoR cho bank).
- Biểu đồ: recharts cho bar/line; SVG thuần cho DuPont chain / WCC / football field (theo prototype).

### 5.4 Render theo template & premium
- Template A vs B chia sẻ khung Snapshot/Memo/Forensic Panel; khác bộ module + accent + blind-spots box.
- Bọc [PremiumGate](../../src/components/premium/premium-gate.tsx) quanh: AI Memo, AI per-module, Forensic Trinity, Định giá, Sub-sector. **Miễn phí** gồm: bảng thô, Snapshot cơ bản, Forensic Panel rule-based, và **phần số/biểu đồ** của các module toán-thuần Phase 1 (Common-Size, Chu kỳ VLĐ, Cầu nối dòng tiền). Với các module miễn phí này, **chỉ AI commentary bị gate**, dữ liệu/biểu đồ vẫn hiển thị.

## 6. Bản đồ Module ↔ Dữ liệu ↔ Khả thi

| Lớp / Module | Template | Dữ liệu | Khả thi |
|---|---|---|---|
| ① Snapshot 6 KPI | A & B | 3 BCTC | **Cao** |
| ② AI Memo tổng | A & B | KPI đã tính | Trung (prompt + guard) |
| ③ Common-Size, Chu kỳ VLĐ, Cầu nối dòng tiền | A | 3 BCTC | **Cao** (toán thuần) |
| ③ DuPont 5 bước, Forensic Trinity | A | 3 BCTC | **Cao** |
| ③ Sub-sector Spotlight | A | line items | Trung (heuristic 7 ngành) |
| ③ TOI Mix, NIM Decomp, PPOP/CoR, Bank DuPont | B | `isb*` | Trung (schema riêng) |
| ④ Forensic Panel (rule-based) | A & B | KPI | **Cao** (không cần AI) |
| ⑤ Football Field | A | + giá lịch sử, β | **Thấp** (Phase 4, rút gọn) |
| ⑤ Justified P/B + ma trận NIM×CoR | B | ROE/Ke/g | Trung |
| Blind-spots (NPL nhóm, CASA, CAR) | B | *không có* | Upsell (ngoài phạm vi tính) |

## 7. AI & hợp đồng deterministic
- Payload chỉ KPI đã tính (không line item thô). Memo 200–250 từ; module 60–150 từ.
- Post-flight guard bắt buộc: không số bịa, không khuyến nghị Mua/Bán/Giữ, không từ mơ hồ.
- Gọi song song + cache theo quý để kiểm soát chi phí/độ trễ với 1 model.

## 8. Validation & edge cases
- Identity tolerances như §4.3. "N/M" cho P/E khi lỗ & ROE khi vốn CSH âm. Niêm yết <5 năm: tính trên số năm có sẵn. Outlier YoY>200% gắn badge "cần review". Thiếu field: hiện cấu trúc + N/A (không ẩn module). Một nguồn VCI → không cross-validate được (ghi nhận, không block).

## 9. Luồng dữ liệu
- `GET /api/v1/market-data/bctc/{symbol}` → toàn bộ KPI + flags (sub-view "Phân tích").
- `GET /api/v1/market-data/fundamentals/{symbol}/{report}?term_type=&page_size=` → bảng thô (giữ nguyên, dùng cho "Số liệu thô").
- `GET /api/v1/ai/bctc/{symbol}` + `/module/{id}` → commentary (premium).
- `GET /api/v1/market-data/company/{symbol}/overview` → `is_bank`, tên/sàn, market cap, shares.

## 10. Xử lý lỗi
- Từng lớp độc lập: một sub-API/một module lỗi không làm sập dashboard (hiển thị trạng thái rỗng/lỗi tiếng Việt như pattern hiện có).
- AI lỗi/guard chặn → ẩn riêng phần commentary, phần số vẫn hiển thị.
- KPI thiếu input → "N/A" + flag, không throw.

## 11. Kiểm thử / Nghiệm thu
- **Backend `pytest`:** KPI engine đối chiếu **số vàng từ prototype FPT (Template A) & VCB (Template B)**; validation harness chạy rổ 30–50 mã đa ngành (gồm ngân hàng); test độ phủ FieldCode map (mọi concept đều resolve, hoặc báo thiếu).
- **Frontend:** component test với payload mock (đủ / thiếu field / flags), build sạch `cd dashboard && npm run build`.
- **AI:** test hình dạng output + post-flight guard (số bịa bị loại, không có Mua/Bán/Giữ).
- **Nghiệm thu Phase 1:** mở tab Tài chính một mã phi-ngân hàng và một ngân hàng → sub-view "Phân tích" hiện Snapshot 6 KPI có ngưỡng + Forensic Panel + 3 module/template, số khớp prototype/nguồn, không AI, không vỡ với mã thiếu dữ liệu.

## 12. Roadmap (capability-layered, A+B song song)

### Phase 0 — Spike & de-risk (≈1 tuần) — chi tiết
Mục tiêu: khóa rủi ro FieldCode trước khi đụng UI.
- Dựng `bctc_map_nonbank` + `bctc_map_bank` (bản đầu).
- Validation harness (BS/CF identity, sanity) chạy rổ 30–50 mã đa ngành.
- Báo cáo: KPI nào tính sạch / field nào thiếu hoặc lệch nhãn theo mã.
- **Verify** có lấy được giá lịch sử 5 năm + β cho định giá (quyết định Phase 4 đầy đủ hay rút gọn).
- Copy guide + 2 prototype vào repo (vd `dashboard/docs/specs/bctc-guide/`) để version-control công thức nguồn.

### Phase 1 — MVP không-AI (≈2–3 tuần) — chi tiết
- Endpoint `GET /market-data/bctc/{symbol}` (snapshot + modules số + forensic + flags).
- Sector Router (A/B) bằng `is_bank` + chữ ký dòng.
- Lớp ① Snapshot: A 6 KPI (Tăng DT, Biên gộp, ROE, Net Debt/EBITDA, Biên FCF, Altman Z′) + B 6 KPI (NIM, ROE, LDR, VCSH/TS, LLR, CIR), có ngưỡng + sparkline.
- 3 module toán-thuần/template — A: Common-Size, Chu kỳ VLĐ, Cầu nối dòng tiền; B: TOI Mix, NIM Decomp, PPOP/CoR.
- Lớp ④ Forensic Panel **rule-based** (không AI).
- Chuẩn hóa model ratio dùng chung (dedupe 3 chỗ).
- Skin editorial-in-dark + gắn vào tab Tài chính (sub-view "Phân tích"/"Số liệu thô").

### Phase 2 — Lớp AI (≈2–3 tuần)
- `build_bctc_payload` + prompt + post-flight guard; AI Memo tổng + commentary từng module; DuPont 5 bước + Forensic Trinity (A); gating premium các lớp AI.

### Phase 3 — Hoàn thiện module sâu (≈2–3 tuần)
- Đủ bộ module còn lại 2 template (Bank DuPont, các module bank còn thiếu, Sub-sector cơ bản); Bank Forensic Panel + blind-spots box.

### Phase 4 — Định giá + Sub-sector + polish (≈2–3 tuần)
- Football Field (RIM + P/E band trước; thêm DCF/Book nếu Phase 0 xác nhận giá+β); Bank Justified P/B + ma trận NIM×CoR; Sub-sector Spotlight đầy đủ 7 nhóm; TTM, export/print, badge "restated".

## 13. Phân tầng premium

| Miễn phí | Premium (`PremiumGate`) |
|---|---|
| Bảng thô KQKD/CDKT/LCTT/Chỉ số | AI Memo tổng + AI từng module |
| Snapshot 6 KPI + ngưỡng | Forensic Trinity (Altman/Piotroski/Beneish) |
| Forensic Panel (xanh/đỏ rule-based) | Định giá (Football Field / Justified P/B) |
| Common-Size, Chu kỳ VLĐ cơ bản | Sub-sector Spotlight, Blind-spots ngân hàng |

> Với module miễn phí (Common-Size, Chu kỳ VLĐ, Cầu nối dòng tiền): dữ liệu + biểu đồ miễn phí, **AI commentary của module bị gate** cùng các lớp AI khác.

## 14. Ngoài phạm vi
- Lưu trữ point-in-time/DB cho BCTC (vẫn live-proxy + cache).
- Nguồn dữ liệu thứ hai để cross-validate (>1% divergence theo guide) — không có nguồn thứ hai.
- Tính NPL theo 5 nhóm / CASA / CAR (cần thuyết minh — ngoài 3 báo cáo thuần số) → để dạng blind-spots upsell.
- Refactor cửa sổ kéo–thả/AI Insight.

## 15. Rủi ro & lưu ý
- **FieldCode map sai/thiếu (rủi ro #1):** VCI dùng mã riêng, không phải TT200/TT22 trong guide → mọi công thức phải neo lại & validate. Giảm thiểu: Phase 0 spike + harness.
- **Một nguồn VCI, không DB persistence:** toàn bộ phụ thuộc uptime VCI; không cross-validate được.
- **Ratio backend hiện chỉ pass-through** (chỉ revenue/net_profit/eps/bvps/growth/pb/market_cap được tổng hợp) → KPI engine phải tính từ line item, không tin field ratio.
- **Giá lịch sử + β cho định giá:** chưa xác nhận có trong endpoint tài chính → Module 8 có thể cần nguồn giá riêng hoặc bản rút gọn (RIM + P/E band).
- **AI bịa số / 1 model:** bắt buộc post-flight guard; kiểm soát chi phí qua cache + song song.
- **Scope creep (A+B × 16 module × AI):** phasing capability-layered + MVP không-AI làm trước là biện pháp chính.
- **A+B song song** (theo lựa chọn người dùng): ~gấp đôi công sử map + module so với làm A trước; chấp nhận để đạt parity sớm, bù lại engine/khung dùng chung tối đa.

## 16. Nguồn tham chiếu
- Guide & prototype: `~/Downloads/BCTC/` (sẽ copy vào repo ở Phase 0).
- Phân tích 8-agent (gap analysis, feature inventory, feasibility): kết quả workflow `bctc-feature-analysis` (run `wf_146dfa93-c0c`), output tại `.../tasks/wn7ipg9pz.output`.
- Spec hiện trạng tham chiếu định dạng: [2026-06-02-du-bao-window-redesign-design.md](2026-06-02-du-bao-window-redesign-design.md).
