/**
 * Popover for a news mark on the chart: the day's AI news for the symbol, with
 * per-article sentiment and a reader. The mark → group lookup reads the
 * datafeed's mark cache (filled by `getMarks`), so this stays a pure read.
 */
import { useState } from "react"
import { ArrowDownRight, ArrowUpRight, Clock, Minus, Newspaper } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import { getNewsMarkGroup, type NewsMarkItem } from "./datafeed"
import { NewsArticleDialog } from "./news-article-dialog"

function sentimentClass(sentiment: string | null): string {
  const value = (sentiment ?? "").toLowerCase()
  if (value === "positive") return "border-l-price-up"
  if (value === "negative") return "border-l-price-down"
  return "border-l-price-ref"
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
}

function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  const value = (sentiment ?? "").toLowerCase()
  if (value === "positive") return <ArrowUpRight className="size-3 text-price-up" aria-hidden="true" />
  if (value === "negative") return <ArrowDownRight className="size-3 text-price-down" aria-hidden="true" />
  return <Minus className="size-3 text-price-ref" aria-hidden="true" />
}

export function NewsMarkPopover({
  symbol,
  markId,
  onClose,
}: {
  symbol: string
  markId: string | number | null
  onClose: () => void
}) {
  const [slug, setSlug] = useState<string | null>(null)
  const group = markId ? getNewsMarkGroup(symbol, String(markId)) : null

  const counts = { positive: 0, negative: 0, neutral: 0 }
  for (const item of group?.items ?? []) {
    const value = (item.sentiment ?? "").toLowerCase()
    if (value === "positive") counts.positive++
    else if (value === "negative") counts.negative++
    else counts.neutral++
  }

  return (
    <>
      <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="gap-3 p-4 sm:max-w-[380px]">
          <DialogHeader className="gap-1">
            <DialogTitle className="flex items-center gap-2 font-heading text-sm">
              <Newspaper className="size-4 text-primary" aria-hidden="true" />
              Tin tức {symbol}
            </DialogTitle>
            {group && (
              <p className="text-[11px] text-muted-foreground">
                {formatDate(group.items[0]?.updatedAt ?? "")} · {group.items.length} tin
              </p>
            )}
          </DialogHeader>

          {(counts.positive > 0 || counts.negative > 0 || counts.neutral > 0) && (
            <div className="flex items-center gap-3 text-[11px] tabular-nums">
              {counts.positive > 0 && (
                <span className="inline-flex items-center gap-1 text-price-up">
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                  {counts.positive} tích cực
                </span>
              )}
              {counts.negative > 0 && (
                <span className="inline-flex items-center gap-1 text-price-down">
                  <ArrowDownRight className="size-3" aria-hidden="true" />
                  {counts.negative} tiêu cực
                </span>
              )}
              {counts.neutral > 0 && (
                <span className="inline-flex items-center gap-1 text-price-ref">
                  <Minus className="size-3" aria-hidden="true" />
                  {counts.neutral} trung tính
                </span>
              )}
            </div>
          )}

          <ScrollArea className="max-h-[52vh] min-h-24">
            <div className="space-y-1 pr-2">
              {(group?.items ?? []).map((item: NewsMarkItem) => (
                <button
                  key={item.id || item.slug}
                  type="button"
                  onClick={() => setSlug(item.slug)}
                  className={cn(
                    "flex w-full gap-2 rounded-sm border-l-2 px-2 py-2 text-left transition-colors duration-150 hover:bg-muted",
                    sentimentClass(item.sentiment),
                  )}
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      loading="lazy"
                      className="size-10 shrink-0 rounded-sm object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none"
                      }}
                    />
                  )}
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="line-clamp-2 block text-[11px] leading-4 font-medium">
                      {item.title}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <SentimentIcon sentiment={item.sentiment} />
                      {item.sourceName && (
                        <span className="max-w-[7rem] truncate">{item.sourceName}</span>
                      )}
                      <Clock className="size-3" aria-hidden="true" />
                      <span className="tabular-nums">{formatTime(item.updatedAt)}</span>
                    </span>
                  </span>
                </button>
              ))}
              {group && group.items.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">
                  Ngày này không có tin nào cho {symbol}.
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <NewsArticleDialog
        slug={slug}
        onOpenChange={(open) => {
          if (!open) setSlug(null)
        }}
      />
    </>
  )
}
