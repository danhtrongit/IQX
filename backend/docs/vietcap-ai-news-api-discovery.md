# Khám phá API Tin AI Vietcap

> Tham chiếu từ thao tác Playwright trên trang `https://trading.vietcap.com.vn/ai-news?exchange=hose`.
>
> **Cập nhật lần cuối:** 2026-04-25
> **Base API:** `https://ai.vietcap.com.vn`
> **Referer trên web:** `https://trading.vietcap.com.vn/`
> **Chú thích:** ✅ live đã xác minh | ⚠️ đã quan sát nhưng kết quả tùy bộ lọc/dữ liệu

## 1. Tóm tắt

Vietcap AI News cung cấp các endpoint JSON không cần xác thực cho:

- **Tin doanh nghiệp**: tin theo công ty kèm ticker, sentiment, score, nguồn, tóm tắt và thời lượng audio.
- **Tin chủ đề**: tin theo chủ đề (diễn biến thị trường, vàng, tỷ giá, tiền mã hóa, dầu, hàng hóa, nông sản, trái phiếu).
- **Tin từ sở**: tin công bố từ HNX/HOSE, kèm file đính kèm trong phần chi tiết.
- **Tin theo mã**: tin doanh nghiệp + tin từ sở của một ticker, kèm tổng hợp sentiment.
- **Chi tiết tin**: nội dung HTML đầy đủ, lấy theo `slug` (không phải `id`).
- **Audio**: URL file `.m4a` giọng nam/nữ, lấy theo `id` của bài tin.

Trong phiên duyệt được quan sát, không cần token hay cookie nào. Request chỉ dùng header trình duyệt cơ bản và `Accept: application/json`.

## 2. Header chung

Các endpoint list/detail/audio hoạt động tốt với header trình duyệt tối thiểu:

```http
Accept: application/json
Referer: https://trading.vietcap.com.vn/
User-Agent: <user agent trình duyệt>
```

Khi tích hợp backend, hãy bật cache bảo thủ và rate limit vì đây là API công khai của bên thứ ba.

## 3. Mô hình bộ lọc

| Bộ lọc UI | Query parameter | Giá trị / định dạng | Ghi chú |
|---|---|---|---|
| Trang | `page` | số nguyên (đếm từ 1) | `page=1` ở mọi list endpoint |
| Page size | `page_size` | số nguyên | Trang chủ dùng `12` cho business/topic và `18` cho exchange; tin liên quan ở trang chi tiết dùng `5` |
| Từ ngày | `update_from` | `YYYY-MM-DD` hoặc rỗng | Trang chủ mặc định lùi 1 tháng (`2026-03-25`); trang công ty dùng 1 năm |
| Đến ngày | `update_to` | `YYYY-MM-DD` hoặc rỗng | Trang chủ mặc định ngày hiện tại (`2026-04-25`) |
| Mã | `ticker` | viết hoa hoặc rỗng | Ví dụ: `VIC`, `HDB` |
| Ngành | `industry` | slug ngành hoặc rỗng | Lấy từ `GET /api/get_industry_info` |
| Chủ đề | `topic` | key chủ đề hoặc rỗng | Lấy từ `GET /api/v3/topics_all` |
| Nguồn tin | `newsfrom` | key nguồn hoặc rỗng | Lấy từ `GET /api/v3/get_source_info?language=vi` |
| Nhận định | `sentiment` | `Positive`, `Neutral`, `Negative` hoặc rỗng | UI hiển thị: Tích cực, Trung lập, Tiêu cực |
| Ngôn ngữ | `language` | `vi` | Phiên kiểm tra chỉ dùng tiếng Việt |

## 4. Tin doanh nghiệp

### Endpoint danh sách

```http
GET https://ai.vietcap.com.vn/api/v3/news_info
```

Mẫu request quan sát được:

```http
GET /api/v3/news_info?page=1&ticker=&industry=&update_from=2026-03-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

Mẫu request theo ticker (trang chi tiết/công ty):

```http
GET /api/v3/news_info?page=1&ticker=HDB&industry=&update_from=&update_to=&sentiment=&newsfrom=&language=vi&page_size=5
GET /api/v3/news_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

Mẫu request có lọc đã xác minh:

```http
GET /api/v3/news_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=Positive&newsfrom=fireant&language=vi&page_size=2
```

### Cấu trúc response

```json
{
  "total_records": 3466,
  "name": "",
  "news_info": [
    {
      "id": "a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903",
      "ticker": "HDB",
      "industry": "Ngân hàng",
      "news_title": "HDB: ĐHĐCĐ HDBank 2026: ...",
      "news_short_content": "Ngân hàng TMCP Phát triển TP.HCM ...",
      "news_source_link": "https://diendandoanhnghiep.vn/...",
      "news_image_url": "https://...",
      "update_date": "2026-04-25 10:05:00",
      "news_from": "diendandoanhnghiep",
      "news_from_name": "Tạp chí Diễn đàn Doanh nghiệp",
      "sentiment": "Positive",
      "score": 9.75,
      "slug": "hdb-dhdcd-hdbank-2026-loi-nhuan-ke-hoach-tang-41-quy-mo-tiem-can-1-2-trieu-ty-dong",
      "male_audio_duration": 391.488,
      "female_audio_duration": 417.536
    }
  ]
}
```

### Ghi chú field

| Field | Ý nghĩa |
|---|---|
| `id` | ID ổn định của bài tin; dùng để tra audio |
| `slug` | Bắt buộc cho lookup chi tiết. Lookup theo `id` thử nghiệm đều trả về 404 |
| `sentiment` | `Positive`, `Neutral`, `Negative` |
| `score` | Điểm sentiment dạng số, ví dụ `9.75` |
| `male_audio_duration`, `female_audio_duration` | Thời lượng audio (giây); URL audio lấy bằng endpoint khác |

## 5. Tin chủ đề

### Danh mục chủ đề

```http
GET https://ai.vietcap.com.vn/api/v3/topics_all?language=vi
```

Response chứa `static_topic[]`, mỗi phần tử có `name`, `key`, và mảng `news[]` (top tin).

Các key chủ đề đã quan sát:

| Tên | Key |
|---|---|
| Diễn biến Thị trường | `dien-bien-thi-truong` |
| Chứng khoán Thế giới | `chung-khoan-the-gioi` |
| Giá vàng | `gia-vang` |
| Tỷ giá | `ty-gia` |
| Tiền mã hóa | `tien-ma-hoa` |
| Xăng dầu | `xang-dau` |
| Khoáng sản | `khoang-san` |
| Nông sản | `nong-san` |
| Trái phiếu | `trai-phieu` |

### Endpoint danh sách theo chủ đề

```http
GET https://ai.vietcap.com.vn/api/v3/topics_info
```

Mẫu request trang chủ:

```http
GET /api/v3/topics_info?page=1&topic=&industry=&update_from=2026-03-25&update_to=2026-04-25&sentiment=&newsfrom=&page_size=12&language=vi
```

Mẫu request lọc theo chủ đề đã xác minh:

```http
GET /api/v3/topics_info?page=1&topic=gia-vang&industry=&update_from=2026-03-25&update_to=2026-04-25&sentiment=&newsfrom=&page_size=2&language=vi
```

### Khác biệt response so với tin doanh nghiệp

Cấu trúc response giống `news_info`, có 2 khác biệt thực tế:

- `ticker` thường là key chủ đề, ví dụ `gia-vang`, `xang-dau`.
- Mỗi item có thêm `topic_name`, ví dụ `Giá vàng`, `Xăng dầu`.

Ví dụ:

```json
{
  "id": "486ba43cedfe5adf2659666f6f37a679d26a6808d2744ab402fa3f381136a3bb",
  "ticker": "gia-vang",
  "industry": "OTHER",
  "news_title": "Giá vàng sáng 25/4 hồi phục nhẹ, vàng miếng SJC tăng 800.000 đồng",
  "news_from": "fireant",
  "news_from_name": "FireAnt",
  "sentiment": "",
  "score": 0,
  "slug": "gia-vang-sang-25-4-hoi-phuc-nhe-vang-mieng-sjc-tang-800000-dong",
  "topic_name": "Giá vàng"
}
```

## 6. Tin từ sở

### Endpoint danh sách

```http
GET https://ai.vietcap.com.vn/api/v3/xnews_info
```

Mẫu request trang chủ:

```http
GET /api/v3/xnews_info?page=1&page_size=18&language=vi&newsfrom=&update_from=2026-03-25&update_to=2026-04-25
```

Mẫu request theo ticker (trang công ty):

```http
GET /api/v3/xnews_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

### Cấu trúc response

```json
{
  "total_records": 10676,
  "name": "",
  "news_info": [
    {
      "id": "52ee25bb706a1f098139d80b26830c55090c44cc4a77c93e58360fc792f6317b",
      "ticker": "SGB",
      "news_title": "SGB: Báo cáo tài chính quý 1/2026",
      "news_source_link": "https://hnx.vn/vi-vn/m-tin-tuc-hnx/tintuc-611277-1.html",
      "update_date": "2026-04-24 17:12:00",
      "news_from": "HNX",
      "slug": "sgb-bao-cao-tai-chinh-quy-1-2026-17770255200-2-1"
    }
  ]
}
```

Bản ghi exchange ngắn hơn business/topic. Lấy chi tiết theo `slug` để có tên công ty, file đính kèm, nội dung đầy đủ và `news_type`.

### Ví dụ chi tiết exchange

```http
GET /api/v3/news_from_slug?slug=sgb-bao-cao-tai-chinh-quy-1-2026-17770255200-2-1&language=vi
```

Một số field đã xác minh:

```json
{
  "id": "52ee25bb706a1f098139d80b26830c55090c44cc4a77c93e58360fc792f6317b",
  "ticker": "SGB",
  "company_name": "Ngân hàng Thương mại Cổ phần Sài Gòn Công thương",
  "industry": "Ngân hàng",
  "news_title": "SGB: Báo cáo tài chính quý 1/2026",
  "news_short_content": "Báo cáo tài chính quý 1/2026",
  "news_full_content": "<p>.</p>",
  "file_attachment": [
    {
      "text": "1. SGB_2026.4.24_2a7c780_EN__Consolidated_Financial_Statements_Q12026_signed.pdf",
      "url": "https://owa.hnx.vn/ftp///cims/2026/4_W4/000000016196688_EN__Consolidated_Financial_Statements_Q12026_signed.pdf"
    }
  ],
  "news_from": "HNX",
  "news_type": "exchange_news",
  "news_from_name": "HNX"
}
```

## 7. Tin theo mã

Trang công ty kết hợp 3 nhóm API:

### 7.1. Tổng hợp sentiment theo mã

```http
GET https://ai.vietcap.com.vn/api/v3/ticker_score?ticker=VIC&industry=&group=&summary=false&language=vi
```

Field đã xác minh trong `ticker_info[]`:

| Field | Ý nghĩa |
|---|---|
| `ticker` | Mã |
| `cnt_news` | Số tin trong cửa sổ tổng hợp |
| `score` | Điểm sentiment hiện tại |
| `sentiment` | Phân loại sentiment hiện tại |
| `logo` | URL logo của ticker |
| `news_from[]` | Danh sách id, tên nguồn, URL nguồn, slug của các bài |
| `count_pos`, `count_neu`, `count_neg` | Phân bổ sentiment |
| `extractive_summaries[]` | Tóm tắt rút trích cho từng bài |
| `extractive_sentiments[]` | Sentiment của từng tóm tắt |
| `extractive_positions[]` | Đoạn tích cực/tiêu cực được highlight |
| `organ_name` | Tên doanh nghiệp tiếng Việt |
| `hose`, `vn30`, `vn_midcap`, `vn_smallcap`, `vn100` | Cờ chỉ số/nhóm |

`summary=true` trả về `ticker_info` rỗng cho `VIC` trong lần kiểm tra; nên dùng `summary=false` trừ khi đã xác minh lại.

### 7.2. Tin doanh nghiệp theo ticker

```http
GET /api/v3/news_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

### 7.3. Tin từ sở theo ticker

```http
GET /api/v3/xnews_info?page=1&ticker=VIC&industry=&update_from=2025-04-25&update_to=2026-04-25&sentiment=&newsfrom=&language=vi&page_size=12
```

## 8. Chi tiết bài tin

### Endpoint

```http
GET https://ai.vietcap.com.vn/api/v3/news_from_slug?slug={slug}&language=vi
```

Dùng `slug` từ bất kỳ list endpoint nào. Lookup theo `id` đã thử với nhiều endpoint khác đều trả 404; frontend dùng `news_from_slug`.

### Ví dụ chi tiết tin doanh nghiệp

```http
GET /api/v3/news_from_slug?slug=hdb-dhdcd-hdbank-2026-loi-nhuan-ke-hoach-tang-41-quy-mo-tiem-can-1-2-trieu-ty-dong&language=vi
```

Field đã xác minh:

```json
{
  "id": "a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903",
  "ticker": "HDB",
  "company_name": "Ngân hàng Thương mại Cổ phần Phát Triển Thành phố Hồ Chí Minh",
  "industry": "Ngân hàng",
  "news_title": "HDB: ĐHĐCĐ HDBank 2026: ...",
  "news_short_content": "Ngân hàng TMCP Phát triển TP.HCM ...",
  "summary": "ĐHĐCĐ HDBank 2026 đã thông qua kế hoạch ...",
  "highlight_position": "lợi nhuận trước thuế tăng 41% lên trên 30.100 tỷ đồng",
  "news_full_content": "<p><strong>...</strong></p>...",
  "file_attachment": [],
  "news_source_link": "https://diendandoanhnghiep.vn/...",
  "news_image_url": "https://...",
  "update_date": "2026-04-25 10:05:00",
  "news_from": "diendandoanhnghiep",
  "sentiment": "Positive",
  "score": 9.75,
  "slug": "hdb-dhdcd-hdbank-2026-loi-nhuan-ke-hoach-tang-41-quy-mo-tiem-can-1-2-trieu-ty-dong",
  "male_audio_duration": 391.488,
  "female_audio_duration": 417.536,
  "news_type": "stock_news",
  "news_from_name": "Tạp chí Diễn đàn Doanh nghiệp"
}
```

`news_full_content` là HTML, có thể chứa đoạn văn, ảnh, chú thích. Tin công bố sàn có thể có `file_attachment[]` PDF và HTML rất ngắn.

## 9. Audio

### Endpoint

```http
GET https://ai.vietcap.com.vn/api/audio_from_id?id={news_id}
```

Dùng `id` từ list/detail.

Ví dụ đã xác minh:

```http
GET /api/audio_from_id?id=a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903
```

Response:

```json
{
  "male": "https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/male/a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903.m4a",
  "female": "https://vietcap-ai.s3.ap-southeast-1.amazonaws.com/prod/voice/female/a6b16c51c6d0f143a8ac56851ad18315414e9f7eecc076314c34ffdd536d7903.m4a"
}
```

Ghi chú:

- List/detail đã có `male_audio_duration` và `female_audio_duration` (giây).
- Tin từ sở có thể có duration `0`; endpoint audio vẫn trả URL nhưng nên kiểm tra file tồn tại trước khi cho phép phát.
- Đường dẫn S3 có thể đoán được từ `{voice}/{id}.m4a`, nhưng backend nên gọi `audio_from_id` thay vì tự ghép URL.

## 10. Endpoint dữ liệu tham chiếu

### Nguồn tin

```http
GET https://ai.vietcap.com.vn/api/v3/get_source_info?language=vi
```

Các giá trị nguồn đã quan sát:

| viName | value |
|---|---|
| Tất cả nguồn | `` |
| Vietstock | `vietstock` |
| FireAnt | `fireant` |
| CafeF | `cafef` |
| VnEconomy | `vneconomy` |
| Markettimes | `markettimes` |
| VietnamFinance | `vietnamfinance` |
| Tin nhanh chứng khoán | `tinnhanhchungkhoan` |
| Tạp chí công thương | `tapchicongthuong` |
| Người quan sát | `nguoiquansat` |
| Nhà đầu tư | `nhadautu` |
| Tạp chí Kinh tế Sài Gòn | `thesaigontimes` |
| Tạp chí Diễn đàn Doanh nghiệp | `diendandoanhnghiep` |
| Báo Sài Gòn Giải Phóng | `sggp` |
| Báo Công Thương | `congthuong` |
| Vnbusiness | `vnbusiness` |
| Nguồn khác | `others` |

### Ngành

```http
GET https://ai.vietcap.com.vn/api/get_industry_info
```

Các giá trị ngành đã quan sát:

| viName | value |
|---|---|
| Tất cả ngành | `` |
| Xây dựng và Vật liệu | `construction-and-materials` |
| Thực phẩm và đồ uống | `food-and-beverage` |
| Dầu khí | `oil-and-gas` |
| Hóa chất | `chemicals` |
| Bất động sản | `real-estate` |
| Tài nguyên Cơ bản | `basic-resources` |
| Dịch vụ tài chính | `financial-services` |
| Truyền thông | `media` |
| Hàng & Dịch vụ Công nghiệp | `industrial-goods-and-services` |
| Y tế | `health-care` |
| Ngân hàng | `banks` |
| Bảo hiểm | `insurance` |
| Bán lẻ | `retail` |
| Hàng cá nhân & Gia dụng | `personal-and-household-goods` |
| Du lịch và Giải trí | `travel-and-leisure` |
| Điện, nước & xăng dầu khí đốt | `utilities` |
| Ô tô và phụ tùng | `automobiles-and-parts` |
| Công nghệ Thông tin | `technology` |
| Viễn thông | `telecommunications` |

### Top tickers

```http
GET https://ai.vietcap.com.vn/api/v2/get_top_tickers?industry=&group=hose&top_neg=5&top_pos=5
```

Trang chủ dùng endpoint này để hiển thị top ticker tích cực/tiêu cực.

Cấu trúc response:

```json
{
  "record_count": 10,
  "ticker_info": [
    {
      "ticker": "VIC",
      "score": 9.21,
      "logo": "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/VIC.jpeg",
      "sentiment": "Positive",
      "organ_name": "Tập đoàn Vingroup - Công ty CP"
    }
  ]
}
```

Đã quan sát `group=hose`; UI còn có nút `VN30`, `VNMidCap`, `VNSmallCap`, `VN100`, `HNX`, `HNX30`, `UpCom` nhưng giá trị `group` cho từng nút chưa được xác minh lại.

## 11. Endpoint hỗ trợ ngoài tin

Không bắt buộc cho nội dung tin nhưng được trang sử dụng:

| Mục đích | Endpoint |
|---|---|
| Search bar doanh nghiệp | `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/search-bar?language=1` |
| Card giá theo mã | `POST https://trading.vietcap.com.vn/api/price/symbols/getList` body `{"symbols":[...]}` |
| Trạng thái thị trường | `GET https://trading.vietcap.com.vn/api/price/marketStatus/getAll` |
| App config | `GET https://trading.vietcap.com.vn/api/configuration-service/v1/non-authen/app-config?t={timestamp}` |

## 12. Ánh xạ dữ liệu sang backend

| Khái niệm backend | Nguồn upstream | Field chính |
|---|---|---|
| Item danh sách tin | `news_info`, `topics_info`, `xnews_info` | `id`, `slug`, `ticker`, `news_title`, `news_short_content`, `news_source_link`, `news_image_url`, `update_date`, `news_from`, `news_from_name`, `sentiment`, `score`, `topic_name` |
| Chi tiết tin | `news_from_slug` | Thêm `company_name`, `summary`, `highlight_position`, `news_full_content`, `file_attachment`, `news_type` |
| Audio | `audio_from_id` | `male`, `female`, kèm thời lượng từ list/detail |
| Danh mục chủ đề | `topics_all` | `static_topic[].name`, `static_topic[].key` |
| Bộ lọc nguồn | `get_source_info` | `viName`, `enName`, `value` |
| Bộ lọc ngành | `get_industry_info` | `viName`, `enName`, `value` |
| Sentiment theo mã | `ticker_score` | `score`, `sentiment`, `count_pos`, `count_neu`, `count_neg`, `extractive_summaries`, `extractive_sentiments`, `extractive_positions` |

## 13. Lưu ý triển khai

- Lookup chi tiết bằng `slug`, không phải `id`.
- Lookup audio bằng `id`, không phải `slug`.
- Giữ `news_full_content` ở dạng HTML đã sanitize hoặc convert sang plain text ở biên.
- Chuẩn hóa `update_date` từ chuỗi `YYYY-MM-DD HH:mm:ss`.
- Coi `sentiment=""` và `score=0` là không có/trung lập tùy quyết định sản phẩm; tin chủ đề/từ sở thường có sentiment rỗng.
- Giữ `file_attachment[]` cho tin từ sở vì PDF có thể là nội dung chính.
- Cache catalog nguồn/chủ đề/ngành; nhỏ và ít thay đổi.
- Cache list/detail/audio metadata với TTL ngắn vì tin thay đổi liên tục.
