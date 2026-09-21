import type { TourConfig } from "../tourTypes"

/**
 * Tour Săn mã gồm 6 bước. Popup mở ở các bước kết quả/thêm mã và đóng ở
 * các bước còn lại. Mọi điểm neo khớp với giao diện đã rút gọn.
 * Tour không phải điều kiện tốt nghiệp; chỉ ghi nhận khi đi hết các bước.
 */
export const sanMaTour: TourConfig = {
  name: "sanma",
  overlayColor: "rgba(10, 12, 20, 0.52)",
  steps: [
    {
      targetId: "tour-sanma-panel",
      tang: "SĂN MÃ",
      title: "Săn mã — chủ động đi tìm cơ hội",
      body: "Đến giờ bạn đã biết phân tích một mã. Cấp 5 dạy bạn tự đi tìm mã đáng chú ý giữa cả nghìn mã trên sàn — thay vì ngồi chờ mã đến.",
      placement: "below",
    },
    {
      targetId: "tour-sanma-filter-ngoai",
      tang: "MỘT BỘ LỌC",
      title: "Mỗi bộ lọc là một tín hiệu",
      body: "Ví dụ 'Khối ngoại gom' tìm mã nước ngoài mua ròng ≥3/5 phiên gần nhất. Mỗi bộ lọc ghi rõ điều kiện ngay bên dưới — bạn luôn biết mình đang lọc theo gì.",
      placement: "below",
    },
    {
      targetId: "tour-sanma-popup",
      tang: "KẾT QUẢ",
      title: "Top 10 mã mạnh nhất",
      body: "Bấm vào bộ lọc, IQX hiện tối đa 10 mã mạnh nhất theo điều kiện đó, kèm tín hiệu cụ thể của từng mã. Đầu bảng có định nghĩa rõ bộ lọc đang tìm gì.",
      placement: "below",
    },
    {
      targetId: "tour-sanma-add",
      tang: "THEO DÕI",
      title: "Săn để quan sát, chưa vội mua",
      body: "Thấy mã hay, bấm '+ Theo dõi' để đưa vào danh sách quan sát. Săn mã KHÔNG phải để mua ngay — mà để theo dõi xem mã có thực sự chín không.",
      placement: "below",
    },
    {
      targetId: "tour-sanma-watchlist-link",
      tang: "CHỜ MÃ CHÍN",
      title: "Chờ mã chín",
      body: "Trong Theo dõi, IQX theo dõi mỗi mã theo 5 lớp phân tích. Khi một mã lên ≥4/5 lớp ủng hộ, nó được đánh dấu '★ Đáng chú ý' — lúc đó bạn mới cân nhắc đặt lệnh. Quyết định mua vẫn là của bạn.",
      placement: "below",
    },
    {
      targetSelector: "#toolbar-cap5-sanma",
      tang: "SẴN SÀNG",
      title: "Bạn đã sẵn sàng đi săn",
      body: "Quy trình: Săn → đưa vào Theo dõi → chờ mã lên ≥4/5 lớp → đặt lệnh. Săn nhiều, chọn kỹ, không mua vội. Chúc bạn săn được mã tốt!",
      placement: "left",
    },
  ],
}
