import type { AnalysisJSON, NarrativeJSON } from "../types"
import { signedPct } from "../format"
import { StatGrid } from "./StatGrid"

interface BehaviorLowDataProps {
  behavior: AnalysisJSON["behavior"]
  managerVoice: string
  lowDataNote?: string
}

export function BehaviorLowData({ behavior, managerVoice, lowDataNote }: BehaviorLowDataProps) {
  const cells = [
    {
      label: "Nắm giữ bình quân",
      value: `${behavior.avg_holding_days}`,
      sub: "ngày",
    },
    {
      label: "Mã đang lỗ",
      value: `${behavior.losing_count}`,
      tone: behavior.losing_count > 0 ? ("down" as const) : undefined,
    },
    {
      label: "Giữ lỗ quá lâu",
      value: behavior.disposition_flag ? "Có" : "Không",
      tone: behavior.disposition_flag ? ("down" as const) : undefined,
    },
    ...(behavior.worst_loser !== null
      ? [
          {
            label: behavior.worst_loser.ticker,
            value:
              behavior.worst_loser.pnl_pct !== null
                ? signedPct(behavior.worst_loser.pnl_pct)
                : "—",
            sub: `${behavior.worst_loser.periods_held} kỳ chưa cắt`,
            tone: "down" as const,
          },
        ]
      : []),
  ]

  return (
    <div>
      <StatGrid cells={cells} />

      {lowDataNote != null && lowDataNote.length > 0 && (
        <div className="lowdata">
          <span className="d" />
          <div>
            <div className="lt">Một mã tôi chưa chấm điểm</div>
            <p>{lowDataNote}</p>
          </div>
        </div>
      )}

      <div className="mgr">{managerVoice}</div>
    </div>
  )
}
