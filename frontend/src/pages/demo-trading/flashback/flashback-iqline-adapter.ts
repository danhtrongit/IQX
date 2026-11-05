/**
 * Cầu nối giữa dữ liệu của màn chơi Flashback và biểu đồ IQLine (`?iqline=1`, docs/iqline-design.md GĐ 5).
 *
 * Toàn bộ là phép chuyển thuần, không React, không DOM:
 * - nến: bỏ trường `session` của server, chỉ đưa OHLCV vào thư viện (thư viện không nhận gì khác, §12);
 * - chỉ báo: giữ kho chỉ báo của Flashback (`iqx.flashback.indicators.v2`), đổi tham số cũ `level: { lower, upper }` thành
 *   `lower` và `upper` phẳng của IQLine; khoá chuỗi cũ `a/f/s/u/l/m` nay là tên đầy đủ ở phía thư viện;
 * - lệnh đã khớp thành dấu mua/bán (`SessionMarker`), chỉ ở các phiên đã mở;
 * - hình vẽ cũ (nếu còn trong bộ nhớ của ván) thành hình của IQLine.
 */
import { TOOL_SPECS } from "@/lib/iqline/drawings/tools"
import type { Bar, ChartIndicatorInput, Drawing, IndicatorParams, SessionMarker } from "@/lib/iqline/types"

import type { FlashbackBar, FlashbackIndicatorParams, FlashbackOrder } from "./flashback-api"
import type { ChartIndicator } from "./flashback-context"
import type { Drawing as LegacyDrawing } from "./flashback-drawings"
import { MAX_INDICATORS } from "./flashback-indicator-store"

/** Chỉ OHLCV: không `session`, không trường nào khác của server. Warmup đứng trước, thư viện cắt theo `warmup`. */
export function toLibBars(warmup: readonly FlashbackBar[], bars: readonly FlashbackBar[]): Bar[] {
  return [...warmup, ...bars].map((bar) => ({ open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }))
}

/**
 * Tham số cũ sang tham số IQLine. Cặp ngưỡng `level: { lower, upper }` thành `lower` và `upper`; riêng CMF `level` là một số
 * (ngưỡng duy nhất), nếu lỡ là cặp thì lấy `lower` như công thức cũ. Số thì giữ nguyên.
 */
export function flattenParams(id: string, params: FlashbackIndicatorParams): IndicatorParams {
  const out: IndicatorParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number") {
      out[key] = value
      continue
    }
    if (key === "level" && id !== "cmf") {
      out.lower = value.lower
      out.upper = value.upper
      continue
    }
    out[key] = value.lower
  }
  return out
}

/** Chỉ báo của màn chơi thành đầu vào của biểu đồ. Tối đa `MAX_INDICATORS`: biểu đồ tính bao nhiêu thì vẽ bấy nhiêu. */
export function toChartInputs(indicators: readonly ChartIndicator[]): ChartIndicatorInput[] {
  return indicators.slice(0, MAX_INDICATORS).map((item) => ({ key: item.key, id: item.id, params: flattenParams(item.id, item.params ?? {}), hidden: item.hidden }))
}

/** Tên trên chú giải: "RSI 14" của Flashback (`instanceShortLabel`) thay vì "RSI (14)" của thư viện. */
export function indicatorTitleOf(indicators: readonly ChartIndicator[]): (input: ChartIndicatorInput, fallback: string) => string {
  const labels = new Map(indicators.map((item) => [item.key, item.label]))
  return (input, fallback) => labels.get(input.key) ?? fallback
}

export type IndicatorActions = { toggle: (key: string) => void; remove: (key: string) => void }

/**
 * Chú giải trả về danh sách mới sau khi bấm Ẩn/Hiện hoặc Xóa. Đổi thành lời gọi vào kho chỉ báo của Flashback, nơi giữ
 * danh sách và trạng thái ẩn: khoá nào mất đi thì xoá, khoá nào đổi `hidden` thì bật/tắt.
 */
export function applyIndicatorChange(previous: readonly ChartIndicatorInput[], next: readonly ChartIndicatorInput[], actions: IndicatorActions): void {
  const kept = new Map(next.map((item) => [item.key, item]))
  for (const item of previous) {
    const after = kept.get(item.key)
    if (!after) actions.remove(item.key)
    else if ((after.hidden === true) !== (item.hidden === true)) actions.toggle(item.key)
  }
}

/** Lệnh đã khớp thành dấu mua/bán tại phiên khớp; lệnh ở phiên chưa mở không có dấu (`current` là chỉ số nến đang hiện cuối cùng). */
export function ordersToMarkers(orders: readonly FlashbackOrder[], viewBars: number, current: number): SessionMarker[] {
  const markers: SessionMarker[] = []
  for (const order of orders) {
    const session = viewBars - 1 + order.step
    if (session < 0 || session > current) continue
    markers.push({ session, side: order.side === "buy" ? "buy" : "sell" })
  }
  return markers
}

/**
 * Hình vẽ của biểu đồ SVG cũ thành hình IQLine: `trend` giữ nguyên, `fib` thành `fib-retracement`. Điểm đầu `a` là mức 100% và
 * điểm cuối `b` là mức 0% ở cả hai bên nên thứ tự neo giữ nguyên.
 */
export function legacyDrawingsToLib(shapes: readonly LegacyDrawing[]): Drawing[] {
  return shapes.map((shape) => {
    const tool = shape.kind === "fib" ? "fib-retracement" : "trend"
    return {
      id: `d${shape.id}`,
      tool,
      anchors: [
        { session: shape.a.session, price: shape.a.price },
        { session: shape.b.session, price: shape.b.price },
      ],
      style: { ...TOOL_SPECS[tool].defaultStyle },
    }
  })
}
