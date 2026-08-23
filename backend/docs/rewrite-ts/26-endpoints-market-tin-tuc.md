# Endpoint — Dữ liệu thị trường: tin tức & tin AI

Chương này đặc tả **7 endpoint** thuộc hai tag: `Dữ liệu thị trường: Tin tức` (2 endpoint đọc RSS báo Việt Nam) và `Dữ liệu thị trường: Tin AI` (5 endpoint proxy tới Vietcap AI News, host `https://ai.vietcap.com.vn`). Cả 7 endpoint đều là **GET, công khai (không auth, không guard premium), không ghi DB, không side-effect** — chúng chỉ đọc provider ngoài, chuẩn hoá tên field và cache vào Redis.

Nguồn sự thật cho chương: bản cắt OpenAPI của nhóm, `app/api/v1/endpoints/market_data.py` (dòng 1316–1363 cho RSS, dòng 1872–2101 cho tin AI), `app/services/market_data/sources/news.py`, `app/services/market_data/sources/vietcap_ai_news.py`, `app/services/market_data/http.py`, `app/services/market_data/fallback.py`, `app/services/cache/decorator.py`, `app/services/cache/redis_cache.py`, `docs/vietcap-ai-news-api-discovery.md`, `tests/test_ai_news.py`, `tests/test_market_data.py` (dòng 1388–1460).

> **Cảnh báo đọc nhanh — chương này có 6 shape response KHÁC NHAU.** Chỉ 2 endpoint RSS dùng envelope `MarketDataResponse` (`{data, meta}`). 5 endpoint tin AI **không** dùng envelope đó: `/news/ai` trả `{data, total_records, kind, page, page_size, source_url}`, `/news/ai/detail/{slug}` và `/news/ai/audio/{news_id}` trả `{data, source_url}`, `/news/ai/catalogs` trả `{data, partial, warnings, source_urls}`, còn `/news/ai/tickers/{symbol}` trả một object **phẳng không có key `data`**. Trong OpenAPI cả 5 endpoint này chỉ là `type: object, additionalProperties: true` (handler khai báo `-> dict[str, Any]`), nên toàn bộ hình dạng dưới đây được suy ra từ source + test, không phải từ schema.

> **Cảnh báo thứ hai — `/news/ai/audio/{news_id}` KHÔNG trả file nhị phân.** Nó trả **JSON chứa 2 URL** tới file `.m4a` trên S3. Không stream, không `Content-Type: audio/mpeg`, không `Accept-Ranges`. Chi tiết ở mục riêng.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/v1/market-data/news/latest` | Công khai | Gom tin mới nhất từ RSS 7 trang báo Việt Nam, khử trùng lặp theo link. |
| GET | `/api/v1/market-data/news/sources` | Công khai | Liệt kê bảng tra tĩnh 7 nguồn RSS và URL feed của từng nguồn. |
| GET | `/api/v1/market-data/news/ai` | Công khai | Danh sách tin AI Vietcap theo 3 loại (`business` / `topic` / `exchange`), có lọc + phân trang. |
| GET | `/api/v1/market-data/news/ai/catalogs` | Công khai | Bảng tra bộ lọc: chủ đề, nguồn tin, ngành, top ticker sentiment (fail mềm từng phần). |
| GET | `/api/v1/market-data/news/ai/detail/{slug}` | Công khai | Chi tiết một bài tin AI theo `slug` (có HTML đầy đủ + file đính kèm). |
| GET | `/api/v1/market-data/news/ai/tickers/{symbol}` | Công khai | Gộp theo mã: sentiment tổng hợp + tin doanh nghiệp + tin từ sở. |
| GET | `/api/v1/market-data/news/ai/audio/{news_id}` | Công khai | Lấy **URL** audio giọng nam/nữ (`.m4a`) của một bài tin theo `id`. |

---

## Kiểu dữ liệu dùng chung

### 1. Envelope `MarketDataResponse` (chỉ 2 endpoint RSS)

Định nghĩa Pydantic ở `app/services/market_data/schemas.py:11–30`.

~~~ts
/** Metadata gắn vào mọi response market-data dùng envelope chuẩn. */
interface MarketDataMeta {
  /** Tên nguồn đã phục vụ response. Chương này: "RSS" hoặc "STATIC". */
  source: string;
  /** 1 = nguồn chính, 2+ = fallback. Default 1. Chương này luôn 1 (chỉ có 1 nguồn). */
  source_priority: number;
  /** true khi phải dùng nguồn dự phòng. Default false. Chương này luôn false. */
  fallback_used: boolean;
  /** Thời điểm fetch. ISO-8601 UTC có offset "+00:00" (datetime.now(UTC)). */
  as_of: string;
  /** URL upstream đã gọi. Default "". Xem ghi chú riêng ở /news/latest. */
  raw_endpoint: string;
}

interface MarketDataResponse<T> {
  data: T;
  meta: MarketDataMeta;
}
~~~

### 2. Bốn envelope ad-hoc của nhóm tin AI

~~~ts
/** GET /news/ai */
interface AiNewsListResponse {
  data: AiNewsListItem[];
  /** Tổng số bản ghi khớp bộ lọc, do upstream trả (`total_records`). 0 nếu upstream thiếu key. */
  total_records: number;
  /** Echo lại tham số kind đã dùng. */
  kind: AiNewsKind;
  /** Echo lại page đã nhận (KHÔNG phải page upstream áp dụng). */
  page: number;
  /** Echo lại page_size đã nhận — xem bẫy clamp 99 ở mục endpoint. */
  page_size: number;
  /** URL upstream, KHÔNG kèm query string. */
  source_url: string;
}

/** GET /news/ai/detail/{slug} và GET /news/ai/audio/{news_id} */
interface AiNewsDataEnvelope<T> {
  data: T;
  source_url: string;
}

/** GET /news/ai/catalogs — `partial`/`warnings` bị LẶP cả ở ngoài và trong `data`. */
interface AiNewsCatalogsResponse {
  data: AiNewsCatalogsData;
  partial: boolean;
  warnings: string[];
  /** Chỉ chứa URL của những section fetch THÀNH CÔNG. Độ dài 0–4. */
  source_urls: string[];
}
~~~

`GET /news/ai/tickers/{symbol}` không có envelope — xem `AiTickerViewResponse` ở mục endpoint đó.

### 3. Hai shape body lỗi

~~~ts
/** Lỗi do FastAPI validate path/query param (kiểu, ge/le, pattern, min/maxLength). Status 422. */
interface HttpValidationError {
  detail: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
    input?: unknown;
    ctx?: Record<string, unknown>;
  }>;
}

/** Lỗi do handler / connector tự raise HTTPException. Status 404 / 422 / 502 / 503. */
interface MdErrorResponse {
  detail: string;
}

/** Body 429 của slowapi (KHÁC hoàn toàn: key là `error`, không phải `detail`). */
interface RateLimitErrorBody {
  error: string; // "Rate limit exceeded: 60 per 1 minute"
}
~~~

> **Bẫy:** cùng status 422 nhưng `detail` có thể là **array** (`?max_per_site=0`, `slug` sai pattern) hoặc **string** (`?kind=bad`, `?update_from=20260817`). Bản TS phải giữ đúng cả hai để không phải sửa frontend.

### 4. Nguồn RSS — bảng tra tĩnh `RSS_FEEDS`

Đọc nguyên văn từ `news.py:20–39`. Đây là **danh sách đủ và duy nhất** các giá trị hợp lệ cho tham số `sites`; `SUPPORTED_SITES` = `Object.keys(RSS_FEEDS)` theo đúng thứ tự dưới đây.

| Key `site` | Số feed | URL feed |
|---|---|---|
| `vnexpress` | 1 | `https://vnexpress.net/rss/tin-moi-nhat.rss` |
| `tuoitre` | 2 | `https://tuoitre.vn/rss/tin-moi-nhat.rss`<br>`https://tuoitre.vn/rss/kinh-doanh.rss` |
| `cafebiz` | 2 | `https://cafebiz.vn/rss/home.rss`<br>`https://cafebiz.vn/rss/vi-mo.rss` |
| `vietstock` | 2 | `https://vietstock.vn/761/kinh-te/vi-mo.rss`<br>`https://vietstock.vn/768/kinh-te/kinh-te-dau-tu.rss` |
| `thanhnien` | 1 | `https://thanhnien.vn/rss/home.rss` |
| `dantri` | 1 | `https://dantri.com.vn/rss/tin-moi-nhat.rss` |
| `vietnamnet` | 1 | `https://vietnamnet.vn/rss/tin-moi-nhat.rss` |

Tổng cộng **10 URL feed** cho 7 site.

~~~ts
type MdNewsSite =
  | "vnexpress" | "tuoitre" | "cafebiz" | "vietstock"
  | "thanhnien" | "dantri" | "vietnamnet";

/** Một bài tin RSS đã chuẩn hoá (news.py:129–136). Mọi field đều LUÔN có mặt. */
interface MdNewsRssItem {
  /** Tiêu đề đã bỏ CDATA + tag HTML. Bài không có title bị loại bỏ, nên không bao giờ "". */
  title: string;
  /** URL bài gốc. Cũng là khoá khử trùng lặp. Bài không có link bị loại bỏ. */
  link: string;
  /** Mô tả đã bỏ CDATA + tag HTML, CẮT CỨNG 500 ký tự (không thêm "…"). "" nếu thiếu. */
  description: string;
  /** Chuỗi pubDate THÔ của RSS, dạng RFC-822 kèm offset +0700. "" nếu thiếu. KHÔNG parse. */
  pub_date: string;
  /** src của thẻ <img> ĐẦU TIÊN trong description thô. "" nếu không có ảnh. */
  image_url: string;
  /** Key site được yêu cầu (echo lại), KHÔNG suy từ domain của link. */
  site: MdNewsSite;
}

/** Một dòng của GET /news/sources. */
interface MdNewsSourceEntry {
  site: string;
  feeds: string[];
}
~~~

### 5. Kiểu và enum của nhóm tin AI

~~~ts
/** _VALID_NEWS_KINDS (market_data.py:1876). Map sang path upstream ở _KIND_MAP. */
type AiNewsKind = "business" | "topic" | "exchange";

/**
 * _VALID_SENTIMENTS (market_data.py:1877) = {"Positive","Neutral","Negative",""}.
 * Phân biệt chữ hoa/thường: "positive" bị 422.
 */
type AiNewsSentiment = "Positive" | "Neutral" | "Negative";
~~~

Map `kind` → endpoint upstream (`vietcap_ai_news.py:137–141`):

| `kind` | Path upstream | Ý nghĩa nghiệp vụ |
|---|---|---|
| `business` | `https://ai.vietcap.com.vn/api/v3/news_info` | Tin doanh nghiệp (có ticker, sentiment, score) |
| `topic` | `https://ai.vietcap.com.vn/api/v3/topics_info` | Tin theo chủ đề (`ticker` là key chủ đề, có `topic_name`) |
| `exchange` | `https://ai.vietcap.com.vn/api/v3/xnews_info` | Tin công bố từ sở HOSE/HNX (bản ghi mỏng, hay có `file_attachment`) |

~~~ts
/**
 * Item danh sách tin AI — kết quả của _norm_item() (vietcap_ai_news.py:52–72).
 * MỌI field đều LUÔN có mặt với default cứng, kể cả khi upstream không trả.
 * Vì thế KHÔNG dùng `| null` và KHÔNG dùng `?` cho bất kỳ field nào ở đây.
 */
interface AiNewsListItem {
  /** raw.id — sha256 hex 64 ký tự. Dùng cho /news/ai/audio/{news_id}. Default "". */
  id: string;
  /** raw.slug — dùng cho /news/ai/detail/{slug}. Default "". */
  slug: string;
  /** raw.ticker — mã CK với kind=business/exchange; KEY CHỦ ĐỀ với kind=topic. Default "". */
  ticker: string;
  /** raw.industry — TÊN ngành tiếng Việt ("Ngân hàng"), KHÔNG phải slug ngành. Default "". */
  industry: string;
  /** raw.news_title → đổi tên thành `title`. Default "". */
  title: string;
  /** raw.news_short_content. Default "". */
  short_content: string;
  /** raw.news_source_link — URL bài gốc trên báo. Default "". */
  source_link: string;
  /** raw.news_image_url. Default "". */
  image_url: string;
  /** raw.update_date — "YYYY-MM-DD HH:mm:ss", KHÔNG có timezone. Giờ Việt Nam (UTC+7). */
  update_date: string;
  /** raw.news_from — MÃ nguồn ("cafef", "fireant", "HNX"). Default "". */
  source: string;
  /** raw.news_from_name — TÊN hiển thị ("CafeF"). Default "". */
  source_name: string;
  /** raw.sentiment. "" rất phổ biến với kind=topic và kind=exchange. */
  sentiment: AiNewsSentiment | "";
  /** raw.score — điểm sentiment dạng số thực (vd 9.75). Default 0. */
  score: number;
  /** raw.topic_name — chỉ có giá trị thật với kind=topic. Default "". */
  topic_name: string;
  /** raw.male_audio_duration — GIÂY, số thực (vd 391.488). Default 0. */
  male_audio_duration: number;
  /** raw.female_audio_duration — GIÂY, số thực. Default 0. */
  female_audio_duration: number;
  /** Ở endpoint danh sách: ECHO của `kind`. Ở detail: giá trị news_type (xem AiNewsDetail). */
  raw_type: AiNewsKind;
}

/** File đính kèm của tin từ sở — pass-through nguyên vẹn từ raw.file_attachment. */
interface AiNewsFileAttachment {
  /** Nhãn hiển thị, thường là tên file PDF. */
  text: string;
  /** URL tải file (host owa.hnx.vn / hose). */
  url: string;
}

/** Chi tiết bài tin — _norm_detail() (vietcap_ai_news.py:81–93). */
interface AiNewsDetail extends Omit<AiNewsListItem, "raw_type"> {
  /**
   * BẪY: ở detail, raw_type = raw.news_type ?? "unknown" — tức "stock_news" /
   * "exchange_news" / "unknown", KHÔNG phải "business"|"topic"|"exchange".
   */
  raw_type: string;
  /** raw.company_name — tên pháp lý đầy đủ tiếng Việt. Default "". */
  company_name: string;
  /** raw.summary — tóm tắt do AI sinh. Default "". */
  summary: string;
  /** raw.highlight_position — đoạn văn được highlight. Default "". */
  highlight_position: string;
  /** raw.news_full_content — HTML THÔ, CHƯA sanitize. Default "". */
  news_full_content_html: string;
  /** HTML trên đã bỏ tag bằng regex + gộp whitespace. "" khi html rỗng. */
  news_full_content_text: string;
  /** raw.file_attachment — pass-through, KHÔNG validate từng phần tử. Default []. */
  file_attachments: AiNewsFileAttachment[];
  /** raw.news_type — "stock_news" | "exchange_news" | … Default "" (khác raw_type!). */
  news_type: string;
}

/** URL audio — fetch_audio() (vietcap_ai_news.py:245–248). */
interface AiNewsAudio {
  /** raw.male — URL .m4a giọng nam. "" nếu upstream chỉ có giọng nữ. */
  male_url: string;
  /** raw.female — URL .m4a giọng nữ. "" nếu upstream chỉ có giọng nam. */
  female_url: string;
}
~~~

### 6. Kiểu của catalogs

~~~ts
interface AiNewsTopicOption {
  /** static_topic[].name — tên hiển thị tiếng Việt ("Giá vàng"). Default "". */
  name: string;
  /** static_topic[].key — dùng cho query `topic` ("gia-vang"). Default "". */
  key: string;
}

/** Nguồn tin và Ngành dùng CÙNG shape {name, value} nhưng khác endpoint upstream. */
interface AiNewsFilterOption {
  /** viName, fallback sang enName, fallback "" (vietcap_ai_news.py:295, :314). */
  name: string;
  /** value — dùng cho query `source` (→ upstream `newsfrom`) hoặc `industry`. */
  value: string;
}

interface AiNewsTopTicker {
  /** Mã CK. Default "". */
  ticker: string;
  /** Điểm sentiment (vd 9.21). Default 0. */
  score: number;
  /** "Positive" | "Neutral" | "Negative" | "". */
  sentiment: string;
  /** raw.organ_name → đổi tên thành company_name. Default "". */
  company_name: string;
  /** URL ảnh logo. Default "". */
  logo: string;
}

type AiNewsCatalogSection = "topics" | "sources" | "industries" | "top_tickers";

interface AiNewsCatalogsData {
  /** [] khi section này lỗi. */
  topics: AiNewsTopicOption[];
  sources: AiNewsFilterOption[];
  industries: AiNewsFilterOption[];
  top_tickers: AiNewsTopTicker[];
  /** true khi có ≥1 section lỗi. */
  partial: boolean;
  /** Chỉ các section có mảng KHÔNG rỗng — section thành công nhưng rỗng cũng bị loại. */
  available_sections: AiNewsCatalogSection[];
  /** Chuỗi "<section>: <thông điệp exception>", tiếng Anh, từ upstream. [] khi đủ 4 section. */
  warnings: string[];
}
~~~

### 7. Kiểu sentiment theo mã — **BA shape khác nhau**

Đây là điểm dễ vỡ nhất của `/news/ai/tickers/{symbol}`. Cùng field `sentiment` nhưng có 3 hình dạng, tuỳ nhánh code nào chạy:

~~~ts
/** (a) Upstream OK và có ticker_info[0] — vietcap_ai_news.py:408–420. 11 field. */
interface AiTickerSentimentFull {
  ticker: string;
  score: number;
  sentiment: AiNewsSentiment | "";
  /** raw.cnt_news → news_count. */
  news_count: number;
  /** raw.count_pos. */
  count_positive: number;
  /** raw.count_neu. */
  count_neutral: number;
  /** raw.count_neg. */
  count_negative: number;
  /** raw.organ_name. */
  company_name: string;
  logo: string;
  /** raw.extractive_summaries — pass-through, KHÔNG validate phần tử. */
  summaries: unknown[];
  /** raw.extractive_sentiments — pass-through, song song 1-1 với summaries. */
  summary_sentiments: unknown[];
}

/** (b) Upstream OK nhưng ticker_info = [] — vietcap_ai_news.py:398–401. CHỈ 4 field. */
interface AiTickerSentimentEmpty {
  ticker: string;      // luôn symbol.toUpperCase()
  score: 0;
  sentiment: "";
  news_count: 0;
}

/** (c) Upstream LỖI (503/502 nội bộ) — market_data.py:2074. CHỈ 3 field, KHÔNG có news_count. */
interface AiTickerSentimentFailed {
  ticker: string;      // luôn symbol.toUpperCase()
  score: 0;
  sentiment: "";
}

type AiTickerSentiment =
  | AiTickerSentimentFull
  | AiTickerSentimentEmpty
  | AiTickerSentimentFailed;
~~~

> **Bẫy:** client không được giả định `sentiment.news_count` tồn tại. Bản TS phải tái tạo **đúng 3 shape này** (kể cả việc shape (c) thiếu `news_count`) nếu muốn byte-compatible với bản Python.

### 8. Giá trị hợp lệ của `source` (query `newsfrom` upstream)

Bảng đã xác minh trong `docs/vietcap-ai-news-api-discovery.md:378–398`. Backend **không** validate `source` — sai giá trị thì upstream trả danh sách rỗng, không lỗi.

| Tên hiển thị (`viName`) | `value` |
|---|---|
| Tất cả nguồn | *(chuỗi rỗng)* |
| Vietstock | `vietstock` |
| FireAnt | `fireant` |
| CafeF | `cafef` |
| VnEconomy | `vneconomy` |
| Markettimes | `markettimes` |
| VietnamFinance | `vietnamfinance` |
| Tin nhanh chứng khoán | `tinnhanhchungkhoan` |
| Tạp chí công thương | `tapchicongthuong` |
| Người quan sát | `nguoiquansat` |
| Nhà đầu tư | `nhadautu` |
| Tạp chí Kinh tế Sài Gòn | `thesaigontimes` |
| Tạp chí Diễn đàn Doanh nghiệp | `diendandoanhnghiep` |
| Báo Sài Gòn Giải Phóng | `sggp` |
| Báo Công Thương | `congthuong` |
| Vnbusiness | `vnbusiness` |
| Nguồn khác | `others` |

Ngoài ra tin `kind=exchange` có `news_from` là `HNX` hoặc `HOSE` (chữ in hoa) — không nằm trong bảng lọc trên.

### 9. Giá trị hợp lệ của `industry` (slug ngành ICB của Vietcap)

Từ `docs/vietcap-ai-news-api-discovery.md:406–429`. Lưu ý: query `industry` nhận **slug**, còn field `industry` trong response là **tên tiếng Việt** — hai thứ khác nhau.

| Tên hiển thị | `value` |
|---|---|
| Tất cả ngành | *(chuỗi rỗng)* |
| Xây dựng và Vật liệu | `construction-and-materials` |
| Thực phẩm và đồ uống | `food-and-beverage` |
| Dầu khí | `oil-and-gas` |
| Hóa chất | `chemicals` |
| Bất động sản | `real-estate` |
| Tài nguyên Cơ bản | `basic-resources` |
| Dịch vụ tài chính | `financial-services` |
| Truyền thông | `media` |
| Hàng & Dịch vụ Công nghiệp | `industrial-goods-and-services` |
| Y tế | `health-care` |
| Ngân hàng | `banks` |
| Bảo hiểm | `insurance` |
| Bán lẻ | `retail` |
| Hàng cá nhân & Gia dụng | `personal-and-household-goods` |
| Du lịch và Giải trí | `travel-and-leisure` |
| Điện, nước & xăng dầu khí đốt | `utilities` |
| Ô tô và phụ tùng | `automobiles-and-parts` |
| Công nghệ Thông tin | `technology` |
| Viễn thông | `telecommunications` |

### 10. Giá trị hợp lệ của `topic`

Từ `docs/vietcap-ai-news-api-discovery.md:125–137`.

| Tên hiển thị | `key` |
|---|---|
| Diễn biến Thị trường | `dien-bien-thi-truong` |
| Chứng khoán Thế giới | `chung-khoan-the-gioi` |
| Giá vàng | `gia-vang` |
| Tỷ giá | `ty-gia` |
| Tiền mã hóa | `tien-ma-hoa` |
| Xăng dầu | `xang-dau` |
| Khoáng sản | `khoang-san` |
| Nông sản | `nong-san` |
| Trái phiếu | `trai-phieu` |

### 11. Quy ước cache Redis dùng chung

Decorator `@redis_cached` (`app/services/cache/decorator.py`) áp cho **cả 7 endpoint**. Cơ chế:

~~~
key = `iqx:{prefix}:{normalised_path}:{param_hash}`
prefix         = "api:v1" (mặc định, không endpoint nào trong chương đổi)
normalised_path= path đã strip("/"), viết HOA segment ngay sau một trong
                 {quotes, company, trading, fundamentals, tickers}
param_hash     = md5(join("&", sorted("k=v") của query params khác null và khác ""))[:12]
                 hoặc "_" khi không có param nào
~~~

Ví dụ khoá thực tế:

| Request | Cache key |
|---|---|
| `/api/v1/market-data/news/sources` | `iqx:api:v1:api/v1/market-data/news/sources:_` |
| `/api/v1/market-data/news/latest?sites=vnexpress` | `iqx:api:v1:api/v1/market-data/news/latest:<md5_12>` |
| `/api/v1/market-data/news/ai?kind=topic&page=1` | `iqx:api:v1:api/v1/market-data/news/ai:<md5_12>` |
| `/api/v1/market-data/news/ai/tickers/VCB` | `iqx:api:v1:api/v1/market-data/news/ai/tickers/VCB:_` |

Hành vi bắt buộc giữ nguyên:

- `REDIS_ENABLED=false` → bỏ qua cache hoàn toàn, gọi thẳng handler.
- Redis chết → `cache_get_json` trả `null`, `cache_set_json` im lặng; **không** bao giờ làm request 5xx.
- Cache HIT → trả body đã lưu kèm header **`X-Cache: HIT`**. Cache MISS **không** set header nào (không có `X-Cache: MISS`).
- Chỉ cache khi handler trả thành công. HTTPException bay ra trước bước ghi cache ⇒ **404/422/502/503 không bao giờ được cache**.
- Điều kiện "có dữ liệu" (`_has_data`): nếu body là dict và có key `data` → chỉ cache khi `data` không phải list/dict rỗng; nếu body là dict **không có** key `data` → cache khi dict không rỗng. `cache_empty=true` bỏ qua kiểm tra này.

TTL (`app/core/config.py`, override được bằng env):

| Setting | Default | Dùng ở |
|---|---|---|
| `REDIS_TTL_NEWS_SECONDS` | `300` (5 phút) | `/news/latest` + cả 5 endpoint tin AI |
| `REDIS_TTL_REFERENCE_SECONDS` | `3600` (1 giờ) | `/news/sources` |

> **Bẫy cache 1:** decorator băm **toàn bộ** query params của request, kể cả param mà FastAPI không khai báo. Frontend hiện gửi `language=vi` tới `/news/ai`, `/news/ai/detail/{slug}`, `/news/ai/catalogs` (xem `dashboard/src/features/news/api.ts`); backend **bỏ qua** param này về mặt logic nhưng nó **vẫn đổi cache key** ⇒ phân mảnh cache. Bản TS nên giữ nguyên hành vi (băm hết) để tỉ lệ hit không thay đổi bất ngờ.

> **Bẫy cache 2:** body cache lại nguyên cả `meta.as_of`. Trong 300s (hoặc 3600s với `/news/sources`), `as_of` sẽ **đứng yên ở thời điểm ghi cache**, không phải thời điểm request. Đừng dùng `as_of` làm đồng hồ.

### 12. Rate limit dùng chung

- `SlowAPIMiddleware` được add toàn cục (`app/main.py:140`) với `default_limits = [RATE_LIMIT_DEFAULT]` = **`60/minute`** per IP (`key_func = get_remote_address`), storage `memory://`.
- **Không** endpoint nào trong chương này có `@limiter.limit(...)` riêng. `RATE_LIMIT_MARKET_DATA = "120/minute"` chỉ được áp cho một endpoint khác (`market_data.py:354`), **không** cho nhóm tin.
- Vượt hạn: `429` với body `{"error":"Rate limit exceeded: 60 per 1 minute"}` (key `error`, **không** phải `detail`).
- Limiter bị tắt khi `APP_ENV ∈ {"testing","test"}`.

---

## Nhóm A — Tin tức RSS (2 endpoint)

### GET /api/v1/market-data/news/latest

> **Tin tài chính mới nhất từ RSS** — gom bài mới từ RSS của các trang báo Việt Nam, bỏ tag HTML, khử trùng lặp theo link.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định — `60/minute` per IP |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/news/latest:<md5_12(params)>`, TTL `REDIS_TTL_NEWS_SECONDS` = 300s, **`cache_empty=true`** |
| **Nguồn dữ liệu** | provider ngoài — RSS 10 URL của 7 trang báo (bảng ở mục 4) |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| — | — | — | — |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `sites` | `string \| null` | Không | `null` | Không validate | Danh sách key site ngăn cách bởi dấu phẩy, vd `vnexpress,cafebiz`. `null`/rỗng ⇒ dùng **cả 7 site** theo thứ tự `SUPPORTED_SITES`. Từng phần tử được `.trim()` nhưng **không** lower-case. Key không tồn tại bị **bỏ qua im lặng** (không 422). |
| `max_per_site` | `integer` | Không | `20` | `ge=1`, `le=100` | Số bài tối đa lấy **mỗi URL FEED** (không phải mỗi site) — xem ghi chú. |

**Request body**

— (GET, không body)

**Response 200**

~~~ts
type MdNewsLatestResponse = MarketDataResponse<MdNewsRssItem[]>;
~~~

~~~json
{
  "data": [
    {
      "title": "VN-Index tăng 12,4 điểm, khối ngoại mua ròng gần 480 tỷ đồng",
      "link": "https://vnexpress.net/vn-index-tang-12-4-diem-khoi-ngoai-mua-rong-gan-480-ty-dong-4789012.html",
      "description": "Chỉ số VN-Index đóng cửa phiên 17/8 tại 1.412,68 điểm, thanh khoản sàn HoSE đạt 24.850 tỷ đồng. Nhóm ngân hàng dẫn dắt với VCB, CTG, TCB đồng loạt tăng trên 2%.",
      "pub_date": "Mon, 17 Aug 2026 15:12:00 +0700",
      "image_url": "https://i1-kinhdoanh.vnecdn.net/2026/08/17/vn-index-1755412320.jpg",
      "site": "vnexpress"
    },
    {
      "title": "FPT chốt quyền chia cổ tức tiền mặt 1.000 đồng/cổ phiếu",
      "link": "https://cafebiz.vn/fpt-chot-quyen-chia-co-tuc-tien-mat-1000-dong-co-phieu-17864210.chn",
      "description": "Ngày giao dịch không hưởng quyền là 25/8/2026. Với hơn 1,47 tỷ cổ phiếu đang lưu hành, FPT dự kiến chi khoảng 1.470 tỷ đồng cho lần tạm ứng này.",
      "pub_date": "Mon, 17 Aug 2026 14:40:00 +0700",
      "image_url": "",
      "site": "cafebiz"
    }
  ],
  "meta": {
    "source": "RSS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T08:15:03.482911+00:00",
    "raw_endpoint": "https://vnexpress.net/rss/tin-moi-nhat.rss,https://cafebiz.vn/rss/home.rss,https://cafebiz.vn/rss/vi-mo.rss"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `max_per_site` không phải số nguyên, `<1` hoặc `>100` | `detail` là **array** `HttpValidationError`, vd `msg: "Input should be greater than or equal to 1"` |
| 429 | — | Vượt 60 request/phút/IP | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |
| 502 | — | *(về lý thuyết)* `fetch_with_fallback` ném `RuntimeError` | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

Đây là endpoint **fail mềm tuyệt đối** — thực tế gần như không thể trả lỗi 5xx:

1. Mỗi URL feed được gọi trong `try/except Exception: continue` (`news.py:82–90`). Timeout, DNS lỗi, HTTP 403/500, XML hỏng — tất cả bị **bỏ qua im lặng**, không log, không đưa vào `warnings` (endpoint này không có field `warnings`).
2. XML parse lỗi (`ET.ParseError`) → feed đó trả `[]` (`news.py:111–114`).
3. Bài thiếu `title` **hoặc** thiếu `link` bị loại khỏi kết quả (`news.py:126–127`).
4. Handler gọi `fetch_with_fallback([...], allow_empty=True)` ⇒ validator bị bỏ qua ⇒ **`data: []` là response 200 hợp lệ**, không 502.
5. Vì mọi exception đã bị chặn bên trong `fetch_rss_news`, nhánh `RuntimeError → 502` gần như **không thể chạm tới**. Nếu toàn bộ 10 feed chết, client nhận `200` với `data: []`, `meta.source: "RSS"`, `meta.raw_endpoint: ""`.
6. **`cache_empty=true`** ⇒ kết quả rỗng đó **vẫn bị cache 300 giây**. Sự cố mạng 1 giây có thể kéo thành 5 phút "không có tin". Đây là hành vi hiện tại, phải giữ hoặc đổi có chủ đích.
7. Không có khái niệm "ngoài giờ giao dịch" — RSS chạy 24/7.

**curl**

~~~bash
# Endpoint công khai — không cần Authorization
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/latest?sites=vnexpress,cafebiz&max_per_site=10' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

~~~bash
# Mặc định: cả 7 site, 20 bài mỗi feed
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/latest' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **`max_per_site` bị áp SAI CẤP.** Code cắt `items[:max_per_site]` cho **từng URL feed**, rồi mới `extend` (`news.py:88`). Site có 2 feed (`tuoitre`, `cafebiz`, `vietstock`) có thể sinh tới `2 × max_per_site` bài trước khi khử trùng lặp. Với `sites` mặc định và `max_per_site=20`, cận trên là `10 × 20 = 200` bài. Tên tham số nói "per site" nhưng ngữ nghĩa là "per feed" — **giữ nguyên** nếu muốn tương thích, đừng "sửa" thầm.
- **Không sắp xếp theo thời gian.** Thứ tự output = thứ tự `sites` yêu cầu (hoặc thứ tự `SUPPORTED_SITES`) × thứ tự feed trong site × thứ tự `<item>` trong XML. Không hề `sort` theo `pub_date`. Client muốn "mới nhất trước" phải tự sort — mà `pub_date` là chuỗi RFC-822 nên phải parse trước khi sort.
- **Khử trùng lặp chỉ theo `link`, giữ bản gặp ĐẦU TIÊN** (`news.py:92–99`). Bài không có link đã bị loại từ trước nên không lọt vào nhánh này.
- **`site` là echo, không phải suy luận.** Nếu gọi `?sites=vnexpress` và VnExpress trả bài syndicate từ nơi khác, `site` vẫn là `"vnexpress"`.
- **Gọi HOÀN TOÀN TUẦN TỰ.** Vòng lặp lồng `for site → for feed` với `await` bên trong, timeout `10.0s` mỗi request (`news.py:78`). Worst case với 7 site = **~100 giây** một request nếu mọi feed đều treo. Bản TS **nên** chạy song song (`Promise.allSettled`) — đây là điểm cải thiện hợp lệ vì không đổi shape response — nhưng nếu chạy song song thì **phải chủ động giữ lại thứ tự kết quả** đúng như thứ tự site/feed, vì thứ tự là phần quan sát được của API.
- **Client HTTP riêng, không retry.** Endpoint này tạo `new httpx.AsyncClient(timeout=10.0)` cho mỗi request, **không** dùng shared client + retry/backoff của `market_data/http.py`. Header: base headers + `Accept: application/rss+xml, application/xml, text/xml`, User-Agent random từ pool 4 giá trị, không Referer/Origin (`_SOURCE_HEADERS["RSS"] = {}`).
- **`raw_endpoint` chỉ liệt kê 3 URL đầu THÀNH CÔNG** rồi nối `...+{n} more`, vd `https://a.rss,https://b.rss,https://c.rss...+7 more`. Không có dấu cách sau dấu phẩy. Feed lỗi **không** xuất hiện trong danh sách ⇒ có thể dùng `raw_endpoint` để đếm số feed sống, nhưng không có API nào báo feed nào đã chết.
- **Xử lý text:** `_strip_cdata` bóc `<![CDATA[…]]>` (regex có `DOTALL`) rồi xoá mọi `<[^>]+>`, cuối cùng `.trim()`. **HTML entity KHÔNG được decode** — `&nbsp;`, `&amp;`, `&#8220;` sẽ nằm nguyên trong `title`/`description`. Đây là bug hiện hữu; nếu sửa thì phải sửa có chủ đích và ghi vào changelog vì output text sẽ đổi.
- **`image_url` lấy từ description THÔ** (trước khi strip), regex `<img[^>]+src=["']([^"']+)["']`, chỉ khớp `<img>` **đầu tiên**. Feed đặt ảnh trong `<enclosure>` hoặc `<media:content>` sẽ cho `image_url: ""` — parser **không** đọc namespace nào cả, chỉ `.//item` và các child `title`/`link`/`description`/`pubDate`.
- **`description` cắt cứng 500 ký tự** bằng slice, không thêm dấu `…`, có thể cắt giữa từ hoặc giữa cặp surrogate.
- Encoding: `ET.fromstring(resp.text)` — dựa vào `resp.text` đã decode theo header/charset của httpx. Response API là JSON UTF-8; khi ghi vào Redis dùng `ensure_ascii=False`.

---

### GET /api/v1/market-data/news/sources

> **Danh mục nguồn RSS** — trả bảng tra tĩnh gồm 7 site và các URL feed tương ứng, để UI dựng bộ chọn nguồn.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định — `60/minute` per IP |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/news/sources:_`, TTL `REDIS_TTL_REFERENCE_SECONDS` = 3600s |
| **Nguồn dữ liệu** | tính toán — hằng số `RSS_FEEDS` biên dịch trong code, **không gọi mạng** |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| — | — | — | — |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Endpoint không khai báo query param nào. Param lạ bị FastAPI bỏ qua nhưng **vẫn đổi cache key**. |

**Request body**

— (GET, không body)

**Response 200**

~~~ts
type MdNewsSourcesResponse = MarketDataResponse<MdNewsSourceEntry[]>;
~~~

~~~json
{
  "data": [
    { "site": "vnexpress", "feeds": ["https://vnexpress.net/rss/tin-moi-nhat.rss"] },
    { "site": "tuoitre", "feeds": ["https://tuoitre.vn/rss/tin-moi-nhat.rss", "https://tuoitre.vn/rss/kinh-doanh.rss"] },
    { "site": "cafebiz", "feeds": ["https://cafebiz.vn/rss/home.rss", "https://cafebiz.vn/rss/vi-mo.rss"] },
    { "site": "vietstock", "feeds": ["https://vietstock.vn/761/kinh-te/vi-mo.rss", "https://vietstock.vn/768/kinh-te/kinh-te-dau-tu.rss"] },
    { "site": "thanhnien", "feeds": ["https://thanhnien.vn/rss/home.rss"] },
    { "site": "dantri", "feeds": ["https://dantri.com.vn/rss/tin-moi-nhat.rss"] },
    { "site": "vietnamnet", "feeds": ["https://vietnamnet.vn/rss/tin-moi-nhat.rss"] }
  ],
  "meta": {
    "source": "STATIC",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T08:15:03.482911+00:00",
    "raw_endpoint": "static_mapping"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 429 | — | Vượt 60 request/phút/IP | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

Không có nhánh lỗi nào khác: endpoint không nhận tham số và không gọi mạng.

**Fallback / suy giảm**

Không có gì để suy giảm — dữ liệu là hằng số trong code, luôn trả đủ 7 phần tử. Redis chết cũng không ảnh hưởng (chỉ mất cache). `meta.source` là `"STATIC"` (không phải `"RSS"`), `meta.raw_endpoint` là chuỗi cố định `"static_mapping"` (không phải URL).

**curl**

~~~bash
# Endpoint công khai — không cần Authorization
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/sources' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Response **không** đi qua `fetch_with_fallback`; handler tự dựng `MarketDataResponse(data=..., meta=MarketDataMeta(source="STATIC", source_priority=1, fallback_used=False, as_of=datetime.now(UTC), raw_endpoint="static_mapping"))` (`market_data.py:1354–1363`). Phải copy đúng 5 giá trị meta này, kể cả `raw_endpoint: "static_mapping"`.
- **Thứ tự phần tử là thứ tự khai báo dict `RSS_FEEDS`** (Python 3.7+ giữ insertion order). Bản TS phải dùng structure giữ thứ tự (array of tuple hoặc `Map`, hoặc object literal khai báo cùng thứ tự) — test `test_news_sources` chỉ kiểm tra set nhưng UI dựa vào thứ tự.
- Đây là bảng tra **duy nhất** cho tham số `sites` của `/news/latest`. Nhưng chú ý bất đối xứng: endpoint này liệt kê các site hợp lệ, còn `/news/latest` **không** validate `sites` — client gửi sai key sẽ nhận `data: []` chứ không nhận 422.
- TTL 3600s là hơi lạ cho dữ liệu hằng số (đáng lẽ cache vĩnh viễn hoặc không cache), nhưng cứ giữ nguyên để hành vi header `X-Cache` không đổi.
- Vì `_has_data` thấy `data` là list 7 phần tử ⇒ luôn được cache.

---

## Nhóm B — Tin AI Vietcap (5 endpoint)

Toàn bộ 5 endpoint dưới đây proxy tới `https://ai.vietcap.com.vn` — API công khai của bên thứ ba, **không cần token/cookie** (xác minh trong `docs/vietcap-ai-news-api-discovery.md:21`).

**Header gửi lên upstream** (`vietcap_ai_news.py:41–46`, dựa trên `get_headers("VCI")`):

~~~
Accept: application/json                      ← ghi đè base header
Referer: https://ai.vietcap.com.vn/           ← ghi đè Referer của VCI
Origin: https://ai.vietcap.com.vn             ← ghi đè Origin của VCI
Content-Type: application/json
Accept-Language: en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7
Cache-Control: no-cache
Pragma: no-cache
Connection: keep-alive
DNT: 1
Sec-Fetch-Dest: empty / Sec-Fetch-Mode: cors / Sec-Fetch-Site: same-site
sec-ch-ua-platform: "Windows" / sec-ch-ua-mobile: ?0
User-Agent: <random 1 trong 4 chuỗi trong _USER_AGENTS>
~~~

**Tầng HTTP dùng chung** (`fetch_json`, `app/services/market_data/http.py:164–260`):

- Shared `httpx.AsyncClient` (max 100 connection, 20 keep-alive), `follow_redirects=true`, timeout **15.0s**.
- **3 lần thử** (`max_retries=3`). Retry chỉ với `TimeoutException` / `ConnectError` / **HTTP 5xx**. Backoff `0.5 × 2^(attempt-1)` + jitter `0–0.3s` cho lỗi transport, không jitter cho 5xx.
- **HTTP 4xx KHÔNG retry** — raise ngay.
- Hết lượt thử → raise exception cuối cùng.

**Ánh xạ exception → HTTP status** (thống nhất ở cả 5 endpoint, `vietcap_ai_news.py:26–38`):

| Exception nội bộ | Ý nghĩa | Status API |
|---|---|---|
| `AINewsNotFoundError` | Upstream trả 200 nhưng không có bản ghi (slug/id không tồn tại) | **404** |
| `AINewsUpstreamShapeError` | Upstream trả dữ liệu nhưng sai hình dạng (thiếu key, sai type) | **502** |
| `AINewsUpstreamError` | Lỗi transport/kết nối (bọc mọi `Exception` từ `fetch_json`) | **503** |
| `ValueError` | `kind` không hợp lệ (chỉ ở `fetch_news_list`) | **422** |

> **Bẫy quan trọng:** `AINewsUpstreamError` bọc **mọi** exception từ `fetch_json`, kể cả `httpx.HTTPStatusError` 404/500 của upstream. Nghĩa là upstream trả **404** thì API IQX trả **503**, không phải 404. Chỉ khi upstream trả **200 với body rỗng/không có `id`** thì mới thành 404.

---

### GET /api/v1/market-data/news/ai

> **Danh sách tin AI** — trả trang tin do AI Vietcap tổng hợp, theo 1 trong 3 loại (`business` / `topic` / `exchange`), có lọc theo mã, chủ đề, ngành, nguồn, sentiment và khoảng ngày.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định — `60/minute` per IP |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/news/ai:<md5_12(params)>`, TTL `REDIS_TTL_NEWS_SECONDS` = 300s, `cache_empty=false` ⇒ **kết quả rỗng KHÔNG được cache** |
| **Nguồn dữ liệu** | provider ngoài — `ai.vietcap.com.vn` (`/api/v3/news_info` \| `/api/v3/topics_info` \| `/api/v3/xnews_info` tuỳ `kind`) |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| — | — | — | — |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `kind` | `string` | Không | `"business"` | Phải ∈ `{business, topic, exchange}`, validate trong handler ⇒ 422 `detail: string` | Chọn endpoint upstream. Phân biệt chữ hoa/thường. |
| `page` | `integer` | Không | `1` | `ge=1` | Số trang, đếm từ 1. Truyền thẳng lên upstream. |
| `page_size` | `integer` | Không | `20` | `ge=1`, `le=100` | Số bản ghi/trang. **Bị clamp `min(page_size, 99)` trước khi gửi upstream** nhưng response echo giá trị gốc. |
| `ticker` | `string \| null` | Không | `null` | Không validate | Mã CK (upstream mong chữ HOA), vd `FPT`. Với `kind=topic`, upstream hiểu đây là key chủ đề. `null` ⇒ **không** gửi param lên upstream. |
| `topic` | `string \| null` | Không | `null` | Không validate | Key chủ đề (bảng mục 10). Chỉ có nghĩa với `kind=topic`. |
| `industry` | `string \| null` | Không | `null` | Không validate | **Slug** ngành (bảng mục 9), vd `banks`. |
| `source` | `string \| null` | Không | `null` | Không validate | Mã nguồn tin (bảng mục 8). **Đổi tên thành `newsfrom` khi gửi upstream.** |
| `sentiment` | `string \| null` | Không | `null` | Phải ∈ `{Positive, Neutral, Negative, ""}` khi truthy ⇒ 422 `detail: string` | Nhận định. Chữ cái đầu VIẾT HOA. `?sentiment=` (rỗng) hợp lệ, tương đương không lọc. |
| `update_from` | `string \| null` | Không | `null` | Phải khớp **chính xác** `^\d{4}-\d{2}-\d{2}$` **và** là ngày lịch thật | Từ ngày. **Bị kẹp không quá 30 ngày trước hôm nay** trước khi gửi upstream. |
| `update_to` | `string \| null` | Không | `null` | Cùng ràng buộc như trên | Đến ngày. **Không** bị kẹp. |

**Request body**

— (GET, không body)

**Response 200**

~~~ts
// interface AiNewsListResponse — xem mục 2; AiNewsListItem — xem mục 5.
~~~

Ví dụ `kind=business&ticker=FPT&page=1&page_size=2`:

~~~json
{
  "data": [
    {
      "id": "4f2c9a1b7e83d6045ab2c1f9e07d4b83cc51a6de92f30b7148ac5e21d9f60731",
      "slug": "fpt-doanh-thu-7-thang-dau-nam-2026-dat-42-500-ty-dong-tang-19-5",
      "ticker": "FPT",
      "industry": "Công nghệ Thông tin",
      "title": "FPT: Doanh thu 7 tháng đầu năm 2026 đạt 42.500 tỷ đồng, tăng 19,5%",
      "short_content": "Công ty Cổ phần FPT công bố kết quả kinh doanh 7 tháng với doanh thu 42.500 tỷ đồng và lợi nhuận trước thuế 7.820 tỷ đồng, lần lượt tăng 19,5% và 21,3% so với cùng kỳ.",
      "source_link": "https://cafef.vn/fpt-doanh-thu-7-thang-dau-nam-2026-dat-42500-ty-dong-tang-195-188260817.chn",
      "image_url": "https://cafefcdn.com/203337114487263232/2026/8/17/fpt-1755410400123.jpg",
      "update_date": "2026-08-17 09:42:00",
      "source": "cafef",
      "source_name": "CafeF",
      "sentiment": "Positive",
      "score": 9.12,
      "topic_name": "",
      "male_audio_duration": 214.272,
      "female_audio_duration": 228.416,
      "raw_type": "business"
    },
    {
      "id": "b81de7c4390a2f56cd1e8b40729af35de6c0184b7a92fd3e5081cc6ba437e29f",
      "slug": "fpt-ky-hop-dong-chuyen-doi-so-180-trieu-usd-tai-nhat-ban",
      "ticker": "FPT",
      "industry": "Công nghệ Thông tin",
      "title": "FPT ký hợp đồng chuyển đổi số 180 triệu USD tại Nhật Bản",
      "short_content": "Hợp đồng có thời hạn 5 năm với một tập đoàn sản xuất trong nhóm Nikkei 225, là hợp đồng đơn lẻ lớn nhất của FPT tại thị trường Nhật.",
      "source_link": "https://tinnhanhchungkhoan.vn/fpt-ky-hop-dong-chuyen-doi-so-180-trieu-usd-tai-nhat-ban-post382914.html",
      "image_url": "https://tinnhanhchungkhoan.vn/stores/news_dataimages/2026/082026/17/08/fpt-japan.jpg",
      "update_date": "2026-08-17 08:05:00",
      "source": "tinnhanhchungkhoan",
      "source_name": "Tin nhanh chứng khoán",
      "sentiment": "Positive",
      "score": 8.75,
      "topic_name": "",
      "male_audio_duration": 168.96,
      "female_audio_duration": 181.248,
      "raw_type": "business"
    }
  ],
  "total_records": 486,
  "kind": "business",
  "page": 1,
  "page_size": 2,
  "source_url": "https://ai.vietcap.com.vn/api/v3/news_info"
}
~~~

Ví dụ `kind=topic&topic=gia-vang&page_size=1` — chú ý `ticker` là key chủ đề, `sentiment` rỗng, `score` = 0:

~~~json
{
  "data": [
    {
      "id": "97a4b0f31c6e5d28ba7f04913e2d68c5aa10bf7392d4e6018c5b3fa27de9014c",
      "slug": "gia-vang-sang-17-8-vang-mieng-sjc-tang-500000-dong-len-121-800-000-dong-luong",
      "ticker": "gia-vang",
      "industry": "OTHER",
      "title": "Giá vàng sáng 17/8: vàng miếng SJC tăng 500.000 đồng lên 121.800.000 đồng/lượng",
      "short_content": "Công ty SJC niêm yết vàng miếng ở mức 119.800.000 - 121.800.000 đồng/lượng (mua - bán), tăng 500.000 đồng mỗi chiều so với chốt phiên trước.",
      "source_link": "https://fireant.vn/dashboard/content/posts/9182734",
      "image_url": "",
      "update_date": "2026-08-17 08:30:00",
      "source": "fireant",
      "source_name": "FireAnt",
      "sentiment": "",
      "score": 0,
      "topic_name": "Giá vàng",
      "male_audio_duration": 0,
      "female_audio_duration": 0,
      "raw_type": "topic"
    }
  ],
  "total_records": 1284,
  "kind": "topic",
  "page": 1,
  "page_size": 1,
  "source_url": "https://ai.vietcap.com.vn/api/v3/topics_info"
}
~~~

Ví dụ `kind=exchange&page_size=1` — bản ghi mỏng, phần lớn field là default:

~~~json
{
  "data": [
    {
      "id": "e30b7f915ca6248d0b73fe1948ac6205d7b81f3c4e29a0d6158bf7c3a924e05b",
      "slug": "hpg-bao-cao-tinh-hinh-quan-tri-cong-ty-6-thang-dau-nam-2026-17771208400-2-1",
      "ticker": "HPG",
      "industry": "",
      "title": "HPG: Báo cáo tình hình quản trị công ty 6 tháng đầu năm 2026",
      "short_content": "",
      "source_link": "https://hnx.vn/vi-vn/m-tin-tuc-hnx/tintuc-628401-1.html",
      "image_url": "",
      "update_date": "2026-08-17 16:20:00",
      "source": "HNX",
      "source_name": "",
      "sentiment": "",
      "score": 0,
      "topic_name": "",
      "male_audio_duration": 0,
      "female_audio_duration": 0,
      "raw_type": "exchange"
    }
  ],
  "total_records": 11042,
  "kind": "exchange",
  "page": 1,
  "page_size": 1,
  "source_url": "https://ai.vietcap.com.vn/api/v3/xnews_info"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `kind` không thuộc 3 giá trị hợp lệ | `Giá trị kind='bad' không hợp lệ. Cho phép: business, exchange, topic` *(danh sách đã `sorted()` — thứ tự alphabet, KHÔNG phải thứ tự nghiệp vụ)* |
| 422 | — | `sentiment` truthy nhưng không thuộc `{Positive, Neutral, Negative}` | `Giá trị sentiment='Wrong' không hợp lệ. Cho phép: Positive, Neutral, Negative` |
| 422 | — | `update_from`/`update_to` sai định dạng (`20260817`, `2026-W17-6`, `17/08/2026`, `2026-8-17`) | `Sai định dạng date format: '20260817'. Phải đúng dạng YYYY-MM-DD.` |
| 422 | — | Đúng định dạng nhưng không phải ngày lịch (`2026-02-30`, `2025-02-29`, `2026-13-01`) | `Giá trị date không hợp lệ: '2026-02-30'. Không phải ngày hợp lệ.` |
| 422 | — | `page < 1` hoặc `page_size` ngoài `[1,100]` hoặc không phải số | `detail` là **array** `HttpValidationError` |
| 429 | — | Vượt 60 request/phút/IP | `{"error":"Rate limit exceeded: 60 per 1 minute"}` |
| 502 | — | Upstream trả không phải dict | `Expected dict from https://ai.vietcap.com.vn/api/v3/news_info, got str` |
| 502 | — | Upstream thiếu key `news_info` | `Missing required key 'news_info' from https://ai.vietcap.com.vn/api/v3/news_info` |
| 502 | — | `news_info` không phải list | `'news_info' is str, expected list` |
| 502 | — | Một phần tử của `news_info` không phải dict | `news_info[0] is str, expected dict` |
| 503 | — | Timeout / connect error / upstream 4xx-5xx sau 3 lần thử | `Failed to fetch business news: <thông điệp exception gốc>` *(vd `Failed to fetch business news: ConnectTimeout`)* |

**Fallback / suy giảm**

- **Không có nguồn dự phòng.** Chỉ có một provider; upstream chết ⇒ **503**, không trả mảng rỗng, không giữ dữ liệu phiên trước.
- Upstream trả `{"total_records": 0, "news_info": []}` ⇒ **200** với `data: []`, `total_records: 0` (test `test_empty_list_allowed`). Đây là kết quả hợp lệ, không phải lỗi.
- Vì `cache_empty=false` và `_has_data` thấy `data: []` ⇒ **kết quả rỗng không được ghi cache** ⇒ mọi request "0 kết quả" đều đánh thẳng upstream. Cân nhắc khi tính tải, nhưng phải giữ hành vi để không cache "rỗng giả" của một lần lọc sai.
- Lỗi shape (502) và lỗi transport (503) **được phân biệt rõ**, không gộp. Bản TS phải giữ đúng ranh giới: sai hình dạng ⇒ 502, không kết nối được ⇒ 503.
- Không có khái niệm giờ giao dịch. Tin từ sở (`kind=exchange`) chỉ phát sinh trong giờ hành chính nhưng API vẫn trả trang cũ ngoài giờ.

**curl**

~~~bash
# Tin doanh nghiệp của FPT, 30 ngày gần nhất, chỉ tin tích cực
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai?kind=business&ticker=FPT&sentiment=Positive&update_from=2026-07-18&update_to=2026-08-17&page=1&page_size=20' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

~~~bash
# Tin chủ đề "Giá vàng"
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai?kind=topic&topic=gia-vang&page=1&page_size=12' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

~~~bash
# Tin công bố từ sở, lọc theo ngành ngân hàng
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai?kind=exchange&industry=banks&page=1&page_size=18' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra BẮT BUỘC** (`market_data.py:1924–1945`): (1) `kind` ∈ enum → (2) `sentiment` ∈ enum → (3) `update_from` định dạng → (4) `update_from` là ngày thật → (5) `update_to` định dạng → (6) `update_to` là ngày thật → (7) mới gọi upstream. Nếu vừa sai `kind` vừa sai `sentiment`, thông điệp trả về là của `kind`.
- **Ràng buộc `ge/le` của FastAPI chạy TRƯỚC toàn bộ logic trên**, nên `?kind=bad&page=0` cho `detail` dạng **array** (lỗi `page`), không phải string.
- **`page_size` bị clamp 99 âm thầm.** `_build_list_params` gửi `min(page_size, 99)` (`vietcap_ai_news.py:111`) vì "VietCap API max is 99", nhưng response echo `page_size: 100`. Gọi `?page_size=100` ⇒ tối đa **99** phần tử trong `data` nhưng `page_size` báo 100. Đây là điểm lệch request/response cần giữ nguyên.
- **`update_from` bị kẹp 30 ngày âm thầm.** `params["update_from"] = max(update_from, (today - 30d).isoformat())` — **so sánh CHUỖI**, hợp lệ vì cả hai là ISO `YYYY-MM-DD`. Gửi `update_from=2025-01-01` ⇒ upstream thực nhận `2026-07-18` (nếu hôm nay là 2026-08-17). Response **không** báo việc kẹp này. `update_to` không bị kẹp ⇒ có thể tạo khoảng ngày mà `from > to` mà không ai chặn (kết quả rỗng).
- **`update_from`/`update_to` rỗng thì KHÔNG gửi lên upstream** (`if update_from:` / `if update_to:`), khác với web UI của Vietcap luôn gửi param rỗng. Không ảnh hưởng kết quả nhưng khác request thực tế nếu đối chiếu log.
- **Đổi tên `source` → `newsfrom`** khi gửi upstream (`vietcap_ai_news.py:121`). Nhưng field trong response lại tên là `source` (từ `news_from`) và `source_name` (từ `news_from_name`). Ba tên cho một khái niệm — dễ sai.
- **`language` bị hardcode `"vi"`** (`_build_list_params` default) và **không** expose ra query param. Frontend gửi `?language=vi` chỉ làm bẩn cache key, không tới upstream.
- **Nhánh `ValueError → 422` là code chết.** Handler đã validate `kind` trước khi gọi `fetch_news_list`, nên `ValueError("Loại tin không hợp lệ: …")` từ connector không bao giờ tới được handler. Bản TS có thể giữ để phòng thủ nhưng đừng đưa thông điệp đó vào tài liệu client.
- **`raw_type` ở endpoint này = `kind`, không phải `news_type` của upstream.** Ở `/news/ai/detail/{slug}` thì ngược lại. Nếu client dựa vào `raw_type` để phân loại thì hai endpoint cho hai hệ giá trị khác nhau — bug tiềm ẩn của bản gốc, cần quyết định rõ khi viết lại.
- **`source_url` KHÔNG có query string** (`url = f"{_BASE}{path}"`, params truyền riêng cho httpx). Không thể dùng `source_url` để tái hiện request.
- **`update_date` không phải ISO-8601:** dạng `"2026-08-17 09:42:00"`, có dấu cách, **không có** `T`, **không có** offset. Theo giao diện Vietcap đây là **giờ Việt Nam (UTC+7)**. Backend **pass-through nguyên chuỗi**, không parse, không đổi timezone. Bản TS phải giữ đúng chuỗi này; nếu muốn thêm field ISO thì **thêm mới**, đừng đổi field cũ.
- **Không sort lại.** Thứ tự phần tử = thứ tự upstream trả (thực tế mới nhất trước theo `update_date`). Không có `sort` nào trong code.
- **`total_records` là tổng của bộ lọc, không phải của trang.** Lấy `data.get("total_records", 0)` ⇒ upstream thiếu key này thì `total_records = 0` **dù `data` có phần tử** (không raise). Client không được dùng `total_records === 0` để suy ra "không có tin".
- **Từng phần tử `news_info` được validate là dict trước khi normalize** (`vietcap_ai_news.py:183–187`) — sai type ⇒ 502 cho **cả trang**, không bỏ riêng phần tử lỗi. Giữ nguyên chiến lược fail-fast này.
- `score` có thể là `int` (0) hoặc `float` (9.12) — TS chỉ cần `number`, nhưng nếu bản TS validate bằng Zod thì đừng dùng `.int()`.

---

### GET /api/v1/market-data/news/ai/catalogs

> **Bảng tra bộ lọc tin AI** — gọi song song 4 endpoint danh mục của Vietcap (chủ đề, nguồn tin, ngành, top ticker) và trả về trong một response, có cờ `partial` khi một phần bị lỗi.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định — `60/minute` per IP |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/news/ai/catalogs:_`, TTL `REDIS_TTL_NEWS_SECONDS` = **300s** (không dùng TTL reference 3600s dù đây là dữ liệu tham chiếu) |
| **Nguồn dữ liệu** | provider ngoài — 4 endpoint của `ai.vietcap.com.vn` |
| **Side-effect** | ghi `logger.warning("Failed to fetch <section>: %s")` cho mỗi section lỗi |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| — | — | — | — |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không khai báo param nào. `language` bị hardcode `"vi"` trong `fetch_catalogs`. Param lạ (frontend gửi `?language=vi`) chỉ đổi cache key. |

Bốn upstream được gọi, **tuần tự theo đúng thứ tự này** (`vietcap_ai_news.py:266–352`):

| # | Section | URL upstream | Query | Key upstream cần có |
|---|---|---|---|---|
| 1 | `topics` | `https://ai.vietcap.com.vn/api/v3/topics_all` | `language=vi` | dict có `static_topic` |
| 2 | `sources` | `https://ai.vietcap.com.vn/api/v3/get_source_info` | `language=vi` | phải là **list** |
| 3 | `industries` | `https://ai.vietcap.com.vn/api/get_industry_info` | *(không có)* | phải là **list** |
| 4 | `top_tickers` | `https://ai.vietcap.com.vn/api/v2/get_top_tickers` | `industry=`, `group=hose`, `top_neg=5`, `top_pos=5` | dict có `ticker_info` |

**Request body**

— (GET, không body)

**Response 200**

~~~ts
// interface AiNewsCatalogsResponse — xem mục 2; AiNewsCatalogsData — xem mục 6.
~~~

Trường hợp đủ 4 section:

~~~json
{
  "data": {
    "topics": [
      { "name": "Diễn biến Thị trường", "key": "dien-bien-thi-truong" },
      { "name": "Chứng khoán Thế giới", "key": "chung-khoan-the-gioi" },
      { "name": "Giá vàng", "key": "gia-vang" },
      { "name": "Tỷ giá", "key": "ty-gia" },
      { "name": "Tiền mã hóa", "key": "tien-ma-hoa" },
      { "name": "Xăng dầu", "key": "xang-dau" },
      { "name": "Khoáng sản", "key": "khoang-san" },
      { "name": "Nông sản", "key": "nong-san" },
      { "name": "Trái phiếu", "key": "trai-phieu" }
    ],
    "sources": [
      { "name": "Tất cả nguồn", "value": "" },
      { "name": "Vietstock", "value": "vietstock" },
      { "name": "FireAnt", "value": "fireant" },
      { "name": "CafeF", "value": "cafef" },
      { "name": "VnEconomy", "value": "vneconomy" },
      { "name": "Tin nhanh chứng khoán", "value": "tinnhanhchungkhoan" },
      { "name": "Tạp chí Diễn đàn Doanh nghiệp", "value": "diendandoanhnghiep" },
      { "name": "Nguồn khác", "value": "others" }
    ],
    "industries": [
      { "name": "Tất cả ngành", "value": "" },
      { "name": "Ngân hàng", "value": "banks" },
      { "name": "Bất động sản", "value": "real-estate" },
      { "name": "Tài nguyên Cơ bản", "value": "basic-resources" },
      { "name": "Công nghệ Thông tin", "value": "technology" },
      { "name": "Thực phẩm và đồ uống", "value": "food-and-beverage" }
    ],
    "top_tickers": [
      { "ticker": "FPT", "score": 9.12, "sentiment": "Positive", "company_name": "Công ty Cổ phần FPT", "logo": "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/FPT.jpeg" },
      { "ticker": "VCB", "score": 8.64, "sentiment": "Positive", "company_name": "Ngân hàng Thương mại Cổ phần Ngoại thương Việt Nam", "logo": "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/VCB.jpeg" },
      { "ticker": "HPG", "score": 2.35, "sentiment": "Negative", "company_name": "Công ty Cổ phần Tập đoàn Hòa Phát", "logo": "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/HPG.jpeg" },
      { "ticker": "VNM", "score": 3.10, "sentiment": "Negative", "company_name": "Công ty Cổ phần Sữa Việt Nam", "logo": "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/VNM.jpeg" }
    ],
    "partial": false,
    "available_sections": ["topics", "sources", "industries", "top_tickers"],
    "warnings": []
  },
  "partial": false,
  "warnings": [],
  "source_urls": [
    "https://ai.vietcap.com.vn/api/v3/topics_all",
    "https://ai.vietcap.com.vn/api/v3/get_source_info",
    "https://ai.vietcap.com.vn/api/get_industry_info",
    "https://ai.vietcap.com.vn/api/v2/get_top_tickers"
  ]
}
~~~

Trường hợp suy giảm — `topics` và `top_tickers` lỗi (vẫn **HTTP 200**):

~~~json
{
  "data": {
    "topics": [],
    "sources": [
      { "name": "CafeF", "value": "cafef" },
      { "name": "FireAnt", "value": "fireant" }
    ],
    "industries": [
      { "name": "Ngân hàng", "value": "banks" }
    ],
    "top_tickers": [],
    "partial": true,
    "available_sections": ["sources", "industries"],
    "warnings": [
      "topics: topics_all: missing static_topic",
      "top_tickers: Server disconnected without sending a response."
    ]
  },
  "partial": true,
  "warnings": [
    "topics: topics_all: missing static_topic",
    "top_tickers: Server disconnected without sending a response."
  ],
  "source_urls": [
    "https://ai.vietcap.com.vn/api/v3/get_source_info",
    "https://ai.vietcap.com.vn/api/get_industry_info"
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 429 | — | Vượt 60 request/phút/IP | `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Không có nhánh 4xx/5xx nào khác.** Đây là endpoint duy nhất trong nhóm tin AI **không bao giờ trả 502/503**: mọi lỗi của 4 upstream đều bị bắt riêng lẻ và chuyển thành `warnings`. Ngay cả khi cả 4 chết, response vẫn là **200** với 4 mảng rỗng, `partial: true`, `warnings` 4 phần tử, `available_sections: []`, `source_urls: []` (test `test_catalogs_all_fail`).

**Fallback / suy giảm**

- Mỗi section có `try/except Exception` riêng ⇒ **lỗi cục bộ không lan**. Section lỗi ⇒ mảng rỗng + 1 dòng `warnings` + 1 dòng `logger.warning`.
- `AINewsUpstreamShapeError` bên trong catalogs **bị bắt lại tại chỗ** (không bay lên handler) ⇒ trở thành warning, không thành 502 (test `test_catalogs_shape_error_is_partial`).
- `partial = warnings.length > 0`.
- `available_sections` chỉ chứa section **có mảng KHÔNG rỗng** (`if results.get(k)`). Section fetch thành công nhưng upstream trả list rỗng ⇒ **không** xuất hiện trong `available_sections` dù không có warning nào. Nghĩa là `partial: false` mà `available_sections` vẫn thiếu section là trạng thái có thể xảy ra.
- `source_urls` chỉ append **sau khi** section thành công ⇒ độ dài 0–4, thứ tự luôn là topics → sources → industries → top_tickers (đã loại phần lỗi).
- **BẪY CACHE NẶNG:** body luôn có key `data` là dict **không rỗng** (ít nhất có `partial`/`available_sections`/`warnings`) ⇒ `_has_data` luôn `true` ⇒ **response suy giảm hoặc rỗng hoàn toàn VẪN bị cache 300 giây**. Một sự cố 1 giây của Vietcap có thể đóng băng bộ lọc UI trong 5 phút. Khi viết lại, cân nhắc **không cache khi `partial === true`** — nhưng đây là **thay đổi hành vi**, phải ghi vào changelog.
- Không có nguồn dự phòng cho từng section. Không đọc từ DB, không có bảng seed cứng — nếu Vietcap chết, UI mất bộ lọc. (Bảng ở mục 8/9/10 của chương này là ứng viên tốt để làm seed tĩnh nếu quyết định cải thiện.)

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai/catalogs' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **`partial` và `warnings` bị LẶP** ở hai cấp: `body.partial` / `body.data.partial`, `body.warnings` / `body.data.warnings`. Handler đọc `catalogs.get("partial", False)` và `catalogs.get("warnings", [])` rồi copy ra ngoài (`market_data.py:2030–2035`). **Phải giữ cả hai** — không biết client nào đọc cấp nào.
- **Bốn upstream được gọi TUẦN TỰ, không song song.** `await` lần lượt trong 4 block try. Worst case: 4 × (15s timeout × 3 lần thử) ≈ 180 giây. Bản TS **nên** dùng `Promise.allSettled` — an toàn vì mỗi section độc lập — nhưng **phải giữ đúng thứ tự** của `source_urls`, `available_sections` và **thứ tự phần tử trong `warnings`** (hiện là topics → sources → industries → top_tickers).
- **`warnings` là chuỗi tiếng Anh lộ nội bộ** dạng `"<section>: <str(exception)>"` (vd `"topics: topics_all: missing static_topic"`, `"sources: All connection attempts failed"`). Không phải message thân thiện; đừng hiển thị thẳng cho người dùng cuối. Nếu bản TS đổi format warning thì đây là breaking change với bất kỳ client nào đang parse.
- **`sources` và `industries` cùng shape `{name, value}` nhưng KHÁC ngữ nghĩa:** `sources[].value` dùng cho query `source`, `industries[].value` dùng cho query `industry`. `topics` lại dùng `{name, key}` — **`key` không phải `value`**. Frontend hiện phải fallback nhiều tên (`str(raw, "slug", "value", "name")`) chính vì bất nhất này.
- **Fallback tên hiển thị:** `name = viName ?? enName ?? ""` (`s.get("viName", s.get("enName", ""))`). Chú ý đây là `dict.get(key, default)` của Python: nếu upstream có `viName: ""` (rỗng, không phải thiếu) thì kết quả là `""`, **không** fallback sang `enName`. Bản TS phải dùng `"viName" in s ? s.viName : (s.enName ?? "")`, **không** dùng `s.viName || s.enName`.
- **`top_tickers` đổi tên `organ_name` → `company_name`.** Cùng phép đổi tên này cũng xuất hiện ở `fetch_ticker_sentiment`.
- **`top_tickers` bị khoá cứng `group=hose`, `top_pos=5`, `top_neg=5`** ⇒ tối đa 10 phần tử, chỉ sàn HOSE. Không có tham số nào để đổi. Discovery doc ghi UI Vietcap còn có `VN30`/`VN100`/`HNX`/`UpCom` nhưng **giá trị `group` cho các nút đó chưa được xác minh** — đừng đoán.
- **Không validate từng phần tử.** `topics` iterate `data["static_topic"]` và gọi `t.get(...)` — nếu phần tử không phải dict thì `AttributeError` bị bắt bởi `except Exception` ⇒ **cả section** thành rỗng + warning. Hành vi này khác với `/news/ai` (fail-fast 502 cả trang).
- `logger.warning` là side-effect duy nhất — không ghi DB, không gửi Telegram/email, không audit log.

---

### GET /api/v1/market-data/news/ai/detail/{slug}

> **Chi tiết bài tin AI** — lấy toàn văn một bài tin theo `slug`, gồm HTML đầy đủ, bản text đã bỏ tag, tóm tắt AI và file đính kèm.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định — `60/minute` per IP |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/news/ai/detail/<slug>:<md5_12(params)>` (slug **giữ nguyên chữ**, không uppercase), TTL `REDIS_TTL_NEWS_SECONDS` = 300s |
| **Nguồn dữ liệu** | provider ngoài — `https://ai.vietcap.com.vn/api/v3/news_from_slug?slug=<slug>&language=vi` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `slug` | `string` | `minLength=1`, `maxLength=200`, `pattern=^[a-zA-Z0-9._-]+$` | Slug bài tin lấy từ field `slug` của bất kỳ endpoint danh sách. **Không** phải `id`. |

**Định dạng slug thực tế** (từ discovery doc + upstream):

- Chuỗi kebab-case **không dấu**, sinh từ tiêu đề: `fpt-doanh-thu-7-thang-dau-nam-2026-dat-42-500-ty-dong-tang-19-5`.
- Tin từ sở có hậu tố số: `hpg-bao-cao-tinh-hinh-quan-tri-cong-ty-6-thang-dau-nam-2026-17771208400-2-1`.
- Tin chủ đề bắt đầu bằng key chủ đề: `gia-vang-sang-17-8-vang-mieng-sjc-tang-500000-dong-len-121-800-000-dong-luong`.
- Pattern cho phép cả `.`, `_` và chữ HOA (dù slug thật thường chỉ có `a-z0-9-`); **chặn** `/`, khoảng trắng, `%`, `+`, và mọi ký tự có dấu tiếng Việt.

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không khai báo param nào. `language=vi` hardcode trong `fetch_news_detail`. Frontend gửi `?language=vi` — bị bỏ qua về logic, vẫn đổi cache key. |

**Request body**

— (GET, không body)

**Response 200**

~~~ts
type AiNewsDetailResponse = AiNewsDataEnvelope<AiNewsDetail>;
~~~

Ví dụ tin doanh nghiệp:

~~~json
{
  "data": {
    "id": "4f2c9a1b7e83d6045ab2c1f9e07d4b83cc51a6de92f30b7148ac5e21d9f60731",
    "slug": "fpt-doanh-thu-7-thang-dau-nam-2026-dat-42-500-ty-dong-tang-19-5",
    "ticker": "FPT",
    "industry": "Công nghệ Thông tin",
    "title": "FPT: Doanh thu 7 tháng đầu năm 2026 đạt 42.500 tỷ đồng, tăng 19,5%",
    "short_content": "Công ty Cổ phần FPT công bố kết quả kinh doanh 7 tháng với doanh thu 42.500 tỷ đồng và lợi nhuận trước thuế 7.820 tỷ đồng.",
    "source_link": "https://cafef.vn/fpt-doanh-thu-7-thang-dau-nam-2026-dat-42500-ty-dong-tang-195-188260817.chn",
    "image_url": "https://cafefcdn.com/203337114487263232/2026/8/17/fpt-1755410400123.jpg",
    "update_date": "2026-08-17 09:42:00",
    "source": "cafef",
    "source_name": "CafeF",
    "sentiment": "Positive",
    "score": 9.12,
    "topic_name": "",
    "male_audio_duration": 214.272,
    "female_audio_duration": 228.416,
    "raw_type": "stock_news",
    "company_name": "Công ty Cổ phần FPT",
    "summary": "FPT ghi nhận doanh thu 42.500 tỷ đồng và lợi nhuận trước thuế 7.820 tỷ đồng sau 7 tháng, hoàn thành 61% kế hoạch năm. Khối Công nghệ đóng góp 25.100 tỷ đồng, trong đó doanh thu từ thị trường nước ngoài tăng 24,8%.",
    "highlight_position": "lợi nhuận trước thuế 7.820 tỷ đồng, tăng 21,3% so với cùng kỳ",
    "news_full_content_html": "<p><strong>Công ty Cổ phần FPT (HoSE: FPT)</strong> vừa công bố kết quả kinh doanh 7 tháng đầu năm 2026.</p><p>Doanh thu hợp nhất đạt <strong>42.500 tỷ đồng</strong>, tăng 19,5% so với cùng kỳ.</p><figure><img src=\"https://cafefcdn.com/203337114487263232/2026/8/17/fpt-chart.png\"/><figcaption>Doanh thu FPT theo tháng</figcaption></figure>",
    "news_full_content_text": "Công ty Cổ phần FPT (HoSE: FPT) vừa công bố kết quả kinh doanh 7 tháng đầu năm 2026. Doanh thu hợp nhất đạt 42.500 tỷ đồng, tăng 19,5% so với cùng kỳ. Doanh thu FPT theo tháng",
    "file_attachments": [],
    "news_type": "stock_news"
  },
  "source_url": "https://ai.vietcap.com.vn/api/v3/news_from_slug"
}
~~~

Ví dụ tin từ sở — HTML gần như rỗng, nội dung chính nằm trong `file_attachments`:

~~~json
{
  "data": {
    "id": "e30b7f915ca6248d0b73fe1948ac6205d7b81f3c4e29a0d6158bf7c3a924e05b",
    "slug": "hpg-bao-cao-tinh-hinh-quan-tri-cong-ty-6-thang-dau-nam-2026-17771208400-2-1",
    "ticker": "HPG",
    "industry": "Tài nguyên Cơ bản",
    "title": "HPG: Báo cáo tình hình quản trị công ty 6 tháng đầu năm 2026",
    "short_content": "Báo cáo tình hình quản trị công ty 6 tháng đầu năm 2026",
    "source_link": "https://hnx.vn/vi-vn/m-tin-tuc-hnx/tintuc-628401-1.html",
    "image_url": "",
    "update_date": "2026-08-17 16:20:00",
    "source": "HNX",
    "source_name": "HNX",
    "sentiment": "",
    "score": 0,
    "topic_name": "",
    "male_audio_duration": 0,
    "female_audio_duration": 0,
    "raw_type": "exchange_news",
    "company_name": "Công ty Cổ phần Tập đoàn Hòa Phát",
    "summary": "",
    "highlight_position": "",
    "news_full_content_html": "<p>.</p>",
    "news_full_content_text": ".",
    "file_attachments": [
      {
        "text": "1. HPG_2026.8.17_BC_quan_tri_6T2026_signed.pdf",
        "url": "https://owa.hnx.vn/ftp///cims/2026/8_W3/000000016842119_BC_quan_tri_6T2026_signed.pdf"
      }
    ],
    "news_type": "exchange_news"
  },
  "source_url": "https://ai.vietcap.com.vn/api/v3/news_from_slug"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 404 | — | Upstream trả **200** nhưng body là dict **không có `id`** hoặc `id` falsy (`""`, `null`, `0`) — bao gồm `{}` | `No detail found for slug='fpt-tin-khong-ton-tai'` |
| 422 | — | `slug` rỗng, dài >200 ký tự, hoặc chứa ký tự ngoài `[a-zA-Z0-9._-]` (dấu tiếng Việt, `/`, khoảng trắng…) | `detail` là **array** `HttpValidationError`, `type: "string_pattern_mismatch"` |
| 429 | — | Vượt 60 request/phút/IP | `{"error":"Rate limit exceeded: 60 per 1 minute"}` |
| 502 | — | Upstream trả không phải dict (list, string, number) | `Detail response is list, expected dict` |
| 503 | — | Timeout / connect error / upstream trả HTTP 4xx-5xx | `Failed to fetch detail for slug=fpt-abc: <thông điệp exception gốc>` |

**Fallback / suy giảm**

- Không có nguồn dự phòng, không đọc lại từ DB, không dùng bản cache cũ khi upstream chết ⇒ **503**.
- Phân biệt rất rõ: upstream **200 nhưng rỗng** ⇒ **404**; upstream **404 HTTP** ⇒ **503** (vì `fetch_json` raise `HTTPStatusError`, bị bọc thành `AINewsUpstreamError`). Hai tình huống "không tìm thấy" cho hai status khác nhau — đây là hành vi thực tế, phải giữ.
- Field thiếu **không** gây lỗi: `_norm_detail` đặt default `""` / `[]` / `0` cho tất cả. Bài tin không có `news_full_content` ⇒ `news_full_content_html: ""` và `news_full_content_text: ""` (test `test_detail_empty_html`).
- 404/502/503 **không được cache** (exception bay ra trước bước ghi). Bản 200 được cache 300s (dict `data` không rỗng).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai/detail/fpt-doanh-thu-7-thang-dau-nam-2026-dat-42-500-ty-dong-tang-19-5' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

~~~bash
# Tin từ sở (slug có hậu tố số)
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai/detail/hpg-bao-cao-tinh-hinh-quan-tri-cong-ty-6-thang-dau-nam-2026-17771208400-2-1' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Tra chi tiết bằ`slug`, KHÔNG bằng `id`.** Discovery doc đã thử tra theo `id` ở nhiều endpoint và đều 404 (`docs/vietcap-ai-news-api-discovery.md:110`, `:301`). Ngược lại, `/news/ai/audio/{news_id}` **chỉ** nhận `id`. Đừng đảo hai thứ này.
- **`raw_type` KHÁC nghĩa so với endpoint danh sách.** Ở đây `raw_type = raw.news_type ?? "unknown"` ⇒ `"stock_news"` / `"exchange_news"` / `"unknown"`. Đồng thời `news_type = raw.news_type ?? ""`. Nghĩa là khi upstream thiếu `news_type`: `raw_type === "unknown"` nhưng `news_type === ""` — **hai default khác nhau cho cùng một field nguồn**. Phải copy chính xác.
- **`news_full_content_html` là HTML THÔ, CHƯA sanitize.** Backend không chạy DOMPurify/bleach, không escape gì. Có thể chứa `<script>`, `<iframe>`, `onerror=`, ảnh remote. **Bên render (frontend) chịu trách nhiệm sanitize.** Nếu bản TS muốn sanitize ở server thì đó là **thay đổi hành vi** — HTML sẽ đổi, phải quyết định có chủ đích và test lại UI.
- **`news_full_content_text` được sinh bằng regex, không phải parser HTML:** `re.sub(r"<[^>]+>", " ", html)` rồi `re.sub(r"\s+", " ", …).strip()`. Hệ quả bắt buộc phải sao chép:
  - Tag được thay bằng **một dấu cách** (không phải chuỗi rỗng) ⇒ `<b>a</b><b>b</b>` → `"a b"`, không phải `"ab"`.
  - **HTML entity KHÔNG được decode:** `&nbsp;`, `&amp;`, `&#8220;` nằm nguyên trong text.
  - Nội dung trong `<script>`/`<style>` **KHÔNG bị loại** — chỉ tag bị xoá, phần text bên trong vẫn còn.
  - `<figcaption>` bị gộp thẳng vào dòng văn (xem ví dụ FPT ở trên: `"… so với cùng kỳ. Doanh thu FPT theo tháng"`).
  - `\s+` gộp cả newline/tab thành 1 dấu cách ⇒ mất hoàn toàn cấu trúc đoạn.
- **`file_attachments` là pass-through thuần.** `raw.get("file_attachment", [])` — không validate, không normalize từng phần tử. Nếu upstream đổi shape, kiểu TS sẽ sai mà không có lỗi runtime. Ghi rõ trong kiểu là "pass-through".
- **Đổi tên số ít → số nhiều:** upstream `file_attachment` (số ít) → API `file_attachments` (số nhiều). Dễ sai khi copy.
- **Frontend hiện đọc `full_content`, một field KHÔNG TỒN TẠI.** `dashboard/src/features/news/api.ts` map `fullContent: str(raw, "full_content", "fullContent")` — backend chỉ có `news_full_content_html`/`news_full_content_text` ⇒ `fullContent` luôn `null`. Bug frontend đang tồn tại; khi viết lại backend, **đừng** thêm alias `full_content` để "chữa" mà không đồng bộ với frontend.
- **`slug` trong cache key giữ nguyên chữ hoa/thường** (segment `detail` không nằm trong `_symbol_path_positions`), nên `/detail/FPT-abc` và `/detail/fpt-abc` là hai key khác nhau và cũng là hai request upstream khác nhau.
- Kiểm tra 404 dùng `if not data.get("id")` — **falsy**, không phải `is None`. Upstream trả `{"id": ""}` hoặc `{"id": 0}` ⇒ 404.

---

### GET /api/v1/market-data/news/ai/tickers/{symbol}

> **Bảng tin theo mã** — gộp trong một request: sentiment tổng hợp của mã + trang tin doanh nghiệp + trang tin công bố từ sở, mỗi nguồn con lỗi được báo qua `warnings` chứ không làm sập response.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định — `60/minute` per IP |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/news/ai/tickers/<SYMBOL>:<md5_12(params)>` (segment sau `tickers` **được uppercase** khi build key), TTL `REDIS_TTL_NEWS_SECONDS` = 300s |
| **Nguồn dữ liệu** | provider ngoài — 3 lần gọi `ai.vietcap.com.vn`: `/api/v3/ticker_score`, `/api/v3/news_info`, `/api/v3/xnews_info` |
| **Side-effect** | — (không log warning; warnings chỉ nằm trong response) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Validate trong handler bằng `^[A-Z0-9]{1,10}$` ⇒ 422 `detail: string` | Mã CK. **PHẢI viết HOA** — `vcb` bị 422 dù code có `symbol.upper()` ở bước sau. OpenAPI không khai báo pattern nào cho param này (chỉ `type: string`). |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `integer` | Không | `1` | `ge=1` | Áp cho **cả hai** danh sách con (business và exchange) cùng lúc. |
| `page_size` | `integer` | Không | `12` | `ge=1`, **`le=50`** | Khác `/news/ai` (max 100). Áp cho cả hai danh sách con. |
| `sentiment` | `string \| null` | Không | `null` | Phải ∈ `{Positive, Neutral, Negative, ""}` khi truthy ⇒ 422 `detail: string` | Lọc nhận định cho cả hai danh sách con. |
| `source` | `string \| null` | Không | `null` | Không validate | Mã nguồn tin (bảng mục 8) → gửi upstream là `newsfrom`. |
| `update_from` | `string \| null` | Không | `null` | `^\d{4}-\d{2}-\d{2}$` **và** ngày lịch thật | Từ ngày. Vẫn bị kẹp 30 ngày như `/news/ai`. |
| `update_to` | `string \| null` | Không | `null` | Cùng ràng buộc | Đến ngày. Không bị kẹp. |

> Endpoint này **không** có `ticker`, `topic`, `industry`, `kind` — `ticker` được lấy từ path và bị `.toUpperCase()`, `industry`/`topic` luôn là `""`.

**Request body**

— (GET, không body)

**Response 200**

~~~ts
interface AiTickerNewsBlock {
  data: AiNewsListItem[];
  /** total_records của upstream cho block này; 0 khi block lỗi hoặc upstream thiếu key. */
  total_records: number;
}

/** LƯU Ý: object PHẲNG, KHÔNG có key `data` ở cấp ngoài, KHÔNG có `source_url`. */
interface AiTickerViewResponse {
  /** Luôn là symbol.toUpperCase(). */
  ticker: string;
  /** MỘT trong 3 shape — xem mục 7. */
  sentiment: AiTickerSentiment;
  /** kind=business, đã lọc theo ticker. */
  business_news: AiTickerNewsBlock;
  /** kind=exchange, đã lọc theo ticker. */
  exchange_news: AiTickerNewsBlock;
  /** true khi có ≥1 trong 3 nguồn con lỗi. */
  partial: boolean;
  /** "sentiment: …" | "business_news: …" | "exchange_news: …" (tiếng Anh). */
  warnings: string[];
  page: number;
  page_size: number;
}
~~~

Trường hợp đủ 3 nguồn (`/news/ai/tickers/VCB?page=1&page_size=2`):

~~~json
{
  "ticker": "VCB",
  "sentiment": {
    "ticker": "VCB",
    "score": 8.64,
    "sentiment": "Positive",
    "news_count": 34,
    "count_positive": 23,
    "count_neutral": 8,
    "count_negative": 3,
    "company_name": "Ngân hàng Thương mại Cổ phần Ngoại thương Việt Nam",
    "logo": "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/VCB.jpeg",
    "summaries": [
      "Vietcombank đạt lợi nhuận trước thuế 25.400 tỷ đồng sau 6 tháng, tăng 11,2% so với cùng kỳ.",
      "Tỷ lệ nợ xấu của VCB giảm về 0,92%, thấp nhất nhóm ngân hàng quốc doanh."
    ],
    "summary_sentiments": ["Positive", "Positive"]
  },
  "business_news": {
    "data": [
      {
        "id": "1c7b4ae05f38d2916be03fa7d4c8152097ea6b3df015c2748ba9e6301df42b85",
        "slug": "vcb-loi-nhuan-truoc-thue-6-thang-dat-25-400-ty-dong-tang-11-2",
        "ticker": "VCB",
        "industry": "Ngân hàng",
        "title": "VCB: Lợi nhuận trước thuế 6 tháng đạt 25.400 tỷ đồng, tăng 11,2%",
        "short_content": "Ngân hàng TMCP Ngoại thương Việt Nam công bố lợi nhuận trước thuế hợp nhất 25.400 tỷ đồng, hoàn thành 54% kế hoạch năm 2026.",
        "source_link": "https://vietstock.vn/2026/08/vcb-loi-nhuan-truoc-thue-6-thang-dat-25400-ty-dong-737-1284561.htm",
        "image_url": "https://image.vietstock.vn/2026/08/17/vcb-hq.jpg",
        "update_date": "2026-08-17 11:15:00",
        "source": "vietstock",
        "source_name": "Vietstock",
        "sentiment": "Positive",
        "score": 8.90,
        "topic_name": "",
        "male_audio_duration": 196.608,
        "female_audio_duration": 205.824,
        "raw_type": "business"
      }
    ],
    "total_records": 128
  },
  "exchange_news": {
    "data": [
      {
        "id": "5ab29c710de4f836b90152cd7ae4f3016b8d27594cf30ae1782db0c6f9153e47",
        "slug": "vcb-thong-bao-giao-dich-co-phieu-cua-nguoi-noi-bo-17771102400-2-1",
        "ticker": "VCB",
        "industry": "",
        "title": "VCB: Thông báo giao dịch cổ phiếu của người nội bộ",
        "short_content": "",
        "source_link": "https://hose.vn/tin-tuc/vcb-thong-bao-giao-dich-co-phieu-cua-nguoi-noi-bo",
        "image_url": "",
        "update_date": "2026-08-16 15:48:00",
        "source": "HOSE",
        "source_name": "",
        "sentiment": "",
        "score": 0,
        "topic_name": "",
        "male_audio_duration": 0,
        "female_audio_duration": 0,
        "raw_type": "exchange"
      }
    ],
    "total_records": 47
  },
  "partial": false,
  "warnings": [],
  "page": 1,
  "page_size": 2
}
~~~

Trường hợp suy giảm — `ticker_score` sai shape, hai danh sách vẫn OK (vẫn **HTTP 200**, theo test `test_ticker_endpoint_partial_on_shape_error`):

~~~json
{
  "ticker": "VCB",
  "sentiment": {
    "ticker": "VCB",
    "score": 0,
    "sentiment": ""
  },
  "business_news": { "data": [], "total_records": 0 },
  "exchange_news": { "data": [], "total_records": 0 },
  "partial": true,
  "warnings": [
    "sentiment: ticker_score response is str, expected dict"
  ],
  "page": 1,
  "page_size": 12
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `symbol` không khớp `^[A-Z0-9]{1,10}$` (chữ thường, có dấu `-`/`.`, dài >10) | `Mã chứng khoán không hợp lệ: vcb` |
| 422 | — | `sentiment` truthy nhưng không hợp lệ | `Giá trị sentiment không hợp lệ: Wrong` *(chú ý: KHÁC câu của `/news/ai` — không có `sentiment='…'` và không có phần "Cho phép: …")* |
| 422 | — | `update_from`/`update_to` sai định dạng | `Sai định dạng date format: '20260817'. Phải đúng dạng YYYY-MM-DD.` |
| 422 | — | Đúng định dạng nhưng không phải ngày thật | `Giá trị date không hợp lệ: '2026-02-30'. Không phải ngày hợp lệ.` |
| 422 | — | `page < 1` hoặc `page_size` ngoài `[1,50]` | `detail` là **array** `HttpValidationError` |
| 429 | — | Vượt 60 request/phút/IP | `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Không có 502/503.** Cả `AINewsUpstreamError` và `AINewsUpstreamShapeError` của 3 nguồn con đều bị bắt và chuyển thành `warnings` (`market_data.py:2070–2091`). Nếu cả 3 nguồn chết, response vẫn **200** với `partial: true`, `warnings` 3 phần tử, hai block rỗng.

**Fallback / suy giảm**

Ba nguồn con, ba `try/except` độc lập, thứ tự cố định:

1. `fetch_ticker_sentiment(symbol)` lỗi ⇒ `warnings.push("sentiment: <exc>")`, `sentiment = {ticker: SYMBOL, score: 0, sentiment: ""}` — **3 field, thiếu `news_count`**.
2. `fetch_news_list("business", …)` lỗi ⇒ `warnings.push("business_news: <exc>")`, `business_news = {data: [], total_records: 0}`.
3. `fetch_news_list("exchange", …)` lỗi ⇒ `warnings.push("exchange_news: <exc>")`, `exchange_news = {data: [], total_records: 0}`.

Ngoài ra:

- `ticker_score` trả `ticker_info: []` (mã không có tin trong cửa sổ tổng hợp) ⇒ **không** phải lỗi: `sentiment = {ticker, score: 0, sentiment: "", news_count: 0}` (4 field), `partial` vẫn `false`.
- Danh sách rỗng hợp lệ ⇒ `data: []`, `total_records: 0`, `partial: false`. Client **không thể** phân biệt "mã không có tin" với "upstream chết" chỉ bằng `business_news` — **phải đọc `partial`/`warnings`**.
- **BẪY CACHE:** body **không có** key `data` ở cấp ngoài ⇒ `_has_data` rơi vào nhánh `return bool(body)` ⇒ luôn `true` ⇒ **response suy giảm (kể cả cả 3 nguồn chết) VẪN bị cache 300 giây**. Cân nhắc không cache khi `partial === true`, nhưng đó là thay đổi hành vi.
- Không có nguồn dự phòng, không đọc DB, không giữ dữ liệu phiên trước.

**curl**

~~~bash
# Mặc định: page=1, page_size=12
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai/tickers/VCB' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

~~~bash
# Chỉ tin tiêu cực của HPG từ nguồn CafeF trong 30 ngày
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai/tickers/HPG?page=1&page_size=20&sentiment=Negative&source=cafef&update_from=2026-07-18&update_to=2026-08-17' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **`symbol` phải VIẾT HOA.** `_validate_symbol(symbol)` chạy trên chuỗi **thô** với regex `^[A-Z0-9]{1,10}$`, **trước** khi có bất kỳ `.upper()` nào (`market_data.py:2061`). Nghịch lý: `symbol.upper()` được dùng ở dòng 2078 và 2094 nhưng vô nghĩa vì đã validate hoa. Nếu bản TS "tử tế" cho phép chữ thường thì cache key và hành vi 422 sẽ đổi — đây là thay đổi hành vi.
- **Lưu ý về `re.match` vs `fullmatch`:** `_validate_symbol` dùng `re.match(r"^[A-Z0-9]{1,10}$", …)` — có `$` neo cuối nên tương đương fullmatch, **nhưng** `$` của Python cũng khớp trước một `\n` cuối chuỗi. Trong TS dùng `/^[A-Z0-9]{1,10}$/` là đủ (JS `$` không cho phép newline trailing) — khác biệt cực nhỏ, chỉ đáng nhắc nếu ai đó gửi symbol có `%0A`.
- **Thứ tự kiểm tra:** `symbol` → `sentiment` → `update_from` → `update_to` → mới fetch.
- **Thông điệp `sentiment` KHÁC với `/news/ai`.** Ở đây: `Giá trị sentiment không hợp lệ: Wrong`. Ở `/news/ai`: `Giá trị sentiment='Wrong' không hợp lệ. Cho phép: Positive, Neutral, Negative`. Hai câu khác nhau cho cùng loại lỗi — copy nguyên văn từng chỗ, đừng thống nhất.
- **`sentiment` có 3 shape** (mục 7). Đây là bug thiết kế của bản gốc nhưng phải sao chép nếu muốn tương thích byte-level. Nếu quyết định thống nhất về 1 shape thì phải sửa cả frontend.
- **`page`/`page_size` áp CHUNG cho 2 block.** Không thể phân trang riêng tin doanh nghiệp và tin từ sở. `total_records` của 2 block khác nhau ⇒ block này hết trang trong khi block kia còn ⇒ UI phải xử lý.
- **3 nguồn gọi TUẦN TỰ.** Worst case 3 × 15s × 3 lần thử ≈ 135 giây. Nên `Promise.allSettled` trong bản TS, nhưng **phải giữ thứ tự `warnings`** là sentiment → business_news → exchange_news.
- **`warnings` là chuỗi tiếng Anh lộ nội bộ** dạng `"<nguồn>: <str(exception)>"`, ví dụ `"sentiment: ticker_score response is str, expected dict"`, `"business_news: Failed to fetch business news: ConnectTimeout"`. Đừng hiển thị thẳng cho user.
- **Response KHÔNG có `source_url`/`source_urls`** — endpoint duy nhất trong nhóm tin AI không trả URL upstream (handler bỏ giá trị bằng `_`).
- **`ticker_score` gọi với `summary=false`.** Discovery doc cảnh báo `summary=true` trả `ticker_info` rỗng cho VIC trong lần kiểm tra (`docs/vietcap-ai-news-api-discovery.md:279`) ⇒ **giữ `summary=false`**. Các param còn lại: `ticker=<SYMBOL>`, `industry=`, `group=`, `language=vi`.
- **`summaries` / `summary_sentiments` là pass-through** từ `extractive_summaries` / `extractive_sentiments`, **không** validate phần tử. Discovery doc mô tả đây là tóm tắt rút trích của từng bài và sentiment tương ứng (song song 1-1), nhưng kiểu phần tử **chưa được kiểm chứng trong code hay test** ⇒ khai báo `unknown[]` và đừng giả định `string[]`. Field `extractive_positions` mà discovery doc nhắc tới **KHÔNG** được connector đọc — không có trong response.
- **Đổi tên field ở `ticker_score`:** `cnt_news` → `news_count`, `count_pos` → `count_positive`, `count_neu` → `count_neutral`, `count_neg` → `count_negative`, `organ_name` → `company_name`, `extractive_summaries` → `summaries`, `extractive_sentiments` → `summary_sentiments`. Bảy phép đổi tên, dễ sai.
- **`ticker` của `sentiment` có thể khác `ticker` cấp ngoài:** cấp ngoài luôn `symbol.upper()`; trong `sentiment` là `t.get("ticker", symbol.upper())` — lấy từ upstream trước, fallback mới là symbol.

---

### GET /api/v1/market-data/news/ai/audio/{news_id}

> **URL audio của bài tin** — trả về hai đường dẫn file `.m4a` (giọng nam / giọng nữ) do Vietcap sinh cho bài tin, tra theo `id`.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định — `60/minute` per IP |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/news/ai/audio/<news_id>:<md5_12(params)>`, TTL `REDIS_TTL_NEWS_SECONDS` = 300s |
| **Nguồn dữ liệu** | provider ngoài — `https://ai.vietcap.com.vn/api/audio_from_id?id=<news_id>` |
| **Side-effect** | — |

> **ĐÂY LÀ ENDPOINT JSON, KHÔNG PHẢI ENDPOINT AUDIO.** Xem mục "Ghi chú khi viết lại" bên dưới để biết chính xác vì sao và bản TS phải làm gì.

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `news_id` | `string` | `minLength=1`, `maxLength=100`, `pattern=^[a-zA-Z0-9._-]+$` | `id` của bài tin (field `id` từ danh sách hoặc chi tiết). Thực tế là **sha256 hex 64 ký tự chữ thường**. **Không** phải `slug`. |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| — | — | — | — | — | Không có. `fetch_audio` chỉ gửi `id` lên upstream — **không** gửi `language`. |

**Request body**

— (GET, không body)

**Response 200**

~~~ts
type AiNewsAudioResponse = AiNewsDataEnvelope<AiNewsAudio>;
~~~

Response header: `content-type: application/json`. **Không** có `Content-Length` của file audio, **không** có `Accept-Ranges`, **không** có `Content-Disposition` — vì body chỉ là JSON vài trăm byte.

~~~json
{
  "data": {
    "male_url": "https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/male/4f2c9a1b7e83d6045ab2c1f9e07d4b83cc51a6de92f30b7148ac5e21d9f60731.m4a",
    "female_url": "https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/female/4f2c9a1b7e83d6045ab2c1f9e07d4b83cc51a6de92f30b7148ac5e21d9f60731.m4a"
  },
  "source_url": "https://ai.vietcap.com.vn/api/audio_from_id"
}
~~~

Trường hợp chỉ có một giọng (upstream có `male` nhưng thiếu `female`):

~~~json
{
  "data": {
    "male_url": "https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/male/e30b7f915ca6248d0b73fe1948ac6205d7b81f3c4e29a0d6158bf7c3a924e05b.m4a",
    "female_url": ""
  },
  "source_url": "https://ai.vietcap.com.vn/api/audio_from_id"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 404 | — | Upstream trả 200, là dict, nhưng **không có cả `male` và `female`** (kiểm tra bằng `in`, không phải truthy) | `No audio found for id='abc123'` |
| 422 | — | `news_id` rỗng, dài >100, hoặc chứa ký tự ngoài `[a-zA-Z0-9._-]` | `detail` là **array** `HttpValidationError`, `type: "string_pattern_mismatch"` |
| 429 | — | Vượt 60 request/phút/IP | `{"error":"Rate limit exceeded: 60 per 1 minute"}` |
| 502 | — | Upstream trả không phải dict | `Audio response is str, expected dict` |
| 503 | — | Timeout / connect error / upstream HTTP 4xx-5xx sau 3 lần thử | `Failed to fetch audio for id=abc123: <thông điệp exception gốc>` |

**Fallback / suy giảm**

- Không dự phòng, không tự ghép URL S3. Upstream chết ⇒ **503**.
- Nếu dict có `male` **hoặc** `female` (chỉ cần 1) ⇒ 200; key thiếu thành `""`. Chỉ khi **cả hai** đều thiếu mới 404 (`vietcap_ai_news.py:240–243`).
- Điều kiện là `"male" not in data and "female" not in data` — kiểm tra **sự tồn tại của key**, không phải giá trị. Upstream trả `{"male": "", "female": ""}` ⇒ **200** với hai URL rỗng, **không** 404. Client phải tự kiểm tra chuỗi rỗng trước khi cho phát.
- Tin từ sở thường có `male_audio_duration = 0` / `female_audio_duration = 0`. Theo discovery doc (`:367`), endpoint audio **vẫn có thể trả URL** cho những bài này nhưng **file có thể không tồn tại trên S3** ⇒ phát sẽ lỗi 403/404 phía client. Backend không kiểm tra file tồn tại. UI nên dùng `*_audio_duration > 0` từ danh sách/chi tiết làm điều kiện hiển thị nút phát.
- 404/502/503 không được cache. 200 được cache 300s — nếu URL S3 có signature hết hạn thì cache có thể phục vụ URL chết (thực tế URL quan sát được là public không signature).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/news/ai/audio/4f2c9a1b7e83d6045ab2c1f9e07d4b83cc51a6de92f30b7148ac5e21d9f60731' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

~~~bash
# Sau đó phát file: client tải TRỰC TIẾP từ S3, KHÔNG qua backend IQX
curl -sS -o vcb-tin.m4a \
  'https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/male/4f2c9a1b7e83d6045ab2c1f9e07d4b83cc51a6de92f30b7148ac5e21d9f60731.m4a'
~~~

**Ghi chú khi viết lại**

- **KẾT LUẬN VỀ HÌNH DẠNG RESPONSE — đọc kỹ:** endpoint này trả **JSON `{data: {male_url, female_url}, source_url}`** với `Content-Type: application/json`. **KHÔNG** phải file nhị phân. Bằng chứng trong source:
  - Handler khai báo `-> dict[str, Any]` và `return {"data": audio, "source_url": url}` (`market_data.py:2002`, `:2020`) — không dùng `StreamingResponse`, `FileResponse`, hay `Response(media_type=...)`.
  - `fetch_audio` gọi `fetch_json` (JSON parse) rồi map `data["male"] → male_url`, `data["female"] → female_url` (`vietcap_ai_news.py:245–248`).
  - Endpoint có `@redis_cached` — không thể cache một binary stream bằng `json.dumps`.
  - OpenAPI khai báo `content: {"application/json": {...}}`.
  Vậy: **không stream, không proxy byte, không `Content-Type: audio/mpeg`** (và cả khi có audio thì định dạng là **`.m4a` / AAC**, không phải `mpeg`), **không `Accept-Ranges`**, **không `Content-Length`** của file, **không hỗ trợ HTTP Range**. Bản NestJS chỉ cần một handler JSON thường — **KHÔNG** viết code pipe stream, **KHÔNG** buffer file vào RAM, **KHÔNG** thêm `res.setHeader("Accept-Ranges", …)`.
- **Việc phát audio hoàn toàn ở phía client**, tải trực tiếp từ `vietcap-ai.s3.ap-southeast-1.amazonaws.com`. Nếu sau này muốn proxy stream qua backend (để ẩn S3 hoặc hỗ trợ Range) thì đó là **endpoint MỚI**, không phải thay đổi endpoint này — và khi đó phải: `pipe` stream (không `await response.arrayBuffer()`), chuyển tiếp `Range`/`If-Range` lên S3, trả lại `206` + `Content-Range` + `Accept-Ranges: bytes` + `Content-Type: audio/mp4`, và **bỏ `@redis_cached`** cho endpoint đó.
- **Tra bằ`id`, KHÔNG bằng `slug`** — ngược với `/news/ai/detail/{slug}`. `id` lấy từ field `id` của item danh sách hoặc chi tiết.
- **Đừng tự ghép URL S3.** Discovery doc (`:368`) ghi rõ đường dẫn `{voice}/{id}.m4a` là đoán được, nhưng backend **phải gọi `audio_from_id`** thay vì tự dựng URL. Giữ nguyên nguyên tắc này.
- **Đổi tên field:** upstream `male`/`female` → API `male_url`/`female_url`. Thêm hậu tố `_url`.
- **Không có thời lượng trong response này.** `male_audio_duration` / `female_audio_duration` (đơn vị **giây**, số thực) chỉ có ở `/news/ai` và `/news/ai/detail/{slug}`. Muốn hiện thanh tiến trình, UI phải lấy duration từ danh sách/chi tiết rồi ghép với URL từ đây.
- **Pattern `^[a-zA-Z0-9._-]+$`, maxLength 100** — `id` thật là 64 hex nên luôn hợp lệ. Pattern chặn `/`, `%`, khoảng trắng ⇒ không thể path-traversal qua param này. Giữ nguyên pattern khi viết lại (nó là lớp phòng thủ, không chỉ là validation UX).
- **`news_id` trong cache key giữ nguyên chữ hoa/thường** (`audio` không nằm trong `_symbol_path_positions`).
- Endpoint **không** gửi `language` lên upstream (khác 4 endpoint còn lại) — `params = {"id": news_id}` là toàn bộ.

---

## Ghi chú tổng hợp khi viết lại

### 1. Sáu shape response, đừng đồng nhất hoá

| Endpoint | Shape cấp ngoài |
|---|---|
| `/news/latest` | `{data: Item[], meta: MarketDataMeta}` |
| `/news/sources` | `{data: Entry[], meta: MarketDataMeta}` |
| `/news/ai` | `{data: Item[], total_records, kind, page, page_size, source_url}` |
| `/news/ai/catalogs` | `{data: {…}, partial, warnings, source_urls}` |
| `/news/ai/detail/{slug}` | `{data: {…}, source_url}` |
| `/news/ai/tickers/{symbol}` | **phẳng**: `{ticker, sentiment, business_news, exchange_news, partial, warnings, page, page_size}` |
| `/news/ai/audio/{news_id}` | `{data: {…}, source_url}` |

Đừng gói tất cả vào một envelope chung "cho gọn" — mọi client hiện tại đang bám vào 6 shape này.

### 2. Ba chiến lược lỗi khác nhau trong CÙNG một chương

| Chiến lược | Endpoint | Hành vi khi provider chết |
|---|---|---|
| **Fail mềm im lặng** | `/news/latest` | 200 + `data: []`, không log, không warning. Và **bị cache 300s**. |
| **Fail mềm có báo** | `/news/ai/catalogs`, `/news/ai/tickers/{symbol}` | 200 + `partial: true` + `warnings[]`. Cũng **bị cache 300s**. |
| **Fail cứng** | `/news/ai`, `/news/ai/detail/{slug}`, `/news/ai/audio/{news_id}` | 502 (sai shape) hoặc 503 (transport). Không cache. |

`/news/sources` không có chiến lược nào vì không gọi mạng.

### 3. Ranh giới 404 / 502 / 503 phải giữ chính xác

- Upstream trả **200 nhưng không có bản ghi** (`{}`, không có `id`, không có cả `male`/`female`) ⇒ **404**.
- Upstream trả **200 với dữ liệu sai hình dạng** (không phải dict, thiếu `news_info`/`ticker_info`, `news_info` không phải list, phần tử không phải dict) ⇒ **502**.
- **Mọi** exception từ tầng HTTP — timeout, DNS, connection reset, **và cả HTTP 404/500 của upstream** — ⇒ **503**. Đây là điểm phản trực giác nhất: upstream 404 ⇒ IQX 503.

### 4. Bốn cái bẫy cache phải nhớ

1. **Rỗng vẫn được cache** ở `/news/latest` (`cache_empty=true`), `/news/ai/catalogs` và `/news/ai/tickers/{symbol}` (do `_has_data` luôn true) — sự cố 1 giây kéo thành 5 phút. Ngược lại `/news/ai` **không** cache kết quả rỗng.
2. **Param không khai báo vẫn đổi cache key** — frontend gửi `?language=vi` làm phân mảnh cache của 3 endpoint AI.
3. **`meta.as_of` bị đóng băng** trong body cache; không dùng làm timestamp thật.
4. **Chỉ cache HIT có header `X-Cache: HIT`**; MISS không có header. Nếu bản TS thêm `X-Cache: MISS` thì đó là thay đổi quan sát được.

### 5. Ngày giờ và múi giờ

| Field | Định dạng | Múi giờ | Xử lý |
|---|---|---|---|
| `meta.as_of` | ISO-8601 có offset, vd `2026-08-17T08:15:03.482911+00:00` | **UTC** (`datetime.now(UTC)`) | Backend sinh |
| `update_date` (tin AI) | `2026-08-17 09:42:00` — có dấu cách, **không** `T`, **không** offset | Giờ Việt Nam **UTC+7** (theo UI Vietcap) | **Pass-through nguyên chuỗi**, không parse |
| `pub_date` (RSS) | RFC-822, vd `Mon, 17 Aug 2026 15:12:00 +0700` | Có offset trong chuỗi (thường `+0700`) | **Pass-through nguyên chuỗi**, không parse |
| `update_from` / `update_to` (query) | `YYYY-MM-DD` chính xác | Không có giờ; upstream hiểu theo giờ VN | Regex `^\d{4}-\d{2}-\d{2}$` + `date.fromisoformat` |

Bản TS **không được** "chuẩn hoá" `update_date`/`pub_date` sang ISO — client hiện tại đang parse hai định dạng này. Nếu muốn thêm, hãy **thêm field mới** (vd `update_date_iso`) chứ đừng thay field cũ.

### 6. HTML, sanitize và encoding

- **Tin AI:** `news_full_content_html` là **HTML thô, chưa sanitize** (có thể chứa `<script>`, `<iframe>`, `onerror=`). Sanitize là việc của tầng render. `news_full_content_text` do regex `<[^>]+>` → `" "` rồi gộp `\s+` — **không** decode entity, **không** loại nội dung `<script>`.
- **Tin RSS:** `title`/`description` đã bóc CDATA + xoá tag, `description` cắt 500 ký tự cứng. **Không** decode entity. `image_url` regex `<img src>` đầu tiên trong description thô.
- **Encoding:** toàn bộ response là JSON UTF-8. Redis lưu bằng `json.dumps(..., ensure_ascii=False, default=str)` — tiếng Việt có dấu lưu nguyên, không escape `\uXXXX`. `default=str` nghĩa là mọi kiểu không JSON-serializable (datetime…) bị `str()` — đã được xử lý trước bởi `model_dump(mode="json")` cho các endpoint envelope.

### 7. Đổi tên field upstream → API (bảng đối chiếu đầy đủ)

| Upstream | API IQX | Nơi dùng |
|---|---|---|
| `news_title` | `title` | list + detail |
| `news_short_content` | `short_content` | list + detail |
| `news_source_link` | `source_link` | list + detail |
| `news_image_url` | `image_url` | list + detail |
| `news_from` | `source` | list + detail |
| `news_from_name` | `source_name` | list + detail |
| `news_full_content` | `news_full_content_html` (+ `news_full_content_text` dẫn xuất) | detail |
| `file_attachment` | `file_attachments` | detail |
| `news_type` | `news_type` **và** `raw_type` (default khác nhau!) | detail |
| `male` / `female` | `male_url` / `female_url` | audio |
| `organ_name` | `company_name` | top_tickers + ticker sentiment |
| `cnt_news` | `news_count` | ticker sentiment |
| `count_pos` / `count_neu` / `count_neg` | `count_positive` / `count_neutral` / `count_negative` | ticker sentiment |
| `extractive_summaries` | `summaries` | ticker sentiment |
| `extractive_sentiments` | `summary_sentiments` | ticker sentiment |
| `viName` (fallback `enName`) | `name` | catalogs sources/industries |
| *(query)* `source` | *(upstream)* `newsfrom` | list + ticker view |

`extractive_positions` của upstream **không** được đọc — đừng thêm vào.

### 8. Không field nào nullable trong nhóm tin AI

`_norm_item` / `_norm_detail` / `fetch_audio` đều dùng `raw.get(key, <default cứng>)` với default `""` cho string, `0` cho number, `[]` cho array. Vì thế **mọi field của `AiNewsListItem` / `AiNewsDetail` / `AiNewsAudio` LUÔN có mặt và KHÔNG BAO GIỜ `null`**. Trong TS: không dùng `?`, không dùng `| null`. Ngoại lệ duy nhất là `AiTickerSentiment` — nơi **số lượng field** thay đổi theo nhánh (mục 7).

Với RSS, `MdNewsRssItem` cũng luôn đủ 6 field; bài thiếu `title` hoặc `link` bị loại khỏi output thay vì trả `null`.

### 9. Đơn vị và kiểu số

- `score` (sentiment): thang **0–10** dạng số thực (`9.75`, `9.12`, `2.35`), `0` khi không có. Không phải phần trăm.
- `male_audio_duration` / `female_audio_duration`: **giây**, số thực (`391.488`). Không phải millisecond.
- `total_records`: số bản ghi khớp bộ lọc **trên toàn bộ kết quả**, không phải của trang.
- `news_count` / `count_positive` / `count_neutral` / `count_negative`: số bài, số nguyên.
- Chương này **không** trả giá hay khối lượng — không có vấn đề đơn vị đồng/nghìn đồng. Con số tiền tệ chỉ nằm **bên trong văn bản tin** (đã định dạng sẵn theo kiểu Việt Nam, vd `42.500 tỷ đồng`) và phải giữ nguyên như chuỗi.

### 10. Thứ tự và phân trang

- **Không endpoint nào sort lại dữ liệu.** Thứ tự = thứ tự provider trả (tin AI: mới nhất trước theo `update_date`) hoặc thứ tự vòng lặp site/feed (RSS).
- `/news/ai` và `/news/ai/tickers/{symbol}` **echo** `page`/`page_size` đã nhận, **không** trả `total_pages`, `has_next`, hay cursor. Client tự tính từ `total_records`.
- `/news/ai` clamp `page_size` xuống **99** khi gửi upstream nhưng echo giá trị gốc (tới 100) ⇒ `data.length` có thể nhỏ hơn `page_size`.
- `/news/latest` áp `max_per_site` **cho từng feed**, và khử trùng lặp **sau** khi gom ⇒ `data.length` không dự đoán được từ tham số.

### 11. Hiệu năng: mọi thứ đều tuần tự

| Endpoint | Số request ngoài | Timeout mỗi request | Retry | Worst case |
|---|---|---|---|---|
| `/news/latest` | tối đa **10** (feed) | 10s | không | ~100s |
| `/news/sources` | 0 | — | — | tức thời |
| `/news/ai` | 1 | 15s | 3 | ~45s |
| `/news/ai/catalogs` | 4 | 15s | 3 | ~180s |
| `/news/ai/detail/{slug}` | 1 | 15s | 3 | ~45s |
| `/news/ai/tickers/{symbol}` | 3 | 15s | 3 | ~135s |
| `/news/ai/audio/{news_id}` | 1 | 15s | 3 | ~45s |

Bản TS **nên** song song hoá 3 endpoint gộp (`/news/latest`, `/news/ai/catalogs`, `/news/ai/tickers/{symbol}`) bằng `Promise.allSettled` — an toàn vì các nguồn con độc lập — nhưng **bắt buộc giữ đúng thứ tự** của: `data` (RSS: theo site/feed), `source_urls`, `available_sections`, và `warnings` (theo thứ tự section/nguồn đã liệt kê ở từng mục). Đồng thời nên đặt timeout tổng cho request để không có endpoint nào treo 180 giây.

### 12. Bảo mật / phòng thủ

- Cả 7 endpoint **công khai** — không auth, không premium gate, không kiểm tra subscription. Nếu bản mới muốn gate thì đó là thay đổi sản phẩm, không phải chi tiết kỹ thuật.
- Path param có pattern chặt (`slug`: `^[a-zA-Z0-9._-]+$` ≤200; `news_id`: cùng pattern ≤100; `symbol`: `^[A-Z0-9]{1,10}$`) ⇒ không thể chèn `/`, `%`, khoảng trắng vào URL upstream. **Giữ nguyên các pattern này.**
- Query param (`ticker`, `topic`, `industry`, `source`) **không** validate — được URL-encode bởi httpx khi gửi upstream. Bản TS phải encode tương đương (dùng `URLSearchParams`, không nối chuỗi thủ công).
- Rate limit chỉ là default `60/minute` per IP với storage **`memory://`** ⇒ **không chia sẻ giữa nhiều instance**. Nếu triển khai nhiều pod, hạn mức thực tế là `60 × số pod`. Đây là điểm nên chuyển sang Redis store khi viết lại (hành vi mong đợi không đổi, chỉ chính xác hơn).
- Upstream `ai.vietcap.com.vn` là API công khai của bên thứ ba, không SLA. Discovery doc khuyến nghị "cache bảo thủ và rate limit" (`docs/vietcap-ai-news-api-discovery.md:33`).

### 13. Tham chiếu chương khác

- Chi tiết provider `ai.vietcap.com.vn` (đầy đủ endpoint upstream, tham số, shape thô): **chương 07, mục Vietcap AI News**; bản khảo sát gốc là `docs/vietcap-ai-news-api-discovery.md`.
- Cơ chế `redis_cached`, `build_cache_key`, TTL, `X-Cache`: **chương 08 — Cache**.
- Envelope `MarketDataResponse`, quy ước `X-Request-ID`, CORS, 429: **chương 02 — Quy ước API**.
- Bảng mã lỗi và shape body lỗi: **chương 04 — Lỗi và mã lỗi**.
- Biến môi trường `REDIS_*`, `RATE_LIMIT_*`, `APP_ENV`: **chương 05 — Cấu hình env**.
