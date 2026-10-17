# AGENTS.md — IQX

Quy tắc chung cho mọi agent làm việc trong repo này. Các thư mục con có `AGENTS.md` riêng
(`frontend/AGENTS.md`, `mobile/AGENTS.md`) — đọc thêm file đó khi làm việc trong thư mục tương ứng.

## 1. Luôn tìm cách đẩy nhanh tiến độ

- Hành động ngay khi đã đủ thông tin; không hỏi lại những gì có thể tự kiểm tra trong code.
- Gộp các lệnh/tool call độc lập vào cùng một lượt để chạy song song.
- Chỉ đọc phần file cần thiết; ưu tiên `rg`/`grep` có mục tiêu thay vì đọc cả thư mục.
- Chạy test/lint có phạm vi hẹp (file hoặc module bị ảnh hưởng) trước, chỉ chạy full suite trước khi gộp nhánh.
- Không mở rộng phạm vi ngoài yêu cầu; ghi chú việc phát sinh để làm sau.

## 2. Dùng Sonnet cho task nhẹ

- Task nhẹ, không cần suy luận nhiều — giao cho subagent chạy model **Sonnet**:
  tìm kiếm/định vị code, đổi tên hàng loạt, sửa lỗi lint/type đơn giản, regenerate contracts,
  cập nhật text/i18n, viết test theo mẫu có sẵn, chạy lệnh và tóm tắt kết quả.
- Task cần suy luận (thiết kế kiến trúc, debug khó, migration dữ liệu, bảo mật, review cuối) — dùng model mạnh nhất.
- Viết prompt cho subagent đầy đủ ngữ cảnh: mục tiêu, file liên quan, ràng buộc, cách kiểm tra, cần báo cáo gì.
- Không chạy workflow nhiều agent nặng khi chưa được người dùng đồng ý (tiết kiệm quota).

## 3. Luôn gộp và xoá nhánh sau khi xong

- Mỗi task làm trên một nhánh `feat/...`, `fix/...` hoặc `chore/...` tách từ `main`.
- Khi task xong và test xanh:
  1. `git checkout main && git merge --no-ff <nhánh>` (hoặc fast-forward nếu lịch sử thẳng).
  2. `git branch -d <nhánh>` — xoá nhánh local (và nhánh remote nếu đã push).
  3. `git push origin main`.
- Không để nhánh cũ tồn đọng; trước khi bắt đầu task mới, `main` phải sạch và là nhánh duy nhất.
- Commit message theo Conventional Commits: `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`.

## Cấu trúc repo

- `backend/` — API Node/TypeScript, migrations, contracts (`npm test`, `vitest`).
- `frontend/` — web Vite + React, tuân theo `frontend/DESIGN.md`.
- `mobile/` — app Expo, dùng chung design token với web.
- `promo-video/` — video Remotion (xem `PROJECT.md`).
- Deploy VPS thủ công (tarball + script deploy qua SSH) — xem `backend/deploy/`.
