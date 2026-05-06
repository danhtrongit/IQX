import { useState } from "react"
import {
  Newspaper,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { NewsDetailModal } from "@/components/news/news-detail-modal"
import { getNewsMarkGroup, type NewsMarkGroup, type NewsMarkItem } from "@/lib/tradingview-datafeed"

function getSentimentIcon(sentiment: string | null) {
  if (!sentiment) return <Minus className="size-3 text-muted-foreground" />
  const s = sentiment.toLowerCase()
  if (s === "positive") return <TrendingUp className="size-3 text-emerald-500" />
  if (s === "negative") return <TrendingDown className="size-3 text-red-500" />
  return <Minus className="size-3 text-amber-500" />
}

function getSentimentBorder(sentiment: string | null) {
  if (!sentiment) return "border-l-muted"
  const s = sentiment.toLowerCase()
  if (s === "positive") return "border-l-emerald-500"
  if (s === "negative") return "border-l-red-500"
  return "border-l-amber-500"
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function NewsItem({ item, onClick }: { item: NewsMarkItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg hover:bg-muted/60 transition-all duration-200 group border-l-2 ${getSentimentBorder(item.sentiment)}`}
    >
      <div className="flex gap-2">
        {item.imageUrl && (
          <div className="size-10 shrink-0 rounded overflow-hidden bg-muted">
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
          <h4 className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h4>
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            {getSentimentIcon(item.sentiment)}
            {item.sourceName && (
              <span className="truncate max-w-[80px]">{item.sourceName}</span>
            )}
            <span>·</span>
            <Clock className="size-2.5" />
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

  const sentimentColor =
    group.dominantSentiment === "positive"
      ? "bg-emerald-500"
      : group.dominantSentiment === "negative"
        ? "bg-red-500"
        : "bg-amber-500"

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90]"
        onClick={onClose}
      />

      {/* Popover */}
      <div
        className="fixed z-[91] w-[340px] max-h-[420px] flex flex-col
          bg-card/95 backdrop-blur-xl border border-border
          shadow-2xl rounded-xl overflow-hidden
          animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${sentimentColor}`} />
            <Newspaper className="size-3.5 text-primary" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">
                Tin tức {symbol}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {formatDate(group.items[0].updatedAt)} · {group.items.length} tin
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Sentiment Summary */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/10 shrink-0">
          {(() => {
            let pos = 0, neg = 0, neu = 0
            for (const item of group.items) {
              const s = (item.sentiment || "").toLowerCase()
              if (s === "positive") pos++
              else if (s === "negative") neg++
              else neu++
            }
            return (
              <>
                {pos > 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 text-[9px] h-4 gap-0.5">
                    <TrendingUp className="size-2.5" /> {pos}
                  </Badge>
                )}
                {neg > 0 && (
                  <Badge className="bg-red-500/15 text-red-500 border-red-500/20 text-[9px] h-4 gap-0.5">
                    <TrendingDown className="size-2.5" /> {neg}
                  </Badge>
                )}
                {neu > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20 text-[9px] h-4 gap-0.5">
                    <Minus className="size-2.5" /> {neu}
                  </Badge>
                )}
              </>
            )
          })()}
        </div>

        {/* News list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-1.5 space-y-0.5">
            {group.items.map((item) => (
              <NewsItem
                key={item.id}
                item={item}
                onClick={() => {
                  setSelectedSlug(item.slug)
                  setModalOpen(true)
                }}
              />
            ))}
          </div>
        </ScrollArea>
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
