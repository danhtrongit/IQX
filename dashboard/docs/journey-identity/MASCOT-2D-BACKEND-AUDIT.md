# Linh thú 2D v2 — backend audit ngày 20/09/2026

## Kết luận

Không tìm thấy lỗi backend có bằng chứng trong phạm vi phân loại Linh thú, snapshot trước khi lộ AI, gán cố định, fan-out sau tốt nghiệp, quyền sở hữu API và idempotency. Bộ kiểm thử bắt buộc chạy qua **95/95**. Audit này không sửa production backend, database, chiến lược Bot, deployment hoặc commit.

Backend đang giữ đúng các bất biến quan trọng:

- loài được chọn bằng số lần `user verdict == AI verdict` trên đủ năm lớp trong cửa sổ Cấp 4 → tốt nghiệp Cấp 6;
- thứ tự phá hòa lấy trực tiếp từ `LOP_KEYS`: `ky_thuat → dong_tien → noi_bo → tin_tuc → dinh_gia`;
- có bộ hợp lệ nhưng không lớp nào khớp vẫn gán Bạch Hổ, còn không có bộ hợp lệ thì giữ `pending_data_repair`;
- câu trả lời người dùng được commit ở một HTTP transaction trước khi endpoint reveal trả AI;
- sau khi `assigned`, mọi GET/retry chỉ kiểm chứng hồ sơ đóng băng, không tính lại loài từ dữ liệu mới;
- tốt nghiệp Cấp 6 được commit trước, sau đó Bot và Linh thú được khởi tạo ở hai nhánh lỗi độc lập;
- GET Bot/Linh thú không cấp vốn, không khởi tạo và không chạy batch;
- mọi truy vấn/API public lấy owner từ `CurrentUser`, không nhận `user_id` tùy ý từ client.

## Bằng chứng theo contract

| Contract | Bằng chứng code | Kết quả audit |
|---|---|---|
| Match count năm lớp | `backend/app/services/journey_identity/classification.py::classify` và `choose_mascot` | Đếm `ok/neu/bad` như nhau; mismatch không cộng; không đọc P&L, win rate hoặc kết quả Bot. |
| Cửa sổ C4 → C6 | `JourneyIdentityService.initialize`, `validate_window` | `window_start = Cap4Progress.entered_at`, `window_end = Cap6Progress.graduated_at`; retry không được nới hoặc đổi mốc. |
| Bộ đầu tiên theo user/symbol/session | `classify` + unique `journey_assessments(user_id, symbol, trading_date)` | Chọn commit sớm nhất; thời điểm bằng nhau mà không chứng minh được thứ tự bị loại để sửa dữ liệu, không phá hòa bằng UUID. |
| Snapshot trước reveal | `create_dataset`, `submit`, `reveal`; `JourneyReadingDataset`, `JourneyAssessment` | Snapshot AI được hash và chỉ lưu server-side; submit commit trước khi reveal; response trước reveal không chứa `ai_answers`. |
| Cùng snapshot/version | `dataset_id`, `dataset_hash`, `assessment_hash`, kiểm symbol/session và `created_at <= completed_at` | `dataset_hash` là định danh nội dung tương đương data version; snapshot sai mã, sai phiên hoặc bị sửa bị loại fail-closed. |
| Gán cố định | `BotMascotProfile`, `validate_assignment`, `validate_frozen_profile` | Unique `(user_id, mascot_rules_version)`; kiểm lại counts, contribution, hashes, source refs và frozen window; không reroll. |
| Ràng buộc DB | migrations `c8d9e0f1a2b3` và `f3b4c5d6e7f8` | Có unique, shape checks, whitelist loài/lớp/căn cứ, thứ tự window và `assigned_at >= window_end`. |
| Recovery | `services/jobs/journey_identity_recovery.py` | Chỉ xét graduate thiếu profile hoặc pending; user lock; pending không đổi được thì không ghi lặp; một user lỗi không chặn user khác. |
| Tách tốt nghiệp/Bot/Linh thú | `api/v1/endpoints/cap6.py::graduate` | Tốt nghiệp durable trước; Bot và mascot dùng savepoint/commit/catch riêng. Lỗi nhánh này không rollback nhánh kia hoặc timestamp tốt nghiệp. |
| Bot cấp vốn idempotent | `services/bot/service.py::BotService.initialize` | Lock progress C6; unique account/instance/funding key; đúng một tài khoản và một bút toán 100 triệu. |
| API ownership | `api/v1/endpoints/journey_identity.py`, `api/v1/endpoints/bot.py` | Dataset, assessment, reveal, run cursor, account, positions, journal và performance đều khóa theo authenticated user. |
| UI event idempotency | `JourneyIdentityService.ui_event` | User lock; timestamp `or` giữ lần đầu; reveal bắt buộc hatch; cursor Bot chỉ nhận run succeeded của đúng user và không lùi theo ngày. |
| Bot độc lập Linh thú | `cap6.py`, `bot.py`, `JourneyIdentityService` | Mascot chỉ đọc `BotRunReceipt`; UI event không gọi batch; loài không đi vào config/domain/service quyết định Bot. |

## Hai adapter khác tên so với tài liệu nguồn

Đây là sai khác wire đã được frontend, backend, schema và test dùng đồng bộ; audit không tự đổi vì đổi tên sẽ là breaking change:

1. Tài liệu dùng `user_ai_match_count`, còn wire hiện tại dùng `ai_match_count`. Backend còn tách `zero_match_tie_break` để UI có copy trung tính riêng khi tất cả match count bằng 0.
2. Tài liệu tham chiếu `egg_hatch_seen` / `mascot_reveal_seen`, còn wire hiện tại dùng `hatch_seen` / `reveal_seen`.

Các adapter này đã được ghi trong `MASCOT-2D-READINESS-AUDIT.md`. Nếu public API cần bám nguyên văn spec, nên thêm alias có version thay vì đổi trực tiếp wire đang chạy.

## Giới hạn chưa thể xác nhận bằng fixture

- Nguồn live `analyze_insight` và BCTC phải trả đúng ticker nguồn, phiên giao dịch và đủ năm lớp có phần đọc hiển thị. Thiếu ticker/phiên/lớp vẫn cho người dùng học ở chế độ degraded nhưng bộ đó bị loại khỏi assignment; kết quả đúng là `pending_data_repair`, không đoán neutral.
- Live Bot provider cần official close, security status, canonical L1 amplitude, fee/lot và snapshot năm lớp đúng phiên. Các test chứng minh adapter fail-closed khi thiếu; audit offline không chứng minh các provider live đang cung cấp đủ trường ở VPS.
- Schema `users` không có cờ riêng cho test/seed account. Backend loại `admin` và mọi record có `source != learning`, nhưng một tài khoản test được tạo như user thường không thể được nhận diện tự động. Nếu production có test user dạng đó, nguồn tạo record phải gắn `source` khác `learning` hoặc bổ sung metadata account trong một migration riêng.

Không có giới hạn nào ở trên cho phép fallback sang AI hiện tại, giá điều chỉnh hoặc dữ liệu tự bịa.

## Kiểm thử

Chạy từ `backend/`:

```text
uv run pytest tests/test_journey_identity.py tests/test_journey_identity_recovery_job.py tests/test_graduation_bot_integration.py tests/test_bot_domain.py tests/test_bot_data.py -q
```

Kết quả: `95 passed in 24.43s`.

Log đầy đủ: `/tmp/iqx-mascot-2d-20260920/backend-audit-agent.log`.

Các scenario được phủ gồm match/tie/all-zero/no-data, dedupe và ambiguous first commit, snapshot symbol/hash/timestamp, frozen assignment corruption, retry/recovery, hatch/reveal ordering, foreign/failed Bot run, tốt nghiệp tách nhánh Bot/Linh thú, Bot candidate gate, sizing, stop/take-profit và adapter dữ liệu fail-closed.
