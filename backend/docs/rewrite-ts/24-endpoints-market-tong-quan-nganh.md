# Endpoint — Dữ liệu thị trường: tổng quan & ngành

Chương này đặc tả **20 endpoint** thuộc ba tag: `Dữ liệu thị trường: Tổng quan` (16 endpoint `/overview/*`), `Dữ liệu thị trường: Ngành` (3 endpoint `/sectors/*`) và `Dữ liệu thị trường: Phân tích` (1 endpoint `/insights/ranking/{kind}`). Cả 20 đều là **GET, công khai (không auth), không ghi DB, không side-effect** — chúng là lớp proxy có chuẩn hoá (normalize) đặt trước hai host của Vietcap (`trading.vietcap.com.vn`, `iq.vietcap.com.vn`) và một host của VNDIRECT (`api-finfo.vndirect.com.vn`).

Nguồn sự thật: bản cắt OpenAPI của nhóm (hình dạng) + `app/api/v1/endpoints/market_data.py` (dòng 379–402, 1370–1869, 2109–2182), `app/services/market_data/sources/vietcap_market_overview.py`, `vietcap_sector.py`, `vndirect.py`, `app/services/cache/decorator.py`, `app/services/market_data/fallback.py`, cùng ba tài liệu provider `docs/vietcap-market-overview-api.md`, `docs/vietcap-market-overview-api-supplement.md`, `docs/vietcap-sector-api.md`.

> **Ba cảnh báo đọc trước khi viết lại**
> 1. **19/20 endpoint KHÔNG dùng envelope `MarketDataResponse`** (`{data, meta}`) như phần còn lại của `/market-data`. Chúng trả `{data, source_url}`. Chỉ `GET /insights/ranking/{kind}` dùng `{data, meta}`.
> 2. **Cùng status 422 có hai shape `detail` khác nhau**: array (validate của framework) hoặc string (validate enum trong handler).
> 3. **Đơn vị tiền không đồng nhất** giữa các endpoint: VND, triệu VND, tỷ VND (ngưỡng `value`), và có endpoint trả % dạng phần trăm, endpoint khác trả % dạng phân số. Sai một chỗ là sai 10⁶ lần hoặc 100 lần trên dashboard.

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Mục đích |
|---|---|---|---|---|
| 1 | GET | `/api/v1/market-data/overview/market-index` | Công khai | Giá + độ rộng của các chỉ số (VN-Index, HNX-Index, UPCOM-Index, VN30, HNX30). |
| 2 | GET | `/api/v1/market-data/overview/liquidity` | Công khai | Chuỗi thanh khoản tích lũy (KL + GTGD) theo phút/ngày/tuần/tháng/năm. |
| 3 | GET | `/api/v1/market-data/overview/breadth` | Công khai | Độ rộng thị trường: số mã trên đường EMA/SMA, tỷ lệ 0–1 theo từng ngày. |
| 4 | GET | `/api/v1/market-data/overview/valuation` | Công khai | Lịch sử P/E hoặc P/B của một nhóm chỉ số. |
| 5 | GET | `/api/v1/market-data/overview/allocation` | Công khai | Phân bổ GTGD & số mã theo tăng/không đổi/giảm, tách theo sàn. |
| 6 | GET | `/api/v1/market-data/overview/stock-strength` | Công khai | Map phẳng `{mã: điểm sức mạnh kỹ thuật}` cho toàn sàn. |
| 7 | GET | `/api/v1/market-data/overview/maintenance` | Công khai | Thông báo bảo trì **của provider Vietcap IQ** (rỗng khi không bảo trì). |
| 8 | GET | `/api/v1/market-data/overview/index-impact` | Công khai | Top mã kéo tăng / kéo giảm chỉ số, đơn vị điểm chỉ số. |
| 9 | GET | `/api/v1/market-data/overview/foreign` | Công khai | Chuỗi thời gian KL/GT mua–bán của khối ngoại toàn thị trường. |
| 10 | GET | `/api/v1/market-data/overview/foreign/top` | Công khai | Top mã khối ngoại mua ròng / bán ròng + tổng mua/bán ròng. |
| 11 | GET | `/api/v1/market-data/overview/proprietary` | Công khai | Chuỗi thời gian mua–bán tự doanh theo ngày giao dịch. |
| 12 | GET | `/api/v1/market-data/overview/proprietary/top` | Công khai | Top mã tự doanh mua / bán trong một ngày giao dịch. |
| 13 | GET | `/api/v1/market-data/overview/heatmap` | Công khai | Nhiệt độ thị trường: mảng ngành ICB, mỗi ngành lồng danh sách mã. |
| 14 | GET | `/api/v1/market-data/overview/heatmap/index` | Công khai | Tổng hợp toàn thị trường cho khung heatmap (không tham số). |
| 15 | GET | `/api/v1/market-data/overview/sectors/allocation` | Công khai | Phân bổ GTGD + %biến động theo từng mã ngành ICB. |
| 16 | GET | `/api/v1/market-data/overview/sectors/detail` | Công khai | Chi tiết toàn bộ mã bên trong MỘT ngành ICB. |
| 17 | GET | `/api/v1/market-data/sectors/information` | Công khai | Vốn hóa, chỉ số ngành, hiệu suất giá 1D→5Y theo cấp ICB. |
| 18 | GET | `/api/v1/market-data/sectors/ranking` | Công khai | Điểm sức mạnh ngành 0–100 cho 20 ngày gần nhất (heatmap xếp hạng). |
| 19 | GET | `/api/v1/market-data/sectors/trading-dates` | Công khai | 20 ngày giao dịch gần nhất, làm header cột cho bảng xếp hạng ngành. |
| 20 | GET | `/api/v1/market-data/insights/ranking/{kind}` | Công khai | Xếp hạng cổ phiếu theo 7 loại (`gainer`, `loser`, `value`, `volume`, `deal`, `foreign-buy`, `foreign-sell`). |

---

## Kiểu dữ liệu dùng chung

#### Envelope

~~~ts
/** Envelope của 19/20 endpoint trong chương (handler: return {"data": data, "source_url": url}). */
interface MdEnvelope<T> {
  /** Payload đã normalize. */
  data: T;
  /**
   * URL provider đã gọi. LƯU Ý: với upstream GET đây là URL **không kèm query
   * string** (params truyền riêng cho httpx); với upstream POST cũng chỉ là URL
   * gốc. Không thể dùng source_url để tái hiện request.
   */
  source_url: string;
}

/** Riêng GET /insights/ranking/{kind} dùng envelope Pydantic MarketDataResponse. */
interface MarketDataMeta {
  /** Nguồn đã phục vụ; endpoint này luôn "VND". */
  source: string;
  /** 1 = nguồn chính, 2+ = fallback. Default 1. */
  source_priority: number;
  /** true khi phải dùng nguồn dự phòng. Default false. */
  fallback_used: boolean;
  /** Thời điểm fetch, ISO-8601 UTC (datetime.now(UTC)). */
  as_of: string;
  /** URL upstream — với VNDIRECT thì CÓ kèm query string. Default "". */
  raw_endpoint: string;
}
interface MarketDataResponse<T> { data: T; meta: MarketDataMeta; }
~~~

#### Hai shape lỗi

~~~ts
/** 422 do FastAPI validate query/path param (kiểu, ge/le). */
interface HttpValidationError {
  detail: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
    input?: unknown;
    ctx?: Record<string, unknown>;
  }>;
}

/** 422 / 502 / 503 do handler tự raise HTTPException. */
interface MdErrorResponse { detail: string; }
~~~

> Ví dụ: `?icb_level=0` → `detail` là **array**; `?adtv=99` → `detail` là **string**. Bản TS/NestJS phải giữ đúng cả hai shape.

#### Enum tham số (`vietcap_market_overview.py:32–47, 625–626, 679, 705`; `vietcap_sector.py:28–30`)

~~~ts
/** GROUPS — group/market/exchange của phần lớn endpoint overview. */
type MdGroup = "ALL" | "HOSE" | "HNX" | "UPCOM";

/** TIME_FRAMES_IMPACT — index-impact, foreign, foreign/top, proprietary,
 *  proprietary/top, allocation, sectors/allocation, sectors/detail. */
type MdTimeFrameImpact = "ONE_DAY" | "ONE_WEEK" | "ONE_MONTH" | "YTD" | "ONE_YEAR";

/** TIME_FRAMES_LIQUIDITY — chỉ /overview/liquidity. KHÔNG có YTD, CÓ ONE_MINUTE. */
type MdTimeFrameLiquidity =
  | "ONE_MINUTE" | "ONE_DAY" | "ONE_WEEK" | "ONE_MONTH" | "ONE_YEAR";

/** TIME_FRAMES_VALUATION — chỉ /overview/valuation. */
type MdTimeFrameValuation =
  | "SIX_MONTHS" | "YTD" | "ONE_YEAR" | "TWO_YEAR" | "FIVE_YEAR" | "ALL";

type MdBreadthCondition = "EMA50" | "EMA20" | "SMA50" | "SMA200";
type MdBreadthPeriod = "M6" | "YTD" | "Y1" | "Y2" | "Y5" | "ALL";
/** EXCHANGES_BREADTH — CHỈ nhận HSX, KHÔNG nhận HOSE. */
type MdBreadthExchange = "HSX" | "HNX" | "UPCOM";

type MdValuationType = "pe" | "pb";
type MdComGroupCode =
  | "VNINDEX" | "HNX30" | "VN30" | "VNMIDCAP" | "VNSMALLCAP" | "VN100";

type MdHeatmapSector = "icb_code_1" | "icb_code_2" | "icb_code_3" | "icb_code_4";
type MdHeatmapSize = "MKC" | "VOL" | "VAL";
type MdLiquiditySymbol = "ALL" | "VNINDEX" | "HNXIndex" | "HNXUpcomIndex";
/** EXCHANGES_STRENGTH — endpoint duy nhất nhận CẢ HOSE và HSX. */
type MdStrengthExchange = "ALL" | "HOSE" | "HNX" | "UPCOM" | "HSX";
/** VALID_INDEX_SYMBOLS — /overview/market-index. */
type MdIndexSymbol = "VNINDEX" | "HNXIndex" | "HNXUpcomIndex" | "VN30" | "HNX30";

type MdIcbLevel = 1 | 2 | 3 | 4;
/** ADTV_VALUES — số tháng tính GTGD trung bình. */
type MdAdtv = 1 | 3 | 6;
/** VALUE_THRESHOLDS — ngưỡng GTGD tối thiểu, đơn vị TỶ VND. */
type MdValueThreshold = 3 | 5 | 10;

type MdRankingKind =
  | "gainer" | "loser" | "value" | "volume" | "deal"
  | "foreign-buy" | "foreign-sell";
~~~

> **Bẫy từ vựng "sàn" — ba endpoint, ba bộ giá trị:**
> `/overview/breadth?exchange=` chỉ nhận `HSX|HNX|UPCOM` (gửi `HOSE` → 422).
> `/overview/proprietary/top?exchange=` chỉ nhận `ALL|HOSE|HNX|UPCOM` (gửi `HSX` → 422).
> `/overview/stock-strength?exchange=` nhận cả `HOSE` và `HSX`; theo `docs/vietcap-market-overview-api-supplement.md:119`, `HSX` trả kết quả **giống `ALL`** (~1538 ticker).

#### Bản ghi tái sử dụng

~~~ts
/** Dòng trong top_up / top_down của /overview/index-impact. */
interface MdImpactStock {
  symbol: string;                 // "" nếu provider thiếu
  /** Đóng góp vào chỉ số, ĐƠN VỊ ĐIỂM CHỈ SỐ. Âm = kéo giảm. */
  impact: number | null;
  exchange: string;               // "HOSE" | "HNX" | "UPCOM" | ""
  company_name: string;           // organName (tiếng Việt không dấu)
  match_price: number | null;     // VND, ÉP VỀ INT
  ref_price: number | null;       // VND, GIỮ FLOAT (bất đối xứng với match_price)
}

/** Dòng trong net_buy / net_sell của /overview/foreign/top. */
interface MdForeignTopStock {
  symbol: string;
  exchange: string;
  company_name: string;
  net_value_vnd: number | null;   // net = buy − sell, VND, int. Âm ở net_sell
  buy_value_vnd: number | null;   // VND
  sell_value_vnd: number | null;  // VND
  match_price: number | null;     // VND, int
  ref_price: number | null;       // VND, float
}

/** Dòng trong buy / sell của /overview/proprietary/top. */
interface MdProprietaryTopStock {
  /** CHÚ Ý: field tên "ticker", KHÔNG phải "symbol". */
  ticker: string;
  exchange: string;
  company_name: string;
  total_value_vnd: number | null; // VND, int. Âm = bán ròng
  total_volume: number | null;    // cổ phiếu
  match_price: number | null;     // VND, int
  ref_price: number | null;       // VND, float
}

/** Một mã bên trong một ngành của /overview/heatmap. */
interface MdHeatmapStock {
  symbol: string;
  volume: number | null;              // cổ phiếu
  value_million_vnd: number | null;   // GTGD, ĐƠN VỊ TRIỆU VND (float)
  price: number | null;               // VND, int
  ref_price: number | null;           // VND, int
  market_cap_vnd: number | null;      // VND, int
  ceiling_price: number | null;       // VND, int
  floor_price: number | null;         // VND, int
}

/** Một mã bên trong /overview/sectors/detail. */
interface MdSectorDetailStock {
  symbol: string;
  ref_price: number | null;             // VND, int
  match_price: number | null;           // VND, int
  ceiling_price: number | null;         // VND, int
  floor_price: number | null;           // VND, int
  accumulated_volume: number | null;    // cổ phiếu
  /** GTGD lũy kế, ĐƠN VỊ VND (khác heatmap dùng triệu VND). */
  accumulated_value_vnd: number | null;
  company_name: string;                 // organName
  en_company_name: string;              // enOrganName
  foreign_net_volume: number | null;    // cổ phiếu, âm = bán ròng
  foreign_net_value_vnd: number | null; // VND, âm = bán ròng
  board: string;                        // từ vựng provider: "HSX" | "HNX" | "UPCOM"
}

/** Dòng của /overview/sectors/allocation (= phần header của sectors/detail). */
interface MdSectorAllocationRow {
  icb_code: number | null;              // mã ngành ICB dạng SỐ NGUYÊN, vd 8300
  /** %biến động ngành, ĐƠN VỊ PHẦN TRĂM (−20.506 = −20,506%). */
  icb_change_percent: number | null;
  total_value_vnd: number | null;       // VND
  total_stock_increase: number | null;  // số mã
  total_stock_decrease: number | null;
  total_stock_no_change: number | null;
  /** Passthrough thô icbCodeParent — provider trả number hoặc null. */
  icb_code_parent: number | string | null;
}
~~~

---

## Nghiệp vụ nền

#### Quy tắc chung áp cho cả 20 endpoint

| Hạng mục | Sự thật |
|---|---|
| Auth | Không có. Không guard, không `Depends(get_current_user)`. Gửi `Authorization: Bearer ...` cũng không bị từ chối — header bị bỏ qua. |
| Rate limit | `RATE_LIMIT_DEFAULT = "60/minute"` per-IP, áp bởi `SlowAPIMiddleware` toàn app. **Không** endpoint nào trong chương gắn `@limiter.limit(...)` riêng — hằng `RATE_LIMIT_MARKET_DATA = "120/minute"` chỉ áp cho `POST /trading/price-board`, không áp ở đây. |
| Cache | Decorator `@redis_cached`. Key = `iqx:api:v1:{path bỏ / đầu-cuối}:{md5(query đã sort)[:12]}`; không có query → hậu tố `_`. Hit trả `JSONResponse` kèm header `X-Cache: HIT`. Redis chết ⇒ chạy uncached, không lỗi. **Response rỗng (`data` = `[]`/`{}`) KHÔNG được ghi cache** (`cache_empty=False`). |
| TTL | `/overview/*`: `REDIS_TTL_OVERVIEW_SECONDS` = **30s**. `/sectors/*`: `REDIS_DEFAULT_TTL_SECONDS` = **300s**. `/insights/ranking/{kind}`: `REDIS_TTL_REALTIME_SECONDS` = **15s**. |
| Side-effect | Không có: không ghi bảng, không email/Telegram, không audit log. Chỉ ghi Redis cache + log cảnh báo khi provider lỗi. |
| HTTP client upstream | `httpx` shared client, timeout 15s, **3 lần thử**, backoff `0.5 × 2^(n−1)` + jitter cho timeout/connect-error; retry HTTP 5xx; **không retry 4xx**. |
| Thứ tự kiểm tra | (1) FastAPI validate kiểu/ràng buộc `ge/le` → 422 array. (2) `@redis_cached` đọc cache. (3) Handler validate enum → 422 string. (4) Gọi provider. ⇒ Request sai enum vẫn tốn 1 lệnh Redis GET trước khi trả 422. |

#### Ánh xạ lỗi provider → HTTP (giống nhau ở 19 endpoint Vietcap)

| Tình huống upstream | Exception nội bộ | HTTP | `detail` |
|---|---|---|---|
| Body sai kiểu (mong dict được list…), thiếu key bắt buộc, hoặc envelope IQ có `successful != true` | `MarketOverviewUpstreamShapeError` / `SectorUpstreamShapeError` | **502** | `str(exc)` — tiếng Anh, xem từng endpoint |
| Timeout, connect error, HTTP 4xx/5xx sau retry | `MarketOverviewUpstreamError` / `SectorUpstreamError` | **503** | `"{METHOD} {path}: {exception gốc}"` |

Hai helper dùng lại: `_unwrap_iq(data, url)` — yêu cầu dict và `data["successful"] == true`, rồi trả `data["data"]`; sai ⇒ `Expected dict from {url}, got {type}` hoặc `API unsuccessful: {msg}`. `_require_list/_require_dict/_require_key` sinh `Expected list from {label}, got {type}` / `Missing required key '{key}' in {label}`.

#### Hai helper số học (quyết định kiểu dữ liệu trả về)

| Helper | Dùng cho | Hành vi |
|---|---|---|
| `_to_int_amount` | tiền VND, khối lượng cổ phiếu, số mã, timestamp | Nhận int, float phần thập phân = 0, chuỗi số (`"50300.0"` → `50300`). Có phần thập phân ⇒ **truncate + log warning**. `None`/`""`/`"abc"`/`bool` ⇒ `null`. |
| `_to_float_ratio` | tỷ số P/E, phần trăm, điểm impact, điểm chỉ số, GTGD triệu VND | Nhận int/float/chuỗi số ⇒ float. `None`/không parse được ⇒ `null`. `bool` ⇒ `null`. |

#### Mã ngành ICB — cấp, format, nơi tra tên

| Việc | Sự thật đọc từ source |
|---|---|
| Số cấp | **4 cấp** (`ICB_LEVELS = {1,2,3,4}`). Cấp 1 = super sector, 2 = sector, 3 = sub-sector, 4 = detail sector. |
| Format | Chuỗi/số **4 chữ số**: `8300` (Ngân hàng), `8600` (Bất động sản), `9500` (Công nghệ Thông tin), `1300` (Hoá chất), `2733` (Hàng điện & điện tử — cấp 4). |
| Kiểu trả về **không nhất quán** | `/overview/sectors/allocation`, `/overview/heatmap`, `/overview/sectors/detail` → `icb_code` là **number**. `/sectors/ranking` → **string** (thô từ `item["name"]`). `/sectors/information` → **string thô** từ `item["icbCode"]`, có thể `"8300"` hoặc `"8300.0"` (xem chú thích `app/services/ai/portfolio_manager/inputs.py:106–113`). |
| Tra tên ngành | Không endpoint nào trong chương trả tên ngành cho `/sectors/*`. Dùng `GET /api/v1/market-data/reference/industries` (chương Tham chiếu), nguồn `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes`. |
| Ngoại lệ | `/overview/heatmap` là endpoint DUY NHẤT tự trả kèm `icb_name` + `en_icb_name`. |
| Số ngành theo cấp | Theo `docs/vietcap-sector-api.md`: `/sectors/ranking` → 11/16/19/21 ngành cho cấp 1/2/3/4; `/sectors/information` → 13/19/40/106 ngành. |

#### Phụ thuộc phiên giao dịch

**Không handler nào kiểm tra giờ/phiên** — không gọi `marketStatus`, không so giờ, không "giữ giá trị phiên trước". Hệ quả:

| Nhóm | Ngoài giờ giao dịch trả gì |
|---|---|
| `market-index`, `heatmap`, `heatmap/index`, `index-impact` (`ONE_DAY`), `sectors/detail`, `sectors/allocation` | Trả **nguyên số chốt phiên gần nhất** provider giữ (không null, không 0). Backend **không** đánh dấu "dữ liệu cũ" ở bất kỳ field nào. |
| `liquidity` (`ONE_MINUTE`) | Phụ thuộc cửa sổ `from_ts/to_ts`. Cửa sổ không chứa phiên nào ⇒ provider trả mảng rỗng ⇒ **200 + `data: []`** (không 404/503). |
| `proprietary`, `proprietary/top` | Dữ liệu tự doanh do FiinTrade cấp, thường trễ tới cuối phiên; đọc `trading_date` để biết ngày thực tế. |
| `breadth`, `valuation`, `sectors/ranking`, `sectors/information`, `sectors/trading-dates` | Dữ liệu **EOD theo ngày**, không đổi trong phiên. |
| `stock-strength` | Điểm TA tính EOD; trong phiên vẫn là điểm phiên trước. |
| `maintenance` | Không liên quan phiên. |
| `insights/ranking/{kind}` | VNDIRECT tính realtime trong phiên, EOD ngoài phiên; `foreign-buy`/`foreign-sell` cần `date` là ngày giao dịch thật. |

---

## Tổng quan: chỉ số, thanh khoản, độ rộng, định giá

### GET /api/v1/market-data/overview/market-index

> **Chỉ số thị trường** — Giá, biến động và độ rộng (số mã tăng/giảm/trần/sàn) của VN-Index, HNX-Index, UPCOM-Index, VN30, HNX30.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per-IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/market-index:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/price/marketIndex/getList` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbols` | `string \| null` | Không | `null` | CSV; mỗi phần tử ∈ `MdIndexSymbol` | Danh sách mã chỉ số. Bỏ trống ⇒ backend dùng `["VNINDEX","HNXIndex","HNXUpcomIndex"]` (`vietcap_market_overview.py:712–713`). |

**Request body** — —

**Response 200**

~~~ts
interface MdIndexQuote {
  symbol: string;                        // "VNINDEX" | "HNXIndex" | ...
  board: string;                         // "HSX" | "HNX" | "UPCOM"
  price: number | null;                  // điểm chỉ số (float)
  ref_price: number | null;              // điểm tham chiếu (đóng cửa phiên trước)
  change: number | null;                 // price − ref_price, đơn vị ĐIỂM
  /** %biến động, ĐƠN VỊ PHẦN TRĂM (−0.9126 = −0,9126%). */
  change_percent: number | null;
  total_shares: number | null;           // tổng KL khớp toàn sàn, CỔ PHIẾU
  /** Tổng GTGD, ĐƠN VỊ TRIỆU VND (24187602.41 ⇒ ~24.188 tỷ VND). */
  total_value_million_vnd: number | null;
  total_stock_increase: number | null;
  /** CHÚ Ý: tên "decline", không phải "decrease" như nhóm sectors. */
  total_stock_decline: number | null;
  total_stock_no_change: number | null;
  total_stock_ceiling: number | null;
  total_stock_floor: number | null;
  time: string;                          // ISO-8601 có hậu tố Z; "" nếu thiếu
}
type MdMarketIndexResponse = MdEnvelope<MdIndexQuote[]>;
~~~

~~~json
{
  "data": [
    {
      "symbol": "VNINDEX",
      "board": "HSX",
      "price": 1912.44,
      "ref_price": 1898.71,
      "change": 13.73,
      "change_percent": 0.7231,
      "total_shares": 812456300,
      "total_value_million_vnd": 24187602.41153,
      "total_stock_increase": 218,
      "total_stock_decline": 112,
      "total_stock_no_change": 61,
      "total_stock_ceiling": 9,
      "total_stock_floor": 2,
      "time": "2026-08-17T08:05:00.000Z"
    },
    {
      "symbol": "HNXIndex",
      "board": "HNX",
      "price": 259.18,
      "ref_price": 257.44,
      "change": 1.74,
      "change_percent": 0.6759,
      "total_shares": 74215800,
      "total_value_million_vnd": 1486203.7742,
      "total_stock_increase": 96,
      "total_stock_decline": 63,
      "total_stock_no_change": 142,
      "total_stock_ceiling": 6,
      "total_stock_floor": 3,
      "time": "2026-08-17T08:05:00.000Z"
    }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/price/marketIndex/getList"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `symbols` chứa mã ngoài `VALID_INDEX_SYMBOLS` | `Mã chỉ số không hợp lệ: ['BAD']. Phải thuộc ['HNX30', 'HNXIndex', 'HNXUpcomIndex', 'VN30', 'VNINDEX']` |
| 502 | — | Provider trả về không phải mảng | `Expected list from market-index, got dict` |
| 503 | — | Timeout / lỗi kết nối / HTTP 5xx sau 3 lần retry | `POST /api/price/marketIndex/getList: <exception gốc>` |

**Fallback / suy giảm**

Không có nguồn dự phòng. Provider chết ⇒ **503**, không trả cache cũ, không trả `[]`. Provider trả mảng rỗng ⇒ **200 + `data: []`**, và response này **không được ghi cache** nên request kế tiếp lại đánh thẳng provider. Mã hợp lệ nhưng provider không có dữ liệu ⇒ mã đó **biến mất khỏi mảng** (không có phần tử `null`). Ngoài giờ: trả nguyên số chốt phiên gần nhất.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/market-index?symbols=VNINDEX,HNXIndex,VN30' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 3f1c9a20-8b4e-4d21-9f77-1a2b3c4d5e6f'
~~~

**Ghi chú khi viết lại**

- Tên field lệch có chủ đích: `total_stock_decline` ở đây vs `total_stock_decrease` ở `/overview/sectors/*`. Đừng "sửa cho đều".
- `total_value_million_vnd` là **triệu VND**; `price/ref_price/change` là **điểm chỉ số**, không phải VND.
- `price` dùng float, khác giá cổ phiếu ở `/overview/heatmap` dùng int VND.
- `symbols` split theo `,`, `.strip()` từng phần tử, **bỏ phần tử rỗng** trước khi validate ⇒ `?symbols=VNINDEX,,VN30` hợp lệ.
- Provider còn trả `estimatedChange`, `estimatedFsp`, `code`, `messageType`, `sendingTime` — normalizer **bỏ hết**.

---

### GET /api/v1/market-data/overview/liquidity

> **Thanh khoản tích lũy** — Chuỗi khối lượng và giá trị giao dịch tích lũy của thị trường theo từng mốc thời gian (mặc định từng phút).

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/liquidity:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/chart/v3/OHLCChart/gap-liquidity` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbols` | `string` | Không | `"ALL"` | ∈ `MdLiquiditySymbol` (một giá trị, **không** CSV) | `ALL` = toàn thị trường; còn lại là một chỉ số. Backend gói thành `[symbols]` khi gọi provider. |
| `time_frame` | `string` | Không | `"ONE_MINUTE"` | ∈ `MdTimeFrameLiquidity` | Độ mịn chuỗi. `ONE_MINUTE` = intraday. |
| `from_ts` | `number \| null` | Không | `now − 365×86400` | Unix epoch **giây**; không validate | Mốc đầu cửa sổ. |
| `to_ts` | `number \| null` | Không | `now` | Unix epoch **giây**; không validate | Mốc cuối cửa sổ. |

**Request body** — —

**Response 200**

~~~ts
interface MdLiquiditySeries {
  /** Mảng mã provider gộp trong chuỗi này (field provider là "symbol", số ít). */
  symbols: string[];
  /** Mốc thời gian, Unix epoch GIÂY, đã ép int. */
  timestamps: (number | null)[];
  /** KL tích lũy, CỔ PHIẾU, int. */
  accumulated_volume: (number | null)[];
  /** GTGD tích lũy, ĐƠN VỊ TRIỆU VND, float (chia 1.000 ra tỷ VND). */
  accumulated_value_million_vnd: (number | null)[];
  /** Mốc bắt đầu phiên khớp lệnh, epoch giây. */
  min_batch_trunc_time: number | null;
}
type MdLiquidityResponse = MdEnvelope<MdLiquiditySeries[]>;
~~~

~~~json
{
  "data": [
    {
      "symbols": ["VNINDEX", "HNXIndex", "HNXUpcomIndex"],
      "timestamps": [1786953600, 1786953660, 1786953720],
      "accumulated_volume": [1709305, 2138149, 3011870],
      "accumulated_value_million_vnd": [12054.6404, 16968.3834, 24310.114],
      "min_batch_trunc_time": 1786953600
    }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/chart/v3/OHLCChart/gap-liquidity"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `symbols` sai | `Giá trị symbols='BAD' không hợp lệ. Cho phép: ALL, HNXIndex, HNXUpcomIndex, VNINDEX` |
| 422 | — | `time_frame` sai | `Giá trị time_frame='BAD' không hợp lệ. Cho phép: ONE_DAY, ONE_MINUTE, ONE_MONTH, ONE_WEEK, ONE_YEAR` |
| 422 | — | `from_ts`/`to_ts` không phải số nguyên | `detail` là **array** của FastAPI (`type: "int_parsing"`) |
| 502 | — | Provider trả về không phải mảng | `Expected list from liquidity, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/chart/v3/OHLCChart/gap-liquidity: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ provider lỗi là **503**. Cửa sổ không có dữ liệu (ngoài giờ, ngày nghỉ, cửa sổ tương lai) ⇒ **200 + `data: []`** hoặc mảng có các list con rỗng — đây là hành vi bình thường, client phải tự xử "chưa có dữ liệu". Phần tử không phải dict trong mảng provider bị **bỏ qua âm thầm** (`continue`). Giá trị không parse được trong list ⇒ `null` **giữ đúng vị trí index**, nên độ dài `timestamps` / `accumulated_volume` / `accumulated_value_million_vnd` luôn bằng nhau theo provider.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/liquidity?symbols=ALL&time_frame=ONE_MINUTE&from_ts=1786953600&to_ts=1786982400' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 5c8d1e33-2a44-4f7b-8c19-77e0b4d2a901'
~~~

**Ghi chú khi viết lại**

- **Đổi tên field:** provider trả `symbol` (mảng) → backend trả `symbols`; provider trả `t` → backend trả `timestamps`.
- `from_ts`/`to_ts` **không** được validate: không `ge`, không kiểm tra `from < to`, không chặn tương lai. Cửa sổ vô lý ⇒ provider tự quyết (thường mảng rỗng).
- Default cửa sổ là **1 năm** dù `time_frame=ONE_MINUTE` — cặp mặc định này gần như không dùng được cho intraday. UI thực tế phải luôn truyền `from_ts`/`to_ts` (xem pattern hai phiên ở `docs/vietcap-market-overview-api-supplement.md:321–337`).
- Default `from_ts` và `to_ts` được tính từ **hai lần gọi `time.time()` riêng biệt** (`_default_from_to()` bị gọi hai lần trong cùng biểu thức) — lệch vài micro-giây, vô hại nhưng nên viết lại thành một lần lấy `now`.
- Cache key **chỉ gồm query params**; cửa sổ mặc định (phụ thuộc `now`) **không** nằm trong key ⇒ trong 30s TTL, request không truyền `from_ts/to_ts` sẽ nhận lại cửa sổ cũ. Chấp nhận được với TTL 30s, nhưng phải biết.
- Đơn vị: `accumulated_volume` là **int cổ phiếu**, `accumulated_value_million_vnd` là **float triệu VND**. Không đồng nhất kiểu là cố ý.

---

### GET /api/v1/market-data/overview/breadth

> **Độ rộng thị trường** — Số mã và tỷ lệ mã đang nằm trên đường EMA/SMA theo từng ngày giao dịch.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/breadth:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap IQ — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/breadth` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `condition` | `string` | Không | `"EMA50"` | ∈ `MdBreadthCondition` | Đường kỹ thuật dùng làm mốc so sánh. |
| `exchange` | `string` | Không | `"HSX,HNX,UPCOM"` | CSV; mỗi token sau `.strip()` ∈ `MdBreadthExchange` | Sàn tính độ rộng. **Chỉ nhận `HSX`, không nhận `HOSE`.** |
| `period` | `string` | Không | `"Y1"` | ∈ `MdBreadthPeriod` | Độ dài chuỗi lịch sử. Gửi lên provider dưới tên `enNumberOfDays`. |

**Request body** — —

**Response 200**

~~~ts
interface MdBreadthPoint {
  condition: string;            // echo của provider, vd "EMA50"
  count: number | null;         // số mã thoả điều kiện, int
  total: number | null;         // tổng số mã xét, int
  /** TỶ LỆ 0–1 (0.3512 = 35,12%) — KHÔNG phải phần trăm. */
  percent: number | null;
  trading_date: string;         // "YYYY-MM-DD"; "" nếu provider thiếu
}
type MdBreadthResponse = MdEnvelope<MdBreadthPoint[]>;
~~~

~~~json
{
  "data": [
    { "condition": "EMA50", "count": 556, "total": 1584, "percent": 0.351, "trading_date": "2026-08-13" },
    { "condition": "EMA50", "count": 583, "total": 1585, "percent": 0.3678, "trading_date": "2026-08-14" },
    { "condition": "EMA50", "count": 612, "total": 1585, "percent": 0.3861, "trading_date": "2026-08-17" }
  ],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/breadth"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `condition` sai | `Giá trị condition='BAD' không hợp lệ. Cho phép: EMA20, EMA50, SMA200, SMA50` |
| 422 | — | `period` sai | `Giá trị period='BAD' không hợp lệ. Cho phép: ALL, M6, Y1, Y2, Y5, YTD` |
| 422 | — | Có token `exchange` sai (kể cả `HOSE`) | `Giá trị exchange='HOSE' không hợp lệ. Cho phép: HNX, HSX, UPCOM` |
| 502 | — | Envelope IQ không phải dict | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/breadth, got list` |
| 502 | — | `successful != true` | `API unsuccessful: <msg của provider hoặc "unknown">` |
| 502 | — | `data` không phải mảng | `Expected list from breadth, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /api/iq-insight-service/v1/market-watch/breadth: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503 khi provider chết. Dữ liệu EOD nên **trong phiên vẫn là số của phiên trước** — không có cơ chế nội suy. Provider trả `data: []` ⇒ 200 + `data: []` (không cache). Phần tử không phải dict bị bỏ qua.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/breadth?condition=EMA50&exchange=HSX,HNX,UPCOM&period=Y1' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 7a2b9c40-11de-4c05-9b6a-8f3e2d1c4b55'
~~~

**Ghi chú khi viết lại**

- **`percent` là phân số 0–1.** UI phải ×100. Cùng chương, `/overview/sectors/allocation` lại trả %biến động ở đơn vị phần trăm — hai quy ước khác nhau, đừng dùng chung formatter.
- **Đổi tên tham số:** `period` (API IQX) → `enNumberOfDays` (provider). Giữ nguyên tên `period` ở API ngoài để không vỡ frontend.
- `exchange` được validate theo từng token **sau `.strip()`**, nhưng giá trị **gửi lên provider là chuỗi gốc chưa strip** ⇒ `?exchange=HSX, HNX` qua được validate và provider nhận `"HSX, HNX"` (có dấu cách). Bản TS nên **normalize lại chuỗi** (`tokens.map(t => t.trim()).join(",")`) trước khi gọi provider.
- Thứ tự kiểm tra trong handler: `condition` → `period` → từng token `exchange`. Giữ đúng thứ tự nếu muốn message lỗi khớp 1-1.
- Không có cách yêu cầu "chỉ ngày mới nhất": provider luôn trả cả chuỗi theo `period`. Muốn 1 điểm thì lấy phần tử cuối (chuỗi tăng dần theo `trading_date`).

---

### GET /api/v1/market-data/overview/valuation

> **Định giá chỉ số** — Chuỗi lịch sử P/E hoặc P/B của một nhóm chỉ số (VN-Index, VN30, VN100…).

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/valuation:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `GET https://trading.vietcap.com.vn/api/iq-insight-service/v1/market-watch/index-valuation` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `type` | `string` | Không | `"pe"` | ∈ `MdValuationType` | Loại chỉ số định giá. Tham số HTTP tên `type` (biến nội bộ `val_type`). |
| `com_group_code` | `string` | Không | `"VNINDEX"` | ∈ `MdComGroupCode` | Nhóm chỉ số. Gửi provider dưới tên `comGroupCode`. |
| `time_frame` | `string` | Không | `"ONE_YEAR"` | ∈ `MdTimeFrameValuation` | Độ dài chuỗi. **Bộ giá trị riêng**, khác `MdTimeFrameImpact`. |

**Request body** — —

**Response 200**

~~~ts
interface MdValuationPoint {
  date: string;                 // "YYYY-MM-DD"; "" nếu provider thiếu
  /** Giá trị P/E hoặc P/B — TỶ SỐ (lần), không phải % và không phải VND. */
  value: number | null;
}
type MdValuationResponse = MdEnvelope<MdValuationPoint[]>;
~~~

~~~json
{
  "data": [
    { "date": "2026-08-13", "value": 14.8321 },
    { "date": "2026-08-14", "value": 14.9017 },
    { "date": "2026-08-17", "value": 15.0442 }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/iq-insight-service/v1/market-watch/index-valuation"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `type` sai | `Giá trị type='bad' không hợp lệ. Cho phép: pb, pe` |
| 422 | — | `com_group_code` sai | `Giá trị com_group_code='VNXALL' không hợp lệ. Cho phép: HNX30, VN100, VN30, VNINDEX, VNMIDCAP, VNSMALLCAP` |
| 422 | — | `time_frame` sai (vd `ONE_MONTH`) | `Giá trị time_frame='ONE_MONTH' không hợp lệ. Cho phép: ALL, FIVE_YEAR, ONE_YEAR, SIX_MONTHS, TWO_YEAR, YTD` |
| 502 | — | Envelope IQ sai / `successful != true` | `Expected dict from <url>, got list` \| `API unsuccessful: <msg>` |
| 502 | — | Thiếu `values` trong `data` | `Missing required key 'values' in valuation` |
| 502 | — | `values` không phải mảng | `Expected list from valuation.values, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /api/iq-insight-service/v1/market-watch/index-valuation: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503 khi provider chết. Dữ liệu EOD: trong phiên trả chuỗi đến ngày giao dịch gần nhất đã chốt. Nhóm chỉ số hợp lệ nhưng provider chưa có dữ liệu ⇒ `data: []` (200, không cache).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/valuation?type=pe&com_group_code=VNINDEX&time_frame=ONE_YEAR' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 9d4e5f61-3c72-4a88-b0d3-6e5f4a3b2c11'
~~~

**Ghi chú khi viết lại**

- **Bẫy host:** endpoint này gọi đường dẫn `iq-insight-service` nhưng trên host `trading.vietcap.com.vn` (dùng `_get_trading`), **không** phải `iq.vietcap.com.vn` như `/overview/breadth`, `/overview/proprietary/top`, `/overview/stock-strength`. Copy sai host là 404/403.
- `time_frame` ở đây **không giao** với `MdTimeFrameImpact`: `ONE_DAY`/`ONE_WEEK`/`ONE_MONTH` đều bị 422; ngược lại `SIX_MONTHS`/`TWO_YEAR`/`FIVE_YEAR`/`ALL` chỉ hợp lệ ở đây.
- Tên tham số công khai là `type` (từ khoá trong nhiều ngôn ngữ) — trong NestJS nên khai báo DTO field khác tên rồi map bằng decorator, giữ nguyên tên trên query string.
- `value` là **tỷ số**: P/E 15.04 nghĩa là 15,04 lần. Không format kiểu tiền, không thêm `%`.
- Thứ tự kiểm tra: `type` → `com_group_code` → `time_frame`.

---

### GET /api/v1/market-data/overview/allocation

> **Phân bổ dòng tiền thị trường** — Tổng GTGD và số mã, chia theo nhóm tăng giá / không đổi / giảm giá, tách theo từng sàn.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/allocation:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/market-watch/AllocatedValue/getAllocatedValue` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `group` | `string` | Không | `"ALL"` | ∈ `MdGroup` | Sàn cần phân bổ. `ALL` ⇒ provider trả cả HOSE, HNX, UPCOM. |
| `time_frame` | `string` | Không | `"ONE_YEAR"` | ∈ `MdTimeFrameImpact` | Kỳ luỹ kế. |

**Request body** — —

**Response 200**

~~~ts
/**
 * Dạng dữ liệu ĐẶC BIỆT: mỗi phần tử là một object có KHOÁ ĐỘNG dạng
 * `{sectionKey}_{group}` (camelCase, KHÔNG snake_case như các endpoint khác).
 * sectionKey ∈ totalIncrease | totalNochange | totalDecrease |
 *             totalSymbolIncrease | totalSymbolNochange | totalSymbolDecrease
 * group ∈ HOSE | HNX | UPCOM (theo dữ liệu provider trả về).
 * Giá trị: 3 section đầu = GTGD ĐƠN VỊ VND (int); 3 section "Symbol" = SỐ MÃ (int).
 */
type MdAllocationBlock = Record<string, number | null>;
type MdAllocationResponse = MdEnvelope<MdAllocationBlock[]>;
~~~

~~~json
{
  "data": [
    {
      "totalIncrease_HOSE": 6054816465075510,
      "totalNochange_HOSE": 553814248330,
      "totalDecrease_HOSE": 624482184610010,
      "totalSymbolIncrease_HOSE": 264,
      "totalSymbolNochange_HOSE": 1,
      "totalSymbolDecrease_HOSE": 180,
      "totalIncrease_HNX": 412903118445200,
      "totalNochange_HNX": 21884300150,
      "totalDecrease_HNX": 88117045220300,
      "totalSymbolIncrease_HNX": 96,
      "totalSymbolNochange_HNX": 4,
      "totalSymbolDecrease_HNX": 63
    }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/AllocatedValue/getAllocatedValue"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `group` sai | `Giá trị group='BAD' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `time_frame` sai | `Giá trị time_frame='BAD' không hợp lệ. Cho phép: ONE_DAY, ONE_MONTH, ONE_WEEK, ONE_YEAR, YTD` |
| 502 | — | Provider trả về không phải mảng | `Expected list from allocation, got str` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/market-watch/AllocatedValue/getAllocatedValue: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. Section nào provider không trả thì **khoá tương ứng vắng mặt** trong object (không phải `null`) — client phải dùng optional access. Provider trả `[]` ⇒ 200 + `data: []` (không cache). Phần tử không phải dict bị bỏ qua; section không phải list được coi như list rỗng.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/allocation?group=ALL&time_frame=ONE_DAY' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 2b6c7d81-4e15-4bb9-8d22-9c0a1f2e3d44'
~~~

**Ghi chú khi viết lại**

- Provider trả khoá có **hậu tố động theo `time_frame`** (`totalAccumulatedValueChangeHigh_t_last_year`, `..._t_today`, `..._t_one_week`…). Normalizer **bỏ hoàn toàn tên khoá gốc** và thay bằng `{sectionKey}_{group}`. Bản TS phải làm y hệt: đọc `item["group"]`, rồi lấy **giá trị** của các khoá còn lại, không phụ thuộc tên khoá provider.
- **Bẫy mất dữ liệu:** nếu một item trong section có **nhiều hơn một** khoá khác `group`, tất cả cùng ghi vào một khoá `{sectionKey}_{group}` ⇒ **giá trị cuối cùng thắng**, các giá trị trước bị mất âm thầm. Hiện provider chỉ trả 1 khoá/item nên chưa lộ. Bản TS nên giữ hành vi này (để không đổi shape) nhưng **log warning** khi gặp >1 khoá.
- Khoá trả về là **camelCase**, khác toàn bộ chương (snake_case). Không "chuẩn hoá" lại nếu không muốn vỡ frontend.
- Đơn vị: `totalIncrease*/totalNochange*/totalDecrease*` = **VND**; `totalSymbol*` = **số mã**. Cùng một object trộn hai đơn vị.
- `data` gần như luôn có **1 phần tử** (provider gộp mọi sàn vào một block). Đừng giả định 1 phần tử = 1 sàn.

---

### GET /api/v1/market-data/overview/stock-strength

> **Điểm sức mạnh cổ phiếu (TA)** — Map phẳng `{mã: điểm}` do bộ phân tích kỹ thuật của Vietcap tính, dùng để tô màu/xếp hạng heatmap.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/stock-strength:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap IQ — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/ta/stock-strength` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `exchange` | `string` | Không | `"ALL"` | ∈ `MdStrengthExchange` (`ALL`, `HOSE`, `HNX`, `UPCOM`, `HSX`) | Sàn cần lấy điểm. `HSX` trả kết quả **giống `ALL`** (~1538 mã). |

**Request body** — —

**Response 200**

~~~ts
/**
 * Map phẳng: khoá = mã cổ phiếu, giá trị = điểm sức mạnh kỹ thuật (SỐ NGUYÊN 3–99).
 * Mã có điểm null/không phải int bị LOẠI KHỎI map (khoá vắng mặt, không phải 0).
 */
type MdStockStrengthMap = Record<string, number>;
type MdStockStrengthResponse = MdEnvelope<MdStockStrengthMap>;
~~~

~~~json
{
  "data": {
    "FPT": 45,
    "VCB": 72,
    "HPG": 15,
    "VNM": 38,
    "ACB": 33,
    "VIC": 88
  },
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/ta/stock-strength"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `exchange` sai | `Giá trị exchange không hợp lệ: BAD. Phải thuộc ['ALL', 'HNX', 'HOSE', 'HSX', 'UPCOM']` |
| 502 | — | Envelope IQ sai / `successful != true` | `Expected dict from <url>, got list` \| `API unsuccessful: <msg>` |
| 502 | — | `data` không phải dict | `Expected dict from stock-strength, got list` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /api/iq-insight-service/v1/ta/stock-strength: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. **Mã chưa có điểm sẽ vắng mặt** khỏi map (provider trả `null` → bị filter bỏ) — client phải phân biệt "vắng mặt" với "điểm 0", tuyệt đối không coi vắng mặt là 0 (0 nghĩa là yếu nhất). Điểm là **EOD**: trong phiên vẫn là điểm phiên trước. Provider trả `{}` ⇒ 200 + `data: {}` (không cache).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/stock-strength?exchange=HOSE' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 6e1f2a03-9d54-4c67-a8b1-3f4e5d6c7b88'
~~~

**Ghi chú khi viết lại**

- **Message 422 khác khuôn:** dùng `Giá trị exchange không hợp lệ: {val}. Phải thuộc [...]` (repr list Python, có dấu nháy đơn), **không** phải khuôn `Giá trị {name}='{val}' không hợp lệ. Cho phép: ...` của các endpoint enum khác. Phải copy đúng cả dấu nháy nếu frontend so khớp chuỗi.
- Bộ giá trị `exchange` ở đây là **duy nhất trong chương** chấp nhận cả `HOSE` và `HSX`.
- Filter là `isinstance(v, int)` (`vietcap_market_overview.py:696–699`). Hai hệ quả: (1) provider đổi sang trả **float** (`45.0`) thì mã đó **mất khỏi response**; (2) trong Python `bool` là con của `int` nên nếu provider trả `true` thì giá trị `true` **đi thẳng vào response**. Bản TS nên giữ khi `Number.isInteger(v)` (đã loại boolean) và log warning khi gặp số thực để phát hiện provider thay đổi.
- Response là map với ~1538 khoá (ALL) — payload lớn; giữ TTL cache 30s và nén gzip.
- Không có tên công ty, không có sàn của từng mã. Muốn hiển thị thì join với `/reference/symbols`.

---

### GET /api/v1/market-data/overview/maintenance

> **Thông báo bảo trì của provider** — Trả danh sách banner bảo trì mà Vietcap IQ đang phát; rỗng nghĩa là provider **không** báo bảo trì.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/maintenance:_`, TTL **30s**; response rỗng **không** được ghi cache |
| **Nguồn dữ liệu** | provider ngoài Vietcap IQ — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/notification?type=maintenance` |
| **Side-effect** | — |

**Path params** — —

**Query params** — — (không nhận tham số nào; `type=maintenance` do backend tự gắn khi gọi provider)

**Request body** — —

**Response 200**

~~~ts
/**
 * PASSTHROUGH THÔ — endpoint DUY NHẤT trong chương không normalize field nào.
 * - provider trả array  ⇒ trả nguyên array đó
 * - provider trả object rỗng ⇒ []
 * - provider trả object có nội dung ⇒ [object]
 * - provider trả kiểu khác (string/number/null) ⇒ []
 * Shape phần tử do provider định nghĩa, CHƯA XÁC ĐỊNH đầy đủ —
 * xem app/services/market_data/sources/vietcap_market_overview.py:797–808
 * (source không đọc field nào nên không thể suy ra tên field một cách chắc chắn).
 */
type MdMaintenanceResponse = MdEnvelope<Record<string, unknown>[]>;
~~~

~~~json
{
  "data": [],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/notification"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 502 | — | Envelope IQ không phải dict | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/notification, got list` |
| 502 | — | `successful != true` | `API unsuccessful: <msg của provider hoặc "unknown">` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /api/iq-insight-service/v1/notification: <exception gốc>` |

**Fallback / suy giảm**

**Ý nghĩa thật:** đây **không** phải trạng thái bảo trì của backend IQX, cũng **không** phải cờ bật/tắt tính năng. Nó chỉ chuyển tiếp thông báo bảo trì của **Vietcap IQ**. Vì vậy:

- `data: []` (trường hợp thường gặp nhất) = provider không báo bảo trì ⇒ UI **không** hiện banner.
- Provider chết ⇒ **503**. Nghịch lý cần biết: đúng lúc provider bảo trì hạ tầng thì endpoint này có thể 503 chứ không trả nội dung bảo trì. **Client phải coi 503 ở đây là "không xác định", không được chặn UI.**
- Vì response rỗng không được cache, endpoint này gọi provider ở **mọi** request khi thị trường bình thường. Nếu dùng để poll banner, hãy đặt nhịp poll ≥ 60s ở client.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/maintenance' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 8c3d4e15-7a26-4b98-9e0f-2d1c3b4a5f66'
~~~

**Ghi chú khi viết lại**

- Giữ **passthrough thô**: đừng tự định nghĩa shape banner rồi map field — sẽ bịa dữ liệu. Nếu cần shape ổn định, phải khảo sát provider khi đang có bảo trì thật rồi bổ sung tài liệu.
- Quy tắc gói dict thành list phải giữ đúng: dict rỗng → `[]`, dict có nội dung → `[dict]`. Đây là chỗ dễ viết sai thành `[{}]`.
- `source_url` **không** chứa `?type=maintenance` (params truyền riêng cho httpx) — đúng như quy ước `MdEnvelope`.
- Endpoint không có query param nên cache key kết thúc bằng `:_`.

---

## Tổng quan: dòng tiền khối ngoại & tự doanh

### GET /api/v1/market-data/overview/index-impact

> **Nhóm dẫn dắt chỉ số** — Top mã kéo chỉ số tăng (`top_up`) và kéo chỉ số giảm (`top_down`), đo bằng **điểm chỉ số**.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/index-impact:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/market-watch/v2/IndexImpactChart/getData` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `group` | `string` | Không | `"ALL"` | ∈ `MdGroup` | Sàn/nhóm tính ảnh hưởng. |
| `time_frame` | `string` | Không | `"ONE_DAY"` | ∈ `MdTimeFrameImpact` | Kỳ tích luỹ ảnh hưởng (hôm nay / 1W / 1M / YTD / 1Y). |

**Request body** — —

**Response 200**

~~~ts
interface MdIndexImpactResponseData {
  /** Mã đóng góp TĂNG điểm, provider sắp xếp giảm dần theo impact. */
  top_up: MdImpactStock[];
  /** Mã đóng góp GIẢM điểm; impact âm. */
  top_down: MdImpactStock[];
  /** Echo tham số đầu vào (backend tự gắn, không phải của provider). */
  group: MdGroup;
  time_frame: MdTimeFrameImpact;
}
type MdIndexImpactResponse = MdEnvelope<MdIndexImpactResponseData>;
~~~

~~~json
{
  "data": {
    "top_up": [
      {
        "symbol": "VCB",
        "impact": 3.412,
        "exchange": "HOSE",
        "company_name": "Ngan hang TMCP Ngoai thuong Viet Nam",
        "match_price": 68900,
        "ref_price": 67500.0
      },
      {
        "symbol": "HPG",
        "impact": 1.087,
        "exchange": "HOSE",
        "company_name": "Cong ty Co phan Tap doan Hoa Phat",
        "match_price": 31450,
        "ref_price": 30900.0
      }
    ],
    "top_down": [
      {
        "symbol": "FPT",
        "impact": -2.156,
        "exchange": "HOSE",
        "company_name": "Cong ty Co phan FPT",
        "match_price": 73400,
        "ref_price": 74300.0
      }
    ],
    "group": "ALL",
    "time_frame": "ONE_DAY"
  },
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/v2/IndexImpactChart/getData"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `group` sai | `Giá trị group='BAD' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `time_frame` sai | `Giá trị time_frame='BAD' không hợp lệ. Cho phép: ONE_DAY, ONE_MONTH, ONE_WEEK, ONE_YEAR, YTD` |
| 502 | — | Provider trả về không phải dict | `Expected dict from index-impact, got list` |
| 502 | — | Thiếu `topUp` | `Missing required key 'topUp' in index-impact` |
| 502 | — | Thiếu `topDown` | `Missing required key 'topDown' in index-impact` |
| 502 | — | `topUp`/`topDown` không phải mảng | `Expected list from index-impact.topUp, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/market-watch/v2/IndexImpactChart/getData: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. **Bắt buộc có cả hai khoá** `topUp` và `topDown`: thiếu một trong hai là **502**, không phải mảng rỗng — khác hẳn `/overview/proprietary/top` (thiếu khoá ⇒ `[]`). Hai mảng có thể rỗng (200 + `top_up: []`) khi kỳ được chọn không có mã nào cùng chiều. Ngoài giờ với `time_frame=ONE_DAY`: trả nguyên ảnh hưởng của phiên gần nhất.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/index-impact?group=ALL&time_frame=ONE_DAY' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 4d5e6f27-8b39-4a01-9c72-5e6f7a8b9c00'
~~~

**Ghi chú khi viết lại**

- **Công thức `impact` do provider tính, backend KHÔNG tính lại.** Đơn vị là **điểm chỉ số** (index point): `impact = -2.156` nghĩa là mã đó làm chỉ số giảm 2,156 điểm trong kỳ. Dấu âm = kéo giảm, dương = đóng góp tăng (`docs/vietcap-market-overview-api.md:179`). Công thức nội bộ (free-float, divisor) **CHƯA XÁC ĐỊNH** — không có trong source lẫn tài liệu provider; xem `app/services/market_data/sources/vietcap_market_overview.py:248–283`. Tuyệt đối **không** tự suy ra `(matchPrice − refPrice) × KLLH / divisor` rồi ghi vào tài liệu.
- Tổng `impact` của `top_up` + `top_down` **không** bằng biến động chỉ số vì đây chỉ là *top* mã, không phải toàn bộ.
- Bất đối xứng kiểu số trong cùng một bản ghi: `match_price` là **int** (`_to_int_amount`), `ref_price` là **float** (`_to_float_ratio`). Giữ nguyên, đừng "làm đẹp".
- `data.group` / `data.time_frame` là **echo do backend gắn**, không phải field provider — hữu ích để client biết response ứng với bộ lọc nào khi race điều kiện.
- Provider còn trả `enOrganName`, `organShortName`, `ceiling`, `floor`, `timeFrame` — normalizer bỏ hết. `company_name` lấy từ `organName` (tiếng Việt **không dấu**).

---

### GET /api/v1/market-data/overview/foreign

> **Dòng tiền khối ngoại theo thời gian** — Chuỗi khối lượng và giá trị mua/bán của khối ngoại trên toàn thị trường.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/foreign:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/market-watch/v3/ForeignVolumeChart/getAll` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `group` | `string` | Không | `"ALL"` | ∈ `MdGroup` | Sàn/nhóm. |
| `time_frame` | `string` | Không | `"ONE_MONTH"` | ∈ `MdTimeFrameImpact` | Độ mịn/kỳ của chuỗi. **`ONE_MINUTE` bị 422** dù provider hỗ trợ (xem ghi chú). |
| `from_ts` | `number \| null` | Không | `now − 365×86400` | Unix epoch **giây**; không validate | Mốc đầu cửa sổ. |
| `to_ts` | `number \| null` | Không | `now` | Unix epoch **giây**; không validate | Mốc cuối cửa sổ. |

**Request body** — —

**Response 200**

~~~ts
interface MdForeignPoint {
  /** Mốc thời gian của điểm dữ liệu, Unix epoch GIÂY (int). */
  trunc_time: number | null;
  foreign_buy_volume: number | null;     // cổ phiếu, int
  foreign_sell_volume: number | null;    // cổ phiếu, int
  foreign_buy_value_vnd: number | null;  // VND, int
  foreign_sell_value_vnd: number | null; // VND, int
  /** Echo THÔ từ provider (item["group"]), "" nếu thiếu. */
  group: string;
  /** Echo THÔ từ provider (item["timeFrame"]), "" nếu thiếu. */
  time_frame: string;
}
type MdForeignResponse = MdEnvelope<MdForeignPoint[]>;
~~~

~~~json
{
  "data": [
    {
      "trunc_time": 1784620800,
      "foreign_buy_volume": 289245061,
      "foreign_sell_volume": 286834860,
      "foreign_buy_value_vnd": 8663969161680,
      "foreign_sell_value_vnd": 9193330589610,
      "group": "ALL",
      "time_frame": "ONE_MONTH"
    },
    {
      "trunc_time": 1787299200,
      "foreign_buy_volume": 312880417,
      "foreign_sell_volume": 271004933,
      "foreign_buy_value_vnd": 10142887530200,
      "foreign_sell_value_vnd": 8730115442100,
      "group": "ALL",
      "time_frame": "ONE_MONTH"
    }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/v3/ForeignVolumeChart/getAll"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `group` sai | `Giá trị group='BAD' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `time_frame` sai (kể cả `ONE_MINUTE`) | `Giá trị time_frame='ONE_MINUTE' không hợp lệ. Cho phép: ONE_DAY, ONE_MONTH, ONE_WEEK, ONE_YEAR, YTD` |
| 422 | — | `from_ts`/`to_ts` không phải số nguyên | `detail` là **array** của FastAPI |
| 502 | — | Provider trả về không phải mảng | `Expected list from foreign, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/market-watch/v3/ForeignVolumeChart/getAll: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. Cửa sổ không có dữ liệu ⇒ **200 + `data: []`** (không cache). Không có field "ròng": client tự tính `net_volume = buy − sell`, `net_value = buy_value − sell_value`; nếu một trong hai là `null` thì kết quả **phải là `null`**, không được coi `null` = 0.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/foreign?group=ALL&time_frame=ONE_MONTH&from_ts=1755388800&to_ts=1787011200' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 1f2e3d4c-5b6a-4798-8c0d-9e8f7a6b5c44'
~~~

**Ghi chú khi viết lại**

- **Hạn chế đã biết:** provider hỗ trợ `timeFrame=ONE_MINUTE` cho biểu đồ khối ngoại intraday (`docs/vietcap-market-overview-api-supplement.md:272–304`), nhưng handler validate theo `TIME_FRAMES_IMPACT` (không có `ONE_MINUTE`) nên **API IQX không thể lấy dữ liệu intraday khối ngoại**. Hành vi ĐÚNG nên làm ở bản TS: dùng riêng một enum cho endpoint này gồm `ONE_MINUTE | ONE_DAY | ONE_WEEK | ONE_MONTH | YTD | ONE_YEAR` (mở rộng, không phá tương thích vì chỉ nới lỏng).
- `group` và `time_frame` trong **từng phần tử** là echo **thô của provider** (có thể `""`), không phải echo tham số như `/overview/index-impact`. Đừng tin tuyệt đối để render bộ lọc.
- Default cửa sổ 1 năm **không phụ thuộc `time_frame`** (giống `/overview/foreign/top`) — xem phân tích ở endpoint kế tiếp.
- Đơn vị: `*_volume` = **cổ phiếu**, `*_value_vnd` = **VND** (không phải triệu VND như liquidity/heatmap).
- Provider trả `dataType` — bị bỏ.

---

### GET /api/v1/market-data/overview/foreign/top

> **Top mã khối ngoại mua/bán ròng** — Danh sách mã ngoại mua ròng mạnh nhất, bán ròng mạnh nhất, kèm tổng giá trị ròng hai chiều.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/foreign/top:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/market-watch/v3/ForeignNetValue/top` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `group` | `string` | Không | `"ALL"` | ∈ `MdGroup` | Sàn/nhóm. |
| `time_frame` | `string` | Không | `"ONE_YEAR"` | ∈ `MdTimeFrameImpact` | Kỳ tính ròng. **Default khác `/overview/foreign` (`ONE_MONTH`).** |
| `from_ts` | `number \| null` | Không | `now − 365×86400` | Unix epoch **giây**; không validate | Mốc đầu cửa sổ, **được gửi lên provider** trong body `from`. |
| `to_ts` | `number \| null` | Không | `now` | Unix epoch **giây**; không validate | Mốc cuối cửa sổ, gửi lên body `to`. |

**Request body** — —

**Response 200**

~~~ts
interface MdForeignTopData {
  net_buy: MdForeignTopStock[];   // mua ròng, net dương
  net_sell: MdForeignTopStock[];  // bán ròng, net âm
  /** Tổng mua ròng toàn kỳ, VND, int. */
  total_net_buy_vnd: number | null;
  /** Tổng bán ròng toàn kỳ, VND, int (thường âm). */
  total_net_sell_vnd: number | null;
  /** Echo tham số group do backend gắn. LƯU Ý: KHÔNG có echo time_frame. */
  group: MdGroup;
}
type MdForeignTopResponse = MdEnvelope<MdForeignTopData>;
~~~

~~~json
{
  "data": {
    "net_buy": [
      {
        "symbol": "VCB",
        "exchange": "HOSE",
        "company_name": "Ngan hang TMCP Ngoai thuong Viet Nam",
        "net_value_vnd": 2535474570550,
        "buy_value_vnd": 6575539160202,
        "sell_value_vnd": 4040064589652,
        "match_price": 68900,
        "ref_price": 67500.0
      }
    ],
    "net_sell": [
      {
        "symbol": "VNM",
        "exchange": "HOSE",
        "company_name": "Cong ty Co phan Sua Viet Nam",
        "net_value_vnd": -1187430022100,
        "buy_value_vnd": 902114300000,
        "sell_value_vnd": 2089544322100,
        "match_price": 61200,
        "ref_price": 61800.0
      }
    ],
    "total_net_buy_vnd": 18422900431500,
    "total_net_sell_vnd": -15903117840220,
    "group": "ALL"
  },
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/v3/ForeignNetValue/top"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `group` sai | `Giá trị group='BAD' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `time_frame` sai | `Giá trị time_frame='BAD' không hợp lệ. Cho phép: ONE_DAY, ONE_MONTH, ONE_WEEK, ONE_YEAR, YTD` |
| 502 | — | Provider trả về không phải dict | `Expected dict from foreign/top, got list` |
| 502 | — | Thiếu `netBuy` / `netSell` | `Missing required key 'netBuy' in foreign/top` |
| 502 | — | `netBuy`/`netSell` không phải mảng | `Expected list from foreign/top.netBuy, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/market-watch/v3/ForeignNetValue/top: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. **Bắt buộc có cả `netBuy` và `netSell`** — thiếu là 502 (khác `/overview/proprietary/top`). `totalNetBuy`/`totalNetSell` đọc bằng `.get()` nên **thiếu ⇒ `null`**, không 502. Kỳ không có mã nào cùng chiều ⇒ mảng rỗng (200).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/foreign/top?group=ALL&time_frame=ONE_DAY&from_ts=1787011200&to_ts=1787097600' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 0a1b2c3d-4e5f-4061-8273-6a5b4c3d2e11'
~~~

**Ghi chú khi viết lại**

*Trọng tâm: `from_ts`/`to_ts` được áp dụng thế nào — và ba sai sót của bản Python.*

1. **Có được áp dụng.** Cả `from_ts` và `to_ts` đều được đưa vào body provider (`{"from": ..., "to": ..., "group": ..., "timeFrame": ...}`), không bị bỏ như một số endpoint khác.
2. **Sai sót 1 — cửa sổ mặc định không khớp `time_frame`.** Khi client **không** truyền `from_ts/to_ts`, backend luôn dùng `now − 365 ngày .. now`, **bất kể `time_frame`**. Gọi `?time_frame=ONE_DAY` sẽ gửi `timeFrame=ONE_DAY` nhưng kèm cửa sổ 1 năm — kết quả phụ thuộc cách provider ưu tiên hai tham số và **không** khớp hợp đồng UI của provider (`docs/vietcap-market-overview-api.md:283–291`: Hôm nay ⇒ `startOfToday..endOfToday`, 1W ⇒ −7 ngày, 1M ⇒ −30 ngày, YTD ⇒ 01/01, 1Y ⇒ −365 ngày). **Hành vi ĐÚNG nên làm:** khi thiếu `from_ts/to_ts`, suy ra cửa sổ **từ `time_frame`** theo đúng bảng của provider, và chỉ dùng 365 ngày cho `ONE_YEAR`. Áp dụng y hệt cho `/overview/foreign` và `/overview/liquidity`.
3. **Sai sót 2 — `now` bị lấy hai lần.** Biểu thức `from_ts or _default_from_to()[0], to_ts or _default_from_to()[1]` gọi `time.time()` hai lần ⇒ `from` và `to` sinh từ hai mốc `now` khác nhau. Vô hại về nghiệp vụ nhưng bản TS nên lấy `now` một lần rồi tính cả hai mốc.
4. **Sai sót 3 — cửa sổ mặc định không nằm trong cache key.** Cache key chỉ băm query params; hai request cách nhau 20s không truyền `from_ts/to_ts` sẽ dùng chung cache dù cửa sổ danh nghĩa đã dịch. Với TTL 30s thì lệch tối đa 30s — chấp nhận được, nhưng nếu bản TS tăng TTL thì phải đưa cửa sổ đã chuẩn hoá (đã làm tròn theo phút/ngày) vào key.
5. **Không có echo `time_frame` trong `data`** (chỉ có `group`) — bất đối xứng với `/overview/index-impact`. Client muốn biết kỳ thì tự giữ.
6. Provider trả thêm `truncTime`, `timeFrame`, `group` (per-item), `organShortName`, `enOrganName` — normalizer bỏ hết. `net_value_vnd` lấy từ `net` của provider, không tự trừ.

---

### GET /api/v1/market-data/overview/proprietary

> **Tự doanh theo thời gian** — Chuỗi giá trị/khối lượng mua–bán của khối tự doanh công ty chứng khoán, theo từng ngày giao dịch.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/proprietary:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap (dữ liệu FiinTrade) — `GET https://trading.vietcap.com.vn/api/fiin-api-service/v3/proprietary-trading-value` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `market` | `string` | Không | `"ALL"` | ∈ `MdGroup` | Sàn. **Tên tham số là `market`** (không phải `group`/`exchange`) nhưng vẫn validate theo `GROUPS`. Gửi provider dưới tên `market`. |
| `time_frame` | `string` | Không | `"ONE_YEAR"` | ∈ `MdTimeFrameImpact` | Kỳ dữ liệu. Gửi provider dưới tên `timeFrame`. |

**Request body** — —

**Response 200**

~~~ts
interface MdProprietaryPoint {
  /** Ngày giao dịch, chuỗi THÔ của provider dạng ISO "YYYY-MM-DD"; "" nếu thiếu. */
  trading_date: string;
  total_buy_value_vnd: number | null;     // VND, int
  total_sell_value_vnd: number | null;    // VND, int
  total_buy_volume: number | null;        // cổ phiếu, int
  total_sell_volume: number | null;       // cổ phiếu, int
  /** KL mua qua giao dịch thoả thuận (deal/put-through), cổ phiếu. */
  total_deal_buy_volume: number | null;
  total_deal_sell_volume: number | null;
}
type MdProprietaryResponse = MdEnvelope<MdProprietaryPoint[]>;
~~~

~~~json
{
  "data": [
    {
      "trading_date": "2026-08-14",
      "total_buy_value_vnd": 8620030672700,
      "total_sell_value_vnd": 12248298998317,
      "total_buy_volume": 274568417,
      "total_sell_volume": 406465933,
      "total_deal_buy_volume": 39639118,
      "total_deal_sell_volume": 41220775
    },
    {
      "trading_date": "2026-08-17",
      "total_buy_value_vnd": 9914223100000,
      "total_sell_value_vnd": 8110447320500,
      "total_buy_volume": 301884200,
      "total_sell_volume": 259330800,
      "total_deal_buy_volume": 28114000,
      "total_deal_sell_volume": 19442300
    }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/fiin-api-service/v3/proprietary-trading-value"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `market` sai | `Giá trị market='BAD' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `time_frame` sai | `Giá trị time_frame='BAD' không hợp lệ. Cho phép: ONE_DAY, ONE_MONTH, ONE_WEEK, ONE_YEAR, YTD` |
| 502 | — | Envelope IQ sai / `successful != true` | `Expected dict from <url>, got list` \| `API unsuccessful: <msg>` |
| 502 | — | `data` (lớp ngoài) không phải dict | `Expected dict from proprietary.data, got list` |
| 502 | — | Thiếu `data.data` | `Missing required key 'data' in proprietary` |
| 502 | — | `data.data` không phải mảng | `Expected list from proprietary.data.data, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /api/fiin-api-service/v3/proprietary-trading-value: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. Dữ liệu tự doanh **trễ**: thường chỉ đầy đủ sau khi kết thúc phiên, nên trong phiên phần tử mới nhất có thể là ngày hôm trước — đọc `trading_date` của phần tử cuối để biết. Provider trả `data.data: []` ⇒ 200 + `data: []` (không cache). Phần tử không phải dict bị bỏ qua.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/proprietary?market=ALL&time_frame=ONE_MONTH' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 3c4d5e6f-7a8b-49c0-8d1e-2f3a4b5c6d77'
~~~

**Ghi chú khi viết lại**

- **Envelope hai lớp:** provider trả `{status, successful, data: {tradingDate, totalBuyValue, ..., data: [...]}}`. Backend `_unwrap_iq` lấy lớp `data`, rồi bắt buộc phải có `data["data"]` là mảng. **Toàn bộ field tổng ở lớp ngoài (`tradingDate`, `totalBuyValue`, `netValue`, `dataType`…) bị BỎ** — chúng thường `null` ở provider. Nếu bản TS muốn dùng, phải mở rộng normalizer, không tự bịa.
- **Không có `from_ts`/`to_ts`** ở endpoint này — upstream là GET chỉ nhận `timeFrame` + `market`. Đây **không** phải thiếu sót; giữ nguyên.
- Tên tham số `market` chỉ dùng ở endpoint này; `/overview/proprietary/top` dùng `exchange`, `/overview/foreign*` dùng `group`. Ba tên khác nhau cho cùng ý niệm — giữ đúng để không phá URL cũ.
- Không có field ròng: `net_value = total_buy_value_vnd − total_sell_value_vnd`, tính ở client, `null` lan truyền.
- Thứ tự phần tử theo provider (tăng dần theo ngày trong mẫu). Không sắp xếp lại ở backend; nếu UI cần thứ tự chắc chắn thì tự sort theo `trading_date`.

---

### GET /api/v1/market-data/overview/proprietary/top

> **Top mã tự doanh mua/bán** — Danh sách mã khối tự doanh mua nhiều nhất (`buy`) và bán nhiều nhất (`sell`) trong một ngày giao dịch.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/proprietary/top:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap IQ — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/top-proprietary` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `exchange` | `string` | Không | `"ALL"` | ∈ `MdGroup` (`ALL`, `HOSE`, `HNX`, `UPCOM`) — **`HSX` bị 422** | Sàn. Gửi provider dưới tên `exchange`. |
| `time_frame` | `string` | Không | `"ONE_YEAR"` | ∈ `MdTimeFrameImpact` | Kỳ tính. Gửi provider dưới tên `timeFrame`. |

**Request body** — —

**Response 200**

~~~ts
interface MdProprietaryTopData {
  buy: MdProprietaryTopStock[];   // provider key "BUY"
  sell: MdProprietaryTopStock[];  // provider key "SELL"
  /**
   * Ngày giao dịch của snapshot, chuỗi THÔ provider.
   * ĐỊNH DẠNG "DD/MM/YYYY" (vd "17/08/2026") — KHÁC /overview/proprietary
   * dùng "YYYY-MM-DD". "" nếu provider thiếu.
   */
  trading_date: string;
}
type MdProprietaryTopResponse = MdEnvelope<MdProprietaryTopData>;
~~~

~~~json
{
  "data": {
    "buy": [
      {
        "ticker": "HPG",
        "exchange": "HOSE",
        "company_name": "Cong ty Co phan Tap doan Hoa Phat",
        "total_value_vnd": 3200000000,
        "total_volume": 101750,
        "match_price": 31450,
        "ref_price": 30900.0
      }
    ],
    "sell": [
      {
        "ticker": "VNM",
        "exchange": "HOSE",
        "company_name": "Cong ty Co phan Sua Viet Nam",
        "total_value_vnd": -3589172164000,
        "total_volume": 58646600,
        "match_price": 61200,
        "ref_price": 61800.0
      }
    ],
    "trading_date": "17/08/2026"
  },
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/top-proprietary"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `exchange` sai (kể cả `HSX`) | `Giá trị exchange='HSX' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `time_frame` sai | `Giá trị time_frame='BAD' không hợp lệ. Cho phép: ONE_DAY, ONE_MONTH, ONE_WEEK, ONE_YEAR, YTD` |
| 502 | — | Envelope IQ sai / `successful != true` | `Expected dict from <url>, got list` \| `API unsuccessful: <msg>` |
| 502 | — | Lớp `data` không phải dict | `Expected dict from proprietary/top, got list` |
| 502 | — | Thiếu `data.data` | `Missing required key 'data' in proprietary/top` |
| 502 | — | `data.data` không phải dict | `Expected dict from proprietary/top.data, got list` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /api/iq-insight-service/v1/market-watch/top-proprietary: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. **Bất đối xứng quan trọng:** `BUY`/`SELL` được đọc bằng `.get(..., [])` ⇒ thiếu khoá ⇒ mảng **rỗng**, KHÔNG 502 (khác `/overview/foreign/top` và `/overview/index-impact` vốn 502 khi thiếu khoá). Ngoài giờ / trước khi FiinTrade chốt số: có thể trả `buy: []`, `sell: []` kèm `trading_date` của phiên trước — response này **vẫn được cache** vì `data` là dict không rỗng (có khoá `buy/sell/trading_date`), khác với các endpoint trả mảng rỗng.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/proprietary/top?exchange=ALL&time_frame=ONE_DAY' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 5f6a7b8c-9d0e-4f12-8a34-1b2c3d4e5f88'
~~~

**Ghi chú khi viết lại**

*Trọng tâm: tham số khoảng thời gian ở endpoint này.*

- **Endpoint này KHÔNG có `from_ts`/`to_ts`** và không cần: upstream chỉ nhận `timeFrame` + `exchange` (`docs/vietcap-market-overview-api.md:344–353`). Không phải bug, đừng "thêm cho đủ bộ" vì provider sẽ bỏ qua và gây kỳ vọng sai.
- `time_frame` **có** được gửi lên provider, nhưng response vẫn là snapshot của **một** `trading_date` — nghĩa là `time_frame` ảnh hưởng phạm vi tính tổng, không tạo chuỗi thời gian. Đừng vẽ chart theo endpoint này; dùng `/overview/proprietary`.
- **Bẫy định dạng ngày:** `trading_date` ở đây là `"17/08/2026"` (dd/MM/yyyy) còn `/overview/proprietary` là `"2026-08-17"` (ISO). Cùng một khái niệm, hai format, đều **passthrough thô**. Bản TS phải parse có chủ đích, tuyệt đối không dùng `new Date(s)` chung cho cả hai.
- **Bẫy tên field:** phần tử dùng `ticker`, không phải `symbol` như mọi endpoint khác trong chương.
- Dấu của `total_value_vnd`: âm = bán ròng, dương = mua ròng (`docs/vietcap-market-overview-api.md:389`). Mảng `sell` chứa giá trị **âm** — khi hiển thị "giá trị bán" nhớ lấy trị tuyệt đối, và khi cộng tổng thì đừng cộng lẫn hai mảng.
- `exchange` chặn `HSX` trong khi `/overview/stock-strength` cho phép — nếu frontend dùng chung state "sàn đang chọn" thì phải map `HSX → HOSE` trước khi gọi endpoint này.

---

## Tổng quan: nhiệt độ & ngành ICB

### GET /api/v1/market-data/overview/heatmap

> **Nhiệt độ thị trường theo ngành** — Mảng các ngành ICB, mỗi ngành lồng danh sách mã kèm giá, khối lượng, vốn hóa để vẽ treemap.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/heatmap:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getByIcb` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `group` | `string` | Không | `"ALL"` | ∈ `MdGroup` | Sàn lọc mã. |
| `sector` | `string` | Không | `"icb_code_2"` | ∈ `MdHeatmapSector` | **Cấp ICB dùng để gom nhóm**: `icb_code_1`…`icb_code_4`. Cấp càng sâu ⇒ càng nhiều ngành, mỗi ngành ít mã. |
| `size` | `string` | Không | `"MKC"` | ∈ `MdHeatmapSize` | Chỉ tiêu dùng làm **diện tích ô** treemap: `MKC` vốn hóa, `VOL` khối lượng, `VAL` giá trị. |

**Request body** — —

**Response 200**

~~~ts
interface MdHeatmapSector_ {
  icb_code: number | null;              // mã ngành ICB dạng số, vd 9500
  icb_name: string;                     // tên tiếng Việt (không dấu), "" nếu thiếu
  en_icb_name: string;                  // tên tiếng Anh
  /** %biến động ngành, ĐƠN VỊ PHẦN TRĂM (−1.1344 = −1,1344%). */
  icb_change_percent: number | null;
  total_market_cap_vnd: number | null;  // VND, int
  stocks: MdHeatmapStock[];
}
type MdHeatmapResponse = MdEnvelope<MdHeatmapSector_[]>;
~~~

~~~json
{
  "data": [
    {
      "icb_code": 9500,
      "icb_name": "Cong nghe Thong tin",
      "en_icb_name": "Technology",
      "icb_change_percent": -1.1344,
      "total_market_cap_vnd": 144073963290550,
      "stocks": [
        {
          "symbol": "FPT",
          "volume": 10459800,
          "value_million_vnd": 769854.19,
          "price": 73400,
          "ref_price": 74300,
          "market_cap_vnd": 126570579090300,
          "ceiling_price": 79500,
          "floor_price": 69100
        }
      ]
    },
    {
      "icb_code": 8300,
      "icb_name": "Ngan hang",
      "en_icb_name": "Banks",
      "icb_change_percent": 0.8412,
      "total_market_cap_vnd": 2731884120553000,
      "stocks": [
        {
          "symbol": "VCB",
          "volume": 4185300,
          "value_million_vnd": 288305.17,
          "price": 68900,
          "ref_price": 67500,
          "market_cap_vnd": 385442110000000,
          "ceiling_price": 72200,
          "floor_price": 62800
        }
      ]
    }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getByIcb"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `group` sai | `Giá trị group='BAD' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `sector` sai | `Giá trị sector='bad' không hợp lệ. Cho phép: icb_code_1, icb_code_2, icb_code_3, icb_code_4` |
| 422 | — | `size` sai | `Giá trị size='BAD' không hợp lệ. Cho phép: MKC, VAL, VOL` |
| 502 | — | Provider trả về không phải mảng | `Expected list from heatmap, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/market-watch/HeatMapChart/getByIcb: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. Ngành không có mã nào thoả `group` ⇒ `stocks: []` nhưng **ngành vẫn xuất hiện** trong mảng. Phần tử ngành không phải dict, hoặc mã không phải dict ⇒ **bỏ qua âm thầm**. Ngoài giờ: giá là giá chốt phiên gần nhất; `price` có thể bằng `ref_price` nếu mã không khớp lệnh nào.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/heatmap?group=ALL&sector=icb_code_2&size=MKC' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 7b8c9d0e-1f2a-4b34-8c56-7d8e9f0a1b22'
~~~

**Ghi chú khi viết lại**

- **`heatmap` vs `heatmap/index` khác nhau thế nào:** `/overview/heatmap` là **thân treemap** — có tham số (`group`, `sector`, `size`), trả **mảng ngành lồng mã**, giá cổ phiếu là **int VND**, GTGD từng mã là **triệu VND**. `/overview/heatmap/index` là **dải header** — **không tham số**, trả **một object** tổng toàn thị trường + giá 3 chỉ số dạng **float điểm**. Hai endpoint không thay thế được nhau và UI gọi cả hai song song.
- `size` chỉ được **chuyển tiếp** cho provider; các field trong response **không đổi tên/không đổi số lượng** theo `size`. Provider dùng nó để quyết định chỉ tiêu diện tích; ảnh hưởng chính xác lên dữ liệu trả về **CHƯA XÁC ĐỊNH** — xem `vietcap_market_overview.py:550–589` (source chỉ forward). Bản TS nên forward y hệt và để client tự chọn field làm diện tích (`market_cap_vnd` / `volume` / `value_million_vnd`).
- **Trộn đơn vị trong cùng một mã:** `value_million_vnd` = **triệu VND (float)**, `market_cap_vnd` = **VND (int)**. Ở cấp ngành, `total_market_cap_vnd` = **VND**.
- `icb_change_percent` ở đây là **phần trăm** (−1.1344 = −1,13%), khác `/sectors/information` trả **phân số**. Đây là cặp bẫy % nặng nhất của chương.
- Provider trả thêm ở cấp mã: `foreignBuyVolume`, `foreignSellVolume`, `foreignBuyValue`, `foreignSellValue`, `putThroughVolume`, `putThroughValue`; ở cấp ngành: `totalCapMulChangePercent`. **Normalizer bỏ hết** — nếu UI cần dữ liệu khối ngoại theo mã thì phải mở rộng normalizer, không lấy được từ endpoint này hiện tại.
- Payload lớn (toàn bộ mã của thị trường). Với `sector=icb_code_4` số ngành tăng mạnh; nên bật gzip và giữ TTL 30s.

---

### GET /api/v1/market-data/overview/heatmap/index

> **Dải tổng hợp cho heatmap** — Một object gồm tổng số mã, tổng KL/GTGD toàn thị trường, tổng mua–bán khối ngoại và giá 3 chỉ số chính.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/heatmap/index:_`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `GET https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getIndex` |
| **Side-effect** | — |

**Path params** — —

**Query params** — — (endpoint **không nhận tham số nào**; OpenAPI cũng không khai báo `422`)

**Request body** — —

**Response 200**

~~~ts
interface MdHeatmapIndexData {
  total_stock: number | null;                     // tổng số mã, int
  total_trading_volume: number | null;            // cổ phiếu, int
  /** Tổng GTGD toàn thị trường, ĐƠN VỊ TRIỆU VND (float). */
  total_trading_value_million_vnd: number | null;
  total_foreign_buy_volume: number | null;        // cổ phiếu, int
  total_foreign_sell_volume: number | null;       // cổ phiếu, int
  total_foreign_buy_value_vnd: number | null;     // VND, int
  total_foreign_sell_value_vnd: number | null;    // VND, int
  index_data: Array<{
    symbol: string;                               // "VNINDEX" | "HNXIndex" | "HNXUpcomIndex"
    price: number | null;                         // ĐIỂM chỉ số (float)
    ref_price: number | null;                     // ĐIỂM tham chiếu (float)
  }>;
}
type MdHeatmapIndexResponse = MdEnvelope<MdHeatmapIndexData>;
~~~

~~~json
{
  "data": {
    "total_stock": 1538,
    "total_trading_volume": 794400925,
    "total_trading_value_million_vnd": 21139697.99194,
    "total_foreign_buy_volume": 41925820,
    "total_foreign_sell_volume": 93163897,
    "total_foreign_buy_value_vnd": 1624704273500,
    "total_foreign_sell_value_vnd": 3572863448780,
    "index_data": [
      { "symbol": "VNINDEX", "price": 1912.44, "ref_price": 1898.71 },
      { "symbol": "HNXIndex", "price": 259.18, "ref_price": 257.44 },
      { "symbol": "HNXUpcomIndex", "price": 128.9, "ref_price": 128.31 }
    ]
  },
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getIndex"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 502 | — | Provider trả về không phải dict | `Expected dict from heatmap/index, got list` |
| 502 | — | Thiếu `indexData` | `Missing required key 'indexData' in heatmap/index` |
| 502 | — | `indexData` không phải mảng | `Expected list from heatmap/index.indexData, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /api/market-watch/HeatMapChart/getIndex: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. **`indexData` là khoá bắt buộc** — thiếu là 502; nhưng các field tổng đọc bằng `.get()` nên **thiếu ⇒ `null`**, response vẫn 200. Vì `data` luôn là dict có ≥ 8 khoá nên response này **luôn được ghi cache** (khác các endpoint trả mảng rỗng). Ngoài giờ: trả nguyên số chốt phiên.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/heatmap/index' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 9c0d1e2f-3a4b-4c56-8d78-9e0f1a2b3c33'
~~~

**Ghi chú khi viết lại**

- Không có tham số ⇒ cache key cố định `...:heatmap/index:_`. Đây là endpoint duy nhất trong nhóm heatmap không phân trang/không lọc.
- `index_data[].price` là **float điểm chỉ số** (giống `/overview/market-index`), trong khi `price` của mã ở `/overview/heatmap` là **int VND**. Cùng tên field, hai đơn vị.
- `total_trading_value_million_vnd` = **triệu VND**; `total_foreign_*_value_vnd` = **VND**. Trong cùng một object có hai đơn vị tiền — đây là lỗi dễ mắc nhất khi viết lại.
- Không có field ròng khối ngoại: tính `net = buy − sell` ở client, `null` lan truyền.
- Provider trả thêm `totalPtVolume`, `totalPtValue` (giao dịch thoả thuận) — **bị bỏ**. Muốn hiển thị thoả thuận toàn thị trường thì phải mở rộng normalizer.
- `index_data` chỉ có 3 chỉ số (VNINDEX, HNXIndex, HNXUpcomIndex) theo dữ liệu provider; **không** gồm VN30/HNX30. Cần VN30 ⇒ gọi `/overview/market-index?symbols=VN30`.

---

### GET /api/v1/market-data/overview/sectors/allocation

> **Phân bổ theo ngành ICB** — Mỗi ngành một dòng: GTGD, %biến động, số mã tăng/giảm/không đổi.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/sectors/allocation:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/market-watch/AllocatedICB/getAllocated` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `group` | `string` | Không | `"ALL"` | ∈ `MdGroup` | Sàn lọc mã trước khi gom theo ngành. |
| `time_frame` | `string` | Không | `"ONE_YEAR"` | ∈ `MdTimeFrameImpact` | Kỳ luỹ kế GTGD và %biến động. |

**Request body** — —

**Response 200**

~~~ts
type MdSectorsAllocationResponse = MdEnvelope<MdSectorAllocationRow[]>;
~~~

~~~json
{
  "data": [
    {
      "icb_code": 8300,
      "icb_change_percent": 23.1,
      "total_value_vnd": 1206973007276280,
      "total_stock_increase": 24,
      "total_stock_decrease": 18,
      "total_stock_no_change": 1,
      "icb_code_parent": null
    },
    {
      "icb_code": 8600,
      "icb_change_percent": -20.506,
      "total_value_vnd": 244260147127980,
      "total_stock_increase": 16,
      "total_stock_decrease": 11,
      "total_stock_no_change": 0,
      "icb_code_parent": null
    }
  ],
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/AllocatedICB/getAllocated"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `group` sai | `Giá trị group='BAD' không hợp lệ. Cho phép: ALL, HNX, HOSE, UPCOM` |
| 422 | — | `time_frame` sai | `Giá trị time_frame='BAD' không hợp lệ. Cho phép: ONE_DAY, ONE_MONTH, ONE_WEEK, ONE_YEAR, YTD` |
| 502 | — | Provider trả về không phải mảng | `Expected list from sectors, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/market-watch/AllocatedICB/getAllocated: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. Không có ngành nào ⇒ 200 + `data: []` (không cache). Field thiếu ở provider ⇒ `null` (đọc bằng `.get()`), riêng `icb_code_parent` là **passthrough thô** nên có thể là số, chuỗi hoặc `null`. Phần tử không phải dict bị bỏ qua.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/sectors/allocation?group=ALL&time_frame=ONE_DAY' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 2d3e4f50-6a7b-4c89-9d01-2e3f4a5b6c99'
~~~

**Ghi chú khi viết lại**

- **Không có tham số cấp ICB.** Khác `/overview/heatmap` (có `sector=icb_code_1..4`) và `/sectors/information` (có `icb_level`). Cấp ICB của các dòng trả về do provider quyết định — theo mẫu thực tế là mã 4 chữ số cấp 2 (`8300`, `8600`, `9000`, `8700`) với `icbCodeParent = null`. Cấp chính xác **CHƯA XÁC ĐỊNH** — xem `vietcap_market_overview.py:447–467`; không có tham số nào để đổi, đừng hứa với frontend là đổi được.
- **Không có tên ngành.** Phải join `icb_code` với `/api/v1/market-data/reference/industries`. `/overview/heatmap` mới là endpoint có sẵn tên.
- `icb_change_percent` là **phần trăm** (23.1 = 23,1%). `/sectors/information` trả **phân số**. Đừng dùng chung formatter.
- Khoá provider là `icb_code` (snake_case) trong khi các khoá khác là camelCase (`icbChangePercent`, `totalValue`) — normalizer đã xử lý; bản TS đọc đúng tên gốc theo `vietcap_market_overview.py:456–467`.
- Response này chính là **phần header** của `/overview/sectors/detail` (cùng 7 field). Client có thể dùng lại một component cho cả hai.

---

### GET /api/v1/market-data/overview/sectors/detail

> **Chi tiết một ngành ICB** — Header giống một dòng của `sectors/allocation`, kèm danh sách **toàn bộ mã** trong ngành đó.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/overview/sectors/detail:{md5(query)[:12]}`, TTL **30s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap — `POST https://trading.vietcap.com.vn/api/market-watch/AllocatedICB/getAllocatedDetail` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `icb_code` | `number` | **Có** | — | integer, `ge=1` | Mã ngành ICB, vd `8300` (Ngân hàng). Gửi provider dưới tên `icbCode`. |
| `group` | `string` | Không | `"ALL"` | ∈ `ALL \| HOSE \| HNX \| UPCOM` (`EXCHANGES_SECTOR_DETAIL`) | Sàn lọc mã trong ngành. |
| `time_frame` | `string` | Không | `"ONE_DAY"` | ∈ `MdTimeFrameImpact` (`TIME_FRAMES_SECTOR_DETAIL`, cùng 5 giá trị) | Kỳ luỹ kế. |

**Request body** — —

**Response 200**

~~~ts
interface MdSectorDetailData {
  icb_code: number | null;              // số, echo từ provider
  icb_change_percent: number | null;    // PHẦN TRĂM
  total_value_vnd: number | null;       // VND
  total_stock_increase: number | null;
  total_stock_decrease: number | null;
  total_stock_no_change: number | null;
  icb_code_parent: number | string | null;  // passthrough thô
  stocks: MdSectorDetailStock[];
}
type MdSectorDetailResponse = MdEnvelope<MdSectorDetailData>;
~~~

~~~json
{
  "data": {
    "icb_code": 8300,
    "icb_change_percent": -0.8919,
    "total_value_vnd": 4580663735000,
    "total_stock_increase": 6,
    "total_stock_decrease": 15,
    "total_stock_no_change": 6,
    "icb_code_parent": 8301,
    "stocks": [
      {
        "symbol": "VCB",
        "ref_price": 67500,
        "match_price": 68900,
        "ceiling_price": 72200,
        "floor_price": 62800,
        "accumulated_volume": 4185300,
        "accumulated_value_vnd": 288305170000,
        "company_name": "Ngan hang TMCP Ngoai thuong Viet Nam",
        "en_company_name": "Joint Stock Commercial Bank for Foreign Trade of Vietnam",
        "foreign_net_volume": 1204500,
        "foreign_net_value_vnd": 82989100000,
        "board": "HSX"
      },
      {
        "symbol": "ACB",
        "ref_price": 23500,
        "match_price": 23400,
        "ceiling_price": 25100,
        "floor_price": 21900,
        "accumulated_volume": 17478700,
        "accumulated_value_vnd": 409800810000,
        "company_name": "Ngan hang TMCP A Chau",
        "en_company_name": "Asia Commercial Joint Stock Bank",
        "foreign_net_volume": -11877685,
        "foreign_net_value_vnd": -278519645550,
        "board": "HSX"
      }
    ]
  },
  "source_url": "https://trading.vietcap.com.vn/api/market-watch/AllocatedICB/getAllocatedDetail"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | Thiếu `icb_code`, hoặc không phải integer, hoặc `< 1` | `detail` là **array** của FastAPI (`type: "missing"` / `"int_parsing"` / `"greater_than_equal"`) |
| 422 | — | `group` sai | `Giá trị group không hợp lệ: BAD. Phải thuộc ['ALL', 'HNX', 'HOSE', 'UPCOM']` |
| 422 | — | `time_frame` sai | `Giá trị time_frame không hợp lệ: BAD` (**không liệt kê giá trị cho phép**) |
| 502 | — | Provider trả về không phải dict | `Expected dict from sector-detail, got list` |
| 502 | — | `icbDataDetail` có mặt nhưng không phải mảng | `Expected list from sector-detail.icbDataDetail, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `POST /api/market-watch/AllocatedICB/getAllocatedDetail: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. **`icbDataDetail` thiếu hẳn ⇒ `stocks: []`, KHÔNG 502** (đọc bằng `.get(..., [])` rồi mới `_require_list`). `icb_code` không tồn tại nhưng hợp lệ về kiểu (vd `9999`) ⇒ provider vẫn trả 200 với các field `null`/0 và `stocks: []` — **không có 404 ở endpoint này**; shape chính xác của trường hợp này **CHƯA XÁC ĐỊNH** (không có test cover), xem `vietcap_market_overview.py:629–673`. Client phải tự coi `stocks: []` là "không có dữ liệu ngành".

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/overview/sectors/detail?icb_code=8300&group=ALL&time_frame=ONE_DAY' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 4e5f6a70-8b9c-4d12-8e34-5f6a7b8c9d00'
~~~

**Ghi chú khi viết lại**

- **Ba khuôn message 422 khác nhau trong CÙNG một endpoint**: `icb_code` → array của framework; `group` → chuỗi có liệt kê `Phải thuộc [...]`; `time_frame` → chuỗi **không** liệt kê. Thứ tự kiểm tra: framework (`icb_code`) → `group` → `time_frame`.
- `board` dùng từ vựng provider `"HSX"` cho HOSE, trong khi query `group` lại dùng `"HOSE"`. Muốn lọc client-side theo sàn phải map `HOSE ↔ HSX`.
- **Không có %biến động từng mã**: tính `(match_price − ref_price) / ref_price × 100`, và phải chặn `ref_price = 0`/`null` (mã mới niêm yết) để không sinh `Infinity`/`NaN` (`docs/vietcap-market-overview-api-supplement.md:69–82`).
- `accumulated_value_vnd` ở đây là **VND**, còn `value_million_vnd` ở `/overview/heatmap` là **triệu VND** cho cùng khái niệm GTGD.
- `foreign_net_volume`/`foreign_net_value_vnd` **đã là số ròng** do provider tính (âm = bán ròng) — không trừ lại.
- Provider trả thêm `organShortName`, `enOrganShortName` — bị bỏ. Tên hiển thị ngắn phải lấy từ `/reference/symbols` hoặc `/reference/search`.

---

## Ngành (Vietcap IQ Insight)

Ba endpoint này phục vụ trang Ngành (`/iq/sector` của provider): tab **Xếp hạng** dùng `sectors/trading-dates` + `sectors/ranking`, tab **Thông tin** dùng `sectors/information`. Cả ba **dùng TTL cache 300s** (`REDIS_DEFAULT_TTL_SECONDS`), khác 30s của nhóm `/overview/*`, và cả ba đều trả `icb_code` dạng **string**.

### GET /api/v1/market-data/sectors/information

> **Thông tin ngành** — Vốn hóa, chỉ số ngành, sparkline 20 ngày và hiệu suất giá từ 1 ngày đến 5 năm cho mỗi ngành ICB.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/sectors/information:{md5(query)[:12]}`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap IQ — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-information` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `icb_level` | `number` | Không | `2` | integer, `ge=1`, `le=4` | Cấp phân ngành ICB. Gửi provider dưới tên `icbLevel`. Số ngành trả về: 13 / 19 / 40 / 106 cho cấp 1 / 2 / 3 / 4 (`docs/vietcap-sector-api.md:217–224`). |

**Request body** — —

**Response 200**

~~~ts
interface MdSectorInformationRow {
  /** Mã ngành ICB — CHUỖI THÔ từ provider: "8600", đôi khi "8600.0". */
  icb_code: string;
  /** Vốn hóa ngành, VND, int (chia 1e9 ra tỷ VND để hiển thị). */
  market_cap: number | null;
  /** Điểm chỉ số ngành ở phiên gần nhất (float). */
  last_close_index: number | null;
  /** Sparkline: 20 điểm chỉ số ngành gần nhất, cũ → mới. [] nếu provider thiếu. */
  last_20_day_index: (number | null)[];
  /** TẤT CẢ percent_* dưới đây là PHÂN SỐ: 0.0725 = +7,25%; −0.0178 = −1,78%. */
  percent_price_change_1d: number | null;
  percent_price_change_1w: number | null;
  percent_price_change_1m: number | null;
  percent_price_change_6m: number | null;
  percent_price_change_ytd: number | null;
  percent_price_change_1y: number | null;
  percent_price_change_2y: number | null;
  percent_price_change_5y: number | null;
}
type MdSectorInformationResponse = MdEnvelope<MdSectorInformationRow[]>;
~~~

~~~json
{
  "data": [
    {
      "icb_code": "8600",
      "market_cap": 2904291991948489,
      "last_close_index": 947.85,
      "last_20_day_index": [694.31, 721.86, 727.84, 730.3, 726.51, 726.51, 729.55, 773.6, 762.08, 766.59, 789.77, 812.56, 853.58, 895.73, 883.75, 903.34, 908.77, 951.55, 965.06, 947.85],
      "percent_price_change_1d": -0.0178,
      "percent_price_change_1w": 0.0725,
      "percent_price_change_1m": 0.4521,
      "percent_price_change_6m": 0.3902,
      "percent_price_change_ytd": 0.1233,
      "percent_price_change_1y": 1.7349,
      "percent_price_change_2y": 2.1541,
      "percent_price_change_5y": 0.8547
    },
    {
      "icb_code": "8300",
      "market_cap": 2731884120553000,
      "last_close_index": 1284.42,
      "last_20_day_index": [1198.4, 1204.77, 1211.02, 1219.6, 1225.31, 1231.08, 1240.44, 1248.9, 1252.17, 1260.03, 1265.88, 1268.4, 1271.95, 1274.6, 1277.02, 1279.33, 1280.71, 1282.06, 1283.5, 1284.42],
      "percent_price_change_1d": 0.0084,
      "percent_price_change_1w": 0.0152,
      "percent_price_change_1m": 0.0713,
      "percent_price_change_6m": 0.2204,
      "percent_price_change_ytd": 0.1841,
      "percent_price_change_1y": 0.4402,
      "percent_price_change_2y": 0.9713,
      "percent_price_change_5y": 1.4028
    }
  ],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-information"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `icb_level` ngoài 1..4 hoặc không phải số nguyên | `detail` là **array** của FastAPI (`type: "less_than_equal"` / `"greater_than_equal"` / `"int_parsing"`) |
| 502 | — | Envelope IQ không phải dict / `successful != true` | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-information, got list` \| `API unsuccessful: <msg>` |
| 502 | — | `data` không phải mảng | `Expected list from sector-information, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /v1/sector-information: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. Dữ liệu **EOD**: trong phiên trả số của phiên gần nhất đã chốt, `percent_price_change_1d` là biến động của **phiên đó**, không phải biến động đang diễn ra. `last20DayIndex` không phải list ⇒ trả `[]` (không lỗi). Phần tử không phải dict bị bỏ qua. Provider trả `[]` ⇒ 200 + `data: []` (không cache).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/sectors/information?icb_level=2' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 6a7b8c9d-0e1f-4a23-8b45-6c7d8e9f0a11'
~~~

**Ghi chú khi viết lại**

- **`percent_*` là PHÂN SỐ (0.01 = 1%)** — `docs/vietcap-sector-api.md:207`. Trong khi `/overview/sectors/allocation`, `/overview/sectors/detail`, `/overview/heatmap` trả **phần trăm**. Hai quy ước ngược nhau trong cùng chương; tuyệt đối không dùng chung hàm format.
- **Không có "tỷ trọng" (%)**: client tự tính `market_cap / Σ market_cap × 100`. Dòng "Tổng" trên UI = `Σ market_cap`, 100%, không có %biến động (`docs/vietcap-sector-api.md:226–229`).
- **Không có tên ngành**: join `icb_code` với `/reference/industries`. Vì `icb_code` có thể là `"8600.0"`, khi join phải chuẩn hoá qua `parseInt(parseFloat(code))` — đúng như `_icb_int()` ở `app/services/ai/portfolio_manager/inputs.py:106–113`. Join bằng so sánh chuỗi thô sẽ **trượt âm thầm**.
- `market_cap` dùng `_to_int` của `vietcap_sector.py` (`int(float(str(v)))`) nên chuỗi `"2904291991948489.0"` vẫn về int. Với số lớn > 2^53, JS mất chính xác — bản TS nên giữ ở `string`/`bigint` nội bộ khi cần cộng tổng vốn hóa, hoặc chấp nhận sai số ở chữ số cuối và **không** dùng để đối chiếu kế toán.
- `last_20_day_index` là **chuỗi điểm chỉ số ngành**, không phải giá cổ phiếu, không phải %. Thứ tự cũ → mới theo provider; phần tử cuối trùng `last_close_index`.
- Endpoint không có tham số sàn: luôn tính trên toàn thị trường.

---

### GET /api/v1/market-data/sectors/ranking

> **Xếp hạng sức mạnh ngành** — Điểm sức mạnh 0–100 của từng ngành cho 20 ngày giao dịch gần nhất, kèm tín hiệu xu hướng khi có.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/sectors/ranking:{md5(query)[:12]}`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap IQ — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/sectors` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `icb_level` | `number` | Không | `2` | integer, `ge=1`, `le=4` | Cấp ICB. Gửi provider dưới tên `icbLevel`. Số ngành: 11 / 16 / 19 / 21 cho cấp 1 / 2 / 3 / 4. |
| `adtv` | `number` | Không | `3` | ∈ `MdAdtv` (`1 \| 3 \| 6`) | Số **tháng** dùng tính GTGD trung bình khi lọc mã vào ngành. |
| `value` | `number` | Không | `3` | ∈ `MdValueThreshold` (`3 \| 5 \| 10`) | Ngưỡng GTGD tối thiểu, **đơn vị TỶ VND** (3 = "> 3 tỷ VND/ngày"). |

**Request body** — —

**Response 200**

~~~ts
interface MdSectorRankingValue {
  date: string;                  // "YYYY-MM-DD"; "" nếu provider thiếu
  /** Điểm sức mạnh ngành 0–100 (int). Cao = mạnh. */
  value: number | null;
  /** CHỈ CÓ khi provider có tín hiệu tại ngày đó. Passthrough thô. */
  sector_trend?: "UP" | "DOWN" | string | null;
  /** CHỈ CÓ khi provider trả extremeValue — điểm cực trị của xu hướng. */
  extreme_value?: number | null;
  /** CHỈ CÓ khi provider trả trendStartValue — điểm bắt đầu xu hướng. */
  trend_start_value?: number | null;
}

interface MdSectorRankingRow {
  /** Mã ngành ICB — CHUỖI THÔ từ provider (field provider tên là "name"). */
  icb_code: string;
  /** 20 điểm theo ngày, thứ tự do provider (mẫu: mới → cũ). */
  values: MdSectorRankingValue[];
}
type MdSectorRankingResponse = MdEnvelope<MdSectorRankingRow[]>;
~~~

~~~json
{
  "data": [
    {
      "icb_code": "8300",
      "values": [
        { "date": "2026-08-17", "value": 63 },
        { "date": "2026-08-14", "value": 59 },
        {
          "date": "2026-08-13",
          "value": 36,
          "sector_trend": "DOWN",
          "extreme_value": 35,
          "trend_start_value": 41
        }
      ]
    },
    {
      "icb_code": "8600",
      "values": [
        { "date": "2026-08-17", "value": 48 },
        { "date": "2026-08-14", "value": 51 },
        { "date": "2026-08-13", "value": 55 }
      ]
    }
  ],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/sectors"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `icb_level` ngoài 1..4 | `detail` là **array** của FastAPI |
| 422 | — | `adtv` không thuộc {1,3,6} | `Giá trị adtv=99 không hợp lệ. Cho phép: [1, 3, 6]` |
| 422 | — | `value` không thuộc {3,5,10} | `Giá trị value=99 không hợp lệ. Cho phép: [3, 5, 10]` |
| 502 | — | Envelope IQ sai / `successful != true` | `Expected dict from <url>, got list` \| `API unsuccessful: <msg>` |
| 502 | — | `data` không phải mảng | `Expected list from sector-ranking, got dict` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /v1/sector-ranking/sectors: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503. Dữ liệu **EOD**: ngày mới nhất là phiên đã chốt, trong phiên không có điểm "đang chạy". Ngành không đủ mã thoả `adtv`/`value` ⇒ **ngành đó vắng mặt** khỏi mảng (không phải điểm 0). `values` không phải list ⇒ `values: []`. Phần tử không phải dict (cả cấp ngành và cấp ngày) bị bỏ qua âm thầm.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/sectors/ranking?icb_level=2&adtv=3&value=3' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 8c9d0e1f-2a3b-4c45-8d67-8e9f0a1b2c22'
~~~

**Ghi chú khi viết lại**

- **Ba khoá tuỳ chọn dựa trên `in`, không dựa trên `is not None`** (`vietcap_sector.py:170–175`): nếu provider trả `"sectorTrend": null` thì response IQX **có** khoá `sector_trend: null`; nếu provider không trả khoá thì response IQX **không có khoá**. "Vắng mặt" ≠ "null" — client dùng `"sector_trend" in v` để biết có tín hiệu, không dùng truthiness.
- `sector_trend` là **passthrough thô** (không validate) — hiện provider trả `"UP"`/`"DOWN"`. Type nên là union mở (`"UP" | "DOWN" | string`) để không vỡ khi provider thêm giá trị.
- `icb_code` lấy từ field provider tên **`name`** (không phải `icbCode` như `/sectors/information`) và là **string**. Cùng chương có 3 nguồn `icb_code` với 3 kiểu/nguồn khác nhau.
- Ngưỡng màu UI (`docs/vietcap-sector-api.md:129–135`): ≥ 60 mạnh (xanh đậm), 50–59 trung tính (xám), < 50 yếu. Đây là quy ước hiển thị, **không** phải dữ liệu backend.
- Thứ tự: hàng = ngành (UI sắp xếp giảm dần theo điểm ngày gần nhất — **client tự sort**, backend không sort); cột = ngày, lấy header từ `/sectors/trading-dates`. Không được giả định `values` cùng độ dài/cùng thứ tự giữa các ngành — **join theo `date`**, đừng join theo index.
- Thứ tự kiểm tra: framework (`icb_level`) → `adtv` → `value`.
- `value` là **tỷ VND** — đây là chỗ duy nhất trong chương dùng đơn vị tỷ, và trùng tên với field `value` (tỷ số) của `/overview/valuation`.

---

### GET /api/v1/market-data/sectors/trading-dates

> **20 ngày giao dịch gần nhất** — Danh sách ngày dùng làm header cột cho bảng xếp hạng ngành.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/sectors/trading-dates:_`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài Vietcap IQ — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/trading-date` |
| **Side-effect** | — |

**Path params** — —

**Query params** — — (không nhận tham số; OpenAPI không khai báo `422`)

**Request body** — —

**Response 200**

~~~ts
/**
 * Danh sách ngày giao dịch dạng "YYYY-MM-DD", **giảm dần** (mới nhất trước).
 * Đã bỏ ngày nghỉ/lễ. Provider trả đúng 20 phần tử theo tài liệu.
 * Phần tử KHÔNG phải string bị LOẠI âm thầm ⇒ độ dài có thể < 20.
 */
type MdSectorTradingDatesResponse = MdEnvelope<string[]>;
~~~

~~~json
{
  "data": [
    "2026-08-17", "2026-08-14", "2026-08-13", "2026-08-12", "2026-08-11",
    "2026-08-10", "2026-08-07", "2026-08-06", "2026-08-05", "2026-08-04",
    "2026-08-03", "2026-07-31", "2026-07-30", "2026-07-29", "2026-07-28",
    "2026-07-27", "2026-07-24", "2026-07-23", "2026-07-22", "2026-07-21"
  ],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/trading-date"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 502 | — | Envelope IQ không phải dict (vd provider trả chuỗi) | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/trading-date, got str` |
| 502 | — | `successful != true` | `API unsuccessful: <msg của provider hoặc "unknown">` |
| 502 | — | `data` không phải mảng | `Expected list from trading-date, got str` |
| 503 | — | Timeout / lỗi kết nối / 5xx sau retry | `GET /v1/sector-ranking/trading-date: <exception gốc>` |

**Fallback / suy giảm**

Một nguồn duy nhất ⇒ 503; **không** có fallback sang bảng ngày giao dịch nội bộ, cũng **không** tự sinh ngày từ lịch. Provider trả `[]` ⇒ 200 + `data: []` (không cache) ⇒ UI xếp hạng ngành mất header cột, phải tự lấy tập ngày từ `values[].date` của `/sectors/ranking` như phương án dự phòng phía client. Ngày mới nhất là **phiên đã chốt**; sáng sớm trước khi provider cập nhật, phần tử đầu vẫn là phiên trước.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/sectors/trading-dates' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 0e1f2a3b-4c5d-4e67-8f89-0a1b2c3d4e33'
~~~

**Ghi chú khi viết lại**

- Chuỗi ngày là **passthrough thô** (`str(d)` cho phần tử đã là string): không parse, không đổi format, không validate là ngày thật. Giữ nguyên "YYYY-MM-DD".
- Filter `isinstance(d, str)` ⇒ nếu provider đổi sang trả object `{date: ...}` thì response thành `[]` **mà không có lỗi nào**. Bản TS nên log warning khi số phần tử bị loại > 0 để phát hiện sớm.
- Số lượng 20 là **quy ước provider**, không được backend đảm bảo. Đừng hard-code 20 cột; render theo độ dài mảng thực tế.
- Thứ tự **giảm dần** (mới → cũ), ngược với `last_20_day_index` của `/sectors/information` (cũ → mới). Rất dễ vẽ sparkline ngược.
- TTL 300s: sau khi chốt phiên, ngày mới xuất hiện trễ tối đa 5 phút. Chấp nhận được; đừng giảm TTL vì đây là dữ liệu ngày.

---

## Phân tích: xếp hạng cổ phiếu

### GET /api/v1/market-data/insights/ranking/{kind}

> **Xếp hạng cổ phiếu** — Top mã theo 7 tiêu chí (tăng giá, giảm giá, giá trị, khối lượng, thoả thuận, ngoại mua ròng, ngoại bán ròng). Endpoint **duy nhất** trong chương dùng envelope `{data, meta}` và nguồn VNDIRECT.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/insights/ranking/{kind}:{md5(query)[:12]}`, TTL **15s** (`REDIS_TTL_REALTIME_SECONDS`) |
| **Nguồn dữ liệu** | provider ngoài VNDIRECT — `GET https://api-finfo.vndirect.com.vn/v4/top_stocks` (5 kind đầu) hoặc `/v4/foreigns` (`foreign-buy`, `foreign-sell`) |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `kind` | `string` | ∈ `MdRankingKind` — **đủ 7 giá trị hợp lệ**: `gainer`, `loser`, `value`, `volume`, `deal`, `foreign-buy`, `foreign-sell` | Tiêu chí xếp hạng. So khớp **phân biệt chữ hoa/thường** (`GAINER` → 422). |

Ý nghĩa và bộ lọc upstream của từng `kind` (đọc từ `vndirect.py:142–193`):

| `kind` | Ý nghĩa | Endpoint + điều kiện upstream | Sắp xếp |
|---|---|---|---|
| `gainer` | Tăng giá mạnh nhất | `/top_stocks`, `nmVolumeAvgCr20D ≥ 10000` và `priceChgPctCr1D > 0` | `priceChgPctCr1D` giảm dần |
| `loser` | Giảm giá mạnh nhất | `/top_stocks`, `nmVolumeAvgCr20D ≥ 10000` và `priceChgPctCr1D < 0` | `priceChgPctCr1D:asc` |
| `value` | GTGD lớn nhất | `/top_stocks`, `accumulatedVal > 0` | `accumulatedVal` giảm dần |
| `volume` | Khối lượng đột biến | `/top_stocks`, `nmVolumeAvgCr20D ≥ 10000` và `nmVolNmVolAvg20DPctCr ≥ 100` | `nmVolNmVolAvg20DPctCr` giảm dần |
| `deal` | Thoả thuận đột biến | `/top_stocks`, `nmVolumeAvgCr20D ≥ 10000` | `ptVolTotalVolAvg20DPctCr` giảm dần |
| `foreign-buy` | Ngoại mua ròng | `/foreigns`, `type:STOCK,IFC,ETF`, `netVal > 0`, `tradingDate:{date}` | `tradingDate~netVal:desc` |
| `foreign-sell` | Ngoại bán ròng | `/foreigns`, `type:STOCK,IFC,ETF`, `netVal < 0`, `tradingDate:{date}` | `tradingDate~netVal:asc` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `index` | `string` | Không | `"VNINDEX"` | **Không validate** — ánh xạ `VNINDEX→VNIndex`, `HNX→HNX`, `VN30→VN30`; giá trị lạ **âm thầm** thành `VNIndex` | Rổ chỉ số để lọc mã. So khớp sau `.upper()`. Không áp dụng cho `foreign-buy`/`foreign-sell`. |
| `limit` | `number` | Không | `10` | integer, `ge=1`, `le=50` | Số bản ghi. Gửi upstream dưới tên `size`. |
| `date` | `string \| null` | Không | `null` → `""` | **Không validate định dạng** | Ngày giao dịch `YYYY-MM-DD`, **chỉ dùng cho `foreign-buy`/`foreign-sell`**. Bỏ trống ⇒ upstream tự lấy ngày gần nhất. |

**Request body** — —

**Response 200**

~~~ts
/** 5 kind đầu: mỗi khoá CHỈ xuất hiện khi upstream có field tương ứng ⇒ bản ghi có thể thiếu field. */
interface MdTopStockRow {
  symbol?: string;                    // code
  index?: string;                     // "VNIndex" | "HNX" | "VN30"
  last_price?: number;                // giá khớp gần nhất, VND (passthrough thô)
  last_updated?: string | number;     // lastUpdated, passthrough thô
  price_change_1d?: number;           // +/− so phiên trước, VND
  price_change_pct_1d?: number;       // %biến động — ĐƠN VỊ PHẦN TRĂM (4.0 = +4%)
  accumulated_value?: number;         // GTGD luỹ kế, VND
  avg_volume_20d?: number;            // KLTB 20 phiên, cổ phiếu
  volume_spike_20d_pct?: number;      // KL/KLTB20 × 100, %
}

/** foreign-buy | foreign-sell: shape KHÁC HẲN, luôn đủ 3 khoá. */
interface MdForeignRankingRow {
  symbol: string;                     // code; "" nếu thiếu
  date: string;                       // tradingDate; "" nếu thiếu
  /** Giá trị mua/bán ròng, VND. Âm với foreign-sell. Default 0 khi thiếu. */
  net_value: number;
}

type MdRankingResponse =
  | MarketDataResponse<MdTopStockRow[]>
  | MarketDataResponse<MdForeignRankingRow[]>;
~~~

~~~json
{
  "data": [
    {
      "symbol": "FPT",
      "index": "VNIndex",
      "last_price": 73400,
      "price_change_1d": 2100,
      "price_change_pct_1d": 2.95,
      "accumulated_value": 769854190000,
      "avg_volume_20d": 8215400
    },
    {
      "symbol": "HPG",
      "index": "VNIndex",
      "last_price": 31450,
      "price_change_1d": 550,
      "price_change_pct_1d": 1.78,
      "accumulated_value": 412880300000,
      "avg_volume_20d": 21447900
    }
  ],
  "meta": {
    "source": "VND",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T08:15:42.117903Z",
    "raw_endpoint": "https://api-finfo.vndirect.com.vn/v4/top_stocks?q=index:VNIndex~nmVolumeAvgCr20D:gte:10000~priceChgPctCr1D:gt:0&size=10&sort=priceChgPctCr1D"
  }
}
~~~

Ví dụ `foreign-sell`:

~~~json
{
  "data": [
    { "symbol": "VNM", "date": "2026-08-17", "net_value": -187430022100 },
    { "symbol": "VCB", "date": "2026-08-17", "net_value": -95221400000 }
  ],
  "meta": {
    "source": "VND",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T08:16:03.884210Z",
    "raw_endpoint": "https://api-finfo.vndirect.com.vn/v4/foreigns?q=type:STOCK,IFC,ETF~netVal:lt:0~tradingDate:2026-08-17&sort=tradingDate~netVal:asc&size=10&fields=code,netVal,tradingDate"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 422 | — | `kind` ngoài 7 giá trị (kể cả sai hoa/thường) | `Giá trị kind 'invalid_kind' không hợp lệ. Cho phép: ['deal', 'foreign-buy', 'foreign-sell', 'gainer', 'loser', 'value', 'volume']` |
| 422 | — | `limit` < 1, > 50, hoặc không phải số nguyên | `detail` là **array** của FastAPI |
| 502 | — | VNDIRECT lỗi (timeout, 4xx/5xx), **hoặc trả mảng rỗng** | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

- Registry khai báo `insights.ranking → SourceChain("VND")` — **chỉ một nguồn**, không có dự phòng. Endpoint gọi `fetch_with_fallback([("VND", _vnd)])` nên `meta.source` luôn `"VND"`, `source_priority` luôn `1`, `fallback_used` luôn `false`.
- **Bẫy lớn:** validator mặc định của lớp fallback (`fallback.py:28–32`) coi **mảng rỗng là thất bại**. Nghĩa là "không có mã nào thoả tiêu chí" (ngày nghỉ, `date` là ngày không giao dịch, không mã nào tăng giá) sẽ trả **502**, **không** phải `200 + data: []`. Hành vi ĐÚNG nên làm ở bản TS: truyền `allowEmpty = true` cho endpoint này và trả `200 + data: []`, giữ 502 chỉ cho lỗi transport. Nếu buộc phải giữ tương thích tuyệt đối thì phải ghi rõ cho frontend rằng 502 ở đây có thể nghĩa là "rỗng".
- `date` sai định dạng (vd `?date=abc`) **không bị chặn ở backend**: chuỗi được nhúng thẳng vào query upstream ⇒ VNDIRECT trả 4xx (không retry) ⇒ **502** với cùng thông điệp trên. Bản TS nên validate `YYYY-MM-DD` như `_validate_date_str()` mà nhóm tin tức đang dùng (`market_data.py:1880–1899`) và trả 422 kèm `Sai định dạng date format: '<v>'. Phải đúng dạng YYYY-MM-DD.`
- `index` sai (vd `?index=UPCOM`) **không** báo lỗi mà **âm thầm** dùng `VNIndex` ⇒ client tưởng đang xem UPCOM. Bản TS nên trả 422 với danh sách `VNINDEX, HNX, VN30`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/insights/ranking/gainer?index=VNINDEX&limit=10' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 1a2b3c4d-5e6f-4071-8293-4a5b6c7d8e44'

# foreign-sell theo một ngày giao dịch cụ thể
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/insights/ranking/foreign-sell?limit=10&date=2026-08-17' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 2b3c4d5e-6f70-4182-93a4-5b6c7d8e9f55'
~~~

**Ghi chú khi viết lại**

- **Hai shape `data` trong cùng một endpoint** tuỳ `kind`. Nếu frontend dùng chung một bảng thì phải nhận biết theo `kind` chứ không theo field. Cân nhắc tách route ở bản TS nhưng **giữ route cũ** để không phá client.
- **Bản ghi thiếu field là bình thường** với 5 kind đầu: normalizer chỉ copy khoá khi upstream có (`vndirect.py:205–214`). Không có giá trị `null` mặc định. TS phải khai báo mọi field là optional.
- Toàn bộ giá trị của 5 kind đầu là **passthrough thô của VNDIRECT** — không đi qua `_to_int_amount`/`_to_float_ratio`, nên `last_price` có thể là `130.0` (float) tuỳ upstream. Đừng giả định int.
- `price_change_pct_1d` là **phần trăm** (4.0 = +4%) theo quy ước VNDIRECT — khác `percent` (phân số) của `/overview/breadth`.
- `meta.raw_endpoint` là endpoint **duy nhất** trong chương có **query string đầy đủ** (vì URL upstream được ghép sẵn). Rất tiện để debug; đồng thời nó **phơi ra bộ lọc nội bộ** (ngưỡng `nmVolumeAvgCr20D ≥ 10000`…) — nếu coi đây là thông tin cần che thì phải cắt trước khi trả.
- `kind = deal` **không** có bộ lọc chiều tăng/giảm, chỉ sắp xếp theo tỷ lệ thoả thuận / KLTB20 — dữ liệu trả về không đảm bảo có field `ptVolTotalVolAvg20DPctCr` vì `_TOP_STOCK_COLS` **không map** field này ⇒ client thấy bản ghi không có cột dùng để sort. Bản TS nên bổ sung mapping (`ptVolTotalVolAvg20DPctCr → put_through_spike_20d_pct`) — đây là mở rộng thuần thêm field.
- `limit` giới hạn 50 ở IQX trong khi upstream không chặn; giữ nguyên giới hạn để tránh payload lớn.

---

## Ghi chú tổng hợp khi viết lại

1. **Envelope không đồng nhất là hợp đồng đã phát hành.** 19 endpoint trả `{data, source_url}`, riêng `/insights/ranking/{kind}` trả `{data, meta}`. Nếu muốn hợp nhất, phải làm bằng endpoint mới `/v2` chứ không sửa tại chỗ.

2. **Bảng đơn vị — dán lên tường trước khi code:**

| Đơn vị | Nơi xuất hiện |
|---|---|
| **VND (int)** | `foreign*`, `proprietary*`, `allocation` (3 section giá trị), `sectors/allocation.total_value_vnd`, `sectors/detail.accumulated_value_vnd`, `heatmap.*market_cap*`, `heatmap/index.total_foreign_*_value_vnd`, mọi `match_price`/`ref_price`/`ceiling_price`/`floor_price` của cổ phiếu |
| **Triệu VND (float)** | `liquidity.accumulated_value_million_vnd`, `heatmap.stocks[].value_million_vnd`, `heatmap/index.total_trading_value_million_vnd`, `market-index.total_value_million_vnd` |
| **Tỷ VND (int)** | chỉ tham số `sectors/ranking?value=3\|5\|10` |
| **Điểm chỉ số (float)** | `market-index.price/ref_price/change`, `heatmap/index.index_data[].price/ref_price`, `index-impact.impact` |
| **Phần trăm (%)** | `market-index.change_percent`, `heatmap.icb_change_percent`, `sectors/allocation.icb_change_percent`, `sectors/detail.icb_change_percent`, `insights/ranking.price_change_pct_1d`, `volume_spike_20d_pct` |
| **Phân số 0–1** | `breadth.percent`, **toàn bộ** `sectors/information.percent_price_change_*` |
| **Điểm 0–100 / 3–99** | `sectors/ranking.values[].value` (0–100), `stock-strength` (3–99) |
| **Cổ phiếu** | mọi `*_volume`, `total_shares` |

3. **Ba lỗi thiết kế nên sửa ở bản TS (đều là nới lỏng, không phá tương thích):** (a) cửa sổ mặc định `from_ts/to_ts` phải suy ra từ `time_frame` thay vì cứng 365 ngày — áp cho `liquidity`, `foreign`, `foreign/top`; (b) `/overview/foreign` nên nhận `ONE_MINUTE` để có dữ liệu khối ngoại intraday; (c) `/insights/ranking/{kind}` nên trả `200 + data: []` khi rỗng, validate `date` và `index` thay vì âm thầm rơi về `VNIndex`.

4. **Bất đối xứng "thiếu khoá" phải copy đúng:** `index-impact` (`topUp`/`topDown`) và `foreign/top` (`netBuy`/`netSell`) ⇒ **502** khi thiếu. `proprietary/top` (`BUY`/`SELL`) và `sectors/detail` (`icbDataDetail`) ⇒ **mảng rỗng**, vẫn 200. `heatmap/index` ⇒ chỉ `indexData` bắt buộc, các tổng thiếu thì `null`.

5. **Thứ tự kiểm tra 4 lớp** (framework → cache → enum handler → provider) quyết định cả status lẫn shape `detail`. Trong NestJS: dùng `ValidationPipe` cho `ge/le`/kiểu (trả array), interceptor cache, rồi validate enum trong service (trả string). Đảo thứ tự sẽ làm frontend nhận sai shape.

6. **Ba khuôn message 422 khác nhau** phải giữ nguyên từng ký tự: `Giá trị {name}='{val}' không hợp lệ. Cho phép: {a, b, c}` (13 endpoint enum); `Giá trị {name} không hợp lệ: {val}. Phải thuộc ['A', 'B']` (`stock-strength`, `sectors/detail.group`); `Giá trị {name}={val} không hợp lệ. Cho phép: [1, 3, 6]` (`sectors/ranking`). Danh sách luôn **đã sort** — với chuỗi là sort theo mã ký tự (`ALL, HNX, HOSE, UPCOM`), không phải thứ tự khai báo.

7. **Không endpoint nào có 404.** Mã ngành/mã chỉ số không tồn tại nhưng hợp lệ về kiểu ⇒ 200 với mảng/field rỗng. Nếu bản TS thêm 404 sẽ phá client hiện tại.

8. **Cache: response rỗng không được ghi.** Hệ quả vận hành: khi provider trả rỗng liên tục (ngoài giờ, ngày nghỉ), backend gọi provider ở **mọi request** — đây là nguồn rủi ro rate-limit phía Vietcap. Bản TS nên cache cả response rỗng với TTL ngắn hơn (vd 10s) và ghi rõ trong tài liệu vận hành.

9. **`source_url` không kèm query string** với upstream GET, nên không dùng để reproduce request. Nếu cần khả năng debug, thêm field mới (vd `source_query`) thay vì đổi ý nghĩa `source_url`.

10. **Không có logic phiên giao dịch ở bất kỳ đâu.** Nhãn "dữ liệu cũ / ngoài giờ" là việc của frontend. Nếu bản TS muốn thêm cờ `is_stale`, phải thêm field mới và giữ nguyên các field cũ.
