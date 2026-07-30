import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Điểm kỷ luật là công cụ Cấp 2 và KHÔNG phụ thuộc cấp — spec §9 nói rõ cách
// hiển thị nó "áp dụng cả Cấp 2 lẫn Cấp 3", và nó là 1 trong 3 điều kiện lên
// Cấp 4, nên tab Hành trình Cấp 3 dùng lại đúng thẻ đó (import file cụ thể,
// KHÔNG qua barrel `@/features/cap2` — barrel đó re-export `Cap2TradingPage`,
// vốn import `@/features/dashboard` → dễ tạo vòng module).
import { DiemKyLuatCard } from "@/features/cap2/DiemKyLuat"
import { useCap3Events } from "./Cap3Context"
import { useCap3Progress, useThachThuc } from "./hooks"
import { KHAU_VI_PCT } from "./khoiLuong"
import { countCap3TasksDone, type Cap3Progress, type KhauViLoai, type ThachThucCap3, type ThachThucDieuKienCap3 } from "./types"
import "./cap3-journey.css"

/** 3 nhiệm vụ Cấp 3 — tên VERBATIM theo header spec §2. */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu tiên đủ khẩu vị + mức tự tin",
  2: "Kết sổ lệnh đầu Cấp 3",
  3: "Thách thức Bản lĩnh — lãi có kỷ luật",
}

/** Copy nhiệm vụ ① khi active — VERBATIM spec §2①. */
const TASK_1_COPY =
  "Cấp 3 thêm quản lý vốn: đặt khẩu vị rủi ro (áp mọi lệnh), chấm mức tự tin cho lệnh này, rồi chọn cách tính khối lượng. Thiếu tự tin hoặc cách khối lượng thì chưa đặt được lệnh."

/** Copy nhiệm vụ ② khi active (spec §2② "bán 1 lệnh → đóng màn Kết sổ"). */
const TASK_2_COPY = "Bán 1 lệnh đang mở rồi đóng màn Kết sổ Cấp 3 để hoàn thành."

const KHAU_VI_LABEL: Record<KhauViLoai, string> = {
  than_trong: "Thận trọng",
  can_bang: "Cân bằng",
  tan_cong: "Tấn công",
}

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap3Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
}

/**
 * State của 1 nhiệm vụ trong checklist (spec §2 "Điều kiện mở"): ① và ③ mở
 * ngay khi vào Cấp 3; ② mở khi xong ① (điều kiện thật là "xong ① + có ≥1 lệnh
 * mở" — client không biết số lệnh đang mở, nên xấp xỉ bằng "xong ①", cùng kiểu
 * xấp xỉ đã ghi rõ ở `cap2/JourneyPanelCap2.tsx` và `cap1/JourneyPanelCap1.tsx`).
 */
export function taskStateCap3(no: number, progress: Cap3Progress | null | undefined): TaskState {
  const doneAt = progress ? TASK_DONE_AT[no](progress) : null
  if (doneAt) return "done"
  if (no === 2) return progress?.task_1_done_at ? "active" : "locked"
  return "active"
}

function ChecklistItem({
  no,
  state,
  progressText,
  onGo,
}: {
  no: number
  state: TaskState
  progressText?: string
  onGo: () => void
}) {
  return (
    <div
      data-testid={`cap3-task-${no}`}
      className={
        "cap0-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        (state === "active" ? " cap0-checklist-item--active" : "") +
        (state === "locked" ? " cap0-checklist-item--locked" : "")
      }
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : "①②③"[no - 1]}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {progressText && <div className="cap0-checklist-desc">{progressText}</div>}
        {state === "active" && (
          <button type="button" className="cap0-checklist-golink" onClick={onGo}>
            Làm ngay →
          </button>
        )}
      </div>
    </div>
  )
}

/** Kiểu hiển thị giá trị của 1 điều kiện — quyết định cách format "đang / mục tiêu". */
type CondKind = "pct" | "count" | "score"

/** `+3.2%` / `−1.5%` / `0.0%` — dấu trừ typographic, số en-US (§E). */
function fmtPctSigned(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/**
 * "Đang / mục tiêu" của 1 điều kiện — LUÔN hiện cả giá trị hiện tại VÀ mốc cần
 * đạt (§C12c: không hiện con số trơ, người đọc phải thấy còn thiếu bao nhiêu).
 */
function fmtCondValue(dieuKien: ThachThucDieuKienCap3, kind: CondKind): string {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (kind === "pct") return `${fmtPctSigned(now)} / ${fmtPctSigned(target)}`
  if (kind === "count") {
    return `${Math.round(now).toLocaleString("en-US")}/${Math.round(target).toLocaleString("en-US")}`
  }
  return `${Math.round(now)}% / ${Math.round(target)}%`
}

/** % chiều rộng thanh tiến độ — kẹp 0..100, lỗ (âm) = 0. */
function progressPct(dieuKien: ThachThucDieuKienCap3): number {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (target <= 0) return dieuKien.dat ? 100 : 0
  return Math.max(0, Math.min(100, (now / target) * 100))
}

function ThachThucCond({
  testId,
  dieuKien,
  kind,
}: {
  testId: string
  dieuKien: ThachThucDieuKienCap3
  kind: CondKind
}) {
  return (
    <div
      className="cap3-thachthuc-cond"
      data-testid={testId}
      data-dat={dieuKien.dat ? "true" : "false"}
    >
      <div className="cap3-thachthuc-row">
        <span className="cap3-thachthuc-ic">{dieuKien.dat ? "✅" : "🔲"}</span>
        <span className="cap3-thachthuc-label">{dieuKien.ten}</span>
        <span className="cap3-thachthuc-value">{fmtCondValue(dieuKien, kind)}</span>
      </div>
      <div className="cap3-thachthuc-bar">
        <i style={{ width: `${progressPct(dieuKien)}%` }} />
      </div>
      {/* §C12c — mỗi chỉ số kèm ĐÚNG câu giải thích của backend (nguồn gốc con
          số), không phải một câu FE tự viết. */}
      <p className="cap3-thachthuc-giaithich">{dieuKien.giai_thich}</p>
    </div>
  )
}

/**
 * Widget "Thách thức Bản lĩnh" = nhiệm vụ ③ (spec §2③). Hiện CẢ 3 điều kiện
 * cùng lúc kèm giá trị hiện tại vs mục tiêu và giải thích riêng của từng điều
 * kiện (§C12c) — dữ liệu do `GET /cap3/thach-thuc` tính, FE chỉ trình bày.
 */
function ThachThucWidget({ data }: { data: ThachThucCap3 | undefined }) {
  return (
    <div className="cap3-thachthuc" data-testid="cap3-thachthuc">
      <div className="cap3-thachthuc-title">{`🎯 ③ ${TASK_NAMES[3]}`}</div>
      {data ? (
        <>
          <ThachThucCond testId="cap3-thachthuc-lai_pct" dieuKien={data.lai_pct} kind="pct" />
          <ThachThucCond testId="cap3-thachthuc-so_lenh" dieuKien={data.so_lenh} kind="count" />
          <ThachThucCond
            testId="cap3-thachthuc-diem_ky_luat"
            dieuKien={data.diem_ky_luat}
            kind="score"
          />
        </>
      ) : (
        <div className="cap3-thachthuc-loading">Đang tính 3 điều kiện của bạn…</div>
      )}
      {/* Vì sao khắt khe — spec §2③ */}
      <p className="cap3-thachthuc-why">
        Đây là cấp «Bản lĩnh»: không chỉ lãi, mà lãi <strong>có kỷ luật</strong>. Lãi do đánh liều
        ăn may sẽ không qua vì điểm kỷ luật thấp. Đạt CẢ 3 điều kiện cùng lúc mới xong nhiệm vụ
        này.
      </p>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 3 — panel đầu của sidebar-phải khi đang ở Cấp 3
 * (mockup `iqx-cap3-hanhtrinh.html`). Mirror `cap2/JourneyPanelCap2.tsx`: thẻ
 * cấp + checklist header + danh sách nhiệm vụ + hộp mục tiêu, ĐỔI phần giữa
 * thành widget Thách thức Bản lĩnh (nhiệm vụ ③, spec §2③) và thêm khẩu vị rủi
 * ro đang dùng vào thẻ cấp. Giữ thẻ Điểm kỷ luật của Cấp 2 (spec §9 áp cho cả
 * Cấp 3, và đó là 1 trong 3 điều kiện lên Cấp 4). KHÔNG có Tủ huân chương
 * (spec §11 — không cấp nào có).
 *
 * Self-contained: gọi `useCap3Progress`/`useThachThuc` với `isCap3Active` nên
 * KHÔNG query gì khi ở ngoài `Cap3Provider` (`SidebarProvider` là singleton
 * app-root, dùng chung với /bieu-do & /co-phieu — cùng lý do đã ghi ở
 * `JourneyPanelCap2`).
 */
export function JourneyPanelCap3() {
  const { isCap3Active } = useCap3Events()
  const { data: progress } = useCap3Progress(isCap3Active)
  const { data: thachThuc } = useThachThuc(isCap3Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap3TasksDone(progress)
  const level = LEVELS[3]

  const openPortfolioAnalysis = () => setActivePanel("cap3-analysis")
  const goToTrading = () => setActivePanel("trading")

  const khauVi = progress?.khau_vi ?? null
  const khauViText = khauVi
    ? `● Khẩu vị: ${KHAU_VI_LABEL[khauVi]} · trần ${KHAU_VI_PCT[khauVi]}% vốn/lệnh`
    : "● Chưa đặt khẩu vị rủi ro"

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            size={64}
            ring={tasksDone / 3}
            glow
          />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 3</div>
            <div className="cap0-level-card-name cap0-display">BẢN LĨNH</div>
            <div className="cap0-level-card-lesson">
              "Mua bao nhiêu quan trọng như mua gì."
            </div>
            {/* §C12c — khẩu vị luôn hiện kèm trần % vốn (nguồn gốc của khối lượng). */}
            <div className="cap3-journey-khauvi" data-testid="cap3-journey-khauvi">
              {khauViText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        <div className="mt-3">
          <DiemKyLuatCard enabled={isCap3Active} />
        </div>

        <div className="cap0-journey-checklist-header mt-3">
          TRƯỚC KHI LÊN CẤP 4 · {tasksDone}/3
        </div>

        <ChecklistItem
          no={1}
          state={taskStateCap3(1, progress)}
          progressText={progress?.task_1_done_at ? undefined : TASK_1_COPY}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={2}
          state={taskStateCap3(2, progress)}
          progressText={progress?.task_2_done_at ? undefined : TASK_2_COPY}
          onGo={goToTrading}
        />

        {/* Nhiệm vụ ③ — widget riêng (3 điều kiện + giá trị hiện tại, §C12c). */}
        <div className="mt-1">
          <ThachThucWidget data={thachThuc} />
        </div>

        <button type="button" className="cap0-checklist-golink mt-2" onClick={openPortfolioAnalysis}>
          Xem Phân tích danh mục →
        </button>

        <div className="cap0-journey-goal">
          Đạt cả 3 điều kiện của Thách thức Bản lĩnh → tốt nghiệp Cấp 3, lên{" "}
          <strong>Cấp 4 «Thuần thục»</strong> (tách quyết định khỏi kết quả).
        </div>
      </div>
    </div>
  )
}
