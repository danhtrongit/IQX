import { bandVar } from "../charts/chart-tokens"

export interface MetricPeer {
  /** company position on the 0–100 track (%) */
  you: number
  /** industry-median position on the track (%) */
  median: number
  /** left caption, e.g. "Trung vị ngành" */
  caption?: string
  /** right caption / verdict text, e.g. "Vượt ngưỡng" */
  verdict?: string
  /** qualitative band → colour of the "you" dot + verdict text (good|warn|bad) */
  band?: string
}

export interface MetricCardProps {
  label: string
  /** already-formatted headline value (string keeps number formatting stable) */
  value: string | number
  unit?: string
  /** optional industry-compare bar */
  peer?: MetricPeer
}

const clamp = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0)

/**
 * 1 số lớn + (tùy chọn) thanh so ngành: vạch trung vị + chấm doanh nghiệp,
 * caption trái và verdict phải (màu theo band). Không hex — màu chấm/verdict
 * lấy qua `bandVar`.
 */
export function MetricCard({ label, value, unit, peer }: MetricCardProps) {
  return (
    <div className="rounded-sm bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 mb-1 font-heading text-2xl font-medium tabular-nums">
        {value}
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
      {peer ? (
        <div className="mt-2">
          <div className="relative my-2 h-2 rounded-full bg-muted">
            <span
              className="absolute -top-[3px] h-3.5 w-0.5 bg-foreground"
              style={{ left: `${clamp(peer.median)}%` }}
            />
            <span
              className="absolute -top-1 size-[11px] -translate-x-1/2 rounded-full border-2 border-card"
              style={{ left: `${clamp(peer.you)}%`, background: bandVar(peer.band) }}
            />
          </div>
          {peer.caption || peer.verdict ? (
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>{peer.caption}</span>
              <span style={{ color: bandVar(peer.band) }}>{peer.verdict}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
