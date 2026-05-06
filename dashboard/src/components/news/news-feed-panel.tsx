import { useState, useMemo } from "react"
import { useSymbol } from "@/contexts/symbol-context"
import {
  Search,
  Loader2,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useNewsList, useNewsFilters, type NewsItem, type NewsFilter } from "@/hooks/use-news"
import { NewsDetailModal } from "./news-detail-modal"

function getSentimentIcon(sentiment: string | null) {
  if (!sentiment) return <Minus className="size-3 text-muted-foreground" />
  const s = sentiment.toLowerCase()
  if (s === "positive") return <TrendingUp className="size-3 text-emerald-500" />
  if (s === "negative") return <TrendingDown className="size-3 text-red-500" />
  return <Minus className="size-3 text-amber-500" />
}

function getSentimentColor(sentiment: string | null) {
  if (!sentiment) return "border-transparent"
  const s = sentiment.toLowerCase()
  if (s === "positive") return "border-l-emerald-500"
  if (s === "negative") return "border-l-red-500"
  return "border-l-amber-500"
}

function timeAgo(dateStr: string) {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "vừa xong"
  if (mins < 60) return `${mins} phút`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày`
  return d.toLocaleDateString("vi-VN")
}

function NewsCard({
  item,
  onClick,
}: {
  item: NewsItem
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg hover:bg-muted/60 transition-all duration-200 group border-l-2 ${getSentimentColor(item.sentiment)}`}
    >
      <div className="flex gap-2.5">
        {/* Thumbnail */}
        {item.imageUrl && (
          <div className="size-14 shrink-0 rounded-md overflow-hidden bg-muted">
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

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>

          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            {getSentimentIcon(item.sentiment)}
            {item.sourceName && (
              <span className="truncate max-w-[80px]">{item.sourceName}</span>
            )}
            <span>·</span>
            <Clock className="size-2.5" />
            <span>{timeAgo(item.updatedAt)}</span>
            {item.ticker && (
              <>
                <span>·</span>
                <Badge
                  variant="secondary"
                  className="text-[8px] px-1 py-0 h-3.5 font-bold"
                >
                  {item.ticker}
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

export function NewsFeedPanel() {
  const { symbol } = useSymbol()
  const { industries, sources } = useNewsFilters()
  const [showFilters, setShowFilters] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // On stock pages filter by ticker, on dashboard (VNINDEX) show all news
  const isIndex = !symbol || symbol === "VNINDEX"

  // Filter state
  const [sentiment, setSentiment] = useState<string>("")
  const [newsfrom, setNewsfrom] = useState<string>("")
  const [industry, setIndustry] = useState<string>("")

  const filters = useMemo<NewsFilter>(
    () => ({
      ticker: isIndex ? undefined : symbol,
      sentiment: sentiment && sentiment !== "all" ? sentiment : undefined,
      newsfrom: newsfrom && newsfrom !== "all" ? newsfrom : undefined,
      industry: industry && industry !== "all" ? industry : undefined,
    }),
    [symbol, isIndex, sentiment, newsfrom, industry],
  )

  const { items, isLoading, page, total, pageSize, loadPage, refresh } =
    useNewsList(filters)

  const totalPages = Math.ceil(total / pageSize)

  const hasActiveFilters = (!!sentiment && sentiment !== "all") || (!!newsfrom && newsfrom !== "all") || (!!industry && industry !== "all")

  const clearFilters = () => {
    setSentiment("")
    setNewsfrom("")
    setIndustry("")
  }

  // Local search filter (client-side for the current page)
  const displayed = searchTerm
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (i.ticker && i.ticker.toLowerCase().includes(searchTerm.toLowerCase())),
      )
    : items

  const handleOpenArticle = (slug: string) => {
    setSelectedSlug(slug)
    setModalOpen(true)
  }

  return (
    <aside
      id="news-feed-panel"
      className="flex w-full shrink-0 flex-col bg-card h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Newspaper className="size-3.5 text-primary" />
          <h2 className="text-xs font-bold text-foreground">Tin tức</h2>
          {total > 0 && (
            <span className="text-[9px] text-muted-foreground">({total})</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={refresh}
          >
            <RefreshCw className="size-3" />
          </Button>
          <Button
            variant={showFilters ? "secondary" : "ghost"}
            size="icon"
            className={`size-6 ${hasActiveFilters ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="size-3" />
            {hasActiveFilters && (
              <span className="absolute -top-0.5 -right-0.5 size-1.5 bg-primary rounded-full" />
            )}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            placeholder="Tìm tin tức..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 pl-7 text-xs bg-muted/50 border-transparent"
          />
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-2 py-2 border-b border-border space-y-1.5 bg-muted/20 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Bộ lọc
            </span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] text-destructive hover:text-destructive px-1.5 gap-1"
                onClick={clearFilters}
              >
                <X className="size-2.5" />
                Xóa lọc
              </Button>
            )}
          </div>

          {/* Sentiment */}
          <Select value={sentiment} onValueChange={setSentiment}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder="Tin hiệu cảm xúc" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tất cả</SelectItem>
              <SelectItem value="Positive" className="text-xs">
                <span className="flex items-center gap-1">
                  <TrendingUp className="size-3 text-emerald-500" /> Tích cực
                </span>
              </SelectItem>
              <SelectItem value="Neutral" className="text-xs">
                <span className="flex items-center gap-1">
                  <Minus className="size-3 text-amber-500" /> Trung lập
                </span>
              </SelectItem>
              <SelectItem value="Negative" className="text-xs">
                <span className="flex items-center gap-1">
                  <TrendingDown className="size-3 text-red-500" /> Tiêu cực
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Source */}
          {sources.length > 0 && (
            <Select value={newsfrom} onValueChange={setNewsfrom}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Nguồn tin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Tất cả nguồn</SelectItem>
                {sources.filter((s) => s.value).map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Industry */}
          {industries.length > 0 && (
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Ngành" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Tất cả ngành</SelectItem>
                {industries.filter((ind) => ind.value).map((ind) => (
                  <SelectItem key={ind.value} value={ind.value} className="text-xs">
                    {ind.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* News List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1.5 space-y-0.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground mb-2" />
              <span className="text-[10px] text-muted-foreground">
                Đang tải tin tức...
              </span>
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Newspaper className="size-8 mb-2 opacity-30" />
              <p className="text-xs">Không có tin tức</p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-[10px] h-6"
                  onClick={clearFilters}
                >
                  Xóa bộ lọc
                </Button>
              )}
            </div>
          ) : (
            displayed.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                onClick={() => handleOpenArticle(item.slug)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-card">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={page <= 1}
            onClick={() => loadPage(page - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={page >= totalPages}
            onClick={() => loadPage(page + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Article Detail Modal */}
      <NewsDetailModal
        slug={selectedSlug}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setSelectedSlug(null)
        }}
      />
    </aside>
  )
}
