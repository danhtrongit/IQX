# AGENTS.md — IQX

> `CLAUDE.md` là symlink tới file này.

## Ngôn ngữ

- **Phản hồi người dùng:** luôn bằng tiếng Việt.
- **Giao task cho sub agent:** viết prompt bằng tiếng Anh để tiết kiệm token. Kết quả sub agent trả về được tóm tắt lại cho người dùng bằng tiếng Việt.

## Tốc độ làm việc

- Luôn tìm cách đẩy nhanh tiến độ.
- Chạy song song các việc độc lập (tool call, sub agent) trong cùng một lượt.
- Không hỏi lại khi đã đủ thông tin để làm.
- Không làm thừa ngoài phạm vi được yêu cầu.

## Sub agent

- **Mặc định:** `sonnet`, effort `high` hoặc `xhigh`.
- **`opus`** (effort `medium` hoặc `high`) chỉ dùng cho task khó (kiến trúc, debug phức tạp, thuật toán) hoặc UX/UI.
- Giao việc cho sonnet phải kèm plan cụ thể: **mục tiêu, file cần sửa, các bước, tiêu chí hoàn thành, cách kiểm tra**. Không giao việc mơ hồ.

## Cấu trúc thư mục

- Giữ cây thư mục gọn, sạch, chuẩn production ngay từ đầu.
- Mỗi thư mục phải có lý do tồn tại rõ ràng.
- Nhóm file theo loại (components/, utils/, types/...), không nhóm theo tính năng (feature).

## Git & worktree

- **Xong việc:** merge vào `main` → push → xoá nhánh (cả local lẫn remote).
- **Worktree:** chỉ lấy những thứ cần thiết và xoá ngay sau khi dùng xong.

## Phạm vi

- **Mobile (`mobile/`) đang tạm ngừng:** không sửa, không cập nhật mobile theo thay đổi backend/web, trừ khi được yêu cầu rõ.
