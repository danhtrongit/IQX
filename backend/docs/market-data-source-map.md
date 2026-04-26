# Bản đồ nguồn dữ liệu thị trường

> Tổng quan ngắn gọn: ánh xạ mỗi nhóm endpoint sang nguồn upstream (URL/host).
> Chi tiết về mapping field, enum, ví dụ payload nằm trong các tài liệu chuyên đề ở phần dưới.
>
> **Cập nhật lần cuối:** 2026-04-26
> **Chú thích:** ✅ Live & đã xác minh | ⚠️ Có dữ liệu nhưng phụ thuộc bộ lọc/thời điểm

## 1. Tham chiếu (`/reference`)

| Endpoint | Nguồn chính | Fallback | Trạng thái |
|---|---|---|---|
| `GET /reference/symbols` | VCI | VND | ✅ |
| `GET /reference/industries` | VCI | — | ✅ |
| `GET /reference/indices` | STATIC | — | ✅ |
| `GET /reference/groups/{group}/symbols` | VCI | — | ✅ |
| `GET /reference/search` | IQ.VCI | — | ✅ |
| `GET /reference/event-codes` | IQ.VCI | — | ✅ |

## 2. Báo giá & Giao dịch (`/quotes`, `/trading`)

| Endpoint | Nguồn chính | Fallback | Trạng thái |
|---|---|---|---|
| `GET /quotes/{symbol}/ohlcv` | VND | VCI | ✅ |
| `GET /quotes/{symbol}/intraday` | VCI | — | ✅ ⚠️ rỗng ngoài phiên |
| `GET /quotes/{symbol}/price-depth` | VCI | — | ✅ ⚠️ rỗng ngoài phiên |
| `POST /trading/price-board` | VCI | — | ✅ |
| `GET /trading/{symbol}/foreign-trade` | VCI | — | ✅ |
| `GET /trading/{symbol}/insider-deals` | VCI | — | ✅ |
| `GET /trading/{symbol}/proprietary` | VCI | — | ✅ |
| `GET /trading/{symbol}/proprietary/summary` | VCI | — | ✅ |

> Chi tiết field nước ngoài/tự doanh/nội bộ/cung cầu: xem [`company-statistics-api-map.md`](./company-statistics-api-map.md).

## 3. Doanh nghiệp (`/company`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /company/{symbol}/overview` | KBS | ✅ |
| `GET /company/{symbol}/shareholders` | KBS | ✅ |
| `GET /company/{symbol}/officers` | KBS | ✅ |
| `GET /company/{symbol}/subsidiaries` | KBS | ✅ |
| `GET /company/{symbol}/news` | KBS | ✅ |
| `GET /company/{symbol}/details` | VCI | ✅ |
| `GET /company/{symbol}/price-chart` | VCI | ✅ |

> **Lưu ý:** Endpoint `/company/{symbol}/events` đã được gỡ bỏ vì nguồn KBS thường trả về rỗng và VCI GraphQL không khả dụng.

## 4. Báo cáo tài chính (`/fundamentals`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /fundamentals/{symbol}/balance_sheet` | VCI | ✅ |
| `GET /fundamentals/{symbol}/income_statement` | VCI | ✅ |
| `GET /fundamentals/{symbol}/cash_flow` | VCI | ✅ |
| `GET /fundamentals/{symbol}/ratio` | VCI | ✅ |

## 5. Phân tích (`/insights`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /insights/ranking/{kind}` | VND | ✅ |

## 6. Sự kiện (`/events`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /events/calendar` | VCI | ✅ |

## 7. Vĩ mô (`/macro/economy`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /macro/economy/{indicator}` | MBK | ✅ |

Các chỉ báo hỗ trợ: `gdp`, `cpi`, `fdi`, `exchange_rate`, `interest_rate`, `money_supply`, `industrial_production`, `export_import`, `retail`, `population_labor`.

## 8. Hàng hóa (`/macro/commodities`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /macro/commodities` | SPL (static) | ✅ |
| `GET /macro/commodities/{code}` | SPL | ✅ |

## 9. Quỹ (`/funds`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /funds` | FMARKET | ✅ |
| `GET /funds/{fund_id}` | FMARKET | ✅ |
| `GET /funds/{fund_id}/nav` | FMARKET | ✅ |

> `fund_id` lấy từ kết quả `GET /funds` (`data[].fund_id`). `fund_id` không hợp lệ trả về 404.

## 10. Tin tức (`/news`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /news/sources` | STATIC | ✅ |
| `GET /news/latest` | RSS | ✅ |

## 11. Tin AI (`/news/ai`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /news/ai` | AI.VCI | ✅ |
| `GET /news/ai/detail/{slug}` | AI.VCI | ✅ |
| `GET /news/ai/audio/{news_id}` | AI.VCI | ✅ |
| `GET /news/ai/catalogs` | AI.VCI | ✅ partial |
| `GET /news/ai/tickers/{symbol}` | AI.VCI | ✅ partial |

> Lỗi: `AINewsNotFoundError` → 404, `AINewsUpstreamShapeError` → 502, `AINewsUpstreamError` → 503. `catalogs` và `tickers` trả về `partial=true` + `warnings` khi có nguồn con bị lỗi.

## 12. Tổng quan thị trường (`/overview`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /overview/liquidity` | VCI | ✅ |
| `GET /overview/index-impact` | VCI | ✅ |
| `GET /overview/foreign` | VCI | ✅ |
| `GET /overview/foreign/top` | VCI | ✅ |
| `GET /overview/proprietary` | VCI | ✅ |
| `GET /overview/proprietary/top` | IQ.VCI | ✅ |
| `GET /overview/allocation` | VCI | ✅ |
| `GET /overview/sectors/allocation` | VCI | ✅ |
| `GET /overview/sectors/detail` | VCI | ✅ |
| `GET /overview/valuation` | VCI | ✅ |
| `GET /overview/breadth` | IQ.VCI | ✅ |
| `GET /overview/heatmap` | VCI | ✅ |
| `GET /overview/heatmap/index` | VCI | ✅ |
| `GET /overview/stock-strength` | IQ.VCI | ✅ |
| `GET /overview/market-index` | VCI | ✅ |
| `GET /overview/maintenance` | IQ.VCI | ✅ |

> Chi tiết payload, enum, đơn vị: xem [`vietcap-market-overview-api.md`](./vietcap-market-overview-api.md) và [`vietcap-market-overview-api-supplement.md`](./vietcap-market-overview-api-supplement.md).

## 13. Ngành (`/sectors`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /sectors/trading-dates` | IQ.VCI | ✅ |
| `GET /sectors/ranking` | IQ.VCI | ✅ |
| `GET /sectors/information` | IQ.VCI | ✅ |

> Chi tiết payload, enum, đơn vị: xem [`vietcap-sector-api.md`](./vietcap-sector-api.md).

## 14. Bộ lọc cổ phiếu (`/screening`)

| Endpoint | Nguồn chính | Trạng thái |
|---|---|---|
| `GET /screening/criteria` | IQ.VCI | ✅ |
| `POST /screening/search` | IQ.VCI | ✅ |
| `GET /screening/presets` | IQ.VCI | ✅ |

> Chi tiết tiêu chí, bộ lọc mặc định, payload: xem [`vietcap-screening-api.md`](./vietcap-screening-api.md).

## Header chung khi gọi nguồn upstream

| Nguồn | Referer | Origin |
|---|---|---|
| VCI | `https://trading.vietcap.com.vn/` | `https://trading.vietcap.com.vn` |
| VND | `https://mkw.vndirect.com.vn` | `https://mkw.vndirect.com.vn` |
| KBS | `https://kbbuddywts.kbsec.com.vn/...` | `https://kbbuddywts.kbsec.com.vn` |
| MBK | `https://data.maybanktrade.com.vn` | `https://data.maybanktrade.com.vn` |
| AI.VCI | `https://ai.vietcap.com.vn` | — |
| IQ.VCI | `https://iq.vietcap.com.vn` | — |
| FMARKET | — | — |
| SPL | — | — |

## Tài liệu chuyên đề

| File | Phạm vi |
|---|---|
| [`company-statistics-api-map.md`](./company-statistics-api-map.md) | Trang Thống kê công ty: nước ngoài, tự doanh, nội bộ, cung cầu (chi tiết field) |
| [`vietcap-market-overview-api.md`](./vietcap-market-overview-api.md) | Trang Tổng quan thị trường: thanh khoản, index impact, foreign, proprietary, allocation, valuation, breadth, heatmap |
| [`vietcap-market-overview-api-supplement.md`](./vietcap-market-overview-api-supplement.md) | Bổ sung Market Overview: chi tiết ngành, stock strength, market index, search bar, event codes, maintenance |
| [`vietcap-sector-api.md`](./vietcap-sector-api.md) | Trang Ngành: xếp hạng, thông tin ngành |
| [`vietcap-screening-api.md`](./vietcap-screening-api.md) | Trang Bộ lọc cổ phiếu: tiêu chí, paging, preset |
| [`vietcap-ai-news-api-discovery.md`](./vietcap-ai-news-api-discovery.md) | API tin AI Vietcap: business/topic/exchange, detail, audio, ticker view |
