# Chương 27 — Endpoint: Báo cáo tài chính (BCTC) & dashboard BCTC

Chương này đặc tả 3 endpoint public thuộc nhóm "Dữ liệu thị trường: Cơ bản": báo cáo tài chính thô
theo kỳ (`fundamentals`), bản phân tích forensic pre-computed (`bctc`) và dashboard "kể chuyện" 8 khối
(`bctc-dashboard`). Cả 3 đều đọc từ provider VCI (Vietcap IQ Insight), không ghi DB nào ngoài
bảng cache `sector_median_cache` mà nhánh benchmark của dashboard tự upsert.

Số endpoint chỉ là 3, nhưng payload của 2 endpoint sau là toàn bộ engine phân tích BCTC: 2 nhánh
KPI hoàn toàn khác nhau (ngân hàng / phi ngân hàng), ~70 chỉ số có công thức riêng, bảng mapping
FieldCode của VCI, lớp median ngành có cache, và lớp ngưỡng màu. Phần `## Nghiệp vụ nền` dưới đây là
bắt buộc phải đọc trước khi viết lại — nếu bỏ qua thì các mục endpoint sẽ không đủ nghĩa.

> **Phần chữ do AI viết KHÔNG nằm ở chương này.** `GET /api/v1/ai/bctc/{symbol}` và
> `GET /api/v1/ai/bctc-dashboard/{symbol}` là endpoint **Bearer + Premium** — xem **chương 29**.
> 3 endpoint trong chương này là **công khai, không auth**, chỉ trả số đã tính.

---

## Bảng tra nhanh

| # | Method & path | Tên tiếng Việt | Quyền | Cache | Nguồn |
|---|---|---|---|---|---|
| 1 | `GET /api/v1/market-data/fundamentals/{symbol}/{report_type}` | Báo cáo tài chính thô theo kỳ | Công khai | Redis TTL 900s | VCI |
| 2 | `GET /api/v1/market-data/bctc/{symbol}` | Bản phân tích BCTC forensic (KPI pre-computed) | Công khai | Redis TTL 900s | VCI + tính toán |
| 3 | `GET /api/v1/market-data/bctc-dashboard/{symbol}` | Dashboard kể chuyện BCTC 8 khối | Công khai | Redis TTL 900s | VCI + DB (`sector_median_cache`) + tính toán |

---

## Kiểu dữ liệu dùng chung

#### Envelope chuẩn của mọi endpoint market-data

Cả 3 endpoint trả về cùng một vỏ bọc. `data` là `any` ở tầng OpenAPI — hình dạng thật được đặc tả
riêng ở từng mục endpoint.

~~~ts
/** Vỏ bọc chuẩn cho toàn bộ endpoint market-data. */
interface MarketDataResponse<T> {
  data: T;
  meta: MarketDataMeta;
}

interface MarketDataMeta {
  /** Nguồn đã phục vụ response. Cả 3 endpoint ở chương này luôn là "VCI". */
  source: string;
  /** 1 = nguồn chính, 2+ = nguồn fallback. Cả 3 endpoint luôn = 1 (chỉ có 1 nguồn). */
  source_priority: number;
  /** true khi phải dùng nguồn dự phòng. Cả 3 endpoint luôn = false. */
  fallback_used: boolean;
  /** Thời điểm fetch, ISO-8601 có timezone (UTC). */
  as_of: string;
  /** URL upstream đã gọi. Chuỗi rỗng nếu không có. */
  raw_endpoint: string;
}
~~~

`meta.raw_endpoint` **không** chứa query string — chỉ phần path của upstream:

| Endpoint | `raw_endpoint` |
|---|---|
| `fundamentals/.../balance_sheet` \| `income_statement` \| `cash_flow` | `https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/financial-statement` |
| `fundamentals/.../ratio` | `https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/statistics-financial` |
| `bctc/{symbol}`, `bctc-dashboard/{symbol}` | `https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/financial-statement` |

> **Bẫy:** `fetch_bctc_statements` gọi 3 lần cùng một URL với `?section=` khác nhau và **ghi đè** biến
> `url` mỗi vòng lặp → `raw_endpoint` là URL của section cuối (`CASH_FLOW`) nhưng vì URL giống nhau nên
> giá trị cuối cùng không phân biệt được. Bản TS cứ trả path `financial-statement` là đúng.

#### Kiểu dùng lại

~~~ts
/** 1 = báo cáo Năm (length_report = 5); 2 = báo cáo Quý (length_report ∈ 1..4). */
type TermType = 1 | 2;

/** Loại báo cáo hợp lệ cho endpoint fundamentals. */
type ReportType = "balance_sheet" | "income_statement" | "cash_flow" | "ratio";

/** Kỳ lọc cho báo cáo ratio. */
type RatioPeriod = "Q" | "Y";

/** Nhãn màu của lớp ngưỡng (engine forensic). */
type ThresholdStatus = "green" | "amber" | "red" | "na";

/** Nhãn màu của lớp benchmark dashboard. Khác ThresholdStatus: KHÔNG có "na", dùng null. */
type BenchmarkColor = "green" | "amber" | "red";

/** Dải chất lượng của trục radar. */
type RadarBand = "good" | "ok" | "warn";

/** Template BCTC: A = phi ngân hàng, B = ngân hàng. */
type BctcTemplate = "A" | "B";

/** Mã ngành phụ (chỉ Template A). */
type SubSectorCode =
  | "san_xuat"
  | "cntt_dichvu"
  | "ban_le"
  | "bat_dong_san"
  | "tien_ich";
~~~

#### Kiểu nội bộ `Period` (không xuất ra API nhưng bắt buộc để viết lại)

~~~ts
/**
 * Một kỳ báo cáo đã ghép từ cả 3 báo cáo (CĐKT + KQKD + LCTT) và đã ánh xạ
 * FieldCode → concept nội bộ. Giá trị là VND thô (không chia 1000/1e6).
 */
interface Period {
  year: number;
  /** 1..4 = quý tương ứng, 5 = năm. */
  length: number;
  /** concept nội bộ → giá trị VND thô. Concept thiếu thì KHÔNG có key (không phải 0). */
  values: Record<string, number>;
}
~~~

Hai hàm tiện ích đi kèm, bản TS phải giữ nguyên semantics:

~~~ts
/** Đọc 1 concept. Không có key → null (KHÔNG phải 0, KHÔNG phải undefined). */
function val(p: Period | null, concept: string): number | null {
  if (p === null) return null;
  const v = p.values[concept];
  return v === undefined ? null : v;
}

/** Nhãn cột: năm → "2025"; quý → "Q3/2025". */
function periodLabel(p: Period): string {
  return p.length < 5 ? `Q${p.length}/${p.year}` : `${p.year}`;
}
~~~

#### Kiểu `RatioRow` (bảng chỉ số VCI đã enrich)

Không có schema cố định — VCI trả về union của schema ngân hàng và phi ngân hàng, backend chỉ
thêm/chuẩn hóa một số trường. Các trường **được engine BCTC đọc đến** là:

~~~ts
/**
 * Một dòng chỉ số tài chính (từ /statistics-financial, đã snake_case hoá + enrich).
 * Mọi trường đều optional vì VCI không đảm bảo; index signature giữ trường lạ.
 */
interface RatioRow {
  year_report: number;              // luôn được chuẩn hoá thành number
  length_report: number;            // luôn được chuẩn hoá thành number (0 nếu thiếu)
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;              // ⚠ ĐƠN VỊ KHÔNG XÁC ĐỊNH — xem "Bẫy đơn vị ROE" bên dưới
  eps?: number | null;              // VND/cp
  bvps?: number | null;             // VND/cp (backend tự suy nếu thiếu)
  dividend?: number | null;         // A: VND/cp; B: tỷ lệ cổ phiếu
  market_cap?: number | null;       // VND
  number_of_shares_mkt_cap?: number | null;
  revenue?: number | null;
  net_profit?: number | null;
  revenue_growth?: number | null;
  net_profit_growth?: number | null;
  gross_margin?: number | null;
  net_debt_ebitda?: number | null;
  dividend_yield?: number | null;
  dso?: number | null;
  [k: string]: unknown;
}
~~~

---

## Nghiệp vụ nền

#### 1. Đường ống dữ liệu (pipeline)

~~~
VCI /financial-statement?section=BALANCE_SHEET|INCOME_STATEMENT|CASH_FLOW
      → camelCase → snake_case
      → chọn bucket "years" (term_type=1) hoặc "quarters" (term_type=2)
      → detect_template(income_rows)  → "A" | "B"
      → load_mapping("nonbank" | "bank")   (file YAML)
      → build_periods(bs, is, cf, mapping) → Period[] (mới nhất trước)
      → nhánh KPI A hoặc B → snapshot / modules / forensic / trinity / valuation
                            hoặc → 8 khối dashboard → benchmark (median ngành + màu)
~~~

Ba tầng riêng biệt, phải giữ đúng thứ tự khi viết lại:

1. **Tầng chuẩn hóa** — FieldCode VCI → concept nội bộ (deterministic, không network).
2. **Tầng tính toán** — KPI/module/forensic/valuation (thuần hàm, không network).
3. **Tầng benchmark** — median ngành từ DB/cache + gán màu + điểm radar (chỉ endpoint 3, best-effort).

#### 2. Nhận diện NGÂN HÀNG vs PHI NGÂN HÀNG

Đây là quyết định đầu tiên và rẽ nhánh toàn bộ payload.

~~~ts
const BANK_SIGNATURE = ["isb38", "isb27", "isb43"] as const;

/**
 * "B" nếu BẤT KỲ dòng KQKD nào có ÍT NHẤT MỘT trong 3 FieldCode trên mang
 * giá trị TRUTHY (≠ 0 và ≠ null). Ngược lại "A".
 */
function detectTemplate(incomeRows: Array<Record<string, unknown>>): BctcTemplate {
  for (const row of incomeRows ?? []) {
    for (const code of BANK_SIGNATURE) {
      const v = row[code];
      // truthy theo nghĩa Python: 0, 0.0, null, undefined, "" đều là falsy
      if (v) return "B";
    }
  }
  return "A";
}
~~~

| FieldCode | Khoản mục |
|---|---|
| `isb38` | Tổng thu nhập hoạt động (TOI) — cờ ngân hàng chính |
| `isb27` | Thu nhập lãi thuần (NII) |
| `isb43` | LNST ngân hàng (chỉ dùng để nhận diện, không có trong mapping) |

> **BẪY QUAN TRỌNG — không được kiểm tra "key có tồn tại".** Schema VCI là **union hợp nhất**: FPT
> (phi ngân hàng) VẪN có key `isb38` và `isb27` nhưng giá trị `0.0`. Nếu bản TS dùng
> `"isb38" in row` hoặc `row.isb38 !== undefined` thì **mọi mã đều bị nhận diện là ngân hàng** →
> toàn bộ payload sai. Phải kiểm tra truthy (khác 0 **và** khác null).

#### 3. Mapping FieldCode của VCI (`mapping_loader` + thư mục `mapping/`)

**Định dạng file:** YAML phẳng, một cấp, `concept: FieldCode` hoặc `concept: null`. Có 2 file:

| Template | File | Số concept |
|---|---|---|
| A — phi ngân hàng (TT200) | `app/services/bctc/mapping/nonbank.yaml` | 37 |
| B — ngân hàng (TT22) | `app/services/bctc/mapping/bank.yaml` | 34 |

**Hàm nạp:**

~~~ts
/**
 * Trả về dict concept → FieldCode (chữ THƯỜNG) hoặc null nếu chưa ánh xạ.
 * - template không thuộc {"nonbank","bank"} → THROW (ValueError tương đương).
 * - Kết quả được memoize (Python dùng lru_cache(maxsize=4)).
 * - Giá trị được .toLowerCase(); giá trị falsy trong YAML → null.
 */
function loadMapping(template: "nonbank" | "bank"): Record<string, string | null>;
~~~

**Một FieldCode map sang khoản mục nội bộ thế nào:** mapping là `concept → FieldCode`, tra ngược lại
khi ghép kỳ. Với mỗi dòng báo cáo (`row`) và mỗi cặp `(concept, field)`:

~~~ts
function concepts(
  row: Record<string, unknown>,
  mapping: Record<string, string | null>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [concept, field] of Object.entries(mapping)) {
    if (!field) continue;              // 1) chưa ánh xạ (null) → BỎ QUA concept
    const raw = row[field];
    if (raw === null || raw === undefined) continue;  // 2) thiếu số → BỎ QUA (không đặt 0)
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;              // 3) không parse được → BỎ QUA
    out[concept] = num;
  }
  return out;
}
~~~

**Thiếu mapping thì sao?** Ba trường hợp, và cả ba đều là **BỎ QUA — không lỗi, không = 0**:

| Trường hợp | Hành vi | Hệ quả xuống KPI |
|---|---|---|
| Concept có `FieldCode: null` trong YAML | concept không bao giờ vào `Period.values` | `val()` trả `null` → mọi KPI phụ thuộc trả `null` (không throw) |
| VCI không trả FieldCode đó, hoặc trả `null` | concept không vào `Period.values` | như trên |
| VCI trả chuỗi không parse được số | concept không vào `Period.values` | như trên |

> **Bản TS PHẢI mang nguyên 2 file mapping.** Đây là dữ liệu discovery live (FPT cho template A, VCB
> cho template B), **không suy ra được từ tài liệu VCI**. Chép nguyên nội dung 2 bảng dưới đây thành
> 2 file (YAML hoặc JSON/TS constant đều được, miễn giữ đúng cặp concept→code và giữ `null` là `null`).
> Nếu đổi 1 code, KPI liên quan sẽ âm thầm trả `null` mà không có lỗi nào.

#### `nonbank.yaml` — Template A (phi ngân hàng, TT200) — nguyên văn

| concept | FieldCode | Khoản mục (mã TT200) |
|---|---|---|
| `gross_revenue` | `isa1` | Doanh thu bán hàng và CCDV (01) |
| `net_revenue` | `isa3` | Doanh thu thuần (10) |
| `cogs` | `isa4` | Giá vốn hàng bán (11) — **lưu âm** |
| `gross_profit` | `isa5` | Lợi nhuận gộp (20) |
| `financial_income` | `isa6` | Doanh thu hoạt động tài chính (21) |
| `interest_expense` | `isa8` | Chi phí lãi vay (23) — **lưu âm** |
| `selling_expense` | `isa9` | Chi phí bán hàng (25) — **lưu âm** |
| `admin_expense` | `isa10` | Chi phí quản lý doanh nghiệp (26) — **lưu âm** |
| `operating_profit` | `isa11` | LN từ HĐKD — dùng làm proxy EBIT (30) |
| `profit_before_tax` | `isa16` | LNTT (50) |
| `npat` | `isa20` | LNST (60) |
| `minority_interest` | `isa21` | Lợi ích cổ đông thiểu số |
| `npat_parent` | `isa22` | LNST cổ đông công ty mẹ (61) |
| `eps` | `isa23` | Lãi cơ bản trên cổ phiếu |
| `current_assets` | `bsa1` | TÀI SẢN NGẮN HẠN (100) |
| `cash` | `bsa2` | Tiền & tương đương tiền (110) |
| `st_investments` | `bsa5` | Đầu tư ngắn hạn (120) |
| `trade_receivables` | `bsa9` | Phải thu khách hàng (131) |
| `inventory_gross` | `bsa16` | Hàng tồn kho (141) |
| `inventory_provision` | `bsa17` | Dự phòng giảm giá HTK (149) — **lưu âm** |
| `net_fixed_assets` | `bsa29` | Tài sản cố định (220) |
| `total_assets` | `bsa53` | TỔNG CỘNG TÀI SẢN (270) |
| `total_liabilities` | `bsa54` | NỢ PHẢI TRẢ (300) |
| `current_liabilities` | `bsa55` | Nợ ngắn hạn (310) |
| `st_debt` | `bsa56` | Vay ngắn hạn (320) |
| `trade_payables` | `bsa57` | Phải trả người bán (312) |
| `buyer_prepayments` | `bsa58` | Người mua trả tiền trước (313) |
| `lt_debt` | `bsa71` | Vay dài hạn (338) |
| `equity` | `bsa78` | VỐN CHỦ SỞ HỮU (400) |
| `equity_parent` | **`null`** | VCI không tách VCSH công ty mẹ ở cấp 1 → ROE fallback dùng `equity` |
| `charter_capital` | `bsa80` | Vốn góp (411) |
| `retained_earnings` | `bsa90` | Lãi chưa phân phối (421) |
| `depreciation` | `cfa2` | Khấu hao TSCĐ & BĐSĐT (LCTT 02) |
| `provisions_cf` | `cfa3` | Chi phí dự phòng (LCTT 03) |
| `cfo` | `cfa18` | LCT thuần từ HĐKD (LCTT 20) |
| `capex` | `cfa19` | Tiền chi mua sắm TSCĐ (LCTT 21) — **lưu âm** |
| `proceeds_from_shares` | `cfa27` | Tiền thu phát hành cổ phiếu (LCTT 31) |

#### `bank.yaml` — Template B (ngân hàng, TT22) — nguyên văn

| concept | FieldCode | Khoản mục |
|---|---|---|
| `interest_income_gross` | `isb25` | Thu nhập lãi & các khoản tương tự |
| `interest_expense` | `isb26` | Chi phí lãi & các chi phí tương tự — **lưu âm** |
| `net_interest_income` | `isb27` | Thu nhập lãi thuần |
| `net_fee_income` | `isb30` | Lãi/lỗ thuần từ hoạt động dịch vụ |
| `fx_income` | `isb31` | Lãi/lỗ thuần từ hoạt động ngoại hối |
| `trading_securities_income` | `isb32` | Lãi/lỗ thuần từ mua bán CK kinh doanh |
| `investment_securities_income` | `isb33` | Lãi/lỗ thuần từ mua bán CK đầu tư |
| `other_income_bank` | `isb36` | Thu nhập hoạt động khác |
| `total_operating_income` | `isb38` | Tổng thu nhập hoạt động (TOI) — cờ ngân hàng |
| `operating_expense` | `isb39` | Chi phí quản lý DN (OPEX) — **lưu âm** |
| `ppop_reported` | `isb40` | LN thuần trước trích lập dự phòng |
| `provision_expense` | `isb41` | Trích lập dự phòng tổn thất tín dụng — **lưu âm** |
| `profit_before_tax` | `isa16` | Tổng LN trước thuế |
| `tax_expense` | `isa19` | Chi phí thuế TNDN — **lưu âm** |
| `npat` | `isa20` | LN sau thuế |
| `npat_parent` | `isa22` | Cổ đông của Công ty mẹ |
| `eps` | `isa23` | Lãi cơ bản trên cổ phiếu |
| `total_assets` | `bsa53` | TỔNG TÀI SẢN |
| `cash` | `bsa2` | Tiền mặt, vàng bạc, đá quý |
| `deposits_at_sbv` | `bsb97` | Tiền gửi tại NHNN |
| `deposits_at_other_ci` | `bsb98` | Tiền gửi & cho vay các TCTD khác |
| `trading_securities` | `bsb99` | Chứng khoán kinh doanh |
| `customer_loans` | `bsb104` | Cho vay khách hàng (gross) |
| `loan_loss_reserve` | `bsb105` | Dự phòng rủi ro cho vay KH — **lưu âm** |
| `investment_securities` | `bsb106` | Chứng khoán đầu tư |
| `total_liabilities` | `bsa54` | TỔNG NỢ PHẢI TRẢ |
| `govt_sbv_borrowings` | `bsb111` | Vay Chính phủ và NHNN |
| `ci_deposits_borrowings` | `bsb112` | Tiền gửi & vay các TCTD khác |
| `customer_deposits` | `bsb113` | Tiền gửi của khách hàng |
| `valuable_papers` | `bsb116` | Phát hành giấy tờ có giá |
| `equity` | `bsa78` | VỐN CHỦ SỞ HỮU |
| `charter_capital` | `bsa80` | Vốn điều lệ |
| `retained_earnings` | `bsa90` | Lợi nhuận chưa phân phối |
| `earning_assets` | **`null`** | Không phải dòng đơn → phải CỘNG 5 concept (xem §5) |
| `interest_bearing_liabilities` | **`null`** | Không phải dòng đơn → phải CỘNG 4 concept (xem §5) |

#### 4. Ghép kỳ — `build_periods`

~~~ts
function buildPeriods(
  bsRows: Array<Record<string, unknown>>,
  isRows: Array<Record<string, unknown>>,
  cfRows: Array<Record<string, unknown>>,
  mapping: Record<string, string | null>,
): Period[] {
  const merged = new Map<string, Record<string, number>>();  // key = `${year}|${length}`
  for (const rows of [bsRows, isRows, cfRows]) {
    for (const row of rows ?? []) {
      const year = Math.trunc(Number(row["year_report"] ?? 0)) || 0;
      const length = Math.trunc(Number(row["length_report"] ?? 0)) || 0;
      if (year === 0 && length === 0) continue;          // bỏ dòng không định danh được kỳ
      const key = `${year}|${length}`;
      const bucket = merged.get(key) ?? {};
      Object.assign(bucket, concepts(row, mapping));      // GHI ĐÈ, không cộng
      merged.set(key, bucket);
    }
  }
  const periods = [...merged.entries()].map(([k, values]) => {
    const [y, l] = k.split("|").map(Number);
    return { year: y, length: l, values };
  });
  // Sắp xếp GIẢM DẦN theo (year, length) → MỚI NHẤT TRƯỚC.
  periods.sort((a, b) => (b.year - a.year) || (b.length - a.length));
  return periods;
}
~~~

Điểm phải giữ nguyên:

- **Thứ tự luôn là mới-nhất-trước.** `periods[0]` = kỳ hiện tại, `periods[1]` = kỳ trước.
- **Ghi đè, không cộng.** Nếu 2 báo cáo cùng đóng góp một concept, dict nào xử lý sau thắng
  (thứ tự cố định: BCĐKT → KQKD → LCTT).
- **Chỉ bỏ dòng khi `(year, length) === (0, 0)`.** Dòng `year=2025, length=0` vẫn được giữ thành 1 kỳ
  riêng — nếu VCI trả rác thì kỳ rác đó có thể lọt lên `periods[0]`. Hành vi hiện tại là như vậy.
- **Không có lọc theo `term_type` ở đây** — việc chọn năm/quý đã làm ở tầng fetch (chọn bucket
  `years` hoặc `quarters`).

#### 5. Đại lượng phái sinh của ngân hàng (vì mapping để `null`)

~~~ts
const EARNING_ASSET_CONCEPTS = [
  "deposits_at_sbv", "deposits_at_other_ci", "trading_securities",
  "customer_loans", "investment_securities",
] as const;

const IBL_CONCEPTS = [
  "govt_sbv_borrowings", "ci_deposits_borrowings", "customer_deposits", "valuable_papers",
] as const;

/** Cộng các concept CÓ MẶT. Không concept nào có mặt → null (KHÔNG phải 0). */
function sumConcepts(p: Period, concepts: readonly string[]): number | null {
  const vals = concepts.map((c) => val(p, c)).filter((v): v is number => v !== null);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
}

const earningAssets = (p: Period) => sumConcepts(p, EARNING_ASSET_CONCEPTS);
const interestBearingLiabilities = (p: Period) => sumConcepts(p, IBL_CONCEPTS);
~~~

> **Bẫy:** hàm cộng "một phần" — nếu chỉ có 2/5 concept thì vẫn trả tổng của 2 concept đó, không
> báo thiếu. NIM sẽ nhỏ/lớn bất thường mà không có cờ nào. Đây là hành vi hiện tại, giữ nguyên.

#### 6. Quy ước chia cho 0 / thiếu số liệu — **quan trọng nhất**

Toàn bộ engine dùng **một** khuôn mẫu, xuất hiện dưới các tên `_pct` / `_ratio` / `_div` / `_r`:

~~~python
def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or not den:      # `not den` bắt CẢ None LẪN 0.0
        return None
    return num / den
~~~

Dịch sang TS **phải** viết tường minh, không dùng `!den` (vì `!0` đúng nhưng `!NaN` cũng đúng và
`!""` cũng đúng — ở đây kiểu là number|null nên tương đương, nhưng viết rõ để không sai khi refactor):

~~~ts
function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return num / den;
}
~~~

**Quy ước chốt lại:**

| Tình huống | Trả về |
|---|---|
| Tử số thiếu (`null`) | `null` |
| Mẫu số thiếu (`null`) | `null` |
| Mẫu số = `0` | `null` — **KHÔNG throw, KHÔNG trả `Infinity`, KHÔNG trả `0`** |
| Chỉ số phụ thuộc nhiều đầu vào, thiếu 1 đầu vào | `null` cho cả chỉ số (không tính một phần) |
| Chỉ số cần kỳ trước mà chỉ có 1 kỳ | `null` (Piotroski/Beneish) hoặc dùng luôn kỳ hiện tại (bình quân số dư) |
| Chỉ số bị `null` | Vẫn **giữ nguyên key** trong response với `value: null`, kèm `status: "na"` / `color: null` |

**Chỉ số KHÔNG BAO GIỜ bị bỏ khỏi payload.** Mọi ô/dòng/trục luôn có mặt, chỉ giá trị là `null`.
Frontend dựa vào key nên bản TS không được "prune" key null.

**Bình quân số dư (`_avg`)** — dùng cho mẫu số bảng cân đối:

~~~ts
/** Bình quân 2 kỳ. Kỳ hiện tại thiếu → null. Kỳ trước thiếu → DÙNG LUÔN kỳ hiện tại. */
function avg2(cur: Period, prev: Period | null, concept: string): number | null {
  const a = val(cur, concept);
  if (a === null) return null;
  const b = prev === null ? null : val(prev, concept);
  return b !== null ? (a + b) / 2 : a;
}
~~~

**Bẫy toán tử `or` của Python** — hai chỗ, phải dịch đúng:

~~~python
# kpi_nonbank.roe
ni = val(cur, "npat_parent") or val(cur, "npat")
eq = _avg(cur, prev, "equity_parent") or _avg(cur, prev, "equity")
~~~

`or` của Python coi `0.0` là falsy. Nghĩa là: **nếu `npat_parent` = 0 thì rơi xuống dùng `npat`**
(không phải chỉ khi `null`). Bản TS phải viết:

~~~ts
const niRaw = val(cur, "npat_parent");
const ni = (niRaw !== null && niRaw !== 0) ? niRaw : val(cur, "npat");
// KHÔNG dùng `?? ` — `??` chỉ bắt null/undefined, sẽ giữ lại 0 và làm ROE = 0 thay vì fallback.
~~~

Tương tự với `equity_parent` (mapping = `null` nên luôn `null` → thực tế luôn dùng `equity`, nhưng
giữ nguyên logic để tương lai map được).

#### 7. Quy ước dấu và đơn vị

| Nhóm | Đơn vị | Ghi chú |
|---|---|---|
| Mọi số từ báo cáo (doanh thu, tài sản, CFO…) | **VND thô** | Không chia 1000/1e6. FPT doanh thu ~7.86e13. |
| Tỷ lệ % (`roe`, `nim`, `gross_margin`, `cir`, `fcf_margin`…) | **phân số** | `0.2491` = 24.91%. **Không** nhân 100 ở backend. |
| Bội số (`net_debt_ebitda`, `cfo_ni`, `equity_multiplier`, `asset_turnover`, `interest_burden`) | **lần (×)** | |
| Chu kỳ (`dso`, `dio`, `dpo`, `ccc`) | **ngày**, cơ sở **365** | Không dùng 360. |
| Điểm (`altman_z`, `beneish_m`) | **không đơn vị** | |
| `piotroski_f.score` | **số nguyên 0..9** | |
| Điểm radar | **0..100 số nguyên** | |
| Giá / EPS / BVPS / cổ tức tiền | **VND/cp** | |

**Khoản chi phí lưu ÂM trong VCI.** Engine xử lý không nhất quán, phải sao chép từng chỗ:

| Chỗ dùng | Có `abs()`? | Hệ quả |
|---|---|---|
| `common_size.cogs_pct / selling_pct / admin_pct` | **Có** (`_abs_pct`) | % dương như mong đợi |
| `common_size.ebit_margin / net_margin / gross_margin` | Không (`_pct`) | vốn đã dương |
| `kpi_bank.cir` (`opex/toi`) | **Có** `abs(opex)` | dương |
| `kpi_bank.llr_loans` | **Có** `abs(res)` | dương |
| `kpi_bank_modules.nim_decomposition.cost_of_funds` | **Có** `abs(ie)` | dương |
| `kpi_bank_modules.ppop_cor.ppop` = `toi - abs(opex)` | **Có** | dương |
| `kpi_bank_modules.ppop_cor.cost_of_risk` = `prov / avg_loans` | **KHÔNG** | **kết quả ÂM** vì `prov` âm |
| `kpi_bank_modules.ppop_cor.provision_ppop` = `prov / ppop` | **KHÔNG** | **kết quả ÂM** |
| `kpi_nonbank_modules.working_capital_cycle` (`dio`, `dpo` dùng `cogs`) | **KHÔNG** | **DIO/DPO ÂM** khi VCI trả `cogs` âm |
| `kpi_nonbank.fcf_margin` = `(cfo + capex)/rev` | Không — **cộng số âm là ĐÚNG** | |
| `cash_flow_bridge.fcf` = `cfo + capex` | Không — cộng số âm là đúng | |
| `_health_block_a.coverage` = `operating_profit / abs(interest_expense)` | **Có** | dương |
| `bank_dupont.opex_to_ta / provision_to_ta / tax_to_ta` | **Có** | dương |
| `working_capital_cycle.inv_net` = `inv_gross - abs(inv_provision)` | **Có** | |

> **Hai chỗ trên là lệch dấu đã có trong bản Python** (`cost_of_risk`, `provision_ppop` âm; `dio`/`dpo`
> âm kéo `ccc = dso + dio - dpo` sai hướng). **Bản TS phải sao chép nguyên** để giữ tương thích số
> liệu với frontend hiện tại. Nếu muốn sửa, phải coi là **thay đổi hành vi có chủ ý**, đổi cả frontend
> và ngưỡng benchmark (`cost_of_risk` có ngưỡng `(0.01, 0.02, down)` giả định giá trị **dương**).

#### 8. Lớp ngưỡng của engine forensic — `thresholds.classify`

Dùng cho endpoint `/bctc` (ô `snapshot[].status`). Mỗi metric là danh sách `(giới hạn trên, nhãn)`
theo giá trị **tăng dần**; **giá trị ≤ mốc đầu tiên thỏa thì nhận nhãn đó**.

| metric | Dải | Diễn giải |
|---|---|---|
| `revenue_growth` | ≤0.05 → `red`; ≤0.15 → `amber`; còn lại → `green` | cao = tốt |
| `gross_margin` | ≤0.15 → `red`; ≤0.25 → `amber`; còn lại → `green` | cao = tốt |
| `roe` | ≤0.12 → `red`; ≤0.18 → `amber`; còn lại → `green` | cao = tốt |
| `fcf_margin` | ≤0.0 → `red`; ≤0.08 → `amber`; còn lại → `green` | cao = tốt |
| `nim` | ≤0.025 → `red`; ≤0.035 → `amber`; còn lại → `green` | cao = tốt |
| `equity_ratio` | ≤0.06 → `red`; ≤0.08 → `amber`; còn lại → `green` | cao = tốt |
| `net_debt_ebitda` | ≤1.5 → `green`; ≤3.0 → `amber`; còn lại → `red` | thấp = tốt (âm → `green`) |
| `cir` | ≤0.35 → `green`; ≤0.45 → `amber`; còn lại → `red` | thấp = tốt |
| `ldr` | ≤0.80 → `green`; ≤0.85 → `amber`; còn lại → `red` | thấp = tốt |
| `cost_of_risk` | ≤0.01 → `green`; ≤0.015 → `amber`; còn lại → `red` | thấp = tốt |
| `altman_z` | **nhánh riêng**: >2.99 → `green`; >1.81 → `amber`; còn lại → `red` | |

Quy tắc rìa: `value === null` → `"na"`. Metric không có trong bảng (ví dụ `llr_loans`) → `"na"`
**dù có giá trị**. Ranh giới là **≤** (đúng tại mốc thì nhận nhãn của mốc đó): `roe = 0.12` → `red`,
`roe = 0.18` → `amber`, `ldr = 0.85` → `amber`, `net_debt_ebitda = 1.5` → `green`.

~~~ts
function classify(metric: string, value: number | null): ThresholdStatus {
  if (value === null) return "na";
  if (metric === "altman_z") {
    if (value > 2.99) return "green";
    if (value > 1.81) return "amber";
    return "red";
  }
  const bands = THRESHOLDS[metric];
  if (!bands) return "na";
  for (const [ceiling, label] of bands) if (value <= ceiling) return label;
  return "na";  // không đạt được vì mốc cuối là Infinity
}
~~~

#### 9. Cờ kiểm tra tính nhất quán — `validation`

Chỉ **2 trong 4** hàm được gọi trong payload thật:

| Hàm | Được gọi? | Điều kiện phát cờ | Cờ |
|---|---|---|---|
| `sanity_flags(snapshot)` | **Có** | `gross_margin` ∉ [0,1] · `roe` ∉ [−0.5, 0.5] · `nim` ∉ [0.01, 0.08] | `{level:"warn", code:"<key>_out_of_range", message:"<key>=0.900 ngoài khoảng hợp lý [-0.5,0.5]"}` (số format 3 chữ số thập phân) |
| `balance_identity_flag(periods[0])` | **Có** | `abs((tl+eq) − ta) / abs(ta) > 0.005`; bỏ qua nếu thiếu 1 trong 3 hoặc `ta === 0` | `{level:"warn", code:"balance_identity", message:"BCĐKT lệch: Nợ+VCSH ≠ Tổng TS (2025)"}` |
| `cashflow_identity_flag` | **KHÔNG** (dead code) | — | không xuất hiện trong response |
| `yoy_outlier_flag` | **KHÔNG** (dead code) | — | không xuất hiện trong response |

Thứ tự trong mảng `flags`: các cờ `sanity_flags` trước (theo thứ tự `gross_margin`, `roe`, `nim`),
rồi `balance_identity` cuối. Bản TS phải giữ đúng thứ tự này.

#### 10. Nhận diện ngành phụ (chỉ Template A) — `detect_subsector`

Heuristic trên tỷ trọng BCĐKT của **1 kỳ mới nhất**, cộng `ccc` từ chu kỳ vốn lưu động.
**Kiểm theo đúng thứ tự này, dừng ở điều kiện đầu tiên thỏa:**

~~~ts
function detectSubsector(p: Period, ccc: number | null): SubSectorCode {
  const ta = val(p, "total_assets");
  if (ta === null || ta === 0) return "san_xuat";              // thiếu tổng TS → mặc định
  const nfa = (val(p, "net_fixed_assets") ?? 0) / ta;
  const inv = (val(p, "inventory_gross") ?? 0) / ta;
  const bp  = (val(p, "buyer_prepayments") ?? 0) / ta;
  if (bp > 0.15 && inv > 0.30) return "bat_dong_san";
  if (nfa > 0.60) return "tien_ich";
  if (ccc !== null && ccc < 0 && inv > 0.20) return "ban_le";
  if (nfa < 0.20 && inv < 0.05) return "cntt_dichvu";
  return "san_xuat";
}
~~~

Nhãn hiển thị (`subsector_spotlight`):

| Mã | Nhãn |
|---|---|
| `san_xuat` | `Sản xuất / Công nghiệp` |
| `cntt_dichvu` | `CNTT / Dịch vụ` |
| `ban_le` | `Bán lẻ` |
| `bat_dong_san` | `Bất động sản` |
| `tien_ich` | `Tiện ích / Điện` |
| (mã lạ) | `Hỗn hợp` |

`subsector_spotlight(p, sub)` trả `{subsector, label, metrics: {asset_intensity, inventory_ratio}}`
với `asset_intensity = net_fixed_assets / total_assets`, `inventory_ratio = inventory_gross / total_assets`
(cùng quy ước `null` khi mẫu số 0/thiếu).

#### 11. Median ngành — `peer_median` + bảng `sector_median_cache`

**Đầu vào:** `icb_lv2` (TÊN ngành cấp 2, không phải mã) + `asof: Date`. Lấy `icb_lv2` theo thứ tự:
`Symbol.icb_lv2` trong DB → nếu rỗng thì `overview.icb_name_2` từ VCI → nếu vẫn rỗng thì **bỏ hẳn
lớp benchmark** (peer/color/score giữ `null`).

**Bộ chỉ số đầu ra** (union mà lớp ngưỡng đọc), mỗi khóa map sang danh sách tên trường ứng viên đọc
từ dòng ratio **mới nhất** của peer (khớp đầu tiên thắng):

| Khóa median | Trường ứng viên trong `RatioRow` |
|---|---|
| `pe` | `pe` |
| `pb` | `pb` |
| `roe` | `roe` |
| `gross_margin` | `gross_margin`, `gross_profit_margin` |
| `revenue_growth` | `revenue_growth`, `revenue_yoy` |
| `dividend_yield` | `dividend_yield` — **cố ý KHÔNG fallback sang `dividend`** (đó là SỐ TIỀN cổ tức, không phải tỷ suất; lấy median sẽ sai đơn vị) |
| `net_debt_ebitda` | `net_debt_ebitda`, `net_debt_to_ebitda` |
| `dso` | `dso`, `days_sales_outstanding` |

**Cách tính:**

1. **Đọc cache trước.** `SELECT * FROM sector_median_cache WHERE icb_lv2 = ? AND asof_date = ?`.
   Có row → trả `{...tất cả khóa = null, ...row.medians}` (luôn phơi đủ union khóa). **Không fetch gì.**
2. **Miss** → nếu là Postgres: `SELECT pg_advisory_xact_lock($key)` với
   `$key = int64 có dấu từ 8 byte đầu của sha256("<icb_lv2>|<asof ISO>")`. Sau khi có lock,
   **đọc lại cache** (double-check). Không phải Postgres (test sqlite) → bỏ qua lock.
3. **Lấy peer:** gọi screening `fetch_screening_paging(page, page_size=100, sort_fields=["marketCap"],
   sort_orders=["DESC"])`, tối đa **15 trang**. Với mỗi dòng, khớp ngành bằng cách so
   `casefold(target)` với **bất kỳ** trong `icb_code_lv2` / `vi_sector` / `en_sector`. Dừng sớm khi
   đủ `top_k` hoặc `data.last === true` hoặc trang rỗng. Sắp giảm dần theo `market_cap`
   (thiếu → coi là `0`), cắt `top_k`.
4. **Bound số peer:** `top_k = 20` (mặc định, tham số của `get_sector_medians`).
5. **Lấy ratio từng peer:** `fetch_financial_report(ticker, report_type="ratio", period="Y")` dưới
   `Semaphore(5)` + jitter `sleep(random 0.1–0.2s)` trước mỗi call. Peer lỗi → `null`, **không** làm
   fail cả lô. Lấy dòng `rows[0]` (mới nhất trước).
6. **Không đủ peer:** đếm số peer trả về dict dùng được (`collected`). Nếu `< 3` (`_MIN_PEERS`) →
   **trả toàn bộ median = `null`**, vẫn ghi cache với `peer_count` thực tế, **không throw**.
7. **Median:** `statistics.median` trên các giá trị có mặt của từng khóa (khóa nào không peer nào có →
   `null`). Lưu ý median của Python là **trung vị nội suy** (n chẵn → trung bình 2 giá trị giữa).
8. **Upsert cache** trong **SAVEPOINT** (`begin_nested`): update nếu có row, insert nếu chưa. Lỗi
   (đua insert) → chỉ rollback row cache, **không** ảnh hưởng transaction của caller; log warning.

**Bảng cache:**

~~~sql
CREATE TABLE sector_median_cache (
  id          UUID PRIMARY KEY,              -- UUIDMixin
  icb_lv2     VARCHAR(100) NOT NULL,         -- index
  asof_date   DATE         NOT NULL,         -- index
  medians     JSONB        NOT NULL,         -- JSON trên sqlite, JSONB trên Postgres
  peer_count  INTEGER      NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_sector_median_icb_asof UNIQUE (icb_lv2, asof_date)
);
~~~

**TTL:** không có TTL kiểu Redis. Vòng đời là **1 row / 1 ngành / 1 ngày** — `asof = date.today()` của
server, nên cache tự "hết hạn" khi sang ngày mới (row cũ vẫn nằm lại, không ai xoá). Bản TS cần một
job dọn hoặc chấp nhận bảng lớn dần.

> **Bẫy đơn vị ROE (chưa giải quyết trong bản Python).** `medians.roe` lấy nguyên từ trường `roe` của
> ratio VCI, còn `metrics.roe` của dashboard là **phân số** tính từ báo cáo. Fixture trong repo không
> nhất quán: `tests/test_peer_median.py` dùng `roe` = 18.0…26.0 (như phần trăm), còn
> `tests/test_bctc_dashboard_compute.py` dùng `roe` = 0.25 (phân số). **Thang thật của trường `roe`
> trong `/statistics-financial` là CHƯA XÁC ĐỊNH — xem `app/services/market_data/sources/vietcap.py`
> (`fetch_financial_report`, nhánh `RATIO`).** Nếu là phần trăm thì việc so `metrics.roe` (0.2491) với
> `peer_median` (22.0) và ngưỡng `(0.18, 0.12)` là lệch 100×. Bản TS phải: (a) sao chép nguyên hành vi,
> và (b) ghi TODO ở chỗ này, **không** tự thêm phép nhân/chia 100.

#### 12. Lớp benchmark của dashboard — `apply_benchmark`

Thuần hàm, biến đổi **tại chỗ** cây `BctcDashboardData` + dict median. Ba việc:

**(a) Chuẩn hóa mã ngành phụ** từ `data.sub_sector` (là **NHÃN** tiếng Việt, ví dụ `"CNTT / Dịch vụ"`):

~~~ts
function subsectorKey(subSector: string | null): string {
  const t = (subSector ?? "").trim().toLocaleLowerCase();   // casefold
  if (!t) return "default";
  if (t.includes("bất động sản") || t.includes("bat_dong_san") || t.includes("bất động")) return "bat_dong_san";
  if (t.includes("bán lẻ") || t.includes("ban_le")) return "ban_le";
  if (t.includes("tiện ích") || t.includes("tien_ich")) return "tien_ich";
  if (t.includes("cntt") || t.includes("dịch vụ") || t.includes("cntt_dichvu")) return "cntt_dichvu";
  if (t.includes("sản xuất") || t.includes("san_xuat")) return "san_xuat";
  return "default";
}
~~~

**(b) Ngưỡng metric** `(green, red, direction)` — bộ `default`, phủ bởi override theo ngành phụ:

| metric key | green | red | direction | Ghi chú |
|---|---|---|---|---|
| `revenue_growth` | 0.15 | 0.05 | up | A · Khối 4 |
| `gross_margin` | 0.25 | 0.15 | up | A · Khối 4 |
| `roe` | 0.18 | 0.12 | up | dùng chung A/B |
| `cfo_ni` | 1.0 | 0.5 | up | A · Khối 5, đơn vị × |
| `fcf_margin` | 0.08 | 0.0 | up | A · Khối 5 |
| `accrual` | 0.05 | 0.15 | **down** | A · Khối 5, thấp = tốt |
| `pe` | 12.0 | 22.0 | **down** | A · Khối 2 |
| `pb` | 1.5 | 3.0 | **down** | A · Khối 2 |
| `nim` | 0.035 | 0.025 | up | B · Khối 4 |
| `roa` | 0.015 | 0.008 | up | B · Khối 4 |
| `cir` | 0.35 | 0.45 | **down** | B · Khối 5 |
| `cost_of_risk` | 0.01 | 0.02 | **down** | B · Khối 5 |
| `provision_ppop` | 0.25 | 0.45 | **down** | B · Khối 5 |

Override theo ngành phụ:

| Ngành phụ | Override | Lý do |
|---|---|---|
| `bat_dong_san` | `cfo_ni = (0.3, -1.0, up)`, `fcf_margin = (-0.05, -0.30, up)` | dòng tiền âm nhiều năm là bình thường (đang xây dự án) → tránh cờ đỏ giả |
| `ban_le` | `gross_margin = (0.12, 0.05, up)` | biên gộp mỏng là bản chất ngành |

Metric **không có** trong bảng (`justified_pb`, `provision_ppop` ở A, …) → **không thêm khóa `color`**.

**(c) Ngưỡng trục radar** `(green, red, direction)`:

| dim key | green | red | direction | Giá trị nền |
|---|---|---|---|---|
| `business` | 0.15 | 0.05 | up | `revenue_growth` (A) |
| `profitability` | 0.18 | 0.12 | up | `roe` (A & B) |
| `cashflow` | 1.0 | 0.5 | up | `cfo_ni` (A, ×) |
| `safety` | 1.5 | 3.0 | **down** | `net_debt_ebitda` (A, ×) |
| `valuation` | 0.15 | −0.10 | up | `upside_pct` (A & B) |
| `growth` | 0.15 | 0.0 | up | tăng trưởng TOI (B) |
| `asset_quality` | 0.012 | 0.03 | **down** | `llr_loans` proxy NPL (B) |
| `capital` | 0.10 | 0.06 | up | `equity_ratio` (B) |

Override ngành phụ: `bat_dong_san` → `cashflow = (0.3, -1.0, up)`.

**Fallback giá trị trục** khi `dim.value === null`: `business → revenue_growth`,
`profitability → roe`, `cashflow → cfo_ni` (lấy từ map metric đã thu, **lần gặp đầu tiên thắng** —
`setdefault`). Thứ tự duyệt block là thứ tự chèn: `financial → business → cashflow → valuation →
health → dividend`, nên `roe` lấy từ block `business` (phân số tính từ báo cáo), **không** lấy
`roe` của block `valuation` (từ ratio VCI). Trục không có fallback (`safety`, `valuation`, `growth`,
`asset_quality`, `capital`) mà `value === null` → **bỏ qua**, `score`/`band` giữ `null`.

**Công thức màu / dải / điểm:**

~~~ts
function color(
  value: number | null, peer: number | null,
  green: number, red: number, direction: "up" | "down",
): BenchmarkColor | null {
  if (value === null) return null;
  if (direction === "up") {
    if (value <= red) return "red";
    // Xanh đòi HAI điều kiện: vượt mốc tuyệt đối VÀ không kém median ngành
    if (value >= green && (peer === null || value >= peer)) return "green";
    return "amber";
  }
  if (value >= red) return "red";
  if (value <= green && (peer === null || value <= peer)) return "green";
  return "amber";
}

function band(value: number, green: number, red: number, direction: "up" | "down"): RadarBand {
  if (direction === "up") {
    if (value >= green) return "good";
    if (value <= red) return "warn";
    return "ok";
  }
  if (value <= green) return "good";
  if (value >= red) return "warn";
  return "ok";
}

/** Neo: value tại `red` → 30 điểm; tại `green` → 75 điểm. Nội suy tuyến tính, kẹp [0,100]. */
function score(value: number, green: number, red: number, direction: "up" | "down"): number {
  const RED_ANCHOR = 30.0, GREEN_ANCHOR = 75.0;
  const span = direction === "up" ? (green - red) : (red - green);
  let raw: number;
  if (span === 0) {
    raw = band(value, green, red, direction) === "good" ? GREEN_ANCHOR : RED_ANCHOR;
  } else {
    const progress = direction === "up" ? (value - red) : (red - value);
    raw = RED_ANCHOR + (progress / span) * (GREEN_ANCHOR - RED_ANCHOR);
  }
  return Math.round(Math.max(0, Math.min(100, raw)));
}
~~~

> **Bẫy làm tròn:** Python `int(round(x))` dùng **banker's rounding** (0.5 → số chẵn gần nhất),
> JS `Math.round` làm tròn lên (0.5 → 1). Chênh 1 điểm ở đúng mốc .5. Nếu cần khớp bit-đối-bit thì
> phải cài `roundHalfToEven`; nếu không, ghi rõ là chênh lệch được chấp nhận.

**Điểm quan trọng:** `peer_median` chỉ được ghi khi `medians[key] !== null`. Nếu median là `null`,
khóa `peer_median` **giữ nguyên `null`** (đã có sẵn từ tầng compute) — không xoá khóa.

#### 13. Lớp AI narrative & `ai_guard` — fail-closed

Không thuộc 3 endpoint chương này (xem **chương 29**) nhưng phải hiểu để không nhét chữ vào payload
của 3 endpoint trên: **`/bctc` và `/bctc-dashboard` KHÔNG chứa bất kỳ trường chữ do AI sinh.**

**`validate_narrative(out, template) → string[]`** (rỗng ⇒ hợp lệ). Kiểm:

1. **Cấu trúc top-level chính xác**: đúng bộ `{verdict_oneliner, story, blocks}` — có key thừa là lỗi.
2. `verdict_oneliner` là chuỗi không rỗng.
3. `story` đúng bộ `{lead, paragraphs, strengths, watchlist}`; `lead` không rỗng;
   `paragraphs` là mảng **đúng 3 phần tử**; `strengths` và `watchlist` là mảng **không rỗng**.
4. `blocks` đúng bộ khóa theo template:
   - **A**: `valuation`, `financial`, `business`, `cashflow`, `health`, `dividend`
   - **B**: `valuation`, `financial`, `earning`, `efficiency`, `asset_quality`, `dividend`
5. Mỗi block có `answer` là chuỗi không rỗng. Block đơn giản chỉ được có khóa `answer`.
   `health` (A) phải có `sub` với **đúng** `{a, b, c}`; `asset_quality` (B) phải có `sub` với
   **đúng** `{a, b}`; mỗi sub-key là chuỗi không rỗng.
6. **Cấm tên mô hình học thuật** trong **mọi** chuỗi (đệ quy toàn cây, so khớp không phân biệt hoa
   thường): `altman`, `z-score`, `piotroski`, `f-score`, `beneish`, `m-score`, `dupont`, `sloan`,
   `accrual`.
7. **Cấm khuyến nghị**: `nên mua`, `nên bán`, `nên giữ`, `khuyến nghị`.

**Vòng thử lại + fail-closed** (`generate_narrative`):

- Tối đa `max_retries + 1 = 4` lượt gọi. Lượt sau nối thêm khối `"=== SỬA LỖI ==="` liệt kê lỗi lượt trước.
- Parse JSON khoan dung: bỏ fence ```` ```json ````, nếu vẫn lỗi thì cắt từ `{` đầu đến `}` cuối.
- Không parse được JSON ở **mọi** lượt → **throw** `AIProxyError("AI không trả về JSON hợp lệ cho
  narrative BCTC sau 4 lần thử")` → endpoint chương 29 trả **502**.
- Còn lỗi sau khi hết lượt:
  - Lỗi bắt đầu bằng `"Cấm tên mô hình học thuật"` hoặc `"Cấm khuyến nghị"` → **FAIL CLOSED**, throw
    `AIProxyError("narrative BCTC vi phạm quy tắc bắt buộc sau N lần thử: [...]")` → **502**.
    Nội dung vi phạm **không bao giờ** tới người dùng.
  - Lỗi thuần cấu trúc → **best-effort**: trả bản parse cuối, log warning.

**`ai_guard` (dùng cho `/ai-analysis/bctc/{symbol}`, không dùng cho narrative dashboard):**

- `extract_allowed_numbers(payload)` — đi đệ quy toàn payload, với mỗi số thêm `round(v,4)` **và**
  `round(v*100,2)` vào tập cho phép (bỏ boolean).
- `sanitize_ai_output(text, allowed) → {ok, violations}`:
  - text rỗng → `{ok:false, violations:["empty"]}`
  - khớp cụm cấm (regex, không phân biệt hoa thường): `khuyến nghị`, `\bmua\b`, `\bbán\b`,
    `\bgiữ (mã|cổ)\b`, `\bbuy\b`, `\bsell\b`, `\bhold\b`, `target price`, `giá mục tiêu`
    → `"banned_phrase: '<khớp>'"`
  - mọi token số `-?\d[\d,]*\.?\d*` phải "được phép": thử **cả 2 locale** (`,` = nghìn EN và
    `,` = thập phân VI), whitelist số nguyên **1990–2100** (coi là năm), và thử mọi thang
    `(1, 0.01, 100, 1e9, 1e-9, 1e6)`; "gần" nghĩa là `|n−a| ≤ 0.05` **hoặc** sai số tương đối ≤ 2%.
    Không đạt → `"fabricated_number: <token>"`.
- Nơi dùng: memo/note nào **không** `ok` bị **thay bằng chuỗi rỗng / bị loại khỏi dict**, không throw.

#### 14. Cache Redis & rate limit (áp cho cả 3 endpoint)

- **Decorator** `redis_cached(ttl_setting="REDIS_TTL_MACRO_SECONDS")` → **TTL 900s (15 phút)**.
- **Khóa:** `iqx:api:v1:{path_đã_chuẩn_hóa}:{md5_12}` với `md5_12` = 12 ký tự đầu md5 của chuỗi
  `k1=v1&k2=v2` (query param đã **sắp theo tên**, bỏ param rỗng/None); không có param → `_`.
- **Chuẩn hóa path:** chỉ segment đứng **ngay sau** một trong `{quotes, company, trading,
  fundamentals, tickers}` được **uppercase**.
  → `/fundamentals/fpt/ratio` và `/fundamentals/FPT/ratio` dùng **cùng** khóa.
  → **`/bctc/fpt` và `/bctc/FPT` dùng KHÁC khóa** (vì `bctc` không nằm trong danh sách) dù handler
  đều uppercase symbol. Chỉ gây phân mảnh cache, không sai dữ liệu. Bản TS nên bổ sung `bctc`,
  `bctc-dashboard` vào danh sách để hết phân mảnh (ghi rõ đây là **cải thiện có chủ ý**).
- **Cache HIT** trả về `JSONResponse` kèm header `X-Cache: HIT`. MISS **không** có header này.
- Chỉ cache response 2xx, và chỉ khi body "có dữ liệu" (`cache_empty=false` cho cả 3 endpoint).
- Redis tắt (`REDIS_ENABLED=false`) hoặc lỗi → chạy thẳng handler, không lỗi.
- **Rate limit:** cả 3 endpoint **không** có `@limiter.limit` riêng → dùng **default toàn app
  `60/minute`** theo IP client (slowapi). Vượt → **429**. (Hằng `RATE_LIMIT_MARKET_DATA = "120/minute"`
  tồn tại nhưng chỉ áp cho endpoint OHLCV, không áp ở đây.)
- **`X-Request-ID`:** middleware ngoài cùng đọc header `X-Request-ID` của request hoặc sinh UUID4, và
  luôn phát lại trên response.

#### 15. Xử lý lỗi nguồn — `fetch_with_fallback`

Cả 3 endpoint gói lời gọi VCI vào `fetch_with_fallback([("VCI", fn)])`:

1. Gọi `fn()` → `(data, raw_url)`.
2. **Validator mặc định**: `data === null` → thất bại; `data` là `[]` hoặc `{}` (rỗng) → thất bại.
   Không dùng `allow_empty` ở 3 endpoint này.
3. Thành công → bọc thành `MarketDataResponse` với `source="VCI"`, `source_priority=1`,
   `fallback_used=false`, `as_of=now(UTC)`, `raw_endpoint=raw_url`.
4. Thất bại (exception hoặc rỗng) → throw
   `RuntimeError("Tất cả 1 nguồn dữ liệu thị trường đều thất bại")` → handler bắt và trả **502** với
   `detail` là đúng chuỗi đó.

Hệ quả cần biết:

- `/bctc` và `/bctc-dashboard` **luôn** trả dict không rỗng (kể cả khi không có kỳ nào — xem payload
  "rỗng") ⇒ **502 chỉ xảy ra khi network/provider lỗi**, không xảy ra vì "mã không có BCTC".
- `/fundamentals/.../ratio` trả **mảng** ⇒ mã không có dữ liệu ratio → `[]` → **502**.
- `/fundamentals/.../balance_sheet|income_statement|cash_flow` luôn trả `{Head, Content}` (dict không
  rỗng dù `Head: []`) ⇒ **không** ra 502 vì rỗng.

---

## Nhóm 1 — Báo cáo tài chính thô

### GET /api/v1/market-data/fundamentals/{symbol}/{report_type}

> **Báo cáo tài chính thô theo kỳ** — trả 1 trong 4 báo cáo (CĐKT / KQKD / LCTT / bảng chỉ số) đã
> chuẩn hóa về hình dạng bảng mà frontend dựng trực tiếp.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`, theo IP) |
| **Cache** | Redis key `iqx:api:v1:market-data/fundamentals/{SYMBOL}/{report_type}:{md5_12(query)}`, TTL 900s |
| **Nguồn dữ liệu** | provider ngoài VCI — `/v1/company/{SYMBOL}/financial-statement` + `/financial-statement/metrics`, hoặc `/v1/company/{SYMBOL}/statistics-financial` cho `ratio` |
| **Side-effect** | không ghi DB; chỉ ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau khi `.toUpperCase()` phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán. Handler tự uppercase trước khi kiểm. |
| `report_type` | `string` | Phải thuộc `{balance_sheet, income_statement, cash_flow, ratio}` (so khớp **chính xác**, không uppercase, không trim) | Loại báo cáo. |

**Đầy đủ `report_type` hợp lệ và hình dạng tương ứng:**

| `report_type` | VCI section | Hình dạng `data` | Tham số có tác dụng |
|---|---|---|---|
| `balance_sheet` | `BALANCE_SHEET` | `StatementReport` — khóa trong `Content` là `"CDKT"` | `term_type`, `page_size` |
| `income_statement` | `INCOME_STATEMENT` | `StatementReport` — khóa `"KQKD"` | `term_type`, `page_size` |
| `cash_flow` | `CASH_FLOW` | `StatementReport` — khóa `"LCTT"` | `term_type`, `page_size` |
| `ratio` | `RATIO` (endpoint khác) | `RatioRow[]` (mảng phẳng, mới nhất trước) | **chỉ** `period` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `term_type` | `integer` | không | `2` | `1 ≤ x ≤ 2` | Kỳ báo cáo: `1` = Năm (`length_report = 5`), `2` = Quý (`length_report ∈ 1..4`). **Bị bỏ qua khi `report_type=ratio`.** |
| `page_size` | `integer` | không | `8` | `1 ≤ x ≤ 20` | Số kỳ (số cột) trả về. **Bị bỏ qua khi `report_type=ratio`** — ratio trả toàn bộ kỳ sau khi lọc. |
| `period` | `string` | không | `"Q"` | regex `^[QY]$` (đúng 1 ký tự, chữ hoa) | **Chỉ áp dụng cho `ratio`**: `Q` = giữ dòng quý (`length_report ∈ 1..4`), `Y` = giữ dòng năm. |

> **Chú ý default lệch nhau:** endpoint này default `term_type = 2` (Quý), còn `/bctc` và
> `/bctc-dashboard` default `term_type = 1` (Năm). Đừng "thống nhất" khi viết lại.

**Request body** — —

**Response 200**

~~~ts
type FundamentalsData = StatementReport | RatioRow[];

/** Hình dạng bảng cho 3 báo cáo chính (giữ tương thích với bố cục kiểu KBS cũ). */
interface StatementReport {
  /** Header cột, MỚI NHẤT TRƯỚC, độ dài = min(page_size, số kỳ có sẵn). */
  Head: StatementHead[];
  /**
   * Đúng MỘT khóa: "CDKT" | "KQKD" | "LCTT" tùy report_type.
   * Frontend đơn giản là flatten mọi section.
   */
  Content: Record<string, StatementRow[]>;
}

interface StatementHead {
  /** "Y" khi term_type=1 hoặc length_report ∈ {null, 5}; ngược lại "Q1".."Q4". */
  TermCode: string;
  /** year_report, 0 nếu thiếu. */
  YearPeriod: number;
  /** "2025" cho năm; "Q3/2025" cho quý. */
  TermName: string;
}

interface StatementRow {
  /** Nhãn tiếng Việt của dòng (titleVi, fallback fullTitleVi, đã trim; "" nếu không có). */
  Name: string;
  /** Cấp thụt lề = level của VCI TRỪ 1, kẹp ≥ 0. Dòng cấp 0 là tiêu đề section. */
  Levels: number;
  /** "B" (in đậm) khi Levels === 0, ngược lại "". */
  CssStyle: string;
  /** Số dòng con trực tiếp (đếm theo trường parent). 0 nếu là dòng lá. */
  ChildTotal: number;
  /** Vị trí 1-based của dòng này trong danh sách metadata. */
  ReportNormID: number;
  /** Vị trí 1-based của dòng cha, hoặc null nếu không có cha. */
  ParentReportNormID: number | null;
  /** FieldCode VCI, CHỮ THƯỜNG: "isa3", "bsa53", "cfa18"… */
  FieldCode: string;
  /**
   * Giá trị theo cột: Value1 = kỳ mới nhất … ValueN = kỳ cũ nhất.
   * Số cột = Head.length. Ô thiếu là null (KHÔNG phải 0).
   */
  [valueKey: `Value${number}`]: number | null;
}
~~~

Ví dụ `report_type=income_statement`, `term_type=1`, `page_size=3` cho **FPT** (rút gọn 4 dòng đầu;
số minh họa, đơn vị VND):

~~~json
{
  "data": {
    "Head": [
      { "TermCode": "Y", "YearPeriod": 2025, "TermName": "2025" },
      { "TermCode": "Y", "YearPeriod": 2024, "TermName": "2024" },
      { "TermCode": "Y", "YearPeriod": 2023, "TermName": "2023" }
    ],
    "Content": {
      "KQKD": [
        {
          "Name": "KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
          "Levels": 0,
          "CssStyle": "B",
          "ChildTotal": 12,
          "ReportNormID": 1,
          "ParentReportNormID": null,
          "FieldCode": "isa0",
          "Value1": null,
          "Value2": null,
          "Value3": null
        },
        {
          "Name": "Doanh thu thuần",
          "Levels": 1,
          "CssStyle": "",
          "ChildTotal": 0,
          "ReportNormID": 3,
          "ParentReportNormID": 1,
          "FieldCode": "isa3",
          "Value1": 78600000000000,
          "Value2": 66600000000000,
          "Value3": 55700000000000
        },
        {
          "Name": "Giá vốn hàng bán",
          "Levels": 1,
          "CssStyle": "",
          "ChildTotal": 0,
          "ReportNormID": 4,
          "ParentReportNormID": 1,
          "FieldCode": "isa4",
          "Value1": -48500000000000,
          "Value2": -41200000000000,
          "Value3": -34500000000000
        },
        {
          "Name": "Lợi nhuận gộp",
          "Levels": 1,
          "CssStyle": "",
          "ChildTotal": 0,
          "ReportNormID": 5,
          "ParentReportNormID": 1,
          "FieldCode": "isa5",
          "Value1": 30100000000000,
          "Value2": 25400000000000,
          "Value3": 21200000000000
        }
      ]
    }
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T03:12:44.918273Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/financial-statement"
  }
}
~~~

Ví dụ `report_type=ratio`, `period=Y` cho **VCB** (rút gọn 2 dòng):

~~~json
{
  "data": [
    {
      "year_report": 2025,
      "length_report": 5,
      "pe": 14.6,
      "pb": 2.35,
      "roe": 0.1672,
      "eps": 6090.0,
      "bvps": 39200.0,
      "dividend": 1.0,
      "market_cap": 336000000000000,
      "number_of_shares_mkt_cap": 5600000000,
      "revenue": 72400000000000,
      "net_profit": 34100000000000,
      "revenue_growth": 0.0631,
      "net_profit_growth": 0.0894
    },
    {
      "year_report": 2024,
      "length_report": 5,
      "pe": 15.9,
      "pb": 2.62,
      "roe": 0.1758,
      "eps": 5590.0,
      "bvps": 33900.0,
      "dividend": 0.8,
      "market_cap": 298000000000000,
      "number_of_shares_mkt_cap": 5600000000,
      "revenue": 68100000000000,
      "net_profit": 31300000000000,
      "revenue_growth": 0.0842,
      "net_profit_growth": 0.1035
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T03:12:45.402118Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/VCB/statistics-financial"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | `detail` (nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` sau uppercase không khớp `^[A-Z0-9]{1,10}$` | `Mã chứng khoán không hợp lệ: FPT-A` |
| 422 | — | `report_type` không thuộc 4 giá trị hợp lệ | `Giá trị report_type 'pnl' không hợp lệ. Cho phép: ['balance_sheet', 'cash_flow', 'income_statement', 'ratio']` |
| 422 | `less_than_equal` / `greater_than_equal` | `term_type` ∉ [1,2] hoặc `page_size` ∉ [1,20] | Mảng `HTTPValidationError` do FastAPI sinh, ví dụ `[{"loc":["query","page_size"],"msg":"Input should be less than or equal to 20","type":"less_than_equal","input":"50"}]` |
| 422 | `string_pattern_mismatch` | `period` không khớp `^[QY]$` (kể cả `"q"` chữ thường) | `[{"loc":["query","period"],"msg":"String should match pattern '^[QY]$'","type":"string_pattern_mismatch","input":"q"}]` |
| 429 | — | Vượt `60/minute` | Thông điệp của slowapi |
| 502 | — | VCI lỗi/timeout, hoặc `ratio` trả `[]` | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

> Chú ý: danh sách trong lỗi `report_type` là **đã sort theo alphabet** (`sorted(set)`), nên
> `cash_flow` đứng trước `income_statement`. Bản TS phải hardcode đúng thứ tự này để khớp string.
> Ngoài ra `detail` của 2 lỗi 422 đầu là **chuỗi**, không phải mảng — khác hình dạng với 422 do
> FastAPI/pipe validation sinh. Bản TS phải giữ đúng cả 2 hình dạng.

**Fallback / suy giảm**

- **Không có nguồn thứ hai.** Chỉ VCI; VCI lỗi → 502 ngay.
- **Bucket kỳ rỗng:** với 3 báo cáo chính, backend lấy `raw["quarters"]` (term_type=2) hoặc
  `raw["years"]` (term_type=1); nếu rỗng thì thử dạng số ít (`quarter`/`year`); nếu vẫn rỗng thì
  **lấy bất kỳ bucket khác không rỗng** trong response. Nghĩa là **`term_type` có thể bị "âm thầm bỏ
  qua"** khi VCI chỉ điền một bucket → trả kỳ quý dù xin kỳ năm. Hành vi hiện tại, giữ nguyên.
- **Metadata rỗng:** nếu `/financial-statement/metrics` không có section tương ứng → `Content[key]`
  là `[]`, `Head` vẫn có (từ dữ liệu kỳ). Response vẫn 200 (dict không rỗng).
- **Ít kỳ hơn `page_size`:** trả đủ số kỳ có, không đệm cột giả.
- **`period=Y` mà năm chưa chốt:** giữ `length_report = 5`; nếu năm nào **không có** dòng
  `length_report = 5` thì **dùng `length_report = 4` (Q4) thay thế** cho riêng năm đó.
- **Ngoài giờ giao dịch:** không ảnh hưởng — dữ liệu BCTC theo kỳ, không realtime.

**curl**

~~~bash
curl -sS -X GET \
  "https://api.iqx.vn/api/v1/market-data/fundamentals/FPT/income_statement?term_type=1&page_size=5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 3f1c9a52-2d61-4f0e-9c7c-8e51b0a7d411"
~~~

~~~bash
# Bảng chỉ số theo NĂM (period chỉ có tác dụng với report_type=ratio)
curl -sS -X GET \
  "https://api.iqx.vn/api/v1/market-data/fundamentals/VCB/ratio?period=Y" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 8a02d7be-51f4-4a29-b6cd-1d90c4e2f7aa"
~~~

**Ghi chú khi viết lại**

1. **Thứ tự kiểm tra bắt buộc:** (a) uppercase `symbol`; (b) kiểm regex symbol → 422; (c) kiểm
   `report_type` → 422; (d) mới gọi VCI. Đảo (b)/(c) sẽ đổi `detail` trả về khi cả hai đều sai.
2. `report_type` **không** được uppercase/trim — `"Ratio"` hay `" ratio"` là 422.
3. `page_size` và `term_type` **không** ảnh hưởng `ratio`; nhưng vì chúng nằm trong query nên **vẫn
   thay đổi khóa cache** → cùng dữ liệu bị cache 2 lần. Chấp nhận được.
4. `Levels = max(level_VCI − 1, 0)`. Đừng quên trừ 1.
5. `ParentReportNormID` là **vị trí 1-based trong danh sách metadata**, không phải `FieldCode`. Phải
   tra ngược bằng cách tìm index của `parent` (đã lowercase) trong `meta_rows`; không tìm thấy → `null`.
6. `ChildTotal` đếm theo trường `parent` của metadata, tính **trước** khi dựng dòng.
7. Dòng metadata **không có `field`** bị **bỏ** khỏi danh sách — điều này làm dịch chuyển
   `ReportNormID` so với thứ tự gốc của VCI. Giữ nguyên hành vi.
8. Chuẩn hóa key VCI camelCase → snake_case xảy ra ở tầng fetch (`year_report`, `length_report`,
   `market_cap`, `number_of_shares_mkt_cap`…), nhưng **`FieldCode` thì lowercase**, không snake_case.
9. Với `ratio`, backend còn **enrich**: điền `revenue`/`net_profit`/`eps` theo bảng fallback, rồi nếu
   vẫn thiếu thì **suy từ KQKD** theo `(year_report, length_report)` (ngân hàng: `revenue = isb38 ||
   isb27`, `net_profit = isb43 || isa22`; phi ngân hàng: `revenue = isa3`, `net_profit = isa22`;
   `eps = isa23 || isa24`); suy `bvps = market_cap / pb / number_of_shares_mkt_cap` khi thiếu; rồi
   tính `revenue_growth` / `net_profit_growth` YoY (so với `(year−1, cùng length)`) khi thiếu.
   **Điều kiện "thiếu" là falsy** (`None`, `0`, `0.0`) — không chỉ `None`.
10. Sắp xếp cuối cùng của `ratio`: giảm dần theo `(year_report, length_report)` → **mới nhất trước**.
11. **Ratio lọc SAU khi enrich**: growth YoY được tính trên tập chưa lọc rồi mới lọc theo `period`.
    Đảo thứ tự sẽ làm mất growth của kỳ biên.

---

## Nhóm 2 — Bản phân tích BCTC forensic

### GET /api/v1/market-data/bctc/{symbol}

> **Bản phân tích BCTC forensic** — trả toàn bộ KPI đã tính sẵn: thẻ snapshot 6 ô, 4 module phân tích,
> bảng cờ xanh/đỏ, 3 điểm forensic (trinity), điểm mù, ngành phụ và định giá.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`, theo IP) |
| **Cache** | Redis key `iqx:api:v1:market-data/bctc/{symbol nguyên dạng}:{md5_12(query)}`, TTL 900s |
| **Nguồn dữ liệu** | provider ngoài VCI (3 báo cáo + bảng ratio) + **tính toán** toàn bộ KPI ở backend |
| **Side-effect** | không ghi DB; chỉ ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau `.toUpperCase()` phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán. |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `term_type` | `integer` | không | **`1`** | `1 ≤ x ≤ 2` | `1` = Năm, `2` = Quý. Quyết định bucket VCI (`years`/`quarters`) và nhãn kỳ. |

**Request body** — —

**Response 200**

~~~ts
interface BctcForensicData {
  /** "A" = phi ngân hàng, "B" = ngân hàng. */
  template: BctcTemplate;
  /** Dạng chữ của template. Luôn khớp: A ↔ "nonbank", B ↔ "bank". */
  sector: "nonbank" | "bank";
  /** Nhãn mọi kỳ có dữ liệu, MỚI NHẤT TRƯỚC. "2025" (năm) / "Q3/2025" (quý). Không giới hạn 5. */
  periods: string[];
  /** ĐÚNG 6 ô, thứ tự cố định theo template (xem 2 bảng dưới). */
  snapshot: SnapshotCell[];
  /** ĐÚNG 4 module, thứ tự cố định theo template. */
  modules: BctcModule[];
  forensic: { green: string[]; red: string[] };
  /** Cờ nhất quán dữ liệu. Mảng rỗng nếu không có cờ nào. */
  flags: BctcFlag[];
  /** 3 điểm forensic. Là {} (object RỖNG) khi không có kỳ nào. */
  trinity: BctcTrinity | Record<string, never>;
  /** 4 điểm mù cho ngân hàng; MẢNG RỖNG cho phi ngân hàng. */
  blind_spots: string[];
  /** null khi là ngân hàng hoặc khi không có kỳ nào. */
  subsector: SubsectorSpotlight | null;
  /** null CHỈ khi không có kỳ nào. */
  valuation: ValuationNonbank | ValuationBank | null;
}

interface SnapshotCell {
  key: string;
  /** Nhãn tiếng Việt cố định (bảng dưới). */
  label: string;
  /** "%" | "x" | "" — chỉ để hiển thị; giá trị KHÔNG được nhân 100 ở backend. */
  unit: "%" | "x" | "";
  value: number | null;
  status: ThresholdStatus;
}

interface BctcModule {
  id: string;
  title: string;
  type: "common_size_table" | "wcc" | "cf_bridge" | "dupont" | "ratios";
  data: unknown; // hình dạng theo id — xem từng interface dưới
}

interface BctcFlag {
  level: "warn" | "info";
  code: string;
  message: string;
}

interface BctcTrinity {
  /** null cho ngân hàng (cố ý). */
  altman_z: number | null;
  piotroski_f: { score: number | null; criteria: Record<string, boolean | null> };
  beneish_m: number | null;
}

interface SubsectorSpotlight {
  subsector: SubSectorCode;
  label: string;
  metrics: {
    asset_intensity: number | null;   // net_fixed_assets / total_assets
    inventory_ratio: number | null;   // inventory_gross / total_assets
  };
}
~~~

#### Snapshot — Template A (phi ngân hàng), thứ tự cố định

| # | `key` | `label` | `unit` | Công thức | Khoảng hợp lệ | Ngưỡng (`status`) |
|---|---|---|---|---|---|---|
| 1 | `revenue_growth` | `Tăng trưởng Doanh thu` | `%` | `net_revenue[t] / net_revenue[t-1] − 1`. `null` nếu thiếu kỳ trước hoặc `net_revenue[t-1] === 0`. | không giới hạn | ≤0.05 red · ≤0.15 amber · > green |
| 2 | `gross_margin` | `Biên Lợi nhuận gộp` | `%` | `gross_profit / net_revenue` | cờ sanity nếu ∉ [0, 1] | ≤0.15 red · ≤0.25 amber · > green |
| 3 | `roe` | `ROE` | `%` | `NI / avgEquity` với `NI = npat_parent` (nếu ≠0/≠null) **hoặc** `npat`; `avgEquity = avg2(equity_parent)` (nếu ≠0) **hoặc** `avg2(equity)` | cờ sanity nếu ∉ [−0.5, 0.5] | ≤0.12 red · ≤0.18 amber · > green |
| 4 | `net_debt_ebitda` | `Nợ ròng / EBITDA` | `x` | `((st_debt + lt_debt) − (cash + st_investments)) / (operating_profit + depreciation)`. **Thiếu BẤT KỲ 1 trong 6 đầu vào → `null`.** `ebitda === 0` → `null`. Âm = dư tiền. | không giới hạn | ≤1.5 green · ≤3.0 amber · > red |
| 5 | `fcf_margin` | `Biên FCF` | `%` | `(cfo + capex) / net_revenue` — `capex` lưu **âm** nên đây là phép **trừ** thực chất | không giới hạn | ≤0 red · ≤0.08 amber · > green |
| 6 | `altman_z` | `Điểm Z Altman` | `` (rỗng) | `1.2·A + 1.4·B + 3.3·C + 0.6·D + 1.0·E` với `A=(current_assets−current_liabilities)/total_assets`, `B=retained_earnings/total_assets`, `C=operating_profit/total_assets`, `D=equity/total_liabilities`, `E=net_revenue/total_assets`. **Thiếu bất kỳ 1 trong 8 đầu vào, hoặc `total_assets===0`, hoặc `total_liabilities===0` → `null`.** | không giới hạn | >2.99 green · >1.81 amber · còn lại red |

#### Snapshot — Template B (ngân hàng), thứ tự cố định

| # | `key` | `label` | `unit` | Công thức | Khoảng hợp lệ | Ngưỡng (`status`) |
|---|---|---|---|---|---|---|
| 1 | `nim` | `NIM` | `%` | `net_interest_income / avgEarningAssets`; `avgEarningAssets` = bình quân 2 kỳ của **tổng phái sinh** `earning_assets` (5 concept, xem §5) | cờ sanity nếu ∉ [0.01, 0.08] | ≤0.025 red · ≤0.035 amber · > green |
| 2 | `roe` | `ROE` | `%` | `npat / avg2(equity)` — **ngân hàng dùng `npat`, KHÔNG dùng `npat_parent`** (khác nhánh A) | cờ sanity nếu ∉ [−0.5, 0.5] | ≤0.12 red · ≤0.18 amber · > green |
| 3 | `ldr` | `LDR` | `%` | `customer_loans / customer_deposits` (cho vay **gross**) | không giới hạn | ≤0.80 green · ≤0.85 amber · > red |
| 4 | `equity_ratio` | `VCSH / Tổng TS` | `%` | `equity / total_assets` | không giới hạn | ≤0.06 red · ≤0.08 amber · > green |
| 5 | `llr_loans` | `Dự phòng / Cho vay` | `%` | `abs(loan_loss_reserve) / customer_loans` | không giới hạn | **`"na"` LUÔN LUÔN** — metric này **không có** trong bảng ngưỡng |
| 6 | `cir` | `CIR` | `%` | `abs(operating_expense) / total_operating_income` | không giới hạn | ≤0.35 green · ≤0.45 amber · > red |

> **Bẫy:** `llr_loans` có giá trị nhưng `status` luôn `"na"` vì `thresholds._THRESHOLDS` không định
> nghĩa nó. Đây là hành vi hiện tại — bản TS **không** được tự thêm ngưỡng.

#### Module — Template A, thứ tự cố định

**A1. `common_size` · `"Common-Size KQKD"` · type `common_size_table`**

~~~ts
interface CommonSizeTable {
  /** Nhãn cột, CŨ → MỚI (đảo ngược so với `periods`!), tối đa 5 cột. */
  columns: string[];
  /** ĐÚNG 6 dòng, thứ tự cố định. */
  rows: CommonSizeRow[];
}

interface CommonSizeRow {
  key: "cogs_pct" | "gross_margin" | "selling_pct" | "admin_pct" | "ebit_margin" | "net_margin";
  label: string;
  /** true cho dòng biên (subtotal) → frontend in đậm. */
  emphasis: boolean;
  unit: "%";
  /** Độ dài LUÔN = columns.length. Ô thiếu là null. */
  values: Array<number | null>;
}
~~~

| # | `key` | `label` | `emphasis` | Công thức (mẫu số = `net_revenue`) |
|---|---|---|---|---|
| 1 | `cogs_pct` | `Giá vốn hàng bán` | `false` | `abs(cogs) / net_revenue` |
| 2 | `gross_margin` | `Biên lợi nhuận gộp` | **`true`** | `gross_profit / net_revenue` |
| 3 | `selling_pct` | `Chi phí bán hàng` | `false` | `abs(selling_expense) / net_revenue` |
| 4 | `admin_pct` | `Chi phí quản lý DN` | `false` | `abs(admin_expense) / net_revenue` |
| 5 | `ebit_margin` | `Biên EBIT (LN thuần HĐKD)` | **`true`** | `operating_profit / net_revenue` |
| 6 | `net_margin` | `Biên LNST` | `false` | `npat / net_revenue` |

**A2. `wcc` · `"Chu kỳ Vốn lưu động"` · type `wcc`**

~~~ts
interface WccTable {
  /** Nhãn cột, CŨ → MỚI, tối đa 5. */
  columns: string[];
  /** ĐÚNG 4 dòng, thứ tự cố định. */
  rows: Array<{
    key: "dso" | "dio" | "dpo" | "ccc";
    label: string;
    values: Array<number | null>;
  }>;
  /** Bộ giá trị của cột MỚI NHẤT (dùng cho dải công thức). Luôn có 4 khóa. */
  latest: { dso: number | null; dio: number | null; dpo: number | null; ccc: number | null };
}
~~~

| `key` | `label` | Công thức (cơ sở **365** ngày) | Đơn vị |
|---|---|---|---|
| `dso` | `DSO — Phải thu` | `avg2(trade_receivables) / net_revenue × 365` | ngày |
| `dio` | `DIO — Tồn kho` | `invNet / cogs × 365` với `invNet = avg2(inventory_gross) − abs(avg2(inventory_provision) ‖ 0)` — **`cogs` RAW (âm) → DIO âm** | ngày |
| `dpo` | `DPO — Phải trả` | `avg2(trade_payables) / cogs × 365` — **`cogs` RAW (âm) → DPO âm** | ngày |
| `ccc` | `CCC — Chu kỳ tiền mặt` | `dso + dio − dpo`; `null` nếu **bất kỳ** trong 3 là `null` | ngày |

Ghi chú tính toán từng cột: cột thứ `i` (chỉ số trong `periods`) dùng `prev = periods[i+1]` (kỳ **cũ
hơn**) để bình quân số dư; cột cũ nhất trong `periods` không có `prev` → `avg2` trả luôn giá trị kỳ đó.
`inventory_provision` thiếu → coi như **`0`** (không phải `null`) vì "không trích lập = tồn kho giá gốc".

**A3. `cf_bridge` · `"Cầu nối Dòng tiền"` · type `cf_bridge`** — chỉ tính cho **kỳ mới nhất**.

~~~ts
interface CashFlowBridge {
  ni: number | null;            // npat
  depreciation: number | null;  // cfa2
  provisions: number | null;    // provisions_cf (cfa3)
  cfo: number | null;
  capex: number | null;         // âm
  fcf: number | null;           // cfo + capex; null nếu thiếu 1 trong 2
  /** cfo − (ni + (dep‖0) + (prov‖0)). null nếu cfo hoặc ni thiếu. */
  wc_change: number | null;
  /** ĐÚNG 7 dòng waterfall, thứ tự cố định. */
  lines: Array<{
    key: "ni" | "depreciation" | "provisions" | "wc_change" | "cfo" | "capex" | "fcf";
    label: string;
    value: number | null;
    kind: "base" | "add" | "subtotal" | "sub" | "total";
  }>;
  cfo_ni: number | null;         // cfo / ni — bội số (×)
  fcf_margin: number | null;     // fcf / net_revenue — phân số
  sloan_accrual: number | null;  // (ni − cfo) / total_assets — phân số, thấp = tốt
}
~~~

Thứ tự + nhãn + `kind` của `lines` (bắt buộc y nguyên):

| # | `key` | `label` | `kind` |
|---|---|---|---|
| 1 | `ni` | `Lợi nhuận sau thuế (NI)` | `base` |
| 2 | `depreciation` | `(+) Khấu hao` | `add` |
| 3 | `provisions` | `(+) Dự phòng` | `add` |
| 4 | `wc_change` | `(±) Thay đổi vốn lưu động` | `add` |
| 5 | `cfo` | `= CFO` | `subtotal` |
| 6 | `capex` | `(−) CapEx` | `sub` |
| 7 | `fcf` | `= FCF (Dòng tiền tự do)` | `total` |

> `wc_change` là **số chốt** (plug) để waterfall NI → CFO khớp tuyệt đối, không phải thay đổi vốn lưu
> động thật từ LCTT. Khấu hao/dự phòng thiếu được coi là `0` **chỉ trong công thức này**.

**A4. `dupont` · `"DuPont 5 bước"` · type `dupont`**

~~~ts
interface DupontDecomposition {
  roe: number | null;        // ROE kỳ hiện tại = TÍCH 5 driver
  roe_prev: number | null;   // ROE kỳ trước (tính từ periods[1] với prev = periods[2])
  roe_delta: number | null;  // roe − roe_prev
  /** ĐÚNG 5 driver, thứ tự cố định. */
  drivers: Array<{
    key: "tax_burden" | "interest_burden" | "op_margin" | "asset_turnover" | "equity_multiplier";
    label: string;
    abbr: string;
    unit: "x" | "%";
    value: number | null;
    prev: number | null;
    delta: number | null;         // value − prev; null nếu thiếu 1 trong 2
    contribution: number | null;  // phân rã LMDI, xem dưới
  }>;
}
~~~

| # | `key` | `label` | `abbr` | `unit` | Công thức |
|---|---|---|---|---|---|
| 1 | `tax_burden` | `Gánh nặng thuế` | `TAX BURDEN` | `x` | `npat / profit_before_tax` |
| 2 | `interest_burden` | `Gánh nặng lãi vay` | `INTEREST BRD` | `x` | `profit_before_tax / operating_profit` |
| 3 | `op_margin` | `Biên hoạt động` | `OP MARGIN` | `%` | `operating_profit / net_revenue` |
| 4 | `asset_turnover` | `Vòng quay tài sản` | `ASSET T/O` | `x` | `net_revenue / avg2(total_assets)` |
| 5 | `equity_multiplier` | `Hệ số nhân VCSH` | `EQUITY MULT` | `x` | `avg2(total_assets) / avg2(equity)` |

`roe = tax_burden × interest_burden × op_margin × asset_turnover × equity_multiplier`.
**Nếu bất kỳ driver là `null` → `roe = null`** (không tính tích một phần).

**Phân rã LMDI (logarithmic mean decomposition)** — vì `ROE = ∏ dᵢ` nên
`Σ ln(dᵢ_cur / dᵢ_prev) = ln(ROE_cur / ROE_prev)`, do đó:

~~~
contributionᵢ = roe_delta · ln(dᵢ_cur/dᵢ_prev) / Σⱼ ln(dⱼ_cur/dⱼ_prev)
~~~

Điều kiện tính (**tất cả** phải thỏa, nếu không thì `contribution = null` cho **cả 5**):

1. `roe_delta !== null`;
2. **mọi** driver kỳ hiện tại `!== null` **và `> 0`**;
3. **mọi** driver kỳ trước `!== null` **và `> 0`**.

Trường hợp riêng: nếu `abs(Σ logs) ≤ 1e-12` (ROE không đổi) → `contribution = 0.0` cho cả 5.
Tổng 5 `contribution` (khi tính được) **luôn bằng đúng `roe_delta`** — dùng làm kiểm tra hồi quy.

> **BẪY ROE lệch nhau trong cùng payload:** `snapshot.roe` dùng `npat_parent` + `avg2(equity)`, còn
> `modules[dupont].data.roe` dùng `npat` + `avg2(total_assets)/avg2(equity)`. Với FPT hai số này khác
> nhau đáng kể (0.2491 vs 0.3071). **Đây KHÔNG phải bug — là 2 định nghĩa khác nhau** (ROE cổ đông mẹ
> vs ROE toàn công ty). Bản TS phải giữ cả hai, không "hợp nhất".

#### Module — Template B, thứ tự cố định

Cả 4 module đều có `type: "ratios"` và `data` là object phẳng `Record<string, number | null>`.

**B1. `toi_mix` · `"Cơ cấu Thu nhập (TOI)"`**

| Khóa | Công thức (mẫu số = `total_operating_income`) | Đơn vị |
|---|---|---|
| `nii_pct` | `net_interest_income / TOI` | phân số |
| `fee_pct` | `net_fee_income / TOI` | phân số |
| `trading_pct` | `(fx_income + trading_securities_income + investment_securities_income) / TOI` — **cộng chỉ các concept CÓ MẶT**; không concept nào có mặt → tử số `null` → kết quả `null` | phân số |
| `other_pct` | `other_income_bank / TOI` | phân số |

4 tỷ lệ **không** bắt buộc cộng đủ 1.0 (TOI còn dòng khác).

**B2. `nim_decomp` · `"Phân rã NIM"`**

| Khóa | Công thức | Đơn vị |
|---|---|---|
| `yield_ea` | `interest_income_gross / avgEarningAssets` | phân số |
| `cost_of_funds` | `abs(interest_expense) / avgIBL`; `avgIBL` = bình quân 2 kỳ của tổng phái sinh `interest_bearing_liabilities` (4 concept) | phân số |
| `spread` | `yield_ea − cost_of_funds`; `null` nếu **bất kỳ** trong 2 là `null` | phân số |

**B3. `ppop_cor` · `"PPOP & Chi phí Dự phòng"`**

| Khóa | Công thức | Đơn vị | Ghi chú |
|---|---|---|---|
| `ppop` | `total_operating_income − abs(operating_expense)`; `null` nếu thiếu 1 trong 2 | VND | **KHÔNG dùng `ppop_reported`** — tự tính lại |
| `cir` | `abs(operating_expense) / total_operating_income` | phân số | trùng `snapshot.cir` |
| `provision_ppop` | `provision_expense / ppop` — **RAW, không `abs`** | phân số | **ÂM** với dữ liệu VCI |
| `cost_of_risk` | `provision_expense / avg2(customer_loans)` — **RAW, không `abs`** | phân số | **ÂM** với dữ liệu VCI |

**B4. `bank_dupont` · `"DuPont Ngân hàng"`**

| Khóa | Công thức | Đơn vị |
|---|---|---|
| `roa` | `npat / avg2(total_assets)` | phân số |
| `equity_multiplier` | `avg2(total_assets) / avg2(equity)` | × |
| `roe` | `roa × equity_multiplier`; `null` nếu thiếu 1 trong 2 | phân số |
| `nii_to_ta` | `net_interest_income / avg2(total_assets)` | phân số |
| `non_nii_to_ta` | `(total_operating_income − net_interest_income) / avg2(total_assets)`; tử số `null` nếu thiếu 1 trong 2 | phân số |
| `opex_to_ta` | `abs(operating_expense) / avg2(total_assets)` | phân số |
| `provision_to_ta` | `abs(provision_expense) / avg2(total_assets)` | phân số |
| `tax_to_ta` | `abs(tax_expense) / avg2(total_assets)` | phân số |

#### `forensic` — bảng cờ xanh/đỏ

Đầu vào là một dict `fmetrics` do tầng assemble dựng:

~~~ts
const fmetrics = {
  template,                       // "A" | "B"
  roe_series,                     // (số) ROE của min(3, số kỳ) kỳ đầu, ĐÃ LỌC BỎ null
  net_debt_ebitda,                // từ snapshot
  altman_z,                       // từ snapshot (undefined→null cho template B)
  nim_series,                     // chỉ template B: NIM của min(3, số kỳ) kỳ đầu, ĐÃ LỌC null; template A → null
  cir, ldr, equity_ratio, llr_loans,  // từ snapshot (undefined cho template A)
};
~~~

Luật (`_all_above(series, threshold, n=3)` = **`series` phải có ≥3 phần tử VÀ cả 3 phần tử đầu > threshold**):

**Template A — cờ xanh (theo thứ tự chèn)**

| Điều kiện | Chuỗi thêm vào `green` |
|---|---|
| `_all_above(roe_series, 0.18)` | `ROE bền vững > 18% ba năm` |
| `net_debt_ebitda !== null && < 0` | `Vị thế tiền mặt ròng (Net cash)` |
| `altman_z !== null && > 3.5` | `Tài chính an toàn — Altman Z {z:.2f}` (2 chữ số thập phân) |
| `_all_above(fcf_margin_series, 0.08)` | `FCF generation bền vững > 8%` — **KHÔNG BAO GIỜ CHẠY** (`fcf_margin_series` không được cấp) |
| `gross_margin_delta !== null && > 0.02` | `Biên gộp mở rộng +{gd*10000:.0f}bp/5N` — **KHÔNG BAO GIỜ CHẠY** |

**Template A — cờ đỏ**

| Điều kiện | Chuỗi thêm vào `red` |
|---|---|
| `altman_z !== null && <= 1.81` | `Altman Z {z:.2f} — vùng cảnh báo phá sản` |
| `net_debt_ebitda !== null && > 3` | `Đòn bẩy cao — Net Debt/EBITDA {nde:.1f}x` |
| `dso_change_2y !== null && > 0.20` | `DSO tăng {dc*100:.0f}% trong 2 năm` — **KHÔNG BAO GIỜ CHẠY** |

**Template B — cờ xanh**

| Điều kiện | Chuỗi |
|---|---|
| `_all_above(nim_series, 0.035)` | `NIM top quartile, bền vững > 3.5%` |
| `_all_above(roe_series, 0.18)` | `ROE > 18% sustainable` |
| `cir !== null && < 0.35` | `CIR best-in-class < 35%` |
| `equity_ratio !== null && > 0.08` | `Capital position lành mạnh (VCSH/TS > 8%)` |
| `llr_loans !== null && > 0.025` | `Buffer dự phòng dày (LLR > 2.5%)` |

**Template B — cờ đỏ**

| Điều kiện | Chuỗi |
|---|---|
| `ldr !== null && > 0.85` | `LDR {ldr*100:.0f}% vượt cap NHNN 85%` |
| `cir !== null && > 0.45` | `CIR cao > 45%` |

**Sau cùng, cho cả 2 template:** nếu `red` **rỗng** → push `Không có cờ đỏ trọng yếu`.
`green` **có thể rỗng** và không được đệm gì.

> 3 luật đánh dấu "KHÔNG BAO GIỜ CHẠY" là dead code trong bản Python (`fmetrics` không cấp
> `fcf_margin_series`, `gross_margin_delta`, `dso_change_2y`). Bản TS **nên giữ nguyên code nhưng phải
> biết là không kích hoạt** — nếu tự cấp thêm 3 khóa đó thì payload sẽ đổi so với production.

#### `trinity` — 3 điểm forensic

| Khóa | Template A | Template B |
|---|---|---|
| `altman_z` | tính (giống `snapshot.altman_z`) | **cố ý `null`** |
| `piotroski_f` | tính | tính nhưng phần lớn tiêu chí `null` (xem dưới) |
| `beneish_m` | tính | thực tế luôn `null` (thiếu concept) |

**Piotroski F-Score** — cần **kỳ trước**; không có `periods[1]` → `{score: null, criteria: {}}`.
Có kỳ trước → `score` = **số tiêu chí `=== true`** (0..9), `criteria` có đủ **9 khóa** với giá trị
`true | false | null`:

| Khóa `criteria` | Điều kiện `true` | `null` khi |
|---|---|---|
| `roa_positive` | `roa > 0`, `roa = npat / total_assets` | `roa === null` |
| `cfo_positive` | `cfo > 0` | `cfo === null` |
| `roa_increasing` | `roa > roa_prev` | thiếu 1 trong 2 |
| `accrual_quality` | `cfo > npat` | thiếu 1 trong 2 |
| `lower_leverage` | `lt_debt < lt_debt_prev` | thiếu 1 trong 2 |
| `current_ratio_up` | `cr > cr_prev`, `cr = current_assets / current_liabilities` | thiếu 1 trong 2 |
| `no_dilution` | `proceeds_from_shares === 0` | `proceeds_from_shares === null` |
| `gross_margin_up` | `gm > gm_prev`, `gm = gross_profit / net_revenue` | thiếu 1 trong 2 |
| `asset_turnover_up` | `at > at_prev`, `at = net_revenue / total_assets` | thiếu 1 trong 2 |

> **Bẫy Template B:** mapping ngân hàng **không có** `cfo`, `current_assets`, `current_liabilities`,
> `gross_profit`, `net_revenue`, `lt_debt`, `proceeds_from_shares`. Nên với ngân hàng chỉ
> `roa_positive` và `roa_increasing` có thể `true`; **`score` tối đa là 2/9**. Bản TS phải trả đúng
> như vậy (không ẩn `piotroski_f` cho ngân hàng, không đổi thang điểm).

**Beneish M-Score** — cần kỳ trước; **thiếu bất kỳ 1 trong 8 cấu phần → `null`** (không tính từng phần):

~~~
M = −4.84 + 0.92·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI
          + 0.115·DEPI − 0.172·SGAI − 0.327·LVGI + 4.679·TATA
~~~

| Cấu phần | Công thức |
|---|---|
| `DSRI` | `(trade_receivables/net_revenue)ₜ ÷ (trade_receivables/net_revenue)ₜ₋₁` |
| `GMI` | `gmₜ₋₁ ÷ gmₜ` (**đảo**, `gm = gross_profit/net_revenue`) |
| `AQI` | `aqₜ ÷ aqₜ₋₁` với `aq = 1 − (current_assets + net_fixed_assets)/total_assets` |
| `SGI` | `net_revenueₜ ÷ net_revenueₜ₋₁` |
| `DEPI` | `depRateₜ₋₁ ÷ depRateₜ` (**đảo**) với `depRate = abs(depreciation) / (abs(depreciation) + net_fixed_assets)`; mẫu số 0 → `depRate = null` |
| `SGAI` | `sgaₜ ÷ sgaₜ₋₁` với `sga = (abs(selling_expense) + abs(admin_expense)) / net_revenue` — cộng chỉ các khoản **có mặt** |
| `LVGI` | `(total_liabilities/total_assets)ₜ ÷ (…)ₜ₋₁` |
| `TATA` | `(npat − cfo) / total_assets` (**không** phải chỉ số, là tỷ lệ) |

Hàm chỉ số `_ratio_index(num, den)`: `null` nếu `num === null` **hoặc** `den ∈ {null, 0}`.
Diễn giải quy ước (không nằm trong payload): `M > −1.78` là vùng nghi vấn làm đẹp sổ sách.

#### `blind_spots`

Template B → **đúng 4 chuỗi, thứ tự cố định**; Template A → `[]`.

~~~json
[
  "Nợ nhóm 2-5 (phân loại nợ) — cần thuyết minh",
  "CASA (tỷ lệ tiền gửi không kỳ hạn) — cần thuyết minh",
  "CAR (hệ số an toàn vốn) — cần RWA, ngoài BCTC thuần số",
  "Nợ tái cơ cấu (TT02) — cần thuyết minh"
]
~~~

#### `valuation` — Template A (`valuation_nonbank`)

Đầu vào là `ratio_rows` (đã lọc `period="Y"`, mới nhất trước) — **không** dùng `Period`.

~~~ts
interface ValuationNonbank {
  /** null khi không có P/E dương nào HOẶC eps không lấy được. */
  pe_band: { bear: number; base: number; bull: number } | null;
  rim: number | null;            // justified_pb × bvps
  book_floor: number | null;     // = bvps
  justified_pb: number | null;
  roe_sustainable: number | null; // median(roe) trên MỌI dòng ratio có roe số
  summary: { bear: number | null; base: number | null; bull: number | null };
}
~~~

| Bước | Công thức / quy tắc |
|---|---|
| `peList` | Lấy `pe` của **mọi** dòng, chỉ giữ số **> 0**, rồi **cắt 5 phần tử đầu** (5 dòng mới nhất có P/E dương) |
| `eps` | Giá trị `eps` **số đầu tiên** gặp khi quét từ dòng mới nhất |
| `bvps` | Giá trị `bvps` **số đầu tiên** gặp |
| `pe_band` | Chỉ dựng khi `peList` không rỗng **và** `eps !== null`: `bear = min(peList)·eps`, `base = median(peList)·eps`, `bull = max(peList)·eps` |
| `roe_sustainable` | `median` các giá trị `roe` (**không** lọc dấu, **không** cắt 5) |
| `justified_pb` | `(roe_med − g) / (ke − g)` với **`ke = 0.125`, `g = 0.05`**. `null` nếu `roe_med === null` hoặc `ke <= g` |
| `rim` | `justified_pb × bvps`; `null` nếu thiếu 1 trong 2 |
| `book_floor` | `= bvps` (có thể `null`) |
| `cands` | `[pe_band.base, rim, book_floor]` **đã bỏ `null`** |
| `summary.bear` | Có `pe_band` → `min(pe_band.bear, ...cands)`; không có → `min(cands)`; `cands` rỗng → `null` |
| `summary.base` | `median(cands)`; `cands` rỗng → `null` |
| `summary.bull` | Có `pe_band` → `max(pe_band.bull, ...cands)`; không có → `max(cands)`; `cands` rỗng → `null` |

Đơn vị: `pe_band`, `rim`, `book_floor`, `summary.*` là **VND/cp**; `justified_pb` là **lần**;
`roe_sustainable` là **phân số hay phần trăm tùy VCI** (xem "Bẫy đơn vị ROE" §11) — nếu VCI trả `roe`
kiểu phần trăm (22.0) thì `justified_pb` sẽ ra ~292× và `rim` vô nghĩa. **Đây là rủi ro đã biết.**

#### `valuation` — Template B (`valuation_bank`)

~~~ts
interface ValuationBank {
  justified_pb: number | null;
  fair_value: number | null;      // justified_pb × bvps, VND/cp
  roe_sustainable: number | null; // median(roe) từ ratio rows
  bvps: number | null;
  nim_cor_matrix: {
    /** ĐÚNG 3 dòng theo nim_steps, thứ tự: nim+0.002, nim, nim−0.002 */
    rows: Array<{
      nim: number | null;
      /** ĐÚNG 3 ô theo cor_steps, thứ tự: cor−0.002, cor, cor+0.002 */
      cells: Array<{ cor: number | null; justified_pb: number | null }>;
    }>;
  };
}
~~~

Hằng số **ngân hàng khác phi ngân hàng**: `ke = 0.14`, `g = 0.07`.

Ma trận độ nhạy NIM × Cost-of-Risk (3×3 = 9 ô):

~~~
nim_steps = [nim + 0.002, nim,  nim − 0.002]      // hàng
cor_steps = [cor − 0.002, cor,  cor + 0.002]      // cột
base_ok   = KHÔNG có giá trị nào null trong (nim, cor, roa, equity_multiplier,
                                             earning_assets_ratio, loans_ratio)
Δroa      = (nv − nim)·earning_assets_ratio − (cv − cor)·loans_ratio
roe_s     = (roa + Δroa) · equity_multiplier
cell.justified_pb = base_ok && nv≠null && cv≠null ? (roe_s − 0.07)/(0.14 − 0.07) : null
~~~

Đầu vào ma trận, lấy từ chính payload (assemble truyền vào):
`nim` = `snapshot.nim`; `cost_of_risk` = `modules[ppop_cor].data.cost_of_risk`; `roa` và
`equity_multiplier` = từ `modules[bank_dupont].data`; `earning_assets_ratio = earningAssets(cur) /
total_assets(cur)`; `loans_ratio = customer_loans(cur) / total_assets(cur)`.

> **Bẫy dấu:** `cost_of_risk` **âm** (§7) nên `cor_steps` cũng âm, và biến thiên `+0.002` (được coi là
> "xấu hơn") thực chất là **bớt** chi phí. Ma trận vẫn tính ra số nhưng **diễn giải hướng bị đảo**.
> Sao chép nguyên, ghi TODO.

**Ví dụ JSON — FPT (Template A, `term_type=1`)**

Rút gọn: `columns`/`values` chỉ hiển thị **3 cột cuối** (thực tế tối đa 5); `periods` giữ đủ.
Đơn vị VND; số minh họa nhưng **nội bộ nhất quán** (kiểm được bằng các công thức trên).

~~~json
{
  "data": {
    "template": "A",
    "sector": "nonbank",
    "periods": ["2025", "2024", "2023", "2022", "2021"],
    "snapshot": [
      { "key": "revenue_growth", "label": "Tăng trưởng Doanh thu", "unit": "%", "value": 0.1801801802, "status": "green" },
      { "key": "gross_margin", "label": "Biên Lợi nhuận gộp", "unit": "%", "value": 0.3829516539, "status": "green" },
      { "key": "roe", "label": "ROE", "unit": "%", "value": 0.2490931076, "status": "green" },
      { "key": "net_debt_ebitda", "label": "Nợ ròng / EBITDA", "unit": "x", "value": -0.6779661017, "status": "green" },
      { "key": "fcf_margin", "label": "Biên FCF", "unit": "%", "value": 0.0903307888, "status": "green" },
      { "key": "altman_z", "label": "Điểm Z Altman", "unit": "", "value": 2.7566411898, "status": "amber" }
    ],
    "modules": [
      {
        "id": "common_size",
        "title": "Common-Size KQKD",
        "type": "common_size_table",
        "data": {
          "columns": ["2023", "2024", "2025"],
          "rows": [
            { "key": "cogs_pct", "label": "Giá vốn hàng bán", "emphasis": false, "unit": "%", "values": [0.6194075404, 0.6186186186, 0.6170483461] },
            { "key": "gross_margin", "label": "Biên lợi nhuận gộp", "emphasis": true, "unit": "%", "values": [0.3805744165, 0.3813813814, 0.3829516539] },
            { "key": "selling_pct", "label": "Chi phí bán hàng", "emphasis": false, "unit": "%", "values": [0.1166965889, 0.1141141141, 0.1132315522] },
            { "key": "admin_pct", "label": "Chi phí quản lý DN", "emphasis": false, "unit": "%", "values": [0.0897666068, 0.0885885886, 0.0852417303] },
            { "key": "ebit_margin", "label": "Biên EBIT (LN thuần HĐKD)", "emphasis": true, "unit": "%", "values": [0.1831238779, 0.1861861862, 0.1857506361] },
            { "key": "net_margin", "label": "Biên LNST", "emphasis": false, "unit": "%", "values": [0.1561938959, 0.1621621622, 0.1615776081] }
          ]
        }
      },
      {
        "id": "wcc",
        "title": "Chu kỳ Vốn lưu động",
        "type": "wcc",
        "data": {
          "columns": ["2023", "2024", "2025"],
          "rows": [
            { "key": "dso", "label": "DSO — Phải thu", "values": [58.6490125673, 62.7515015015, 65.7092875318] },
            { "key": "dio", "label": "DIO — Tồn kho", "values": [-21.6884057971, -21.7050970874, -21.824742268] },
            { "key": "dpo", "label": "DPO — Phải trả", "values": [-42.3188405797, -41.1953883495, -39.8865979381] },
            { "key": "ccc", "label": "CCC — Chu kỳ tiền mặt", "values": [79.2794473499, 82.2417927636, 83.7711432019] }
          ],
          "latest": {
            "dso": 65.7092875318,
            "dio": -21.824742268,
            "dpo": -39.8865979381,
            "ccc": 83.7711432019
          }
        }
      },
      {
        "id": "cf_bridge",
        "title": "Cầu nối Dòng tiền",
        "type": "cf_bridge",
        "data": {
          "ni": 12700000000000,
          "depreciation": 3100000000000,
          "provisions": 400000000000,
          "cfo": 13900000000000,
          "capex": -6800000000000,
          "fcf": 7100000000000,
          "wc_change": -2300000000000,
          "lines": [
            { "key": "ni", "label": "Lợi nhuận sau thuế (NI)", "value": 12700000000000, "kind": "base" },
            { "key": "depreciation", "label": "(+) Khấu hao", "value": 3100000000000, "kind": "add" },
            { "key": "provisions", "label": "(+) Dự phòng", "value": 400000000000, "kind": "add" },
            { "key": "wc_change", "label": "(±) Thay đổi vốn lưu động", "value": -2300000000000, "kind": "add" },
            { "key": "cfo", "label": "= CFO", "value": 13900000000000, "kind": "subtotal" },
            { "key": "capex", "label": "(−) CapEx", "value": -6800000000000, "kind": "sub" },
            { "key": "fcf", "label": "= FCF (Dòng tiền tự do)", "value": 7100000000000, "kind": "total" }
          ],
          "cfo_ni": 1.094488189,
          "fcf_margin": 0.0903307888,
          "sloan_accrual": -0.0145631068
        }
      },
      {
        "id": "dupont",
        "title": "DuPont 5 bước",
        "type": "dupont",
        "data": {
          "roe": 0.3071346,
          "roe_prev": 0.3085714,
          "roe_delta": -0.0014368,
          "drivers": [
            { "key": "tax_burden", "label": "Gánh nặng thuế", "abbr": "TAX BURDEN", "unit": "x", "value": 0.8410596026, "prev": 0.8372093023, "delta": 0.0038503003, "contribution": 0.001412 },
            { "key": "interest_burden", "label": "Gánh nặng lãi vay", "abbr": "INTEREST BRD", "unit": "x", "value": 1.0342465753, "prev": 1.0403225806, "delta": -0.0060760053, "contribution": -0.0018029 },
            { "key": "op_margin", "label": "Biên hoạt động", "abbr": "OP MARGIN", "unit": "%", "value": 0.1857506361, "prev": 0.1861861862, "delta": -0.0004355501, "contribution": -0.0007205 },
            { "key": "asset_turnover", "label": "Vòng quay tài sản", "abbr": "ASSET T/O", "unit": "x", "value": 1.0234375, "prev": 1.0015037594, "delta": 0.0219337406, "contribution": 0.0066652 },
            { "key": "equity_multiplier", "label": "Hệ số nhân VCSH", "abbr": "EQUITY MULT", "unit": "x", "value": 1.8573155985, "prev": 1.9, "delta": -0.0426844015, "contribution": -0.0069925 }
          ]
        }
      }
    ],
    "forensic": {
      "green": ["ROE bền vững > 18% ba năm", "Vị thế tiền mặt ròng (Net cash)"],
      "red": ["Không có cờ đỏ trọng yếu"]
    },
    "flags": [],
    "trinity": {
      "altman_z": 2.7566411898,
      "piotroski_f": {
        "score": 9,
        "criteria": {
          "roa_positive": true,
          "cfo_positive": true,
          "roa_increasing": true,
          "accrual_quality": true,
          "lower_leverage": true,
          "current_ratio_up": true,
          "no_dilution": true,
          "gross_margin_up": true,
          "asset_turnover_up": true
        }
      },
      "beneish_m": -2.3871278
    },
    "blind_spots": [],
    "subsector": {
      "subsector": "cntt_dichvu",
      "label": "CNTT / Dịch vụ",
      "metrics": { "asset_intensity": 0.1626213592, "inventory_ratio": 0.0376213592 }
    },
    "valuation": {
      "pe_band": { "bear": 107640.0, "base": 136620.0, "bull": 166290.0 },
      "rim": 77348.0,
      "book_floor": 30500.0,
      "justified_pb": 2.536,
      "roe_sustainable": 0.2402,
      "summary": { "bear": 30500.0, "base": 77348.0, "bull": 166290.0 }
    }
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T03:14:02.771904Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/financial-statement"
  }
}
~~~

**Ví dụ JSON — VCB (Template B, `term_type=1`)** — rút gọn phần `data`, giữ đủ mọi khóa:

~~~json
{
  "data": {
    "template": "B",
    "sector": "bank",
    "periods": ["2025", "2024", "2023", "2022", "2021"],
    "snapshot": [
      { "key": "nim", "label": "NIM", "unit": "%", "value": 0.0288764168, "status": "amber" },
      { "key": "roe", "label": "ROE", "unit": "%", "value": 0.1671568627, "status": "amber" },
      { "key": "ldr", "label": "LDR", "unit": "%", "value": 0.9620253165, "status": "red" },
      { "key": "equity_ratio", "label": "VCSH / Tổng TS", "unit": "%", "value": 0.1, "status": "green" },
      { "key": "llr_loans", "label": "Dự phòng / Cho vay", "unit": "%", "value": 0.0210526316, "status": "na" },
      { "key": "cir", "label": "CIR", "unit": "%", "value": 0.3190607735, "status": "green" }
    ],
    "modules": [
      {
        "id": "toi_mix",
        "title": "Cơ cấu Thu nhập (TOI)",
        "type": "ratios",
        "data": { "nii_pct": 0.7707182320, "fee_pct": 0.1008287293, "trading_pct": 0.0745856354, "other_pct": 0.0538674033 }
      },
      {
        "id": "nim_decomp",
        "title": "Phân rã NIM",
        "type": "ratios",
        "data": { "yield_ea": 0.0610672204, "cost_of_funds": 0.0365774184, "spread": 0.0244898020 }
      },
      {
        "id": "ppop_cor",
        "title": "PPOP & Chi phí Dự phòng",
        "type": "ratios",
        "data": { "ppop": 49300000000000, "cir": 0.3190607735, "provision_ppop": -0.1135902637, "cost_of_risk": -0.0038888889 }
      },
      {
        "id": "bank_dupont",
        "title": "DuPont Ngân hàng",
        "type": "ratios",
        "data": {
          "roa": 0.0164734300,
          "equity_multiplier": 10.1470588235,
          "roe": 0.1671568627,
          "nii_to_ta": 0.0269565217,
          "non_nii_to_ta": 0.0080193237,
          "opex_to_ta": 0.0111594203,
          "provision_to_ta": 0.0027053140,
          "tax_to_ta": 0.0041062802
        }
      }
    ],
    "forensic": {
      "green": ["CIR best-in-class < 35%", "Capital position lành mạnh (VCSH/TS > 8%)"],
      "red": ["LDR 96% vượt cap NHNN 85%"]
    },
    "flags": [],
    "trinity": {
      "altman_z": null,
      "piotroski_f": {
        "score": 2,
        "criteria": {
          "roa_positive": true,
          "cfo_positive": null,
          "roa_increasing": true,
          "accrual_quality": null,
          "lower_leverage": null,
          "current_ratio_up": null,
          "no_dilution": null,
          "gross_margin_up": null,
          "asset_turnover_up": null
        }
      },
      "beneish_m": null
    },
    "blind_spots": [
      "Nợ nhóm 2-5 (phân loại nợ) — cần thuyết minh",
      "CASA (tỷ lệ tiền gửi không kỳ hạn) — cần thuyết minh",
      "CAR (hệ số an toàn vốn) — cần RWA, ngoài BCTC thuần số",
      "Nợ tái cơ cấu (TT02) — cần thuyết minh"
    ],
    "subsector": null,
    "valuation": {
      "justified_pb": 1.6428571429,
      "fair_value": 64400.0,
      "roe_sustainable": 0.185,
      "bvps": 39200.0,
      "nim_cor_matrix": {
        "rows": [
          {
            "nim": 0.0308764168,
            "cells": [
              { "cor": -0.0058888889, "justified_pb": 1.8604214 },
              { "cor": -0.0038888889, "justified_pb": 1.6620432 },
              { "cor": -0.0018888889, "justified_pb": 1.4636650 }
            ]
          },
          {
            "nim": 0.0288764168,
            "cells": [
              { "cor": -0.0058888889, "justified_pb": 1.5858441 },
              { "cor": -0.0038888889, "justified_pb": 1.3874658 },
              { "cor": -0.0018888889, "justified_pb": 1.1890876 }
            ]
          },
          {
            "nim": 0.0268764168,
            "cells": [
              { "cor": -0.0058888889, "justified_pb": 1.3112667 },
              { "cor": -0.0038888889, "justified_pb": 1.1128885 },
              { "cor": -0.0018888889, "justified_pb": 0.9145103 }
            ]
          }
        ]
      }
    }
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T03:14:03.118422Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/VCB/financial-statement"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | `detail` (nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` sau uppercase không khớp `^[A-Z0-9]{1,10}$` | `Mã chứng khoán không hợp lệ: !!` |
| 422 | `less_than_equal` / `greater_than_equal` | `term_type` ∉ [1,2] | `[{"loc":["query","term_type"],"msg":"Input should be less than or equal to 2","type":"less_than_equal","input":"3"}]` |
| 429 | — | Vượt `60/minute` | Thông điệp của slowapi |
| 502 | — | Gọi VCI `/financial-statement` lỗi/timeout | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm** — điểm mạnh của endpoint này là **không bao giờ 502 vì thiếu dữ liệu**:

- **Bảng ratio lỗi hoặc rỗng** → `ratio_rows = []` (bắt exception, **không** làm fail request).
  Hệ quả: Template A → `valuation.pe_band = null`, `rim = null`, `book_floor = null`,
  `justified_pb = null`, `roe_sustainable = null`, `summary = {bear:null, base:null, bull:null}`
  (object vẫn có mặt). Template B → `justified_pb`, `fair_value`, `roe_sustainable`, `bvps` đều `null`,
  `nim_cor_matrix.rows` vẫn có 3 dòng với `justified_pb: null` mọi ô.
- **Không có kỳ nào** (`build_periods` trả `[]`) → trả payload rỗng đúng hình dạng sau, **HTTP 200**:

~~~json
{
  "data": {
    "template": "A",
    "sector": "nonbank",
    "periods": [],
    "snapshot": [],
    "modules": [],
    "forensic": { "green": [], "red": ["Không đủ dữ liệu BCTC"] },
    "flags": [],
    "trinity": {},
    "blind_spots": [],
    "subsector": null,
    "valuation": null
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T03:14:03.554901Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/XYZ/financial-statement"
  }
}
~~~

  Lưu ý: `template`/`sector` vẫn được suy từ `detect_template(is_rows)` nên **có thể là `"B"`/`"bank"`**
  nếu KQKD có cờ ngân hàng nhưng không ghép được kỳ nào. `trinity` là `{}` **không** phải `null`.
- **Chỉ có 1 kỳ** → `revenue_growth = null`; `roe` vẫn tính (không bình quân); `piotroski_f =
  {score: null, criteria: {}}`; `beneish_m = null`; `dupont.roe_prev`/`roe_delta`/mọi `prev`/`delta`/
  `contribution` = `null`; `forensic` chuỗi `_all_above` không đạt (cần ≥3 kỳ) → `green` thường rỗng.
- **Ngoài giờ giao dịch:** không ảnh hưởng. Không có thành phần realtime.
- **Provider trả dữ liệu quý khi xin năm** — có thể xảy ra (xem endpoint 1) nhưng
  `fetch_bctc_statements` **KHÔNG có** cơ chế fallback bucket đó: chỉ đọc `raw["years"]` hoặc
  `raw["quarters"]`, thiếu thì `[]`. Nếu VCI chỉ điền `quarter` (số ít) thì endpoint này trả payload
  rỗng trong khi endpoint 1 vẫn có dữ liệu. **Khác biệt đã biết giữa 2 đường fetch.**

**curl**

~~~bash
curl -sS -X GET \
  "https://api.iqx.vn/api/v1/market-data/bctc/FPT?term_type=1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 5c8f21ab-9b34-4d7e-8a12-6f0d3c92e5b7"
~~~

~~~bash
# Ngân hàng, theo QUÝ
curl -sS -X GET \
  "https://api.iqx.vn/api/v1/market-data/bctc/VCB?term_type=2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 71a4e0d9-3c25-45b8-9f6a-2b8c1e4d7f30"
~~~

**Ghi chú khi viết lại**

1. **Thứ tự thực thi bắt buộc** trong `build_bctc_payload`: `detect_template(is_rows)` → `load_mapping`
   → `build_periods` → (nếu rỗng: trả payload rỗng, **dừng**) → snapshot → modules → `fmetrics` →
   `forensic` → `flags` → `trinity` → `blind_spots`/`subsector` → `valuation`. Không đảo: `valuation`
   của ngân hàng **đọc lại `modules`** (`ppop_cor.cost_of_risk`, `bank_dupont.roa/equity_multiplier`)
   bằng cách tìm module theo `id`, nên `modules` phải xong trước.
2. **`term_type` KHÔNG ảnh hưởng bảng ratio.** Ratio luôn được gọi với `period="Y"` (kỳ năm) dù
   `term_type=2`. Nên với `term_type=2`, `periods` là quý mà định giá dựa trên P/E năm. Giữ nguyên.
3. **Ratio được gọi trong `try/except` bao trùm** — mọi exception (kể cả `ValueError`) đều bị nuốt
   thành `ratio_rows = []`. Không log. Bản TS nên log ở mức debug nhưng **không** được để lỗi lan ra.
4. `periods` **không bị cắt 5** ở endpoint này (khác dashboard). Với `term_type=2` mảng có thể dài
   (số quý VCI trả). `common_size_table`/`working_capital_cycle_series` tự cắt `max_cols = 5`.
5. **`columns` là CŨ→MỚI, `periods` là MỚI→CŨ.** Đây là nguồn lỗi off-by-one kinh điển. Công thức:
   `columns = reverse(periods.slice(0, 5))`. Với `wcc`, chỉ số cột là `[n-1, …, 1, 0]` và `prev` của
   cột `i` là `periods[i+1]` (**không** phải cột liền trước trong `columns`).
6. `roe_series` và `nim_series` trong `fmetrics` được **lọc bỏ `null` SAU khi tính**. Nếu không lọc,
   `_all_above` sẽ so `null > 0.18` → lỗi runtime. Đã có test hồi quy cho ca ngân hàng 3 kỳ không NIM.
7. Chuỗi `forensic` chứa **số đã format sẵn** với đúng độ chính xác: `{z:.2f}`, `{nde:.1f}x`,
   `{ldr*100:.0f}%`, `{gd*10000:.0f}bp`, `{dc*100:.0f}%`. Bản TS phải khớp format (`toFixed(2)`,
   `toFixed(1)`, `Math.round`) vì frontend hiển thị nguyên văn.
8. `flags[].message` format số theo `{v:.3f}` (3 chữ số thập phân) — ví dụ
   `roe=0.900 ngoài khoảng hợp lý [-0.5,0.5]`. Chú ý dấu ngoặc vuông và **không có khoảng trắng** sau
   dấu phẩy trong `[-0.5,0.5]`.
9. `subsector` cần `ccc` từ `working_capital_cycle(periods[0], periods[1])` — **tính lại**, không lấy
   từ `modules[wcc].data.latest` (dù giá trị bằng nhau). Giữ 2 lời gọi để tránh phụ thuộc thứ tự.
10. `unit` trong snapshot chỉ là **nhãn hiển thị**. Backend **không** nhân 100. Frontend chịu trách
    nhiệm format. Đừng "sửa" thành phần trăm ở backend.
11. `equity_parent` map `null` nên nhánh fallback ROE luôn dùng `equity`. Vẫn phải viết code fallback
    (chuẩn bị cho khi map được), và phải dùng kiểm tra `≠ 0 && ≠ null` (không dùng `??`).
12. Test hồi quy tối thiểu (đã có trong repo, port sang TS): mã có `isb38 = 0.0` phải ra template `A`;
    ngân hàng 3 kỳ không NIM không được crash; snapshot luôn **đúng 6 ô**; `trinity` luôn có 3 khóa
    khi có kỳ; ngân hàng **không** có module `dupont`; `blind_spots` luôn có mặt (rỗng cho A).

---

## Nhóm 3 — Dashboard kể chuyện BCTC

### GET /api/v1/market-data/bctc-dashboard/{symbol}

> **Dashboard kể chuyện BCTC 8 khối** — trả `BctcDashboardData`: hero + radar 5 trục (Khối 0) và 6 khối
> phân tích (Khối 2–7), đã gắn median ngành + màu ngưỡng + điểm radar.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`, theo IP) |
| **Cache** | Redis key `iqx:api:v1:market-data/bctc-dashboard/{symbol nguyên dạng}:{md5_12(query)}`, TTL 900s |
| **Nguồn dữ liệu** | provider ngoài VCI (3 báo cáo + ratio + company overview) + **DB** (`symbols.icb_lv2`, `sector_median_cache`) + provider VCI screening (khi cache miss) + tính toán |
| **Side-effect** | **UPSERT `sector_median_cache`** (1 row / ngành / ngày) trong SAVEPOINT; `SELECT pg_advisory_xact_lock(...)` khi cache miss trên Postgres; ghi cache Redis. Không gửi email/Telegram, không ghi audit log. |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau `.toUpperCase()` phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán. |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `term_type` | `integer` | không | **`1`** | `1 ≤ x ≤ 2` | `1` = Năm, `2` = Quý. Dashboard được thiết kế cho **kỳ Năm**; `term_type=2` vẫn chạy nhưng nhãn `year` trong các series là `Period.year` nên **nhiều kỳ cùng năm sẽ trùng nhãn** (xem "Ghi chú khi viết lại"). |

**Request body** — —

**Response 200** — cấu trúc tổng

~~~ts
interface BctcDashboardData {
  template: BctcTemplate;
  /** NHÃN tiếng Việt của ngành phụ ("CNTT / Dịch vụ"…). null cho ngân hàng và khi rỗng dữ liệu. */
  sub_sector: string | null;
  /** KHỐI 0 (phần trên). */
  hero: DashboardHero;
  /** KHỐI 0 (phần dưới) — LUÔN 5 trục khi có dữ liệu; dims: [] khi rỗng. */
  radar: { dims: RadarDim[] };
  /** KHỐI 2–7. Là {} (object RỖNG) khi không có kỳ nào. Thứ tự khóa cố định. */
  blocks: DashboardBlocks | Record<string, never>;
  meta: DashboardMeta;
}

interface DashboardHero {
  ticker: string;              // đã uppercase
  name: string | null;         // ⚠ THỰC TẾ LUÔN null — xem bẫy #1
  exchange: string | null;     // ⚠ THỰC TẾ LUÔN null — xem bẫy #1
  sector: string | null;       // overview.icb_name_2 (ICB cấp 2)
  price: number | null;        // VND/cp, suy từ bảng ratio
  fair_value: number | null;   // = blocks.valuation.fair_median
  upside_pct: number | null;   // (fair_value − price) / price, phân số
}

/** Trục radar Template A (phi ngân hàng). */
type RadarDimKeyA = "business" | "profitability" | "cashflow" | "safety" | "valuation";
/** Trục radar Template B (ngân hàng). */
type RadarDimKeyB = "growth" | "profitability" | "asset_quality" | "capital" | "valuation";

interface RadarDim {
  key: RadarDimKeyA | RadarDimKeyB;
  label: string;
  /** 0..100 số nguyên. null khi thiếu giá trị nền hoặc trục không có ngưỡng. */
  score: number | null;
  band: RadarBand | null;
  /** Chuỗi hiển thị đã format: "18.0%" hoặc "1.09×". null khi value null. */
  value_label: string | null;
  /** Giá trị thô mà lớp benchmark chấm điểm. */
  value: number | null;
}

interface DashboardBlocks {
  financial: FinancialBlock;                       // KHỐI 3
  business: BusinessBlockA | BusinessBlockB;       // KHỐI 4
  cashflow: CashflowBlockA | CashflowBlockB;       // KHỐI 5
  valuation: ValuationBlock;                       // KHỐI 2
  health: HealthBlockA | HealthBlockB;             // KHỐI 6
  dividend: DividendBlock;                         // KHỐI 7
}

interface DashboardMeta {
  /** Nhãn kỳ, MỚI NHẤT TRƯỚC, tối đa 5. */
  periods: string[];
  /** Đường dẫn (dot-path) tới các trường là SỐ ƯỚC TÍNH do thiếu thuyết minh. */
  is_estimated_fields: string[];
  /** Số peer thực tế đã lấy được dữ liệu. 0 khi không áp được lớp benchmark. */
  peer_count: number;
  /** Ngày tính median ngành, "YYYY-MM-DD". null khi không áp được lớp benchmark. */
  peer_asof: string | null;
  /** 2 chuỗi khi có dữ liệu; 3 chuỗi khi rỗng dữ liệu. Nguyên văn, hiển thị ở footer. */
  disclaimers: string[];
}

/** Ô chỉ số chuẩn của khối 4/5 (KHÔNG dùng cho khối 2 — xem ValuationBlock). */
interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: "%" | "x";
  /** Median ngành. Chỉ được ghi khi median tồn tại; ngược lại giữ null. */
  peer_median: number | null;
  color: BenchmarkColor | null;
}
~~~

#### Bản đồ 8 khối → payload

| Khối (theo spec) | Tiêu đề người dùng | Nằm ở đâu trong payload |
|---|---|---|
| **0** | Thẻ điểm sức khỏe | `hero` + `radar` |
| **1** | Câu chuyện doanh nghiệp | **KHÔNG có trong endpoint này** — do AI sinh, xem **chương 29** (`GET /api/v1/ai/bctc-dashboard/{symbol}`, Bearer + Premium) |
| **2** | Giá đang đắt hay rẻ? | `blocks.valuation` |
| **3** | Bức tranh tài chính | `blocks.financial` |
| **4** | Kinh doanh có ổn không? (A) / Ngân hàng kiếm tiền thế nào? (B) | `blocks.business` |
| **5** | Tiền có thật không? (A) / Vận hành có hiệu quả không? (B) | `blocks.cashflow` |
| **6** | Sức khỏe tài chính (A) / Chất lượng tài sản (B) | `blocks.health` |
| **7** | Cổ đông nhận được gì? | `blocks.dividend` |

> Thứ tự khóa trong `blocks` là **thứ tự chèn ở backend**: `financial, business, cashflow, valuation,
> health, dividend` — **không** phải thứ tự hiển thị. Thứ tự hiển thị (`BLOCK_ORDER`) là việc của
> frontend: `[0, 1, 2, 3, 4, 5, 6, 7]` với 2 (Định giá) đặt sớm.

#### KHỐI 0 — `hero` + `radar`

`price` được suy từ **dòng ratio mới nhất**, theo **đúng thứ tự ưu tiên** này (dừng ở cái đầu tiên ra số):

1. `market_cap / number_of_shares_mkt_cap`
2. `pe × eps`
3. `pb × bvps`
4. `null`

`fair_value` = `blocks.valuation.fair_median`. `upside_pct` = `(fair_value − price) / price`,
`null` nếu `fair_value === null` hoặc `price` là `null`/`0`.

**Trục radar — Template A** (thứ tự cố định):

| # | `key` | `label` | Giá trị nền (`value`) | `value_label` | Ngưỡng (green, red, dir) |
|---|---|---|---|---|---|
| 1 | `business` | `Kinh doanh` | `revenue_growth` (phi NH) | `_fmt_pct` | 0.15 · 0.05 · up |
| 2 | `profitability` | `Sinh lời` | `roe` (phi NH) | `_fmt_pct` | 0.18 · 0.12 · up |
| 3 | `cashflow` | `Dòng tiền` | `cash_flow_bridge(cur).cfo_ni` | `_fmt_x` | 1.0 · 0.5 · up |
| 4 | `safety` | `An toàn tài chính` | `net_debt_ebitda(cur)` | `_fmt_x` | 1.5 · 3.0 · **down** |
| 5 | `valuation` | `Định giá` | `blocks.valuation.upside_pct` | `_fmt_pct` | 0.15 · −0.10 · up |

**Trục radar — Template B** (thứ tự cố định, tất cả `_fmt_pct`):

| # | `key` | `label` | Giá trị nền | Ngưỡng |
|---|---|---|---|---|
| 1 | `growth` | `Tăng trưởng` | `(TOI[t] − TOI[t−1]) / TOI[t−1]` | 0.15 · 0.0 · up |
| 2 | `profitability` | `Sinh lời` | `kpi_bank.roe(cur, prev)` | 0.18 · 0.12 · up |
| 3 | `asset_quality` | `Chất lượng tài sản` | `kpi_bank.llr_loans(cur)` (proxy NPL) | 0.012 · 0.03 · **down** |
| 4 | `capital` | `An toàn vốn` | `kpi_bank.equity_ratio(cur)` | 0.10 · 0.06 · up |
| 5 | `valuation` | `Định giá` | `blocks.valuation.upside_pct` | 0.15 · −0.10 · up |

Format nhãn (phải khớp chính xác, frontend in nguyên văn):

~~~ts
const fmtPct = (v: number | null) => v === null ? null : `${(v * 100).toFixed(1)}%`;   // "18.0%"
const fmtX   = (v: number | null) => v === null ? null : `${v.toFixed(2)}×`;      // "1.09×"
~~~

`×` là **dấu nhân U+00D7 (×)**, không phải chữ `x`.

#### KHỐI 3 — `blocks.financial`

~~~ts
interface FinancialBlock {
  /** Cột chồng tuyệt đối, CŨ → MỚI, ≤5 phần tử. */
  stacked_abs: Array<{
    year: number;
    equity: number | null;
    other_liab: number | null;
    debt: number | null;
  }>;
  /** ĐÚNG 3 nguồn, thứ tự cố định. */
  growth_sources: Array<{ label: string; amount: number | null; pct: number | null }>;
  /** ĐÚNG 3 số tổng, thứ tự cố định. */
  totals: Array<{ label: string; value: number | null; mult: number | null }>;
  /** ĐÚNG 4 phần tử: 3 nhóm + "Khác". */
  asset_mix: Array<{ label: string; pct: number | null }>;
}
~~~

**Định nghĩa theo nhánh:**

| Trường | Template A (phi ngân hàng) | Template B (ngân hàng) |
|---|---|---|
| `stacked_abs.equity` | `equity` | `equity` |
| `stacked_abs.other_liab` | `total_liabilities − (debt ‖ 0)`; `null` nếu `total_liabilities` thiếu | `customer_deposits` |
| `stacked_abs.debt` | tổng có mặt của `st_debt`, `lt_debt` | tổng có mặt của `govt_sbv_borrowings`, `ci_deposits_borrowings`, `valuable_papers` |
| `growth_sources[0].label` | `Lợi nhuận giữ lại` (`retained_earnings`) | `Lợi nhuận giữ lại` (`retained_earnings`) |
| `growth_sources[1].label` | `Nợ vận hành` (hàm `other_liab`) | `Tiền gửi huy động` (`customer_deposits`) |
| `growth_sources[2].label` | `Vay nợ` (hàm `debt`) | `Vay & phát hành khác` (hàm `debt`) |
| `totals` labels + concept | `Tổng tài sản`/`total_assets`, `Vốn chủ sở hữu`/`equity`, `Nợ phải trả`/`total_liabilities` | `Tổng tài sản`/`total_assets`, `Cho vay khách hàng`/`customer_loans`, `Vốn chủ sở hữu`/`equity` |
| `asset_mix` labels + công thức | `Tiền & ĐT ngắn hạn` = `cash + st_investments`; `Phải thu khách hàng` = `trade_receivables`; `Tài sản cố định` = `net_fixed_assets`; `Khác` | `Cho vay khách hàng` = `customer_loans`; `Chứng khoán đầu tư` = `investment_securities + trading_securities`; `Tiền & gửi NHNN/TCTD` = `cash + deposits_at_sbv + deposits_at_other_ci`; `Khác` |

**Công thức `growth_sources`** — so kỳ **mới nhất** với kỳ **cũ nhất trong ≤5 kỳ**:

~~~
newest = periods[0]
oldest = periods[min(5, len(periods)) − 1]
ta_delta = total_assets(newest) − total_assets(oldest)     // null nếu thiếu 1 trong 2
amount   = fn(newest) − fn(oldest)                          // null nếu thiếu 1 trong 2
pct      = amount / ta_delta                                // null nếu ta_delta null hoặc 0
~~~

**Công thức `totals`**: `value = concept(newest)`, `mult = concept(newest) / concept(oldest)` (bội số
"gấp X lần"); `null` khi mẫu số `0`/thiếu.

**Công thức `asset_mix`**: `pct = fn(newest) / total_assets(newest)` cho 3 nhóm. Phần tử `Khác`:
`pct = 1.0 − Σ(các pct KHÔNG null)` nếu `total_assets(newest)` khác 0/không thiếu; ngược lại `null`.

> `Khác` **có thể âm** (khi 3 nhóm chồng lấn hoặc vượt tổng tài sản, thường gặp ở ngân hàng vì
> `customer_loans` là **gross** trong khi tổng TS đã trừ dự phòng). Frontend phải chịu được số âm;
> backend **không** kẹp về 0.

#### KHỐI 4 — `blocks.business`

~~~ts
/** Template A. */
interface BusinessBlockA {
  /** CŨ → MỚI, ≤5. */
  revenue_series: Array<{
    year: number;
    revenue: number | null;        // net_revenue, VND
    gross_margin: number | null;   // gross_profit / net_revenue
    net_margin: number | null;     // npat / net_revenue
  }>;
  /** ĐÚNG 3 ô, thứ tự cố định. */
  metrics: Metric[];
  /** ⚠ peer_median LUÔN null (lớp benchmark không xử lý khối này). */
  earnings_quality: {
    core_pct: number | null;    // operating_profit / profit_before_tax
    oneoff_pct: number | null;  // 1 − core_pct
    peer_median: null;
  };
}

/** Template B. */
interface BusinessBlockB {
  /** CŨ → MỚI, ≤5. gross_margin LUÔN null (không áp dụng cho ngân hàng). */
  revenue_series: Array<{
    year: number;
    revenue: number | null;       // total_operating_income (TOI), VND
    gross_margin: null;
    net_margin: number | null;    // npat / TOI
  }>;
  /** ĐÚNG 3 ô: nim, roa, roe. */
  metrics: Metric[];
  /** CŨ → MỚI, ≤5. */
  nim_series: Array<{ year: number; nim: number | null }>;
  /** ĐÚNG 4 phần tử, thứ tự cố định. */
  income_mix: Array<{ label: string; pct: number | null }>;
}
~~~

`metrics` Template A (thứ tự cố định):

| # | `key` | `label` | `unit` | Công thức |
|---|---|---|---|---|
| 1 | `revenue_growth` | `Tăng trưởng doanh thu` | `%` | `kpi_nonbank.revenue_growth(cur, prev)` |
| 2 | `gross_margin` | `Biên lợi nhuận gộp` | `%` | `kpi_nonbank.gross_margin(cur)` |
| 3 | `roe` | `ROE` | `%` | `kpi_nonbank.roe(cur, prev)` (dùng `npat_parent`) |

`metrics` Template B (thứ tự cố định):

| # | `key` | `label` | `unit` | Công thức |
|---|---|---|---|---|
| 1 | `nim` | `NIM` | `%` | `kpi_bank.nim(cur, prev)` |
| 2 | `roa` | `ROA` | `%` | `npat / avg2(total_assets)` |
| 3 | `roe` | `ROE` | `%` | `kpi_bank.roe(cur, prev)` (dùng `npat`) |

`income_mix` (Template B) — nhãn + nguồn từ `toi_mix(cur)`:

| # | `label` | Nguồn |
|---|---|---|
| 1 | `Lãi thuần` | `nii_pct` |
| 2 | `Phí dịch vụ` | `fee_pct` |
| 3 | `Ngoại hối & KD chứng khoán` | `trading_pct` |
| 4 | `Khác` | `other_pct` |

> **Bẫy `nim_series`:** duyệt theo thứ tự **chronological** (`chrono`, cũ→mới) và lấy
> `prev = chrono[i − 1]`, tức là **kỳ CŨ HƠN** — đúng về ý nghĩa (bình quân số dư đầu–cuối kỳ). Phần
> tử đầu (`i = 0`, kỳ cũ nhất) có `prev = null` → `avg` dùng luôn kỳ đó. **Đừng** dùng
> `periods[i + 1]` ở đây; đó là quy ước của `wcc` trên mảng mới→cũ.

#### KHỐI 5 — `blocks.cashflow`

~~~ts
/** Template A. */
interface CashflowBlockA {
  /** CŨ → MỚI, ≤5. */
  profit_vs_cash: Array<{ year: number; profit: number | null; cfo: number | null }>;
  /** ĐÚNG 3 ô. */
  metrics: Metric[];
  /** ĐÚNG 7 bước, thứ tự = lines của cash_flow_bridge. */
  waterfall: Array<{ label: string; value: number | null; kind: "base" | "delta" }>;
}

/** Template B. */
interface CashflowBlockB {
  /** CŨ → MỚI, ≤5. */
  cir_series: Array<{ year: number; cir: number | null }>;
  /** ĐÚNG 3 ô. */
  metrics: Metric[];
  /** PPOP kỳ mới nhất, VND. = TOI − abs(operating_expense). */
  ppop: number | null;
}
~~~

`metrics` Template A:

| # | `key` | `label` | `unit` | Nguồn |
|---|---|---|---|---|
| 1 | `cfo_ni` | `Tiền từ KD / Lợi nhuận` | `x` | `cash_flow_bridge(cur).cfo_ni` |
| 2 | `fcf_margin` | `Dòng tiền tự do / Doanh thu` | `%` | `cash_flow_bridge(cur).fcf_margin` |
| 3 | `accrual` | `Phần lãi chưa thành tiền` | `%` | `cash_flow_bridge(cur).sloan_accrual` |

`metrics` Template B:

| # | `key` | `label` | `unit` | Nguồn |
|---|---|---|---|---|
| 1 | `cir` | `CIR (chi phí / thu nhập)` | `%` | `ppop_cor(cur, prev).cir` |
| 2 | `cost_of_risk` | `Chi phí tín dụng / Cho vay` | `%` | `ppop_cor(cur, prev).cost_of_risk` (**âm**, xem §7) |
| 3 | `provision_ppop` | `Chi phí dự phòng / PPOP` | `%` | `ppop_cor(cur, prev).provision_ppop` (**âm**) |

`waterfall.kind`: `"base"` cho các mốc neo `key ∈ {ni, cfo, fcf}`, `"delta"` cho 4 bước còn lại.
`label` lấy **nguyên văn** từ `cash_flow_bridge.lines` (xem bảng 7 dòng ở endpoint 2). Chú ý:
`waterfall` **không** mang `key`, chỉ `label`/`value`/`kind`.

> **Cảnh báo màu:** `cost_of_risk` có ngưỡng `(0.01, 0.02, down)` giả định **dương**. Với giá trị âm
> thực tế, `_color` sẽ luôn trả `"green"` (vì `value <= green` và peer thường `null`). **Cờ xanh giả.**
> Sao chép nguyên, nhưng đây là lỗi cần ghi TODO. Tương tự `provision_ppop` `(0.25, 0.45, down)`.

#### KHỐI 2 — `blocks.valuation`

~~~ts
interface ValuationBlock {
  /** Football field. Template A: 0..4 phương pháp. Template B: LUÔN []. */
  methods: Array<{
    name: string;
    bear: number | null;
    base: number | null;
    bull: number | null;
  }>;
  current_price: number | null;   // = hero.price
  fair_median: number | null;     // A: valuation_nonbank.summary.base · B: valuation_bank.fair_value
  upside_pct: number | null;      // (fair_median − price) / price
  /** ⚠ HÌNH DẠNG KHÁC `Metric`: KHÔNG có `unit`; `color` chỉ được THÊM cho pe/pb/roe. */
  metrics: Array<{
    key: string;
    label: string;
    value: number | null;
    peer_median: number | null;
    color?: BenchmarkColor | null;
  }>;
}
~~~

`methods` Template A — chỉ thêm khi điều kiện thỏa, **theo đúng thứ tự này**:

| # | `name` | Điều kiện thêm | `bear` / `base` / `bull` |
|---|---|---|---|
| 1 | `P/E lịch sử` | `pe_band !== null` | `pe_band.bear` / `.base` / `.bull` |
| 2 | `Thu nhập thặng dư (RIM)` | `rim !== null` | `null` / `rim` / `null` |
| 3 | `Sàn sổ sách` | `book_floor !== null` | `null` / `book_floor` / `null` |
| 4 | `Trung vị tổng hợp` | **bất kỳ** trong `summary.{bear,base,bull}` khác `null` | `summary.bear` / `.base` / `.bull` |

`metrics` Template A (3 ô): `pe`/`P/E`, `pb`/`P/B`, `roe`/`ROE` — giá trị lấy từ **dòng ratio mới nhất**
(`_ratio_val`), **không** phải tính từ báo cáo.

`metrics` Template B (4 ô, thứ tự cố định):

| # | `key` | `label` | `value` |
|---|---|---|---|
| 1 | `pb` | `P/B hiện tại` | `_ratio_val(ratio, "pb")` |
| 2 | `justified_pb` | `P/B hợp lý` | `valuation_bank.justified_pb` |
| 3 | `pe` | `P/E hiện tại` | `_ratio_val(ratio, "pe")` |
| 4 | `roe` | `ROE` | `_ratio_val(ratio, "roe")` |

> **`justified_pb` KHÔNG có khóa `color`** trong response (không có ngưỡng cấu hình). Bản TS phải để
> `color` là **optional**, đừng khởi tạo `color: null` cho mọi ô — hình dạng sẽ lệch production.

#### KHỐI 6 — `blocks.health`

~~~ts
/** Template A — 3 câu hỏi con. */
interface HealthBlockA {
  /** 6A — Công ty có nợ nhiều không? */
  sub_a: {
    /** CŨ → MỚI. value = net_debt_ebitda từng kỳ (×). */
    series: Array<{ year: number; value: number | null }>;
    /** ĐÚNG 2 dòng. Dòng "Trung vị ngành" LUÔN value: null. */
    peer: Array<{ label: string; value: number | null }>;
  };
  /** 6B — Gặp khó có trụ được không? */
  sub_b: {
    /** value = operating_profit / abs(interest_expense) (khả năng trả lãi, ×). */
    series: Array<{ year: number; value: number | null }>;
    peer: Array<{ label: string; value: number | null }>;
  };
  /** 6C — Chất lượng sổ sách. */
  sub_c: {
    /** company = DSO ngày (KHÔNG bình quân); peer LUÔN null. */
    series: Array<{ year: number; company: number | null; peer: null }>;
    /** ĐÚNG 3 mục. `ok` là BOOLEAN (thiếu dữ liệu → false, KHÔNG null). */
    checklist: Array<{ label: string; ok: boolean }>;
  };
}

/** Template B — 2 câu hỏi con. */
interface HealthBlockB {
  /** 6A — Nợ cho vay có bị xấu nhiều không? */
  sub_a: {
    /** value = llr_loans từng kỳ (proxy NPL, ƯỚC TÍNH). */
    series: Array<{ year: number; value: number | null }>;
    /** ĐÚNG 3 dòng. */
    peer: Array<{ label: string; value: number | null }>;
  };
  /** 6B — Có dự phòng đủ không? */
  sub_b: {
    /** value = provision_expense / ppop_reported (ƯỚC TÍNH). */
    series: Array<{ year: number; value: number | null }>;
    /** ĐÚNG 3 dòng. */
    peer: Array<{ label: string; value: number | null }>;
  };
}
~~~

Nhãn `peer[]` (nguyên văn, thứ tự cố định):

| Nhánh · sub | `peer[0].label` | `peer[1].label` | `peer[2].label` |
|---|---|---|---|
| A · `sub_a` | `Nợ vay / Vốn chủ (công ty)` = `debt(cur)/equity(cur)` | `Trung vị ngành` = **`null`** | — |
| A · `sub_b` | `Thanh khoản hiện hành (công ty)` = `current_assets/current_liabilities` | `Trung vị ngành` = **`null`** | — |
| B · `sub_a` | `Dự phòng / Cho vay (công ty)` = `llr_loans(cur)` | `Ngưỡng cảnh báo` = **hằng số `0.03`** | `Trung vị ngành` = **`null`** |
| B · `sub_b` | `Chi phí dự phòng / PPOP (công ty)` = `ppop_cor.provision_ppop` | `Đòn bẩy (Tổng TS / VCSH)` = `total_assets/equity` | `Trung vị ngành` = **`null`** |

`checklist` Template A (thứ tự cố định):

| # | `label` | `ok === true` khi |
|---|---|---|
| 1 | `Lợi nhuận có khớp với tiền mặt thu về?` | `cfo_ni !== null && cfo_ni >= 1.0` |
| 2 | `Không pha loãng cổ phiếu của cổ đông?` | `charter_capital(newest) !== null && charter_capital(oldest) !== null && cc_new <= cc_old × 1.05` |
| 3 | `Khách hàng không trả tiền chậm dần?` | `dso(newest) !== null && dso(oldest) !== null && dso_new <= dso_old × 1.10` |

> **BẪY: `Trung vị ngành` không bao giờ được điền.** `apply_benchmark` chỉ đi qua `block.metrics`
> (mảng có khóa `metrics`), **không** đi qua `block.sub_*.peer`. Nên 3 dòng "Trung vị ngành" trong
> khối 6 **luôn `null`** dù `sector_median_cache` có `net_debt_ebitda`/`dso`. Bản TS phải sao chép
> đúng (nếu muốn điền thì đó là **tính năng mới**, phải đổi cả frontend).

> **BẪY: 2 định nghĩa DSO trong cùng hệ thống.** `blocks.health.sub_c.series[].company` dùng
> `trade_receivables` **của chính kỳ đó** (`ar / rev × 365`), còn `modules[wcc]` của endpoint 2 dùng
> `avg2(trade_receivables)`. Hai số **khác nhau**. Đây là chủ ý (chart 5 năm cần số từng kỳ), giữ nguyên.

#### KHỐI 7 — `blocks.dividend`

~~~ts
interface DividendBlock {
  /** CŨ → MỚI, ≤5. value = cổ tức của NĂM đó, null nếu không có dòng ratio khớp năm. */
  series: Array<{ year: number; value: number | null }>;
  /** latest_dividend / price. Phân số. */
  yield: number | null;
  /** latest_dividend / eps. Phân số. */
  payout: number | null;
  /** "tiền mặt" cho phi ngân hàng; "cổ phiếu" cho ngân hàng. HẰNG SỐ theo template, KHÔNG suy từ dữ liệu. */
  form: "tiền mặt" | "cổ phiếu";
}
~~~

Cách lấy cổ tức: quét `ratio_rows` theo thứ tự có sẵn (mới nhất trước), với mỗi dòng lấy
`year = year_report ‖ year`; nếu `dividend` là số thì **ghi nếu năm đó chưa có** (`setdefault` — dòng
gặp trước thắng). `latest_div` = giá trị của **năm đầu tiên trong `periods[:5]`** (mới→cũ) mà có cổ tức.

> `form` là hằng số theo template — **không** đọc dữ liệu. Với ngân hàng chia tiền mặt vẫn ghi
> `"cổ phiếu"`. Đây là đơn giản hoá đã biết. Đơn vị `series[].value` cũng khác nhau theo nhánh:
> A = **VND/cp**, B = **tỷ lệ cổ phiếu** (ví dụ `1.0` = 100%) → `yield`/`payout` của nhánh B **không có
> ý nghĩa tài chính**. Giữ nguyên, ghi chú ở UI.

#### `meta`

| Trường | Template A | Template B |
|---|---|---|
| `is_estimated_fields` | `["blocks.business.earnings_quality"]` | `["blocks.health.sub_a.series", "blocks.health.sub_b.series"]` (đúng thứ tự đó) |
| `disclaimers` | `[BASE, NONBANK_DCF]` | `[BASE, BANK_NOTES]` |

Ba chuỗi disclaimer, **nguyên văn**:

| Hằng | Nội dung |
|---|---|
| `BASE` | `Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT); so ngành và ngưỡng mang tính tham chiếu. Không phải khuyến nghị mua/bán/giữ.` |
| `NONBANK_DCF` | `Football field dùng P/E lịch sử, thu nhập thặng dư (RIM) và sàn sổ sách; DCF chưa được ước lượng ở lớp tính toán deterministic.` |
| `BANK_NOTES` | `Thiếu thuyết minh: nợ xấu theo nhóm, CAR và CASA không có sẵn — chất lượng tài sản dùng số đại diện từ 3 báo cáo (ước tính).` |

Payload **rỗng dữ liệu** dùng 3 chuỗi: `[BASE, "Không đủ dữ liệu BCTC để dựng dashboard.", NONBANK_DCF | BANK_NOTES]`.

**Ví dụ JSON — FPT (Template A, `term_type=1`, có lớp benchmark)**

Số minh họa, nội bộ nhất quán; đơn vị VND.

~~~json
{
  "data": {
    "template": "A",
    "sub_sector": "CNTT / Dịch vụ",
    "hero": {
      "ticker": "FPT",
      "name": null,
      "exchange": null,
      "sector": "Công nghệ Thông tin",
      "price": 140000.0,
      "fair_value": 77348.0,
      "upside_pct": -0.4475142857
    },
    "radar": {
      "dims": [
        { "key": "business", "label": "Kinh doanh", "score": 89, "band": "good", "value_label": "18.0%", "value": 0.1801801802 },
        { "key": "profitability", "label": "Sinh lời", "score": 100, "band": "good", "value_label": "24.9%", "value": 0.2490931076 },
        { "key": "cashflow", "label": "Dòng tiền", "score": 84, "band": "good", "value_label": "1.09×", "value": 1.094488189 },
        { "key": "safety", "label": "An toàn tài chính", "score": 100, "band": "good", "value_label": "-0.68×", "value": -0.6779661017 },
        { "key": "valuation", "label": "Định giá", "score": 0, "band": "warn", "value_label": "-44.8%", "value": -0.4475142857 }
      ]
    },
    "blocks": {
      "financial": {
        "stacked_abs": [
          { "year": 2021, "equity": 22800000000000, "other_liab": 12100000000000, "debt": 9800000000000 },
          { "year": 2022, "equity": 27400000000000, "other_liab": 13900000000000, "debt": 11700000000000 },
          { "year": 2023, "equity": 32100000000000, "other_liab": 16100000000000, "debt": 13600000000000 },
          { "year": 2024, "equity": 37900000000000, "other_liab": 18000000000000, "debt": 15300000000000 },
          { "year": 2025, "equity": 44800000000000, "other_liab": 21600000000000, "debt": 16000000000000 }
        ],
        "growth_sources": [
          { "label": "Lợi nhuận giữ lại", "amount": 6700000000000, "pct": 0.1777188329 },
          { "label": "Nợ vận hành", "amount": 9500000000000, "pct": 0.2519893899 },
          { "label": "Vay nợ", "amount": 6200000000000, "pct": 0.1644562334 }
        ],
        "totals": [
          { "label": "Tổng tài sản", "value": 82400000000000, "mult": 1.8434004474 },
          { "label": "Vốn chủ sở hữu", "value": 44800000000000, "mult": 1.9649122807 },
          { "label": "Nợ phải trả", "value": 37600000000000, "mult": 1.7168949772 }
        ],
        "asset_mix": [
          { "label": "Tiền & ĐT ngắn hạn", "pct": 0.3398058252 },
          { "label": "Phải thu khách hàng", "pct": 0.1844660194 },
          { "label": "Tài sản cố định", "pct": 0.1626213592 },
          { "label": "Khác", "pct": 0.3131067962 }
        ]
      },
      "business": {
        "revenue_series": [
          { "year": 2021, "revenue": 42300000000000, "gross_margin": 0.3734042553, "net_margin": 0.1489361702 },
          { "year": 2022, "revenue": 48600000000000, "gross_margin": 0.378600823, "net_margin": 0.1522633745 },
          { "year": 2023, "revenue": 55700000000000, "gross_margin": 0.3805744165, "net_margin": 0.1561938959 },
          { "year": 2024, "revenue": 66600000000000, "gross_margin": 0.3813813814, "net_margin": 0.1621621622 },
          { "year": 2025, "revenue": 78600000000000, "gross_margin": 0.3829516539, "net_margin": 0.1615776081 }
        ],
        "metrics": [
          { "key": "revenue_growth", "label": "Tăng trưởng doanh thu", "value": 0.1801801802, "unit": "%", "peer_median": 0.094, "color": "green" },
          { "key": "gross_margin", "label": "Biên lợi nhuận gộp", "value": 0.3829516539, "unit": "%", "peer_median": 0.211, "color": "green" },
          { "key": "roe", "label": "ROE", "value": 0.2490931076, "unit": "%", "peer_median": 0.152, "color": "green" }
        ],
        "earnings_quality": {
          "core_pct": 0.9668874172,
          "oneoff_pct": 0.0331125828,
          "peer_median": null
        }
      },
      "cashflow": {
        "profit_vs_cash": [
          { "year": 2021, "profit": 6300000000000, "cfo": 7100000000000 },
          { "year": 2022, "profit": 7400000000000, "cfo": 8600000000000 },
          { "year": 2023, "profit": 8700000000000, "cfo": 10100000000000 },
          { "year": 2024, "profit": 10800000000000, "cfo": 11900000000000 },
          { "year": 2025, "profit": 12700000000000, "cfo": 13900000000000 }
        ],
        "metrics": [
          { "key": "cfo_ni", "label": "Tiền từ KD / Lợi nhuận", "value": 1.094488189, "unit": "x", "peer_median": null, "color": "green" },
          { "key": "fcf_margin", "label": "Dòng tiền tự do / Doanh thu", "value": 0.0903307888, "unit": "%", "peer_median": null, "color": "green" },
          { "key": "accrual", "label": "Phần lãi chưa thành tiền", "value": -0.0145631068, "unit": "%", "peer_median": null, "color": "green" }
        ],
        "waterfall": [
          { "label": "Lợi nhuận sau thuế (NI)", "value": 12700000000000, "kind": "base" },
          { "label": "(+) Khấu hao", "value": 3100000000000, "kind": "delta" },
          { "label": "(+) Dự phòng", "value": 400000000000, "kind": "delta" },
          { "label": "(±) Thay đổi vốn lưu động", "value": -2300000000000, "kind": "delta" },
          { "label": "= CFO", "value": 13900000000000, "kind": "base" },
          { "label": "(−) CapEx", "value": -6800000000000, "kind": "delta" },
          { "label": "= FCF (Dòng tiền tự do)", "value": 7100000000000, "kind": "base" }
        ]
      },
      "valuation": {
        "methods": [
          { "name": "P/E lịch sử", "bear": 107640.0, "base": 136620.0, "bull": 166290.0 },
          { "name": "Thu nhập thặng dư (RIM)", "bear": null, "base": 77348.0, "bull": null },
          { "name": "Sàn sổ sách", "bear": null, "base": 30500.0, "bull": null },
          { "name": "Trung vị tổng hợp", "bear": 30500.0, "base": 77348.0, "bull": 166290.0 }
        ],
        "current_price": 140000.0,
        "fair_median": 77348.0,
        "upside_pct": -0.4475142857,
        "metrics": [
          { "key": "pe", "label": "P/E", "value": 22.5, "peer_median": 18.4, "color": "red" },
          { "key": "pb", "label": "P/B", "value": 4.6, "peer_median": 2.85, "color": "red" },
          { "key": "roe", "label": "ROE", "value": 0.2490931076, "peer_median": 0.152, "color": "green" }
        ]
      },
      "health": {
        "sub_a": {
          "series": [
            { "year": 2021, "value": -0.4421052632 },
            { "year": 2022, "value": -0.5405405405 },
            { "year": 2023, "value": -0.6456692913 },
            { "year": 2024, "value": -0.6315789474 },
            { "year": 2025, "value": -0.6779661017 }
          ],
          "peer": [
            { "label": "Nợ vay / Vốn chủ (công ty)", "value": 0.3571428571 },
            { "label": "Trung vị ngành", "value": null }
          ]
        },
        "sub_b": {
          "series": [
            { "year": 2021, "value": 8.4444444444 },
            { "year": 2022, "value": 8.0909090909 },
            { "year": 2023, "value": 7.2857142857 },
            { "year": 2024, "value": 7.2941176471 },
            { "year": 2025, "value": 7.3 }
          ],
          "peer": [
            { "label": "Thanh khoản hiện hành (công ty)", "value": 1.6132075472 },
            { "label": "Trung vị ngành", "value": null }
          ]
        },
        "sub_c": {
          "series": [
            { "year": 2021, "company": 56.0874704492, "peer": null },
            { "year": 2022, "company": 60.8333333333, "peer": null },
            { "year": 2023, "company": 64.2190305206, "peer": null },
            { "year": 2024, "company": 71.7942942943, "peer": null },
            { "year": 2025, "company": 70.5852417303, "peer": null }
          ],
          "checklist": [
            { "label": "Lợi nhuận có khớp với tiền mặt thu về?", "ok": true },
            { "label": "Không pha loãng cổ phiếu của cổ đông?", "ok": true },
            { "label": "Khách hàng không trả tiền chậm dần?", "ok": false }
          ]
        }
      },
      "dividend": {
        "series": [
          { "year": 2021, "value": 1000.0 },
          { "year": 2022, "value": 1500.0 },
          { "year": 2023, "value": 1500.0 },
          { "year": 2024, "value": 2000.0 },
          { "year": 2025, "value": 2000.0 }
        ],
        "yield": 0.0142857143,
        "payout": 0.2898550725,
        "form": "tiền mặt"
      }
    },
    "meta": {
      "periods": ["2025", "2024", "2023", "2022", "2021"],
      "is_estimated_fields": ["blocks.business.earnings_quality"],
      "peer_count": 17,
      "peer_asof": "2026-08-17",
      "disclaimers": [
        "Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT); so ngành và ngưỡng mang tính tham chiếu. Không phải khuyến nghị mua/bán/giữ.",
        "Football field dùng P/E lịch sử, thu nhập thặng dư (RIM) và sàn sổ sách; DCF chưa được ước lượng ở lớp tính toán deterministic."
      ]
    }
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T03:16:11.204778Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/financial-statement"
  }
}
~~~

**Trích các khối KHÁC BIỆT của Template B — VCB** (fragment, không phải response đầy đủ; series rút
gọn 3 kỳ để dễ đọc):

~~~json
{
  "template": "B",
  "sub_sector": null,
  "hero": {
    "ticker": "VCB",
    "name": null,
    "exchange": null,
    "sector": "Ngân hàng",
    "price": 60000.0,
    "fair_value": 64400.0,
    "upside_pct": 0.0733333333
  },
  "radar": {
    "dims": [
      { "key": "growth", "label": "Tăng trưởng", "score": 49, "band": "ok", "value_label": "6.3%", "value": 0.0631424376 },
      { "key": "profitability", "label": "Sinh lời", "score": 65, "band": "ok", "value_label": "16.7%", "value": 0.1671568627 },
      { "key": "asset_quality", "label": "Chất lượng tài sản", "score": 56, "band": "ok", "value_label": "2.1%", "value": 0.0210526316 },
      { "key": "capital", "label": "An toàn vốn", "score": 75, "band": "good", "value_label": "10.0%", "value": 0.1 },
      { "key": "valuation", "label": "Định giá", "score": 61, "band": "ok", "value_label": "7.3%", "value": 0.0733333333 }
    ]
  },
  "blocks_business": {
    "revenue_series": [
      { "year": 2023, "revenue": 62800000000000, "gross_margin": null, "net_margin": 0.4649681529 },
      { "year": 2024, "revenue": 68100000000000, "gross_margin": null, "net_margin": 0.4596182085 },
      { "year": 2025, "revenue": 72400000000000, "gross_margin": null, "net_margin": 0.4709944751 }
    ],
    "metrics": [
      { "key": "nim", "label": "NIM", "value": 0.0288764168, "unit": "%", "peer_median": 0.0312, "color": "amber" },
      { "key": "roa", "label": "ROA", "value": 0.01647343, "unit": "%", "peer_median": null, "color": "green" },
      { "key": "roe", "label": "ROE", "value": 0.1671568627, "unit": "%", "peer_median": 0.1585, "color": "amber" }
    ],
    "nim_series": [
      { "year": 2023, "nim": 0.0301234568, "nim_note": "ví dụ minh họa" },
      { "year": 2024, "nim": 0.0294117647, "nim_note": "ví dụ minh họa" },
      { "year": 2025, "nim": 0.0288764168, "nim_note": "ví dụ minh họa" }
    ],
    "income_mix": [
      { "label": "Lãi thuần", "pct": 0.770718232 },
      { "label": "Phí dịch vụ", "pct": 0.1008287293 },
      { "label": "Ngoại hối & KD chứng khoán", "pct": 0.0745856354 },
      { "label": "Khác", "pct": 0.0538674033 }
    ]
  },
  "blocks_cashflow": {
    "cir_series": [
      { "year": 2023, "cir": 0.3312101911 },
      { "year": 2024, "cir": 0.3245227606 },
      { "year": 2025, "cir": 0.3190607735 }
    ],
    "metrics": [
      { "key": "cir", "label": "CIR (chi phí / thu nhập)", "value": 0.3190607735, "unit": "%", "peer_median": 0.362, "color": "green" },
      { "key": "cost_of_risk", "label": "Chi phí tín dụng / Cho vay", "value": -0.0038888889, "unit": "%", "peer_median": null, "color": "green" },
      { "key": "provision_ppop", "label": "Chi phí dự phòng / PPOP", "value": -0.1135902637, "unit": "%", "peer_median": null, "color": "green" }
    ],
    "ppop": 49300000000000
  },
  "blocks_health": {
    "sub_a": {
      "series": [
        { "year": 2023, "value": 0.0195121951 },
        { "year": 2024, "value": 0.0202205882 },
        { "year": 2025, "value": 0.0210526316 }
      ],
      "peer": [
        { "label": "Dự phòng / Cho vay (công ty)", "value": 0.0210526316 },
        { "label": "Ngưỡng cảnh báo", "value": 0.03 },
        { "label": "Trung vị ngành", "value": null }
      ]
    },
    "sub_b": {
      "series": [
        { "year": 2023, "value": -0.1097560976 },
        { "year": 2024, "value": -0.1118881119 },
        { "year": 2025, "value": -0.1135902637 }
      ],
      "peer": [
        { "label": "Chi phí dự phòng / PPOP (công ty)", "value": -0.1135902637 },
        { "label": "Đòn bẩy (Tổng TS / VCSH)", "value": 10.0 },
        { "label": "Trung vị ngành", "value": null }
      ]
    }
  },
  "blocks_dividend": {
    "series": [
      { "year": 2023, "value": 0.5 },
      { "year": 2024, "value": 0.8 },
      { "year": 2025, "value": 1.0 }
    ],
    "yield": 0.0000166667,
    "payout": 0.0001642036,
    "form": "cổ phiếu"
  },
  "meta": {
    "periods": ["2025", "2024", "2023", "2022", "2021"],
    "is_estimated_fields": ["blocks.health.sub_a.series", "blocks.health.sub_b.series"],
    "peer_count": 12,
    "peer_asof": "2026-08-17",
    "disclaimers": [
      "Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT); so ngành và ngưỡng mang tính tham chiếu. Không phải khuyến nghị mua/bán/giữ.",
      "Thiếu thuyết minh: nợ xấu theo nhóm, CAR và CASA không có sẵn — chất lượng tài sản dùng số đại diện từ 3 báo cáo (ước tính)."
    ]
  }
}
~~~

> Fragment trên dùng tên khóa `blocks_business` / `blocks_cashflow` / `blocks_health` /
> `blocks_dividend` **chỉ để trình bày** — trong response thật chúng nằm trong `blocks` với khóa
> `business` / `cashflow` / `health` / `dividend`. Khóa `nim_note` **không tồn tại** trong response
> thật (chỉ là chú thích của tài liệu). `blocks.financial` và `blocks.valuation` của nhánh B theo
> đúng bảng đặc tả ở trên.
>
> Chú ý `dividend.yield = 0.0000166667` của VCB: đó là `1.0 / 60000` — **vô nghĩa** vì `dividend` của
> ngân hàng là **tỷ lệ cổ phiếu**, không phải VND/cp. Đây là hạn chế đã biết, không phải lỗi tính toán.

**Lỗi**

| Status | code | Khi nào | `detail` (nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` sau uppercase không khớp `^[A-Z0-9]{1,10}$` | `Mã chứng khoán không hợp lệ: FPT.HM` |
| 422 | `less_than_equal` / `greater_than_equal` | `term_type` ∉ [1,2] | `[{"loc":["query","term_type"],"msg":"Input should be greater than or equal to 1","type":"greater_than_equal","input":"0"}]` |
| 429 | — | Vượt `60/minute` | Thông điệp của slowapi |
| 502 | — | Gọi VCI `/financial-statement` lỗi/timeout | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm** — thiết kế **nhiều lớp**, mỗi lớp suy giảm độc lập:

| Lớp | Khi lỗi/thiếu | Kết quả |
|---|---|---|
| 3 báo cáo (VCI) | lỗi/timeout | **502** — đây là lớp duy nhất làm fail request |
| 3 báo cáo trả về nhưng ghép được **0 kỳ** | — | **HTTP 200** với payload rỗng (xem dưới) |
| Bảng ratio | exception | `ratio_rows = []` → `price = null`, `fair_value = null`, `upside_pct = null`, `methods = []`, `metrics` khối 2 toàn `null`, `dividend.series` toàn `null`, `yield`/`payout` = `null`, `radar.valuation.score = null` |
| Company overview | exception | `overview = {}` → `hero.sector = null` và **`icb_lv2` phải lấy từ DB**; nếu DB cũng không có → **bỏ hẳn lớp benchmark** |
| Tra `Symbol.icb_lv2` trong DB | exception hoặc không có row | rơi xuống `overview.icb_name_2` |
| `icb_lv2` rỗng cả 2 nguồn | — | `_apply_peer_benchmark` **return sớm**: mọi `peer_median` = `null`, mọi `color` = `null`, mọi `radar.score`/`band` = `null`, `peer_count = 0`, `peer_asof = null` |
| Screening VCI (lấy peer) | exception ở trang nào | **break** vòng lặp, dùng số peer đã gom được |
| Ratio của 1 peer | exception | peer đó bị loại, **không** fail lô |
| Số peer có dữ liệu `< 3` | — | median **toàn `null`** nhưng vẫn ghi cache; `peer_count` = số thực tế; `color` vẫn được gán (theo ngưỡng tuyệt đối, `peer = null`); `radar.score`/`band` vẫn tính |
| Upsert cache | exception (đua insert) | rollback **chỉ** SAVEPOINT, log warning, request vẫn 200 |
| **Bất kỳ** lỗi khác trong `_apply_peer_benchmark` | — | bắt toàn bộ, log `warning` với `exc_info`, trả **dashboard B1** (peer/color/score = `null`). **Không** ảnh hưởng HTTP status |
| `db` là `None` (gọi từ code khác, không qua HTTP) | — | bỏ hẳn lớp benchmark (dashboard B1) |
| Ít hơn 5 kỳ | — | series chỉ có số kỳ có; **không nội suy**. `growth_sources`/`totals.mult` so kỳ mới nhất với kỳ cũ nhất **có sẵn** |
| Chỉ 1 kỳ | — | `newest === oldest` → `ta_delta = 0` → mọi `growth_sources.pct = null`; `totals.mult = 1.0`; `revenue_growth = null`; `radar.business.score = null` |
| Ngoài giờ giao dịch | — | không ảnh hưởng (dữ liệu theo kỳ) |

Payload **rỗng dữ liệu** (`build_periods` trả `[]`), **HTTP 200**:

~~~json
{
  "data": {
    "template": "A",
    "sub_sector": null,
    "hero": {
      "ticker": "XYZ",
      "name": null,
      "exchange": null,
      "sector": null,
      "price": null,
      "fair_value": null,
      "upside_pct": null
    },
    "radar": { "dims": [] },
    "blocks": {},
    "meta": {
      "periods": [],
      "is_estimated_fields": [],
      "peer_count": 0,
      "peer_asof": null,
      "disclaimers": [
        "Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT); so ngành và ngưỡng mang tính tham chiếu. Không phải khuyến nghị mua/bán/giữ.",
        "Không đủ dữ liệu BCTC để dựng dashboard.",
        "Football field dùng P/E lịch sử, thu nhập thặng dư (RIM) và sàn sổ sách; DCF chưa được ước lượng ở lớp tính toán deterministic."
      ]
    }
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T03:16:12.005413Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/XYZ/financial-statement"
  }
}
~~~

> Payload rỗng **vẫn đi qua** `_apply_peer_benchmark` (nếu có `db`) — `apply_benchmark` chịu được
> `blocks = {}` và `dims = []` mà không lỗi, nhưng `meta.peer_asof` **sẽ được ghi** nếu `icb_lv2` tra
> được. Nghĩa là payload rỗng có thể có `peer_asof !== null` và `peer_count > 0`. Đây là hành vi hiện
> tại; bản TS giữ nguyên.

**curl**

~~~bash
curl -sS -X GET \
  "https://api.iqx.vn/api/v1/market-data/bctc-dashboard/FPT?term_type=1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: c4e7b910-6a83-4d52-bf1e-90d2a7c53e68"
~~~

~~~bash
# Ngân hàng (Template B)
curl -sS -X GET \
  "https://api.iqx.vn/api/v1/market-data/bctc-dashboard/VCB?term_type=1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 0b5d3e17-8c42-4a96-a1f7-53e8d6b02c94"
~~~

**Ghi chú khi viết lại**

1. **BẪY #1 — `hero.name` và `hero.exchange` LUÔN `null`.** Hàm chuẩn hóa overview
   (`normalize_company_overview`) chỉ trả `{issue_share, charter_capital, company_profile, history,
   icb_name_2, icb_name_3, icb_name_4}` — **không có** `name`, **không có** `exchange`. `_hero` vẫn đọc
   `overview.get("name")` / `overview.get("exchange")` nên kết quả luôn `null`. Bản TS **phải giữ 2
   khóa này trong response** (frontend đọc chúng) và **phải trả `null`**. Nếu muốn điền thật thì lấy từ
   bảng `symbols` — đó là **tính năng mới**, không phải port.
2. **Thứ tự thực thi trong `assemble_dashboard`** (không được đảo): `detect_template` → `load_mapping`
   → `build_periods` → (rỗng: trả `_empty_dashboard`, dừng) → **cắt `periods = periods[:5]`** →
   `price = _price_from_ratio` → `sub_sector` → `financial` → (`business`, `cashflow`, `valuation`,
   `health` theo nhánh) → `dividend` → `fair_value = valuation.fair_median` → `hero` →
   `upside = valuation.upside_pct` → `radar` → `meta`. `hero` và `radar` **phụ thuộc** `valuation`.
3. **Cắt 5 kỳ xảy ra TRƯỚC mọi tính toán.** Khác endpoint 2 (không cắt). Nên `avg2(cur, prev)` ở
   dashboard dùng `periods[1]` **sau khi cắt**, và kỳ thứ 6 không bao giờ được nhìn tới.
4. `_oldest_to_newest(periods)` = `reverse(periods.slice(0, 5))`. Được gọi **nhiều lần** trong các hàm
   khối — kết quả giống nhau, không cần memo nhưng phải nhất quán.
5. **`term_type=2`:** `series[].year` là `Period.year`, nên 4 quý cùng năm sẽ có **cùng `year`** →
   chart trùng nhãn, `_dividend_block` gán cùng 1 cổ tức cho 4 quý. Dashboard **được thiết kế cho kỳ
   Năm**. Bản TS giữ nguyên hành vi; nếu muốn hỗ trợ quý đúng đắn thì phải dùng `periodLabel(p)` thay
   `p.year` — **thay đổi contract**, phải đổi frontend.
6. **`apply_benchmark` biến đổi TẠI CHỖ và chỉ chạm `block.metrics`.** Không chạm
   `earnings_quality.peer_median`, không chạm `sub_*.peer[]`, không chạm `methods[]`. Đừng "tổng quát
   hoá" — sẽ đổi payload.
7. **`metric_values` dùng `setdefault`** (lần đầu thắng) khi thu thập giá trị cho fallback trục radar.
   Thứ tự duyệt `blocks` phải là thứ tự chèn để `roe` lấy từ `business` (tính từ báo cáo) chứ không
   phải từ `valuation` (từ ratio VCI). Trong JS, `Object.values` trên object literal giữ thứ tự chèn
   cho khoá chuỗi không phải số → an toàn, nhưng nếu dùng `Map` thì phải chèn đúng thứ tự.
8. **Hai ô `roe` cùng ngưỡng, khác thang.** `business.roe` (phân số từ báo cáo) và `valuation.roe`
   (từ ratio VCI) đều bị tô màu bằng ngưỡng `(0.18, 0.12, up)`. Nếu VCI trả `roe` kiểu phần trăm thì
   `valuation.roe` **luôn `green`** một cách vô nghĩa. Rủi ro đã biết (§11).
9. `peer_count` được đọc bằng **truy vấn riêng** vào `sector_median_cache.peer_count` sau khi
   `get_sector_medians` chạy (vì hàm đó không trả về số peer). Truy vấn này nằm trong `try/except`
   riêng — lỗi thì `peer_count` giữ `0` dù benchmark đã áp. Giữ nguyên.
10. `asof = date.today()` dùng **timezone của server**. Nếu deploy nhiều region thì cache có thể lệch
    ngày. Ghi chú vận hành, không phải lỗi logic.
11. `pg_advisory_xact_lock` là **transaction-scoped**. **KHÔNG** được dùng `pg_try_advisory_lock`
    (session-scoped) — biến thể đó từng leak qua connection pool và làm hỏng production 8 ngày.
    Bản TS: nếu dùng ORM có pool (TypeORM/Prisma/Drizzle) thì lock **phải** nằm trong transaction và
    tự nhả khi commit/rollback.
12. Upsert cache **phải** trong SAVEPOINT (`SAVEPOINT`/`ROLLBACK TO SAVEPOINT`, hoặc nested transaction
    của ORM). Nếu dùng transaction phẳng, một lần đua insert sẽ **kéo đổ** transaction của request.
13. `_score` dùng `int(round(...))` của Python (banker's rounding) — xem cảnh báo ở §12.
14. `radar.value_label` được tính ở **tầng compute**, `score`/`band` ở **tầng benchmark**. Với
    `db = null`, `value_label` **vẫn có** nhưng `score`/`band` là `null`. Frontend phải chịu được.
15. Endpoint này là endpoint duy nhất trong chương có **`Depends(get_db)`**. Bản TS phải mở DB session
    cho request và bảo đảm session được đóng/commit — nếu không, advisory lock của bước 11 **không bao
    giờ nhả**.

---

## Ghi chú tổng hợp khi viết lại

#### Bảng so sánh 2 nhánh KPI — NGÂN HÀNG (B) vs PHI NGÂN HÀNG (A)

Đây là bảng đối chiếu duy nhất cần thiết để không lẫn 2 nhánh. `—` = **không tồn tại** ở nhánh đó.

| Vai trò trong phân tích | Template A — phi ngân hàng | Template B — ngân hàng |
|---|---|---|
| **Nhận diện** | mặc định | có `isb38` \| `isb27` \| `isb43` **truthy** |
| **File mapping** | `nonbank.yaml` (37 concept) | `bank.yaml` (34 concept) |
| **"Doanh thu"** | `net_revenue` (`isa3`) | `total_operating_income` — TOI (`isb38`) |
| **Biên gộp** | `gross_profit / net_revenue` | — (không áp dụng; `revenue_series.gross_margin = null`) |
| **Sinh lời chính** | `roe` = `npat_parent / avg2(equity_parent ‖ equity)` | `roe` = `npat / avg2(equity)` |
| **Sinh lời phụ** | — | `roa` = `npat / avg2(total_assets)` |
| **Biên lãi** | — | `nim` = `net_interest_income / avg(earning_assets)` |
| **Hiệu quả chi phí** | `common_size.selling_pct` + `admin_pct` | `cir` = `abs(operating_expense) / TOI` |
| **Tăng trưởng (radar)** | `revenue_growth` | tăng trưởng TOI |
| **Đòn bẩy / an toàn** | `net_debt_ebitda` (×) | `equity_ratio` = `equity / total_assets` |
| **Thanh khoản/cấu trúc** | `current_assets / current_liabilities` | `ldr` = `customer_loans / customer_deposits` |
| **Chất lượng tài sản** | `dso` (ngày), checklist 3 mục | `llr_loans` = `abs(loan_loss_reserve)/customer_loans` (**proxy NPL, ước tính**) |
| **Chi phí rủi ro** | — | `cost_of_risk` = `provision_expense / avg2(customer_loans)`; `provision_ppop` |
| **Dòng tiền** | `cfo_ni`, `fcf_margin`, `sloan_accrual`, waterfall 7 bước | — (LCTT vô nghĩa với NH; thay bằng CIR/PPOP) |
| **Điểm phá sản** | `altman_z` (5 nhân tố) | — (`trinity.altman_z = null`) |
| **Piotroski** | 9 tiêu chí, `score` 0..9 | 9 tiêu chí nhưng chỉ 2 tính được → `score` tối đa **2** |
| **Beneish** | tính được | thực tế luôn `null` (thiếu concept) |
| **Phân rã ROE** | `dupont` 5 driver + LMDI | `bank_dupont` (ROA × EM + phân rã theo tổng TS) |
| **Định giá** | Football field: P/E band 5 năm, RIM, sàn sổ sách, trung vị tổng hợp; `ke=0.125`, `g=0.05` | P/B: `justified_pb`, `fair_value`, ma trận độ nhạy NIM×CoR 3×3; `ke=0.14`, `g=0.07` |
| **Nguồn vốn (khối 3)** | LN giữ lại / Nợ vận hành / Vay nợ | LN giữ lại / Tiền gửi huy động / Vay & phát hành khác |
| **Cơ cấu tài sản (khối 3)** | Tiền & ĐTNH / Phải thu / TSCĐ / Khác | Cho vay KH / CK đầu tư / Tiền & gửi NHNN-TCTD / Khác |
| **Ngành phụ** | có (`sub_sector` nhãn, đổi ngưỡng) | **không** (`sub_sector = null`) |
| **Điểm mù** | `blind_spots = []` | 4 điểm mù (nợ nhóm 2-5, CASA, CAR, nợ TT02) |
| **Số khối con của Khối 6** | 3 (`sub_a`, `sub_b`, `sub_c`) | 2 (`sub_a`, `sub_b`) |
| **Cờ ước tính** | `blocks.business.earnings_quality` | `blocks.health.sub_a.series`, `blocks.health.sub_b.series` |
| **Cổ tức** | `form = "tiền mặt"`, `series` VND/cp | `form = "cổ phiếu"`, `series` là **tỷ lệ** |
| **Trục radar** | `business`, `profitability`, `cashflow`, `safety`, `valuation` | `growth`, `profitability`, `asset_quality`, `capital`, `valuation` |
| **Khóa `blocks` narrative (ch.29)** | `valuation, financial, business, cashflow, health{a,b,c}, dividend` | `valuation, financial, earning, efficiency, asset_quality{a,b}, dividend` |

> **Lưu ý bất đối xứng đã biết:** tên khóa `blocks` của **narrative AI** (chương 29) **khác** tên khóa
> `blocks` của **dashboard deterministic**: narrative B dùng `earning`/`efficiency`/`asset_quality`,
> còn dashboard B dùng `business`/`cashflow`/`health`. Frontend phải map thủ công. **Đừng "sửa" cho
> khớp** — validator của narrative kiểm bộ khóa chính xác và sẽ fail-closed.

#### Bảng kiểm nhận (acceptance) cho bản TS

| # | Hạng mục | Điều kiện đạt |
|---|---|---|
| 1 | Nhận diện template | Mã có `isb38 = 0.0` (FPT) → `"A"`. Mã có `isb27 = 500` → `"B"`. `[]` → `"A"`. |
| 2 | Mapping | `nonbank.net_revenue === "isa3"` (**không phải `isa1`**), `nonbank.cfo === "cfa18"`, `nonbank.capex === "cfa19"`, `nonbank.equity_parent === null`, `bank.earning_assets === null`, `bank.customer_deposits === "bsb113"`, `bank.valuable_papers === "bsb116"`. `loadMapping("xxx")` **throw**. |
| 3 | Thứ tự kỳ | `periods` mới→cũ; `columns` của `common_size`/`wcc` cũ→mới; series dashboard cũ→mới. |
| 4 | Chia 0 | Mọi mẫu số `0` hoặc thiếu → `null`, **không** `Infinity`/`NaN`/`0`. Không throw. |
| 5 | `or` falsy | `npat_parent = 0` → ROE dùng `npat` (không ra `0`). |
| 6 | Ngưỡng biên | `classify("roe", 0.12) === "red"`, `classify("roe", 0.18) === "amber"`, `classify("ldr", 0.85) === "amber"`, `classify("net_debt_ebitda", 1.5) === "green"`, `classify("net_debt_ebitda", -0.2) === "green"`, `classify("altman_z", 2.5) === "amber"`, `classify("khong_biet", 1) === "na"`, `classify("roe", null) === "na"`. |
| 7 | Snapshot | Luôn **đúng 6 ô** cho cả 2 template, đúng thứ tự, `label`/`unit` khớp nguyên văn. `llr_loans.status === "na"` dù có giá trị. |
| 8 | Module | Luôn **đúng 4 module**, đúng `id`/`title`/`type`/thứ tự. Ngân hàng **không** có `dupont`; phi ngân hàng **không** có `bank_dupont`. |
| 9 | LMDI | Tổng 5 `contribution` = `roe_delta` (sai số ≤ 1e-9) khi tính được; `null` cho cả 5 khi có driver ≤ 0 hoặc `null`; `0.0` cho cả 5 khi `abs(Σ logs) ≤ 1e-12`. |
| 10 | Không crash khi thiếu NIM | Ngân hàng 3 kỳ với `earning_assets` không map (NIM = `null` mọi kỳ) → `forensic` chạy bình thường (đã lọc `null` khỏi `nim_series`). |
| 11 | Payload rỗng | `build_periods` rỗng → `/bctc` trả `trinity: {}`, `valuation: null`, `forensic.red === ["Không đủ dữ liệu BCTC"]`; `/bctc-dashboard` trả `blocks: {}`, `radar.dims: []`, 3 disclaimer. Cả hai **HTTP 200**. |
| 12 | Peer median cache hit | Có row `(icb_lv2, asof)` → **không** gọi screening/ratio nào. |
| 13 | Peer median miss | Tính median (trung vị nội suy), ghi **đúng 1 row**, `peer_count` = số peer có dữ liệu; khóa không peer nào có → `null`. |
| 14 | Peer median degrade | `< 3` peer → **toàn `null`**, không throw, vẫn ghi cache với `peer_count < 3`. |
| 15 | Benchmark bỏ qua | `db = null` hoặc `icb_lv2` rỗng → mọi `peer_median`/`color`/`score`/`band` = `null`, `peer_count = 0`, `peer_asof = null`. |
| 16 | Màu peer-adjusted | `direction="up"`, `value >= green` nhưng `value < peer` → `"amber"` (không phải `"green"`). |
| 17 | Hình dạng khối 2 | `valuation.metrics[]` **không có** `unit`; ô `justified_pb` **không có** khóa `color`. |
| 18 | `hero` | `name === null`, `exchange === null` luôn luôn; `sector` = `icb_name_2`. |
| 19 | Cờ validation | `flags` chứa `sanity_flags` trước, `balance_identity` sau; message format `{v:.3f}` và `(2025)`. |
| 20 | Narrative fail-closed | Sau 4 lượt còn lỗi `Cấm tên mô hình học thuật` hoặc `Cấm khuyến nghị` → **502**, nội dung **không** ra ngoài. Lỗi cấu trúc thuần → trả best-effort. |

#### Danh sách "lỗi đã biết / TODO" — sao chép nguyên, ghi chú lại, **không tự sửa**

| # | Vấn đề | Vị trí | Hệ quả |
|---|---|---|---|
| 1 | `hero.name` / `hero.exchange` luôn `null` | `compute._hero` vs `vietcap.normalize_company_overview` | UI thiếu tên & sàn |
| 2 | `dio`/`dpo` âm vì không `abs(cogs)` → `ccc` sai hướng | `kpi_nonbank_modules.working_capital_cycle` | CCC lệch, ảnh hưởng `detect_subsector` (`ccc < 0` khó xảy ra → `ban_le` khó nhận diện) |
| 3 | `cost_of_risk` / `provision_ppop` âm vì không `abs(prov)` | `kpi_bank_modules.ppop_cor` | ngưỡng `down` luôn ra `"green"` — cờ xanh giả |
| 4 | Thang `roe` của ratio VCI **chưa xác định** (phân số hay %) | `peer_median._METRIC_FIELDS`, `_valuation_block_*`, `valuation.*` | median/màu/`justified_pb`/`rim` có thể lệch 100× |
| 5 | 3 luật `forensic` dead code (`fcf_margin_series`, `gross_margin_delta`, `dso_change_2y`) | `forensic._nonbank` vs `assemble.fmetrics` | 3 cờ không bao giờ hiện |
| 6 | `cashflow_identity_flag`, `yoy_outlier_flag` không được gọi | `validation` | 2 loại cờ không bao giờ hiện |
| 7 | `sub_*.peer[].value` "Trung vị ngành" không bao giờ được điền | `benchmark.apply_benchmark` chỉ đi `block.metrics` | UI khối 6 luôn thiếu vạch trung vị ngành |
| 8 | `dividend.form` là hằng số theo template; `yield`/`payout` của NH vô nghĩa | `compute._dividend_block` | số hiển thị sai đơn vị cho ngân hàng |
| 9 | Piotroski cho ngân hàng tối đa 2/9 nhưng vẫn phơi thang 0..9 | `forensic_scores.piotroski_f` + `bank.yaml` | điểm ngân hàng luôn trông rất thấp |
| 10 | `fetch_bctc_statements` không fallback bucket kỳ (khác `fetch_financial_report`) | `vietcap` | `/bctc*` có thể rỗng khi `/fundamentals` vẫn có dữ liệu |
| 11 | Khóa cache Redis không uppercase symbol cho `/bctc*` | `redis_cache.build_cache_key` | phân mảnh cache theo hoa/thường |
| 12 | Row `sector_median_cache` cũ không bị dọn | `peer_median._upsert_cache` | bảng lớn dần theo ngày × ngành |
| 13 | `term_type=2` làm `series[].year` trùng nhãn | `compute` (mọi khối dùng `p.year`) | chart quý sai nhãn |
| 14 | `asset_mix["Khác"].pct` có thể âm | `compute._financial_block` | UI phải chịu số âm |

#### Tổng kết checklist port

1. **Chép nguyên 2 file mapping** (`nonbank.yaml`, `bank.yaml`) — dữ liệu discovery, không suy ra được.
2. **Chép nguyên mọi bảng ngưỡng**: `thresholds._THRESHOLDS` (engine forensic, 10 metric + `altman_z`),
   `benchmark._DEFAULT_METRIC_TH` (13 metric), `benchmark._DEFAULT_DIM_TH` (8 trục), 2 bộ override
   ngành phụ, `_MIN_PEERS = 3`, `_CONCURRENCY = 5`, `_SCREEN_PAGE_SIZE = 100`,
   `_SCREEN_MAX_PAGES = 15`, `top_k = 20`, `_MAX_YEARS = 5`, `max_cols = 5`, `ke/g` cho 2 nhánh,
   neo điểm radar `30`/`75`, ngưỡng cảnh báo NPL `0.03`.
3. **Chép nguyên mọi chuỗi tiếng Việt** (label, title, message, disclaimer, chuỗi forensic, nhãn
   checklist, nhãn peer) kèm **định dạng số nhúng** (`.2f`, `.1f`, `.0f`, `.3f`, `×`).
4. **Giữ mọi khóa `null`** — không prune, không đổi `null` thành `0`/`undefined`.
5. **Giữ thứ tự** — mảng và khóa object đều là contract.
6. **Giữ 3 tầng tách biệt** (chuẩn hóa · tính toán · benchmark) để tầng tính toán vẫn là **thuần hàm,
   unit-test được không cần network/DB** — đây là điểm mạnh của thiết kế hiện tại.
7. **Không thêm auth** vào 3 endpoint này (đang công khai). Phần AI premium ở **chương 29**.
8. **Không thêm `Infinity`/`NaN`** vào JSON — bộ JSON của JS sẽ serialize `Infinity` thành `null` âm
   thầm, còn `NaN` thành `null`; nhưng để đúng contract thì phải trả `null` **có chủ ý** từ tầng tính
   toán, không dựa vào serializer.
