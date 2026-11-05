/**
 * Ảnh trong khung chat phòng Flashback: bong bóng ảnh (đang gửi, đã gửi, lỗi) và cửa sổ xem ảnh lớn
 * (Esc để đóng). Ảnh chỉ là object URL trong bộ nhớ trình duyệt.
 */
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { ChatImageItem } from "./chat-image"
import type { ChatApi } from "./flashback-context"

const imageLabel = (image: ChatImageItem) => (image.isMe || !image.name ? "Ảnh của bạn" : `Ảnh của ${image.name}`)

export function ChatImageBubble({
  image,
  chat,
  onOpen,
}: {
  image: ChatImageItem
  chat: ChatApi
  onOpen: (image: ChatImageItem) => void
}) {
  const sending = image.status === "sending"
  return (
    <li
      className={cn("flex max-w-[85%] flex-col gap-0.5", image.isMe && "items-end self-end")}
      data-testid="flashback-chat-image"
      data-me={image.isMe}
      data-status={image.status}
    >
      {image.isMe || !image.name ? null : (
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="max-w-[140px] truncate font-bold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                {image.name}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => chat.setMuted(image.userId, image.name, true)}>
                Tắt tiếng {image.name}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <button
        type="button"
        aria-label={`Xem ảnh lớn. ${imageLabel(image)}`}
        className="relative overflow-hidden rounded-lg border border-border bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        onClick={() => onOpen(image)}
      >
        <img
          src={image.url}
          alt={imageLabel(image)}
          width={image.width}
          height={image.height}
          draggable={false}
          className={cn("block h-auto max-h-[240px] w-auto max-w-full object-contain", sending && "opacity-60")}
        />
        {sending ? (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          </span>
        ) : null}
      </button>
      {sending ? <span className="text-[11px] font-semibold text-text-secondary">Đang gửi ảnh…</span> : null}
      {image.status === "failed" ? (
        <p role="alert" className="m-0 flex items-center gap-2 text-[11.5px] font-semibold text-destructive">
          <span>{image.error ?? "Chưa gửi được ảnh. Thử lại."}</span>
          <button
            type="button"
            className="font-bold underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            onClick={() => chat.dismissImage(image.id)}
          >
            Bỏ
          </button>
        </p>
      ) : null}
    </li>
  )
}

/** Xem ảnh lớn; Esc hoặc bấm ra ngoài để đóng. */
export function ChatImageViewer({ image, onClose }: { image: ChatImageItem | null; onClose: () => void }) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        className="w-auto max-w-[96vw] gap-0 bg-transparent p-0 sm:max-w-[96vw]"
        data-testid="flashback-chat-image-viewer"
      >
        <DialogTitle className="sr-only">{image ? imageLabel(image) : "Ảnh trong chat"}</DialogTitle>
        <DialogDescription className="sr-only">Ảnh trong chat phòng. Nhấn Esc để đóng.</DialogDescription>
        {image ? (
          <img
            src={image.url}
            alt={imageLabel(image)}
            className="block max-h-[88dvh] max-w-[96vw] rounded-md object-contain"
            data-testid="flashback-chat-image-large"
          />
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label="Đóng ảnh"
          className="absolute top-2 right-2"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </DialogContent>
    </Dialog>
  )
}
