import { useMemo, useState } from "react"
import { Button, Input, Select, Spin, Tag } from "@arco-design/web-react"
import {
  IconArrowFall,
  IconArrowRise,
  IconClockCircle,
  IconClose,
  IconFilter,
  IconLeft,
  IconMinus,
  IconRefresh,
  IconRight,
  IconSearch,
} from "@arco-design/web-react/icon"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { cn } from "@/shared/lib/cn"
import { IconNewspaper } from "../icons"
import { useNewsFilters, useNewsList } from "../hooks"
import type { NewsFilter, NewsItem } from "../types"
import { NewsDetailModal } from "./NewsDetailModal"

const Option = Select.Option

/** Sentiment → leading icon, colored with semantic up/down/reference tokens. */
function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <IconMinus className="text-[var(--color-text-3)]" />
  const s = sentiment.toLowerCase()
  if (s === "positive") return <IconArrowRise className="text-up" />
  if (s === "negative") return <IconArrowFall className="text-down" />
  return <IconMinus className="text-reference" />
}

/** Sentiment → left-border accent color (semantic tokens). */
function sentimentBorder(sentiment: string | null): string {
  if (!sentiment) return "border-l-transparent"
  const s = sentiment.toLowerCase()
  if (s === "positive") return "border-l-up"
  if (s === "negative") return "border-l-down"
  return "border-l-reference"
}

function timeAgo(dateStr: string): string {
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

function NewsCard({ item, onClick }: { item: NewsItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg border-l-2 p-2.5 text-left transition-colors duration-200 hover:bg-[var(--color-fill-2)]",
        sentimentBorder(item.sentiment),
      )}
    >
      <div className="flex gap-2.5">
        {item.imageUrl && (
          <div className="size-14 shrink-0 overflow-hidden rounded-md bg-[var(--color-fill-2)]">
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                const parent = (e.target as HTMLImageElement).parentElement
                if (parent) parent.style.display = "none"
              }}
            />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="line-clamp-2 text-[11px] font-semibold leading-tight text-[var(--color-text-1)] group-hover:text-[rgb(var(--primary-6))]">
            {item.title}
          </h3>

          <div className="flex items-center gap-1.5 text-[9px] text-[var(--color-text-3)]">
            <SentimentIcon sentiment={item.sentiment} />
            {item.sourceName && (
              <span className="max-w-[80px] truncate">{item.sourceName}</span>
            )}
            <span>·</span>
            <IconClockCircle />
            <span>{timeAgo(item.updatedAt)}</span>
            {item.ticker && (
              <>
                <span>·</span>
                <Tag size="small" color="arcoblue" className="!h-3.5 !px-1 !text-[8px] font-bold">
                  {item.ticker}
                </Tag>
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

  // On stock pages filter by ticker; on dashboard (VNINDEX) show all news.
  const isIndex = !symbol || symbol === "VNINDEX"

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

  const hasActiveFilters =
    (!!sentiment && sentiment !== "all") ||
    (!!newsfrom && newsfrom !== "all") ||
    (!!industry && industry !== "all")

  const clearFilters = () => {
    setSentiment("")
    setNewsfrom("")
    setIndustry("")
  }

  // Local search filter (client-side, current page only — mirrors bak).
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
      className="flex h-full w-full shrink-0 flex-col bg-[var(--color-bg-2)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-2)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <IconNewspaper className="text-[rgb(var(--primary-6))]" />
          <h2 className="text-xs font-bold text-[var(--color-text-1)]">Tin tức</h2>
          {total > 0 && (
            <span className="text-[9px] text-[var(--color-text-3)]">({total})</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="mini"
            type="text"
            icon={<IconRefresh />}
            onClick={() => refresh()}
            aria-label="Làm mới"
          />
          <Button
            size="mini"
            type={showFilters ? "secondary" : "text"}
            className={cn(hasActiveFilters && "!text-[rgb(var(--primary-6))]")}
            icon={<IconFilter />}
            onClick={() => setShowFilters((v) => !v)}
            aria-label="Bộ lọc"
          />
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-[var(--color-border-2)] px-2 py-1.5">
        <Input
          size="small"
          allowClear
          placeholder="Tìm tin tức..."
          value={searchTerm}
          onChange={setSearchTerm}
          prefix={<IconSearch />}
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="space-y-1.5 border-b border-[var(--color-border-2)] bg-[var(--color-fill-1)] px-2 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
              Bộ lọc
            </span>
            {hasActiveFilters && (
              <Button
                size="mini"
                type="text"
                status="danger"
                icon={<IconClose />}
                onClick={clearFilters}
              >
                Xóa lọc
              </Button>
            )}
          </div>

          {/* Sentiment */}
          <Select
            size="small"
            placeholder="Tín hiệu cảm xúc"
            value={sentiment || undefined}
            onChange={(v) => setSentiment(v ?? "")}
            allowClear
          >
            <Option value="all">Tất cả</Option>
            <Option value="Positive">Tích cực</Option>
            <Option value="Neutral">Trung lập</Option>
            <Option value="Negative">Tiêu cực</Option>
          </Select>

          {/* Source */}
          {sources.length > 0 && (
            <Select
              size="small"
              placeholder="Nguồn tin"
              value={newsfrom || undefined}
              onChange={(v) => setNewsfrom(v ?? "")}
              allowClear
            >
              <Option value="all">Tất cả nguồn</Option>
              {sources
                .filter((s) => s.value)
                .map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.name}
                  </Option>
                ))}
            </Select>
          )}

          {/* Industry */}
          {industries.length > 0 && (
            <Select
              size="small"
              placeholder="Ngành"
              value={industry || undefined}
              onChange={(v) => setIndustry(v ?? "")}
              allowClear
            >
              <Option value="all">Tất cả ngành</Option>
              {industries
                .filter((ind) => ind.value)
                .map((ind) => (
                  <Option key={ind.value} value={ind.value}>
                    {ind.name}
                  </Option>
                ))}
            </Select>
          )}
        </div>
      )}

      {/* News List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Spin />
            <span className="mt-2 text-[10px] text-[var(--color-text-3)]">
              Đang tải tin tức...
            </span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-3)]">
            <IconNewspaper className="mb-2 text-3xl opacity-30" />
            <p className="text-xs">Không có tin tức</p>
            {hasActiveFilters && (
              <Button size="mini" className="mt-2" onClick={clearFilters}>
                Xóa bộ lọc
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayed.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                onClick={() => handleOpenArticle(item.slug)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-3 py-1.5">
          <Button
            size="mini"
            type="text"
            icon={<IconLeft />}
            disabled={page <= 1}
            onClick={() => loadPage(page - 1)}
            aria-label="Trang trước"
          />
          <span className="text-[10px] tabular-nums text-[var(--color-text-3)]">
            {page} / {totalPages}
          </span>
          <Button
            size="mini"
            type="text"
            icon={<IconRight />}
            disabled={page >= totalPages}
            onClick={() => loadPage(page + 1)}
            aria-label="Trang sau"
          />
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
