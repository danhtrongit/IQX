/**
 * Cấp 0 gbar state machine (spec §6) — a pure, framework-free reducer that
 * `Gbar.tsx` drives from the Cấp 0 event-bus callbacks (see
 * `Cap0Context.tsx`'s `onReasonPicked` / `onOrderFilled` / `onStarToggled` /
 * `onGbarWarn`).
 *
 * Nhiệm vụ ① is tracked as THREE INDEPENDENT FLAGS rather than a strict
 * 1→2→3 sequence: the ★ button is existing, untouched production behaviour
 * (spec §4 "Ngôi sao ★ ... đã chạy production — KHÔNG sửa"), so it is never
 * blocked and a user COULD star VNM before buying. `gbarStep` always derives
 * the step to show from "which flag is still missing", so it self-corrects
 * regardless of the order the 3 actions happen in.
 *
 * `tone` is the separate transient "wrong action" indicator (spec §6):
 * "Làm SAI (bấm nút khi chưa đủ điều kiện): thanh chuyển đỏ + rung 0,3s +
 * thêm `⚠ ` vào đầu message, rồi sau ~1,6s tự về vàng nhưng VẪN ở đó." —
 * `WARN` flips it red; the ~1.6s auto-recovery (`WARN_TIMEOUT`) is driven by
 * a `setTimeout` in `Gbar.tsx` (kept out of this pure module on purpose).
 */

export type GbarStep = 1 | 2 | 3
export type GbarTone = "amber" | "warn"

export interface GbarState {
  reasonPicked: boolean
  orderFilled: boolean
  starToggled: boolean
  tone: GbarTone
  /** Nhiệm vụ ① fully done (server-confirmed via `task_1_done_at`) — hides the bar for good. */
  done: boolean
}

export const initialGbarState: GbarState = {
  reasonPicked: false,
  orderFilled: false,
  starToggled: false,
  tone: "amber",
  done: false,
}

export type GbarAction =
  | { type: "REASON_PICKED" }
  | { type: "ORDER_FILLED" }
  | { type: "STAR_TOGGLED" }
  | { type: "WARN" }
  | { type: "WARN_TIMEOUT" }
  | { type: "TASK_DONE" }

export function gbarReducer(state: GbarState, action: GbarAction): GbarState {
  switch (action.type) {
    case "REASON_PICKED":
      return state.reasonPicked ? state : { ...state, reasonPicked: true }
    case "ORDER_FILLED":
      return state.orderFilled ? state : { ...state, orderFilled: true }
    case "STAR_TOGGLED":
      return state.starToggled ? state : { ...state, starToggled: true }
    case "WARN":
      return state.tone === "warn" ? state : { ...state, tone: "warn" }
    case "WARN_TIMEOUT":
      return state.tone === "warn" ? { ...state, tone: "amber" } : state
    case "TASK_DONE":
      return state.done ? state : { ...state, done: true }
    default:
      return state
  }
}

/** Which of the 3 steps is still outstanding — `null` once all 3 flags are set (or `done`). */
export function gbarStep(state: GbarState): GbarStep | null {
  if (state.done) return null
  if (!state.reasonPicked) return 1
  if (!state.orderFilled) return 2
  if (!state.starToggled) return 3
  return null
}

/** Tag shown at the head of the bar (spec §6 "Tag đầu thanh `CẦN LÀM`"). */
export const GBAR_TAG = "CẦN LÀM"

/** Step message, verbatim spec §6. */
export function gbarStepMessage(step: GbarStep): string {
  if (step === 1) return "Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua"
  if (step === 2) return "Bước 2/3 — Bấm ĐẶT LỆNH MUA để mua 100 VNM"
  return "Bước 3/3 — Mở 👁 Danh mục xem tab Nắm giữ, rồi quay lại Đặt lệnh gắn ★ cạnh VNM"
}

/**
 * Full display text for the current state — `null` when the bar should be
 * hidden. Prefixes `"⚠ "` while `tone === "warn"` (spec §6, exact prefix —
 * note: no variation selector, unlike the ⚠️ used elsewhere in the spec doc).
 */
export function gbarText(state: GbarState): string | null {
  const step = gbarStep(state)
  if (step === null) return null
  const msg = gbarStepMessage(step)
  return state.tone === "warn" ? `⚠ ${msg}` : msg
}

export function gbarVisible(state: GbarState): boolean {
  return gbarStep(state) !== null
}

/**
 * Nhiệm vụ ⑤ gbar (spec §4 Chặng 3 / §6 "Nội dung nhiệm vụ ⑤: xem §4 Chặng 3
 * ở trên") — a SECOND, independent 2-flag reducer, mirroring nhiệm vụ ①'s
 * 3-flag design above but entirely LOCAL (never reads server progress):
 *
 *  - `slTyped` is driven by the SL field's `keydown` event (same DOM event
 *    `TradingPanel`'s `handleSlKeydown` already reacts to for the "cổng chất
 *    lượng 1" PATCH — `Gbar` just also gets notified via the bus so step 1→2
 *    updates instantly, without waiting on that mutation's round trip).
 *  - `orderPlaced` is driven by the SAME `onOrderFilled` BUY bus event nhiệm
 *    vụ ① uses, but only once task ① is already done (i.e. this buy is
 *    nhiệm vụ ⑤'s second order, not the first).
 *
 * Deliberately NOT keyed off `progress.task_5_done_at` — the backend marks
 * that (and `task5_sl_typed`) done at the very FIRST keydown, not after the
 * follow-up buy (see `service.py`'s `complete_task`), so gating hide-on-that
 * would make step 2/2 disappear before the user ever gets to place the
 * order. `orderPlaced` (this reducer's own flag) is the sole "done → hide"
 * signal, exactly as the review calls for.
 */
export interface Task5State {
  slTyped: boolean
  orderPlaced: boolean
}

export const initialTask5State: Task5State = {
  slTyped: false,
  orderPlaced: false,
}

export type Task5Action = { type: "SL_TYPED" } | { type: "ORDER_PLACED" }

export function task5Reducer(state: Task5State, action: Task5Action): Task5State {
  switch (action.type) {
    case "SL_TYPED":
      return state.slTyped ? state : { ...state, slTyped: true }
    case "ORDER_PLACED":
      return state.orderPlaced ? state : { ...state, orderPlaced: true }
    default:
      return state
  }
}

export type Task5Step = 1 | 2

/** `null` once the second order is placed (task done → gbar hides). */
export function task5Step(state: Task5State): Task5Step | null {
  if (state.orderPlaced) return null
  return state.slTyped ? 2 : 1
}

/** Step messages, verbatim spec §4 Chặng 3 lines ~140-142. */
export function task5StepMessage(step: Task5Step): string {
  if (step === 1) {
    return "Bước 1/2 — Tự gõ ngưỡng cắt lỗ vào ô (nhập bằng bàn phím, đây là lời hứa của bạn)"
  }
  return "Bước 2/2 — Bấm ĐẶT LỆNH MUA để hoàn tất lệnh thứ hai"
}

export function task5Text(state: Task5State): string | null {
  const step = task5Step(state)
  return step === null ? null : task5StepMessage(step)
}
