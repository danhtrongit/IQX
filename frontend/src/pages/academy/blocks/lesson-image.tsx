import { useRef, useState } from "react"
import { ImageOff, Maximize2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { LessonBlock } from "../api"

type ImageBlockData = Extract<LessonBlock, { type: "image" }>

/** Full-size view of a guide screenshot: "Vừa khung" fits the window, "100%" is the natural pixel width and scrolls inside. */
function ImageLightbox({
  block,
  open,
  onOpenChange,
  returnFocus,
}: {
  block: ImageBlockData
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: () => void
}) {
  const [fit, setFit] = useState(true)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setFit(true)
        onOpenChange(next)
      }}
    >
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          // Escape or Đóng: focus goes back to the control that opened the image.
          event.preventDefault()
          returnFocus()
        }}
        className="flex max-h-[92dvh] w-[96vw] max-w-[96vw] flex-col gap-3 bg-card p-3 sm:max-w-[min(96vw,1280px)] sm:p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DialogTitle className="min-w-0 flex-1 text-sm leading-snug">{block.zoom_title}</DialogTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" aria-pressed={fit} onClick={() => setFit(true)}>
              Vừa khung
            </Button>
            <Button type="button" variant="outline" size="sm" aria-pressed={!fit} onClick={() => setFit(false)}>
              100%
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Đóng <span aria-hidden="true">×</span>
              </Button>
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="sr-only">Ảnh hướng dẫn phóng to. Nhấn Escape để đóng.</DialogDescription>
        <div
          role="region"
          tabIndex={0}
          aria-label="Ảnh phóng to"
          className="min-h-0 flex-1 overflow-auto rounded-sm border border-border bg-background focus-visible:outline-2 focus-visible:outline-ring"
        >
          <img
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            draggable={false}
            className={cn("mx-auto block", fit ? "h-auto max-h-[calc(92dvh-7rem)] w-auto max-w-full object-contain" : "max-w-none")}
            style={fit ? undefined : { width: block.width }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Guide screenshot: lazy loaded with its real width/height (no layout jump), the title and the
 * image both open the lightbox, a failed load says so and offers "Thử lại". Buttons drawn inside a
 * screenshot are only pixels: clicking them just opens the image.
 */
export function LessonImage({ block }: { block: ImageBlockData }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const opener = useRef<HTMLElement | null>(null)

  function show(event: { currentTarget: HTMLElement }) {
    opener.current = event.currentTarget
    setOpen(true)
  }

  return (
    <figure className="m-0 my-4 min-w-0" style={block.max_width ? { maxWidth: `${block.max_width}px` } : undefined}>
      <h4 className="mb-2 text-sm font-semibold leading-snug">
        <button
          type="button"
          onClick={show}
          aria-label={`Phóng to ảnh: ${block.title}`}
          className="inline-flex items-start gap-1.5 rounded-sm text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {block.title}
          <Maximize2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </h4>
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-sm border border-border bg-muted/40 p-4 text-sm">
          <span className="inline-flex items-center gap-2">
            <ImageOff className="size-4 text-muted-foreground" aria-hidden="true" />
            Chưa tải được ảnh hướng dẫn.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFailed(false)
              setAttempt((count) => count + 1)
            }}
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={show}
          aria-label={`Phóng to: ${block.alt}`}
          className="block w-full cursor-zoom-in overflow-hidden rounded-sm border border-border bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <img
            key={attempt}
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="block h-auto w-full"
          />
        </button>
      )}
      {block.caption && <figcaption className="mt-2 text-xs leading-5 text-muted-foreground">{block.caption}</figcaption>}
      <ImageLightbox block={block} open={open} onOpenChange={setOpen} returnFocus={() => opener.current?.focus()} />
    </figure>
  )
}
