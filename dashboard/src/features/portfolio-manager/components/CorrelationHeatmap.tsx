import { num } from "../format"
import type { CorrelationPair, PositionRow } from "../types"

interface CorrelationHeatmapProps {
  correlation: CorrelationPair[]
  positions: PositionRow[]
}

/** Interpolate between saffron (#d4a574) and red (#a8453a) by t ∈ [0,1]. */
function heatColor(t: number): string {
  // saffron: 212, 165, 116
  // down-red: 168, 69, 58
  const r = Math.round(212 + (168 - 212) * t)
  const g = Math.round(165 + (69 - 165) * t)
  const b = Math.round(116 + (58 - 116) * t)
  return `rgb(${r},${g},${b})`
}

function lookupCorrelation(
  correlation: CorrelationPair[],
  a: string,
  b: string,
): number | null {
  const pair = correlation.find(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
  )
  return pair ? pair.value : null
}

export function CorrelationHeatmap({ correlation, positions }: CorrelationHeatmapProps) {
  // Top ~4 holdings by weight desc
  const topPositions = [...positions]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
  const tickers = topPositions.map((p) => p.ticker)

  // Find the highest-correlation pair among the top tickers
  let maxValue = -Infinity
  let maxA = ""
  let maxB = ""

  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const v = lookupCorrelation(correlation, tickers[i], tickers[j])
      if (v !== null && v > maxValue) {
        maxValue = v
        maxA = tickers[i]
        maxB = tickers[j]
      }
    }
  }

  const hasMaxPair = maxValue > -Infinity

  return (
    <div>
      <table className="heat">
        <thead>
          <tr>
            <th></th>
            {tickers.map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowTicker) => (
            <tr key={rowTicker}>
              <th>{rowTicker}</th>
              {tickers.map((colTicker) => {
                if (rowTicker === colTicker) {
                  return (
                    <td key={colTicker}>
                      <div className="cell self">1.0</div>
                    </td>
                  )
                }
                const v = lookupCorrelation(correlation, rowTicker, colTicker)
                const label = v !== null ? num(v) : "—"
                const bg = v !== null ? heatColor(Math.max(0, Math.min(1, v))) : "#ccc"
                return (
                  <td key={colTicker}>
                    <div className="cell" style={{ background: bg }}>
                      {label}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {hasMaxPair && (
        <div className="sig-call">
          <span className="badge">{num(maxValue)}</span>
          <span>
            {maxA} và {maxB} dịch chuyển gần như cùng nhịp — cầm cả hai không thực sự chia được rủi ro.
          </span>
        </div>
      )}
    </div>
  )
}
