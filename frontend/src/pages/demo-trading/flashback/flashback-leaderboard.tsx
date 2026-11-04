/**
 * Tab Bảng xếp hạng của sảnh (spec v2.1 §4.2): dòng luật điểm, bục top 1, 2, 3 xếp 2 - 1 - 3 với bệ
 * vàng, bạc, đồng, rồi bảng từ hạng 4 tới hạng 50 (Hạng, Avatar, Người chơi, Điểm, Thắng/Ván). Dòng
 * của mình có nền xanh và "(bạn)"; ngoài top 50 thì thêm dòng "…" rồi dòng của mình với đúng hạng.
 */
import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { FlashbackLeaderboardRow } from "./flashback-api"
import { PlayerAvatar } from "./flashback-avatar"
import { LEADERBOARD_NOTE, formatNumber } from "./flashback-model"
import { useLeaderboard } from "./use-flashback-progress"

/** Cột của bảng từ hạng 4: Hạng, Avatar, Người chơi, Điểm, Thắng/Ván. */
const COLUMNS = "grid-cols-[28px_32px_minmax(0,1fr)_64px_72px] sm:grid-cols-[40px_36px_minmax(0,1fr)_88px_88px]"

/** Bệ đỡ của hạng 1, 2, 3: màu và chiều cao (thấp dần). */
const PEDESTAL: Record<1 | 2 | 3, string> = {
  1: "h-[100px] bg-crown-gold sm:h-[130px]",
  2: "h-[76px] bg-crown-silver sm:h-[96px]",
  3: "h-[58px] bg-crown-bronze sm:h-[72px]",
}

export function LeaderboardTab() {
  const query = useLeaderboard()
  const board = query.data

  if (!board) {
    if (query.isError) {
      return (
        <PanelState
          title="Chưa tải được bảng xếp hạng"
          description="Kiểm tra kết nối rồi thử lại."
          descriptionClassName="text-foreground"
          action={{ label: "Thử lại", onClick: () => void query.refetch() }}
        />
      )
    }
    return (
      <div className="space-y-3" role="status" aria-label="Đang tải bảng xếp hạng">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const byRank = new Map(board.rows.map((row) => [row.rank, row]))
  const rest = board.rows.filter((row) => row.rank > 3)

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-3.5" data-testid="flashback-leaderboard">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="font-heading text-lg font-bold">Bảng xếp hạng</h3>
        <p className="m-0 text-[13px] font-semibold text-text-secondary sm:ml-auto">{LEADERBOARD_NOTE}</p>
      </div>

      {board.rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-3 py-6 text-center text-sm font-semibold">
          Chưa có người chơi nào trên bảng xếp hạng
        </p>
      ) : (
        <>
          <section
            aria-label="Top 3"
            data-testid="flashback-podium"
            className="grid grid-cols-[1fr_1.1fr_1fr] items-end gap-1.5 overflow-hidden rounded-xl border border-border bg-card px-2 pt-7 sm:gap-3 sm:px-4 sm:pt-8"
          >
            {([2, 1, 3] as const).map((rank) => (
              <Pod key={rank} rank={rank} row={byRank.get(rank)} />
            ))}
          </section>

          {rest.length > 0 || board.me ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card p-1.5">
              <div
                className={cn("grid items-center gap-2 px-2 py-1.5 text-xs font-semibold text-text-secondary", COLUMNS)}
                aria-hidden="true"
              >
                <span className="text-center">Hạng</span>
                <span />
                <span>Người chơi</span>
                <span className="text-right">Điểm</span>
                <span className="text-right">Thắng/Ván</span>
              </div>
              <ol className="m-0 flex max-h-[60vh] list-none flex-col gap-0.5 overflow-y-auto p-0" aria-label="Từ hạng 4">
                {rest.map((row) => (
                  <BoardRow key={row.user_id} row={row} />
                ))}
                {board.me ? (
                  <>
                    <li className="py-1 text-center text-text-secondary" aria-hidden="true">
                      …
                    </li>
                    <BoardRow row={board.me} />
                  </>
                ) : null}
              </ol>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

/** Một người trên bục: avatar lớn đội vương miện, ô cấp, tên (xanh nếu là mình), điểm và bệ đỡ ghi hạng. */
function Pod({ rank, row }: { rank: 1 | 2 | 3; row: FlashbackLeaderboardRow | undefined }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2.5" data-testid={`flashback-pod-${rank}`} data-me={row?.is_me ?? false}>
      <div className="flex min-h-[88px] min-w-0 max-w-full flex-col items-center gap-1 pt-4 text-center">
        {row ? (
          <>
            <PlayerAvatar
              name={row.name}
              avatarUrl={row.avatar_url}
              seed={row.user_id}
              size="xl"
              level={row.level}
              crown={row.crown ?? rank}
            />
            <b className={cn("max-w-[100px] truncate text-[13px] sm:max-w-[150px] sm:text-[15px]", row.is_me ? "text-primary" : "text-foreground")}>
              {row.name}
            </b>
            <span className="text-[13px] font-bold text-text-secondary tabular-nums">{formatNumber(row.points)} điểm</span>
          </>
        ) : (
          <span className="mt-6 text-sm font-semibold text-text-secondary">Chưa có</span>
        )}
      </div>
      <div
        className={cn(
          "flex w-full justify-center rounded-t-[10px] pt-2.5 font-heading text-3xl font-black text-crown-foreground",
          PEDESTAL[rank],
        )}
        aria-label={`Hạng ${rank}`}
        role="img"
      >
        {rank}
      </div>
    </div>
  )
}

function BoardRow({ row }: { row: FlashbackLeaderboardRow }) {
  return (
    <li
      data-me={row.is_me}
      data-testid="flashback-leaderboard-row"
      className={cn(
        "grid items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] tabular-nums",
        COLUMNS,
        row.is_me && "bg-primary/10 outline outline-1 outline-primary",
      )}
    >
      <span className="text-center font-black">{row.rank}</span>
      <PlayerAvatar
        name={row.name}
        avatarUrl={row.avatar_url}
        seed={row.user_id}
        className="size-[30px]"
        level={row.level}
        crown={row.crown}
      />
      <span className="truncate font-extrabold">
        {row.name}
        {row.is_me ? <span className="font-bold text-primary"> (bạn)</span> : null}
      </span>
      <b className="text-right">{formatNumber(row.points)}</b>
      <span className="text-right font-semibold">
        {formatNumber(row.wins)}/{formatNumber(row.games)}
      </span>
    </li>
  )
}
