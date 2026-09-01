/**
 * ★★ TRẦN CẤP — MỘT SỐ DUY NHẤT QUYẾT ĐỊNH CHƯƠNG TRÌNH MỞ TỚI CẤP MẤY ★★
 *
 * `CAP_MAX_ENABLED` = **cấp cao nhất đang mở**. Cấp 0 và Cấp 1 luôn mở (chúng
 * là nền của sản phẩm); từ Cấp 2 trở lên, cấp N chỉ sống khi
 * `CAP_MAX_ENABLED >= N`. Code của MỌI cấp 2-8 vẫn còn nguyên và **KHÔNG bị
 * xoá** — con số này là thứ duy nhất chặn chúng lại.
 *
 * ─── MỞ THÊM MỘT CẤP = SỬA ĐÚNG MỘT DÒNG ────────────────────────────────────
 * Tăng số này lên 1. Không phải sửa gì khác — mọi chỗ phụ thuộc đều đọc thẳng
 * `CAP_MAX_ENABLED >= N` chứ không hard-code:
 *
 *  a. `DauTruongPage.tsx` — mỗi nhánh cấp N gác trên `CAP_MAX_ENABLED >= N`,
 *     nên `GET /capN/progress` lẫn `POST /capN/enter` của cấp chưa mở KHÔNG bao
 *     giờ được bắn ra, và user đã tốt nghiệp cấp trần vẫn Ở LẠI shell của
 *     chính cấp đó (không spinner, không tụt cấp).
 *  b. `GraduationModalCap1.tsx` — Khối 3 + dòng "sắp ra mắt" dưới CTA + việc có
 *     gọi `useEnterCap2` hay không, tất cả theo `CAP_MAX_ENABLED >= 2`.
 *  c. `GraduationModalCap2.tsx` — y hệt (b), theo `CAP_MAX_ENABLED >= 3`.
 *  d. `JourneyPanelCap1.tsx` — ô mục tiêu (`data-testid="cap1-journey-goal"`)
 *     chỉ hứa Cấp 2 khi Cấp 2 thật sự mở. Đây là trạng thái CUỐI mà một người
 *     đã tốt nghiệp Cấp 1 nhìn thấy (modal tốt nghiệp unmount xong là về đúng
 *     màn này) — nó KHÔNG được hứa một cấp chưa tồn tại.
 *  e. `GraduationModalCap3.tsx` — y hệt (b)(c), theo `CAP_MAX_ENABLED >= 4`.
 *  f. `JourneyPanelCap2.tsx` (`cap2-journey-goal`) và `JourneyPanelCap3.tsx`
 *     (`cap3-journey-goal`) — y hệt (d), theo `>= 3` và `>= 4`.
 *  g. `GraduationModalCap4.tsx` — y hệt (b)(c)(e), theo `CAP_MAX_ENABLED >= 5`.
 *  h. `JourneyPanelCap4.tsx` (`cap4-journey-goal`) — y hệt (d), theo `>= 5`.
 *  i. `GraduationModalCap5.tsx` — y hệt (b)(c)(e)(g), theo `CAP_MAX_ENABLED >= 6`.
 *  j. `JourneyPanelCap5.tsx` (`cap5-journey-goal`) — y hệt (d)(h), theo `>= 6`.
 *  k. `GraduationModalCap6.tsx` — y hệt (b)(c)(e)(g)(i), theo `CAP_MAX_ENABLED >= 7`.
 *  l. `JourneyPanelCap6.tsx` (`cap6-journey-goal`) — y hệt (d)(h)(j), theo `>= 7`.
 *
 * ★ Cấp 7's live portfolio-balance UI is provider-gated and does not add a
 * trading-panel buy gate. Raising the release ceiling remains a separate rollout.
 *
 * ─── LUẬT TỔNG QUÁT (áp cho MỌI lần mở thêm cấp) ────────────────────────────
 * Với mỗi cấp N đang là TRẦN, đúng hai màn phải gắn theo `CAP_MAX_ENABLED >=
 * N+1`, và cả hai đều phải có test ở CẢ HAI phía của trần:
 *   1. Màn tốt nghiệp Cấp N — Khối 3, dòng dưới CTA, và việc có gọi
 *      `POST /cap{N+1}/enter` hay không. Gọi khi cấp đó chưa mở là tạo THẬT
 *      một hàng progress trên server cho một cấp user không vào được.
 *   2. Ô mục tiêu của Hành trình Cấp N — màn CUỐI người tốt nghiệp trần nhìn
 *      thấy.
 * Trần phải đọc trong HÀM (`function isCapXOpen()`), không phải `const`
 * module-scope: `const` chốt giá trị lúc import nên test mock-getter chỉ thấy
 * giá trị đầu tiên → một nửa số test xanh giả.
 *
 * ★ Luật bất di bất dịch cho mọi màn tốt nghiệp ở đúng cái trần: nút CTA vẫn
 * PHẢI bấm được và vẫn ghi tốt nghiệp về server. Modal tốt nghiệp
 * `closable={false}` + chỉ unmount khi có `graduated_at`, nên một nút `disabled`
 * kiểu "sắp ra mắt" sẽ NHỐT VĨNH VIỄN mọi user đã xong nhiệm vụ — đúng lỗi đã
 * phải sửa hai lần trên codebase này.
 *
 * ─── ★ CÒN MỘT LUẬT NỮA: CẤP SAU PHẢI ĐÚNG CẤP SAU CÓ THẬT ──────────────────
 * Khi nâng trần lên N, mọi câu hứa của Cấp N-1 về Cấp N đột nhiên HIỂN THỊ.
 * Trước khi đổi con số, đọc lại Khối 2 + Khối 3 của `GraduationModalCap{N-1}`,
 * ô mục tiêu `cap{N-1}-journey-goal` và coach template của Cấp N-1: chúng phải
 * mô tả đúng thứ Cấp N THẬT SỰ dạy, không phải thứ spec `.md` (có thể đã lỗi
 * thời) nói. Lần nâng 3 → 4 phát hiện Cấp 3 đang hứa Cấp 4 dạy "tách quyết
 * định khỏi kết quả — 4 ô đúng-thắng/…", trong khi Cấp 4 «Thuần thục» thật dạy
 * đọc + tự chấm cả 5 lớp; và Cấp 4 đang hứa Cấp 5 dạy cùng cái "4 ô" đó, trong
 * khi Cấp 5 «Lão luyện» thật = CHỦ ĐỘNG SĂN MÃ.
 *
 * ─── TEST ───────────────────────────────────────────────────────────────────
 * Chuỗi routing của từng cấp nằm trong `DauTruongPage.test.tsx` dưới
 * `describe.runIf(CAP_MAX_ENABLED >= N)` — chúng tự chạy lại khi trần được
 * nâng. Copy hai chiều (b)(c)(d) cũng có test cho CẢ hai phía của trần (các
 * test đó mock chính module này), nên nâng trần không thể im lặng bỏ sót câu
 * chữ nào.
 *
 * ★ Cờ sống trong file RIÊNG (không phải `DauTruongPage.tsx`) vì
 * `GraduationModalCap1`/`JourneyPanelCap1`/`GraduationModalCap2` phải đọc được
 * nó mà KHÔNG kéo theo vòng import `DauTruongPage → Cap1TradingPage →
 * GraduationModalCap1` (và cả cây import Cấp 2-8 + `@/features/dashboard` đứng
 * sau nó). `DauTruongPage` re-export lại tên này nên mọi import cũ vẫn chạy.
 */
export const CAP_MAX_ENABLED = 5
