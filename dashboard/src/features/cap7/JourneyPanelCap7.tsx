import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap7Events } from "./Cap7Context"
import { useCap7Progress, useThachThucCap7 } from "./hooks"
import { KHOI16_MIN_DA_CHAM } from "./portfolioAnalysisCap7"
import {
  countCap7TasksDone,
  type Cap7Progress,
  type ThachThucCap7,
  type ThachThucDieuKienCap7,
} from "./types"
import "./cap7-journey.css"

/** 3 nhiệm vụ Cấp 7 — tên VERBATIM theo header spec §2. */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu đọc sổ lệnh",
  2: "Kết sổ đầu Cấp 7",
  3: "Thách thức Đọc sổ lệnh",
}

/** Copy nhiệm vụ ① khi active — theo "Yêu cầu" spec §2①. */
const TASK_1_COPY =
  "Trong giờ giao dịch, mở panel mua: khối «Đọc sổ lệnh» hiện chỉ số Lực (tổng dư mua / tổng dư bán 3 mức) kèm câu vì sao — bạn tự đoán cầu mạnh / cân bằng / cầu yếu rồi mua 1 lệnh. Hệ không quyết thay, và đọc lực KHÔNG bao giờ chặn nút MUA."

/** Copy nhiệm vụ ② khi active — theo "Yêu cầu" spec §2②. */
const TASK_2_COPY =
  "Bán 1 lệnh → đóng Kết sổ Cấp 7: khối «Đọc sổ lệnh — nhìn lại» đặt lực bạn đọc lúc mua cạnh diễn biến giá ngay sau đó."

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC =
  '"Sổ lệnh cho thấy lực mua/bán ngay lúc này — nhưng lệnh treo chưa phải lệnh thật."'

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap7Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
}

/**
 * State của 1 nhiệm vụ trong checklist. Như Cấp 5/6: cả ① và ② đều mở ngay khi
 * vào Cấp 7, nên không mục nào bị khoá — chỉ `done` hoặc `active`. Giữ nhánh
 * `"locked"` trong kiểu để cùng khuôn với Cấp 1-6.
 */
export function taskStateCap7(no: number, progress: Cap7Progress | null | undefined): TaskState {
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
      data-testid={`cap7-task-${no}`}
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
 * "Còn thiếu gì" của tỷ lệ đọc lực đúng — dùng CHUNG cho widget nổi bật và cho
 * điều kiện ③ khi `du_du_lieu === false`. §C12c: nói THẲNG cần thêm bao nhiêu
 * lệnh ĐÃ CHẤM, và nói rõ lệnh chưa tới hạn KHÔNG bị tính là đọc sai.
 *
 * ★★ **KHÔNG BAO GIỜ IN MỘT PHÂN SỐ MÂU THUẪN VỚI SERVER.**
 * `KHOI16_MIN_DA_CHAM` là bản mirror bằng tay của `MIN_DA_CHAM_THONG_KE` phía
 * server, và server KHÔNG công bố con số đó trên wire — nó chỉ công bố cờ
 * `du_du_lieu`. Cái CỔNG của khối ⑯ an toàn vì nó AND với cờ ấy, nhưng câu chữ
 * thì không: ngày server nâng ngưỡng lên 5, một user có 4 lệnh đã chấm sẽ đọc
 * thấy "4/3 lệnh đọc lực đã chấm" — một phân số ĐÃ ĐẠT — ngay cạnh một widget
 * nói "chưa đủ dữ liệu".
 *
 * Nên mẫu số CHỈ được in khi nó còn nhất quán với câu trả lời của server (tức là
 * số đã chấm thật sự còn dưới hằng số FE). Vượt qua nó mà server vẫn nói chưa đủ
 * thì hằng số FE đã lỗi thời — câu chữ bỏ mẫu số đi và dẫn theo cờ của server,
 * bên DUY NHẤT biết ngưỡng thật.
 */
function conThieuChamText(data: ThachThucCap7): string {
  const daCham = fmtInt(data.so_lenh_da_cham)
  const nguongConDung = data.so_lenh_da_cham < KHOI16_MIN_DA_CHAM
  const phan = nguongConDung
    ? `${daCham}/${fmtInt(KHOI16_MIN_DA_CHAM)} lệnh đọc lực đã chấm`
    : `${daCham} lệnh đọc lực đã chấm — hệ thống chưa chốt được tỷ lệ`
  if (data.so_lenh_chua_cham <= 0) return `${phan}.`
  return `${phan} · ${fmtInt(data.so_lenh_chua_cham)} lệnh chưa tới hạn chấm — chưa tới hạn KHÔNG phải là đọc sai.`
}

/**
 * Cụm "ngưỡng tối thiểu" dùng trong hai câu GIẢI THÍCH LUẬT của tab này.
 *
 * Cùng lý do với `conThieuChamText`: chỉ nêu đích danh `KHOI16_MIN_DA_CHAM` khi
 * nó còn khớp với câu trả lời của server. Nếu user đã vượt hằng số FE mà server
 * vẫn nói chưa đủ, một câu "cần ít nhất 3 lệnh đã chấm" đứng cạnh 4 lệnh đã chấm
 * là một lời SAI, và nó lại nằm ngay ở chỗ dùng để giải thích vì sao chưa có tỷ
 * lệ. `data` chưa có (đang tải) → dùng hằng số FE, vì lúc đó không có gì mâu
 * thuẫn để tránh.
 */
function nguongDaChamText(data: ThachThucCap7 | undefined): string {
  const drift = data != null && data.so_lenh_da_cham >= KHOI16_MIN_DA_CHAM && !data.ty_le_doc_luc_dung.du_du_lieu
  return drift
    ? "đủ số lệnh đọc lực đã chấm mà hệ thống yêu cầu"
    : `ít nhất ${fmtInt(KHOI16_MIN_DA_CHAM)} lệnh đọc lực đã được chấm`
}

/**
 * Dòng nhắc khi tỷ lệ ĐÃ xét được nhưng vẫn còn lệnh chưa chấm: mẫu số của tỷ lệ
 * chỉ gồm lệnh đã chấm, nên phải nói ra — nếu không, người dùng sẽ tưởng tỷ lệ
 * tính trên TẤT CẢ lệnh đọc lực và những lệnh treo kia đang bị tính là sai.
 */
function chuaChamNote(data: ThachThucCap7): string | undefined {
  if (data.so_lenh_chua_cham <= 0) return undefined
  return `${fmtInt(data.so_lenh_chua_cham)} lệnh chưa tới hạn chấm — không nằm trong mẫu số và không bị tính là đọc sai.`
}

/** Kiểu hiển thị giá trị của 1 điều kiện — quyết định cách format "đang / mục tiêu". */
type CondKind = "count" | "pct"

/**
 * "Đang / mục tiêu" của 1 điều kiện — LUÔN hiện cả giá trị hiện tại VÀ mốc cần
 * đạt (§C12c). Số en-US (§E). Mirror `cap6/JourneyPanelCap6.tsx#fmtCondValue`.
 *
 * ★ `pct` (điều kiện ③ tỷ lệ đọc lực đúng) khi CHƯA đủ lệnh đã chấm trả về "chưa
 * đủ dữ liệu" chứ KHÔNG phải "0%/55%": server gửi 0 khi chưa xét được, in ra sẽ
 * là một con số bịa — và tệ hơn, vu cho người dùng đọc sai sạch.
 */
function fmtCondValue(dieuKien: ThachThucDieuKienCap7, kind: CondKind): string {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (kind === "count") {
    return `${fmtInt(now)}/${fmtInt(target)}`
  }
  if (!dieuKien.du_du_lieu) return "chưa đủ dữ liệu"
  return `${Math.round(now)}%/${Math.round(target)}%`
}

/** % chiều rộng thanh tiến độ — kẹp 0..100. */
function progressPct(dieuKien: ThachThucDieuKienCap7): number {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (target <= 0) return dieuKien.dat ? 100 : 0
  return Math.max(0, Math.min(100, (now / target) * 100))
}

function ThachThucCond({
  testId,
  dieuKien,
  kind,
  ghiChu,
}: {
  testId: string
  dieuKien: ThachThucDieuKienCap7
  kind: CondKind
  /** Chỉ truyền cho điều kiện ③ — dòng "còn thiếu" / "chưa tới hạn chấm". */
  ghiChu?: string
}) {
  const chuaDuDuLieu = !dieuKien.du_du_lieu
  return (
    <div
      className="cap7-thachthuc-cond"
      data-testid={testId}
      data-dat={dieuKien.dat ? "true" : "false"}
      data-du-du-lieu={dieuKien.du_du_lieu ? "true" : "false"}
    >
      <div className="cap7-thachthuc-row">
        {/* ⏳ = chưa xét được (thiếu dữ liệu), KHÔNG phải ❌ của người dùng. */}
        <span className="cap7-thachthuc-ic">
          {dieuKien.dat ? "✅" : chuaDuDuLieu ? "⏳" : "🔲"}
        </span>
        <span className="cap7-thachthuc-label">{dieuKien.ten}</span>
        <span className="cap7-thachthuc-value">{fmtCondValue(dieuKien, kind)}</span>
      </div>
      {!chuaDuDuLieu && (
        <div className="cap7-thachthuc-bar">
          <i style={{ width: `${progressPct(dieuKien)}%` }} />
        </div>
      )}
      {/* §C12c — ĐÚNG câu giải thích của backend (nguồn gốc con số), nguyên văn. */}
      <p className="cap7-thachthuc-giaithich">{dieuKien.giai_thich}</p>
      {ghiChu && <p className="cap7-thachthuc-conu">{ghiChu}</p>}
    </div>
  )
}

/**
 * Widget "Thách thức Đọc sổ lệnh" = nhiệm vụ ③ (spec §2③). Hiện CẢ 3 điều kiện
 * cùng lúc kèm giá trị hiện tại vs mục tiêu và giải thích riêng của từng điều
 * kiện (§C12c) — dữ liệu do `GET /cap7/thach-thuc` tính, FE chỉ trình bày.
 */
function ThachThucWidget({ data }: { data: ThachThucCap7 | undefined }) {
  return (
    <div className="cap7-thachthuc" data-testid="cap7-thachthuc">
      <div className="cap7-thachthuc-title">{`🎯 ③ ${TASK_NAMES[3]}`}</div>
      {data ? (
        <>
          <ThachThucCond
            testId="cap7-thachthuc-so_lenh_doc_luc"
            dieuKien={data.so_lenh_doc_luc}
            kind="count"
          />
          <ThachThucCond
            testId="cap7-thachthuc-so_lan_khong_duoi_theo_co"
            dieuKien={data.so_lan_khong_duoi_theo_co}
            kind="count"
          />
          <ThachThucCond
            testId="cap7-thachthuc-ty_le_doc_luc_dung"
            dieuKien={data.ty_le_doc_luc_dung}
            kind="pct"
            ghiChu={
              data.ty_le_doc_luc_dung.du_du_lieu ? chuaChamNote(data) : conThieuChamText(data)
            }
          />
        </>
      ) : (
        <div className="cap7-thachthuc-loading">Đang tính 3 điều kiện của bạn…</div>
      )}
      <p className="cap7-thachthuc-why">
        Đạt <strong>CẢ 3 điều kiện</strong> cùng lúc mới xong nhiệm vụ này. Điều kiện thứ ba chỉ
        được xét khi có <strong>{nguongDaChamText(data)}</strong> — dưới mức đó con số không nói
        được gì, nên IQX chỉ đếm. Lệnh chưa tới hạn chấm nằm ngoài mẫu số.
      </p>
    </div>
  )
}

/**
 * Widget nổi bật "Đọc lực đúng" (spec §3 header `3/3 · đọc lực đúng {X}%`).
 *
 * ★ KHÔNG BAO GIỜ hiện con số trơ, và KHÔNG BAO GIỜ hiện "0%": khi chưa có đủ
 * lệnh ĐÃ CHẤM, `ty_le_doc_luc_dung` của server là 0 theo mặc định — in ra sẽ vu
 * cho người dùng đọc sai sạch. Thay vào đó nói thẳng còn thiếu bao nhiêu lệnh đã
 * chấm, và bao nhiêu lệnh đang chờ tới hạn.
 *
 * ★ Con số lấy từ `GET /cap7/thach-thuc` (không phải `cap7_progress`) vì chính
 * endpoint đó mang theo cờ `du_du_lieu` + câu `giai_thich` đi kèm — dùng một
 * nguồn duy nhất thì widget này và widget Thách thức không thể nói khác nhau.
 */
function DocLucWidget({ thachThuc }: { thachThuc: ThachThucCap7 | undefined }) {
  const cond = thachThuc?.ty_le_doc_luc_dung
  const duDuLieu = Boolean(cond?.du_du_lieu)

  return (
    <div className="cap7-docluc-widget" data-testid="cap7-journey-docluc">
      <div className="cap7-docluc-title">Đọc lực đúng</div>
      {thachThuc && duDuLieu && cond ? (
        <div className="cap7-docluc-value" data-testid="cap7-journey-docluc-value">
          {`${Math.round(cond.gia_tri_hien_tai)}%`}
        </div>
      ) : (
        <p className="cap7-docluc-empty" data-testid="cap7-journey-docluc-empty">
          Chưa hiện tỷ lệ — cần {nguongDaChamText(thachThuc)}.
          {thachThuc && (
            <span className="cap7-docluc-conu">{` ${conThieuChamText(thachThuc)}`}</span>
          )}
        </p>
      )}
      {cond && (
        <p className="cap7-docluc-giaithich" data-testid="cap7-journey-docluc-giaithich">
          {cond.giai_thich}
        </p>
      )}
      <p className="cap7-docluc-why">
        Lực sổ lệnh chỉ đúng cho <strong>một thời điểm rất ngắn</strong> và đổi rất nhanh — nó giúp
        bạn chọn <strong>thời điểm</strong> vào lệnh, chứ không phải <strong>lý do mua</strong>. Lý
        do mua vẫn đến từ 5 lớp của Cấp 4-6.
      </p>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 7 — panel đầu của sidebar-phải khi đang ở Cấp 7. Mirror
 * `cap6/JourneyPanelCap6.tsx`: thẻ cấp + widget nổi bật + checklist header +
 * danh sách nhiệm vụ + hộp mục tiêu, ĐỔI phần giữa thành widget "Đọc lực đúng"
 * + widget "Thách thức Đọc sổ lệnh" (nhiệm vụ ③). KHÔNG có Tủ huân chương (spec
 * §9 — không cấp nào có).
 *
 * Self-contained: gọi `useCap7Progress`/`useThachThucCap7` với `isCap7Active` nên
 * KHÔNG query gì khi ở ngoài `Cap7Provider` (`SidebarProvider` là singleton
 * app-root, dùng chung với /bieu-do & /co-phieu — cùng lý do đã ghi ở
 * `JourneyPanelCap6`).
 */
export function JourneyPanelCap7() {
  const { isCap7Active } = useCap7Events()
  const { data: progress } = useCap7Progress(isCap7Active)
  const { data: thachThuc } = useThachThucCap7(isCap7Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap7TasksDone(progress)
  const level = LEVELS[7]

  const openPortfolioAnalysis = () => setActivePanel("cap7-analysis")
  const goToTrading = () => setActivePanel("trading")

  // §C12c — chip bài học kèm con số thật (số lệnh đã đọc lực + số lần chờ xác
  // nhận thay vì mua đuổi), không phải một khẩu hiệu trơ.
  const chipText = progress
    ? `● Đọc lực ngay lúc đặt · ${fmtInt(progress.so_lenh_doc_luc)} lệnh đọc lực · ${fmtInt(
        progress.so_lan_khong_duoi_theo_co,
      )} lần chờ xác nhận`
    : "● Đọc lực ngay lúc đặt"

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
            <div className="cap0-level-card-tag">CẤP 7</div>
            <div className="cap0-level-card-name cap0-display">ĐỌC SỔ LỆNH</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap7-journey-tag" data-testid="cap7-journey-tag">
              {chipText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        {/* Widget nổi bật — NGAY dưới thẻ cấp, trên checklist (như Cấp 5/6). */}
        <div className="mt-3">
          <DocLucWidget thachThuc={thachThuc} />
        </div>

        <div className="cap0-journey-checklist-header">TRƯỚC KHI LÊN CẤP 8 · {tasksDone}/3</div>

        <ChecklistItem
          no={1}
          state={taskStateCap7(1, progress)}
          progressText={progress?.task_1_done_at ? undefined : TASK_1_COPY}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={2}
          state={taskStateCap7(2, progress)}
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

        <div className="cap0-journey-goal" data-testid="cap7-journey-goal">
          Xong 3/3 → tốt nghiệp Cấp 7 «Đọc sổ lệnh». Tiếp theo:{" "}
          <strong>Cấp 8 «Quản trị rủi ro danh mục»</strong> — nhìn rủi ro ở tầm cả danh mục: phân
          bổ ngành, tương quan giữa các mã, tổng vốn đang ở rủi ro (sắp ra mắt).
        </div>
      </div>
    </div>
  )
}
