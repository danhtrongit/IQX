import type { AllocationRow } from "../types"
import { pct } from "../format"

interface AllocationBarsProps {
  allocation: AllocationRow[]
  managerVoice: string
}

export function AllocationBars({ allocation, managerVoice }: AllocationBarsProps) {
  // Scale fill widths relative to the largest weight in the set
  const maxWeight = Math.max(...allocation.map((r) => r.weight), 0.01)

  return (
    <div>
      {allocation.map((row) => {
        const fillPct = (row.weight / maxWeight) * 100
        const benchmarkPct = row.benchmark !== null ? (row.benchmark / maxWeight) * 100 : null

        return (
          <div key={row.sector} className="wbar">
            <span className="lbl">{row.sector}</span>
            <div className="track">
              <div className="fill" style={{ width: `${fillPct}%` }} />
              {benchmarkPct !== null && (
                <div className="bench" style={{ left: `${benchmarkPct}%` }} />
              )}
            </div>
            <span className="pct">{pct(row.weight)}</span>
          </div>
        )
      })}

      <div className="legend">
        <span>
          <i /> Của bạn
        </span>
        <span>
          <i className="b" /> VN-Index
        </span>
      </div>

      {managerVoice && <div className="mgr">{managerVoice}</div>}
    </div>
  )
}
