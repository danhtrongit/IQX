/**
 * Cấp 0 gbar state machine (spec §6) — a pure, framework-free reducer that
 * `Gbar.tsx` drives from the Cấp 0 event-bus callbacks (see
 * `Cap0Context.tsx`'s `onReasonPicked` / `onOrderFilled` / `onGbarWarn`).
 *
 * Nhiệm vụ ① is tracked as TWO INDEPENDENT FLAGS rather than a strict 1→2
 * sequence: `gbarStep` always derives the step to show from "which flag is
 * still missing", so it self-corrects regardless of the order the actions
 * happen in.
 *
 * ★ There used to be a THIRD flag, `starToggled` (gắn ★ cạnh VNM), because ①
 * bundled "Lệnh đầu tiên + Nắm giữ + Theo dõi" into one nhiệm vụ. Those two
 * visits are now nhiệm vụ ② and ③ of their own, so ① is chip lý do + mua and
 * nothing else. The ★ button itself is untouched production behaviour — it
 * simply no longer gates anything in Cấp 0.
 *
 * `tone` is the separate transient "wrong action" indicator (spec §6):
 * "Làm SAI (bấm nút khi chưa đủ điều kiện): thanh chuyển đỏ + rung 0,3s +
 * thêm `⚠ ` vào đầu message, rồi sau ~1,6s tự về vàng nhưng VẪN ở đó." —
 * `WARN` flips it red; the ~1.6s auto-recovery (`WARN_TIMEOUT`) is driven by
 * a `setTimeout` in `Gbar.tsx` (kept out of this pure module on purpose).
 */

export type GbarStep = 1 | 2
export type GbarTone = "amber" | "warn"

export interface GbarState {
  reasonPicked: boolean
  orderFilled: boolean
  tone: GbarTone
  /** Nhiệm vụ ① fully done (server-confirmed via `task_1_done_at`) — hides the bar for good. */
  done: boolean
}

export const initialGbarState: GbarState = {
  reasonPicked: false,
  orderFilled: false,
  tone: "amber",
  done: false,
}

export type GbarAction =
  | { type: "REASON_PICKED" }
  | { type: "ORDER_FILLED" }
  | { type: "WARN" }
  | { type: "WARN_TIMEOUT" }
  | { type: "TASK_DONE" }

export function gbarReducer(state: GbarState, action: GbarAction): GbarState {
  switch (action.type) {
    case "REASON_PICKED":
      return state.reasonPicked ? state : { ...state, reasonPicked: true }
    case "ORDER_FILLED":
      return state.orderFilled ? state : { ...state, orderFilled: true }
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

/** Which of the 2 steps is still outstanding — `null` once both flags are set (or `done`). */
export function gbarStep(state: GbarState): GbarStep | null {
  if (state.done) return null
  if (!state.reasonPicked) return 1
  if (!state.orderFilled) return 2
  return null
}

/** Tag shown at the head of the bar (spec §6 "Tag đầu thanh `CẦN LÀM`"). */
export const GBAR_TAG = "CẦN LÀM"

/** Step message. */
export function gbarStepMessage(step: GbarStep): string {
  if (step === 1) return "Bước 1/2 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua"
  return "Bước 2/2 — Bấm ĐẶT LỆNH MUA để mua 100 VNM"
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
 * Nhiệm vụ ④ «Bán một lệnh, kết sổ đầu tiên» — verbatim spec v3.0 §6:
 * "khi có lệnh mở nhưng chưa bán → `Chọn lệnh trong Nắm giữ và bấm Bán để khép
 * vòng đời lệnh đầu tiên`."
 *
 * A plain constant, not a reducer: unlike nhiệm vụ ①'s flags, ④ is one action
 * with nothing to sequence.
 *
 * ★ Đây là nhiệm vụ ⑤ cũ, lùi về ④ khi Chặng 2 (ba tour sản phẩm) bị bỏ. Nội
 * dung thanh không đổi một chữ — chỉ số hiệu nhiệm vụ nó phục vụ đổi.
 *
 * `Gbar` decides WHEN to show it — spec §6's own condition, "có lệnh mở nhưng
 * chưa bán", read from live portfolio data rather than from progress flags.
 */
export const TASK4_GBAR_MESSAGE =
  "Chọn lệnh trong Nắm giữ và bấm Bán để khép vòng đời lệnh đầu tiên"
