import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap6Events } from "./Cap6Context"
import { useCap6Progress, useThachThucCap6 } from "./hooks"
import {
  countCap6TasksDone,
  type Cap6Progress,
  type NhomDoiChieuCap6,
  type ThachThucCap6,
  type ThachThucDieuKienCap6,
} from "./types"
import "./cap6-journey.css"

/** 3 nhiệm vụ Cấp 6 — tên VERBATIM theo header spec §2. */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu có đối chiếu",
  2: "Kết sổ đầu Cấp 6",
  3: "Thách thức Đối chiếu",
}

/** Copy nhiệm vụ ① khi active — theo "Yêu cầu" spec §2①. */
const TASK_1_COPY =
  "Đặt 1 lệnh trên mã mà 5 lớp mâu thuẫn (≥1 lớp Ủng hộ VÀ ≥1 lớp Ngược chiều) → bước Đối chiếu tự hiện trong panel: chọn lớp bạn quyết định tin + ghi 1 dòng vì sao."

/** Copy nhiệm vụ ② khi active — theo "Yêu cầu" spec §2②. */
const TASK_2_COPY =
  "Bán 1 lệnh → đóng Kết sổ Cấp 6: khối «Đối chiếu — nhìn lại» đặt lớp bạn đã tin cạnh kết quả thật của lệnh."

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC = '"Khi các lớp nói ngược nhau, tin lớp nào — và điều đó tùy loại cổ phiếu."'

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap6Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
}

/**
 * State của 1 nhiệm vụ trong checklist. Như Cấp 5: cả ① và ② đều mở ngay khi
 * vào Cấp 6 (spec §2 "Điều kiện mở: vào Cấp 6"), nên không mục nào bị khoá —
 * chỉ `done` hoặc `active`. Giữ nhánh `"locked"` trong kiểu để cùng khuôn với
 * Cấp 1-5.
 */
export function taskStateCap6(no: number, progress: Cap6Progress | null | undefined): TaskState {
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
      data-testid={`cap6-task-${no}`}
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

/** `9` → `"9"` — số en-US, không phần thập phân (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/**
 * "Còn thiếu bao nhiêu" của 2 nhóm khớp/lệch — dùng CHUNG cho widget nổi bật và
 * cho điều kiện ③ khi `du_du_lieu === false`. §C12c: nói THẲNG cần thêm gì,
 * không phán "chưa đạt" cho một phép so chưa từng được thực hiện.
 */
function conThieuText(nhomKhop: NhomDoiChieuCap6, nhomLech: NhomDoiChieuCap6): string {
  const line = (n: NhomDoiChieuCap6) =>
    `${n.ten}: ${fmtInt(n.so_lenh)}/${fmtInt(n.so_lenh_toi_thieu)} lệnh đã đóng`
  return `${line(nhomKhop)} · ${line(nhomLech)}`
}

/** Kiểu hiển thị giá trị của 1 điều kiện — quyết định cách format "đang / mục tiêu". */
type CondKind = "count" | "compare"

/**
 * "Đang / mục tiêu" của 1 điều kiện — LUÔN hiện cả giá trị hiện tại VÀ mốc cần
 * đạt (§C12c). Số en-US (§E). Mirror `cap5/JourneyPanelCap5.tsx#fmtCondValue`.
 *
 * ★ `compare` (điều kiện ③ khớp-vs-lệch) khi CHƯA đủ dữ liệu trả về "chưa đủ dữ
 * liệu" chứ KHÔNG phải "0% vs 0%": server gửi 0/0 khi chưa xét được, in ra sẽ là
 * một con số bịa — và tệ hơn, ngụ ý người dùng thắng 0%.
 */
function fmtCondValue(dieuKien: ThachThucDieuKienCap6, kind: CondKind): string {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (kind === "count") {
    return `${fmtInt(now)}/${fmtInt(target)}`
  }
  if (!dieuKien.du_du_lieu) return "chưa đủ dữ liệu"
  return `${Math.round(now)}% vs ${Math.round(target)}%`
}

/** % chiều rộng thanh tiến độ — kẹp 0..100. */
function progressPct(dieuKien: ThachThucDieuKienCap6): number {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (target <= 0) return dieuKien.dat ? 100 : 0
  return Math.max(0, Math.min(100, (now / target) * 100))
}

function ThachThucCond({
  testId,
  dieuKien,
  kind,
  conThieu,
}: {
  testId: string
  dieuKien: ThachThucDieuKienCap6
  kind: CondKind
  /** Chỉ truyền cho điều kiện ③ — dòng "còn thiếu" khi chưa đủ dữ liệu. */
  conThieu?: string
}) {
  const chuaDuDuLieu = !dieuKien.du_du_lieu
  return (
    <div
      className="cap6-thachthuc-cond"
      data-testid={testId}
      data-dat={dieuKien.dat ? "true" : "false"}
      data-du-du-lieu={dieuKien.du_du_lieu ? "true" : "false"}
    >
      <div className="cap6-thachthuc-row">
        {/* ⏳ = chưa xét được (thiếu dữ liệu), KHÔNG phải ❌ của người dùng. */}
        <span className="cap6-thachthuc-ic">
          {dieuKien.dat ? "✅" : chuaDuDuLieu ? "⏳" : "🔲"}
        </span>
        <span className="cap6-thachthuc-label">{dieuKien.ten}</span>
        <span className="cap6-thachthuc-value">{fmtCondValue(dieuKien, kind)}</span>
      </div>
      {!chuaDuDuLieu && (
        <div className="cap6-thachthuc-bar">
          <i style={{ width: `${progressPct(dieuKien)}%` }} />
        </div>
      )}
      {/* §C12c — ĐÚNG câu giải thích của backend (nguồn gốc con số), nguyên văn. */}
      <p className="cap6-thachthuc-giaithich">{dieuKien.giai_thich}</p>
      {chuaDuDuLieu && conThieu && <p className="cap6-thachthuc-conu">{conThieu}</p>}
    </div>
  )
}

/**
 * Widget "Thách thức Đối chiếu" = nhiệm vụ ③ (spec §2③). Hiện CẢ 3 điều kiện
 * cùng lúc kèm giá trị hiện tại vs mục tiêu và giải thích riêng của từng điều
 * kiện (§C12c) — dữ liệu do `GET /cap6/thach-thuc` tính, FE chỉ trình bày.
 */
function ThachThucWidget({ data }: { data: ThachThucCap6 | undefined }) {
  return (
    <div className="cap6-thachthuc" data-testid="cap6-thachthuc">
      <div className="cap6-thachthuc-title">{`🎯 ③ ${TASK_NAMES[3]}`}</div>
      {data ? (
        <>
          <ThachThucCond
            testId="cap6-thachthuc-so_lenh_doi_chieu"
            dieuKien={data.so_lenh_doi_chieu}
            kind="count"
          />
          <ThachThucCond
            testId="cap6-thachthuc-so_kieu_da_gap"
            dieuKien={data.so_kieu_da_gap}
            kind="count"
          />
          <ThachThucCond
            testId="cap6-thachthuc-doi_chieu_giup_ich"
            dieuKien={data.doi_chieu_giup_ich}
            kind="compare"
            conThieu={conThieuText(data.nhom_khop, data.nhom_lech)}
          />
        </>
      ) : (
        <div className="cap6-thachthuc-loading">Đang tính 3 điều kiện của bạn…</div>
      )}
      <p className="cap6-thachthuc-why">
        Đạt <strong>CẢ 3 điều kiện</strong> cùng lúc mới xong nhiệm vụ này. Điều kiện thứ ba chỉ
        được xét khi <strong>mỗi nhóm có ≥ 3 lệnh đã đóng</strong> — dưới mức đó con số không nói
        được gì, nên IQX không so.
      </p>
    </div>
  )
}

/**
 * Widget nổi bật "Đối chiếu theo kiểu" (spec §8 mục 2 + §C12c).
 *
 * ★ KHÔNG BAO GIỜ hiện con số trơ, và KHÔNG BAO GIỜ hiện "0% vs 0%": khi một
 * trong hai nhóm chưa có đủ 3 lệnh đã đóng thì chưa có tỷ lệ nào để nói — in một
 * số 0 ra sẽ vu cho người dùng thua sạch. Thay vào đó nói thẳng còn thiếu bao
 * nhiêu lệnh mỗi nhóm. (Trên `cap6_progress`, cùng ý đó nay là một `null` tường
 * minh: `ty_le_thang_khop`/`_lech` là `number | null` kể từ backend `4b01918`, và
 * `0.0` ở đó là một KẾT QUẢ THẬT chứ không còn là giá trị mặc định.)
 *
 * ★ Hai con số lấy từ `GET /cap6/thach-thuc` (không phải `cap6_progress`) vì
 * chính endpoint đó mang theo cờ `du_du_lieu` + câu `giai_thich` đi kèm — dùng
 * một nguồn duy nhất thì widget này và widget Thách thức không thể nói khác nhau.
 */
function DoiChieuWidget({ thachThuc }: { thachThuc: ThachThucCap6 | undefined }) {
  const cond = thachThuc?.doi_chieu_giup_ich
  const duDuLieu = Boolean(cond?.du_du_lieu)

  return (
    <div className="cap6-doichieu-widget" data-testid="cap6-journey-doichieu">
      <div className="cap6-doichieu-title">Đối chiếu theo kiểu</div>
      {thachThuc && duDuLieu && cond ? (
        <div className="cap6-doichieu-value" data-testid="cap6-journey-doichieu-value">
          {`khớp ${Math.round(cond.gia_tri_hien_tai)}% vs lệch ${Math.round(cond.muc_tieu)}%`}
        </div>
      ) : (
        <p className="cap6-doichieu-empty" data-testid="cap6-journey-doichieu-empty">
          Chưa so sánh được hai nhóm — mỗi nhóm cần ít nhất 3 lệnh đã đóng.
          {thachThuc && (
            <span className="cap6-doichieu-conu">
              {` ${conThieuText(thachThuc.nhom_khop, thachThuc.nhom_lech)}`}
            </span>
          )}
        </p>
      )}
      {cond && (
        <p className="cap6-doichieu-giaithich" data-testid="cap6-journey-doichieu-giaithich">
          {cond.giai_thich}
        </p>
      )}
      <p className="cap6-doichieu-why">
        Đây là phép so <strong>hai nhóm lệnh của chính bạn</strong>: nhóm tin đúng lớp IQX gợi ý
        ưu tiên cho kiểu cổ phiếu đó, và nhóm tin lớp khác. Chọn lớp khác gợi ý là một sự thật{" "}
        <strong>trung tính</strong> — chỉ là nhóm thứ hai để đối chứng, và trọng tài cuối cùng là
        kết quả thật.
      </p>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 6 — panel đầu của sidebar-phải khi đang ở Cấp 6 (spec
 * §8). Mirror `cap5/JourneyPanelCap5.tsx`: thẻ cấp + widget nổi bật + checklist
 * header + danh sách nhiệm vụ + hộp mục tiêu, ĐỔI phần giữa thành widget "Đối
 * chiếu theo kiểu" (spec §8 mục 2) + widget "Thách thức Đối chiếu" (nhiệm vụ ③).
 * KHÔNG có Tủ huân chương (spec §10 — không cấp nào có).
 *
 * Self-contained: gọi `useCap6Progress`/`useThachThucCap6` với `isCap6Active` nên
 * KHÔNG query gì khi ở ngoài `Cap6Provider` (`SidebarProvider` là singleton
 * app-root, dùng chung với /bieu-do & /co-phieu — cùng lý do đã ghi ở
 * `JourneyPanelCap5`).
 */
export function JourneyPanelCap6() {
  const { isCap6Active } = useCap6Events()
  const { data: progress } = useCap6Progress(isCap6Active)
  const { data: thachThuc } = useThachThucCap6(isCap6Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap6TasksDone(progress)
  const level = LEVELS[6]

  const openPortfolioAnalysis = () => setActivePanel("cap6-analysis")
  const goToTrading = () => setActivePanel("trading")

  // §C12c — chip bài học kèm con số thật (số lệnh đã đối chiếu + số kiểu đã
  // gặp), không phải một khẩu hiệu trơ.
  const chipText = progress
    ? `● Tin lớp nào khi các lớp trái nhau · ${fmtInt(progress.so_lenh_doi_chieu)} lệnh · ${fmtInt(
        progress.so_kieu_da_gap,
      )} kiểu`
    : "● Tin lớp nào khi các lớp trái nhau"

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
            <div className="cap0-level-card-tag">CẤP 6</div>
            <div className="cap0-level-card-name cap0-display">ĐỐI CHIẾU</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap6-journey-tag" data-testid="cap6-journey-tag">
              {chipText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        {/* Widget nổi bật — spec §8 đặt NGAY dưới thẻ cấp, trên checklist. */}
        <div className="mt-3">
          <DoiChieuWidget thachThuc={thachThuc} />
        </div>

        <div className="cap0-journey-checklist-header">TRƯỚC KHI LÊN CẤP 7 · {tasksDone}/3</div>

        <ChecklistItem
          no={1}
          state={taskStateCap6(1, progress)}
          progressText={progress?.task_1_done_at ? undefined : TASK_1_COPY}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={2}
          state={taskStateCap6(2, progress)}
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

        <div className="cap0-journey-goal" data-testid="cap6-journey-goal">
          Xong 3/3 → tốt nghiệp Cấp 6 «Đối chiếu». Tiếp theo:{" "}
          <strong>Cấp 7 «Đọc sổ lệnh»</strong> — đọc lực mua/bán ngay trong phiên (sắp ra mắt).
        </div>
      </div>
    </div>
  )
}
