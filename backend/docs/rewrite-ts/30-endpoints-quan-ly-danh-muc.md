# Endpoint — Người quản lý danh mục (Portfolio Manager)

Chương này đặc tả toàn bộ nhóm **"Quản lý danh mục"** (`tags: ["Quản lý danh mục"]`, prefix
`/api/v1/portfolio-manager`) — tính năng sinh **báo cáo phân tích danh mục** cho danh mục
giao dịch ảo (paper trading) của chính người dùng, viết bằng giọng một người quản lý quỹ
riêng. Nhóm chỉ có **2 endpoint** (`POST /analyze`, `GET /report`) nhưng đằng sau là một
engine hai tầng rất lớn: **tầng định lượng** (8 lớp phân tích thuần toán, không AI) và
**tầng diễn giải** (LLM chỉ viết chữ, không được tự tính số). Vì vậy phần lớn chương này
là đặc tả engine — bản TypeScript phải mang **nguyên** mọi công thức, hằng số và ngưỡng
dưới đây, nếu không hai bản sẽ ra hai con số khác nhau trên cùng một danh mục.

Nguồn sự thật cho chương: `app/api/v1/endpoints/portfolio_manager.py`,
toàn bộ `app/services/ai/portfolio_manager/` (13 file), `app/models/portfolio_report.py`,
`app/repositories/portfolio_manager.py`, `app/schemas/portfolio_manager.py`,
`docs/ai/ai-portfolio-manager.md` (system prompt), `docs/ai/portfolio-manager-spec.md`
(spec sản phẩm v1.0), `docs/superpowers/specs/2026-06-29-portfolio-manager-design.md`,
và 19 file test `tests/test_portfolio_manager_*.py`.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `POST` | `/api/v1/portfolio-manager/analyze` | Bearer + Premium | Sinh báo cáo phân tích danh mục cho phiên hôm nay, hoặc trả lại đúng báo cáo đã sinh trong ngày (day-cache). Gọi LLM khi cache miss. |
| `GET` | `/api/v1/portfolio-manager/report` | Bearer + Premium | Đọc báo cáo **đã lưu gần nhất** (bất kể ngày nào), không sinh mới, không gọi LLM. 404 nếu chưa từng có báo cáo. |

Cả hai đều trả **cùng một schema** `AnalyzeResponse` (`{ analysis, narrative, meta }`) —
nhưng **khối `meta` KHÁC NHAU giữa hai endpoint** (xem §Kiểu dữ liệu dùng chung). Đây là
bẫy số một của nhóm này.

---

## Kiểu dữ liệu dùng chung

### 1. Vỏ response (đúng như Pydantic `AnalyzeResponse`)

`app/schemas/portfolio_manager.py` khai báo cực lỏng — `analysis: dict`, `narrative: dict | None = None`,
`meta: dict`. Nghĩa là **FastAPI không validate cây con nào cả**: mọi thứ bên trong
`analysis` / `narrative` / `meta` là passthrough JSON. OpenAPI vì thế chỉ có
`additionalProperties: true` cho ba field này. Bản TS **nên** khai báo type chặt (dưới đây)
nhưng **không được** validate và reject ở runtime — nếu LLM trả thiếu field, backend Python
vẫn trả 200 với `meta.valid = false`, và bản TS phải giữ đúng hành vi đó.

~~~ts
interface AnalyzeResponse {
  analysis: PortfolioAnalysis | InsufficientAnalysis;
  narrative: NarrativeJson | null;
  meta: AnalyzeMetaFresh | AnalyzeMetaCacheHit | AnalyzeMetaInsufficient | LatestReportMeta;
}
~~~

### 2. Bốn biến thể của `meta` (KHÔNG hợp nhất được)

~~~ts
/** POST /analyze — cache miss, đã sinh mới và đã lưu DB */
interface AnalyzeMetaFresh {
  valid: boolean;              // true khi validator không còn lỗi VÀ narrative != null
  cached: false;
  attempts: number;            // 1..3 — số lần đã gọi LLM
  errors: string[];            // danh sách mã lỗi validator của LẦN CUỐI; [] khi valid
  model: string;               // model LLM thực tế, vd "deepseek-v4-flash"
  persisted: true;
  generation_time_ms: number;  // tổng thời gian từ đầu handler tới lúc dựng row
}

/** POST /analyze — day-cache hit (đã có row cho ngày ICT hôm nay) */
interface AnalyzeMetaCacheHit {
  valid: boolean;              // lấy từ cột portfolio_reports.valid
  cached: true;
  model: string | null;        // cột model_used, có thể null
  attempts: 0;
  errors: [];
  persisted: true;
  generation_time_ms: 0;       // LUÔN literal 0, không phải thời gian đọc cache
}

/** POST /analyze — không đủ dữ liệu (hoặc chưa có tài khoản ảo) — KHÔNG gọi LLM, KHÔNG lưu */
interface AnalyzeMetaInsufficient {
  valid: false;
  cached: false;
  insufficient: true;          // field này CHỈ xuất hiện ở nhánh này
  attempts: 0;
  errors: [];
  model: "";                   // chuỗi rỗng, không phải null
  persisted: false;
  generation_time_ms: number;
}

/** GET /report — dựng tay trong endpoint, KHÁC HẲN ba cái trên */
interface LatestReportMeta {
  valid: boolean;
  cached: true;
  model: string | null;
  session_date: string;        // "2026-08-17" — ISO date của báo cáo
  period_number: number;       // 1, 2, 3…
  // KHÔNG có: attempts, errors, persisted, generation_time_ms, insufficient
}
~~~

> **Bẫy:** `GET /report` là endpoint DUY NHẤT trả `session_date` và `period_number` ở
> `meta`. `POST /analyze` KHÔNG trả hai field này — client muốn biết "kỳ mấy" phải đọc
> `analysis.meta.period_number`. Đừng "chuẩn hoá" hai khối meta thành một khi viết lại;
> frontend hiện tại đọc đúng từng biến thể.

### 3. `analysis` — nhánh không đủ dữ liệu

~~~ts
interface InsufficientAnalysis {
  insufficient_data: true;
  reason: string;   // chỉ 1 trong 2 chuỗi cố định, xem bảng lỗi
}
~~~

Hai giá trị `reason` duy nhất (nguyên văn, hằng số trong `analysis.py`):

| Hằng số | Giá trị nguyên văn |
|---|---|
| `NO_ACCOUNT_REASON` | `"Bạn chưa kích hoạt tài khoản giao dịch ảo."` |
| `INSUFFICIENT_REASON` | `"Danh mục chưa đủ dữ liệu để phân tích — cần ít nhất 2 mã và lịch sử giao dịch."` |

### 4. `analysis` — cây đầy đủ (Analysis JSON, hợp đồng §8 của spec)

~~~ts
type PortfolioMode = "first" | "full_changed" | "light_unchanged";

interface PortfolioAnalysis {
  meta: AnalysisMeta;
  overview: OverviewLayer;
  performance: PerformanceLayer;
  allocation: AllocationRow[];      // MẢNG, không phải object
  concentration: ConcentrationLayer;
  risk: RiskLayer;
  attribution: AttributionRow[];    // MẢNG
  quality: QualityLayer;
  behavior: BehaviorLayer;
  scores: ScoresBlock;
  selected_insights: SelectedInsight[];  // 0..2 phần tử
  progress: ProgressBlock;
  // insufficient_data KHÔNG xuất hiện ở nhánh này
}

interface AnalysisMeta {
  portfolio_id: string;   // 8 KÝ TỰ ĐẦU của UUID account, vd "7c1f2a9e" — KHÔNG phải UUID đầy đủ
  date: string;           // ISO date của as_of — tính theo UTC (xem bẫy múi giờ)
  mode: PortfolioMode;
  period: string;         // literal `"kỳ " + period_number`, vd "kỳ 3"
  period_number: number;  // = số báo cáo đã có của account + 1
}

interface PositionRow {
  ticker: string;
  sector: string;         // ICB lv2 (fallback lv1, fallback "Khác")
  weight: number;         // phân số 0..1, làm tròn 3 chữ số thập phân
  pnl: number;            // lãi/lỗ chưa thực hiện, số nguyên VND
  low_confidence: boolean;// true = bị loại khỏi mọi chỉ số rủi ro
}

interface OverviewLayer {
  nav: number;            // VND
  cash_pct: number;       // phân số, 3 lẻ
  n_positions: number;
  total_return: number;   // phân số, 3 lẻ — theo cost basis, KHÔNG theo NAV
  total_pnl: number;      // VND
  holding_months: number; // số nguyên tháng
  positions: PositionRow[];
}

interface PerformanceLayer {
  portfolio_return: number;
  benchmark_return: number;
  excess_return: number;
  max_drawdown: number;             // số ÂM, vd -0.112
  method: "simple_inception";       // hằng số cứng, v1 không có TWR
}

interface AllocationRow {
  sector: string;
  weight: number;
  benchmark: number | null;  // null khi không ghép được với tỷ trọng ngành VN-Index
  active: number | null;     // null khi benchmark null
}

interface ConcentrationLayer {
  top1: number;
  top3: number;
  effective_n: number;       // 1/HHI, "số mã hiệu quả"
  largest_sector: number;
}

interface CorrelationPair { a: string; b: string; value: number }
interface ExcludedTicker { ticker: string; reason: "low_liquidity_short_history" }

interface RiskLayer {
  beta: number;
  volatility: number;        // đã annualize (×√252)
  tracking_error: number;    // đã annualize
  correlation: CorrelationPair[];  // C(n,2) cặp của các mã ĐỦ tin cậy, a/b theo thứ tự alphabet
  excluded: ExcludedTicker[];
}

interface AttributionRow {
  ticker: string;
  pnl: number;
  pct: number | null;        // pnl / total_pnl — CÓ THỂ > 1 hoặc âm; null khi total_pnl = 0
}

interface SectorBenchmark {
  sector: string;
  your_return: number;
  industry_return: number;
  gap: number;               // your_return - industry_return
}

interface QualityLayer {
  pe: number | null;
  pb: number | null;
  roe: number | null;        // phân số, vd 0.207 = 20,7%
  dividend: number | null;   // phân số
  sector_benchmark: SectorBenchmark | null;
}

interface WorstLoser {
  ticker: string;
  pnl_pct: number | null;
  periods_held: number;      // LUÔN = 1 trong v1 (xem bẫy)
}

interface BehaviorLayer {
  avg_holding_days: number;  // 0 nếu chưa có vị thế đóng nào
  losing_count: number;
  disposition_flag: boolean;
  worst_loser: WorstLoser | null;
}

interface PillarScores {
  performance: number;   // 1..5 nguyên
  risk: number;
  diversification: number;
  quality: number;
  discipline: number;
}

interface ScoresBlock {
  overall: number;              // trung bình 5 trụ, làm tròn 1 lẻ
  prev_overall: number | null;  // overall của báo cáo trước, null ở kỳ 1
  pillars: PillarScores;
}

type SelectedInsight =
  | { id: "hidden_corr";           data: { pair: [string, string]; corr: number; combined_weight: number } }
  | { id: "profit_concentration";  data: { max_contribution_pct: number } }
  | { id: "sector_tilt";           data: { sector: string; ratio: number; weight: number } }
  | { id: "holding_losers";        data: WorstLoser | Record<string, never> }
  | { id: "cash_dry";              data: { cash_pct: number } }
  | { id: "healthy_focus";         data: { roe: number; pe: number } };

interface PrevAction {
  id: string | null;   // lấy từ recommended_actions kỳ trước; null nếu row cũ thiếu id
  done: boolean;
  detail: string;      // = text của action cũ (chính là `title` do LLM sinh)
}

interface ProgressBlock { prev_actions: PrevAction[] }  // [] khi mode = "first"
~~~

### 5. `narrative` — Narrative JSON (output thô của LLM)

~~~ts
interface NarrativeLayers {
  overview: string;
  performance: string;
  allocation: string;
  stress: string;      // CHÚ Ý: narrative có "stress", analysis có "concentration"
  risk: string;
  attribution: string;
  quality: string;
  behavior: string;
}

interface NarrativeAction { title: string; detail: string }

interface NarrativeJson {
  title: string;
  verdict: string;
  lede: string;
  progress_text?: string;               // "" khi mode = "first"
  layers: NarrativeLayers;
  insight?: { label: string; text: string };
  low_data_note?: string;               // "" khi risk.excluded rỗng
  actions: NarrativeAction[];           // 0..3
  watch: string;
  closing: string;
}
~~~

> **Quan trọng:** `narrative` được lưu và trả **nguyên xi** những gì LLM sinh ra
> (`_parse_json(text)`), KHÔNG qua Pydantic model nào. Validator chỉ **sinh danh sách mã
> lỗi** rồi bỏ vào `meta.errors`; nó không sửa, không lọc, không reject. Khi
> `meta.valid === false`, `narrative` có thể thiếu bất kỳ field nào (kể cả `layers`), hoặc
> vẫn là bản parse được của một **attempt trước đó** (xem bẫy "narrative lệch pha errors").
> Vì vậy phía client mọi field phải được đọc phòng thủ.

### 6. Bảng DB `portfolio_reports` (nơi lưu day-cache + lịch sử)

| Cột | Kiểu Postgres | Null | Default | Ghi chú |
|---|---|---|---|---|
| `id` | UUID | không | (UUIDMixin) | PK |
| `account_id` | UUID | không | — | FK `virtual_trading_accounts.id` **ON DELETE CASCADE**, có index |
| `session_date` | DATE | không | — | ngày ICT của báo cáo, có index |
| `period_number` | INTEGER | không | `1` (default phía app) | "kỳ N" |
| `mode` | VARCHAR(20) | không | — | `first` \| `full_changed` \| `light_unchanged` |
| `analysis_json` | JSON | không | — | toàn bộ Analysis JSON |
| `narrative_json` | JSON | **có** | — | Narrative JSON; null nếu LLM không parse được lần nào |
| `scores` | JSON | có | — | denormalize `analysis.scores` để tra `prev_overall` nhanh |
| `recommended_actions` | JSON | có | — | `[{id, text, status}]` — nguồn cho `progress.prev_actions` kỳ sau |
| `watch_conditions` | JSON | có | — | **LUÔN `[]`** trong v1 (chưa dùng) |
| `holdings_snapshot` | JSON | có | — | `{ticker: weight}` — nguồn cho `holdings_changed()` |
| `model_used` | VARCHAR(50) | có | — | model LLM |
| `generation_time_ms` | INTEGER | có | — | |
| `valid` | BOOLEAN | không | server_default `true` | |
| `created_at` / `updated_at` | TIMESTAMPTZ | không | (TimestampMixin) | |

Ràng buộc: `UNIQUE (account_id, session_date)` tên `uq_portfolio_reports_account_date`;
index tổ hợp `ix_portfolio_reports_account_date (account_id, session_date)`.

Truy vấn repository cần có trong bản TS (`app/repositories/portfolio_manager.py`):

| Hàm | SQL tương đương |
|---|---|
| `getForDate(accountId, date)` | `WHERE account_id=$1 AND session_date=$2` — kỳ vọng **0 hoặc 1** row (`scalar_one_or_none`, nhiều row → throw) |
| `getLatest(accountId)` | `WHERE account_id=$1 ORDER BY session_date DESC LIMIT 1` |
| `listRecent(accountId, limit=10)` | `WHERE account_id=$1 ORDER BY session_date DESC LIMIT $2` — **hiện chưa endpoint nào dùng** |
| `countForAccount(accountId)` | `SELECT count(*) WHERE account_id=$1` |
| `insert(report)` | `INSERT` rồi `flush()` (chưa commit — commit do middleware DB session làm ở cuối request) |

---

## Nghiệp vụ nền

### N.1 Kiến trúc hai tầng và "luật vàng"

~~~
POST /portfolio-manager/analyze
  ├─ guard: Bearer + Premium
  ├─ _resolve_account_id(user)            → 404-able (nhưng bị bắt, xem dưới)
  ├─ day-cache: getForDate(account, today_ICT)
  │     hit  → trả nguyên row, KHÔNG gọi LLM              [meta.cached = true]
  │     miss ↓
  ├─ TẦNG ĐỊNH LƯỢNG (không AI)
  │     load_inputs()  → holdings, cash, trades, OHLCV, ratio, VN-Index, tỷ trọng ngành
  │     gate độ tin cậy từng mã → excluded / low_confidence
  │     8 lớp           → Analysis JSON
  │     scoring         → 5 trụ + overall
  │     insights        → selected_insights (≤2)
  │     mode            → first | full_changed | light_unchanged
  ├─ TẦNG DIỄN GIẢI (AI)
  │     vòng lặp ≤3 lần: chat_completion(SYSTEM_PROMPT, Analysis JSON, temp=0.5)
  │        → strip ``` → JSON.parse → validate_narrative() → nếu có lỗi thì nối
  │          "=== SỬA LỖI ===" vào prompt và gọi lại
  ├─ PERSIST: INSERT portfolio_reports (kể cả khi valid=false)
  └─ trả { analysis, narrative, meta }
~~~

**Luật vàng (spec §0):** mọi con số hiển thị đến từ tầng định lượng. LLM **chỉ được nhắc
lại** số có trong Analysis JSON, không tự tính, không làm tròn lại. Bản TS phải giữ nguyên
luật này ở cả prompt và validator.

### N.2 Day-cache: mốc ngày, chống gọi trùng

- Key cache = `(account_id, session_date)` với `session_date = datetime.now(ICT).date()`,
  trong đó `ICT = UTC+7` (hằng số `timezone(timedelta(hours=7))` trong `generator.py`).
- **Không dùng Redis.** Cache chính là row trong bảng `portfolio_reports`.
- Cache hit → trả `analysis_json` / `narrative_json` đã lưu, `meta.cached = true`,
  `generation_time_ms = 0`, **không** gọi provider ngoài, **không** gọi LLM.
- **Chưa fold cuối tuần / nghỉ lễ.** Spec §7 yêu cầu bấm thứ Bảy/CN phải trả bài của phiên
  thứ Sáu; v1 **cố tình chưa làm** (comment trong `generator.py`: key theo *ICT calendar
  date*). Nghĩa là **sáng thứ Bảy sẽ sinh một báo cáo mới** với giá đóng cửa y hệt thứ Sáu
  → tốn một lần gọi LLM và tăng `period_number` một cách vô nghĩa. Bản TS nếu muốn sửa thì
  phải sửa **có ý thức** (dùng market calendar) và ghi rõ, vì nó thay đổi `period_number`.
- **Chống gọi trùng: CHỈ có day-cache, KHÔNG có lock/idempotency-key.** Hai request
  `POST /analyze` đồng thời của cùng user (double-click) đều miss cache → đều chạy hết
  pipeline → đều `INSERT` → **request thứ hai vi phạm `uq_portfolio_reports_account_date`
  → 500**. Bản TS nên xử lý: bọc INSERT trong try/catch unique-violation rồi đọc lại row
  (upsert `ON CONFLICT DO NOTHING` + re-select), hoặc lấy advisory lock theo
  `(account_id, session_date)`. Đây là khác biệt hành vi **được phép và nên làm**, nhưng
  phải ghi vào changelog.

### N.3 "Kỳ" (`period_number`) và ba mode

- `period_number = countForAccount(account_id) + 1`. Tức là **đếm số row đã có**, không
  liên quan tới ngày. Xoá một row cũ → kỳ sau bị đánh số trùng.
- `period = "kỳ " + period_number` (chuỗi tiếng Việt, LLM đọc trực tiếp).
- Mode:

~~~
prev = getLatest(account_id)
if prev == null            → mode = "first"
else if holdingsChanged(prev.holdings_snapshot, currentWeights) → "full_changed"
else                                                            → "light_unchanged"
~~~

`holdingsChanged(prevSnapshot, currentWeights)`:

~~~ts
function holdingsChanged(prev: Record<string, number> | null, cur: Record<string, number>): boolean {
  if (!prev) return true;                                   // snapshot rỗng/null → coi như đổi
  const keysPrev = Object.keys(prev), keysCur = Object.keys(cur);
  if (keysPrev.length !== keysCur.length
      || keysCur.some(k => !(k in prev))) return true;       // tập mã khác → đổi
  for (const [t, w] of Object.entries(cur)) {
    if (Math.abs(w - (prev[t] ?? 0)) > 0.03) return true;    // CHANGED_WEIGHT_THRESHOLD
  }
  return false;                                             // giá nhích nhẹ → KHÔNG tính là đổi
}
~~~

> `prev_snapshot` là `{}` (falsy) khi row cũ có `holdings_snapshot` rỗng → `holdingsChanged`
> trả `true`. Giữ đúng: `if not prev_snapshot: return True` — kiểm tra **falsy**, không phải
> `is None`.

### N.4 `progress.prev_actions` — đối chiếu việc kỳ trước

Kỳ 2 trở đi, engine so `recommended_actions` của row trước với tỷ trọng hiện tại:

~~~ts
// _diff_prev_actions
function diffPrevActions(prevActions: {id?: string; text?: string}[],
                         currentWeights: Record<string, number>,
                         prevSnapshot: Record<string, number>): PrevAction[] {
  const prevTickers = Object.keys(prevSnapshot);
  return prevActions.map(act => {
    const text = (act.text ?? "").toUpperCase();
    let done = false;
    for (const t of prevTickers) {
      if (text.includes(t)) {                            // dò mã trong CHỮ của action
        const newW = currentWeights[t] ?? 0;
        if (!(t in currentWeights) || (prevSnapshot[t] - newW > 0.03)) done = true;
      }
    }
    return { id: act.id ?? null, done, detail: act.text ?? "" };
  });
}
~~~

**Bẫy nghiệp vụ ẩn:** action do LLM sinh **không mang ticker có cấu trúc**. Engine phải
`indexOf` ticker trong chuỗi tiếng Việt hoa hoá. Hệ quả thật:
- Ticker 3 ký tự trùng từ thường gặp sẽ **false-positive** (ví dụ action nói "CẮT LỖ" mà
  danh mục có mã `CTG`? không trùng; nhưng mã `TIN`, `BAN`, `CAN`, `HAI`, `VIC` rất dễ trùng
  cụm chữ hoa trong câu tiếng Việt sau `.toUpperCase()`).
- Action không nhắc mã nào (ví dụ "Nâng tiền mặt lên 15,0%") thì **vĩnh viễn `done: false`**.

Giữ nguyên hành vi này (kể cả nhược điểm) trừ khi có quyết định thay đổi rõ ràng.

### N.5 Bảng hằng số cấu hình (`config.py`) — bản TS phải mang nguyên

| Hằng số | Giá trị | Dùng ở đâu | Ý nghĩa |
|---|---|---|---|
| `RISK_LOOKBACK_DAYS` | `120` | `inputs._load_ohlcv` | Số phiên mục tiêu cho chỉ số rủi ro; `count_back` gửi provider = `120 + 20 = 140` |
| `DATA_CONF_MIN_HISTORY` | `120` | `data_confidence` | Tối thiểu số bar để một mã được chấm rủi ro |
| `DATA_CONF_MIN_AVG_VALUE_VND` | `2_000_000_000` | `data_confidence` | Giá trị giao dịch bình quân 20 phiên gần nhất tối thiểu (2 tỷ VND) |
| `SECTOR_BENCH_THRESHOLD` | `0.25` | `layers._sector_benchmark` | Ngành phải chiếm > 25% NAV mới so chuẩn ngành |
| `CHANGED_WEIGHT_THRESHOLD` | `0.03` | `analysis.holdings_changed`, `_diff_prev_actions` | Lệch > 3 điểm % mới coi là "danh mục đã đổi" / "đã làm theo gợi ý" |
| `HIDDEN_CORR_MIN` | `0.75` | `insights._hidden_corr` | Ngưỡng tương quan để bắn insight tương quan ẩn |
| `PROFIT_CONCENTRATION_MIN` | `0.60` | `insights._profit_concentration` | Ngưỡng "nguồn lãi tập trung" |
| `SECTOR_TILT_RATIO_MIN` | `3.0` | `insights._sector_tilt` | Gấp > 3 lần tỷ trọng ngành VN-Index |
| `CASH_DRY_MAX` | `0.05` | `insights._cash_dry` | Tiền mặt < 5% NAV → "cạn tiền" |
| `LLM_TEMPERATURE` | `0.5` | `generator` | Temperature gửi AI proxy |
| `ANNUALIZE_FACTOR` | `252` | `returns.annualized_vol` | Số phiên/năm để annualize |
| `MIN_POSITIONS_FOR_ANALYSIS` | `2` | `analysis.build_analysis` | **Không** thuộc spec §12; dưới ngưỡng này trả `insufficient_data` |

Hằng số cục bộ khác (không nằm trong `config.py`, nhưng phải giữ):

| Hằng số | Giá trị | File | Ý nghĩa |
|---|---|---|---|
| `_OHLCV_WINDOW_DAYS` | `400` | `inputs.py` | Cửa sổ lịch (ngày dương lịch) lùi về để lấy OHLCV → khoảng ~260 bar |
| `_SECTOR_WINDOW` | `126` | `layers.py` | ~6 tháng giao dịch, để khớp với `percent_price_change_6m` của ngành |
| `LOW_DATA_REASON` | `"low_liquidity_short_history"` | `data_confidence.py` | Chuỗi `reason` duy nhất trong `risk.excluded` |
| `max_retries` | `3` | `generator.generate_report` | Số lần gọi LLM tối đa |
| `ICT` | `UTC+7` | `generator.py` | Múi giờ tính `session_date` |
| `_FENCE` | `/^```(?:json)?\s*\|\s*```$/gm` | `generator.py` | Regex bóc code fence khỏi output LLM |
| `AI_PROXY_TIMEOUT_SECONDS` | `120.0` (env, default) | `core/config.py` | Timeout mỗi lần gọi LLM |
| `AI_PROXY_MODEL` | `"deepseek-v4-flash"` (env, default) | `core/config.py` | Model mặc định |

### N.6 Đầu vào (`inputs.py`) — nguồn và thứ tự gọi

`load_inputs(db, userId)` dựng `PortfolioInputs`:

~~~ts
interface Holding {
  ticker: string; quantity: number; avg_cost_vnd: number; current_price_vnd: number;
  sector: string; market_value: number; unrealized_pnl: number; cost_basis: number;
  closes: number[];   // đóng cửa theo ngày, ĐƠN VỊ VND (VCI trả VND, không phải nghìn VND)
  volumes: number[];  // khối lượng cổ phiếu
  pe: number | null; pb: number | null; roe: number | null; dividend: number | null;
}

interface PortfolioInputs {
  nav: number; cash: number;
  holdings: Holding[];
  benchmark_closes: number[];              // VNINDEX
  sector_weights: Record<string, number>;  // tỷ trọng vốn hoá ngành VN-Index, theo tên VN
  inception_date: string | null;           // ISO date, = ngày giao dịch sớm nhất
  trades: VirtualTrade[];
  as_of: string;                           // ISO date, = datetime.now(UTC).date()
  sector_returns_6m: Record<string, number>;
}
~~~

Thứ tự và nguồn (giữ nguyên, vì nó quyết định số HTTP call và thời gian chạy):

1. `VirtualTradingService.get_portfolio(userId)` → **ném `NotFoundError("tài khoản giao dịch ảo")`**
   nếu chưa có tài khoản ảo. `cash = cash_available_vnd + cash_reserved_vnd + cash_pending_vnd`
   (cộng cả 3 loại tiền, không chỉ available). `nav = portfolio.nav_vnd`.
2. Lọc position: chỉ giữ `quantity_total > 0`.
3. `_load_sectors_for(db, tickers)` — một câu `SELECT * FROM symbols WHERE symbol IN (...)`;
   sector = `icb_lv2 || icb_lv1 || "Khác"`; ticker không có row → `"Khác"`.
4. `_load_sector_info()` — **2 call ngoài**: `vietcap_sector.fetch_sector_information(icb_level=2)`
   và `vietcap_market_overview.fetch_icb_codes()`. Join theo `icb_code` (ép qua
   `int(float(str(v).strip()))` cho cả hai bên, vì một bên trả `"8300"`, bên kia có thể
   `"8300.0"`). Tính `sector_weights` = `market_cap_ngành / Σ market_cap` và
   `sector_returns_6m` = `percent_price_change_6m` đã chuẩn hoá qua `_pct_to_fraction`
   (`|n| > 1.5 → n/100`, ngược lại giữ nguyên — VCI có lúc trả `14.0`, lúc trả `0.14`).
   Join không khớp mã nào → log `WARNING "portfolio_manager: sector-weight join matched 0 sectors (ICB code mismatch?)"`
   và trả `({}, {})`.
5. **Với TỪNG holding (tuần tự, không song song)**: `_load_ohlcv(symbol, count_back=140)`
   rồi `_load_ratios(symbol)`. → **2 call ngoài mỗi mã**.
6. `_load_ohlcv("VNINDEX", count_back=140)` → `benchmark_closes`. → 1 call ngoài.
7. `_load_all_trades(svc, userId)` — phân trang `list_trades(page, page_size=500)` cho tới
   khi đủ `total` (hoặc trang rỗng). `inception_date = min(trade.traded_at.date())`, `null`
   nếu không có trade nào.
8. `as_of = datetime.now(UTC).date()`.

**Tổng call ngoài mỗi lần sinh mới: `2·N + 3`** (N = số mã). Danh mục 4 mã → 11 call HTTP
tuần tự trước khi gọi LLM.

**Mọi call ngoài đều bọc `_safe()`**: bắt `Exception` → trả default (`[]` / `{}`) →
**không bao giờ làm fail request**. `_safe` cũng tự bóc tuple: provider trả
`(data, url)` → lấy `res[0]`.

Ánh xạ chỉ số cơ bản (`_load_ratios` gọi `fetch_financial_report(symbol, report_type="ratio", period="Y")`
rồi lấy **row đầu** = kỳ mới nhất). `_pick` thử lần lượt các tên key:

| Field | Danh sách key thử (đúng thứ tự) | Key thật của VCI (đã verify 2026-06-29) |
|---|---|---|
| `pe` | `pe`, `price_to_earning`, `pe_ratio` | `pe` |
| `pb` | `pb`, `price_to_book`, `pb_ratio` | `pb` |
| `roe` | `roe`, `roea`, `roe_ratio` | `roe` |
| `dividend` | `dividend`, `cash_dividend`, `dividend_yield` | **`dividend_yield`** (hai key đầu không tồn tại) |

### N.7 Gate độ tin cậy dữ liệu (`data_confidence.py`)

**Thang: nhị phân (boolean), KHÔNG phải điểm 0–100.** Không có mức "trung bình".

~~~ts
const LOW_DATA_REASON = "low_liquidity_short_history";

function evaluateConfidence(bars: {close: number; volume: number}[]): [boolean, string | null] {
  if (bars.length < 120) return [false, LOW_DATA_REASON];        // DATA_CONF_MIN_HISTORY
  const last20 = bars.slice(-20);
  if (last20.length === 0) return [false, LOW_DATA_REASON];      // nhánh chết (đã chặn ở trên)
  const avgValue = last20.reduce((s, b) => s + Number(b.close) * Number(b.volume), 0) / last20.length;
  if (avgValue < 2_000_000_000) return [false, LOW_DATA_REASON]; // DATA_CONF_MIN_AVG_VALUE_VND
  return [true, null];
}
~~~

Thứ tự kiểm tra **bắt buộc giữ**: đủ lịch sử **trước**, thanh khoản **sau**. Cả hai thất bại
đều trả cùng một `reason` — client không phân biệt được nguyên nhân, và đó là hành vi hiện tại.

> Spec §4 còn có điều kiện thứ ba `complete = no_gaps(bars)` — **CHƯA IMPLEMENT** trong
> `data_confidence.py`. Đừng thêm vào bản TS nếu không muốn lệch kết quả.

**Khi `false` (mã "low confidence"):**

| Vẫn tính | Bị loại |
|---|---|
| `weight`, `market_value`, `pnl`, `cost_basis` (lớp overview, concentration, allocation, attribution) | `beta`, `volatility`, `tracking_error`, mọi cặp `correlation`, chuỗi return danh mục (lớp risk) |
| `pe`/`pb`/`roe`/`dividend` (lớp quality vẫn cân theo market value) | — |

Ghi nhận ở hai chỗ: `overview.positions[].low_confidence = true` **và**
`risk.excluded[] = {ticker, reason}`. **Lớp risk không bị "bỏ"** — nó vẫn trả object, chỉ là
tính trên tập mã còn lại.

**Client phải hiển thị thế nào** (theo system prompt + frontend hiện tại):
- Hàng danh mục có `low_confidence: true` → đánh dấu trực quan (badge/ghi chú), **không**
  hiển thị số rủi ro riêng cho mã đó.
- Nếu `risk.excluded` không rỗng → hiển thị đoạn `narrative.low_data_note` (LLM bắt buộc
  phải viết, validator ép). Nội dung theo prompt: nói rõ **chưa** chấm điểm rủi ro cho mã
  đó vì thanh khoản mỏng / lịch sử ngắn, sẽ đánh giá khi đủ dữ liệu, và **chính việc khó
  đo lường cũng là một loại rủi ro**.
- Nếu `risk.excluded` rỗng → `low_data_note` phải là `""`; client **không** render khối này.

### N.8 Toán học thuần (`returns.py`) — mọi hàm degenerate trả `0.0`, không bao giờ throw

~~~ts
// r_t = close_t / close_{t-1} - 1 ; nếu close_{t-1} == 0 thì r_t = 0
function dailyReturns(closes: number[]): number[];        // len < 2 → []

function stdev(xs: number[]): number;                     // len < 2 → 0; ddof = 1 (mẫu)

function annualizedVol(rets: number[], factor = 252): number;  // stdev(rets) * sqrt(252)

// n = min(len(a), len(m)); lấy n phần tử CUỐI của cả hai
// var_m == 0 → 0 ; ngược lại cov(a,m,ddof=1) / var(m,ddof=1)
function beta(assetReturns: number[], marketReturns: number[]): number;  // n < 2 → 0

// Pearson trên n phần tử cuối; std(x)==0 hoặc std(y)==0 → 0
function correlation(a: number[], b: number[]): number;   // n < 2 → 0

// dd_t = arr_t / runningMax_t - 1 (runningMax == 0 → 0) ; trả min(dd) → số ÂM
function maxDrawdown(closes: number[]): number;           // len < 2 → 0
~~~

**Chi tiết dễ sai khi port sang TS:** numpy dùng `ddof=1` (phương sai **mẫu**, chia `n-1`)
cho `stdev`, `var`, `cov`. `Math` của JS không có sẵn — phải tự viết và **nhớ chia `n-1`**.
Dùng `ddof=0` sẽ làm `volatility` và `beta` lệch nhẹ (beta lệch ít vì tỷ số cov/var triệt
tiêu `n-1`, nhưng `volatility`/`tracking_error` lệch thật).

Ngoài ra `correlation` dùng `np.std` mặc định (`ddof=0`) chỉ để **kiểm tra bằng 0**, còn
giá trị trả về là `np.corrcoef` (bất biến với ddof) — nên không ảnh hưởng.

### N.9 TÁM LỚP PHÂN TÍCH — đặc tả đầy đủ

Mọi số ra khỏi lớp đều đi qua `_r3(x) = x === null ? null : round(x, 3)`
(**làm tròn 3 chữ số thập phân**, làm tròn half-away-from-zero kiểu Python `round()`… thực
chất Python dùng banker's rounding; xem bẫy ở §Ghi chú tổng hợp).

`_weight(h, nav) = nav ? h.market_value / nav : 0.0`.

---

#### Lớp 01 — `overview` (Tổng quan) · `layer_overview(inp, lowConf, holdingMonths)`

**Cần:** `inp.nav`, `inp.cash`, `inp.holdings[]` (market_value, unrealized_pnl, cost_basis,
sector), map `lowConf` từ lớp risk, `holdingMonths` từ orchestrator.

**Công thức:**
~~~
weight_i     = market_value_i / nav                      (0 nếu nav = 0)
cash_pct     = cash / nav                                (0 nếu nav = 0)
total_pnl    = Σ unrealized_pnl_i
total_cost   = Σ cost_basis_i
total_return = total_pnl / total_cost                    (0 nếu total_cost = 0)
n_positions  = holdings.length
~~~

`holding_months` (tính ở `analysis._holding_months`):
~~~
inception_date == null → 0
ngược lại → max(1, round((as_of - inception_date) tính theo NGÀY / 30))
~~~

**Output:** `OverviewLayer` (xem §Kiểu dữ liệu). `positions` giữ **đúng thứ tự** như
`inp.holdings`, tức thứ tự trả về từ `VirtualTradingService.get_portfolio` — **không sort**.

> `total_return` chia theo **cost basis**, KHÔNG theo NAV. Với danh mục nhiều tiền mặt, số
> này cao hơn "lãi trên NAV" đáng kể. Đừng đổi mẫu số.

---

#### Lớp 02 — `performance` (Hiệu suất so với chuẩn) · `layer_performance(inp, {navSeries})`

**Cần:** `inp.holdings[].unrealized_pnl` + `.cost_basis`, `inp.benchmark_closes`,
`navSeries` (chuỗi proxy do orchestrator dựng).

**Công thức:**
~~~
portfolio_return = Σ unrealized_pnl / Σ cost_basis                   (0 nếu Σcost = 0)
benchmark_return = bench[last] / bench[0] - 1
                   (0 nếu bench.length < 2 HOẶC bench[0] == 0)
excess_return    = portfolio_return - benchmark_return
dd_source        = navSeries?.length ? navSeries : benchmark_closes
max_drawdown     = maxDrawdown(dd_source)                            (0 nếu dd_source rỗng)
method           = "simple_inception"                                (hằng số)
~~~

**Chuỗi NAV proxy (`analysis._nav_proxy_series`)** — không phải NAV thật, mà là **chỉ số NAV
tái cơ sở**:
~~~ts
function navProxySeries(inp: PortfolioInputs): number[] {
  const confident = inp.holdings.filter(h => h.closes.length >= 2);   // CHÚ Ý: chỉ ≥2 bar,
  if (!confident.length) return [];                                   // KHÔNG dùng gate độ tin cậy
  const n = Math.min(...confident.map(h => h.closes.length));
  const totalMv = confident.reduce((s, h) => s + h.market_value, 0) || 1;
  const w = new Map(confident.map(h => [h.ticker, h.market_value / totalMv]));
  const series: number[] = [];
  for (let i = 0; i < n; i++) {
    let val = 0;
    for (const h of confident) {
      const win = h.closes.slice(-n);
      const base = win[0] || 1.0;        // TÁI CƠ SỞ từng mã về chỉ số (close/first)
      val += w.get(h.ticker)! * (win[i] / base);
    }
    series.push(val);
  }
  return series;
}
~~~
Lý do tái cơ sở (comment trong source): mỗi mã có **thang giá riêng**; nếu cộng thẳng giá
thì mã giá cao nhất sẽ áp đảo và `max_drawdown` trở nên vô nghĩa.

**Fallback quan trọng:** nếu **không mã nào** có ≥2 bar (provider OHLCV chết) →
`navSeries = []` → `max_drawdown` được tính trên **VN-Index**, nhưng response **vẫn ghi
`method: "simple_inception"`** và không có cờ nào báo hiệu. Client không phân biệt được.
Ghi lại rõ khi viết lại.

**Bẫy đơn vị/thời gian:** `portfolio_return` là **lãi chưa thực hiện từ khi mở vị thế**
(since-inception), còn `benchmark_return` là biến động VN-Index trên **cửa sổ ~140 phiên gần
nhất** (do `count_back = RISK_LOOKBACK_DAYS + 20`), KHÔNG cùng khoảng thời gian. `excess_return`
vì thế là **so lệch cửa sổ** — sai lệch có chủ đích của v1 (spec ghi TWR bị deferred).
**Đừng "sửa" âm thầm**: `excess_return` là input của trụ điểm `performance`, đổi mẫu số sẽ
đổi điểm sức khoẻ của mọi người dùng.

---

#### Lớp 03 — `allocation` (Phân bổ & độ lệch) · `layer_allocation(inp) → Array`

**Cần:** `inp.holdings[].sector` + `.market_value`, `inp.nav`, `inp.sector_weights`.

**Công thức:**
~~~
port_sector_weight_s = Σ_{i ∈ s} weight_i
benchmark_s          = sector_weights[normalize(s)]        (null nếu không khớp)
active_s             = port_sector_weight_s - benchmark_s  (null nếu benchmark null)
~~~

Khớp tên ngành qua `normalizeSectorName` (= `inputs._norm_sector`):
~~~ts
function normalizeSectorName(name: string): string {
  if (!name) return "";
  return name.normalize("NFKD")
             .replace(/\p{Mn}/gu, "")   // bỏ dấu tổ hợp (Unicode combining marks)
             .toLowerCase()             // Python casefold(); toLowerCase là xấp xỉ đủ dùng cho tiếng Việt
             .trim();
}
~~~
Lý do: `Symbol.icb_lv2` trong DB và tên ngành từ VCI có thể lệch dấu/hoa-thường
(`"Ngân hàng"` vs `"NGÂN HÀNG"` vs `"Ngan hang"`).

**Sắp xếp mặc định:** `weight` **giảm dần** — và sort trên **giá trị ĐÃ làm tròn 3 lẻ**
(`rows.sort(key=lambda r: r["weight"], reverse=True)` chạy *sau* khi `_r3` đã áp). Hai ngành
cùng `0.185` sau làm tròn sẽ giữ thứ tự chèn (Python sort là stable — TS `Array.sort` cũng
stable từ ES2019).

**Fallback:** `sector_weights` rỗng (provider VCI lỗi, hoặc join ICB không khớp) → **mọi
row có `benchmark: null, active: null`**. Tuyệt đối **không bịa benchmark**
(design §4 gap 3: "degrade rather than fabricate"). Hệ quả kéo theo: insight `sector_tilt`
không bao giờ bắn.

---

#### Lớp 04 — `concentration` (Tập trung) · `layer_concentration(inp)`

**Cần:** `inp.holdings[].market_value` + `.sector`, `inp.nav`.

**Công thức:**
~~~
weights        = [weight_i…]           (thô, chưa làm tròn)
weightsSorted  = weights giảm dần
hhi            = Σ weight_i²           (CHỈ phần cổ phiếu, KHÔNG gồm tiền mặt)
top1           = weightsSorted[0]                    (0.0 nếu không có mã nào)
top3           = Σ weightsSorted[0..2]               (tự động ít hơn 3 nếu danh mục < 3 mã)
effective_n    = hhi > 0 ? 1 / hhi : 0.0
largest_sector = max(Σ_{i ∈ s} weight_i)             (0.0 nếu không có mã nào)
~~~

**Output:** `ConcentrationLayer`.

> Vì `hhi` chỉ tính cổ phiếu nhưng `weight_i` chia cho **NAV có gồm tiền mặt**, `effective_n`
> bị **kéo lên** so với công thức "HHI trên phần cổ phiếu" thuần. Ví dụ 4 mã bằng nhau + 8%
> tiền mặt cho `effective_n ≈ 4.7` chứ không phải `4.0`. Đây là hành vi hiện tại và là input
> của trụ `diversification` — giữ nguyên.

**Đặt tên khác spec:** narrative KHÔNG có block `concentration`; nó có `layers.stress`.
Lớp 04 chỉ dùng cho số/chart và cho trụ điểm `diversification`.

---

#### Lớp 05 — `risk` (Rủi ro & tương quan) · `layer_risk(inp) → [RiskLayer, lowConf]`

Đây là lớp **duy nhất trả 2 giá trị**: `(riskDict, lowConfMap)`. Orchestrator **phải gọi lớp
này TRƯỚC lớp overview** vì overview cần `lowConf`.

**Cần:** `inp.holdings[].closes` + `.volumes` + `.market_value`, `inp.benchmark_closes`.

**Thuật toán (giữ đúng thứ tự):**
~~~
1. Với từng holding: evaluateConfidence(zip(closes, volumes))
     ok  → confident.push(h);  lowConf[ticker] = false
     !ok → excluded.push({ticker, reason}); lowConf[ticker] = true
   (zip theo Python strict=False: dừng ở chuỗi ngắn hơn giữa closes/volumes)
2. benchReturns = dailyReturns(inp.benchmark_closes)
   perReturns   = { ticker: dailyReturns(h.closes) } CHỈ cho các mã confident
3. n = min(len(benchReturns), …len(perReturns từng mã))
     (nếu perReturns rỗng thì series_lengths = [len(benchReturns)] → n = len(benchReturns))
4. NẾU n < 2 HOẶC confident.length < 1 → TRẢ NGAY dạng suy giảm:
     { beta: 0.0, volatility: 0.0, tracking_error: 0.0, correlation: [], excluded }
5. Cắt tất cả về n phần tử CUỐI (benchReturns và từng perReturns)
6. totalMv = Σ market_value của confident (|| 1)
   weights[t] = market_value_t / totalMv       ← CÂN LẠI trong tập confident, KHÔNG theo NAV
   portReturns[i] = Σ_t weights[t] * perReturns[t][i]
7. beta           = beta(portReturns, benchReturns)
   volatility     = annualizedVol(portReturns)
   trackingError  = annualizedVol(portReturns[i] - benchReturns[i])
   correlation    = với mọi cặp (a,b) của Object.keys(perReturns) ĐÃ SORT ALPHABET,
                    theo thứ tự combinations() → { a, b, value: _r3(correlation(ra, rb)) }
~~~

**Quyết định thiết kế đã ghi trong source (đừng đổi):** khi chỉ có **một** mã đủ tin cậy,
engine **VẪN tính** beta/volatility đơn-tài-sản thật. Không zero-hoá. Lý do (comment):
`beta = 0` sẽ chảy vào trụ `risk` và gán nhãn danh mục là **rủi ro tối đa** (điểm 1) một
cách sai lệch. Có test riêng khoá hành vi này
(`test_risk_single_confident_holding_computes_beta`).

**Fallback rõ ràng:**

| Tình huống | `risk` trả gì |
|---|---|
| Không mã nào đủ tin cậy (`confident = []`) | `{beta: 0.0, volatility: 0.0, tracking_error: 0.0, correlation: [], excluded: [tất cả mã]}` |
| VN-Index không lấy được (`benchmark_closes = []`) → `benchReturns = []` → `n = 0 < 2` | y như trên (nhưng `excluded` chỉ chứa mã thật thiếu dữ liệu) |
| Đúng 1 mã đủ tin cậy | beta/vol/TE thật, `correlation: []` (không có cặp nào) |
| ≥2 mã đủ tin cậy | đủ, `correlation` có `C(k,2)` phần tử |

Lưu ý: nhánh suy giảm trả **`0.0` thô, không qua `_r3`** — về JSON là `0.0`/`0`, không phân
biệt được với "beta thật bằng 0". Client nên dùng `risk.excluded.length === holdings.length`
để nhận biết trạng thái suy giảm.

**VaR bị loại bỏ có chủ đích** (spec §5). Không tính, không hiển thị. Thay bằng stress-test
tính **phía client**: `expected_loss_pct = d × beta`, `expected_loss_vnd = nav × pct / 100`
với `d ∈ {5, 10, 15}%`. Backend **không** có endpoint stress-test.

---

#### Lớp 06 — `attribution` (Nguồn gốc lợi nhuận) · `layer_attribution(inp) → Array`

**Cần:** `inp.holdings[].unrealized_pnl`.

**Công thức:**
~~~
total = Σ unrealized_pnl_i
row_i = { ticker, pnl: unrealized_pnl_i, pct: total ? unrealized_pnl_i / total : null }
sort  theo |pnl| GIẢM DẦN
~~~

**Bẫy toán học (phải giữ):** `total` là **tổng đại số** lãi và lỗ. Khi danh mục có cả mã lãi
và mã lỗ, `total` nhỏ hơn tổng lãi → `pct` **có thể > 1** (mã lãi) và **âm** (mã lỗ). Ví dụ
thật trong §Response của `POST /analyze`: `FPT.pct = 1.084`. Frontend **không được** vẽ
progress-bar 0–100% mà không clamp. Và insight `profit_concentration` (ngưỡng 0.60) vì thế
bắn rất dễ.

`total === 0` → **mọi** `pct = null` (không phải 0).

`realized_pnl` **CHƯA implement** (spec §2 lớp 06 cho phép cộng thêm) — chỉ dùng
unrealized. Brinson attribution (allocation vs selection effect) cũng deferred.

---

#### Lớp 07 — `quality` (Chất lượng & so chuẩn ngành) · `layer_quality(inp)`

**Cần:** `inp.holdings[].pe/pb/roe/dividend` + `.market_value` + `.sector` + `.closes`,
`inp.nav`, `inp.sector_returns_6m`.

**Bình quân gia quyền (`_weighted`)** — chú ý mẫu số:
~~~ts
function weighted(inp: PortfolioInputs, attr: "pe"|"pb"|"roe"|"dividend"): number | null {
  const pairs = inp.holdings.filter(h => h[attr] !== null && h[attr] !== undefined);
  const totalMv = pairs.reduce((s, h) => s + h.market_value, 0);
  if (totalMv <= 0) return null;
  return pairs.reduce((s, h) => s + (h.market_value / totalMv) * (h[attr] as number), 0);
}
~~~
Mẫu số là **tổng market value của các mã CÓ chỉ số đó**, không phải NAV và không phải tổng
market value toàn danh mục. Nghĩa là nếu chỉ 2/4 mã có `roe`, `roe` trả về là bình quân của
2 mã đó (chuẩn hoá lại về 100%). Trả `null` khi không mã nào có chỉ số.

**So chuẩn ngành có điều kiện (`_sector_benchmark`)** — thứ tự kiểm tra:
~~~
1. bySector[s] = Σ_{i ∈ s} (market_value_i / nav)     (0 nếu nav = 0)
2. Không có mã nào → null
3. (sector, weight) = ngành có weight LỚN NHẤT
4. weight < 0.25 (SECTOR_BENCH_THRESHOLD) → null
5. industry = sector_returns_6m[sector]
      undefined → thử lại theo tên đã normalize
      vẫn undefined → null
6. members = mã thuộc `sector` VÀ closes.length >= 2
   totalMv = Σ members.market_value ; <= 0 → null
7. your_return = Σ (market_value_i / totalMv) × (win[last] / win[0] - 1)
      với win = closes.slice(-126) nếu closes.length >= 126, ngược lại closes toàn bộ
      (win[0] || 1.0 để tránh chia 0)
8. → { sector, your_return: _r3, industry_return: _r3(industry), gap: _r3(your - industry) }
~~~

**Mâu thuẫn tài liệu cần biết:** design doc 2026-06-29 §1 ghi
`quality.sector_benchmark` **stays null in v1** (deferred), nhưng **source ĐÃ implement đầy đủ**
và có 2 test khoá hành vi (`test_quality_sector_benchmark_when_sector_dominant`,
`test_quality_sector_benchmark_none_when_no_dominant_sector`). **Tin source + test**, không
tin design doc: bản TS **phải** implement `_sector_benchmark`.

**Fallback:** `sector_returns_6m` rỗng (provider lỗi) → `sector_benchmark: null`. Danh mục
phân tán (không ngành nào > 25%) → `null`. Đó là `null` "hợp lệ", không phải lỗi.

---

#### Lớp 08 — `behavior` (Kỷ luật & hành vi) · `layer_behavior(inp)`

**Cần:** `inp.trades[]` (`symbol`, `side`, `quantity`, `price_vnd`, `traded_at`),
`inp.holdings[].unrealized_pnl` + `.cost_basis`.

**`avg_holding_days` — khớp FIFO BUY→SELL từng mã:**
~~~ts
function avgHoldingDays(trades: VirtualTrade[]): number {
  const buys = new Map<string, Date[]>();     // deque FIFO mỗi symbol
  const spans: number[] = [];
  for (const t of [...trades].sort((a, b) => +a.traded_at - +b.traded_at)) {
    const side = String(t.side);                        // enum StrEnum "buy" | "sell"
    if (side.endsWith("buy")) {
      // đẩy `quantity` bản sao của timestamp — 1 phần tử = 1 CỔ PHIẾU
      const q = buys.get(t.symbol) ?? []; for (let i = 0; i < t.quantity; i++) q.push(t.traded_at);
      buys.set(t.symbol, q);
    } else if (side.endsWith("sell")) {
      const q = buys.get(t.symbol) ?? [];
      for (let i = 0; i < t.quantity; i++) {
        const bt = q.shift(); if (!bt) break;
        spans.push(wholeDaysBetween(bt, t.traded_at));  // Python timedelta.days: TRUNCATE, không round
      }
    }
  }
  return spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : 0;
}
~~~
`side.endsWith("buy")` chứ không `=== "buy"` — vì `str(OrderSide.BUY)` có thể ra
`"OrderSide.BUY"` tuỳ context Python. Bản TS nên so sánh chuẩn hoá lowercase và **chấp nhận
cả hai dạng**.

**`losing_count`** = số holding có `unrealized_pnl < 0` (đúng `< 0`, không `<= 0`).

**`worst_loser`** = trong các mã lỗ, chọn mã có `pnl / cost_basis` **nhỏ nhất**
(`cost_basis === 0` → coi tỷ lệ là `0.0` khi so sánh). Trả
`{ticker, pnl_pct: _r3(pnl/cost_basis) hoặc null nếu cost_basis = 0, periods_held: 1}`.
`null` khi không có mã lỗ nào.

> **`periods_held` LUÔN bằng `1`.** Comment trong source ghi "overwritten by orchestrator
> from snapshot history" — nhưng `analysis.build_analysis` **KHÔNG hề ghi đè**. Đây là
> hằng số chết trong v1. Hệ quả: insight `holding_losers` luôn có `severity = 1.0`. Giữ
> nguyên (hoặc sửa **có ý thức**, vì nó đổi thứ tự chọn insight).

**`disposition_flag`** — dấu hiệu "ôm lỗ, chốt lãi non":
~~~
FIFO như trên, nhưng mỗi phần tử buy lưu (traded_at, price_vnd).
Với mỗi cổ phiếu bán khớp được:
    days = (sell.traded_at - buy.traded_at).days
    sell.price_vnd >= buy.price_vnd → winner_days.push(days)
    ngược lại                       → loser_days.push(days)
Nếu winner_days rỗng HOẶC loser_days rỗng → false
ngược lại → mean(loser_days) > mean(winner_days) * 1.5
~~~

> **Lệch spec:** spec §2 lớp 08 định nghĩa `disposition_flag` = so ngày giữ của **mã lãi ĐÃ
> BÁN** với mã **lỗ ĐANG GIỮ**. Source so **mã lãi đã bán** với **mã lỗ đã bán** (proxy —
> comment trong code nói rõ "(proxy) sold losers"). Hệ quả: người chưa bao giờ bán lỗ
> (rất phổ biến — chính là hành vi disposition!) sẽ **luôn** có `disposition_flag: false`.
> Đây là hành vi hiện tại; ghi vào changelog nếu quyết định sửa.

**`turnover`** (spec §2 lớp 08) và **`beta_i` từng mã** (spec §2 lớp 05): **CHƯA implement**.

---

### N.10 Điểm sức khoẻ 5 trụ (`scoring.py`)

Mỗi trụ **1..5 nguyên**. Bảng ngưỡng chính xác (thứ tự `if` quan trọng — dừng ở nhánh khớp
đầu tiên):

**`performance` ← `performance.excess_return`** (mặc định `0.0` nếu null/undefined)

| Điều kiện | Điểm |
|---|---|
| `> 0.05` | 5 |
| `> 0.02` | 4 |
| `>= -0.02` | 3 |
| `>= -0.08` | 2 |
| còn lại | 1 |

**`risk` ← `risk.beta`** (mặc định `0.0`)

| Điều kiện | Điểm |
|---|---|
| `0.8 <= beta <= 1.1` | 5 |
| `1.1 < beta <= 1.15` **hoặc** `0.7 <= beta < 0.8` | 4 |
| `1.15 < beta <= 1.3` | 3 |
| `1.3 < beta <= 1.5` | 2 |
| còn lại (`< 0.7` hoặc `> 1.5`) | 1 |

> `beta = 0.0` (nhánh suy giảm của lớp risk) → điểm **1**, tức "rủi ro tệ nhất". Đó là lý do
> lớp risk cố ý không zero-hoá khi chỉ có 1 mã tin cậy.

**`diversification` ← `concentration.effective_n` + `maxCorr`** (mặc định `0.0`)

| Điều kiện base | base |
|---|---|
| `effective_n > 8` **và** `maxCorr < 0.5` | 5 |
| `effective_n > 6` | 4 |
| `effective_n >= 4` | 3 |
| `effective_n >= 3` | 2 |
| còn lại | 1 |

Sau đó **CAP (không sụp)**: `if (maxCorr > 0.8) base = Math.min(base, 3)`.
`maxCorr = max(risk.correlation[].value)`, **default `0.0` khi mảng rỗng**
(`max(..., default=0.0)`).

**`quality` ← `quality.roe` + `quality.pe`** (mặc định `roe = 0.0`, **`pe = 99.0`**)

| Điều kiện | Điểm |
|---|---|
| `roe > 0.18` **và** `pe < 12` | 5 |
| `roe >= 0.15` | 4 |
| `roe >= 0.12` | 3 |
| `roe >= 0.08` | 2 |
| còn lại | 1 |

> Default `pe = 99.0` (không phải 0, không phải null) — chỉ dùng khi `quality.pe` là
> null/0/falsy. Nhớ: `quality.get("pe") or 99.0` nên **`pe === 0` cũng thành `99.0`**.
> Tương tự `roe === 0` → `0.0`. Bản TS phải dùng phép "or falsy" y hệt, không phải `??`.

**`discipline` ← `behavior.disposition_flag` + `behavior.losing_count`**

| Điều kiện | Điểm |
|---|---|
| `!flag` và `losing_count === 0` | 5 |
| `!flag` và `losing_count <= 1` | 4 |
| `!flag` (mọi `losing_count` khác) | 3 |
| `flag` và `losing_count <= 2` | 3 |
| còn lại (`flag` và `losing_count > 2`) | 2 |

**Điểm không có 1 cho `discipline`** — thấp nhất là 2. Đúng như source.

**Tổng:** `overall = round(mean(5 trụ), 1)`; `0.0` nếu object trụ rỗng.
Ví dụ trong test: `{4,3,3,4,2} → 3.2`; `{4,4,3,4,2} → 3.4`.

**Nhãn/ngưỡng chữ:** **KHÔNG CÓ** trong backend. `scoring.py` chỉ trả số 1..5 và `overall`.
Không có mapping "tốt / trung bình / yếu", không có `label`. Nhãn (nếu có) do frontend hoặc
do LLM viết bằng chữ. Bản TS **không được** tự thêm.

### N.11 Thư viện insight (`insights.py`) — 6 khuôn, chọn ≤2

Engine chạy **cả 6** khuôn theo thứ tự khai báo, thu các khuôn "bắn", sort **severity giảm
dần**, rồi chọn:

~~~ts
// _POSITIVE = new Set(["healthy_focus"])
const negatives = hits.filter(h => !POSITIVE.has(h.id));
const positive  = hits.find(h => POSITIVE.has(h.id)) ?? null;   // hits ĐÃ sort theo severity
const chosen = positive
  ? [...(negatives.length ? [negatives[0]] : []), positive]      // ≤2: 1 negative mạnh nhất + positive
  : negatives.slice(0, 2);                                       // 2 negative mạnh nhất
return chosen.map(h => ({ id: h.id, data: h.data }));            // severity KHÔNG lộ ra response
~~~

Bảng 6 khuôn (nguyên văn điều kiện từ source):

| `id` | Tên VN | Điều kiện bắn | `severity` | `data` |
|---|---|---|---|---|
| `hidden_corr` | Tương quan ẩn | tồn tại cặp trong `risk.correlation` với `value > 0.75` **và** `(weight_a + weight_b) > 0.2`; lấy cặp severity cao nhất | `value × combined` | `{pair: [a, b], corr: value, combined_weight: round(combined, 3)}` |
| `profit_concentration` | Nguồn lãi tập trung | `max(attribution[].pct ?? 0) > 0.60` | `top` | `{max_contribution_pct: round(top, 3)}` |
| `sector_tilt` | Lệch ngành | tồn tại row `allocation` có `benchmark` truthy **và** `> 0` **và** `weight / benchmark > 3.0`; lấy ratio cao nhất | `ratio` | `{sector, ratio: round(ratio, 2), weight}` |
| `holding_losers` | Ôm lỗ | `behavior.disposition_flag === true` | `Number(worst_loser.periods_held ?? 1)` → **luôn 1.0** | chính object `worst_loser` (hoặc `{}` nếu null) |
| `cash_dry` | Tiền mặt cạn | `overview.cash_pct < 0.05` | `0.05 - cash_pct` | `{cash_pct}` |
| `healthy_focus` | **Tập trung lành mạnh** (tích cực) | `quality.roe >= 0.15` **và** `quality.pe < 13` **và** `max(positions[].weight) < 0.25` | `roe` | `{roe, pe}` |

Chi tiết dễ sai:
- `_hidden_corr` lấy `weight` từ `overview.positions[].weight ?? 0` (đã làm tròn 3 lẻ), so
  `combined > 0.2` **trước** khi tính severity.
- `_profit_concentration` dùng `max(pct ?? 0)` — `pct` âm bị đẩy về 0 khi so sánh.
- `_sector_tilt` chỉ xét row có `benchmark` **truthy** — `benchmark === 0` bị loại (`if bench and bench > 0`).
- `_cash_dry` dùng `overview.cash_pct or 0.0` → `cash_pct === 0` (hết sạch tiền) vẫn bắn
  với severity `0.05`.
- `_healthy_focus` dùng default `pe = 99.0` khi `quality.pe` falsy → mã không có P/E sẽ
  **không** bắn insight tích cực.

**Spec §5 còn 4 khuôn CHƯA implement** (deferred có chủ đích, ghi trong design §1):
`fake_cheap`, `momentum_fade`, `beta_win`, `over_fragmented`. Đừng thêm; kiến trúc
`_TEMPLATES` là mảng hàm nên thêm sau không cần refactor.

**`selected_insights` rỗng** là trạng thái hợp lệ (danh mục "rõ ràng"). Khi đó system prompt
yêu cầu LLM viết đúng câu:
`"Danh mục của bạn kỳ này khá rõ ràng, tôi không thấy rủi ro ẩn nào đáng ngại."`
và validator **không** đòi `narrative.insight`.

### N.12 Tầng LLM — prompt, parse, validate, retry

**System prompt** = **toàn bộ nội dung file `docs/ai/ai-portfolio-manager.md`, nguyên văn**,
đọc bằng `Path(__file__).resolve().parents[4] / "docs" / "ai" / "ai-portfolio-manager.md"`
và cache bằng `lru_cache(maxsize=1)` **tại thời điểm import module**
(`SYSTEM_PROMPT = _load_system_prompt()`).

> **Bẫy triển khai:** prompt là **file trên đĩa, không phải hằng số trong code**. Nếu file
> thiếu → **`ImportError` khi khởi động app**, không phải lỗi runtime khi gọi endpoint. Bản
> TS phải giữ đúng tính chất "fail fast lúc boot" (hoặc chuyển thành asset được bundle và
> kiểm tra tồn tại lúc boot).

Nội dung prompt (tóm các ràng buộc bản TS phải giữ nếu port sang prompt tiếng Việt khác —
nhưng **khuyến nghị copy nguyên file**):
- Giọng: một tiếng nói duy nhất xưng **"tôi"**, gọi người đọc là **"bạn"**; không "hội đồng".
- **Không** viết tắt tiếng Anh; bảng từ vựng bắt buộc: alpha → "vượt hiệu suất thị trường";
  beta → "độ nhạy với thị trường"; volatility → "mức độ biến động"; drawdown → "mức lỗ sâu
  nhất"; correlation → "vận động cùng nhịp / mức tương quan"; diversification → "phân tán
  rủi ro"; attribution → "nguồn gốc lợi nhuận"; P/E → "giá trên lợi nhuận"; ROE → "sinh lời
  trên vốn chủ". VaR → không dùng.
- **Chuẩn số:** dấu thập phân là **PHẨY** (`13,0%`), ngăn nghìn là **CHẤM** (`534.000.000 ₫`);
  `%` cho một mức, **`điểm %`** cho chênh lệch hai tỷ lệ; số biến thiên luôn kèm `+`/`−`.
- 4 nguyên tắc nội dung: (1) tấm gương trung thực — đúng **một** cặp "ghi nhận điều tốt" đi
  liền "nói thẳng sự thật phản biện"; (2) "Điều bạn có thể chưa để ý" gắn nhãn, dựa **chỉ**
  vào `selected_insights`; (3) tối đa 3 việc nên làm, **mỗi việc phải có số/ngưỡng cụ thể**;
  (4) từ kỳ 2 phải có phần "So với kỳ trước" dùng `progress.prev_actions`.
- Guardrail cảm xúc: mạch **vấn đề → hướng xử lý → điều cần theo dõi**; `closing` phải để
  lại cảm giác "tôi biết mình cần làm gì".
- Theo mode: `first` → **KHÔNG** viết `progress_text`, thêm câu định khung "đây là lần đầu…";
  `full_changed` → đầy đủ + `progress_text`; `light_unchanged` → giữ nhận định cốt lõi,
  `progress_text` tập trung "gợi ý cũ đã làm chưa, mốc theo dõi đã chạm chưa".
- `layers.stress` chỉ viết **lời dẫn khái niệm** (số do client tự tính khi người dùng bấm);
  nhấn rằng đây **không phải dự báo**.
- Output: **DUY NHẤT một object JSON**, không markdown, không ```.

**User prompt** (`build_user_prompt`) — chính xác:
~~~
Đây là Analysis JSON cho báo cáo kỳ này. Hãy viết Narrative JSON theo đúng system prompt.

<analysis_json>
{JSON.stringify(analysis, null, 2) — ensure_ascii=False, tức GIỮ nguyên tiếng Việt có dấu}
</analysis_json>
~~~

**Gọi model:** `chat_completion({system_prompt, user_content, temperature: 0.5})` →
`POST {AI_PROXY_BASE_URL}/chat/completions` với body
`{model: AI_PROXY_MODEL, messages: [system, user], temperature}`, header
`Authorization: Bearer {AI_PROXY_API_KEY}`. Timeout `AI_PROXY_TIMEOUT_SECONDS` (default 120s).
Trả `[content, model]` với `model = data.model ?? AI_PROXY_MODEL`.
**Không** set `response_format: json_object` — chỉ dựa vào prompt.

**Parse (`_parse_json`)** — hai bước:
1. Bóc fence bằng regex `^```(?:json)?\s*|\s*```$` (flag multiline, thay bằng `""`), rồi `.trim()`.
2. `JSON.parse`. Nếu ném → tìm `indexOf("{")` và `lastIndexOf("}")`; nếu `i !== -1 && j !== -1 && j > i`
   thì `JSON.parse(cleaned.slice(i, j+1))`; ngược lại **ném tiếp**.

**Vòng lặp retry (`generate_report`, `max_retries = 3`)**:
~~~
for attempt in 1..3:
    userPrompt = build_user_prompt(analysis)
    nếu lastErrors không rỗng:
        userPrompt += "\n\n=== SỬA LỖI ===\nBài trước có lỗi sau, hãy sửa và sinh lại:\n"
                    + lastErrors.map(e => `- ${e}`).join("\n")
    [text, modelUsed] = await chat_completion(...)          ← KHÔNG bọc try/catch
    try { narrative = parseJson(text) }
    catch (JSONDecodeError) { lastErrors = ["STRUCT: output không phải JSON hợp lệ"]; continue }
    lastErrors = validateNarrative(narrative, analysis)
    if (lastErrors.length === 0) break
valid = lastErrors.length === 0 && narrative !== null
~~~

**Validator (`validate_narrative`) — trả mảng mã lỗi, rỗng = hợp lệ.** Thứ tự và nguyên văn:

| Điều kiện sinh lỗi | Chuỗi lỗi (nguyên văn) |
|---|---|
| thiếu/falsy một trong `title`, `verdict`, `lede`, `layers`, `actions`, `watch`, `closing` | `STRUCT: thiếu trường '{key}'` |
| `mode !== "first"` và `progress_text` falsy | `STRUCT: thiếu 'progress_text' (mode != first)` |
| `mode === "first"` và `progress_text` truthy | `PROGRESS_FIRST: 'progress_text' phải rỗng khi mode=first` |
| với mỗi key trong `overview, performance, allocation, stress, risk, attribution, quality, behavior` mà `layers[k]` không phải string non-blank | `LAYERS: thiếu hoặc rỗng layers.{k}` |
| `actions.length > 3` | `ACTIONS_COUNT: {n} hành động (tối đa 3)` |
| với mỗi `i`, `actions[i].detail` **không chứa chữ số** (`/\d/`) | `ACTIONS_NUMBER: action[{i}].detail thiếu con số` |
| nối **mọi chuỗi** trong narrative (đệ quy dict/list/str), `.toLowerCase()`, chứa `"khuyến nghị mua"` / `"khuyến nghị bán"` | `FORBIDDEN_RECO: chứa '{term}'` |
| … chứa `"chắc chắn tăng"` / `"chắc chắn giảm"` | `FORBIDDEN_CERTAINTY: chứa '{term}'` |
| **bất kỳ** chuỗi khớp `/\d+\.\d{1,2}(?!\d)/` (dấu chấm thập phân 1–2 chữ số lẻ) — chỉ báo **một lần** rồi `break` | `DECIMAL_COMMA: dùng dấu chấm thập phân — phải dùng dấu phẩy` |
| `analysis.selected_insights` không rỗng nhưng `narrative.insight.text` falsy | `INSIGHT: thiếu nội dung insight dù có selected_insights` |
| `analysis.risk.excluded` không rỗng nhưng `low_data_note.trim()` rỗng | `LOW_DATA: có mã excluded nhưng thiếu low_data_note` |
| `analysis.risk.excluded` rỗng nhưng `low_data_note.trim()` **có** nội dung | `LOW_DATA: không có mã excluded nhưng vẫn có low_data_note` |

Regex `DECIMAL_COMMA` cố tình **chỉ** bắt 1–2 chữ số sau dấu chấm — vì ngăn nghìn tiếng
Việt luôn là **3** chữ số. Có test khoá: `"534.000.000 ₫ và 1.250.000 ₫"` **không** bị flag,
`"tăng 10.7%"` **bị** flag.

**Những rule của spec §10 KHÔNG được validator ép** (chỉ prompt lo, ghi rõ trong comment
source): cặp "ghi nhận tốt → nói thẳng", `closing` phải kết theo hướng tích cực. Đừng thêm
regex mới cho hai rule này khi viết lại — nó sẽ làm tỷ lệ retry tăng vọt.

**Fail-closed vs fail-open — điểm quan trọng nhất của tầng LLM:**

| Sự cố | Hành vi |
|---|---|
| LLM trả JSON hợp lệ nhưng vi phạm validator ở **cả 3 lần** | **200 OK**. `analysis` đầy đủ, `narrative` = bản parse gần nhất, `meta.valid = false`, `meta.errors` = mã lỗi lần cuối, `meta.attempts = 3`. **VẪN INSERT** row với `valid = false` → **day-cache khoá luôn bài lỗi cho hết ngày**. |
| LLM trả text không parse được ở cả 3 lần | **200 OK**, `narrative = null`, `meta.valid = false`, `errors = ["STRUCT: output không phải JSON hợp lệ"]`. Row vẫn được insert (`narrative_json = null`, `recommended_actions = []`). |
| AI proxy **timeout / connect error / HTTP lỗi / thiếu `choices[0].message.content`** | `AIProxyError` (Exception thường) **KHÔNG bị bắt** → thoát khỏi `generate_report` → thoát khỏi endpoint → **không** phải `AppException` → **500 Internal Server Error** với body Starlette mặc định `{"detail":"Internal Server Error"}`. **Không** lưu row, **không** trả phần định lượng. |
| `AI_PROXY_BASE_URL` hoặc `AI_PROXY_API_KEY` rỗng | `chat_completion` ném `ValueError` → cũng ra **500**. |

Nói gọn: **validator fail-open** (vẫn trả báo cáo định lượng), nhưng **transport LLM
fail-closed cứng** (500, mất luôn phần định lượng đã tính xong). Đây là hành vi hiện tại;
nếu bản TS muốn đổi thành "LLM chết → trả 200 với `narrative: null`" thì đó là **thay đổi
hành vi có ý thức** phải ghi changelog và có thể phải thêm cờ `meta.llm_error`.

**Ghi DB sau vòng lặp:**
~~~
recommended_actions = (narrative?.actions ?? []).map((a, i) => ({
  id: `action_${i}`, text: a.title ?? "", status: "open"     // TEXT = TITLE, không phải detail
}))
holdings_snapshot = Object.fromEntries(analysis.overview.positions.map(p => [p.ticker, p.weight]))
watch_conditions  = []                                        // luôn rỗng
period_number     = analysis.meta.period_number
mode              = analysis.meta.mode
generation_time_ms= Math.round((now - t0) * 1000)             // đo bằng monotonic clock
~~~

---

## Sinh & đọc báo cáo

### POST /api/v1/portfolio-manager/analyze

> **Sinh báo cáo phân tích danh mục** — chạy engine 8 lớp + LLM cho danh mục ảo của người dùng hiện tại, hoặc trả nguyên báo cáo đã sinh trong ngày (day-cache).

| | |
|---|---|
| **Quyền** | **Bearer + Premium** (`PremiumUser` = `get_premium_active_user`). Admin (`role = "admin"`) **được bypass** kiểm tra subscription. Thứ tự guard: token hợp lệ → `is_active` → premium |
| **Rate limit** | mặc định — `RATE_LIMIT_DEFAULT = "60/minute"` **theo IP** (`SlowAPIMiddleware` + `get_remote_address`). Không có override riêng cho route này. Một lần gọi có thể mất tới ~6 phút nhưng vẫn chỉ đếm là 1 |
| **Cache** | **không Redis.** Day-cache = row `portfolio_reports` với key `(account_id, session_date)`, `session_date = now(UTC+7).date()`. TTL = tới hết ngày ICT (không có expiry chủ động, cache miss chỉ do sang ngày mới) |
| **Nguồn dữ liệu** | DB (`virtual_trading_accounts`, `virtual_positions`, `virtual_trades`, `symbols`, `portfolio_reports`) + provider ngoài **VCI/Vietcap**: `fetch_ohlcv` (mỗi mã + `VNINDEX`), `fetch_financial_report(report_type="ratio", period="Y")` (mỗi mã), `vietcap_sector.fetch_sector_information(icb_level=2)`, `vietcap_market_overview.fetch_icb_codes()` + **AI proxy** (DeepSeek qua `AI_PROXY_*`) |
| **Side-effect** | `INSERT` 1 row vào `portfolio_reports` (kể cả khi `valid = false`); ghi `holdings_snapshot` + `recommended_actions` làm nền cho kỳ sau; gọi LLM tối đa 3 lần (tốn token). **Không** gửi email/Telegram, **không** ghi audit log, **không** cập nhật bảng nào khác. Ở nhánh cache-hit và `insufficient_data`: **không** side-effect nào |

**Path params** — —

**Query params** — —

**Request body** — **không có body.** Endpoint không nhận tham số nào; danh mục được đọc
**từ tài khoản giao dịch ảo của chính user trong DB**, client **KHÔNG** gửi holdings lên.
Không có `?force=true`, không có cách bỏ qua day-cache qua API.

~~~ts
// Không có request body. Gọi POST với body rỗng.
type AnalyzeRequest = never;
~~~

**Response 200** — `AnalyzeResponse` (xem §Kiểu dữ liệu dùng chung). Ví dụ thật, danh mục
NAV 1.000.000.000 ₫ gồm FPT / VCB / HPG / VNM, kỳ 1 (`mode = "first"`), tất cả mã đều đủ
thanh khoản nên `risk.excluded` rỗng và `low_data_note` là `""`:

~~~ts
interface AnalyzeResponse200 {
  analysis: PortfolioAnalysis;
  narrative: NarrativeJson | null;
  meta: AnalyzeMetaFresh | AnalyzeMetaCacheHit | AnalyzeMetaInsufficient;
}
~~~

~~~json
{
  "analysis": {
    "meta": {
      "portfolio_id": "7c1f2a9e",
      "date": "2026-08-17",
      "mode": "first",
      "period": "kỳ 1",
      "period_number": 1
    },
    "overview": {
      "nav": 1000000000,
      "cash_pct": 0.084,
      "n_positions": 4,
      "total_return": 0.029,
      "total_pnl": 25650000,
      "holding_months": 9,
      "positions": [
        {"ticker": "FPT", "sector": "Công nghệ Thông tin",  "weight": 0.265, "pnl": 27800000,  "low_confidence": false},
        {"ticker": "VCB", "sector": "Ngân hàng",            "weight": 0.259, "pnl": 14400000,  "low_confidence": false},
        {"ticker": "HPG", "sector": "Tài nguyên Cơ bản",    "weight": 0.207, "pnl": -11600000, "low_confidence": false},
        {"ticker": "VNM", "sector": "Thực phẩm và đồ uống", "weight": 0.185, "pnl": -4950000,  "low_confidence": false}
      ]
    },
    "performance": {
      "portfolio_return": 0.029,
      "benchmark_return": 0.069,
      "excess_return": -0.04,
      "max_drawdown": -0.112,
      "method": "simple_inception"
    },
    "allocation": [
      {"sector": "Công nghệ Thông tin",  "weight": 0.265, "benchmark": 0.042, "active": 0.223},
      {"sector": "Ngân hàng",            "weight": 0.259, "benchmark": 0.381, "active": -0.122},
      {"sector": "Tài nguyên Cơ bản",    "weight": 0.207, "benchmark": 0.058, "active": 0.149},
      {"sector": "Thực phẩm và đồ uống", "weight": 0.185, "benchmark": 0.061, "active": 0.124}
    ],
    "concentration": {
      "top1": 0.265,
      "top3": 0.731,
      "effective_n": 4.661,
      "largest_sector": 0.265
    },
    "risk": {
      "beta": 1.06,
      "volatility": 0.213,
      "tracking_error": 0.071,
      "correlation": [
        {"a": "FPT", "b": "HPG", "value": 0.412},
        {"a": "FPT", "b": "VCB", "value": 0.487},
        {"a": "FPT", "b": "VNM", "value": 0.351},
        {"a": "HPG", "b": "VCB", "value": 0.523},
        {"a": "HPG", "b": "VNM", "value": 0.298},
        {"a": "VCB", "b": "VNM", "value": 0.446}
      ],
      "excluded": []
    },
    "attribution": [
      {"ticker": "FPT", "pnl": 27800000,  "pct": 1.084},
      {"ticker": "VCB", "pnl": 14400000,  "pct": 0.561},
      {"ticker": "HPG", "pnl": -11600000, "pct": -0.452},
      {"ticker": "VNM", "pnl": -4950000,  "pct": -0.193}
    ],
    "quality": {
      "pe": 16.27,
      "pb": 3.203,
      "roe": 0.207,
      "dividend": 0.017,
      "sector_benchmark": {
        "sector": "Công nghệ Thông tin",
        "your_return": 0.234,
        "industry_return": 0.182,
        "gap": 0.052
      }
    },
    "behavior": {
      "avg_holding_days": 128,
      "losing_count": 2,
      "disposition_flag": false,
      "worst_loser": {"ticker": "HPG", "pnl_pct": -0.053, "periods_held": 1}
    },
    "scores": {
      "overall": 3.4,
      "prev_overall": null,
      "pillars": {"performance": 2, "risk": 5, "diversification": 3, "quality": 4, "discipline": 3}
    },
    "selected_insights": [
      {"id": "sector_tilt", "data": {"sector": "Công nghệ Thông tin", "ratio": 6.31, "weight": 0.265}},
      {"id": "profit_concentration", "data": {"max_contribution_pct": 1.084}}
    ],
    "progress": {"prev_actions": []}
  },
  "narrative": {
    "title": "Danh mục đang chạy sau thị trường vì một chỗ nghiêng",
    "verdict": "Danh mục của bạn có lãi 2,9% nhưng đang kém thị trường 4,0 điểm %, và toàn bộ phần lãi đó đến từ một mã duy nhất.",
    "lede": "Đây là lần đầu tôi soi danh mục của bạn, nên tôi sẽ nói thẳng bức tranh hiện tại và ghi lại mốc để kỳ sau chúng ta thấy mình tiến bộ ra sao. Bạn đang giải ngân khá đầy, tiền mặt còn 8,4% trên tổng tài sản 1.000.000.000 ₫.",
    "progress_text": "",
    "layers": {
      "overview": "Tổng tài sản của bạn đang ở 1.000.000.000 ₫ với 4 mã và 8,4% tiền mặt. Tính trên giá vốn, danh mục lãi 2,9% tương đương +25.650.000 ₫ sau 9 tháng. Mức giải ngân này là chủ động, nhưng nó cũng nghĩa là bạn còn rất ít chỗ để phản ứng khi thị trường cho giá tốt.",
      "performance": "Bạn lãi 2,9% trong khi chỉ số tham chiếu tăng 6,9%, tức đang kém 4,0 điểm %. Mức lỗ sâu nhất mà danh mục từng đi qua là −11,2%. Tôi nghiêng về cách đọc rằng vấn đề không phải bạn chọn sai hết, mà là hai mã đang lỗ đã ăn hết phần thắng của mã tốt.",
      "allocation": "Công nghệ thông tin chiếm 26,5% danh mục trong khi tỷ trọng tham chiếu chỉ 4,2% — bạn đang nghiêng gấp 6,31 lần. Ngược lại ngân hàng chỉ 25,9% so với 38,1% của chỉ số, thiếu 12,2 điểm %. Cấu trúc này nói rằng danh mục của bạn sẽ đi theo nhịp của một ngành hơn là nhịp của thị trường.",
      "stress": "Phần này không phải dự báo, nó chỉ để bạn thấy mình đang gánh bao nhiêu rủi ro. Với độ nhạy với thị trường 1,06 thì một nhịp chỉ số giảm sẽ truyền gần như nguyên vẹn vào danh mục, và 8,4% tiền mặt là toàn bộ phần đệm bạn có. Bạn có thể tự thử các mức giảm trên giao diện để cảm nhận con số bằng tiền.",
      "risk": "Độ nhạy với thị trường của bạn là 1,06 — gần như đi cùng nhịp chỉ số, đây là điểm tôi ghi nhận. Mức độ biến động năm hoá 21,3% và sai lệch so với chỉ số 7,1% đều nằm trong vùng bình thường. Cặp vận động cùng nhịp mạnh nhất chỉ 0,52, nên rủi ro trùng lặp giữa các mã chưa đáng lo.",
      "attribution": "Toàn bộ lãi ròng 25.650.000 ₫ tương đương phần đóng góp 108,4% đến từ FPT, còn HPG lấy lại −45,2% và VNM −19,3%. Nói cách khác, nếu bỏ FPT ra thì danh mục của bạn đang lỗ. Tôi ghi nhận bạn chọn đúng một mã lớn, nhưng cũng phải nói thẳng: hiện tại bạn chưa có mã thứ hai đỡ lưng.",
      "quality": "Bình quân gia quyền, danh mục có giá trên lợi nhuận 16,27 lần, giá trên sổ sách 3,20 lần và sinh lời trên vốn chủ 20,7%. Chất lượng doanh nghiệp là điểm mạnh thật của bạn. Riêng ngành công nghệ thông tin, rổ của bạn tăng 23,4% so với 18,2% của ngành, nhích hơn 5,2 điểm %.",
      "behavior": "Vòng giữ bình quân của các vị thế đã đóng là 128 ngày — bạn không giao dịch quá tay. Hiện có 2 mã đang lỗ, mã yếu nhất là HPG với −5,3%. Tôi không thấy dấu hiệu bạn ôm lỗ dài hơn ôm lãi, đó là một kỷ luật đáng giữ."
    },
    "insight": {
      "label": "Điều bạn có thể chưa để ý",
      "text": "Bạn đang nghiêng vào công nghệ thông tin gấp 6,31 lần tỷ trọng tham chiếu, và đúng ngành đó cũng là nơi sinh ra 108,4% phần lãi ròng. Hai điều này là cùng một điều: sức khoẻ danh mục của bạn hiện phụ thuộc vào một ngành duy nhất."
    },
    "low_data_note": "",
    "actions": [
      {"title": "Đưa tỷ trọng công nghệ thông tin về quanh 15,0%", "detail": "Hiện 26,5% và gấp 6,31 lần tỷ trọng tham chiếu; hạ về quanh 15,0% vẫn giữ được thế mạnh mà bớt phụ thuộc một ngành."},
      {"title": "Nâng tiền mặt lên quanh 15,0%", "detail": "Tiền mặt còn 8,4%; nâng lên quanh 15,0% cho bạn chỗ phản ứng khi thị trường cho giá tốt."},
      {"title": "Đặt ngưỡng dừng cho HPG", "detail": "Mã đang lỗ 5,3%; bạn có thể xem lại và chọn trước một ngưỡng cho mình thay vì quyết định giữa lúc giá chạy."}
    ],
    "watch": "Ba mốc tôi sẽ chú ý tới kỳ sau: tỷ trọng công nghệ thông tin có về dưới 20,0% hay không, tiền mặt có lên trên 10,0% hay không, và phần đóng góp lãi của mã lớn nhất có xuống dưới 60,0% hay chưa.",
    "closing": "Tổng kết: bạn chọn được doanh nghiệp tốt, việc còn lại chỉ là chia lại chỗ đứng cho đỡ lệ thuộc một ngành. Ba việc phía trên là đủ cho kỳ này, và kỳ sau tôi sẽ đối chiếu lại từng việc để bạn thấy mình đã đi được bao xa."
  },
  "meta": {
    "valid": true,
    "cached": false,
    "attempts": 1,
    "errors": [],
    "model": "deepseek-v4-flash",
    "persisted": true,
    "generation_time_ms": 34712
  }
}
~~~

Ví dụ **cache-hit** (gọi lần 2 trong cùng ngày ICT) — `analysis` và `narrative` y hệt,
chỉ `meta` khác:

~~~json
{
  "meta": {
    "valid": true,
    "cached": true,
    "model": "deepseek-v4-flash",
    "attempts": 0,
    "errors": [],
    "persisted": true,
    "generation_time_ms": 0
  }
}
~~~

Ví dụ **không đủ dữ liệu** (danh mục chỉ có 1 mã, hoặc chưa có giao dịch nào):

~~~json
{
  "analysis": {
    "insufficient_data": true,
    "reason": "Danh mục chưa đủ dữ liệu để phân tích — cần ít nhất 2 mã và lịch sử giao dịch."
  },
  "narrative": null,
  "meta": {
    "valid": false,
    "cached": false,
    "insufficient": true,
    "attempts": 0,
    "errors": [],
    "model": "",
    "persisted": false,
    "generation_time_ms": 1843
  }
}
~~~

Ví dụ **chưa có tài khoản giao dịch ảo** — **200, KHÔNG phải 404**:

~~~json
{
  "analysis": {
    "insufficient_data": true,
    "reason": "Bạn chưa kích hoạt tài khoản giao dịch ảo."
  },
  "narrative": null,
  "meta": {
    "valid": false, "cached": false, "insufficient": true,
    "attempts": 0, "errors": [], "model": "", "persisted": false,
    "generation_time_ms": 12
  }
}
~~~

Ví dụ **LLM không đạt QA sau 3 lần** (fail-open):

~~~json
{
  "analysis": { "…": "đầy đủ như ví dụ đầu" },
  "narrative": { "…": "bản parse gần nhất, có thể thiếu field" },
  "meta": {
    "valid": false,
    "cached": false,
    "attempts": 3,
    "errors": [
      "ACTIONS_NUMBER: action[1].detail thiếu con số",
      "DECIMAL_COMMA: dùng dấu chấm thập phân — phải dùng dấu phẩy"
    ],
    "model": "deepseek-v4-flash",
    "persisted": true,
    "generation_time_ms": 96204
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | `detail` (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không có header `Authorization` (hoặc scheme không phải Bearer) | `Yêu cầu xác thực` |
| 401 | `UNAUTHORIZED` | Token sai/hết hạn/không giải mã được (do `AuthService.get_current_user_from_token`) | `Thông tin xác thực không hợp lệ` — **CHƯA XÁC ĐỊNH chính xác từng biến thể; xem `app/services/auth.py` và chương 03** |
| 403 | `FORBIDDEN` | `user.is_active === false` | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | User không phải admin và không có subscription premium đang hoạt động | `Yêu cầu gói Premium đang hoạt động` |
| 429 | — | Vượt `60/minute` theo IP | body do `slowapi._rate_limit_exceeded_handler` sinh (không phải `AppException` — xem chương 02/04) |
| 500 | — | AI proxy timeout / không kết nối được / trả HTTP lỗi / response thiếu `choices[0].message.content`; hoặc `AI_PROXY_BASE_URL`/`AI_PROXY_API_KEY` chưa cấu hình | `Internal Server Error` (body mặc định của Starlette — **không** có `code`, **không** tiếng Việt) |
| 500 | — | Gọi trùng đồng thời → vi phạm `uq_portfolio_reports_account_date` | `Internal Server Error` |

> **Không có 404 ở endpoint này.** `NotFoundError` từ `_resolve_account_id` bị `generate_report`
> **bắt lại** và biến thành `insufficient_data` + 200. Đây là quyết định có test khoá:
> `test_no_virtual_account_returns_insufficient_not_404`.

**Fallback / suy giảm** — bảng đầy đủ (phần hay bị bỏ sót nhất):

| Thiếu gì | Nhánh chạy | Response |
|---|---|---|
| Chưa có `VirtualTradingAccount` | `_resolve_account_id` ném `NotFoundError` → bắt | 200, `insufficient_data`, reason `"Bạn chưa kích hoạt tài khoản giao dịch ảo."`, không lưu DB |
| < 2 vị thế `quantity_total > 0` **hoặc** `trades` rỗng | `build_analysis` return sớm | 200, `insufficient_data`, reason `"Danh mục chưa đủ dữ liệu để phân tích — cần ít nhất 2 mã và lịch sử giao dịch."`, **không gọi LLM**, không lưu DB |
| `fetch_ohlcv` lỗi cho **một** mã | `_safe` → `bars = []` → `closes = []`, `volumes = []` | Mã đó `low_confidence: true` + vào `risk.excluded`; vẫn có weight/pnl/quality |
| `fetch_ohlcv` lỗi cho **mọi** mã | `confident = []` trong `layer_risk`; `navSeries = []` | `risk` = `{beta: 0.0, volatility: 0.0, tracking_error: 0.0, correlation: [], excluded: [đủ 4 mã]}`; trụ `risk` = **1 điểm**; `max_drawdown` **tính trên VN-Index** nhưng `method` vẫn `"simple_inception"` |
| `fetch_ohlcv("VNINDEX")` lỗi | `benchmark_closes = []` | `benchmark_return = 0.0` → `excess_return = portfolio_return`; `n = 0` → `risk` về nhánh suy giảm; `max_drawdown` tính từ `navSeries` nếu có, ngược lại `0.0` |
| `fetch_financial_report` lỗi / thiếu key | `_pick` trả `null` | `quality.pe/pb/roe/dividend` = `null` cho mã đó; nếu **mọi** mã `null` → cả 4 field `null` → trụ `quality` dùng default `roe = 0.0`, `pe = 99.0` → **1 điểm** |
| `fetch_sector_information` / `fetch_icb_codes` lỗi hoặc join ICB không khớp | `_load_sector_info` trả `({}, {})` + log WARNING | mọi `allocation[].benchmark = null`, `active = null`; insight `sector_tilt` không bắn; `quality.sector_benchmark = null` |
| Symbol không có row trong bảng `symbols` | `_load_sectors_for` setdefault | `sector = "Khác"` → gần như chắc chắn không khớp benchmark ngành |
| Giá không resolve được cho một vị thế (`PriceUnavailableError` trong `get_portfolio`) | `market_value_vnd = null`, `unrealized_pnl_vnd = null` | `market_value = 0` → `weight = 0`; và **`unrealized_pnl = 0 - cost_basis`** (`p.get(...) or (mv - cost)`) → mã đó hiện **lỗ 100% giá vốn**, kéo lệch `total_pnl`, `attribution`, `worst_loser`. **Bug thật, xem §Ghi chú tổng hợp** |
| LLM vi phạm QA cả 3 lần | fail-open | 200 + `analysis` đủ + `meta.valid = false` + `errors`; **row vẫn được lưu** → cache khoá bài lỗi cả ngày |
| LLM không parse được cả 3 lần | fail-open | 200 + `narrative: null` + `errors: ["STRUCT: output không phải JSON hợp lệ"]`; row lưu với `narrative_json = null` |
| AI proxy chết / chưa cấu hình | **fail-closed** | **500**, mất luôn phần định lượng đã tính; không lưu row → lần gọi sau chạy lại từ đầu (kể cả tất cả call provider) |
| Ngoài giờ giao dịch / cuối tuần | không có nhánh riêng | Vẫn sinh báo cáo bình thường; giá dùng là **close phiên gần nhất** (`resolve_price` fallback `source: "close"`). **Bấm sáng thứ Bảy sẽ tạo báo cáo MỚI** vì day-cache theo ngày lịch ICT, chưa fold về phiên gần nhất |

**curl**

~~~bash
# Đổi BASE sang host production khi cần. TOKEN = access_token của user Premium.
BASE="http://localhost:8000"

curl -sS -X POST "$BASE/api/v1/portfolio-manager/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 9f2b7d41-6c3e-4a58-b0d2-8e5147ac93f6" \
  --max-time 420 \
  -w '\n--- HTTP %{http_code} in %{time_total}s\n'
~~~

> `--max-time 420`: chặn trên lý thuyết của một lần cache-miss là
> `3 × AI_PROXY_TIMEOUT_SECONDS (120s) = 360s` cho tầng LLM, **cộng** thời gian `2·N + 3`
> call provider tuần tự của tầng định lượng. **Thời gian chạy điển hình: CHƯA ĐO** trên
> production — đừng ghi con số phỏng đoán vào SLA. Bản TS phải đảm bảo timeout của
> reverse-proxy / load balancer **lớn hơn** giới hạn này, hoặc chuyển endpoint sang chạy nền
> (thay đổi hành vi, cần quyết định riêng).

**Ghi chú khi viết lại**

1. **Thứ tự kiểm tra bắt buộc**: guard premium → `_resolve_account_id` (bắt `NotFoundError`)
   → day-cache → `build_analysis` (bên trong lại kiểm `insufficient`) → LLM → persist. Nếu
   đảo cache lên trước khi resolve account, user chưa có tài khoản ảo sẽ vỡ.
2. **Ba lần tra tài khoản mỗi lần sinh mới**: `generator._resolve_account_id`,
   `inputs.load_inputs → get_portfolio` (tra lại), `analysis.build_analysis → _resolve_account_id`
   (tra lần ba). Bản TS nên truyền `accountId` xuống thay vì tra lại — nhưng **phải giữ
   đúng thứ tự ném lỗi**: `load_inputs` là chỗ ném `NotFoundError` trong `build_analysis`.
3. **`account_id` được ép về UUID** trước khi dùng làm key cache (`uuid.UUID(str(x))` nếu
   chưa phải UUID) — bản TS chỉ cần chuẩn hoá chuỗi UUID về lowercase.
4. **`generation_time_ms` đo bằng monotonic clock** (`time.monotonic()`), không phải
   `Date.now()` — dùng `process.hrtime.bigint()` hoặc `performance.now()`.
5. **Thứ tự gọi lớp bắt buộc**: `layer_risk` **trước** `layer_overview` (overview cần
   `lowConf`). Sau đó: performance (cần `navSeries`), allocation, concentration,
   attribution, quality, behavior. `select_insights` gọi **sau cùng**, trên object
   `analysis` đã hoàn chỉnh (nó đọc `analysis.overview.positions`, `analysis.risk.correlation`,
   `analysis.attribution`, `analysis.allocation`, `analysis.quality`, `analysis.behavior`).
6. **`analysis.selected_insights` được gán 2 lần**: khởi tạo `[]` rồi ghi đè bằng
   `select_insights(analysis)`. Vì `select_insights` đọc chính object đó, cấu trúc phải
   tồn tại đủ trước khi gọi.
7. **`meta.date` dùng UTC nhưng `session_date` dùng ICT** — từ 00:00 đến 07:00 giờ Việt Nam,
   `analysis.meta.date` sẽ là **ngày hôm trước** so với `session_date` của row. Cả hai đều
   là hành vi hiện tại; nếu hợp nhất về ICT thì phải ghi changelog vì `holding_months` cũng
   thay đổi theo.
8. **Row được lưu kể cả khi `valid = false`** → day-cache khoá bài lỗi tới hết ngày. Không
   có cơ chế "sinh lại" qua API. Nếu bản TS muốn chỉ cache khi `valid`, đó là thay đổi hành
   vi có ý thức (và mở ra rủi ro gọi LLM lặp lại nhiều lần trong ngày).
9. **`narrative` có thể lệch pha với `errors`**: nếu attempt 1 parse được nhưng invalid, và
   attempt 2 không parse được, thì `narrative` giữ bản của **attempt 1** trong khi `errors`
   là `["STRUCT: output không phải JSON hợp lệ"]` của attempt 2. Giữ nguyên (`continue`
   không reset `narrative`), hoặc sửa **có ý thức**.
10. **`recommended_actions[].text` lấy từ `action.title`, không phải `action.detail`** — và
    đây chính là chuỗi mà `_diff_prev_actions` kỳ sau sẽ dò ticker. Lấy sai field sẽ làm
    "tiến bộ" luôn báo chưa làm.
11. **Không commit trong service** — `repo.insert` chỉ `flush()`. Commit do wrapper DB
    session làm sau khi handler trả về (`get_db` luôn `commit()`; exception → `rollback()`).
    Bản NestJS phải đặt transaction ở tầng interceptor/middleware tương đương, nếu không
    row sẽ không được ghi.

---

### GET /api/v1/portfolio-manager/report

> **Đọc báo cáo danh mục gần nhất** — trả báo cáo đã lưu mới nhất của người dùng, không sinh mới, không gọi LLM.

| | |
|---|---|
| **Quyền** | **Bearer + Premium** (cùng `PremiumUser` như trên; admin bypass) |
| **Rate limit** | mặc định — `60/minute` theo IP |
| **Cache** | không cache tầng ứng dụng — mỗi lần gọi là 2 truy vấn DB (tra account + `ORDER BY session_date DESC LIMIT 1`). Nhưng `meta.cached` **luôn `true`** vì dữ liệu vốn là bản đã lưu |
| **Nguồn dữ liệu** | DB thuần: `virtual_trading_accounts` (resolve account) + `portfolio_reports`. **Không** gọi provider ngoài, **không** gọi AI proxy |
| **Side-effect** | — (chỉ đọc) |

**Path params** — —

**Query params** — — (**không có** `?date=`, `?limit=`, phân trang, hay lọc gì cả. Repository
đã có `list_recent(account_id, limit=10)` nhưng **chưa endpoint nào dùng**)

**Request body** — —

**Response 200** — cùng vỏ `AnalyzeResponse`, nhưng `meta` là `LatestReportMeta`:

~~~ts
interface LatestReportResponse200 {
  analysis: PortfolioAnalysis | InsufficientAnalysis;  // = cột analysis_json, nguyên xi
  narrative: NarrativeJson | null;                     // = cột narrative_json, có thể null
  meta: LatestReportMeta;
}

interface LatestReportMeta {
  valid: boolean;          // cột valid
  cached: true;            // hằng số
  model: string | null;    // cột model_used
  session_date: string;    // cột session_date, định dạng ISO date "YYYY-MM-DD"
  period_number: number;   // cột period_number
}
~~~

~~~json
{
  "analysis": {
    "meta": {
      "portfolio_id": "7c1f2a9e",
      "date": "2026-08-17",
      "mode": "full_changed",
      "period": "kỳ 3",
      "period_number": 3
    },
    "overview": {
      "nav": 1000000000,
      "cash_pct": 0.152,
      "n_positions": 4,
      "total_return": 0.041,
      "total_pnl": 34120000,
      "holding_months": 9,
      "positions": [
        {"ticker": "FPT", "sector": "Công nghệ Thông tin",  "weight": 0.158, "pnl": 16400000,  "low_confidence": false},
        {"ticker": "VCB", "sector": "Ngân hàng",            "weight": 0.284, "pnl": 21300000,  "low_confidence": false},
        {"ticker": "HPG", "sector": "Tài nguyên Cơ bản",    "weight": 0.221, "pnl": -3580000,  "low_confidence": false},
        {"ticker": "VNM", "sector": "Thực phẩm và đồ uống", "weight": 0.185, "pnl": 0,         "low_confidence": false}
      ]
    },
    "performance": {
      "portfolio_return": 0.041,
      "benchmark_return": 0.069,
      "excess_return": -0.028,
      "max_drawdown": -0.087,
      "method": "simple_inception"
    },
    "allocation": [
      {"sector": "Ngân hàng",            "weight": 0.284, "benchmark": 0.381, "active": -0.097},
      {"sector": "Tài nguyên Cơ bản",    "weight": 0.221, "benchmark": 0.058, "active": 0.163},
      {"sector": "Thực phẩm và đồ uống", "weight": 0.185, "benchmark": 0.061, "active": 0.124},
      {"sector": "Công nghệ Thông tin",  "weight": 0.158, "benchmark": 0.042, "active": 0.116}
    ],
    "concentration": {"top1": 0.284, "top3": 0.663, "effective_n": 4.789, "largest_sector": 0.284},
    "risk": {
      "beta": 1.02,
      "volatility": 0.198,
      "tracking_error": 0.064,
      "correlation": [{"a": "FPT", "b": "VCB", "value": 0.471}],
      "excluded": [{"ticker": "HPG", "reason": "low_liquidity_short_history"}]
    },
    "attribution": [
      {"ticker": "VCB", "pnl": 21300000, "pct": 0.624},
      {"ticker": "FPT", "pnl": 16400000, "pct": 0.481},
      {"ticker": "HPG", "pnl": -3580000, "pct": -0.105},
      {"ticker": "VNM", "pnl": 0,        "pct": 0.0}
    ],
    "quality": {"pe": 15.42, "pb": 2.871, "roe": 0.213, "dividend": 0.021, "sector_benchmark": null},
    "behavior": {
      "avg_holding_days": 141,
      "losing_count": 1,
      "disposition_flag": false,
      "worst_loser": {"ticker": "HPG", "pnl_pct": -0.016, "periods_held": 1}
    },
    "scores": {
      "overall": 3.8,
      "prev_overall": 3.4,
      "pillars": {"performance": 3, "risk": 5, "diversification": 3, "quality": 4, "discipline": 4}
    },
    "selected_insights": [
      {"id": "profit_concentration", "data": {"max_contribution_pct": 0.624}}
    ],
    "progress": {
      "prev_actions": [
        {"id": "action_0", "done": true,  "detail": "Đưa tỷ trọng công nghệ thông tin về quanh 15,0%"},
        {"id": "action_1", "done": false, "detail": "Nâng tiền mặt lên quanh 15,0%"},
        {"id": "action_2", "done": false, "detail": "Đặt ngưỡng dừng cho HPG"}
      ]
    }
  },
  "narrative": {
    "title": "Bạn đã sửa đúng chỗ nghiêng, giờ tới phần đệm",
    "verdict": "Điểm sức khoẻ của bạn lên 3,8 từ 3,4 nhờ việc hạ tỷ trọng công nghệ thông tin, nhưng phần lãi vẫn dồn vào một mã.",
    "lede": "Kỳ này tôi thấy một danh mục gọn hơn kỳ trước. Tổng tài sản giữ ở 1.000.000.000 ₫, tiền mặt lên 15,2% và số mã vẫn là 4.",
    "progress_text": "Việc tôi đề nghị kỳ trước về tỷ trọng công nghệ thông tin thì bạn đã làm — mã này về 15,8% từ 26,5%. Việc nâng tiền mặt bạn cũng đã đi được một đoạn. Riêng ngưỡng dừng cho HPG thì vẫn còn bỏ ngỏ.",
    "layers": {
      "overview": "Tổng tài sản 1.000.000.000 ₫, 4 mã, tiền mặt 15,2%. Lãi trên giá vốn là 4,1% tương đương +34.120.000 ₫.",
      "performance": "Bạn lãi 4,1% so với 6,9% của chỉ số, tức còn kém 2,8 điểm % — thu hẹp so với 4,0 điểm % kỳ trước. Mức lỗ sâu nhất cải thiện về −8,7%.",
      "allocation": "Ngân hàng đã lên 28,4% nhưng vẫn thiếu 9,7 điểm % so với chỉ số. Tài nguyên cơ bản 22,1% là chỗ nghiêng mạnh nhất còn lại.",
      "stress": "Đây không phải dự báo. Với độ nhạy 1,02 và 15,2% tiền mặt, bạn đã có đệm tốt hơn kỳ trước rõ rệt.",
      "risk": "Độ nhạy với thị trường 1,02, mức độ biến động 19,8%, sai lệch so với chỉ số 6,4% — tất cả đều gọn hơn kỳ trước.",
      "attribution": "VCB đóng góp 62,4% và FPT 48,1% phần lãi ròng, HPG lấy lại 10,5%. Bạn đã có mã thứ hai đỡ lưng, đó là tiến bộ thật.",
      "quality": "Giá trên lợi nhuận 15,42 lần, giá trên sổ sách 2,87 lần, sinh lời trên vốn chủ 21,3%. Chất lượng vẫn là điểm mạnh của bạn.",
      "behavior": "Vòng giữ bình quân 141 ngày, chỉ còn 1 mã lỗ là HPG với −1,6%. Kỷ luật của bạn đang tốt lên."
    },
    "insight": {
      "label": "Điều bạn có thể chưa để ý",
      "text": "62,4% phần lãi ròng vẫn đến từ một mã. Bạn đã bớt lệch về ngành nhưng chưa bớt lệ thuộc vào một cái tên."
    },
    "low_data_note": "Với HPG kỳ này tôi chưa đưa con số rủi ro vào bảng, vì lịch sử giá và thanh khoản chưa đủ dày để tôi tin vào phép đo. Tôi sẽ chấm khi dữ liệu đủ. Bản thân việc chưa đo được cũng là một loại rủi ro, nên bạn đừng coi chỗ trống này là an toàn.",
    "actions": [
      {"title": "Đặt ngưỡng dừng cho HPG", "detail": "Đây là kỳ thứ hai tôi nhắc; mã đang lỗ 1,6% và chưa có mức nào được đặt trước."},
      {"title": "Kéo phần đóng góp của mã lớn nhất xuống dưới 50,0%", "detail": "Hiện VCB chiếm 62,4% phần lãi ròng; đưa về dưới 50,0% sẽ làm danh mục bớt phụ thuộc một cái tên."}
    ],
    "watch": "Hai mốc tới kỳ sau: HPG có được đặt ngưỡng dừng chưa, và phần đóng góp lãi của mã lớn nhất có xuống dưới 50,0% hay không.",
    "closing": "Bạn đã chứng minh mình sửa được đúng chỗ tôi chỉ ra, và điểm sức khoẻ lên 3,8 là kết quả của việc đó. Kỳ sau chúng ta xử nốt phần lệ thuộc một cái tên là danh mục này sẽ đứng vững hơn nhiều."
  },
  "meta": {
    "valid": true,
    "cached": true,
    "model": "deepseek-v4-flash",
    "session_date": "2026-08-17",
    "period_number": 3
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | `detail` (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu header `Authorization` / scheme không phải Bearer | `Yêu cầu xác thực` |
| 401 | `UNAUTHORIZED` | Token sai/hết hạn | `Thông tin xác thực không hợp lệ` — **CHƯA XÁC ĐỊNH từng biến thể; xem `app/services/auth.py`** |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | Không premium và không admin | `Yêu cầu gói Premium đang hoạt động` |
| **404** | `NOT_FOUND` | **Chưa có tài khoản giao dịch ảo** — `_resolve_account_id` ném và **KHÔNG bị bắt** ở endpoint này | `Không tìm thấy tài khoản giao dịch ảo` |
| **404** | `NOT_FOUND` | Có tài khoản ảo nhưng **chưa từng có báo cáo nào** (`get_latest` trả null) | `Không tìm thấy báo cáo phân tích danh mục` |
| 429 | — | Vượt `60/minute` theo IP | body do slowapi sinh |

Body lỗi (handler `AppException` ở `app/main.py`):

~~~json
{ "detail": "Không tìm thấy báo cáo phân tích danh mục", "code": "NOT_FOUND" }
~~~

**Fallback / suy giảm**

| Tình huống | Hành vi |
|---|---|
| **Chưa có báo cáo nào** | **404** `Không tìm thấy báo cáo phân tích danh mục`. **KHÔNG** trả 200 với `analysis: null`, **KHÔNG** tự sinh mới. Client muốn có báo cáo phải gọi `POST /analyze`. Frontend hiện tại dùng `POST /analyze` làm đường chính (lazy mutation khi mở modal) và `GET /report` chỉ là tiện ích |
| Chưa có tài khoản giao dịch ảo | **404** `Không tìm thấy tài khoản giao dịch ảo` — **khác hẳn** `POST /analyze` (trả 200 + `insufficient_data`). Hai endpoint xử lý cùng tình huống theo hai cách |
| Báo cáo gần nhất là của **ngày cũ** (hôm nay chưa sinh) | Vẫn trả **200** báo cáo cũ đó, `meta.cached = true`, `meta.session_date` là ngày cũ. **Không có cờ "stale"** — client phải tự so `meta.session_date` với ngày ICT hôm nay để biết bài đã cũ |
| Báo cáo gần nhất có `valid = false` | Vẫn trả **200**; `meta.valid = false`; `narrative` có thể `null` hoặc thiếu field. Không có nhánh "bỏ qua bài lỗi, lấy bài hợp lệ trước đó" |
| Báo cáo gần nhất được lưu ở nhánh `insufficient_data` | **Không thể xảy ra** — nhánh `insufficient_data` không bao giờ `INSERT`. Nhưng type `analysis` vẫn nên là union để chịu được dữ liệu cũ/di trú |
| Nhiều row cùng `session_date` (dữ liệu bẩn) | `get_latest` dùng `LIMIT 1` nên vẫn an toàn (khác `get_for_date` dùng `scalar_one_or_none` sẽ throw) |

**curl**

~~~bash
BASE="http://localhost:8000"

curl -sS -X GET "$BASE/api/v1/portfolio-manager/report" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 3d5e8a17-92c4-4b60-a1f7-6b0c24e9d853" \
  -w '\n--- HTTP %{http_code}\n'
~~~

**Ghi chú khi viết lại**

1. **Thứ tự kiểm tra bắt buộc**: resolve account **trước** (ném 404 nếu chưa có tài khoản
   ảo) → mới tra báo cáo (ném 404 nếu chưa có). Đảo lại sẽ đổi `detail` của lỗi mà user
   nhận được.
2. **`meta` của endpoint này dựng TAY trong handler**, không đi qua `generate_report`. Đừng
   tái dùng builder meta của `POST /analyze` — sẽ thêm/thiếu field.
3. **`session_date` phải serialize bằng `.isoformat()`** → `"2026-08-17"` (chỉ ngày, không
   có giờ, không có `Z`). Trong TS, cột `date` của Postgres qua driver thường ra `Date` —
   phải format lại thành `YYYY-MM-DD`, **không** dùng `toISOString()` (sẽ ra timestamp và
   có thể lệch ngày do UTC).
4. **`ORDER BY session_date DESC LIMIT 1`** — sắp xếp theo `session_date`, **không** theo
   `created_at` và **không** theo `period_number`. Nếu có row cũ với `session_date` trong
   tương lai (dữ liệu bẩn/seed) thì nó sẽ luôn được trả về.
5. Endpoint **không** kiểm tra báo cáo có thuộc phiên hôm nay hay không, và **không** có
   query param để lấy theo ngày. Nếu bản TS cần "báo cáo hôm nay hay không có gì" thì phải
   thêm endpoint/param mới — không được đổi hành vi của path này.
6. `analysis_json` / `narrative_json` là cột `JSON` (không `JSONB`) — trả **nguyên xi** ra
   response, không re-serialize theo thứ tự khoá khác. Frontend đọc theo key nên thứ tự
   không quan trọng, nhưng đừng "làm sạch" (bỏ `null`, đổi tên) khi đọc lại.

---

## Ghi chú tổng hợp khi viết lại

### 1. Bẫy đã xác nhận trong source (không phải suy đoán)

| # | Bẫy | Chi tiết |
|---|---|---|
| 1 | **`meta` hai endpoint khác nhau** | `GET /report` là nơi duy nhất có `session_date` + `period_number`; `POST /analyze` là nơi duy nhất có `attempts`/`errors`/`persisted`/`generation_time_ms`. Không hợp nhất |
| 2 | **`narrative.layers` có `stress`, `analysis` có `concentration`** | 8 key narrative: `overview, performance, allocation, stress, risk, attribution, quality, behavior`. 8 lớp analysis: `overview, performance, allocation, concentration, risk, attribution, quality, behavior`. Validator kiểm theo danh sách **narrative** |
| 3 | **`attribution[].pct` có thể > 1 và < 0** | Mẫu số là tổng đại số. Có ví dụ thật `1.084`. Client phải clamp khi vẽ |
| 4 | **`quality.pe` default `99.0` trong scoring** | Và dùng phép "or falsy" nên `pe === 0` cũng thành `99.0`. Dùng `??` sẽ ra điểm khác |
| 5 | **`worst_loser.periods_held` cứng `1`** | Comment nói orchestrator ghi đè nhưng thực tế không. Insight `holding_losers` luôn severity `1.0` |
| 6 | **`disposition_flag` so "lãi đã bán" vs "lỗ đã bán"** | Lệch spec (spec nói "lỗ đang giữ"). Người chưa bán lỗ → luôn `false` |
| 7 | **`excess_return` so lệch cửa sổ thời gian** | `portfolio_return` since-inception vs `benchmark_return` trên ~140 phiên gần nhất. Là input trực tiếp của điểm sức khoẻ |
| 8 | **`max_drawdown` âm thầm rơi về VN-Index** | Khi không mã nào có ≥2 bar, `method` vẫn ghi `"simple_inception"`. Không có cờ báo |
| 9 | **`meta.date` (UTC) vs `session_date` (ICT)** | Lệch 1 ngày trong khoảng 00:00–07:00 giờ VN |
| 10 | **Không fold cuối tuần/nghỉ lễ** | Thứ Bảy sinh báo cáo mới với giá y hệt thứ Sáu, `period_number` tăng vô nghĩa |
| 11 | **Không có lock chống gọi trùng** | Double-click → 500 do unique constraint. **Nên sửa** trong bản TS bằng upsert/advisory lock |
| 12 | **AI proxy chết → 500, mất phần định lượng** | Ngược lại, validator fail thì fail-open (200). Hai chế độ khác nhau |
| 13 | **Row `valid = false` vẫn khoá day-cache** | Không có cách sinh lại trong ngày qua API |
| 14 | **Giá không resolve được → `pnl = -cost_basis`** | `p.get("unrealized_pnl_vnd") or (mv - cost)` với `mv = 0` → mã hiện lỗ 100% giá vốn, kéo lệch `total_pnl`/`attribution`/`worst_loser`/`losing_count`. **Bug thật.** Bản TS nên xử lý (bỏ mã khỏi attribution hoặc đánh cờ) và **ghi changelog** |
| 15 | **`_pick("dividend", …)` dựa vào key thứ ba** | Key thật của VCI là `dividend_yield`; hai tên đầu không tồn tại. Có test khoá |
| 16 | **`period_number` = số row đã có + 1** | Xoá row → trùng số. Không phải sequence |
| 17 | **`_diff_prev_actions` dò ticker bằng `indexOf` trên chữ hoa** | False-positive với mã 3 ký tự trùng cụm chữ tiếng Việt; action không nhắc mã → vĩnh viễn `done: false` |
| 18 | **System prompt là file trên đĩa, load lúc import** | Thiếu file → app không boot được |
| 19 | **`watch_conditions` luôn `[]`** | Cột tồn tại nhưng chưa dùng |
| 20 | **`round()` của Python là banker's rounding** | `round(2.675, 3)` và `round(0.5)` khác `Math.round`. Với `_r3` (3 lẻ) khác biệt cực nhỏ nhưng **`overall_score` làm tròn 1 lẻ** có thể lệch (ví dụ `round(3.25, 1)` Python → `3.2`, `Math.round(3.25*10)/10` → `3.3`). Muốn khớp 100% phải tự implement half-to-even |

### 2. Những gì spec có mà code CHƯA có (đừng "bổ sung" khi viết lại)

| Hạng mục | Trạng thái |
|---|---|
| TWR (Time-Weighted Return) | **Deferred.** v1 dùng `simple_inception`. `method` là chỗ đánh dấu |
| Xử lý nạp/rút tiền trong hiệu suất | **Không có.** Không có luồng nạp/rút trong giao dịch ảo (`initial_cash_vnd` cố định); `portfolio_return` chỉ là lãi/lỗ chưa thực hiện trên giá vốn, nên nạp/rút **không** ảnh hưởng công thức |
| `realized_pnl` trong attribution | **Không có** — chỉ unrealized |
| Brinson attribution (allocation vs selection) | **Deferred** |
| `turnover` (lớp 08) | **Chưa implement** |
| `beta_i` từng mã (lớp 05) | **Chưa implement** |
| `no_gaps(bars)` trong gate độ tin cậy (spec §4) | **Chưa implement** |
| 4 khuôn insight `fake_cheap`, `momentum_fade`, `beta_win`, `over_fragmented` | **Deferred** (kiến trúc `_TEMPLATES` cho phép thêm sau) |
| VaR | **Loại bỏ có chủ đích.** Không tính, không hiển thị. Thay bằng stress-test client-side |
| Chỉ số ngành riêng (lớp 03) | Dùng `percent_price_change_6m` của VCI, không dựng index riêng |
| Validator rule "cặp ghi nhận ↔ nói thẳng" và "closing tích cực" | Chỉ prompt ép, **không** regex |
| Fold day-cache về phiên giao dịch gần nhất | **Deferred**, ghi rõ trong comment `generator.py` |
| Sinh báo cáo theo lịch (cron) cho từng user | **Không có.** Chỉ on-demand |
| `quality.sector_benchmark` | Design doc ghi deferred nhưng **CODE ĐÃ IMPLEMENT** + có 2 test. **Phải implement** |

### 3. Chuẩn đơn vị — bảng chốt

| Đại lượng | Đơn vị trong JSON | Lưu ý |
|---|---|---|
| `nav`, `total_pnl`, `pnl`, `market_value`, `cost_basis` | **số nguyên VND** | Không nghìn VND, không có phần lẻ |
| `weight`, `cash_pct`, `total_return`, `benchmark`, `active`, `top1`, `top3`, `largest_sector`, `pct` | **phân số 0..1** (`0.265` = 26,5%) | 3 chữ số thập phân. **Không** phải phần trăm |
| `portfolio_return`, `benchmark_return`, `excess_return`, `max_drawdown`, `your_return`, `industry_return`, `gap`, `pnl_pct` | **phân số**, có dấu; `max_drawdown` luôn ≤ 0 | 3 lẻ |
| `roe`, `dividend` | **phân số** (`0.207` = 20,7%) | 3 lẻ |
| `beta`, `volatility`, `tracking_error`, `correlation[].value`, `effective_n`, `pe`, `pb`, `ratio` | **số thuần** | `volatility`/`tracking_error` đã annualize ×√252 |
| `holding_months` | tháng (nguyên) | `max(1, round(days/30))`, `0` nếu không có inception |
| `avg_holding_days` | ngày (nguyên) | `0` nếu chưa có vị thế đóng |
| `generation_time_ms` | milisecond | monotonic clock |
| `session_date`, `meta.date` | ISO date `"YYYY-MM-DD"` | `session_date` theo ICT, `meta.date` theo UTC |
| OHLCV `closes` từ VCI | **VND** (không phải nghìn VND) | Xác nhận trong `price_resolver.py`: "VCI OHLCV returns prices in VND"; VNDIRECT mới là kVND. `DATA_CONF_MIN_AVG_VALUE_VND = 2e9` vì thế so đúng 2 tỷ VND |
| `sector_returns_6m` | **phân số** sau `_pct_to_fraction` | VCI trả `14.0` hoặc `0.14`; quy tắc: `\|n\| > 1.5 → n/100` |

### 4. Chuẩn hiển thị số cho client (spec §6 — không phải việc của backend nhưng phải nhất quán)

Backend trả **phân số/số thuần**; **client format**. Quy tắc bắt buộc (LLM cũng bị ép trong
narrative, và validator có regex `DECIMAL_COMMA` kiểm):

| Loại | Ký hiệu | Ví dụ |
|---|---|---|
| Tỷ suất sinh lời, lãi/lỗ | `%` **có dấu** `+`/`−` | `+2,9%` `−11,2%` |
| Chênh lệch hai tỷ lệ | **`điểm %`** có dấu | `−4,0 điểm %` (KHÔNG viết "kém 4%") |
| Tỷ trọng, cơ cấu | `%` không dấu | `26,5%` |
| Độ nhạy với thị trường (beta) | số thuần | `1,06` |
| Tương quan | số thuần 2 lẻ | `0,52` |
| Giá trên lợi nhuận, giá trên sổ sách | số thuần | `16,27` |
| ROE, cổ tức | `%` | `20,7%` |
| Điểm sức khoẻ | `x/5` | `3,4/5` |
| Tiền | ngăn nghìn bằng **dấu chấm** | `1.000.000.000 ₫` |

**Dấu thập phân là PHẨY, ngăn nghìn là CHẤM.** Validator sẽ đánh lỗi
`DECIMAL_COMMA` nếu narrative dùng chấm thập phân — nhưng nó **không** kiểm được số do
frontend tự format, nên formatter phía client phải đúng ngay từ đầu (`Intl.NumberFormat`
với locale `vi-VN`).

### 5. Test cần port sang bản TS (19 file, các mốc số cần khoá)

| File test | Điều cần khoá lại |
|---|---|
| `config` | Đủ 12 hằng số + giá trị chính xác |
| `returns` | `dailyReturns([100,110,99])` → `[0.1, -0.1]`; `beta(2×mkt, mkt) = 2.0`; `correlation(a, a) = 1`; `correlation(a, -a) = -1`; `maxDrawdown([100,120,90,110]) = -0.25`; degenerate → `0.0` |
| `data_confidence` | 130 bar close 26.000 vol 1tr → `[true, null]`; 40 bar → `[false, "low_liquidity_short_history"]`; 130 bar close 5.000 vol 100 → `false`; `[]` → `false` |
| `layers_overview` | `cash_pct`, `weight` khớp tỷ lệ; `effective_n = 1/hhi` |
| `layers_allocation` | Khớp benchmark theo tên đã normalize; `sector_weights = {}` → mọi `benchmark`/`active` là `null` |
| `layers_performance` | `portfolio_return = 0.10`, `benchmark_return = 0.072`, `excess = 0.028`, `max_drawdown = -0.25` từ `navSeries`, `method = "simple_inception"` |
| `layers_risk` | Mã 30 bar bị `excluded`; `beta ≈ 2.0`; **một** mã tin cậy vẫn ra beta ≠ 0 và `correlation = []` |
| `layers_rest` | `attribution.pct` khớp `pnl/total`; `sector_benchmark` chạy khi ngành > 25% và có `sector_returns_6m`, `null` khi không có ngành trội; `worst_loser.ticker`; `losing_count` |
| `scoring` | `{excess 0.035, beta 1.25, eff_n 5.8, roe 0.18/pe 11.4, flag+3 lỗ, maxCorr 0.82}` → `{performance:4, risk:3, diversification:3, quality:4, discipline:2}`; `overall` → `3.2` / `3.4` |
| `insights` | Đảm bảo `healthy_focus` xuất hiện **đúng 1 lần** và không đá bay negative mạnh nhất; `hidden_corr.data.pair`/`.corr` |
| `analysis` | Shape đủ 12 khoá; `mode = "first"` khi chưa có snapshot; danh mục rỗng → `insufficient_data: true` |
| `validator` | Bản tốt → `[]`; action thiếu số → `ACTIONS_NUMBER`; `"khuyến nghị mua"` → `FORBIDDEN_RECO`; `"10.7%"` → `DECIMAL_COMMA`; `"534.000.000 ₫"` → **KHÔNG** flag |
| `prompts` | `SYSTEM_PROMPT` load được, dài > 200 ký tự; user prompt chứa `analysis_json` và số nguyên `534000000` (không tách nghìn) |
| `generator` | Persist + `attempts = 1`; retry thành công ở lần 2 → `attempts = 2`; `insufficient_data` → **không** gọi LLM; không có tài khoản ảo → `insufficient` + **không** gọi LLM (không 404) |
| `model` / `repository` | Persist round-trip; `get_for_date`, `get_latest`, `count_for_account` |
| `endpoint` | Không token → **401**; user premium (mock `generate_report`) → 200 + passthrough; user thường → **403** |
| `e2e` | Chạy hết pipeline với provider mock, lần 2 → `meta.cached === true`; `analysis` có đủ 12 khoá |

### 6. Chỗ chưa xác định

| Hạng mục | Trạng thái |
|---|---|
| `detail` chính xác của từng biến thể 401 (token hết hạn vs token sai vs user bị xoá) | **CHƯA XÁC ĐỊNH** — xem `app/services/auth.py::get_current_user_from_token` và chương `03-xac-thuc-phan-quyen.md` |
| Body chính xác của response 429 do slowapi sinh | **CHƯA XÁC ĐỊNH** — xem `slowapi._rate_limit_exceeded_handler` và chương `02-quy-uoc-api.md` |
| Thời gian chạy điển hình của `POST /analyze` trên production | **CHƯA ĐO.** Chỉ có chặn trên tính được: `3 × 120s` (LLM) + `2·N + 3` call provider tuần tự |
| Có index nào trên `symbols.symbol` phục vụ `_load_sectors_for` hay không | **CHƯA XÁC ĐỊNH** — xem `app/models/symbol.py` và chương CSDL |
| Alembic revision tạo bảng `portfolio_reports` | **CHƯA XÁC ĐỊNH trong chương này** — xem `alembic/versions/` (memory ghi `d7e8f9a0b1c2`, cần đối chiếu trước khi dùng) |
