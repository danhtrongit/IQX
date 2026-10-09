# AGENTS.md

## Chính sách subagent

Dùng subagent Claude (công cụ Agent) cho mọi việc có thể chia nhỏ hoặc giao đi. Agent chính lập kế hoạch, giao việc, xác minh và tích hợp; nắm kiến trúc và các quyết định quan trọng nhưng không tự làm phần triển khai khối lượng lớn.

### Subagent Claude


| Model      | Dùng cho                                                             |
| ---------- | -------------------------------------------------------------------- |
| **Haiku**  | Tra cứu, agent Explore, sửa nhỏ rải ở nhiều file đã biết vị trí.     |
| **Sonnet** | **Mặc định** cho triển khai: tính năng, sửa nhiều file, viết test.   |
| **Opus**   | Chỉ cho việc thật sự khó: kiến trúc, lập kế hoạch phức tạp, bug khó. |


- Chọn model rẻ nhất mà vẫn làm được việc một cách đáng tin cậy.
- Luôn truyền `model` khi gọi Agent: bỏ trống thì subagent có thể kế thừa model của agent chính (Opus). Chỉ dùng `fork` khi thật sự cần ngữ cảnh hội thoại, vì fork luôn chạy cùng model với agent chính.
- Subagent tự thực hiện việc được giao, không giao tiếp cho subagent khác.
- Mỗi subagent nhận prompt tự đủ ngữ cảnh: mục tiêu, đường dẫn file, ràng buộc, tiêu chí nghiệm thu, kết quả mong đợi. Yêu cầu kết luận ngắn gọn, không dump nội dung file.
- Kiểm tra `git status` trước và giữ nguyên thay đổi của người dùng. Giao các file không chồng lấn (kể cả file dùng chung và file sinh tự động) cho các worker ghi song song, hoặc dùng `isolation: "worktree"`.
- Xem diff sau tích hợp và chạy kiểm tra liên quan để xác minh kết quả của subagent trước khi chấp nhận; không làm lại việc đã giao.
- Không tạo subagent để tra một thông tin trong file đã biết hoặc sửa đơn giản một file — tự làm trực tiếp.

### agent-hub: chỉ để review

Chỉ dùng agent-hub **để review code**, với backend `codex`, model `gpt-6-astra` (effort `high` trở lên), `mode: "read"`, mỗi lúc một job. Không dùng backend hay model khác.

- Review các thay đổi không tầm thường trước khi báo hoàn thành.
- `hub_spawn` trả về `job_id` ngay; tiếp tục làm việc và đọc kết quả bằng `hub_result` khi job xong.
- Reviewer không thấy cuộc hội thoại: đưa diff hoặc đường dẫn file, mục đích của thay đổi và những điểm cần kiểm tra.
- Không đưa secret (mật khẩu, API key, token) vào prompt hoặc diff gửi reviewer; loại các file như `.env` khỏi phạm vi review.

## Ngôn ngữ

- Viết prompt cho subagent và ghi chú nội bộ bằng tiếng Anh để tiết kiệm token.
- Viết tài liệu dự án dành cho người dùng bằng tiếng Việt.
- Trả lời người dùng bằng ngôn ngữ họ dùng.