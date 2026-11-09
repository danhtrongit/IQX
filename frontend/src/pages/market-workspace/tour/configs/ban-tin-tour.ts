import type { TourConfig } from "../types"

/** Tab của trang Phân tích thị trường chứa từng bước của tour (cùng thứ tự với `steps`). */
export const BAN_TIN_TOUR_TABS: ("ban-tin" | "theo-doi" | "ban-tin-cu")[] = [
  "ban-tin",
  "ban-tin",
  "ban-tin",
  "ban-tin",
  "theo-doi",
  "theo-doi",
  "theo-doi",
  "ban-tin-cu",
]

/** 8 điểm dừng cho bản tin cuối phiên: Bản tin, Theo dõi, Bản tin cũ. */
export const banTinTour: TourConfig = {
  name: "bantin",
  steps: [
    { targetId: "tour-bantin-tabs", tang: "BẢN TIN CUỐI PHIÊN", title: "Ba tab của trang", body: "**Bản tin** là bản mới nhất của IQX sau phiên giao dịch. **Theo dõi** cho biết các mã đã đề xuất đang lãi hay lỗ. **Bản tin cũ** lưu các bản của 6 tháng gần nhất." },
    { targetId: "tour-bantin-header", tang: "BẢN TIN CUỐI PHIÊN", title: "Bản tin của phiên nào", body: "Dòng đầu cho biết **phiên giao dịch**, giờ Public và giờ cập nhật nếu bản tin được chỉnh sửa và Public lại." },
    { targetId: "tour-bantin-pdf", tang: "BẢN TIN CUỐI PHIÊN", title: "Đọc bản tin ngay trên web", body: "Bản tin là file PDF: nhận định xu hướng VN-Index, mốc kháng cự và hỗ trợ, kịch bản, và 3 bộ lọc cổ phiếu. Bôi đen để sao chép chữ, bấm vào mã để mở trong demo-trading. Máy tính xem bản máy tính, điện thoại xem bản điện thoại." },
    { targetId: "tour-bantin-download", tang: "BẢN TIN CUỐI PHIÊN", title: "Tải PDF", body: "Tải đúng bản theo thiết bị đang dùng để đọc ngoại tuyến hoặc gửi cho người khác." },
    { targetId: "tour-bantin-stats", tang: "THEO DÕI", title: "Ba con số tổng quan", body: "Số mã đang theo dõi, số mã đang có lãi (không tính mã vừa đề xuất hôm nay) và **lợi nhuận trung bình** so với VN-Index cùng kỳ." },
    { targetId: "tour-bantin-slots", tang: "THEO DÕI", title: "Lọc theo bộ lọc", body: "Xem riêng từng bộ lọc 1, 2, 3 hoặc tất cả. Mỗi mã nằm trong bộ lọc nó được đề xuất." },
    { targetId: "tour-bantin-table", tang: "THEO DÕI", title: "Lợi nhuận từng mã", body: "**Lợi nhuận** = (giá đóng cửa hôm nay − giá đóng cửa ngày đề xuất) ÷ giá đóng cửa ngày đề xuất, tính theo giá đã điều chỉnh. Bấm tiêu đề cột để sắp xếp, bấm lại để đảo chiều. Giá tính theo nghìn đồng, chưa gồm phí và thuế." },
    { targetId: "tour-bantin-archive", tang: "BẢN TIN CŨ", title: "Kho bản tin 6 tháng", body: "Mỗi phiên một dòng, mới nhất trước. **Xem** mở bản tin của ngày đó trong tab Bản tin, **Tải PDF** tải về. Bấm **Xem thêm** để xem các phiên cũ hơn." },
  ],
}
