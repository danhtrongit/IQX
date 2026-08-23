import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { JourneyFocus } from "@/features/cap0/JourneyFocus"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó).
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useCap5Events } from "./Cap5Context"
import { useCap5Progress } from "./hooks"
import {
  CAP5_TOTAL_TASKS,
  countCap5TasksDone,
  mucTieuSoMaMua,
  mucTieuSoMaSan,
  taskStateCap5,
  type Cap5Progress,
  type TaskStateCap5,
} from "./types"
import "./cap5-journey.css"

/**
 * Cấp 6 đã mở chưa — quyết định câu cuối của ô mục tiêu.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc lúc RENDER. Một
 * `const` chốt giá trị ngay lúc import, và bài test (mock `capFlags` bằng getter
 * để thử cả hai phía của trần) sẽ chỉ thấy giá trị đầu tiên → một nửa số bài
 * xanh giả. Cùng lý do `cap4/JourneyPanelCap4.tsx#isCap5Open` ghi.
 */
function isCap6Open(): boolean {
  return CAP_MAX_ENABLED >= 6
}

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC =
  '"Không chờ mã đến — chủ động đi săn. Săn nhiều, chọn kỹ, không mua vội."'

/**
 * Hai nhiệm vụ, tên VERBATIM theo mockup `iqx-cap5-hanhtrinh.html` (`.task .nm`).
 *
 * ★★ MÂU THUẪN ĐÃ BIẾT TRONG BỘ SPEC (báo cáo bàn giao ghi lại): `IQX-Cap5-Spec.md`
 * §2 mô tả nhiệm vụ ② là "xem hết tour Săn mã" (và §12 còn đòi thêm ngưỡng lãi
 * >3% mà chính §2 nói KHÔNG đo). Mockup Hành trình vẽ hai nhiệm vụ SĂN 10 / MUA
 * 5, và backend đã dựng đúng hai cột `so_ma_da_san` / `so_ma_mua_tu_watchlist`.
 * Luật repo: mockup thắng về bố cục + nhãn ⇒ lấy bản hai nhiệm vụ này. Hệ quả
 * TỐT: tour KHÔNG phải cổng tốt nghiệp, nên lỗ gian lận "Bỏ qua tour = đạt"
 * (engine `useTour.skip()` gọi thẳng `onComplete`) không tồn tại ở Cấp 5.
 */
const TASKS = [
  {
    no: 1 as const,
    numeral: "①",
    name: "Săn 10 mã vào Watchlist",
    desc: "Dùng bộ lọc Săn mã để quét đủ rộng — thợ săn giỏi xem nhiều mã trước khi chọn.",
    panel: "cap5-sanma" as const,
    tool: "🔍 Săn mã",
  },
  {
    no: 2 as const,
    numeral: "②",
    name: "Mua 5 mã từ Watchlist",
    desc: "Chờ mã trong Watchlist chín rồi mới vào lệnh — chọn kỹ, không mua vội mọi mã tìm được.",
    panel: "cap5-watchlist" as const,
    tool: "👀 Watchlist",
  },
]

/**
 * Dòng tiến độ `n/10 mã` của một nhiệm vụ.
 *
 * ★ `undefined` khi chưa tải xong progress — chỗ gọi phải nói "chưa lấy được số
 * liệu" thay vì in `0/10`: `0/10` là một lời khẳng định ("bạn chưa săn mã nào")
 * mà lúc đó ta chưa biết.
 */
function progressText(
  hienTai: number | undefined,
  mucTieu: number,
): string | undefined {
  if (hienTai == null) return undefined
  return `${Math.min(hienTai, mucTieu).toLocaleString("en-US")}/${mucTieu.toLocaleString(
    "en-US",
  )} mã`
}

/** Dòng checklist THU GỌN — tên + tiến độ + lối đi (mọi nhiệm vụ đều bấm được). */
function ChecklistItem({
  no,
  numeral,
  name,
  state,
  progress,
  onGo,
}: {
  no: number
  numeral: string
  name: string
  state: TaskStateCap5
  progress: string | undefined
  onGo: () => void
}) {
  return (
    <div
      data-testid={`cap5-task-${no}`}
      className={
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : " cap0-checklist-item--active")
      }
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : numeral}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{name}</span>
        <div className="cap0-checklist-desc">{progress ?? "chưa lấy được số liệu"}</div>
      </div>
      {/* ★★ HAI NHIỆM VỤ SONG SONG ⇒ CẢ HAI đều có lối đi, luôn bấm được. Ở các
          cấp một-nhiệm-vụ, dòng checklist không có nút (ô tập trung đã có). Ở đây
          nhiệm vụ KHÔNG được tập trung vẫn phải tới được — nếu không, user đang
          làm ① sẽ không có đường vào ②. */}
      <button
        type="button"
        className="cap5-task-go"
        data-testid={`cap5-task-${no}-go`}
        onClick={onGo}
      >
        →
      </button>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 5 «Lão luyện — Săn mã» (mockup `iqx-cap5-hanhtrinh.html`).
 *
 * ★★ **HAI nhiệm vụ SONG SONG.** jbar `CẤP 5 · n/2` + dòng "Hai nhiệm vụ làm
 * song song", `.ck-head` "TRƯỚC KHI LÊN CẤP 6 · n/2", hai `.task.active`
 * («Săn 10 mã vào Watchlist» `n/10 mã` · «Mua 5 mã từ Watchlist» `n/5 mã`), hàng
 * `.tools` hai ô, rồi `.goal`.
 *
 * ★★ Cấp 5 CŨ đã NGHỈ HƯU: không còn widget «Tỷ lệ quyết định đúng», không còn
 * khối «Thách thức Lão luyện» 3 điều kiện, không còn chữ nào về "4 ô" hay "đứng
 * ngoài" (spec §11 đẩy kỷ luật đứng ngoài sang Cấp 6+). Có bài canh giữ.
 *
 * ★ Dùng chung `cap0/JourneyFocus.tsx` như Cấp 0/1/2/3/4 — một khối, một bộ CSS.
 * Vì hai nhiệm vụ song song, ô tập trung nhắm nhiệm vụ CHƯA xong ĐẦU TIÊN, còn
 * nhiệm vụ kia vẫn tới được từ dòng checklist của nó.
 *
 * Self-contained: gọi `useCap5Progress(isCap5Active)` nên KHÔNG query gì khi ở
 * ngoài `Cap5Provider` (`SidebarProvider` là singleton app-root, dùng chung với
 * /bieu-do & /co-phieu — cùng lý do `JourneyPanelCap4` ghi).
 */
export function JourneyPanelCap5() {
  const { isCap5Active } = useCap5Events()
  const { data: progress } = useCap5Progress(isCap5Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap5TasksDone(progress)
  const level = LEVELS[5]

  const graduated = progress?.graduated_at != null
  const states: Record<1 | 2, TaskStateCap5> = {
    1: taskStateCap5(1, progress),
    2: taskStateCap5(2, progress),
  }

  const texts: Record<1 | 2, string | undefined> = {
    1: progressText(progress?.so_ma_da_san, mucTieuSoMaSan(progress)),
    2: progressText(progress?.so_ma_mua_tu_watchlist, mucTieuSoMaMua(progress)),
  }

  // Nhiệm vụ được TẬP TRUNG = nhiệm vụ chưa xong đầu tiên. `undefined` ⇔ 2/2.
  const focusTask = TASKS.find((t) => states[t.no] === "active")

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* Mockup `.jbar` — dải gọn trên đầu. Dòng `.nx` ở Cấp 5 mang một thông
            tin THẬT mà không phần tử nào khác nói: hai nhiệm vụ chạy song song. */}
        <div className="cap5-jbar" data-testid="cap5-jbar">
          <span className="cap5-jbar-lv">
            CẤP 5 · {tasksDone}/{CAP5_TOTAL_TASKS}
          </span>
          <span className="cap5-jbar-nx">Hai nhiệm vụ làm song song</span>
          <span className="cap5-jbar-dots">
            {TASKS.map((t) => (
              <i
                key={t.no}
                className={"cap5-jbar-dot" + (states[t.no] === "done" ? " done" : " now")}
              />
            ))}
          </span>
        </div>

        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            size={64}
            ring={tasksDone / CAP5_TOTAL_TASKS}
            glow
          />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 5</div>
            <div className="cap0-level-card-name cap0-display">LÃO LUYỆN</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap0-level-card-mode">
              <ModeBadge mode="thuc_chien" />
            </div>
          </div>
        </div>

        {/* ★ Ô "NHIỆM VỤ ĐANG LÀM" — dùng chung với Cấp 0/1/2/3/4. */}
        {graduated ? (
          <JourneyFocus
            testId="cap5-focus"
            ready
            tag="HOÀN THÀNH"
            name="Đã tốt nghiệp Cấp 5 «Lão luyện»"
            desc={
              isCap6Open()
                ? "Bạn không còn chờ mã đến — bạn tự đi săn, rồi sàng lọc trước khi vào lệnh. Cấp 6 «Đối chiếu» đang chờ bạn."
                : "Bạn không còn chờ mã đến — bạn tự đi săn, rồi sàng lọc trước khi vào lệnh. Đây là chặng cuối của chương trình hiện tại; tài khoản vẫn giữ nguyên để bạn tiếp tục giao dịch."
            }
          />
        ) : focusTask == null ? (
          <JourneyFocus
            testId="cap5-focus"
            ready
            tag={`ĐÃ XONG ${CAP5_TOTAL_TASKS}/${CAP5_TOTAL_TASKS} NHIỆM VỤ`}
            name="Sẵn sàng tốt nghiệp Cấp 5"
            desc="Bạn đã săn đủ rộng và chỉ mua những mã chín nhất. Màn tốt nghiệp Cấp 5 «Lão luyện» mở ra ngay tại đây."
          />
        ) : (
          <JourneyFocus
            testId="cap5-focus"
            tag="NHIỆM VỤ ĐANG LÀM"
            numeral={focusTask.numeral}
            name={focusTask.name}
            desc={focusTask.desc}
            progressText={texts[focusTask.no]}
            onGo={() => setActivePanel(focusTask.panel)}
          />
        )}

        <div className="cap0-journey-checklist-header mt-3">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 6</span>
          <span
            className="cap0-journey-checklist-count cap0-display"
            style={{ color: level.color }}
            data-testid="cap5-checklist-count"
          >
            {tasksDone}/{CAP5_TOTAL_TASKS}
          </span>
        </div>

        <div className="cap0-journey-rest">
          {TASKS.map((t) => (
            <ChecklistItem
              key={t.no}
              no={t.no}
              numeral={t.numeral}
              name={t.name}
              state={states[t.no]}
              progress={texts[t.no]}
              onGo={() => setActivePanel(t.panel)}
            />
          ))}
        </div>

        {/* §C12c — luật đếm của hai con số, nói bằng lời. */}
        <div className="cap5-explain" data-testid="cap5-journey-explain">
          <b>Mã nào được tính?</b> Nhiệm vụ ① đếm <b>số mã phân biệt</b> bạn đưa vào Watchlist
          qua bộ lọc Săn mã — săn lại cùng một mã không cộng thêm, và bỏ mã khỏi Watchlist
          cũng không trừ đi. Nhiệm vụ ② đếm mã <b>đến từ săn</b> mà bạn thực sự đặt lệnh mua;
          mã bạn tự gõ không tính. Không đo lãi: bài học Cấp 5 là quy trình săn có kỷ luật.
        </div>

        {/* Mockup `.tools` — ĐÚNG hai ô như mockup vẽ. */}
        <div className="cap5-tools" data-testid="cap5-tools">
          {TASKS.map((t) => (
            <button
              key={t.no}
              type="button"
              className="cap5-tool"
              data-testid={`cap5-tool-${t.no === 1 ? "sanma" : "watchlist"}`}
              onClick={() => setActivePanel(t.panel)}
            >
              {t.tool}
            </button>
          ))}
        </div>

        {/* ★ Mockup `.tools` chỉ vẽ hai ô, nhưng Phân tích danh mục PHẢI tới được:
            khối ⑫/⑬ (spec §9) chỉ sống ở đó, và chính coach Kết sổ Cấp 5 mời user
            sang xem "bộ lọc nào đang mang lại mã thắng nhiều nhất". Để nó thành
            một dòng riêng dưới hàng công cụ — giữ đúng bố cục mockup mà không
            chôn sống một màn đã dựng. */}
        <button
          type="button"
          className="cap5-tool cap5-tool--wide"
          data-testid="cap5-tool-analysis"
          onClick={() => setActivePanel("cap5-analysis")}
        >
          📊 Phân tích danh mục
        </button>

        <div className="cap0-journey-goal" data-testid="cap5-journey-goal">
          {graduated ? (
            isCap6Open() ? (
              <>
                Bạn đã tốt nghiệp <strong>Cấp 5 «Lão luyện»</strong>. Chặng tiếp theo:{" "}
                <strong>Cấp 6 «Đối chiếu»</strong> (xử lý khi 5 lớp mâu thuẫn).
              </>
            ) : (
              <>
                Bạn đã tốt nghiệp <strong>Cấp 5 «Lão luyện»</strong> — chặng cuối của chương
                trình hiện tại. <strong>Cấp 6 chưa ra mắt</strong>; khi mở, nó sẽ dạy cách xử
                lý khi 5 lớp mâu thuẫn nhau.
              </>
            )
          ) : isCap6Open() ? (
            <>
              Xong 2/2 → tốt nghiệp <strong>Cấp 5</strong>, mở <strong>Cấp 6</strong> (xử lý
              khi 5 lớp mâu thuẫn).
            </>
          ) : (
            <>
              Xong 2/2 → tốt nghiệp <strong>Cấp 5 «Lão luyện»</strong> — chặng cuối của
              chương trình hiện tại. <strong>Cấp 6 chưa ra mắt</strong>; khi mở, nó sẽ dạy
              cách xử lý khi 5 lớp mâu thuẫn nhau.
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export type { Cap5Progress }
