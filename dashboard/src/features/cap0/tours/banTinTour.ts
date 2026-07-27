import type { TourConfig } from "@/features/tour"

/**
 * Bản tin tour (nhiệm vụ ③, Chặng 2) — spec `IQX-Tour-BanTin.md` v1.0
 * ("Tài liệu bàn giao dev · v1.0 · 07/2026"), T4
 * (`docs/superpowers/plans/2026-07-27-cap0-tours.md`).
 *
 * **GROUND-FIRST departure from the spec (documented per T4's brief):** the
 * spec's 23-point spotlight tour walks the 3 session-brief tabs (Trước/Giữa/
 * Cuối phiên) at `/thi-truong`. That route DOES NOT EXIST — the real 3
 * session briefs render on the HOME `/` market-analysis session tabs
 * (`features/market-overview` / home-workspace), which is a different route
 * from `/dau-truong` (where this whole Cấp 0 journey runs) with no clean
 * mid-onboarding path back. Rather than force a cross-route detour (fragile:
 * `/dau-truong` → `/` → back, with tab state + scroll position + a busy-flag
 * spanning a full navigation) or spotlight a surface that isn't actually
 * there, this tour is a **product-intro concept tour** — all `centered: true`
 * cards, same pattern as ④ (`sauNguoiChoiTour.ts`) — that explains WHAT the 3
 * briefs are and WHEN to read each one, then points the user to the home page
 * to actually read them. Honest and simple, per the task brief, rather than
 * simulating a tour of a surface `/dau-truong` can't reach.
 *
 * Still "giới thiệu, không dạy" (spec's own tone rule): what each brief is,
 * when it's published, why you'd read it — not how to interpret any single
 * number inside it (that's Cấp 1-5 territory, spec §6 "NGOÀI PHẠM VI").
 */
export const banTinTour: TourConfig = {
  name: "bantin",
  steps: [
    {
      centered: true,
      tang: "BẢN TIN THỊ TRƯỜNG",
      title: "Bản tin thị trường IQX",
      body: "Mỗi ngày IQX xuất bản 3 bản tin tự động, tổng hợp diễn biến thị trường theo từng khung giờ trong phiên — bạn không cần tự đọc hàng chục nguồn tin để nắm chuyện gì đang xảy ra.",
    },
    {
      centered: true,
      tang: "BẢN TIN 1/3",
      title: "☀️ Trước phiên · 07:15",
      body: "Xuất bản 07:15 mỗi sáng để bạn CHUẨN BỊ trước khi vào phiên — điểm tin đêm qua thế giới, tin tức tác động, lịch sự kiện trong ngày và những điều cần lưu ý khi mở cửa.",
    },
    {
      centered: true,
      tang: "BẢN TIN 2/3",
      title: "☕ Giữa phiên · 11:30",
      body: "Cập nhật lúc 11:30 khi thị trường nghỉ trưa, để bạn ĐỐI CHIẾU kịch bản đã đọc buổi sáng với diễn biến thực tế phiên sáng — cùng vài kịch bản có thể cho phiên chiều.",
    },
    {
      centered: true,
      tang: "BẢN TIN 3/3",
      title: "🌙 Cuối phiên · 16:30",
      body: "Bản đầy đủ nhất, xuất bản sau khi đóng cửa để TỔNG KẾT cả phiên và gợi mở kịch bản cho phiên sau — kèm cả những điều IQX thấy nhưng chưa lý giải được, thay vì giả vờ đã hiểu hết.",
    },
    {
      centered: true,
      tang: "ĐỌC Ở ĐÂU",
      title: "Đọc bản tin ở đâu?",
      body: "Cả 3 bản tin nằm ngay trên trang chủ IQX — chọn tab đúng khung giờ trong ngày để đọc. Giờ hãy quay lại sân chơi và tiếp tục nhiệm vụ tiếp theo.",
    },
  ],
}
