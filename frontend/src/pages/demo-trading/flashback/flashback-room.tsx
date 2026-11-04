/**
 * Phòng chờ Flashback (spec v2 §4, v2.1 §1): ID phòng cỡ lớn kèm ổ khoá, nút Sao chép ID, 4 ô thông
 * số, các ô người chơi (bằng số người tối đa, tối thiểu 4; từ 9 người trở lên ô thu nhỏ, lưới 6 cột
 * và cuộn trong khung; mỗi ô có avatar kèm cấp và vương miện, v2.1 §3.3 và §4.3), Rời phòng và Bắt
 * đầu (chỉ chủ phòng). Không có khung hướng dẫn hay chữ giải thích.
 */
import { Copy, Lock } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { COIN_TEXT } from "../shop/shop-ui"
import type { FlashbackRoom } from "./flashback-api"
import { useFlashback } from "./flashback-context"
import { PlayerAvatar } from "./flashback-avatar"
import { ROOM_MANY_PLAYERS, formatNumber, roomSlotCount } from "./flashback-model"

export function FlashbackRoomScreen() {
  const { room: api } = useFlashback()
  const room = api.room

  if (!room) {
    if (api.failed) {
      return (
        <PanelState
          title="Chưa tải được phòng"
          description="Phòng tự thử lại sau vài giây."
          descriptionClassName="text-foreground"
          loading
        />
      )
    }
    return (
      <div className="mx-auto w-full max-w-[820px] space-y-3" role="status" aria-label="Đang tải phòng">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  const compact = room.max_players >= ROOM_MANY_PLAYERS
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <h2
          className="flex items-center gap-2.5 font-heading text-4xl font-extrabold tracking-wide tabular-nums"
          aria-label={`Phòng ${room.id}`}
          data-testid="flashback-room-id"
        >
          {room.id}
          {room.locked ? (
            <Lock className="size-5 text-amber-700 dark:text-chart-2" role="img" aria-label="Phòng có mật khẩu" />
          ) : null}
        </h2>
        <Button type="button" variant="outline" onClick={api.copyId}>
          <Copy aria-hidden="true" />
          Sao chép ID
        </Button>
      </section>

      <section aria-label="Thông số phòng" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile label="Phiên xem" value={String(room.view_bars)} />
        <Tile label="Phiên chơi" value={String(room.play_bars)} />
        <Tile label="Thời gian" value={`${room.minutes} phút`} />
        <Tile
          label="Cược"
          value={room.stake_xu > 0 ? `${formatNumber(room.stake_xu)} xu` : "Không cược"}
          valueClassName={room.stake_xu > 0 ? COIN_TEXT : undefined}
        />
      </section>

      <section
        aria-label="Người chơi"
        data-testid="flashback-slots"
        data-compact={compact}
        className={cn(
          "grid gap-2.5",
          compact ? "max-h-[52vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {Array.from({ length: roomSlotCount(room.max_players) }, (_, index) => (
          <Slot key={index} room={room} index={index} compact={compact} />
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="flex-1 sm:flex-none" disabled={api.leaveBusy} onClick={api.leave}>
          Rời phòng
        </Button>
        {room.is_owner ? (
          <Button type="button" className="flex-1 sm:flex-none" disabled={api.startBusy} onClick={api.start}>
            Bắt đầu
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Tile({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <span className="block text-[11px] font-semibold text-text-secondary">{label}</span>
      <b className={cn("mt-1 block truncate font-heading text-lg font-bold tabular-nums", valueClassName)}>{value}</b>
    </div>
  )
}

function Slot({ room, index, compact }: { room: FlashbackRoom; index: number; compact: boolean }) {
  const member = room.members[index]
  if (member) {
    return (
      <div
        className={cn(
          "flex min-w-0 flex-col items-center gap-1.5 rounded-lg border bg-card text-center",
          compact ? "min-h-[92px] px-1.5 py-2.5" : "px-2 py-3",
          member.is_me ? "border-primary" : "border-border",
        )}
        data-testid="flashback-slot"
      >
        <PlayerAvatar
          name={member.name}
          avatarUrl={member.avatar_url}
          seed={member.user_id}
          className={compact ? "size-[34px]" : "size-12"}
          wrapperClassName="mt-1.5"
          level={member.level}
          crown={member.crown}
        />
        <b className="w-full truncate text-sm font-bold">{member.name}</b>
        {member.is_owner ? (
          <span className="rounded-sm bg-chart-2/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-chart-2">
            Chủ phòng
          </span>
        ) : null}
      </div>
    )
  }
  if (index < room.max_players) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border px-2 py-3 text-center text-sm font-semibold",
          compact ? "min-h-[92px] text-xs" : "min-h-[112px]",
        )}
        data-testid="flashback-slot-empty"
      >
        Đang chờ người chơi
      </div>
    )
  }
  return (
    <div
      className="flex min-h-[112px] items-center justify-center rounded-lg border border-dashed border-border px-2 py-3 text-center text-sm font-semibold opacity-40"
      data-testid="flashback-slot-off"
      aria-hidden="true"
    >
      —
    </div>
  )
}
