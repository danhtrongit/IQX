import { bandVar } from "../charts/chartTokens"

export interface MetricPeer {
  /** company position on the 0–100 track (%) */
  you: number
  /** industry-median position on the track (%) */
  median: number
  /** left caption, e.g. "Ngưỡng khỏe > 1.0×" */
  caption?: string
  /** right caption / verdict text, e.g. "Vượt ngưỡng" */
  verdict?: string
  /** qualitative band → colour of the "you" dot + verdict text (good|warn|bad) */
  band?: string
}

export interface MetricCardProps {
  label: string
  /** already-formatted headline value (string keeps mono formatting stable) */
  value: string | number
  unit?: string
  /** optional industry-compare bar */
  peer?: MetricPeer
}

const clamp = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0

/**
 * 1 số lớn + (tùy chọn) thanh so ngành: vạch trung vị + chấm doanh nghiệp,
 * caption trái (ngưỡng) và verdict phải (màu theo band). Không hex — màu chấm/
 * verdict lấy qua `bandVar`.
 */
export function MetricCard({ label, value, unit, peer }: MetricCardProps) {
  return (
    <div className="bctc-metric">
      <div className="bctc-metric-lbl">{label}</div>
      <div className="bctc-metric-val">
        {value}
        {unit ? <span className="bctc-u">{unit}</span> : null}
      </div>
      {peer ? (
        <div className="bctc-peer">
          <div className="bctc-peer-track">
            <span className="bctc-peer-median" style={{ left: `${clamp(peer.median)}%` }} />
            <span
              className="bctc-peer-you"
              style={{ left: `${clamp(peer.you)}%`, background: bandVar(peer.band) }}
            />
          </div>
          {peer.caption || peer.verdict ? (
            <div className="bctc-peer-cap">
              <span>{peer.caption}</span>
              <span style={{ color: bandVar(peer.band) }}>{peer.verdict}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
