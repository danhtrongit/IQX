# Company Statistics API Map

> Reverse-engineered from Vietcap IQ Company page (`/iq/company?tab=information&ticker={TICKER}`)
> under the **Thống Kê** (Statistics) tab.
>
> **Source page:** `https://trading.vietcap.com.vn/iq/company?tab=information&ticker={TICKER}&isIndex=false`
> **Last updated:** 2026-04-25
> **Legend:** ✅ Live & verified

## Base URL

All endpoints use `https://iq.vietcap.com.vn` as the base URL.

## Common Parameters

| Parameter | Type | Description |
|---|---|---|
| `fromDate` | `YYYYMMDD` | Start date (e.g. `20250425`) |
| `toDate` | `YYYYMMDD` | End date (e.g. `20260425`) |
| `page` | int | 0-indexed page number |
| `size` | int | Items per page (default `50`) |
| `timeFrame` | enum | `ONE_DAY`, `ONE_WEEK`, `ONE_MONTH`, `ONE_QUARTER`, `ONE_YEAR` |

> **UI mapping:** D → `ONE_DAY`, W → `ONE_WEEK`, M → `ONE_MONTH`, Q → `ONE_QUARTER`, Y → `ONE_YEAR`

---

## 1. Nước ngoài (Foreign Trading)

Uses the **price-history** endpoint. Foreign data fields are embedded in the same response as price history data.

| Endpoint | URL | Status |
|---|---|---|
| Foreign history (paginated) | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history?fromDate={}&toDate={}&page={}&size={}&timeFrame={}` | ✅ |
| Foreign summary | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history-summary?fromDate={}&toDate={}&timeFrame={}` | ✅ |

### Response Fields — Foreign (in `price-history` items)

| Field | Unit | Description |
|---|---|---|
| `foreignBuyVolumeMatched` | shares | Foreign buy volume (matched orders) |
| `foreignBuyValueMatched` | VND | Foreign buy value (matched orders) |
| `foreignSellVolumeMatched` | shares | Foreign sell volume (matched orders) |
| `foreignSellValueMatched` | VND | Foreign sell value (matched orders) |
| `foreignBuyVolumeDeal` | shares | Foreign buy volume (deal/block trades) |
| `foreignBuyValueDeal` | VND | Foreign buy value (deal/block trades) |
| `foreignSellVolumeDeal` | shares | Foreign sell volume (deal/block trades) |
| `foreignSellValueDeal` | VND | Foreign sell value (deal/block trades) |
| `foreignBuyVolumeTotal` | shares | Foreign buy volume total (matched + deal) |
| `foreignBuyValueTotal` | VND | Foreign buy value total |
| `foreignSellVolumeTotal` | shares | Foreign sell volume total |
| `foreignSellValueTotal` | VND | Foreign sell value total |
| `foreignNetVolumeTotal` | shares | Net foreign volume (buy − sell, total) |
| `foreignNetValueTotal` | VND | Net foreign value (buy − sell, total) |
| `foreignNetVolumeMatched` | shares | Net foreign volume (matched only) |
| `foreignNetValueMatched` | VND | Net foreign value (matched only) |
| `foreignNetVolumeDeal` | shares | Net foreign volume (deal only) |
| `foreignNetValueDeal` | VND | Net foreign value (deal only) |
| `foreignTotalRoom` | shares | Maximum foreign ownership room |
| `foreignCurrentRoom` | shares | Current available room |
| `foreignRoomPercentage` | ratio | Max foreign ownership ratio (e.g. `0.49` = 49%) |
| `foreignOwnedPercentage` | ratio | Current foreign ownership ratio |
| `foreignAvailablePercentage` | ratio | Available room ratio |
| `foreignOwned` | shares | Total shares owned by foreign investors |

### Response Fields — Foreign Summary (in `price-history-summary`)

| Field | Unit | Description |
|---|---|---|
| `foreignBuyVolumeTotal` / `foreignBuyValueTotal` | shares / VND | Total foreign buy in period |
| `foreignSellVolumeTotal` / `foreignSellValueTotal` | shares / VND | Total foreign sell in period |
| `foreignNetVolumeTotal` / `foreignNetValueTotal` | shares / VND | Net foreign in period |
| `foreignBuyVolumeTotalAvg` / `foreignBuyValueTotalAvg` | shares / VND | Daily average foreign buy |
| `foreignSellVolumeTotalAvg` / `foreignSellValueTotalAvg` | shares / VND | Daily average foreign sell |
| `foreignNetVolumeTotalAvg` / `foreignNetValueTotalAvg` | shares / VND | Daily average net foreign |
| `foreign*Matched*` / `foreign*Deal*` | — | Same breakdown for matched & deal |

---

## 2. Tự doanh (Proprietary Trading)

Dedicated endpoint for proprietary (self-trading) data from securities firms.

| Endpoint | URL | Status |
|---|---|---|
| Proprietary history (paginated) | `GET .../api/iq-insight-service/v1/company/{ticker}/proprietary-history?fromDate={}&toDate={}&page={}&size={}&timeFrame={}` | ✅ |
| Proprietary summary | `GET .../api/iq-insight-service/v1/company/{ticker}/proprietary-history-summary?fromDate={}&toDate={}&timeFrame={}` | ✅ |

### Response Fields — Proprietary History

| Field | Unit | Description |
|---|---|---|
| `ticker` | string | Stock symbol |
| `tradingDate` | ISO datetime | Trading date |
| `totalBuyTradeVolume` | shares | Proprietary buy volume (total) |
| `totalBuyTradeValue` | VND | Proprietary buy value (total) |
| `percentBuyTradeVolume` | ratio | Buy volume as % of market volume |
| `percentBuyTradeValue` | ratio | Buy value as % of market value |
| `totalSellTradeVolume` | shares | Proprietary sell volume (total) |
| `totalSellTradeValue` | VND | Proprietary sell value (total) |
| `percentSellTradeVolume` | ratio | Sell volume as % of market volume |
| `percentSellTradeValue` | ratio | Sell value as % of market value |
| `totalTradeNetVolume` | shares | Net volume (buy − sell, total) |
| `totalTradeNetValue` | VND | Net value (buy − sell, total) |
| `totalMatchBuyTradeVolume` / `Value` | shares / VND | Matched buy breakdown |
| `totalMatchSellTradeVolume` / `Value` | shares / VND | Matched sell breakdown |
| `totalMatchTradeNetVolume` / `Value` | shares / VND | Matched net breakdown |
| `totalDealBuyTradeVolume` / `Value` | shares / VND | Deal buy breakdown |
| `totalDealSellTradeVolume` / `Value` | shares / VND | Deal sell breakdown |
| `totalDealTradeNetVolume` / `Value` | shares / VND | Deal net breakdown |
| `totalVolume` | shares | Total market volume (for % calculation) |
| `totalValue` | VND | Total market value (for % calculation) |
| `updateDate` | ISO datetime | Last data update time |

### Response Fields — Proprietary Summary

Same field structure as history, with aggregated totals for the selected date range.

---

## 3. Nội bộ (Insider Trading)

Insider/director dealing transactions. No `fromDate`/`toDate` or `timeFrame` params — returns all recent transactions.

| Endpoint | URL | Status |
|---|---|---|
| Insider transactions (paginated) | `GET .../api/iq-insight-service/v1/company/{ticker}/insider-transaction?page={}&size={}` | ✅ |

### Response Fields — Insider Transaction

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique transaction ID |
| `organCode` | string | Company code |
| `ticker` | string | Stock symbol |
| `eventCode` | string | Event type code (e.g. `DDINS` = institutional deal, `DDDIR` = director deal) |
| `eventNameVi` / `eventNameEn` | string | Event description (vi/en) |
| `organNameVi` / `organNameEn` | string | Company name (vi/en) |
| `traderOrganNameVi` / `traderOrganNameEn` | string | Trader/organization name (vi/en) |
| `actionTypeCode` | string | `B` = Buy, `S` = Sell |
| `actionTypeVi` / `actionTypeEn` | string | Action description (vi/en) |
| `tradeStatusVi` / `tradeStatusEn` | string | Status: Đăng ký (Registration), Hoàn thành (Completed), etc. |
| `publicDate` | ISO datetime | Public announcement date |
| `displayDate1` | ISO datetime | Display date (execution/registration date) |
| `displayDate2` | ISO datetime | Secondary display date |
| `startDate` | ISO datetime | Trading period start |
| `endDate` | ISO datetime | Trading period end |
| `shareBeforeTrade` | int | Shares held before trade |
| `shareAfterTrade` | int | Shares held after trade |
| `shareRegister` | int | Shares registered to trade |
| `shareAcquire` | int | Shares actually acquired |
| `ownershipAfterTrade` | ratio | Ownership percentage after trade |
| `sourceUrlVi` / `sourceUrlEn` | URL | Source article links |
| `icbCodeLv1` | string | ICB industry code level 1 |

---

## 4. Cung cầu (Supply & Demand)

Uses the **price-history** endpoint. Supply/demand fields are embedded in the same response.

| Endpoint | URL | Status |
|---|---|---|
| Supply/demand data (paginated) | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history?fromDate={}&toDate={}&page={}&size={}&timeFrame={}` | ✅ |
| Supply/demand summary | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history-summary?fromDate={}&toDate={}&timeFrame={}` | ✅ |

### Response Fields — Supply & Demand (in `price-history` items)

| Field | Unit | Description |
|---|---|---|
| `totalBuyTrade` | count | Number of buy orders |
| `totalBuyTradeVolume` | shares | Total buy-side volume |
| `totalSellTrade` | count | Number of sell orders |
| `totalSellTradeVolume` | shares | Total sell-side volume |
| `totalNetTradeVolume` | shares | Net volume (buy − sell) |
| `averageBuyTradeVolume` | shares | Average volume per buy order |
| `averageSellTradeVolume` | shares | Average volume per sell order |
| `totalBuyUnmatchedVolume` | shares | Unmatched (pending) buy volume |
| `totalSellUnmatchedVolume` | shares | Unmatched (pending) sell volume |

### Response Fields — Supply & Demand Summary (in `price-history-summary`)

| Field | Unit | Description |
|---|---|---|
| `totalBuyTradeVolume` / `totalSellTradeVolume` | shares | Total buy/sell volume in period |
| `totalBuyTradeVolumeAvg` / `totalSellTradeVolumeAvg` | shares | Daily average buy/sell volume |
| `totalBuyUnmatchedVolume` / `totalSellUnmatchedVolume` | shares | Total unmatched buy/sell in period |
| `totalBuyUnmatchedVolumeAvg` / `totalSellUnmatchedVolumeAvg` | shares | Daily average unmatched |

---

## Supporting Endpoints

These endpoints are also called on the Statistics tab page:

| Endpoint | URL | Description | Status |
|---|---|---|---|
| Company details | `GET .../api/iq-insight-service/v1/company/details?ticker={ticker}` | Company info, sector, exchange | ✅ |
| Price chart (OHLC) | `GET .../api/iq-insight-service/v1/company/{ticker}/price-chart?lengthReport={n}` | Adjusted OHLC for charting (unix timestamp) | ✅ |

### Price Chart Response Fields

| Field | Type | Description |
|---|---|---|
| `openPrice` | float | Adjusted open price |
| `highPrice` | float | Adjusted high price |
| `lowPrice` | float | Adjusted low price |
| `closingPrice` | float | Adjusted close price |
| `tradingTime` | unix epoch (s) | Trading date as unix timestamp |

---

## Source Headers

| Header | Value |
|---|---|
| Referer | `https://trading.vietcap.com.vn/` |
| Origin | `https://trading.vietcap.com.vn` |
| Accept | `application/json` |
| User-Agent | Standard browser UA |

> **Auth:** All endpoints are **public**, no authentication required.

## API Response Envelope

All responses follow a consistent envelope:

```json
{
  "serverDateTime": "2026-04-25T08:33:42.642Z",
  "traceId": "...",
  "status": 200,
  "code": 0,
  "msg": "Successful",
  "successful": true,
  "data": { ... }
}
```

- Paginated endpoints: `data.content[]` (array of items)
- Summary endpoints: `data` (flat object)

> **Value units:** All `*Value*` fields are in **VND (exact, not scaled)**. All `*Volume*` fields are in **shares**. Percentage/ratio fields are `0.0–1.0` range (e.g. `0.49` = 49%).
