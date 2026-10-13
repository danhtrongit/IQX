# AI Insight v2 — "Góc nhìn đầu tư"

Spec: `IQX_AI_Insight_Goc_nhin_dau_tu_SPEC.md` (v2) + HTML mẫu. Product/UI theo spec; các điều chỉnh kỹ thuật ghi ở §4.

## 1. Codebase (spec §32 A)

- Module mới `src/modules/research/` (Nest), không đụng `analysis` (Insight v1 giữ nguyên).
- AI qua `AiProviderService.complete` sẵn có (OpenAI-compatible, `AI_PROXY_*`); prompt ở `research/prompts/research-{extract,match,build}.md`, copy vào `dist` bởi `scripts/copy-assets.ts`.
- Lưu PDF dưới `MEDIA_ROOT/research/YYYY/MM/<sha256>.pdf`; đọc text bằng `unpdf`.
- Giá hiện tại: `MarketDataService.getQuote` (`research-price.adapter.ts`).
- Sự kiện pha loãng: đọc `virtual_corporate_actions` (0013, event `ISS`), không sao chép.
- Frontend: `frontend/src/pages/charts/stock/insight/investment-view/`, chèn trong `stock-insight-briefing.tsx` (ẩn ở teaser, ẩn khi empty/lỗi/tắt cờ).

## 2. Nguồn báo cáo (spec §32 B)

| Nguồn | Vai trò | Cách lấy |
| --- | --- | --- |
| Vietstock `finance.vietstock.vn/View/ChannelEDocumentPage` | Chính, ~25 CTCK | Token trang kênh; `reportTypeID` 58 doanh nghiệp, 57 ngành, 51 vĩ mô/chiến lược; PDF `downloadedoc/<id>` |
| VNDirect `api-finfo.vndirect.com.vn/v4/news` | Phụ | Báo cáo của VNDirect, PDF đính kèm |

- Metadata (mã, CTCK, ngày, giá mục tiêu trong tiêu đề) do backend parse, không qua AI. Tên CTCK chuẩn hoá trong `sources/broker-aliases.ts`.
- Báo cáo nhiều mã/ngành lưu với `symbol = NULL`, không xử lý.
- Trùng file giữa hai nguồn: khử theo SHA-256 (`download_status = duplicate`).
- Đo thực tế 2026-10-13: 7 ngày gần nhất Vietstock 39 báo cáo doanh nghiệp (30 có giá mục tiêu trong metadata), VNDirect 4.

## 3. Dữ liệu và luồng (spec §32 C)

Migration `0021_research_investment_view.sql` (chỉ thêm bảng): `research_reports`, `research_claims` (`matched_at`), `broker_current_views(+_claims)`, `canonical_theses`, `canonical_thesis_claims`, `investment_view_versions` (1 bản published/mã), `investment_view_theses`, `valuation_snapshots`, `research_processing_jobs` (lease 1 job chạy/mã), `research_ai_usage` (ngân sách theo ngày VN).

1. Job `research.reports-sync` (06:30 VN hằng ngày, cờ `JOB_RESEARCH_REPORTS_SYNC_ENABLED`): liệt kê + tải PDF, không AI. Lần đầu backfill 30 ngày, sau đó 3 ngày.
2. `GET /api/v2/ai/investment-view/:symbol` (premium): chỉ đọc DB. Không đổi → trả bản đã publish (0 token). Có thay đổi → mở/nhập job nền, trả `{status:'processing', jobId}`.
3. Job: trích claim từng báo cáo (theo CTCK, cũ → mới) → so khớp theo lô 12 claim (claim `valuation` bỏ qua) → evidence/hết hạn 30 ngày → broker current view → viết lại tối đa 8 luận điểm được nhiều CTCK ủng hộ nhất (nhóm 4) → kiểm tra tự động, sửa 1 lần → sắp xếp ≤5 → định giá (median/min/max giá mục tiêu mới nhất mỗi CTCK, ẩn khi có sự kiện pha loãng) → fingerprint; không đổi thì không publish; circuit breaker chặn thay đổi bất thường.
4. `GET …/:symbol/status?jobId=` để poll (frontend 3s, sau 1 phút 10s).

## 4. Điều chỉnh so với spec

- Endpoint riêng thay vì nhét vào Insight v1; xử lý nền có lease + heartbeat trong DB, job chết bị tiếp quản sau 90s.
- Cờ `RESEARCH_INSIGHT_ENABLED` (tắt → 404 `FEATURE_DISABLED`, job sync bỏ qua). Nguồn bật bằng `RESEARCH_SOURCES`.
- Ngân sách AI/ngày `RESEARCH_AI_DAILY_CALL_LIMIT` (mặc định 400 lệnh). Hết ngân sách → giữ bản cũ.
- Lỗi: báo cáo lỗi trích 3 lần thì bỏ; claim chưa match / luận điểm chưa viết được làm lại ở lần search sau, nhưng sau một job lỗi có cooldown 10 phút. Câu trả lời AI bị cắt cụt không retry.
- Circuit breaker chặn thì không chạy lại cùng đầu vào; bản cũ vẫn hiển thị.
- Số định dạng vi-VN; tên CTCK không bao giờ đưa vào prompt viết luận điểm (ẩn danh B1/B2).

## 5. Kiểm chứng

- Unit: ~240 test cho module research; repository chạy thật trên Postgres (0001→0021).
- E2E với AI thật (DCM, 11 báo cáo/8 CTCK): 138 giây, 22 lệnh AI (~222k token vào, ~55k ra), lần gọi sau 19 ms/0 token.
- Hạn chế đã biết: thỉnh thoảng hai luận điểm gần nghĩa vẫn cùng xuất hiện (ví dụ cùng nói về xuất khẩu urê); lần mở đầu tiên của một mã mất 2–3 phút.

## 6. Vận hành

- Bật: `RESEARCH_INSIGHT_ENABLED=true` trong `runtime.env`, restart api + worker.
- Theo dõi: `research_processing_jobs` (status/llm_calls/error_message), `research_ai_usage`, log `research circuit breaker`.
- Tắt khẩn: `RESEARCH_INSIGHT_ENABLED=false` + restart (dữ liệu giữ nguyên).
