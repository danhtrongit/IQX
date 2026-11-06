/**
 * Thanh gọi nhóm của phòng Flashback (phòng chờ và trong ván). Một hàng gọn: chưa vào thì chỉ có nút "Tham gia gọi"; đã vào
 * thì hàng các avatar (ai đang nói có viền sáng, ai tắt mic có biểu tượng gạch chéo, ai bật camera thì avatar là hình trực
 * tiếp) và các nút Mic, Camera, Chia sẻ màn hình (ẩn khi trình duyệt không có `getDisplayMedia`), Mở rộng, Rời.
 *
 * Mở rộng ra dưới hàng: màn hình đang được chia sẻ hiện lớn, rồi lưới ô video của mọi người, mỗi ô có nút tắt tiếng riêng
 * cho phía mình. Thanh nằm trong dòng chảy của trang (không phủ lên biểu đồ hay khung đặt lệnh), trên điện thoại chỉ là một
 * hàng cao 52px khi thu gọn. Tiếng của mọi người phát bằng phần tử audio ẩn, có mặt cả khi thu gọn.
 */
import { useEffect, useRef, type ReactNode } from "react"
import {
  ChevronDown,
  ChevronUp,
  Headphones,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { CALL_TEXT } from "./flashback-call-model"
import type { CallPersonView } from "./flashback-call-engine"
import type { FlashbackRoomMember } from "./flashback-api"
import { PlayerAvatar } from "./flashback-avatar"
import { useFlashback } from "./flashback-context"
import type { CallApi } from "./use-flashback-call"

export function FlashbackCallBar({ inMatch, className }: { inMatch: boolean; className?: string }) {
  const { call, room } = useFlashback()
  if (!call.supported) return null
  const members = new Map<string, FlashbackRoomMember>((room.room?.members ?? []).map((member) => [member.user_id, member]))
  return <CallBar call={call} members={members} inMatch={inMatch} className={className} />
}

function CallBar({
  call,
  members,
  inMatch,
  className,
}: {
  call: CallApi
  members: Map<string, FlashbackRoomMember>
  inMatch: boolean
  className?: string
}) {
  const joined = call.status === "joined"
  const me = call.people.find((person) => person.me)
  const sharer = call.people.find((person) => person.media.screen)
  const expanded = joined && call.expanded
  const alone = call.people.length <= 1

  if (!joined) {
    return (
      <section
        aria-label="Gọi nhóm"
        data-testid="flashback-call"
        data-status={call.status}
        className={cn("flex min-h-[52px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2", className)}
      >
        <Headphones className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">Gọi nhóm trong phòng</span>
        <Button
          type="button"
          variant="outline"
          disabled={call.status === "joining"}
          data-testid="flashback-call-join"
          onClick={call.join}
        >
          {call.status === "joining" ? "Đang vào gọi" : "Tham gia gọi"}
        </Button>
      </section>
    )
  }

  return (
    <section
      aria-label="Gọi nhóm"
      data-testid="flashback-call"
      data-status={call.status}
      className={cn("rounded-lg border border-border bg-card", className)}
    >
      <div className="flex min-h-[52px] items-center gap-2 px-2.5 py-2">
        <ul
          aria-label="Người trong cuộc gọi"
          className="m-0 flex min-w-0 flex-1 list-none items-center gap-2 overflow-hidden p-0"
        >
          {call.people.map((person) => (
            <PersonChip key={person.userId} person={person} member={members.get(person.userId)} />
          ))}
          {alone ? <li className="truncate text-xs font-semibold text-text-secondary max-sm:hidden">Chưa có ai khác trong cuộc gọi</li> : null}
        </ul>
        <div className="flex shrink-0 items-center gap-1.5">
          <CallButton
            label={me?.media.audio ? "Tắt mic" : "Bật mic"}
            text="Mic"
            variant={me?.media.audio ? "outline" : "destructive"}
            icon={me?.media.audio ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
            disabled={call.busy.mic}
            testId="flashback-call-mic"
            onClick={call.toggleMic}
          />
          <CallButton
            label={me?.media.video ? "Tắt camera" : "Bật camera"}
            text="Camera"
            variant={me?.media.video ? "default" : "outline"}
            icon={me?.media.video ? <Video aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
            disabled={call.busy.camera}
            testId="flashback-call-camera"
            onClick={call.toggleCamera}
          />
          {call.canShare ? (
            <CallButton
              label={me?.media.screen ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}
              text="Chia sẻ"
              variant={me?.media.screen ? "default" : "outline"}
              icon={me?.media.screen ? <MonitorOff aria-hidden="true" /> : <MonitorUp aria-hidden="true" />}
              disabled={call.busy.screen}
              testId="flashback-call-screen-toggle"
              onClick={call.toggleScreen}
            />
          ) : null}
          <CallButton
            label={expanded ? "Thu gọn cuộc gọi" : "Mở rộng cuộc gọi"}
            text={expanded ? "Thu gọn" : "Mở rộng"}
            variant="ghost"
            icon={expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            testId="flashback-call-expand"
            expanded={expanded}
            onClick={() => call.setExpanded(!expanded)}
          />
          <CallButton
            label="Rời cuộc gọi"
            text="Rời"
            variant="destructive"
            icon={<PhoneOff aria-hidden="true" />}
            testId="flashback-call-leave"
            onClick={call.leave}
          />
        </div>
      </div>

      {me?.media.screen ? (
        <p className="border-t border-border px-3 py-1.5 text-xs font-semibold text-status-warning" role="status" data-testid="flashback-call-sharing">
          {inMatch ? CALL_TEXT.screenWarning : "Bạn đang chia sẻ màn hình cho cả phòng."}
        </p>
      ) : sharer && !expanded ? (
        <button
          type="button"
          className="block w-full truncate border-t border-border px-3 py-1.5 text-left text-xs font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          data-testid="flashback-call-watch"
          onClick={() => call.setExpanded(true)}
        >
          {sharer.name} đang chia sẻ màn hình. Bấm để xem.
        </button>
      ) : null}

      {expanded ? <ExpandedCall call={call} members={members} sharer={sharer} /> : null}

      {/* Tiếng của mọi người: phát cả khi thu gọn. */}
      <div className="sr-only" aria-hidden="true">
        {call.people
          .filter((person) => !person.me)
          .map((person) => (
            <StreamAudio key={person.userId} stream={person.audio} muted={person.muted} />
          ))}
      </div>
    </section>
  )
}

function CallButton({
  label,
  text,
  variant,
  icon,
  onClick,
  disabled,
  testId,
  expanded,
}: {
  label: string
  text: string
  variant: "outline" | "default" | "destructive" | "ghost"
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  testId: string
  expanded?: boolean
}) {
  return (
    <Button
      type="button"
      variant={variant}
      className="max-sm:size-9 max-sm:px-0"
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
    >
      {icon}
      <span className="max-sm:hidden">{text}</span>
    </Button>
  )
}

/** Avatar tròn của một người trong hàng thu gọn: hình trực tiếp nếu đang bật camera. */
function PersonChip({ person, member }: { person: CallPersonView; member: FlashbackRoomMember | undefined }) {
  const showVideo = person.media.video && person.camera !== null
  return (
    <li
      className="relative shrink-0"
      title={person.me ? `${person.name} (bạn)` : person.name}
      data-testid="flashback-call-person"
      data-user-id={person.userId}
      data-speaking={person.speaking}
      data-mic={person.media.audio}
      data-video={person.media.video}
    >
      <span
        className={cn(
          "relative grid size-9 place-items-center overflow-hidden rounded-full bg-muted ring-2 ring-transparent transition-shadow duration-150",
          person.speaking && "ring-primary",
        )}
      >
        {/* Avatar nằm dưới: hình trực tiếp (trong suốt tới khi có khung hình đầu) phủ lên trên. */}
        <PlayerAvatar name={person.name} avatarUrl={member?.avatar_url ?? null} seed={person.userId} className="size-9" />
        {showVideo ? (
          <StreamVideo stream={person.camera} mirrored={person.me} className="absolute inset-0 size-full object-cover" />
        ) : null}
      </span>
      {!person.media.audio ? (
        <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full border border-border bg-card text-destructive">
          <MicOff className="size-2.5" aria-hidden="true" />
        </span>
      ) : null}
      <span className="sr-only">
        {person.name}
        {person.me ? " (bạn)" : ""}
        {person.speaking ? ", đang nói" : ""}
        {person.media.audio ? "" : ", đã tắt mic"}
      </span>
    </li>
  )
}

function ExpandedCall({
  call,
  members,
  sharer,
}: {
  call: CallApi
  members: Map<string, FlashbackRoomMember>
  sharer: CallPersonView | undefined
}) {
  return (
    <div className="space-y-2 border-t border-border p-2.5" data-testid="flashback-call-expanded">
      {sharer ? (
        <div className="space-y-1" data-testid="flashback-call-screen">
          <p className="text-xs font-semibold text-text-secondary">
            {sharer.me ? "Bạn đang chia sẻ màn hình" : `Màn hình của ${sharer.name}`}
          </p>
          {sharer.me ? null : (
            <StreamVideo
              stream={sharer.screen}
              className="aspect-video max-h-[46dvh] w-full rounded-md border border-border bg-muted object-contain"
            />
          )}
        </div>
      ) : null}
      <ScrollArea className="max-h-[40dvh]" viewportClassName="overscroll-auto">
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 pr-2.5 sm:grid-cols-3 min-[901px]:grid-cols-4">
          {call.people.map((person) => (
            <PersonTile
              key={person.userId}
              person={person}
              member={members.get(person.userId)}
              onMute={(muted) => call.setPeerMuted(person.userId, muted)}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}

function PersonTile({
  person,
  member,
  onMute,
}: {
  person: CallPersonView
  member: FlashbackRoomMember | undefined
  onMute: (muted: boolean) => void
}) {
  const showVideo = person.media.video && person.camera !== null
  return (
    <li
      className={cn(
        "relative aspect-video min-w-0 overflow-hidden rounded-md border bg-muted",
        person.speaking ? "border-primary ring-2 ring-primary" : "border-border",
      )}
      data-testid="flashback-call-tile"
      data-user-id={person.userId}
      data-speaking={person.speaking}
    >
      <div className="grid size-full place-items-center">
        <PlayerAvatar name={person.name} avatarUrl={member?.avatar_url ?? null} seed={person.userId} className="size-11" />
      </div>
      {showVideo ? (
        <StreamVideo stream={person.camera} mirrored={person.me} className="absolute inset-0 size-full object-cover" />
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/80 px-1.5 py-0.5 text-xs font-semibold">
        {!person.media.audio ? <MicOff className="size-3 shrink-0 text-destructive" aria-label="Đã tắt mic" /> : null}
        <span className="min-w-0 flex-1 truncate">
          {person.name}
          {person.me ? " (bạn)" : ""}
        </span>
        {person.connection === "connecting" ? <span className="shrink-0 text-text-secondary">Đang kết nối</span> : null}
        {person.connection === "failed" ? <span className="shrink-0 text-destructive">Mất kết nối</span> : null}
      </div>
      {person.me ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1 right-1 bg-background/80"
          aria-label={person.muted ? `Bật tiếng ${person.name}` : `Tắt tiếng ${person.name}`}
          title={person.muted ? `Bật tiếng ${person.name}` : `Tắt tiếng ${person.name}`}
          data-testid="flashback-call-peer-mute"
          onClick={() => onMute(!person.muted)}
        >
          {person.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </Button>
      )}
    </li>
  )
}

/** Phát một phần tử media; trình duyệt chặn tự phát (Safari) thì thử lại ở lần chạm kế tiếp của người dùng. */
function playMedia(element: HTMLMediaElement) {
  if (typeof element.play !== "function") return
  void Promise.resolve(element.play()).catch(() => {
    const retry = () => void Promise.resolve(element.play()).catch(() => undefined)
    document.addEventListener("pointerdown", retry, { once: true })
  })
}

/** Video không tiếng (tiếng phát riêng bằng `StreamAudio`); `mirrored` để camera của mình hiện như soi gương. */
function StreamVideo({ stream, className, mirrored }: { stream: MediaStream | null; className?: string; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (element.srcObject !== stream) element.srcObject = stream
    if (stream) playMedia(element)
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted className={cn(className, mirrored && "-scale-x-100")} />
}

function StreamAudio({ stream, muted }: { stream: MediaStream | null; muted: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.muted = muted
    if (element.srcObject !== stream) element.srcObject = stream
    if (stream) playMedia(element)
  }, [stream, muted])
  return <audio ref={ref} autoPlay muted={muted} data-testid="flashback-call-audio" data-muted={muted} />
}
