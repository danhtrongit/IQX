# Linh thú 2D v2 — kết quả triển khai 20/09/2026

## Kết quả

Đã tích hợp runtime sprite 2D vào `JourneyIdentityStage` của các shell Cấp 0–6. Trứng giữ lifecycle hiện hành; sau tốt nghiệp và assignment hợp lệ, stage nở → silhouette → greet → idle. Mascot chỉ đọc run status từ backend. Không dùng Spine/WebGL/3D trong runtime mới, không sửa chiến lược Bot hoặc số dư/giao dịch người dùng.

### Phần bổ sung

- `src/features/journey-identity/mascot-2d/`: manifest v2 validator/loader, image decode cache, player theo thời gian từng frame, stage/reveal, avatar tĩnh, clock tạm dừng và kiểm thử.
- `JourneyIdentityStage.tsx`: dùng player thật cho mascot, ghi milestone sau trình bày; event hoàn tất giữ token/run ID đã phát.
- `JourneyCreatureIllustration.tsx`: handoff Trứng dùng silhouette mới đúng loài, không trở lại poster 3D cũ.
- `IdentityPanel.tsx`, `BotPanel.tsx`: avatar đúng loài và phần giải thích nhận diện, không mount thêm animation player trong sidebar.
- `/public/assets/mascots-2d/v2/`: 45 ảnh WebP alpha + 5 manifest, fallback trung tính. URL asset version **2.0.1**.
- `mascot-2d-preview.html` + `.tsx`: bản xem thử local dùng `IdentityScene` thật với dữ liệu mẫu; không phải route chọn loài trong sản phẩm.
- Backend không cần migration mới. Tái sử dụng snapshot, assignment, API, funding/run services hiện có. Hai file test Bot đã cố định đồng hồ scenario để không hỏng khi ngày thực tế vượt ngày fixture; không thay luật chống backfill.

## Sửa theo phản hồi hình bị cắt và hoạt ảnh giật

1. Atlas do ImageGen sinh có các mảnh alpha rời. Bbox cũ lấy cả mảnh thừa để căn nhân vật, làm một số frame lệch 39–44 px. Packer hiện chọn thành phần nhân vật liên thông chính trước khi đăng ký vị trí, dùng cùng scale và baseline; giữ pixel/pose được sinh, không tạo động tác giả từ poster.
2. MutationObserver trước đây nhận mỗi thay đổi `style.transform` của sprite rồi đo layout/hit-test. Đã bỏ qua thay đổi bên trong stage, vẫn đo overlay bên ngoài.
3. Image decode cache trước đây làm player remount có một render pending dù đã tải. Đã có cache kích thước giải mã trả đồng bộ, tránh lóe poster khi chuyển hoạt ảnh.
4. Sai decode/dimensions không chạy timeline giả; fallback poster/placeholder vẫn hoàn tất trình bày có kiểm soát.

Asset verifier cuối: **0 lỗi, 5 cảnh báo nhẹ**. Baseline drift tối đa 3 px; không còn clipping/fringe/jitter lớn theo kiểm tra asset. Chi tiết và giới hạn thẩm mỹ trong [MASCOT-2D-ASSET-STATUS.md](MASCOT-2D-ASSET-STATUS.md).

## Kiểm thử đã chạy

| Phạm vi | Lệnh trong thư mục tương ứng | Kết quả |
|---|---|---|
| Runtime + identity + Bot + toolbar | `npx vitest run src/features/journey-identity src/features/bot src/features/dashboard/components/RightToolbar.bot.test.tsx --maxWorkers=4 --minWorkers=1` | **100/100 pass** |
| Shell Cấp 0–6 và Bot regression | Vitest các `CapNTradingPage.test.tsx` và `BotPanel.test.tsx`, maxWorkers=2 | **144/144 pass**; có test trùng nhóm trên, không cộng tổng |
| Assignment, recovery, graduation, Bot domain/data | `uv run pytest tests/test_journey_identity.py tests/test_journey_identity_recovery_job.py tests/test_graduation_bot_integration.py tests/test_bot_domain.py tests/test_bot_data.py -q` | **95/95 pass** |
| Bot service và API | `uv run pytest tests/test_bot_service.py tests/test_bot_api.py -q` | **22/22 pass** |
| Asset verification | `python3 dashboard/scripts/verify-mascot-assets.py` từ repo root | **Pass**, 0 errors/5 warnings |
| ESLint phần runtime/UI thay đổi | ESLint mascot-2d, stage, illustration, visibility, identity panel, bot panel | **Pass** |
| TypeScript + production bundle | `npm run build` trong dashboard | **Pass** |

Các kiểm thử bao gồm variable frame holds, loop delay, callback once, pause/resume phần thời gian còn lại, tab hidden, cache/dimension/decode/timeout failures, stale run cancellation, reveal và queue milestone, quyền dữ liệu, cấp vốn một lần, tách Bot với mascot, đổi panel không remount stage và chỉ dùng avatar tĩnh trong sidebar.

Visual QA bằng trình duyệt local: desktop và viewport 390×844; chạm phản ứng; silhouette/greet; hatch tạm dừng khi bị bảng phủ che rồi tiếp tục; ghi hatch_seen trước reveal_seen; các loài và trạng thái phân tích. Kiểm tra ở trình duyệt máy tính với viewport điện thoại, chưa phải thử trên thiết bị iOS/Android thật; chưa có đo FPS dài hạn.

## Tài sản và nguồn

Đã dùng **built-in ImageGen** theo yêu cầu trực tiếp của người dùng, không dùng CLI/API key. Prompt đầy đủ và đường dẫn nguồn: [mascot-2d-imagegen-prompts.json](mascot-2d-imagegen-prompts.json). Các master PNG được sao chép vào `mascot-2d-source/`; runtime được xuất vào `dashboard/public/assets/mascots-2d/v2/`.

Năm atlas phẳng là source được sinh thực tế; khung gốc khoảng 229 px được chuẩn hóa ra canvas 640 px. Không có 10 file PSD/CLIP/KRA có layer từ họa sĩ và không giả là đã có. Bộ runtime đã đủ; chi tiết logo nhỏ/tính nhất quán nghệ thuật vẫn nên được duyệt trước phát hành rộng.

## Triển khai và giới hạn vận hành

Đợt Linh thú v2 này **chưa triển khai VPS**, không bật/thay worker giao dịch. Bot engine hiện có vẫn fail-closed khi thiếu official close, snapshot năm lớp có version và L1 canonical đúng phiên. Test fixture không chứng minh feed live đã đáp ứng các nguồn đó. Xem [backend audit](MASCOT-2D-BACKEND-AUDIT.md) và [contract](MASCOT-2D-CONTRACTS.md).
