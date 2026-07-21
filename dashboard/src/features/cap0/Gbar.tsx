import { useEffect, useReducer, useRef, useState } from "react"
import { Message } from "@arco-design/web-react"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
import { useCap0Events, type Cap0OrderEvent } from "./Cap0Context"
import { useCap0Progress, useCompleteTask } from "./hooks"
import { cap0Visibility, type Cap0Visibility } from "./cap0Visibility"
import { DebriefModal, type DebriefData } from "./DebriefModal"
import {
  GBAR_TAG,
  gbarReducer,
  gbarText,
  initialGbarState,
} from "./gbarMachine"
import "./cap0.css"

const WARN_MS = 1600

/** spec §8 "hiển thị 1 toast nhẹ" when a hidden component unlocks — Ô Giá and
 * the MP/LO dropdown unlock together (both keyed off task ① done), as do the
 * Tin tức / AI Mẫu nến tabs (both keyed off graduation), so each PAIR gets
 * one combined toast rather than two near-simultaneous ones. */
function announceUnlocks(prev: Cap0Visibility, next: Cap0Visibility): void {
  if (!prev.orderBook && next.orderBook) {
    Message.info("Bạn vừa mở khóa: Sổ lệnh bid/ask.")
  }
  if (!prev.priceField && next.priceField) {
    Message.info("Bạn vừa mở khóa: Ô Giá & loại lệnh (LO/MP).")
  }
  if (!prev.newsTab && next.newsTab) {
    Message.info("Bạn vừa mở khóa: Tin tức & AI Mẫu nến.")
  }
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

/**
 * `.gbar` — spec §6's sustained reminder bar for nhiệm vụ ①, mounted once in
 * `Cap0TradingPage`'s `.cap0-topbar` (sticky, "dưới journey bar"). Doubles as
 * the task-① CONTROLLER: it's the single place that registers the Cấp 0
 * event-bus handlers (`onReasonPicked` / `onOrderFilled` / `onStarToggled` /
 * `onGbarWarn`) that `PlanBlock`/`OrderEntry`/`StockHeader` call — see
 * `Cap0Context.tsx`'s docstring for why the bus itself stays a dumb pass-
 * through instead of owning this state.
 *
 * Unlike toast, content STAYS until the step is done (spec §6 "Nội dung Ở
 * LẠI trên màn cho đến khi bước hiện tại hoàn thành, KHÔNG tự tắt như
 * toast"); a wrong action flashes red + `gshake` + `⚠ ` prefix for ~1.6s,
 * then reverts to amber but stays. Once all 3 flags are set, this component
 * fires `completeTask(1, "star")`, toasts the spec §4 completion copy, and
 * auto-switches the sidebar back to the Hành trình tab.
 */
export function Gbar() {
  const { registerHandlers } = useCap0Events()
  const { data: progress } = useCap0Progress()
  const completeTask = useCompleteTask()
  const { setActivePanel } = useSidebar()
  const [state, dispatch] = useReducer(gbarReducer, initialGbarState)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const completedRef = useRef(false)

  // Nhiệm vụ ⑥ (spec §5/§4 "bán khớp → mở màn Kết sổ") — `lastBuyRef`
  // remembers the most recent BUY fill's price/sl/tp (the Kế hoạch data the
  // debrief later reconciles against; the trading backend never persists
  // SL/TP, so the FE must). `debriefCountRef` is the "#{n}" in "KẾT SỔ LỆNH
  // · #{n}" — this component is mounted once for the whole Cấp 0 session
  // (sibling of `CenterPanel`/`RightSidebar` in `Cap0TradingPage`, NOT inside
  // the sidebar's panel switch), so both refs survive the user switching
  // between the Hành trình/Đặt lệnh/Danh mục tabs in between.
  const lastBuyRef = useRef<{ price: number; sl?: number; tp?: number } | null>(null)
  const debriefCountRef = useRef(0)
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const prevVisibilityRef = useRef<Cap0Visibility | null>(null)

  const task1Done = !!progress?.task_1_done_at

  useEffect(() => {
    registerHandlers({
      onReasonPicked: () => {
        if (task1Done) return
        dispatch({ type: "REASON_PICKED" })
      },
      onOrderFilled: (order: Cap0OrderEvent) => {
        if (order.side === "buy") {
          // Unconditional — nhiệm vụ ⑤'s second buy also needs to be
          // remembered, regardless of whether task ① is already done.
          lastBuyRef.current = { price: order.price, sl: order.sl, tp: order.tp }
        }
        if (order.side === "sell") {
          debriefCountRef.current += 1
          const buy = lastBuyRef.current
          setDebrief({
            n: debriefCountRef.current,
            symbol: order.symbol,
            quantity: order.quantity,
            entryPrice: buy?.price ?? order.price,
            exitPrice: order.price,
            sl: buy?.sl,
            tp: buy?.tp,
          })
          return
        }
        if (task1Done) return
        if (order.symbol.toUpperCase() !== "VNM") return
        dispatch({ type: "ORDER_FILLED" })
        Message.success(
          `✓ Khớp lệnh MUA ${order.quantity} ${order.symbol} @ ${fmtVnd(order.price)}`,
        )
      },
      onStarToggled: (symbol, watched) => {
        if (task1Done) return
        if (!watched || symbol.toUpperCase() !== "VNM") return
        dispatch({ type: "STAR_TOGGLED" })
        Message.success(`★ Đã thêm ${symbol} vào danh mục Theo dõi`)
      },
      onGbarWarn: () => {
        if (task1Done) return
        dispatch({ type: "WARN" })
        if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
        warnTimerRef.current = setTimeout(() => dispatch({ type: "WARN_TIMEOUT" }), WARN_MS)
      },
    })
  }, [registerHandlers, task1Done])

  // Spec §8 unlock toast — fires once per newly-unlocked component/pair as
  // `progress` moves a hide-by-level flag from false → true. Skipped while
  // `progress` is still `undefined` (query loading) so the FIRST real value
  // becomes the baseline `prev` — otherwise a user who returns with task ①
  // already done would see the "loading (all hidden) → resolved (unlocked)"
  // transition mis-read as a fresh unlock and get a spurious toast on mount.
  useEffect(() => {
    if (progress === undefined) return
    const vis = cap0Visibility(progress)
    const prev = prevVisibilityRef.current
    if (prev) announceUnlocks(prev, vis)
    prevVisibilityRef.current = vis
  }, [progress])

  // Clear any in-flight warn timer on unmount.
  useEffect(() => {
    return () => {
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    }
  }, [])

  // Nhiệm vụ ① done (spec §4 "Hoàn thành: lệnh khớp (event từ web) + ★ đã bấm
  // (event từ web)") — persist server-side, toast, and auto-return to the
  // Hành trình tab (spec §4 "auto quay về tab Hành trình"). Guarded so this
  // fires exactly once even if the 3 flags flip in the same tick.
  useEffect(() => {
    if (task1Done || completedRef.current) return
    if (state.reasonPicked && state.orderFilled && state.starToggled) {
      completedRef.current = true
      // Dispatch locally too (not just relying on the next `progress`
      // refetch) so the bar disappears the instant the 3rd flag lands,
      // without waiting on the mutation's round trip.
      dispatch({ type: "TASK_DONE" })
      completeTask.mutate({ taskNo: 1, gate: "star" })
      Message.success("🎉 Nhiệm vụ 1 hoàn thành! Nắm giữ = tiền đang nằm · Theo dõi = mắt đang canh")
      setActivePanel("journey")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reasonPicked, state.orderFilled, state.starToggled, task1Done])

  const closeDebrief = () => setDebrief(null)
  const text = task1Done ? null : gbarText(state)

  return (
    <>
      {text && (
        <div className={cn("cap0-gbar", state.tone === "warn" && "cap0-gbar--warn")}>
          <span className="cap0-gbar-tag">{GBAR_TAG}</span>
          <span>{text}</span>
        </div>
      )}
      <DebriefModal data={debrief} onClose={closeDebrief} />
    </>
  )
}
