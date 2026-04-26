# API Trang Ngành (Sector) Vietcap

> Trang: `https://trading.vietcap.com.vn/iq/sector`
> Ngày phân tích: 2026-04-25

---

## Mục lục

1. [Tổng quan trang](#1-tong-quan-trang)
2. [Tab Xếp hạng — Sector Ranking](#2-tab-xep-hang--sector-ranking)
   - 2.1. [Ngày giao dịch](#21-ngay-giao-dich-trading-dates)
   - 2.2. [Xếp hạng ngành (Sector Ranking Scores)](#22-xep-hang-nganh-sector-ranking-scores)
3. [Tab Thông tin — Sector Information](#3-tab-thong-tin--sector-information)
4. [API hỗ trợ](#4-api-ho-tro-supporting-apis)
5. [Ánh xạ Param — UI Filter](#5-anh-xa-param--ui-filter)

---

## 1. Tổng quan trang

Trang Ngành (`/iq/sector`) có 2 tab chính:

| Tab | Mô tả | API chính |
|-----|-------|-----------|
| **Xếp hạng** | Bảng heatmap điểm sức mạnh ngành theo ngày | `sector-ranking/sectors` |
| **Thông tin** | Bảng vốn hóa, tỷ trọng, hiệu suất các kỳ | `sector-information` |

Cả 2 tab đều có **Cài đặt** (icon bánh răng) để thay đổi:
- **Ngành**: ICB level 1–4
- **GTGD trung bình**: 1M, 3M, 6M (chỉ tab Xếp hạng)
- **Khoảng**: > 3 tỷ, > 5 tỷ, > 10 tỷ VND (chỉ tab Xếp hạng)
- **Tín hiệu / Hiệu suất sóng**: Toggle on/off (chỉ tab Xếp hạng, điều khiển hiển thị UI)

---

## 2. Tab Xếp hạng — Sector Ranking

### 2.1. Ngày giao dịch

Lấy danh sách 20 ngày giao dịch gần nhất để làm header cột cho bảng heatmap.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/trading-date
```

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    "2026-04-24", "2026-04-23", "2026-04-22", "2026-04-21", "2026-04-20",
    "2026-04-17", "2026-04-16", "2026-04-15", "2026-04-14", "2026-04-13",
    "2026-04-10", "2026-04-09", "2026-04-08", "2026-04-07", "2026-04-06",
    "2026-04-03", "2026-04-02", "2026-04-01", "2026-03-31", "2026-03-30"
  ]
}
```

**Ghi chú:**
- Luôn trả về **20 ngày** giao dịch gần nhất (bỏ ngày nghỉ, ngày lễ).
- Dùng để render header cột của bảng heatmap.

---

### 2.2. Xếp hạng ngành (Sector Ranking Scores)

Lấy điểm sức mạnh từng ngành theo ngày. Đây là API chính của tab "Xếp hạng".

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-ranking/sectors
    ?icbLevel=2
    &adtv=3
    &value=3
```

**Tham số:**

| Tham số | Mô tả | Giá trị | Mặc định |
|---------|-------|---------|----------|
| `icbLevel` | Cấp phân ngành ICB | `1`, `2`, `3`, `4` | `2` |
| `adtv` | GTGD trung bình (số tháng) | `1`, `3`, `6` | `3` |
| `value` | Ngưỡng GTGD tối thiểu (tỷ VND) | `3`, `5`, `10` | `3` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    {
      "name": "8300",
      "values": [
        { "date": "2026-04-24", "value": 59 },
        { "date": "2026-04-23", "value": 59 },
        {
          "date": "2026-04-07",
          "value": 36,
          "sectorTrend": "DOWN",
          "extremeValue": 35,
          "trendStartValue": 41
        }
      ]
    }
  ]
}
```

**Chi tiết các field trong `values[]`:**

| Field | Kiểu | Mô tả |
|-------|------|-------|
| `date` | string | Ngày giao dịch (YYYY-MM-DD) |
| `value` | int | Điểm sức mạnh ngành (0–100). Cao = mạnh |
| `sectorTrend` | string? | Xu hướng tại ngày: `"UP"` hoặc `"DOWN"`. Chỉ có khi có tín hiệu |
| `extremeValue` | int? | Điểm cực trị (đỉnh/đáy) của xu hướng hiện tại |
| `trendStartValue` | int? | Điểm bắt đầu xu hướng hiện tại |

**Số ngành trả về theo `icbLevel`:**

| icbLevel | Số ngành | Ví dụ |
|----------|----------|-------|
| 1 | 11 | Tài chính (8000), Công nghiệp (2000)... |
| 2 | 16 | Ngân hàng (8300), Bất động sản (8600)... |
| 3 | 19 | Ngân hàng (8530), Bảo hiểm nhân thọ (8570)... |
| 4 | 21 | Ngân hàng (8355), Bảo hiểm phi nhân thọ (8536)... |

**Ánh xạ điểm sức mạnh trên UI:**

| Score | Màu sắc | Ý nghĩa |
|-------|---------|---------|
| ≥ 60 | Xanh đậm | Mạnh |
| 50–59 | Xám | Trung tính |
| < 50 | — | Yếu |

**Ánh xạ UI:**
- Hàng = ngành, sắp xếp giảm dần theo điểm ngày gần nhất
- Cột = ngày giao dịch (20 ngày)
- Ô = điểm sức mạnh, tô màu theo độ mạnh/yếu
- "Tín hiệu" toggle: hiển thị mũi tên UP/DOWN tại ô có `sectorTrend`
- "Hiệu suất sóng" toggle: hiển thị thêm thông tin wave performance

**Ánh xạ UI Filter → API Param:**

| UI | Param | Giá trị UI → API |
|----|-------|-------------------|
| Ngành | `icbLevel` | ICB 1 → `1`, ICB 2 → `2`, ICB 3 → `3`, ICB 4 → `4` |
| GTGD trung bình | `adtv` | 1M → `1`, 3M → `3`, 6M → `6` |
| Khoảng | `value` | > 3 tỷ → `3`, > 5 tỷ → `5`, > 10 tỷ → `10` |
| Tín hiệu | — | Chỉ phía client |
| Hiệu suất sóng | — | Chỉ phía client |

---

## 3. Tab Thông tin — Sector Information

Lấy thông tin vốn hóa, tỷ trọng và hiệu suất giá của các ngành.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sector-information
    ?icbLevel=2
```

**Tham số:**

| Tham số | Mô tả | Giá trị | Mặc định |
|---------|-------|---------|----------|
| `icbLevel` | Cấp phân ngành ICB | `1`, `2`, `3`, `4` | `2` |

**Response:**
```json
{
  "status": 200,
  "successful": true,
  "data": [
    {
      "icbCode": "8600",
      "marketCap": 2904291991948489,
      "last20DayIndex": [
        694.31, 721.86, 727.84, 730.3, 726.51,
        726.51, 729.55, 773.6, 762.08, 766.59,
        789.77, 812.56, 853.58, 895.73, 883.75,
        903.34, 908.77, 951.55, 965.06, 947.85
      ],
      "lastCloseIndex": 947.85,
      "percentPriceChange1Day": -0.0178,
      "percentPriceChange1Week": 0.0725,
      "percentPriceChange1Month": 0.4521,
      "percentPriceChange6Month": 0.3902,
      "percentPriceChangeYTD": 0.1233,
      "percentPriceChange1Year": 1.7349,
      "percentPriceChange2Year": 2.1541,
      "percentPriceChange5Year": 0.8547
    }
  ]
}
```

**Ánh xạ UI:**

| Cột UI | Field | Ghi chú |
|--------|-------|---------|
| Ngành | `icbCode` → map tên qua `icb-codes` hoặc `sector.json` | |
| Vốn hóa (tỷ VND) | `marketCap / 1e9` | Chia 10⁹ |
| Tỷ trọng (%) | `marketCap / totalMarketCap × 100` | Tính phía client |
| % Thay đổi | `percentPriceChange1Day` | Giá trị decimal (0.01 = 1%) |
| 20 ngày gần nhất | `last20DayIndex[]` | Vẽ sparkline |
| 1W % | `percentPriceChange1Week` | |
| 1M % | `percentPriceChange1Month` | |
| 6M % | `percentPriceChange6Month` | |
| YTD % | `percentPriceChangeYTD` | |
| 1Y % | `percentPriceChange1Year` | |
| 2Y % | `percentPriceChange2Year` | |
| 5Y % | `percentPriceChange5Year` | |

**Số ngành trả về theo `icbLevel`:**

| icbLevel | Số ngành |
|----------|----------|
| 1 | 13 |
| 2 | 19 |
| 3 | 40 |
| 4 | 106 |

**Ghi chú:**
- `Tỷ trọng` không có trong response, client tự tính = `marketCap / sum(allMarketCap) × 100`.
- Hàng `Tổng` (dòng đầu trên UI) = `sum(marketCap)` của tất cả ngành.
- Hàng "Tổng" hiển thị tổng vốn hóa, 100%, không có % thay đổi.
- Cài đặt tab này chỉ có **Ngành** (ICB level), không có GTGD/Khoảng.

---

## 4. API hỗ trợ

### 4.1. Mã ngành ICB

Đã ghi nhận trong `vietcap-market-overview-api.md` mục 7.1. Dùng để map `icbCode` → tên ngành.

```
GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes
```

### 4.2. File ngôn ngữ ngành

File JSON tĩnh chứa tên ngành theo ngôn ngữ.

```
GET https://trading.vietcap.com.vn/vietcap-iq/language/vi/sector.json?v={timestamp}
```

**Ghi chú:**
- `v` = cache buster (timestamp).
- Trả về map `icbCode → { vi: "tên tiếng Việt", en: "tên tiếng Anh" }`.
- Dùng kết hợp với API `icb-codes` để hiển thị tên ngành trên UI.

---

## 5. Ánh xạ Param — UI Filter

### Tab Xếp hạng

```
Cài đặt:
┌─────────────────────────────────────┐
│ Ngành             │ ICB level 2 ▼  │ → icbLevel=2
│ GTGD trung bình   │ 3M          ▼  │ → adtv=3
│ Khoảng            │ > 3 tỷ VND  ▼  │ → value=3
│ Tín hiệu          │ ○ (off)        │ → chỉ client
│ Hiệu suất sóng    │ ○ (off)        │ → chỉ client
└─────────────────────────────────────┘
```

**Giá trị Ngành:**

| UI | `icbLevel` |
|----|-----------|
| ICB level 1 | `1` |
| ICB level 2 | `2` |
| ICB level 3 | `3` |
| ICB level 4 | `4` |

**Giá trị GTGD trung bình:**

| UI | `adtv` |
|----|--------|
| 1M | `1` |
| 3M | `3` |
| 6M | `6` |

**Giá trị Khoảng:**

| UI | `value` |
|----|---------|
| > 3 tỷ VND | `3` |
| > 5 tỷ VND | `5` |
| > 10 tỷ VND | `10` |

### Tab Thông tin

```
Cài đặt:
┌─────────────────────────────────────┐
│ Ngành             │ ICB level 2 ▼  │ → icbLevel=2
│                                     │
│ GHIM CỘT: Ngành                     │
│ CỘT ĐỘNG:                           │
│   ☑ Vốn hóa (tỷ VND)               │
│   ☑ Tỷ trọng (%)                   │
│   ☑ % Thay đổi                     │
│   ☑ 20 ngày gần nhất               │
│   ☑ 1W %                           │
│   ☑ 1M %                           │
│   ☑ 6M %                           │
│   ☑ YTD %                          │
│   ☑ 1Y %                           │
│   ☑ 2Y %                           │
│   ☑ 5Y %                           │
└─────────────────────────────────────┘
```

- Chỉ `Ngành` (icbLevel) ảnh hưởng API.
- Các checkbox còn lại chỉ ẩn/hiện cột (client-side).

---

## Tổng hợp API

| # | API | Method | Endpoint | Tab |
|---|-----|--------|----------|-----|
| 1 | **Ngày giao dịch** | GET | `.../sector-ranking/trading-date` | Xếp hạng |
| 2 | **Xếp hạng ngành** | GET | `.../sector-ranking/sectors?icbLevel=&adtv=&value=` | Xếp hạng |
| 3 | **Thông tin ngành** | GET | `.../sector-information?icbLevel=` | Thông tin |
| 4 | Mã ngành ICB | GET | `.../sectors/icb-codes` | Chung |
| 5 | File ngôn ngữ | GET | `.../language/vi/sector.json` | Chung |
