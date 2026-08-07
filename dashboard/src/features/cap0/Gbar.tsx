import { useEffect, useReducer, useRef, useState } from "react"
import { Message } from "@arco-design/web-react"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
// Concrete-file import, NOT the `@/features/trading` barrel: that barrel
// re-exports `TradingPanel`, which imports from `@/features/cap0` — going
// through it from inside cap0 would close a real module cycle (same rationale
// `GraduationModal.tsx` documents for `@/features/cap1/hooks`).
// `features/trading/hooks` has no cap0 dependency, so this is safe.
import { useOrders, usePortfolio } from "@/features/trading/hooks"
import { useCap0Events, type Cap0OrderEvent } from "./Cap0Context"
import { useCap0Progress, useCompleteTask } from "./hooks"
import { cap0Visibility, type Cap0Visibility } from "./cap0Visibility"
import { DebriefModal, type DebriefData } from "./DebriefModal"
import { findRetroDebrief } from "./retroDebrief"
import {
  GBAR_TAG,
  TASK5_GBAR_MESSAGE,
  gbarReducer,
  gbarText,
  initialGbarState,
} from "./gbarMachine"
import "./cap0.css"

const WARN_MS = 1600

/**
 * spec §8 "hiển thị 1 toast nhẹ" when a hidden component unlocks — Ô Giá and
 * the MP/LO dropdown unlock together (both keyed off task ① done), as do the
 * Tin tức / AI Mẫu nến tabs (both keyed off graduation), so each PAIR gets
 * one combined toast rather than two near-simultaneous ones.
 *
 * The sổ lệnh bid/ask has NO branch here on purpose: v3.0 §8 opens it at Cấp 2
 * ("không hiện ở Cấp 0 và Cấp 1"), so `cap0Visibility().orderBook` is a
 * constant `false` and nothing inside Cấp 0 can ever announce it.
 */
function announceUnlocks(prev: Cap0Visibility, next: Cap0Visibility): void {
  if (!prev.priceField && next.priceField) {
    Message.info("Bạn vừa mở khóa: Ô Giá & loại lệnh (LO/MP).")
  }
  if (!prev.newsTab && next.newsTab) {
    Message.info("Bạn vừa mở khóa: Tin tức & AI Mẫu nến.")
  }
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
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

  // Nhiệm vụ ⑤ (spec §5/§4 "bán khớp → mở màn Kết sổ") — `lastBuyBySymbolRef`
  // remembers each symbol's most recent BUY fill price (the "giá vào" the
  // debrief reports) keyed by symbol — NOT a single slot — so buying two
  // different symbols before selling one of them still reports the SOLD
  // symbol's own entry price, not whichever was bought most recently overall.
  // `debriefCountRef` is the "#{n}" in "KẾT SỔ LỆNH · #{n}" — this component
  // is mounted once for the whole Cấp 0 session (sibling of `CenterPanel`/
  // `RightSidebar` in `Cap0TradingPage`, NOT inside the sidebar's panel
  // switch), so both refs survive the user switching between the Hành trình/
  // Đặt lệnh/Danh mục tabs in between.
  const lastBuyBySymbolRef = useRef<Map<string, number>>(new Map())
  const debriefCountRef = useRef(0)
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const prevVisibilityRef = useRef<Cap0Visibility | null>(null)

  const task1Done = !!progress?.task_1_done_at
  // Nhiệm vụ ⑤ RECOVERY (production bug: Cấp 0 was ungraduatable). The live
  // sell branch below is the ONLY way task ⑤ ever completed, and it depends on
  // two things a real user routinely doesn't have:
  //   • the Cấp 0 event bus, which exists only inside `Cap0Provider` — so a
  //     sell placed from `/bieu-do` or `/co-phieu` (the SAME `TradingPanel`,
  //     but with the no-op bus) fired into the void; and
  //   • `lastBuyBySymbolRef`/`debriefCountRef`, session-local refs a page
  //     reload wipes.
  // Since `Cap0Service.graduate` requires 5/5 tasks + the debrief gate, missing
  // ⑤ meant `isGraduationReady` never opened the graduation modal and the user
  // was stuck in Cấp 0 forever. So: when the user IS on `/dau-truong` with a
  // round trip that ALREADY closed but ⑤ still unfinished, re-open the Kết sổ
  // from SERVER order history so they can read it and complete ⑤ themselves.
  // Deliberately NOT auto-completed server-side — ⑤ teaches reading the Kết sổ.
  //
  // ★ `task_5_done_at` here is the column the BE migration COPIED column 6's
  // data into — i.e. exactly the "đã đóng Kết sổ" fact this guard used to read
  // from `task_6_done_at`, and never v2.2's column-5 SL-keydown timestamp. Get
  // that wrong and a mid-flight production user reads 5/5 with the gate still
  // false, this guard suppresses their only route to the Kết sổ, and
  // `graduate()` 409s forever behind a `closable={false}` modal.
  const task5Done = !!progress?.task_5_done_at
  // Only fetch history when it could actually be needed (`enabled`) — a user
  // who already did ⑤ makes no extra request. Shares the query cache with
  // `WatchlistPanel`'s own `useOrders("filled")`.
  const { data: filledOrders } = useOrders("filled", !!progress && !task5Done)
  const retroOpenedRef = useRef(false)
  // Spec §6's own condition for the nhiệm vụ ⑤ bar: "khi có lệnh mở nhưng chưa
  // bán". Read from the live portfolio rather than from a progress flag so it
  // survives a reload (a session-local "I saw a buy" flag would not) and so a
  // user who already sold elsewhere is not told to sell again. Shares the query
  // cache with `TradingPanel`/`AccountStrip`'s own `usePortfolio()`.
  const { data: portfolio } = usePortfolio()
  const hasOpenPosition = (portfolio?.positions ?? []).some((p) => p.quantity > 0)

  useEffect(() => {
    // One-shot per session, and never in competition with the live path:
    if (retroOpenedRef.current) return
    if (!progress || task5Done) return // not in Cấp 0, or ⑤ already earned
    if (filledOrders === undefined) return // history still loading
    // A live debrief already opened this session (`debriefCountRef` > 0) or one
    // is on screen → the live path owns this, with its own bus-captured entry
    // price. This is what stops the SAME sell producing a second Kết sổ once
    // `usePlaceOrder`'s invalidation refetches the history.
    if (debriefCountRef.current > 0 || debrief !== null) return

    const retro = findRetroDebrief(filledOrders)
    if (!retro) return // nothing truthful to show — see `findRetroDebrief`

    retroOpenedRef.current = true
    // Seed the live counter from the server-derived count so a subsequent live
    // sell continues the numbering (#N → #N+1) instead of restarting at #1.
    debriefCountRef.current = retro.n
    // Genuinely "subscribe to an external system": the Kết sổ to show is only
    // knowable once the server's order history arrives, and it must land in the
    // SAME `debrief` state the live bus path writes so the two can never both
    // own the modal. `retroOpenedRef` makes it strictly one-shot, so this
    // cannot cascade. Deriving it during render instead would mean reading
    // `debriefCountRef` while rendering and a second "already dismissed" state
    // to stop it re-appearing between "Đóng kết sổ ✓" and the PATCH landing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDebrief(retro)
  }, [progress, task5Done, filledOrders, debrief])

  useEffect(() => {
    registerHandlers({
      onReasonPicked: () => {
        if (task1Done) return
        dispatch({ type: "REASON_PICKED" })
      },
      onOrderFilled: (order: Cap0OrderEvent) => {
        if (order.side === "buy") {
          // Keyed by symbol (not a single last-buy slot) — see
          // `lastBuyBySymbolRef`'s docstring above.
          lastBuyBySymbolRef.current.set(order.symbol.toUpperCase(), order.price)
        }
        if (order.side === "sell") {
          debriefCountRef.current += 1
          const entry = lastBuyBySymbolRef.current.get(order.symbol.toUpperCase())
          setDebrief({
            n: debriefCountRef.current,
            symbol: order.symbol,
            quantity: order.quantity,
            entryPrice: entry ?? order.price,
            exitPrice: order.price,
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
  // Task ①'s 3-step bar shows until task ① is done. After that the SAME slot
  // carries nhiệm vụ ⑤'s standing reminder, under spec §6's own condition:
  // "khi có lệnh mở nhưng chưa bán". The two are mutually exclusive by
  // construction (`task1Done` picks exactly one side), so this is a plain
  // fallback, not a priority pick.
  const showTask5Reminder = task1Done && !task5Done && hasOpenPosition
  const text = task1Done ? (showTask5Reminder ? TASK5_GBAR_MESSAGE : null) : gbarText(state)

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
