/**
 * Sảnh Flashback (spec v2 §2): thanh trên (nhập ID phòng, Chơi phòng bất kỳ, Tạo phòng), bộ lọc
 * Tất cả · Đang chờ · Đang chơi và danh sách phòng tự làm mới mỗi vài giây. Vùng chính rộng hết cỡ,
 * không có panel phải.
 */
import { useState, type FormEvent } from "react"
import { Lock, Plus } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { COIN_TEXT } from "../shop/shop-ui"
import type { FlashbackRoomFilter, FlashbackRoomListItem } from "./flashback-api"
import { useFlashback } from "./flashback-context"
import { PlayerAvatar } from "./flashback-avatar"
import { CreateRoomDialog, PasswordDialog } from "./flashback-room-dialogs"
import { formatNumber } from "./flashback-model"

const FILTERS: { id: FlashbackRoomFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "waiting", label: "Đang chờ" },
  { id: "playing", label: "Đang chơi" },
]

/** Cột của dòng phòng từ màn hình vừa trở lên: ID, chủ phòng, thiết lập, người chơi, cược, nút. */
const ROW_COLUMNS = "md:grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.5fr)_96px_120px_96px]"

export function FlashbackLobby() {
  const { lobby } = useFlashback()
  const [roomId, setRoomId] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)

  async function submitRoomId(event: FormEvent) {
    event.preventDefault()
    const outcome = await lobby.joinById(roomId)
    if (outcome?.status === "password") setPasswordFor(roomId.trim())
  }

  async function enter(room: FlashbackRoomListItem) {
    if (room.locked) {
      setPasswordFor(room.id)
      return
    }
    const outcome = await lobby.join(room.id)
    // Danh sách chưa kịp cập nhật: phòng vừa được đặt mật khẩu.
    if (outcome.status === "password") setPasswordFor(room.id)
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-3">
      <h2 className="font-heading text-xl font-bold">Flashback</h2>

      <section
        aria-label="Vào phòng"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
      >
        <form
          onSubmit={(event) => void submitRoomId(event)}
          className="flex min-w-0 flex-1 basis-[280px] items-center gap-2"
          noValidate
        >
          <Label htmlFor="flashback-room-id" className="sr-only">
            ID phòng
          </Label>
          <Input
            id="flashback-room-id"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="Nhập ID phòng"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            className="max-w-[220px] tabular-nums placeholder:text-text-secondary"
          />
          <Button type="submit" disabled={lobby.busy}>
            Vào phòng
          </Button>
        </form>
        <div className="flex flex-wrap gap-2 max-[480px]:w-full max-[480px]:[&>button]:flex-1">
          <Button type="button" variant="outline" disabled={lobby.busy} onClick={lobby.randomJoin}>
            Chơi phòng bất kỳ
          </Button>
          <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            Tạo phòng
          </Button>
        </div>
      </section>

      <div role="group" aria-label="Lọc phòng" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={lobby.filter === item.id ? "default" : "outline"}
            aria-pressed={lobby.filter === item.id}
            onClick={() => lobby.setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <RoomList rooms={lobby.rooms} loading={lobby.loading} failed={lobby.failed} busy={lobby.busy} onEnter={(room) => void enter(room)} />

      {createOpen ? (
        <CreateRoomDialog
          balance={lobby.balance}
          onCreate={lobby.createRoom}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
      {passwordFor !== null ? (
        <PasswordDialog
          code={passwordFor}
          onJoin={(password) => lobby.join(passwordFor, password)}
          onClose={() => setPasswordFor(null)}
        />
      ) : null}
    </div>
  )
}

function RoomList({
  rooms,
  loading,
  failed,
  busy,
  onEnter,
}: {
  rooms: FlashbackRoomListItem[] | undefined
  loading: boolean
  failed: boolean
  busy: boolean
  onEnter: (room: FlashbackRoomListItem) => void
}) {
  if (failed) {
    return (
      <PanelState
        title="Chưa tải được danh sách phòng"
        description="Danh sách tự thử lại sau vài giây."
        descriptionClassName="text-foreground"
        loading
      />
    )
  }
  return (
    <section aria-label="Danh sách phòng" className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={cn(
          "hidden items-center gap-3 border-b border-border px-3 py-2 text-xs font-semibold text-text-secondary md:grid",
          ROW_COLUMNS,
        )}
        aria-hidden="true"
      >
        <span>ID phòng</span>
        <span>Chủ phòng</span>
        <span>Phiên xem / chơi · thời gian</span>
        <span>Người chơi</span>
        <span>Cược</span>
        <span />
      </div>
      {loading && !rooms ? (
        <div className="space-y-2 p-3" role="status" aria-label="Đang tải danh sách phòng">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rooms && rooms.length > 0 ? (
        <ul className="m-0 list-none divide-y divide-border p-0">
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} busy={busy} onEnter={onEnter} />
          ))}
        </ul>
      ) : (
        <p className="px-3 py-6 text-center text-sm font-semibold text-foreground">Không có phòng phù hợp</p>
      )}
    </section>
  )
}

function RoomRow({
  room,
  busy,
  onEnter,
}: {
  room: FlashbackRoomListItem
  busy: boolean
  onEnter: (room: FlashbackRoomListItem) => void
}) {
  return (
    <li
      className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5", ROW_COLUMNS)}
      data-testid="flashback-room-row"
    >
      <span className="col-start-1 row-start-1 flex items-center gap-1.5 font-heading text-base font-bold tabular-nums md:col-auto md:row-auto">
        {room.id}
        {room.locked ? <Lock className="size-4 shrink-0" role="img" aria-label="Phòng có mật khẩu" /> : null}
      </span>
      <span className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 md:col-auto md:row-auto">
        <PlayerAvatar name={room.owner.name} avatarUrl={room.owner.avatar_url} seed={room.owner.name} size="sm" />
        <span className="truncate text-sm font-semibold">{room.owner.name}</span>
      </span>
      <span className="col-span-2 row-start-3 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] font-semibold md:contents md:text-sm">
        <span className="tabular-nums">
          {room.view_bars} / {room.play_bars} phiên · {room.minutes} phút
        </span>
        <span className="tabular-nums">
          {room.member_count}/{room.max_players} người
        </span>
        {room.stake_xu > 0 ? (
          <span className={cn("tabular-nums", COIN_TEXT)}>{formatNumber(room.stake_xu)} xu</span>
        ) : (
          <span>Không cược</span>
        )}
      </span>
      <span className="col-start-2 row-span-2 row-start-1 flex justify-end md:col-auto md:row-auto md:row-span-1">
        {room.status === "playing" ? (
          <span className="text-sm font-semibold">Đang chơi</span>
        ) : room.full ? (
          <span className="text-sm font-semibold">Đủ người</span>
        ) : (
          <Button type="button" size="sm" disabled={busy} aria-label={`Vào phòng ${room.id}`} onClick={() => onEnter(room)}>
            Vào
          </Button>
        )}
      </span>
    </li>
  )
}
