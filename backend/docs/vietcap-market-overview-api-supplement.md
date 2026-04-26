# Vietcap Market Overview API — Bo Sung

> Bo sung cac API con thieu trong `vietcap-market-overview-api.md`
> Ngay phan tich: 2026-04-25
> Trang: `https://trading.vietcap.com.vn/iq/market`

---

## Muc Luc

1. [Chi Tiet Nganh ICB (Sector Detail)](#1-chi-tiet-nganh-icb-sector-detail)
2. [Suc Manh Co Phieu (Stock Strength - TA)](#2-suc-manh-co-phieu-stock-strength---ta)
3. [Chi So Thi Truong (Market Index)](#3-chi-so-thi-truong-market-index)
4. [Thanh Tim Kiem (Search Bar Data)](#4-thanh-tim-kiem-search-bar-data)
5. [Ma Su Kien (Event Codes)](#5-ma-su-kien-event-codes)
6. [Thong Bao Bao Tri (Maintenance Notification)](#6-thong-bao-bao-tri-maintenance-notification)
7. [Bo Sung Chi Tiet Cho API Da Co](#7-bo-sung-chi-tiet-cho-api-da-co)

---

## 1. Chi Tiet Nganh ICB (Sector Detail)

> **Vi tri tren UI**: Tab Tong Quan > Muc "Phan Bo" > Bam vao ten nganh (vd: Ngan hang, Cong nghiep...)
> **Thieu trong file goc**: Hoan toan thieu — file goc chi co `getAllocated` (danh sach nganh), khong co `getAllocatedDetail` (chi tiet tung co phieu trong nganh).

```
POST https://trading.vietcap.com.vn/api/market-watch/AllocatedICB/getAllocatedDetail
```

**Request Body:**
```json
{
  "group": "ALL",            // "ALL" | "HOSE" | "HNX" | "UPCOM"
  "timeFrame": "ONE_DAY",   // "ONE_DAY" | "ONE_WEEK" | "ONE_MONTH" | "YTD" | "ONE_YEAR"
  "icbCode": 8300            // Ma nganh ICB (lay tu getAllocated hoac icb-codes)
}
```

**Response:**
```json
{
  "icb_code": 8300,
  "icbChangePercent": -0.8919,              // % thay doi cua nganh trong ky
  "totalValue": 4580663735000,              // Tong GTGD nganh (VND)
  "totalStockIncrease": 6,                  // So CP tang
  "totalStockDecrease": 15,                 // So CP giam
  "totalStockNoChange": 6,                  // So CP khong doi
  "icbCodeParent": 8301,                    // Ma nganh cha
  "icbDataDetail": [                        // Danh sach co phieu trong nganh
    {
      "symbol": "ACB",
      "refPrice": 23500,                    // Gia tham chieu
      "matchPrice": 23400,                  // Gia khop
      "ceilingPrice": 25100,                // Gia tran
      "floorPrice": 21900,                  // Gia san
      "accumulatedVolume": 17478700,         // Tong KLGD (CP)
      "accumulatedValue": 409800810000,      // Tong GTGD (VND)
      "organName": "Ngan hang TMCP A Chau",
      "organShortName": "ACB",
      "enOrganName": "Asia Commercial Joint Stock Bank",
      "enOrganShortName": "Asia Commercial Bank",
      "foreignNetVolume": -11877685,         // KL rong nuoc ngoai (am = ban rong)
      "foreignNetValue": -278519645550,      // GT rong nuoc ngoai (VND)
      "board": "HSX"                         // San: "HSX" | "HNX" | "UPCOM"
    }
  ]
}
```

**UI Mapping:**

| Cot UI | Field |
|--------|-------|
| Ma | `symbol` |
| San | `board` |
| Gia | `matchPrice` |
| +/- | `matchPrice - refPrice` (tinh tren client) |
| % | `(matchPrice - refPrice) / refPrice * 100` |
| Tong KL (co phieu) | `accumulatedVolume` |
| Tong GT (VND) | `accumulatedValue` |
| KL Rong - NN (co phieu) | `foreignNetVolume` |

**Phan bo dong tien** (bar chart tren modal): Tinh tu `totalStockIncrease`, `totalStockDecrease`, `totalStockNoChange`.

---

## 2. Suc Manh Co Phieu (Stock Strength - TA)

> **Vi tri tren UI**: Tab Nhiet Do (Heatmap) — diem suc manh ky thuat duoc su dung de to mau hoac xep hang.
> **Thieu trong file goc**: Hoan toan thieu.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/ta/stock-strength
    ?exchange=ALL
```

**Query Params:**

| Param | Mo ta | Gia tri |
|-------|-------|---------|
| `exchange` | San giao dich | `ALL`, `HOSE`, `HNX`, `UPCOM`, `HSX` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": {
    "FPT": 45,
    "VCB": 72,
    "ACB": 33,
    "VIC": 88,
    "HPG": 15
  }
}
```

**Ghi chu:**
- Response la flat map: `{ ticker: score }`
- Score tu **3 den 99** (so nguyen), hoac `null` neu chua co du lieu
- Tong so ticker: ~1538 (ALL), ~403 (HOSE), ~302 (HNX), ~833 (UPCOM)
- Duoc goi moi khi chuyen tab Nhiet Do hoac doi san giao dich
- `exchange=HSX` tra ve ket qua giong `ALL` (1538 ticker)

---

## 3. Chi So Thi Truong (Market Index)

> **Vi tri tren UI**: Tab Nhiet Do — hien thi chi so VN-Index, HNX-Index, UPCOM-Index o goc trai.
> **Thieu trong file goc**: Hoan toan thieu.

```
POST https://trading.vietcap.com.vn/api/price/marketIndex/getList
```

**Request Body:**
```json
{
  "symbols": ["VNINDEX", "HNXIndex", "HNXUpcomIndex"]
}
```

**Response (array):**
```json
[
  {
    "board": "HSX",
    "symbol": "VNINDEX",
    "price": 1853.29,                        // Gia hien tai
    "refPrice": 1870.36,                      // Gia tham chieu
    "change": -17.07,                         // Thay doi diem
    "changePercent": -0.9126,                 // Thay doi %
    "totalShares": 673852010,                 // Tong KLGD
    "totalValue": 19347915.26684,             // Tong GTGD (trieu VND)
    "totalStockIncrease": 130,                // So CP tang
    "totalStockDecline": 187,                 // So CP giam
    "totalStockNoChange": 55,                 // So CP tham chieu
    "totalStockCeiling": 5,                   // So CP tran
    "totalStockFloor": 1,                     // So CP san
    "estimatedChange": 0,                     // Thay doi du kien (phien ATC)
    "estimatedFsp": 1870.36,                  // Gia du kien (phien ATC)
    "code": "001",                            // Ma noi bo
    "messageType": "M1",
    "time": "2026-04-24T07:45:59.999Z",       // Thoi gian cap nhat
    "sendingTime": "2026-04-24T08:33:20.321Z"
  }
]
```

**Cac gia tri `symbols`:**

| Symbol | Chi so |
|--------|--------|
| `VNINDEX` | VN-Index (HOSE) |
| `HNXIndex` | HNX-Index |
| `HNXUpcomIndex` | UPCOM-Index |
| `VN30` | VN30 |
| `HNX30` | HNX30 |

---

## 4. Thanh Tim Kiem (Search Bar Data)

> **Vi tri tren UI**: O tim kiem phia tren cung — autocomplete khi go ma co phieu.
> **Thieu trong file goc**: Hoan toan thieu.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v2/company/search-bar
    ?language=1
```

**Query Params:**

| Param | Mo ta | Gia tri |
|-------|-------|---------|
| `language` | Ngon ngu | `1` = Tieng Viet, `2` = Tieng Anh |

**Response (rut gon):**
```json
{
  "status": 200,
  "data": [
    {
      "id": "767",
      "code": "STK",                         // Ma co phieu
      "name": "Cong ty Co phan Soi The Ky",  // Ten day du
      "shortName": "Soi The Ky",              // Ten viet tat
      "floor": "HOSE",                        // San niem yet
      "organCode": "CENTURY",                 // Ma to chuc
      "comTypeCode": "CT",                    // Loai cong ty
      "isBank": false,
      "isIndex": false,
      "inCu": true,                           // Trong Vietcap Coverage Universe
      "logoUrl": "https://vietcap-website.s3...STK.webp",
      "currentPrice": 13800,                  // Gia hien tai
      "targetPrice": 25500,                   // Gia muc tieu (Vietcap)
      "upsideToTpPercentage": 0.8478,         // % upside den gia muc tieu
      "projectedTsrPercentage": 0.8478,       // % tong loi suat du kien
      "dividendPerShareTsr": 0,               // Co tuc/cp cho TSR
      "icbLv1": { "code": "3000", "name": "Hang Tieu dung", "level": 1 },
      "icbLv2": { "code": "3700", "name": "Hang ca nhan & Gia dung", "level": 2 },
      "icbLv3": { "code": "3760", "name": "Hang ca nhan", "level": 3 },
      "icbLv4": { "code": "3763", "name": "Hang May mac", "level": 4 },
      "phone": "(84.28) 3790 7565",
      "fax": "(84.28) 3790 7566",
      "tax": ""
    }
  ]
}
```

**Ghi chu:**
- Tra ve **~2077 cong ty** (tat ca niem yet + UPCOM)
- Bao gom ca chi so (`isIndex: true`) nhu VNINDEX, VN30...
- Co thong tin **gia muc tieu** va **upside** cua Vietcap Research
- Du lieu nay duoc load 1 lan va cache tren client de autocomplete

---

## 5. Ma Su Kien (Event Codes)

> **Vi tri tren UI**: Du lieu tham chieu dung noi bo de map event code -> ten su kien.
> **Thieu trong file goc**: Hoan toan thieu.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/event-codes
```

**Response:**
```json
{
  "status": 200,
  "data": [
    {
      "eventCode": "AGME",
      "eventNameVi": "Dai hoi Dong Co dong",
      "eventNameEn": "Annual General Meeting"
    },
    {
      "eventCode": "AGMR",
      "eventNameVi": "Nghi quyet dai hoi co dong thuong nien",
      "eventNameEn": "AGM Resolution"
    },
    {
      "eventCode": "AIS",
      "eventNameVi": "Niem yet them",
      "eventNameEn": "Additional Listing"
    }
  ]
}
```

---

## 6. Thong Bao Bao Tri (Maintenance Notification)

> **Vi tri tren UI**: Banner canh bao phia tren khi he thong bao tri.
> **Thieu trong file goc**: Hoan toan thieu.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/notification?type=maintenance
```

**Query Params:**

| Param | Mo ta | Gia tri |
|-------|-------|---------|
| `type` | Loai thong bao | `maintenance` |

**Response:** Tra ve danh sach thong bao bao tri (neu co). Response rong khi khong co bao tri.

---

## 7. Bo Sung Chi Tiet Cho API Da Co

### 7.1. ForeignVolumeChart — Che do Intraday (ONE_MINUTE)

> File goc (muc 4.1) chi ghi vi du voi `ONE_MONTH`. Thuc te UI "Hom nay" goi voi `ONE_MINUTE`.

```
POST https://trading.vietcap.com.vn/api/market-watch/v3/ForeignVolumeChart/getAll
```

**Request Body (intraday):**
```json
{
  "from": 1776988800,             // Dau ngay hom nay (00:00 UTC)
  "to": 1777107000,               // Cuoi ngay hom nay
  "group": "ALL",
  "timeFrame": "ONE_MINUTE"       // Tra ve du lieu moi phut
}
```

**Response intraday (272 diem du lieu / ngay):**
```json
[
  {
    "group": "ALL",
    "dataType": 0,
    "timeFrame": "ONE_MINUTE",
    "truncTime": "1776996000",             // Epoch seconds (tung phut)
    "foreignBuyVolume": "166000.0",
    "foreignSellVolume": "22669.0",
    "foreignBuyValue": "1291870000.0",
    "foreignSellValue": "292209100.0"
  }
]
```

**Ghi chu:**
- Tren UI, bieu do Nuoc Ngoai khi chon "Hom nay" se goi 2 lan:
  1. `from=today, to=today` voi `ONE_MINUTE` → Du lieu hom nay (bieu do chinh)
  2. `from=yesterday, to=today` voi `ONE_MINUTE` → Du lieu hom qua (duong so sanh)

**Mapping `timeFrame` day du cho ForeignVolumeChart:**

| UI Filter | timeFrame | from | to | Mo ta |
|-----------|-----------|------|-----|-------|
| Hom nay | `ONE_MINUTE` | startOfToday | endOfToday | Du lieu tung phut |
| 1W | `ONE_WEEK` | today - 7d | today | Gop theo tuan |
| 1M | `ONE_MONTH` | today - 30d | today | Gop theo thang |
| YTD | `YTD` | Jan 1st | today | |
| 1Y | `ONE_YEAR` | today - 365d | today | Gop theo nam |

### 7.2. Liquidity (gap-liquidity) — Pattern 2 phien

> File goc (muc 2) khong ghi ro rang rang UI goi **2 request song song** de so sanh phien hom nay va phien truoc.

Khi chon "Hom nay", UI goi:

| Request | from | to | timeFrame | Muc dich |
|---------|------|-----|-----------|---------|
| 1 | startOfToday | now | `ONE_MINUTE` | GTGD tich luy hom nay |
| 2 | startOfYesterday | startOfToday | `ONE_MINUTE` | GTGD phien truoc (duong so sanh) |

Khi chon "1Y", UI goi:

| Request | from | to | timeFrame | Muc dich |
|---------|------|-----|-----------|---------|
| 1 | today | now | `ONE_MINUTE` | Intraday hom nay (van hien thi) |
| 2 | today - 1Y | today | `ONE_YEAR` | Lich su thanh khoan 1 nam |

### 7.3. ForeignNetValue/top — Note ve timeFrame

> File goc (muc 4.2) da dung. Bo sung: khi UI chon "Hom nay", `timeFrame` gui la `ONE_DAY` (khong phai `ONE_MINUTE`), vi day la top co phieu (khong can intraday).

```json
{
  "from": 1776988800,
  "to": 1777107000,
  "group": "ALL",
  "timeFrame": "ONE_DAY"       // Luon la ONE_DAY cho filter "Hom nay"
}
```

---

## Tong Hop API Thieu

| # | API | Endpoint | Trang thai |
|---|-----|----------|-----------|
| 1 | **Chi tiet nganh ICB** | `POST .../AllocatedICB/getAllocatedDetail` | ✅ Moi - Quan trong |
| 2 | **Suc manh co phieu (TA)** | `GET .../ta/stock-strength` | ✅ Moi |
| 3 | **Chi so thi truong** | `POST .../price/marketIndex/getList` | ✅ Moi |
| 4 | **Search bar data** | `GET .../company/search-bar` | ✅ Moi |
| 5 | **Event codes** | `GET .../event-codes` | ✅ Moi - Tham chieu |
| 6 | **Maintenance notification** | `GET .../notification?type=maintenance` | ✅ Moi |
| 7 | **Foreign intraday (ONE_MINUTE)** | `POST .../ForeignVolumeChart/getAll` | ⚠️ Bo sung timeFrame |
| 8 | **Liquidity 2-phien pattern** | `POST .../gap-liquidity` | ⚠️ Bo sung chi tiet |
| 9 | **ForeignNetValue/top note** | `POST .../ForeignNetValue/top` | ⚠️ Bo sung chi tiet |
