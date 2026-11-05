/** Bộ dựng thử cho test tương tác: phép đổi toạ độ giả theo viewport hiện tại, gọi bộ giảm như lớp `react/` sẽ gọi. */
import { evenTimes, makeCoords } from "../../drawings/__fixtures__/coords"
import type { Bar, PaneKind } from "../../types"
import { createInteractionState } from "../config"
import { interactionReducer } from "../reducer"
import type { HitRegion, InteractionAction, InteractionConfig, InteractionState, PointerInput } from "../types"

export const PLOT = { left: 0, top: 0, right: 500, bottom: 300 }

export function target(region: HitRegion = "plot", paneKind: PaneKind = "price", paneKey = paneKind === "price" ? "price" : paneKind) {
  return { region, paneKind, paneKey }
}

export function ptr(x: number, y: number, over: Partial<PointerInput> = {}): PointerInput {
  return { pointerId: 1, pointerType: "mouse", x, y, target: target(), ...over }
}

export const touch = (id: number, x: number, y: number, over: Partial<PointerInput> = {}) => ptr(x, y, { pointerId: id, pointerType: "touch", ...over })

export function barsOf(count: number, over: Partial<Bar> = {}): Bar[] {
  return Array.from({ length: count }, () => ({ open: 48, high: 56, low: 44, close: 52, volume: 1, ...over }))
}

export type Harness = {
  readonly state: InteractionState
  readonly config: InteractionConfig
  send(action: InteractionAction): InteractionState
  coords(): ReturnType<typeof makeCoords>
}

export function harness(config: InteractionConfig, options: { kind: "market" | "session"; barCount: number; bars?: Bar[] }): Harness {
  const times = evenTimes(Math.max(options.barCount, 2))
  const bars = options.bars ?? barsOf(options.barCount)
  let state = createInteractionState(config)
  const coords = () => makeCoords({ mode: options.kind, times, viewport: state.viewport, plot: PLOT, price: { low: 0, high: 100 } })
  return {
    get state() {
      return state
    },
    config,
    coords,
    send(action) {
      state = interactionReducer(state, action, { config, coords: coords(), bars })
      return state
    },
  }
}
