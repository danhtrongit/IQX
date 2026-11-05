import { useMemo, useSyncExternalStore } from "react"

import { observeTheme } from "@/lib/iqline/render"
import { IQLineStatic } from "@/lib/iqline/react/IQLineStatic"
import type { SeriesPanelsModel } from "./chart-math"
import { seriesPanelsToIQLine } from "./series-panels-to-iqline"

const readTheme = (): "light" | "dark" => (document.documentElement.classList.contains("dark") ? "dark" : "light")

export function SeriesPanelsIQLineChart({ model, label, autoLegend = true }: { model: SeriesPanelsModel; label: string; autoLegend?: boolean }) {
  const panels = useMemo(() => seriesPanelsToIQLine(model), [model])
  const theme = useSyncExternalStore(observeTheme, readTheme, () => "light" as const)
  return <IQLineStatic panels={panels} theme={theme} ariaLabel={label} legend={autoLegend} />
}
