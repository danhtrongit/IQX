import type { TourConfig } from "@/pages/market-workspace/tour"

/**
 * Bảng giá tour (/bang-gia) — port of the legacy `features/tour/configs/bangGiaTour`.
 *
 * Anchors are `data-tour-id` attributes inside this slice's own views: the index
 * strip, the toolbar (search + tabs, realtime badge) and the board table's
 * grouped header cells. The legacy config's "index summary table" stop is
 * dropped on purpose — that table only renders from `xl` up, so a stop on it
 * would behave differently per viewport (the legacy config dropped it too, and
 * split the Mã / Trần-Sàn-TC header pair into two adjacent stops because no
 * single real element spans all four cells).
 */
export const bangGiaTour: TourConfig = {
  name: "banggia",
  steps: [
    {
      targetId: "tour-banggia-index-strip",
      tang: "TỔNG QUAN THỊ TRƯỜNG",
      title: "Dải chỉ số",
      body: "VN-Index, VN30, HNX-Index, HNX30 — mỗi thẻ có điểm số, độ rộng (↑tăng —đứng ↓giảm), biểu đồ trong ngày và thanh khoản. Nhìn nhanh sức khỏe thị trường.",
      placement: "below",
    },
    {
      targetId: "tour-banggia-search-tabs",
      tang: "TỔNG QUAN THỊ TRƯỜNG",
      title: "Ô tìm + tab nhóm",
      body: "Tìm mã ở đây, hoặc chọn nhóm: Danh mục (mã bạn theo dõi), VN30, VN100, HOSE, HNX30, HNX, UPCOM.",
      placement: "below",
    },
    {
      targetId: "tour-banggia-realtime",
      tang: "TỔNG QUAN THỊ TRƯỜNG",
      title: "Trạng thái Realtime",
      body: "Chấm xanh 'Realtime' = giá đang chảy tức thời; xám 'Cập nhật định kỳ' = đang cập nhật chậm. Kèm số mã đang hiện, thời điểm và nguồn dữ liệu.",
      placement: "left",
    },
    {
      targetId: "tour-banggia-col-symbol",
      tang: "ĐỌC MỘT DÒNG GIÁ",
      title: "Cột Mã",
      body: "Cột mã ghim bên trái — khi cuộn ngang bảng rộng, bạn luôn biết đang xem dòng nào.",
      placement: "right",
    },
    {
      targetId: "tour-banggia-col-price-bands",
      tang: "ĐỌC MỘT DÒNG GIÁ",
      title: "Trần · Sàn · TC",
      body: "Ba mức chuẩn trong ngày: Trần (tím), Sàn (xanh lơ), Tham chiếu — TC (vàng). Giá chỉ chạy trong khoảng Trần–Sàn.",
      placement: "below",
    },
    {
      targetId: "tour-banggia-bid",
      tang: "ĐỌC MỘT DÒNG GIÁ",
      title: "Bên mua",
      body: "Ba mức giá đặt MUA tốt nhất kèm khối lượng chờ — cho thấy lực cầu đang xếp hàng.",
      placement: "below",
    },
    {
      targetId: "tour-banggia-match",
      tang: "ĐỌC MỘT DÒNG GIÁ",
      title: "Khớp lệnh",
      body: "Giá khớp gần nhất, khối lượng khớp, và thay đổi so hôm qua (+/- và %). Ô này nhấp nháy mỗi lần có lệnh mới.",
      placement: "below",
    },
    {
      targetId: "tour-banggia-ask",
      tang: "ĐỌC MỘT DÒNG GIÁ",
      title: "Bên bán",
      body: "Ba mức giá đặt BÁN tốt nhất kèm khối lượng — lực cung đối diện bên mua.",
      placement: "below",
    },
    {
      targetId: "tour-banggia-foreign",
      tang: "ĐỌC MỘT DÒNG GIÁ",
      title: "Thống kê cuối dòng + ĐTNN",
      body: "Cuối mỗi dòng: tổng khối lượng, giá trị, giá cao/thấp trong ngày, và khối ngoại (Mua/Bán/Room còn lại). Bấm vào một dòng để mở trang phân tích mã đó. Kết thúc.",
      placement: "left",
    },
  ],
}
