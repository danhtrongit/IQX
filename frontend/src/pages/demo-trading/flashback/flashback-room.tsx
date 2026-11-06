/**
 * Phòng chờ Flashback (spec v2 §4, v2.1 §1, v2.4 §3.2 và §5): ID phòng cỡ lớn kèm ổ khoá, nút Sao chép ID, 4 ô thông
 * số, các ô người chơi (bằng số người tối đa, tối thiểu 4; từ 9 người trở lên ô thu nhỏ, lưới 6 cột
 * và cuộn trong khung; mỗi ô có avatar kèm cấp và vương miện, v2.1 §3.3 và §4.3), Rời phòng và Bắt
 * đầu (chỉ chủ phòng, mở khi mọi người đã Sẵn sàng). Thanh gọi nhóm (v2.5) nằm ngay dưới ID phòng.
 *
 * Máy tính: khung chat luôn mở ở cột phải. Điện thoại: Rời phòng, Chat và Sẵn sàng hoặc Bắt đầu ghim ở
 * đáy màn hình (danh sách người chơi dài không đẩy chúng khuất đi), Chat mở khung kéo từ dưới lên.
 */
import { useState } from "react"
import { Copy, Lock, UserX } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { useWorkspaceOverlay } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { COIN_TEXT } from "../shop/shop-ui"
import type { FlashbackRoom, FlashbackRoomMember } from "./flashback-api"
import { FlashbackCallBar } from "./flashback-call-bar"
import { ChatUnreadBadge, FlashbackChatBox } from "./flashback-chat"
import { FlashbackChatSheet } from "./flashback-chat-sheet"
import { useFlashback } from "./flashback-context"
import { useChatOpener } from "./use-flashback-chat"
import { PlayerAvatar } from "./flashback-avatar"
import { KickMemberDialog } from "./flashback-room-dialogs"
import { ROOM_MANY_PLAYERS, formatNumber, roomReadiness, roomSlotCount } from "./flashback-model"

type KickTarget = { userId: string; name: string }

const ACTION_BUTTON = "flex-1 max-[900px]:h-9 min-[901px]:flex-none"
const ACTION_HINT = "w-full text-[13px] font-semibold max-[900px]:order-first min-[901px]:w-auto"

export function FlashbackRoomScreen() {
  const { room: api, chat } = useFlashback()
  const room = api.room
  const [kickTarget, setKickTarget] = useState<KickTarget | null>(null)
  const overlay = useWorkspaceOverlay()
  const openChat = useChatOpener(chat)

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
  const me = room.members.find((member) => member.is_me)
  const readiness = roomReadiness(room)
  // Đuổi người chỉ ở phòng chờ (màn này chỉ hiện khi phòng đang chờ) và chỉ chủ phòng.
  const canKick = room.is_owner && room.status === "waiting"
  return (
    <div
      className={cn(
        "mx-auto grid w-full items-start gap-3 max-[900px]:pb-28",
        chat.enabled ? "max-w-[1240px] min-[901px]:grid-cols-[minmax(0,1fr)_360px]" : "max-w-[820px]",
      )}
    >
      <div className="min-w-0 space-y-3">
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
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
        <span className="ml-auto text-[13px] font-semibold tabular-nums" data-testid="flashback-room-summary">
          {readiness.summary}
        </span>
      </section>

      <FlashbackCallBar inMatch={false} />

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

      {/* Phòng đông (từ 9 người): lưới thu nhỏ cuộn bằng ScrollArea (DESIGN: không dùng thanh cuộn mặc định).
          Cuộn hết lưới thì cuộn tiếp ra trang, không kẹt ở trong lưới trên điện thoại. */}
      <ScrollArea className={compact ? "max-h-[52vh]" : undefined} viewportClassName="overscroll-auto">
      <section
        aria-label="Người chơi"
        data-testid="flashback-slots"
        data-compact={compact}
        className={cn(
          "grid gap-2.5",
          compact ? "grid-cols-3 gap-2 pr-2.5 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {Array.from({ length: roomSlotCount(room.max_players) }, (_, index) => (
          <Slot
            key={index}
            room={room}
            index={index}
            compact={compact}
            onKick={canKick ? (member) => setKickTarget({ userId: member.user_id, name: member.name }) : undefined}
          />
        ))}
      </section>
      </ScrollArea>

      {/* Điện thoại: ghim ở đáy màn hình như thanh nút của màn chơi. */}
      <div
        className="flex flex-wrap items-center gap-2 max-[900px]:fixed max-[900px]:inset-x-0 max-[900px]:bottom-0 max-[900px]:z-20 max-[900px]:border-t max-[900px]:border-border max-[900px]:bg-card/95 max-[900px]:px-3 max-[900px]:py-2 max-[900px]:backdrop-blur"
        data-testid="flashback-room-actions"
      >
        <Button type="button" variant="outline" className={ACTION_BUTTON} disabled={api.leaveBusy} onClick={api.leave}>
          Rời phòng
        </Button>
        {chat.enabled && overlay ? (
          <Button
            type="button"
            variant="outline"
            className={cn(ACTION_BUTTON, "relative")}
            aria-pressed={chat.open}
            data-testid="flashback-chat-room-mobile"
            onClick={() => openChat(!chat.open)}
          >
            Chat
            <ChatUnreadBadge count={chat.unread} />
          </Button>
        ) : null}
        {me && !room.is_owner ? (
          <>
            <Button
              type="button"
              variant="outline"
              className={cn(
                ACTION_BUTTON,
                me.ready
                  ? "border-emerald-600 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
                  : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white dark:bg-emerald-600 dark:hover:bg-emerald-700",
              )}
              disabled={api.readyBusy}
              aria-pressed={me.ready}
              onClick={() => api.setReady(!me.ready)}
            >
              {me.ready ? (
                <>
                  ✓ Đã sẵn sàng<span className="max-[400px]:hidden"> · Huỷ</span>
                </>
              ) : (
                "Sẵn sàng"
              )}
            </Button>
            <span className={ACTION_HINT} data-testid="flashback-ready-hint" role="status">
              {readiness.playerHint}
            </span>
          </>
        ) : null}
        {room.is_owner ? (
          <>
            <Button
              type="button"
              className={ACTION_BUTTON}
              aria-label={readiness.startLabel}
              disabled={api.startBusy || readiness.waiting > 0}
              onClick={api.start}
            >
              {readiness.waiting > 0 ? (
                <>
                  Bắt đầu<span className="max-[400px]:hidden"> (chờ {readiness.waiting} người)</span>
                </>
              ) : (
                readiness.startLabel
              )}
            </Button>
            <span className={ACTION_HINT} data-testid="flashback-ready-hint" role="status">
              {readiness.ownerHint}
            </span>
          </>
        ) : null}
      </div>
      </div>

      {chat.enabled && !overlay ? <FlashbackChatBox chat={chat} inMatch={false} className="h-[600px]" /> : null}
      {overlay ? <FlashbackChatSheet chat={chat} inMatch={false} /> : null}

      {kickTarget ? (
        <KickMemberDialog
          name={kickTarget.name}
          busy={api.kickBusy}
          onClose={() => setKickTarget(null)}
          onConfirm={() => {
            api.kick(kickTarget.userId)
            setKickTarget(null)
          }}
        />
      ) : null}
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

function Slot({
  room,
  index,
  compact,
  onKick,
}: {
  room: FlashbackRoom
  index: number
  compact: boolean
  onKick?: (member: FlashbackRoomMember) => void
}) {
  const member = room.members[index]
  if (member) {
    return (
      <div
        className={cn(
          "relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border bg-card text-center",
          compact ? "min-h-[92px] px-1.5 py-2.5" : "px-2 py-3",
          member.ready && !member.is_owner
            ? "border-emerald-600 ring-1 ring-emerald-600"
            : member.is_me
              ? "border-primary"
              : "border-border",
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
            👑 Chủ phòng
          </span>
        ) : member.ready ? (
          <span
            className="rounded-sm bg-emerald-600/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
            data-testid="flashback-ready-badge"
          >
            ✓ Sẵn sàng
          </span>
        ) : (
          <span
            className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive"
            data-testid="flashback-unready-badge"
          >
            Chưa sẵn sàng
          </span>
        )}
        {onKick && !member.is_owner && !member.is_me ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1 right-1 text-text-secondary hover:text-destructive"
            aria-label={`Đuổi ${member.name} khỏi phòng`}
            onClick={() => onKick(member)}
          >
            <UserX aria-hidden="true" />
          </Button>
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
