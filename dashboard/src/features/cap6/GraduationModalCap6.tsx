import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap6-graduation.css"
// Concrete-file import (NOT the `@/features/cap7` barrel) — that barrel
// re-exports `Cap7TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; going through it here would create
// a module-graph cycle (same rationale `GraduationModalCap5` documents for Cấp 6).
import { useEnterCap7 } from "@/features/cap7/hooks"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó), nên đọc được từ
// đây mà không tạo vòng import nào.
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useCap6Progress, useGraduateCap6 } from "./hooks"
import { datCongCap6, mucTieuNhatQuan, mucTieuVeto } from "./nhanDinhCap6"
import type { Cap6Progress } from "./types"

/**
 * Cấp 7 đã mở chưa — quyết định Khối 3, dòng dưới CTA, và việc bấm nút có vào
 * thẳng Cấp 7 hay chỉ ghi nhận tốt nghiệp Cấp 6.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc ở thời điểm
 * RENDER/CLICK (xem `capFlags.ts` — `const` chốt giá trị lúc import nên test
 * mock-getter chỉ thấy giá trị đầu tiên → một nửa số bài xanh giả).
 */
function isCap7Open(): boolean {
  return CAP_MAX_ENABLED >= 7
}

/**
 * Điều kiện mở màn tốt nghiệp Cấp 6 (spec §2/§3): **1/1 nhiệm vụ thuần hành vi**
 * — đủ số lần xử lý mâu thuẫn nhất quán VÀ đủ số lần trong đó có lớp phủ quyết
 * rất xấu. Một chiều: không mở lại khi `graduated_at` đã có (mirrors
 * `cap5/GraduationModalCap5.tsx#isGraduationReadyCap5`).
 *
 * ★★ **KHÔNG đo lãi.** Spec §2 dành nguyên một đoạn giải thích vì sao lãi bị bỏ
 * hoàn toàn khỏi cổng ("cổng đo lãi vẫn kéo user về phía mua để đạt %"), và §11
 * ghi `tong_lai_lenh_cap6_pct` "CHỈ để hiển thị ở Kết sổ/Phân tích".
 */
export function isGraduationReadyCap6(progress: Cap6Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return datCongCap6(progress)
}

/** `18` → `"18"` — số en-US, không phần thập phân (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** Khối 1 — VERBATIM spec §3 (Ghi nhận). */
const BLOCK_1 =
  "Bạn đã học điều khó nhất: đọc mâu thuẫn giữa các lớp, phân biệt lớp phủ quyết với lớp điểm trừ, và — quan trọng nhất — để hành động khớp với nhận định của mình."

/** Khối 2 — VERBATIM spec §3 (Định vị). */
const BLOCK_2 =
  "Nhìn lại chặng đường: từ hiểu sân chơi (Cấp 0), vào lệnh có cơ sở (Cấp 1-2), quản lý vốn (Cấp 3), đọc trọn 5 lớp (Cấp 4), săn mã (Cấp 5), đến xử lý mâu thuẫn (Cấp 6). Bạn đã đi một chặng dài."

/**
 * Khối 3 — VERBATIM spec §3 (Chuyển cấp), chỉ dùng khi Cấp 7 ĐÃ mở.
 *
 * ★ Spec cố tình KHÔNG nói Cấp 7 dạy gì ("Chủ đề sẽ hé lộ khi bạn tới gần"), và
 * màn này giữ đúng như vậy — nhờ đó nó không thể hứa sai thứ Cấp 7 thật sự dạy,
 * đúng lớp lỗi mà `capFlags.ts` cảnh báo ("CẤP SAU PHẢI ĐÚNG CẤP SAU CÓ THẬT").
 */
const BLOCK_3 =
  "**Cấp 7 đang chờ** — hệ thống học không có điểm dừng. Chủ đề sẽ hé lộ khi bạn tới gần."

/**
 * Khối 3 khi Cấp 7 CHƯA mở (`CAP_MAX_ENABLED < 7`) — cùng cách xử lý trung thực
 * mà Cấp 1-5 dùng cho Khối 3 của chúng.
 *
 * ★★ Câu nguyên văn spec nói ở thì HIỆN TẠI ("Cấp 7 đang chờ") trong khi dòng
 * ngay dưới CTA lại nói "Cấp 7 sắp ra mắt" — MỘT MÀN NÓI CẢ HAI. Nâng trần lên 7
 * → câu nguyên văn spec tự quay về, không phải sửa dòng nào.
 */
const BLOCK_3_CAP7_CHUA_MO =
  "**Cấp 7 chưa ra mắt.** Cấp 6 là chặng cuối của chương trình hiện tại — bạn đã đi hết phần đang mở. Hệ thống học không có điểm dừng: khi Cấp 7 mở, chủ đề của nó sẽ hé lộ."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 6 «Bậc thầy» (spec §3) — self-contained (gọi
 * `useCap6Progress` + `useGraduateCap6` bên trong, cùng pattern
 * `GraduationModalCap5`): consumer (`Cap6TradingPage`) chỉ cần mount
 * `<GraduationModalCap6 />`.
 *
 * ★★ **DÒNG PHỤ KHÔNG DÙNG CÂU CỦA SPEC §3.** Spec ghi dòng phụ là *"lãi từ lệnh
 * mâu thuẫn +X%"* — đó là TÀN DƯ của bản nháp cũ: chính §2 của cùng tài liệu bỏ
 * lãi hoàn toàn khỏi cổng, và §11 ghi `tong_lai_lenh_cap6_pct` "CHỈ để hiển thị ở
 * Kết sổ/Phân tích". Khoe một con số lãi ở cổng tốt nghiệp là kéo user về đúng
 * phía mà §2 muốn tránh — và là ghi công một việc chương trình KHÔNG đo. Dòng phụ
 * vì thế dùng hai con số HÀNH VI thật: `X lần xử lý nhất quán · Y lần có phủ
 * quyết`, kèm mốc mà SERVER gửi (không hard-code 3/2).
 *
 * ★★ LUẬT BẤT DI BẤT DỊCH (đã phải sửa 2 lần trên repo này): modal
 * `closable={false}` và chỉ unmount khi `graduated_at` về ⇒ **CTA không bao giờ
 * được `disabled` như trạng thái "sắp ra mắt"** — làm vậy là nhốt vĩnh viễn mọi
 * user đã xong nhiệm vụ. `disabled={graduate.isPending}` thì được: TanStack đưa
 * `isPending` về `false` cả khi lỗi, nên nó chỉ chặn double-submit. Khi trần còn
 * dưới 7, nút VẪN bấm được và VẪN ghi tốt nghiệp — chỉ `POST /cap7/enter` là
 * không gọi (tạo hàng progress cho một cấp user không vào được).
 */
export function GraduationModalCap6() {
  const { data: progress } = useCap6Progress()
  const graduate = useGraduateCap6()
  const enterCap7 = useEnterCap7()
  const level = LEVELS[6]
  const visible = isGraduationReadyCap6(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        if (isCap7Open()) enterCap7.mutate()
      },
    })
  }

  // Dòng phụ — SỐ HÀNH VI THẬT của user (§C12c), en-US, mốc ĐỌC SERVER.
  const sub = progress
    ? `${fmtInt(progress.so_lan_xu_ly_nhat_quan)}/${fmtInt(
        mucTieuNhatQuan(progress),
      )} lần xử lý nhất quán · ${fmtInt(
        progress.so_lan_xu_ly_veto_nhat_quan,
      )}/${fmtInt(mucTieuVeto(progress))} lần có phủ quyết`
    : ""

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
        <h2 className="cap0-display cap0-grad-title">CẤP 6 · BẬC THẦY</h2>
        <div className="cap0-grad-sub" data-testid="cap6-grad-sub">
          {sub}
        </div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={6} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block" data-testid="cap6-grad-khoi1">
        {renderInlineBold(BLOCK_1)}
      </div>
      <div className="cap0-grad-block" data-testid="cap6-grad-khoi2">
        {renderInlineBold(BLOCK_2)}
      </div>
      <div className="cap0-grad-block cap6-grad-block--cap7" data-testid="cap6-grad-khoi3">
        {renderInlineBold(isCap7Open() ? BLOCK_3 : BLOCK_3_CAP7_CHUA_MO)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap6-grad-cta--cap7"
        data-testid="cap6-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 7 →
        {/* Dòng "sắp ra mắt" — gắn theo trần nên khi Cấp 7 mở nó tự biến mất. */}
        {!isCap7Open() && (
          <span
            className="cap6-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 7 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 6
          </span>
        )}
      </button>
    </Modal>
  )
}
