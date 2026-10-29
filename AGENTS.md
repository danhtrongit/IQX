# AGENTS.md — IQX

- **Luôn tìm cách đẩy nhanh tiến độ.**
- **Chọn model cho subtask/subagent:** mặc định dùng Sonnet với effort `xhigh` hoặc `max`; chỉ dùng Opus (effort `medium` hoặc `high`) khi task thực sự khó.
- **Luôn gộp và xoá nhánh sau khi xong:** merge vào `main`, push, xoá nhánh.
