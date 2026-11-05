/** Cấu hình tương tác theo chế độ (docs/iqline-design.md §7, §12) và trạng thái ban đầu. */
import type { Drawing, Viewport } from "../types"
import { ALL_TOOLS, FLASHBACK_TOOLS, SNAP_TOLERANCE, createDrawingsState, normalizeMagnet } from "../drawings"
import { DEFAULT_HISTORY_LIMIT, createHistory } from "./history"
import type { InteractionConfig, InteractionState } from "./types"

/** Số ô trống mặc định được kéo quá hai đầu của `market`. */
export const MARKET_LEFT_PAD = 10
export const MARKET_RIGHT_PAD = 20

export type MarketConfigInput = {
  /** Số nến đã nạp. */
  barCount: number
  /** Khung mặc định, thường tính bằng `defaultViewport` của `core/viewport.ts`. */
  defaultViewport: Viewport
  leftPad?: number
  rightPad?: number
  historyLimit?: number
}

/** `market`: zoom bằng lăn chuột, đủ 14 công cụ, co giãn trục, hoàn tác và làm lại. */
export function marketConfig(input: MarketConfigInput): InteractionConfig {
  return {
    mode: "market",
    zoom: true,
    pan: true,
    axisScaling: true,
    history: true,
    wheelNeedsCtrl: false,
    doubleClickPlotResets: false,
    allowedTools: ALL_TOOLS,
    viewport: { slots: input.barCount, leftPad: input.leftPad ?? MARKET_LEFT_PAD, rightPad: input.rightPad ?? MARKET_RIGHT_PAD },
    defaultViewport: input.defaultViewport,
    readable: input.barCount > 0 ? { first: 0, last: input.barCount - 1 } : null,
    crosshairBeyondData: true,
    anchorRange: null,
    historyLimit: input.historyLimit ?? DEFAULT_HISTORY_LIMIT,
    snapTolerance: SNAP_TOLERANCE,
  }
}

export type FlashbackConfigInput = {
  /** Số nến warmup: chỉ để tính chỉ báo, scene đã bỏ chúng nên không có chỉ số nào để hiện, đọc hay kéo tới. */
  warmup: number
  /** Số nến đã mở, gồm cả warmup (độ dài `FlashbackProps.bars`). */
  barCount: number
  /** Tổng số ô trên trục, không tính warmup; phần dư sau nến đã mở là tương lai. */
  totalSlots: number
  /** Mặc định vừa khít mọi ô của trục: `{ from: -0.5, to: totalSlots - 0.5 }`. */
  defaultViewport?: Viewport
  /** Tương ứng `interaction` của `FlashbackProps`; mặc định bật cả hai. */
  zoom?: boolean
  pan?: boolean
}

/**
 * `flashback`: chỉ Ctrl + lăn mới zoom, ba công cụ, không co giãn trục, không hoàn tác. Dùng chỉ số của scene (đã bỏ warmup, 0 là
 * nến đầu tiên được hiện): viewport nằm trong `[-0.5, totalSlots - 0.5]` không chừa ô trống nào nên không kéo qua warmup hay quá
 * ô cuối của trục, và crosshair chỉ đọc được các nến đã mở (§12).
 */
export function flashbackConfig(input: FlashbackConfigInput): InteractionConfig {
  const { totalSlots } = input
  const count = Math.max(0, Math.min(input.barCount - Math.max(0, input.warmup), totalSlots))
  return {
    mode: "flashback",
    zoom: input.zoom ?? true,
    pan: input.pan ?? true,
    axisScaling: false,
    history: false,
    wheelNeedsCtrl: true,
    doubleClickPlotResets: true,
    allowedTools: FLASHBACK_TOOLS,
    viewport: { slots: totalSlots, leftPad: 0, rightPad: 0 },
    defaultViewport: input.defaultViewport ?? { from: -0.5, to: totalSlots - 0.5 },
    readable: count > 0 ? { first: 0, last: count - 1 } : null,
    crosshairBeyondData: false,
    anchorRange: { min: 0, max: Math.max(0, totalSlots - 1) },
    historyLimit: DEFAULT_HISTORY_LIMIT,
    snapTolerance: SNAP_TOLERANCE,
  }
}

export type StaticConfigInput = { barCount: number; viewport: Viewport }

/** `static`: chỉ có crosshair. Viewport cố định, `set-viewport` và `reset` không đổi gì. */
export function staticConfig(input: StaticConfigInput): InteractionConfig {
  return {
    mode: "static",
    zoom: false,
    pan: false,
    axisScaling: false,
    history: false,
    wheelNeedsCtrl: true,
    doubleClickPlotResets: false,
    allowedTools: [],
    viewport: { slots: input.barCount, leftPad: 0, rightPad: 0 },
    defaultViewport: input.viewport,
    readable: input.barCount > 0 ? { first: 0, last: input.barCount - 1 } : null,
    crosshairBeyondData: false,
    anchorRange: null,
    historyLimit: 1,
    snapTolerance: SNAP_TOLERANCE,
  }
}

/** `magnet` nhận cả trạng thái boolean của layout cũ (`true` thành yếu). */
export function createInteractionState(config: Pick<InteractionConfig, "defaultViewport" | "historyLimit">, drawings: readonly Drawing[] = [], magnet: unknown = "off"): InteractionState {
  return {
    viewport: config.defaultViewport,
    crosshair: null,
    drag: null,
    touches: {},
    pinch: null,
    priceScale: {},
    drawings: createDrawingsState(drawings),
    history: createHistory(config.historyLimit),
    magnet: normalizeMagnet(magnet),
    preview: null,
    cursor: "default",
  }
}
