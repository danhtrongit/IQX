import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap5-graduation.css"
// Concrete-file import (NOT the `@/features/cap6` barrel) — that barrel
// re-exports `Cap6TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; going through it here would create
// a module-graph cycle (same rationale `GraduationModalCap4` documents for Cấp 5).
import { useEnterCap6 } from "@/features/cap6/hooks"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó), nên đọc được từ
// đây mà không tạo vòng import nào.
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useCap5Progress, useGraduateCap5 } from "./hooks"
import {
  CAP5_TOTAL_TASKS,
  countCap5TasksDone,
  huntFilterTen,
  type Cap5Progress,
} from "./types"

/**
 * Cấp 6 đã mở chưa — quyết định dòng dưới CTA và việc bấm nút có vào thẳng Cấp 6
 * hay chỉ ghi nhận tốt nghiệp Cấp 5.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc ở thời điểm
 * RENDER/CLICK (xem `capFlags.ts` — `const` chốt giá trị lúc import nên test
 * mock-getter chỉ thấy giá trị đầu tiên → một nửa số bài xanh giả).
 */
function isCap6Open(): boolean {
  return CAP_MAX_ENABLED >= 6
}

/**
 * Điều kiện mở màn tốt nghiệp Cấp 5 (spec §3): **2/2 nhiệm vụ**, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap4/GraduationModalCap4.tsx#isGraduationReadyCap4`).
 */
export function isGraduationReadyCap5(progress: Cap5Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap5TasksDone(progress) >= CAP5_TOTAL_TASKS
}

/** Số nguyên en-US (luật số 7). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/**
 * Tỷ lệ SÀNG LỌC = phần mã đã săn mà user KHÔNG mua (spec §3 "sàng lọc Z%").
 *
 * ★ `null` khi chưa săn mã nào: `0%` ở đó không phải "không loại mã nào" mà là
 * phép chia cho 0 — in ra là bịa. Kẹp về [0,100] để một wire lệch (mua > săn)
 * không vẽ ra số âm.
 */
function tyLeSangLoc(progress: Cap5Progress | null | undefined): number | null {
  const san = progress?.so_ma_da_san ?? 0
  if (!progress || san <= 0) return null
  const mua = Math.min(Math.max(progress.so_ma_mua_tu_watchlist, 0), san)
  return Math.round(((san - mua) / san) * 100)
}

/** Bộ lọc mạnh nhất — `null` là "chưa đủ dữ liệu", KHÔNG phải một bộ lọc nào. */
function bestFilterText(progress: Cap5Progress | null | undefined): string {
  if (!progress || progress.best_filter == null) return "chưa đủ dữ liệu để kết luận"
  return progress.best_filter_ten ?? huntFilterTen(progress.best_filter) ?? "chưa đủ dữ liệu để kết luận"
}

/**
 * ★★ KHỐI 1 KHÔNG SAO Y SPEC §3 — VÀ ĐÓ LÀ CỐ Ý ★★
 *
 * `IQX-Cap5-Spec.md` §3 Khối 1 viết: *"…và việc săn đã mang lại **lãi thật**."*
 * Nhưng chính §2 của cùng tài liệu đã BỎ HẲN ngưỡng lãi ("Vì sao bỏ ngưỡng lãi:
 * bài học Cấp 5 là quy trình săn mã có kỷ luật, không phải kiếm lãi… KHÔNG dùng
 * làm cổng"), và hai nhiệm vụ có thật chỉ đếm số mã săn + số mã mua. Khen "lãi
 * thật" ở đây là **ghi công một việc chương trình chưa từng đo** — đúng lớp lỗi
 * "màn tốt nghiệp khen việc user không làm" đã phải sửa hai lần trên repo này.
 *
 * Vì vậy Khối 1 nói đúng hai con số đã đo, và nói THẲNG rằng cấp này không đo
 * lãi (để người đọc không tự suy ra ngược). Cần báo founder sửa spec §3.
 */
function block1(progress: Cap5Progress | null | undefined): string {
  const sanN = progress?.so_ma_da_san ?? 0
  const muaN = progress?.so_ma_mua_tu_watchlist ?? 0
  const san = fmtInt(sanN)
  const mua = fmtInt(muaN)
  const khongDoLai =
    "Cấp 5 **không đo lãi** — lãi phụ thuộc thị trường; thứ bạn vừa chứng minh là " +
    "một quy trình săn có kỷ luật. Lãi và tỷ lệ thắng bạn tự xem ở Phân tích danh mục."

  // ★★ B7 — KHÔNG GHI CÔNG VIỆC KHÔNG LÀM. Câu "biết loại bỏ những mã chưa chín"
  // chỉ đúng khi user THẬT SỰ loại mã nào. Mua hết (hoặc mua nhiều hơn) số mã
  // săn ⇒ tỷ lệ sàng lọc 0% ⇒ khen "biết lọc" là khen một việc chưa xảy ra —
  // đúng lớp lỗi "màn tốt nghiệp ghi công việc user không làm" đã phải sửa hai
  // lần trên repo này. Ghi công hai nhiệm vụ ĐÃ làm, rồi nói thẳng phần còn lại.
  if (sanN > 0 && muaN >= sanN) {
    return (
      "Bạn không còn chờ mã đến — bạn chủ động đi săn. Bạn đã đưa " +
      `**${san} mã** vào Watchlist và vào lệnh cả **${mua} mã**: hai nhiệm vụ của Cấp 5 đã xong. ` +
      "Phần còn lại của nghề thợ săn thì chưa: bạn **chưa loại mã nào** — Watchlist đang là danh " +
      "sách mua chứ chưa phải công cụ sàng lọc. Lần tới, để mã chờ tới khi lên đủ lớp ủng hộ rồi " +
      "mới quyết định. " +
      khongDoLai
    )
  }

  return (
    "Bạn không còn chờ mã đến — bạn chủ động đi săn. Bạn đã đưa " +
    `**${san} mã** vào Watchlist rồi chỉ chọn mua **${mua} mã**: biết chờ mã lên đủ lớp ủng ` +
    "hộ, và biết loại bỏ những mã chưa chín. Đây là bản lĩnh của thợ săn. " +
    khongDoLai
  )
}

/** Khối 2 — VERBATIM spec §3. */
const BLOCK_2 =
  "Nhưng đến giờ bạn mới xử lý những mã mà các lớp đồng thuận. Thực tế khó hơn: nhiều khi các lớp mâu thuẫn nhau — kỹ thuật đẹp nhưng định giá đắt, dòng tiền vào nhưng tin xấu. Lúc đó quyết thế nào?"

/** Khối 3 — VERBATIM spec §3 (chỉ dùng khi Cấp 6 ĐÃ mở). */
const BLOCK_3 =
  "**Cấp 6 đang chờ:** học cách xử lý khi 5 lớp mâu thuẫn — lớp nào có quyền phủ quyết, lớp nào chỉ là điểm trừ, và khi nào mâu thuẫn nghĩa là nên đứng ngoài."

/**
 * Khối 3 khi Cấp 6 CHƯA mở (`CAP_MAX_ENABLED < 6`) — cùng cách xử lý trung thực
 * mà `cap1`/`cap2`/`cap3`/`cap4` dùng cho Khối 3 của chúng.
 *
 * ★★ Câu nguyên văn spec ở trên nói ở thì HIỆN TẠI ("**Cấp 6 đang chờ:**") trong
 * khi dòng ngay dưới CTA nói "Cấp 6 sắp ra mắt" — MỘT MÀN NÓI CẢ HAI. Trước bản
 * vá này `BLOCK_3` là một hằng số DUY NHẤT không gắn cờ trần, nên user ở trần 5
 * đọc đúng hai câu ngược nhau cách nhau ba dòng. Giữ nguyên nội dung Cấp 6 sẽ
 * dạy (user cần biết mình đang chờ gì) nhưng ở thì TƯƠNG LAI và nói thẳng cấp đó
 * chưa mở. Nâng trần → câu nguyên văn spec tự quay về, không phải sửa dòng nào.
 */
const BLOCK_3_CAP6_CHUA_MO =
  "**Cấp 6 «Đối chiếu» chưa ra mắt.** Cấp 5 là chặng cuối của chương trình hiện tại — bạn đã đi hết phần đang mở. Khi Cấp 6 mở, bạn sẽ học cách xử lý khi 5 lớp mâu thuẫn: lớp nào có quyền phủ quyết, lớp nào chỉ là điểm trừ, và khi nào mâu thuẫn nghĩa là nên đứng ngoài."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 5 «Lão luyện — Săn mã» (spec §3) — self-contained (gọi
 * `useCap5Progress` + `useGraduateCap5` bên trong, cùng pattern
 * `GraduationModalCap4`): `Cap5TradingPage` chỉ cần mount `<GraduationModalCap5 />`.
 *
 * Header (tag / `CẤP 5 · LÃO LUYỆN` / dòng phụ `săn X mã · mua Y mã (sàng lọc
 * Z%) · bộ lọc mạnh nhất: …` / huy hiệu vàng kim 120px phát sáng) + 3 khối +
 * CTA đỏ son Cấp 6.
 *
 * ★★ LUẬT BẤT DI BẤT DỊCH (đã phải sửa 2 lần): modal `closable={false}` và chỉ
 * unmount khi `graduated_at` về ⇒ **CTA không bao giờ được `disabled` như trạng
 * thái "sắp ra mắt"** — làm vậy là nhốt vĩnh viễn mọi user đã xong nhiệm vụ.
 * `disabled={graduate.isPending}` thì được: TanStack đưa `isPending` về `false`
 * cả khi lỗi, nên nó chỉ chặn double-submit chứ không nhốt được ai. Khi trần còn
 * dưới 6, nút VẪN bấm được và VẪN ghi tốt nghiệp — chỉ `POST /cap6/enter` là
 * không gọi (tạo hàng progress cho một cấp user không vào được).
 */
export function GraduationModalCap5() {
  const { data: progress } = useCap5Progress()
  const graduate = useGraduateCap5()
  const enterCap6 = useEnterCap6()
  const level = LEVELS[5]
  const visible = isGraduationReadyCap5(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        if (isCap6Open()) enterCap6.mutate()
      },
    })
  }

  const sangLoc = tyLeSangLoc(progress)

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
        <h2 className="cap0-display cap0-grad-title">CẤP 5 · LÃO LUYỆN</h2>
        {/* Dòng phụ spec §3 — SỐ THẬT của user (§C12c), en-US. */}
        <div className="cap0-grad-sub" data-testid="cap5-grad-sub">
          {`săn ${fmtInt(progress?.so_ma_da_san ?? 0)} mã · mua ${fmtInt(
            progress?.so_ma_mua_tu_watchlist ?? 0,
          )} mã`}
          {sangLoc != null && ` (sàng lọc ${fmtInt(sangLoc)}%)`}
          {` · bộ lọc mạnh nhất: ${bestFilterText(progress)}`}
        </div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={5} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block" data-testid="cap5-grad-khoi1">
        {renderInlineBold(block1(progress))}
      </div>
      <div className="cap0-grad-block" data-testid="cap5-grad-khoi2">
        {renderInlineBold(BLOCK_2)}
      </div>
      <div className="cap0-grad-block cap5-grad-block--cap6" data-testid="cap5-grad-khoi3">
        {renderInlineBold(isCap6Open() ? BLOCK_3 : BLOCK_3_CAP6_CHUA_MO)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap5-grad-cta--cap6"
        data-testid="cap5-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 6 «Đối chiếu» →
        {/* Dòng "sắp ra mắt" — gắn theo trần nên khi Cấp 6 mở nó tự biến mất. */}
        {!isCap6Open() && (
          <span
            className="cap5-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 6 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 5
          </span>
        )}
      </button>
    </Modal>
  )
}
