import type { TourConfig } from "@/features/tour"

/**
 * "6 người chơi" tour (nhiệm vụ ④, Chặng 2) — spec `IQX-Tour-6NguoiChoi.md`
 * v1.0 ("Tài liệu bàn giao dev · v1.0 · 07/2026 · Cấp 0 Chặng 2 · nhiệm vụ
 * ④"), T3 (`docs/superpowers/plans/2026-07-27-cap0-tours.md`).
 *
 * Unlike ② (Bảng điện) and ③ (Bản tin), this tour points at PEOPLE/CONCEPTS,
 * not UI regions — the spec itself says the safe default is "thẻ giữa cho cả
 * 6 nếu sân chơi Cấp 0 chưa hiển thị các chỉ số này" (§4 Lưu ý implement).
 * `/dau-truong`'s Cấp 0 terminal has no khối-ngoại/tự-doanh/nội-bộ columns or
 * a volume-spike marker on the chart today, so ALL 6 steps are `centered:
 * true` concept cards — no `data-tour-id` targets invented. If a later
 * delivery adds those surfaces to the Cấp 0 terminal, individual steps here
 * could grow a real `targetId` (spec: "Anchor tùy chọn" — dev's call), but
 * that's out of scope for this increment.
 *
 * Copy is condensed from the spec's §2 (one-way product intro, "ai + họ làm
 * gì + IQX cho thấy ở đâu" — no deep-read teaching, deferred to Cấp 1 «AI
 * Thanh tra 5 lý do»). The spec's "sợi chỉ xuyên suốt" thread to Cấp 1 is kept
 * verbatim in intent: Khối ngoại (①) + Tự doanh (②) → lý do 💰 Dòng tiền;
 * Lãnh đạo/nội bộ (④) → lý do 👤 Nội bộ (see each step's `body`).
 *
 * Counter label stays the app-wide "ĐIỂM x/N" (`TourOverlay` is hardcoded to
 * this — Global Constraints says keep it consistent across tours rather than
 * the spec's own tour-specific "NGƯỜI CHƠI x/6" wording); each step's `tang`
 * pill carries the "NGƯỜI CHƠI n/6" + player name instead, and every title is
 * prefixed with the player's icon (spec §4: "Icon người chơi ở đầu mỗi
 * tooltip là bắt buộc").
 */
export const sauNguoiChoiTour: TourConfig = {
  name: "6nguoichoi",
  steps: [
    {
      centered: true,
      tang: "NGƯỜI CHƠI 1/6",
      title: "🌍 Khối ngoại",
      body: "Nhà đầu tư nước ngoài — các quỹ lớn rót tiền vào thị trường Việt Nam. Khi họ mua ròng hay bán ròng một mã, đó là tín hiệu đáng chú ý. IQX cho bạn thấy dấu chân họ ở phần Dòng tiền của AI Phân tích.",
    },
    {
      centered: true,
      tang: "NGƯỜI CHƠI 2/6",
      title: "🏦 Tự doanh",
      body: "Bộ phận tự doanh của các công ty chứng khoán — họ mua/bán bằng chính tiền công ty. Cùng khối ngoại, họ tạo nên dòng tiền lớn mà IQX theo dõi.",
    },
    {
      centered: true,
      tang: "NGƯỜI CHƠI 3/6",
      title: "🏛️ Tổ chức trong nước",
      body: "Các quỹ và tổ chức đầu tư trong nước — thường vào/ra bằng khối lượng lớn, đi đường dài hơn nhà đầu tư nhỏ lẻ.",
    },
    {
      centered: true,
      tang: "NGƯỜI CHƠI 4/6",
      title: "👔 Lãnh đạo & nội bộ",
      body: "Ban lãnh đạo và cổ đông lớn — những người hiểu công ty nhất. Khi họ mua/bán chính cổ phiếu công ty mình, IQX ghi lại ở phần Nội bộ. Lãnh đạo mua thêm thường là dấu hiệu tích cực.",
    },
    {
      centered: true,
      tang: "NGƯỜI CHƠI 5/6",
      title: "🙋 Nhà đầu tư cá nhân",
      body: "Số đông trên thị trường — và rất có thể là bạn. Đây là nhóm dễ bị cuốn theo tin đồn và cảm xúc nhất. IQX sinh ra để bạn quyết định bằng dữ liệu, không theo đám đông.",
    },
    {
      centered: true,
      tang: "NGƯỜI CHƠI 6/6",
      title: '🐋 Dòng tiền lớn ("cá mập")',
      body: "Nhóm vốn rất lớn tạo lực đẩy giá — dân trong nghề hay gọi là 'cá mập'. Để ý những phiên khối lượng tăng đột biến. Bạn không giao dịch một mình: cả 6 người chơi này đều để lại dấu chân, và ở Cấp 1 bạn sẽ học biến những dấu chân này thành lý do mua.",
    },
  ],
}
