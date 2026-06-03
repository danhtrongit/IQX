# Ánh xạ FieldCode VCI → concept BCTC (Phase 0 discovery)

Nguồn: chạy `discover_fieldcodes.py` live trên **FPT** (phi-ngân hàng, TT200) và **VCB**
(ngân hàng, TT22) ngày 2026-06-03. Đây là sự thật từ dữ liệu VCI thực tế.

> ⚠️ **Cảnh báo quan trọng:** FieldCode VCI **khác** giả định ban đầu. Cụ thể `isa1` là
> *"Doanh thu bán hàng và cung cấp dịch vụ"* (doanh thu gộp), còn **doanh thu thuần là `isa3`**.
> Tổng tài sản là **`bsa53`** (không phải `bsa1` — `bsa1` là "TÀI SẢN NGẮN HẠN"). Mọi công
> thức phải neo theo bảng dưới, không theo phỏng đoán.

## Template A — Phi-ngân hàng (FPT, isa*/bsa*/cfa*)

| concept | FieldCode | titleVi (mã TT200) |
|---|---|---|
| gross_revenue | isa1 | Doanh thu bán hàng và cung cấp dịch vụ (01) |
| net_revenue | **isa3** | Doanh thu thuần (10) |
| cogs | isa4 | Giá vốn hàng bán (11) |
| gross_profit | isa5 | Lợi nhuận gộp (20) |
| financial_income | isa6 | Doanh thu hoạt động tài chính (21) |
| interest_expense | isa8 | Chi phí lãi vay (23) |
| selling_expense | isa9 | Chi phí bán hàng (25) |
| admin_expense | isa10 | Chi phí quản lý doanh nghiệp (26) |
| operating_profit | isa11 | Lãi/(lỗ) từ hoạt động kinh doanh — EBIT (30) |
| profit_before_tax | isa16 | Lãi/(lỗ) trước thuế (50) |
| npat | isa20 | Lãi/(lỗ) thuần sau thuế (60) |
| minority_interest | isa21 | Lợi ích của cổ đông thiểu số |
| npat_parent | isa22 | Lợi nhuận của Cổ đông Công ty mẹ (61) |
| eps | isa23 | Lãi cơ bản trên cổ phiếu |
| current_assets | bsa1 | TÀI SẢN NGẮN HẠN (100) |
| cash | bsa2 | Tiền và tương đương tiền (110) |
| st_investments | bsa5 | Đầu tư ngắn hạn (120) |
| trade_receivables | bsa9 | Phải thu khách hàng (131) |
| inventory_gross | bsa16 | Hàng tồn kho (141) |
| inventory_provision | bsa17 | Dự phòng giảm giá hàng tồn kho (149, âm) |
| net_fixed_assets | bsa29 | Tài sản cố định (220) |
| total_assets | **bsa53** | TỔNG CỘNG TÀI SẢN (270) |
| total_liabilities | bsa54 | NỢ PHẢI TRẢ (300) |
| current_liabilities | bsa55 | Nợ ngắn hạn (310) |
| st_debt | bsa56 | Vay ngắn hạn (320) |
| trade_payables | bsa57 | Phải trả người bán (312) |
| buyer_prepayments | bsa58 | Người mua trả tiền trước (313) |
| lt_debt | bsa71 | Vay dài hạn (338) |
| equity | bsa78 | Vốn chủ sở hữu (400) |
| charter_capital | bsa80 | Vốn góp (411) |
| retained_earnings | bsa90 | Lãi chưa phân phối (421) |
| depreciation | cfa2 | Khấu hao TSCĐ và BĐSĐT (02) |
| provisions_cf | cfa3 | Chi phí dự phòng (03) |
| cfo | cfa18 | Lưu chuyển tiền thuần từ HĐKD (20) |
| capex | cfa19 | Tiền chi mua sắm, xây dựng TSCĐ (21, âm) |
| proceeds_from_shares | cfa27 | Tiền thu từ phát hành cổ phiếu (31) |

`equity_parent`: VCI không tách dòng "VCSH cổ đông công ty mẹ" riêng ở cấp 1 → để trống;
ROE fallback dùng `equity` (bsa78). `minority` ở bsa95/bsa210 nếu cần tách sau.

## Template B — Ngân hàng (VCB, isb*/bsb*)

| concept | FieldCode | titleVi (TT22) |
|---|---|---|
| interest_income_gross | isb25 | Thu nhập lãi và các khoản thu nhập tương tự |
| interest_expense | isb26 | Chi phí lãi và các chi phí tương tự |
| net_interest_income | isb27 | Thu nhập lãi thuần |
| net_fee_income | isb30 | Lãi/Lỗ thuần từ hoạt động dịch vụ |
| total_operating_income | isb38 | Tổng thu nhập hoạt động (TOI) — cũng là cờ ngân hàng |
| operating_expense | isb39 | Chi phí quản lý doanh nghiệp (OPEX) |
| ppop_reported | isb40 | LN thuần trước trích lập dự phòng |
| provision_expense | isb41 | Trích lập dự phòng tổn thất tín dụng |
| profit_before_tax | isa16 | Tổng lợi nhuận trước thuế |
| npat | isa20 | Lợi nhuận sau thuế |
| npat_parent | isa22 | Cổ đông của Công ty mẹ |
| eps | isa23 | Lãi cơ bản trên cổ phiếu |
| total_assets | bsa53 | TỔNG TÀI SẢN |
| cash | bsa2 | Tiền mặt, vàng bạc, đá quý |
| deposits_at_sbv | bsb97 | Tiền gửi tại NHNN |
| deposits_at_other_ci | bsb98 | Tiền gửi tại & cho vay các TCTD khác |
| customer_loans | bsb104 | Cho vay khách hàng (gross) |
| loan_loss_reserve | bsb105 | Dự phòng rủi ro cho vay khách hàng (âm) |
| investment_securities | bsb106 | Chứng khoán đầu tư |
| total_liabilities | bsa54 | TỔNG NỢ PHẢI TRẢ |
| customer_deposits | bsb113 | Tiền gửi của khách hàng |
| equity | bsa78 | VỐN CHỦ SỞ HỮU |
| charter_capital | bsa80 | Vốn điều lệ |
| retained_earnings | bsa90 | Lợi nhuận chưa phân phối |

## Feasibility (KPI Phase 1)

**Template A — tính sạch được (đủ concept):** Revenue growth (isa3), Gross margin (isa5/isa3),
ROE (isa22/bsa78), Net Debt/EBITDA (bsa56+bsa71−bsa2−bsa5 / (isa11+cfa2)), FCF margin
(cfa18+cfa19 / isa3), Altman Z' (bsa1/bsa55/bsa53/bsa90/isa11/bsa78/bsa54/isa3) — **6/6**.
Common-Size, Chu kỳ VLĐ (bsa9/bsa16/bsa17/bsa57), Cash Flow Bridge (isa20/cfa2/cfa3/cfa18/cfa19) — đủ.

**Template B — tính sạch được:** ROE (isa20/bsa78), LDR (bsb104/bsb113), Equity ratio
(bsa78/bsa53), LLR/Loans (|bsb105|/bsb104), CIR (|isb39|/isb38) — **5/6**. TOI Mix
(isb27/isb38, isb30/isb38) ✓. PPOP/CoR (isb38−|isb39|, isb41/PPOP, isb41/avg bsb104) ✓.

**Chưa tính được trong Phase 1 (để N/A, làm Phase 3):**
- **NIM** và **NIM Decomposition**: cần `earning_assets` và `interest_bearing_liabilities`
  — KHÔNG phải dòng đơn lẻ, phải cộng (cho vay + chứng khoán + tiền gửi TCTD + tiền gửi NHNN
  cho earning assets; tiền gửi KH + vay TCTD + giấy tờ có giá cho IBL). → để concept = null →
  NIM/yield/COF hiện "—". Triển khai derivation ở Phase 3.

**Định giá (Phase 4):**
- Giá lịch sử 5 năm: **CÓ** qua `/market-data/quotes/{symbol}/ohlcv` (truyền `start` 5 năm trước)
  hoặc `/market-data/company/{symbol}/price-chart`.
- **β: KHÔNG có** từ bất kỳ nguồn IQX nào → phải tự tính β từ chuỗi giá + index, hoặc dùng
  bản định giá rút gọn (RIM + P/E band) không cần β. DCF/Justified-P/B với Ke mặc định (CAPM
  β=1.2 cho ngân hàng) là phương án dự phòng.

**Lưu ý dấu:** `inventory_provision` (bsa17), `loan_loss_reserve` (bsb105),
`operating_expense` (isb39), `provision_expense` (isb41), `capex` (cfa19) lưu dạng **âm**
trong VCI → engine dùng `abs()`/cộng số âm cho đúng (đã xử lý trong code KPI). Cần đối chiếu
số thực khi nghiệm thu.
