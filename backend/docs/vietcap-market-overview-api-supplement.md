# API Tổng quan thị trường Vietcap — Bổ sung

> Bổ sung các API còn thiếu trong [`vietcap-market-overview-api.md`](./vietcap-market-overview-api.md).
> Ngày phân tích: 2026-04-25
> Trang: `https://trading.vietcap.com.vn/iq/market`

---

## Mục lục

1. [Chi tiết ngành ICB (Sector Detail)](#1-chi-tiet-nganh-icb-sector-detail)
2. [Sức mạnh cổ phiếu (Stock Strength — TA)](#2-suc-manh-co-phieu-stock-strength--ta)
3. [Chỉ số thị trường (Market Index)](#3-chi-so-thi-truong-market-index)
4. [Thanh tìm kiếm (Search Bar Data)](#4-thanh-tim-kiem-search-bar-data)
5. [Mã sự kiện (Event Codes)](#5-ma-su-kien-event-codes)
6. [Thông báo bảo trì (Maintenance Notification)](#6-thong-bao-bao-tri-maintenance-notification)
7. [Bổ sung chi tiết cho API đã có](#7-bo-sung-chi-tiet-cho-api-da-co)

---

## 1. Chi tiết ngành ICB (Sector Detail)

> **Vị trí trên UI**: Tab Tổng quan → mục "Phân bổ" → bấm vào tên ngành (ví dụ: Ngân hàng, Công nghiệp...)

```
POST https://trading.vietcap.com.vn/api/market-watch/AllocatedICB/getAllocatedDetail
```

**Request Body:**
```json
{
  "group": "ALL",
  "timeFrame": "ONE_DAY",
  "icbCode": 8300
}
```

**Response:**
```json
{
  "icb_code": 8300,
  "icbChangePercent": -0.8919,
  "totalValue": 4580663735000,
  "totalStockIncrease": 6,
  "totalStockDecrease": 15,
  "totalStockNoChange": 6,
  "icbCodeParent": 8301,
  "icbDataDetail": [
    {
      "symbol": "ACB",
      "refPrice": 23500,
      "matchPrice": 23400,
      "ceilingPrice": 25100,
      "floorPrice": 21900,
      "accumulatedVolume": 17478700,
      "accumulatedValue": 409800810000,
      "organName": "Ngan hang TMCP A Chau",
      "organShortName": "ACB",
      "enOrganName": "Asia Commercial Joint Stock Bank",
      "enOrganShortName": "Asia Commercial Bank",
      "foreignNetVolume": -11877685,
      "foreignNetValue": -278519645550,
      "board": "HSX"
    }
  ]
}
```

**Ánh xạ UI:**

| Cột UI | Field |
|--------|-------|
| Mã | `symbol` |
| Sàn | `board` |
| Giá | `matchPrice` |
| +/- | `matchPrice − refPrice` (tính phía client) |
| % | `(matchPrice − refPrice) / refPrice × 100` |
| Tổng KL (cổ phiếu) | `accumulatedVolume` |
| Tổng GT (VND) | `accumulatedValue` |
| KL ròng — NN | `foreignNetVolume` |

**Phân bổ dòng tiền** (bar chart): tính từ `totalStockIncrease`, `totalStockDecrease`, `totalStockNoChange`.

---

## 2. Sức mạnh cổ phiếu (Stock Strength — TA)

> **Vị trí trên UI**: Tab Nhiệt độ (Heatmap) — điểm sức mạnh kỹ thuật được dùng để tô màu/xếp hạng.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/ta/stock-strength
    ?exchange=ALL
```

| Param | Mô tả | Giá trị |
|-------|-------|---------|
| `exchange` | Sàn giao dịch | `ALL`, `HOSE`, `HNX`, `UPCOM`, `HSX` |

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

**Ghi chú:**
- Response là map phẳng `{ ticker: score }`.
- Score từ **3 đến 99** (số nguyên), hoặc `null` nếu chưa có dữ liệu.
- Tổng số ticker: ~1538 (ALL), ~403 (HOSE), ~302 (HNX), ~833 (UPCOM).
- Được gọi mỗi khi chuyển tab Nhiệt độ hoặc đổi sàn giao dịch.
- `exchange=HSX` trả về kết quả giống `ALL` (1538 ticker).

---

## 3. Chỉ số thị trường (Market Index)

> **Vị trí trên UI**: Tab Nhiệt độ — hiển thị VN-Index, HNX-Index, UPCOM-Index ở góc trái.

```
POST https://trading.vietcap.com.vn/api/price/marketIndex/getList
```

**Request Body:**
```json
{
  "symbols": ["VNINDEX", "HNXIndex", "HNXUpcomIndex"]
}
```

**Response (mảng):**
```json
[
  {
    "board": "HSX",
    "symbol": "VNINDEX",
    "price": 1853.29,
    "refPrice": 1870.36,
    "change": -17.07,
    "changePercent": -0.9126,
    "totalShares": 673852010,
    "totalValue": 19347915.26684,
    "totalStockIncrease": 130,
    "totalStockDecline": 187,
    "totalStockNoChange": 55,
    "totalStockCeiling": 5,
    "totalStockFloor": 1,
    "estimatedChange": 0,
    "estimatedFsp": 1870.36,
    "code": "001",
    "messageType": "M1",
    "time": "2026-04-24T07:45:59.999Z",
    "sendingTime": "2026-04-24T08:33:20.321Z"
  }
]
```

**Giá trị `symbols`:**

| Symbol | Chỉ số |
|--------|--------|
| `VNINDEX` | VN-Index (HOSE) |
| `HNXIndex` | HNX-Index |
| `HNXUpcomIndex` | UPCOM-Index |
| `VN30` | VN30 |
| `HNX30` | HNX30 |

---

## 4. Thanh tìm kiếm (Search Bar Data)

> **Vị trí trên UI**: Ô tìm kiếm phía trên cùng — autocomplete khi gõ mã cổ phiếu.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v2/company/search-bar
    ?language=1
```

| Param | Mô tả | Giá trị |
|-------|-------|---------|
| `language` | Ngôn ngữ | `1` = Tiếng Việt, `2` = Tiếng Anh |

**Response (rút gọn):**
```json
{
  "status": 200,
  "data": [
    {
      "id": "767",
      "code": "STK",
      "name": "Cong ty Co phan Soi The Ky",
      "shortName": "Soi The Ky",
      "floor": "HOSE",
      "organCode": "CENTURY",
      "comTypeCode": "CT",
      "isBank": false,
      "isIndex": false,
      "inCu": true,
      "logoUrl": "https://vietcap-website.s3...STK.webp",
      "currentPrice": 13800,
      "targetPrice": 25500,
      "upsideToTpPercentage": 0.8478,
      "projectedTsrPercentage": 0.8478,
      "dividendPerShareTsr": 0,
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

**Ghi chú:**
- Trả về **~2077 doanh nghiệp** (tất cả niêm yết + UPCOM).
- Bao gồm cả chỉ số (`isIndex: true`) như VNINDEX, VN30...
- Có thông tin **giá mục tiêu** và **upside** từ Vietcap Research.
- Dữ liệu được tải 1 lần và cache trên client để autocomplete.

---

## 5. Mã sự kiện (Event Codes)

> **Vị trí trên UI**: Dữ liệu tham chiếu nội bộ để map event code → tên sự kiện.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/event-codes
```

**Response:**
```json
{
  "status": 200,
  "data": [
    { "eventCode": "AGME", "eventNameVi": "Dai hoi Dong Co dong", "eventNameEn": "Annual General Meeting" },
    { "eventCode": "AGMR", "eventNameVi": "Nghi quyet dai hoi co dong thuong nien", "eventNameEn": "AGM Resolution" },
    { "eventCode": "AIS",  "eventNameVi": "Niem yet them", "eventNameEn": "Additional Listing" }
  ]
}
```

---

## 6. Thông báo bảo trì (Maintenance Notification)

> **Vị trí trên UI**: Banner cảnh báo phía trên khi hệ thống bảo trì.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/notification?type=maintenance
```

| Param | Mô tả | Giá trị |
|-------|-------|---------|
| `type` | Loại thông báo | `maintenance` |

**Response:** Trả về danh sách thông báo bảo trì (nếu có). Rỗng khi không có bảo trì.

---

## 7. Bổ sung chi tiết cho API đã có

### 7.1. ForeignVolumeChart — chế độ Intraday (`ONE_MINUTE`)

> Tài liệu gốc (mục 4.1) chỉ cho ví dụ với `ONE_MONTH`. Thực tế UI "Hôm nay" gọi với `ONE_MINUTE`.

```
POST https://trading.vietcap.com.vn/api/market-watch/v3/ForeignVolumeChart/getAll
```

**Request Body (intraday):**
```json
{
  "from": 1776988800,
  "to": 1777107000,
  "group": "ALL",
  "timeFrame": "ONE_MINUTE"
}
```

**Response intraday (~272 điểm dữ liệu mỗi ngày):**
```json
[
  {
    "group": "ALL",
    "dataType": 0,
    "timeFrame": "ONE_MINUTE",
    "truncTime": "1776996000",
    "foreignBuyVolume": "166000.0",
    "foreignSellVolume": "22669.0",
    "foreignBuyValue": "1291870000.0",
    "foreignSellValue": "292209100.0"
  }
]
```

**Ghi chú:**
- Trên UI, biểu đồ Nước ngoài khi chọn "Hôm nay" sẽ gọi 2 lần:
  1. `from=today, to=today` với `ONE_MINUTE` → dữ liệu hôm nay (biểu đồ chính).
  2. `from=yesterday, to=today` với `ONE_MINUTE` → dữ liệu hôm qua (đường so sánh).

**Ánh xạ `timeFrame` đầy đủ cho ForeignVolumeChart:**

| Bộ lọc UI | timeFrame | from | to | Mô tả |
|-----------|-----------|------|-----|-------|
| Hôm nay | `ONE_MINUTE` | startOfToday | endOfToday | Mỗi phút |
| 1W | `ONE_WEEK` | hôm nay − 7 ngày | hôm nay | Theo tuần |
| 1M | `ONE_MONTH` | hôm nay − 30 ngày | hôm nay | Theo tháng |
| YTD | `YTD` | 01/01 năm hiện tại | hôm nay | |
| 1Y | `ONE_YEAR` | hôm nay − 365 ngày | hôm nay | Theo năm |

### 7.2. Liquidity (gap-liquidity) — pattern hai phiên

> Tài liệu gốc (mục 2) chưa nêu rõ UI gọi **2 request song song** để so sánh phiên hôm nay và hôm qua.

Khi chọn "Hôm nay", UI gọi:

| Request | from | to | timeFrame | Mục đích |
|---------|------|-----|-----------|----------|
| 1 | startOfToday | now | `ONE_MINUTE` | GTGD tích lũy hôm nay |
| 2 | startOfYesterday | startOfToday | `ONE_MINUTE` | GTGD phiên trước (đường so sánh) |

Khi chọn "1Y", UI gọi:

| Request | from | to | timeFrame | Mục đích |
|---------|------|-----|-----------|----------|
| 1 | today | now | `ONE_MINUTE` | Intraday hôm nay |
| 2 | today − 1Y | today | `ONE_YEAR` | Lịch sử thanh khoản 1 năm |

### 7.3. ForeignNetValue/top — ghi chú về `timeFrame`

> Tài liệu gốc (mục 4.2) đã đề cập. Bổ sung: khi UI chọn "Hôm nay", `timeFrame` gửi là `ONE_DAY` (không phải `ONE_MINUTE`), vì đây là top cổ phiếu (không cần intraday).

```json
{
  "from": 1776988800,
  "to": 1777107000,
  "group": "ALL",
  "timeFrame": "ONE_DAY"
}
```

---

## Tổng hợp API bổ sung

| # | API | Endpoint | Trạng thái |
|---|-----|----------|------------|
| 1 | **Chi tiết ngành ICB** | `POST .../AllocatedICB/getAllocatedDetail` | ✅ Mới — Quan trọng |
| 2 | **Sức mạnh cổ phiếu (TA)** | `GET .../ta/stock-strength` | ✅ Mới |
| 3 | **Chỉ số thị trường** | `POST .../price/marketIndex/getList` | ✅ Mới |
| 4 | **Search bar** | `GET .../company/search-bar` | ✅ Mới |
| 5 | **Mã sự kiện** | `GET .../event-codes` | ✅ Mới — Tham chiếu |
| 6 | **Thông báo bảo trì** | `GET .../notification?type=maintenance` | ✅ Mới |
| 7 | **Foreign intraday (ONE_MINUTE)** | `POST .../ForeignVolumeChart/getAll` | ⚠️ Bổ sung timeFrame |
| 8 | **Liquidity 2 phiên pattern** | `POST .../gap-liquidity` | ⚠️ Bổ sung chi tiết |
| 9 | **ForeignNetValue/top — ghi chú** | `POST .../ForeignNetValue/top` | ⚠️ Bổ sung chi tiết |
