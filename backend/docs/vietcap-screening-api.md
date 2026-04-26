# Vietcap Screening (Bo Loc Co Phieu) API

> Trang: `https://trading.vietcap.com.vn/iq/screening`
> Ngay phan tich: 2026-04-25

---

## Muc Luc

1. [Tong Quan Trang](#1-tong-quan-trang)
2. [Tieu Chi Loc (Screening Criteria)](#2-tieu-chi-loc-screening-criteria)
3. [Ket Qua Loc (Screening Paging)](#3-ket-qua-loc-screening-paging)
4. [Bo Loc Mac Dinh (Preset Screeners)](#4-bo-loc-mac-dinh-preset-screeners)
5. [Chi Tiet Tieu Chi Theo Nhom](#5-chi-tiet-tieu-chi-theo-nhom)

---

## 1. Tong Quan Trang

Trang Bo Loc Co Phieu cho phep loc co phieu theo nhieu tieu chi:

| Nhom | UI Sidebar | Category API | Tieu chi |
|------|-----------|-------------|----------|
| **Thong tin chung** | Thong tin chung | `general` | San, Nganh, Von hoa, Gia, % Thay doi, GTGD, KL... |
| **Tin hieu ky thuat** | Tin hieu ky thuat | `technical` | Suc manh gia, RS, RSI, EMA, MACD, ADX, Ichimoku... |
| **Chi so tai chinh** | Chi so tai chinh | `fundamental` | P/E, P/B, ROE, Tang truong LN, Doanh thu, Bien LN... |

**Dropdown "Bo loc co phieu"** o goc trai tren: Chon bo loc mac dinh hoac tao moi.

---

## 2. Tieu Chi Loc (Screening Criteria)

Lay danh sach tat ca tieu chi loc va cac gia tri co the.

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
      "category": "general",                    // Nhom: general | technical | fundamental
      "name": "sectorLv1",                      // Ten tieu chi (dung trong filter)
      "order": 1,                                // Thu tu hien thi
      "allowDuplicate": false,                   // Co cho phep them nhieu lan khong
      "selectType": "multiple",                  // Kieu chon: "multiple" (multi-select)
      "sliderStepper": null,                     // Buoc nhay slider (null = khong co slider)
      "multiplier": null,                        // He so nhan (null = khong nhan)
      "min": null,                               // Gia tri min slider
      "max": null,                               // Gia tri max slider
      "conditionOptions": [                      // Cac lua chon
        {
          "type": "value",                       // "value" = chon gia tri, "range" = khoang
          "viName": "Bat dong san",
          "enName": "Real Estate",
          "value": "8600"
        }
      ],
      "conditionExtra": null,                    // Tuy chon phu (period, EMA type...)
      "active": true
    }
  ]
}
```

### Danh sach 34 tieu chi

#### General (Thong tin chung)

| # | name | UI Label | Kieu | Min | Max | conditionExtra |
|---|------|----------|------|-----|-----|----------------|
| 1 | `sectorLv1` | Nganh (Level 1) | multi-select | — | — | — |
| 2 | `sector` | Nganh (Level 2) | multi-select | — | — | — |
| 3 | `sectorLv3` | Nganh (Level 3) | multi-select | — | — | — |
| 4 | `sectorLv4` | Nganh (Level 4) | multi-select | — | — | — |
| 5 | `exchange` | San | multi-select | — | — | — |
| 6 | `marketCap` | Von hoa (ty VND) | range/slider | 0 | 2,000,000 | — |
| 7 | `marketPrice` | Gia (VND) | range/slider | 0 | 2,000,000 | — |
| 8 | `dailyPriceChangePercent` | Thay doi gia (%) | range/slider | -15 | 15 | — |
| 9 | `adtv` | GTGD trung binh (ty VND) | range/slider | 0 | 2,000 | `10Days`, `20Days`, **`30Days`** |
| 10 | `tradingValueAdtv` | GTGD/ADTV (%) | range/slider | — | — | `10Days`, `20Days`, **`30Days`** |
| 11 | `avgVolume` | KL trung binh | range/slider | 0 | 200,000,000 | `10Days`, `20Days`, **`30Days`** |
| 12 | `esVolumeVsAvgVolume` | KL uoc tinh/KL TB (%) | range/slider | — | — | `10Days`, `20Days`, **`30Days`** |

#### Technical (Tin hieu ky thuat)

| # | name | UI Label | Kieu | Min | Max | conditionExtra |
|---|------|----------|------|-----|-----|----------------|
| 13 | `stockStrength` | Suc manh gia | range/slider | 0 | 100 | — |
| 14 | `rs` | RS (Relative Strength) | range/slider | 0 | 100 | `1Month`, **`3Month`**, `6Month`, `12Month` |
| 15 | `rsi` | RSI | range/slider | 0 | 100 | — |
| 16 | `priceEma` | Gia vs EMA (%) | range/slider | -50 | 50 | **`ema20`**, `ema50`, `ema100`, `ema200` |
| 17 | `ema20Ema50` | EMA20 vs EMA50 (%) | range/slider | — | — | — |
| 18 | `ema50Ema200` | EMA50 vs EMA200 (%) | range/slider | — | — | — |
| 19 | `priceReturn` | Hieu suat gia (%) | range/slider | -100 | 100 | `Ytd`, `1Month`, **`3Month`**, `6Month`, `12Month` |
| 20 | `outperformsIndex` | Vuot chi so (%) | range/slider | — | — | `Ytd`, `1Month`, **`3Month`**, `6Month`, `12Month` |
| 21 | `priceFluctuation` | Bien dong gia (%) | range/slider | — | — | `1Month`, **`3Month`**, `6Month`, `12Month` |
| 22 | `macd` | MACD | range/slider | — | — | — |
| 23 | `histogram` | MACD Histogram | value-select | — | — | — |
| 24 | `adx` | ADX | range/slider | 0 | 100 | — |
| 25 | `stockTrend` | Xu huong co phieu | value-select | — | — | — |
| 26 | `aoTrend` | AO Trend | value-select | — | — | — |
| 27 | `ichimoku` | Ichimoku | value-select | — | — | — |

#### Fundamental (Chi so tai chinh)

| # | name | UI Label | Kieu | Min | Max | conditionExtra |
|---|------|----------|------|-----|-----|----------------|
| 28 | `ttmPe` | P/E (x) | range/slider | 0 | 100 | — |
| 29 | `ttmPb` | P/B (x) | range/slider | 0 | 100 | — |
| 30 | `ttmRoe` | ROE (%) | range/slider | -50 | 50 | — |
| 31 | `npatmiGrowth` | Tang truong LN (%) | range/slider | -100 | 500 | Quarters + `YoY`/`QoQ` |
| 32 | `revenueGrowth` | Tang truong DT (%) | range/slider | -100 | 500 | Quarters + `YoY`/`QoQ` |
| 33 | `netMargin` | Bien LN rong (%) | range/slider | — | — | — |
| 34 | `grossMargin` | Bien LN gop (%) | range/slider | — | — | — |

> **Bold** = gia tri mac dinh cua `conditionExtra`

### Cac gia tri value-select dac biet

**`histogram` (MACD Histogram):**
- `aboveSignal` — Tren duong tin hieu
- `belowSignal` — Duoi duong tin hieu

**`stockTrend` (Xu huong):**
- `STRONG_UPTREND` — Da tang manh
- `UPTREND` — Da tang
- `DOWNTREND` — Da giam
- `STRONG_DOWNTREND` — Da giam manh

**`aoTrend` (AO Trend):**
- `ABOVE_ZERO` — Tren 0
- `BELOW_ZERO` — Duoi 0
- `CROSS_ABOVE` — Cat len tren 0
- `CROSS_BELOW` — Cat xuong duoi 0

**`ichimoku` (Ichimoku):**
- `PRICE_ABOVE_CLOUD` — Gia tren may
- `PRICE_IN_CLOUD` — Gia trong may
- `PRICE_BELOW_CLOUD` — Gia duoi may
- `CROSS_ABOVE` — Cat len tren may

---

## 3. Ket Qua Loc (Screening Paging)

API chinh de loc va lay danh sach co phieu thoa dieu kien.

```
POST https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/paging
```

**Request Body:**
```json
{
  "page": 0,                                    // Trang (0-indexed)
  "pageSize": 50,                               // So ket qua / trang
  "sortFields": ["stockStrength"],              // Cot sap xep (mang, co the nhieu cot)
  "sortOrders": ["DESC"],                       // Thu tu: "ASC" | "DESC"
  "filter": [                                   // Mang dieu kien loc
    {
      "name": "exchange",                        // Ten tieu chi (tu criteria API)
      "conditionOptions": [                      // Dieu kien
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
        { "from": 500, "to": 100000 }           // Range: from-to
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
      "extraName": "3Month"                      // Tuy chon phu (period)
    },
    {
      "name": "priceEma",
      "conditionOptions": [
        { "from": 0, "to": 50 }
      ],
      "extraName": "ema20"                       // Tuy chon phu (loai EMA)
    }
  ]
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "content": [                                 // Danh sach co phieu
      {
        "ticker": "FCC",
        "exchange": "UPCOM",                     // San: "HSX" | "HNX" | "UPCOM"
        "refPrice": 47200,                       // Gia tham chieu
        "ceiling": 54200,                        // Gia tran
        "marketPrice": 47200,                    // Gia hien tai
        "floor": 40200,                          // Gia san
        "accumulatedValue": 0,                   // Tong GTGD (VND)
        "accumulatedVolume": 0,                  // Tong KLGD
        "marketCap": 283060288000,               // Von hoa (VND)
        "dailyPriceChangePercent": 0,            // % thay doi gia
        "tradingValueAdtv10Days": -100,          // GTGD/ADTV 10 ngay (%)
        "estVolume": 0,                          // KL uoc tinh
        "matchPriceTime": "2026-04-24T03:08:04.962",
        "emaTime": "1776384000",
        "lastModifiedDate": "2026-04-24T08:23:35.857",
        "enOrganName": "Foodstuff Combinatorial Joint Stock Company",
        "enOrganShortName": "Foodstuff Combinatorial",
        "viOrganName": "Cong ty Co phan Lien hop Thuc pham",
        "viOrganShortName": "Lien hop Thuc pham",
        "icbCodeLv2": "8600",                    // Ma nganh ICB level 2
        "enSector": "Real Estate",
        "viSector": "Bat dong san",
        "icbCodeLv4": "8633",                    // Ma nganh ICB level 4
        "stockStrength": 99                      // Diem suc manh gia (0-100)
      }
    ],
    "pageable": { ... },
    "totalElements": 312,                        // Tong so ket qua
    "totalPages": 157,                           // Tong so trang
    "last": false,
    "first": true,
    "size": 2,                                   // Page size
    "number": 0,                                 // Trang hien tai
    "numberOfElements": 2,
    "empty": false
  }
}
```

**UI Mapping:**

| Cot UI | Field |
|--------|-------|
| Ma | `ticker` |
| Gia | `marketPrice` |
| Thay Doi Gia | `dailyPriceChangePercent` |
| Suc Manh Gia | `stockStrength` |
| San | `exchange` |
| Nganh | `viSector` |

**Ghi chu:**
- `sortFields` va `sortOrders` la mang — ho tro sort nhieu cot
- Filter rong `[]` → tra ve tat ca co phieu (mac dinh 1336 ma)
- Filter `exchange` + `sectorLv1` luon duoc gui (mac dinh = tat ca san + tat ca nganh)
- `conditionOptions` dung `{ type: "value", value: "..." }` cho multi-select, `{ from: X, to: Y }` cho range
- `extraName` chi can gui khi tieu chi co `conditionExtra` (vd: RS + "3Month", priceEma + "ema20")

---

## 4. Bo Loc Mac Dinh (Preset Screeners)

Lay danh sach bo loc mac dinh tu Vietcap va bo loc do nguoi dung tao.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/setting/screeners
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "SYSTEM": [                                  // Bo loc tu Vietcap
      {
        "id": "65fe3efc5712c6ec79202e58",
        "name": "Leading Stocks",
        "viName": "Top CP manh nhat",
        "mode": "slider",
        "order": 1,
        "metrics": [                             // Danh sach filter tuong ung
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

**3 Bo Loc He Thong (SYSTEM):**

| # | name | viName | Tieu chi chinh |
|---|------|--------|---------------|
| 1 | Leading Stocks | Top CP manh nhat | ADTV > 10B, RSI 50-100, Gia > EMA20/50, RS > 90, EMA20 > EMA50 |
| 2 | Good Profit Stocks | Co phieu loi nhuan tot | Gia > 10k, ADTV > 10B, Gia > EMA20, NPATMI growth > 0 (2 ky) |
| 3 | Accumulation Stocks | Co phieu tich luy | ADTV > 10B, RSI 25-50, Gia < EMA20/50, Bien dong < 10% |

**Ghi chu:**
- `metrics` co cung format voi `filter` trong API `paging` → co the gui truc tiep
- Khi chua dang nhap, chi co `SYSTEM` screeners
- Khi da dang nhap, co them `USER` category chua bo loc tu tao
- UI: Dropdown "Bo loc co phieu" > "BO LOC TU VIETCAP" hien thi 3 bo loc nay

---

## 5. Chi Tiet Tieu Chi Theo Nhom

### 5.1. Tieu chi dang multi-select (value)

Ap dung cho: `sectorLv1`, `sector`, `sectorLv3`, `sectorLv4`, `exchange`

```json
// Filter format
{
  "name": "exchange",
  "conditionOptions": [
    { "type": "value", "value": "hsx" },
    { "type": "value", "value": "hnx" }
  ]
}
```

**Gia tri `exchange`:**
- `hsx` — HOSE
- `hnx` — HNX
- `upcom` — UPCOM

**Gia tri `sectorLv1`:** 13 nganh ICB Level 1 (xem API criteria)

### 5.2. Tieu chi dang range (slider)

Ap dung cho: `marketCap`, `marketPrice`, `dailyPriceChangePercent`, `adtv`, `stockStrength`, `rs`, `rsi`, `priceEma`, `ttmPe`, `ttmPb`, `ttmRoe`...

```json
// Filter format
{
  "name": "stockStrength",
  "conditionOptions": [
    { "from": 70, "to": 100 }
  ]
}
```

**Voi `conditionExtra` (dropdown phu):**
```json
{
  "name": "rs",
  "conditionOptions": [{ "from": 50, "to": 100 }],
  "extraName": "3Month"
}
```

**Gia tri `conditionExtra` theo tieu chi:**

| Tieu chi | Cac gia tri | Mac dinh |
|----------|------------|----------|
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

### 5.3. Tieu chi dang value-select (chon 1 gia tri)

Ap dung cho: `histogram`, `stockTrend`, `aoTrend`, `ichimoku`

```json
// Filter format
{
  "name": "stockTrend",
  "conditionOptions": [
    { "type": "value", "value": "STRONG_UPTREND" }
  ]
}
```

---

## Tong Hop API

| # | API | Method | Endpoint | Muc dich |
|---|-----|--------|----------|----------|
| 1 | **Tieu chi loc** | GET | `.../screening/criteria` | Lay 34 tieu chi loc + options |
| 2 | **Ket qua loc** | POST | `.../screening/paging` | Loc co phieu voi pagination + sorting |
| 3 | **Bo loc mac dinh** | GET | `.../setting/screeners` | 3 preset bo loc tu Vietcap |
