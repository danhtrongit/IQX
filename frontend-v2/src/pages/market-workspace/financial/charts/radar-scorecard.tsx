import { bandVar, round, toPoints } from "./chart-tokens"

export interface RadarDim {
  key: string
  label: string
  /** 0–100 */
  score: number
  /** good | warn | bad */
  band: string
  /** short verdict text, e.g. "Xuất sắc" */
  value_label: string
}

export interface RadarScorecardProps {
  dims: RadarDim[]
  /** overall 0–5 score shown under the radar */
  score?: number
  ariaLabel?: string
}

const CX = 100
const CY = 100
const R = 80

function overallToken(score: number | undefined): string {
  if (score === undefined) return "var(--chart-3)"
  if (score >= 4) return "var(--chart-3)"
  if (score >= 2.5) return "var(--chart-2)"
  return "var(--chart-4)"
}

/**
 * KHỐI 0 — thẻ điểm sức khỏe: radar N-trục (mặc định 5) + N thanh ngang +
 * nhãn điểm tổng. Mọi màu trong SVG trỏ về biến token, không hex.
 */
export function RadarScorecard({
  dims,
  score,
  ariaLabel = "Thẻ điểm sức khỏe",
}: RadarScorecardProps) {
  const n = Math.max(dims.length, 1)
  const angle = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180
  const pt = (i: number, r: number): [number, number] => [
    CX + r * Math.cos(angle(i)),
    CY + r * Math.sin(angle(i)),
  ]

  const rings = [R * 0.4, R * 0.7, R]
  const dataPts = dims.map((d, i) => pt(i, R * (Math.max(0, Math.min(100, d.score)) / 100)))
  const overall = overallToken(score)

  return (
    <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex shrink-0 flex-col items-center gap-3">
        <svg
          className="size-[185px] shrink-0"
          viewBox="0 0 200 200"
          role="img"
          aria-label={ariaLabel}
        >
          {/* grid rings */}
          <g fill="none" stroke="var(--border)" strokeWidth={1}>
            {rings.map((r, ri) => (
              <polygon key={`ring-${ri}`} points={toPoints(dims.map((_, i) => pt(i, r)))} />
            ))}
          </g>
          {/* axes */}
          <g stroke="var(--chart-5)" strokeWidth={1}>
            {dims.map((_, i) => {
              const [x, y] = pt(i, R)
              return <line key={`axis-${i}`} x1={CX} y1={CY} x2={round(x)} y2={round(y)} />
            })}
          </g>
          {/* data polygon */}
          <polygon
            points={toPoints(dataPts)}
            fill={overall}
            fillOpacity={0.18}
            stroke={overall}
            strokeWidth={2}
          />
          <g fill={overall}>
            {dataPts.map(([x, y], i) => (
              <circle key={`vtx-${i}`} cx={round(x)} cy={round(y)} r={3.5} />
            ))}
          </g>
        </svg>

        {score !== undefined ? (
          <div
            className="rounded-sm bg-muted px-3 py-1 text-xs font-bold uppercase tracking-[0.06em] tabular-nums"
            style={{ color: overall }}
          >
            Sức khỏe · {score.toFixed(1)} / 5
          </div>
        ) : null}
      </div>

      <div className="grid w-full grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {dims.map((d) => {
          const color = bandVar(d.band)
          const width = Math.max(0, Math.min(100, d.score))
          return (
            <div className="flex flex-col gap-1.5" key={d.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">{d.label}</span>
                <span className="text-xs font-semibold" style={{ color }}>
                  {d.value_label}
                </span>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${width}%`, background: color }}
                />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
