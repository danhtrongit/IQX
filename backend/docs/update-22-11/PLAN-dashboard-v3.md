# PLAN · Dashboard phân tích v3

> Spec: `IQX-Dashboard-Phan-Tich-SPEC-v3.md` (gọi tắt **S**). Bản mẫu: `IQX-Dashboard-Phan-Tich-v3-MAU.html` (**MAU**).
> Đi cùng: `IQX-Hoc-Vien-SPEC-v5.md` §5–§7 (**HV**). Kế hoạch Học viện v5 do architect khác lập.
> Ngày lập: 2026-11-22. Loại việc: architecture, priority 3. Migration được cấp: **0065–0067** (dùng 0065).
> Thư mục cấm quét: `node_modules/`, `dist/`, `mobile/`. Không sửa mobile.

## 1. Hiện trạng (Dashboard v2, LIVE từ 2026-11-04)

| Lớp | File | Vai trò hiện tại |
|---|---|---|
| Ngành = mẫu BCTC | `backend/src/modules/financials/financials.industry.ts` | `detectIndustry()` từ dòng KQKD của VCI: `thuong · nh · ck · bh`. **Dùng chung** với Bộ lọc (`screener.statements.ts`, `screener.definition.ts`) và job `symbol-attributes` (cột `symbols.statement_template`, CHECK 4 giá trị). **Không được đổi kiểu `Industry`.** |
| Danh mục | `backend/src/modules/dashboard/dashboard.catalog.ts` | 62 chỉ tiêu, tên duy nhất toàn cục; mỗi chỉ tiêu một `scope` (chung hoặc 1 ngành); `metric_id` (công thức) và `metric_key` (khoá bài học) đã tách trường nhưng đang bằng nhau. |
| Ánh xạ khoản mục | `dashboard.mapping.ts` | Khoản mục chuẩn của Bộ lọc (`screener.statements.ts` `CONCEPT_FIELDS`) + khoản mục riêng `nh_*`, `ck_*`, `bh_*`; ghi đè `revenue` theo mẫu. |
| Công thức | `dashboard.series.ts` (registry Bộ lọc, 33 chỉ tiêu) · `dashboard.native.ts` (29 chỉ tiêu ngành) | Tính **ở backend**; cửa sổ `DashboardWindow` (`point/flow/end/start/previous`), năm = cộng 4 quý (`annualStatements`). |
| API | `dashboard.controller.ts`, `dashboard.service.ts`, `dashboard.schemas.ts` | `GET /api/v2/dashboard/settings`, `PUT /api/v2/dashboard/settings/:nganh`, `GET /api/v2/dashboard/catalog`, `GET /api/v2/dashboard/industry/:symbol`, `GET /api/v2/fundamental/:symbol`, `GET /api/v2/valuation/:symbol` (định giá theo ngày = registry `evaluateScreenerMetric` trên báo cáo đã công bố). |
| Lưu thiết lập | `dashboard.repository.ts`, migrations `0029`, `0036` | Bảng `dashboard_settings (user_id, nganh)` PK, CHECK `nganh IN ('thuong','nh','ck','bh')`, theo tài khoản trên server. |
| Nguồn số | VCI IQ `/v1/company/{sym}/financial-statement?section=` | Cả 3 báo cáo, 35 quý; giá từ `MarketDataService.ohlcv`. |
| Renderer chung | `frontend/src/components/fundamental-charts/*` | `FundamentalChart({chart})`, `FundamentalChartData` = `{name, kind, unit, decimals?, labels, main, sub?, mainUnit?, hero?, ref?, legendNote?}`. **Đã được Học viện dùng** (`frontend/src/pages/academy/charts/lesson-chart.tsx`). |
| UI | `frontend/src/pages/demo-trading/analysis/*` (`dashboard.tsx`, `chart-picker.tsx`, `chart-card.tsx`, `model.ts`, `api.ts`, `use-dashboard.ts`, `learn-link.tsx`) | Dữ liệu điều khiển bởi catalog; `INDUSTRIES`/`INDUSTRY_LABEL` hard-code 4 ngành; nút Học → `/academy?metric=<metric_key>`. |
| Nút Học (phía Học viện) | `frontend/src/pages/demo-trading/academy-redirect.tsx`, `workspace-url.ts`, `frontend/src/pages/academy/deep-link.ts`, backend `GET /api/v2/academy/link` | Resolve `metric` → bài. **Thuộc Học viện v5**, workstream này không sửa. |
| Test | `backend/test/unit/dashboard*.test.ts` (4 file), `frontend/src/pages/demo-trading/analysis/analysis-dashboard.test.tsx`, `frontend/e2e/fundamental-charts-390.spec.ts` | |

## 2. Gap so với spec v3

| # | Spec | Gap | Task |
|---|---|---|---|
| G1 | §1.3 9 ngành | Chỉ có 4 (mẫu BCTC); chưa có dữ liệu ICB theo mã ở backend dashboard | T1 |
| G2 | §3.2, §8 | Danh mục phải theo **cặp (ngành, tên)**: 90 tên, 260 cặp; nhóm cấp 2 đổi tên ở ck/bh; chỉ tiêu dạy lại rời khỏi "Chỉ tiêu chung" | T1 |
| G3 | §8.3–§8.10 | 28 chỉ tiêu mới + 3 biến thể công thức (ROE 2 đường, Biên ròng bảo hiểm, Biên gộp quý) | T2 |
| G4 | §7 | Thiếu khoản mục mẫu doanh nghiệp: 132/212, 136/216, 141, 149, 220, 230, 242, 312/332, 318/336, 339, B02-21/22/24/25/26/40, B03-14, B03-36 | T2 |
| G5 | §7, §10 | BCLCTT phương pháp trực tiếp: hiện VCI trả `cfa2 = 0` → EBITDA tính sai (khấu hao 0) thay vì để trống | T2 |
| G6 | §6 | Settings 9 ngành: CHECK DB, schema zod, defaults 9 ngành | T1 |
| G7 | §4.3 | Nút Học phải gửi `nganh` | T4 (phát), Học viện (nhận) |
| G8 | §9, §10 | Renderer: "Mốc 1,00"; mốc 0 cho khuôn B/C khi có số âm; đơn vị "năm" 1 chữ số; tắt "Bảng số" cho Học viện | T3 |
| G9 | §12 | Test nghiệm thu 11 mục | T1–T5 |

## 3. Quyết định

| # | Quyết định |
|---|---|
| D1 | Hai khái niệm tách bạch: **`Industry` (mẫu BCTC, 4 giá trị) giữ nguyên** cho Bộ lọc và DB `statement_template`; thêm **`Nganh` (9 giá trị)** chỉ trong module dashboard: `backend/src/modules/dashboard/dashboard.nganh.ts`. API dashboard trả `nganh` 9 giá trị. |
| D2 | §1.3 bước 2 dùng **mã ICB của VCI** (không dùng tên): `GET https://iq.vietcap.com.vn/api/iq-insight-service/v2/company/search-bar?language=1` trả cho ~2.123 mã `icbLv1..icbLv4 {code,name}` trong **một lần gọi**. Cache trong bộ nhớ 12 giờ, giữ bản cũ khi lỗi (stale-on-error). Dự phòng từng mã: `/v1/company/{sym}` (có `icbCodeLv2`, `icbCodeLv4`). Không có ICB → `thuong` (§13.1). **Không tạo bảng/cột ICB mới** (spec cấm bảng ngoại lệ; dữ liệu là cache nguồn). |
| D3 | Ưu tiên: mẫu BCTC trước (`nh/ck/bh`, gồm công ty tài chính như EVF → `nh`, §13.2), rồi bảng ICB §4 cho mẫu doanh nghiệp. |
| D4 | §13.3 EBITDA: **giữ hai định nghĩa như spec/MAU**. EBITDA (Net Debt/EBITDA, EV/EBITDA) = LNTT + CP lãi vay + Khấu hao (+ phân bổ lợi thế thương mại `cfa103` như registry v2, không đổi để khớp Bộ lọc). EBITDA trong **Biên EBITDA** = LN kinh doanh chính + Khấu hao. |
| D5 | Nợ vay gồm **339 (trái phiếu chuyển đổi, `bsa173`) chỉ cho 5 ngành mới** (`bds dk bl dien vl`) bằng ghi đè `lt_debt = bsa71 + bsa173` trong field map của dashboard. `thuong` giữ đúng v2/Bộ lọc (`bsa56 + bsa71`). |
| D6 | Phương pháp trực tiếp (đã xác minh trên dữ liệu thật ANV, DBD 2024Q2, STK 2025Q2): kỳ có `cfa1 = 0` **và** `cfa2 = 0` **và** `cfa18 ≠ 0` ⇒ xoá `depreciation`, `goodwill_amortization` khỏi kỳ đó; lãi vay đã trả lấy `cfa42` (dòng 04 trực tiếp, VCI để ở `cfa39..cfa45`), `cfa42 = 0` thì để trống. Xoá giá trị làm `flowSum`/`annualStatements` ra null ⇒ mọi cửa sổ 4 quý chứa kỳ đó và năm đó để trống (§12.9). Áp cho **mọi mẫu doanh nghiệp** trong dashboard (kể cả `thuong`: ND/EBITDA, EV/EBITDA). Bộ lọc không đổi. |
| D7 | `metric_id` (công thức) ≠ `metric_key` (bài học) ở 3 biến thể: `roe_fin`→`roe`, `net_margin_bh`→`net_margin`, `gross_margin_q`→`gross_margin`. Học viện tìm bài theo `(metric_key, nganh)`. |
| D8 | Tỷ lệ chi trả cổ tức: LNST = **LNST cổ đông công ty mẹ** (`isa22`, cùng cơ sở với EPS/ROE). Cổ tức đã trả `cfa32` đảo dấu. |
| D9 | Không cần chuyển dữ liệu settings: tập tên của `thuong/nh/ck/bh` ở v3 **trùng đúng** tập tên v2 (dạy lại chỉ đổi nhóm). 5 ngành mới chưa có dòng → trả bộ mặc định. Migration 0065 chỉ nới CHECK. |
| D10 | Giữ đường dẫn API `/api/v2/...` hiện có (spec §11 chỉ là gợi ý). Nút Học phát `/academy?metric=<metric_key>&nganh=<nganh>`. |
| D11 | Đơn vị "năm": 1 chữ số cho khuôn A/B/C/F (Số năm bán hết tồn kho); khuôn E2 (Profit/FCF Positive Streak) vẫn hiện số nguyên. |
| D12 | Nhãn mốc: đơn vị "lần" → 2 chữ số ("Mốc 1,00"); "%" giữ như v2 ("Mốc 100%"). Mốc 0: khuôn A, B, C vẽ đường 0 khi trục có số âm. |

## 4. Bảng ánh xạ ngành (cấu hình hệ thống, `dashboard.nganh.ts`)

Mẫu BCTC trước: `nh` / `ck` / `bh` từ `detectIndustry`. Mẫu doanh nghiệp: xét ICB cấp 4 trước, rồi cấp 2.

| Ưu tiên | Mã ICB (VCI) | Tên VCI | Mã ngành |
|---|---|---|---|
| L4 | `7573` | Phân phối xăng dầu & khí đốt (GAS) | `dk` |
| L4 | `2353` | Vật liệu xây dựng & Nội thất (xi măng) | `vl` |
| L2 | `8600` | Bất động sản (8633, 8637; gồm KCN như KBC) | `bds` |
| L2 | `0500` | Dầu khí (0533 PLX, 0573 PVS) | `dk` |
| L2 | `5300` · `3500` · `3700` | Bán lẻ · Thực phẩm và đồ uống · Hàng cá nhân & Gia dụng | `bl` |
| L2 | `7500` (trừ 7573) | Điện, nước & khí đốt (7535, 7575, 7577) | `dien` |
| L2 | `1700` · `1300` | Tài nguyên cơ bản · Hoá chất (gồm phân bón DPM) | `vl` |
| — | còn lại (2357 Xây dựng, 2700, 3300, 4500, 5500, 5700, 6500, 9500, 8700 mẫu DN…) hoặc không có ICB | | `thuong` |

Đã đối chiếu 21 mã thử trên dữ liệu VCI thật (2026-11-22): FPT 9537, CTD 2357 → thuong; VHM/NLG/KBC 8633 → bds; GAS 7573, PVS 0573, PLX 0533 → dk; MWG 5379, PNJ 3767, VNM 3577 → bl; POW/REE 7535 → dien; HPG 1757, DPM 1357 → vl; VCB/MBB/SSI/VND/BVH/PVI theo mẫu; EVF 8773 mẫu TCTD → nh. Khớp hết bảng §0 của S.

Chương Học viện theo ngành: chung 8, thuong 9, nh 10, ck 11, bh 12, bds 13, dk 14, bl 15, dien 16, vl 17.

## 5. Ánh xạ khoản mục mẫu doanh nghiệp (TT200 → trường VCI, đã xác minh bằng `/financial-statement/metrics` của HPG và số liệu VHM, KBC)

| Mã TT200 | Trường VCI | Khoản mục mới (`dn_*`, kind) | Ghi chú |
|---|---|---|---|
| B01-110 / 120 | `bsa2` / `bsa5` | dùng `cash`, `st_investments` sẵn có | |
| B01-131 | `bsa9` | dùng `receivables` sẵn có | |
| B01-132 / 212 | `bsa10` / `bsa161` | `dn_supplier_prepay` balance | |
| B01-136 / 216 | `bsa13` / `bsa27` | `dn_other_receivables` balance | |
| B01-141 / 149 | `bsa16` / `bsa17` | `dn_inventory_gross`, `dn_inventory_provision` (negate) balance | |
| B01-140 | `bsa15` | dùng `inventory` | |
| B01-220 | `bsa29` | `dn_fixed_assets` balance | |
| B01-230 | `bsa40` | `dn_investment_property` balance | |
| B01-242 | `bsa188` + `bsa39` (trước 2015) | `dn_cip` balance | |
| B01-270 / 410 | `bsa53` / `bsa78` | `total_assets`, `equity` | |
| B01-311 | `bsa57` | `payables` | |
| B01-312 / 332 | `bsa58` / `bsa170` | `dn_buyer_prepay` balance | |
| B01-318 / 336 | `bsa167` / `bsa76` | `dn_unearned_revenue` balance | |
| B01-320 / 338 / 339 | `bsa56` / `bsa71` / `bsa173` | `st_debt`, `lt_debt` (+`bsa173` ở 5 ngành mới, D5) | |
| B02-21 | `isa6` | `dn_fin_income` flow | |
| B02-22 / 23 | `isa7` (negate) / `isa8` | `dn_fin_expense` flow; `interest_expense` có sẵn | |
| B02-24 | `isa102` + `isa15` | `dn_jv_profit` flow | isa15 = 0 từ 2015 |
| B02-25 / 26 | `isa9` / `isa10` (negate) | `dn_selling_exp`, `dn_admin_exp` flow | |
| B02-40 | `isa14` | `dn_other_profit` flow | |
| B02-10/11/20/50 | `isa3/isa4/isa5/isa16` | `revenue/cogs/gross_profit/pbt` | |
| B03-02 | `cfa2` | `depreciation` (D6) | |
| B03-14 | `cfa14` (negate); trực tiếp: `cfa42` (negate) | `dn_interest_paid` flow | D6 |
| B03-21 | `cfa19` | `capex` | |
| B03-36 | `cfa32` (negate) | `dn_dividends_paid` flow | |

**Không có trường nào thiếu ở nguồn.** Lưu ý: `cfa42` (lãi vay trả, PP trực tiếp) có ở ANV 2025Q1/2026Q1 nhưng có kỳ trực tiếp VCI để mọi dòng 0 (ANV 2025Q2) → để trống theo §10.

## 6. Danh mục chỉ tiêu

### 6.1 Tập theo ngành (khớp `SEC` của MAU dòng 343, dùng nguyên thứ tự nhóm và tên)

"Chỉ tiêu chung" của ngành = 17 chỉ tiêu chung **trừ** chỉ tiêu ngành dạy lại:

| Ngành | Bỏ khỏi "Chỉ tiêu chung" | Chung · Ngành · N |
|---|---|---|
| thuong | — | 17 · 16 · 33 |
| nh | Tăng trưởng doanh thu, ROE, ROA, P/B | 13 · 15 · 28 |
| ck | Tăng trưởng doanh thu, Margin Stability, ROE, P/B | 13 · 14 · 27 |
| bh | Biên lợi nhuận ròng, ROE, P/B | 14 · 11 · 25 |
| bds | Tăng trưởng doanh thu, Revenue Growth Stability, P/E, P/B | 13 · 19 · 32 |
| dk | Tăng trưởng doanh thu, Margin Stability, P/E | 14 · 15 · 29 |
| bl | Tăng trưởng doanh thu, P/E | 15 · 13 · 28 |
| dien | Tăng trưởng doanh thu, Margin Stability | 15 · 15 · 30 |
| vl | Tăng trưởng doanh thu, Margin Stability, P/B | 14 · 14 · 28 |

Tổng 260 cặp, 90 tên khác nhau. Đổi tên nhóm cấp 2: ck "Đòn bẩy" → **"Chi phí, đòn bẩy và hiệu quả"** (chứa cả "Chi phí hoạt động / Doanh thu hoạt động"); bh "Đầu tư" → **"Đầu tư và lợi nhuận"**. Bộ mặc định 6 biểu đồ: đúng §6.3 (= `DEFS` của MAU).

### 6.2 Biến thể công thức của chỉ tiêu dạy lại (metric_key giữ nguyên)

| metric_id → metric_key | Ngành | Khuôn | Đường chính | Cột |
|---|---|---|---|---|
| `roe_fin` → `roe` | nh, ck, bh | B, 2 đường | ROE 4 quý (registry `roe`) · ROA 4 quý (registry `roa`) | Tổng tài sản BQ / VCSH BQ, **lần**, grouped |
| `net_margin_bh` → `net_margin` | bh | B | LNST / Phí BH thuần 4 quý (= registry `net_margin` với revenue `isi105`) | `bh_underwriting_profit` + `bh_investment_profit` 4 quý, grouped |
| `gross_margin_q` → `gross_margin` | dk, vl | B | Quý: `point(gross_profit)/point(revenue)`, tên "Biên gộp quý"; Năm: như SX | stacked Giá vốn quý + LN gộp quý (Năm: năm) |

Mọi chỉ tiêu dạy lại khác dùng đúng công thức chung/SX/v2 (trên field map của ngành, D5–D6).

### 6.3 28 chỉ tiêu mới (native, `dashboard.native.ts`)

Ký hiệu: Σ = 4 quý (Năm: cả năm), BQ = bình quân cuối kỳ và cùng kỳ năm trước, end = cuối kỳ. Mẫu số ≤ 0 → trống (`ratio()` sẵn có). Tên đường/cột lấy đúng MAU (§9 cuối file).

| metric_key | Tên | Ngành | Đơn vị · mốc | Công thức (khoản mục §5) | Cột (sub) |
|---|---|---|---|---|---|
| `non_core_profit_to_pbt` | Lợi nhuận ngoài kinh doanh bất động sản / LNTT | bds | % | Σ(dn_fin_income + dn_jv_profit + dn_other_profit) / Σpbt | grouped: thu nhập ngoài KD Σ, LNTT Σ |
| `buyer_prepay_to_revenue` | Người mua trả tiền trước / Doanh thu | bds, dk | lần | end dn_buyer_prepay / Σrevenue | grouped |
| `buyer_prepay_growth` | Tăng trưởng người mua trả tiền trước | bds | % (khuôn A) | end / end năm trước − 1; gốc = 0 → trống | grouped cuối kỳ, cùng kỳ |
| `unearned_to_equity` | Doanh thu chưa thực hiện / VCSH | bds | % | end dn_unearned_revenue / end equity | grouped |
| `inventory_to_assets` | Tồn kho / Tổng tài sản | bds | % | inventory / total_assets | grouped |
| `inventory_years` | Số năm bán hết tồn kho | bds | **năm** (1 chữ số) | end inventory / Σcogs | grouped |
| `investment_property_share` | Tỷ trọng bất động sản đầu tư | bds | % | (dn_investment_property + dn_cip) / total_assets | stacked |
| `prepay_receivables_to_equity` | Phải thu và trả trước / VCSH | bds | % | (dn_supplier_prepay + dn_other_receivables) / equity | stacked |
| `st_debt_share` | Tỷ trọng nợ vay ngắn hạn | bds | % | st_debt / (st_debt + lt_debt) | stacked |
| `cash_to_st_debt` | Tiền / Nợ vay ngắn hạn | bds | lần · **ref 1** | (cash + st_investments) / st_debt | grouped |
| `interest_paid_to_expense` | Lãi vay đã trả / Chi phí lãi vay | bds | lần · **ref 1** | Σdn_interest_paid / Σinterest_expense | grouped |
| `inventory_days` | Số ngày tồn kho | dk, bl, vl | ngày | BQ inventory / Σcogs × 365 | grouped |
| `depreciation_to_revenue` | Khấu hao / Doanh thu | dk, dien | % | Σdepreciation / Σrevenue | grouped (1 cột) |
| `capex_to_depreciation` | Capex / Khấu hao | dk, dien, vl | lần · **ref 1** | Σcapex / Σdepreciation | grouped |
| `net_cash_to_equity` | Tiền ròng / VCSH | dk | % (được âm, mốc 0) | (cash + st_investments − st_debt − lt_debt) / equity | grouped |
| `fin_income_to_pbt` | Thu nhập tài chính / LNTT | dk | % | Σdn_fin_income / Σpbt | grouped |
| `dividend_payout` | Tỷ lệ chi trả cổ tức | dk, bl, dien | % | Σdn_dividends_paid / `previous`.Σnpat_parent (D8) | grouped |
| `sga_to_revenue` | Chi phí bán hàng và quản lý / Doanh thu | bl | % | Σ(dn_selling_exp + dn_admin_exp) / Σrevenue | stacked |
| `core_margin` | Biên lợi nhuận kinh doanh chính | bl | % | Σ(gross_profit − selling − admin) / Σrevenue | grouped (1 cột) |
| `inventory_provision_ratio` | Dự phòng giảm giá tồn kho / Tồn kho | bl, vl | % | \|dn_inventory_provision\| / dn_inventory_gross | grouped (1 cột) |
| `payables_to_inventory` | Phải trả người bán / Tồn kho | bl | lần · **ref 1** | payables / inventory | grouped |
| `st_debt_to_inventory` | Vay ngắn hạn / Tồn kho | bl, vl | lần | st_debt / inventory | grouped |
| `revenue_to_fixed_assets` | Doanh thu / Tài sản cố định | bl | lần | Σrevenue / BQ dn_fixed_assets | grouped |
| `ebitda_margin` | Biên EBITDA | dien, vl | % | Σ(core profit + depreciation) / Σrevenue (D4) | stacked |
| `fixed_assets_to_assets` | Tài sản cố định / Tổng tài sản | dien | % | dn_fixed_assets / total_assets | grouped |
| `cip_to_fixed_assets` | Xây dựng dở dang / Tài sản cố định | dien, vl | % | dn_cip / dn_fixed_assets | grouped |
| `receivable_days` | Số ngày thu tiền | dien | ngày | BQ receivables / Σrevenue × 365 | grouped |
| `non_interest_fin_cost_to_pbt` | Chi phí tài chính ngoài lãi vay / LNTT | dien, vl | % | Σ(dn_fin_expense − interest_expense) / Σpbt | grouped |

Khấu hao thiếu (D6) ⇒ trống: `depreciation_to_revenue`, `capex_to_depreciation`, `ebitda_margin`, Net Debt/EBITDA, EV/EBITDA. Được âm: `net_cash_to_equity`, Net Debt/EBITDA. Năm: số dư lấy cuối năm, dòng chảy cộng năm, chỉ năm đủ 4 quý (`annualStatements` đã làm; khoản mục `dn_*` phải khai `kind`).

**28 `metric_key` mới là hợp đồng với Học viện v5** (HV §5.1 khoá bài `(metric_key, nganh)`): nội dung bài của 41 bài mới + 46 bài dạy lại phải dùng đúng các khoá trên và 62 khoá v2 (`roe`, `revenue_yoy`, …). Không dùng `payout_ratio` (id registry Bộ lọc khác nghĩa).

## 7. API và DB

- **Migration `backend/migrations/0065_dashboard_settings_nganh_v3.sql`** (idempotent): `DROP CONSTRAINT IF EXISTS ck_dashboard_settings_nganh`; `ADD CONSTRAINT … CHECK (nganh IN ('thuong','nh','ck','bh','bds','dk','bl','dien','vl'))`. Cột `varchar(8)` đủ. Không đụng dữ liệu (D9). Tương thích ngược với code v2 ⇒ chạy migration trước khi đổi code.
- `GET /api/v2/dashboard/settings` → object 9 khoá; khoá chưa lưu hoặc dòng có tên ngoài danh mục ngành → bộ mặc định ngành.
- `PUT /api/v2/dashboard/settings/:nganh` → `nganh` ∈ 9; chỉ tiêu ngoài ngành → 400 `CHART_NOT_IN_INDUSTRY`.
- `GET /api/v2/dashboard/catalog` → `industries[9]`, mỗi ngành `{nganh, label, total, default_charts, chapters[2]{chapter, academy_chapter, groups[]{group, items[]{name, metric_key, kind}}}}`.
- `GET /api/v2/dashboard/industry/:symbol` → `{symbol, nganh(9), label, template(4)}` (thêm `template` để debug/hiển thị; không bắt buộc ở UI).
- `GET /api/v2/fundamental/:symbol?charts=&per=` → tra theo **(nganh, tên)**; tên ngoài 90 → 422; tên ngoài ngành → 400. Payload biểu đồ giữ v2 (`name, kind, unit, decimals, status, note?, legend_note?, q?, y?, labels?, main?, mainUnit?, hero?, ref?`).
- `GET /api/v2/valuation/:symbol` → khuôn F của ngành (P/E, P/B, P/S, EV/EBITDA, FCF Yield theo tập của ngành).
- Không thêm endpoint. `GET /api/v2/academy/link?metric&nganh` do Học viện làm.

## 8. Hợp đồng renderer dùng chung (Dashboard sở hữu)

- Đường dẫn: **`frontend/src/components/fundamental-charts/`** (đã có; Học viện import qua `@/components/fundamental-charts`).
- Props (ổn định, chỉ thêm trường tuỳ chọn):
  `FundamentalChart({ chart: FundamentalChartData, showTable?: boolean /* mặc định true; Học viện truyền false (HV §2.4) */ })`
  `FundamentalChartData = { name; kind: "A"|"B"|"C"|"D"|"E1"|"E2"|"F"|"F2"; unit; decimals?; labels: string[]; main: {name; v:(number|null)[]}[] /* ≤2 đường ở A/B */; sub?: {unit; type:"grouped"|"stacked"; series:{name; v}[]}; mainUnit?; hero?; ref?; legendNote? }`
- Đây đúng là đối tượng `{name, kind, unit, labels, main, sub, ref}` của S §9/§11 và HV §5.1: Học viện lưu JSON biểu đồ trong nội dung bài và đưa thẳng vào component; Dashboard đưa phần đã cắt kỳ (`model.ts` `chartView`).
- Quy tắc vẽ v3 nằm trong renderer, không ở nơi gọi: đường 2 màu `--line2` (tối: `#f5d76e`), mốc `ref` nét đứt + chú giải "Mốc 1,00", mốc 0 khi có số âm, "năm" 1 chữ số, kỳ trống đứt đoạn, "—" trong bảng/hộp số.
- Học viện **không** sửa file trong thư mục này; cần thêm gì thì đề nghị Dashboard workstream.

## 9. Nút Học (phối hợp Học viện)

- Dashboard phát: `academyMetricHref(metricKey, nganh)` = `/academy?metric=<metric_key>&nganh=<nganh>` ở cả dòng khung "Biểu đồ" và đầu thẻ (`learn-link.tsx`, `model.ts`). `nganh` = ngành của mã đang xem (9 giá trị, không bao giờ `chung`).
- Học viện nhận (ngoài phạm vi, ghi để đối chiếu): `academy-redirect.tsx`/`workspace-url.ts` giữ tham số `nganh`; `deep-link.ts` gọi `GET /api/v2/academy/link?metric=<key>&nganh=<nganh>`; server tìm chương ngành → Chương 8 → mọi chương (HV §6.2). Ví dụ §12.5: `roe&nganh=nh` → "ROE · ở ngân hàng"; `roe&nganh=thuong` → "ROE" Ch.8; `revenue_yoy&nganh=bds` → "… · ở bất động sản"; `revenue_cagr3&nganh=vl` → Ch.8.

## 10. Phân việc (tập file KHÔNG giao nhau)

### T1 · Backend nền: ngành 9, danh mục 260 cặp, settings, migration — kind `architecture`→ giao `backend`, priority 3

- **Files:** `backend/src/modules/dashboard/dashboard.nganh.ts` (mới) · `dashboard.icb.ts` (mới, `IcbDirectory` cache) · `dashboard.catalog.ts` · `dashboard.schemas.ts` · `dashboard.repository.ts` · `dashboard.service.ts` · `dashboard.controller.ts` · `dashboard.module.ts` · `index.ts` · `backend/src/modules/market-data/providers/vci.provider.ts` (thêm `fetchIcbDirectory()`, `fetchCompanyIcb(symbol)`) · `backend/migrations/0065_dashboard_settings_nganh_v3.sql` · `backend/contracts/**` (regen) · `backend/test/unit/dashboard.test.ts` · `dashboard-public-routes.test.ts` · `backend/test/unit/dashboard-nganh.test.ts` (mới).
- **Steps:**
  1. `dashboard.nganh.ts`: `NGANH = ['thuong','nh','ck','bh','bds','dk','bl','dien','vl']`, nhãn (§1.3 S), chương Học viện 8–17, bảng §4, `nganhOf(template, icb: {lv2?, lv4?} | null)`.
  2. `IcbDirectory`: gọi search-bar một lần, map `symbol → {lv2, lv4}`, TTL 12 h, stale-on-error, single-flight; không có mã → fallback `/v1/company/{sym}`; lỗi → `null` (→ thuong) + `logger.warn`.
  3. Catalog: viết lại theo ngành từ `SEC`/`DEFS` của MAU: mỗi entry `{nganh, chapter('chung'|nganh), group, name, metric_id, metric_key, kind, unit, sub_unit, sub_type, main_unit, ref, registry_id}`; danh sách tên 90 để làm enum zod; `chartFor(nganh, name)`; khai id 28 chỉ tiêu mới + 3 biến thể ở `NATIVE_METRIC_IDS` (T2 viết công thức). Ref = 1 ở 4 chỉ tiêu §6.3; combined ratio 100 giữ.
  4. Đặt kiểu số lẻ: `dashboardDecimals(unit, kind)` 'năm' → 1 trừ E2.
  5. Service: `industry()` trả `nganh` + `template`; `fundamental()/valuation()` tính `nganh` rồi tra chart theo cặp; truyền `{template, nganh}` cho series (chữ ký `buildDashboardChart(spec, context)` với `context.template`, `context.nganh` — T2 dùng).
  6. Settings/schemas/repository: 9 ngành; validate theo tập tên của ngành.
  7. Migration 0065. 8. `npm run contracts:generate` (backend).
  Để T1 build xanh độc lập: 31 id mới (28 + 3 biến thể) khai trong danh sách riêng `PENDING_V3_METRIC_IDS` của catalog, **không** nhập vào `NativeMetricId`; entry có `pending: true` và `dashboard.service.ts` trả biểu đồ trống `status: 'definition_pending'` cho chúng. T1 không sửa `dashboard.native.ts`/`series.ts`/`mapping.ts`.
- **Acceptance (S §12):** 1 (số chỉ tiêu 9 ngành, 90 tên, 260 cặp), 2 (dạy lại không ở "Chỉ tiêu chung"), 3 (5 ngành mới không có SX không dạy lại, vd bds không có Asset Turnover, CCC), 4-backend (`industry('NLG') = industry('VHM') = bds`, `GAS = dk`), 8-catalog (ref = 1 đúng 4 chỉ tiêu); 21 mã thử ra đúng ngành (unit test với directory giả); settings PUT `bds` lưu được, PUT `bds` với "Asset Turnover" → 400; catalog `academy_chapter` 8–17.
- **Verify:** `cd backend && npm run typecheck && npm run lint && npx vitest run test/unit/dashboard.test.ts test/unit/dashboard-nganh.test.ts test/unit/dashboard-public-routes.test.ts`; migration trên DB local: `npm run build && npm run db:migrate` (DB `iqx_v2_local`, xem memory local run), chạy lại lần 2 không lỗi; `npm run contracts:check`.

### T2 · Backend công thức: khoản mục, 28 chỉ tiêu, 3 biến thể, phương pháp trực tiếp — kind `backend`, priority 3 (sau T1)

- **Files:** `backend/src/modules/dashboard/dashboard.mapping.ts` · `dashboard.native.ts` · `dashboard.series.ts` · `backend/test/unit/dashboard-industry-metrics.test.ts` · `dashboard-eps-valuation.test.ts` · `backend/test/unit/dashboard-v3-metrics.test.ts` (mới) · `backend/test/fixtures/dashboard/*` (fixture mới, rút gọn từ VCI thật: HPG, VHM, GAS, MWG, REE, ANV; + REE tổng hợp có 4 quý 2025 trực tiếp).
- **Steps:**
  1. Mapping: thêm `ENTERPRISE_CONCEPTS` (`dn_*`, §5) vào mẫu `thuong`; `industryFieldMap(template, nganh)` ghi đè `lt_debt` = `['bsa71','bsa173']` khi nganh ∈ 5 ngành mới (D5); `normalizeIndustryStatements(sections, asOf, template, nganh)` + bước `applyDirectMethod()` đọc dòng `cash_flow.quarters` thô (D6).
  2. Native: 28 công thức §6.3 + `roe_fin`, `net_margin_bh`, `gross_margin_q` (§6.2) theo khung `NativeMetric` sẵn có; tên đường/cột lấy đúng MAU.
  3. Series: dispatch theo `metric_id`; `REVENUE_LABELS` dùng `template`; khuôn A cho `buyer_prepay_growth`; `decimals` theo D11; `ref` từ catalog; `annualStatements` nhận khoản mục `dn_*` theo kind.
  4. Valuation: EV/EBITDA, P/E, P/B dùng statements đã qua D5/D6 (không đổi registry Bộ lọc).
- **Acceptance (S §12):** 6 (dk/vl biên gộp quý, tên "Biên gộp quý"; bl/dien/bds 4 quý), 7 (ROE nh/ck/bh 2 đường + cột "Tổng tài sản BQ / VCSH BQ" đơn vị lần), 9 (fixture REE trực tiếp 2025: Khấu hao/DT, Capex/KH, Biên EBITDA, ND/EBITDA trống ở Q1/25…Q2/26 và năm 2025; EV/EBITDA trống ở ngày dùng các kỳ đó), 10 (mọi chart của 9 ngành trả `q` và `y` hoặc dạng năm cố định, không ném lỗi), §10 (mẫu số ≤ 0 → null; Tiền ròng/VCSH và ND/EBITDA được âm; tăng trưởng trả trước gốc 0 → null); 1 test số liệu tay cho mỗi chỉ tiêu mới (tính bằng tay từ fixture). Bộ lọc không đổi: `test/unit/screener-statements.test.ts` xanh nguyên trạng.
- **Verify:** `cd backend && npm run typecheck && npm run lint && npx vitest run test/unit/dashboard*.test.ts test/unit/screener-statements.test.ts && npm test`; smoke sống (API local `:3011`): `for s in FPT CTD VCB MBB SSI VND BVH PVI VHM NLG KBC GAS PVS PLX MWG PNJ VNM POW REE HPG DPM ANV; do curl -s localhost:3011/api/v2/fundamental/$s | jq -r '[.nganh, ([.charts[]|select(.status!="ok")|.name]|join(","))]|@tsv'; done` — ghi lại chỉ tiêu trống và lý do.

### T3 · Renderer dùng chung — kind `frontend`, priority 3 (song song T1)

- **Files:** `frontend/src/components/fundamental-charts/*` · `frontend/e2e/fundamental-charts-390.spec.ts` · `frontend/src/components/fundamental-charts/*.test.ts(x)` (mới).
- **Steps:** `decimalsForUnit('năm') = 1` (E2 hero/streak vẫn số nguyên); `referenceLabel`: 'lần' → "Mốc 1,00"; trục luôn chứa `ref` (đã có) ; `zero` cho A/B/C khi có số âm; prop `showTable?: boolean`; kiểm màu đường 2 `--line2`; không chữ xám (`#c9d6e4` cho chữ phụ theo token hiện có).
- **Acceptance:** 8 (nhãn "Mốc 1,00"), 11 (390px không tràn ngang, không chữ xám) ở e2e với chart mẫu Tiền / Nợ vay ngắn hạn, Tiền ròng / VCSH (âm), Số năm bán hết tồn kho, ROE 2 đường; `lesson-chart.tsx` của Học viện vẫn render (không đổi API bắt buộc).
- **Verify:** `cd frontend && npm run typecheck && npm run lint && npx vitest run src/components/fundamental-charts src/pages/academy/charts && npx playwright test e2e/fundamental-charts-390.spec.ts`.

### T4 · UI Dashboard 9 ngành + nút Học có ngành — kind `frontend`, priority 3 (sau T1 vì cần contract)

- **Files:** `frontend/src/pages/demo-trading/analysis/*` (api.ts, model.ts, learn-link.tsx, chart-card.tsx, chart-picker.tsx, dashboard.tsx, use-dashboard.ts, analysis-dashboard.test.tsx) · `frontend/src/lib/generated/**` · `frontend/contracts/**` (regen qua `npm run contracts:generate`).
- **Steps:** regen contract; bỏ hard-code `INDUSTRIES`/`INDUSTRY_LABEL` (lấy `label` từ catalog/industry API, kiểu `Nganh` từ contract); `academyMetricHref(metricKey, nganh)`; `LearnLink` nhận `nganh`; nháp theo ngành giữ khi đổi mã (đã có `drafts[industry]`, kiểm với 9 ngành); "Đã chọn n/N" từ `total`.
- **Acceptance:** 1 (bds "Đã chọn n/32", nhóm "Chỉ tiêu chung" 13, "Chỉ tiêu bất động sản" 19), 2, 4 (VHM→NLG giữ thiết lập; VHM→GAS chuyển thiết lập dầu khí; quay lại VHM còn bản nháp), 5-phía phát (href `/academy?metric=roe&nganh=nh` cho VCB, `…&nganh=thuong` cho FPT, `revenue_yoy&nganh=bds` cho VHM, `revenue_cagr3&nganh=vl` cho HPG), nhãn ngành cạnh mã; bấm Học không đổi tick.
- **Verify:** `cd frontend && npm run contracts:check && npm run typecheck && npm run lint && npx vitest run src/pages/demo-trading/analysis`.

### T5 · QA nghiệm thu §12 — kind `qa`, priority 3 (sau T2, T3, T4 và Học viện merge `academy/link?nganh`)

- **Files:** `frontend/e2e/dashboard-v3.spec.ts` (mới) · `backend/docs/update-22-11/ACCEPTANCE-dashboard-v3.md` (mới) · `backend/docs/update-22-11/evidence/dashboard-v3/*`.
- **Steps:** e2e với API thật local cho 11 mục §12 (mục 9 dùng ANV/DBD thật thay REE vì REE thật lập PP gián tiếp; REE tổng hợp đã có ở T2); kiểm 21 mã → ngành; kiểm 260 cặp (metric_key, nganh) đều resolve bài qua `GET /api/v2/academy/link` khi Học viện xong; chụp 390px.
- **Verify:** `cd frontend && npx playwright test e2e/dashboard-v3.spec.ts` + script cURL 260 cặp; tất cả PASS ghi vào ACCEPTANCE.

## 11. Thứ tự

```
T1 ──► T2 ──┐
  └──► T4 ──┼──► T5 (cần Học viện: academy/link?nganh + bài v5)
T3 ─────────┘
```
T1 ∥ T3 ngay; T2 và T4 song song sau khi T1 merge (T4 chỉ cần contract, T2 chỉ cần catalog). Mỗi task một nhánh/worktree riêng; main agent merge.

## 12. Rủi ro production

| Rủi ro | Giảm thiểu |
|---|---|
| VCI search-bar lỗi/chặn IP prod (đã từng chặn 10/2026) → mọi mã mẫu DN thành `thuong` | Cache 12 h stale-on-error + fallback từng mã; log cảnh báo; kiểm `curl` từ VPS trước deploy (memory: VCI blocks prod IP). |
| Mã từng xem dưới `thuong` nay thành bds/dk/… → người dùng thấy bộ mặc định mới thay thiết lập `thuong` đã lưu | Đúng spec §1.3/§6; ghi vào release note. Dòng `thuong` vẫn giữ cho mã SX. |
| Thứ tự deploy: code mới ghi `nganh='bds'` trước khi CHECK được nới → 500 | Chạy migration 0065 trước swap (deploy-u411.sh nhận latest-mig = 0065); migration tương thích code cũ. |
| Lệch số với Bộ lọc: EV/EBITDA, ND/EBITDA của mã PP trực tiếp (dashboard trống, Bộ lọc tính khấu hao 0); D/E có `bsa173` ở 5 ngành | Ghi chú trong `legend_note`/DEV-NOTES; không sửa Bộ lọc trong đợt này. |
| Contract sinh tự động (`backend/contracts`, `frontend/src/lib/generated`) bị Học viện cùng sửa | Không sửa tay; ai merge sau chạy lại `contracts:generate` ở cả 2 repo phần. |
| `metric_key` 28 chỉ tiêu mới lệch với nội dung bài Học viện | Bảng §6.3 là nguồn duy nhất; T5 kiểm đủ 260 cặp. |
| Hiệu năng: thêm 1 lần gọi ICB | Cache chung cho mọi mã; không thêm gọi cho mẫu nh/ck/bh. |
| Mobile đọc API dashboard | Mobile tạm ngừng, không cập nhật (AGENTS.md). Response giữ tương thích (chỉ thêm giá trị enum). |

## 13. Lấy tên đường/cột từ MAU

```bash
python3 -I -c "
import json;L=open('backend/docs/update-22-11/IQX-Dashboard-Phan-Tich-v3-MAU.html',encoding='utf8').read().split('\n')[205]
D=json.loads(L[L.index('>')+1:L.rindex('</script>')]);c=D['t']['VHM']['Số năm bán hết tồn kho'];print(json.dumps({k:c[k] for k in c if k not in('q','y')}|{'q':{k:v if k=='labels' else [s['name'] for s in v] if isinstance(v,list) else {'unit':v['unit'],'type':v['type'],'names':[s['name'] for s in v['series']]} for k,v in c['q'].items()}},ensure_ascii=False))"
```
Mã đại diện mỗi ngành: thuong FPT, nh VCB, ck SSI, bh BVH, bds VHM, dk GAS, bl MWG, dien REE, vl HPG. Số liệu MAU là số tự sinh: chỉ lấy **tên, khuôn, đơn vị, ref, kiểu cột**, không lấy số.
