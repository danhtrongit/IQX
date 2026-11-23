import { useMemo, useState } from "react"
import { formatDayMonth, formatRelativeTimeVi } from "../../format"
import type { MarketNewsItem } from "../../types"
import { MoEmptyData, MoTickerLink, type WidgetBodyProps } from "../shared"

export type MarketNewsWidgetProps = WidgetBodyProps<"market_news">

function getSafeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href
    }
    return null
  } catch {
    return null
  }
}

function categoryBadgeClass(category: string): string {
  const lower = category.trim().toLowerCase()
  if (lower.includes("thế giới")) return "mo-p-ac"
  if (lower.includes("thị trường")) return "mo-p-up"
  if (lower.includes("doanh nghiệp")) return "mo-p-rf"
  return "mo-p-ac"
}

function formatPublishedTooltip(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp)
  if (!Number.isFinite(parsed)) return isoTimestamp
  const vnDate = new Date(parsed + 7 * 3_600_000)
  const hh = String(vnDate.getUTCHours()).padStart(2, "0")
  const mm = String(vnDate.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm} · ${formatDayMonth(isoTimestamp)}`
}

export function MarketNewsWidget({ data }: MarketNewsWidgetProps) {
  const [selectedArticle, setSelectedArticle] = useState<MarketNewsItem | null>(null)
  const items = useMemo(() => data?.items ?? [], [data])

  if (!data || items.length === 0) {
    return <MoEmptyData />
  }

  return (
    <>
      <ul className="mo-nl">
        {items.map((item) => {
          const safeUrl = getSafeExternalUrl(item.url)
          const relTime = formatRelativeTimeVi(item.publishedAt)
          const badgeCls = categoryBadgeClass(item.category)

          const content = (
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5">
                <span className={`mo-pill ${badgeCls}`}>{item.category}</span>
                {item.source && <span className="mo-note truncate">{item.source}</span>}
              </div>
              <b className="line-clamp-2 leading-[1.35]" title={item.title}>
                {item.title}
              </b>
            </div>
          )

          return (
            <li key={item.id} data-fit="">
              <time
                dateTime={item.publishedAt}
                title={formatPublishedTooltip(item.publishedAt)}
                className="pt-0.5"
              >
                {relTime}
              </time>
              <div className="min-w-0">
                {safeUrl ? (
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-no-drag="true"
                    className="block text-inherit no-underline transition-colors hover:text-[var(--mo-acc2)]"
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    type="button"
                    data-no-drag="true"
                    onClick={() => setSelectedArticle(item)}
                    className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit transition-colors hover:text-[var(--mo-acc2)]"
                  >
                    {content}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {selectedArticle && (
        <div
          role="dialog"
          aria-label="Chi tiết tin thị trường"
          className="absolute inset-0 z-10 flex flex-col gap-2.5 overflow-hidden bg-[var(--mo-panel)] p-3"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--mo-line)] pb-2">
            <button
              type="button"
              data-no-drag="true"
              className="mo-btn px-2 py-1 text-xs"
              onClick={() => setSelectedArticle(null)}
            >
              ← Quay lại
            </button>
            <span className="mo-note">
              {formatPublishedTooltip(selectedArticle.publishedAt)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`mo-pill ${categoryBadgeClass(selectedArticle.category)}`}>
              {selectedArticle.category}
            </span>
            {selectedArticle.source && (
              <span className="mo-note">{selectedArticle.source}</span>
            )}
          </div>

          <p className="m-0 text-[13px] font-semibold leading-snug text-[var(--mo-tx)]">
            {selectedArticle.title}
          </p>

          {selectedArticle.symbols && selectedArticle.symbols.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="mo-note">Mã liên quan:</span>
              {selectedArticle.symbols.map((symbol) => (
                <MoTickerLink
                  key={symbol}
                  symbol={symbol}
                  data-sym={symbol}
                  className="mo-chipm hover:no-underline"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
