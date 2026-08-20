import type { TourConfig } from "../tourTypes"

/**
 * **Tour «Săn mã» — tour thứ tư của hệ** (spec `demo-trading/LEVEL 5/
 * IQX-Tour-SanMa.md`, `IQX-Cap5-Spec.md` §7). 7 bước, đúng thứ tự và đúng chữ
 * của file tour: giới thiệu → lọc sàn → một bộ lọc → popup top 10 → thêm
 * watchlist → trạng thái Đáng chú ý → kết thúc.
 *
 * Chạy trên engine `features/tour/` có sẵn (`useTour` + `TourOverlay`), gắn vào
 * `features/cap5/SanMaPanel.tsx`.
 *
 * ─── NEO TỪNG BƯỚC VÀO ĐÚNG PHẦN TỬ CÓ THẬT ─────────────────────────────────
 * Bước 1/2/3/6 neo vào phần tử LUÔN có trong `SanMaPanel`. Hai bước 4/5 neo vào
 * phần tử chỉ tồn tại KHI POPUP ĐANG MỞ (`HuntResultModal`) — chính file tour
 * ghi nhận điều này ("Bước 4 và 6 cần trigger sau tương tác… nếu user chưa thao
 * tác, dùng ảnh minh họa tĩnh thay spotlight"); engine đã có sẵn đường lùi
 * target-không-thấy → bong bóng giữa màn (`TourOverlay.resolveTarget`), nên chữ
 * của hai bước đó được viết để đọc trôi cả khi popup chưa mở ("Bấm vào bộ lọc,
 * IQX hiện…" — mô tả quy trình, không nói "cái đang hiện đây").
 *
 * Bước 7 neo vào nút «Săn mã» của thanh công cụ phải qua `targetSelector`
 * `#toolbar-cap5-sanma` — `RightToolbar` đã tự đặt `id={`toolbar-${item.id}`}`
 * cho mọi nút, nên KHÔNG phải sửa một component dùng chung chỉ để thêm một
 * thuộc tính tour.
 *
 * ★ Tour này KHÔNG phải cổng tốt nghiệp. Hai nhiệm vụ Cấp 5 là «săn 10 mã» và
 * «mua 5 mã từ Watchlist» (mockup Hành trình + hai cột đếm của BE) — nên lỗ gian
 * lận "Bỏ qua tour = đạt nhiệm vụ" (engine `useTour.skip()` gọi thẳng
 * `onComplete`) không thể xảy ra ở đây. `SanMaPanel` vẫn phân biệt hai đường:
 * chỉ đi HẾT 7 bước mới `POST /cap5/tour-sanma`, "Bỏ qua" thì không.
 */
export const sanMaTour: TourConfig = {
  name: "sanma",
  steps: [
    {
      targetId: "tour-sanma-panel",
      tang: "SĂN MÃ",
      title: "Săn mã — chủ động đi tìm cơ hội",
      body: "Đến giờ bạn đã biết phân tích một mã. Cấp 5 dạy bạn tự đi tìm mã đáng chú ý giữa cả nghìn mã trên sàn — thay vì ngồi chờ mã đến.",
      placement: "below",
    },
    {
      targetId: "tour-sanma-locsan",
      tang: "LỌC SÀN",
      title: "Mọi bộ lọc đều đã lọc sạch",
      body: "Tất cả bộ lọc chỉ lấy mã HOSE, thanh khoản đủ lớn (≥1 tỷ/phiên) và giá ≥3.000đ — loại sẵn mã quá nhỏ hoặc dễ bị làm giá. Bạn chỉ thấy mã đáng xem.",
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
      tang: "WATCHLIST",
      title: "Săn để quan sát, chưa vội mua",
      body: "Thấy mã hay, bấm '+ Watchlist' để đưa vào danh sách quan sát. Săn mã KHÔNG phải để mua ngay — mà để theo dõi xem mã có thực sự chín không.",
      placement: "below",
    },
    {
      targetId: "tour-sanma-watchlist-link",
      tang: "CHỜ MÃ CHÍN",
      title: "Chờ mã chín",
      body: "Trong Watchlist, IQX theo dõi mỗi mã theo 5 lớp phân tích. Khi một mã lên ≥4/5 lớp ủng hộ, nó được đánh dấu '★ Đáng chú ý' — lúc đó bạn mới cân nhắc đặt lệnh. Quyết định mua vẫn là của bạn.",
      placement: "below",
    },
    {
      targetSelector: "#toolbar-cap5-sanma",
      tang: "SẴN SÀNG",
      title: "Bạn đã sẵn sàng đi săn",
      body: "Quy trình: Săn → đưa vào Watchlist → chờ mã lên ≥4/5 lớp → đặt lệnh. Săn nhiều, chọn kỹ, không mua vội. Chúc bạn săn được mã tốt!",
      placement: "left",
    },
  ],
}
