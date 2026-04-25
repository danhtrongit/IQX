# Vietcap AI News API Discovery

> Reverse-engineered from Playwright network inspection of `https://trading.vietcap.com.vn/ai-news?exchange=hose`.
>
> **Last updated:** 2026-04-25
> **Base API:** `https://ai.vietcap.com.vn`
> **Web referer observed:** `https://trading.vietcap.com.vn/`
> **Legend:** ✅ live verified | ⚠️ observed but behavior may vary by filters/data availability

## 1. Summary

Vietcap AI News exposes unauthenticated JSON endpoints for:

- **Tin Doanh Nghiệp**: company/business news with ticker, sentiment, score, source, summary, and audio durations.
- **Tin Chủ Đề**: thematic news by topic key such as market movement, gold, FX, crypto, oil, commodities, agriculture, bonds.
- **Tin từ Sở**: exchange/disclosure news from venues such as HNX, with attachments on detail.
- **Tin theo mã**: ticker-specific business news, exchange news, and sentiment summary.
- **Chi tiết tin**: full HTML content fetched by `slug`, not by `id`.
- **Voice/audio**: male/female `.m4a` URLs fetched by news `id`.

No auth token or cookie was required in the observed browser session. Requests used browser-like headers and `Accept: application/json`.

## 2. Common Headers

Observed list/detail/audio endpoints work with minimal browser-style headers:

```http
Accept: application/json
Referer: https://trading.vietcap.com.vn/
User-Agent: <browser user agent>
```

For backend integration, use conservative caching and rate limiting because this is a third-party public web API.

## 3. Filter Model

| UI filter | Query parameter | Values / format | Notes |
|---|---|---|---|
| Page | `page` | 1-based integer | `page=1` on all list endpoints. |
| Page size | `page_size` | integer | Home used `12` for business/topic and `18` for exchange; detail related news used `5`. |
| Date from | `update_from` | `YYYY-MM-DD` or empty | Home default was one month back: `2026-03-25`. Company page used one year back. |
| Date to | `update_to` | `YYYY-MM-DD` or empty | Home default was current date: `2026-04-25`. |
| Ticker | `ticker` | Uppercase symbol or empty | Example: `VIC`, `HDB`. |
| Industry | `industry` | Industry slug or empty | Values come from `GET /api/get_industry_info`. |
| Topic | `topic` | Topic key or empty | Values come from `GET /api/v3/topics_all`. |
| Source | `newsfrom` | Source key or empty | Values come from `GET /api/v3/get_source_info?language=vi`. |
| Nhận định | `sentiment` | `Positive`, `Neutral`, `Negative`, or empty | UI labels: Tích cực, Trung lập, Tiêu cực. |
| Language | `language` | `vi` | Only Vietnamese flow was inspected. |

## 4. Tin Doanh Nghiệp

### List Endpoint

```http
GET https://ai.vietcap.com.vn/api/v3/news_info
```

Observed home request:

```http
GET /api/v3/news_info?page=1&ticker=&industry=&update_from=2026-03-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

Ticker-specific request observed on detail/company pages:

```http
GET /api/v3/news_info?page=1&ticker=HDB&industry=&update_from=&update_to=&sentiment=&newsfrom=&language=vi&page_size=5
GET /api/v3/news_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

Filtered example verified:

```http
GET /api/v3/news_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=Positive&newsfrom=fireant&language=vi&page_size=2
```

### Response Shape

```json
{
  "total_records": 3466,
  "name": "",
  "news_info": [
    {
      "id": "a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903",
      "ticker": "HDB",
      "industry": "Ngân hàng",
      "news_title": "HDB: ĐHĐCĐ HDBank 2026: ...",
      "news_short_content": "Ngân hàng TMCP Phát triển TP.HCM ...",
      "news_source_link": "https://diendandoanhnghiep.vn/...",
      "news_image_url": "https://...",
      "update_date": "2026-04-25 10:05:00",
      "news_from": "diendandoanhnghiep",
      "news_from_name": "Tạp chí Diễn đàn Doanh nghiệp",
      "sentiment": "Positive",
      "score": 9.75,
      "slug": "hdb-dhdcd-hdbank-2026-loi-nhuan-ke-hoach-tang-41-quy-mo-tiem-can-1-2-trieu-ty-dong",
      "male_audio_duration": 391.488,
      "female_audio_duration": 417.536
    }
  ]
}
```

### Field Notes

| Field | Meaning |
|---|---|
| `id` | Stable news id; use for audio lookup. |
| `slug` | Required for detail lookup. Detail-by-id candidates returned 404. |
| `sentiment` | `Positive`, `Neutral`, `Negative`. |
| `score` | Numeric sentiment score, e.g. `9.75`. |
| `male_audio_duration`, `female_audio_duration` | Seconds; audio URLs are fetched separately. |

## 5. Tin Chủ Đề

### Topic Catalog

```http
GET https://ai.vietcap.com.vn/api/v3/topics_all?language=vi
```

Verified response contains `static_topic[]`, each with `name`, `key`, and top `news[]`.

Observed topic keys:

| Name | Key |
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

### Topic List Endpoint

```http
GET https://ai.vietcap.com.vn/api/v3/topics_info
```

Observed home request:

```http
GET /api/v3/topics_info?page=1&topic=&industry=&update_from=2026-03-25&update_to=2026-04-25&sentiment=&newsfrom=&page_size=12&language=vi
```

Filtered topic example verified:

```http
GET /api/v3/topics_info?page=1&topic=gia-vang&industry=&update_from=2026-03-25&update_to=2026-04-25&sentiment=&newsfrom=&page_size=2&language=vi
```

### Response Differences vs Business News

The response shape is the same as `news_info`, with two practical differences:

- `ticker` is usually the topic key, e.g. `gia-vang`, `xang-dau`.
- Items include `topic_name`, e.g. `Giá vàng`, `Xăng dầu`.

Example item:

```json
{
  "id": "486ba43cedfe5adf2659666f6f37a679d26a6808d2744ab402fa3f381136a3bb",
  "ticker": "gia-vang",
  "industry": "OTHER",
  "news_title": "Giá vàng sáng 25/4 hồi phục nhẹ, vàng miếng SJC tăng 800.000 đồng",
  "news_from": "fireant",
  "news_from_name": "FireAnt",
  "sentiment": "",
  "score": 0,
  "slug": "gia-vang-sang-25-4-hoi-phuc-nhe-vang-mieng-sjc-tang-800000-dong",
  "topic_name": "Giá vàng"
}
```

## 6. Tin từ Sở / Exchange News

### List Endpoint

```http
GET https://ai.vietcap.com.vn/api/v3/xnews_info
```

Observed home/exchange request:

```http
GET /api/v3/xnews_info?page=1&page_size=18&language=vi&newsfrom=&update_from=2026-03-25&update_to=2026-04-25
```

Ticker-specific request observed on company page:

```http
GET /api/v3/xnews_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

### Response Shape

```json
{
  "total_records": 10676,
  "name": "",
  "news_info": [
    {
      "id": "52ee25bb706a1f098139d80b26830c55090c44cc4a77c93e58360fc792f6317b",
      "ticker": "SGB",
      "news_title": "SGB: Báo cáo tài chính quý 1/2026",
      "news_source_link": "https://hnx.vn/vi-vn/m-tin-tuc-hnx/tintuc-611277-1.html",
      "update_date": "2026-04-24 17:12:00",
      "news_from": "HNX",
      "slug": "sgb-bao-cao-tai-chinh-quy-1-2026-17770255200-2-1"
    }
  ]
}
```

Exchange list rows are thinner than business/topic rows. Fetch detail by `slug` to get company name, attachments, full content, and `news_type`.

### Exchange Detail Example

```http
GET /api/v3/news_from_slug?slug=sgb-bao-cao-tai-chinh-quy-1-2026-17770255200-2-1&language=vi
```

Verified detail fields include:

```json
{
  "id": "52ee25bb706a1f098139d80b26830c55090c44cc4a77c93e58360fc792f6317b",
  "ticker": "SGB",
  "company_name": "Ngân hàng Thương mại Cổ phần Sài Gòn Công thương",
  "industry": "Ngân hàng",
  "news_title": "SGB: Báo cáo tài chính quý 1/2026",
  "news_short_content": "Báo cáo tài chính quý 1/2026",
  "news_full_content": "<p>.</p>",
  "file_attachment": [
    {
      "text": "1. SGB_2026.4.24_2a7c780_EN__Consolidated_Financial_Statements_Q12026_signed.pdf",
      "url": "https://owa.hnx.vn/ftp///cims/2026/4_W4/000000016196688_EN__Consolidated_Financial_Statements_Q12026_signed.pdf"
    }
  ],
  "news_from": "HNX",
  "news_type": "exchange_news",
  "news_from_name": "HNX"
}
```

## 7. Tin theo mã / Company News

Company pages combine three API families:

### 7.1 Ticker Sentiment Summary

```http
GET https://ai.vietcap.com.vn/api/v3/ticker_score?ticker=VIC&industry=&group=&summary=false&language=vi
```

Verified fields under `ticker_info[]`:

| Field | Meaning |
|---|---|
| `ticker` | Symbol. |
| `cnt_news` | News count in the summary window. |
| `score` | Current sentiment score. |
| `sentiment` | Current sentiment class. |
| `logo` | Ticker logo URL. |
| `news_from[]` | Source article ids, source names, source URLs, and slugs. |
| `count_pos`, `count_neu`, `count_neg` | Sentiment distribution. |
| `extractive_summaries[]` | Per-article extracted summaries. |
| `extractive_sentiments[]` | Per-summary sentiment labels. |
| `extractive_positions[]` | Highlighted positive/negative phrases. |
| `organ_name` | Vietnamese company name. |
| `hose`, `vn30`, `vn_midcap`, `vn_smallcap`, `vn100` | Index/group flags observed in response. |

`summary=true` returned an empty `ticker_info` array for `VIC` during inspection; use `summary=false` unless re-verified.

### 7.2 Business News by Ticker

```http
GET /api/v3/news_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

### 7.3 Exchange News by Ticker

```http
GET /api/v3/xnews_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

## 8. Detail Content

### Endpoint

```http
GET https://ai.vietcap.com.vn/api/v3/news_from_slug?slug={slug}&language=vi
```

Use `slug` from any list endpoint. Detail lookups by `id` were tested with several guessed endpoint names and returned `404`; the frontend uses `news_from_slug`.

### Business Detail Example

```http
GET /api/v3/news_from_slug?slug=hdb-dhdcd-hdbank-2026-loi-nhuan-ke-hoach-tang-41-quy-mo-tiem-can-1-2-trieu-ty-dong&language=vi
```

Verified response fields:

```json
{
  "id": "a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903",
  "ticker": "HDB",
  "company_name": "Ngân hàng Thương mại Cổ phần Phát Triển Thành phố Hồ Chí Minh",
  "industry": "Ngân hàng",
  "news_title": "HDB: ĐHĐCĐ HDBank 2026: ...",
  "news_short_content": "Ngân hàng TMCP Phát triển TP.HCM ...",
  "summary": "ĐHĐCĐ HDBank 2026 đã thông qua kế hoạch ...",
  "highlight_position": "lợi nhuận trước thuế tăng 41% lên trên 30.100 tỷ đồng",
  "news_full_content": "<p><strong>...</strong></p>...",
  "file_attachment": [],
  "news_source_link": "https://diendandoanhnghiep.vn/...",
  "news_image_url": "https://...",
  "update_date": "2026-04-25 10:05:00",
  "news_from": "diendandoanhnghiep",
  "sentiment": "Positive",
  "score": 9.75,
  "slug": "hdb-dhdcd-hdbank-2026-loi-nhuan-ke-hoach-tang-41-quy-mo-tiem-can-1-2-trieu-ty-dong",
  "male_audio_duration": 391.488,
  "female_audio_duration": 417.536,
  "news_type": "stock_news",
  "news_from_name": "Tạp chí Diễn đàn Doanh nghiệp"
}
```

`news_full_content` is HTML and can include paragraphs, figures, images, and captions. Exchange disclosures may have `file_attachment[]` PDF links and minimal HTML content.

## 9. Voice / Audio

### Endpoint

```http
GET https://ai.vietcap.com.vn/api/audio_from_id?id={news_id}
```

Use `id` from list or detail response.

Verified example:

```http
GET /api/audio_from_id?id=a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903
```

Response:

```json
{
  "male": "https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/male/a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903.m4a",
  "female": "https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/female/a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903.m4a"
}
```

Notes:

- List/detail responses already provide `male_audio_duration` and `female_audio_duration` in seconds.
- Exchange news can show duration `0`; the audio endpoint still returned URL-shaped values for tested ids, but file existence/playability should be checked before exposing audio links.
- The S3 URL path is predictable from `{voice}/{id}.m4a`, but backend should call `audio_from_id` rather than constructing URLs directly.

## 10. Reference Data Endpoints

### Sources

```http
GET https://ai.vietcap.com.vn/api/v3/get_source_info?language=vi
```

Observed source values:

| viName | value |
|---|---|
| Tất cả nguồn | `` |
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

### Industries

```http
GET https://ai.vietcap.com.vn/api/get_industry_info
```

Observed industry values:

| viName | value |
|---|---|
| Tất cả ngành | `` |
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

### Top Tickers

```http
GET https://ai.vietcap.com.vn/api/v2/get_top_tickers?industry=&group=hose&top_neg=5&top_pos=5
```

Observed home page uses this endpoint to populate top positive/negative tickers.

Response shape:

```json
{
  "record_count": 10,
  "ticker_info": [
    {
      "ticker": "VIC",
      "score": 9.21,
      "logo": "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/VIC.jpeg",
      "sentiment": "Positive",
      "organ_name": "Tập đoàn Vingroup - Công ty CP"
    }
  ]
}
```

Observed `group=hose`; UI also has buttons for `VN30`, `VNMidCap`, `VNSmallCap`, `VN100`, `HNX`, `HNX30`, and `UpCom`, but exact group query values beyond `hose` were not re-verified in this pass.

## 11. Supporting Non-News Endpoints Observed

These are not required for AI News content but are used by the page UI:

| Purpose | Endpoint |
|---|---|
| Company search bar | `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/search-bar?language=1` |
| Price cards for symbols | `POST https://trading.vietcap.com.vn/api/price/symbols/getList` body `{"symbols":[...]}` |
| Market status | `GET https://trading.vietcap.com.vn/api/price/marketStatus/getAll` |
| App config | `GET https://trading.vietcap.com.vn/api/configuration-service/v1/non-authen/app-config?t={timestamp}` |

## 12. Backend Data Mapping Candidates

| Backend concept | Upstream source | Key fields |
|---|---|---|
| News list item | `news_info`, `topics_info`, `xnews_info` | `id`, `slug`, `ticker`, `news_title`, `news_short_content`, `news_source_link`, `news_image_url`, `update_date`, `news_from`, `news_from_name`, `sentiment`, `score`, `topic_name` |
| News detail | `news_from_slug` | list fields plus `company_name`, `summary`, `highlight_position`, `news_full_content`, `file_attachment`, `news_type` |
| News audio | `audio_from_id` | `male`, `female`, plus durations from list/detail |
| Topic catalog | `topics_all` | `static_topic[].name`, `static_topic[].key` |
| Source filter | `get_source_info` | `viName`, `enName`, `value` |
| Industry filter | `get_industry_info` | `viName`, `enName`, `value` |
| Ticker sentiment | `ticker_score` | `score`, `sentiment`, `count_pos`, `count_neu`, `count_neg`, `extractive_summaries`, `extractive_sentiments`, `extractive_positions` |

## 13. Important Implementation Notes

- Fetch detail by `slug`, not `id`.
- Fetch audio by `id`, not `slug`.
- Keep `news_full_content` as sanitized HTML or convert to plain text at the API boundary.
- Normalize `update_date` from local string format `YYYY-MM-DD HH:mm:ss`.
- Treat `sentiment=""` and `score=0` as unavailable/neutral only if the product decision says so; topic/exchange items often have blank sentiment.
- Preserve `file_attachment[]` for exchange news because the PDF attachments can be the main payload.
- Cache source/topic/industry catalogs; they are small and change slowly.
- Cache news list/detail/audio metadata with short TTLs; the page is news-like and changes frequently.
