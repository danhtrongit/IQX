/** Cấu hình tương tác theo chế độ (docs/iqline-design.md §7, §12) và trạng thái ban đầu. */
import type { Drawing, Viewport } from "../types"
import { ALL_TOOLS, FLASHBACK_TOOLS, SNAP_TOLERANCE, createDrawingsState } from "../drawings"
import { DEFAULT_HISTORY_LIMIT, createHistory } from "./history"
import type { InteractionConfig, InteractionState } from "./types"
import { createViewportOps, flashbackBounds, marketBounds } from "./viewport-ops"

export type MarketConfigInput = {
  /** Số nến đã nạp. */
  barCount: number
  defaultViewport: Viewport
  paddingLeft?: number
  paddingRight?: number
  historyLimit?: number
}

/** `market`: zoom bằng lăn chuột, đủ 14 công cụ, co giãn trục, hoàn tác và làm lại. */
export function marketConfig(input: MarketConfigInput): InteractionConfig {
  const bounds = marketBounds({ barCount: input.barCount, paddingLeft: input.paddingLeft, paddingRight: input.paddingRight })
  const ops = createViewportOps(bounds)
  return {
    mode: "market",
    zoom: true,
    pan: true,
    axisScaling: true,
    history: true,
    wheelNeedsCtrl: false,
    doubleClickPlotResets: false,
    allowedTools: ALL_TOOLS,
    ops,
    defaultViewport: ops.clamp(input.defaultViewport),
    readable: input.barCount > 0 ? { first: 0, last: input.barCount - 1 } : null,
    crosshairBeyondData: true,
    anchorRange: null,
    historyLimit: input.historyLimit ?? DEFAULT_HISTORY_LIMIT,
    snapTolerance: SNAP_TOLERANCE,
  }
}

export type FlashbackConfigInput = {
  /** Số nến warmup: chỉ để tính chỉ báo, không hiện, không kéo tới được. */
  warmup: number
  /** Số nến đã mở, gồm cả warmup. */
  barCount: number
  /** Tổng số ô trên trục; phần dư sau nến đã mở là tương lai. */
  totalSlots: number
  defaultViewport?: Viewport
  /** Tương ứng `interaction` của `FlashbackProps`; mặc định bật cả hai. */
  zoom?: boolean
  pan?: boolean
}

/**
 * `flashback`: chỉ Ctrl + lăn mới zoom, ba công cụ, không co giãn trục, không hoàn tác. Viewport nằm trong [warmup, totalSlots],
 * crosshair chỉ đọc được các nến đã mở (§12).
 */
export function flashbackConfig(input: FlashbackConfigInput): InteractionConfig {
  const { warmup, barCount, totalSlots } = input
  const ops = createViewportOps(flashbackBounds({ warmup, totalSlots }))
  return {
    mode: "flashback",
    zoom: input.zoom ?? true,
    pan: input.pan ?? true,
    axisScaling: false,
    history: false,
    wheelNeedsCtrl: true,
    doubleClickPlotResets: true,
    allowedTools: FLASHBACK_TOOLS,
    ops,
    defaultViewport: ops.clamp(input.defaultViewport ?? { from: warmup, to: totalSlots }),
    readable: barCount > warmup ? { first: warmup, last: Math.min(barCount, totalSlots) - 1 } : null,
    crosshairBeyondData: false,
    anchorRange: { min: warmup, max: Math.max(warmup, totalSlots - 1) },
    historyLimit: DEFAULT_HISTORY_LIMIT,
    snapTolerance: SNAP_TOLERANCE,
  }
}

export type StaticConfigInput = { barCount: number; viewport: Viewport }

/** `static`: chỉ có crosshair. Viewport cố định. */
export function staticConfig(input: StaticConfigInput): InteractionConfig {
  const span = Math.max(input.viewport.to - input.viewport.from, 1e-6)
  const ops = createViewportOps({ minFrom: input.viewport.from, maxTo: input.viewport.from + span, minSpan: span, maxSpan: span })
  return {
    mode: "static",
    zoom: false,
    pan: false,
    axisScaling: false,
    history: false,
    wheelNeedsCtrl: true,
    doubleClickPlotResets: false,
    allowedTools: [],
    ops,
    defaultViewport: ops.clamp(input.viewport),
    readable: input.barCount > 0 ? { first: 0, last: input.barCount - 1 } : null,
    crosshairBeyondData: false,
    anchorRange: null,
    historyLimit: 1,
    snapTolerance: SNAP_TOLERANCE,
  }
}

export function createInteractionState(config: Pick<InteractionConfig, "defaultViewport" | "historyLimit" | "ops">, drawings: readonly Drawing[] = []): InteractionState {
  return {
    viewport: config.ops.clamp(config.defaultViewport),
    crosshair: null,
    drag: null,
    touches: {},
    pinch: null,
    priceScale: {},
    drawings: createDrawingsState(drawings),
    history: createHistory(config.historyLimit),
    magnet: false,
    preview: null,
    cursor: "default",
  }
}
