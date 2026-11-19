/**
 * LUYỆN TẬP → Giao dịch on the chart (the default main tab) for `symbol`, retaining the board's URL state
 * and the open Giao dịch panel tab.
 */
export function boardChartHref(params: URLSearchParams, symbol: string): string {
  const chartParams = new URLSearchParams(params)
  chartParams.delete("view")
  chartParams.delete("content")
  chartParams.set("tool", "giao-dich")
  if (!["dat-lenh", "danh-muc", "tin-tuc"].includes(chartParams.get("tab") ?? "")) chartParams.set("tab", "dat-lenh")
  chartParams.set("symbol", symbol.trim().toUpperCase())
  return `/luyen-tap?${chartParams.toString()}`
}
