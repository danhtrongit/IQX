# Linh thú 2D v2 — khảo sát ngày 20/09/2026

Nguồn: toàn bộ bảy tài liệu và ảnh `image_linhthu_2D.png` trong `/Users/danhtrongit/Downloads/BOT LINH THU`. Bộ v2 thay thế yêu cầu Spine, renderer SVG nhân vật và hình ảnh 3D trước đây. Người dùng yêu cầu dùng design + ImageGen; ảnh sinh mới được lưu riêng, không ghi đè bộ ảnh cũ.

| Contract | Bằng chứng thực tế | Quyết định |
|---|---|---|
| MainVisualSlot | `src/features/cap0/Cap0TradingPage.tsx` đến `cap6/Cap6TradingPage.tsx` mount `JourneyIdentityStage` độc lập với `RightSidebar` | Giữ stage, không key theo tab |
| Tốt nghiệp | `backend/app/api/v1/endpoints/cap6.py`: commit tốt nghiệp rồi khởi tạo Bot và mascot riêng; `cap6_progress.graduated_at` | Tái sử dụng, không trigger bằng animation |
| Chứng cứ trước lộ AI | `JourneyReadingDataset`, `JourneyAssessment`; `journey_identity/service.py` submit trước reveal; unique user/symbol/session | Đã có snapshot/hash/thứ tự commit, không chấm lại lịch sử |
| Phân loại | `journey_identity/classification.py` chọn bản hoàn chỉnh đầu tiên, window C4→C6, đếm ok/neu/bad, tie theo LOP_KEYS | Tái sử dụng; zero-match và pending tách riêng |
| Gán cố định | `BotMascotProfile`, unique user/rules_version; `validate_frozen_profile` kiểm chứng source window, hash và đóng góp | Không migration đổi loài |
| API | GET `/api/v1/bot/mascot`, POST `/api/v1/bot/mascot/ui-events`, CurrentUser, extra=forbid | Giữ wire đang dùng; tên event hatch_seen/reveal_seen là adapter của contract v2 |
| UI milestones | `JourneyIdentityUI`: hatch, reveal, greet date, last run id | Có sẵn; frontend cần callback đúng run đã phát |
| Bot | `bot/config.py`, `domain.py`, `service.py`, `models/bot_run.py`; tài khoản 100 triệu riêng, chuẩn same_session_close | Không đổi chiến lược |
| Bot nguồn live | `bot/data.py`: feed hiện chưa chứng minh official close, versioned five-layer snapshot và L1 canonical | Giữ fail-closed và lỗi nguồn thật; không bật giao dịch bằng dữ liệu giả |
| Scheduler | `services/jobs/bot_session.py`, `jobs/__init__.py`; run status và ID trong `BotRunReceipt` | Chỉ đọc cho mascot; không tạo job từ UI |
| Panel | `IdentityPanel`, `bot/BotPanel` có sáu khối và API đọc | Bổ sung avatar 2D tĩnh và giao diện hồ sơ |
| Renderer hiện tại | `JourneyCreatureIllustration` dùng poster image và SVG stage effects; `JourneyIdentityStage` dùng clock cố định cho mascot | Thiếu manifest v2, sprite timing và reveal silhouette thật |
| Tài sản | `public/journey-identity/generated/`: 5 poster cũ, không có sprite strips | Thêm namespace `/assets/mascots-2d/v2/`, fallback độc lập |
| Accessibility | `visibility.ts`: document visibility, IntersectionObserver, overlay occlusion; reduced motion | Tái sử dụng pause/resume, bổ sung frame tests |

Không cần thay schema để hoàn thành runtime v2: toàn bộ evidence và milestone đã được lưu. Khoảng trống chính là manifest validator/cache, preload/decode, SpriteStripPlayer, Mascot2DStage/reveal, avatar tĩnh, artwork và kiểm thử tích hợp. Không triển khai lên VPS trong đợt này nếu chưa có yêu cầu cập nhật bản mới.
