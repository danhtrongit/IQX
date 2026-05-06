import { useState, useEffect, useCallback } from "react"
import { Newspaper, Loader2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react"
import { api } from "@/lib/api"

interface FeaturedNewsItem {
  id: string
  ticker?: string
  title: string
  shortContent?: string
  source: string
  sourceName: string
  sourceLink?: string
  imageUrl?: string
  sentiment?: string
  score?: number
  slug?: string
  updatedAt: string
}

const PAGE_SIZE = 3

export function MarketNews() {
  const [news, setNews] = useState<FeaturedNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api
          .get("ai-news/news", { searchParams: { pageSize: "20" } })
          .json<any>()
        const items: FeaturedNewsItem[] = (res.data || [])
          .sort((a: FeaturedNewsItem, b: FeaturedNewsItem) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 12)
        setNews(items)
      } catch {
        setNews([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalPages = Math.max(1, Math.ceil(news.length / PAGE_SIZE))
  const currentItems = news.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const prev = useCallback(() => setPage((p) => (p <= 0 ? totalPages - 1 : p - 1)), [totalPages])
  const next = useCallback(() => setPage((p) => (p >= totalPages - 1 ? 0 : p + 1)), [totalPages])

  const timeAgo = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (m < 1) return "vừa xong"
    if (m < 60) return `${m}p`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  const sentimentColor = (s?: string) =>
    s === "positive" ? "bg-emerald-500" : s === "negative" ? "bg-red-500" : "bg-amber-500"

  const handleClick = (item: FeaturedNewsItem) => {
    if (item.sourceLink) {
      window.open(item.sourceLink, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 280 }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Newspaper className="size-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Tin tức nổi bật</h3>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {page + 1}/{totalPages}
          </span>
          <button
            onClick={prev}
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            onClick={next}
            className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center p-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        ) : news.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8">Chưa có tin tức</div>
        ) : (
          <div className="space-y-0.5">
            {currentItems.map((item, i) => (
              <div
                key={item.id || i}
                className="flex gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors cursor-pointer group"
                onClick={() => handleClick(item)}
              >
                <div className={`size-1.5 rounded-full mt-1.5 shrink-0 ${sentimentColor(item.sentiment)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.ticker && (
                      <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1 rounded">
                        {item.ticker}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground">{item.sourceName}</span>
                    <span className="text-[9px] text-muted-foreground/50">{timeAgo(item.updatedAt)}</span>
                    {item.sourceLink && (
                      <ExternalLink className="size-2.5 text-muted-foreground/40 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dots indicator */}
      {!loading && news.length > 0 && totalPages > 1 && (
        <div className="flex justify-center gap-1 pb-2">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`rounded-full transition-all ${
                i === page
                  ? "w-4 h-1.5 bg-primary"
                  : "size-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
