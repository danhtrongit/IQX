/**
 * Khung chat phòng của Flashback (spec v2.4 §3.2, §3.3): tiêu đề, danh sách tin (mỗi tin có tên người
 * gửi, nhãn "Phòng chờ" hoặc "Phiên N", bong bóng chữ; tin của mình bên phải), hàng câu nhanh, ô nhập
 * tối đa 200 ký tự. Bấm tên người gửi mở menu Tắt tiếng / Báo cáo.
 */
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react"
import { ImagePlus, Loader2, MessageCircle, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { dragHasFiles, IMAGE_NOT_SUPPORTED, imageFromClipboard, imageFromDrop, mergeTimeline, type ChatImageItem } from "./chat-image"
import { ChatImageBubble, ChatImageViewer } from "./flashback-chat-image"
import type { FlashbackChatMessage } from "./flashback-api"
import type { ChatApi } from "./flashback-context"
import { CHAT_MAX_LENGTH, CHAT_QUICK_REPLIES, chatMessageLabel } from "./flashback-model"
import { useChatOpener } from "./use-flashback-chat"

/** Số tin chưa đọc gắn ở góc nút Chat. */
export function ChatUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[11px] leading-none font-extrabold text-white tabular-nums"
      data-testid="flashback-chat-unread"
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

/** Nút "Chat" ở cuối thanh người chơi (máy tính) kèm số tin chưa đọc. */
export function ChatToggleButton({ chat }: { chat: ChatApi }) {
  const openChat = useChatOpener(chat)
  return (
    <Button
      type="button"
      variant={chat.open ? "default" : "outline"}
      size="sm"
      className="relative shrink-0 max-[900px]:hidden"
      aria-pressed={chat.open}
      data-testid="flashback-chat-toggle"
      onClick={() => openChat(!chat.open)}
    >
      <MessageCircle className="size-3.5" aria-hidden="true" />
      Chat
      <ChatUnreadBadge count={chat.unread} />
    </Button>
  )
}

export function FlashbackChatBox({
  chat,
  inMatch,
  onClose,
  className,
}: {
  chat: ChatApi
  /** Trong ván mới có dòng giải thích vì sao tin của người đi trước chưa hiện (§3.3). */
  inMatch: boolean
  onClose?: () => void
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const [dragging, setDragging] = useState(false)
  const [viewing, setViewing] = useState<ChatImageItem | null>(null)
  const viewport = useRef<HTMLDivElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const timeline = useMemo(() => mergeTimeline(chat.messages, chat.images), [chat.messages, chat.images])
  const lastKey = timeline.at(-1)?.key

  // Có tin hoặc ảnh mới thì cuộn xuống cuối.
  useEffect(() => {
    const element = viewport.current
    if (element) element.scrollTop = element.scrollHeight
  }, [lastKey, timeline.length])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (await chat.send(draft)) setDraft("")
  }

  // Dán ảnh (Ctrl+V hoặc Cmd+V) khi đang ở trong khung chat; dán chữ thì để nguyên như thường.
  function onPaste(event: ClipboardEvent) {
    const file = imageFromClipboard(event.clipboardData)
    if (!file) return
    event.preventDefault()
    void chat.sendImage(file)
  }

  function onDragOver(event: DragEvent) {
    if (!dragHasFiles(event.dataTransfer)) return
    event.preventDefault()
    setDragging(true)
  }

  function onDragLeave(event: DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
  }

  function onDrop(event: DragEvent) {
    if (!dragHasFiles(event.dataTransfer)) return
    event.preventDefault()
    setDragging(false)
    const file = imageFromDrop(event.dataTransfer)
    if (file) void chat.sendImage(file)
    else toast.error(IMAGE_NOT_SUPPORTED)
  }

  return (
    <section
      aria-label="Chat phòng"
      data-testid="flashback-chat"
      tabIndex={-1}
      className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card outline-none", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose && !event.defaultPrevented) onClose()
      }}
      onPaste={onPaste}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-bold text-primary"
          data-testid="flashback-chat-dropzone"
        >
          Thả ảnh để gửi
        </div>
      ) : null}
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-bold">Chat phòng</h3>
          {inMatch ? (
            <p className="mt-0.5 text-xs font-semibold text-text-secondary">
              Tin của người đi trước hiện khi bạn tới cùng phiên
            </p>
          ) : null}
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng chat" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </header>

      {chat.muted.length > 0 ? (
        <ul className="m-0 flex shrink-0 list-none flex-wrap gap-1.5 border-b border-border px-3 py-1.5 text-xs font-semibold">
          {chat.muted.map((user) => (
            <li key={user.user_id} className="flex items-center gap-1">
              <span>Đã tắt tiếng {user.name}</span>
              <button
                type="button"
                className="font-bold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                onClick={() => chat.setMuted(user.user_id, user.name, false)}
              >
                Bỏ tắt tiếng
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <ScrollArea className="h-0 min-h-0 flex-1" viewportRef={viewport}>
        <ol className="m-0 flex list-none flex-col gap-2 p-3" aria-label="Tin nhắn" data-testid="flashback-chat-messages">
          {timeline.length === 0 ? (
            <li className="py-6 text-center text-sm font-semibold text-text-secondary">Chưa có tin nhắn</li>
          ) : null}
          {timeline.map((entry) =>
            entry.kind === "message" ? (
              <ChatMessage key={entry.key} message={entry.message} chat={chat} />
            ) : (
              <ChatImageBubble key={entry.key} image={entry.image} chat={chat} onOpen={setViewing} />
            ),
          )}
        </ol>
      </ScrollArea>

      <div className="shrink-0 overflow-x-auto border-t border-border [scrollbar-width:none]">
        <div className="flex w-max gap-1.5 px-3 py-1.5" data-testid="flashback-chat-quick">
          {CHAT_QUICK_REPLIES.map((text) => (
            <button
              key={text}
              type="button"
              className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              onClick={() => void chat.send(text)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={(event) => void submit(event)} className="flex shrink-0 gap-1.5 px-3 pt-1 pb-1.5">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          data-testid="flashback-chat-file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void chat.sendImage(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Gửi ảnh"
          title={chat.imagesReady ? "Gửi ảnh (hoặc dán bằng Ctrl+V)" : "Đang kết nối phòng để gửi ảnh"}
          disabled={!chat.imagesReady || chat.imageBusy}
          onClick={() => fileInput.current?.click()}
        >
          {chat.imageBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
        </Button>
        <Input
          aria-label="Nhập tin nhắn"
          placeholder="Nhắn cho cả phòng…"
          autoComplete="off"
          maxLength={CHAT_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 placeholder:text-text-secondary"
        />
        <Button type="submit" disabled={chat.sendBusy || draft.trim() === ""}>
          Gửi
        </Button>
      </form>
      <p className="m-0 min-h-4 shrink-0 px-3 pb-1 text-right text-[11px] font-semibold tabular-nums" data-testid="flashback-chat-count">
        {draft.length > 0 ? `${draft.length}/${CHAT_MAX_LENGTH}` : ""}
      </p>
      <ChatImageViewer image={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}

function ChatMessage({ message, chat }: { message: FlashbackChatMessage; chat: ChatApi }) {
  const label = chatMessageLabel(message)
  return (
    <li
      className={cn("flex max-w-[85%] flex-col gap-0.5", message.is_me && "items-end self-end")}
      data-testid="flashback-chat-message"
      data-me={message.is_me}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold">
        {message.is_me ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="max-w-[140px] truncate font-bold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                {message.name}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => chat.setMuted(message.user_id, message.name, true)}>
                Tắt tiếng {message.name}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chat.report(message.id)}>Báo cáo tin nhắn</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span className="rounded-sm bg-muted px-1 text-[10.5px] font-bold">{label}</span>
      </div>
      <p
        className={cn(
          "m-0 px-2.5 py-1.5 text-[13.5px] [overflow-wrap:anywhere]",
          message.is_me
            ? "rounded-[12px_4px_12px_12px] bg-primary text-primary-foreground"
            : "rounded-[4px_12px_12px_12px] bg-muted text-foreground",
        )}
      >
        {message.text}
      </p>
    </li>
  )
}
