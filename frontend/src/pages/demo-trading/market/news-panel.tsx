/**
 * Tin tức panel — the per-ticker AI news feed of the demo shell.
 *
 * Real data only: `GET /market-data/news/ai` (ticker/sentiment/pagination) plus
 * `GET /market-data/news/ai/detail/{slug}` for the in-panel reader, which keeps
 * a working "Mở bài gốc" link to the publisher. Upstream gaps (no image, no
 * source, no timestamp, empty feed) are stated, never filled with placeholder
 * numbers.
 */
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  Clock,
  ExternalLink,
  Minus,
  Newspaper,
  RefreshCw,
  Search,
} from "lucide-react"
import { cn } from "cn"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"

import {
  NEWS_PAGE_SIZE,
  fetchNewsArticle,
  fetchSymbolNews,
  marketKeys,
  type NewsItem,
} from "./market-api"

const ALL = "all"
const EMPTY_NEWS_ITEMS: NewsItem[] = []

const SENTIMENT_OPTIONS = [
  { value: ALL, label: "Mọi tín hiệu" },
  { value: "Positive", label: "Tích cực" },
  { value: "Neutral", label: "Trung lập" },
  { value: "Negative", label: "Tiêu cực" },
] as const

/** Sentiment → icon + tone (the legacy feed's leading signal). */
function SentimentMark({ sentiment }: { sentiment: string | null }) {
  const value = sentiment?.toLowerCase()
  if (value === "positive") {
    return <ArrowUpRight aria-hidden="true" className="size-3 shrink-0 text-price-up" />
  }
  if (value === "negative") {
    return <ArrowDownRight aria-hidden="true" className="size-3 shrink-0 text-price-down" />
  }
  return <Minus aria-hidden="true" className="size-3 shrink-0 text-price-ref" />
}

function timeAgo(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return "vừa xong"
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  return formatDateTime(value)
}

function Thumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) return null
  return (
    <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
      <img
        src={url}
        alt=""
        loading="lazy"
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function NewsCard({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  const tone = item.sentiment?.toLowerCase()
  const border =
    tone === "positive"
      ? "border-l-price-up"
      : tone === "negative"
        ? "border-l-price-down"
        : tone === "neutral"
          ? "border-l-price-ref"
          : "border-l-transparent"
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-md border border-border border-l-2 bg-card p-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        border,
      )}
    >
      <div className="flex gap-2.5">
        <Thumbnail url={item.imageUrl} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="line-clamp-2 text-xs leading-snug font-semibold text-card-foreground">
            {item.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <SentimentMark sentiment={item.sentiment} />
            {item.score !== null && (
              <span className="tabular-nums" title="Điểm cảm xúc AI">
                {formatNumber(item.score)}
              </span>
            )}
            {item.sourceName && <span className="max-w-28 truncate">{item.sourceName}</span>}
            <Clock aria-hidden="true" className="size-2.5" />
            <span>{timeAgo(item.updatedAt)}</span>
            {item.ticker && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] font-bold">
                {item.ticker}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function ArticleBody({ slug, fallback }: { slug: string; fallback: NewsItem | null }) {
  const article = useQuery({
    queryKey: marketKeys.newsArticle(slug),
    queryFn: ({ signal }) => fetchNewsArticle(slug, signal),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  if (article.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )
  }

  if (article.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
        <p className="text-xs text-muted-foreground">{errorMessage(article.error)}</p>
        <Button size="xs" variant="outline" onClick={() => void article.refetch()}>
          Thử lại
        </Button>
      </div>
    )
  }

  const data = article.data
  if (!data) {
    return (
      <div className="space-y-2 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Không tìm thấy nội dung bài viết này trên hệ thống.
        </p>
        {fallback?.sourceLink && (
          <a
            href={fallback.sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Mở bài gốc <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {(data.summary ?? fallback?.summary) && (
        <p className="rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
          {data.summary ?? fallback?.summary}
        </p>
      )}
      {(data.imageUrl ?? fallback?.imageUrl) && (
        <img
          src={(data.imageUrl ?? fallback?.imageUrl) as string}
          alt=""
          loading="lazy"
          className="max-h-56 w-full rounded-md object-cover"
        />
      )}
      <ScrollArea className="max-h-[45vh]">
        <div className="pr-3">
          {data.body ? (
            <p className="text-sm leading-relaxed whitespace-pre-line">{data.body}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Bài viết không kèm nội dung đầy đủ — mở bài gốc để đọc tiếp.
            </p>
          )}
        </div>
      </ScrollArea>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {(data.companyName ?? data.ticker) && <span>{data.companyName ?? data.ticker}</span>}
        {data.industry && <span>{data.industry}</span>}
        {data.updatedAt && <span>Cập nhật {formatDateTime(data.updatedAt)}</span>}
        {data.sourceName && <span>Nguồn: {data.sourceName}</span>}
      </div>
      {data.sourceLink && (
        <Button asChild variant="outline" size="sm">
          <a href={data.sourceLink} target="_blank" rel="noopener noreferrer">
            Mở bài gốc <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      )}
    </div>
  )
}

export type NewsPanelProps = {
  /** Symbol the terminal is looking at; empty/VNINDEX shows the general feed. */
  symbol: string
}

export function NewsPanel({ symbol }: NewsPanelProps) {
  const code = symbol.trim().toUpperCase()
  const ticker = !code || code === "VNINDEX" ? "" : code

  const [pagination, setPagination] = useState({ key: "", page: 1 })
  const [sentiment, setSentiment] = useState<string>(ALL)
  const [term, setTerm] = useState("")
  const [openSlug, setOpenSlug] = useState<string | null>(null)


  const activeSentiment = sentiment === ALL ? null : sentiment
  const resultKey = `${ticker}:${sentiment}`
  const page = pagination.key === resultKey ? pagination.page : 1
  const setPage = (next: number) => setPagination({ key: resultKey, page: next })

  const news = useQuery({
    queryKey: marketKeys.news(ticker || "ALL", page, activeSentiment),
    queryFn: ({ signal }) => fetchSymbolNews(ticker, page, activeSentiment, signal),
    staleTime: 60_000,
    retry: 1,
  })

  const items = news.data?.items ?? EMPTY_NEWS_ITEMS
  const total = news.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE))

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        (item.ticker?.toLowerCase().includes(needle) ?? false),
    )
  }, [items, term])

  const openItem = items.find((item) => item.slug === openSlug) ?? null
  const filtering = term.trim().length > 0 || sentiment !== ALL

  return (
    <>
      <SidebarPanel
        title="Tin tức"
        description={
          news.isLoading
            ? `Đang tải tin${ticker ? ` cho ${ticker}` : ""}…`
            : `${ticker || "Toàn thị trường"} · ${formatNumber(total)} tin`
        }
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Làm mới tin tức"
            disabled={news.isFetching}
            onClick={() => void news.refetch()}
          >
            <RefreshCw className={cn(news.isFetching && "animate-spin")} />
          </Button>
        }
        footer={
          totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={page <= 1 || news.isFetching}
                onClick={() => setPage(Math.max(1, page - 1))}
              >
                Trước
              </Button>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                Trang {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={page >= totalPages || news.isFetching}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
              >
                Sau
              </Button>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {formatNumber(total)} tin · nguồn Vietcap AI News
            </p>
          )
        }
      >
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Tìm trong trang tin"
              className="pl-7 text-xs"
              placeholder="Tìm trong trang này…"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          <Select value={sentiment} onValueChange={(value) => { setSentiment(value); setPage(1) }}>
            <SelectTrigger size="sm" aria-label="Lọc theo tín hiệu" className="w-36 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENTIMENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {news.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex gap-2.5 rounded-md border border-border p-2">
                <Skeleton className="size-14 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : news.isError ? (
          <PanelState
            title="Không tải được tin tức"
            description={errorMessage(news.error)}
            action={{ label: "Thử lại", onClick: () => void news.refetch() }}
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Newspaper aria-hidden="true" className="size-6 opacity-40" />
            <p className="text-xs">
              {filtering
                ? "Không có tin nào khớp bộ lọc hiện tại."
                : `Chưa có tin cho ${ticker || "thị trường"}.`}
            </p>
            {filtering && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setTerm("")
                  setSentiment(ALL)
                  setPage(1)
                }}
              >
                Xoá bộ lọc
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                onOpen={() => setOpenSlug(item.slug)}
              />
            ))}
          </div>
        )}
      </SidebarPanel>

      <Dialog open={openSlug !== null} onOpenChange={(open) => !open && setOpenSlug(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left text-base leading-snug">
              {openItem?.title ?? "Bài viết"}
            </DialogTitle>
            <DialogDescription className="text-left text-[11px]">
              {[openItem?.sourceName, openItem?.updatedAt ? timeAgo(openItem.updatedAt) : null]
                .filter(Boolean)
                .join(" · ") || "Đang tải bài viết…"}
            </DialogDescription>
          </DialogHeader>
          {openSlug && <ArticleBody slug={openSlug} fallback={openItem} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
