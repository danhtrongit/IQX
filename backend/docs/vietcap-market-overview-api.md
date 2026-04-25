# Vietcap Market Overview API Documentation

> Source: `https://trading.vietcap.com.vn/iq/market`
> Ngay phan tich: 2026-04-25
> Trang: Vietcap IQ > Thi Truong > Tong Quan + Nhiet Do

---

## Muc Luc

1. [Tong Quan Kien Truc](#1-tong-quan-kien-truc)
2. [Thanh Khoan (Liquidity)](#2-thanh-khoan-liquidity)
3. [Nhom Dan Dat Thi Truong (Index Impact)](#3-nhom-dan-dat-thi-truong-index-impact)
4. [Nuoc Ngoai (Foreign Trading)](#4-nuoc-ngoai-foreign-trading)
5. [Tu Doanh (Proprietary Trading)](#5-tu-doanh-proprietary-trading)
6. [Phan Bo Thi Truong (Market Allocation)](#6-phan-bo-thi-truong-market-allocation)
7. [Nganh ICB (Industry/Sector)](#7-nganh-icb-industrysector)
8. [Dinh Gia (Valuation P/E, P/B)](#8-dinh-gia-valuation-pe-pb)
9. [Do Rong Thi Truong (Market Breadth)](#9-do-rong-thi-truong-market-breadth)
10. [Nhiet Do (Heatmap)](#10-nhiet-do-heatmap)
11. [API Phu Tro (Supporting APIs)](#11-api-phu-tro-supporting-apis)
12. [Enum / Gia Tri Tham So](#12-enum--gia-tri-tham-so)

---

## 1. Tong Quan Kien Truc

### Base URLs

| Host | Mo ta |
|------|-------|
| `https://trading.vietcap.com.vn` | API chinh (market-watch, chart, price, fiin) |
| `https://iq.vietcap.com.vn` | API IQ Insight (valuation, breadth, proprietary top, sectors) |
| `https://www.vietcap.com.vn` | API CMS (industry config) |

### Common Headers

```
Accept: application/json
Content-Type: application/json  (cho POST requests)
Referer: https://trading.vietcap.com.vn/iq/market
User-Agent: Mozilla/5.0 ...
```

> **Ghi chu**: Tat ca API deu **khong can authentication** (public). Mot so API su dung `device-id` header nhung khong bat buoc.

---

## 2. Thanh Khoan (Liquidity)

### 2.1. Thanh khoan trong ngay (Intraday Liquidity)

Bieu do thanh khoan tich luy theo phut trong phien giao dich.

```
POST https://trading.vietcap.com.vn/api/chart/v3/OHLCChart/gap-liquidity
```

**Request Body:**
```json
{
  "from": 1776988800,       // Unix timestamp - dau ngay giao dich (00:00:00 UTC)
  "to": 1777091198,         // Unix timestamp - cuoi ngay giao dich (23:59:58 UTC)
  "symbols": ["ALL"],       // "ALL" = toan thi truong, hoac ["VNINDEX"], ["HNXIndex"]
  "timeFrame": "ONE_MINUTE" // Granularity: ONE_MINUTE cho intraday
}
```

**Response Sample:**
```json
[
  {
    "symbol": ["VNINDEX", "HNXIndex", "HNXUpcomIndex"],
    "t": ["1777082400", "1777082460", "..."],           // Timestamps (epoch seconds) moi phut
    "accumulatedVolume": [1709305, 2138149, "..."],      // KL tich luy (co phieu)
    "accumulatedValue": [12054.6404, 16968.3834, "..."], // GTGD tich luy (trieu VND)
    "minBatchTruncTime": 1777082400
  }
]
```

**Ghi chu ve thoi gian:**
- Phien sang: 09:15 - 11:30 (gap tu 11:30 - 13:00)
- Phien chieu: 13:00 - 15:00
- `accumulatedValue` don vi la **trieu VND** (chia 1000 de ra ty)

### 2.2. Thanh khoan lich su (Historical Liquidity)

```
POST https://trading.vietcap.com.vn/api/chart/v3/OHLCChart/gap-liquidity
```

**Request Body:**
```json
{
  "from": 1745452800,       // Unix timestamp - 1 nam truoc
  "to": 1776988800,         // Unix timestamp - hom nay
  "symbols": ["ALL"],
  "timeFrame": "ONE_YEAR"   // Granularity: ONE_YEAR = aggregate theo nam
}
```

### Cac gia tri `timeFrame` cho Liquidity:

| timeFrame | Mo ta |
|-----------|-------|
| `ONE_MINUTE` | Du lieu moi phut (intraday) |
| `ONE_DAY` | Du lieu theo ngay |
| `ONE_WEEK` | Du lieu theo tuan |
| `ONE_MONTH` | Du lieu theo thang |
| `ONE_YEAR` | Du lieu theo nam |

### Cac gia tri `symbols`:

| symbols | Mo ta |
|---------|-------|
| `["ALL"]` | Toan bo thi truong (HOSE + HNX + UPCOM) |
| `["VNINDEX"]` | Chi HOSE |
| `["HNXIndex"]` | Chi HNX |
| `["HNXUpcomIndex"]` | Chi UPCOM |

---

## 3. Nhom Dan Dat Thi Truong (Index Impact)

Top 10 co phieu dong gop tang/giam nhieu nhat vao chi so.

```
POST https://trading.vietcap.com.vn/api/market-watch/v2/IndexImpactChart/getData
```

**Request Body:**
```json
{
  "group": "ALL",            // "ALL" | "HOSE" | "HNX" | "UPCOM"
  "timeFrame": "ONE_YEAR"    // "ONE_DAY" | "ONE_WEEK" | "ONE_MONTH" | "YTD" | "ONE_YEAR"
}
```

**Response:**
```json
{
  "topDown": [
    {
      "symbol": "FPT",
      "impact": -8.903,            // Diem anh huong (am = keo giam chi so)
      "exchange": "HOSE",
      "enOrganName": "FPT Corporation",
      "enOrganShortName": "FPT Corp",
      "organName": "Cong ty Co phan FPT",
      "organShortName": "FPT Corp",
      "timeFrame": "ONE_YEAR",
      "matchPrice": "73400.0",      // Gia hien tai
      "refPrice": "95572.7",        // Gia tham chieu (dau ky)
      "ceiling": null,
      "floor": null
    }
  ],
  "topUp": [
    {
      "symbol": "VIC",
      "impact": 321.98,             // Diem anh huong (duong = dong gop tang)
      "exchange": "HOSE",
      "organName": "Tap doan Vingroup - Cong ty CP",
      "matchPrice": "212100.0",
      "refPrice": "31350.0"
    }
  ]
}
```

**Cac gia tri `group`:**

| group | Mo ta | Ghi chu |
|-------|-------|---------|
| `ALL` | Toan thi truong | Mac dinh |
| `HOSE` | San HOSE | |
| `HNX` | San HNX | |
| `UPCOM` | San UPCOM | |

**Cac gia tri `timeFrame`:**

| timeFrame | Mo ta | Tuong ung UI |
|-----------|-------|-------------|
| `ONE_DAY` | Hom nay | "Hom nay" |
| `ONE_WEEK` | 1 tuan | "1W" |
| `ONE_MONTH` | 1 thang | "1M" |
| `YTD` | Tu dau nam | "YTD" |
| `ONE_YEAR` | 1 nam | "1Y" |

---

## 4. Nuoc Ngoai (Foreign Trading)

### 4.1. Bieu do Khoi Luong/Gia Tri Nuoc Ngoai (theo thoi gian)

```
POST https://trading.vietcap.com.vn/api/market-watch/v3/ForeignVolumeChart/getAll
```

**Request Body:**
```json
{
  "from": 1745452800,           // Unix timestamp - ngay bat dau
  "to": 1776988800,             // Unix timestamp - ngay ket thuc
  "group": "ALL",               // "ALL" | "HOSE" | "HNX" | "UPCOM"
  "timeFrame": "ONE_MONTH"      // Granularity de group du lieu
}
```

**Response (array):**
```json
[
  {
    "group": "ALL",
    "dataType": 0,
    "timeFrame": "ONE_MONTH",
    "truncTime": 1745452800,               // Timestamp dau thang
    "foreignBuyVolume": "289245061.0",      // KL mua NN
    "foreignSellVolume": "286834860.0",     // KL ban NN
    "foreignBuyValue": "8663969161680.0",   // GT mua NN (VND)
    "foreignSellValue": "9193330589610.0"   // GT ban NN (VND)
  }
]
```

> **Tinh rong**: `netVolume = foreignBuyVolume - foreignSellVolume`
> **Tinh rong GT**: `netValue = foreignBuyValue - foreignSellValue`

### 4.2. Top Co Phieu Nuoc Ngoai Mua/Ban Rong

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
      "net": "2535474570550.0",              // GT mua rong (VND)
      "timeFrame": "ONE_YEAR",
      "matchPrice": "50300.0",
      "refPrice": "48450.71",
      "exchange": "HOSE",
      "organName": "Cong ty Co phan Chung khoan Ky Thuong",
      "organShortName": "Chung khoan TCBS"
    }
  ],
  "netSell": [
    {
      "symbol": "...",
      "net": "-xxx"                          // GT ban rong (am)
    }
  ],
  "totalNetBuy": "...",    // Tong GT mua rong toan thi truong
  "totalNetSell": "..."    // Tong GT ban rong toan thi truong
}
```

**Mapping `from/to` voi timeFrame cho UI:**

| UI Filter | timeFrame | from | to |
|-----------|-----------|------|-----|
| Hom nay | `ONE_DAY` | startOfToday (unix) | endOfToday (unix) |
| 1W | `ONE_WEEK` | today - 7 days | today |
| 1M | `ONE_MONTH` | today - 30 days | today |
| YTD | `YTD` | Jan 1st of year | today |
| 1Y | `ONE_YEAR` | today - 365 days | today |

---

## 5. Tu Doanh (Proprietary Trading)

### 5.1. Bieu do Tu Doanh Mua/Ban (theo thoi gian)

```
GET https://trading.vietcap.com.vn/api/fiin-api-service/v3/proprietary-trading-value
    ?timeFrame=ONE_YEAR
    &market=ALL
```

**Query Params:**

| Param | Mo ta | Gia tri |
|-------|-------|---------|
| `timeFrame` | Khung thoi gian | `ONE_DAY`, `ONE_WEEK`, `ONE_MONTH`, `YTD`, `ONE_YEAR` |
| `market` | San giao dich | `ALL`, `HOSE`, `HNX`, `UPCOM` |

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
        "totalBuyValue": 8620030672700,         // GT mua tu doanh (VND)
        "totalSellValue": 12248298998317,        // GT ban tu doanh (VND)
        "totalBuyVolume": 274568417,             // KL mua tu doanh (CP)
        "totalSellVolume": 406465933,            // KL ban tu doanh (CP)
        "tradingDate": "2025-05-01",
        "totalDealBuyVolume": 39639118,          // KL mua thoa thuan
        "totalDealSellVolume": "..."
      }
    ]
  }
}
```

### 5.2. Top Co Phieu Tu Doanh Mua/Ban Rong

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/top-proprietary
    ?timeFrame=ONE_YEAR
    &exchange=ALL
```

**Query Params:**

| Param | Mo ta | Gia tri |
|-------|-------|---------|
| `timeFrame` | Khung thoi gian | `ONE_DAY`, `ONE_WEEK`, `ONE_MONTH`, `YTD`, `ONE_YEAR` |
| `exchange` | San giao dich | `ALL`, `HOSE`, `HNX`, `UPCOM` |

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
          "totalValue": -3589172164000,           // GT ban rong (am = ban rong)
          "totalVolume": 692394443,               // KL giao dich
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
          "totalValue": 3200000000,               // GT mua rong (duong = mua rong)
          "totalVolume": 500000,
          "organName": "...",
          "exchange": "HOSE"
        }
      ]
    }
  }
}
```

---

## 6. Phan Bo Thi Truong (Market Allocation)

Bieu do phan bo tang/giam/dung gia cua thi truong (theo so luong va gia tri).

```
POST https://trading.vietcap.com.vn/api/market-watch/AllocatedValue/getAllocatedValue
```

**Request Body:**
```json
{
  "group": "ALL",            // "ALL" | "HOSE" | "HNX" | "UPCOM"
  "timeFrame": "ONE_YEAR"
}
```

**Response (array, moi phan tu la 1 san):**
```json
[
  {
    "totalIncrease": [
      {
        "group": "HOSE",
        "totalAccumulatedValueChangeHigh_t_last_year": 6054816465075510  // Tong GT co phieu tang (VND)
      }
    ],
    "totalNochange": [
      {
        "group": "HOSE",
        "totalAccumulatedValueChangeZero_t_last_year": 553814248330      // Tong GT co phieu khong doi
      }
    ],
    "totalDecrease": [
      {
        "group": "HOSE",
        "totalAccumulatedValueChangeLow_t_last_year": 624482184610010    // Tong GT co phieu giam
      }
    ],
    "totalSymbolIncrease": [
      {
        "group": "HOSE",
        "totalSymbolChangeHigh_t_last_year": 264   // So co phieu tang
      }
    ],
    "totalSymbolNochange": [
      {
        "group": "HOSE",
        "totalSymbolChangeZero_t_last_year": 1     // So co phieu khong doi
      }
    ],
    "totalSymbolDecrease": [
      {
        "group": "HOSE",
        "totalSymbolChangeLow_t_last_year": 180    // So co phieu giam
      }
    ]
  }
]
```

> **Ghi chu**: Hau to `_t_last_year`, `_t_today`, `_t_one_week`... thay doi tuy theo `timeFrame`.

---

## 7. Nganh ICB (Industry/Sector)

### 7.1. Danh sach ma ICB

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
      "name": "2733",                                    // Ma ICB
      "enSector": "Electrical Components & Equipment",   // Ten tieng Anh
      "viSector": "Hang dien & dien tu",                 // Ten tieng Viet
      "icbLevel": 4,                                     // Cap do (1-4)
      "isLevel1Custom": false,
      "marketCap": 4206114686300,                        // Von hoa (VND)
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

**ICB Levels:**

| Level | Mo ta | Vi du |
|-------|-------|-------|
| 1 | Super sector | Tai chinh, Cong nghiep... |
| 2 | Sector | Ngan hang, Bao hiem, Hoa chat... |
| 3 | Sub-sector | |
| 4 | Detail sector | |

### 7.2. Phan bo theo nganh ICB

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

**Response (array):**
```json
[
  {
    "icb_code": 9000,
    "icbChangePercent": -20.506,          // % thay doi cua nganh
    "totalValue": 244260147127980,        // Tong GTGD nganh (VND)
    "totalStockIncrease": 16,             // So CP tang trong nganh
    "totalStockDecrease": 11,             // So CP giam
    "totalStockNoChange": 0,              // So CP khong doi
    "icbCodeParent": null                 // Ma nganh cha (null = root)
  },
  {
    "icb_code": 8700,
    "icbChangePercent": 23.10,
    "totalValue": 1206973007276280,
    "totalStockIncrease": 24,
    "totalStockDecrease": 18,
    "totalStockNoChange": 1,
    "icbCodeParent": null
  },
  {
    "icb_code": 8600,
    "icbChangePercent": 177.11,
    "totalValue": 1265192869766390,
    "totalStockIncrease": 78,
    "totalStockDecrease": 37
  }
]
```

### 7.3. Config nganh (CMS)

```
GET https://www.vietcap.com.vn/api/cms-service/v1/config/industry?language=1
```

> Tra ve danh sach nganh voi ten hien thi, `language=1` la tieng Viet, `language=2` la tieng Anh.

### 7.4. File Sector JSON (static)

```
GET https://trading.vietcap.com.vn/vietcap-iq/language/vi/sector.json?v={timestamp}
```

> File JSON tinh chua thong tin nganh de hien thi tren UI.

---

## 8. Dinh Gia (Valuation P/E, P/B)

### 8.1. P/E - TTM

```
GET https://trading.vietcap.com.vn/api/iq-insight-service/v1/market-watch/index-valuation
    ?type=pe
    &comGroupCode=VNINDEX
    &timeFrame=ONE_YEAR
```

### 8.2. P/B - TTM

```
GET https://trading.vietcap.com.vn/api/iq-insight-service/v1/market-watch/index-valuation
    ?type=pb
    &comGroupCode=VNINDEX
    &timeFrame=ONE_YEAR
```

**Query Params:**

| Param | Mo ta | Gia tri |
|-------|-------|---------|
| `type` | Loai chi so | `pe`, `pb` |
| `comGroupCode` | Ma chi so / nhom | `VNINDEX`, `HNX30`, `VN30`... |
| `timeFrame` | Khung thoi gian | `SIX_MONTHS`, `YTD`, `ONE_YEAR`, `TWO_YEAR`, `FIVE_YEAR`, `ALL` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": {
    "values": [
      {
        "date": "2025-04-25",
        "value": 11.9267       // Gia tri P/E hoac P/B
      },
      {
        "date": "2025-04-28",
        "value": 11.8198
      }
    ]
  }
}
```

**Mapping timeFrame UI -> API:**

| UI | API timeFrame |
|----|---------------|
| 6M | `SIX_MONTHS` |
| YTD | `YTD` |
| 1Y | `ONE_YEAR` |
| 2Y | `TWO_YEAR` |
| 5Y | `FIVE_YEAR` |
| All | `ALL` |

---

## 9. Do Rong Thi Truong (Market Breadth)

Ty le co phieu tren/duoi duong EMA50 (hoac EMA20, SMA...).

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/market-watch/breadth
    ?condition=EMA50
    &exchange=HSX,HNX,UPCOM
    &enNumberOfDays=Y1
```

**Query Params:**

| Param | Mo ta | Gia tri |
|-------|-------|---------|
| `condition` | Dieu kien ky thuat | `EMA50`, `EMA20`, `SMA50`, `SMA200` |
| `exchange` | San GD (phay cach) | `HSX`, `HNX`, `UPCOM` hoac ket hop `HSX,HNX,UPCOM` |
| `enNumberOfDays` | Ky thoi gian | `M6` (6M), `YTD`, `Y1` (1Y), `Y2` (2Y), `Y5` (5Y), `ALL` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    {
      "condition": "EMA50",
      "count": 556,              // So CP tren EMA50
      "total": 1584,             // Tong so CP
      "percent": 0.351,          // Ty le (0-1)
      "tradingDate": "2025-04-25"
    },
    {
      "condition": "EMA50",
      "count": 583,
      "total": 1585,
      "percent": 0.3678,
      "tradingDate": "2025-04-28"
    }
  ]
}
```

**Mapping timeFrame UI -> API:**

| UI | enNumberOfDays |
|----|----------------|
| 6M | `M6` |
| YTD | `YTD` |
| 1Y | `Y1` |
| 2Y | `Y2` |
| 5Y | `Y5` |
| All | `ALL` |

---

## 10. Nhiet Do (Heatmap)

### 10.1. Heatmap theo Nganh ICB

```
POST https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getByIcb
```

**Request Body:**
```json
{
  "group": "ALL",              // "ALL" | "HOSE" | "HNX" | "UPCOM"
  "sector": "icb_code_2",     // Level ICB: "icb_code_1", "icb_code_2", "icb_code_3", "icb_code_4"
  "size": "MKC"               // Kich thuoc o: "MKC" (von hoa), "VOL" (khoi luong), "VAL" (gia tri)
}
```

**Response (array theo nganh):**
```json
[
  {
    "icb_code": 9500,
    "icb_name": "Cong nghe Thong tin",
    "en_icb_name": "Technology",
    "icbChangePercent": -1.1344,                        // % thay doi nganh
    "totalCapMulChangePercent": -163441015203574.8,      // Tong von hoa * % thay doi
    "totalMarketCap": 144073963290550,                   // Tong von hoa nganh
    "data": [
      {
        "symbol": "FPT",
        "volume": 10459800,                   // KLGD
        "value": 769854.19,                   // GTGD (trieu VND)
        "price": 73400,                       // Gia hien tai
        "refPrice": 74300,                    // Gia tham chieu
        "marketCap": 126570579090300,          // Von hoa (VND)
        "ceilingPrice": 79500,                // Gia tran
        "floorPrice": 69100,                  // Gia san
        "foreignBuyVolume": 202192,
        "foreignSellVolume": 5861142,
        "foreignBuyValue": 14882098600,
        "foreignSellValue": 431376287300,
        "putThroughVolume": 793000,           // KL thoa thuan
        "putThroughValue": "..."
      }
    ]
  }
]
```

**Cac gia tri `sector` (ICB Level):**

| sector | Mo ta |
|--------|-------|
| `icb_code_1` | Super sector (cap 1 - it nganh, gop chung) |
| `icb_code_2` | Sector (cap 2 - phon bien nhat) |
| `icb_code_3` | Sub-sector (cap 3) |
| `icb_code_4` | Detail sector (cap 4 - chi tiet nhat) |

**Cac gia tri `size`:**

| size | Mo ta | UI |
|------|-------|-----|
| `MKC` | Von hoa thi truong | Mac dinh |
| `VOL` | Khoi luong giao dich | |
| `VAL` | Gia tri giao dich | |

### 10.2. Thong tin Index cho Heatmap

```
GET https://trading.vietcap.com.vn/api/market-watch/HeatMapChart/getIndex
```

**Response:**
```json
{
  "totalStock": 1538,                          // Tong so co phieu
  "totalTradingVolume": 794400925,             // Tong KLGD
  "totalTradingValue": 21139697.99194,         // Tong GTGD (trieu VND)
  "totalFrBuyVolume": 41925820,                // KL mua NN
  "totalFrSellVolume": 93163897,               // KL ban NN
  "totalFrBuyValue": 1624704273500,            // GT mua NN (VND)
  "totalFrSellValue": 3572863448780,           // GT ban NN (VND)
  "totalPtVolume": 1180355096,                 // KL thoa thuan
  "totalPtValue": 20561938811642,              // GT thoa thuan (VND)
  "indexData": [
    {
      "symbol": "VNINDEX",
      "price": 1853.29,
      "refPrice": 1870.36
    },
    {
      "symbol": "HNXIndex",
      "price": 251.95,
      "refPrice": 253.23
    },
    {
      "symbol": "HNXUpcomIndex",
      "price": 127.54,
      "refPrice": 128.31
    }
  ]
}
```

---

## 11. API Phu Tro (Supporting APIs)

### 11.1. OHLC Chart (Bieu do gia Index)

```
POST https://trading.vietcap.com.vn/api/chart/OHLCChart/gap
```

**Request Body:**
```json
{
  "from": 1745555081,              // Unix timestamp
  "to": 1777091082,
  "symbols": ["VNINDEX"],          // "VNINDEX", "HNXIndex", "VN30"...
  "timeFrame": "ONE_DAY"           // "ONE_MINUTE", "ONE_DAY", "ONE_WEEK", "ONE_MONTH"
}
```

### 11.2. Trang thai thi truong

```
GET https://trading.vietcap.com.vn/api/price/marketStatus/getAll
```

> Tra ve trang thai cac san: Pre-open, Open, Intermission, Close...

### 11.3. Ngay giao dich

```
POST https://trading.vietcap.com.vn/api/price/tradingDates/getAll
```

**Request Body:**
```json
{
  "limit": 21    // So ngay giao dich gan nhat
}
```

### 11.4. Top Stock Price

```
POST https://trading.vietcap.com.vn/api/market-data-service/v1/tickers/price/top-stock
```

**Request Body:**
```json
{
  "tickers": ["FPT", "VPB", "VIC", "VHM", "MBB", "..."]   // Danh sach ma CP
}
```

> Tra ve gia hien tai cua cac ma trong Vietcap Coverage Universe.

### 11.5. Ty gia USD/VND

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

## 12. Enum / Gia Tri Tham So

### `timeFrame` (Tong hop tat ca API)

| Gia tri | Mo ta | Dung cho API |
|---------|-------|-------------|
| `ONE_MINUTE` | 1 phut | Liquidity intraday |
| `ONE_DAY` | 1 ngay / Hom nay | Index Impact, Foreign, OHLC |
| `ONE_WEEK` | 1 tuan | Index Impact, Foreign, OHLC |
| `ONE_MONTH` | 1 thang | Index Impact, Foreign, OHLC |
| `YTD` | Tu dau nam | Index Impact, Foreign, Proprietary |
| `ONE_YEAR` | 1 nam | Tat ca API |
| `SIX_MONTHS` | 6 thang | Valuation P/E P/B |
| `TWO_YEAR` | 2 nam | Valuation P/E P/B |
| `FIVE_YEAR` | 5 nam | Valuation P/E P/B |
| `ALL` | Tat ca | Valuation P/E P/B, Breadth |

### `group` / `market` / `exchange`

| Gia tri | Mo ta | API su dung |
|---------|-------|-------------|
| `ALL` | Toan thi truong | Tat ca POST API |
| `HOSE` / `HSX` | San HOSE | group dung `HOSE`, exchange dung `HSX` |
| `HNX` | San HNX | Tat ca |
| `UPCOM` | San UPCOM | Tat ca |

### `enNumberOfDays` (Breadth API)

| Gia tri | Mo ta |
|---------|-------|
| `M6` | 6 thang |
| `YTD` | Tu dau nam |
| `Y1` | 1 nam |
| `Y2` | 2 nam |
| `Y5` | 5 nam |
| `ALL` | Tat ca |

### `condition` (Breadth API)

| Gia tri | Mo ta |
|---------|-------|
| `EMA50` | Exponential Moving Average 50 ngay |
| `EMA20` | Exponential Moving Average 20 ngay |
| `SMA50` | Simple Moving Average 50 ngay |
| `SMA200` | Simple Moving Average 200 ngay |

### `type` (Valuation API)

| Gia tri | Mo ta |
|---------|-------|
| `pe` | Price to Earnings (TTM) |
| `pb` | Price to Book (TTM) |

### `comGroupCode` (Valuation API)

| Gia tri | Mo ta |
|---------|-------|
| `VNINDEX` | Chi so VN-Index |
| `HNX30` | Chi so HNX30 |
| `VN30` | Chi so VN30 |
| `VNMIDCAP` | VN MidCap |
| `VNSMALLCAP` | VN SmallCap |
| `VN100` | VN100 |

### `sector` (Heatmap API)

| Gia tri | Mo ta |
|---------|-------|
| `icb_code_1` | ICB Level 1 (Super sector) |
| `icb_code_2` | ICB Level 2 (Sector) - mac dinh |
| `icb_code_3` | ICB Level 3 (Sub-sector) |
| `icb_code_4` | ICB Level 4 (Detail) |

### `size` (Heatmap API)

| Gia tri | Mo ta |
|---------|-------|
| `MKC` | Market Cap (Von hoa) |
| `VOL` | Volume (Khoi luong) |
| `VAL` | Value (Gia tri) |

---

## Ghi Chu Ky Thuat

1. **Unix Timestamp**: Tat ca cac field `from`, `to`, `truncTime`, `t` deu su dung **epoch seconds** (khong phai milliseconds).
2. **Don vi tien**: 
   - Cac field `*Value` tra ve don vi **VND** (dong).
   - `accumulatedValue` trong Liquidity API tra ve don vi **trieu VND**.
   - De chuyen sang **ty VND**: chia cho 1,000,000,000.
3. **Hau to timeFrame trong response**: Mot so API (AllocatedValue) co hau to dong nhu `_t_last_year`, `_t_today` trong ten field - thay doi theo `timeFrame` request.
4. **Rate Limit**: Chua xac dinh chinh xac. Nen cache du lieu va goi moi 30s-60s.
5. **CORS**: API chi cho phep tu domain `trading.vietcap.com.vn` va `iq.vietcap.com.vn`. Tu backend nen goi truc tiep khong bi CORS.
