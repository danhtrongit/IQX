import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap2-graduation.css"
import { useCap2Progress, useGraduateCap2 } from "./hooks"
import { CAP2_TOTAL_TASKS, countCap2TasksDone, type Cap2Progress } from "./types"
// Cấp 3 sống khi `CAP_MAX_ENABLED >= 3` — concrete-file import (NOT the
// `@/features/cap3` barrel), same anti-cycle rationale
// `cap1/GraduationModalCap1.tsx` documents for its own `@/features/cap2/hooks`
// import (that barrel re-exports `Cap3TradingPage`, which imports
// `CenterPanel`/`RightSidebar`/`RightToolbar` from `@/features/dashboard`).
import { useEnterCap3 } from "@/features/cap3/hooks"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó), nên đọc được từ
// đây mà không tạo vòng import nào.
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"

/**
 * Cấp 3 đã mở chưa — quyết định Khối 3, dòng dưới CTA, và việc bấm nút có vào
 * thẳng Cấp 3 hay chỉ ghi nhận tốt nghiệp Cấp 2.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc ở thời điểm
 * RENDER/CLICK. Một `const` sẽ chốt giá trị ngay lúc import, và test (vốn mock
 * `capFlags` bằng getter để thử cả hai phía của trần) sẽ chỉ thấy giá trị đầu
 * tiên — nghĩa là một nửa số test xanh giả. Cùng lý do
 * `cap1/GraduationModalCap1.tsx#isCap2Open` đã ghi.
 */
function isCap3Open(): boolean {
  return CAP_MAX_ENABLED >= 3
}

/**
 * Điều kiện mở màn tốt nghiệp Cấp 2: **1/1 nhiệm vụ** (①), chưa từng tốt nghiệp
 * (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap1/GraduationModalCap1.tsx#isGraduationReadyCap1`).
 */
export function isGraduationReadyCap2(progress: Cap2Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap2TasksDone(progress) >= CAP2_TOTAL_TASKS
}

/**
 * Khối 1 — Ghi nhận. ★ **KHÔNG dùng nguyên văn spec §13 nữa.** Câu spec khen
 * "20 lệnh Thực chiến với ≤2 vi phạm kỷ luật" và trích một con số 24% — cả hai
 * thuộc mô hình 5 nhiệm vụ đã bỏ. Bản trước đó khen thêm "2 lần giá chạm mốc
 * bạn đã làm đúng điều mình đã cam kết" — đó là nhiệm vụ ②, GIỜ CŨNG ĐÃ BỎ, và
 * hành trình không còn đo nó, nên giữ lại là ghi công một việc user có thể
 * KHÔNG hề làm (đúng lỗi màn tốt nghiệp Cấp 0 từng mắc, đã phải canh bằng test
 * ở Cấp 0/1/2).
 *
 * Bản này chỉ nói đúng MỘT việc hành trình thật sự đo — và giữ đúng mức khiêm
 * tốn mà mockup Phân tích danh mục đặt ra ("Cấp 2 chỉ giúp bạn làm quen cơ chế").
 */
const BLOCK_1 =
  "Bạn đã đặt cắt lỗ và chốt lời cho 10 lệnh Thực chiến. **Cắt lỗ và chốt lời không còn là hai chữ trong sách — mỗi lệnh bạn vào đều đã có sẵn hai mốc do chính bạn định trước.**"

const BLOCK_2 =
  "Nhưng có kỷ luật vẫn chưa đủ. Cấp 3 «Bản lĩnh» dạy điều nghịch lý: **kết quả tốt không đồng nghĩa quyết định tốt.** Có lệnh bạn làm đúng mọi thứ nhưng vẫn lỗ (thị trường không thuận). Có lệnh bạn làm sai nhưng vẫn lãi (may mắn). Cấp 3 tách được 2 chuyện này — và bạn sẽ học cách điều chỉnh khối lượng mua theo khẩu vị rủi ro riêng."

const BLOCK_3 =
  "**Từ giờ: Cấp 3 «Bản lĩnh».** Bạn sẽ có công cụ mới: **khẩu vị rủi ro** (điều chỉnh cách đặt cắt lỗ/chốt lời theo phong cách riêng) · **khối lượng mua hợp lý** (mua bao nhiêu là đúng) · **mức độ tự tin của lệnh** · **tách quyết định khỏi kết quả**."

/**
 * Khối 3 khi Cấp 3 CHƯA mở (`CAP_MAX_ENABLED < 3`) — ĐÚNG cái xử lý trung thực
 * mà `cap1/GraduationModalCap1.tsx` đang dùng cho Khối 3 của nó. Nguyên văn
 * spec §13 ở trên nói thì HIỆN TẠI ("Từ giờ: Cấp 3 «Bản lĩnh».") — đọc như thể
 * Cấp 3 vừa mở ra ngay sau nút bấm, trong khi dòng ngay dưới CTA nói "Cấp 3 sắp
 * ra mắt". Một màn hình không được tự mâu thuẫn với chính nó.
 *
 * Giữ NGUYÊN nội dung Cấp 3 sẽ mang lại (user vẫn cần biết mình đang chờ gì)
 * nhưng ở thì TƯƠNG LAI và nói thẳng cấp đó chưa mở. Nâng trần lên 3 → câu
 * nguyên văn spec quay về, không phải sửa dòng nào.
 */
const BLOCK_3_CAP3_CHUA_MO =
  "**Cấp 3 «Bản lĩnh» chưa ra mắt.** Cấp 2 là chặng cuối của chương trình hiện tại — bạn đã đi hết phần đang mở. Khi Cấp 3 mở, bạn sẽ có: **khẩu vị rủi ro** (điều chỉnh cách đặt cắt lỗ/chốt lời theo phong cách riêng) · **khối lượng mua hợp lý** (mua bao nhiêu là đúng) · **mức độ tự tin của lệnh** · **tách quyết định khỏi kết quả**."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 2 (spec §13) — self-contained (calls `useCap2Progress` +
 * `useGraduateCap2` itself, same pattern as `GraduationModalCap1`): the
 * consumer (`Cap2TradingPage`) just mounts `<GraduationModalCap2 />`
 * unconditionally, this component decides its own visibility via
 * `isGraduationReadyCap2`. Header (tag/tên/dòng phụ/huy hiệu 120px glow,
 * Cấp 2's own ngọc lam) + 3 khối VERBATIM (Ghi nhận / Định vị / Chuyển cấp
 * viền xanh brand `#4f8ff7` — Cấp 3's colour) + CTA.
 *
 * ★ **Cấp 3 ĐANG MỞ** (`CAP_MAX_ENABLED >= 3`) — mirrors how
 * `GraduationModalCap1` enters Cấp 2 on success (which itself mirrors
 * `cap0/GraduationModal.tsx`): record the graduation server-side, then fire the
 * idempotent `POST /cap3/enter` right here too (not just relying on
 * `DauTruongPage`'s own effect) so Cấp 3 progress is ready the instant
 * `DauTruongPage` swaps this Cấp 2 shell out for `Cap3TradingPage` — driven by
 * the SAME `useCap2Progress` query this mutation's `graduated_at` just
 * invalidated. No navigation call needed: this modal only ever renders while
 * already on `/dau-truong`.
 *
 * ★ **Khi trần cấp còn dưới 3** thì nút KHÔNG vào Cấp 3 và nói thẳng "sắp ra
 * mắt" ngay trên nút — nhưng vẫn PHẢI bấm được và vẫn ghi tốt nghiệp về server:
 * modal này `closable={false}` + `visible = isGraduationReadyCap2(...)`, nên một
 * nút `disabled` sẽ **nhốt VĨNH VIỄN** mọi user đã xong 1/1 trong một màn không
 * có lối ra — đúng lỗi đã phải sửa hai lần trên codebase này. `graduate
 * .isPending` thì VẪN chặn: TanStack đưa nó về `false` cả khi mutation lỗi, nên
 * nó chỉ khoá trong lúc request đang bay và không thể nhốt ai.
 */
export function GraduationModalCap2() {
  const { data: progress } = useCap2Progress()
  const graduate = useGraduateCap2()
  const enterCap3 = useEnterCap3()
  const level = LEVELS[2]
  const visible = isGraduationReadyCap2(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      // Chỉ chạy sau khi server đã GHI NHẬN tốt nghiệp — hỏng mạng thì không
      // vào Cấp 3 lẫn không toast gì cả, để user bấm lại (modal vẫn còn đó vì
      // `graduated_at` chưa về).
      onSuccess: () => {
        if (isCap3Open()) {
          enterCap3.mutate()
          return
        }
        Message.info("Cấp 3 «Bản lĩnh» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 2")
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
        <h2 className="cap0-display cap0-grad-title">CẤP 2 · KỶ LUẬT</h2>
        {/* ★ Dòng phụ chỉ được liệt kê việc hành trình THẬT SỰ đo. Bản trước
            còn khoe "2 lần thực hiện đúng" (nhiệm vụ ② đã bỏ) — một con số
            không còn cổng nào kiểm, tức là một lời khen có thể sai. */}
        <div className="cap0-grad-sub">1/1 nhiệm vụ · 10 lệnh có cắt lỗ/chốt lời</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={2} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block" data-testid="cap2-grad-khoi1">
        {renderInlineBold(BLOCK_1)}
      </div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap2-grad-block--cap3" data-testid="cap2-grad-khoi3">
        {renderInlineBold(isCap3Open() ? BLOCK_3 : BLOCK_3_CAP3_CHUA_MO)}
      </div>

      {/* ★ KHÔNG bao giờ `disabled` như một trạng thái "sắp ra mắt" (xem
          doc-comment ở trên): modal này `closable={false}` và chỉ unmount khi
          có `graduated_at`, nên một nút tắt cứng sẽ NHỐT VĨNH VIỄN mọi user đã
          xong 1/1. `graduate.isPending` thì giữ — nó chỉ khoá lúc request đang
          bay, và bỏ nó đi thì double-click bắn hai lần `POST /cap2/graduate`. */}
      <button
        type="button"
        className="cap0-grad-cta"
        data-testid="cap2-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 3 «Bản lĩnh» →
        {/* Dòng "sắp ra mắt" — style inline, giống hệt `cap1-grad-cta-soon` của
            `GraduationModalCap1`. Gắn theo trần nên khi Cấp 3 mở nó tự biến mất
            cùng lúc với Khối 3 ở trên. */}
        {!isCap3Open() && (
          <span
            className="cap2-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 3 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 2
          </span>
        )}
      </button>
    </Modal>
  )
}
