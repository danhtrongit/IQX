# Endpoint — Dữ liệu thị trường: công ty & giao dịch

Chương này đặc tả **17 endpoint** thuộc hai nhóm `Dữ liệu thị trường: Công ty`
(`/api/v1/market-data/company/...`, 7 endpoint) và `Dữ liệu thị trường: Giao dịch`
(`/api/v1/market-data/trading/...`, 10 endpoint). Toàn bộ 17 endpoint đều **công khai**
(không cần Bearer token), đều là **proxy + normalize** dữ liệu từ hai nhà cung cấp ngoài —
**KBS** (KB Securities, hồ sơ doanh nghiệp + tin) và **VCI** (Vietcap: `trading.vietcap.com.vn`
cho bảng giá realtime, `iq.vietcap.com.vn` cho thống kê công ty).

Rủi ro lớn nhất khi viết lại nhóm này **không phải route** mà là **đơn vị số** (đồng / nghìn đồng /
triệu đồng, tỷ lệ 0–1 hay 0–100), **dấu của giá trị ròng**, và **hành vi khi upstream trả rỗng**
(nhóm này biến "rỗng" thành **502**, không phải 200 với mảng rỗng). Ba mục đó được nêu lại ở
`## Ghi chú tổng hợp khi viết lại` cuối chương.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/market-data/company/{symbol}/details` | Công khai | Chi tiết doanh nghiệp thô từ VCI IQ Insight (ngành ICB, sàn, tên, vốn hoá, room ngoại) |
| `GET` | `/api/v1/market-data/company/{symbol}/overview` | Công khai | Tổng quan doanh nghiệp: KBS profile làm nền, làm giàu bằng VCI details + lịch sử 1Y/1W |
| `GET` | `/api/v1/market-data/company/{symbol}/news` | Công khai | Danh sách tin liên quan doanh nghiệp (KBS) |
| `GET` | `/api/v1/market-data/company/{symbol}/officers` | Công khai | Ban lãnh đạo (KBS `Leaders`) |
| `GET` | `/api/v1/market-data/company/{symbol}/shareholders` | Công khai | Danh sách cổ đông (KBS `Shareholders`) |
| `GET` | `/api/v1/market-data/company/{symbol}/subsidiaries` | Công khai | Công ty con / liên kết (KBS `Subsidiaries`), tự gán `type` theo ngưỡng 50% |
| `GET` | `/api/v1/market-data/company/{symbol}/price-chart` | Công khai | OHLC **điều chỉnh** để vẽ chart (VCI IQ Insight, timestamp unix) |
| `POST` | `/api/v1/market-data/trading/price-board` | Công khai | Bảng giá realtime nhiều mã (1–50 mã/lần) — endpoint FE gọi nhiều nhất |
| `GET` | `/api/v1/market-data/trading/{symbol}/history` | Công khai | Lịch sử thống kê giao dịch **đầy đủ** (price-history, không lọc field) |
| `GET` | `/api/v1/market-data/trading/{symbol}/summary` | Công khai | Tóm tắt thống kê giao dịch **đầy đủ** (price-history-summary) |
| `GET` | `/api/v1/market-data/trading/{symbol}/foreign-trade` | Công khai | Lịch sử khối ngoại theo ngày (lọc field `foreign*` + `trading_date`) |
| `GET` | `/api/v1/market-data/trading/{symbol}/foreign-trade/summary` | Công khai | Tóm tắt khối ngoại trong kỳ (lọc field `foreign*`) |
| `GET` | `/api/v1/market-data/trading/{symbol}/supply-demand` | Công khai | Lịch sử cung-cầu theo ngày (lọc 7 nhóm field lệnh mua/bán/chưa khớp) |
| `GET` | `/api/v1/market-data/trading/{symbol}/supply-demand/summary` | Công khai | Tóm tắt cung-cầu trong kỳ |
| `GET` | `/api/v1/market-data/trading/{symbol}/proprietary` | Công khai | Lịch sử tự doanh theo ngày (endpoint upstream riêng) |
| `GET` | `/api/v1/market-data/trading/{symbol}/proprietary/summary` | Công khai | Tóm tắt tự doanh trong kỳ |
| `GET` | `/api/v1/market-data/trading/{symbol}/insider-deals` | Công khai | Giao dịch nội bộ (cổ đông lớn / người nội bộ), không có bộ lọc ngày |

**Ghi chú nguồn** (đúng theo `app/services/market_data/registry.py`):

| Endpoint | Nguồn chính | Fallback thực tế trong code |
|---|---|---|
| `company/{symbol}/overview`, `shareholders`, `officers`, `subsidiaries`, `news` | KBS | **Không có** — registry khai báo `company.profile = KBS → VCI` nhưng handler chỉ truyền `[("KBS", …)]`, nên chuỗi fallback không được dùng |
| `company/{symbol}/details`, `price-chart` | VCI (IQ Insight) | không |
| Toàn bộ `trading/*` | VCI | không |

> **Bẫy 1 (kiến trúc).** Không endpoint nào trong chương này đi qua `fetch_from_registry`.
> Tất cả gọi trực tiếp `fetch_with_fallback([("VCI"|"KBS", handler)])` với **đúng một** nguồn.
> `registry.py` chỉ là bảng khai báo chết cho nhóm này. Khi viết lại bằng NestJS: **đừng**
> implement fallback VCI cho nhóm company, vì hành vi hiện tại là fail thẳng.

---

## Kiểu dữ liệu dùng chung

### Envelope chuẩn

Mọi endpoint trong chương trả về đúng envelope này (`MarketDataResponse` trong OpenAPI):

~~~ts
/** Metadata gắn kèm mọi response market-data. */
interface MdMeta {
  /** Nguồn đã phục vụ response: "VCI" | "KBS" trong chương này. */
  source: string;
  /** 1 = nguồn chính, 2+ = fallback. Luôn = 1 ở chương này. */
  source_priority: number;
  /** Đã dùng fallback hay chưa. Luôn = false ở chương này. */
  fallback_used: boolean;
  /** ISO-8601 UTC, hậu tố "Z". Thời điểm backend fetch xong. */
  as_of: string;
  /** URL upstream đã gọi (đầy đủ, không kèm query params với nguồn VCI IQ). */
  raw_endpoint: string;
}

interface MdResponse<T> {
  data: T;
  meta: MdMeta;
}
~~~

~~~json
{
  "data": [],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-history"
  }
}
~~~

> `raw_endpoint` với nguồn VCI IQ là URL **chưa có query string** (query được truyền qua
> `params` của httpx, còn biến `url` trả về là chuỗi gốc). Ngoại lệ: `events` (không thuộc chương
> này) nhúng query vào URL. Giữ nguyên hành vi này để parity.

### Tham số & enum dùng lại

~~~ts
/** Khung thời gian cho các endpoint thống kê công ty. */
type MdResolution = "1D" | "1W" | "1M" | "1Q" | "1Y";

/**
 * Ánh xạ resolution → timeFrame của VCI IQ Insight.
 * Giá trị KHÔNG thuộc 5 khoá trên bị chặn ở tầng validate (422) TRƯỚC khi tới bảng này.
 */
const MD_TIMEFRAME: Record<MdResolution, string> = {
  "1D": "ONE_DAY",
  "1W": "ONE_WEEK",
  "1M": "ONE_MONTH",
  "1Q": "ONE_QUARTER",
  "1Y": "ONE_YEAR",
};

/** Mã chứng khoán sau khi chuẩn hoá: 1–10 ký tự [A-Z0-9]. */
type MdSymbol = string; // regex: /^[A-Z0-9]{1,10}$/

/** Ngày dạng YYYYMMDD (regex /^\d{8}$/) — dùng cho fromDate/toDate. */
type MdYyyymmdd = string;

/** Ngày dạng YYYY-MM-DD — CHỈ dùng cho start/end của /foreign-trade. */
type MdIsoDate = string;
~~~

### Kiểu công ty (nguồn KBS)

~~~ts
/**
 * Tổng quan doanh nghiệp: KBS profile (nền) + VCI details + VCI price-history 1Y/1W.
 * MỌI field đều optional: chỉ xuất hiện khi khoá tương ứng có trong payload upstream.
 * Đơn vị: xem mục endpoint /company/{symbol}/overview.
 */
interface MdCompanyOverview {
  // ── Từ KBS profile ──
  business_model?: string;            // SM  — đã strip HTML
  symbol?: string;                    // SB
  founded_date?: string;              // FD
  number_of_employees?: number;       // HM, hoặc tổng LaborStructure[].Value nếu tổng > 0
  listing_date?: string;              // LD
  par_value?: number;                 // FV  — VND/cổ phiếu (thường 10000)
  exchange?: string;                  // EX  — đã map HSX/XHNF → HOSE/HNX
  listing_price?: number;             // LP  — VND
  charter_capital?: number;           // KLCPNY — VND chính xác
  outstanding_shares?: number;        // KLCPLH — số cổ phiếu chính xác
  ceo_name?: string;                  // CTP
  ceo_position?: string;              // CTPP
  inspector_name?: string;            // IS
  inspector_position?: string;        // ISP
  establishment_license?: string;     // FP
  business_code?: string;             // BP
  tax_id?: string;                    // TC
  auditor?: string;                   // KT
  company_type?: string;              // TY
  address?: string;                   // ADD
  phone?: string;                     // PHONE
  fax?: string;                       // FAX
  email?: string;                     // EMAIL
  website?: string;                   // URL
  branches?: unknown;                 // BRANCH — pass-through nguyên trạng
  history?: string;                   // HS  — đã strip HTML
  as_of_date?: string;                // AD

  // ── Làm giàu từ VCI /company/details (chỉ ghi khi KBS chưa có giá trị truthy) ──
  organ_short_name?: string;          // ← vi_organ_short_name
  organ_name?: string;                // ← vi_organ_name
  highest_price_1y?: number | null;   // ← highest_price1_year, hoặc price-history 1Y .highest_price
  lowest_price_1y?: number | null;    // ← lowest_price1_year, hoặc price-history 1Y .lowest_price
  average_match_volume_1_month?: number;  // ← average_match_volume1_month
  average_match_value_1_month?: number;   // ← average_match_value1_month
  free_float_percentage?: number;
  free_float?: number;
  market_cap?: number | null;
  current_price?: number;
  issue_share?: number;               // ← number_of_shares_mkt_cap
  is_bank?: boolean;
  sector?: string;
  sector_vn?: string;
  company_profile?: string;           // KBS không có → strip HTML từ details.profile
  icb_name_2?: string;                // giải mã từ details.icb_code_lv2 qua VCI icb-codes
  icb_name_4?: string;                // giải mã từ details.icb_code_lv4

  /**
   * BA KHOÁ RÒ RỈ có dấu gạch dưới đầu — CHÚNG XUẤT HIỆN TRONG JSON response.
   * Giá trị thô 0..1 từ VCI details, KHÔNG được ×100. Phải giữ đúng tên để parity.
   */
  _foreign_owned_pct_raw?: number;    // ← foreigner_percentage        (0..1)
  _foreign_max_pct_raw?: number;      // ← maximum_foreign_percentage  (0..1)
  _state_pct_raw?: number;            // ← state_percentage            (0..1)

  // ── Đã quy đổi sang 0..100 cho FE ──
  foreign_current_percent?: number;   // = pct < 1 ? pct * 100 : pct

  // ── Từ VCI price-history resolution=1Y, size=1 (setdefault ⇒ có thể = null) ──
  foreign_current_room?: number | null;
  foreign_total_room?: number | null;
  foreign_room_percentage?: number | null;

  // ── Tính tại backend từ price-history resolution=1W, size=2 ──
  average_match_volume_2_week?: number;
}

/** Cổ đông — cả 4 khoá LUÔN có mặt (null nếu upstream thiếu). */
interface MdShareholder {
  name: string | null;                    // NM
  date: string | null;                    // D  — ISO datetime, vd "2025-03-17T00:00:00"
  shares_owned: number | null;            // V  — số cổ phiếu
  ownership_percentage: number | null;    // OR — THANG 0..100 (74.8 = 74,8%)
}

/** Lãnh đạo — cả 5 khoá LUÔN có mặt. */
interface MdOfficer {
  from_date: string | null;   // FD — thường chỉ là năm, vd "2021"
  position: string | null;    // PN — viết tắt tiếng Việt, vd "CTHĐQT"
  name: string | null;        // NM
  position_en: string | null; // PO — vd "Chairman of BOD", "CEO"
  owner_code: string | null;  // PI — vd "CTHDQT", "TGD"
}

/** Công ty con / liên kết. 5 khoá đầu LUÔN có; `type` chỉ có khi ownership_percent != null. */
interface MdSubsidiary {
  date: string | null;               // D
  name: string | null;               // NM
  charter_capital: number | null;    // CC — VND (theo `currency`)
  ownership_percent: number | null;  // OR — THANG 0..100
  currency: string | null;           // CR — vd "VND"
  type?: "subsidiary" | "affiliate" | "unknown"; // > 50 ⇒ subsidiary; ép float lỗi ⇒ unknown
}

/** Tin doanh nghiệp — cả 5 khoá LUÔN có mặt. */
interface MdCompanyNewsItem {
  article_id: number | null;  // ArticleID
  title: string;              // Title      — "" nếu thiếu
  summary: string;            // Head       — đã strip HTML
  url: string;                // URL        — "" nếu thiếu
  published_at: string;       // PublishTime— "" nếu thiếu
}
~~~

### Kiểu bảng giá (nguồn VCI trading)

~~~ts
/** Một bậc trong sổ lệnh. Tối đa 3 bậc mỗi bên. */
interface MdPriceLevel {
  /** VND tuyệt đối (vd 123500). null nếu upstream không có bậc đó. */
  price: number | null;
  /** Cổ phiếu. */
  volume: number | null;
}

/** Một dòng bảng giá. Mọi khoá LUÔN có mặt; giá trị có thể null. */
interface MdPriceBoardRow {
  symbol: string;                       // "" nếu listingInfo thiếu symbol
  exchange: string;                     // HSX → HOSE; giá trị lạ giữ nguyên
  ceiling_price: number | null;         // VND — giá trần
  floor_price: number | null;           // VND — giá sàn
  reference_price: number | null;       // VND — giá tham chiếu
  open_price: number | null;            // VND
  high_price: number | null;            // VND — cao nhất phiên
  low_price: number | null;             // VND — thấp nhất phiên
  close_price: number | null;           // VND — giá khớp gần nhất (KHÔNG phải giá đóng cửa cuối cùng trong phiên)
  average_price: number | null;         // VND — giá khớp bình quân
  total_volume: number | null;          // cổ phiếu — KL luỹ kế
  total_value: number | null;           // VND — ĐÃ ×1_000_000 tại backend
  bid_prices: MdPriceLevel[];           // tối đa 3 phần tử; [] nếu không có
  ask_prices: MdPriceLevel[];           // tối đa 3 phần tử; [] nếu không có
  foreign_buy_volume: number | null;    // cổ phiếu
  foreign_sell_volume: number | null;   // cổ phiếu
  foreign_buy_value: number | null;     // pass-through, KHÔNG ×1e6 — xem cảnh báo đơn vị
  foreign_sell_value: number | null;    // pass-through, KHÔNG ×1e6
  foreign_remaining_room: number | null;// cổ phiếu — ← matchPrice.currentRoom
  foreign_total_room: number | null;    // cổ phiếu — ← matchPrice.totalRoom
}
~~~

### Kiểu thống kê giao dịch (nguồn VCI IQ Insight)

Ba khối field dưới đây được **tái sử dụng** giữa `history` / `summary` / `foreign-trade` /
`supply-demand`. Tất cả tên đã là `snake_case` do backend chạy `camelCase → snake_case`
trên **mọi** khoá của bản ghi upstream.

~~~ts
/**
 * Field khối ngoại — nằm NHÚNG trong bản ghi price-history / price-history-summary.
 * Đơn vị: *Volume* = cổ phiếu, *Value* = VND (chính xác, KHÔNG scale),
 *         *Percentage* = tỷ số 0..1 (0.49 = 49%).
 * Dấu: net = mua − bán ⇒ DƯƠNG = mua ròng, ÂM = bán ròng.
 */
interface MdForeignFields {
  foreign_buy_volume_matched?: number;
  foreign_buy_value_matched?: number;
  foreign_sell_volume_matched?: number;
  foreign_sell_value_matched?: number;
  foreign_net_volume_matched?: number;
  foreign_net_value_matched?: number;
  foreign_buy_volume_deal?: number;
  foreign_buy_value_deal?: number;
  foreign_sell_volume_deal?: number;
  foreign_sell_value_deal?: number;
  foreign_net_volume_deal?: number;
  foreign_net_value_deal?: number;
  foreign_buy_volume_total?: number;
  foreign_buy_value_total?: number;
  foreign_sell_volume_total?: number;
  foreign_sell_value_total?: number;
  foreign_net_volume_total?: number;
  foreign_net_value_total?: number;
  foreign_total_room?: number;          // cổ phiếu — trần room
  foreign_current_room?: number;        // cổ phiếu — room còn lại
  foreign_room_percentage?: number;     // 0..1
  foreign_owned_percentage?: number;    // 0..1
  foreign_available_percentage?: number;// 0..1
  foreign_owned?: number;               // cổ phiếu
  /** Bản summary còn có biến thể trung bình ngày, hậu tố _avg. */
  foreign_buy_volume_total_avg?: number;
  foreign_buy_value_total_avg?: number;
  foreign_sell_volume_total_avg?: number;
  foreign_sell_value_total_avg?: number;
  foreign_net_volume_total_avg?: number;
  foreign_net_value_total_avg?: number;
  /** SHAPE THÔ TỪ PROVIDER — mọi khoá khác bắt đầu bằng "foreign" đều đi qua. */
  [key: string]: unknown;
}

/**
 * Field cung-cầu. Bộ lọc backend giữ khoá có PREFIX thuộc đúng 7 chuỗi:
 * total_buy_trade | total_sell_trade | total_net_trade |
 * average_buy_trade | average_sell_trade | total_buy_unmatched | total_sell_unmatched
 */
interface MdSupplyDemandFields {
  total_buy_trade?: number;               // SỐ LỆNH mua (không phải khối lượng)
  total_sell_trade?: number;              // SỐ LỆNH bán
  total_buy_trade_volume?: number;        // cổ phiếu
  total_sell_trade_volume?: number;       // cổ phiếu
  total_net_trade_volume?: number;        // cổ phiếu, mua − bán
  average_buy_trade_volume?: number;      // cổ phiếu/lệnh
  average_sell_trade_volume?: number;     // cổ phiếu/lệnh
  total_buy_unmatched_volume?: number;    // cổ phiếu chưa khớp
  total_sell_unmatched_volume?: number;   // cổ phiếu chưa khớp
  /** Chỉ có trong bản summary: */
  total_buy_trade_volume_avg?: number;
  total_sell_trade_volume_avg?: number;
  total_buy_unmatched_volume_avg?: number;
  total_sell_unmatched_volume_avg?: number;
  [key: string]: unknown;
}

/**
 * Field giá / thị trường CHẮC CHẮN có trong bản ghi price-history
 * (được code overview đọc trực tiếp bằng .get()).
 * SHAPE THÔ TỪ PROVIDER — xem chương 07, mục VCI IQ Insight, cho danh sách đầy đủ.
 */
interface MdPriceHistoryPriceFields {
  trading_date?: string;         // vd "2026-08-14" hoặc ISO datetime, tuỳ timeFrame
  highest_price?: number;
  lowest_price?: number;
  market_cap?: number;
  total_match_volume?: number;   // cổ phiếu
}

/** Bản ghi đầy đủ của GET /trading/{symbol}/history (KHÔNG lọc field). */
type MdTradingHistoryRow =
  MdPriceHistoryPriceFields & MdForeignFields & MdSupplyDemandFields & Record<string, unknown>;

/** Bản ghi đầy đủ của GET /trading/{symbol}/summary (KHÔNG lọc field, object phẳng). */
type MdTradingSummary =
  MdForeignFields & MdSupplyDemandFields & Record<string, unknown>;
~~~

### Kiểu tự doanh & nội bộ

~~~ts
/**
 * Một ngày tự doanh. Đơn vị: *Volume* = cổ phiếu, *Value* = VND, percent* = tỷ số 0..1.
 * Dấu: net = mua − bán ⇒ DƯƠNG = tự doanh mua ròng.
 */
interface MdProprietaryRow {
  ticker?: string;
  trading_date?: string;                    // ISO datetime
  total_buy_trade_volume?: number;
  total_buy_trade_value?: number;
  percent_buy_trade_volume?: number;        // 0..1 — tỷ trọng trên tổng KL thị trường
  percent_buy_trade_value?: number;         // 0..1
  total_sell_trade_volume?: number;
  total_sell_trade_value?: number;
  percent_sell_trade_volume?: number;       // 0..1
  percent_sell_trade_value?: number;        // 0..1
  total_trade_net_volume?: number;
  total_trade_net_value?: number;
  total_match_buy_trade_volume?: number;
  total_match_buy_trade_value?: number;
  total_match_sell_trade_volume?: number;
  total_match_sell_trade_value?: number;
  total_match_trade_net_volume?: number;
  total_match_trade_net_value?: number;
  total_deal_buy_trade_volume?: number;
  total_deal_buy_trade_value?: number;
  total_deal_sell_trade_volume?: number;
  total_deal_sell_trade_value?: number;
  total_deal_trade_net_volume?: number;
  total_deal_trade_net_value?: number;
  total_volume?: number;                    // tổng KL TOÀN THỊ TRƯỜNG (mẫu số tính %)
  total_value?: number;                     // tổng GT TOÀN THỊ TRƯỜNG
  update_date?: string;                     // ISO datetime
  [key: string]: unknown;
}

/** Tóm tắt tự doanh: CÙNG cấu trúc field với bản ghi lịch sử, đã tổng hợp cả kỳ. */
type MdProprietarySummary = MdProprietaryRow;

/** Một giao dịch nội bộ / cổ đông lớn. */
interface MdInsiderDeal {
  id?: string;
  organ_code?: string;
  ticker?: string;
  event_code?: string;              // vd "DDINS" (tổ chức), "DDDIR" (giám đốc)
  event_name_vi?: string;
  event_name_en?: string;
  organ_name_vi?: string;
  organ_name_en?: string;
  trader_organ_name_vi?: string;
  trader_organ_name_en?: string;
  action_type_code?: "B" | "S";     // B = Mua, S = Bán
  action_type_vi?: string;
  action_type_en?: string;
  trade_status_vi?: string;         // "Đăng ký", "Hoàn thành", …
  trade_status_en?: string;
  public_date?: string;             // ISO datetime
  display_date1?: string;
  display_date2?: string;
  start_date?: string;
  end_date?: string;
  share_before_trade?: number;      // cổ phiếu
  share_after_trade?: number;       // cổ phiếu
  share_register?: number;          // cổ phiếu đăng ký
  share_acquire?: number;           // cổ phiếu thực hiện
  ownership_after_trade?: number;   // tỷ số 0..1
  source_url_vi?: string;
  source_url_en?: string;
  icb_code_lv1?: string;
  [key: string]: unknown;
}

/** Một điểm OHLC điều chỉnh cho chart. */
interface MdPriceChartPoint {
  open_price: number;      // luôn là số (ép về 0 nếu upstream null/không parse được)
  high_price: number;
  low_price: number;
  closing_price: number;   // LƯU Ý tên: closing_price, KHÔNG phải close_price
  trading_time: number | null; // unix epoch GIÂY, pass-through nguyên trạng
}
~~~

### Kiểu lỗi

~~~ts
/** Lỗi do handler tự raise: detail là MỘT CHUỖI tiếng Việt. */
interface MdErrorString {
  detail: string;
}

/** Lỗi do tầng validate của framework: detail là MẢNG. */
interface MdValidationError {
  detail: Array<{
    loc: Array<string | number>;
    msg: string;
    type: string;
    input?: unknown;
    ctx?: Record<string, unknown>;
  }>;
}
~~~

> **Bẫy 2 (hình dạng lỗi).** Cùng status 422 nhưng **hai hình dạng khác nhau**: mã chứng khoán
> sai / `resolution` sai / `fromDate` sai định dạng ⇒ `{"detail": "<chuỗi>"}`; còn `length=0`,
> `size=999`, `symbols: []` ⇒ `{"detail": [ {loc, msg, type} ]}`. FE hiện tại phải xử lý cả hai
> — bản viết lại phải giữ nguyên cả hai.

### Hạ tầng dùng chung

| Hạng mục | Giá trị |
|---|---|
| **Rate limit mặc định** | `60/minute` mỗi IP (middleware toàn cục) → vượt: **429** |
| **Rate limit riêng** | Chỉ `POST /trading/price-board`: `120/minute` |
| **Cache** | Redis, key `iqx:api:v1:<path đã chuẩn hoá>:<md5(query đã sort)[:12]>`; miss thì gọi upstream. Cache **HIT** trả kèm header `X-Cache: HIT` |
| **Chuẩn hoá path trong cache key** | Segment ngay sau `company` / `trading` được `.toUpperCase()` ⇒ `/company/fpt/overview` và `/company/FPT/overview` **dùng chung** một entry |
| **Không cache khi rỗng** | Mặc định response có `data` là `[]`/`{}` **không** được ghi cache; riêng `/company/{symbol}/news` bật `cache_empty=true` |
| **Retry upstream** | 3 lần, backoff `0.5 × 2^(n-1)` + jitter, chỉ retry timeout / connect-error / 5xx. **4xx không retry** |
| **Timeout upstream** | 15 giây mỗi lần thử |

> **Bẫy 3 (cache bypass validation).** Khi cache HIT, backend trả thẳng JSON đã lưu qua
> `JSONResponse` — **không** đi qua `response_model`. Nghĩa là dữ liệu cache có thể lệch schema
> mà không bị chặn. Khi viết lại bằng NestJS, nếu dùng interceptor cache thì phải đặt **sau**
> serialize để tránh khác biệt (hoặc chấp nhận đúng hành vi này).

---

## Nhóm công ty

### GET /api/v1/market-data/company/{symbol}/details

> **Chi tiết doanh nghiệp (VCI IQ Insight)** — trả nguyên bản ghi `company/details` của Vietcap sau khi đổi khoá sang `snake_case`, dùng làm nguồn ngành ICB / tên / vốn hoá / room ngoại.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/company/{SYMBOL}/details:_`, TTL `REDIS_TTL_MACRO_SECONDS` = **900s** |
| **Nguồn dữ liệu** | provider ngoài **VCI** — `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/details?ticker={SYMBOL}` |
| **Side-effect** | — (chỉ ghi cache Redis) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau `.toUpperCase()` phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán. Chữ thường được chấp nhận (`fpt` → `FPT`) |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không có query param |

**Request body**

—

**Response 200**

~~~ts
/**
 * SHAPE THÔ TỪ PROVIDER — xem chương 07, mục VCI IQ Insight.
 * Backend chỉ lấy `body.data` (object) rồi camelCase → snake_case, KHÔNG lọc, KHÔNG đổi đơn vị.
 * Các khoá dưới đây là những khoá CHẮC CHẮN tồn tại (code overview đọc trực tiếp).
 */
interface MdCompanyDetailsResponse {
  ticker?: string;
  organ_name?: string;                  // ← organName (tên tiếng Anh/mặc định)
  vi_organ_name?: string;               // ← viOrganName
  vi_organ_short_name?: string;         // ← viOrganShortName
  exchange?: string;
  icb_code?: string;
  icb_code_lv2?: string;
  icb_code_lv4?: string;
  sector?: string;
  sector_vn?: string;
  profile?: string;                     // HTML thô, CHƯA strip tag
  is_bank?: boolean;
  market_cap?: number;
  current_price?: number;
  number_of_shares_mkt_cap?: number;    // số cổ phiếu dùng tính vốn hoá
  free_float?: number;
  free_float_percentage?: number;
  highest_price1_year?: number;
  lowest_price1_year?: number;
  average_match_volume1_month?: number;
  average_match_value1_month?: number;
  foreigner_percentage?: number;        // TỶ SỐ 0..1 — endpoint này KHÔNG ×100
  maximum_foreign_percentage?: number;  // TỶ SỐ 0..1
  state_percentage?: number;            // TỶ SỐ 0..1
  [key: string]: unknown;
}
~~~

~~~json
{
  "data": {
    "ticker": "FPT",
    "organ_name": "FPT Corporation",
    "vi_organ_name": "Công ty Cổ phần FPT",
    "vi_organ_short_name": "FPT",
    "exchange": "HOSE",
    "icb_code": "9530",
    "icb_code_lv2": "9500",
    "icb_code_lv4": "9530",
    "sector": "Technology",
    "sector_vn": "Công nghệ Thông tin",
    "is_bank": false,
    "market_cap": 178500000000000,
    "current_price": 121400,
    "number_of_shares_mkt_cap": 1470000000,
    "highest_price1_year": 154800,
    "lowest_price1_year": 96200,
    "average_match_volume1_month": 6420000,
    "foreigner_percentage": 0.4712,
    "maximum_foreign_percentage": 0.49,
    "state_percentage": 0.0568
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/details"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` sau upper không khớp `^[A-Z0-9]{1,10}$` | `"Mã chứng khoán không hợp lệ: BAD!"` (chuỗi) |
| 429 | — | Vượt `60/minute` cho IP | Do middleware rate-limit sinh |
| 502 | — | VCI lỗi sau 3 lần retry, HOẶC `data` là `{}` / không phải dict | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Chỉ **một** nguồn (VCI), **không có** fallback. `fetch_with_fallback` chạy validator mặc định:
`None`, `[]`, `{}` bị coi là **thất bại** ⇒ **502**, chứ không phải 200 với object rỗng. Do đó
một mã hợp lệ về format nhưng không tồn tại trên VCI (vd `ZZZZZ`) trả **502**, không phải 404.
Không có logic giờ giao dịch: dữ liệu này là dữ liệu tham chiếu, ngoài giờ vẫn trả bình thường.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/company/FPT/details' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Đơn vị.** `foreigner_percentage` / `maximum_foreign_percentage` / `state_percentage` ở
  **thang 0..1** tại endpoint này. Chỉ `/company/{symbol}/overview` mới quy đổi ×100. Đừng
  "thống nhất" hai endpoint — FE đang dựa vào sự khác biệt này.
- `profile` là **HTML thô**. Việc strip tag chỉ xảy ra ở `/overview`.
- `market_cap`: source **không** ghi đơn vị. Truyền nguyên trạng, tuyệt đối không nhân/chia.
- `organ_name` (upstream `organName`) và `vi_organ_name` là hai field khác nhau; `/overview`
  map `vi_organ_name → organ_name`, gây **lệch tên field giữa hai endpoint**. Giữ đúng.
- Bộ đổi tên `camelCase → snake_case` phải xử lý được **chữ số dính chữ**:
  `highestPrice1Year → highest_price1_year` (không phải `highest_price_1_year`),
  `averageMatchVolume1Month → average_match_volume1_month`. Thuật toán gốc là hai bước regex:
  `(.)([A-Z][a-z]+) → \1_\2`, rồi `([a-z0-9])([A-Z]) → \1_\2`, rồi lowercase.

---

### GET /api/v1/market-data/company/{symbol}/overview

> **Tổng quan doanh nghiệp** — hợp nhất hồ sơ KBS với chi tiết VCI và lịch sử giao dịch 1Y/1W thành một object phẳng cho trang thông tin doanh nghiệp.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_TTL_MACRO_SECONDS` = **900s** |
| **Nguồn dữ liệu** | **KBS** `GET https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/{SYMBOL}?l=1` (nền) + **VCI** `company/details` + **VCI** `price-history` (timeFrame=ONE_YEAR, size=1) + **VCI** `price-history` (timeFrame=ONE_WEEK, size=2) |
| **Side-effect** | Ghi cache Redis; nạp cache ICB in-process (`_ICB_CACHE`, không TTL, sống hết đời process) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không có query param |

**Request body**

—

**Response 200**

~~~ts
type MdCompanyOverviewResponse = MdCompanyOverview; // xem "Kiểu dữ liệu dùng chung"
~~~

~~~json
{
  "data": {
    "business_model": "Cung cấp dịch vụ công nghệ thông tin, viễn thông và giáo dục.",
    "symbol": "FPT",
    "founded_date": "1988-09-13",
    "listing_date": "2006-12-13",
    "par_value": 10000,
    "exchange": "HOSE",
    "listing_price": 400000,
    "charter_capital": 14700000000000,
    "outstanding_shares": 1470000000,
    "ceo_name": "Nguyễn Văn Khoa",
    "ceo_position": "Tổng Giám đốc",
    "address": "Số 10 Phạm Văn Bạch, Cầu Giấy, Hà Nội",
    "phone": "024 7300 7300",
    "email": "ir@fpt.com.vn",
    "website": "https://fpt.com.vn",
    "number_of_employees": 48000,
    "as_of_date": "2026-06-30",
    "organ_short_name": "FPT",
    "organ_name": "Công ty Cổ phần FPT",
    "company_profile": "FPT là doanh nghiệp công nghệ thông tin lớn nhất Việt Nam...",
    "sector": "Technology",
    "sector_vn": "Công nghệ Thông tin",
    "icb_name_2": "Công nghệ Thông tin",
    "icb_name_4": "Dịch vụ máy tính",
    "is_bank": false,
    "issue_share": 1470000000,
    "market_cap": 178500000000000,
    "current_price": 121400,
    "free_float": 926100000,
    "free_float_percentage": 0.63,
    "average_match_volume_1_month": 6420000,
    "average_match_value_1_month": 782000000000,
    "average_match_volume_2_week": 5875000,
    "highest_price_1y": 154800,
    "lowest_price_1y": 96200,
    "_foreign_owned_pct_raw": 0.4712,
    "_foreign_max_pct_raw": 0.49,
    "_state_pct_raw": 0.0568,
    "foreign_current_percent": 47.12,
    "foreign_current_room": 27636000,
    "foreign_total_room": 720300000,
    "foreign_room_percentage": 0.49
  },
  "meta": {
    "source": "KBS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/FPT"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không khớp `^[A-Z0-9]{1,10}$` | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | KBS lỗi/timeout, HOẶC object kết quả cuối cùng rỗng `{}` | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Đây là endpoint có suy giảm **nhiều tầng nhất** của chương. Thứ tự chính xác:

1. **KBS profile là bắt buộc.** Nếu request KBS ném lỗi (timeout / 4xx / 5xx sau retry) ⇒
   toàn bộ endpoint **502**. Nếu KBS trả `200` nhưng payload không phải dict hoặc rỗng ⇒
   `fetch_company_profile` trả `{}` và `normalize_overview({})` trả `{}` — **chưa 502 ngay**.
2. **Ba bước làm giàu là best-effort, mỗi bước bọc `try/except` riêng.** Bước nào lỗi thì chỉ
   log `debug` và bỏ qua; response vẫn 200 với các field còn lại.
   - VCI `company/details` lỗi ⇒ mất `sector`, `company_profile`, `icb_name_*`, `market_cap`,
     `free_float*`, ba khoá `_*_raw`, `foreign_current_percent`.
   - VCI `price-history` 1Y lỗi ⇒ mất `foreign_current_room`, `foreign_total_room`,
     `foreign_room_percentage`, và mất **nguồn dự phòng** của `highest_price_1y`/`lowest_price_1y`.
   - VCI `price-history` 1W lỗi ⇒ mất `average_match_volume_2_week`.
3. **Chỉ khi object cuối cùng vẫn rỗng** thì validator mặc định mới cho 502. Hệ quả: nếu KBS
   rỗng nhưng VCI `details` chạy được, endpoint trả **200** với dữ liệu **hoàn toàn từ VCI**,
   nhưng `meta.source` vẫn ghi `"KBS"` và `raw_endpoint` vẫn là URL KBS. Đây là hành vi thật,
   phải giữ.
4. `_icb_lookup` gọi `VCI icb-codes`; lỗi ⇒ trả `None` ⇒ chỉ thiếu `icb_name_2`/`icb_name_4`.
   Kết quả tra được ghi vào cache in-process **không TTL** (rò rỉ nhẹ, chấp nhận được vì
   tập ICB hữu hạn).
5. Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/company/FPT/overview' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Bất biến số học phải giữ:** `charter_capital == outstanding_shares * par_value`
  (KBS `KLCPNY == KLCPLH * FV`). Test live đang assert điều này. Ba field KBS bị **cố ý loại bỏ**
  vì làm tròn/trùng lặp: `CC` (vốn điều lệ tính **tỷ đồng**, làm tròn), `VL` (KL niêm yết tính
  **triệu cổ phiếu**, làm tròn), `SFV` (trùng `FV`). Không được thêm lại chúng —
  test assert `"listed_volume" not in data`, `"free_float_vnd" not in data`,
  `"free_float_shares" not in data`.
- **Đơn vị chốt hạ:** `charter_capital` = **VND**; `outstanding_shares` = **số cổ phiếu**;
  `par_value` / `listing_price` = **VND/cổ phiếu**; `foreign_current_percent` = **0..100**;
  `_foreign_owned_pct_raw` / `_foreign_max_pct_raw` / `_state_pct_raw` = **0..1**;
  `free_float_percentage` và `foreign_room_percentage` = **0..1** (không quy đổi).
  Đây là endpoint duy nhất trong chương trộn cả hai thang tỷ lệ trong **một** object.
- **Ba khoá `_*_raw` phải xuất hiện trong JSON.** Chúng bắt đầu bằng gạch dưới nhưng vẫn là
  khoá dict bình thường và **không** bị lọc trước khi serialize. Nếu bản NestJS dùng DTO có
  `excludeExtraneousValues` hoặc bỏ field bắt đầu bằng `_`, sẽ mất field → lệch parity.
- **`setdefault` vs "chỉ ghi khi trống".** Hai cơ chế khác nhau, không được đồng nhất:
  - `_merge_company_details`: bỏ qua giá trị `None`/`""` của VCI, và **chỉ ghi khi**
    `!overview[dest]` (falsy — nên `0` cũng bị coi là trống và sẽ bị ghi đè!).
  - Khối 1Y: dùng `setdefault`, tức là **ghi cả `null`** khi khoá chưa tồn tại. Vì vậy
    `highest_price_1y`, `lowest_price_1y`, `foreign_current_room`, `foreign_total_room`,
    `foreign_room_percentage`, `market_cap` **có thể xuất hiện với giá trị `null`**.
  - `average_match_volume_2_week`: phép **gán thẳng**, luôn ghi đè nếu tính được.
- Thứ tự ưu tiên `foreign_current_percent`: `details.foreigner_percentage` trước, sau đó mới
  `price-history 1Y .foreign_owned_percentage`. Cùng công thức `pct < 1 ? pct*100 : pct`.
- `average_match_volume_2_week` = trung bình `total_match_volume` của **tối đa 2 bản ghi tuần**,
  và **chỉ tính trên bản ghi có giá trị truthy** (0 bị loại khỏi mẫu số!). Công thức đúng là
  `sum(vols)/len(vols)` với `vols = rows.map(total_match_volume).filter(Boolean)`.
- Strip HTML: KBS strip bằng `/<[^>]+>/` rồi `.trim()` và **chỉ khi** giá trị là string chứa
  `<` hoặc `&`. VCI `profile` strip bằng hàm khác: thay tag bằng **dấu cách**, `html.unescape`,
  rồi gom whitespace. Hai hàm cho kết quả khác nhau — giữ đúng hàm cho đúng nguồn.
- `number_of_employees`: KBS `HM` là giá trị ban đầu, nhưng nếu `LaborStructure[]` tồn tại và
  tổng `Value` (ép `int`, bỏ qua phần tử lỗi) **> 0** thì tổng đó **ghi đè**.

---

### GET /api/v1/market-data/company/{symbol}/news

> **Tin doanh nghiệp (KBS)** — danh sách bài viết liên quan mã, đã strip HTML phần tóm tắt.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_TTL_NEWS_SECONDS` = **300s**, **`cache_empty = true`** (mảng rỗng cũng được cache) |
| **Nguồn dữ liệu** | **KBS** `GET https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/news/{SYMBOL}?l=1&p=1&s=20` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | **Không** expose phân trang. Backend cứng `p=1`, `s=20` khi gọi KBS |

**Request body**

—

**Response 200**

~~~ts
type MdCompanyNewsResponse = MdCompanyNewsItem[];
~~~

~~~json
{
  "data": [
    {
      "article_id": 987654,
      "title": "FPT ký hợp đồng chuyển đổi số 120 triệu USD tại Nhật Bản",
      "summary": "Doanh thu ký mới khối nước ngoài tăng 28% so với cùng kỳ.",
      "url": "https://kbbuddywts.kbsec.com.vn/news/987654",
      "published_at": "2026-08-15T09:30:00"
    },
    {
      "article_id": 987201,
      "title": "FPT công bố KQKD 7 tháng: LNTT tăng 21%",
      "summary": "Lợi nhuận trước thuế 7 tháng đạt 7.512 tỷ đồng.",
      "url": "https://kbbuddywts.kbsec.com.vn/news/987201",
      "published_at": "2026-08-12T16:05:00"
    }
  ],
  "meta": {
    "source": "KBS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/news/FPT"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | KBS ném lỗi sau retry | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Endpoint **duy nhất** trong chương dùng `allow_empty = true`: nếu KBS trả `200` với payload
không phải mảng, hoặc mảng rỗng, kết quả là **`200` với `data: []`** — không 502. Kết hợp với
`cache_empty = true`, mảng rỗng được cache 300s (nghĩa là sau khi mã mới có tin, FE có thể còn
thấy rỗng tối đa 5 phút). Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/company/FPT/news' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- KBS news trả về **mảng ở top-level** (không có bao bì `{data: …}`) — khác hoàn toàn với VCI.
  Nếu không phải mảng ⇒ trả `[]`.
- Cả 5 field luôn có mặt: `title`/`url`/`published_at` fallback `""`, `article_id` fallback `null`.
  Đừng chuyển `""` thành `null` "cho gọn".
- `summary` lấy từ `Head` và strip HTML; `published_at` là chuỗi thời gian **không timezone**
  (`"2026-08-15T09:30:00"`), không phải ISO UTC. Đừng tự ý thêm `Z`.
- Hàm `fetch_company_news` có tham số `page`/`page_size` nhưng route **không** expose. Nếu muốn
  mở phân trang thì đó là **thay đổi API**, không phải parity.

---

### GET /api/v1/market-data/company/{symbol}/officers

> **Ban lãnh đạo** — danh sách lãnh đạo từ khối `Leaders` của hồ sơ KBS.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_TTL_MACRO_SECONDS` = **900s** |
| **Nguồn dữ liệu** | **KBS** `GET .../stockinfo/profile/{SYMBOL}?l=1` → khối `Leaders` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không có |

**Request body**

—

**Response 200**

~~~ts
type MdOfficersResponse = MdOfficer[];
~~~

~~~json
{
  "data": [
    {
      "from_date": "2012",
      "position": "CTHĐQT",
      "name": "Ông Trương Gia Bình",
      "position_en": "Chairman of BOD",
      "owner_code": "CTHDQT"
    },
    {
      "from_date": "2019",
      "position": "TGĐ",
      "name": "Ông Nguyễn Văn Khoa",
      "position_en": "CEO",
      "owner_code": "TGD"
    }
  ],
  "meta": {
    "source": "KBS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/FPT"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | KBS lỗi, HOẶC **`Leaders` thiếu / rỗng / không phải mảng** | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

**Không** `allow_empty`. Doanh nghiệp không có khối `Leaders` (UPCOM nhỏ, mã mới) ⇒
`normalize_officers` trả `[]` ⇒ validator coi là thất bại ⇒ **502**, không phải `200 []`.
Đây là hành vi cần giữ (FE hiện tại xử lý 502 như "không có dữ liệu"). Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/company/FPT/officers' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Bản ghi là dict comprehension theo bảng map cố định ⇒ **cả 5 khoá luôn có**, `null` khi thiếu.
- `from_date` map từ KBS `FD` — trong khối `Leaders` thường chỉ là **năm** (`"2021"`), khác với
  `FD` ở cấp gốc profile (ngày thành lập đầy đủ). Cùng mã KBS, hai ngữ nghĩa khác nhau.
- `position` là viết tắt tiếng Việt (`PN`), `position_en` là tên đầy đủ tiếng Anh (`PO`).
  **Không** phải cặp vi/en tương ứng của cùng một chuỗi.
- Không có sắp xếp ở backend: giữ nguyên thứ tự KBS trả về.

---

### GET /api/v1/market-data/company/{symbol}/shareholders

> **Cổ đông** — danh sách cổ đông lớn từ khối `Shareholders` của hồ sơ KBS.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_TTL_MACRO_SECONDS` = **900s** |
| **Nguồn dữ liệu** | **KBS** `GET .../stockinfo/profile/{SYMBOL}?l=1` → khối `Shareholders` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không có |

**Request body**

—

**Response 200**

~~~ts
type MdShareholdersResponse = MdShareholder[];
~~~

~~~json
{
  "data": [
    {
      "name": "Ngân hàng Nhà nước Việt Nam",
      "date": "2026-03-17T00:00:00",
      "shares_owned": 6250338579,
      "ownership_percentage": 74.8
    },
    {
      "name": "Mizuho Bank, Ltd.",
      "date": "2025-12-31T00:00:00",
      "shares_owned": 837741468,
      "ownership_percentage": 15.0
    }
  ],
  "meta": {
    "source": "KBS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/VCB"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ | `"Mã chứng khoán không hợp lệ: VCB!"` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | KBS lỗi, HOẶC `Shareholders` thiếu / rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Giống `officers`: **không** `allow_empty` ⇒ không có cổ đông trong hồ sơ KBS ⇒ **502**.
Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/company/VCB/shareholders' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **`ownership_percentage` ở thang 0..100** (`74.8` = 74,8%). Khác hẳn tỷ lệ VCI IQ Insight
  (0..1). Đây là chỗ **sai đơn vị hay gặp nhất** của cả chương: cùng một trang FE hiển thị
  cổ đông (0..100 từ KBS) cạnh room ngoại (0..1 từ VCI).
- `shares_owned` là **số cổ phiếu**, không phải nghìn/triệu cổ phiếu.
- `date` là ISO datetime **không timezone**, thường có phần giờ `T00:00:00`.
- Không sắp xếp, không lọc cổ đông nhỏ ở backend. Không tính tổng — nếu FE cần "tỷ lệ còn lại"
  thì tự tính.

---

### GET /api/v1/market-data/company/{symbol}/subsidiaries

> **Công ty con / liên kết** — khối `Subsidiaries` của hồ sơ KBS, kèm nhãn `type` do backend tự suy ra.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_TTL_MACRO_SECONDS` = **900s** |
| **Nguồn dữ liệu** | **KBS** `GET .../stockinfo/profile/{SYMBOL}?l=1` → khối `Subsidiaries` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không có |

**Request body**

—

**Response 200**

~~~ts
type MdSubsidiariesResponse = MdSubsidiary[];
~~~

~~~json
{
  "data": [
    {
      "date": "2025-12-31",
      "name": "Công ty TNHH Hệ thống Thông tin FPT (FPT IS)",
      "charter_capital": 1000000000000,
      "ownership_percent": 100,
      "currency": "VND",
      "type": "subsidiary"
    },
    {
      "date": "2025-12-31",
      "name": "Công ty Cổ phần Synnex FPT",
      "charter_capital": 1500000000000,
      "ownership_percent": 47,
      "currency": "VND",
      "type": "affiliate"
    }
  ],
  "meta": {
    "source": "KBS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/FPT"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | KBS lỗi, HOẶC `Subsidiaries` thiếu / rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

**Không** `allow_empty`. Doanh nghiệp **không có công ty con** (rất phổ biến) ⇒ `[]` ⇒ **502**.
Đây là nghịch lý dễ gây bug khi viết lại: đừng "sửa" thành `200 []` nếu mục tiêu là parity.
Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/company/FPT/subsidiaries' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Ngưỡng phân loại:** `ownership_percent > 50` ⇒ `"subsidiary"`, ngược lại `"affiliate"`.
  **Đúng 50 ⇒ `"affiliate"`** (dấu `>`, không phải `>=`). Ép `float` thất bại ⇒ `"unknown"`.
- `type` **chỉ được thêm khi `ownership_percent !== null`**. Nếu KBS thiếu `OR`, bản ghi chỉ có
  5 khoá, **không** có `type`. Đừng đặt default `"unknown"` cho trường hợp này.
- `ownership_percent` thang **0..100** (lưu ý tên field khác `shareholders`: `ownership_percent`
  vs `ownership_percentage` — thiếu hậu tố `age`). Đây là lệch tên field thật, giữ nguyên.
- `charter_capital` ở đây là **VND của công ty con** theo đơn vị trong `currency`; đừng lẫn với
  `charter_capital` ở `/overview` (của công ty mẹ).

---

### GET /api/v1/market-data/company/{symbol}/price-chart

> **Biểu đồ giá điều chỉnh** — chuỗi OHLC đã điều chỉnh (chia cổ tức, thưởng) từ VCI IQ Insight, timestamp unix.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `length` |
| **Nguồn dữ liệu** | **VCI** `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/{SYMBOL}/price-chart?lengthReport={length}` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `length` | `number` (integer) | Không | `365` | `>= 1` và `<= 3650` | Số điểm dữ liệu; map sang `lengthReport` của upstream |

**Request body**

—

**Response 200**

~~~ts
type MdPriceChartResponse = MdPriceChartPoint[];
~~~

~~~json
{
  "data": [
    { "open_price": 118.4, "high_price": 120.0, "low_price": 117.9, "closing_price": 119.6, "trading_time": 1755043200 },
    { "open_price": 119.6, "high_price": 122.3, "low_price": 119.1, "closing_price": 121.4, "trading_time": 1755129600 }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-chart"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 422 | — | `length` < 1 hoặc > 3650, hoặc không parse được số | **Mảng** validation error, `msg` do framework sinh (vd `"Input should be greater than or equal to 1"`), `loc: ["query","length"]` |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC danh sách kết quả rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Nếu `body.data` không phải mảng (hoặc `body` không phải dict), `items` = `[]` ⇒ danh sách rỗng ⇒
**502**. Phần tử không phải dict bị **bỏ qua im lặng** (`continue`). Không có logic giờ giao dịch;
điểm của phiên hiện tại chỉ xuất hiện khi upstream đã tính (phụ thuộc provider).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/company/FPT/price-chart?length=90' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Tên field lệch chuẩn:** ba field đầu là `open_price`/`high_price`/`low_price` nhưng field
  đóng cửa là **`closing_price`** (không phải `close_price`). Bảng giá dùng `close_price`.
  Hai endpoint, hai tên. Giữ nguyên.
- **Bốn field giá không bao giờ `null`.** Hàm ép số trả `0.0` khi giá trị là `null` hoặc không
  parse được. Nghĩa là "thiếu dữ liệu" biểu hiện thành **`0`**, không phải `null` — FE vẽ chart
  phải tự lọc `0`. Ngược lại `trading_time` **pass-through**, có thể `null`.
- `trading_time` là **unix epoch giây** (không phải milli). Nhân 1000 trước khi đưa vào
  `new Date()`.
- **Đơn vị giá: KHÔNG được ghi trong source.** `docs/company-statistics-api-map.md` chỉ nói
  "float, giá điều chỉnh". Khác với API `trading.vietcap.com.vn` (bảng giá / intraday) — nơi
  source ghi rõ **VND tuyệt đối** (`60600` = 60.600đ) — thì service IQ Insight này không có
  ghi chú đơn vị và không có consumer nội bộ nào scale nó. **Truyền nguyên trạng, không
  nhân/chia.** Nếu cần chắc chắn, so một điểm gần nhất với `close_price` của `price-board`
  ở môi trường thật rồi ghi lại kết luận vào chương 07, mục VCI IQ Insight.
- `length` **không** giới hạn theo số phiên thực có: yêu cầu 3650 với mã mới lên sàn chỉ trả
  số điểm có thật.

---

## Nhóm giao dịch

### POST /api/v1/market-data/trading/price-board

> **Bảng giá realtime nhiều mã** — nhận danh sách 1–50 mã, trả một dòng bảng giá đầy đủ (trần/sàn/tham chiếu, 3 bậc mua, 3 bậc bán, khớp lệnh, KL/GT luỹ kế, khối ngoại, room) cho mỗi mã **có mặt trên bảng giá VCI**.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | **Riêng: `120/minute`** mỗi IP (`RATE_LIMIT_MARKET_DATA`) |
| **Cache** | **KHÔNG** — endpoint duy nhất trong chương không có `@redis_cached` |
| **Nguồn dữ liệu** | **VCI** `POST https://trading.vietcap.com.vn/api/price/symbols/getList` body `{"symbols": ["FPT","VCB",…]}` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| — | — | — | Không có path param |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không có |

**Request body**

~~~ts
interface MdPriceBoardRequest {
  /**
   * Danh sách mã. minItems = 1, maxItems = 50.
   * Mỗi phần tử: trim → toUpperCase → phải khớp /^[A-Z0-9]{1,10}$/.
   * Giá trị đã chuẩn hoá (đã upper) mới là cái gửi lên VCI.
   */
  symbols: string[];
  /**
   * "auto" | "VCI" | "VND" — pattern ^(auto|VCI|VND)$.
   * ⚠️ Field ĐƯỢC validate nhưng KHÔNG được handler đọc. Xem ghi chú.
   */
  source?: "auto" | "VCI" | "VND";
}
~~~

~~~json
{
  "symbols": ["FPT", "VCB", "HPG", "VNM"],
  "source": "auto"
}
~~~

**Response 200**

~~~ts
type MdPriceBoardResponse = MdPriceBoardRow[];
~~~

~~~json
{
  "data": [
    {
      "symbol": "FPT",
      "exchange": "HOSE",
      "ceiling_price": 129900,
      "floor_price": 112900,
      "reference_price": 121400,
      "open_price": 121000,
      "high_price": 123500,
      "low_price": 120400,
      "close_price": 123500,
      "average_price": 122180,
      "total_volume": 6842300,
      "total_value": 836150000000,
      "bid_prices": [
        { "price": 123400, "volume": 12500 },
        { "price": 123300, "volume": 31200 },
        { "price": 123200, "volume": 45800 }
      ],
      "ask_prices": [
        { "price": 123500, "volume": 8700 },
        { "price": 123600, "volume": 22400 },
        { "price": 123700, "volume": 19300 }
      ],
      "foreign_buy_volume": 1204500,
      "foreign_sell_volume": 1876300,
      "foreign_buy_value": 147210,
      "foreign_sell_value": 229180,
      "foreign_remaining_room": 27636000,
      "foreign_total_room": 720300000
    },
    {
      "symbol": "VCB",
      "exchange": "HOSE",
      "ceiling_price": 68900,
      "floor_price": 59900,
      "reference_price": 64400,
      "open_price": 64500,
      "high_price": 65200,
      "low_price": 64100,
      "close_price": 64800,
      "average_price": 64670,
      "total_volume": 2145600,
      "total_value": 138750000000,
      "bid_prices": [
        { "price": 64700, "volume": 54300 },
        { "price": 64600, "volume": 88100 },
        { "price": 64500, "volume": 126400 }
      ],
      "ask_prices": [
        { "price": 64800, "volume": 41200 },
        { "price": 64900, "volume": 67500 },
        { "price": 65000, "volume": 152800 }
      ],
      "foreign_buy_volume": 320400,
      "foreign_sell_volume": 118700,
      "foreign_buy_value": 20740,
      "foreign_sell_value": 7680,
      "foreign_remaining_room": 1204518000,
      "foreign_total_room": 4093280000
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://trading.vietcap.com.vn/api/price/symbols/getList"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbols` là `[]` | **Mảng** validation error, `loc: ["body","symbols"]`, `msg` framework: `"List should have at least 1 item after validation, not 0"` |
| 422 | — | `symbols` có > 50 phần tử | **Mảng**, `msg`: `"List should have at most 50 items after validation, not 51"` |
| 422 | — | `symbols` không phải mảng | **Mảng**, `msg` chứa `"Value error, symbols phải là một danh sách"` |
| 422 | — | Phần tử không phải chuỗi | **Mảng**, `msg` chứa `"Value error, symbols[2] phải là chuỗi, hiện là int"` |
| 422 | — | Phần tử sai định dạng mã | **Mảng**, `msg` chứa `"Value error, symbols[1]='fp t' không hợp lệ. Mỗi mã phải gồm 1-10 ký tự chữ hoặc số viết hoa."` |
| 422 | — | `source` không thuộc `auto\|VCI\|VND` | **Mảng**, `loc: ["body","source"]`, lỗi pattern |
| 429 | — | Vượt **`120/minute`** | Do middleware rate-limit |
| 502 | — | VCI lỗi sau retry, HOẶC danh sách kết quả rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

- **Mã không tồn tại trên bảng giá ⇒ bỏ qua IM LẶNG.** VCI trả `null` tại vị trí đó trong mảng
  (điển hình: mã chỉ số như `VNINDEX`, mã sai, mã đã hủy niêm yết). Backend `continue` qua mọi
  phần tử không phải dict. Vì vậy **`data.length` có thể < `symbols.length`** và **không** có
  cảnh báo, không có field `errors`.
- **Không có mã nào hợp lệ ⇒ `data` rỗng ⇒ 502** (không phải `200 []`). Gửi `{"symbols":["VNINDEX"]}`
  sẽ nhận **502**.
- **Chưa có khớp lệnh (đầu phiên / mã đứng) ⇒ `matchPrice` = `null`** ⇒ backend dùng `{}` ⇒
  toàn bộ `open_price`, `high_price`, `low_price`, `close_price`, `average_price`,
  `total_volume`, `total_value`, 4 field khối ngoại, 2 field room đều `null`, nhưng
  `symbol`/`exchange`/`ceiling_price`/`floor_price`/`reference_price` vẫn có (từ `listingInfo`).
  Dòng đó **vẫn được trả về**.
- **Thiếu sổ lệnh ⇒ `bid_prices`/`ask_prices` = `[]`** (mảng rỗng, không phải `null`).
- **Ngoài giờ giao dịch:** endpoint **không** có nhánh kiểm tra giờ. VCI vẫn trả snapshot của
  **phiên gần nhất** (đây là lý do cầu nối realtime ở chế độ suy giảm dùng `close_price` từ
  endpoint này làm giá hiện tại). Khác với `/quotes/{symbol}/intraday` và
  `/quotes/{symbol}/price-depth` (chương 22) — hai endpoint đó **rỗng ngoài phiên** và có
  `allow_empty = true`.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/market-data/trading/price-board' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{"symbols":["FPT","VCB","HPG","VNM"],"source":"auto"}'
~~~

**Ghi chú khi viết lại**

- **`source` là field chết.** Nó được validate theo pattern `^(auto|VCI|VND)$` nhưng handler
  **không đọc** `body.source` — luôn gọi VCI. Gửi `"source":"VND"` vẫn nhận `meta.source = "VCI"`.
  Phải giữ **cả hai**: validate pattern (để `"source":"XYZ"` vẫn 422) **và** bỏ qua giá trị.
- **Thứ tự kết quả KHÔNG được đảm bảo theo input.** Backend giữ đúng thứ tự VCI trả về, không
  sắp lại theo `symbols`. FE muốn map theo mã phải tự index theo `row.symbol`, không dùng
  `data[i]` ↔ `symbols[i]`.
- **Trùng mã trong input** không bị loại: `["FPT","FPT"]` được gửi nguyên lên VCI; số dòng trả
  về phụ thuộc provider.
- **Chuẩn hoá mã xảy ra ở validator**, trước khi vào handler: `" fpt "` → `"FPT"`. Nghĩa là
  khoảng trắng đầu/cuối được **chấp nhận**, còn khoảng trắng giữa (`"fp t"`) bị **từ chối**.
- **Đơn vị giá: VND tuyệt đối** (`123500` = 123.500đ). Bằng chứng trong source: bộ giải giá của
  giao dịch ảo ghi rõ *"VCI intraday returns prices in VND (e.g. 60600 for 60,600 VND)"* và dùng
  `multiplier = 1`, trong khi VND-Direct OHLCV cần `×1000`. **Đừng** ×1000.
- **`total_value` đã được backend ×1_000_000** (upstream `accumulatedValue` tính **triệu đồng**).
  Kết quả là **VND**. Nếu upstream trả `null` thì để `null` (không thành `0`).
- **CẢNH BÁO bất nhất đã tồn tại:** `foreign_buy_value` / `foreign_sell_value` là
  **pass-through, KHÔNG ×1e6**, trong khi `total_value` thì có. Source không ghi đơn vị cho hai
  field khối ngoại này. Vì cùng nằm trong khối `matchPrice` với `accumulatedValue`, rất có thể
  chúng cũng ở **triệu đồng** — nhưng **không được tự nhân** khi viết lại, vì FE đang đọc giá trị
  hiện tại. Chép đúng hành vi và ghi TODO. (Ví dụ JSON ở trên phản ánh đúng: `foreign_buy_value:
  147210` với `foreign_buy_volume: 1204500` chỉ nhất quán nếu đơn vị là triệu đồng.)
- **Chỉ 3 bậc**: backend cắt `raw_levels.slice(0, 3)` cho mỗi bên, kể cả khi VCI trả nhiều hơn.
  Mỗi bậc chỉ giữ `price` + `volume`, bỏ mọi field khác.
- **`close_price` là giá KHỚP GẦN NHẤT** (`matchPrice.matchPrice`), không phải giá đóng cửa cuối
  phiên. Trong phiên nó thay đổi liên tục. Tên field gây nhầm — giữ nguyên.
- `exchange`: chỉ map `HSX → HOSE`; `HNX`/`UPCOM` giữ nguyên; giá trị lạ **pass-through**.
- Khi viết lại bằng NestJS, khai báo route `POST 'trading/price-board'` **trước** các route
  động `':symbol/...'` trong cùng controller để tránh mọi rủi ro matching.

---

### GET /api/v1/market-data/trading/{symbol}/history

> **Lịch sử thống kê giao dịch đầy đủ** — toàn bộ bản ghi `price-history` của VCI IQ Insight, **không lọc field**: gồm cả khối ngoại, cung-cầu, giá, vốn hoá.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `resolution`, `fromDate`, `toDate`, `page`, `size` |
| **Nguồn dữ liệu** | **VCI** `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/{SYMBOL}/price-history?timeFrame=…&page=…&size=…[&fromDate=…&toDate=…]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `resolution` | `string` | Không | `"1D"` | Phải thuộc `1D\|1W\|1M\|1Q\|1Y` | Khung thời gian; map sang `timeFrame` |
| `fromDate` | `string \| null` | Không | `null` | Khớp `^\d{8}$` | Ngày bắt đầu **YYYYMMDD**. Chỉ có hiệu lực khi **cả** `fromDate` và `toDate` được truyền |
| `toDate` | `string \| null` | Không | `null` | Khớp `^\d{8}$` | Ngày kết thúc **YYYYMMDD** |
| `page` | `number` (integer) | Không | `0` | `>= 0`, `<= 1000` | Trang, **đếm từ 0** |
| `size` | `number` (integer) | Không | `50` | `>= 1`, `<= 200` | Số bản ghi/trang |

**Request body**

—

**Response 200**

~~~ts
type MdTradingHistoryResponse = MdTradingHistoryRow[];
~~~

~~~json
{
  "data": [
    {
      "trading_date": "2026-08-14",
      "highest_price": 123500,
      "lowest_price": 120400,
      "market_cap": 178500000000000,
      "total_match_volume": 6842300,
      "total_buy_trade": 8412,
      "total_buy_trade_volume": 3541200,
      "total_sell_trade": 9105,
      "total_sell_trade_volume": 3301100,
      "total_net_trade_volume": 240100,
      "average_buy_trade_volume": 421,
      "average_sell_trade_volume": 363,
      "total_buy_unmatched_volume": 184500,
      "total_sell_unmatched_volume": 212700,
      "foreign_buy_volume_matched": 1204500,
      "foreign_buy_value_matched": 147210000000,
      "foreign_sell_volume_matched": 1876300,
      "foreign_sell_value_matched": 229180000000,
      "foreign_net_volume_matched": -671800,
      "foreign_net_value_matched": -81970000000,
      "foreign_buy_volume_deal": 0,
      "foreign_buy_value_deal": 0,
      "foreign_sell_volume_deal": 0,
      "foreign_sell_value_deal": 0,
      "foreign_buy_volume_total": 1204500,
      "foreign_buy_value_total": 147210000000,
      "foreign_sell_volume_total": 1876300,
      "foreign_sell_value_total": 229180000000,
      "foreign_net_volume_total": -671800,
      "foreign_net_value_total": -81970000000,
      "foreign_total_room": 720300000,
      "foreign_current_room": 27636000,
      "foreign_room_percentage": 0.49,
      "foreign_owned_percentage": 0.4712,
      "foreign_available_percentage": 0.0188,
      "foreign_owned": 692664000
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-history"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ (kiểm **trước** `resolution`) | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 422 | — | `resolution` không thuộc 5 giá trị | `"Giá trị resolution không hợp lệ: 1H"` (chuỗi) |
| 422 | — | `fromDate` không khớp `^\d{8}$` | `"Giá trị fromDate không hợp lệ: '2026-08-01'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `toDate` không khớp `^\d{8}$` | `"Giá trị toDate không hợp lệ: '2026-8-1'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `page`/`size` ngoài biên | **Mảng** validation error |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC `data.content` không tồn tại / rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

- Backend đọc đúng đường dẫn `body.data.content`. Nếu bất kỳ tầng nào thiếu, hoặc `content`
  không phải mảng ⇒ `[]` ⇒ **502**.
- `page` vượt số trang thực có ⇒ upstream trả `content: []` ⇒ **502** (không phải `200 []`).
  Đây là điểm phải cẩn thận khi FE cuộn vô hạn.
- Không có logic giờ giao dịch. Bản ghi của phiên đang diễn ra có xuất hiện hay không hoàn toàn
  do VCI quyết định.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/FPT/history?resolution=1D&fromDate=20260701&toDate=20260814&page=0&size=50' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra bắt buộc:** `symbol` (upper + regex) → `resolution` → `fromDate` → `toDate`
  → mới tới ràng buộc `page`/`size` của framework. Với request sai cả `symbol` và `resolution`,
  response phải là lỗi **symbol**.
- **`fromDate`/`toDate` là cặp bất khả phân.** Provider layer chỉ thêm `fromDate`+`toDate` vào
  query upstream khi **cả hai** truthy. Truyền một mình `fromDate` ⇒ **bị bỏ qua hoàn toàn**,
  upstream trả cửa sổ mặc định. Không có lỗi, không có cảnh báo.
- Backend gọi `.replace("-","")` trên hai giá trị này. Vì regex đã buộc `^\d{8}$` nên đây là
  no-op — nhưng vẫn giữ để parity nếu sau này nới regex.
- **Không lọc field.** Endpoint này là superset của `/foreign-trade` và `/supply-demand`. Mọi
  khoá camelCase của upstream đều đi qua bộ đổi tên. Đừng khai báo DTO whitelist — dùng
  pass-through + index signature.
- **`page` đếm từ 0** (khác các endpoint DB-backed trong hệ thống đếm từ 1). `size` tối đa **200**
  còn `limit` của `/foreign-trade` tối đa **1000** — hai endpoint đọc cùng upstream nhưng có
  trần khác nhau.
- Không có tổng số bản ghi / tổng số trang trong response. Envelope chỉ có `data` + `meta`.
- Không sắp xếp ở backend: giữ nguyên thứ tự VCI (thực tế là mới nhất trước).

---

### GET /api/v1/market-data/trading/{symbol}/summary

> **Tóm tắt thống kê giao dịch đầy đủ** — object phẳng tổng hợp cả kỳ từ `price-history-summary`, **không lọc field**.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `resolution`, `fromDate`, `toDate` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/price-history-summary?timeFrame=…[&fromDate=…&toDate=…]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `resolution` | `string` | Không | `"1D"` | `1D\|1W\|1M\|1Q\|1Y` | Khung thời gian gộp của upstream |
| `fromDate` | `string \| null` | Không | `null` | `^\d{8}$` | Đầu khoảng tổng hợp, YYYYMMDD; cần **cả cặp** |
| `toDate` | `string \| null` | Không | `null` | `^\d{8}$` | Cuối khoảng tổng hợp, YYYYMMDD |

> **Không có `page`/`size`** — đây là điểm khác shape đầu tiên so với `/history`.

**Request body**

—

**Response 200**

~~~ts
type MdTradingSummaryResponse = MdTradingSummary; // OBJECT, không phải mảng
~~~

~~~json
{
  "data": {
    "total_buy_trade_volume": 138420000,
    "total_sell_trade_volume": 141075000,
    "total_net_trade_volume": -2655000,
    "total_buy_trade_volume_avg": 4614000,
    "total_sell_trade_volume_avg": 4702500,
    "total_buy_unmatched_volume": 7218000,
    "total_sell_unmatched_volume": 8104500,
    "total_buy_unmatched_volume_avg": 240600,
    "total_sell_unmatched_volume_avg": 270150,
    "foreign_buy_volume_total": 32418000,
    "foreign_buy_value_total": 3948120000000,
    "foreign_sell_volume_total": 41205000,
    "foreign_sell_value_total": 5024810000000,
    "foreign_net_volume_total": -8787000,
    "foreign_net_value_total": -1076690000000,
    "foreign_net_volume_total_avg": -292900,
    "foreign_net_value_total_avg": -35889666
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-history-summary"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ (kiểm trước) | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 422 | — | `resolution` sai | `"Giá trị resolution không hợp lệ: 5D"` (chuỗi) |
| 422 | — | `fromDate` sai định dạng | `"Giá trị fromDate không hợp lệ: '20260'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `toDate` sai định dạng | `"Giá trị toDate không hợp lệ: 'today'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC `data` là `{}` / không phải dict | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Backend đọc `body.data` (object phẳng, **không** có `.content`). Nếu `body` không phải dict hoặc
`data` không phải dict ⇒ `{}` ⇒ **502**. Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/FPT/summary?resolution=1D&fromDate=20260701&toDate=20260814' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Khác shape so với `/history`:** `data` là **object**, không phải mảng; **không** có `page`/`size`;
  **không** có `trading_date`.
- **Khoảng tổng hợp được điều khiển bởi `fromDate` + `toDate`** (cần cả cặp). `resolution` điều
  khiển **cách gộp** của upstream (`ONE_DAY`… `ONE_YEAR`), không phải độ dài cửa sổ. Nếu bỏ trống
  cả cặp ngày, cửa sổ là mặc định của provider (không được ghi trong source ⇒ đừng giả định).
- **Field `_avg` chỉ có ở bản summary**, là **trung bình theo ngày** trong kỳ. Bản `/history`
  không có `_avg` mà có `average_buy_trade_volume` / `average_sell_trade_volume` — nghĩa hoàn
  toàn khác (**trung bình mỗi lệnh**, không phải mỗi ngày). Đừng gộp hai khái niệm.
- Cùng đường dẫn upstream với `/foreign-trade/summary` và `/supply-demand/summary`; ba route đó
  chỉ khác nhau ở bộ lọc field. Nếu viết lại, dùng **một** service method rồi lọc ở tầng
  controller, đúng như bản Python.

---

### GET /api/v1/market-data/trading/{symbol}/foreign-trade

> **Lịch sử giao dịch khối ngoại theo ngày** — lọc từ `price-history` chỉ những field bắt đầu bằng `foreign`, kèm `trading_date`.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `start`, `end`, `limit` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/price-history?timeFrame=ONE_DAY&page=0&size={limit}[&fromDate&toDate]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `start` | `string \| null` | Không | `null` | **Không validate** | Ngày bắt đầu **YYYY-MM-DD** (khác định dạng với `fromDate` của các endpoint khác!). Chỉ có hiệu lực khi có **cả** `start` và `end` |
| `end` | `string \| null` | Không | `null` | **Không validate** | Ngày kết thúc **YYYY-MM-DD** |
| `limit` | `number` (integer) | Không | `100` | `>= 1`, `<= 1000` | Số bản ghi; map sang `size` của upstream. **Không** có tham số `page` (cứng `page=0`) |

> **Không có `resolution`** — provider luôn nhận `timeFrame=ONE_DAY` (default của hàm service).

**Request body**

—

**Response 200**

~~~ts
/**
 * Mỗi phần tử = mọi khoá bắt đầu bằng "foreign" của bản ghi price-history,
 * CỘNG THÊM trading_date được gán ở CUỐI (luôn có mặt, có thể null).
 */
type MdForeignTradeRow = MdForeignFields & { trading_date: string | null };
type MdForeignTradeResponse = MdForeignTradeRow[];
~~~

~~~json
{
  "data": [
    {
      "foreign_buy_volume_matched": 1204500,
      "foreign_buy_value_matched": 147210000000,
      "foreign_sell_volume_matched": 1876300,
      "foreign_sell_value_matched": 229180000000,
      "foreign_net_volume_matched": -671800,
      "foreign_net_value_matched": -81970000000,
      "foreign_buy_volume_deal": 0,
      "foreign_buy_value_deal": 0,
      "foreign_sell_volume_deal": 500000,
      "foreign_sell_value_deal": 61000000000,
      "foreign_net_volume_deal": -500000,
      "foreign_net_value_deal": -61000000000,
      "foreign_buy_volume_total": 1204500,
      "foreign_buy_value_total": 147210000000,
      "foreign_sell_volume_total": 2376300,
      "foreign_sell_value_total": 290180000000,
      "foreign_net_volume_total": -1171800,
      "foreign_net_value_total": -142970000000,
      "foreign_total_room": 720300000,
      "foreign_current_room": 27636000,
      "foreign_room_percentage": 0.49,
      "foreign_owned_percentage": 0.4712,
      "foreign_available_percentage": 0.0188,
      "foreign_owned": 692664000,
      "trading_date": "2026-08-14"
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-history"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 422 | — | `limit` < 1 hoặc > 1000 | **Mảng** validation error, `loc: ["query","limit"]` |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC `data.content` rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

- `start`/`end` **không được validate**: chuỗi rác (`"hôm qua"`) được `.replace("-","")` rồi gửi
  thẳng lên VCI. Upstream có thể trả rỗng ⇒ **502**, hoặc bỏ qua tham số. **Không** có 422 cho
  định dạng ngày ở endpoint này.
- Chỉ truyền một trong hai (`start` mà không có `end`) ⇒ **cả hai bị bỏ qua**, trả cửa sổ mặc định.
- `data.content` rỗng hoặc thiếu ⇒ danh sách rỗng ⇒ **502**.
- Bản ghi upstream không có `trading_date` ⇒ field vẫn xuất hiện với giá trị `null`
  (gán tường minh, không phải điều kiện).
- Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/FPT/foreign-trade?start=2026-07-01&end=2026-08-14&limit=45' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **BẪY ĐỊNH DẠNG NGÀY LỚN NHẤT CỦA CHƯƠNG.** Endpoint này dùng `start`/`end` dạng
  **`YYYY-MM-DD`** và **không validate**. Chín endpoint `trading/*` còn lại dùng
  `fromDate`/`toDate` dạng **`YYYYMMDD`** và **validate bằng regex, trả 422**. Đừng thống nhất
  tên/định dạng — FE đang gọi đúng như vậy.
- **`trading_date` nằm ở CUỐI object** (được gán sau khi lọc `foreign*`). Ở `/supply-demand` nó
  nằm **đầu**. Thứ tự khoá JSON không phải hợp đồng, nhưng nếu so sánh snapshot response trong
  test thì phải biết.
- **Dấu:** `foreign_net_* = mua − bán`. **Dương = khối ngoại MUA ròng**, âm = bán ròng.
- **Đơn vị:** `*_volume_*` = **cổ phiếu**; `*_value_*` = **VND chính xác, không scale**
  (khác hoàn toàn `foreign_buy_value` của `price-board`); `*_percentage` = **tỷ số 0..1**
  (`0.49` = 49%); `foreign_total_room` / `foreign_current_room` / `foreign_owned` = **cổ phiếu**.
- Bộ lọc là **so khớp tiền tố chuỗi `"foreign"`** trên tên snake_case. Bất kỳ field mới nào của
  VCI bắt đầu bằng `foreign` sẽ **tự động** xuất hiện. Không hard-code whitelist.
- `limit` map sang `size`, **`page` luôn 0**. Không có cách lấy trang 2 qua endpoint này — muốn
  phân trang thật thì dùng `/history` (có `page`) rồi tự lọc.
- Route này dùng `limit` (trần 1000) trong khi `/history` dùng `size` (trần 200) cho **cùng một**
  tham số upstream. Bất nhất có thật, giữ nguyên.

---

### GET /api/v1/market-data/trading/{symbol}/foreign-trade/summary

> **Tóm tắt giao dịch khối ngoại trong kỳ** — lọc từ `price-history-summary` chỉ những field bắt đầu bằng `foreign`.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `resolution`, `fromDate`, `toDate` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/price-history-summary?timeFrame=…[&fromDate&toDate]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `resolution` | `string` | Không | `"1D"` | `1D\|1W\|1M\|1Q\|1Y` | Cách gộp của upstream |
| `fromDate` | `string \| null` | Không | `null` | `^\d{8}$` | Đầu khoảng, **YYYYMMDD**; cần cả cặp |
| `toDate` | `string \| null` | Không | `null` | `^\d{8}$` | Cuối khoảng, **YYYYMMDD** |

**Request body**

—

**Response 200**

~~~ts
/** Object phẳng, CHỈ giữ khoá bắt đầu bằng "foreign". KHÔNG có trading_date. */
type MdForeignTradeSummaryResponse = MdForeignFields;
~~~

~~~json
{
  "data": {
    "foreign_buy_volume_total": 32418000,
    "foreign_buy_value_total": 3948120000000,
    "foreign_sell_volume_total": 41205000,
    "foreign_sell_value_total": 5024810000000,
    "foreign_net_volume_total": -8787000,
    "foreign_net_value_total": -1076690000000,
    "foreign_buy_volume_total_avg": 1080600,
    "foreign_buy_value_total_avg": 131604000000,
    "foreign_sell_volume_total_avg": 1373500,
    "foreign_sell_value_total_avg": 167493666,
    "foreign_net_volume_total_avg": -292900,
    "foreign_net_value_total_avg": -35889666,
    "foreign_buy_volume_matched": 31918000,
    "foreign_sell_volume_matched": 40705000,
    "foreign_net_volume_matched": -8787000,
    "foreign_buy_volume_deal": 500000,
    "foreign_sell_volume_deal": 500000,
    "foreign_net_volume_deal": 0
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-history-summary"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ (kiểm trước) | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 422 | — | `resolution` sai | `"Giá trị resolution không hợp lệ: 1H"` (chuỗi) |
| 422 | — | `fromDate` sai định dạng | `"Giá trị fromDate không hợp lệ: '2026-07-01'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `toDate` sai định dạng | `"Giá trị toDate không hợp lệ: '2026-08-14'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC summary **không có field nào bắt đầu bằng `foreign`** | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Điểm đặc thù: bộ lọc chạy **trước** validator. Nếu upstream trả summary hợp lệ nhưng **không**
chứa field `foreign*` (mã không có dữ liệu khối ngoại), kết quả sau lọc là `{}` ⇒ validator coi
là thất bại ⇒ **502**, dù upstream đã trả 200 có dữ liệu cung-cầu. Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/FPT/foreign-trade/summary?resolution=1D&fromDate=20260701&toDate=20260814' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Khác shape so với bản list:** object thay vì mảng; dùng `resolution`+`fromDate`/`toDate`
  (YYYYMMDD, có validate) thay vì `start`/`end` (YYYY-MM-DD, không validate) + `limit`;
  **không** có `trading_date`.
- **Khoảng tổng hợp** = `[fromDate, toDate]` khi truyền cả cặp; nếu không, là cửa sổ mặc định
  của provider. `resolution` chỉ đổi cách gộp.
- Bộ lọc ở đây (`_foreign_fields`) **không** thêm `trading_date` — khác `fetch_foreign_trade`
  của bản list. Hai hàm lọc khác nhau, đừng dùng chung.
- **Dấu và đơn vị** giống bản list: net = mua − bán, dương = mua ròng; volume = cổ phiếu;
  value = VND không scale; percentage = 0..1.
- Field `*_avg` = **trung bình theo ngày trong kỳ**.

---

### GET /api/v1/market-data/trading/{symbol}/supply-demand

> **Lịch sử cung-cầu theo ngày** — lọc từ `price-history` các field lệnh mua/bán/chưa khớp, giữ `trading_date` ở đầu.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `resolution`, `fromDate`, `toDate`, `page`, `size` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/price-history?timeFrame=…&page=…&size=…[&fromDate&toDate]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `resolution` | `string` | Không | `"1D"` | `1D\|1W\|1M\|1Q\|1Y` | Khung thời gian |
| `fromDate` | `string \| null` | Không | `null` | `^\d{8}$` | YYYYMMDD; cần cả cặp |
| `toDate` | `string \| null` | Không | `null` | `^\d{8}$` | YYYYMMDD |
| `page` | `number` (integer) | Không | `0` | `>= 0`, `<= 1000` | Trang, đếm từ 0 |
| `size` | `number` (integer) | Không | `50` | `>= 1`, `<= 200` | Số bản ghi/trang |

**Request body**

—

**Response 200**

~~~ts
/** trading_date đứng ĐẦU và CHỈ có khi bản ghi upstream có field đó. */
type MdSupplyDemandRow = { trading_date?: string } & MdSupplyDemandFields;
type MdSupplyDemandResponse = MdSupplyDemandRow[];
~~~

~~~json
{
  "data": [
    {
      "trading_date": "2026-08-14",
      "total_buy_trade": 8412,
      "total_buy_trade_volume": 3541200,
      "total_sell_trade": 9105,
      "total_sell_trade_volume": 3301100,
      "total_net_trade_volume": 240100,
      "average_buy_trade_volume": 421,
      "average_sell_trade_volume": 363,
      "total_buy_unmatched_volume": 184500,
      "total_sell_unmatched_volume": 212700
    },
    {
      "trading_date": "2026-08-13",
      "total_buy_trade": 7980,
      "total_buy_trade_volume": 3120400,
      "total_sell_trade": 8624,
      "total_sell_trade_volume": 3298700,
      "total_net_trade_volume": -178300,
      "average_buy_trade_volume": 391,
      "average_sell_trade_volume": 382,
      "total_buy_unmatched_volume": 205100,
      "total_sell_unmatched_volume": 168900
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-history"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ (kiểm trước) | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 422 | — | `resolution` sai | `"Giá trị resolution không hợp lệ: 2D"` (chuỗi) |
| 422 | — | `fromDate` sai định dạng | `"Giá trị fromDate không hợp lệ: '2026-07-01'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `toDate` sai định dạng | `"Giá trị toDate không hợp lệ: '20260'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `page`/`size` ngoài biên | **Mảng** validation error |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC `data.content` rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

- Validator chỉ kiểm **độ dài mảng ngoài**. Nếu `content` có bản ghi nhưng **không** bản ghi nào
  chứa field cung-cầu, kết quả là mảng các **object rỗng `{}`** và endpoint vẫn trả **200**.
  Đây là khác biệt quan trọng so với `/foreign-trade/summary` (object rỗng ⇒ 502).
- `content` rỗng/thiếu ⇒ mảng rỗng ⇒ **502**.
- `page` vượt số trang ⇒ **502**.
- Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/FPT/supply-demand?resolution=1D&fromDate=20260701&toDate=20260814&page=0&size=30' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Bộ lọc là 7 TIỀN TỐ chính xác** (so khớp `startsWith` trên tên snake_case):
  `total_buy_trade`, `total_sell_trade`, `total_net_trade`, `average_buy_trade`,
  `average_sell_trade`, `total_buy_unmatched`, `total_sell_unmatched`.
  Hệ quả cần nhớ:
  - `total_buy_trade` (số lệnh) **và** `total_buy_trade_volume` **và** `total_buy_trade_volume_avg`
    đều khớp cùng một tiền tố.
  - `total_match_volume`, `total_volume`, `total_value` **không** khớp ⇒ **bị loại**, dù cũng
    bắt đầu bằng `total_`.
  - Mọi `foreign*` bị loại (test assert `"foreign_buy_volume_total" not in data[0]`).
- **`total_buy_trade` là SỐ LỆNH**, không phải khối lượng. `total_buy_trade_volume` mới là
  **cổ phiếu**. Nhầm hai field này làm sai toàn bộ biểu đồ cung-cầu.
- `average_buy_trade_volume` = **cổ phiếu trên mỗi lệnh** (không phải trung bình theo ngày).
- **`trading_date` đứng đầu và có điều kiện**: chỉ được thêm khi bản ghi upstream có khoá
  `trading_date`. Khác `/foreign-trade` (luôn có, đứng cuối, có thể `null`).
- **Dấu:** `total_net_trade_volume = mua − bán` ⇒ dương = **áp lực mua** trội.
- **Trùng tên với tự doanh:** `/trading/{symbol}/proprietary` cũng có
  `total_buy_trade_volume`, `total_sell_trade_volume`. Ở đây là **toàn thị trường cho mã đó**;
  ở proprietary là **riêng khối tự doanh**. Không được share DTO giữa hai endpoint.

---

### GET /api/v1/market-data/trading/{symbol}/supply-demand/summary

> **Tóm tắt cung-cầu trong kỳ** — lọc từ `price-history-summary` bằng đúng 7 tiền tố cung-cầu.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `resolution`, `fromDate`, `toDate` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/price-history-summary?timeFrame=…[&fromDate&toDate]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `resolution` | `string` | Không | `"1D"` | `1D\|1W\|1M\|1Q\|1Y` | Cách gộp của upstream |
| `fromDate` | `string \| null` | Không | `null` | `^\d{8}$` | YYYYMMDD; cần cả cặp |
| `toDate` | `string \| null` | Không | `null` | `^\d{8}$` | YYYYMMDD |

**Request body**

—

**Response 200**

~~~ts
/** Object phẳng. trading_date KHÔNG có (summary upstream không có field này). */
type MdSupplyDemandSummaryResponse = MdSupplyDemandFields;
~~~

~~~json
{
  "data": {
    "total_buy_trade_volume": 138420000,
    "total_sell_trade_volume": 141075000,
    "total_net_trade_volume": -2655000,
    "total_buy_trade_volume_avg": 4614000,
    "total_sell_trade_volume_avg": 4702500,
    "total_buy_unmatched_volume": 7218000,
    "total_sell_unmatched_volume": 8104500,
    "total_buy_unmatched_volume_avg": 240600,
    "total_sell_unmatched_volume_avg": 270150
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/price-history-summary"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ (kiểm trước) | `"Mã chứng khoán không hợp lệ: FPT!"` (chuỗi) |
| 422 | — | `resolution` sai | `"Giá trị resolution không hợp lệ: 1H"` (chuỗi) |
| 422 | — | `fromDate` sai định dạng | `"Giá trị fromDate không hợp lệ: '2026-07-01'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `toDate` sai định dạng | `"Giá trị toDate không hợp lệ: 'now'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC summary **không có field nào khớp 7 tiền tố** | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Giống `/foreign-trade/summary`: lọc trước, validate sau ⇒ object rỗng sau lọc ⇒ **502** dù
upstream có dữ liệu khác. Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/FPT/supply-demand/summary?resolution=1D&fromDate=20260701&toDate=20260814' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Khác shape so với bản list:** object thay vì mảng; **không** có `page`/`size`; **không** có
  `trading_date`; có thêm nhóm `*_avg` mà bản list không có; **mất** `total_buy_trade` /
  `total_sell_trade` (số lệnh) và `average_*_trade_volume` nếu upstream summary không cung cấp.
- `total_buy_trade_volume_avg` / `total_sell_trade_volume_avg` = **trung bình theo NGÀY trong kỳ**
  (khác `average_buy_trade_volume` của bản list = trung bình mỗi **lệnh**). Cùng chữ "average"
  nhưng hai mẫu số khác nhau — đây là chỗ tính sai kinh điển.
- Cùng gọi `fetch_trading_summary` như `/summary` và `/foreign-trade/summary`; **hai bộ lọc bù
  trừ nhau**: `/foreign-trade/summary` lấy `foreign*`, endpoint này lấy 7 tiền tố cung-cầu, và
  `/summary` lấy tất cả. Test hiện có assert tính loại trừ này theo cả hai chiều.
- Dấu: `total_net_trade_volume` dương = mua trội trong cả kỳ.

---

### GET /api/v1/market-data/trading/{symbol}/proprietary

> **Lịch sử giao dịch tự doanh theo ngày** — endpoint upstream **riêng biệt** (`proprietary-history`), không lọc field.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `resolution`, `fromDate`, `toDate`, `page`, `size` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/proprietary-history?timeFrame=…&page=…&size=…[&fromDate&toDate]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `resolution` | `string` | Không | `"1D"` | `1D\|1W\|1M\|1Q\|1Y` | Khung thời gian |
| `fromDate` | `string \| null` | Không | `null` | `^\d{8}$` | YYYYMMDD; cần cả cặp |
| `toDate` | `string \| null` | Không | `null` | `^\d{8}$` | YYYYMMDD |
| `page` | `number` (integer) | Không | `0` | `>= 0`, `<= 1000` | Trang, đếm từ 0 |
| `size` | `number` (integer) | Không | `50` | `>= 1`, `<= 200` | Số bản ghi/trang |

**Request body**

—

**Response 200**

~~~ts
type MdProprietaryHistoryResponse = MdProprietaryRow[];
~~~

~~~json
{
  "data": [
    {
      "ticker": "HPG",
      "trading_date": "2026-08-14T00:00:00",
      "total_buy_trade_volume": 1842000,
      "total_buy_trade_value": 51576000000,
      "percent_buy_trade_volume": 0.0412,
      "percent_buy_trade_value": 0.0398,
      "total_sell_trade_volume": 2415000,
      "total_sell_trade_value": 67620000000,
      "percent_sell_trade_volume": 0.054,
      "percent_sell_trade_value": 0.0522,
      "total_trade_net_volume": -573000,
      "total_trade_net_value": -16044000000,
      "total_match_buy_trade_volume": 1842000,
      "total_match_buy_trade_value": 51576000000,
      "total_match_sell_trade_volume": 1915000,
      "total_match_sell_trade_value": 53620000000,
      "total_match_trade_net_volume": -73000,
      "total_match_trade_net_value": -2044000000,
      "total_deal_buy_trade_volume": 0,
      "total_deal_buy_trade_value": 0,
      "total_deal_sell_trade_volume": 500000,
      "total_deal_sell_trade_value": 14000000000,
      "total_deal_trade_net_volume": -500000,
      "total_deal_trade_net_value": -14000000000,
      "total_volume": 44708000,
      "total_value": 1295532000000,
      "update_date": "2026-08-14T15:12:04"
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/HPG/proprietary-history"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ (kiểm trước) | `"Mã chứng khoán không hợp lệ: HPG!"` (chuỗi) |
| 422 | — | `resolution` sai | `"Giá trị resolution không hợp lệ: BAD"` (chuỗi) |
| 422 | — | `fromDate` sai định dạng | `"Giá trị fromDate không hợp lệ: '2026-04-25'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `toDate` sai định dạng | `"Giá trị toDate không hợp lệ: '2026-04-25'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `page`/`size` ngoài biên | **Mảng** validation error |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC `data.content` rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

`data.content` thiếu/không phải mảng/rỗng ⇒ **502**. Nhiều mã UPCOM hoặc mã ít thanh khoản
**không có** dữ liệu tự doanh ⇒ FE sẽ thấy 502 thường xuyên hơn các endpoint khác; xử lý như
"không có dữ liệu". Không có logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/HPG/proprietary?resolution=1D&fromDate=20260701&toDate=20260814&page=0&size=30' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Endpoint upstream riêng.** Khác `/foreign-trade` và `/supply-demand` (đều lấy từ
  `price-history`), tự doanh có URL riêng `proprietary-history`. Không lọc field: mọi khoá
  camelCase đi qua bộ đổi tên.
- **Validate được viết INLINE**, không dùng `_validate_company_stats_query` như 4 endpoint kia,
  nhưng **thứ tự và thông điệp giống hệt**: symbol → resolution → fromDate → toDate. Giữ đúng.
- **Đơn vị:** `*Volume*` = **cổ phiếu**; `*Value*` = **VND**; `percent_*` = **tỷ số 0..1**
  (`0.0412` = 4,12%, **không** phải 4,12 điểm phần trăm dạng số nguyên).
- **`total_volume` / `total_value` KHÔNG phải của khối tự doanh** — đó là tổng **toàn thị trường
  cho mã đó**, dùng làm mẫu số của `percent_*`. Rất dễ hiển thị sai thành "tổng tự doanh".
- **Dấu:** `total_trade_net_* = mua − bán` ⇒ **dương = tự doanh MUA ròng**.
- Bộ ba `total_* / total_match_* / total_deal_*`: tổng = khớp lệnh + thỏa thuận. Kiểm tra chéo
  `total_trade_net_volume == total_match_trade_net_volume + total_deal_trade_net_volume` khi
  dựng test parity.
- `trading_date` và `update_date` là **ISO datetime** (có phần giờ), khác `/supply-demand` nơi
  `trading_date` thường chỉ là ngày.
- Tên field trùng với cung-cầu (`total_buy_trade_volume`…) nhưng **ngữ nghĩa khác** — không share DTO.

---

### GET /api/v1/market-data/trading/{symbol}/proprietary/summary

> **Tóm tắt giao dịch tự doanh trong kỳ** — object phẳng từ `proprietary-history-summary`, cùng bộ field với bản lịch sử.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `resolution`, `fromDate`, `toDate` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/proprietary-history-summary?timeFrame=…[&fromDate&toDate]` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `resolution` | `string` | Không | `"1D"` | `1D\|1W\|1M\|1Q\|1Y` | Cách gộp của upstream |
| `fromDate` | `string \| null` | Không | `null` | `^\d{8}$` | Đầu khoảng tổng hợp, YYYYMMDD; cần cả cặp |
| `toDate` | `string \| null` | Không | `null` | `^\d{8}$` | Cuối khoảng tổng hợp, YYYYMMDD |

**Request body**

—

**Response 200**

~~~ts
type MdProprietarySummaryResponse = MdProprietarySummary; // OBJECT
~~~

~~~json
{
  "data": {
    "total_buy_trade_volume": 41205000,
    "total_buy_trade_value": 1153740000000,
    "total_sell_trade_volume": 48720000,
    "total_sell_trade_value": 1364160000000,
    "total_trade_net_volume": -7515000,
    "total_trade_net_value": -210420000000,
    "total_match_buy_trade_volume": 40705000,
    "total_match_sell_trade_volume": 46220000,
    "total_match_trade_net_volume": -5515000,
    "total_deal_buy_trade_volume": 500000,
    "total_deal_sell_trade_volume": 2500000,
    "total_deal_trade_net_volume": -2000000,
    "total_volume": 982400000,
    "total_value": 27507200000000
  },
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/HPG/proprietary-history-summary"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ (kiểm trước) | `"Mã chứng khoán không hợp lệ: HPG!"` (chuỗi) |
| 422 | — | `resolution` sai | `"Giá trị resolution không hợp lệ: BAD"` (chuỗi) |
| 422 | — | `fromDate` sai định dạng | `"Giá trị fromDate không hợp lệ: '2026-07-01'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 422 | — | `toDate` sai định dạng | `"Giá trị toDate không hợp lệ: '2026-08-14'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."` (chuỗi) |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC `data` là `{}` / không phải dict | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Đọc `body.data` (object phẳng, **không** `.content`). Rỗng ⇒ **502**. Không lọc field nên không
có rủi ro "lọc thành rỗng" như hai endpoint `*/summary` của foreign/supply-demand. Không có
logic giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/HPG/proprietary/summary?resolution=1D&fromDate=20260701&toDate=20260814' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Khác shape so với bản list:** object thay vì mảng; **không** có `page`/`size`; **không** có
  `ticker`/`trading_date` cho từng ngày (upstream tổng hợp cả kỳ). Bộ field còn lại **cùng tên**
  với bản list — theo `docs/company-statistics-api-map.md`: *"Cùng cấu trúc với lịch sử, được
  tổng hợp cho khoảng ngày đã chọn."* Vì vậy dùng chung type là hợp lý ở đây (khác với cặp
  foreign/supply-demand).
- **Khoảng tổng hợp** do `fromDate`+`toDate` (cả cặp) quyết định; `resolution` chỉ đổi cách gộp
  của provider. Bỏ trống cặp ngày ⇒ cửa sổ mặc định của provider (không ghi trong source).
- Đơn vị & dấu: giống bản list — volume = cổ phiếu, value = VND, `percent_*` = 0..1,
  net = mua − bán (dương = mua ròng). `total_volume`/`total_value` vẫn là **toàn thị trường**.
- Endpoint upstream là `proprietary-history-summary` — **không** phải `price-history-summary`.
  Đừng tái dùng service method của `/summary`.

---

### GET /api/v1/market-data/trading/{symbol}/insider-deals

> **Giao dịch nội bộ** — giao dịch của người nội bộ / cổ đông lớn liên quan mã, không có bộ lọc theo ngày.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute`/IP) |
| **Cache** | Redis, TTL `REDIS_DEFAULT_TTL_SECONDS` = **300s**; key phụ thuộc `limit` |
| **Nguồn dữ liệu** | **VCI** `GET .../v1/company/{SYMBOL}/insider-transaction?page=0&size={limit}` |
| **Side-effect** | Ghi cache Redis |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau upper phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `limit` | `number` (integer) | Không | `100` | `>= 1`, `<= 1000` | Số bản ghi; map sang `size` upstream. **`page` cứng = 0** |

> **Không có** `resolution`, `fromDate`/`toDate`, `start`/`end`, `page`. Upstream không hỗ trợ
> lọc ngày cho endpoint này (theo `docs/company-statistics-api-map.md`).

**Request body**

—

**Response 200**

~~~ts
type MdInsiderDealsResponse = MdInsiderDeal[];
~~~

~~~json
{
  "data": [
    {
      "id": "3f1c8a02-77d1-4e2b-9f10-5b6a2c8d4e91",
      "organ_code": "VNM",
      "ticker": "VNM",
      "event_code": "DDINS",
      "event_name_vi": "Giao dịch cổ đông nội bộ",
      "event_name_en": "Insider transaction",
      "organ_name_vi": "Công ty Cổ phần Sữa Việt Nam",
      "organ_name_en": "Vietnam Dairy Products JSC",
      "trader_organ_name_vi": "F&N Dairy Investments Pte Ltd",
      "trader_organ_name_en": "F&N Dairy Investments Pte Ltd",
      "action_type_code": "B",
      "action_type_vi": "Mua",
      "action_type_en": "Buy",
      "trade_status_vi": "Đăng ký",
      "trade_status_en": "Registered",
      "public_date": "2026-08-11T00:00:00",
      "display_date1": "2026-08-15T00:00:00",
      "display_date2": "2026-09-12T00:00:00",
      "start_date": "2026-08-15T00:00:00",
      "end_date": "2026-09-12T00:00:00",
      "share_before_trade": 369000000,
      "share_after_trade": 390000000,
      "share_register": 21000000,
      "share_acquire": 0,
      "ownership_after_trade": 0.1866,
      "source_url_vi": "https://iq.vietcap.com.vn/tin/vnm-fn-dairy-dang-ky-mua",
      "source_url_en": "https://iq.vietcap.com.vn/news/vnm-fn-dairy-registers-to-buy",
      "icb_code_lv1": "3000"
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:12:33.481920Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/VNM/insider-transaction"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không hợp lệ | `"Mã chứng khoán không hợp lệ: VNM!"` (chuỗi) |
| 422 | — | `limit` < 1 hoặc > 1000 | **Mảng** validation error, `loc: ["query","limit"]` |
| 429 | — | Vượt `60/minute` | Do middleware |
| 502 | — | VCI lỗi, HOẶC `data.content` thiếu/rỗng | `"Tất cả 1 nguồn dữ liệu thị trường đều thất bại"` |

**Fallback / suy giảm**

Mã **không có** giao dịch nội bộ nào (rất phổ biến) ⇒ `content: []` ⇒ **502**, không phải
`200 []`. FE phải coi 502 ở endpoint này là "không có giao dịch nội bộ". Không có logic
giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/trading/VNM/insider-deals?limit=50' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **`limit` là PAGE SIZE, không phải tổng giới hạn.** Upstream luôn nhận `page=0`, `size=limit`.
  Không có cách phân trang. Muốn nhiều hơn 1000 bản ghi thì không có đường.
- **Không validate resolution/date** vì endpoint không nhận. Đừng thêm.
- **`action_type_code`:** `"B"` = Mua, `"S"` = Bán. Đây là **mã một chữ**, không phải `"BUY"`/`"SELL"`.
- **Đơn vị:** `share_before_trade` / `share_after_trade` / `share_register` / `share_acquire` =
  **số cổ phiếu**; `ownership_after_trade` = **tỷ số 0..1** (`0.1866` = 18,66%).
- **`share_register` (đăng ký) ≠ `share_acquire` (thực hiện).** Giao dịch mới đăng ký có
  `share_acquire = 0`. Hiển thị `share_register` như đã thực hiện là sai nghiệp vụ.
- Cặp `*_vi` / `*_en` tồn tại song song cho tên sự kiện, tên tổ chức, tên người giao dịch,
  trạng thái, và URL nguồn. Backend **không** chọn theo ngôn ngữ — trả cả hai.
- `event_code`: mã sự kiện VCI (vd `DDINS` = giao dịch tổ chức, `DDDIR` = giao dịch giám đốc).
  Không có bảng enum đầy đủ trong source ⇒ khai báo là `string`, không union literal.
- Không sắp xếp ở backend: giữ nguyên thứ tự VCI (thực tế mới nhất trước theo `public_date`).

---

## Ghi chú tổng hợp khi viết lại

### 1. "Rỗng" = 502, trừ đúng một ngoại lệ

`fetch_with_fallback` dùng validator mặc định coi `null`, `[]`, `{}` là **nguồn thất bại**.
Khi nguồn duy nhất thất bại, handler bắt `RuntimeError` và trả **502** với
`detail = "Tất cả 1 nguồn dữ liệu thị trường đều thất bại"`.

| Endpoint | Rỗng ⇒ | Ghi chú |
|---|---|---|
| `/company/{symbol}/news` | **200 `[]`** | `allow_empty = true` — **ngoại lệ duy nhất** |
| `/company/{symbol}/officers`, `shareholders`, `subsidiaries` | **502** | Doanh nghiệp không có lãnh đạo/cổ đông/công ty con trong hồ sơ KBS |
| `/company/{symbol}/overview`, `details` | **502** | Object rỗng |
| `/company/{symbol}/price-chart` | **502** | Danh sách điểm rỗng |
| `POST /trading/price-board` | **502** | Mọi mã bị bỏ qua (toàn mã chỉ số / mã sai) |
| `/trading/{symbol}/history`, `foreign-trade`, `supply-demand`, `proprietary`, `insider-deals` | **502** | `data.content` rỗng, kể cả khi chỉ là `page` vượt trang |
| `/trading/{symbol}/summary`, `proprietary/summary` | **502** | `data` = `{}` |
| `/trading/{symbol}/foreign-trade/summary`, `supply-demand/summary` | **502** | **Lọc trước, validate sau** ⇒ có dữ liệu nhưng không có field khớp tiền tố ⇒ vẫn 502 |
| `/trading/{symbol}/supply-demand` (list) | **200** với `[{}, {}]` | Validator chỉ đếm độ dài mảng ngoài, không kiểm phần tử |

Không endpoint nào trả **404** cho mã không tồn tại. Mã sai format ⇒ 422; mã đúng format nhưng
không có dữ liệu ⇒ 502.

### 2. Ba hệ đơn vị cùng tồn tại — bảng chốt

| Nhóm | Giá | Khối lượng | Giá trị tiền | Tỷ lệ |
|---|---|---|---|---|
| **VCI trading** (`price-board`) | **VND tuyệt đối** (`123500`) | cổ phiếu | `total_value` = **VND** (backend đã ×1e6); `foreign_*_value` = **pass-through, chưa ×1e6** | — |
| **VCI IQ Insight** (`history`/`summary`/`foreign`/`supply-demand`/`proprietary`/`insider`) | (xem chương 07) | cổ phiếu | **VND chính xác, không scale** | **0..1** (`0.49` = 49%) |
| **VCI IQ Insight** (`company/details`) | — | số cổ phiếu | `market_cap` không ghi đơn vị | **0..1** |
| **KBS profile** (`overview`/`shareholders`/`subsidiaries`) | `par_value`, `listing_price` = **VND** | `outstanding_shares` = cổ phiếu | `charter_capital` = **VND chính xác** | **0..100** (`74.8` = 74,8%) |
| **`overview` sau khi trộn** | — | — | — | **Cả hai thang** trong một object: `foreign_current_percent` = 0..100; `free_float_percentage`, `foreign_room_percentage`, `_*_raw` = 0..1 |

Ba field KBS bị **cố ý loại bỏ** vì làm tròn: `CC` (tỷ đồng), `VL` (triệu cổ phiếu), `SFV` (trùng `FV`).
Đừng thêm lại.

### 3. Dấu của giá trị ròng: **luôn** mua − bán

Mọi field `*net*` trong chương (`foreign_net_volume_total`, `foreign_net_value_total`,
`total_net_trade_volume`, `total_trade_net_volume`, `total_match_trade_net_value`, …) đều là
**mua trừ bán** ⇒ **dương = mua ròng**, âm = bán ròng. Không có endpoint nào đảo dấu.
Backend **không** tự tính field net — tất cả đến từ provider.

### 4. Hai định dạng ngày, hai chế độ validate

| Endpoint | Tham số | Định dạng | Validate? | Lỗi khi sai |
|---|---|---|---|---|
| `/trading/{symbol}/foreign-trade` | `start`, `end` | **`YYYY-MM-DD`** | **KHÔNG** | Không có 422; gửi thẳng lên VCI |
| 8 endpoint `trading/*` còn lại có ngày | `fromDate`, `toDate` | **`YYYYMMDD`** | Regex `^\d{8}$` | 422, detail **chuỗi** |

**Cặp ngày là bất khả phân ở mọi endpoint:** provider chỉ thêm `fromDate`+`toDate` vào query
upstream khi **cả hai** truthy. Truyền một mình ⇒ **bỏ qua im lặng**, trả cửa sổ mặc định.
Regex chỉ kiểm **hình dạng**, không kiểm ngày hợp lệ: `"20261345"` **đi qua** validate.

### 5. Thứ tự kiểm tra bắt buộc

```
1. symbol.toUpperCase() → regex /^[A-Z0-9]{1,10}$/   → 422 "Mã chứng khoán không hợp lệ: {SYMBOL}"
2. resolution ∈ {1D,1W,1M,1Q,1Y}                     → 422 "Giá trị resolution không hợp lệ: {resolution}"
3. fromDate ~ /^\d{8}$/                              → 422 "Giá trị fromDate không hợp lệ: '{v}'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."
4. toDate   ~ /^\d{8}$/                              → 422 "Giá trị toDate không hợp lệ: '{v}'. Phải ở dạng YYYYMMDD (ví dụ: 20260425)."
5. (framework) page/size/limit/length trong biên      → 422 detail dạng MẢNG
```

Hai điều cần phân biệt rõ:

- **Bước 5 chạy TRƯỚC bước 1.** Ràng buộc kiểu/biên của query param (`page`, `size`, `limit`,
  `length`) do tầng validate của framework thực thi **trước khi thân handler bắt đầu chạy**.
  Vì vậy request vừa sai `symbol` vừa có `size=999` trả về lỗi **dạng mảng** của `size`, không
  phải lỗi chuỗi của `symbol`. Thứ tự 1→4 chỉ áp dụng **giữa các kiểm tra bên trong handler**.
  NestJS `ValidationPipe` có cùng đặc tính, nên hành vi này port sang là tự nhiên — miễn là
  các kiểm tra 1→4 được viết **trong** handler/service chứ không nhét vào pipe.
- **`symbol` được uppercase TRƯỚC khi ghép vào message lỗi**: gửi `/company/bad!/details` trả về
  `"Mã chứng khoán không hợp lệ: BAD!"` (đã in hoa), không phải `"... bad!"`.

### 6. Đổi tên khoá `camelCase → snake_case`

Thuật toán gốc, phải copy chính xác:

```
s1 = name.replace(/(.)([A-Z][a-z]+)/g, "$1_$2")
s2 = s1.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
return s2.toLowerCase()
```

Ví dụ phải khớp:

| Upstream | Kết quả |
|---|---|
| `foreignBuyVolumeMatched` | `foreign_buy_volume_matched` |
| `totalSellUnmatchedVolumeAvg` | `total_sell_unmatched_volume_avg` |
| `highestPrice1Year` | `highest_price1_year` (**không** `highest_price_1_year`) |
| `averageMatchVolume1Month` | `average_match_volume1_month` |
| `icbCodeLv2` | `icb_code_lv2` |
| `displayDate1` | `display_date1` |
| `sectorVn` | `sector_vn` |
| `ownershipAfterTrade` | `ownership_after_trade` |

Bộ đổi tên chỉ áp dụng cho nguồn **VCI**. Nguồn **KBS** dùng **bảng map tay** (mã 2–6 ký tự
kiểu `SM`, `KLCPNY`, `OR`) — không có quy tắc suy ra được, phải chép nguyên bảng.

### 7. Ba cặp `list` ↔ `/summary`: khác biệt shape

| | `list` | `/summary` |
|---|---|---|
| **`data`** | mảng | object phẳng |
| **Phân trang** | `page` + `size` (`foreign-trade` dùng `limit`, `page` cứng 0) | **không có** |
| **Cửa sổ thời gian** | `fromDate`+`toDate` (hoặc `start`+`end`) lọc **bản ghi trả về** | `fromDate`+`toDate` xác định **khoảng được tổng hợp** |
| **`trading_date`** | có (`foreign-trade`: cuối, luôn có, có thể `null`; `supply-demand`: đầu, có điều kiện) | **không có** |
| **Field `*_avg`** | không | **có** (trung bình theo **ngày** trong kỳ) |
| **Field trung bình mỗi lệnh** | `average_buy_trade_volume` / `average_sell_trade_volume` | có thể không có |
| **Rỗng sau lọc** | mảng rỗng ⇒ 502 | object rỗng ⇒ 502 |

`resolution` **không** điều khiển độ dài cửa sổ ở bất kỳ endpoint nào — nó chỉ chọn
`timeFrame` (mức gộp) của provider. Độ dài do cặp ngày (nếu có) quyết định.

### 8. Giờ giao dịch

**Không endpoint nào trong chương này có nhánh kiểm tra giờ giao dịch** (không gọi
`is_trading_session`, không đọc lịch nghỉ). Hành vi ngoài giờ hoàn toàn do provider:

- `POST /trading/price-board`: **vẫn có dữ liệu** ngoài giờ — VCI trả snapshot phiên gần nhất.
  Bằng chứng: cầu nối realtime ở chế độ suy giảm poll chính endpoint này và dùng `close_price`
  làm giá hiện tại; bản đồ nguồn cũng chỉ đánh dấu "rỗng ngoài phiên" cho `intraday` và
  `price-depth` (chương 22), **không** cho `price-board`.
- Toàn bộ `trading/*` còn lại và `company/*`: dữ liệu EOD/thống kê/tham chiếu — không phụ thuộc
  giờ. Bản ghi của phiên đang diễn ra xuất hiện hay không là quyết định của VCI, backend không
  can thiệp.

### 9. Danh sách "đừng sửa cho đẹp"

Những bất nhất dưới đây **có thật trong bản Python** và FE đang dựa vào. Giữ nguyên khi port:

1. `PriceBoardRequest.source` được validate nhưng **không bao giờ được đọc**.
2. Ba khoá rò rỉ `_foreign_owned_pct_raw`, `_foreign_max_pct_raw`, `_state_pct_raw` trong
   `/company/{symbol}/overview`.
3. `/company/{symbol}/overview` có thể trả `meta.source = "KBS"` trong khi dữ liệu đến từ VCI.
4. `foreign_buy_value` / `foreign_sell_value` của `price-board` **không** ×1e6 trong khi
   `total_value` thì có.
5. `closing_price` (price-chart) vs `close_price` (price-board).
6. `ownership_percentage` (shareholders, 0..100) vs `ownership_percent` (subsidiaries, 0..100)
   vs `ownership_after_trade` (insider, 0..1).
7. `foreign-trade` dùng `start`/`end` (`YYYY-MM-DD`, không validate) trong khi mọi endpoint khác
   dùng `fromDate`/`toDate` (`YYYYMMDD`, validate).
8. `foreign-trade.limit` trần **1000** vs `history.size` trần **200**, cùng map sang một tham số
   `size` upstream.
9. `subsidiaries.type`: ngưỡng `> 50` (đúng 50% ⇒ `affiliate`), và field **chỉ tồn tại** khi
   `ownership_percent !== null`.
10. Bốn field giá của `price-chart` biến thiếu dữ liệu thành **`0`** thay vì `null`.
11. `_merge_company_details` dùng kiểm tra **falsy** (`!overview[dest]`) nên giá trị `0` hợp lệ
    từ KBS **bị ghi đè** bởi VCI.
12. Khối làm giàu 1Y dùng `setdefault` nên **ghi cả `null`** vào response.
13. `registry.py` khai báo `company.profile = KBS → VCI` nhưng chuỗi fallback **không được dùng**.

### 10. Bảng TTL cache theo endpoint

| TTL | Setting | Endpoint |
|---|---|---|
| **900s** | `REDIS_TTL_MACRO_SECONDS` | `company/{symbol}/overview`, `details`, `officers`, `shareholders`, `subsidiaries` |
| **300s** | `REDIS_TTL_NEWS_SECONDS` | `company/{symbol}/news` (**có** `cache_empty`) |
| **300s** | `REDIS_DEFAULT_TTL_SECONDS` | `company/{symbol}/price-chart`, và **toàn bộ** `GET /trading/{symbol}/*` |
| **không cache** | — | `POST /trading/price-board` |

Cache key gộp path (đã uppercase segment mã) + md5 12 ký tự của query đã sort, **bỏ** param
`null`/`""`. Nghĩa là `?resolution=1D` và `?resolution=1D&fromDate=` cho **cùng** key. Cache HIT
trả header `X-Cache: HIT` và **bỏ qua** validate response.
