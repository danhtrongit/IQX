# Bản tin thị trường v4: bàn giao

Nhánh `feat/ban-tin-v4` (chưa merge, chưa push, chưa deploy). Spec nguồn: `IQX-Ban-Tin-SPEC.md` (ngoài repo, bản của chủ sản phẩm). Migration: `backend/migrations/0044_market_bulletins.sql`.

## 1. Đã làm gì

- Trang web "Phân tích thị trường" còn 3 tab: Bản tin (PDF.js, bản máy tính từ 900 px, bản điện thoại dưới 900 px), Theo dõi, Bản tin cũ (6 tháng). Ba tab Trước/Giữa/Cuối phiên cũ đã bỏ khỏi giao diện.
- Quản trị `NỘI DUNG › Bản tin cuối phiên` viết lại: danh sách theo phiên và màn soạn 4 bước kèm xem trước (không còn Excel, không còn "Tạo bản tin").
- Bộ lọc: nút "Đẩy vào bản tin" (chỉ quản trị viên) với 5 điều kiện chặn đúng thông báo của spec và hộp chọn mã.
- Backend: bản nháp tự dựng sau phiên, kiểm tra, Public (dựng 2 PDF), Gỡ, theo dõi mã, lưu 6 tháng, xoá bản quá hạn.

## 2. Bảng, job, cờ môi trường

Bảng mới (migration 0044): `market_index_bars` (chuỗi VN-Index 520 phiên), `market_bulletins`, `market_bulletin_files` (PDF lưu bytea theo từng revision), `market_bulletin_slots` (ảnh chụp 3 bộ lọc mỗi phiên), `market_tracking`.

Job mới: `market.bulletin-draft`, chạy mỗi 5 phút mọi ngày, idempotent, chỉ làm việc khi VN-Index có nến đã chốt mới hơn bản nháp đã lưu. Cờ: `JOB_MARKET_BULLETIN_DRAFT_ENABLED` (mặc định bật).

Job cũ đã tắt mặc định (dữ liệu giữ nguyên, bật lại bằng cờ):

| Job | Cờ bật lại |
|---|---|
| `reports.premarket` | `JOB_REPORTS_PREMARKET_ENABLED=true` |
| `reports.midday` | `JOB_REPORTS_MIDDAY_ENABLED=true` |

`reports.daily` và `reports.daily-retry` vẫn bật: chúng ghi bản "cuối phiên" cũ vào bảng báo cáo cũ, không còn UI nào đọc. Không tắt trong đợt này vì chưa có yêu cầu và để dữ liệu cũ liền mạch. Muốn tắt: `JOB_REPORTS_DAILY_ENABLED=false`, `JOB_REPORTS_DAILY_RETRY_ENABLED=false`.

## 3. API

Công khai (`api/v2/market`): `GET bulletins/latest`, `GET bulletins/archive`, `GET bulletins?date=`, `GET bulletins/:date/files/:variant/:revision` (PDF, `?download=1` để tải), `GET tracking`.

Quản trị (`api/v2/admin/market-bulletins`, vai trò admin): `GET /`, `GET :date`, `PUT :date/content`, `POST :date/check`, `POST :date/preview` (SVG từ cùng bộ vẽ với PDF), `POST :date/publish`, `POST :date/unpublish`, `GET push-context`, `GET push-candidates` (mới ở đợt này: danh sách mã của một kết quả bộ lọc kèm giá, %, GTGD của phiên, để hộp "Đẩy" khớp số in trên bản tin), `POST api/v2/market/bulletins/:date/slots/:slot` (đẩy từ Bộ lọc).

API cũ không còn giao diện nào gọi, còn nguyên để không phá client cũ (mobile đang tạm ngừng): `GET api/v2/market-analysis/:type/latest`, `GET api/v2/market-analysis/:type`, `GET api/v2/market-analysis/:type/:sessionDate`, `POST api/v2/market-analysis/:type/run` và các route tương ứng ở `api/v1/market-analysis`. Có thể gỡ ở đợt dọn sau khi chắc chắn không còn client dùng.

## 4. Các điểm §9 của spec đã tự chốt

1. Mã vào Theo dõi lúc Public, không phải lúc đẩy.
2. Gỡ bản tin: mã do chính bản đó thêm bị bỏ khỏi Theo dõi với `exit_reason = unpublished`; Public lại thì thêm lại với ngày đề xuất cũ.
3. Đường dẫn Demo trading của mã: `https://iqx.vn/demo-trading?view=trading&symbol={MA}`. `view=chart` của spec không phải id công cụ của trang (trang đọc `view=trading` là Đặt lệnh, tab Biểu đồ là mặc định). Đường dẫn này trùng liên kết "Demo Trading" của thanh điều hướng, chỉ thêm `symbol`. Hằng số: `DEMO_TRADING_LINK` trong `bulletin.constants.ts`.
4. Khổ giấy: bản máy tính 1123 x 794 px (A4 ngang, 2 trang), bản điện thoại 397 x 707 px (9:16, 5 trang). Spec yêu cầu gửi ảnh trước khi làm: lần này chạy tự động nên chưa gửi; xem hai file mẫu `frontend/e2e/fixtures/ban-tin/desktop.pdf` và `mobile.pdf` (sinh từ dữ liệu giả của test render).
5. Độ rộng thị trường (tăng/đứng/giảm) và giá trị giao dịch lấy từ `market_daily_bars` của sàn HOSE; GTGD mỗi mã = đóng cửa x khối lượng / 1e6 (tỷ đồng). VN-Index lấy từ DNSE vào `market_index_bars`. Cần chủ sản phẩm xác nhận: chỉ số GTGD của spec có tính cả HNX/UPCOM hay chỉ HOSE (hiện chỉ HOSE).
6. Thông báo khi có bản tin mới: để đợt sau, chưa làm.

## 5. Quyết định kỹ thuật và hành vi cần biết

- Bản nháp được tạo khi VN-Index có nến đóng cửa của phiên (không tạo cho ngày nghỉ lễ; bản nháp lạc ngày nghỉ bị xoá).
- PDF dựng bằng `pdfkit` từ các primitive vector (`Canvas`/`PageDoc`), cùng primitive đó xuất SVG cho xem trước quản trị. Không dùng trình duyệt headless nên không cần Chromium trên VPS. Font Be Vietnam Pro nằm ở `src/modules/market-bulletins/render/fonts`, được `scripts/copy-assets` chép vào `dist`. Phụ thuộc mới: `pdfkit` 0.20.2.
- Biểu đồ trong PDF vẽ riêng bằng bộ vẽ của bản tin, không dùng IQLine.
- URL file có revision (`/files/:variant/:revision`) nên cache dài hạn an toàn; Public lại tạo revision mới.
- Điều kiện của bộ lọc in lên bản tin do client gửi (dựng từ `criteriaParts` ở `frontend/src/pages/strategy/filter/definition.ts`); máy chủ kiểm lại mã băm tiêu chí của phiên bản bộ lọc đã lưu và cắt theo giới hạn (16 dòng, 160 ký tự).
- Hộp "Đẩy": tick sẵn các mã đang chọn trong bảng kết quả; nếu bảng không chọn mã nào thì tick sẵn tối đa 10 mã có GTGD lớn nhất. Danh sách sắp xếp theo GTGD giảm dần, khoá ở 10 mã.
- "Mở trong Bộ lọc" (bước 3 màn soạn) mở bộ lọc ở phiên bản hiện tại; chưa có API xem lại phiên bản cũ.
- Hướng dẫn (tour) `bantin` viết lại còn 8 bước, gắn với 3 tab; khoá tour giữ nguyên `bantin`.
- Menu quản trị có nhóm mới "Nội dung" chứa "Bản tin cuối phiên".
- Trang giới thiệu (`/`) từng quảng cáo "Ba bản nhận định mỗi phiên, 07:15/11:30/16:30": đã sửa còn một bản cuối phiên cho khớp.
- Lỗi đã gặp và sửa khi chạy thật bằng Playwright: vùng nội dung của Demo Trading (Radix ScrollArea, `display: table`) bị trang PDF 1180 px kéo rộng rồi đo lại đúng số đó, gây cuộn ngang. Khung đọc PDF dùng `contain: inline-size` để bề rộng không phụ thuộc nội dung bên trong; trang kế tiếp dùng khung cuộn gần nhất làm gốc IntersectionObserver để được vẽ trước khi cuộn tới.

## 6. Chạy và kiểm tra

- Backend: `cd backend && npm run typecheck && npm run lint && npm test && npm run contracts:check && npm run api:coverage:check`.
- Test tích hợp Postgres của bản tin chỉ chạy khi có `BULLETIN_PG_URL` (cơ sở dữ liệu dùng một lần đã áp migration 0001 đến 0044, ví dụ bằng `npm run build && npm run db:migrate` của backend với `DATABASE_URL` trỏ vào đó): `BULLETIN_PG_URL=postgresql://postgres@127.0.0.1:55444/iqx_v2_bulletin npx vitest run test/unit/market-bulletins.pg.test.ts`.
- Frontend: `cd frontend && npm run typecheck && npm run lint && npm run contracts:check && npm test && npm run build`.
- E2E (Playwright, API giả lập, PDF thật): `E2E_PORT=4391 npx playwright test e2e/ban-tin.spec.ts --project=chromium`.
- Sau khi đổi API backend: `cd backend && npm run contracts:generate && npm run api:coverage`, rồi `cd frontend && npm run contracts:generate`.

## 7. Triển khai

1. Áp migration 0044 (runner tự áp). 2. Cài phụ thuộc (`pdfkit`). 3. Build backend (chép font). 4. Khởi động lại API và worker. 5. Frontend đổi cùng lúc (tab mới gọi API mới). Sau khi deploy, chờ job `market.bulletin-draft` tạo bản nháp (hoặc phiên giao dịch kế tiếp), vào Quản trị viết nhận định, đẩy 3 bộ lọc rồi Public.
Lùi: gỡ nhánh là đủ cho giao diện; bảng mới không ảnh hưởng chức năng cũ. Muốn dựng lại 3 bản cũ, bật 2 cờ ở mục 2 và khôi phục tab trong `market-workspace-page.tsx` từ lịch sử git.

## 8. Chưa kiểm chứng

- Chưa gọi DNSE thật: ngữ nghĩa khối lượng của chỉ số VN-Index (đơn vị cổ phiếu hay chia sẻ) dựa theo dữ liệu mẫu và code hiện có; cần so một phiên thật khi chạy production.
- Chưa so khớp từng pixel với `IQX-Ban-Tin-MAU.html`; bố cục, chữ và màu theo spec và đã xem ảnh chụp, nhưng chủ sản phẩm nên xem PDF thật.
- Chưa thử trên điện thoại thật hoặc Safari; Playwright chỉ chạy Chromium. PDF.js lớp chữ/liên kết đã kiểm trong Chromium.
- Màn soạn quản trị và hộp "Đẩy" kiểm bằng test component (API giả lập), chưa chạy trên trình duyệt với backend thật và dữ liệu thật.
- Chưa có thử nghiệm tải: 2 PDF mỗi bản (khoảng 70 KB mỗi file) lưu bytea; với 6 tháng lưu trữ và nhiều revision vẫn nhỏ, nhưng chưa đo.
- Hai test không liên quan thỉnh thoảng quá hạn khi chạy cả bộ dưới tải (backend `practice-engine-reference`; frontend một số test biểu đồ Học viện và demo-trading); chạy riêng đều qua.
