# AGENTS.md — IQX

> `CLAUDE.md` là symlink tới file này.

## Ngôn ngữ & Giao tiếp

- **Phản hồi người dùng:** luôn bằng tiếng Việt, ngắn gọn, đi thẳng vào kết quả.
- **Giao task cho sub agent:** viết prompt bằng tiếng Anh để tiết kiệm token. Yêu cầu sub agent chỉ báo cáo tóm tắt (file/dòng liên quan, thay đổi đã làm, kết quả kiểm tra), **không** chép lại nguyên khối code dài vào câu trả lời; sau đó main agent tóm tắt lại cho người dùng bằng tiếng Việt.

## Tốc độ & Tối ưu token

- Luôn tìm cách đẩy nhanh tiến độ; chạy song song các việc độc lập (tool call, sub agent) trong cùng một lượt.
- Không hỏi lại khi đã đủ thông tin để làm; không làm thừa ngoài phạm vi được yêu cầu.
- **Đọc có mục tiêu:** dùng `Grep`/`Glob` định vị chính xác trước, sau đó `Read` theo khoảng dòng (`offset`/`limit`) với file lớn thay vì đọc tràn cả file.
- **Không đẻ sub agent cho việc quá nhỏ:** nếu chỉ cần tra cứu nhanh hoặc đọc/sửa ≤ 3 file đã biết rõ đường dẫn, thực hiện trực tiếp trên main agent (tránh tốn phí khởi tạo ngữ cảnh của sub agent).
- **Không quét nhầm thư mục:** KHÔNG tự ý tìm kiếm/đọc trong `node_modules/`, `dist/`, `mobile/` trừ khi được yêu cầu.

## Sub agent

### Giới hạn số lượng

- **Tối đa 10 sub agent chạy đồng thời** (tính cả agent con do sub agent tự đẻ ra). Đây là mức an toàn cho máy và hạn mức sử dụng.
- Khi đã đủ 10: xếp hàng việc mới, chỉ mở thêm khi có agent kết thúc; ưu tiên việc nằm trên đường găng và việc sửa lỗi nghiêm trọng.
- Không dừng ngang agent đang chạy chỉ để hạ số lượng; để chúng tự kết thúc rồi mới áp giới hạn cho các lượt mở tiếp theo.

### Chọn model & mức thinking (effort)

- **Mặc định (`sonnet` — effort `high` hoặc `xhigh`):**
  - Sửa code, refactor, viết test, cài đặt tính năng đã có plan cụ thể từ main agent.
  - Phân tích luồng, đọc hiểu logic vừa phải.
- **Dùng `opus` (effort `medium` hoặc `high`) chỉ cho task khó:**
  - Thiết kế kiến trúc, tính năng phức tạp, thuật toán, debug lỗi chưa rõ nguyên nhân.
  - UX/UI.
- **Dùng `haiku` (effort `high` hoặc `xhigh`):**
  - Task thuần tìm kiếm, tra cứu dữ liệu, quét diện rộng qua nhiều file. (Luôn giữ effort `high`/`xhigh` để đảm bảo độ chính xác.)

### Giao việc cho sub agent

Trước khi giao, main agent phải đưa plan cụ thể gồm:

1. **Mục tiêu (Goal)** — cần đạt được gì.
2. **File mục tiêu (Target files)** — đường dẫn cụ thể (kèm dòng/hàm nếu đã biết).
3. **Các bước (Steps)** — thứ tự thực hiện rõ ràng.
4. **Tiêu chí hoàn thành (Acceptance criteria)** — thế nào là xong & các edge-case cần chặn.
5. **Cách kiểm tra (Verification)** — lệnh build/test/thao tác cụ thể để xác nhận.

Không giao việc mơ hồ.

## Cấu trúc thư mục

- Giữ cây thư mục gọn, sạch, chuẩn production ngay từ đầu.
- Mỗi thư mục phải có lý do tồn tại rõ ràng.
- Nhóm file theo loại (components/, utils/, types/...), không nhóm theo tính năng (feature).

## Git & worktree

- **Luôn gộp và xoá nhánh sau khi xong:** kiểm tra sạch lỗi → merge vào `main`, push, xoá nhánh (cả local lẫn remote).
- **Worktree:** chỉ lấy những thứ cần thiết và xoá ngay sau khi dùng xong.

## Phạm vi

- **Mobile (`mobile/`) đang tạm ngừng:** không sửa, không cập nhật mobile theo thay đổi backend/web, trừ khi được yêu cầu rõ.
