import type { TourConfig } from "@/features/tour"

/** 23 real spotlight stops from IQX-Tour-BanTin.md. */
export const banTinTour: TourConfig = {
  name: "bantin",
  steps: [
    { targetId: "tour-bantin-pre-header", tang: "TRƯỚC PHIÊN", title: "☀️ Trước phiên · 07:15 — để CHUẨN BỊ", body: "Bản tin xuất bản 07:15 mỗi sáng. Trên đầu có **tiêu đề chính** tóm cả bài, và **Loại phiên** (An toàn · Tăng yếu · Đi ngang…) là chẩn đoán ngắn cho phiên hôm nay. Đọc 3 dòng này là đủ để quyết định có đọc chi tiết hay không." },
    { targetId: "tour-bantin-pre-world", tang: "TRƯỚC PHIÊN", title: "Đêm qua thế giới", body: "6 chỉ số toàn cầu chốt sổ đêm qua: S&P 500, NASDAQ, DOW, dầu Brent, DXY, Bitcoin. Đọc để biết tâm lý quốc tế trước khi VN mở cửa." },
    { targetId: "tour-bantin-pre-news", tang: "TRƯỚC PHIÊN", title: "Tin tức tác động", body: "Các tin quan trọng đêm qua và sáng nay. Mỗi tin có **chip đánh giá** ▲◆▼, **danh sách mã ảnh hưởng**, và dòng **\"Tác động phiên sáng nay\"** — diễn giải cụ thể tin đó ảnh hưởng phiên hôm nay thế nào." },
    { targetId: "tour-bantin-pre-events", tang: "TRƯỚC PHIÊN", title: "Lịch sự kiện hôm nay", body: "Timeline các sự kiện trong ngày theo giờ: chốt quyền cổ tức, công bố BCTC, số liệu macro thế giới… Mỗi sự kiện gắn mức tác động (Cao · Trung bình · Thấp)." },
    { targetId: "tour-bantin-pre-watch", tang: "TRƯỚC PHIÊN", title: "Khi vào phiên cần lưu ý", body: "Watch-list các điểm cần nhớ khi mở phiên: mốc hỗ trợ/kháng cự, mã có khả năng gap-up/gap-down, nhóm ngành cần chú ý. Viền vàng: chú ý — viền đỏ: cảnh báo." },
    { targetId: "tour-bantin-mid-header", tang: "GIỮA PHIÊN", title: "☕ Giữa phiên · 11:30 — để ĐỐI CHIẾU", body: "Bản cập nhật 11:30 khi thị trường nghỉ trưa. Đọc để đối chiếu kịch bản đã đọc buổi sáng với thực tế phiên sáng." },
    { targetId: "tour-bantin-mid-structure", tang: "GIỮA PHIÊN", title: "Cấu trúc phiên sáng", body: "Tóm tắt bằng chữ diễn biến VN-Index phiên sáng: mở cửa bao nhiêu, cao/thấp nhất, đóng cửa sáng ở đâu, biên độ, độ rộng thị trường." },
    { targetId: "tour-bantin-mid-flow", tang: "GIỮA PHIÊN", title: "Dòng tiền phiên sáng", body: "Tóm tắt hoạt động khối ngoại và tự doanh CTCK trong phiên sáng: mua ròng hay bán ròng, mua/bán mạnh mã nào." },
    { targetId: "tour-bantin-mid-health", tang: "GIỮA PHIÊN", title: "Sức khỏe thị trường", body: "Ở bản Giữa phiên, khối này **chưa có dữ liệu** — các chỉ số sức khỏe chỉ tính được khi phiên đóng cửa. Sẽ đầy đủ ở bản Cuối phiên lúc 16:30." },
    { targetId: "tour-bantin-mid-confirm", tang: "GIỮA PHIÊN", title: "Điểm cần xác nhận trong phiên chiều", body: "Ô đặc biệt của bản Giữa phiên: chỉ ra điều kiện cụ thể cần theo dõi trong phiên chiều để biết kịch bản sáng có kéo dài hay đảo chiều." },
    { targetId: "tour-bantin-mid-pulse", tang: "GIỮA PHIÊN", title: "Pulse Bar — 5 con số realtime", body: "5 ô số liệu cập nhật liên tục: VN-Index, Mã tăng/giảm, Khối ngoại, Thanh khoản, Sức khỏe thị trường. Bản tin trả lời \"chuyện gì đang xảy ra\", Pulse Bar cho \"con số ngay bây giờ\"." },
    { targetId: "tour-bantin-mid-takeaway", tang: "GIỮA PHIÊN", title: "Kịch bản phiên chiều", body: "Đặc sản bản Giữa phiên: 3 kịch bản với ngưỡng cụ thể (giữ mốc nào, giao dịch bao nhiêu…), và danh sách mã đáng quan sát trong phiên chiều. Bản Cuối phiên không có mục này vì đã đóng cửa." },
    { targetId: "tour-bantin-mid-breadth", tang: "6 PANEL CHI TIẾT", title: "Độ rộng thị trường", body: "Số mã tăng / giảm / đứng giá trên sàn HOSE, số mã tăng trần / giảm sàn. Cho biết đám đông đang nghiêng về phía nào." },
    { targetId: "tour-bantin-mid-contribution", tang: "6 PANEL CHI TIẾT", title: "Top mã đóng góp", body: "Các mã kéo VN-Index tăng nhiều nhất và kéo giảm nhiều nhất trong phiên. Giúp biết chuyển động index đến từ đâu." },
    { targetId: "tour-bantin-mid-foreign", tang: "6 PANEL CHI TIẾT", title: "Khối ngoại", body: "Chi tiết giao dịch khối ngoại: mua/bán ròng, chuỗi phiên mua/bán liên tiếp, top mã khối ngoại mua và bán." },
    { targetId: "tour-bantin-mid-prop", tang: "6 PANEL CHI TIẾT", title: "Tự doanh CTCK", body: "Chi tiết giao dịch tự doanh của các công ty chứng khoán: mua/bán ròng, top mã. Đây là tiền của người trong nghề, đáng để tham khảo." },
    { targetId: "tour-bantin-mid-health-detail", tang: "6 PANEL CHI TIẾT", title: "Sức khỏe thị trường (chi tiết)", body: "Chi tiết các chỉ số sức khỏe: tỷ lệ mã trên MA20, MA50, thanh khoản so với trung bình. Ở bản Giữa phiên, panel này chờ đến 16:30." },
    { targetId: "tour-bantin-mid-rotation", tang: "6 PANEL CHI TIẾT", title: "Dòng tiền chuyển nhóm", body: "Ngành nào đang được tiền chảy vào (tăng), ngành nào đang bị rút tiền (giảm). Cho biết tiền đang di chuyển giữa các nhóm ngành thế nào." },
    { targetId: "tour-bantin-end-header", tang: "CUỐI PHIÊN", title: "🌙 Cuối phiên · 16:30 — để TỔNG KẾT", body: "Bản đầy đủ nhất, cập nhật sau khi thị trường đóng cửa. Đây là bản để tổng kết phiên và học từ thị trường." },
    { targetId: "tour-bantin-end-structure", tang: "CUỐI PHIÊN", title: "Cấu trúc phiên (đầy đủ)", body: "Tóm tắt cả phiên: diễn biến VN-Index, độ rộng, các mã đóng góp lớn. Chi tiết hơn bản Giữa phiên vì có dữ liệu cả ngày." },
    { targetId: "tour-bantin-end-flow", tang: "CUỐI PHIÊN", title: "Dòng tiền (đầy đủ)", body: "Tóm tắt hoạt động khối ngoại và tự doanh cả phiên." },
    { targetId: "tour-bantin-end-health", tang: "CUỐI PHIÊN", title: "Sức khỏe thị trường (đầy đủ)", body: "Khối này ở bản Giữa phiên chưa có — bản Cuối phiên đã có dữ liệu: tỷ lệ mã trên MA20, MA50, thanh khoản so với trung bình, ngành dẫn dắt." },
    { targetId: "tour-bantin-end-unexplained", tang: "CUỐI PHIÊN", title: "Điểm chú ý — chưa giải thích được", body: "Cuối bản Cuối phiên có ô đặc biệt: những hiện tượng IQX nhìn thấy nhưng chưa lý giải được đầy đủ. IQX không giả vờ đủ dữ liệu — điều gì chưa rõ, ghi rõ." },
  ],
}
