import type { TourConfig } from "../tourTypes"

/**
 * Bảng giá tour (T1, `docs/superpowers/plans/2026-07-27-feature-tours.md`) —
 * spec `~/Downloads/DEMO TRADING/TOUR vs BADGES/IQX-Tour-BangGia.md` v1.0,
 * GROUND-FIRST adapted to `/bang-gia` (`price-board/BangGiaPage.tsx`) as it
 * actually renders today:
 *
 *  - Spec point 2 "Bảng tóm tắt chỉ số" (`IndexSummaryTable`) only renders at
 *    the `xl` breakpoint (`hidden ... xl:block`) — spec §4 itself says to
 *    drop this point on small screens ("tour thành 8 điểm"). Dropped outright
 *    here (not conditionally included) so the tour is identical regardless of
 *    viewport width.
 *  - Spec point 5 "Cột Mã + Trần / Sàn / TC" bundles 4 header cells that are
 *    separate `<th rowSpan={2}>` siblings in `BoardTable` — no single real
 *    element spans all four without restructuring the (already-live) table
 *    header. Split into two real, adjacent steps instead: "Cột Mã" (anchor:
 *    the sticky Mã header) and "Trần · Sàn · TC" (anchor: the Trần header,
 *    first of the trio — Sàn/TC sit immediately to its right and are
 *    described in the body copy).
 *  - Spec points 6-9 (Bên mua / Khớp lệnh / Bên bán / ĐTNN) map 1:1 onto
 *    `BoardTable`'s existing grouped header cells (`colSpan` groups already
 *    used for exactly these 4 sections) — no new elements needed.
 *  - `/bang-gia` is free — no premium gating on the launch button (unlike
 *    the Backtester/Cảnh báo/Portfolio Manager/AI Mẫu nến tours, T3-T5).
 *
 * Net: 9 stops (spec's 9, minus the dropped index-summary point, plus the
 * Mã/Trần-Sàn-TC split) — within the ~8-10 step budget.
 *
 * Horizontal scroll-into-view for the later (Trần/bid/match/ask/ĐTNN) steps
 * is handled by the engine's existing `scrollIntoView({ block: "center" })`
 * call in `TourOverlay` — a plain DOM API against the table's own scrolling
 * container (`overflow-auto` in `BoardTable`), nothing tour-specific to add.
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
      body: "Chấm xanh 'Realtime' = giá đang chảy tức thời; xám 'Cập nhật định kỳ' = đang cập nhật chậm. Kèm số mã đang hiện.",
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
