# Market Data Source Map

> Generated from reverse-engineering `vnstock`, `vnstock_data`, and `vnstock_news` packages.
> This document maps every exposed API endpoint to its upstream source URL.
>
> **Last updated:** 2026-04-25
> **Legend:** ✅ Live & verified | ⚠️ Conditionally available

## 1. Reference Data (`/reference`)

| Endpoint | Primary Source | URL | Fallback | Status |
|---|---|---|---|---|
| `GET /reference/symbols` | VCI | `GET .../api/price/symbols/getAll` | VND | ✅ |
| `GET /reference/industries` | VCI | `GET .../iq-insight-service/v1/sectors/icb-codes` | — | ✅ |
| `GET /reference/indices` | STATIC | Static index mapping | — | ✅ |
| `GET /reference/groups/{group}/symbols` | VCI | `GET .../api/price/symbols/getByGroup?group={group}` | — | ✅ |

## 2. Quotes & Trading (`/quotes`, `/trading`)

| Endpoint | Primary Source | URL | Fallback | Status |
|---|---|---|---|---|
| `GET /quotes/{symbol}/ohlcv` | VND | `GET https://dchart-api.vndirect.com.vn/dchart/history?resolution={res}&symbol={sym}&from={ts}&to={ts}` | VCI | ✅ |
| `GET /quotes/{symbol}/intraday` | VCI | `POST .../api/market-watch/LEData/getAll` body: `{symbol, limit}` | — | ✅ ⚠️ empty outside trading hours |
| `GET /quotes/{symbol}/price-depth` | VCI | `POST .../api/market-watch/AccumulatedPriceStepVol/getSymbolData` body: `{symbol}` | — | ✅ ⚠️ empty outside trading hours |
| `POST /trading/price-board` | VCI | `POST .../api/price/symbols/getList` body: `{symbols: [...]}` | — | ✅ |
| `GET /trading/{symbol}/foreign-trade` | VCI | `GET .../iq-insight-service/v1/company/{symbol}/price-history?timeFrame=ONE_DAY&...` | — | ✅ |
| `GET /trading/{symbol}/insider-deals` | VCI | `GET .../iq-insight-service/v1/company/{symbol}/insider-transaction?page=0&size=100` | — | ✅ |
| `GET /trading/{symbol}/proprietary` | VCI | `GET .../iq-insight-service/v1/company/{symbol}/proprietary-history?fromDate=&toDate=&page=&size=&timeFrame=` | — | ✅ |
| `GET /trading/{symbol}/proprietary/summary` | VCI | `GET .../iq-insight-service/v1/company/{symbol}/proprietary-history-summary?fromDate=&toDate=&timeFrame=` | — | ✅ |

## 3. Company (`/company`) — KBS (KB Securities)

Data sourced from KB Securities (KBS) profile API. One profile request returns overview, shareholders, officers, and subsidiaries. News uses a separate endpoint.

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /company/{symbol}/overview` | KBS | `GET https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/{symbol}?l=1` | ✅ |
| `GET /company/{symbol}/shareholders` | KBS | Same profile endpoint | ✅ |
| `GET /company/{symbol}/officers` | KBS | Same profile endpoint | ✅ |
| `GET /company/{symbol}/subsidiaries` | KBS | Same profile endpoint | ✅ |
| `GET /company/{symbol}/news` | KBS | `GET .../stockinfo/news/{symbol}?l=1&p=1&s={size}` | ✅ |
| `GET /company/{symbol}/details` | VCI | `GET .../iq-insight-service/v1/company/details?ticker={symbol}` | ✅ |
| `GET /company/{symbol}/price-chart` | VCI | `GET .../iq-insight-service/v1/company/{symbol}/price-chart?lengthReport={n}` | ✅ |

> **Note:** The `/company/{symbol}/events` endpoint has been removed. The KBS events API (`stockinfo/event/{symbol}`) consistently returns empty data for most symbols, and the VCI GraphQL source (`data-mt/graphql`) is also down.

### KBS Profile Field Mapping

| Raw Key | Normalized Key | Description |
|---|---|---|
| SM | business_model | HTML description (tags stripped) |
| SB | symbol | Stock symbol |
| FD | founded_date | Company founding date |
| EX | exchange | Exchange (HOSE/HNX/UPCOM) |
| KLCPNY | charter_capital | **VND, exact** (= KLCPLH × FV) |
| KLCPLH | outstanding_shares | **Share count, exact** |
| FV | par_value | VND per share |
| LP | listing_price | VND (listing price) |
| CC | _(dropped)_ | Rounded charter cap in billions — imprecise |
| VL | _(dropped)_ | Rounded listed vol in millions — imprecise |
| SFV | _(dropped)_ | Duplicate of FV |
| CTP/CTPP | ceo_name/ceo_position | CEO info |
| ADD/PHONE/EMAIL/URL | address/phone/email/website | Contact info |
| HS | history | Company history (HTML stripped) |
| Shareholders[] | → name, date, shares_owned, ownership_percentage | |
| Leaders[] | → from_date, position, name, position_en, owner_code | |
| Subsidiaries[] | → date, name, charter_capital, ownership_percent, currency, type | type = subsidiary (>50%) or affiliate (≤50%) |

> **Invariant:** `charter_capital == outstanding_shares × par_value` (verified across VCB, FPT, VNM)

## 4. Fundamentals (`/fundamentals`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /fundamentals/{symbol}/balance_sheet` | VCI | `GET .../iq-insight-service/v1/company/{symbol}/financial-statement?type=BALANCE_SHEET` | ✅ |
| `GET /fundamentals/{symbol}/income_statement` | VCI | Same, `type=INCOME_STATEMENT` | ✅ |
| `GET /fundamentals/{symbol}/cash_flow` | VCI | Same, `type=CASH_FLOW` | ✅ |
| `GET /fundamentals/{symbol}/ratio` | VCI | `GET .../iq-insight-service/v1/company/{symbol}/statistics-financial-ratios` | ✅ |

## 5. Insights (`/insights`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /insights/ranking/{kind}` | VND | `GET https://api-finfo.vndirect.com.vn/v4/top_stocks?q=...&sort=...&size={limit}` | ✅ |

## 6. Events (`/events`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /events/calendar` | VCI | `GET .../iq-insight-service/v1/events?fromDate=...&toDate=...&eventType=...` | ✅ |

## 7. Macro Economy (`/macro/economy`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /macro/economy/{indicator}` | MBK | `POST https://data.maybanktrade.com.vn/data/reportdatatopbynormtype` (form-encoded) | ✅ |

Supported indicators: `gdp`, `cpi`, `fdi`, `exchange_rate`, `interest_rate`, `money_supply`, `industrial_production`, `export_import`, `retail`, `population_labor`

## 8. Commodities (`/macro/commodities`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /macro/commodities` | SPL | Static commodity mapping | ✅ |
| `GET /macro/commodities/{code}` | SPL | `GET https://api.simplize.vn/api/historical/prices/ohlcv` | ✅ |

## 9. Funds (`/funds`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /funds` | FMARKET | `POST https://api.fmarket.vn/res/products/filter` | ✅ |
| `GET /funds/{fund_id}` | FMARKET | `GET https://api.fmarket.vn/res/products/{fund_id}` | ✅ |
| `GET /funds/{fund_id}/nav` | FMARKET | `POST https://api.fmarket.vn/res/product/get-nav-history` | ✅ |

> **Note:** `fund_id` must be obtained from `GET /funds` listing response (`data[].fund_id`). Invalid `fund_id` returns HTTP 404.

## 10. News (`/news`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /news/sources` | STATIC | Static mapping | ✅ |
| `GET /news/latest` | RSS | RSS feeds from configured news sites | ✅ |

## 11. AI News (`/news/ai`)

| Endpoint | Primary Source | URL | Status |
|---|---|---|---|
| `GET /news/ai` | AI.VCI | `GET https://ai.vietcap.com.vn/api/v3/news_info` | ✅ |
| `GET /news/ai?kind=topic` | AI.VCI | `GET .../api/v3/topics_info` | ✅ |
| `GET /news/ai?kind=exchange` | AI.VCI | `GET .../api/v3/xnews_info` | ✅ |
| `GET /news/ai/detail/{slug}` | AI.VCI | `GET .../api/v3/news_from_slug?slug={slug}` | ✅ |
| `GET /news/ai/audio/{news_id}` | AI.VCI | `GET .../api/audio_from_id?id={news_id}` | ✅ |
| `GET /news/ai/catalogs` | AI.VCI | Multiple endpoints (topics, sources, industries, tickers) | ✅ partial |
| `GET /news/ai/tickers/{symbol}` | AI.VCI | Combined: ticker_score + news_info + xnews_info | ✅ partial |

> **Error semantics:** `AINewsNotFoundError` → 404, `AINewsUpstreamShapeError` → 502, `AINewsUpstreamError` → 503. Catalogs/ticker endpoints return `partial=true` + `warnings` on partial failures.

## 12. Market Overview (`/overview`)

Data sourced from Vietcap IQ Market Overview page. All endpoints are public, no auth required.

| Endpoint | Primary Source | Upstream URL | Status |
|---|---|---|---|
| `GET /overview/liquidity` | VCI | `POST .../api/chart/v3/OHLCChart/gap-liquidity` | ✅ |
| `GET /overview/index-impact` | VCI | `POST .../api/market-watch/v2/IndexImpactChart/getData` | ✅ |
| `GET /overview/foreign` | VCI | `POST .../api/market-watch/v3/ForeignVolumeChart/getAll` | ✅ |
| `GET /overview/foreign/top` | VCI | `POST .../api/market-watch/v3/ForeignNetValue/top` | ✅ |
| `GET /overview/proprietary` | VCI | `GET .../api/fiin-api-service/v3/proprietary-trading-value` | ✅ |
| `GET /overview/proprietary/top` | IQ.VCI | `GET .../api/iq-insight-service/v1/market-watch/top-proprietary` | ✅ |
| `GET /overview/allocation` | VCI | `POST .../api/market-watch/AllocatedValue/getAllocatedValue` | ✅ |
| `GET /overview/sectors/allocation` | VCI | `POST .../api/market-watch/AllocatedICB/getAllocated` | ✅ |
| `GET /overview/valuation` | VCI | `GET .../api/iq-insight-service/v1/market-watch/index-valuation` | ✅ |
| `GET /overview/breadth` | IQ.VCI | `GET .../api/iq-insight-service/v1/market-watch/breadth` | ✅ |
| `GET /overview/heatmap` | VCI | `POST .../api/market-watch/HeatMapChart/getByIcb` | ✅ |
| `GET /overview/heatmap/index` | VCI | `GET .../api/market-watch/HeatMapChart/getIndex` | ✅ |
| `GET /overview/sectors/detail` | VCI | `POST .../api/market-watch/AllocatedICB/getAllocatedDetail` | ✅ |
| `GET /overview/stock-strength` | IQ.VCI | `GET .../api/iq-insight-service/v1/ta/stock-strength?exchange=` | ✅ |
| `GET /overview/market-index` | VCI | `POST .../api/price/marketIndex/getList` | ✅ |
| `GET /overview/maintenance` | IQ.VCI | `GET .../api/iq-insight-service/v1/notification?type=maintenance` | ✅ |

## 13. Reference Data Supplement

| Endpoint | Primary Source | Upstream URL | Status |
|---|---|---|---|
| `GET /reference/search` | IQ.VCI | `GET .../api/iq-insight-service/v2/company/search-bar?language=` | ✅ |
| `GET /reference/event-codes` | IQ.VCI | `GET .../api/iq-insight-service/v1/event-codes` | ✅ |

> **Units:** `*Value` fields = VND, `accumulatedValue` (liquidity) = million VND, `*Volume` = shares. Valuation `value` = ratio. Breadth `percent` = 0-1 ratio.

> **Enum params:** All enum parameters (group, timeFrame, condition, sector, size, type, comGroupCode) are validated server-side → 422 on invalid values.

## Source Headers

| Source | Referer | Origin |
|---|---|---|
| VCI | `https://trading.vietcap.com.vn/` | `https://trading.vietcap.com.vn` |
| VND | `https://mkw.vndirect.com.vn` | `https://mkw.vndirect.com.vn` |
| KBS | `https://kbbuddywts.kbsec.com.vn/6d054136-b880-4c8b-887b-90311120d1c4` | `https://kbbuddywts.kbsec.com.vn` |
| MBK | `https://data.maybanktrade.com.vn` | `https://data.maybanktrade.com.vn` |
| AI.VCI | `https://ai.vietcap.com.vn` | — |
| IQ.VCI | `https://iq.vietcap.com.vn` | — |
| FMARKET | — | — |
| SPL | — | — |

All sources use browser-mimicking `DEFAULT_HEADERS` matching vnstock's `user_agent.py` defaults.
