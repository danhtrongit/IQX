import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap1.css"
import { CAP_MAX_ENABLED } from "./capFlags"
import { useCap1Progress, useGraduateCap1 } from "./hooks"
import { countCap1TasksDone, type Cap1Progress } from "./types"
// Cấp 2 sống khi `CAP_MAX_ENABLED >= 2` (xem docstring của trần trong
// `./capFlags` — nó ở file riêng chứ không ở `DauTruongPage.tsx`, vì file này
// không thể import file đó: vòng `DauTruongPage → Cap1TradingPage →
// GraduationModalCap1`).
//
// ★ Import CỤ THỂ (`@/features/cap2/hooks`), KHÔNG dùng barrel `@/features/cap2`
// — theo đúng anti-cycle rationale mà `cap0/GraduationModal.tsx` đã ghi cho
// import `@/features/cap1/hooks` của nó: barrel đó re-export `Cap2TradingPage`,
// vốn import `CenterPanel`/`RightSidebar`/`RightToolbar` từ
// `@/features/dashboard`.
import { useEnterCap2 } from "@/features/cap2/hooks"

/**
 * Cấp 2 đã mở chưa — quyết định Khối 3, dòng dưới CTA, và việc bấm nút có vào
 * thẳng Cấp 2 hay chỉ ghi nhận tốt nghiệp.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc ở thời điểm
 * RENDER/CLICK. Một `const` sẽ chốt giá trị ngay lúc import, và test (vốn mock
 * `./capFlags` bằng getter để thử cả hai phía của trần) sẽ chỉ thấy giá trị đầu
 * tiên — nghĩa là một nửa số test xanh giả.
 */
function isCap2Open(): boolean {
  return CAP_MAX_ENABLED >= 2
}

/**
 * Điều kiện mở màn tốt nghiệp Cấp 1 (spec §3): 5/5 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap0/GraduationModal.tsx#isGraduationReady`).
 */
export function isGraduationReadyCap1(progress: Cap1Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap1TasksDone(progress) >= 5
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx`).
const BLOCK_1 =
  "Bạn đã đi qua 10 lệnh Thực chiến đầu tiên — mọi lệnh đều có kế hoạch: biết vì sao mua và mua vùng nào. Bạn đã thử cả 5 lý do, và có ít nhất 3 lần chọn được lý do đang được dữ liệu ủng hộ. **Bạn không còn vào lệnh cảm tính.**"

const BLOCK_2 =
  "Nhưng biết mua thôi chưa đủ. Vào lệnh dễ, thoát lệnh mới khó. Cấp 2 «Kỷ luật» dạy điều khó hơn: **đặt cắt lỗ / chốt lời có cơ sở, và thực hiện đúng cam kết của chính mình** — không cắt lỗ chậm vì hy vọng, không tham thêm khi đã tới đích."

const BLOCK_3 =
  "**Từ giờ: Cấp 2 «Kỷ luật».** Form Kế hoạch thêm 2 phần: Cắt lỗ và Chốt lời — với 2 cách đặt có cơ sở. Bạn sẽ có thêm: chuỗi lệnh kỷ luật · điểm kỷ luật hằng ngày · cảnh báo khi giá chạm cắt lỗ."

/**
 * Khối 3 khi Cấp 2 CHƯA mở (`CAP_MAX_ENABLED < 2`). Nguyên văn spec §3 ở trên
 * nói thì HIỆN TẠI ("Từ giờ: Cấp 2 «Kỷ luật».", "Bạn sẽ có thêm: …") — đọc như
 * thể Cấp 2 vừa mở ra ngay sau nút bấm, trong khi dòng ngay dưới CTA nói "Cấp 2
 * sắp ra mắt". Một màn hình không được tự mâu thuẫn với chính nó.
 *
 * Bản này giữ NGUYÊN nội dung Cấp 2 sẽ mang lại (user vẫn cần biết mình đang
 * chờ gì) nhưng ở thì TƯƠNG LAI và nói thẳng cấp đó chưa mở. Nâng trần → câu
 * nguyên văn spec quay về, không phải sửa dòng nào.
 */
const BLOCK_3_CAP2_CHUA_MO =
  "**Cấp 2 «Kỷ luật» chưa ra mắt.** Cấp 1 là chặng cuối của chương trình hiện tại — bạn đã đi hết phần đang mở. Khi Cấp 2 mở, form Kế hoạch sẽ thêm 2 phần Cắt lỗ và Chốt lời (2 cách đặt có cơ sở), kèm chuỗi lệnh kỷ luật · điểm kỷ luật hằng ngày · cảnh báo khi giá chạm cắt lỗ."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 1 (spec §3) — self-contained (calls `useCap1Progress` +
 * `useGraduateCap1` itself, same pattern as `cap0/GraduationModal.tsx`): the
 * consumer (`Cap1TradingPage`) just mounts `<GraduationModalCap1 />`
 * unconditionally, this component decides its own visibility via
 * `isGraduationReadyCap1`. Header (tag/tên/dòng phụ/huy hiệu 120px glow) + 3
 * khối VERBATIM (Ghi nhận / Định vị / Chuyển cấp viền ngọc lam `#7dd3c0`) +
 * CTA.
 *
 * ★ **Cấp 2 ĐANG MỞ** (`CAP_MAX_ENABLED >= 2`): ghi tốt nghiệp về server rồi
 * bắn luôn `POST /cap2/enter` (idempotent) ngay tại đây — không chỉ dựa vào
 * effect riêng của `DauTruongPage` — để Cấp 2 progress sẵn sàng đúng lúc
 * `DauTruongPage` đổi vỏ Cấp 1 này sang `Cap2TradingPage`, vốn được lái bởi
 * CHÍNH `useCap1Progress` mà `graduated_at` vừa invalidate. Không cần gọi
 * navigation: modal này chỉ hiện khi user đã đứng sẵn trên `/dau-truong`.
 *
 * ★ **Khi trần hạ xuống dưới 2** thì nút KHÔNG điều hướng đi đâu và nói thẳng
 * "sắp ra mắt" ngay trên nút — nhưng vẫn PHẢI bấm được và vẫn ghi tốt nghiệp về
 * server: modal này `closable={false}` + `visible = isGraduationReadyCap1(...)`,
 * nên một nút `disabled` sẽ **nhốt VĨNH VIỄN** mọi user đã xong 5/5 trong một
 * màn không có lối ra — đúng lỗi đã phải sửa hai lần trên codebase này.
 */
export function GraduationModalCap1() {
  const { data: progress } = useCap1Progress()
  const graduate = useGraduateCap1()
  const enterCap2 = useEnterCap2()
  const level = LEVELS[1]
  const visible = isGraduationReadyCap1(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      // Chỉ chạy sau khi server đã GHI NHẬN tốt nghiệp — hỏng mạng thì không
      // vào Cấp 2 lẫn không toast gì cả, để user bấm lại (modal vẫn còn đó vì
      // `graduated_at` chưa về).
      onSuccess: () => {
        if (isCap2Open()) {
          enterCap2.mutate()
          return
        }
        Message.info("Cấp 2 «Kỷ luật» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 1")
      },
    })
  }

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-grad-header">
        <div className="cap0-grad-tag">HOÀN THÀNH</div>
        <h2 className="cap0-display cap0-grad-title">CẤP 1 · HỌC VIỆC</h2>
        <div className="cap0-grad-sub">5/5 nhiệm vụ · 10 lệnh Thực chiến</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={1} size={120} glow />
        </div>
      </div>

      {/* Khối 1 — Ghi nhận. NGUYÊN VĂN spec §3, và may thay nó chỉ ghi công
          ①③④⑤ (kế hoạch · 5 lý do · 3 lệnh ✅ · 10 lệnh) — KHÔNG có câu nào
          khen "xem lại danh mục", nhiệm vụ vừa bị bỏ. Nếu sau này sửa câu này,
          giữ nguyên luật đó: màn tốt nghiệp không được ghi công việc không làm. */}
      <div className="cap0-grad-block" data-testid="cap1-grad-khoi1">
        {renderInlineBold(BLOCK_1)}
      </div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap1-grad-block--cap2" data-testid="cap1-grad-khoi3">
        {renderInlineBold(isCap2Open() ? BLOCK_3 : BLOCK_3_CAP2_CHUA_MO)}
      </div>

      {/* ★ KHÔNG bao giờ `disabled` như một trạng thái "sắp ra mắt" (xem
          doc-comment ở trên): modal này `closable={false}` và chỉ unmount khi
          có `graduated_at`, nên một nút tắt cứng sẽ NHỐT VĨNH VIỄN mọi user
          đã xong 5/5. Nhưng `graduate.isPending` thì VẪN chặn: TanStack đưa
          nó về `false` cả khi mutation lỗi, nên nó chỉ khoá trong lúc request
          đang bay — đúng như Cấp 6/7 — và nếu không có nó thì double-click
          bắn hai lần `POST /cap1/graduate`. */}
      <button
        type="button"
        className="cap0-grad-cta cap1-grad-cta--cap2"
        data-testid="cap1-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 2 «Kỷ luật» →
        {/* Dòng "sắp ra mắt" — style inline vì `cap1.css` đang do task khác sở
            hữu. Giống `.cap7-grad-cta-soon`. Gắn theo trần (không hard-code)
            nên khi Cấp 2 mở nó tự biến mất cùng lúc với Khối 3 ở trên. */}
        {!isCap2Open() && (
          <span
            className="cap1-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 2 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 1
          </span>
        )}
      </button>
    </Modal>
  )
}
