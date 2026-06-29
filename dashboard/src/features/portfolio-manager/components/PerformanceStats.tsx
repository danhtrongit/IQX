import type { AnalysisJSON, NarrativeJSON } from "../types"
import { pct, points, signedPct } from "../format"
import { StatGrid } from "./StatGrid"

interface PerformanceStatsProps {
  performance: AnalysisJSON["performance"]
  managerVoice: NarrativeJSON["layers"]["performance"]
}

export function PerformanceStats({ performance, managerVoice }: PerformanceStatsProps) {
  const cells = [
    {
      label: "Danh mục",
      value: pct(performance.portfolio_return),
      tone: "up" as const,
    },
    {
      label: "VN-Index",
      value: pct(performance.benchmark_return),
    },
    {
      label: "Vượt chuẩn",
      value: points(performance.excess_return),
      tone: performance.excess_return >= 0 ? ("up" as const) : ("down" as const),
    },
    {
      label: "Lỗ sâu nhất",
      value: signedPct(performance.max_drawdown),
      tone: "down" as const,
    },
  ]

  return (
    <div>
      <StatGrid cells={cells} />
      <div className="mgr">{managerVoice}</div>
    </div>
  )
}
