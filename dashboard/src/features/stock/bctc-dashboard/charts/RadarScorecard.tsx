import { bandVar, round, toPoints } from "./chartTokens"

export interface RadarDim {
  key: string
  label: string
  /** 0–100 */
  score: number
  /** qualitative band: good | warn | bad */
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

function overallColor(score: number | undefined): string {
  if (score === undefined) return "var(--green)"
  if (score >= 4) return "var(--green)"
  if (score >= 2.5) return "var(--amber)"
  return "var(--red)"
}

/**
 * KHỐI 0 — thẻ điểm sức khỏe: radar N-trục (mặc định 5) + N thanh ngang +
 * nhãn điểm tổng. Mọi màu trong SVG trỏ về biến CSS (SPEC §5).
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
  const oc = overallColor(score)

  return (
    <div className="bctc-radar">
      <svg
        className="bctc-radar-svg"
        viewBox="0 0 200 200"
        role="img"
        aria-label={ariaLabel}
      >
        {/* grid rings */}
        <g fill="none" stroke="var(--line)" strokeWidth={1}>
          {rings.map((r, ri) => (
            <polygon
              key={`ring-${ri}`}
              points={toPoints(dims.map((_, i) => pt(i, r)))}
            />
          ))}
        </g>
        {/* axes */}
        <g stroke="var(--line-strong)" strokeWidth={1}>
          {dims.map((_, i) => {
            const [x, y] = pt(i, R)
            return <line key={`axis-${i}`} data-axis="" x1={CX} y1={CY} x2={round(x)} y2={round(y)} />
          })}
        </g>
        {/* data polygon */}
        <polygon data-radar="" points={toPoints(dataPts)} fill={oc} fillOpacity={0.18} stroke={oc} strokeWidth={2} />
        <g fill={oc}>
          {dataPts.map(([x, y], i) => (
            <circle key={`vtx-${i}`} cx={round(x)} cy={round(y)} r={3.5} />
          ))}
        </g>
      </svg>

      {score !== undefined ? (
        <div className="bctc-radar-score" style={{ background: "var(--green-bg)", color: oc }}>
          Sức khỏe · {score.toFixed(1)} / 5
        </div>
      ) : null}

      <div className="bctc-dims">
        {dims.map((d) => {
          const color = bandVar(d.band)
          const w = Math.max(0, Math.min(100, d.score))
          return (
            <div className="bctc-dim" data-dim="" key={d.key}>
              <div className="bctc-dim-head">
                <span className="bctc-dim-name">{d.label}</span>
                <span className="bctc-dim-verdict" style={{ color }}>
                  {d.value_label}
                </span>
              </div>
              <div className="bctc-dim-bar">
                <span style={{ width: `${w}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
