import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { lopLabelCap4 } from "./coachTemplateCap4"
import { useCap4Events } from "./Cap4Context"
import { useCap4Progress, useThachThucCap4, useVuKhiDiemMu } from "./hooks"
import {
  countCap4TasksDone,
  type Cap4Progress,
  type Lop,
  type LopWinRate,
  type ThachThucCap4,
  type ThachThucDieuKienCap4,
  type VuKhiDiemMuCap4,
} from "./types"
import "./cap4-journey.css"

/** 3 nhiệm vụ Cấp 4 — tên VERBATIM theo header spec §2. */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu tiên đọc + chấm đủ 5 lớp",
  2: "Kết sổ lệnh đầu Cấp 4",
  3: "Thách thức Thuần thục — đọc toàn cảnh",
}

/** Copy nhiệm vụ ① khi active — VERBATIM spec §2①. */
const TASK_1_COPY =
  "Cấp 4 khác trước: không chọn 1 lý do nữa, mà đọc cả 5 lớp rồi tự chấm từng lớp. Chấm đủ 5 lớp mới đặt được lệnh — AI sẽ đối chiếu sau khi bạn chấm xong."

/** Copy nhiệm vụ ② khi active (spec §2② "bán 1 lệnh → đóng màn Kết sổ Cấp 4"). */
const TASK_2_COPY = "Bán 1 lệnh đang mở rồi đóng màn Kết sổ Cấp 4 để hoàn thành."

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC = '"Đọc trọn bức tranh, không chỉ một lý do — và biết mình đọc giỏi ở đâu."'

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap4Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
}

/**
 * State của 1 nhiệm vụ trong checklist (spec §2 "Điều kiện mở"): ① và ③ mở ngay
 * khi vào Cấp 4; ② mở khi xong ① (điều kiện thật là "xong ① + có ≥1 lệnh mở" —
 * client không biết số lệnh đang mở, nên xấp xỉ bằng "xong ①", cùng kiểu xấp xỉ
 * đã ghi rõ ở `cap3/JourneyPanelCap3.tsx`).
 */
export function taskStateCap4(no: number, progress: Cap4Progress | null | undefined): TaskState {
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
      data-testid={`cap4-task-${no}`}
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
type CondKind = "count" | "score"

/**
 * "Đang / mục tiêu" của 1 điều kiện — LUÔN hiện cả giá trị hiện tại VÀ mốc cần
 * đạt (§C12c: không hiện con số trơ, người đọc phải thấy còn thiếu bao nhiêu).
 * Số en-US (§E).
 */
function fmtCondValue(dieuKien: ThachThucDieuKienCap4, kind: CondKind): string {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (kind === "count") {
    return `${Math.round(now).toLocaleString("en-US")}/${Math.round(target).toLocaleString("en-US")}`
  }
  return `${Math.round(now)}% / ${Math.round(target)}%`
}

/** % chiều rộng thanh tiến độ — kẹp 0..100. */
function progressPct(dieuKien: ThachThucDieuKienCap4): number {
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
  dieuKien: ThachThucDieuKienCap4
  kind: CondKind
}) {
  return (
    <div
      className="cap4-thachthuc-cond"
      data-testid={testId}
      data-dat={dieuKien.dat ? "true" : "false"}
    >
      <div className="cap4-thachthuc-row">
        <span className="cap4-thachthuc-ic">{dieuKien.dat ? "✅" : "🔲"}</span>
        <span className="cap4-thachthuc-label">{dieuKien.ten}</span>
        <span className="cap4-thachthuc-value">{fmtCondValue(dieuKien, kind)}</span>
      </div>
      <div className="cap4-thachthuc-bar">
        <i style={{ width: `${progressPct(dieuKien)}%` }} />
      </div>
      {/* §C12c — mỗi chỉ số kèm ĐÚNG câu giải thích của backend (nguồn gốc con
          số), không phải một câu FE tự viết. */}
      <p className="cap4-thachthuc-giaithich">{dieuKien.giai_thich}</p>
    </div>
  )
}

/**
 * Widget "Thách thức Thuần thục" = nhiệm vụ ③ (spec §2③). Hiện CẢ 3 điều kiện
 * cùng lúc kèm giá trị hiện tại vs mục tiêu và giải thích riêng của từng điều
 * kiện (§C12c) — dữ liệu do `GET /cap4/thach-thuc` tính, FE chỉ trình bày.
 */
function ThachThucWidget({ data }: { data: ThachThucCap4 | undefined }) {
  return (
    <div className="cap4-thachthuc" data-testid="cap4-thachthuc">
      <div className="cap4-thachthuc-title">{`🎯 ③ ${TASK_NAMES[3]}`}</div>
      {data ? (
        <>
          <ThachThucCond
            testId="cap4-thachthuc-so_lenh_doc_du_5lop"
            dieuKien={data.so_lenh_doc_du_5lop}
            kind="count"
          />
          <ThachThucCond
            testId="cap4-thachthuc-vu_khi_diem_mu"
            dieuKien={data.vu_khi_diem_mu}
            kind="count"
          />
          <ThachThucCond
            testId="cap4-thachthuc-ty_le_thang_dong_thuan_cao"
            dieuKien={data.ty_le_thang_dong_thuan_cao}
            kind="score"
          />
        </>
      ) : (
        <div className="cap4-thachthuc-loading">Đang tính 3 điều kiện của bạn…</div>
      )}
      {/* Vì sao khắt khe + mục tiêu KHÔNG phải "khớp AI" — spec §2③ + §4.3 */}
      <p className="cap4-thachthuc-why">
        Đây là cấp «Thuần thục»: không chỉ đọc, mà đọc <strong>có hiệu quả đo được bằng kết quả
        thật</strong>. Mục tiêu không phải là khớp AI bao nhiêu %, mà là đọc toàn cảnh thành thói
        quen và kết quả thực tế tốt lên. Đạt CẢ 3 điều kiện cùng lúc mới xong nhiệm vụ này.
      </p>
    </div>
  )
}

/** `78% thắng (7/9 lệnh)` — số THẬT phía sau kết luận vũ khí/điểm mù (§C12c). */
function fmtWinRate(row: LopWinRate | null): string | null {
  if (!row || row.win_rate == null) return null
  return `${Math.round(row.win_rate)}% thắng (${Math.round(row.n_wins).toLocaleString(
    "en-US",
  )}/${Math.round(row.n_orders).toLocaleString("en-US")} lệnh)`
}

function VuKhiRow({
  testId,
  variant,
  label,
  lop,
  row,
  soLenhToiThieu,
}: {
  testId: string
  variant: "vukhi" | "diemmu"
  label: string
  lop: Lop | null
  row: LopWinRate | null
  soLenhToiThieu: number
}) {
  const winRate = fmtWinRate(row)
  return (
    <div className={`cap4-vukhi-row cap4-vukhi-row--${variant}`} data-testid={testId}>
      <span className="cap4-vukhi-row-label">{label}</span>
      {lop ? (
        <>
          <span className="cap4-vukhi-row-value">{lopLabelCap4(lop)}</span>
          {winRate && <span className="cap4-vukhi-row-count">{`— ${winRate}`}</span>}
        </>
      ) : (
        <span className="cap4-vukhi-row-count">
          {`chưa đủ dữ liệu (cần ≥ ${soLenhToiThieu} lệnh đã đóng cho mỗi lớp)`}
        </span>
      )}
    </div>
  )
}

/**
 * Hộp "Vũ khí & điểm mù" — điều kiện ② của nhiệm vụ ③, ở dạng người đọc hiểu
 * ngay: lớp nào là vũ khí, lớp nào là điểm mù, VÀ % thắng thật + số lệnh đã đóng
 * đứng sau mỗi kết luận (§C12c "mọi chỉ số kèm giải thích + nguồn gốc").
 *
 * Ưu tiên `Cap4Progress.vu_khi_lop`/`diem_mu_lop` (server đã chốt, cũng là con
 * số nuôi nhiệm vụ ③) rồi mới tới `GET /cap4/vu-khi-diem-mu` — cùng thứ tự
 * `Cap4PortfolioAnalysis` dùng, nên 2 màn không bao giờ nói khác nhau.
 */
function VuKhiBox({
  progress,
  data,
}: {
  progress: Cap4Progress | null | undefined
  data: VuKhiDiemMuCap4 | undefined
}) {
  const vuKhiLop = progress?.vu_khi_lop ?? data?.vu_khi_lop ?? null
  const diemMuLop = progress?.diem_mu_lop ?? data?.diem_mu_lop ?? null
  const rowOf = (lop: Lop | null) =>
    (lop && data?.lop.find((r) => r.lop === lop)) || null
  const soLenhToiThieu = data?.so_lenh_toi_thieu ?? 3

  return (
    <div className="cap4-vukhi" data-testid="cap4-journey-vukhi">
      <div className="cap4-vukhi-title">Vũ khí &amp; điểm mù của bạn</div>
      <VuKhiRow
        testId="cap4-journey-vukhi-lop"
        variant="vukhi"
        label="🗡 Vũ khí:"
        lop={vuKhiLop}
        row={rowOf(vuKhiLop)}
        soLenhToiThieu={soLenhToiThieu}
      />
      <VuKhiRow
        testId="cap4-journey-diemmu-lop"
        variant="diemmu"
        label="🕳 Điểm mù:"
        lop={diemMuLop}
        row={rowOf(diemMuLop)}
        soLenhToiThieu={soLenhToiThieu}
      />
      {/* §C12c — câu giải thích nguồn gốc/ngưỡng do CHÍNH server sinh. */}
      {data?.giai_thich && <p className="cap4-vukhi-giaithich">{data.giai_thich}</p>}
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 4 — panel đầu của sidebar-phải khi đang ở Cấp 4
 * (mockup `iqx-cap4-hanhtrinh.html`). Mirror `cap3/JourneyPanelCap3.tsx`: thẻ
 * cấp + checklist header + danh sách nhiệm vụ + hộp mục tiêu, ĐỔI phần giữa
 * thành widget Thách thức Thuần thục (nhiệm vụ ③, spec §2③) + hộp Vũ khí/Điểm
 * mù. KHÔNG có thẻ Điểm kỷ luật (khác Cấp 3: điểm kỷ luật KHÔNG phải điều kiện
 * lên Cấp 5 và mockup Cấp 4 không có thẻ đó — cơ chế điểm kỷ luật vẫn chạy y
 * nguyên ở panel đặt lệnh/Kết sổ). KHÔNG có Tủ huân chương (spec §11 — không
 * cấp nào có).
 *
 * Self-contained: gọi `useCap4Progress`/`useThachThucCap4`/`useVuKhiDiemMu` với
 * `isCap4Active` nên KHÔNG query gì khi ở ngoài `Cap4Provider`
 * (`SidebarProvider` là singleton app-root, dùng chung với /bieu-do &
 * /co-phieu — cùng lý do đã ghi ở `JourneyPanelCap3`).
 */
export function JourneyPanelCap4() {
  const { isCap4Active } = useCap4Events()
  const { data: progress } = useCap4Progress(isCap4Active)
  const { data: thachThuc } = useThachThucCap4(isCap4Active)
  const { data: vuKhi } = useVuKhiDiemMu(isCap4Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap4TasksDone(progress)
  const level = LEVELS[4]

  const openPortfolioAnalysis = () => setActivePanel("cap4-analysis")
  const goToTrading = () => setActivePanel("trading")

  // §C12c — chip bài học kèm con số thật (số lệnh đã đọc đủ 5 lớp), không phải
  // một khẩu hiệu trơ.
  const chipText = progress
    ? `● Đọc trọn 5 lớp mỗi lệnh · ${Math.round(
        progress.so_lenh_doc_du_5lop,
      ).toLocaleString("en-US")} lệnh đã đọc đủ`
    : "● Đọc trọn 5 lớp mỗi lệnh"

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
            <div className="cap0-level-card-tag">CẤP 4</div>
            <div className="cap0-level-card-name cap0-display">THUẦN THỤC</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap4-journey-tag" data-testid="cap4-journey-tag">
              {chipText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        <div className="cap0-journey-checklist-header mt-3">
          TRƯỚC KHI LÊN CẤP 5 · {tasksDone}/3
        </div>

        <ChecklistItem
          no={1}
          state={taskStateCap4(1, progress)}
          progressText={progress?.task_1_done_at ? undefined : TASK_1_COPY}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={2}
          state={taskStateCap4(2, progress)}
          progressText={progress?.task_2_done_at ? undefined : TASK_2_COPY}
          onGo={goToTrading}
        />

        {/* Nhiệm vụ ③ — widget riêng (3 điều kiện + giá trị hiện tại, §C12c). */}
        <div className="mt-1">
          <ThachThucWidget data={thachThuc} />
        </div>

        {/* Vũ khí / điểm mù đang có — nguồn gốc con số của điều kiện ② ở trên. */}
        <VuKhiBox progress={progress} data={vuKhi} />

        <button type="button" className="cap0-checklist-golink mt-2" onClick={openPortfolioAnalysis}>
          Xem Phân tích danh mục →
        </button>

        <div className="cap0-journey-goal">
          Đạt cả 3 điều kiện của Thách thức Thuần thục → tốt nghiệp Cấp 4, lên{" "}
          <strong>Cấp 5 «Lão luyện»</strong> (tách quyết định khỏi kết quả — và đứng ngoài cũng là
          một quyết định).
        </div>
      </div>
    </div>
  )
}
