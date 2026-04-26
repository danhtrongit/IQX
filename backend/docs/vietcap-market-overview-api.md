# API Tổng quan thị trường Vietcap

> Nguồn: `https://trading.vietcap.com.vn/iq/market`
> Ngày phân tích: 2026-04-25
> Trang: Vietcap IQ → Thị trường → Tổng quan + Nhiệt độ

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tong-quan-kien-truc)
2. [Thanh khoản (Liquidity)](#2-thanh-khoan-liquidity)
3. [Nhóm dẫn dắt thị trường (Index Impact)](#3-nhom-dan-dat-thi-truong-index-impact)
4. [Nước ngoài (Foreign Trading)](#4-nuoc-ngoai-foreign-trading)
5. [Tự doanh (Proprietary Trading)](#5-tu-doanh-proprietary-trading)
6. [Phân bổ thị trường (Market Allocation)](#6-phan-bo-thi-truong-market-allocation)
7. [Ngành ICB (Industry/Sector)](#7-nganh-icb-industrysector)
8. [Định giá (Valuation P/E, P/B)](#8-dinh-gia-valuation-pe-pb)
9. [Độ rộng thị trường (Market Breadth)](#9-do-rong-thi-truong-market-breadth)
10. [Nhiệt độ (Heatmap)](#10-nhiet-do-heatmap)
11. [API hỗ trợ](#11-api-ho-tro-supporting-apis)
12. [Enum / Giá trị tham số](#12-enum--gia-tri-tham-so)

---

## 1. Tổng quan kiến trúc

### Base URL

| Host | Mô tả |
|------|-------|
| `https://trading.vietcap.com.vn` | API chính (market-watch, chart, price, fiin) |
| `https://iq.vietcap.com.vn` | API IQ Insight (valuation, breadth, proprietary top, sectors) |
| `https://www.vietcap.com.vn` | API CMS (cấu hình ngành) |

### Header chung

```
Accept: application/json
Content-Type: application/json   (cho POST request)
Referer: https://trading.vietcap.com.vn/iq/market
User-Agent: Mozilla/5.0 ...
```

> **Ghi chú:** Tất cả API đều **không cần authentication** (công khai). Một số API dùng header `device-id` nhưng không bắt buộc.

---

## 2. Thanh khoản (Liquidity)

### 2.1. Thanh khoản trong ngày (Intraday Liquidity)

Biểu đồ thanh khoản tích lũy theo phút trong phiên giao dịch.

```
POST https://trading.vietcap.com.vn/api/chart/v3/OHLCChart/gap-liquidity
```

**Request Body:**
```json
{
  "from": 1776988800,
  "to": 1777091198,
  "symbols": ["ALL"],
  "timeFrame": "ONE_MINUTE"
}
```

- `from`/`to`: Unix timestamp đầu/cuối ngày giao dịch
- `symbols`: `"ALL"` = toàn thị trường, hoặc `["VNINDEX"]`, `["HNXIndex"]`
- `timeFrame`: `ONE_MINUTE` cho chế độ intraday

**Mẫu response:**
```json
[
  {
    "symbol": ["VNINDEX", "HNXIndex", "HNXUpcomIndex"],
    "t": ["1777082400", "1777082460", "..."],
    "accumulatedVolume": [1709305, 2138149, "..."],
    "accumulatedValue": [12054.6404, 16968.3834, "..."],
    "minBatchTruncTime": 1777082400
  }
]
```

**Ghi chú thời gian:**
- Phiên sáng: 09:15 – 11:30 (nghỉ trưa 11:30 – 13:00)
- Phiên chiều: 13:00 – 15:00
- `accumulatedValue` đơn vị **triệu VND** (chia 1.000 ra tỷ)

### 2.2. Thanh khoản lịch sử

```
POST https://trading.vietcap.com.vn/api/chart/v3/OHLCChart/gap-liquidity
```

**Request Body:**
```json
{
  "from": 1745452800,
  "to": 1776988800,
  "symbols": ["ALL"],
  "timeFrame": "ONE_YEAR"
}
```

### Giá trị `timeFrame` cho Liquidity

| timeFrame | Mô tả |
|-----------|-------|
| `ONE_MINUTE` | Dữ liệu mỗi phút (intraday) |
| `ONE_DAY` | Theo ngày |
| `ONE_WEEK` | Theo tuần |
| `ONE_MONTH` | Theo tháng |
| `ONE_YEAR` | Theo năm |

### Giá trị `symbols`

| symbols | Mô tả |
|---------|-------|
| `["ALL"]` | Toàn bộ thị trường (HOSE + HNX + UPCOM) |
| `["VNINDEX"]` | Chỉ HOSE |
| `["HNXIndex"]` | Chỉ HNX |
| `["HNXUpcomIndex"]` | Chỉ UPCOM |

---

## 3. Nhóm dẫn dắt thị trường (Index Impact)

Top 10 cổ phiếu đóng góp tăng/giảm điểm chỉ số nhiều nhất.

```
POST https://trading.vietcap.com.vn/api/market-watch/v2/IndexImpactChart/getData
```

**Request Body:**
```json
{
  "group": "ALL",
  "timeFrame": "ONE_YEAR"
}
```

- `group`: `"ALL" | "HOSE" | "HNX" | "UPCOM"`
- `timeFrame`: `"ONE_DAY" | "ONE_WEEK" | "ONE_MONTH" | "YTD" | "ONE_YEAR"`

**Response:**
```json
{
  "topDown": [
    {
      "symbol": "FPT",
      "impact": -8.903,
      "exchange": "HOSE",
      "enOrganName": "FPT Corporation",
      "enOrganShortName": "FPT Corp",
      "organName": "Cong ty Co phan FPT",
      "organShortName": "FPT Corp",
      "timeFrame": "ONE_YEAR",
      "matchPrice": "73400.0",
      "refPrice": "95572.7",
      "ceiling": null,
      "floor": null
    }
  ],
  "topUp": [
    {
      "symbol": "VIC",
      "impact": 321.98,
      "exchange": "HOSE",
      "organName": "Tap doan Vingroup - Cong ty CP",
      "matchPrice": "212100.0",
      "refPrice": "31350.0"
    }
  ]
}
```

> Trường `impact` âm: kéo giảm chỉ số. `impact` dương: đóng góp tăng.

**Giá trị `group`:**

| group | Mô tả |
|-------|-------|
| `ALL` | Toàn thị trường (mặc định) |
| `HOSE` | Sàn HOSE |
| `HNX` | Sàn HNX |
| `UPCOM` | Sàn UPCOM |

**Giá trị `timeFrame`:**

| timeFrame | Mô tả | UI |
|-----------|-------|----|
| `ONE_DAY` | Hôm nay | "Hôm nay" |
| `ONE_WEEK` | 1 tuần | "1W" |
| `ONE_MONTH` | 1 tháng | "1M" |
| `YTD` | Từ đầu năm | "YTD" |
| `ONE_YEAR` | 1 năm | "1Y" |

---

## 4. Nước ngoài (Foreign Trading)

### 4.1. Biểu đồ khối lượng/giá trị nước ngoài (theo thời gian)

```
POST https://trading.vietcap.com.vn/api/market-watch/v3/ForeignVolumeChart/getAll
```

**Request Body:**
```json
{
  "from": 1745452800,
  "to": 1776988800,
  "group": "ALL",
  "timeFrame": "ONE_MONTH"
}
```

**Response (mảng):**
```json
[
  {
    "group": "ALL",
    "dataType": 0,
    "timeFrame": "ONE_MONTH",
    "truncTime": 1745452800,
    "foreignBuyVolume": "289245061.0",
    "foreignSellVolume": "286834860.0",
    "foreignBuyValue": "8663969161680.0",
    "foreignSellValue": "9193330589610.0"
  }
]
```

> **Tính ròng:** `netVolume = foreignBuyVolume - foreignSellVolume`
> **Tính ròng giá trị:** `netValue = foreignBuyValue - foreignSellValue`

### 4.2. Top cổ phiếu nước ngoài mua/bán ròng

```
POST https://trading.vietcap.com.vn/api/market-watch/v3/ForeignNetValue/top
```

**Request Body:**
```json
{
  "from": 1745452800,
  "to": 1776988800,
  "group": "ALL",
  "timeFrame": "ONE_YEAR"
}
```

**Response:**
```json
{
  "group": "ALL",
  "netBuy": [
    {
      "symbol": "TCX",
      "group": "HSX",
      "truncTime": "1776902400",
      "foreignBuyValue": "6575539160202.0",
      "foreignSellValue": "4040064589652.0",
      "net": "2535474570550.0",
      "timeFrame": "ONE_YEAR",
      "matchPrice": "50300.0",
      "refPrice": "48450.71",
      "exchange": "HOSE",
      "organName": "Cong ty Co phan Chung khoan Ky Thuong",
      "organShortName": "Chung khoan TCBS"
    }
  ],
  "netSell": [
    { "symbol": "...", "net": "-xxx" }
  ],
  "totalNetBuy": "...",
  "totalNetSell": "..."
}
```

**Ánh xạ `from/to` theo `timeFrame` cho UI:**

| Bộ lọc UI | timeFrame | from | to |
|-----------|-----------|------|-----|
| Hôm nay | `ONE_DAY` | startOfToday (unix) | endOfToday (unix) |
| 1W | `ONE_WEEK` | hôm nay − 7 ngày | hôm nay |
| 1M | `ONE_MONTH` | hôm nay − 30 ngày | hôm nay |
| YTD | `YTD` | 01/01 năm hiện tại | hôm nay |
| 1Y | `ONE_YEAR` | hôm nay − 365 ngày | hôm nay |

---

## 5. Tự doanh (Proprietary Trading)

### 5.1. Biểu đồ tự doanh mua/bán (theo thời gian)

```
GET https://trading.vietcap.com.vn/api/fiin-api-service/v3/proprietary-trading-value
    ?timeFrame=ONE_YEAR
    &market=ALL
```

| Param | Mô tả | Giá trị |
|-------|-------|---------|
| `timeFrame` | Khung thời gian | `ONE_DAY`, `ONE_WEEK`, `ONE_MONTH`, `YTD`, `ONE_YEAR` |
| `market` | Sàn giao dịch | `ALL`, `HOSE`, `HNX`, `UPCOM` |

**Response:**
```json
{
  "serverDateTime": "2026-04-25T04:28:27.769569123",
  "status": 200,
  "code": 0,
  "msg": "Successful",
  "successful": true,
  "data": {
    "tradingDate": "2026-04-01",
    "totalBuyValue": null,
    "totalSellValue": null,
    "netValue": null,
    "totalBuyVolume": null,
    "totalSellVolume": null,
    "netVolume": null,
    "dataType": 2,
    "data": [
      {
        "totalBuyValue": 8620030672700,
        "totalSellValue": 12248298998317,
        "totalBuyVolume": 274568417,
        "totalSellVolume": 406465933,
        "tradingDate": "2025-05-01",
        "totalDealBuyVolume": 39639118,
        "totalDealSellVolume": "..."
      }
    ]
  }
}
```

### 5.2. Top cổ phiếu tự doanh mua/bán ròng

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/top-proprietary
    ?timeFrame=ONE_YEAR
    &exchange=ALL
```

| Param | Mô tả | Giá trị |
|-------|-------|---------|
| `timeFrame` | Khung thời gian | `ONE_DAY`, `ONE_WEEK`, `ONE_MONTH`, `YTD`, `ONE_YEAR` |
| `exchange` | Sàn giao dịch | `ALL`, `HOSE`, `HNX`, `UPCOM` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": {
    "tradingDate": "25/04/2026",
    "data": {
      "SELL": [
        {
          "ticker": "VPB",
          "totalValue": -3589172164000,
          "totalVolume": 692394443,
          "organName": "Ngan hang TMCP Viet Nam Thinh Vuong",
          "organShortName": "VPBank",
          "exchange": "HOSE",
          "refPrice": "...",
          "matchPrice": "..."
        }
      ],
      "BUY": [
        {
          "ticker": "GEE",
          "totalValue": 3200000000,
          "totalVolume": 500000,
          "organName": "...",
          "exchange": "HOSE"
        }
      ]
    }
  }
}
```

> `totalValue` âm: bán ròng. `totalValue` dương: mua ròng.

---

## 6. Phân bổ thị trường (Market Allocation)

Biểu đồ phân bổ tăng/giảm/đứng giá của thị trường theo số lượng và giá trị.

```
POST https://trading.vietcap.com.vn/api/market-watch/AllocatedValue/getAllocatedValue
```

**Request Body:**
```json
{
  "group": "ALL",
  "timeFrame": "ONE_YEAR"
}
```

**Response (mảng, mỗi phần tử là 1 sàn):**
```json
[
  {
    "totalIncrease": [
      { "group": "HOSE", "totalAccumulatedValueChangeHigh_t_last_year": 6054816465075510 }
    ],
    "totalNochange": [
      { "group": "HOSE", "totalAccumulatedValueChangeZero_t_last_year": 553814248330 }
    ],
    "totalDecrease": [
      { "group": "HOSE", "totalAccumulatedValueChangeLow_t_last_year": 624482184610010 }
    ],
    "totalSymbolIncrease": [
      { "group": "HOSE", "totalSymbolChangeHigh_t_last_year": 264 }
    ],
    "totalSymbolNochange": [
      { "group": "HOSE", "totalSymbolChangeZero_t_last_year": 1 }
    ],
    "totalSymbolDecrease": [
      { "group": "HOSE", "totalSymbolChangeLow_t_last_year": 180 }
    ]
  }
]
```

> **Ghi chú:** Hậu tố `_t_last_year`, `_t_today`, `_t_one_week`... thay đổi theo `timeFrame`.

---

## 7. Ngành ICB (Industry/Sector)

### 7.1. Danh sách mã ICB

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes
```

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    {
      "name": "2733",
      "enSector": "Electrical Components & Equipment",
      "viSector": "Hang dien & dien tu",
      "icbLevel": 4,
      "isLevel1Custom": false,
      "marketCap": 4206114686300,
      "level1Custom": false
    },
    {
      "name": "1300",
      "enSector": "Chemicals",
      "viSector": "Hoa chat",
      "icbLevel": 2,
      "marketCap": 254780687068546
    }
  ]
}
```

**ICB Level:**

| Level | Mô tả | Ví dụ |
|-------|-------|-------|
| 1 | Super sector | Tài chính, Công nghiệp... |
| 2 | Sector | Ngân hàng, Bảo hiểm, Hóa chất... |
| 3 | Sub-sector | |
| 4 | Detail sector | |

### 7.2. Phân bổ theo ngành ICB

```
POST https://trading.vietcap.com.vn/api/market-watch/AllocatedICB/getAllocated
```

**Request Body:**
```json
{
  "group": "ALL",
  "timeFrame": "ONE_YEAR"
}
```

**Response (mảng):**
```json
[
  {
    "icb_code": 9000,
    "icbChangePercent": -20.506,
    "totalValue": 244260147127980,
    "totalStockIncrease": 16,
    "totalStockDecrease": 11,
    "totalStockNoChange": 0,
    "icbCodeParent": null
  },
  {
    "icb_code": 8700,
    "icbChangePercent": 23.10,
    "totalValue": 1206973007276280,
    "totalStockIncrease": 24,
    "totalStockDecrease": 18,
    "totalStockNoChange": 1,
    "icbCodeParent": null
  }
]
```

### 7.3. Cấu hình ngành (CMS)

```
GET https://www.vietcap.com.vn/api/cms-service/v1/config/industry?language=1
```

> Trả về danh sách ngành với tên hiển thị; `language=1` là tiếng Việt, `language=2` là tiếng Anh.

### 7.4. File JSON ngành (tĩnh)

```
GET https://trading.vietcap.com.vn/vietcap-iq/language/vi/sector.json?v={timestamp}
```

> File JSON tĩnh chứa thông tin ngành để hiển thị trên UI.

---

## 8. Định giá (Valuation P/E, P/B)

```
GET https://trading.vietcap.com.vn/api/iq-insight-service/v1/market-watch/index-valuation
    ?type=pe
    &comGroupCode=VNINDEX
    &timeFrame=ONE_YEAR
```

| Param | Mô tả | Giá trị |
|-------|-------|---------|
| `type` | Loại chỉ số | `pe`, `pb` |
| `comGroupCode` | Mã chỉ số / nhóm | `VNINDEX`, `HNX30`, `VN30`... |
| `timeFrame` | Khung thời gian | `SIX_MONTHS`, `YTD`, `ONE_YEAR`, `TWO_YEAR`, `FIVE_YEAR`, `ALL` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": {
    "values": [
      { "date": "2025-04-25", "value": 11.9267 },
      { "date": "2025-04-28", "value": 11.8198 }
    ]
  }
}
```

**Ánh xạ UI → API timeFrame:**

| UI | API timeFrame |
|----|---------------|
| 6M | `SIX_MONTHS` |
| YTD | `YTD` |
| 1Y | `ONE_YEAR` |
| 2Y | `TWO_YEAR` |
| 5Y | `FIVE_YEAR` |
| All | `ALL` |

---

## 9. Độ rộng thị trường (Market Breadth)

Tỷ lệ cổ phiếu trên/dưới đường EMA50 (hoặc EMA20, SMA...).

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/breadth
    ?condition=EMA50
    &exchange=HSX,HNX,UPCOM
    &enNumberOfDays=Y1
```

| Param | Mô tả | Giá trị |
|-------|-------|---------|
| `condition` | Điều kiện kỹ thuật | `EMA50`, `EMA20`, `SMA50`, `SMA200` |
| `exchange` | Sàn (ngăn cách dấu phẩy) | `HSX`, `HNX`, `UPCOM` hoặc kết hợp |
| `enNumberOfDays` | Kỳ thời gian | `M6` (6M), `YTD`, `Y1` (1Y), `Y2` (2Y), `Y5` (5Y), `ALL` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    { "condition": "EMA50", "count": 556, "total": 1584, "percent": 0.351, "tradingDate": "2025-04-25" },
    { "condition": "EMA50", "count": 583, "total": 1585, "percent": 0.3678, "tradingDate": "2025-04-28" }
  ]
}
```

**Ánh xạ UI → enNumberOfDays:**

| UI | enNumberOfDays |
|----|----------------|
| 6M | `M6` |
| YTD | `YTD` |
| 1Y | `Y1` |
| 2Y | `Y2` |
| 5Y | `Y5` |
| All | `ALL` |

---

## 10. Nhiệt độ (Heatmap)

### 10.1. Heatmap theo ngành ICB

```
POST https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getByIcb
```

**Request Body:**
```json
{
  "group": "ALL",
  "sector": "icb_code_2",
  "size": "MKC"
}
```

**Response (mảng theo ngành):**
```json
[
  {
    "icb_code": 9500,
    "icb_name": "Cong nghe Thong tin",
    "en_icb_name": "Technology",
    "icbChangePercent": -1.1344,
    "totalCapMulChangePercent": -163441015203574.8,
    "totalMarketCap": 144073963290550,
    "data": [
      {
        "symbol": "FPT",
        "volume": 10459800,
        "value": 769854.19,
        "price": 73400,
        "refPrice": 74300,
        "marketCap": 126570579090300,
        "ceilingPrice": 79500,
        "floorPrice": 69100,
        "foreignBuyVolume": 202192,
        "foreignSellVolume": 5861142,
        "foreignBuyValue": 14882098600,
        "foreignSellValue": 431376287300,
        "putThroughVolume": 793000,
        "putThroughValue": "..."
      }
    ]
  }
]
```

**Giá trị `sector` (ICB Level):**

| sector | Mô tả |
|--------|-------|
| `icb_code_1` | Super sector (cấp 1) |
| `icb_code_2` | Sector (cấp 2 — phổ biến nhất) |
| `icb_code_3` | Sub-sector (cấp 3) |
| `icb_code_4` | Detail sector (cấp 4) |

**Giá trị `size`:**

| size | Mô tả |
|------|-------|
| `MKC` | Vốn hóa thị trường (mặc định) |
| `VOL` | Khối lượng giao dịch |
| `VAL` | Giá trị giao dịch |

### 10.2. Thông tin index cho heatmap

```
GET https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getIndex
```

**Response:**
```json
{
  "totalStock": 1538,
  "totalTradingVolume": 794400925,
  "totalTradingValue": 21139697.99194,
  "totalFrBuyVolume": 41925820,
  "totalFrSellVolume": 93163897,
  "totalFrBuyValue": 1624704273500,
  "totalFrSellValue": 3572863448780,
  "totalPtVolume": 1180355096,
  "totalPtValue": 20561938811642,
  "indexData": [
    { "symbol": "VNINDEX", "price": 1853.29, "refPrice": 1870.36 },
    { "symbol": "HNXIndex", "price": 251.95, "refPrice": 253.23 },
    { "symbol": "HNXUpcomIndex", "price": 127.54, "refPrice": 128.31 }
  ]
}
```

---

## 11. API hỗ trợ (Supporting APIs)

### 11.1. OHLC Chart (biểu đồ giá Index)

```
POST https://trading.vietcap.com.vn/api/chart/OHLCChart/gap
```

**Request Body:**
```json
{
  "from": 1745555081,
  "to": 1777091082,
  "symbols": ["VNINDEX"],
  "timeFrame": "ONE_DAY"
}
```

### 11.2. Trạng thái thị trường

```
GET https://trading.vietcap.com.vn/api/price/marketStatus/getAll
```

> Trả về trạng thái các sàn: Pre-open, Open, Intermission, Close...

### 11.3. Ngày giao dịch

```
POST https://trading.vietcap.com.vn/api/price/tradingDates/getAll
```

**Request Body:**
```json
{
  "limit": 21
}
```

### 11.4. Top Stock Price

```
POST https://trading.vietcap.com.vn/api/market-data-service/v1/tickers/price/top-stock
```

**Request Body:**
```json
{
  "tickers": ["FPT", "VPB", "VIC", "VHM", "MBB", "..."]
}
```

> Trả về giá hiện tại của các mã trong Vietcap Coverage Universe.

### 11.5. Tỷ giá USD/VND

```
POST https://trading.vietcap.com.vn/api/price/globalPrice/getList
```

**Request Body:**
```json
{
  "symbols": ["VND=X"]
}
```

### 11.6. Server Time

```
GET https://trading.vietcap.com.vn/api/price/time
```

### 11.7. Data Version

```
GET https://trading.vietcap.com.vn/api/market-data-service/v1/data-version
```

---

## 12. Enum / Giá trị tham số

### `timeFrame`

| Giá trị | Mô tả | Dùng cho |
|---------|-------|----------|
| `ONE_MINUTE` | 1 phút | Liquidity intraday |
| `ONE_DAY` | 1 ngày / Hôm nay | Index Impact, Foreign, OHLC |
| `ONE_WEEK` | 1 tuần | Index Impact, Foreign, OHLC |
| `ONE_MONTH` | 1 tháng | Index Impact, Foreign, OHLC |
| `YTD` | Từ đầu năm | Index Impact, Foreign, Proprietary |
| `ONE_YEAR` | 1 năm | Tất cả |
| `SIX_MONTHS` | 6 tháng | Valuation P/E P/B |
| `TWO_YEAR` | 2 năm | Valuation P/E P/B |
| `FIVE_YEAR` | 5 năm | Valuation P/E P/B |
| `ALL` | Tất cả | Valuation P/E P/B, Breadth |

### `group` / `market` / `exchange`

| Giá trị | Mô tả | API dùng |
|---------|-------|----------|
| `ALL` | Toàn thị trường | Tất cả POST API |
| `HOSE` / `HSX` | Sàn HOSE | `group` dùng `HOSE`, `exchange` dùng `HSX` |
| `HNX` | Sàn HNX | Tất cả |
| `UPCOM` | Sàn UPCOM | Tất cả |

### `enNumberOfDays` (Breadth)

| Giá trị | Mô tả |
|---------|-------|
| `M6` | 6 tháng |
| `YTD` | Từ đầu năm |
| `Y1` | 1 năm |
| `Y2` | 2 năm |
| `Y5` | 5 năm |
| `ALL` | Tất cả |

### `condition` (Breadth)

| Giá trị | Mô tả |
|---------|-------|
| `EMA50` | EMA 50 ngày |
| `EMA20` | EMA 20 ngày |
| `SMA50` | SMA 50 ngày |
| `SMA200` | SMA 200 ngày |

### `type` (Valuation)

| Giá trị | Mô tả |
|---------|-------|
| `pe` | Price to Earnings (TTM) |
| `pb` | Price to Book (TTM) |

### `comGroupCode` (Valuation)

| Giá trị | Mô tả |
|---------|-------|
| `VNINDEX` | Chỉ số VN-Index |
| `HNX30` | Chỉ số HNX30 |
| `VN30` | Chỉ số VN30 |
| `VNMIDCAP` | VN MidCap |
| `VNSMALLCAP` | VN SmallCap |
| `VN100` | VN100 |

### `sector` (Heatmap)

| Giá trị | Mô tả |
|---------|-------|
| `icb_code_1` | ICB Level 1 (Super sector) |
| `icb_code_2` | ICB Level 2 (Sector) — mặc định |
| `icb_code_3` | ICB Level 3 (Sub-sector) |
| `icb_code_4` | ICB Level 4 (Detail) |

### `size` (Heatmap)

| Giá trị | Mô tả |
|---------|-------|
| `MKC` | Market Cap (vốn hóa) |
| `VOL` | Volume (khối lượng) |
| `VAL` | Value (giá trị) |

---

## Ghi chú kỹ thuật

1. **Unix Timestamp**: Tất cả `from`, `to`, `truncTime`, `t` đều dùng **epoch giây** (không phải milliseconds).
2. **Đơn vị tiền**:
   - Các trường `*Value` trả về đơn vị **VND**.
   - `accumulatedValue` trong API Liquidity trả về đơn vị **triệu VND**.
   - Để chuyển sang **tỷ VND**: chia cho 1.000.000.000.
3. **Hậu tố theo timeFrame**: Một số API (AllocatedValue) có hậu tố động kiểu `_t_last_year`, `_t_today` trong tên field — thay đổi theo `timeFrame`.
4. **Rate limit**: Chưa xác định chính xác. Khuyến nghị cache dữ liệu và gọi mỗi 30–60 giây.
5. **CORS**: API chỉ cho phép gọi từ domain `trading.vietcap.com.vn` và `iq.vietcap.com.vn`. Từ backend nên gọi trực tiếp, không bị CORS.
