import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { HuyHieuRailCap8 } from "./HuyHieuRailCap8"
import { useCap8Events } from "./Cap8Context"
import { useCap8Progress, useThachThucCap8 } from "./hooks"
import { caveatThieuCatLoCap8 } from "./portfolioAnalysisCap8"
import {
  countCap8TasksDone,
  type Cap8Progress,
  type DanhMucCap8,
  type ThachThucCap8,
  type ThachThucDieuKienCap8,
} from "./types"
import "./cap8-journey.css"

/** 3 nhiệm vụ Cấp 8 — tên VERBATIM theo header spec §2. */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu qua Kiểm tra danh mục",
  2: "Kết sổ đầu Cấp 8",
  3: "Thách thức Quản trị rủi ro danh mục",
}

/** Copy nhiệm vụ ① khi active — theo "Yêu cầu" spec §2①. */
const TASK_1_COPY =
  "Mở panel mua: ngay trước khi xác nhận MUA, khối «Kiểm tra danh mục» hiện 3 thước đo — dồn ngành sau lệnh, tương quan với các mã bạn đang giữ, và tổng vốn ở rủi ro so với trần khẩu vị. Xem xong thì mua 1 lệnh. Cảnh báo là MỀM: «Vẫn mua» luôn là một lựa chọn hợp lệ, và bước này KHÔNG bao giờ chặn nút MUA."

/** Copy nhiệm vụ ② khi active — theo "Yêu cầu" spec §2②. */
const TASK_2_COPY =
  "Bán 1 lệnh → đóng Kết sổ Cấp 8: khối «Kiểm tra danh mục — nhìn lại» đặt cảnh báo lúc mua cạnh cách bạn xử lý và kết quả thật của lệnh."

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC = '"Rủi ro không nằm ở một lệnh — mà ở cả danh mục."'

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap8Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
}

/**
 * State của 1 nhiệm vụ trong checklist. Như Cấp 5/6/7: cả ① và ② đều mở ngay khi
 * vào Cấp 8, nên không mục nào bị khoá — chỉ `done` hoặc `active`. Giữ nhánh
 * `"locked"` trong kiểu để cùng khuôn với Cấp 1-7.
 */
export function taskStateCap8(no: number, progress: Cap8Progress | null | undefined): TaskState {
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
      data-testid={`cap8-task-${no}`}
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

/** `46.4` → `"46%"` — số en-US, không phần thập phân (§E). */
function fmtPct0(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")}%`
}

/** Kiểu hiển thị giá trị của 1 điều kiện — quyết định cách format "đang / mục tiêu". */
type CondKind = "count" | "pct"

/**
 * "Đang / mục tiêu" của 1 điều kiện — LUÔN hiện cả giá trị hiện tại VÀ mốc cần
 * đạt (§C12c). Số en-US (§E). Mirror `cap7/JourneyPanelCap7.tsx#fmtCondValue`.
 *
 * ★★ `pct` (điều kiện ③ — ngành lớn nhất so ngưỡng 40%) khi `du_du_lieu === false`
 * trả "chưa tính được" chứ KHÔNG phải "0%/40%": backend gửi `gia_tri_hien_tai: 0`
 * theo mặc định khi chưa định giá được danh mục, và in con số đó ra là nói với
 * người dùng rằng danh mục của họ hoàn toàn không dồn ngành — trong khi thật ra
 * chưa có phép đo nào chạy. Đây đúng là điều Cấp 8 dạy: chưa biết ≠ bằng 0.
 */
function fmtCondValue(dieuKien: ThachThucDieuKienCap8, kind: CondKind): string {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (kind === "count") {
    return `${fmtInt(now)}/${fmtInt(target)}`
  }
  if (!dieuKien.du_du_lieu) return "chưa tính được"
  return `${Math.round(now)}%/${Math.round(target)}%`
}

/** % chiều rộng thanh tiến độ — kẹp 0..100. */
function progressPct(dieuKien: ThachThucDieuKienCap8): number {
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
  dieuKien: ThachThucDieuKienCap8
  kind: CondKind
  /** Dòng "còn thiếu" / caveat riêng của điều kiện, khi có. */
  ghiChu?: string
}) {
  const chuaDuDuLieu = !dieuKien.du_du_lieu
  return (
    <div
      className="cap8-thachthuc-cond"
      data-testid={testId}
      data-dat={dieuKien.dat ? "true" : "false"}
      data-du-du-lieu={dieuKien.du_du_lieu ? "true" : "false"}
    >
      <div className="cap8-thachthuc-row">
        {/* ⏳ = chưa tính được (thiếu dữ liệu), KHÔNG phải ❌ của người dùng. */}
        <span className="cap8-thachthuc-ic">
          {dieuKien.dat ? "✅" : chuaDuDuLieu ? "⏳" : "🔲"}
        </span>
        <span className="cap8-thachthuc-label">{dieuKien.ten}</span>
        <span className="cap8-thachthuc-value" data-testid={`${testId}-value`}>
          {fmtCondValue(dieuKien, kind)}
        </span>
      </div>
      {!chuaDuDuLieu && (
        <div className="cap8-thachthuc-bar">
          <i style={{ width: `${progressPct(dieuKien)}%` }} />
        </div>
      )}
      {/* §C12c — ĐÚNG câu giải thích của backend (nguồn gốc con số), nguyên văn. */}
      <p className="cap8-thachthuc-giaithich">{dieuKien.giai_thich}</p>
      {ghiChu && <p className="cap8-thachthuc-conu">{ghiChu}</p>}
    </div>
  )
}

/**
 * Widget "Thách thức Quản trị rủi ro danh mục" = nhiệm vụ ③ (spec §2③). Hiện CẢ 3
 * điều kiện cùng lúc kèm giá trị hiện tại vs mục tiêu và giải thích riêng của
 * từng điều kiện (§C12c) — dữ liệu do `GET /cap8/thach-thuc` tính, FE chỉ trình
 * bày và KHÔNG tự khai một ngưỡng nào.
 */
function ThachThucWidget({ data }: { data: ThachThucCap8 | undefined }) {
  return (
    <div className="cap8-thachthuc" data-testid="cap8-thachthuc">
      <div className="cap8-thachthuc-title">{`🎯 ③ ${TASK_NAMES[3]}`}</div>
      {data ? (
        <>
          <ThachThucCond
            testId="cap8-thachthuc-so_lenh_kiem_tra"
            dieuKien={data.so_lenh_kiem_tra}
            kind="count"
          />
          <ThachThucCond
            testId="cap8-thachthuc-mua_bat_chap"
            dieuKien={data.mua_bat_chap}
            kind="count"
          />
          <ThachThucCond
            testId="cap8-thachthuc-danh_muc_an_toan"
            dieuKien={data.danh_muc_an_toan}
            kind="pct"
            // ★ Caveat đi kèm ĐIỀU KIỆN, không chỉ đi kèm widget: điều kiện ③ nói
            // "danh mục trong ngưỡng", và một danh mục có vị thế chưa đặt cắt lỗ
            // thì phần rủi ro đó CHƯA BIẾT — không được lặng lẽ tính là 0.
            ghiChu={data.danh_muc?.caveat || undefined}
          />
        </>
      ) : (
        <div className="cap8-thachthuc-loading">Đang tính 3 điều kiện của bạn…</div>
      )}
      <p className="cap8-thachthuc-why">
        Đạt <strong>CẢ 3 điều kiện</strong> cùng lúc mới xong nhiệm vụ này. Điều kiện thứ hai dùng{" "}
        <strong>cửa sổ trượt 15 lệnh gần nhất</strong> — một giai đoạn cũ không theo bạn mãi, và
        «Vẫn mua» không bị phạt: nó chỉ được đếm ở đúng ô kỷ luật đó.
      </p>
    </div>
  )
}

/**
 * Widget nổi bật "Danh mục hiện tại" (spec §3 header `3/3 · danh mục phân tán ·
 * tổng rủi ro {X}%`).
 *
 * ★★ KHÔNG BAO GIỜ hiện `0%` cho một phép đo chưa chạy. `tong_rui_ro_pct` là
 * `number | null`, và `null` = CHƯA TÍNH ĐƯỢC — `?? 0` ở đây sẽ nói với người
 * dùng rằng danh mục của họ hoàn toàn an toàn trong khi thật ra chưa có gì được
 * tính. Cả `danh_muc === null` (chưa định giá được danh mục) cũng đi vào đúng
 * nhánh "chưa tính được" ấy.
 *
 * ★ Con số lấy từ `GET /cap8/thach-thuc` (không phải `cap8_progress`) vì chính
 * endpoint đó tính lại danh mục lúc đọc và mang theo `caveat` — `cap8_progress`
 * cố ý chỉ là ảnh chụp của lần kiểm tra gần nhất. Một nguồn duy nhất thì widget
 * này và widget Thách thức không thể nói khác nhau.
 */
function DanhMucWidget({ danhMuc }: { danhMuc: DanhMucCap8 | null | undefined }) {
  const tong = danhMuc?.tong_rui_ro_pct ?? null
  const tran = danhMuc?.tran_khau_vi_pct ?? null
  const donNganh = danhMuc?.don_nganh_max ?? null
  const caveat = caveatThieuCatLoCap8(danhMuc)

  return (
    <div className="cap8-danhmuc-widget" data-testid="cap8-journey-danhmuc">
      <div className="cap8-danhmuc-title">Danh mục hiện tại</div>
      <div
        className={"cap8-danhmuc-value" + (tong == null ? " cap8-danhmuc-value--chua" : "")}
        data-testid="cap8-journey-danhmuc-value"
      >
        {tong == null ? "Tổng vốn ở rủi ro: chưa tính được" : fmtPct0(tong)}
      </div>
      <p className="cap8-danhmuc-line" data-testid="cap8-journey-danhmuc-tong">
        {tong == null
          ? "Chưa định giá được danh mục nên chưa tính được tổng vốn ở rủi ro — IQX để trống thay vì hiện 0%."
          : `Tổng vốn ở rủi ro ${fmtPct0(tong)} (nếu mọi cắt lỗ bị chạm)${
              tran == null
                ? " · bạn chưa đặt khẩu vị rủi ro ở Cấp 3 nên chưa có trần nào để đối chiếu."
                : ` · trần khẩu vị ${danhMuc?.khau_vi_ten ?? "đã chọn"}: ${fmtPct0(tran)}.`
            }`}
      </p>
      <p className="cap8-danhmuc-line" data-testid="cap8-journey-danhmuc-nganh">
        {donNganh == null
          ? "Ngành lớn nhất: chưa tính được."
          : `Ngành lớn nhất: ${donNganh.nganh} ${fmtPct0(donNganh.pct)}.`}
      </p>
      {/* ★ Ở ĐÂU HIỆN TỔNG RỦI RO, Ở ĐÓ CÓ CAVEAT — câu của server khi có, và
          `caveatThieuCatLoCap8` tự dựng khi server trả chuỗi RỖNG mà vẫn còn vị
          thế thiếu cắt lỗ. Dùng CHUNG hàm đó với khối ⑱ và màn tốt nghiệp: trước
          fix wave FE-2 widget này chỉ render chuỗi server, nên cùng một payload
          mà khối ⑱ cảnh báo còn tab Hành trình im lặng. */}
      {caveat ? (
        <p className="cap8-danhmuc-caveat" data-testid="cap8-journey-danhmuc-caveat">
          {caveat}
        </p>
      ) : null}
      <p className="cap8-danhmuc-why">
        Hai con số này <strong>không cùng một nghĩa</strong>: trần khẩu vị vốn là trần cho{" "}
        <strong>một lệnh</strong> (bạn đặt ở Cấp 3), còn tổng vốn ở rủi ro là phần vốn mất{" "}
        <strong>nếu mọi cắt lỗ bị chạm trên cả danh mục</strong>. Cấp 8 mượn lại chính con số đó
        làm mức trần cho cả danh mục.
      </p>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 8 — panel đầu của sidebar-phải khi đang ở Cấp 8, VÀ là
 * "hồ sơ hành trình" mà màn tốt nghiệp Cấp 8 mở ra (spec §3). Mirror
 * `cap7/JourneyPanelCap7.tsx`: thẻ cấp + widget nổi bật + checklist header +
 * danh sách nhiệm vụ + hộp mục tiêu, CỘNG **rail huy hiệu đầy đủ 0-8**, và ĐỔI
 * phần giữa thành widget "Danh mục hiện tại" + widget "Thách thức Quản trị rủi
 * ro danh mục" (nhiệm vụ ③). KHÔNG có Tủ huân chương (spec §9 — không cấp nào
 * có), KHÔNG confetti, KHÔNG huy chương nhiệm vụ.
 *
 * ★ ĐÂY LÀ CẤP CUỐI: hộp mục tiêu KHÔNG có nút vào cấp sau. Cấp 9+ chỉ là CHỮ
 * ("sẽ mở dần khi ra mắt") — không có gì bấm được, vì chưa có gì để bấm vào.
 *
 * Self-contained: gọi `useCap8Progress`/`useThachThucCap8` với `isCap8Active` nên
 * KHÔNG query gì khi ở ngoài `Cap8Provider` (`SidebarProvider` là singleton
 * app-root, dùng chung với /bieu-do & /co-phieu — cùng lý do đã ghi ở
 * `JourneyPanelCap7`).
 */
export function JourneyPanelCap8() {
  const { isCap8Active } = useCap8Events()
  const { data: progress } = useCap8Progress(isCap8Active)
  const { data: thachThuc } = useThachThucCap8(isCap8Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap8TasksDone(progress)
  const level = LEVELS[8]

  const openPortfolioAnalysis = () => setActivePanel("cap8-analysis")
  const goToTrading = () => setActivePanel("trading")

  // §C12c — chip bài học kèm con số THẬT (số lệnh đã qua Kiểm tra danh mục + số
  // lần bước đó thật sự bật cảnh báo), không phải một khẩu hiệu trơ.
  const chipText = progress
    ? `● Nhìn rủi ro ở tầm danh mục · ${fmtInt(progress.so_lenh_kiem_tra)} lệnh kiểm tra · ${fmtInt(
        progress.so_lan_co_canh_bao,
      )} lần có cảnh báo`
    : "● Nhìn rủi ro ở tầm danh mục"

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
            <div className="cap0-level-card-tag">CẤP 8</div>
            <div className="cap0-level-card-name cap0-display">QUẢN TRỊ RỦI RO DANH MỤC</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap8-journey-tag" data-testid="cap8-journey-tag">
              {chipText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        {/* Rail huy hiệu 0-8 — NGAY dưới thẻ cấp: đây là "hồ sơ hành trình" mà
            màn tốt nghiệp Cấp 8 dẫn tới, nên nó phải là thứ đập vào mắt đầu tiên. */}
        <div className="mt-3">
          <HuyHieuRailCap8 graduated={!!progress?.graduated_at} />
        </div>

        {/* Widget nổi bật — trên checklist (như Cấp 5/6/7). */}
        <DanhMucWidget danhMuc={thachThuc?.danh_muc} />

        <div className="cap0-journey-checklist-header">
          TRƯỚC KHI TỐT NGHIỆP CẤP 8 · {tasksDone}/3
        </div>

        <ChecklistItem
          no={1}
          state={taskStateCap8(1, progress)}
          progressText={progress?.task_1_done_at ? undefined : TASK_1_COPY}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={2}
          state={taskStateCap8(2, progress)}
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

        {/* ★ Hộp mục tiêu của CẤP CUỐI — KHÔNG nút, KHÔNG link, KHÔNG "vào Cấp 9". */}
        <div className="cap0-journey-goal" data-testid="cap8-journey-goal">
          Xong 3/3 → tốt nghiệp Cấp 8 «Quản trị rủi ro danh mục» và đi <strong>trọn mạch</strong>{" "}
          Nhập môn → đây. Đây là hết mạch kỹ năng nền tảng: các cấp theo chủ đề (Cấp 9+ — chu kỳ &
          xoay vòng ngành, định giá nâng cao…) <strong>sẽ mở dần khi ra mắt</strong>.
        </div>
      </div>
    </div>
  )
}
