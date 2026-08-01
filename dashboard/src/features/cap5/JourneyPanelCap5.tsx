import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap5Events } from "./Cap5Context"
import { useCap5Progress, useThachThucCap5 } from "./hooks"
import {
  countCap5TasksDone,
  type Cap5Progress,
  type ThachThucCap5,
  type ThachThucDieuKienCap5,
} from "./types"
import "./cap5-journey.css"

/** 3 nhiệm vụ Cấp 5 — tên VERBATIM theo header spec §2. */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu Cấp 5 — phân loại 4 ô",
  2: "Đứng ngoài đầu tiên",
  3: "Thách thức Lão luyện — chất lượng quyết định",
}

/** Copy nhiệm vụ ① khi active — theo "Yêu cầu" spec §2①. */
const TASK_1_COPY =
  "Bán 1 lệnh → ở Kết sổ, xem verdict hệ gợi ý (kèm mọi tín hiệu dẫn tới nó) rồi xác nhận hoặc sửa. Chốt phân loại mới đóng được Kết sổ — đó là bước xếp lệnh vào 1 trong 4 ô."

/** Copy nhiệm vụ ② khi active — VERBATIM spec §2②. */
const TASK_2_COPY =
  "Không phải lúc nào cũng phải mua. Chọn một mã bạn đang xem nhưng quyết định KHÔNG mua — và ghi lại vì sao. Đứng ngoài có chủ đích cũng là một kỹ năng."

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC =
  '"Kết quả tốt không chắc là quyết định đúng — và đứng ngoài cũng là một quyết định."'

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap5Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
}

/**
 * State của 1 nhiệm vụ trong checklist. Khác Cấp 4: CẢ ① VÀ ② đều có "Điều kiện
 * mở: vào Cấp 5" (spec §2), nên không có mục nào bị khoá — chỉ `done` hoặc
 * `active`. Giữ nhánh `"locked"` trong kiểu để cùng khuôn với Cấp 1-4.
 */
export function taskStateCap5(no: number, progress: Cap5Progress | null | undefined): TaskState {
  const doneAt = progress ? TASK_DONE_AT[no](progress) : null
  return doneAt ? "done" : "active"
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
      data-testid={`cap5-task-${no}`}
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
 * Số en-US (§E). Mirror `cap4/JourneyPanelCap4.tsx#fmtCondValue`.
 */
function fmtCondValue(dieuKien: ThachThucDieuKienCap5, kind: CondKind): string {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (kind === "count") {
    return `${Math.round(now).toLocaleString("en-US")}/${Math.round(target).toLocaleString("en-US")}`
  }
  return `${Math.round(now)}% / ${Math.round(target)}%`
}

/** % chiều rộng thanh tiến độ — kẹp 0..100. */
function progressPct(dieuKien: ThachThucDieuKienCap5): number {
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
  dieuKien: ThachThucDieuKienCap5
  kind: CondKind
}) {
  return (
    <div
      className="cap5-thachthuc-cond"
      data-testid={testId}
      data-dat={dieuKien.dat ? "true" : "false"}
    >
      <div className="cap5-thachthuc-row">
        <span className="cap5-thachthuc-ic">{dieuKien.dat ? "✅" : "🔲"}</span>
        <span className="cap5-thachthuc-label">{dieuKien.ten}</span>
        <span className="cap5-thachthuc-value">{fmtCondValue(dieuKien, kind)}</span>
      </div>
      <div className="cap5-thachthuc-bar">
        <i style={{ width: `${progressPct(dieuKien)}%` }} />
      </div>
      {/* §C12c — mỗi chỉ số kèm ĐÚNG câu giải thích của backend (nguồn gốc con
          số), không phải một câu FE tự viết. */}
      <p className="cap5-thachthuc-giaithich">{dieuKien.giai_thich}</p>
    </div>
  )
}

/**
 * Widget "Thách thức Lão luyện" = nhiệm vụ ③ (spec §2③). Hiện CẢ 3 điều kiện
 * cùng lúc kèm giá trị hiện tại vs mục tiêu và giải thích riêng của từng điều
 * kiện (§C12c) — dữ liệu do `GET /cap5/thach-thuc` tính, FE chỉ trình bày.
 */
function ThachThucWidget({ data }: { data: ThachThucCap5 | undefined }) {
  return (
    <div className="cap5-thachthuc" data-testid="cap5-thachthuc">
      <div className="cap5-thachthuc-title">{`🎯 ③ ${TASK_NAMES[3]}`}</div>
      {data ? (
        <>
          <ThachThucCond
            testId="cap5-thachthuc-so_lenh_phan_loai"
            dieuKien={data.so_lenh_phan_loai}
            kind="count"
          />
          <ThachThucCond
            testId="cap5-thachthuc-so_lan_dung_ngoai_da_cham"
            dieuKien={data.so_lan_dung_ngoai_da_cham}
            kind="count"
          />
          <ThachThucCond
            testId="cap5-thachthuc-ty_le_quyet_dinh_dung"
            dieuKien={data.ty_le_quyet_dinh_dung}
            kind="score"
          />
        </>
      ) : (
        <div className="cap5-thachthuc-loading">Đang tính 3 điều kiện của bạn…</div>
      )}
      {/* Vì sao khắt khe + KHÔNG thưởng số lượng đứng ngoài — spec §2③ + §5 dòng cuối. */}
      <p className="cap5-thachthuc-why">
        Đạt <strong>CẢ 3 điều kiện</strong> cùng lúc mới xong nhiệm vụ này. Lưu ý: đứng ngoài{" "}
        <strong>không</strong> phải càng nhiều càng tốt — mốc 5 lần là đủ, ghi thêm không được
        thưởng thêm.
      </p>
    </div>
  )
}

/**
 * Widget nổi bật "Tỷ lệ quyết định đúng" (spec §7 mục 2 + §2 "Hiển thị con số
 * kèm giải thích §C12c").
 *
 * ★ KHÔNG BAO GIỜ hiện con số trơ. Hiện đủ 3 tầng:
 *  1. `%` từ `cap5_progress.ty_le_quyet_dinh_dung` (server chốt);
 *  2. số lệnh nó được tính trên (`so_lenh_phan_loai`, cũng của server) + CHÍNH
 *     câu `giai_thich` của `GET /cap5/thach-thuc` — câu đó chứa `đúng/tổng`
 *     thật, nên FE KHÔNG phải nhân `% × tổng` rồi làm tròn (một con số thứ hai,
 *     có thể lệch, là cách nhanh nhất để 2 màn nói khác nhau);
 *  3. câu nói rõ đây là thước đo QUY TRÌNH, không phải tỷ lệ thắng.
 *
 * Khi chưa có lệnh nào được phân loại thì nói thẳng, KHÔNG in "0%" (0% ngụ ý
 * "mọi quyết định của bạn đều sai" — vu oan).
 */
function TyLeWidget({
  progress,
  thachThuc,
}: {
  progress: Cap5Progress | null | undefined
  thachThuc: ThachThucCap5 | undefined
}) {
  const soLenh = progress?.so_lenh_phan_loai ?? 0
  const tyLe = progress?.ty_le_quyet_dinh_dung ?? 0
  const giaiThich = thachThuc?.ty_le_quyet_dinh_dung.giai_thich ?? null

  return (
    <div className="cap5-tyle" data-testid="cap5-journey-tyle">
      <div className="cap5-tyle-title">Tỷ lệ quyết định đúng</div>
      {soLenh > 0 ? (
        <>
          <div className="cap5-tyle-value" data-testid="cap5-journey-tyle-value">
            {`${Math.round(tyLe)}%`}
          </div>
          <div className="cap5-tyle-counts" data-testid="cap5-journey-tyle-counts">
            {`${Math.round(soLenh).toLocaleString("en-US")} lệnh đã phân loại 4 ô`}
          </div>
          {giaiThich && (
            <p className="cap5-tyle-giaithich" data-testid="cap5-journey-tyle-giaithich">
              {giaiThich}
            </p>
          )}
        </>
      ) : (
        <p className="cap5-tyle-empty" data-testid="cap5-journey-tyle-empty">
          Chưa có lệnh nào được phân loại 4 ô — con số này xuất hiện ngay sau lệnh đầu bạn kết sổ ở
          Cấp 5.
        </p>
      )}
      <p className="cap5-tyle-why">
        Đây là thước đo <strong>quy trình</strong>, <strong>không phải tỷ lệ thắng</strong>: một
        lệnh THUA vẫn là quyết định đúng nếu bạn có cơ sở lúc đặt, tôn trọng cắt lỗ/chốt lời và mua
        đúng khối lượng — và một lệnh THẮNG vẫn là quyết định sai nếu bạn phá kế hoạch của chính
        mình.
      </p>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 5 — panel đầu của sidebar-phải khi đang ở Cấp 5 (spec
 * §7). Mirror `cap4/JourneyPanelCap4.tsx`: thẻ cấp + widget nổi bật + checklist
 * header + danh sách nhiệm vụ + hộp mục tiêu, ĐỔI phần giữa thành widget "Tỷ lệ
 * quyết định đúng" (spec §7 mục 2) + widget "Thách thức Lão luyện" (nhiệm vụ ③).
 * KHÔNG có Tủ huân chương (spec §9 — không cấp nào có).
 *
 * Self-contained: gọi `useCap5Progress`/`useThachThucCap5` với `isCap5Active` nên
 * KHÔNG query gì khi ở ngoài `Cap5Provider` (`SidebarProvider` là singleton
 * app-root, dùng chung với /bieu-do & /co-phieu — cùng lý do đã ghi ở
 * `JourneyPanelCap4`).
 */
export function JourneyPanelCap5() {
  const { isCap5Active } = useCap5Events()
  const { data: progress } = useCap5Progress(isCap5Active)
  const { data: thachThuc } = useThachThucCap5(isCap5Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap5TasksDone(progress)
  const level = LEVELS[5]

  const openPortfolioAnalysis = () => setActivePanel("cap5-analysis")
  const goToTrading = () => setActivePanel("trading")

  // §C12c — chip bài học kèm con số thật (số nước đứng ngoài đã chấm), không
  // phải một khẩu hiệu trơ.
  const chipText = progress
    ? `● Tách quyết định khỏi kết quả · ${Math.round(
        progress.so_lan_dung_ngoai_da_cham,
      ).toLocaleString("en-US")} nước đứng ngoài đã chấm`
    : "● Tách quyết định khỏi kết quả"

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
            <div className="cap0-level-card-tag">CẤP 5</div>
            <div className="cap0-level-card-name cap0-display">LÃO LUYỆN</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap5-journey-tag" data-testid="cap5-journey-tag">
              {chipText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        {/* Widget nổi bật — spec §7 đặt NGAY dưới thẻ cấp, trên checklist. */}
        <div className="mt-3">
          <TyLeWidget progress={progress} thachThuc={thachThuc} />
        </div>

        <div className="cap0-journey-checklist-header">TRƯỚC KHI LÊN CẤP 6 · {tasksDone}/3</div>

        <ChecklistItem
          no={1}
          state={taskStateCap5(1, progress)}
          progressText={progress?.task_1_done_at ? undefined : TASK_1_COPY}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={2}
          state={taskStateCap5(2, progress)}
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

        <div className="cap0-journey-goal" data-testid="cap5-journey-goal">
          Xong 3/3 → tốt nghiệp Cấp 5 «Lão luyện» — <strong>hết mạch nền tảng</strong> (Nhập môn →
          Lão luyện). Tiếp theo: <strong>Cấp 6 «Đối chiếu»</strong> — tin lớp nào khi các lớp nói
          ngược nhau.
        </div>
      </div>
    </div>
  )
}
