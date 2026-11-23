# AGENTS.md

## Ngôn ngữ

- **Phản hồi người dùng:** luôn bằng tiếng Việt.
- **Giao task cho sub agent / worker:** viết prompt bằng tiếng Anh để tiết kiệm token. Yêu cầu worker chỉ báo cáo tóm tắt gọn (file/dòng liên quan, thay đổi đã làm, kết quả kiểm chứng), **không** chép lại nguyên khối code dài; main agent kiểm chứng rồi tóm tắt lại cho người dùng bằng tiếng Việt.

## Chất lượng & Quy trình làm việc

- **Ưu tiên chất lượng lên hàng đầu:** thiết kế chuẩn chỉnh, xử lý triệt để edge-case, đảm bảo type-safety, hiệu năng và khả năng bảo trì lâu dài.
- **Bảo toàn ngữ cảnh phiên chính:** main agent đóng vai điều phối (lập kế hoạch, ra quyết định, giao việc, tích hợp git, báo cáo) và hạn chế tự làm để ngữ cảnh không nhanh chạm giới hạn token. Đọc code, tìm kiếm, sửa code, build/test và review đều giao cho sub agent. Sub agent trả về kết quả qua file báo cáo cùng một bản tóm tắt ngắn; main agent không kéo log dài, diff lớn hay nội dung file vào phiên chính.
- **Ngoại lệ (main agent tự làm):** chỉ những việc thực hiện nhanh với output ngắn, ví dụ `git status/log/merge`, một lệnh kiểm tra có kết quả vài dòng, ghi ledger/memory, hoặc sửa nhỏ ≤ 3 file đã biết rõ đường dẫn.
- **Kiểm chứng bắt buộc:** **không** tin mù quáng báo cáo "xong/GREEN" từ worker. Mỗi kết quả phải được kiểm chứng độc lập (build, typecheck, test, đối chiếu diff và dữ liệu thực tế) trước khi báo cáo hoàn thành. Việc kiểm chứng nặng giao cho một sub agent khác với worker đã làm; main agent chỉ tự chạy lệnh kiểm chứng khi output ngắn, ví dụ dòng tổng kết `Passed/Failed`.
- **Tốc độ & song song hoá:** chạy song song các tác vụ độc lập (tool calls, sub agents) trong cùng một lượt để tối ưu thời gian mà không đánh đổi độ chính xác.
- **Không làm thừa, không hỏi thừa:** không hỏi lại khi đã đủ thông tin để thực hiện; không làm ngoài phạm vi được yêu cầu.
- **Không quét nhầm thư mục lớn:** **KHÔNG** tự ý tìm kiếm hoặc đọc trong `archives/`, `node_modules/` hay thư mục build/cache trừ khi được yêu cầu đối chiếu trực tiếp; luôn ghi rõ danh sách cấm này trong prompt giao việc cho worker.

## Cấu trúc thư mục

- Giữ cây thư mục gọn, sạch, chuẩn production ngay từ đầu; mỗi thư mục phải có lý do tồn tại rõ ràng.
- **Mô hình Hybrid** (theo loại ở tầng gốc + chia thư mục con theo cụm):
  - Tầng gốc phân theo vai trò kỹ thuật (`components/`, `systems/`, `services/`, `types/`, `utils/`, `assets/`...).
  - Bên trong mỗi thư mục gốc, gom các file cùng mảng vào thư mục con (ví dụ: `components/ui/`, `components/hud/`, `components/clan/`, `systems/combat/`, `systems/social/`...).
- **Kiểm soát số lượng file & độ sâu:** không để quá ~10–15 file nằm phẳng trực tiếp trong một thư mục (vượt ngưỡng phải tách thư mục con); đồng thời tránh lồng quá sâu hoặc tạo thư mục chỉ có 1 file lẻ loi.

## Git & worktree

- **Xong việc:** kiểm tra sạch lỗi → merge vào `main` → push → xoá nhánh (cả local lẫn remote).
- **Worktree / Workspace:** chỉ tách nhánh (`branch` / `share`) khi cần thiết và dọn dẹp ngay sau khi hoàn tất.
- **Phân quyền tích hợp:** worker không tự push, merge hay xoá nhánh; các bước tích hợp git cuối cùng do main agent thực hiện.
