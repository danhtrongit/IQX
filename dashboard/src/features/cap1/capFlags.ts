/**
 * ★★ CÔNG TẮC TẠM TẮT CẤP 2-8 — MỘT CHỖ DUY NHẤT, ĐỔI `false` → `true` LÀ BẬT
 * LẠI TOÀN BỘ ★★
 *
 * Founder quyết định sản phẩm ra mắt với **Cấp 0 + Cấp 1 thôi**; Cấp 2-8 đã
 * build xong và **KHÔNG bị xoá** — chỉ tạm tắt. Cờ này là chỗ duy nhất quyết
 * định điều đó:
 *
 *  - `false` (hiện tại): routing DỪNG ở `Cap1TradingPage`. Vì mọi `shouldQuery`
 *    của cấp trên đều móc xích vào `progressPastCap1` trong `DauTruongPage`,
 *    KHÔNG có `GET /capN/progress` lẫn `POST /capN/enter` nào (N = 2…8) được
 *    bắn ra ở bất kỳ trạng thái nào — các `useEffect` `enterCapN` đều return
 *    sớm.
 *  - `true`: nguyên chuỗi Cấp 2 → Cấp 8 sống lại y như trước.
 *
 * ─── BẬT LẠI CẦN ĐÚNG 1 VIỆC TAY ────────────────────────────────────────────
 *  1. Đổi cờ này thành `true`.
 *  2. Nối lại `useEnterCap2` trong `GraduationModalCap1.tsx` (file đó ghi rõ
 *     cách — nó là thứ DUY NHẤT còn phải sửa tay, vì đã gỡ hẳn cái import).
 *
 * ─── CÁC CHỖ TỰ ĐỔI THEO CỜ (không phải sửa gì, nhưng NHỚ KIỂM LẠI) ─────────
 *  a. `GraduationModalCap1.tsx` — Khối 3 quay về nguyên văn spec §3
 *     ("Từ giờ: Cấp 2 «Kỷ luật».") và dòng "sắp ra mắt" dưới CTA tự biến mất.
 *  b. **`JourneyPanelCap1.tsx` — ô mục tiêu (`.cap0-journey-goal`,
 *     `data-testid="cap1-journey-goal"`) quay về câu "… lên Cấp 2 «Kỷ luật» …
 *     Cấp 2 thêm cắt lỗ/chốt lời + sổ lệnh".** Đây là trạng thái CUỐI mà một
 *     người đã tốt nghiệp Cấp 1 nhìn thấy (modal tốt nghiệp unmount xong là về
 *     đúng màn này với checklist 5/5) — nên khi cờ còn `false` nó KHÔNG được
 *     hứa một cấp chưa tồn tại.
 *
 * Test cho cả chuỗi Cấp 2-8 vẫn còn nguyên trong `DauTruongPage.test.tsx` dưới
 * `describe.runIf(CAP_2_PLUS_ENABLED)` — chúng tự chạy lại khi cờ bật. Copy
 * hai chiều (a) và (b) cũng có test cho CẢ `false` lẫn `true` (các test đó mock
 * chính module này), nên bật cờ không thể im lặng bỏ sót câu chữ nào.
 *
 * An toàn khi bật/tắt: trên production chưa ai qua khỏi Cấp 0 (`cap1_progress`
 * rỗng), nên không có user nào bị kẹt giữa chừng.
 *
 * ★ Cờ sống trong file RIÊNG (không phải `DauTruongPage.tsx`) vì
 * `GraduationModalCap1`/`JourneyPanelCap1` phải đọc được nó mà KHÔNG kéo theo
 * vòng import `DauTruongPage → Cap1TradingPage → GraduationModalCap1` (và cả
 * cây import Cấp 2-8 + `@/features/dashboard` đứng sau nó). `DauTruongPage`
 * re-export lại tên này nên mọi import cũ vẫn chạy.
 */
export const CAP_2_PLUS_ENABLED = false
