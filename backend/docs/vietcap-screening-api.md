# API Trang Bộ lọc cổ phiếu (Screening) Vietcap

> Trang: `https://trading.vietcap.com.vn/iq/screening`
> Ngày phân tích: 2026-04-25

---

## Mục lục

1. [Tổng quan trang](#1-tong-quan-trang)
2. [Tiêu chí lọc (Screening Criteria)](#2-tieu-chi-loc-screening-criteria)
3. [Kết quả lọc (Screening Paging)](#3-ket-qua-loc-screening-paging)
4. [Bộ lọc mặc định (Preset Screeners)](#4-bo-loc-mac-dinh-preset-screeners)
5. [Chi tiết tiêu chí theo nhóm](#5-chi-tiet-tieu-chi-theo-nhom)

---

## 1. Tổng quan trang

Trang Bộ lọc cổ phiếu cho phép lọc cổ phiếu theo nhiều tiêu chí:

| Nhóm | UI Sidebar | Category API | Tiêu chí |
|------|-----------|--------------|----------|
| **Thông tin chung** | Thông tin chung | `general` | Sàn, Ngành, Vốn hóa, Giá, % Thay đổi, GTGD, KL... |
| **Tín hiệu kỹ thuật** | Tín hiệu kỹ thuật | `technical` | Sức mạnh giá, RS, RSI, EMA, MACD, ADX, Ichimoku... |
| **Chỉ số tài chính** | Chỉ số tài chính | `fundamental` | P/E, P/B, ROE, Tăng trưởng LN, Doanh thu, Biên LN... |

**Dropdown "Bộ lọc cổ phiếu"** ở góc trái trên: chọn bộ lọc mặc định hoặc tạo mới.

---

## 2. Tiêu chí lọc (Screening Criteria)

Lấy danh sách tất cả tiêu chí lọc và các giá trị có thể có.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/criteria
```

**Response:**
```json
{
  "status": 200,
  "data": [
    {
      "id": "697cae6a1ac33a766fea7e53",
      "category": "general",
      "name": "sectorLv1",
      "order": 1,
      "allowDuplicate": false,
      "selectType": "multiple",
      "sliderStepper": null,
      "multiplier": null,
      "min": null,
      "max": null,
      "conditionOptions": [
        {
          "type": "value",
          "viName": "Bat dong san",
          "enName": "Real Estate",
          "value": "8600"
        }
      ],
      "conditionExtra": null,
      "active": true
    }
  ]
}
```

### Danh sách 34 tiêu chí

#### General (Thông tin chung)

| # | name | UI Label | Kiểu | Min | Max | conditionExtra |
|---|------|----------|------|-----|-----|----------------|
| 1 | `sectorLv1` | Ngành (Level 1) | multi-select | — | — | — |
| 2 | `sector` | Ngành (Level 2) | multi-select | — | — | — |
| 3 | `sectorLv3` | Ngành (Level 3) | multi-select | — | — | — |
| 4 | `sectorLv4` | Ngành (Level 4) | multi-select | — | — | — |
| 5 | `exchange` | Sàn | multi-select | — | — | — |
| 6 | `marketCap` | Vốn hóa (tỷ VND) | range/slider | 0 | 2,000,000 | — |
| 7 | `marketPrice` | Giá (VND) | range/slider | 0 | 2,000,000 | — |
| 8 | `dailyPriceChangePercent` | Thay đổi giá (%) | range/slider | -15 | 15 | — |
| 9 | `adtv` | GTGD trung bình (tỷ VND) | range/slider | 0 | 2,000 | `10Days`, `20Days`, **`30Days`** |
| 10 | `tradingValueAdtv` | GTGD/ADTV (%) | range/slider | — | — | `10Days`, `20Days`, **`30Days`** |
| 11 | `avgVolume` | KL trung bình | range/slider | 0 | 200,000,000 | `10Days`, `20Days`, **`30Days`** |
| 12 | `esVolumeVsAvgVolume` | KL ước tính / KL TB (%) | range/slider | — | — | `10Days`, `20Days`, **`30Days`** |

#### Technical (Tín hiệu kỹ thuật)

| # | name | UI Label | Kiểu | Min | Max | conditionExtra |
|---|------|----------|------|-----|-----|----------------|
| 13 | `stockStrength` | Sức mạnh giá | range/slider | 0 | 100 | — |
| 14 | `rs` | RS (Relative Strength) | range/slider | 0 | 100 | `1Month`, **`3Month`**, `6Month`, `12Month` |
| 15 | `rsi` | RSI | range/slider | 0 | 100 | — |
| 16 | `priceEma` | Giá vs EMA (%) | range/slider | -50 | 50 | **`ema20`**, `ema50`, `ema100`, `ema200` |
| 17 | `ema20Ema50` | EMA20 vs EMA50 (%) | range/slider | — | — | — |
| 18 | `ema50Ema200` | EMA50 vs EMA200 (%) | range/slider | — | — | — |
| 19 | `priceReturn` | Hiệu suất giá (%) | range/slider | -100 | 100 | `Ytd`, `1Month`, **`3Month`**, `6Month`, `12Month` |
| 20 | `outperformsIndex` | Vượt chỉ số (%) | range/slider | — | — | `Ytd`, `1Month`, **`3Month`**, `6Month`, `12Month` |
| 21 | `priceFluctuation` | Biến động giá (%) | range/slider | — | — | `1Month`, **`3Month`**, `6Month`, `12Month` |
| 22 | `macd` | MACD | range/slider | — | — | — |
| 23 | `histogram` | MACD Histogram | value-select | — | — | — |
| 24 | `adx` | ADX | range/slider | 0 | 100 | — |
| 25 | `stockTrend` | Xu hướng cổ phiếu | value-select | — | — | — |
| 26 | `aoTrend` | AO Trend | value-select | — | — | — |
| 27 | `ichimoku` | Ichimoku | value-select | — | — | — |

#### Fundamental (Chỉ số tài chính)

| # | name | UI Label | Kiểu | Min | Max | conditionExtra |
|---|------|----------|------|-----|-----|----------------|
| 28 | `ttmPe` | P/E (x) | range/slider | 0 | 100 | — |
| 29 | `ttmPb` | P/B (x) | range/slider | 0 | 100 | — |
| 30 | `ttmRoe` | ROE (%) | range/slider | -50 | 50 | — |
| 31 | `npatmiGrowth` | Tăng trưởng LN (%) | range/slider | -100 | 500 | Quarters + `YoY`/`QoQ` |
| 32 | `revenueGrowth` | Tăng trưởng DT (%) | range/slider | -100 | 500 | Quarters + `YoY`/`QoQ` |
| 33 | `netMargin` | Biên LN ròng (%) | range/slider | — | — | — |
| 34 | `grossMargin` | Biên LN gộp (%) | range/slider | — | — | — |

> **Bold** = giá trị mặc định của `conditionExtra`.

### Các giá trị value-select đặc biệt

**`histogram` (MACD Histogram):**
- `aboveSignal` — Trên đường tín hiệu
- `belowSignal` — Dưới đường tín hiệu

**`stockTrend` (Xu hướng):**
- `STRONG_UPTREND` — Đã tăng mạnh
- `UPTREND` — Đã tăng
- `DOWNTREND` — Đã giảm
- `STRONG_DOWNTREND` — Đã giảm mạnh

**`aoTrend` (AO Trend):**
- `ABOVE_ZERO` — Trên 0
- `BELOW_ZERO` — Dưới 0
- `CROSS_ABOVE` — Cắt lên trên 0
- `CROSS_BELOW` — Cắt xuống dưới 0

**`ichimoku`:**
- `PRICE_ABOVE_CLOUD` — Giá trên mây
- `PRICE_IN_CLOUD` — Giá trong mây
- `PRICE_BELOW_CLOUD` — Giá dưới mây
- `CROSS_ABOVE` — Cắt lên trên mây

---

## 3. Kết quả lọc (Screening Paging)

API chính để lọc và lấy danh sách cổ phiếu thỏa điều kiện.

```
POST https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/paging
```

**Request Body:**
```json
{
  "page": 0,
  "pageSize": 50,
  "sortFields": ["stockStrength"],
  "sortOrders": ["DESC"],
  "filter": [
    {
      "name": "exchange",
      "conditionOptions": [
        { "type": "value", "value": "hsx" },
        { "type": "value", "value": "hnx" }
      ]
    },
    {
      "name": "sectorLv1",
      "conditionOptions": [
        { "type": "value", "value": "8600" },
        { "type": "value", "value": "8300" }
      ]
    },
    {
      "name": "marketCap",
      "conditionOptions": [
        { "from": 500, "to": 100000 }
      ]
    },
    {
      "name": "stockStrength",
      "conditionOptions": [
        { "from": 70, "to": 100 }
      ]
    },
    {
      "name": "rs",
      "conditionOptions": [
        { "from": 50, "to": 100 }
      ],
      "extraName": "3Month"
    },
    {
      "name": "priceEma",
      "conditionOptions": [
        { "from": 0, "to": 50 }
      ],
      "extraName": "ema20"
    }
  ]
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "content": [
      {
        "ticker": "FCC",
        "exchange": "UPCOM",
        "refPrice": 47200,
        "ceiling": 54200,
        "marketPrice": 47200,
        "floor": 40200,
        "accumulatedValue": 0,
        "accumulatedVolume": 0,
        "marketCap": 283060288000,
        "dailyPriceChangePercent": 0,
        "tradingValueAdtv10Days": -100,
        "estVolume": 0,
        "matchPriceTime": "2026-04-24T03:08:04.962",
        "emaTime": "1776384000",
        "lastModifiedDate": "2026-04-24T08:23:35.857",
        "enOrganName": "Foodstuff Combinatorial Joint Stock Company",
        "enOrganShortName": "Foodstuff Combinatorial",
        "viOrganName": "Cong ty Co phan Lien hop Thuc pham",
        "viOrganShortName": "Lien hop Thuc pham",
        "icbCodeLv2": "8600",
        "enSector": "Real Estate",
        "viSector": "Bat dong san",
        "icbCodeLv4": "8633",
        "stockStrength": 99
      }
    ],
    "pageable": { "...": "..." },
    "totalElements": 312,
    "totalPages": 157,
    "last": false,
    "first": true,
    "size": 2,
    "number": 0,
    "numberOfElements": 2,
    "empty": false
  }
}
```

**Ánh xạ UI:**

| Cột UI | Field |
|--------|-------|
| Mã | `ticker` |
| Giá | `marketPrice` |
| Thay đổi giá | `dailyPriceChangePercent` |
| Sức mạnh giá | `stockStrength` |
| Sàn | `exchange` |
| Ngành | `viSector` |

**Ghi chú:**
- `sortFields` và `sortOrders` là mảng — hỗ trợ sort nhiều cột.
- Filter rỗng `[]` → trả về tất cả cổ phiếu (mặc định 1336 mã).
- Filter `exchange` + `sectorLv1` luôn được gửi (mặc định = tất cả sàn + tất cả ngành).
- `conditionOptions` dùng `{ type: "value", value: "..." }` cho multi-select, `{ from: X, to: Y }` cho range.
- `extraName` chỉ cần gửi khi tiêu chí có `conditionExtra` (ví dụ RS + "3Month", priceEma + "ema20").

---

## 4. Bộ lọc mặc định (Preset Screeners)

Lấy danh sách bộ lọc mặc định từ Vietcap và bộ lọc do người dùng tạo.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/setting/screeners
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "SYSTEM": [
      {
        "id": "65fe3efc5712c6ec79202e58",
        "name": "Leading Stocks",
        "viName": "Top CP manh nhat",
        "mode": "slider",
        "order": 1,
        "metrics": [
          {
            "name": "exchange",
            "category": "general",
            "conditionOptions": [
              { "type": "value", "value": "hsx" },
              { "type": "value", "value": "hnx" },
              { "type": "value", "value": "upcom" }
            ]
          },
          {
            "name": "adtv",
            "category": "general",
            "conditionOptions": [{ "from": 10000000000, "to": 2000000000000 }],
            "extraName": "20Days"
          },
          {
            "name": "rsi",
            "category": "technical",
            "conditionOptions": [{ "from": 50, "to": 100 }]
          },
          {
            "name": "priceEma",
            "category": "technical",
            "conditionOptions": [{ "from": 0, "to": 50 }],
            "extraName": "ema20"
          },
          {
            "name": "priceEma",
            "category": "technical",
            "conditionOptions": [{ "from": 0, "to": 50 }],
            "extraName": "ema50"
          },
          {
            "name": "rs",
            "category": "technical",
            "conditionOptions": [{ "from": 90, "to": 100 }],
            "extraName": "1Month"
          },
          {
            "name": "ema20Ema50",
            "category": "technical",
            "conditionOptions": [{ "from": 0, "to": 50 }]
          }
        ]
      }
    ]
  }
}
```

**3 bộ lọc hệ thống (SYSTEM):**

| # | name | viName | Tiêu chí chính |
|---|------|--------|----------------|
| 1 | Leading Stocks | Top CP mạnh nhất | ADTV > 10B, RSI 50–100, Giá > EMA20/50, RS > 90, EMA20 > EMA50 |
| 2 | Good Profit Stocks | Cổ phiếu lợi nhuận tốt | Giá > 10k, ADTV > 10B, Giá > EMA20, NPATMI growth > 0 (2 kỳ) |
| 3 | Accumulation Stocks | Cổ phiếu tích lũy | ADTV > 10B, RSI 25–50, Giá < EMA20/50, Biến động < 10% |

**Ghi chú:**
- `metrics` có cùng format với `filter` trong API `paging` → có thể gửi trực tiếp.
- Khi chưa đăng nhập, chỉ có `SYSTEM` screeners.
- Khi đã đăng nhập, có thêm `USER` category chứa bộ lọc tự tạo.
- UI: dropdown "Bộ lọc cổ phiếu" → "BỘ LỌC TỪ VIETCAP" hiển thị 3 bộ lọc này.

---

## 5. Chi tiết tiêu chí theo nhóm

### 5.1. Tiêu chí dạng multi-select (value)

Áp dụng cho: `sectorLv1`, `sector`, `sectorLv3`, `sectorLv4`, `exchange`.

```json
{
  "name": "exchange",
  "conditionOptions": [
    { "type": "value", "value": "hsx" },
    { "type": "value", "value": "hnx" }
  ]
}
```

**Giá trị `exchange`:**
- `hsx` — HOSE
- `hnx` — HNX
- `upcom` — UPCOM

**Giá trị `sectorLv1`:** 13 ngành ICB Level 1 (xem API criteria).

### 5.2. Tiêu chí dạng range (slider)

Áp dụng cho: `marketCap`, `marketPrice`, `dailyPriceChangePercent`, `adtv`, `stockStrength`, `rs`, `rsi`, `priceEma`, `ttmPe`, `ttmPb`, `ttmRoe`...

```json
{
  "name": "stockStrength",
  "conditionOptions": [
    { "from": 70, "to": 100 }
  ]
}
```

**Có `conditionExtra` (dropdown phụ):**
```json
{
  "name": "rs",
  "conditionOptions": [{ "from": 50, "to": 100 }],
  "extraName": "3Month"
}
```

**Giá trị `conditionExtra` theo tiêu chí:**

| Tiêu chí | Giá trị | Mặc định |
|----------|---------|----------|
| `adtv` | `10Days`, `20Days`, `30Days` | `30Days` |
| `avgVolume` | `10Days`, `20Days`, `30Days` | `30Days` |
| `tradingValueAdtv` | `10Days`, `20Days`, `30Days` | `30Days` |
| `esVolumeVsAvgVolume` | `10Days`, `20Days`, `30Days` | `30Days` |
| `rs` | `1Month`, `3Month`, `6Month`, `12Month` | `3Month` |
| `priceEma` | `ema20`, `ema50`, `ema100`, `ema200` | `ema20` |
| `priceReturn` | `Ytd`, `1Month`, `3Month`, `6Month`, `12Month` | `3Month` |
| `outperformsIndex` | `Ytd`, `1Month`, `3Month`, `6Month`, `12Month` | `3Month` |
| `priceFluctuation` | `1Month`, `3Month`, `6Month`, `12Month` | `3Month` |
| `npatmiGrowth` | Quarters (`Q1,2026`) + `YoY`/`QoQ` | — |
| `revenueGrowth` | Quarters (`Q1,2026`) + `YoY`/`QoQ` | — |

### 5.3. Tiêu chí dạng value-select (chọn 1 giá trị)

Áp dụng cho: `histogram`, `stockTrend`, `aoTrend`, `ichimoku`.

```json
{
  "name": "stockTrend",
  "conditionOptions": [
    { "type": "value", "value": "STRONG_UPTREND" }
  ]
}
```

---

## Tổng hợp API

| # | API | Method | Endpoint | Mục đích |
|---|-----|--------|----------|----------|
| 1 | **Tiêu chí lọc** | GET | `.../screening/criteria` | Lấy 34 tiêu chí lọc + options |
| 2 | **Kết quả lọc** | POST | `.../screening/paging` | Lọc cổ phiếu kèm pagination + sorting |
| 3 | **Bộ lọc mặc định** | GET | `.../setting/screeners` | 3 bộ lọc preset từ Vietcap |
