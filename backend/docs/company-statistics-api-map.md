# Bản đồ API Thống kê công ty

> Tham chiếu trang Vietcap IQ Company (`/iq/company?tab=information&ticker={TICKER}`)
> mục **Thống kê**.
>
> **Nguồn upstream:** `https://trading.vietcap.com.vn/iq/company?tab=information&ticker={TICKER}&isIndex=false`
> **Cập nhật lần cuối:** 2026-04-25
> **Chú thích:** ✅ Đã xác minh trên môi trường thực tế

## Base URL

Tất cả endpoint đều dùng `https://iq.vietcap.com.vn`.

## Tham số chung

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `fromDate` | `YYYYMMDD` | Ngày bắt đầu (ví dụ `20250425`) |
| `toDate` | `YYYYMMDD` | Ngày kết thúc (ví dụ `20260425`) |
| `page` | int | Số trang (đếm từ 0) |
| `size` | int | Số bản ghi mỗi trang (mặc định `50`) |
| `timeFrame` | enum | `ONE_DAY`, `ONE_WEEK`, `ONE_MONTH`, `ONE_QUARTER`, `ONE_YEAR` |

> **Ánh xạ UI:** D → `ONE_DAY`, W → `ONE_WEEK`, M → `ONE_MONTH`, Q → `ONE_QUARTER`, Y → `ONE_YEAR`

---

## 1. Nước ngoài (Foreign Trading)

Sử dụng endpoint **price-history**. Dữ liệu nước ngoài được nhúng cùng response với dữ liệu lịch sử giá.

| Endpoint | URL upstream | Route backend | Trạng thái |
|---|---|---|---|
| Lịch sử nước ngoài (phân trang) | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history?fromDate={}&toDate={}&page={}&size={}&timeFrame={}` | `GET /api/v1/market-data/trading/{symbol}/foreign-trade` | ✅ |
| Tóm tắt nước ngoài | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history-summary?fromDate={}&toDate={}&timeFrame={}` | `GET /api/v1/market-data/trading/{symbol}/foreign-trade/summary` | ✅ |
| Lịch sử đầy đủ | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history?fromDate={}&toDate={}&page={}&size={}&timeFrame={}` | `GET /api/v1/market-data/trading/{symbol}/history` | ✅ |
| Tóm tắt đầy đủ | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history-summary?fromDate={}&toDate={}&timeFrame={}` | `GET /api/v1/market-data/trading/{symbol}/summary` | ✅ |

### Field — Nước ngoài (trong items của `price-history`)

| Field | Đơn vị | Mô tả |
|---|---|---|
| `foreignBuyVolumeMatched` | cổ phiếu | Khối lượng mua khớp lệnh của khối ngoại |
| `foreignBuyValueMatched` | VND | Giá trị mua khớp lệnh của khối ngoại |
| `foreignSellVolumeMatched` | cổ phiếu | Khối lượng bán khớp lệnh của khối ngoại |
| `foreignSellValueMatched` | VND | Giá trị bán khớp lệnh của khối ngoại |
| `foreignBuyVolumeDeal` | cổ phiếu | Khối lượng mua thỏa thuận của khối ngoại |
| `foreignBuyValueDeal` | VND | Giá trị mua thỏa thuận của khối ngoại |
| `foreignSellVolumeDeal` | cổ phiếu | Khối lượng bán thỏa thuận của khối ngoại |
| `foreignSellValueDeal` | VND | Giá trị bán thỏa thuận của khối ngoại |
| `foreignBuyVolumeTotal` | cổ phiếu | Tổng khối lượng mua (khớp + thỏa thuận) |
| `foreignBuyValueTotal` | VND | Tổng giá trị mua |
| `foreignSellVolumeTotal` | cổ phiếu | Tổng khối lượng bán |
| `foreignSellValueTotal` | VND | Tổng giá trị bán |
| `foreignNetVolumeTotal` | cổ phiếu | Khối lượng ròng (mua − bán) |
| `foreignNetValueTotal` | VND | Giá trị ròng (mua − bán) |
| `foreignNetVolumeMatched` | cổ phiếu | Khối lượng ròng (chỉ phần khớp lệnh) |
| `foreignNetValueMatched` | VND | Giá trị ròng (chỉ phần khớp lệnh) |
| `foreignNetVolumeDeal` | cổ phiếu | Khối lượng ròng (chỉ phần thỏa thuận) |
| `foreignNetValueDeal` | VND | Giá trị ròng (chỉ phần thỏa thuận) |
| `foreignTotalRoom` | cổ phiếu | Trần room nước ngoài |
| `foreignCurrentRoom` | cổ phiếu | Room hiện còn |
| `foreignRoomPercentage` | tỷ số | Tỷ lệ room tối đa (ví dụ `0.49` = 49%) |
| `foreignOwnedPercentage` | tỷ số | Tỷ lệ sở hữu hiện tại của khối ngoại |
| `foreignAvailablePercentage` | tỷ số | Tỷ lệ room còn lại |
| `foreignOwned` | cổ phiếu | Tổng cổ phiếu khối ngoại đang sở hữu |

### Field — Tóm tắt nước ngoài (trong `price-history-summary`)

| Field | Đơn vị | Mô tả |
|---|---|---|
| `foreignBuyVolumeTotal` / `foreignBuyValueTotal` | cổ phiếu / VND | Tổng mua khối ngoại trong kỳ |
| `foreignSellVolumeTotal` / `foreignSellValueTotal` | cổ phiếu / VND | Tổng bán khối ngoại trong kỳ |
| `foreignNetVolumeTotal` / `foreignNetValueTotal` | cổ phiếu / VND | Ròng khối ngoại trong kỳ |
| `foreignBuyVolumeTotalAvg` / `foreignBuyValueTotalAvg` | cổ phiếu / VND | Trung bình ngày mua khối ngoại |
| `foreignSellVolumeTotalAvg` / `foreignSellValueTotalAvg` | cổ phiếu / VND | Trung bình ngày bán khối ngoại |
| `foreignNetVolumeTotalAvg` / `foreignNetValueTotalAvg` | cổ phiếu / VND | Trung bình ngày ròng khối ngoại |
| `foreign*Matched*` / `foreign*Deal*` | — | Cùng cấu trúc, tách phần khớp lệnh và thỏa thuận |

---

## 2. Tự doanh (Proprietary Trading)

Endpoint riêng cho dữ liệu tự doanh từ các công ty chứng khoán.

| Endpoint | URL | Trạng thái |
|---|---|---|
| Lịch sử tự doanh (phân trang) | `GET .../api/iq-insight-service/v1/company/{ticker}/proprietary-history?fromDate={}&toDate={}&page={}&size={}&timeFrame={}` | ✅ |
| Tóm tắt tự doanh | `GET .../api/iq-insight-service/v1/company/{ticker}/proprietary-history-summary?fromDate={}&toDate={}&timeFrame={}` | ✅ |

### Field — Lịch sử tự doanh

| Field | Đơn vị | Mô tả |
|---|---|---|
| `ticker` | string | Mã chứng khoán |
| `tradingDate` | ISO datetime | Ngày giao dịch |
| `totalBuyTradeVolume` | cổ phiếu | Tổng khối lượng mua tự doanh |
| `totalBuyTradeValue` | VND | Tổng giá trị mua tự doanh |
| `percentBuyTradeVolume` | tỷ số | Khối lượng mua tự doanh trên tổng KL thị trường |
| `percentBuyTradeValue` | tỷ số | Giá trị mua tự doanh trên tổng GT thị trường |
| `totalSellTradeVolume` | cổ phiếu | Tổng khối lượng bán tự doanh |
| `totalSellTradeValue` | VND | Tổng giá trị bán tự doanh |
| `percentSellTradeVolume` | tỷ số | Khối lượng bán tự doanh trên tổng KL thị trường |
| `percentSellTradeValue` | tỷ số | Giá trị bán tự doanh trên tổng GT thị trường |
| `totalTradeNetVolume` | cổ phiếu | Khối lượng ròng (mua − bán) |
| `totalTradeNetValue` | VND | Giá trị ròng (mua − bán) |
| `totalMatchBuyTradeVolume` / `Value` | cổ phiếu / VND | Phần mua khớp lệnh |
| `totalMatchSellTradeVolume` / `Value` | cổ phiếu / VND | Phần bán khớp lệnh |
| `totalMatchTradeNetVolume` / `Value` | cổ phiếu / VND | Ròng khớp lệnh |
| `totalDealBuyTradeVolume` / `Value` | cổ phiếu / VND | Phần mua thỏa thuận |
| `totalDealSellTradeVolume` / `Value` | cổ phiếu / VND | Phần bán thỏa thuận |
| `totalDealTradeNetVolume` / `Value` | cổ phiếu / VND | Ròng thỏa thuận |
| `totalVolume` | cổ phiếu | Tổng khối lượng thị trường (để tính phần trăm) |
| `totalValue` | VND | Tổng giá trị thị trường (để tính phần trăm) |
| `updateDate` | ISO datetime | Thời điểm cập nhật dữ liệu lần cuối |

### Field — Tóm tắt tự doanh

Cùng cấu trúc với lịch sử, được tổng hợp cho khoảng ngày đã chọn.

---

## 3. Nội bộ (Insider Trading)

Giao dịch của người nội bộ/giám đốc. Không có `fromDate`/`toDate` hay `timeFrame` — trả về toàn bộ giao dịch gần đây.

| Endpoint | URL | Trạng thái |
|---|---|---|
| Giao dịch nội bộ (phân trang) | `GET .../api/iq-insight-service/v1/company/{ticker}/insider-transaction?page={}&size={}` | ✅ |

### Field — Giao dịch nội bộ

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | string | ID giao dịch |
| `organCode` | string | Mã tổ chức |
| `ticker` | string | Mã chứng khoán |
| `eventCode` | string | Mã loại sự kiện (ví dụ `DDINS` = giao dịch tổ chức, `DDDIR` = giao dịch giám đốc) |
| `eventNameVi` / `eventNameEn` | string | Tên sự kiện (vi/en) |
| `organNameVi` / `organNameEn` | string | Tên doanh nghiệp (vi/en) |
| `traderOrganNameVi` / `traderOrganNameEn` | string | Tên người/tổ chức giao dịch (vi/en) |
| `actionTypeCode` | string | `B` = Mua, `S` = Bán |
| `actionTypeVi` / `actionTypeEn` | string | Diễn giải hành động (vi/en) |
| `tradeStatusVi` / `tradeStatusEn` | string | Trạng thái: Đăng ký, Hoàn thành... |
| `publicDate` | ISO datetime | Ngày công bố thông tin |
| `displayDate1` | ISO datetime | Ngày thực hiện/đăng ký |
| `displayDate2` | ISO datetime | Ngày hiển thị phụ |
| `startDate` | ISO datetime | Bắt đầu giao dịch |
| `endDate` | ISO datetime | Kết thúc giao dịch |
| `shareBeforeTrade` | int | Cổ phiếu nắm giữ trước giao dịch |
| `shareAfterTrade` | int | Cổ phiếu nắm giữ sau giao dịch |
| `shareRegister` | int | Cổ phiếu đăng ký |
| `shareAcquire` | int | Cổ phiếu thực mua |
| `ownershipAfterTrade` | tỷ số | Tỷ lệ sở hữu sau giao dịch |
| `sourceUrlVi` / `sourceUrlEn` | URL | Đường dẫn nguồn bài viết |
| `icbCodeLv1` | string | Mã ngành ICB level 1 |

---

## 4. Cung cầu (Supply & Demand)

Sử dụng endpoint **price-history**. Các field cung cầu được nhúng cùng response.

| Endpoint | URL upstream | Route backend | Trạng thái |
|---|---|---|---|
| Cung cầu (phân trang) | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history?fromDate={}&toDate={}&page={}&size={}&timeFrame={}` | `GET /api/v1/market-data/trading/{symbol}/supply-demand` | ✅ |
| Tóm tắt cung cầu | `GET .../api/iq-insight-service/v1/company/{ticker}/price-history-summary?fromDate={}&toDate={}&timeFrame={}` | `GET /api/v1/market-data/trading/{symbol}/supply-demand/summary` | ✅ |

### Field — Cung cầu (trong items của `price-history`)

| Field | Đơn vị | Mô tả |
|---|---|---|
| `totalBuyTrade` | số lệnh | Số lệnh mua |
| `totalBuyTradeVolume` | cổ phiếu | Tổng khối lượng phía mua |
| `totalSellTrade` | số lệnh | Số lệnh bán |
| `totalSellTradeVolume` | cổ phiếu | Tổng khối lượng phía bán |
| `totalNetTradeVolume` | cổ phiếu | Khối lượng ròng (mua − bán) |
| `averageBuyTradeVolume` | cổ phiếu | KL trung bình mỗi lệnh mua |
| `averageSellTradeVolume` | cổ phiếu | KL trung bình mỗi lệnh bán |
| `totalBuyUnmatchedVolume` | cổ phiếu | Khối lượng mua chưa khớp |
| `totalSellUnmatchedVolume` | cổ phiếu | Khối lượng bán chưa khớp |

### Field — Tóm tắt cung cầu (trong `price-history-summary`)

| Field | Đơn vị | Mô tả |
|---|---|---|
| `totalBuyTradeVolume` / `totalSellTradeVolume` | cổ phiếu | Tổng KL mua/bán trong kỳ |
| `totalBuyTradeVolumeAvg` / `totalSellTradeVolumeAvg` | cổ phiếu | Trung bình ngày KL mua/bán |
| `totalBuyUnmatchedVolume` / `totalSellUnmatchedVolume` | cổ phiếu | Tổng KL chưa khớp mua/bán trong kỳ |
| `totalBuyUnmatchedVolumeAvg` / `totalSellUnmatchedVolumeAvg` | cổ phiếu | Trung bình ngày KL chưa khớp |

---

## Endpoint hỗ trợ

Các endpoint này cũng được gọi trên trang Thống kê:

| Endpoint | URL | Mô tả | Trạng thái |
|---|---|---|---|
| Chi tiết doanh nghiệp | `GET .../api/iq-insight-service/v1/company/details?ticker={ticker}` | Thông tin công ty, ngành, sàn | ✅ |
| Biểu đồ giá (OHLC) | `GET .../api/iq-insight-service/v1/company/{ticker}/price-chart?lengthReport={n}` | OHLC điều chỉnh để vẽ chart (timestamp unix) | ✅ |

### Field — Price Chart

| Field | Kiểu | Mô tả |
|---|---|---|
| `openPrice` | float | Giá mở cửa điều chỉnh |
| `highPrice` | float | Giá cao điều chỉnh |
| `lowPrice` | float | Giá thấp điều chỉnh |
| `closingPrice` | float | Giá đóng cửa điều chỉnh |
| `tradingTime` | unix epoch (giây) | Ngày giao dịch dạng unix timestamp |

---

## Header gọi nguồn

| Header | Giá trị |
|---|---|
| Referer | `https://trading.vietcap.com.vn/` |
| Origin | `https://trading.vietcap.com.vn` |
| Accept | `application/json` |
| User-Agent | User-Agent trình duyệt tiêu chuẩn |

> **Xác thực:** Tất cả endpoint đều **công khai**, không cần authentication.

## Bao bì response

Response có cấu trúc thống nhất:

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

- Endpoint phân trang: `data.content[]` (mảng các bản ghi)
- Endpoint tóm tắt: `data` (object phẳng)

> **Đơn vị:** Tất cả `*Value*` là **VND (chính xác, không scale)**. Tất cả `*Volume*` là **cổ phiếu**. Các trường tỷ lệ ở khoảng `0.0–1.0` (ví dụ `0.49` = 49%).
