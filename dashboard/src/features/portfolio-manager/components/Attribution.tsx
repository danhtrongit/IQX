import type { AttributionRow, NarrativeJSON } from "../types"
import { vndShort } from "../format"

interface AttributionProps {
  attribution: AttributionRow[]
  managerVoice: string
}

export function Attribution({ attribution, managerVoice }: AttributionProps) {
  // Scale fill widths relative to the largest absolute pct (or pnl fallback)
  const maxAbs = Math.max(
    ...attribution.map((r) =>
      r.pct !== null ? Math.abs(r.pct) : Math.abs(r.pnl)
    ),
    0.01,
  )

  return (
    <div>
      {attribution.map((row) => {
        const isPos = row.pnl >= 0
        const absVal =
          row.pct !== null ? Math.abs(row.pct) : Math.abs(row.pnl)
        const fillWidth = `${(absVal / maxAbs) * 100}%`

        return (
          <div key={row.ticker} className="attr">
            <div className="attr-row">
              <span className="nm">{row.ticker}</span>
              {isPos ? (
                <div className="track">
                  <div className="fill p" style={{ width: fillWidth }} />
                </div>
              ) : (
                <div className="track r">
                  <div className="fill n" style={{ width: fillWidth }} />
                </div>
              )}
              <span className={isPos ? "val p" : "val n"}>{vndShort(row.pnl)}</span>
            </div>
          </div>
        )
      })}

      <div className="mgr">{managerVoice}</div>
    </div>
  )
}
