/**
 * Trang bọc IQLine cho `market` (docs/iqline-design.md §6, §8, §11): giữ danh sách chỉ báo, nối datafeed và store dùng chung, lấy đường
 * tham chiếu, trần, sàn từ bảng giá. File này được `React.lazy` ở `chart-page.tsx` và `stock-detail-page.tsx`, nên IQLine không
 * nằm trong gói tải ban đầu và không tải khi công tắc tắt.
 */
import { useMemo, useState } from "react"

import { IQLine } from "@/lib/iqline/react/IQLine"
import { DEFAULT_INDICATORS } from "@/lib/iqline/react/market-defaults"
import type { ChartIndicatorInput, Interval } from "@/lib/iqline/types"
import { useQuote } from "@/pages/demo-trading/market/use-quote"

import { createIQLineDatafeed, iqlinePriceFormatter } from "./iqline-datafeed"
import { priceLevelsFromQuote } from "./iqline-levels"
import { getIQLineStore } from "./iqline-store"
import { withTryIndicators } from "./iqline-try-indicator"
import { INDEX_SYMBOLS } from "./market-symbols"

export type IQLineMarketChartProps = {
  symbol: string
  interval: Interval
  theme: "light" | "dark"
  /** Có thì thanh công cụ của biểu đồ hiện ô chọn khung thời gian. */
  onIntervalChange?: (interval: Interval) => void
  onMarkClick?: (id: string | number) => void
  /** Id chỉ báo từ `?chi-bao=` ("Thử trên biểu đồ" của Học viện). Thêm vào bản đang xem, không ghi đè layout đã lưu. Id lạ bị bỏ qua. */
  tryIndicators?: readonly string[]
}

let datafeed: ReturnType<typeof createIQLineDatafeed> | null = null
/** Một datafeed cho cả trang: dùng chung bộ đếm "hết lịch sử" và thăm dò nến mới. */
function sharedDatafeed() {
  datafeed ??= createIQLineDatafeed()
  return datafeed
}

export default function IQLineMarketChart({ symbol, interval, theme, onIntervalChange, onMarkClick, tryIndicators }: IQLineMarketChartProps) {
  const tryKey = tryIndicators?.join(",") ?? ""
  const store = useMemo(() => withTryIndicators(getIQLineStore(), tryKey ? tryKey.split(",") : []), [tryKey])
  const [indicators, setIndicators] = useState<readonly ChartIndicatorInput[]>(DEFAULT_INDICATORS)
  const isIndex = INDEX_SYMBOLS[symbol.toUpperCase()] === true
  const quote = useQuote(isIndex ? "" : symbol)
  const reference = quote.data?.reference ?? null
  const ceiling = quote.data?.ceiling ?? null
  const floor = quote.data?.floor ?? null
  const priceLevels = useMemo(() => priceLevelsFromQuote(symbol, { reference, ceiling, floor }), [symbol, reference, ceiling, floor])
  const formatPrice = useMemo(() => iqlinePriceFormatter(symbol), [symbol])
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <IQLine
        mode="market"
        theme={theme}
        symbol={symbol}
        interval={interval}
        onIntervalChange={onIntervalChange}
        datafeed={sharedDatafeed()}
        store={store}
        indicators={indicators}
        onIndicatorsChange={setIndicators}
        priceLevels={priceLevels}
        formatPrice={formatPrice}
        onMarkClick={onMarkClick}
      />
    </div>
  )
}
