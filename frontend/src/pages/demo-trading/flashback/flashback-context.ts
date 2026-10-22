/**
 * Trạng thái dùng chung của màn chơi Flashback (spec v1.1 §2.4 - §2.7).
 *
 * Vùng chính (biểu đồ, ô số liệu, nút Phiên tiếp) và panel phải (khung đặt lệnh, cổ phiếu đang
 * giữ, lệnh đã khớp, xếp hạng) dùng chung một lượt chơi, nên trạng thái nằm ở đây.
 */
import { createContext, useContext } from "react"

import type {
  FlashbackBar,
  FlashbackCurrent,
  FlashbackEntry,
  FlashbackIndicatorParams,
  FlashbackOrderSide,
} from "./flashback-api"
import type { IndicatorPlot } from "./flashback-indicators"

/** Một instance chỉ báo trong lượt chơi: khoá ổn định phía client + id + tham số. */
export type LocalIndicator = {
  key: string
  id: string
  params: FlashbackIndicatorParams
}

/** Một chỉ báo đã chọn, đã tính sẵn để vẽ. */
export type ChartIndicator = {
  key: string
  id: string
  params?: FlashbackIndicatorParams
  label: string
  color: string
  hidden: boolean
  plot: IndicatorPlot
}

export type FlashbackPanelTab = "trade" | "rank"

export type FlashbackContextValue = {
  round: FlashbackCurrent | undefined
  entry: FlashbackEntry | null
  loading: boolean
  failed: boolean
  /** Nến đã hiện: 60 phiên lịch sử + các phiên đã chơi. */
  bars: FlashbackBar[]
  /** Nến khởi tạo cho chỉ báo, không vẽ. */
  warmup: FlashbackBar[]
  historySessions: number
  totalSlots: number
  step: number
  finished?: boolean
  cash: number
  holdings: number
  totalAssets: number
  pnlPct: number
  lastClose: number
  side: FlashbackOrderSide
  setSide: (side: FlashbackOrderSide) => void
  qty: string
  setQty: (value: string) => void
  /** Bộ đếm yêu cầu đưa con trỏ vào ô số cổ phiếu (phím tắt B/S, thanh Mua · Bán). */
  focusQtyTick: number
  requestQtyFocus: () => void
  orderError: string | null
  orderBusy: boolean
  submitOrder: () => void
  join: () => void
  joinBusy: boolean
  joinError: string | null
  nextSession: () => void
  nextBusy: boolean
  finish: () => void
  finishBusy: boolean
  indicators: ChartIndicator[]
  addIndicator: (id: string, params: FlashbackIndicatorParams) => void
  updateIndicator: (key: string, params: FlashbackIndicatorParams) => void
  removeIndicator: (key: string) => void
  toggleIndicator: (key: string) => void
  hiddenKeys: ReadonlySet<string>
  /** Tab đang mở của panel: "Giao dịch" hoặc "Xếp hạng". */
  panelTab: FlashbackPanelTab
  setPanelTab: (tab: FlashbackPanelTab) => void
}

export const FlashbackContext = createContext<FlashbackContextValue | null>(null)

/** Trạng thái chung của màn chơi. */
export function useFlashback(): FlashbackContextValue {
  const value = useContext(FlashbackContext)
  if (!value) throw new Error("useFlashback phải nằm trong FlashbackProvider")
  return value
}
