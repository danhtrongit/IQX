import { useOfficeLeaderboard } from "../hooks.ts"
import type { OfficeMe } from "../types.ts"
import {
  getInitials,
  monthNumberFromPeriod,
  nextMonthResetLabel,
} from "../utils.ts"
import { ModalShell, OfficeQueryError } from "./ModalShell.tsx"

export interface LeaderboardModalProps {
  me: OfficeMe
  onClose: () => void
}

export function LeaderboardModal({ me, onClose }: LeaderboardModalProps) {
  const leaderboardQuery = useOfficeLeaderboard(me.periodMonth, true)
  const data = leaderboardQuery.data

  const periodMonth = data?.periodMonth ?? me.periodMonth
  const monthNum = data?.monthNumber ?? monthNumberFromPeriod(periodMonth)
  const resetLabel = data?.nextResetLabel || nextMonthResetLabel(periodMonth)
  const top3 = (data?.top3 ?? []).filter((entry) => entry.points > 0)

  return (
    <ModalShell
      title={`THÀNH TÍCH THÁNG ${monthNum}`}
      subtitle={`reset ngày ${resetLabel}`}
      size="small"
      bodyClassName="of-bb-sm"
      testId="office-modal-stand"
      onClose={onClose}
    >
      <div className="of-lb">
        {leaderboardQuery.isError ? (
          <OfficeQueryError onRetry={() => void leaderboardQuery.refetch()} />
        ) : leaderboardQuery.isLoading ? (
          <p className="of-empty">Đang tải bảng thành tích...</p>
        ) : top3.length === 0 ? (
          <p className="of-empty">Chưa có ai ghi điểm tháng này</p>
        ) : (
          top3.map((entry) => (
            <div
              key={entry.userId}
              className={`of-lb-row is-rank-${entry.rank}`}
              data-testid={`office-lb-rank-${entry.rank}`}
            >
              <span className="of-lb-rank">{entry.rank}</span>
              <span
                className="of-avatar"
                style={{ background: entry.accentColor }}
                aria-hidden="true"
              >
                {getInitials(entry.displayName)}
              </span>
              <b>{entry.displayName}</b>
              <span className="of-lb-pts">{entry.points} điểm</span>
            </div>
          ))
        )}

        {!leaderboardQuery.isError && me.role === "staff" && data?.myRank && (
          <div
            className="of-lb-row is-mine"
            data-testid="office-lb-my-rank"
          >
            <span className="of-lb-rank">
              {data.myRank.rank !== null ? `#${data.myRank.rank}` : "—"}
            </span>
            <b>
              Hạng của bạn
              {me.self?.displayName ? ` · ${me.self.displayName}` : ""}
            </b>
            <span className="of-lb-pts">{data.myRank.points} điểm</span>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
