/**
 * TradingView Charting Library host glue.
 *
 * The vendored library (`public/charting_library/charting_library.standalone.js`)
 * is loaded on demand — it is ~60 KB of bootstrap plus its bundles, and only the
 * chart routes need it, so it must not sit in the initial page payload.
 *
 * Theme colours come from the app's CSS tokens (`--background`, `--card`,
 * `--border`, `--price-up`, …). The library's canvas parser only understands
 * classic colour syntax, so every token is rasterised through a 2D context to
 * sRGB `rgb()` before it is handed over.
 */
import type { MarketDataFeed } from "./datafeed"

export type ThemeName = "dark" | "light"

export type ChartingLibraryChart = {
  onSymbolChanged(): { subscribe(context: null, callback: () => void): void }
  symbolExt(): { symbol?: string; ticker?: string; name?: string } | null
}

export type ChartingLibraryWidget = {
  onChartReady(callback: () => void): void
  activeChart(): ChartingLibraryChart
  applyOverrides(overrides: Record<string, unknown>): void
  changeTheme(theme: ThemeName): void
  subscribe(event: string, callback: (...args: never[]) => void): void
  save(callback: (state: Record<string, unknown>) => void): void
  remove(): void
}

export type WidgetOptions = {
  symbol: string
  interval: string
  container: string
  datafeed: MarketDataFeed
  library_path: string
  locale: string
  timezone: string
  theme: ThemeName
  autosize: boolean
  saved_data?: Record<string, unknown>
  disabled_features: string[]
  enabled_features: string[]
  overrides: Record<string, unknown>
  loading_screen: { backgroundColor: string; foregroundColor: string }
  auto_save_delay: number
  toolbar_bg: string
  custom_css_url: string
  time_frames: { text: string; resolution: string; description: string }[]
}

type ChartingLibraryWindow = Window & {
  TradingView?: { widget: new (options: WidgetOptions) => ChartingLibraryWidget }
}

const SCRIPT_SRC = "/charting_library/charting_library.standalone.js"

let libraryPromise: Promise<ChartingLibraryWindow["TradingView"]> | null = null

/**
 * Injects the standalone bundle once and resolves with the global. Resolves
 * `undefined` when there is no `document` (SSR/tests) — callers must treat a
 * missing global as "chart unavailable" rather than throwing.
 */
export function loadChartingLibrary(): Promise<
  ChartingLibraryWindow["TradingView"]
> {
  if (!libraryPromise) {
    const global = window as ChartingLibraryWindow
    if (global.TradingView) {
      libraryPromise = Promise.resolve(global.TradingView)
      return libraryPromise
    }
    // `Promise.withResolvers` is ES2024; this app compiles against ES2023.
    const loader = new Promise<ChartingLibraryWindow["TradingView"]>(
      (resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          `script[src="${SCRIPT_SRC}"]`,
        )
        const script = existing ?? document.createElement("script")
        script.addEventListener("load", () =>
          resolve((window as ChartingLibraryWindow).TradingView),
        )
        script.addEventListener("error", () =>
          reject(new Error("Không tải được thư viện biểu đồ")),
        )
        if (!existing) {
          script.src = SCRIPT_SRC
          script.async = true
          document.head.appendChild(script)
        }
      },
    )
    libraryPromise = loader.catch((error: unknown) => {
      libraryPromise = null
      throw error
    })
  }
  return libraryPromise
}

/** Rasterise a CSS colour (incl. `oklch()`) to a canvas-safe `rgb()` string. */
function toRgbColor(value: string, fallback: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return fallback
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  if (![r, g, b, a].every((channel) => typeof channel === "number")) return fallback
  const alpha = a / 255
  return alpha < 1
    ? `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
    : `rgb(${r}, ${g}, ${b})`
}

function token(
  element: HTMLElement,
  theme: ThemeName,
  name: string,
  fallback: Record<ThemeName, string>,
): string {
  const raw = getComputedStyle(element).getPropertyValue(name).trim()
  return raw ? toRgbColor(raw, fallback[theme]) : fallback[theme]
}

/**
 * Theme overrides, rebuilt on every theme change. The widget re-applies them
 * after a `saved_data` restore — a saved layout carries the pane background it
 * was captured with and would otherwise win over the constructor overrides.
 */
export function buildThemeOverrides(
  element: HTMLElement,
  theme: ThemeName,
): Record<string, unknown> {
  const pane = token(element, theme, "--background", {
    dark: "#0a1018",
    light: "#f6f7fa",
  })
  const grid = token(element, theme, "--border", {
    dark: "#1c2434",
    light: "#e4e6ec",
  })
  const scaleText = token(element, theme, "--muted-foreground", {
    dark: "#9aa3b2",
    light: "#5b6472",
  })
  const up = token(element, theme, "--price-up", { dark: "#32d74b", light: "#15803d" })
  const down = token(element, theme, "--price-down", {
    dark: "#ff453a",
    light: "#c62828",
  })

  return {
    timezone: "Asia/Ho_Chi_Minh",
    "paneProperties.background": pane,
    "paneProperties.backgroundType": "solid",
    "paneProperties.vertGridProperties.color": grid,
    "paneProperties.horzGridProperties.color": grid,
    "scalesProperties.textColor": scaleText,
    "scalesProperties.lineColor": grid,
    "mainSeriesProperties.candleStyle.upColor": up,
    "mainSeriesProperties.candleStyle.borderUpColor": up,
    "mainSeriesProperties.candleStyle.wickUpColor": up,
    "mainSeriesProperties.candleStyle.downColor": down,
    "mainSeriesProperties.candleStyle.borderDownColor": down,
    "mainSeriesProperties.candleStyle.wickDownColor": down,
    volumePaneSize: "medium",
  }
}

/**
 * Mark colours for the news marks the datafeed draws (sentiment → dot colour).
 * Read from the live tokens so the dots follow the app theme instead of the
 * library's defaults; a theme flip recolours them on the next marks request.
 */
export function resolveChartColors(
  host: HTMLElement,
  theme: ThemeName,
): { positive: string; negative: string; neutral: string } {
  return {
    positive: token(host, theme, "--price-up", { dark: "#32d74b", light: "#15803d" }),
    negative: token(host, theme, "--price-down", { dark: "#ff453a", light: "#c62828" }),
    neutral: token(host, theme, "--price-ref", { dark: "#d4af37", light: "#8a6b0f" }),
  }
}

export function buildWidgetOptions({
  symbol,
  interval,
  theme,
  containerId,
  datafeed,
  savedData,
  host,
}: {
  symbol: string
  interval: string
  theme: ThemeName
  containerId: string
  datafeed: MarketDataFeed
  savedData?: Record<string, unknown>
  host: HTMLElement
}): WidgetOptions {
  const background = token(host, theme, "--card", {
    dark: "#121a26",
    light: "#ffffff",
  })
  const primary = token(host, theme, "--primary", {
    dark: "#1a73c7",
    light: "#0b5cad",
  })

  return {
    symbol,
    interval,
    container: containerId,
    datafeed,
    library_path: "/charting_library/",
    locale: "vi",
    timezone: "Asia/Ho_Chi_Minh",
    theme,
    autosize: true,
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
    // WKWebView-based browsers may leave blob: iframe documents empty. The
    // vendored library ships this supported same-origin bootstrap page.
    enabled_features: ["side_toolbar_in_fullscreen_mode", "drawing_templates", "iframe_loading_same_origin"],

    overrides: buildThemeOverrides(host, theme),

    loading_screen: { backgroundColor: background, foregroundColor: primary },

    // Debounce drawing/layout changes before onAutoSaveNeeded fires.
    auto_save_delay: 2,

    custom_css_url: "",
    toolbar_bg: background,

    // Timeframe defaults
    time_frames: [
      { text: "1N", resolution: "D", description: "1 Ngày" },
      { text: "1T", resolution: "W", description: "1 Tuần" },
      { text: "1Th", resolution: "M", description: "1 Tháng" },
      { text: "3Th", resolution: "M", description: "3 Tháng" },
      { text: "6Th", resolution: "M", description: "6 Tháng" },
      { text: "1Y", resolution: "D", description: "1 Năm" },
    ],
  }
}
