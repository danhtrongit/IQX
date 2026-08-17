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
import { JourneyFocus } from "@/features/cap0/JourneyFocus"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó).
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
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

/**
 * Mô tả hiện trên ô "NHIỆM VỤ ĐANG LÀM" (`JourneyFocus`) — cùng quy ước Cấp
 * 0/1/2. ①② dùng lại đúng copy spec §2 ở trên; ③ nói đúng điều kiện của chính
 * nó (3 con số chi tiết đã nằm ngay dưới, trong widget Thách thức).
 */
const TASK_DESCRIPTIONS: Record<number, string> = {
  1: TASK_1_COPY,
  2: TASK_2_COPY,
  3: "Đạt CẢ 3 điều kiện cùng lúc — lãi ≥ +5% trên vốn, đủ 15 lệnh Thực chiến, điểm kỷ luật ≥ 80%. Ba thanh tiến độ ngay dưới cho biết bạn đang thiếu bao nhiêu ở từng điều kiện.",
}

const TASK_NOS = [1, 2, 3] as const
const NUMERALS = "①②③"
const CAP3_TOTAL_TASKS = 3

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

/**
 * Một dòng checklist THU GỌN (mirrors `cap1`/`cap2`) — mô tả dài + nút to đã
 * dọn lên ô tập trung `JourneyFocus`, dòng ở đây chỉ giữ tên + trạng thái.
 *
 * ★ Nhiệm vụ ĐANG MỞ nhưng chưa tới lượt tập trung vẫn phải bấm được (①③ mở
 * cùng lúc ngay khi vào Cấp 3) — cùng lối tắt "Làm ngay →" mờ mà Cấp 1/2 dùng.
 * Riêng ③ KHÔNG có lối tắt: nó không phải một việc bấm-là-làm mà là kết quả
 * cộng dồn của những lệnh tiếp theo, và widget 3 điều kiện của nó nằm ngay dưới.
 */
function ChecklistItem({
  no,
  state,
  focused,
  progressText,
  onGo,
}: {
  no: number
  state: TaskState
  focused: boolean
  progressText?: string
  onGo: () => void
}) {
  return (
    <div
      data-testid={`cap3-task-${no}`}
      className={
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        (state === "active" ? " cap0-checklist-item--active" : "") +
        (state === "locked" ? " cap0-checklist-item--locked" : "")
      }
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : NUMERALS[no - 1]}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {progressText && <div className="cap0-checklist-desc">{progressText}</div>}
      </div>
      {state === "active" && !focused && no !== 3 && (
        <button
          type="button"
          className="cap0-checklist-golink cap0-checklist-golink--quiet"
          onClick={onGo}
        >
          Làm ngay →
        </button>
      )}
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
 *
 * ★★ `gia_tri_hien_tai == null` = **CHƯA BIẾT**, hiện "—" chứ KHÔNG hiện 0.
 * Đây đúng cách `cap2/DiemKyLuat.tsx` từ chối in 0 khi `diem == null`: thẻ
 * «Điểm kỷ luật» ngay trên widget này nói "chưa có dữ liệu", nên widget không
 * được chấm 0 điểm cho cùng chỉ số đó trên cùng màn hình.
 */
function fmtCondValue(dieuKien: ThachThucDieuKienCap3, kind: CondKind): string {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (kind === "pct") {
    return `${now == null ? "—" : fmtPctSigned(now)} / ${fmtPctSigned(target)}`
  }
  if (kind === "count") {
    return `${now == null ? "—" : Math.round(now).toLocaleString("en-US")}/${Math.round(
      target,
    ).toLocaleString("en-US")}`
  }
  return `${now == null ? "—" : `${Math.round(now)}%`} / ${Math.round(target)}%`
}

/** % chiều rộng thanh tiến độ — kẹp 0..100, lỗ (âm) = 0, chưa biết = 0. */
function progressPct(dieuKien: ThachThucDieuKienCap3): number {
  const { gia_tri_hien_tai: now, muc_tieu: target } = dieuKien
  if (now == null) return 0
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
 * cấp + ô "NHIỆM VỤ ĐANG LÀM" + checklist thu gọn + hộp mục tiêu, THÊM widget
 * Thách thức Bản lĩnh (nhiệm vụ ③, spec §2③) và khẩu vị rủi ro đang dùng trên
 * thẻ cấp. KHÔNG có Tủ huân chương (spec §11 — không cấp nào có).
 *
 * ★ **Ô tập trung dùng chung `cap0/JourneyFocus.tsx`** như Cấp 0/1/2: đúng MỘT
 * nhiệm vụ được nâng lên kèm mô tả + tiến độ + "Làm ngay →", checklist đầy đủ
 * vẫn ở dưới nhưng thu gọn. Trước đây Cấp 3 là cấp DUY NHẤT còn dựng checklist
 * phẳng riêng (mỗi dòng một nút "Làm ngay") — lệch quy ước của 3 cấp còn lại.
 *
 * ★ **Vì sao Cấp 3 GIỮ `DiemKyLuatCard` trong khi Cấp 2 vừa gỡ nó khỏi Hành
 * trình của mình:** ở Cấp 2 điểm kỷ luật không còn là nhiệm vụ nào cả, còn ở
 * Cấp 3 nó là 1 trong 3 điều kiện tốt nghiệp (`GET /cap3/thach-thuc` đọc chính
 * nó — spec §2③/§9). Thẻ này là chỗ duy nhất cho biết điểm HÔM NAY đến từ đâu.
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

  const states: Record<number, TaskState> = Object.fromEntries(
    TASK_NOS.map((no) => [no, taskStateCap3(no, progress)]),
  ) as Record<number, TaskState>
  /**
   * Nhiệm vụ được đưa lên ô tập trung = nhiệm vụ `active` có số nhỏ nhất. ① và
   * ③ cùng mở từ lúc vào cấp, nên đây là thứ tự ƯU TIÊN chứ không phải điều
   * kiện mở khoá (② mới thật sự bị khoá tới khi xong ①). `null` = xong cả 3 →
   * ô đổi sang lời sẵn sàng tốt nghiệp thay vì biến mất.
   */
  const focus = TASK_NOS.find((no) => states[no] === "active") ?? null
  /**
   * ★★ ĐÃ TỐT NGHIỆP — trạng thái khác hẳn "sẵn sàng tốt nghiệp".
   *
   * `GraduationModalCap3` chỉ mở khi CHƯA có `graduated_at` (xem
   * `isGraduationReadyCap3`), và khi Cấp 3 đang là TRẦN thì `DauTruongPage`
   * giữ người đã tốt nghiệp Ở LẠI shell Cấp 3 vĩnh viễn. Nên nếu ô này vẫn nói
   * "Sẵn sàng tốt nghiệp … màn tốt nghiệp mở ra ngay tại đây", nó hứa một thứ
   * không bao giờ mở lại, và không chỗ nào trên màn hình nói họ ĐÃ xong.
   */
  const graduated = progress?.graduated_at != null
  /** Tiến độ ③ — một nguồn duy nhất cho cả ô tập trung lẫn dòng checklist.
   *  Số lệnh luôn đếm được (0 là 0 thật), nhưng kiểu chung cho phép `null` —
   *  giữ đúng quy ước "chưa biết thì im lặng". */
  const soLenhHienTai = thachThuc?.so_lenh.gia_tri_hien_tai
  const soLenhText =
    thachThuc && soLenhHienTai != null
      ? `${Math.round(soLenhHienTai).toLocaleString("en-US")}/${Math.round(
          thachThuc.so_lenh.muc_tieu,
        ).toLocaleString("en-US")} lệnh`
      : undefined

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

        {/* ★ Ô "NHIỆM VỤ ĐANG LÀM" — dùng chung `cap0/JourneyFocus.tsx` với Cấp
            0/1/2 (một khối, một bộ CSS: các cấp không thể lệch nhau). Cấp 3 là
            cấp cuối cùng còn dựng checklist phẳng kiểu cũ, nay đã hội tụ. */}
        {graduated ? (
          <JourneyFocus
            testId="cap3-focus"
            ready
            tag="HOÀN THÀNH"
            name="Đã tốt nghiệp Cấp 3 «Bản lĩnh»"
            desc={
              CAP_MAX_ENABLED >= 4
                ? "Bạn đã đặt lệnh theo khẩu vị + mức tự tin của chính mình, kết sổ với khối lượng đã ghi hồ sơ, và vượt Thách thức Bản lĩnh: lãi có kỷ luật. Cấp 4 «Thuần thục» đang chờ bạn."
                : "Bạn đã đặt lệnh theo khẩu vị + mức tự tin của chính mình, kết sổ với khối lượng đã ghi hồ sơ, và vượt Thách thức Bản lĩnh: lãi có kỷ luật. Đây là chặng cuối của chương trình hiện tại — tài khoản vẫn giữ nguyên để bạn tiếp tục giao dịch."
            }
          />
        ) : focus == null ? (
          <JourneyFocus
            testId="cap3-focus"
            ready
            tag={`ĐÃ XONG CẢ ${CAP3_TOTAL_TASKS} NHIỆM VỤ`}
            name="Sẵn sàng tốt nghiệp Cấp 3"
            desc="Bạn đã đặt lệnh theo khẩu vị + mức tự tin của chính mình, kết sổ với khối lượng đã ghi hồ sơ, và vượt Thách thức Bản lĩnh: lãi có kỷ luật. Màn tốt nghiệp Cấp 3 «Bản lĩnh» mở ra ngay tại đây."
          />
        ) : (
          <JourneyFocus
            testId="cap3-focus"
            tag="NHIỆM VỤ ĐANG LÀM"
            numeral={NUMERALS[focus - 1]}
            name={TASK_NAMES[focus]}
            desc={TASK_DESCRIPTIONS[focus]}
            progressText={focus === 3 ? soLenhText : undefined}
            /* Cả 3 nhiệm vụ đều làm ở tab Đặt lệnh. */
            onGo={goToTrading}
          />
        )}

        {/* Mockup `.ck-head`: tiêu đề xám bên trái + bộ đếm mang MÀU CỦA CẤP bên
            phải — hai phần tử, không phải một chuỗi "… · x/3". */}
        <div className="cap0-journey-checklist-header mt-3">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 4</span>
          <span
            className="cap0-journey-checklist-count cap0-display"
            style={{ color: level.color }}
          >
            {tasksDone}/{CAP3_TOTAL_TASKS}
          </span>
        </div>

        <div className="cap0-journey-rest">
          {TASK_NOS.map((no) => (
            <ChecklistItem
              key={no}
              no={no}
              state={states[no]}
              focused={focus === no}
              progressText={no === 3 ? soLenhText : undefined}
              onGo={goToTrading}
            />
          ))}
        </div>

        {/* Nhiệm vụ ③ — widget riêng (3 điều kiện + giá trị hiện tại, §C12c).
            Luôn hiện chứ không chỉ khi ③ được tập trung: ③ mở song song ngay từ
            lệnh đầu, và ba con số này là thứ duy nhất cho biết còn thiếu bao
            nhiêu để tốt nghiệp. */}
        <div className="mt-1">
          <ThachThucWidget data={thachThuc} />
        </div>

        <button type="button" className="cap0-checklist-golink mt-2" onClick={openPortfolioAnalysis}>
          Xem Phân tích danh mục →
        </button>

        {/* ★★ TRẠNG THÁI CUỐI của một người đã tốt nghiệp Cấp 3 ★★ — modal tốt
            nghiệp unmount xong là về đúng màn này, checklist 3/3, và ô này là
            câu cuối cùng họ đọc. Khi trần cấp còn dưới 4 nó KHÔNG được hứa một
            cấp chưa tồn tại; khi trần được nâng, câu của mockup tự quay về.
            (Cùng luật `cap1`/`cap2` đang giữ — xem docstring ở `cap1/capFlags.ts`.)

            ★ Và khi ĐÃ tốt nghiệp, nó không được ra lệnh làm lại chính việc vừa
            xong ("Đạt cả 3 điều kiện … → tốt nghiệp Cấp 3"). */}
        <div className="cap0-journey-goal" data-testid="cap3-journey-goal">
          {graduated ? (
            CAP_MAX_ENABLED >= 4 ? (
              <>
                Bạn đã tốt nghiệp <strong>Cấp 3 «Bản lĩnh»</strong>. Chặng tiếp theo:{" "}
                <strong>Cấp 4 «Thuần thục»</strong> (tách quyết định khỏi kết quả).
              </>
            ) : (
              <>
                Bạn đã tốt nghiệp <strong>Cấp 3 «Bản lĩnh»</strong> — chặng cuối của
                chương trình hiện tại. <strong>Cấp 4 «Thuần thục» chưa ra mắt</strong>;
                khi mở, nó sẽ dạy tách quyết định khỏi kết quả.
              </>
            )
          ) : CAP_MAX_ENABLED >= 4 ? (
            <>
              Đạt cả 3 điều kiện của Thách thức Bản lĩnh → tốt nghiệp Cấp 3, lên{" "}
              <strong>Cấp 4 «Thuần thục»</strong> (tách quyết định khỏi kết quả).
            </>
          ) : (
            <>
              Đạt cả 3 điều kiện của Thách thức Bản lĩnh → tốt nghiệp{" "}
              <strong>Cấp 3 «Bản lĩnh»</strong> — chặng cuối của chương trình hiện tại.{" "}
              <strong>Cấp 4 «Thuần thục» chưa ra mắt</strong>; khi mở, nó sẽ dạy tách
              quyết định khỏi kết quả.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
