# Vietcap Sector Page API

> Trang: `https://trading.vietcap.com.vn/iq/sector`
> Ngay phan tich: 2026-04-25

---

## Muc Luc

1. [Tong Quan Trang](#1-tong-quan-trang)
2. [Tab Xep Hang — Sector Ranking](#2-tab-xep-hang--sector-ranking)
   - 2.1. [Ngay Giao Dich (Trading Dates)](#21-ngay-giao-dich-trading-dates)
   - 2.2. [Xep Hang Nganh (Sector Ranking Scores)](#22-xep-hang-nganh-sector-ranking-scores)
3. [Tab Thong Tin — Sector Information](#3-tab-thong-tin--sector-information)
4. [API Ho Tro (Supporting APIs)](#4-api-ho-tro-supporting-apis)
   - 4.1. [Ma Nganh ICB (ICB Codes)](#41-ma-nganh-icb-icb-codes)
   - 4.2. [File Ngon Ngu Nganh (Sector Language File)](#42-file-ngon-ngu-nganh-sector-language-file)
5. [Mapping Param — UI Filter](#5-mapping-param--ui-filter)

---

## 1. Tong Quan Trang

Trang Nganh (`/iq/sector`) co 2 tab chinh:

| Tab | Mo ta | API chinh |
|-----|-------|-----------|
| **Xep Hang** | Bang heatmap diem suc manh nganh theo ngay | `sector-ranking/sectors` |
| **Thong Tin** | Bang thong tin von hoa, ty trong, hieu suat cac ky | `sector-information` |

Ca 2 tab deu co **Cai dat** (gear icon) de thay doi:
- **Nganh**: ICB level 1–4
- **GTGD trung binh**: 1M, 3M, 6M (chi cho tab Xep Hang)
- **Khoang**: > 3 ty, > 5 ty, > 10 ty VND (chi cho tab Xep Hang)
- **Tin hieu / Hieu suat song**: Toggle on/off (chi cho tab Xep Hang, dieu khien hien thi UI)

---

## 2. Tab Xep Hang — Sector Ranking

### 2.1. Ngay Giao Dich (Trading Dates)

Lay danh sach 20 ngay giao dich gan nhat de lam header cot cho bang heatmap.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/trading-date
```

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    "2026-04-24",
    "2026-04-23",
    "2026-04-22",
    "2026-04-21",
    "2026-04-20",
    "2026-04-17",
    "2026-04-16",
    "2026-04-15",
    "2026-04-14",
    "2026-04-13",
    "2026-04-10",
    "2026-04-09",
    "2026-04-08",
    "2026-04-07",
    "2026-04-06",
    "2026-04-03",
    "2026-04-02",
    "2026-04-01",
    "2026-03-31",
    "2026-03-30"
  ]
}
```

**Ghi chu:**
- Luon tra ve **20 ngay** giao dich gan nhat (bo ngay nghi, ngay le)
- Dung de render header cot cua bang heatmap

---

### 2.2. Xep Hang Nganh (Sector Ranking Scores)

Lay diem suc manh tung nganh theo ngay. Day la API chinh cua tab "Xep Hang".

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/sectors
    ?icbLevel=2
    &adtv=3
    &value=3
```

**Query Params:**

| Param | Mo ta | Gia tri | Mac dinh |
|-------|-------|---------|----------|
| `icbLevel` | Cap phan nganh ICB | `1`, `2`, `3`, `4` | `2` |
| `adtv` | GTGD trung binh (so thang) | `1`, `3`, `6` | `3` |
| `value` | Nguong GTGD toi thieu (ty VND) | `3`, `5`, `10` | `3` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    {
      "name": "8300",                           // Ma nganh ICB
      "values": [
        {
          "date": "2026-04-24",                 // Ngay giao dich
          "value": 59                            // Diem suc manh (0-100)
        },
        {
          "date": "2026-04-23",
          "value": 59
        },
        {
          "date": "2026-04-07",
          "value": 36,
          "sectorTrend": "DOWN",                // Xu huong: "UP" | "DOWN"
          "extremeValue": 35,                   // Diem cuc tri cua xu huong
          "trendStartValue": 41                 // Diem bat dau xu huong
        }
      ]
    }
  ]
}
```

**Chi tiet cac field trong `values[]`:**

| Field | Kieu | Mo ta |
|-------|------|-------|
| `date` | string | Ngay giao dich (YYYY-MM-DD) |
| `value` | int | Diem suc manh nganh (0–100). Cao = manh |
| `sectorTrend` | string? | Xu huong tai ngay nay: `"UP"` hoac `"DOWN"`. Chi co khi co tin hieu |
| `extremeValue` | int? | Diem cuc tri (dinh/day) cua xu huong hien tai |
| `trendStartValue` | int? | Diem bat dau xu huong hien tai |

**So nganh tra ve theo icbLevel:**

| icbLevel | So nganh | Vi du |
|----------|----------|-------|
| 1 | 11 | Tai chinh (8000), Cong nghiep (2000)... |
| 2 | 16 | Ngan hang (8300), Bat dong san (8600)... |
| 3 | 19 | Ngan hang (8530), Bao hiem nhan tho (8570)... |
| 4 | 21 | Ngan hang (8355), Bao hiem phi nhan tho (8536)... |

**Mapping diem suc manh tren UI:**

| Score | Mau sac | Y nghia |
|-------|---------|---------|
| >= 60 | Xanh dam | Manh |
| 50–59 | Xam | Trung tinh |
| < 50 | — | Yeu |

**UI Mapping:**
- Hang = nganh, sap xep giam dan theo diem ngay gan nhat
- Cot = ngay giao dich (20 ngay)
- O = diem suc manh, to mau theo do manh/yeu
- "Tin hieu" toggle: hien thi mui ten UP/DOWN tai o co `sectorTrend`
- "Hieu suat song" toggle: hien thi them thong tin wave performance tren UI

**Mapping UI Filter → API Param:**

| UI | Param | Gia tri UI → API |
|----|-------|-----------------|
| Nganh (dropdown) | `icbLevel` | ICB level 1 → `1`, ICB level 2 → `2`, ICB level 3 → `3`, ICB level 4 → `4` |
| GTGD trung binh (dropdown) | `adtv` | 1M → `1`, 3M → `3`, 6M → `6` |
| Khoang (dropdown) | `value` | > 3 ty VND → `3`, > 5 ty VND → `5`, > 10 ty VND → `10` |
| Tin hieu (toggle) | — | Client-side only, hien/an `sectorTrend` arrows |
| Hieu suat song (toggle) | — | Client-side only |

---

## 3. Tab Thong Tin — Sector Information

Lay thong tin von hoa, ty trong, va hieu suat gia cua cac nganh.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-information
    ?icbLevel=2
```

**Query Params:**

| Param | Mo ta | Gia tri | Mac dinh |
|-------|-------|---------|----------|
| `icbLevel` | Cap phan nganh ICB | `1`, `2`, `3`, `4` | `2` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    {
      "icbCode": "8600",                               // Ma nganh ICB
      "marketCap": 2904291991948489,                    // Von hoa (VND)
      "last20DayIndex": [                               // Chi so nganh 20 ngay gan nhat
        694.31, 721.86, 727.84, 730.3, 726.51,
        726.51, 729.55, 773.6, 762.08, 766.59,
        789.77, 812.56, 853.58, 895.73, 883.75,
        903.34, 908.77, 951.55, 965.06, 947.85
      ],
      "lastCloseIndex": 947.85,                         // Chi so dong cua gan nhat
      "percentPriceChange1Day": -0.0178,                // % thay doi 1 ngay
      "percentPriceChange1Week": 0.0725,                // % thay doi 1 tuan
      "percentPriceChange1Month": 0.4521,               // % thay doi 1 thang
      "percentPriceChange6Month": 0.3902,               // % thay doi 6 thang
      "percentPriceChangeYTD": 0.1233,                  // % thay doi YTD
      "percentPriceChange1Year": 1.7349,                // % thay doi 1 nam
      "percentPriceChange2Year": 2.1541,                // % thay doi 2 nam
      "percentPriceChange5Year": 0.8547                 // % thay doi 5 nam
      }
  ]
}
```

**UI Mapping:**

| Cot UI | Field | Ghi chu |
|--------|-------|---------|
| Nganh | `icbCode` → map ten qua `icb-codes` hoac `sector.json` | |
| Von Hoa (ty VND) | `marketCap / 1e9` | Chia 10^9 de doi ra ty |
| Ty Trong (%) | `marketCap / totalMarketCap * 100` | Tinh tren client |
| % Thay Doi | `percentPriceChange1Day` | Gia tri la decimal (0.01 = 1%) |
| 20 Ngay Gan Nhat | `last20DayIndex[]` | Ve sparkline chart |
| 1W % | `percentPriceChange1Week` | |
| 1M % | `percentPriceChange1Month` | |
| 6M % | `percentPriceChange6Month` | |
| YTD % | `percentPriceChangeYTD` | |
| 1Y % | `percentPriceChange1Year` | |
| 2Y % | `percentPriceChange2Year` | |
| 5Y % | `percentPriceChange5Year` | |

**So nganh tra ve theo icbLevel:**

| icbLevel | So nganh |
|----------|----------|
| 1 | 13 |
| 2 | 19 |
| 3 | 40 |
| 4 | 106 |

**Ghi chu:**
- `Ty Trong` khong co trong response, client tu tinh = `marketCap / sum(allMarketCap) * 100`
- `Tong` (dong dau tien tren UI) = `sum(marketCap)` cua tat ca nganh
- Hang "Tong" hien thi: tong von hoa, 100%, va khong co % thay doi
- Cai dat tab nay chi co **Nganh** (ICB level), khong co GTGD/Khoang

---

## 4. API Ho Tro (Supporting APIs)

### 4.1. Ma Nganh ICB (ICB Codes)

Da ghi nhan trong `vietcap-market-overview-api.md` muc 7.1. Dung de map `icbCode` → ten nganh.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes
```

### 4.2. File Ngon Ngu Nganh (Sector Language File)

File JSON tinh chua ten nganh theo ngon ngu.

```
GET https://trading.vietcap.com.vn/vietcap-iq/language/vi/sector.json?v={timestamp}
```

**Ghi chu:**
- `v` = cache buster (timestamp)
- Tra ve map `icbCode → { vi: "ten tieng Viet", en: "ten tieng Anh" }`
- Dung ket hop voi `icb-codes` API de hien thi ten nganh tren UI

---

## 5. Mapping Param — UI Filter

### Tab Xep Hang

```
Cai dat:
┌───────────────────────────────────┐
│ Nganh         │ ICB level 2   ▼  │  → icbLevel=2
│ GTGD trung binh │ 3M          ▼  │  → adtv=3
│ Khoang        │ > 3 ty VND   ▼  │  → value=3
│ Tin hieu      │ ○ (off)         │  → client-side only
│ Hieu suat song│ ○ (off)         │  → client-side only
└───────────────────────────────────┘
```

**Gia tri Nganh:**

| UI | `icbLevel` |
|----|-----------|
| ICB level 1 | `1` |
| ICB level 2 | `2` |
| ICB level 3 | `3` |
| ICB level 4 | `4` |

**Gia tri GTGD trung binh:**

| UI | `adtv` |
|----|--------|
| 1M | `1` |
| 3M | `3` |
| 6M | `6` |

**Gia tri Khoang:**

| UI | `value` |
|----|---------|
| > 3 ty VND | `3` |
| > 5 ty VND | `5` |
| > 10 ty VND | `10` |

### Tab Thong Tin

```
Cai dat:
┌───────────────────────────────────┐
│ Nganh         │ ICB level 2   ▼  │  → icbLevel=2
│                                   │
│ GHIM COT: Nganh                  │
│ COT DONG:                        │
│   ☑ Von Hoa (ty VND)            │
│   ☑ Ty Trong (%)                │
│   ☑ % Thay Doi                  │
│   ☑ 20 Ngay Gan Nhat            │
│   ☑ 1W %                        │
│   ☑ 1M %                        │
│   ☑ 6M %                        │
│   ☑ YTD %                       │
│   ☑ 1Y %                        │
│   ☑ 2Y %                        │
│   ☑ 5Y %                        │
└───────────────────────────────────┘
```

- Chi co `Nganh` (icbLevel) anh huong API
- Cac checkbox con lai chi an/hien cot tren UI (client-side)

---

## Tong Hop API

| # | API | Method | Endpoint | Tab |
|---|-----|--------|----------|-----|
| 1 | **Ngay giao dich** | GET | `.../sector-ranking/trading-date` | Xep Hang |
| 2 | **Xep hang nganh** | GET | `.../sector-ranking/sectors?icbLevel=&adtv=&value=` | Xep Hang |
| 3 | **Thong tin nganh** | GET | `.../sector-information?icbLevel=` | Thong Tin |
| 4 | Ma nganh ICB | GET | `.../sectors/icb-codes` | Chung |
| 5 | File ngon ngu | GET | `.../language/vi/sector.json` | Chung |
