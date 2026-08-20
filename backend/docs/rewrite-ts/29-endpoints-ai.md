# 29 — Endpoint AI: phân tích, mẫu hình, mô hình dự báo

Chương này đặc tả **12 endpoint** thuộc ba router AI của backend IQX: `AI Phân tích` (gọi LLM qua proxy OpenAI-compatible), `AI Mẫu hình` (đọc Google Sheets `CANDLE` / `CHART`) và `AI Mô hình dự báo` (đọc Google Sheets `Du_Bao`). Hợp đồng quan trọng nhất là **AI Insight v2** — briefing 6 lớp cho một mã cổ phiếu, trả về JSON đã được backend cắt thành `NarrativeFragment` để frontend render rich-text.

Mỗi lần gọi LLM đều **tốn tiền và tốn 5–120 giây**, nên toàn bộ chương này phải đọc kèm mục [Chiến lược cache](#chiến-lược-cache-hai-tầng): nhóm `analysis` cache tới hết phiên giao dịch, nhóm `bctc` cache 1 tuần, còn `GET /ai/bctc-dashboard/{symbol}` **không cache gì cả** (lỗi thiết kế cần vá khi viết lại).

Nguồn sự thật: bản cắt OpenAPI của nhóm AI (hình dạng) + source Python `app/api/v1/endpoints/ai_analysis.py`, `ai_patterns.py`, `ai_forecast.py`, `app/services/ai/*`, `app/services/bctc_dashboard/narrative*.py`, `app/services/bctc/ai_guard.py` (hành vi).

---

## Bảng tra nhanh

| # | METHOD | Path | Quyền | LLM? | Cache | Ghi chú 1 dòng |
|---|---|---|---|---|---|---|
| 1 | POST | `/api/v1/ai/dashboard/analyze` | Bearer + Premium | Có | Redis, tới 15:00 VN | 2–3 câu text tổng quan thị trường |
| 2 | POST | `/api/v1/ai/industry/analyze` | Bearer + Premium | Có | Redis, tới 15:00 VN | 8 dòng text cho 1 ngành ICB |
| 3 | POST | `/api/v1/ai/industry/analyze-batch` | Bearer + Premium | Có | Redis, dùng chung key với #2 | ≤20 ngành, lỗi từng phần, luôn HTTP 200 |
| 4 | POST | `/api/v1/ai/insight/analyze` | Bearer + Premium | Có | Redis, tới 15:00 VN | AI Insight v2 đầy đủ (L1–L5 + briefing) |
| 5 | GET | `/api/v1/ai/insight/{symbol}` | **Công khai** (không có guard trong source) | Có | Dùng chung key với #4 | Bọc `{data: ...}`; xem cảnh báo phân quyền |
| 6 | GET | `/api/v1/ai/bctc/{symbol}` | Bearer + Premium | Có | Redis, 7 ngày | AI Memo + ghi chú module BCTC, có guard chặn số bịa |
| 7 | GET | `/api/v1/ai/bctc-dashboard/{symbol}` | Bearer + Premium | Có (tối đa 4 lượt) | **KHÔNG cache** | Narrative kể chuyện dashboard BCTC, template A/B |
| 8 | GET | `/api/v1/ai/patterns/candles` | Bearer + Premium | Không | In-process 300s | Mẫu hình nến từ sheet `CANDLE` |
| 9 | GET | `/api/v1/ai/patterns/charts` | Bearer + Premium | Không | In-process 300s | Mẫu hình giá từ sheet `CHART` |
| 10 | GET | `/api/v1/ai/patterns/{kind}/symbols` | Bearer + Premium | Không | In-process 300s | Danh sách mã có mẫu hình |
| 11 | GET | `/api/v1/ai/forecast/ranking` | Bearer + Premium | Không | In-process 300s | Xếp hạng theo return kỳ vọng, sheet `Du_Bao` |
| 12 | GET | `/api/v1/ai/forecast/symbols/{symbol}` | Bearer + Premium | Không | In-process 300s | Dự báo 1 mã (không tách theo khung) |

Router prefix: `ai_analysis.py` → `/ai`, `ai_patterns.py` → `/ai/patterns`, `ai_forecast.py` → `/ai/forecast`; tất cả nằm dưới `/api/v1`.

---

## Kiểu dữ liệu dùng chung

### Envelope của nhóm "analysis"

~~~ts
/** Vỏ chung của #1, #2, #6 (và từng item thành công của #3). */
interface AnalysisEnvelope<TInput, TAnalysis> {
  type: "dashboard" | "industry" | "insight" | "bctc";
  input: TInput;
  analysis: TAnalysis;
  model: string;   // model NHÀ CUNG CẤP trả về (data.model), fallback = AI_PROXY_MODEL
  as_of: string;   // ISO-8601 UTC, snake_case (KHÔNG phải asOf)
  payload?: Record<string, unknown>; // chỉ khi include_payload = true
}
~~~

`as_of` là snake_case trong khi AI Insight v2 dùng `updatedAt` camelCase. **Giữ nguyên hai cách đặt tên** để frontend hiện tại không vỡ.

### NarrativeFragment — hợp đồng rich-text

Backend không trả HTML. LLM viết markup inline `[bull]…[/bull]`, backend cắt thành mảng fragment, frontend ghép lại và tự chọn style.

~~~ts
type FragmentType = "text" | "number" | "emphasis" | "highlight";
type FragmentVariant = "bull" | "bear" | "warn" | "info";

interface NarrativeFragment {
  type: FragmentType;
  content: string;
  /** CHỈ xuất hiện khi type === "emphasis" */
  variant?: FragmentVariant;
}
~~~

Bảng chuyển đổi tag → fragment (`app/services/ai/insight_fragments.py`):

| Tag LLM viết | Fragment sinh ra | Ý nghĩa hiển thị |
|---|---|---|
| `[bull]…[/bull]` | `{type:"emphasis", variant:"bull"}` | tín hiệu tích cực (xanh) |
| `[bear]…[/bear]` | `{type:"emphasis", variant:"bear"}` | tín hiệu tiêu cực (đỏ) |
| `[warn]…[/warn]` | `{type:"emphasis", variant:"warn"}` | cảnh báo (cam) |
| `[info]…[/info]` | `{type:"emphasis", variant:"info"}` | thông tin bổ sung (xanh nhạt) |
| `[num]…[/num]` | `{type:"number"}` | số liệu, render font mono |
| `[gold]…[/gold]` | `{type:"highlight"}` | nhấn mạnh đặc biệt (vàng saffron) |
| văn bản ngoài tag | `{type:"text"}` | text thường |

Quy tắc parse **phải port đúng từng chi tiết**:

1. Regex một tầng: `\[(bull|bear|warn|info|num|gold)\](.*?)\[/\1\]` — tag phải đóng đúng loại đã mở.
2. Tag lồng nhau KHÔNG được hỗ trợ: `[bull]Ngoại mua [num]1,2 triệu[/num] cp[/bull]` → chỉ sinh **một** fragment `emphasis/bull`, và nội dung bên trong bị **lột sạch** mọi tag còn dư bằng `\[/?(?:bull|bear|warn|info|num|gold)\]` → `content = "Ngoại mua 1,2 triệu cp"`.
3. Tag mở lẻ (không có tag đóng) → không match regex → rơi vào nhánh text, rồi vẫn bị lột tag. **Không bao giờ để chuỗi `[bull]` lọt ra UI dưới dạng literal.**
4. Fragment rỗng sau khi lột thì **bỏ hẳn** (không push `{type:"text", content:""}`).
5. `parse_fragments("")` → `[]` (mảng rỗng, không phải `null`).

### DiffBlock — dòng "So với phiên trước"

~~~ts
interface DiffBlock {
  text: NarrativeFragment[];
  hasChange: boolean;       // false nếu diff chứa "ổn định" HOẶC "lần đầu" (so sánh lowercase, substring)
  isFirstAnalysis: boolean; // true khi KHÔNG có bản ghi phiên trước trong DB
}
~~~

`hasChange` được suy ra từ **chuỗi diff của LLM**, không từ DB: nếu chuỗi (đã lowercase) chứa substring `"ổn định"` hoặc `"lần đầu"` thì `hasChange = false`, ngược lại `true`. `isFirstAnalysis` thì lấy từ DB (`prev === null`).

### AI Insight v2 — response đầy đủ

~~~ts
type LayerKey = "L1" | "L2" | "L3" | "L4" | "L5";
type StatusLevel = 1 | 2 | 3 | 4 | 5;
type BriefingVariant = "bull" | "warn" | "bear" | "neutral";
type Recommendation =
  | "Chờ điểm mua" | "Có thể mua thử" | "Quan sát thêm"
  | "Nên giảm bớt" | "Bán bớt";

interface LayerField {
  label: string;               // nhãn tiếng Việt, backend quyết định (không phải LLM)
  value: NarrativeFragment[];
}

interface L5NewsItem {
  title: string;
  tag: string;                 // "KQKD" | "Phát hành" | "Pháp lý" | "M&A" | "Cổ tức" | "Nhân sự" | "Vận hành" | "Khác" (LLM tự do, KHÔNG validate)
  subtitle?: string;           // chỉ tin trọng yếu và chỉ khi tac_dong_ngan không rỗng
}

interface LayerCard {
  layerNum: LayerKey;
  layerName: "Xu hướng" | "Thanh khoản" | "Dòng tiền" | "Nội bộ" | "Tin tức";
  statusLabel: string;         // nguyên văn LLM
  statusLevel: StatusLevel;    // map từ statusLabel; nhãn lạ → 3
  fields: LayerField[];
  diff: DiffBlock;
  news?: { material: L5NewsItem[]; filler: L5NewsItem[] }; // CHỈ có ở L5
}

interface StockHeader {
  symbol: string;
  sector: string;              // "" nếu thiếu
  indexGroup: string;          // "" nếu thiếu
  price: number;
  changePercent: number;       // %, làm tròn 2 chữ số; 0 nếu không tính được
  high: number;
  low: number;
  volume: string;              // ĐÃ format: "18.0M" | "350.0K" | "820"
  isLive: boolean;             // true khi price_board trả về ít nhất 1 dòng
}

interface Briefing {
  updatedAt: string;
  trend: string;               // "Tăng" | "Giảm" | "Đi ngang" (LLM, không validate)
  status: string;              // nhãn 5 bậc L1 (LLM, không validate)
  statusVariant: BriefingVariant;
  timeframe: string;           // ví dụ "trung hạn 1–2 tuần"
  narrative: NarrativeFragment[];
  diff: DiffBlock;
  observations: {
    liquidity: NarrativeFragment[];
    moneyFlow: NarrativeFragment[];
    insider: NarrativeFragment[];
    news: NarrativeFragment[];
    supportResistance: NarrativeFragment[];
  };
  watchLevels: WatchLevel[];   // pass-through nguyên văn từ LLM, KHÔNG validate
  recommendation: Recommendation; // ngoài 5 cụm từ → ép về "Quan sát thêm"
}

interface WatchLevel { tag: string; description: string }

interface AIInsightResponse {
  symbol: string;
  updatedAt: string;                  // ISO-8601 UTC, sinh lúc build response
  header: StockHeader;
  briefing: Briefing;
  layers: Record<LayerKey, LayerCard>; // đủ 5 key, kể cả khi LLM thiếu lớp
  rawInput: InsightRawInput;
  dataSummary: { model: string; as_of: string };
  payload?: Record<string, unknown>;   // chỉ khi include_payload = true (#4)
}
~~~

### InsightRawInput — dữ liệu thô cho biểu đồ

~~~ts
interface FlowRow {
  date: string | null;
  matchNetVolume: number;   // cổ phiếu (KHÔNG phải VND)
  dealNetVolume: number;
  totalNetVolume: number;
}

interface LiquidityRow {
  date: string | null;
  buyUnmatchedVolume: number;
  sellUnmatchedVolume: number;
  totalVolume: number;      // = buyTradeVolume + sellTradeVolume
  buyTradeVolume: number;
  sellTradeVolume: number;
  buyTradeCount: number;
  sellTradeCount: number;
}

interface InsightRawInput {
  trend: {
    realtime: {
      price: number | null; volume: number | null;
      high: number | null; low: number | null; ref: number | null;
    } | null;
    ohlcv: Array<{
      date: string | number | null;
      open: number | null; high: number | null;
      low: number | null; close: number | null; volume: number | null;
    }>;                                   // tối đa 30 phiên, thứ tự cũ → mới
    computed: { ma10: number; ma20: number; volMa10: number; volMa20: number; latestClose: number };
  };
  liquidity: {
    latest: LiquidityRow | null;
    /** TÊN GÂY NHẦM: là bình quân của ≤10 dòng history, KHÔNG phải 30 phiên;
     *  null khi history < 3 dòng. */
    avg30: { buyUnmatchedVolume: number; sellUnmatchedVolume: number; totalVolume: number } | null;
    history: LiquidityRow[];              // ≤10 phiên, MỚI NHẤT TRƯỚC
  };
  moneyFlow: { foreign: FlowRow[]; proprietary: FlowRow[] };
  insider: {
    transactions: Array<{
      action: string | null;
      shareRegistered: number;
      shareExecuted: number;
      startDate: string | null;
    }>;
  };
  news: {
    items: Array<{ title: string | null; sourceName: string | null; updatedAt: string | null }>;
    tickerScore: null;                    // LUÔN null — hardcode, chưa nối nguồn
  };
}
~~~

### Kiểu của nhóm mẫu hình / dự báo

~~~ts
type PatternKind = "candles" | "charts";
type PatternSignal = "bullish" | "bearish" | "neutral";

interface PatternItem {
  symbol: string;
  name: string;                 // tên mẫu hình tiếng Anh, nguyên văn từ sheet
  signal: PatternSignal;
  signalLabel: string | null;   // text gốc cột "TIN HIEU"
  state: string | null;         // candles: MUC DO (Cao/Trung bình/Thấp) — charts: TRANG THAI
  meaning: string | null;
  action: string | null;
}

interface ForecastItem {
  symbol: string;
  expectedReturn: number;       // PHÂN SỐ: 0.06 = +6%
  projectedPrice: number | null;
  upProbability: null;          // LUÔN null — sheet Du_Bao không có cột xác suất
  rank: number;                 // 1-based, chỉ có ở /forecast/ranking
}
~~~

---

## Nghiệp vụ nền

### Bảng phân quyền đầy đủ 12 endpoint

| # | Endpoint | Dependency trong source | Không token | Token nhưng chưa active | Token, active, KHÔNG premium | Admin |
|---|---|---|---|---|---|---|
| 1 | POST `/ai/dashboard/analyze` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 2 | POST `/ai/industry/analyze` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 3 | POST `/ai/industry/analyze-batch` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 4 | POST `/ai/insight/analyze` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 5 | GET `/ai/insight/{symbol}` | **KHÔNG có** | **200** | **200** | **200** | 200 |
| 6 | GET `/ai/bctc/{symbol}` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 7 | GET `/ai/bctc-dashboard/{symbol}` | `PremiumUser` + `DBSession` | 401 | 403 | **403** | Cho qua |
| 8 | GET `/ai/patterns/candles` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 9 | GET `/ai/patterns/charts` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 10 | GET `/ai/patterns/{kind}/symbols` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 11 | GET `/ai/forecast/ranking` | `PremiumUser` | 401 | 403 | **403** | Cho qua |
| 12 | GET `/ai/forecast/symbols/{symbol}` | `PremiumUser` | 401 | 403 | **403** | Cho qua |

**#5 thực sự công khai, không phải thiếu khai báo OpenAPI.** Chữ ký hàm trong `ai_analysis.py` là `async def get_insight_analyze(symbol: str, language: str = "vi")` — không có tham số user, không có `Depends` nào. OpenAPI không có `security` vì **đúng như code**. `tests/test_ai_endpoints_require_premium.py` cũng chỉ kiểm 403 cho `POST /ai/insight/analyze`, không kiểm GET.

Hệ quả cần báo cho product trước khi port: bất kỳ ai biết URL đều lấy được toàn bộ nội dung Premium của #4 (cùng payload, cùng cache key), và mỗi request miss cache là một lần **backend tự trả tiền LLM cho khách vô danh**. Khi viết lại: giữ nguyên hành vi nếu frontend công khai đang dùng, hoặc thêm guard — nhưng phải là **quyết định có chủ đích**, ghi rõ trong changelog, không được "vô tình" bịt.

Chi tiết guard (`app/api/deps.py`):

- Không có header `Authorization` → `UnauthorizedError` → **401** `{"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}` + header `WWW-Authenticate: Bearer`.
- Token hợp lệ nhưng `user.is_active === false` → **403** `{"detail":"Tài khoản chưa được kích hoạt","code":"FORBIDDEN"}`.
- Active nhưng không có subscription premium → **403** `{"detail":"Yêu cầu gói Premium đang hoạt động","code":"FORBIDDEN"}`.
- `role === "ADMIN"` **bỏ qua** kiểm tra subscription (`is_premium_active` trả `true` ngay).
- Thứ tự kiểm tra bắt buộc: xác thực token → active → premium. Không được đảo (một user chưa active mà có premium vẫn phải nhận "Tài khoản chưa được kích hoạt").

Body lỗi: exception nội bộ (`AppException`) trả `{detail, code}`; còn `HTTPException` thô do endpoint tự raise (422 / 502 ở chương này) trả **chỉ** `{detail}` — không có `code`.

### AI proxy client — `app/services/ai/proxy_client.py`

Mọi endpoint gọi LLM đều đi qua đúng một hàm `chat_completion({system_prompt, user_content, temperature = 0.2})`.

| Thành phần | Giá trị |
|---|---|
| URL | `${AI_PROXY_BASE_URL.replace(/\/$/, "")}/chat/completions` |
| Method | POST |
| Header | `Content-Type: application/json`, `Authorization: Bearer ${AI_PROXY_API_KEY}` |
| Body | `{ model: AI_PROXY_MODEL, messages: [{role:"system",content:system_prompt},{role:"user",content:user_content}], temperature }` |
| Timeout | `AI_PROXY_TIMEOUT_SECONDS`, default **120.0** giây (áp cho cả kết nối và đọc) |
| Retry | **KHÔNG có retry ở tầng HTTP.** Chỉ #7 retry ở tầng nghiệp vụ (tối đa 4 lượt gọi) |
| Kết quả | `[content, used_model]` với `content = data.choices[0].message.content`, `used_model = data.model ?? AI_PROXY_MODEL` |

Env mặc định: `AI_PROXY_BASE_URL = ""`, `AI_PROXY_MODEL = "deepseek-v4-flash"`, `AI_PROXY_API_KEY = ""`, `AI_PROXY_TIMEOUT_SECONDS = 120.0`. Ví dụ prod ghi trong `docs/ai/ai-analysis-endpoints.md`: `AI_PROXY_BASE_URL=http://160.22.123.174:20128/v1`, `AI_PROXY_MODEL=cx/gpt-5.5`.

Ánh xạ lỗi:

| Tình huống | Ném ra | detail nguyên văn | HTTP cuối cùng |
|---|---|---|---|
| Thiếu `AI_PROXY_BASE_URL` | `ValueError` | `AI proxy chưa được cấu hình. Hãy đặt AI_PROXY_BASE_URL trong biến môi trường.` | 422 |
| Thiếu `AI_PROXY_API_KEY` | `ValueError` | `AI proxy API key chưa được cấu hình. Hãy đặt AI_PROXY_API_KEY trong biến môi trường.` | 422 |
| Timeout | `AIProxyError` | `AI proxy timeout sau {timeout}s: {TênLớpLỗi}` | 502 |
| Không kết nối được | `AIProxyError` | `Không thể kết nối đến AI proxy: {TênLớpLỗi}` | 502 |
| HTTP 4xx/5xx từ proxy | `AIProxyError` | `AI proxy trả về HTTP {status}` | 502 |
| Lỗi HTTP khác | `AIProxyError` | `Lỗi HTTP khi gọi AI proxy: {TênLớpLỗi}` | 502 |
| Response thiếu `choices[0].message.content` | `AIProxyError` | `AI proxy trả về response không đúng format (thiếu choices[0].message.content)` | 502 |

**Bảo mật bắt buộc giữ:** không bao giờ log body response của proxy (nó có thể echo lại API key trong thông báo lỗi), và message của exception chỉ chứa tên class lỗi + status code. Test `test_api_key_not_in_exception_message` khẳng định API key không xuất hiện trong `str(exception)`.

### Prompt loader — `app/services/ai/prompt_loader.py`

Prompt là **file markdown trên đĩa**, không hardcode trong code, cache vĩnh viễn trong process (`lru_cache(maxsize=8)`).

| Loại | File |
|---|---|
| `dashboard` | `docs/ai/ai-dashboard.md` |
| `industry` | `docs/ai/ai-industry.md` |
| `insight` | `docs/ai/ai-insight.md` |
| `bctc` | `docs/ai/ai-bctc.md` |

Loại không nằm trong bảng → `ValueError` (`Loại prompt '{x}' không hợp lệ. Cho phép: bctc, dashboard, industry, insight`); file không tồn tại → `FileNotFoundError` (`Không tìm thấy file prompt: {path}. Hãy đảm bảo file tồn tại trong thư mục docs/ai/.`). Endpoint #7 dùng prompt riêng, hardcode trong `app/services/bctc_dashboard/narrative_prompt.py` (`SYSTEM_PROMPT`), không đi qua loader.

Khi viết lại: giữ prompt ở file text để sửa văn phong không cần build lại app, và **giữ cache vĩnh viễn** (prompt dài, đọc đĩa mỗi request là vô ích) — nhưng nhớ là muốn cập nhật prompt phải restart process.

### Chiến lược cache hai tầng

Gọi LLM tốn tiền nên có hai tầng cache Redis độc lập:

**Tầng 1 — payload (dữ liệu thô đưa cho LLM)**

| Payload | Key | TTL | Env |
|---|---|---|---|
| dashboard | `iqx:ai:payload:dashboard:{language}` | 60s | `REDIS_TTL_AI_DASHBOARD_SECONDS` |
| industry | `iqx:ai:payload:industry:{icb_code}:{language}` | 600s | `REDIS_TTL_AI_INDUSTRY_SECONDS` |
| bctc | `iqx:ai:payload:bctc:{SYMBOL}:{term_type}:{language}` | 600s | hardcode `600` |
| insight | **không cache** | — | — |

**Tầng 2 — kết quả phân tích (đã có text/JSON của LLM)**

| Loại | Key | TTL thực tế |
|---|---|---|
| dashboard | `iqx:ai:analysis:dashboard:all:{language}` | tới 15:00 giờ VN, tối thiểu 3600s |
| industry | `iqx:ai:analysis:industry:{icb_code}:{language}` | tới 15:00 giờ VN, tối thiểu 3600s |
| insight | `iqx:ai:analysis:insight:{SYMBOL}:{language}` | tới 15:00 giờ VN, tối thiểu 3600s |
| bctc | `iqx:ai:analysis:bctc:{SYMBOL}:{term_type}:{language}` | `604800` (7 ngày) |
| bctc-dashboard (#7) | **không có key** | — |

Công thức TTL "tới hết phiên" (`_ttl_until_end_of_session`): lấy `now` theo timezone `Asia/Ho_Chi_Minh`; mốc là `now` đặt về `15:00:00.000`; nếu `now >= 15:00` thì mốc cộng 1 ngày; `ttl = floor(mốc − now)`, rồi `max(ttl, 3600)`.

Đọc theo giờ thực tế: gọi lúc 09:30 → TTL ≈ 19.800s (hết phiên hôm nay); gọi lúc 15:30 → TTL ≈ 84.600s (tới 15:00 hôm sau); gọi lúc **14:30 → TTL tính ra 1.800s nhưng bị chặn dưới thành 3.600s**, tức bản phân tích sống lấn sang sau giờ đóng cửa. Cửa sổ 14:00–15:00 là chỗ duy nhất mức chặn dưới có tác dụng. Port đúng công thức, đừng "đơn giản hoá" thành TTL cố định.

**Cạm bẫy:** `REDIS_TTL_AI_ANALYSIS_SECONDS = 1800` có trong `config.py` và trong docstring của `analysis_service.py`, nhưng **không có dòng code nào đọc nó**. TTL thực tế là hai giá trị ở bảng trên. Đừng port cái env đó như thể nó có tác dụng.

**Điều kiện coi là cache HIT** (khác nhau theo loại, phải port đúng):

- dashboard / industry / bctc: chỉ HIT nếu object cache có key `"analysis"`.
- insight: chỉ HIT nếu object cache có key `"layers"` — nhờ vậy các bản cache v1 cũ (không có `layers`) tự động bị coi là MISS và sinh lại theo schema v2.
- Mọi lỗi Redis (down, timeout, JSON hỏng) đều bị **bắt và bỏ qua**: `_cache_get_analysis` trả `null`, `_cache_set_analysis` chỉ log warning. **Redis chết thì API vẫn chạy**, chỉ đắt hơn.

### AI Insight v2 — 6 lớp briefing

Prompt `docs/ai/ai-insight.md` bắt LLM trả **duy nhất một JSON** với 6 key `L1`…`L6`. Backend không lưu 6 lớp nguyên trạng cho client: `L1`–`L5` thành 5 thẻ `layers`, còn `L6` thành `briefing`.

| Lớp | Vai trò | Cửa sổ dữ liệu | Input chính |
|---|---|---|---|
| **L1** | Xu hướng, hỗ trợ/kháng cự, đà giá | 30 phiên OHLCV | `derived` (MA10/MA20/VolMA10/VolMA20/S1/R1) |
| **L2** | Thanh khoản & cung–cầu sổ lệnh | 10 phiên gần nhất + bình quân | `supply_demand`, `supply_demand_summary`, `price_depth` |
| **L3** | Dòng tiền lớn: khối ngoại + tự doanh | **10 phiên giao dịch gần nhất** | `foreign_trade`, `proprietary`, `free_float_shares` |
| **L4** | Giao dịch nội bộ | **10 phiên giao dịch gần nhất** (cluster xét 14 ngày) | `insider_deals` |
| **L5** | Tin tức doanh nghiệp | 10 phiên gần nhất | `news` (top 3 có full detail) + `news_list` |
| **L6** | Briefing tổng hợp | — | Output L1–L5 + JSON phiên trước |

**Cửa sổ 10 phiên cho L3/L4 được dựng bằng mốc thời gian của `supply_demand`, không phải "10 dòng đầu provider trả về"** — đây là bug đã sửa (ISSUE-013), phải port cẩn thận:

1. `trading_date_ref` = danh sách `trading_date` của **10 dòng đầu** `supply_demand` (Vietcap trả mới nhất trước, mỗi ngày giao dịch đúng một dòng).
2. Với `foreign_trade` và `proprietary`: index các dòng theo ngày (dòng **đầu tiên** của mỗi ngày thắng), rồi **lặp theo `trading_date_ref`**; ngày nào không có dữ liệu thì chèn dòng zero `{date, matchNetVolume:0, dealNetVolume:0, totalNetVolume:0}`. Nhờ vậy biểu đồ L3/L4 thẳng hàng theo phiên thật.
3. Nếu `supply_demand` rỗng/thiếu → fallback hành vi cũ: lấy 10 phần tử đầu như provider trả về, không zero-fill.
4. `insider_deals` **không** zero-fill (giao dịch nội bộ là sự kiện rời rạc): lọc theo khoảng `[min(trading_date_ref), max(trading_date_ref)]`, **cắt cả hai đầu và ngày của deal về 10 ký tự đầu (`YYYY-MM-DD`) trước khi so sánh chuỗi** — vì `displayDate1` có thể mang cả giờ (`"2026-08-17 09:30:00"`), so sánh nguyên chuỗi sẽ loại oan deal của phiên mới nhất.
5. Tên field ở các feed không nhất quán, mỗi ô đọc theo **danh sách key ưu tiên** (camelCase rồi snake_case rồi tên dài): ví dụ `matchNetVolume` thử lần lượt `matchNetVolume`, `match_net_volume`, `foreignNetVolumeMatched`, `foreign_net_volume_matched`, `netVolume`, `net_volume`; thiếu hết → `0`. Danh sách key của `proprietary` **khác** của `foreign` (dùng `totalMatchTradeNetVolume`… thay cho `foreignNetVolume*`).

Đơn vị: mọi số dòng tiền/khối lượng ở L2–L4 là **cổ phiếu**, không phải VND. Giá là VND/cổ phiếu. `expectedReturn` (#11, #12) là **phân số** (0.06 = +6%).

### Thang 5 bậc — `insight_levels.py`

`statusLevel` = số nguyên 1…5, map từ `statusLabel` LLM viết. **Nhãn không khớp bảng → 3 (trung tính), không báo lỗi.**

| Bậc | L1 (Xu hướng) | L2 (Thanh khoản) | L3 (Dòng tiền) | L4 (Nội bộ) | L5 (Tin tức) |
|---|---|---|---|---|---|
| 1 | Rất yếu | Rất yếu | Cảnh báo mạnh | Cảnh báo mạnh | Rất tiêu cực |
| 2 | Yếu | Yếu | Cảnh báo nhẹ | Cảnh báo nhẹ | Tiêu cực |
| 3 | Trung bình | Bình thường | Trung tính | Trung tính | Trung tính |
| 4 | Mạnh | Mạnh | Hỗ trợ nhẹ | Hỗ trợ nhẹ | Tích cực |
| 5 | Rất mạnh | Rất mạnh | Hỗ trợ mạnh | Hỗ trợ mạnh | Rất tích cực |

Cài đặt thực tế dùng **một bảng dùng chung cho L1 và L2** chứa cả `"Trung bình"` và `"Bình thường"` (đều = 3), và một bảng chung cho L3/L4. Lớp lạ (không thuộc L1–L5) → 3.

`statusVariant` của briefing (`briefing_variant(trend, status)`) — **thứ tự if bắt buộc**:

1. `trend` chứa `"Giảm"` → `"bear"` (thắng mọi thứ, kể cả status mạnh).
2. `trend` chứa `"Tăng"` **và** level ≥ 4 → `"bull"`.
3. `trend` chứa `"Đi ngang"` **và** level ≤ 2 → `"warn"`.
4. level ≤ 2 (các trend còn lại) → `"bear"`.
5. mặc định → `"neutral"`.

Level ở đây luôn tra bằng **bảng L1**, kể cả khi `status` là nhãn của lớp khác.

### L5: "Tin trọng yếu" vs "Tin phụ"

LLM tự phân loại tin thành `tin_material` (trọng yếu) và `tin_filler` (phụ) theo bảng tag trong prompt: KQKD / Phát hành / Pháp lý / M&A / Cổ tức luôn là Material; Nhân sự là Material chỉ khi bổ nhiệm–miễn nhiệm Chủ tịch/CEO/CFO; Vận hành là Material khi quy mô lớn (> 1000 tỷ, đối tác lớn); Khác là Filler. Không có tin thì trả `[]`.

Backend **xuất mỗi loại ra hai chỗ** (frontend dùng chỗ nào tuỳ view, phải giữ cả hai):

1. Trong `layers.L5.fields` dưới dạng **một chuỗi đã ghép** rồi mới parse fragment:
   - `"Tin trọng yếu"` ← các item nối bằng `"; "` theo mẫu `` `{tieu_de} [{tag}] — {tac_dong_ngan}` ``.
   - `"Tin phụ"` ← nối bằng `"; "` theo mẫu `` `{tieu_de} [{tag}]` ``.
   - Field chỉ xuất hiện khi mảng tương ứng **không rỗng**.
2. Trong `layers.L5.news` dưới dạng có cấu trúc: `{material: [{title, tag, subtitle?}], filler: [{title, tag}]}` — `subtitle` chỉ có khi `tac_dong_ngan` không rỗng.

Lưu ý cú pháp: `[{tag}]` trong chuỗi ghép **không** phải markup fragment (`KQKD` không nằm trong danh sách tag), nên nó đi qua parser như text thường và giữ đúng dấu ngoặc vuông.

### Thứ tự field trong mỗi thẻ lớp

`fields` là mảng **có thứ tự do backend quyết định**, chỉ push khi giá trị tương ứng của LLM truthy (rỗng/thiếu thì bỏ field, không push `null`):

| Lớp | Thứ tự field (label ← key JSON của LLM) |
|---|---|
| L1 | `Xu hướng` ← `xu_huong`, `Trạng thái` ← `statusLabel`, `Hỗ trợ` ← `ho_tro`, `Kháng cự` ← `khang_cu`, `Đà giá` ← `da_gia` |
| L2 | `Thanh khoản` ← `thanh_khoan`, `Cung–Cầu` ← `cung_cau`, `Tác động` ← `tac_dong` |
| L3 | `Khối ngoại` ← `khoi_ngoai`, `Tự doanh` ← `tu_doanh`, `Tác động` ← `statusLabel` |
| L4 | `Nội bộ` ← `noi_bo`, `Khối lượng tổng` ← `khoi_luong_tong`, `Tác động` ← `statusLabel` |
| L5 | `Tổng quan` ← `tong_quan`, `Tin trọng yếu`, `Tin phụ`, `Tác động` ← `tac_dong` |

Chú ý L3/L4 dùng nhãn `"Tác động"` cho `statusLabel` (khác L1 dùng nhãn `"Trạng thái"`). Dấu gạch trong `Cung–Cầu` là **en dash (U+2013)**, không phải hyphen.

### So sánh phiên trước — bảng `ai_insight_history`

~~~
ai_insight_history
  id            uuid PK
  symbol        varchar(10)  NOT NULL, index
  session_date  date         NOT NULL, index
  payload       jsonb        NOT NULL     -- (JSON trên SQLite khi test)
  created_at / updated_at    (TimestampMixin)
  UNIQUE (symbol, session_date)  -- uq_ai_insight_symbol_date
~~~

- **Đọc** (`load_prev_insight`): `WHERE symbol = :sym AND session_date < :today ORDER BY session_date DESC LIMIT 1` → trả `row.payload` hoặc `null`. Là "bản ghi gần nhất TRƯỚC hôm nay", nên nghỉ lễ dài vẫn so được với phiên cuối cùng có dữ liệu.
- **Ghi** (`save_insight`): upsert theo `(symbol, session_date = today)` — có thì gán lại `payload`, chưa có thì insert, rồi `commit`.
- **Nội dung lưu là `ai_json` THÔ của LLM** (đúng schema L1…L6 của prompt), **không** phải response v2 đã build. Lý do: phiên sau nhét lại nguyên khối này vào block `PHIÊN TRƯỚC:` để LLM đọc đúng schema nó từng viết. Nếu port sai chỗ này (lưu response v2), diff các phiên sau sẽ vô nghĩa.
- Block gửi cho LLM: `payload_json + "\n\nPHIÊN TRƯỚC:\n" + JSON.stringify(prev ?? {})`.
- `today` lấy theo **`date.today()` của process** (timezone hệ thống), không phải theo `Asia/Ho_Chi_Minh` tường minh. Container chạy UTC thì "hôm nay" đổi lúc 07:00 giờ VN. Cần chốt lại khi viết lại: nên fix cứng về giờ VN.

### `scoring.py` — CÓ code, KHÔNG được nối vào endpoint nào

`app/services/ai/scoring.py` chứa bộ chấm điểm Layer-6 (bảng điểm L1–L5, `compute_layer6`, `score_all_layers`) và có test riêng (`tests/test_ai_scoring.py`), **nhưng không endpoint hay service nào import nó** (kiểm bằng grep trên toàn `app/`). Response v2 dùng `insight_levels.status_level` (thang 1–5) chứ không dùng điểm số này. Khi viết lại: **không** đưa `totalPower` / `reversalProbability` / `confidence` vào response — hiện tại API không trả các field đó.

Công thức để tham khảo (nếu sau này bật lại):

- Bảng điểm: L1 `Tăng + Mạnh` = 1.0 … `Giảm + Mạnh` = −1.0; L2 từ +0.8 (`Cơ hội vào/ra thuận lợi`) đến −0.8 (`Kẹt lệnh`); L3 ±0.7; L4 ±0.4; L5 từ +0.5 (`Hỗ trợ tâm lý`) đến −0.5 (`Gây áp lực`), riêng `Trung tính` của L5 = **+0.2** (không phải 0).
- `totalPower = (s1+s2+s3+s4+s5) / 6.8 * 100`, làm tròn 1 chữ số.
- `reversalProbability = (|s1|/1.0 + |s2+s3+s4+s5|/2.4) / 2 * 100`, kẹp `[0, 100]`.
- `confidence = 100 − reversalProbability`.
- Không rút được status → `("Trung tính", điểm Trung tính của bảng)` và log warning.

### Rate limit

Toàn app dùng `slowapi` với `default_limits = [RATE_LIMIT_DEFAULT]` = **60 request/phút mỗi IP**, key theo địa chỉ IP remote, storage `memory://`, và **tắt hoàn toàn khi `APP_ENV ∈ {"testing","test"}`**. Không endpoint AI nào khai báo limit riêng. Vượt hạn mức → 429 do handler của slowapi (`RateLimitExceeded`).

Khuyến nghị khi viết lại: 60/phút là quá hào phóng cho endpoint gọi LLM (mỗi request MISS cache có thể tốn tiền và 120 giây). Nên đặt limit riêng chặt hơn cho nhóm `analyze`, và storage dùng Redis để limit đúng khi scale nhiều instance.

### Middleware chung

`RequestIDMiddleware` (ngoài cùng) đọc header `X-Request-ID` của client hoặc sinh UUID4, gắn vào `request.state.request_id` và **echo lại trong header response của mọi request**, kể cả lỗi. Mọi lệnh `curl` dưới đây đều gửi header này để trace được log.

---

## Nhóm 1 — AI Phân tích (gọi LLM)

### POST /api/v1/ai/dashboard/analyze

> **Phân tích AI tổng quan thị trường** — sinh 2–3 câu mô tả trạng thái thị trường, chất lượng dòng tiền và nhóm ngành nổi bật cho ô "AI phân tích" trên dashboard.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | Redis `iqx:ai:analysis:dashboard:all:{language}`, TTL tới 15:00 giờ VN (min 3600s); payload `iqx:ai:payload:dashboard:{language}` TTL 60s |
| **Nguồn dữ liệu** | 10 provider Vietcap song song: market-index, liquidity (`ALL`/`ONE_MINUTE`), breadth (`EMA50`/`HSX,HNX,UPCOM`/`Y1`), sectors-allocation, index-impact, foreign, foreign-top, proprietary, proprietary-top + tin `business` (10 bài) → LLM |
| **Side-effect** | Ghi 2 key Redis; **tốn tiền LLM** khi MISS. Không ghi DB, không gửi email/Telegram |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface DashboardAnalyzeRequest {
  language?: string;         // default "vi"; KHÔNG được validate (mọi chuỗi đều nhận)
  include_payload?: boolean; // default false
}
~~~

~~~json
{ "language": "vi", "include_payload": false }
~~~

**Response 200**

~~~ts
type DashboardAnalyzeResponse = AnalysisEnvelope<{ language: string }, string>;
~~~

~~~json
{
  "type": "dashboard",
  "input": { "language": "vi" },
  "analysis": "Thị trường giữ trạng thái tích cực với VN-Index tăng 0,58% lên 1.412,3 điểm và thanh khoản HOSE đạt 21.400 tỷ đồng. Dòng tiền tập trung ở ngân hàng và bất động sản khu công nghiệp, trong đó VCB và HPG dẫn dắt điểm số. Khối ngoại bán ròng 385 tỷ đồng nhưng dòng tiền nội vẫn chi phối vận động chung.",
  "model": "cx/gpt-5.5",
  "as_of": "2026-08-17T08:12:44.918273+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/hỏng Bearer token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User chưa active | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | Không có Premium đang hoạt động | `Yêu cầu gói Premium đang hoạt động` |
| 422 | — | Chưa cấu hình AI proxy (`ValueError`) | `AI proxy chưa được cấu hình. Hãy đặt AI_PROXY_BASE_URL trong biến môi trường.` |
| 422 | — | Body sai kiểu | mảng `ValidationError` của FastAPI |
| 502 | — | Mọi `AIProxyError` (timeout / HTTP / format) | ví dụ `AI proxy timeout sau 120.0s: ReadTimeout` |

**Fallback / suy giảm**

- **Một nguồn dữ liệu lỗi**: `_safe_fetch` bắt exception, log warning, gán `payload[label] = null` — payload vẫn build, LLM vẫn được gọi với phần dữ liệu còn lại. Không có ngưỡng tối thiểu số nguồn: **kể cả 10/10 nguồn đều null vẫn gọi LLM** (test `test_dashboard_one_source_fails_others_succeed`).
- **Redis chết**: cache GET/SET đều bị bắt lặng lẽ → luôn MISS → gọi LLM mỗi request.
- **Ngoài giờ giao dịch**: không có xử lý riêng. Payload là snapshot hiện tại; TTL cache đẩy tới 15:00 phiên kế tiếp nên buổi tối người dùng đọc lại đúng bản phân tích cuối phiên.
- **LLM lỗi**: KHÔNG có fallback nội dung — trả 502, tuyệt đối không sinh text thay thế.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/ai/dashboard/analyze' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-dash-4f1a-9c3e-20260817a001' \
  -d '{"language":"vi","include_payload":false}'
~~~

**Ghi chú khi viết lại**

- Thứ tự bắt buộc: guard premium → đọc cache analysis → (MISS) load prompt → build payload → gọi LLM → ghi cache → gắn payload nếu `include_payload`.
- `payload` **không bao giờ** được ghi vào cache analysis (giữ cache nhỏ). Khi cache HIT mà client xin `include_payload = true`, backend **build lại payload** (thường trúng payload cache 60s) rồi gắn vào object cache trước khi trả.
- `language` không validate: `"vi"`, `"en"`, `"VI"`, `"xyz"` đều thành 3 key cache khác nhau. Khi viết lại nên whitelist `"vi" | "en"` và lowercase trước khi ghép key, nhưng phải giữ echo `input.language` nguyên văn nếu frontend đang hiển thị.
- `analysis` là **plain text**, không markdown, không JSON, không gạch đầu dòng — prompt yêu cầu đúng 1 đoạn 2–3 câu. Không parse gì thêm ở backend.
- 10 nguồn phải chạy **song song** (test khẳng định span < 50ms trong môi trường mock); chạy tuần tự sẽ đội thời gian lên nhiều lần.

---

### POST /api/v1/ai/industry/analyze

> **Phân tích AI theo ngành ICB** — trả đúng 8 dòng có nhãn cố định cho một mã ngành.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | Redis `iqx:ai:analysis:industry:{icb_code}:{language}`, TTL tới 15:00 giờ VN; payload `iqx:ai:payload:industry:{icb_code}:{language}` TTL 600s |
| **Nguồn dữ liệu** | 9 nguồn song song: sector-detail 3 khung (`ONE_DAY`/`ONE_WEEK`/`ONE_MONTH`) cho `icb_code`, sectors-allocation, sector-information (`icb_level = 2`), sector-ranking (`icb_level=2, adtv=3, value=3`), stock-strength (`ALL`), market-index (`VNINDEX`), foreign-top → LLM |
| **Side-effect** | Ghi 2 key Redis; tốn tiền LLM khi MISS |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface IndustryAnalyzeRequest {
  icb_code: number;          // bắt buộc, integer >= 1
  language?: string;         // default "vi"
  include_payload?: boolean; // default false
}
~~~

~~~json
{ "icb_code": 8300, "language": "vi", "include_payload": false }
~~~

**Response 200**

~~~ts
type IndustryAnalyzeResponse = AnalysisEnvelope<
  { icb_code: number; language: string },
  string   // 8 dòng, phân cách bằng "\n"
>;
~~~

~~~json
{
  "type": "industry",
  "input": { "icb_code": 8300, "language": "vi" },
  "analysis": "Trạng thái: Hút tiền\nHiệu suất: +1,4% trong phiên hôm nay\nDòng tiền: giá trị giao dịch 6.820 tỷ đồng, cao hơn bình quân 20 phiên 18%\nĐộ rộng: 24 mã tăng / 6 mã giảm\nDẫn dắt: VCB, CTG, MBB\nĐiểm yếu: nhóm ngân hàng quy mô nhỏ chưa có dòng tiền\nCơ hội: vùng hỗ trợ MA20 của VCB còn giữ\nRủi ro: khối ngoại bán ròng 3 phiên liên tiếp ở CTG",
  "model": "cx/gpt-5.5",
  "as_of": "2026-08-17T08:20:03.114265+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | `Tài khoản chưa được kích hoạt` / `Yêu cầu gói Premium đang hoạt động` |
| 422 | — | `icb_code` thiếu hoặc < 1 | mảng `ValidationError` |
| 422 | — | AI proxy chưa cấu hình | như bảng proxy ở trên |
| 502 | — | `AIProxyError` | ví dụ `AI proxy trả về HTTP 429` |

**Fallback / suy giảm**

- ICB code không tồn tại: **không có kiểm tra**. Các nguồn trả rỗng/null, payload vẫn build (`sector_detail_1d = null`), LLM vẫn được gọi và sẽ viết 8 dòng dựa trên dữ liệu rỗng. Không có 404. Khi viết lại nên chặn trước bằng danh mục ICB.
- Nguồn lỗi lẻ → field null, không crash (giống #1).
- LLM trả sai định dạng (không đủ 8 dòng): backend **không validate** — trả nguyên văn cho client.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/ai/industry/analyze' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-indu-4f1a-9c3e-20260817a002' \
  -d '{"icb_code":8300,"language":"vi","include_payload":false}'
~~~

**Ghi chú khi viết lại**

- Sau khi build payload có bước `_enrich_industry_summary(payload)` suy ra các field tóm tắt từ `sector_detail_1d` để LLM đỡ phải tự tính — giữ bước này (chi tiết công thức xem `app/services/ai/payloads.py` dòng ~343).
- Cache key của endpoint này **dùng chung với #3**: một lần gọi batch làm nóng cache cho endpoint đơn và ngược lại. Đây là hành vi có chủ đích, đừng đổi format key.
- `icb_code` là số trong key cache (`8300`), không zero-pad, không đổi sang string ngành.
- Nhãn ở dòng "Trạng thái" chỉ được chọn trong 6 giá trị: `Dẫn sóng`, `Hút tiền`, `Tích lũy`, `Phân phối`, `Hồi kỹ thuật`, `Suy yếu` (ràng buộc mềm trong prompt, backend không ép).

---

### POST /api/v1/ai/industry/analyze-batch

> **Phân tích AI nhiều ngành trong một request** — tối đa 20 mã ngành, một ngành lỗi không làm hỏng các ngành còn lại.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) — lưu ý 1 request có thể thành 20 lần gọi LLM |
| **Cache** | Đọc/ghi **cùng key** với #2: `iqx:ai:analysis:industry:{icb_code}:{language}`; payload `iqx:ai:payload:industry:{code}:{language}` TTL 600s |
| **Nguồn dữ liệu** | `build_industry_payload_batch` — 6 nguồn dùng chung (sectors-allocation, sector-information, sector-ranking, stock-strength, market-index, foreign-top) fetch **một lần** rồi chia sẻ; riêng sector-detail fetch 3 khung × mỗi ngành |
| **Side-effect** | Ghi N key Redis; tốn tiền LLM cho từng ngành MISS |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface IndustryBatchAnalyzeRequest {
  icb_codes: number[];       // bắt buộc, 1..20 phần tử (minItems 1, maxItems 20)
  language?: string;         // default "vi"
  include_payload?: boolean; // default false
}
~~~

~~~json
{ "icb_codes": [8300, 9500, 8600], "language": "vi", "include_payload": false }
~~~

**Response 200**

~~~ts
interface IndustryBatchItemOk {
  icb_code: number;
  type: "industry";
  input: { icb_code: number; language: string };
  analysis: string;
  model: string;
  as_of: string;
  payload?: Record<string, unknown>; // CHỈ item vừa sinh mới, xem ghi chú
}
interface IndustryBatchItemError { icb_code: number; error: string }

interface IndustryBatchAnalyzeResponse {
  results: Array<IndustryBatchItemOk | IndustryBatchItemError>;
}
~~~

~~~json
{
  "results": [
    {
      "icb_code": 8300,
      "type": "industry",
      "input": { "icb_code": 8300, "language": "vi" },
      "analysis": "Trạng thái: Hút tiền\nHiệu suất: +1,4% trong phiên hôm nay\nDòng tiền: 6.820 tỷ đồng\nĐộ rộng: 24 tăng / 6 giảm\nDẫn dắt: VCB, CTG, MBB\nĐiểm yếu: nhóm quy mô nhỏ chưa có dòng tiền\nCơ hội: VCB giữ MA20\nRủi ro: khối ngoại bán ròng ở CTG",
      "model": "cx/gpt-5.5",
      "as_of": "2026-08-17T08:25:10.552019+00:00"
    },
    { "icb_code": 9500, "error": "AI proxy timeout sau 120.0s: ReadTimeout" },
    {
      "icb_code": 8600,
      "type": "industry",
      "input": { "icb_code": 8600, "language": "vi" },
      "analysis": "Trạng thái: Tích lũy\nHiệu suất: +0,2% trong phiên hôm nay\nDòng tiền: 1.240 tỷ đồng\nĐộ rộng: 11 tăng / 9 giảm\nDẫn dắt: HPG, HSG\nĐiểm yếu: thanh khoản dưới bình quân 20 phiên\nCơ hội: HPG bám sát vùng kháng cự 32.500 đồng\nRủi ro: giá thép HRC khu vực giảm",
      "model": "cx/gpt-5.5",
      "as_of": "2026-08-17T08:25:11.004881+00:00"
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | như #2 |
| 422 | — | `icb_codes` rỗng (`[]`) | mảng `ValidationError` (`too_short`) |
| 422 | — | `icb_codes` > 20 phần tử | mảng `ValidationError` (`too_long`) |
| 422 | — | `ValueError` bật ra ngoài (ví dụ prompt file thiếu) | `str(exc)` |
| — | — | **Không có 502**: lỗi LLM của từng ngành thành field `error` trong `results`, HTTP vẫn 200 | — |

**Fallback / suy giảm**

- Lỗi **từng phần**: `_analyze_one` bắt `Exception` rộng → item trở thành `{icb_code, error: "<message>"}`. Nếu chính coroutine chết bất thường (`asyncio.gather(..., return_exceptions=True)` trả exception) → `{icb_code, error: "<str(exception)>"}`.
- Ngành không có trong map kết quả (không xảy ra trong thực tế) → `{icb_code, error: "unknown"}`.
- Cache HIT một phần: chỉ những code MISS mới đi qua `build_industry_payload_batch` + LLM; code HIT lấy nguyên object cache và **được gán thêm `icb_code`** (bản cache từ #2 vốn không có field này).

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/ai/industry/analyze-batch' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-btch-4f1a-9c3e-20260817a003' \
  -d '{"icb_codes":[8300,9500,8600],"language":"vi","include_payload":false}'
~~~

**Ghi chú khi viết lại**

- **Dedupe giữ nguyên thứ tự xuất hiện đầu tiên**: `[8300, 9500, 8300]` → `results` chỉ có **2** phần tử (test `test_batch_deduplicates_codes` khẳng định `len == 1` với input `[8300, 8300]`). Output xếp theo thứ tự danh sách đã dedupe, **không** theo thứ tự hoàn thành của LLM.
- Các LLM call chạy **đồng thời** qua `asyncio.gather` — 20 ngành MISS là 20 request song song tới proxy. Cần cân nhắc semaphore khi viết lại (bản Python không có).
- **Bất đối xứng `include_payload`**: item vừa sinh mới có `payload` gắn **sau khi** đã ghi cache (nên payload không lọt vào Redis); item lấy từ cache **KHÔNG** có `payload` — khác với #2 (cache HIT vẫn build lại payload). Giữ nguyên hay sửa là quyết định của bạn, nhưng phải biết là nó khác.
- Item thành công có **cả** `icb_code` (top-level) **và** `input.icb_code` — trùng lặp có chủ đích, frontend đang đọc `icb_code`.
- Prompt load **một lần** cho cả batch (`load_prompt("industry")`), không load lại mỗi ngành.
- Handler bọc toàn bộ thân hàm trong `try` chỉ bắt `ValueError` → 422. Mọi exception khác (ví dụ Redis lỗi kiểu lạ ngoài các nhánh đã bắt) sẽ thành 500 chung của app.

---

### POST /api/v1/ai/insight/analyze

> **AI Insight v2 cho một mã cổ phiếu** — briefing 6 lớp (xu hướng, thanh khoản, dòng tiền, nội bộ, tin tức, tổng hợp) đã cắt thành fragment rich-text.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | Redis `iqx:ai:analysis:insight:{SYMBOL}:{language}`, TTL tới 15:00 giờ VN; HIT chỉ khi object có key `layers`. Payload **không** cache |
| **Nguồn dữ liệu** | 13 nguồn song song (Vietcap + KBS): ohlcv 1D (cắt 30 bar cuối), price-board, intraday (100), price-depth, trading-history (30), trading-summary, foreign-trade (30), proprietary (30), proprietary-summary, insider-deals (30), tin theo ticker (`page_size = 20`), company-overview (KBS), company-details → LLM |
| **Side-effect** | Ghi Redis; **UPSERT bảng `ai_insight_history`** (`symbol`, `session_date = hôm nay`, `payload = ai_json` thô) + commit; tốn tiền LLM khi MISS |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface InsightAnalyzeRequest {
  symbol: string;            // bắt buộc, 1..10 ký tự, pattern ^[A-Za-z0-9]+$ (KHÔNG cho dấu chấm/gạch)
  language?: string;         // default "vi"
  include_payload?: boolean; // default false
}
~~~

~~~json
{ "symbol": "FPT", "language": "vi", "include_payload": false }
~~~

**Response 200** — `AIInsightResponse` (xem [Kiểu dữ liệu dùng chung](#ai-insight-v2--response-đầy-đủ)). Endpoint này trả object **ở tầng gốc**, KHÔNG bọc `{data: ...}`.

~~~json
{
  "symbol": "FPT",
  "updatedAt": "2026-08-17T08:31:07.442018+00:00",
  "header": {
    "symbol": "FPT",
    "sector": "Công nghệ thông tin",
    "indexGroup": "VN30",
    "price": 128500,
    "changePercent": 1.18,
    "high": 129200,
    "low": 126800,
    "volume": "4.2M",
    "isLive": true
  },
  "briefing": {
    "updatedAt": "2026-08-17T08:31:07.442018+00:00",
    "trend": "Tăng",
    "status": "Mạnh",
    "statusVariant": "bull",
    "timeframe": "trung hạn 1–2 tuần",
    "narrative": [
      { "type": "text", "content": "FPT giữ nhịp tăng với giá đóng cửa " },
      { "type": "number", "content": "128.500 đồng" },
      { "type": "text", "content": " nằm trên MA20, " },
      { "type": "emphasis", "content": "khối ngoại mua ròng 4 phiên liên tiếp", "variant": "bull" },
      { "type": "text", "content": ". Thanh khoản cao hơn bình quân 10 phiên nên lệnh vào/ra thuận lợi." }
    ],
    "diff": {
      "text": [
        { "type": "text", "content": "Dòng tiền chuyển từ Trung tính sang " },
        { "type": "emphasis", "content": "Hỗ trợ nhẹ", "variant": "bull" },
        { "type": "text", "content": " sau phiên khối ngoại mua ròng " },
        { "type": "number", "content": "620.000" },
        { "type": "text", "content": " cổ phiếu." }
      ],
      "hasChange": true,
      "isFirstAnalysis": false
    },
    "observations": {
      "liquidity": [{ "type": "text", "content": "Khối lượng khớp cao hơn bình quân 10 phiên 22%." }],
      "moneyFlow": [{ "type": "emphasis", "content": "Khối ngoại mua ròng 620.000 cổ phiếu", "variant": "bull" }],
      "insider": [{ "type": "text", "content": "Không có giao dịch nội bộ mới trong 10 phiên." }],
      "news": [{ "type": "text", "content": "Tin ký hợp đồng chuyển đổi số hỗ trợ tâm lý về triển vọng doanh thu." }],
      "supportResistance": [{ "type": "text", "content": "Hỗ trợ 124.000 đồng – kháng cự 131.500 đồng." }]
    },
    "watchLevels": [
      { "tag": "Hỗ trợ 124.000", "description": "nếu mất mốc này thì nhịp tăng ngắn hạn bị phá" },
      { "tag": "Kháng cự 131.500", "description": "nếu vượt kèm thanh khoản thì mở dư địa mới" }
    ],
    "recommendation": "Có thể mua thử"
  },
  "layers": {
    "L1": {
      "layerNum": "L1",
      "layerName": "Xu hướng",
      "statusLabel": "Mạnh",
      "statusLevel": 4,
      "fields": [
        { "label": "Xu hướng", "value": [{ "type": "text", "content": "Tăng" }] },
        { "label": "Trạng thái", "value": [{ "type": "text", "content": "Mạnh" }] },
        { "label": "Hỗ trợ", "value": [{ "type": "text", "content": "124.000" }] },
        { "label": "Kháng cự", "value": [{ "type": "text", "content": "131.500" }] },
        { "label": "Đà giá", "value": [{ "type": "text", "content": "Đang nhanh dần" }] }
      ],
      "diff": {
        "text": [{ "type": "text", "content": "Giá vượt kháng cự 127.000 đồng của phiên trước." }],
        "hasChange": true,
        "isFirstAnalysis": false
      }
    },
    "L2": {
      "layerNum": "L2",
      "layerName": "Thanh khoản",
      "statusLabel": "Mạnh",
      "statusLevel": 4,
      "fields": [
        { "label": "Thanh khoản", "value": [{ "type": "text", "content": "Mạnh" }] },
        { "label": "Cung–Cầu", "value": [{ "type": "text", "content": "Dư mua áp đảo dư bán trong phiên chiều" }] },
        { "label": "Tác động", "value": [{ "type": "text", "content": "Vào/ra lệnh thuận lợi ở khối lượng lớn" }] }
      ],
      "diff": { "text": [{ "type": "text", "content": "Tín hiệu ổn định so với phiên trước" }], "hasChange": false, "isFirstAnalysis": false }
    },
    "L3": {
      "layerNum": "L3",
      "layerName": "Dòng tiền",
      "statusLabel": "Hỗ trợ nhẹ",
      "statusLevel": 4,
      "fields": [
        { "label": "Khối ngoại", "value": [{ "type": "text", "content": "Mua ròng nhẹ 4 phiên liên tiếp, tổng 1,8 triệu cổ phiếu" }] },
        { "label": "Tự doanh", "value": [{ "type": "text", "content": "Bán ròng nhỏ, không đối trọng" }] },
        { "label": "Tác động", "value": [{ "type": "text", "content": "Hỗ trợ nhẹ" }] }
      ],
      "diff": { "text": [{ "type": "text", "content": "Chuỗi mua ròng bước sang phiên thứ 4." }], "hasChange": true, "isFirstAnalysis": false }
    },
    "L4": {
      "layerNum": "L4",
      "layerName": "Nội bộ",
      "statusLabel": "Trung tính",
      "statusLevel": 3,
      "fields": [
        { "label": "Nội bộ", "value": [{ "type": "text", "content": "Không có giao dịch mới trong 10 phiên" }] },
        { "label": "Khối lượng tổng", "value": [{ "type": "text", "content": "Không đáng kể" }] },
        { "label": "Tác động", "value": [{ "type": "text", "content": "Trung tính" }] }
      ],
      "diff": { "text": [{ "type": "text", "content": "Tín hiệu ổn định so với phiên trước" }], "hasChange": false, "isFirstAnalysis": false }
    },
    "L5": {
      "layerNum": "L5",
      "layerName": "Tin tức",
      "statusLabel": "Tích cực",
      "statusLevel": 4,
      "fields": [
        { "label": "Tổng quan", "value": [{ "type": "text", "content": "Tích cực" }] },
        { "label": "Tin trọng yếu", "value": [{ "type": "text", "content": "FPT ký hợp đồng chuyển đổi số 1.200 tỷ đồng [Vận hành] — củng cố triển vọng doanh thu khối công nghệ" }] },
        { "label": "Tin phụ", "value": [{ "type": "text", "content": "FPT khai trương trung tâm dữ liệu tại Đà Nẵng [Khác]" }] },
        { "label": "Tác động", "value": [{ "type": "text", "content": "Hỗ trợ tâm lý về triển vọng doanh thu dịch vụ nước ngoài" }] }
      ],
      "diff": { "text": [{ "type": "text", "content": "Có tin trọng yếu mới về hợp đồng chuyển đổi số." }], "hasChange": true, "isFirstAnalysis": false },
      "news": {
        "material": [
          { "title": "FPT ký hợp đồng chuyển đổi số 1.200 tỷ đồng", "tag": "Vận hành", "subtitle": "củng cố triển vọng doanh thu khối công nghệ" }
        ],
        "filler": [
          { "title": "FPT khai trương trung tâm dữ liệu tại Đà Nẵng", "tag": "Khác" }
        ]
      }
    }
  },
  "rawInput": {
    "trend": {
      "realtime": { "price": 128500, "volume": 4210300, "high": 129200, "low": 126800, "ref": 127000 },
      "ohlcv": [
        { "date": "2026-08-14", "open": 126500, "high": 127400, "low": 125900, "close": 127000, "volume": 3480200 },
        { "date": "2026-08-17", "open": 127200, "high": 129200, "low": 126800, "close": 128500, "volume": 4210300 }
      ],
      "computed": { "ma10": 125380.5, "ma20": 122910.25, "volMa10": 3620000, "volMa20": 3410000, "latestClose": 128500 }
    },
    "liquidity": {
      "latest": {
        "date": "2026-08-17",
        "buyUnmatchedVolume": 512000, "sellUnmatchedVolume": 318000,
        "totalVolume": 4210300, "buyTradeVolume": 2280500, "sellTradeVolume": 1929800,
        "buyTradeCount": 8120, "sellTradeCount": 7440
      },
      "avg30": { "buyUnmatchedVolume": 421300, "sellUnmatchedVolume": 366900, "totalVolume": 3684200 },
      "history": []
    },
    "moneyFlow": {
      "foreign": [{ "date": "2026-08-17", "matchNetVolume": 620000, "dealNetVolume": 0, "totalNetVolume": 620000 }],
      "proprietary": [{ "date": "2026-08-17", "matchNetVolume": -48000, "dealNetVolume": 0, "totalNetVolume": -48000 }]
    },
    "insider": { "transactions": [] },
    "news": {
      "items": [
        { "title": "FPT ký hợp đồng chuyển đổi số 1.200 tỷ đồng", "sourceName": "CafeF", "updatedAt": "2026-08-17T02:15:00Z" }
      ],
      "tickerScore": null
    }
  },
  "dataSummary": { "model": "cx/gpt-5.5", "as_of": "2026-08-17T08:31:07.442018+00:00" }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | như #2 |
| 422 | — | `symbol` rỗng, > 10 ký tự, hoặc có ký tự ngoài `[A-Za-z0-9]` | mảng `ValidationError` (`string_pattern_mismatch`) |
| 422 | — | AI proxy chưa cấu hình | như bảng proxy |
| 502 | — | `AIProxyError` | ví dụ `AI proxy timeout sau 120.0s: ReadTimeout` |

**Fallback / suy giảm**

- **LLM trả không phải JSON**: backend gỡ code fence (`^```json?` và `` ```$ ``), thử `JSON.parse`; thất bại → dựng **fallback v2 tối thiểu**: L1–L4 có `{...: "—", statusLabel: "—", diff: "lần đầu"}`, `L5.tong_quan` và `L6.narrative` = **500 ký tự đầu của text thô LLM**, `L6.recommendation = "Quan sát thêm"`, `watchLevels: []`, `observations: {}`. Log warning. **Vẫn HTTP 200.**
  - Đây **KHÔNG phải fail-closed**: nội dung thô của LLM (có thể lan man, có thể sai) lọt tới UI. Nếu tiêu chí của bạn là "không hiện nội dung bịa", hãy đổi thành 502 hoặc thành thẻ "chưa có phân tích" — nhưng phải ghi rõ vì hành vi hiện tại là pass-through.
  - `statusLabel = "—"` → `statusLevel = 3`; `diff = "lần đầu"` → `hasChange = false`.
- **LLM thiếu một lớp** (ví dụ không có `L4`): `layers.L4` vẫn được tạo với `statusLabel: ""`, `statusLevel: 3`, `fields: []`, `diff.text: []`.
- **`recommendation` ngoài 5 cụm từ** → ép về `"Quan sát thêm"`.
- **Nguồn dữ liệu lỗi**: mỗi nguồn bọc `_safe_fetch` → `null`; `price_board` null → `header.isLive = false`, `price/high/low = 0`, `changePercent = 0`; `ohlcv_30` < 5 bar → `derived = {"note": "Thiếu dữ liệu OHLCV để tính chỉ báo kỹ thuật"}` và `rawInput.trend.computed` toàn `0`.
- **`supply_demand` rỗng** → `rawInput.liquidity.avg30 = null`, dòng tiền L3/L4 không zero-fill (fallback 10 dòng đầu provider).
- **DB lỗi**: `load_prev_insight` / `save_insight` **không** được bọc try — lỗi DB sẽ nổi lên thành 500. Khi viết lại nên bọc `save_insight` best-effort (mất history vẫn còn hơn mất response).

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/ai/insight/analyze' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-insi-4f1a-9c3e-20260817a004' \
  -d '{"symbol":"FPT","language":"vi","include_payload":false}'
~~~

**Ghi chú khi viết lại**

- Thứ tự bắt buộc: uppercase symbol → đọc cache (`layers`?) → build payload → gắn `payload.rawInput` → **mở session DB** → `load_prev_insight` → ghép `user_content = payloadJson + "\n\nPHIÊN TRƯỚC:\n" + JSON(prev ?? {})` → gọi LLM → parse → `build_insight_response` → gắn `dataSummary` → `save_insight(ai_json thô)` + commit → đóng session → ghi cache → gắn `payload` nếu xin.
- `rawInput` được **tính trong payload trước khi gọi LLM** (`payload.rawInput`) rồi `build_insight_response` chỉ pass-through. Đừng tính lại từ response.
- `header.volume` là **string đã format**: `>= 1e6` → `"{n/1e6 với 1 số thập phân}M"`, `>= 1e3` → `"…K"`, còn lại `String(Math.trunc(n))`; không parse được → `""`. Client không tự format lại.
- `changePercent = round((price - ref) / ref * 100, 2)`; `ref` = 0/null → `0.0` (không phải null).
- `header.sector` ưu tiên `company_details.icb_name_2` → `icb_name_3` → `industryName` → `""`. `indexGroup` ưu tiên `stock_type` → `index_type` → `indexGroup` → `company_overview.exchange` → `price_board.exchange` → `""`.
- Tin tức: lấy 20 bài theo ticker, **3 bài đầu được fetch detail tuần tự** (`payload.news`), phần còn lại nằm ở `payload.news_list`. `rawInput.news.items` chỉ lấy từ `payload.news` (3 bài) — không phải cả 20.
- `dataSummary.as_of` **bằng đúng** `updatedAt` (cùng biến), không sinh timestamp mới.
- `session_date` dùng `date.today()` của process — xem cảnh báo timezone ở [mục history](#so-sánh-phiên-trước--bảng-ai_insight_history).

---

### GET /api/v1/ai/insight/{symbol}

> **AI Insight v2 (dạng GET)** — cùng nội dung #4, bọc trong `{data: ...}`, không có body và **không có guard**.

| | |
|---|---|
| **Quyền** | **Công khai** — trong source không có `Depends` nào (khớp với OpenAPI không có `security`). Xem [bảng phân quyền](#bảng-phân-quyền-đầy-đủ-12-endpoint) |
| **Rate limit** | mặc định (60/phút mỗi IP) — hàng rào duy nhất chống lạm dụng |
| **Cache** | Dùng **chung key** với #4: `iqx:ai:analysis:insight:{SYMBOL}:{language}` |
| **Nguồn dữ liệu** | Hệt #4 |
| **Side-effect** | Hệt #4: ghi Redis + UPSERT `ai_insight_history` + gọi LLM khi MISS |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | **Không** có min/max/pattern (khác #4) | Mã cổ phiếu; backend `.toUpperCase()` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `language` | `string` | Không | `"vi"` | không validate | Ngôn ngữ đầu ra, đi vào cache key |

**Request body** — —

**Response 200**

~~~ts
interface GetInsightResponse { data: AIInsightResponse } // KHÔNG có field payload
~~~

~~~json
{
  "data": {
    "symbol": "VCB",
    "updatedAt": "2026-08-17T08:40:12.771903+00:00",
    "header": {
      "symbol": "VCB", "sector": "Ngân hàng", "indexGroup": "VN30",
      "price": 92300, "changePercent": -0.65, "high": 93100, "low": 92000,
      "volume": "2.7M", "isLive": true
    },
    "briefing": {
      "updatedAt": "2026-08-17T08:40:12.771903+00:00",
      "trend": "Đi ngang", "status": "Trung bình", "statusVariant": "neutral",
      "timeframe": "trung hạn 1–2 tuần",
      "narrative": [
        { "type": "text", "content": "VCB dao động hẹp quanh " },
        { "type": "number", "content": "92.300 đồng" },
        { "type": "text", "content": " với thanh khoản dưới bình quân 10 phiên." }
      ],
      "diff": { "text": [{ "type": "text", "content": "Tín hiệu ổn định so với phiên trước" }], "hasChange": false, "isFirstAnalysis": false },
      "observations": {
        "liquidity": [{ "type": "text", "content": "Khối lượng khớp thấp hơn bình quân 10 phiên 14%." }],
        "moneyFlow": [{ "type": "text", "content": "Khối ngoại bán ròng nhỏ, tự doanh trung tính." }],
        "insider": [{ "type": "text", "content": "Không có giao dịch nội bộ trong 10 phiên." }],
        "news": [{ "type": "text", "content": "Không có tin trọng yếu mới." }],
        "supportResistance": [{ "type": "text", "content": "Hỗ trợ 90.500 đồng – kháng cự 94.000 đồng." }]
      },
      "watchLevels": [{ "tag": "Hỗ trợ 90.500", "description": "nếu mất mốc này thì trạng thái đi ngang bị phá" }],
      "recommendation": "Quan sát thêm"
    },
    "layers": {
      "L1": { "layerNum": "L1", "layerName": "Xu hướng", "statusLabel": "Trung bình", "statusLevel": 3, "fields": [], "diff": { "text": [], "hasChange": true, "isFirstAnalysis": false } },
      "L2": { "layerNum": "L2", "layerName": "Thanh khoản", "statusLabel": "Bình thường", "statusLevel": 3, "fields": [], "diff": { "text": [], "hasChange": true, "isFirstAnalysis": false } },
      "L3": { "layerNum": "L3", "layerName": "Dòng tiền", "statusLabel": "Trung tính", "statusLevel": 3, "fields": [], "diff": { "text": [], "hasChange": true, "isFirstAnalysis": false } },
      "L4": { "layerNum": "L4", "layerName": "Nội bộ", "statusLabel": "Trung tính", "statusLevel": 3, "fields": [], "diff": { "text": [], "hasChange": true, "isFirstAnalysis": false } },
      "L5": { "layerNum": "L5", "layerName": "Tin tức", "statusLabel": "Trung tính", "statusLevel": 3, "fields": [], "diff": { "text": [], "hasChange": true, "isFirstAnalysis": false }, "news": { "material": [], "filler": [] } }
    },
    "rawInput": { "trend": { "realtime": null, "ohlcv": [], "computed": { "ma10": 0, "ma20": 0, "volMa10": 0, "volMa20": 0, "latestClose": 0 } }, "liquidity": { "latest": null, "avg30": null, "history": [] }, "moneyFlow": { "foreign": [], "proprietary": [] }, "insider": { "transactions": [] }, "news": { "items": [], "tickerScore": null } },
    "dataSummary": { "model": "cx/gpt-5.5", "as_of": "2026-08-17T08:40:12.771903+00:00" }
  }
}
~~~

> Ví dụ trên cố tình minh hoạ trường hợp **suy giảm**: `fields` rỗng khi LLM chỉ trả `statusLabel`, `rawInput` rỗng khi provider lỗi hết — client phải chịu được cả hai.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | AI proxy chưa cấu hình (`ValueError`) | `AI proxy chưa được cấu hình. Hãy đặt AI_PROXY_BASE_URL trong biến môi trường.` |
| 502 | — | `AIProxyError` | ví dụ `Không thể kết nối đến AI proxy: ConnectError` |
| — | — | **Không có 401/403** — endpoint công khai | — |
| — | — | Không có 404 cho mã không tồn tại — xem Fallback | — |

**Fallback / suy giảm**

- Mã không tồn tại (`GET /ai/insight/KHONGCO`): mọi nguồn trả rỗng → LLM vẫn được gọi với payload gần như trống → response 200 với `header.isLive = false`, `price = 0`, các lớp mang nhãn trung tính. **Không có 404.** Đây là lỗ đốt tiền LLM: mọi chuỗi ngẫu nhiên đều tạo một lần gọi LLM + một dòng `ai_insight_history`. Khi viết lại **nên** kiểm mã trong bảng `symbols` trước và trả 404 nếu không có.
- Còn lại giống hệt #4 (fallback non-JSON, thiếu lớp, provider lỗi).

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/insight/VCB?language=vi' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-gins-4f1a-9c3e-20260817a005'
~~~

> Header `Authorization` ở đây là **không cần thiết** (server bỏ qua) — giữ trong ví dụ để lệnh curl thống nhất với các endpoint khác.

**Ghi chú khi viết lại**

- Điểm khác #4: (a) không guard; (b) `symbol` không validate pattern/length; (c) không có `include_payload`; (d) response bọc `{data: ...}`.
- **Bẫy định tuyến**: chỉ có `POST /ai/insight/analyze`, **không** có `GET /ai/insight/analyze`. Trong bản Python, `GET /api/v1/ai/insight/analyze` khớp route này với `symbol = "analyze"` → chạy phân tích cho mã `"ANALYZE"` (200, dữ liệu rỗng), không phải 405. Khi viết lại nên khai báo route tĩnh trước route param, hoặc chặn danh sách từ khoá (`analyze`, `analyze-batch`) để trả 404/405 rõ ràng.
- Vì dùng chung cache key với #4: một request công khai MISS sẽ **ghi** cache mà Premium sau đó đọc lại, và ngược lại. Nếu thêm guard cho endpoint này thì cache vẫn tương thích (cùng format), không cần migrate.

---

### GET /api/v1/ai/bctc/{symbol}

> **AI Memo báo cáo tài chính** — memo tổng quan + ghi chú từng module phân tích BCTC, đã qua guard chặn số bịa và chặn khuyến nghị mua/bán.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | Redis `iqx:ai:analysis:bctc:{SYMBOL}:{term_type}:{language}`, TTL **604800s (7 ngày)**; payload `iqx:ai:payload:bctc:{SYMBOL}:{term_type}:{language}` TTL 600s |
| **Nguồn dữ liệu** | `get_bctc(symbol, term_type)` — **chỉ KPI đã pre-compute** (`snapshot`, `modules`, `forensic`, `trinity`, `flags`), không gửi statement thô cho LLM |
| **Side-effect** | Ghi 2 key Redis; tốn tiền LLM khi MISS. Không ghi DB |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Không validate | Mã cổ phiếu; backend `.toUpperCase()` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `term_type` | `number` (int) | Không | `1` | Không validate (giá trị lạ vẫn xuống provider) | `1` = quý, `2` = năm |
| `language` | `string` | Không | `"vi"` | không validate | Ngôn ngữ đầu ra |

**Request body** — —

**Response 200**

~~~ts
interface BctcAnalysis {
  memo: string;                      // markdown 200–250 từ; "" khi guard chặn
  modules: Record<string, string>;   // key = module id (common_size | wcc | cf_bridge | dupont | …); module vi phạm bị BỎ KHỎI object
}
interface GetBctcAnalyzeResponse {
  data: AnalysisEnvelope<{ symbol: string; term_type: number; language: string }, BctcAnalysis>;
}
~~~

~~~json
{
  "data": {
    "type": "bctc",
    "input": { "symbol": "HPG", "term_type": 1, "language": "vi" },
    "analysis": {
      "memo": "HPG ghi nhận biên gộp 12,4% trong kỳ, cải thiện so với 10,8% kỳ trước nhờ giá HRC bán ra tăng nhanh hơn chi phí quặng. ROE đạt 8,6% với ROA 4,9%, phản ánh đòn bẩy tài chính 1,75 lần. Dòng tiền hoạt động kinh doanh dương 4.120 tỷ đồng, đủ bù chi đầu tư giai đoạn Dung Quất 2. Vòng quay hàng tồn kho 3,1 lần cho thấy tiêu thụ hấp thụ tốt sản lượng mới.",
      "modules": {
        "common_size": "Giá vốn chiếm 87,6% doanh thu, giảm 1,6 điểm phần trăm so với kỳ trước. Chi phí bán hàng và quản lý giữ ở 3,2% doanh thu, cho thấy đòn bẩy hoạt động chưa bị pha loãng khi sản lượng tăng.",
        "wcc": "Chu kỳ tiền mặt 68 ngày với DSO 21 ngày và DIO 118 ngày. Hàng tồn kho vẫn là cấu phần chiếm dụng vốn lớn nhất, phù hợp với đặc thù tích trữ nguyên liệu của doanh nghiệp thép."
      }
    },
    "model": "cx/gpt-5.5",
    "as_of": "2026-08-17T08:52:41.330184+00:00"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | như #2 |
| 422 | — | `term_type` không parse được thành int | mảng `ValidationError` |
| 422 | — | AI proxy chưa cấu hình, hoặc provider BCTC ném `ValueError` | `str(exc)` |
| 502 | — | `AIProxyError` | ví dụ `AI proxy trả về HTTP 502` |

**Fallback / suy giảm** — **fail-closed thật sự** ở endpoint này:

1. **Parse**: ưu tiên khối `` ```json {…} ``` ``; không có thì lấy object `{…}` đầu tiên (regex greedy `\{.*\}`); parse lỗi hoặc không phải object → `{memo: "", modules: {}}`. Mục đích: **không để prose lọt vào `memo` và qua mặt guard**.
2. **Guard số bịa** (`sanitize_ai_output`): gom mọi số trong `payload.bctc` (đệ quy, mỗi số thêm cả bản `×100`) làm whitelist. Với từng token số trong text: thử cả hai locale (`,` nghìn kiểu EN và `,` thập phân kiểu VI), chấp nhận mọi thang `1, 0.01, 100, 1e9, 1e-9, 1e6`, dung sai tuyệt đối `0.05` hoặc tương đối `2%`; số nguyên trong khoảng `1990–2100` luôn được coi là **năm** và bỏ qua.
3. **Guard cụm từ cấm**: regex chặn `khuyến nghị`, `mua`, `bán`, `giữ mã/giữ cổ`, `buy`, `sell`, `hold`, `target price`, `giá mục tiêu` (không phân biệt hoa/thường).
4. Text rỗng cũng bị coi là vi phạm (`violations: ["empty"]`).
5. **Xử lý vi phạm**: `memo` vi phạm → `memo = ""` (KHÔNG hiện nội dung nào); từng module vi phạm → **bỏ hẳn key** khỏi `modules`. Response vẫn HTTP 200.
6. **Cạm bẫy nặng**: kết quả đã bị làm rỗng vẫn **được cache 7 ngày** → một lần LLM "lỡ miệng" khiến người dùng thấy memo trống suốt một tuần. Khi viết lại: chỉ cache khi `memo` không rỗng, hoặc cache bản rỗng với TTL ngắn (vài phút) rồi thử lại.

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/bctc/HPG?term_type=1&language=vi' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-bctc-4f1a-9c3e-20260817a006'
~~~

**Ghi chú khi viết lại**

- `term_type` **nằm trong cache key** (`iqx:ai:analysis:bctc:HPG:1:vi`) — quý và năm là hai bản phân tích khác nhau.
- Prompt yêu cầu chỉ đưa vào `modules` những module **có dữ liệu** trong payload; module thiếu dữ liệu thì LLM bỏ key. Vì vậy `modules` là `Record<string, string>` **mở**, không phải union cố định — frontend phải render động theo key.
- Endpoint không mở `include_payload` ra ngoài (service có tham số nhưng handler không truyền) → response **không bao giờ** có `payload`.
- `analysis` ở đây là **object** (`{memo, modules}`), khác #1/#2 nơi `analysis` là string. Cùng vỏ `AnalysisEnvelope` nhưng generic khác — chú ý khi viết type dùng chung.
- Guard chạy **sau** khi parse, **trước** khi cache. Đừng cache text thô chưa qua guard.

---

### GET /api/v1/ai/bctc-dashboard/{symbol}

> **Narrative kể chuyện cho dashboard BCTC** — AI viết phần chữ (kết luận một câu + câu chuyện 3 đoạn + trả lời từng khối) từ các con số lớp compute đã tính sẵn.

| | |
|---|---|
| **Quyền** | Bearer + Premium (+ `DBSession` để bật lớp peer-benchmark) |
| **Rate limit** | mặc định (60/phút mỗi IP) — **rất nguy hiểm**: mỗi request có thể là 4 lần gọi LLM |
| **Cache** | **KHÔNG có cache Redis cho narrative.** Chỉ các tầng dưới có cache riêng (peer median cache theo `(icb_lv2, ngày)` trong bảng `sector_median_cache`) |
| **Nguồn dữ liệu** | `compute_dashboard(symbol, term_type, db)` → BCTC statements + financial ratio + company overview (Vietcap) + peer median (DB); prompt hardcode `SYSTEM_PROMPT` trong `narrative_prompt.py` |
| **Side-effect** | Có thể ghi/đọc `sector_median_cache` (best-effort, có advisory lock scoped-transaction); tốn tiền LLM **mỗi request** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Không validate | Mã cổ phiếu; `.toUpperCase()` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `term_type` | `number` (int) | Không | `1` | Không validate | `1` = quý, `2` = năm |
| `language` | `string` | Không | `"vi"` | không validate | **Nhận nhưng KHÔNG dùng** — `generate_narrative` không truyền `language` vào prompt |

**Request body** — —

**Response 200**

~~~ts
type NarrativeTemplate = "A" | "B";     // A = phi ngân hàng, B = ngân hàng

interface NarrativeStory {
  lead: string;          // 1 câu mở đầu
  paragraphs: string[];  // ĐÚNG 3 đoạn (~70 từ mỗi đoạn)
  strengths: string[];   // 4–5 điểm mạnh, mỗi điểm ≤ 12 từ; không rỗng
  watchlist: string[];   // 1–3 điểm cần theo dõi, mỗi điểm ≤ 12 từ; không rỗng
}
interface NarrativeBlock { answer: string }
interface NarrativeBlockWithSub<K extends string> { answer: string; sub: Record<K, string> }

interface NarrativeA {
  verdict_oneliner: string;
  story: NarrativeStory;
  blocks: {
    valuation: NarrativeBlock; financial: NarrativeBlock;
    business: NarrativeBlock;  cashflow: NarrativeBlock;
    health: NarrativeBlockWithSub<"a" | "b" | "c">;
    dividend: NarrativeBlock;
  };
}
interface NarrativeB {
  verdict_oneliner: string;
  story: NarrativeStory;
  blocks: {
    valuation: NarrativeBlock; financial: NarrativeBlock;
    earning: NarrativeBlock;   efficiency: NarrativeBlock;
    asset_quality: NarrativeBlockWithSub<"a" | "b">;
    dividend: NarrativeBlock;
  };
}
interface GetBctcDashboardNarrativeResponse { data: NarrativeA | NarrativeB }
~~~

~~~json
{
  "data": {
    "verdict_oneliner": "VNM giữ được biên lợi nhuận cao nhưng tăng trưởng doanh thu đang chững lại.",
    "story": {
      "lead": "Một doanh nghiệp sữa đầu ngành đang đánh đổi tăng trưởng để giữ biên lợi nhuận.",
      "paragraphs": [
        "Doanh thu kỳ này đạt 15.240 tỷ đồng, gần như đi ngang so với cùng kỳ, trong khi biên gộp giữ ở mức 41,2% nhờ giá nguyên liệu sữa nhập khẩu hạ nhiệt. Sản lượng nội địa chưa trở lại đà tăng, phần bù đến từ thị trường xuất khẩu và các dòng sản phẩm giá trị cao.",
        "Dòng tiền từ hoạt động kinh doanh dương 3.180 tỷ đồng, cao hơn lợi nhuận sau thuế, cho thấy chất lượng lợi nhuận tốt. Nợ vay ròng gần như bằng không, tiền và tương đương tiền cùng tiền gửi chiếm 22% tổng tài sản, nên doanh nghiệp không chịu áp lực lãi vay trong môi trường lãi suất hiện tại.",
        "Chi phí bán hàng vẫn ở mức 24% doanh thu, phản ánh cạnh tranh gay gắt ở kênh hiện đại. Tỷ lệ chi trả cổ tức duy trì trên 80% lợi nhuận, phù hợp với doanh nghiệp đã qua giai đoạn mở rộng công suất mạnh."
      ],
      "strengths": [
        "Biên gộp 41,2% cao nhất ngành",
        "Dòng tiền kinh doanh vượt lợi nhuận",
        "Nợ vay ròng gần bằng không",
        "Tỷ lệ chi trả cổ tức trên 80%"
      ],
      "watchlist": [
        "Doanh thu nội địa đi ngang",
        "Chi phí bán hàng 24% doanh thu"
      ]
    },
    "blocks": {
      "valuation": { "answer": "Cổ phiếu đang giao dịch ở P/E 17,8 lần, cao hơn trung vị ngành thực phẩm 15,2 lần. Mức chênh phản ánh chất lượng dòng tiền và cổ tức, không phản ánh kỳ vọng tăng trưởng." },
      "financial": { "answer": "Cấu trúc tài chính rất an toàn: nợ vay ròng gần bằng không và tiền cùng tiền gửi chiếm 22% tổng tài sản. Doanh nghiệp không phụ thuộc vốn vay để duy trì hoạt động." },
      "business": { "answer": "Doanh thu 15.240 tỷ đồng gần như đi ngang, tăng trưởng đến từ xuất khẩu và dòng sản phẩm giá trị cao. Sản lượng nội địa chưa hồi phục về mức trước." },
      "cashflow": { "answer": "Dòng tiền kinh doanh 3.180 tỷ đồng cao hơn lợi nhuận sau thuế, chi đầu tư ở mức duy trì. Doanh nghiệp tự tài trợ toàn bộ vốn lưu động và cổ tức." },
      "health": {
        "answer": "Sức khoẻ tài chính thuộc nhóm tốt nhất ngành, không có dấu hiệu căng thẳng thanh khoản hay chất lượng lợi nhuận.",
        "sub": {
          "a": "Khả năng thanh toán ngắn hạn 2,1 lần, dư sức trả nợ đến hạn.",
          "b": "Chất lượng lợi nhuận tốt: dòng tiền kinh doanh vượt lợi nhuận kế toán.",
          "c": "Không có dấu hiệu bất thường ở khoản phải thu và hàng tồn kho."
        }
      },
      "dividend": { "answer": "Tỷ lệ chi trả trên 80% lợi nhuận, duy trì đều nhiều kỳ liên tiếp. Dòng tiền hiện tại đủ sức nuôi mức chi trả này." }
    }
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | như #2 |
| 422 | — | `ValueError` từ lớp compute (ví dụ mã không có BCTC) | `str(exc)` |
| 502 | — | Sau tất cả lượt thử vẫn không parse được JSON | `AI không trả về JSON hợp lệ cho narrative BCTC sau {N} lần thử` |
| 502 | — | Còn vi phạm **chặn cứng** sau khi hết retry | `narrative BCTC vi phạm quy tắc bắt buộc sau {N} lần thử: ['Cấm tên mô hình học thuật ở nội dung người dùng: ...']` |
| 502 | — | `AIProxyError` từ proxy (timeout / HTTP) | như bảng proxy |

**Fallback / suy giảm** — vòng lặp retry + fail-closed hai mức:

1. `max_retries = 3` → **tối đa 4 lượt** gọi LLM. Lượt ≥ 2 nối thêm vào user content: `"\n\n=== SỬA LỖI ===\nBản trước có các lỗi sau, hãy sửa và sinh lại JSON đúng schema:\n- <lỗi 1>\n- <lỗi 2>"`.
2. Parse JSON chịu được fence và prose xung quanh: bỏ fence, `JSON.parse`; lỗi thì cắt từ `{` đầu tiên tới `}` cuối cùng và parse lại; vẫn lỗi → ghi `["Output không phải JSON hợp lệ"]`, **continue** sang lượt sau (không giữ output).
3. `validate_narrative(parsed, template)` trả mảng lỗi tiếng Việt. Rỗng → `break` ngay.
4. Hết retry mà `output === null` (chưa lần nào parse được) → **502**.
5. Hết retry còn lỗi: phân loại
   - **Chặn cứng (fail closed → 502)**: lỗi bắt đầu bằng `"Cấm tên mô hình học thuật"` hoặc `"Cấm khuyến nghị"`. Nội dung vi phạm compliance **không bao giờ** tới người dùng.
   - **Lỗi cấu trúc còn dư** (thiếu key, `paragraphs` không đúng 3, `strengths` rỗng…) → **trả best-effort** bản parse cuối cùng, chỉ log warning. Frontend phải chịu được narrative thiếu key.
6. Danh sách token cấm: mô hình học thuật `altman`, `z-score`, `piotroski`, `f-score`, `beneish`, `m-score`, `dupont`, `sloan`, `accrual`; khuyến nghị `nên mua`, `nên bán`, `nên giữ`, `khuyến nghị`. Quét **mọi string** trong cây output (đệ quy), so sánh lowercase.
7. Validator cũng chặn **key thừa** so với schema (chống bịa thêm khối).

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/bctc-dashboard/VNM?term_type=1&language=vi' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-bdsh-4f1a-9c3e-20260817a007'
~~~

**Ghi chú khi viết lại**

- Template chọn theo `data.template` do `compute_dashboard` trả (`"A"` mặc định, `"B"` khi phát hiện ngân hàng qua `detect_template`). **Client phải branch theo key có mặt trong `blocks`**, response không tự khai báo template — cân nhắc thêm field `template` khi viết lại (đổi này là **thêm**, không phá contract cũ).
- **Ưu tiên số 1 khi port: thêm cache.** Hiện tại mỗi lần mở tab dashboard BCTC là 1–4 lần gọi LLM, không có bất kỳ Redis key nào. Đề xuất: cùng khuôn với #6 — key `iqx:ai:narrative:bctc-dashboard:{SYM}:{term_type}` TTL 7 ngày, chỉ cache khi `validate_narrative` trả rỗng.
- `language` là **tham số chết**: khai báo ở endpoint, truyền xuống `generate_narrative`, nhưng hàm này không dùng để dựng prompt (prompt tiếng Việt cố định). Đừng hứa đa ngôn ngữ với frontend.
- `db` bắt buộc phải truyền xuống `compute_dashboard` — thiếu `db` thì lớp peer-benchmark (peer median, màu ngưỡng, điểm radar) toàn `null` và tone của narrative sẽ nhạt hơn.
- `temperature = 0.2` cho cả 4 lượt (không tăng dần).
- `story.paragraphs` **đúng 3 phần tử** theo chủ đề: (1) kinh doanh & tăng trưởng, (2) dòng tiền & an toàn tài chính, (3) chủ đề còn lại. Validator kiểm số lượng, không kiểm chủ đề.

---

## Nhóm 2 — AI Mẫu hình (Google Sheets, không gọi LLM)

Ba endpoint dưới đây **không gọi LLM**. Dữ liệu là output pattern-recognition chạy hằng ngày, publish vào Google Spreadsheet `1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI` (đọc bằng `GOOGLE_SHEETS_API_KEY`), sheet `CANDLE` và `CHART`.

**Layout sheet** (cả hai sheet cùng thứ tự cột, dòng 0 là header):

~~~
SYMBOL | NAME | TIN HIEU | (MUC DO | TRANG THAI) | Y NGHIA | HANH DONG
~~~

- `CANDLE` dùng cột **`MUC DO`** — độ tin cậy: `Cao` / `Trung bình` / `Thấp`.
- `CHART` dùng cột **`TRANG THAI`** — trạng thái mẫu hình: ví dụ `Đang hình thành`, `Sẵn sàng breakout`, `Đã breakout`, `Đã fail (phá ngược)`.
- Backend đọc `row["MUC DO"] || row["TRANG THAI"]` vào cùng field `state`.

**Cache**: **in-process** (biến module-level `dict`), TTL **300s** mỗi sheet, có lock async chống stampede. **Không phải Redis** → mỗi instance có bản cache riêng, restart là mất. Sheet chỉ refresh 1 lần/ngày nên 300s là dư.

**Normalize `signal`** từ text cột `TIN HIEU` (lowercase, substring):

- chứa `tăng` / `mua` / `bullish` / `tích cực` → `"bullish"`
- chứa `giảm` / `bán` / `bearish` / `tiêu cực` → `"bearish"`
- rỗng hoặc không khớp → `"neutral"`
- Thứ tự kiểm tra: **bullish trước bearish** — một text có cả hai từ khoá sẽ ra `bullish`.

**Không có URL ảnh trong response.** Frontend tự render minh hoạ SVG theo `name` (`dashboard/src/features/patterns/PatternIllustration.tsx`). Danh sách `name` mà frontend hiện có hình vẽ riêng:

*Mẫu nến (`CANDLE`)*: `Doji`, `Doji Star`, `Morning Doji Star`, `Evening Doji Star`, `Tristar Pattern`, `Long Legged Doji`, `Rickshaw Man`, `Gravestone Doji`, `Dragonfly Doji`, `Takuri (Dragonfly Doji with long lower shadow)`, `Hammer`, `Inverted Hammer`, `Hanging Man`, `Shooting Star`, `Engulfing Pattern`, `Harami Pattern`, `Harami Cross Pattern`, `Marubozu`, `Closing Marubozu`, `Long Line Candle`, `Spinning Top`, `High-Wave Candle`, `Short Line Candle`, `Three Advancing White Soldiers`, `Identical Three Crows`, `Morning Star`, `Evening Star`, `Three Inside Up/Down`, `Three Outside Up/Down`, `Belt-hold`, `Piercing Pattern`, `Dark Cloud Cover`, `Tasuki Gap`, `Up/Down-gap Side-by-side White Lines`, `Matching Low`, `Three Stars in the South`.

*Mẫu giá (`CHART`)*: `Ascending Triangle`, `Descending Triangle`, `Symmetrical Triangle`, `Bull Flag`, `Bear Flag`, `Cup and Handle`, `Double Top`, `Double Bottom`, `Triple Top`, `Triple Bottom`, `Falling Wedge`, `Rising Wedge`, `Head and Shoulders`, `Inverse Head and Shoulders`, `Rectangle (Range)`, `Rectangle Range`.

> Danh sách trên là **những tên frontend biết vẽ**, không phải enum do backend ép. Backend trả `name` **nguyên văn từ sheet**; tên mới xuất hiện trong sheet vẫn đi qua API và frontend chỉ không có hình. Khi viết lại: **không** validate `name` theo whitelist.

**Không có tham số khung thời gian.** Cả `/candles` và `/charts` chỉ nhận `symbol`; sheet là snapshot mới nhất do job hằng ngày ghi, không có `resolution`/`timeframe`/`from`/`to`. Nếu frontend cần khung thời gian thì phải bổ sung cột trong sheet trước — **CHƯA XÁC ĐỊNH** khung thời gian mà job pattern-recognition đang dùng để tính (không có trong repo backend; xem job sinh sheet).

---

### GET /api/v1/ai/patterns/candles

> **Mẫu hình nến của một mã** — các mẫu nến TA-Lib nhận diện được cho mã cổ phiếu, kèm tín hiệu, độ tin cậy, ý nghĩa và hành động gợi ý.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | In-process theo sheet `CANDLE`, TTL 300s (không Redis) |
| **Nguồn dữ liệu** | Google Sheets — sheet `CANDLE` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbol` | `string` | **Có** | — | `minLength 1`, `maxLength 10` | Mã cổ phiếu, ví dụ `VCB`; backend `trim().toUpperCase()` |

**Request body** — —

**Response 200**

~~~ts
interface PatternsResponse {
  symbol: string;
  kind: "candles";
  items: PatternItem[];
  count: number;   // = items.length
}
~~~

~~~json
{
  "symbol": "VCB",
  "kind": "candles",
  "items": [
    {
      "symbol": "VCB",
      "name": "Hammer",
      "signal": "bullish",
      "signalLabel": "Tăng giá",
      "state": "Cao",
      "meaning": "Bóng dưới dài cho thấy lực cầu đỡ giá tại vùng hỗ trợ 90.500 đồng.",
      "action": "Chờ nến xác nhận đóng cửa trên 92.000 đồng trước khi mở vị thế."
    },
    {
      "symbol": "VCB",
      "name": "Spinning Top",
      "signal": "neutral",
      "signalLabel": "Trung tính",
      "state": "Trung bình",
      "meaning": "Thân nến nhỏ, hai bóng dài phản ánh giằng co giữa cung và cầu.",
      "action": "Giữ nguyên vị thế, chưa cần hành động."
    }
  ],
  "count": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | `Tài khoản chưa được kích hoạt` / `Yêu cầu gói Premium đang hoạt động` |
| 422 | — | Thiếu `symbol`, `symbol` rỗng hoặc dài > 10 | mảng `ValidationError` |
| 502 | — | **Bất kỳ** exception khi đọc sheet (thiếu `GOOGLE_SHEETS_API_KEY`, Google 4xx/5xx, timeout, parse lỗi) | `Không thể đọc dữ liệu mẫu nến` |

**Fallback / suy giảm**

- Mã không có dòng nào trong sheet → **200** với `items: []`, `count: 0`. **Không 404.**
- `symbol` chỉ gồm khoảng trắng (`"   "`) → sau `trim()` thành rỗng → trả ngay `{symbol: "", kind: "candles", items: [], count: 0}` **không đọc sheet**.
- Sheet có < 2 dòng (chỉ header hoặc rỗng) → `fetch_sheet_data` trả `[]` → `items: []`.
- Dòng thiếu cột → `fetch_sheet_data` pad chuỗi rỗng; các field rỗng thành `null` (trừ `symbol` và `name` là `""`).
- Lỗi được **log kèm stacktrace** rồi mới đổi thành 502 với detail chung — không rò rỉ thông tin Google API cho client.

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/patterns/candles?symbol=VCB' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-cndl-4f1a-9c3e-20260817a008'
~~~

**Ghi chú khi viết lại**

- So khớp mã bằng `row["SYMBOL"].trim().toUpperCase() === sym` — sheet có thể chứa khoảng trắng thừa, **phải trim**.
- `signalLabel`, `state`, `meaning`, `action` là `null` khi rỗng (dùng `x || null`), còn `symbol`/`name` là `""` — bất đối xứng có thật trong code, giữ nguyên để frontend không phải sửa.
- `count` luôn bằng `items.length`, đừng lấy từ nguồn khác.
- Cache là **theo sheet**, không theo symbol: request mã đầu tiên tải cả sheet, các mã sau lọc trên bộ nhớ. Với NestJS nhiều instance, nên đổi sang Redis (key `iqx:ai:patterns:sheet:CANDLE`, TTL 300s) để không mỗi pod tự gọi Google.

---

### GET /api/v1/ai/patterns/charts

> **Mẫu hình giá kinh điển của một mã** — tam giác, cờ, cup & handle, vai–đầu–vai… kèm trạng thái hình thành/breakout.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | In-process theo sheet `CHART`, TTL 300s (không Redis) |
| **Nguồn dữ liệu** | Google Sheets — sheet `CHART` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbol` | `string` | **Có** | — | `minLength 1`, `maxLength 10` | Mã cổ phiếu, ví dụ `HPG` |

**Request body** — —

**Response 200**

~~~ts
interface ChartPatternsResponse {
  symbol: string;
  kind: "charts";
  items: PatternItem[];   // state = giá trị cột TRANG THAI
  count: number;
}
~~~

~~~json
{
  "symbol": "HPG",
  "kind": "charts",
  "items": [
    {
      "symbol": "HPG",
      "name": "Ascending Triangle",
      "signal": "bullish",
      "signalLabel": "Tăng giá",
      "state": "Sẵn sàng breakout",
      "meaning": "Đáy nâng dần trong khi cạnh trên nằm ngang ở 32.500 đồng, thể hiện lực cầu tích lũy.",
      "action": "Theo dõi phiên vượt 32.500 đồng kèm khối lượng trên bình quân 20 phiên."
    },
    {
      "symbol": "HPG",
      "name": "Bear Flag",
      "signal": "bearish",
      "signalLabel": "Giảm giá",
      "state": "Đã fail (phá ngược)",
      "meaning": "Mẫu hình cờ giảm bị phá ngược lên, kịch bản giảm không còn hiệu lực.",
      "action": "Bỏ qua tín hiệu giảm của mẫu hình này."
    }
  ],
  "count": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | như #8 |
| 422 | — | Thiếu / sai độ dài `symbol` | mảng `ValidationError` |
| 502 | — | Bất kỳ exception khi đọc sheet | `Không thể đọc dữ liệu mẫu giá` |

**Fallback / suy giảm** — hệt #8, chỉ khác sheet và detail lỗi 502 (`mẫu giá` thay vì `mẫu nến`). Mã không có mẫu hình → `items: []`, `count: 0`, HTTP 200.

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/patterns/charts?symbol=HPG' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-chrt-4f1a-9c3e-20260817a009'
~~~

**Ghi chú khi viết lại**

- Cùng một hàm `_project` với #8 → cùng shape item; điểm khác duy nhất là `state` lấy từ `TRANG THAI` (vì `MUC DO` không tồn tại ở sheet này, phép `||` tự rơi sang).
- `state` của charts là **văn bản tự do trong sheet**, không phải enum backend. Đừng khai `state: "Đang hình thành" | ...` trong TS type — dùng `string | null` và map sang badge ở UI theo substring.
- Hai sheet có **hai entry cache riêng** trong cùng `Map`; đừng dùng chung một biến cache cho cả hai.

---

### GET /api/v1/ai/patterns/{kind}/symbols

> **Danh sách mã có mẫu hình** — trả các mã đang có ít nhất một dòng trong sheet tương ứng, để frontend bật/tắt panel.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | In-process theo sheet, TTL 300s (dùng chung cache với #8/#9) |
| **Nguồn dữ liệu** | Google Sheets — `CANDLE` hoặc `CHART` theo `kind` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `kind` | `"candles" \| "charts"` | Union literal (FastAPI `Literal`) — giá trị khác → 422 | Loại mẫu hình. `candles` → sheet `CANDLE`, `charts` → sheet `CHART` |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface ListPatternSymbolsResponse {
  kind: PatternKind;
  symbols: string[];  // distinct, UPPERCASE, sắp xếp TĂNG DẦN theo alphabet
  count: number;
}
~~~

~~~json
{
  "kind": "candles",
  "symbols": ["ACB", "BID", "CTG", "FPT", "GAS", "HPG", "MBB", "MWG", "SSI", "STB", "TCB", "VCB", "VHM", "VIC", "VNM"],
  "count": 15
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | như #8 |
| 422 | — | `kind` không thuộc `candles \| charts` (chặn ở tầng validate route) | mảng `ValidationError` (`literal_error`) |
| 422 | — | `ValueError` từ service: `kind must be 'candles' or 'charts'` (thực tế **không thể xảy ra** vì `Literal` đã chặn trước) | `kind must be 'candles' or 'charts'` |
| 502 | — | Bất kỳ exception khi đọc sheet | `Không thể đọc danh sách mã` |

**Fallback / suy giảm**

- Sheet rỗng → `{kind, symbols: [], count: 0}`, HTTP 200.
- Dòng có `SYMBOL` rỗng/thiếu bị **loại** khỏi tập hợp (điều kiện `if r.get("SYMBOL")` — chuỗi rỗng là falsy).
- Không có phân trang, không có filter — luôn trả toàn bộ danh sách.

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/patterns/candles/symbols' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-psym-4f1a-9c3e-20260817a010'
~~~

**Ghi chú khi viết lại**

- Sắp xếp là **alphabet tăng dần trên chuỗi đã uppercase** (`sorted(set(...))` của Python). Với NestJS dùng `[...set].sort()` là tương đương cho mã chỉ có A–Z0–9.
- Chỉ có **hai** `kind` — không có `kind` nào khác trong toàn bộ nhóm patterns (không có `harmonic`, `elliott`, v.v.).
- `kind` là **giá trị số ít/nhiều theo API** (`candles`/`charts`) nhưng **tên sheet là số ít in hoa** (`CANDLE`/`CHART`) — đừng ghép tên sheet bằng `kind.toUpperCase()`, phải map tường minh.
- Route `/{kind}/symbols` nằm **sau** `/candles` và `/charts` trong file; vì phần đuôi `/symbols` khác nhau nên không xung đột. Nhưng khi viết lại bằng NestJS, hãy khai báo `@Get('candles')` / `@Get('charts')` **trước** `@Get(':kind/symbols')` để tránh mọi rủi ro thứ tự.

---

## Nhóm 3 — AI Mô hình dự báo (Google Sheets, không gọi LLM)

Hai endpoint đọc sheet **`Du_Bao`** của cùng spreadsheet, schema chỉ 3 cột:

~~~
ticker | price | return
~~~

- `price` = giá mục tiêu dự kiến; `return` = **phân số** (`0,06` → `0.06` → +6%).
- Ô số dùng **dấu phẩy làm dấu thập phân** (locale Việt Nam). Hàm `_to_float` chỉ đổi `","` → `"."` rồi `parseFloat`; ô rỗng hoặc `"-"` → `null`; parse lỗi → `null`.
- Cache in-process TTL **300s** (một biến cache duy nhất cho cả sheet), có lock async.

**Bẫy đơn vị `projectedPrice`:** `_to_float` **không** xử lý dấu `.` phần nghìn (khác `google_sheets._parse_number` vốn bỏ dấu `.`). Nếu ô ghi `26.334` (ý là 26.334 đồng) thì kết quả là `26.334`, còn nếu ô ghi `26,3` thì kết quả là `26.3`. Đơn vị thật của cột `price` (đồng hay nghìn đồng) **CHƯA XÁC ĐỊNH** — không có trong repo backend, phải xem trực tiếp sheet `Du_Bao`. Khi viết lại: **giữ nguyên phép biến đổi** để số không đổi so với API cũ, và ghi chú đơn vị ở tầng UI sau khi xác nhận với người biên tập sheet.

**`horizon` là tham số trang trí.** Sheet `Du_Bao` là **một danh sách tuyển chọn duy nhất, không có cột theo khung thời gian**. `horizon` được nhận, dùng để dựng nhãn `"T+{horizon}"` trong response, **và không lọc/không đổi thứ tự gì cả**. `horizon=3`, `5`, `10` cho ra **cùng một danh sách**, chỉ khác hai field nhãn. Docstring của #12 ghi "cả 3 khung T+3 / T+5 / T+10" là **sai so với implementation** — nó chỉ trả một bản ghi.

---

### GET /api/v1/ai/forecast/ranking

> **Bảng xếp hạng mô hình dự báo** — danh sách mã tuyển chọn, xếp theo return kỳ vọng giảm dần.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | In-process sheet `Du_Bao`, TTL 300s (không Redis) |
| **Nguồn dữ liệu** | Google Sheets — sheet `Du_Bao` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `horizon` | `"3" \| "5" \| "10"` | Không | `"5"` | Union literal **dạng chuỗi**, không phải số | Khung thời gian. **Chỉ dùng làm nhãn**, không lọc dữ liệu |
| `limit` | `number` (int) | Không | `20` | `>= 1`, `<= 100` | Số mã trả về |

**Request body** — —

**Response 200**

~~~ts
interface ForecastRankingResponse {
  horizon: string;      // "T+5" khi có horizon; "Du_Bao" khi horizon = null (không xảy ra qua HTTP vì có default)
  horizonDays: number;  // 5 | 3 | 10 (0 khi horizon = null)
  count: number;        // = items.length (SAU khi cắt theo limit)
  items: ForecastItem[];
}
~~~

~~~json
{
  "horizon": "T+5",
  "horizonDays": 5,
  "count": 5,
  "items": [
    { "symbol": "HPG", "expectedReturn": 0.124, "projectedPrice": 36.5, "upProbability": null, "rank": 1 },
    { "symbol": "FPT", "expectedReturn": 0.098, "projectedPrice": 141.2, "upProbability": null, "rank": 2 },
    { "symbol": "MWG", "expectedReturn": 0.071, "projectedPrice": 74.8, "upProbability": null, "rank": 3 },
    { "symbol": "VCB", "expectedReturn": 0.043, "projectedPrice": 96.3, "upProbability": null, "rank": 4 },
    { "symbol": "VNM", "expectedReturn": -0.021, "projectedPrice": 61.4, "upProbability": null, "rank": 5 }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | `Tài khoản chưa được kích hoạt` / `Yêu cầu gói Premium đang hoạt động` |
| 422 | — | `horizon` ngoài `3/5/10`, hoặc `limit` < 1 / > 100 / không phải số | mảng `ValidationError` |
| 502 | — | Bất kỳ exception khi đọc sheet | `Không thể đọc dữ liệu mô hình AI` |

**Fallback / suy giảm**

- Sheet rỗng / chỉ có header → `{horizon: "T+5", horizonDays: 5, count: 0, items: []}`, HTTP 200.
- Dòng có `ticker` rỗng → **bỏ**.
- Dòng có `return` không parse được (`null`, `"-"`, text) → **bỏ khỏi ranking** (vì không sắp xếp được).
- Dòng có `price` không parse được nhưng `return` hợp lệ → **giữ**, `projectedPrice = null`.
- `upProbability` **luôn** `null` (sheet không có cột xác suất; field được giữ để response ổn định cho frontend).
- Không có 502 khi sheet thiếu cột — cột thiếu chỉ làm các giá trị thành `null`/bị lọc.

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/forecast/ranking?horizon=5&limit=20' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-rank-4f1a-9c3e-20260817a011'
~~~

**Ghi chú khi viết lại**

- Thứ tự bắt buộc: đọc sheet → project + lọc → **sort `expectedReturn` giảm dần** → **cắt** `items.slice(0, clamp(limit, 1, 100))` → **gán `rank` 1-based SAU khi cắt**. Rank là vị trí trong bảng đã trả, không phải vị trí trong toàn sheet (trùng nhau chỉ vì cắt từ đầu).
- `limit` đã được validate `1..100` ở route, nhưng service còn kẹp lần hai `max(1, min(limit, 100))` — giữ cả hai lớp (service có thể được gọi nội bộ).
- Sort dùng `expectedReturn` **thô** (phân số, có thể âm) — mã return âm rơi xuống cuối. Không lọc bỏ return âm.
- `horizon` là **string** trong query (`"5"`), `horizonDays` là **number** (`5`). Giữ nguyên cả hai để frontend không phải parse.
- Đừng "sửa" `horizon` thành có tác dụng lọc mà không đổi sheet: hiện tại không có dữ liệu để lọc, mọi cách lọc đều sẽ là bịa.
- Cache là biến module-level; NestJS nên đổi sang Redis key `iqx:ai:forecast:sheet:Du_Bao` TTL 300s.

---

### GET /api/v1/ai/forecast/symbols/{symbol}

> **Dự báo của một mã** — giá mục tiêu và return kỳ vọng lấy từ sheet `Du_Bao`.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/phút mỗi IP) |
| **Cache** | In-process sheet `Du_Bao`, TTL 300s (dùng chung cache với #11) |
| **Nguồn dữ liệu** | Google Sheets — sheet `Du_Bao` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Không validate | Mã cổ phiếu; backend `trim().toUpperCase()` |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface SymbolForecastResponse {
  symbol: string;
  projectedPrice: number | null;
  expectedReturn: number | null;   // phân số: 0.098 = +9,8%
}
~~~

~~~json
{
  "symbol": "FPT",
  "projectedPrice": 141.2,
  "expectedReturn": 0.098
}
~~~

Trường hợp không có trong sheet:

~~~json
{
  "symbol": "VNM",
  "projectedPrice": null,
  "expectedReturn": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Chưa active / không Premium | như #11 |
| 502 | — | Bất kỳ exception khi đọc sheet | `Không thể đọc dữ liệu mô hình AI` |
| — | — | **Không có 404** khi mã không có dự báo — trả 200 với hai field `null` | — |

**Fallback / suy giảm**

- Mã không có trong sheet → **200** `{symbol, projectedPrice: null, expectedReturn: null}`.
- `symbol` rỗng hoặc chỉ khoảng trắng → trả ngay `{symbol: "", projectedPrice: null, expectedReturn: null}` **không đọc sheet**.
- Có nhiều dòng cùng ticker → lấy **dòng khớp đầu tiên** (duyệt tuyến tính, return ngay), các dòng sau bị bỏ.
- Ô `price`/`return` không parse được → field tương ứng `null`, không lỗi.

**curl**

~~~bash
curl -sS 'https://api.iqx.vn/api/v1/ai/forecast/symbols/FPT' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2c8a10-fsym-4f1a-9c3e-20260817a012'
~~~

**Ghi chú khi viết lại**

- **Docstring của endpoint nói sai**: "Dự báo của 1 mã cho cả 3 khung T+3 / T+5 / T+10" — implementation trả **một** bản ghi, không có khung nào. Đừng port docstring thành contract; nếu sản phẩm cần 3 khung thì phải bổ sung cột trong sheet trước (đó là thay đổi tính năng, không phải port).
- Response **không** có `rank`, **không** có `upProbability` (khác `ForecastItem` của #11) — hai shape khác nhau, đừng dùng chung DTO.
- Không có 404 nghĩa là frontend phải tự phân biệt "mã không có dự báo" bằng cách kiểm `expectedReturn === null`.

---

## Ghi chú tổng hợp khi viết lại

**Phân quyền — kiểm ba lần**

1. 11/12 endpoint dùng `PremiumUser`; **chỉ `GET /ai/insight/{symbol}` là công khai** và đó là hành vi thật của source, không phải khai báo thiếu. Ghi vào changelog nếu bạn đổi.
2. Admin bỏ qua kiểm subscription — có test dựa vào điều này ở các nhóm khác, giữ nguyên.
3. Thứ tự: token → active → premium. Message lỗi tiếng Việt phải **nguyên văn** (frontend có thể đang so chuỗi).

**Cặp GET vs POST — kết luận rõ ràng**

| Cặp | GET | POST | Có phải "GET đọc bản đã lưu" không? |
|---|---|---|---|
| insight | `GET /ai/insight/{symbol}` | `POST /ai/insight/analyze` | **Không.** Cả hai gọi **cùng hàm** `analyze_insight`, cùng cache, cùng ghi DB. GET chỉ khác: không guard, không validate symbol, không `include_payload`, bọc `{data}` |
| bctc | `GET /ai/bctc/{symbol}` | — | Không có POST. GET vẫn **sinh mới** khi cache MISS |
| bctc-dashboard | `GET /ai/bctc-dashboard/{symbol}` | — | Không có POST. GET **luôn sinh mới** (không cache gì) |
| dashboard | — | `POST /ai/dashboard/analyze` | Không có GET |
| industry | — | `POST /ai/industry/analyze`, `analyze-batch` | Không có GET |

Nghĩa là **không có endpoint nào chỉ-đọc-không-sinh**. Mọi endpoint nhóm AI Phân tích đều có thể trigger LLM (và với insight thì trigger cả ghi DB) — kể cả các GET. Nếu bạn muốn tách "đọc bản đã có" khỏi "sinh mới" khi viết lại, đó là **tính năng mới**, phải thêm endpoint chứ đừng đổi nghĩa endpoint cũ.

**Cách chống đốt tiền LLM (theo mức ưu tiên)**

1. Thêm cache cho `GET /ai/bctc-dashboard/{symbol}` — hiện là lỗ lớn nhất (1–4 lần gọi LLM mỗi lần mở tab).
2. Kiểm mã tồn tại trước khi gọi LLM ở `insight` và `bctc` (hiện tại mã rác vẫn tốn một lần gọi).
3. Rate limit riêng, chặt hơn cho nhóm `analyze`, và lock/single-flight theo cache key để 10 request đồng thời cùng mã chỉ tạo **một** lần gọi LLM (bản Python không có single-flight — có thundering herd khi cache hết hạn).
4. Giới hạn concurrency trong `analyze-batch` (20 request song song hiện không có trần).
5. Không cache kết quả rỗng/bị guard chặn quá lâu (xem #6).

**Sai lệch đã biết giữa docstring/config và code — đừng port cái sai**

| Nơi | Ghi | Thực tế |
|---|---|---|
| `REDIS_TTL_AI_ANALYSIS_SECONDS = 1800` | TTL 30 phút | Không dùng ở đâu; TTL thật là "tới 15:00 VN" / 7 ngày |
| Docstring `analysis_service` | key `iqx:ai:analysis:dashboard:{language}` | Thực tế `…:dashboard:all:{language}` (có `all`) |
| Docstring #12 | "cả 3 khung T+3/T+5/T+10" | Trả một bản ghi, không có khung |
| Docstring `forecast_service` | `horizon` là khung dự báo | Chỉ là nhãn, không lọc |
| `rawInput.liquidity.avg30` | ngụ ý 30 phiên | Bình quân của ≤10 dòng history |
| `rawInput.news.tickerScore` | ngụ ý có điểm tin | Hardcode `null` |
| `app/services/ai/scoring.py` | có bảng điểm Layer 6 | Không endpoint nào dùng |
| `ai-analysis-endpoints.md` §3 | insight trả `analysis` là string | Đã đổi sang v2: trả `layers`/`briefing`, không có field `analysis` |

**Đơn vị và định dạng — chốt lại**

- Giá: **VND / cổ phiếu** (`price`, `high`, `low`, `ho_tro`, `khang_cu`, `S1`, `R1`, `MA10`, `MA20`).
- Khối lượng và dòng tiền L2–L4: **số cổ phiếu**, không phải VND, không phải nghìn.
- `changePercent`: **phần trăm** (1.18 = +1,18%), làm tròn 2 chữ số.
- `expectedReturn`: **phân số** (0.098 = +9,8%) — khác `changePercent`, dễ nhân/chia sai 100.
- `header.volume`: **string đã format** (`"4.2M"`), số nguyên `<1000` trả dạng `"820"`.
- Timestamp: ISO-8601 UTC có offset (`+00:00`). Field tên `as_of` (snake_case) ở envelope, `updatedAt` (camelCase) ở insight v2 — **cả hai đều đúng, đừng thống nhất hoá**.
- Số trong text do LLM viết dùng **định dạng Việt Nam** (`128.500 đồng`, `41,2%`) vì prompt tiếng Việt. Backend không format lại.

**Sắp xếp và thứ tự — bảng tóm**

| Chỗ | Thứ tự |
|---|---|
| `forecast/ranking.items` | `expectedReturn` **giảm dần**, cắt theo `limit`, rank 1-based sau khi cắt |
| `patterns/{kind}/symbols.symbols` | alphabet **tăng dần**, distinct, uppercase |
| `patterns/*.items` | **theo thứ tự dòng trong sheet** (không sort) |
| `industry/analyze-batch.results` | theo thứ tự `icb_codes` **sau dedupe**, không theo thứ tự hoàn thành |
| `rawInput.liquidity.history`, `moneyFlow.*` | **mới nhất trước** (provider trả desc) |
| `rawInput.trend.ohlcv` | **cũ → mới** (30 bar cuối của chuỗi asc) |
| `layers.*.fields` | thứ tự cứng do backend, xem [bảng field](#thứ-tự-field-trong-mỗi-thẻ-lớp) |

**Fail-closed vs pass-through — ba mức khác nhau, port đúng từng cái**

| Endpoint | LLM sai định dạng | Vi phạm nội dung (số bịa / khuyến nghị) |
|---|---|---|
| #4, #5 insight | **Pass-through** 500 ký tự text thô vào `narrative`/`L5.tong_quan`, HTTP 200 | Không có guard nội dung |
| #6 bctc | Trả `{memo:"", modules:{}}` (không để prose lọt) | **Fail-closed**: memo → `""`, module vi phạm bị bỏ; HTTP 200 |
| #7 bctc-dashboard | Retry tối đa 4 lượt, không parse được → **502** | **Fail-closed → 502** với `Cấm tên mô hình học thuật` / `Cấm khuyến nghị`; lỗi cấu trúc → best-effort 200 |
| #1, #2, #3 | Không parse (text tự do) → trả nguyên văn | Không có guard |

**Danh sách "phải copy nguyên văn, không được diễn đạt lại"**

- 5 cụm `recommendation`: `Chờ điểm mua`, `Có thể mua thử`, `Quan sát thêm`, `Nên giảm bớt`, `Bán bớt`.
- 4 giá trị `statusVariant`: `bull`, `warn`, `bear`, `neutral`.
- Nhãn 5 bậc của từng lớp (bảng ở [insight_levels](#thang-5-bậc--insight_levelspy)).
- 6 tag markup và 4 loại fragment.
- Nhãn field tiếng Việt trong `layers.*.fields` (`Cung–Cầu` dùng en dash).
- Mọi `detail` lỗi tiếng Việt trong các bảng Lỗi.
- Token cấm của `ai_guard` và `narrative_validator`.
- Sentinel diff: `"ổn định"`, `"lần đầu"`.
