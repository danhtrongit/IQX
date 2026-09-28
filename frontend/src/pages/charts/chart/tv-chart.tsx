/**
 * `TVChart` — the TradingView widget host.
 *
 * Lifecycle rules that matter (each one is a real failure mode):
 *  - The widget is created **once per (symbol, interval)**: drawings are stored
 *    per symbol, so switching symbol must rebuild the chart with that symbol's
 *    saved layout instead of carrying the previous symbol's lines over.
 *  - Callbacks live in refs, so a changed handler identity never rebuilds the
 *    widget (which would drop the user's unsaved toolbar state).
 *  - The theme is applied through `changeTheme` + `applyOverrides` on the live
 *    widget — after a `saved_data` restore the saved pane background would
 *    otherwise win, which is the classic "dark chart turns white" regression.
 */
import { memo, useEffect, useRef, useState } from "react"

import { createDataFeed } from "./datafeed"
import type { DrawingPersistence } from "./drawing-persistence"
import {
  buildThemeOverrides,
  buildWidgetOptions,
  loadChartingLibrary,
  resolveChartColors,
  type ChartingLibraryWidget,
  type ThemeName,
} from "./tradingview"

export type TVChartProps = {
  symbol?: string
  interval?: string
  theme: ThemeName
  className?: string
  onSymbolChanged?: (symbol: string) => void
  onMarkClick?: (markId: string | number) => void
  /** Per-symbol drawing persistence (backend + same-device cache). */
  persistence?: DrawingPersistence
}

function TVChartInner({
  symbol = "VNINDEX",
  interval = "D",
  theme,
  className,
  onSymbolChanged,
  onMarkClick,
  persistence,
}: TVChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<ChartingLibraryWidget | null>(null)
  const themeRef = useRef(theme)
  const onSymbolChangedRef = useRef(onSymbolChanged)
  const onMarkClickRef = useRef(onMarkClick)
  const persistenceRef = useRef(persistence)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep refs in sync so callback changes never re-create the widget.
  useEffect(() => {
    onSymbolChangedRef.current = onSymbolChanged
    onMarkClickRef.current = onMarkClick
    persistenceRef.current = persistence
  }, [onSymbolChanged, onMarkClick, persistence])

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    const containerId = `tv_chart_${Date.now()}_${Math.round(Math.random() * 1e6)}`
    host.id = containerId

    let cancelled = false
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    const initChart = async () => {
      let TradingView: Awaited<ReturnType<typeof loadChartingLibrary>>
      try {
        TradingView = await loadChartingLibrary()
      } catch {
        if (!cancelled) setError("Không tải được thư viện biểu đồ TradingView.")
        return
      }
      if (cancelled || !TradingView || !containerRef.current) return

      // Restore the saved layout (incl. drawings) BEFORE constructing so it
      // renders immediately, and only accept a real `widget.save` payload
      // (a `charts` array) — a stale/foreign object would wedge the widget on
      // its loading spinner. A load error never blocks the chart.
      let savedData: Record<string, unknown> | undefined
      const persist = persistenceRef.current
      const activeSymbol = symbol
      if (persist) {
        try {
          const loaded = await persist.load(activeSymbol)
          if (loaded && Array.isArray(loaded.charts)) savedData = loaded
        } catch {
          // start with a fresh chart
        }
      }
      if (cancelled || !containerRef.current) return

      widgetRef.current?.remove()
      const widget = new TradingView.widget(
        buildWidgetOptions({
          symbol: activeSymbol,
          interval,
          theme: themeRef.current,
          containerId,
          datafeed: createDataFeed(resolveChartColors(containerRef.current, themeRef.current)),
          savedData,
          host: containerRef.current,
        }),
      )
      widgetRef.current = widget

      widget.onChartReady(() => {
        if (cancelled) return
        setReady(true)

        // Re-assert the theme after the saved layout restore.
        try {
          widget.applyOverrides(buildThemeOverrides(containerRef.current ?? host, themeRef.current))
        } catch {
          // never let theming break the chart
        }

        widget.activeChart().onSymbolChanged().subscribe(null, () => {
          const info = widget.activeChart().symbolExt()
          const next = (info?.symbol || info?.ticker || "").toUpperCase()
          if (next && next !== activeSymbol.toUpperCase()) onSymbolChangedRef.current?.(next)
        })

        widget.subscribe("onMarkClick", (markId: string | number) => {
          onMarkClickRef.current?.(markId)
        })

        // Persist the whole layout (incl. drawings) on any chart edit:
        // `drawing_event` fires on create/move/remove, `onAutoSaveNeeded`
        // covers the remaining undoable edits. Debounced — `widget.save`
        // serialises the entire layout.
        if (persist) {
          const scheduleSave = () => {
            clearTimeout(saveTimer)
            saveTimer = setTimeout(() => {
              try {
                widget.save((state) => persist.save(activeSymbol, state))
              } catch {
                // never let persistence break the chart
              }
            }, 700)
          }
          widget.subscribe("drawing_event", scheduleSave)
          widget.subscribe("onAutoSaveNeeded", scheduleSave)
        }
      })
    }

    setReady(false)
    setError(null)
    void initChart()

    return () => {
      cancelled = true
      clearTimeout(saveTimer)
      try {
        widgetRef.current?.remove()
      } catch {
        // ignore cleanup errors
      }
      widgetRef.current = null
    }
  }, [symbol, interval])

  // Theme is a live mutation, not a rebuild: the user keeps zoom, drawings and
  // the active tool while light/dark flips.
  useEffect(() => {
    themeRef.current = theme
    const widget = widgetRef.current
    const host = containerRef.current
    if (!widget || !host || !ready) return
    try {
      widget.changeTheme(theme)
      widget.applyOverrides(buildThemeOverrides(host, theme))
    } catch {
      // never let theming break the chart
    }
  }, [theme, ready])

  return (
    <div className={`relative min-h-0 flex-1 ${className ?? ""}`}>
      <div ref={containerRef} className="size-full" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background">
          <span className="text-xs text-muted-foreground">
            {error ?? "Đang tải biểu đồ…"}
          </span>
        </div>
      )}
    </div>
  )
}

export const TVChart = memo(TVChartInner)
