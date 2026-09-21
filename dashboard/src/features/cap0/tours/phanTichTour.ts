import type { TourConfig } from "@/features/tour"

export const phanTichTour: TourConfig = {
  name: "phantich",
  steps: [
    { targetId: "tour-phantich-input", tang: "NHẬP MÃ", title: "Nhập mã để xem phân tích", body: "Đây là ô tìm mã — nhập mã cổ phiếu bạn muốn phân tích. Để bạn thấy trang trông thế nào, mình chọn sẵn **VCB (Vietcombank)** làm ví dụ." },
    { targetId: "tour-phantich-header", targetWaitMs: 3000, tang: "HEADER MÃ", title: "Thông tin nhanh về mã", body: "Trên đầu trang là các số cơ bản của mã: **giá hiện tại, % thay đổi phiên, cao/thấp trong ngày, khối lượng khớp**. Chấm LIVE ở góc phải cho biết dữ liệu đang cập nhật realtime." },
    { targetId: "tour-phantich-trend", tang: "BRIEFING", title: "Chẩn đoán 3 dòng", body: "Ba dòng đầu tiên là **chẩn đoán nhanh**: mã đang có xu hướng gì (Đi ngang · Tăng · Giảm), trạng thái thế nào (Yếu · Trung bình · Mạnh), và khung phân tích áp dụng (ngắn hạn · trung hạn · dài hạn)." },
    { targetId: "tour-phantich-narrative", tang: "BRIEFING", title: "Bản tóm tắt bằng chữ", body: "Đoạn văn bản tổng hợp diễn biến quan trọng của mã: khối ngoại đang làm gì, tin tức gì tác động, vùng giá nào đáng chú ý. Đọc đoạn này là hiểu được tổng thể tình hình mã." },
    { targetId: "tour-phantich-diff", tang: "BRIEFING", title: "So với phiên trước", body: "Ô so sánh nhanh: điều gì đã **thay đổi so với phiên gần nhất** — áp lực bán tăng hay giảm, khối ngoại chuyển hướng, tâm lý cải thiện… Giúp bạn biết tình hình đang xấu đi hay tốt lên." },
    { targetId: "tour-phantich-observations", tang: "BRIEFING", title: "Quan sát theo 5 góc", body: "Tóm tắt tình hình mã từ **5 góc nhìn**: Thanh khoản · Dòng tiền · Nội bộ · Tin tức · Hỗ trợ & Kháng cự. Mỗi góc 1 dòng, tương ứng 5 lớp phân tích chi tiết ở phần dưới." },
    { targetId: "tour-phantich-levels", tang: "BRIEFING", title: "Mốc theo dõi", body: "Các **mốc giá quan trọng** cần chú ý — hỗ trợ ở đâu, kháng cự ở đâu, và điều gì có thể xảy ra nếu giá vượt/thủng các mốc đó." },
    { targetId: "tour-phantich-verdict", tang: "BRIEFING", title: "Gợi ý hôm nay", body: "Kết luận cuối cùng của bản briefing: **Mua · Bán · Nắm giữ · Quan sát thêm**. Đây là gợi ý dựa trên tổng hợp 5 lớp phân tích — không phải khuyến nghị tài chính, chỉ là điểm khởi đầu để bạn cân nhắc." },
    { targetId: "tour-phantich-divider", tang: "5 LỚP CHI TIẾT", title: "5 lớp phân tích chi tiết", body: "Bên dưới là **5 lớp phân tích chi tiết** — bằng chứng số học đằng sau bản briefing ở trên. Mỗi lớp có thang đánh giá 5 mức (Rất yếu → Rất tốt), bảng số liệu, và biểu đồ minh họa." },
    { targetId: "tour-phantich-l1", tang: "5 LỚP CHI TIẾT", title: "L1 · Xu hướng", body: "Lớp 1: **phân tích xu hướng giá** — mã đang đi ngang, tăng hay giảm, hỗ trợ/kháng cự ở đâu, đà giá thế nào. Có biểu đồ giá và MA (đường trung bình) 20 phiên gần nhất.", placement: "right" },
    { targetId: "tour-phantich-l2", tang: "5 LỚP CHI TIẾT", title: "L2 · Thanh khoản", body: "Lớp 2: **khối lượng giao dịch** — mã đang được mua bán nhiều hay ít, so với trung bình thế nào. Có biểu đồ thanh khoản 10 phiên.", placement: "right" },
    { targetId: "tour-phantich-l3", tang: "5 LỚP CHI TIẾT", title: "L3 · Dòng tiền", body: "Lớp 3: **dòng tiền lớn** — khối ngoại và tự doanh CTCK đang mua ròng hay bán ròng mã này. Có 2 biểu đồ song song để so sánh.", placement: "right" },
    { targetId: "tour-phantich-l4", tang: "5 LỚP CHI TIẾT", title: "L4 · Nội bộ", body: "Lớp 4: **giao dịch nội bộ** — lãnh đạo, HĐQT, cổ đông lớn đang mua hay bán cổ phiếu công ty mình. Người trong nhà mua nhiều thường là tín hiệu tích cực.", placement: "right" },
    { targetId: "tour-phantich-l5", tang: "5 LỚP CHI TIẾT", title: "L5 · Tin tức", body: "Lớp 5: **tin tức liên quan mã** — các tin quan trọng gần đây có thể tác động đến giá. Tour hoàn thành — bạn có thể cuộn lên đọc lại bản briefing hoặc gõ mã khác để xem phân tích.", placement: "right" },
  ],
}
