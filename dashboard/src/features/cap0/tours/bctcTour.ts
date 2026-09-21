import type { TourConfig } from "@/features/tour"

export const bctcTour: TourConfig = {
  name: "bctc",
  steps: [
    { targetId: "tour-bctc-input", tang: "NHẬP MÃ", title: "Nhập mã để xem báo cáo tài chính", body: "Đây là ô tìm mã — nhập mã cổ phiếu bạn muốn xem báo cáo tài chính. Để bạn thấy trang trông thế nào, mình chọn sẵn **VIC (VinGroup)** làm ví dụ." },
    { targetId: "tour-bctc-hero", targetWaitMs: 4000, tang: "HERO", title: "Kết luận nhanh về mã", body: "Trên đầu trang là **tóm tắt nhanh** về mã: giá hiện tại, giá hợp lý ước tính, và **kết luận một câu** về tình trạng công ty. Đọc đoạn này là hiểu ngay công ty đang ở đâu." },
    { targetId: "tour-bctc-scorecard", tang: "HERO", title: "Thẻ điểm sức khỏe 5 chiều", body: "Chấm công ty theo **5 mặt**: Kinh doanh · Sinh lời · Dòng tiền · An toàn tài chính · Định giá. Biểu đồ radar cho hình dạng tổng thể — càng đều và càng to càng tốt. Bên phải là điểm chi tiết từng mặt kèm nhận xét." },
    { targetId: "tour-bctc-block-1", tang: "KHỐI 01", title: "Câu chuyện doanh nghiệp", body: "Khối 01 là **tóm tắt bằng chữ do AI viết** — công ty làm gì, kiếm tiền thế nào, năm gần đây tăng trưởng ra sao. Bên dưới có 2 cột **Điểm khỏe** (xanh) và **Cần theo dõi** (đỏ) — cách nhanh nhất để nắm được điểm mạnh và rủi ro." },
    { targetId: "tour-bctc-block-2", tang: "KHỐI 02", title: "Giá đang đắt hay rẻ?", body: "Khối định giá: dùng **4 phương pháp độc lập** (DCF, RIM, P/E lịch sử, sàn sổ sách) để ước tính vùng giá hợp lý. Thanh ngang cho thấy giá hiện tại đang nằm ở đâu so với vùng giá trị — trong vùng, dưới vùng, hay vượt vùng." },
    { targetId: "tour-bctc-block-3", tang: "KHỐI 03", title: "Bức tranh tài chính 5 năm", body: "Biểu đồ cột chồng 5 năm cho thấy công ty đang **được cấu thành từ đâu** — vốn chủ, nợ ngắn hạn, nợ dài hạn. Bên phải chỉ ra tăng trưởng gần đây đến từ nguồn nào — vốn hay nợ." },
    { targetId: "tour-bctc-block-4", tang: "KHỐI 04", title: "Kinh doanh có ổn không?", body: "Khối này chấm mảng kinh doanh: **doanh thu 5 năm** (cột) và **biên lợi nhuận gộp/ròng** (đường). Xu hướng cùng đi lên là dấu hiệu tốt — bán được nhiều hơn mà vẫn giữ được biên lãi." },
    { targetId: "tour-bctc-block-5", tang: "KHỐI 05", title: "Tiền có thật không?", body: "So sánh **lợi nhuận ghi sổ** với **tiền mặt thật sự thu về**. Nếu tiền mặt luôn cao hơn hoặc bằng lợi nhuận — công ty kiếm ra tiền thật. Nếu tiền mặt thấp hơn nhiều — lợi nhuận trên giấy nhưng chưa vào túi." },
    { targetId: "tour-bctc-block-6", tang: "KHỐI 06", title: "Sức khỏe tài chính có vững không?", body: "Khối lớn nhất — chấm sức khỏe qua **3 mặt**: **Nợ** (nhiều hay ít, có kiểm soát không) · **Chống chịu** (nếu khủng hoảng có sống nổi không) · **Chất lượng sổ sách** (số liệu có sạch, có đáng tin không). Cả 3 xanh là công ty rất vững.", placement: "right" },
    { targetId: "tour-bctc-block-7", tang: "KHỐI 07", title: "Cổ đông nhận được gì?", body: "Khối cuối — chính sách cổ tức: 5 năm gần đây công ty chia cổ tức bao nhiêu, bằng tiền hay bằng cổ phiếu. Công ty đầu tư dài hạn thường tái đầu tư nhiều hơn trả cổ tức.", placement: "right" },
    { targetId: "tour-bctc-input", tang: "KẾT TOUR", title: "Tour hoàn thành ✓", body: "Đó là 8 khối phân tích BCTC. Bạn có thể gõ mã bất kỳ để xem báo cáo tương ứng.<br><br>**Riêng mã ngân hàng** (VCB, TCB, BID, MBB…) sẽ có bố cục khác ở 4 khối giữa — thay Kinh doanh / Dòng tiền / Sức khỏe bằng **Cách kiếm tiền · Hiệu quả vận hành · Chất lượng tài sản**. Cứ gõ mã ngân hàng để xem thử." },
  ],
}
