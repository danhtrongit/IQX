import type { TourConfig } from "../tourTypes"

/**
 * Bài học tour (T5, `docs/superpowers/plans/2026-07-27-feature-tours.md`) —
 * spec `~/Downloads/DEMO TRADING/TOUR vs BADGES/IQX-Tour-BaiHoc.md` v1.0,
 * GROUND-FIRST adapted to `lessons/CatalogPage.tsx` (`/bai-hoc`) as it
 * actually renders today:
 *
 *  - **FREE tour** — the catalog/course-detail pages are free to browse (only
 *    episode CONTENT needs sign-in, and Premium-tagged courses need upgrade);
 *    the launch button has no `usePremiumStatus()` gate, unlike
 *    `mauNenTour`/`canhBaoTour`/`backtesterTour`/`quanLyDanhMucTour`.
 *  - **EVERY step is a `centered` concept card — deliberate departure from
 *    the spec's literal §1 "3-route navigated tour"** (catalog →
 *    `/bai-hoc/:slug` → `/bai-hoc/:slug/:episodeId`, auto-opening a seeded
 *    demo course + a demo account with partial progress at each hop). Per
 *    the plan's own Task T5 note, cross-route navigation inside a tour is
 *    fragile here specifically because steps 3-7 all depend on a signed-in
 *    demo account with a seeded FREE course and partial progress existing —
 *    state this tour has no way to guarantee (unlike `quanLyDanhMucTour`'s
 *    injected sample fixture, there's no "inject a fake CourseDetail" prop on
 *    `CourseDetailPage`/`EpisodeViewerPage` to preload a rich demo state
 *    without a real network round-trip and a real logged-in session). Rather
 *    than invent a `data-tour-id` on a page that would show a DIFFERENT
 *    reality per viewer (anonymous vs signed-in vs no-progress vs
 *    in-progress), every stop here narrates what the user will find at each
 *    layer — same "point at PEOPLE/CONCEPTS, not UI regions" approach
 *    `cap0/tours/sauNguoiChoiTour.ts` uses for its 6 concept-card stops.
 *  - **Mounted ONLY on `CatalogPage.tsx`** (`/bai-hoc`) — no `data-tour-id`
 *    additions on `CourseDetailPage.tsx`/`EpisodeViewerPage.tsx` at all.
 *  - **7 stops mirror the spec's own 3-tầng structure** 1:1 (TẦNG 1 danh mục
 *    → 2 stops, TẦNG 2 chi tiết khoá → 2 stops, TẦNG 3 xem bài → 2 stops),
 *    plus one product-intro stop up front (replacing the spec's literal
 *    point 1 "Header + bộ lọc", which is split here into its own filter
 *    stop) — net stop count unchanged from spec's 7.
 *
 * Net: 7 stops, all `centered` — honest about what's real (this page) vs.
 * narrated (the other two routes), per the plan's "Keep it honest/simple".
 */
export const baiHocTour: TourConfig = {
  name: "baihoc",
  steps: [
    {
      centered: true,
      tang: "GIỚI THIỆU",
      title: "Thư viện Kiến thức",
      body: "IQX có một thư viện khoá học đầu tư chứng khoán — từ cơ bản đến nâng cao — có theo dõi tiến độ học riêng cho bạn.",
    },
    {
      centered: true,
      tang: "TẦNG 1 · DANH MỤC KHOÁ",
      title: "Bộ lọc khoá học",
      body: "Lọc theo cấp độ (Cơ bản/Trung cấp/Nâng cao), theo chủ đề, và Miễn phí/Premium — hoặc gõ tìm khoá theo tên.",
    },
    {
      centered: true,
      tang: "TẦNG 1 · DANH MỤC KHOÁ",
      title: "Thẻ khoá học",
      body: "Mỗi thẻ khoá hiện ảnh, nhãn cấp độ, 'Miễn phí' hoặc 'Premium', số bài học và tổng thời lượng — bấm vào thẻ để xem chi tiết khoá.",
    },
    {
      centered: true,
      tang: "TẦNG 2 · CHI TIẾT KHOÁ",
      title: "Hero khoá + tiến độ",
      body: "Đầu trang chi tiết khoá: mô tả, số bài, thời lượng, và thanh tiến độ '{đã xong}/{tổng} bài' khi bạn đã đăng nhập. Nút bên dưới tự đổi: 'Bắt đầu học' → 'Tiếp tục học' → 'Học lại', luôn nhảy tới bài chưa xong tiếp theo.",
    },
    {
      centered: true,
      tang: "TẦNG 2 · CHI TIẾT KHOÁ",
      title: "Danh sách bài học",
      body: "Các bài theo thứ tự: dấu ✓ (đã hoàn thành) hoặc dấu tròn rỗng (chưa hoàn thành) — hoặc biểu tượng khoá nếu bạn chưa đăng nhập. Bấm để vào học.",
    },
    {
      centered: true,
      tang: "TẦNG 3 · XEM BÀI",
      title: "Trình xem bài học",
      body: "Nội dung bài: video, PDF, hoặc bài viết dạng chữ. Video tự nhớ chỗ bạn xem dở; sidebar bên phải là danh sách bài để nhảy nhanh, cuối trang có 'Bài trước / Bài tiếp theo'.",
    },
    {
      centered: true,
      tang: "TẦNG 3 · XEM BÀI",
      title: "Đánh dấu hoàn thành",
      body: "Xong bài? Bấm 'Đánh dấu hoàn thành' ở thanh dưới cùng — tiến độ khoá cập nhật ngay. Kết thúc — chúc bạn học vui.",
    },
  ],
}
