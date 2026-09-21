# Kế hoạch Linh thú 2D v2

1. **Data/migration:** giữ schema `journey_identity.py` và migration hiện hữu; không thay assigned species. Chạy lại classification, quyền API và graduation/Bot integration tests.
2. **Assignment/API:** giữ `JourneyIdentityService` và current wire; ghi map contract trong `MASCOT-2D-CONTRACTS.md`.
3. **Lifecycle:** mở rộng `JourneyIdentityStage.tsx`; egg vẫn dùng renderer hiện tại, mascot chuyển runtime sprite; lưu milestone khi nội dung đã hiển thị và phát xong, giữ đúng run ID.
4. **Sprite runtime:** thêm `mascot-2d/mascotManifest.ts`, loader/preload và `SpriteStripPlayer.tsx`; timing mỗi frame, loop delay/hold, pause/resume, decode failure, reduced motion.
5. **Manifest/artwork:** tạo bộ path riêng v2 cho cả năm loài, sinh ảnh theo tài liệu bằng ImageGen, giữ prompt và nguồn; xác minh dimensions/alpha/budget. Asset chưa đủ phải khai báo trung thực và có poster fallback.
6. **Reveal:** silhouette → full color greet → idle; không replay hatch đã persist; lỗi strip dùng poster rồi hoàn tất hiển thị.
7. **Design:** giữ Tahoma/Arco/tokens của IQX; stage không chữ, effects mảnh; hồ sơ hiển thị avatar đúng loài, căn cứ phân loại và Bot status. Không thêm thư viện UI thứ hai.
8. **Analytics:** nối `identityEvent` hiện có, theo animation/context và asset error; không log từng frame.
9. **Tests:** manifest, frame timing, cancellation/visibility, run supersession, fallback, tab persistence; regression Bot/backend; build và visual QA desktop/mobile.
10. **Rollout:** namespace asset v2 + versioned URLs; fallback không chặn panel/Bot. Báo cáo `MASCOT-2D-TEST-REPORT.md` và trạng thái tài sản, không claim PSD/frame chưa được tạo.
