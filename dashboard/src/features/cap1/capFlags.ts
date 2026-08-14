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
 *
 * ★ Luật bất di bất dịch cho mọi màn tốt nghiệp ở đúng cái trần: nút CTA vẫn
 * PHẢI bấm được và vẫn ghi tốt nghiệp về server. Modal tốt nghiệp
 * `closable={false}` + chỉ unmount khi có `graduated_at`, nên một nút `disabled`
 * kiểu "sắp ra mắt" sẽ NHỐT VĨNH VIỄN mọi user đã xong nhiệm vụ — đúng lỗi đã
 * phải sửa hai lần trên codebase này.
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
export const CAP_MAX_ENABLED = 2
