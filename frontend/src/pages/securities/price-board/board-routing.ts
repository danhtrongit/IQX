/** Build the embedded v2 chart destination while retaining the board's URL state. */
export function boardChartHref(params: URLSearchParams, symbol: string): string {
  const chartParams = new URLSearchParams(params)
  chartParams.set("content", "chart")
  chartParams.set("symbol", symbol.trim().toUpperCase())
  return `/demo-trading?${chartParams.toString()}`
}
