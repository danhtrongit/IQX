import { useEffect, useRef, memo } from "react"
import { createDataFeed } from "@/lib/tradingview-datafeed"
import { VIETNAM_TIMEZONE } from "@/lib/tradingview-timezone"

interface TVChartProps {
  symbol?: string
  interval?: string
  theme?: "dark" | "light"
  autosize?: boolean
  className?: string
  onSymbolChanged?: (symbol: string) => void
  onMarkClick?: (markId: string | number) => void
}

interface TradingViewWidgetOptionsParams {
  symbol: string
  interval: string
  theme: "dark" | "light"
  autosize: boolean
  containerId: string
}

export function buildTradingViewWidgetOptions({
  symbol,
  interval,
  theme,
  autosize,
  containerId,
}: TradingViewWidgetOptionsParams) {
  return {
    symbol,
    interval,
    container: containerId,
    datafeed: createDataFeed(),
    library_path: "/charting_library/",
    locale: "vi",
    timezone: VIETNAM_TIMEZONE,
    theme,
    autosize,

    // UI customization
    disabled_features: [
      "use_localstorage_for_settings",
      "header_compare",
      "display_market_status",
      "timeframes_toolbar",
      "go_to_date",
      "header_saveload",
      "study_templates",
    ],
    enabled_features: [
      "side_toolbar_in_fullscreen_mode",
      "drawing_templates",
    ],

    // Dark finance theme
    overrides: {
      timezone: VIETNAM_TIMEZONE,
      // Chart background
      "paneProperties.background": theme === "dark" ? "#0a0a0f" : "#ffffff",
      "paneProperties.backgroundType": "solid",

      // Grid
      "paneProperties.vertGridProperties.color": theme === "dark" ? "#1a1a2e" : "#f0f0f0",
      "paneProperties.horzGridProperties.color": theme === "dark" ? "#1a1a2e" : "#f0f0f0",

      // Candles - bullish (green)
      "mainSeriesProperties.candleStyle.upColor": "#00c853",
      "mainSeriesProperties.candleStyle.borderUpColor": "#00c853",
      "mainSeriesProperties.candleStyle.wickUpColor": "#00c853",

      // Candles - bearish (red)
      "mainSeriesProperties.candleStyle.downColor": "#ff1744",
      "mainSeriesProperties.candleStyle.borderDownColor": "#ff1744",
      "mainSeriesProperties.candleStyle.wickDownColor": "#ff1744",

      // Volume
      volumePaneSize: "medium",
    },

    // Loading indicator
    loading_screen: {
      backgroundColor: theme === "dark" ? "#0a0a0f" : "#ffffff",
      foregroundColor: theme === "dark" ? "#2962ff" : "#2962ff",
    },

    // Custom toolbar CSS
    custom_css_url: "",
    toolbar_bg: theme === "dark" ? "#0a0a0f" : "#ffffff",

    // Timeframe defaults
    time_frames: [
      { text: "1N", resolution: "D" as const, description: "1 Ngày" },
      { text: "1T", resolution: "W" as const, description: "1 Tuần" },
      { text: "1Th", resolution: "M" as const, description: "1 Tháng" },
      { text: "3Th", resolution: "M" as const, description: "3 Tháng" },
      { text: "6Th", resolution: "M" as const, description: "6 Tháng" },
      { text: "1Y", resolution: "D" as const, description: "1 Năm" },
    ],
  }
}

function TVChartInner({
  symbol = "VNINDEX",
  interval = "D",
  theme = "dark",
  autosize = true,
  className = "",
  onSymbolChanged,
  onMarkClick,
}: TVChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const onSymbolChangedRef = useRef(onSymbolChanged)
  const onMarkClickRef = useRef(onMarkClick)

  // Keep ref in sync to avoid re-creating widget on callback change
  useEffect(() => {
    onSymbolChangedRef.current = onSymbolChanged
  }, [onSymbolChanged])

  useEffect(() => {
    onMarkClickRef.current = onMarkClick
  }, [onMarkClick])

  useEffect(() => {
    if (!containerRef.current) return

    const containerId = `tv_chart_${Date.now()}`
    containerRef.current.id = containerId

    // Wait for TradingView library to be available
    const initChart = () => {
      const TradingView = (window as any).TradingView
      if (!TradingView) {
        // Retry after script loads
        setTimeout(initChart, 200)
        return
      }

      if (widgetRef.current) {
        try {
          widgetRef.current.remove()
        } catch {
          // ignore
        }
      }

      const widget = new TradingView.widget(
        buildTradingViewWidgetOptions({
          symbol,
          interval,
          theme,
          autosize,
          containerId,
        }),
      )

      widgetRef.current = widget

      // Listen for symbol changes inside TradingView widget
      widget.onChartReady(() => {
        const chart = widget.activeChart()

        chart.onSymbolChanged().subscribe(null, () => {
          const info = chart.symbolExt()
          const newSymbol = (info?.symbol || info?.ticker || "").toUpperCase()

          if (newSymbol && onSymbolChangedRef.current) {
            onSymbolChangedRef.current(newSymbol)
          }
        })

        // Subscribe to mark clicks for news popover
        widget.subscribe("onMarkClick", (markId: string | number) => {
          if (onMarkClickRef.current) {
            onMarkClickRef.current(markId)
          }
        })
      })
    }

    initChart()

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove()
        } catch {
          // ignore cleanup errors
        }
        widgetRef.current = null
      }
    }
  }, [symbol, interval, theme, autosize])

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
    />
  )
}

export const TVChart = memo(TVChartInner)
