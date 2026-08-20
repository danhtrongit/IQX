/**
 * Cấp 5 «Lão luyện» — shared types.
 *
 * ★★ ĐÂY LÀ BẢN THAY MỚI TOÀN BỘ ★★
 *
 * Cấp 5 CŨ (phân loại 4 ô «đúng/sai × thắng/thua» + nhật ký «đứng ngoài có chủ
 * đích» + «Thách thức Lão luyện» 3 điều kiện) đã **NGHỈ HƯU**. Bộ file bàn giao
 * mới (`demo-trading/LEVEL 5/`) định nghĩa lại Cấp 5 = **CHỦ ĐỘNG SĂN MÃ**:
 * lọc dữ liệu thô → đưa mã vào Watchlist → chờ mã chín → mới vào lệnh.
 * `IQX-Cap5-Spec.md` §11 đẩy hẳn "biết khi nào KHÔNG mua (kỷ luật đứng ngoài)"
 * và "xử lý mâu thuẫn giữa các lớp" sang **Cấp 6+**.
 *
 * Vì thế `Verdict` / `O4` / `LyDoDungNgoai` / `KetQuaDungNgoai` / `ThachThuc*`
 * KHÔNG còn tồn tại trong kiểu wire. Bỏ hẳn (chứ không để optional) là CỐ Ý:
 * `cap2/types.ts` đã ghi lại bài học "để trường chết ở dạng optional ⇒ `tsc -b`
 * im lặng ⇒ mọi user đọc một con số bịa suốt nhiều tháng".
 *
 * Wire shapes mirror the backend `Cap5*` schemas 1:1
 * (`backend/app/schemas/cap5.py`).
 */

/**
 * 5 bộ lọc săn mã (spec §5.3 · cột `watchlist.hunt_filter` / `order_kehoach.
 * hunt_filter`, §10). Mã do user tự nhập KHÔNG có bộ lọc nào — dùng `null`,
 * TUYỆT ĐỐI không gán một bộ lọc mặc định (bịa nguồn săn).
 */
export type HuntFilter = "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"

/** Nhãn 5 bộ lọc — NGUYÊN VĂN bảng spec §5.3 (kèm icon như mockup vẽ). */
export const HUNT_FILTER_LABEL: Record<HuntFilter, string> = {
  ngoai: "💰 Khối ngoại gom",
  tudoanh: "🏦 Tự doanh gom",
  kl: "📊 Khối lượng đột biến",
  dinh: "🎯 Vượt đỉnh 20 phiên",
  tang: "📈 Tăng mạnh + KL cao",
}

/** Nhãn không icon — dùng trong câu văn (Kết sổ §8, coach, màn tốt nghiệp). */
export const HUNT_FILTER_TEN: Record<HuntFilter, string> = {
  ngoai: "Khối ngoại gom",
  tudoanh: "Tự doanh gom",
  kl: "Khối lượng đột biến",
  dinh: "Vượt đỉnh 20 phiên",
  tang: "Tăng mạnh + KL cao",
}

/** Thứ tự bảng spec §5.3 — mẫu số ổn định cho khối ⑫ khi hoà tỷ lệ thắng. */
export const HUNT_FILTER_ORDER: readonly HuntFilter[] = [
  "ngoai",
  "tudoanh",
  "kl",
  "dinh",
  "tang",
] as const

/**
 * Nhãn của một bộ lọc, hoặc `null` khi mã KHÔNG đến từ săn mã.
 *
 * ★ Trả `null` chứ không trả một chuỗi mặc định: chỗ gọi phải tự viết câu
 * "mã này không đến từ săn mã" thay vì in ra một bộ lọc user chưa từng bấm.
 */
export function huntFilterTen(filter: HuntFilter | null | undefined): string | null {
  if (filter == null) return null
  return HUNT_FILTER_TEN[filter] ?? null
}

/**
 * Behaviour-progress row cho Cấp 5 của user hiện tại (một hàng / user) — mô hình
 * **2 nhiệm vụ làm SONG SONG** (mockup `iqx-cap5-hanhtrinh.html`):
 *
 *  ① «Săn 10 mã vào Watchlist» → `so_ma_da_san` (n/10)
 *  ② «Mua 5 mã từ Watchlist»   → `so_ma_mua_tu_watchlist` (n/5)
 *
 * Hai nhiệm vụ ĐỘC LẬP: ② có thể xong trước ①. Tốt nghiệp = 2/2.
 *
 * ★★ MÂU THUẪN ĐÃ BIẾT TRONG BỘ SPEC — xem báo cáo bàn giao. `IQX-Cap5-Spec.md`
 * §2 mô tả nhiệm vụ ② là "xem hết tour Săn mã" (và §12 lại đòi thêm ngưỡng lãi
 * >3% mà chính §2 nói KHÔNG đo), trong khi mockup Hành trình vẽ hai nhiệm vụ
 * SĂN 10 / MUA 5. Luật repo: mockup thắng về bố cục + nhãn. Tour Săn mã vì thế
 * KHÔNG phải cổng tốt nghiệp — điều đó cũng bịt luôn lỗ gian lận "Bỏ qua tour =
 * đạt" (engine `useTour.skip()` gọi thẳng `onComplete`).
 */
export interface Cap5Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  task_2_done_at: string | null
  /** ① Số mã đã săn vào Watchlist qua bộ lọc — mẫu số 10. `0` là 0 THẬT. */
  so_ma_da_san: number
  /** ② Số mã săn đã thực sự vào lệnh mua — mẫu số 5. `0` là 0 THẬT. */
  so_ma_mua_tu_watchlist: number
  /**
   * Tầng giữa của phễu ⑬: số mã đã săn từng lên ≥4/5 lớp ủng hộ.
   *
   * ★ NULLABLE = "chưa biết", KHÔNG phải 0. Điểm đồng thuận 5 lớp được chạy
   * batch 1 lần/ngày sau phiên (spec §6.1/§10) và lớp 💎 Định giá là dữ liệu
   * BCTC premium — nhiều mã sẽ không bao giờ có đủ 5 lớp. Server chưa chạy mẻ
   * nào ⇒ `null`, và phễu phải nói "chưa đo được", không được vẽ tầng giữa = 0.
   */
  so_ma_cho_du_lop: number | null
  /** Bộ lọc ra nhiều mã thắng nhất (spec §10 `best_filter`). `null` = chưa đủ dữ liệu. */
  best_filter: HuntFilter | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/** Tổng số nhiệm vụ Cấp 5 — mẫu số DUY NHẤT cho jbar, `.ck-head`, vòng huy hiệu
 *  và điều kiện tốt nghiệp. */
export const CAP5_TOTAL_TASKS = 2

/** ① Số mã phải săn vào Watchlist (mockup `.task .prog` = "n/10 mã"). */
export const CAP5_SO_MA_SAN_TARGET = 10

/** ② Số mã săn phải thực sự mua (mockup `.task .prog` = "n/5 mã"). */
export const CAP5_SO_MA_MUA_TARGET = 5

/**
 * Số nhiệm vụ Cấp 5 đã xong.
 *
 * ★ Chỉ đếm ĐÚNG 2 cột. Một wire shape cũ còn sót `task_3_done_at` KHÔNG được
 * tính thành nhiệm vụ thứ 3 — cùng cái bẫy `cap0/types.ts` + `cap1/types.ts` +
 * `cap2/types.ts` đã ghi.
 */
export function countCap5TasksDone(progress: Cap5Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at, progress.task_2_done_at].filter((t) => t != null).length
}
