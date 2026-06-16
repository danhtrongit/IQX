import { useEffect, useRef, memo } from "react"
import { createDataFeed } from "./datafeed"
import type { DrawingPersistence } from "./drawing-persistence"
import { VIETNAM_TIMEZONE } from "./timezone"

interface TVChartProps {
  symbol?: string
  interval?: string
  theme?: "dark" | "light"
  autosize?: boolean
  className?: string
  onSymbolChanged?: (symbol: string) => void
  onMarkClick?: (markId: string | number) => void
  /** Optional per-symbol drawing persistence (backend / localStorage). */
  persistence?: DrawingPersistence
}

interface TradingViewWidgetOptionsParams {
  symbol: string
  interval: string
  theme: "dark" | "light"
  autosize: boolean
  containerId: string
  /** Previously-saved full chart layout (from widget.save) to restore drawings. */
  savedData?: object
}

export function buildTradingViewWidgetOptions({
  symbol,
  interval,
  theme,
  autosize,
  containerId,
  savedData,
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
    // Restore the saved layout (incl. drawings) at construction — no flicker.
    ...(savedData ? { saved_data: savedData } : {}),

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
    enabled_features: ["side_toolbar_in_fullscreen_mode", "drawing_templates"],

    // Dark finance theme
    overrides: {
      timezone: VIETNAM_TIMEZONE,
      // Chart background
      "paneProperties.background": theme === "dark" ? "#0a0a0f" : "#ffffff",
      "paneProperties.backgroundType": "solid",

      // Grid
      "paneProperties.vertGridProperties.color":
        theme === "dark" ? "#1a1a2e" : "#f0f0f0",
      "paneProperties.horzGridProperties.color":
        theme === "dark" ? "#1a1a2e" : "#f0f0f0",

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
      foregroundColor: "#2962ff",
    },

    // Debounce drawing/layout changes before onAutoSaveNeeded fires.
    auto_save_delay: 2,

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
  persistence,
}: TVChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<any>(null)
  const onSymbolChangedRef = useRef(onSymbolChanged)
  const onMarkClickRef = useRef(onMarkClick)
  const persistenceRef = useRef(persistence)

  // Keep refs in sync to avoid re-creating the widget on callback change.
  useEffect(() => {
    onSymbolChangedRef.current = onSymbolChanged
  }, [onSymbolChanged])

  useEffect(() => {
    onMarkClickRef.current = onMarkClick
  }, [onMarkClick])

  useEffect(() => {
    persistenceRef.current = persistence
  }, [persistence])

  useEffect(() => {
    if (!containerRef.current) return

    const containerId = `tv_chart_${Date.now()}`
    containerRef.current.id = containerId

    let cancelled = false
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    // Wait for the TradingView library (loaded globally via index.html).
    const initChart = async () => {
      const TradingView = (window as any).TradingView
      if (!TradingView) {
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

      // Restore the previously-saved layout (incl. drawings) BEFORE constructing
      // so it renders immediately. localStorage is instant; backend adds a small
      // delay for signed-in users. Never let a load error block the chart.
      const persist = persistenceRef.current
      const sym = symbol
      let savedData: object | undefined
      if (persist) {
        try {
          const loaded = await persist.load(sym)
          // Only accept a real widget.save layout (has a `charts` array). Guards
          // against stale/foreign payloads (e.g. an old line-tools-state object)
          // which would otherwise wedge the widget on a loading spinner.
          if (
            loaded &&
            typeof loaded === "object" &&
            Array.isArray((loaded as { charts?: unknown }).charts)
          ) {
            savedData = loaded as object
          }
        } catch {
          // ignore — start with a fresh chart
        }
      }
      if (cancelled) return

      const widget = new TradingView.widget(
        buildTradingViewWidgetOptions({
          symbol,
          interval,
          theme,
          autosize,
          containerId,
          savedData,
        }),
      )

      widgetRef.current = widget

      // Listen for symbol changes inside the TradingView widget.
      widget.onChartReady(() => {
        const chart = widget.activeChart()

        chart.onSymbolChanged().subscribe(null, () => {
          const info = chart.symbolExt()
          const newSymbol = (info?.symbol || info?.ticker || "").toUpperCase()

          if (newSymbol && onSymbolChangedRef.current) {
            onSymbolChangedRef.current(newSymbol)
          }
        })

        // Subscribe to mark clicks for the news popover.
        widget.subscribe("onMarkClick", (markId: string | number) => {
          if (onMarkClickRef.current) {
            onMarkClickRef.current(markId)
          }
        })

        // Persist the full layout (incl. drawings) when the user changes the
        // chart. `drawing_event` fires immediately on create/move/remove;
        // `onAutoSaveNeeded` covers other undoable edits. Debounced because
        // widget.save serializes the whole layout.
        if (persist) {
          const scheduleSave = () => {
            if (saveTimer) clearTimeout(saveTimer)
            saveTimer = setTimeout(() => {
              try {
                widget.save((state: object) =>
                  persist.save(sym, state as Record<string, unknown>),
                )
              } catch {
                // ignore — never let persistence break the chart
              }
            }, 700)
          }
          widget.subscribe("drawing_event", scheduleSave)
          widget.subscribe("onAutoSaveNeeded", scheduleSave)
        }
      })
    }

    initChart()

    return () => {
      cancelled = true
      if (saveTimer) clearTimeout(saveTimer)
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

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}

export const TVChart = memo(TVChartInner)
