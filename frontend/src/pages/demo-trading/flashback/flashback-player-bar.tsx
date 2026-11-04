/**
 * Thanh người chơi của màn chơi Flashback (spec v2.1 §6, thay v2 §6.1): một khung hai hàng.
 *
 * Hàng trên: nút biểu cảm, "{n} người chơi · {m} đã xong" (điện thoại "{n} người · {m} xong") và đồng
 * hồ chung ở giữa. Hàng dưới: thẻ người chơi xếp một hàng, cuộn ngang, mình luôn đứng đầu, vị trí cuộn
 * được giữ nguyên khi thanh cập nhật (danh sách không bị dựng lại). Trong lúc chơi KHÔNG hiện % lợi
 * nhuận của ai và không có viền dẫn đầu; chỉ "Đang chơi · phiên/tổng" hoặc "✓ Đã xong" (viền và dấu
 * xanh lá). Khi ván kết thúc dòng trạng thái đổi thành % lợi nhuận, người hạng 1 có viền vàng.
 *
 * Biểu cảm hiện to ở avatar người gửi, bay xuống nhẹ rồi mờ dần trong khoảng 2,5 giây. Bong bóng nằm
 * trong thẻ của người gửi nên thẻ bị cuộn khuất thì bong bóng cũng không hiện.
 */
import { useEffect, useState } from "react"
import { Check, Smile } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { FlashbackPlayer } from "./flashback-api"
import { PlayerAvatar } from "./flashback-avatar"
import type { MatchApi, ReactionBubble } from "./flashback-context"
import {
  FLASHBACK_LOW_TIME_MS,
  REACTION_EMOJIS,
  clockText,
  finishedCount,
  leaderIds,
  orderPlayers,
  playerStatus,
} from "./flashback-model"

export function PlayerBar({ match }: { match: MatchApi }) {
  const players = orderPlayers(match.players)
  const leaders = leaderIds(match.players)
  const done = finishedCount(match.players)
  return (
    <section aria-label="Người chơi" className="min-w-0 max-w-full space-y-1 rounded-lg border border-border bg-card p-2 min-[901px]:p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {match.canReact ? <ReactionPicker onPick={match.sendReaction} /> : null}
          <span className="min-w-0 truncate text-xs font-semibold text-text-secondary sm:text-[13px]" data-testid="flashback-player-count">
            <b className="text-foreground">{players.length}</b>
            {" người"}
            <span className="max-sm:hidden">{" chơi"}</span>
            {match.ended ? null : (
              <>
                {" · "}
                <b className="text-foreground">{done}</b>
                <span className="max-sm:hidden">{" đã"}</span>
                {" xong"}
              </>
            )}
          </span>
        </div>
        <MatchClock clock={match.clock} ended={match.ended} onExpire={match.expireClock} />
        <div className="flex-1" aria-hidden="true" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pt-2.5 pb-1" data-testid="flashback-player-list">
        {players.map((player) => (
          <PlayerCell
            key={player.user_id}
            player={player}
            playBars={match.playBars}
            leader={leaders.has(player.user_id)}
            bubbles={match.bubbles.filter((bubble) => bubble.userId === player.user_id)}
          />
        ))}
      </div>
    </section>
  )
}

function PlayerCell({
  player,
  playBars,
  leader,
  bubbles,
}: {
  player: FlashbackPlayer
  playBars: number
  leader: boolean
  bubbles: ReactionBubble[]
}) {
  // Trong lúc chơi không hiện % của ai, chỉ "Đang chơi · phiên/tổng" hoặc "✓ Đã xong" (v2.1 §6.2).
  const status = playerStatus(player, playBars)
  const done = status.kind === "done"
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md py-1 pr-2.5 pl-2 min-[901px]:gap-2.5",
        player.is_me ? "bg-primary/10" : "bg-muted/60",
      )}
      data-testid="flashback-player"
      data-me={player.is_me}
      data-leader={leader}
      data-status={status.kind}
    >
      <span className="relative shrink-0">
        <PlayerAvatar
          name={player.name}
          avatarUrl={player.avatar_url}
          seed={player.user_id}
          level={player.level}
          crown={player.crown}
          className={cn("size-7 min-[901px]:size-[34px]", leader && "ring-[3px] ring-chart-2", done && "ring-[3px] ring-price-up")}
        />
        {done ? (
          <span
            className="absolute -right-1 -bottom-1 z-10 grid size-3.5 place-items-center rounded-full bg-price-up text-card"
            data-testid="flashback-player-done"
          >
            <Check className="size-2.5" strokeWidth={4} aria-hidden="true" />
          </span>
        ) : null}
        {bubbles.map((bubble) => (
          <span
            key={bubble.key}
            aria-hidden="true"
            data-testid="flashback-reaction"
            data-emoji={bubble.emoji}
            className="fb-reaction pointer-events-none absolute top-1/2 left-1/2 z-20 text-[26px] leading-none"
            style={{ animationDelay: `-${Math.max(0, Math.round(bubble.ageMs))}ms` }}
          >
            {bubble.emoji}
          </span>
        ))}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="max-w-[96px] truncate text-[13px] font-extrabold min-[901px]:max-w-[130px] min-[901px]:text-sm">
          {player.name}
          {leader ? <span className="sr-only"> đang dẫn đầu</span> : null}
        </b>
        <span
          className={cn(
            "self-start rounded-sm px-1.5 py-0.5 text-xs leading-none font-extrabold whitespace-nowrap tabular-nums",
            status.kind === "result"
              ? status.percent > 0
                ? "bg-price-up text-card"
                : status.percent < 0
                  ? "bg-price-down text-card"
                  : "bg-muted text-foreground"
              : done
                ? "bg-price-up/15 text-price-up"
                : "bg-muted text-foreground",
          )}
          data-testid="flashback-player-status"
        >
          {status.text}
        </span>
      </div>
    </div>
  )
}

/** Nút biểu cảm và bảng 12 biểu cảm xếp 6 cột; bấm ra ngoài hoặc chọn một biểu cảm thì bảng đóng (v2.1 §6.4). */
function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          aria-label="Gửi biểu cảm"
          title="Gửi biểu cảm"
          data-testid="flashback-reaction-button"
        >
          <Smile className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-auto grid-cols-6 gap-1 p-2" data-testid="flashback-reaction-picker">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Gửi ${emoji}`}
            data-testid="flashback-reaction-option"
            className="grid size-9 place-items-center rounded-md text-[22px] leading-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            onClick={() => {
              setOpen(false)
              onPick(emoji)
            }}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Đồng hồ chung của phòng: mm:ss ở giữa thanh, đỏ khi còn dưới 1 phút, "Kết thúc" khi hết ván. */
function MatchClock({
  clock,
  ended,
  onExpire,
}: {
  clock: MatchApi["clock"]
  ended: boolean
  onExpire: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (ended) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ended])

  const remaining = Math.max(0, clock.remainingMs - Math.max(0, now - clock.receivedAt))
  const expired = !ended && remaining <= 0
  // Hết giờ theo đồng hồ: hỏi server ngay để biết ván đã kết thúc chưa.
  useEffect(() => {
    if (expired) onExpire()
  }, [expired, onExpire])

  const low = !ended && remaining < FLASHBACK_LOW_TIME_MS
  return (
    <div className="flex shrink-0 items-center justify-center" data-testid="flashback-clock" data-low={low} role="timer" aria-label="Thời gian còn lại">
      <b
        className={cn(
          "font-heading text-lg font-black tabular-nums min-[901px]:text-[22px]",
          low ? "text-destructive" : "text-foreground",
        )}
      >
        {ended ? "Kết thúc" : clockText(remaining)}
      </b>
    </div>
  )
}
