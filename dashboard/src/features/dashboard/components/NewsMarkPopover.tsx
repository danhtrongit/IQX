import { useState } from "react"
import { Button, Tag } from "@arco-design/web-react"
import {
  IconArrowRise,
  IconArrowFall,
  IconMinus,
  IconClockCircle,
  IconClose,
} from "@arco-design/web-react/icon"
import { NewsDetailModal } from "@/features/news"
import { cn } from "@/shared/lib/cn"
import { IconNewspaper } from "@/shared/icons"
import {
  getNewsMarkGroup,
  type NewsMarkGroup,
  type NewsMarkItem,
} from "../chart/datafeed"

function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <IconMinus className="text-[var(--color-text-3)]" />
  const s = sentiment.toLowerCase()
  if (s === "positive") return <IconArrowRise className="text-up" />
  if (s === "negative") return <IconArrowFall className="text-down" />
  return <IconMinus className="text-reference" />
}

function sentimentBorder(sentiment: string | null): string {
  if (!sentiment) return "border-l-transparent"
  const s = sentiment.toLowerCase()
  if (s === "positive") return "border-l-up"
  if (s === "negative") return "border-l-down"
  return "border-l-reference"
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function NewsRow({ item, onClick }: { item: NewsMarkItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-2.5 rounded-lg hover:bg-[var(--color-fill-2)] transition-all duration-200 group border-l-2",
        sentimentBorder(item.sentiment),
      )}
    >
      <div className="flex gap-2">
        {item.imageUrl && (
          <div className="size-10 shrink-0 rounded overflow-hidden bg-[var(--color-fill-2)]">
            <img
              src={item.imageUrl}
              alt=""
              className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onError={(e) => {
                ;(e.target as HTMLImageElement).parentElement!.style.display = "none"
              }}
            />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-0.5">
          <h4 className="text-[11px] font-semibold text-[var(--color-text-1)] leading-tight line-clamp-2 group-hover:text-[rgb(var(--primary-6))] transition-colors">
            {item.title}
          </h4>
          <div className="flex items-center gap-1.5 text-[9px] text-[var(--color-text-3)]">
            <SentimentIcon sentiment={item.sentiment} />
            {item.sourceName && (
              <span className="truncate max-w-[80px]">{item.sourceName}</span>
            )}
            <span>·</span>
            <IconClockCircle />
            <span>{formatTime(item.updatedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

interface NewsMarkPopoverProps {
  symbol: string
  markId: string | number | null
  onClose: () => void
}

export function NewsMarkPopover({ symbol, markId, onClose }: NewsMarkPopoverProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  if (!markId) return null

  const group: NewsMarkGroup | null = getNewsMarkGroup(symbol, String(markId))
  if (!group || group.items.length === 0) return null

  const dotColor =
    group.dominantSentiment === "positive"
      ? "bg-up"
      : group.dominantSentiment === "negative"
        ? "bg-down"
        : "bg-reference"

  let pos = 0,
    neg = 0,
    neu = 0
  for (const item of group.items) {
    const s = (item.sentiment || "").toLowerCase()
    if (s === "positive") pos++
    else if (s === "negative") neg++
    else neu++
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[90]" onClick={onClose} />

      {/* Popover */}
      <div
        className="fixed z-[91] w-[340px] max-h-[420px] flex flex-col
          bg-[var(--color-bg-2)] border border-[var(--color-border-2)]
          shadow-2xl rounded-xl overflow-hidden"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-2)] bg-[var(--color-fill-1)] shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn("size-2 rounded-full", dotColor)} />
            <IconNewspaper className="text-[rgb(var(--primary-6))]" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[var(--color-text-1)]">
                Tin tức {symbol}
              </span>
              <span className="text-[9px] text-[var(--color-text-3)]">
                {formatDate(group.items[0].updatedAt)} · {group.items.length} tin
              </span>
            </div>
          </div>
          <Button
            type="text"
            size="mini"
            icon={<IconClose />}
            onClick={onClose}
          />
        </div>

        {/* Sentiment Summary */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border-2)] bg-[var(--color-fill-1)] shrink-0">
          {pos > 0 && (
            <Tag size="small" color="green" icon={<IconArrowRise />}>
              {pos}
            </Tag>
          )}
          {neg > 0 && (
            <Tag size="small" color="red" icon={<IconArrowFall />}>
              {neg}
            </Tag>
          )}
          {neu > 0 && (
            <Tag size="small" color="orange" icon={<IconMinus />}>
              {neu}
            </Tag>
          )}
        </div>

        {/* News list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-1.5 space-y-0.5">
            {group.items.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                onClick={() => {
                  setSelectedSlug(item.slug)
                  setModalOpen(true)
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Article Detail Modal */}
      <NewsDetailModal
        slug={selectedSlug}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setSelectedSlug(null)
        }}
      />
    </>
  )
}
