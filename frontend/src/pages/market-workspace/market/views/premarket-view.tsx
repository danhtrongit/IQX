// ─── Pre-market brief (Trước phiên) ───────────────────────────────────────────
// Renders the pre-market analysis of ITS OWN session — never the end-of-day
// (cuối phiên) or mid-day report. The backend always answers with the LATEST
// row, so a brief from a previous session is shown with a stale banner and the
// ATO countdown is suppressed: an old brief must never look live.
//
// Countdown: ticks every 1 000 ms → renders HH:MM:SS to 09:00:00.

import { Clock, LoaderCircle } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"

import { formatGeneratedAt, formatSessionDate, useLocalTodayIso } from "../date"
import { usePreMarketAnalysis } from "../hooks"
import { RichText } from "../rich-text"
import { AtoCountdown } from "./premarket/ato-countdown"
import { EventRow } from "./premarket/event-row"
import { NewsCard } from "./premarket/news-card"
import { SectionTitle } from "./premarket/section-title"
import { WatchItem } from "./premarket/watch-item"
import { WorldCellCard } from "./premarket/world-cell-card"

/** Tour stop that has no data yet — the tour still needs its target on screen. */
const TOUR_PLACEHOLDER_CLASS =
  "rounded-lg border border-dashed border-border bg-card p-6 text-[13px] text-muted-foreground"

export function PreMarketView({ tourMode = false }: { tourMode?: boolean }): ReactNode {
  const { data, isLoading, isError, error, refetch, isFetching } = usePreMarketAnalysis()
  const today = useLocalTodayIso()

  const isDataForToday = !!data && data.session_date === today
  const isStale = !!data && !isDataForToday

  // Loading spinner — first load only, and never in front of the tour.
  if (isLoading && !data && !tourMode) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        <span className="text-[13px]">Đang tải nhận định trước phiên…</span>
      </div>
    )
  }

  // No brief at all → pending/error notice with a retry. There is nothing else
  // to show: this view never falls back to another session's report.
  if (!data) {
    // The tour still has to walk every stop, so the targets are laid out as
    // placeholders with their real labels.
    if (tourMode) {
      const targets: [string, string][] = [
        ["tour-bantin-pre-header", "Bản Trước phiên · đang tải dữ liệu…"],
        ["tour-bantin-pre-world", "Đêm qua thế giới · đang tải dữ liệu…"],
        ["tour-bantin-pre-news", "Tin tức tác động · đang tải dữ liệu…"],
        ["tour-bantin-pre-events", "Lịch sự kiện hôm nay · đang tải dữ liệu…"],
        ["tour-bantin-pre-watch", "Khi vào phiên cần lưu ý · đang tải dữ liệu…"],
      ]
      return (
        <div className="mx-auto w-full max-w-[1180px] space-y-3">
          {targets.map(([id, label]) => (
            <section key={id} data-tour-id={id} className={TOUR_PLACEHOLDER_CLASS}>
              {label}
            </section>
          ))}
        </div>
      )
    }

    return (
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-4 py-2 text-xs text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden />
          <span>Bản trước phiên đang xử lý.</span>
          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Đang tải…" : "Thử lại"}
          </Button>
        </div>
        {isError ? (
          <p className="mt-2 text-xs text-destructive">{errorMessage(error)}</p>
        ) : (
          !isFetching && <p className="mt-2 text-xs text-muted-foreground">Chưa có dữ liệu cho phiên hôm nay.</p>
        )}
      </div>
    )
  }

  const { headline, tagline, paragraphs, meta } = data
  const watchlist = data.watchlist ?? []

  const worldCells = meta?.world_overview?.cells ?? []
  const hasWorldGrid = worldCells.length > 0
  const hasWorldPara = !!paragraphs?.world_paragraph
  const hotNews = meta?.hot_news ?? []
  const hasNews = hotNews.length > 0
  const events = meta?.events_filtered ?? []
  const hasEvents = events.length > 0
  const hasWatchlist = watchlist.length > 0

  const generatedLabel = formatGeneratedAt(data.generated_at)

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-3.5">
      {/* ── Stale banner — the latest brief is not today's ── */}
      {isStale && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-xs text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden />
          <span>Bản gần nhất {formatSessionDate(data.session_date)} · chưa cập nhật hôm nay</span>
        </div>
      )}

      {/* ── Article card ── */}
      <article className="relative overflow-hidden rounded-lg bg-card p-4">
        <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary" />

        <div data-tour-id="tour-bantin-pre-header">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-sm bg-primary/12 px-2 py-0.5 text-xs font-bold tracking-[0.05em] text-primary uppercase">
                IQX AI · SÁNG NAY
              </span>
              {data.session_date && (
                <span className="text-xs font-semibold">
                  Nhận định trước phiên {data.session_date}
                </span>
              )}
            </div>
            {generatedLabel && (
              <span className="text-xs text-muted-foreground">Cập nhật {generatedLabel}</span>
            )}
          </div>

          <h1 className="mt-3 text-xl font-bold leading-snug tracking-[-0.01em]">{headline}</h1>

          {/* Tagline — always the pre-market accent, not sentiment-driven */}
          {tagline?.text && (
            <div className="mt-2 text-sm font-medium tracking-[0.02em] text-primary">
              <span aria-hidden className="mr-1">
                ◆
              </span>
              <span>{tagline.text}</span>
            </div>
          )}
        </div>

        {/* World grid */}
        {hasWorldGrid && (
          <div
            data-tour-id="tour-bantin-pre-world"
            className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2"
          >
            {worldCells.map((cell) => (
              <WorldCellCard key={cell.id} cell={cell} />
            ))}
          </div>
        )}
        {!hasWorldGrid && tourMode && (
          <div
            data-tour-id="tour-bantin-pre-world"
            className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2"
          >
            <div className="rounded-md bg-secondary p-2.5 text-xs text-muted-foreground">
              Đang tải dữ liệu thế giới…
            </div>
          </div>
        )}

        {/* World paragraph */}
        {hasWorldPara && (
          <RichText
            html={paragraphs.world_paragraph}
            className="mt-3 block border-t border-border pt-3 text-sm leading-7 text-muted-foreground"
          />
        )}
      </article>

      {/* ── Hot news ── */}
      {hasNews && (
        <section data-tour-id="tour-bantin-pre-news" className="space-y-2.5">
          <SectionTitle label="Tin tức nổi bật" />
          <div className="space-y-2.5">
            {hotNews.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
      {!hasNews && tourMode && (
        <section data-tour-id="tour-bantin-pre-news" className={TOUR_PLACEHOLDER_CLASS}>
          Tin tức tác động · đang tải dữ liệu…
        </section>
      )}

      {/* ── Events timeline ── */}
      {hasEvents && (
        <section data-tour-id="tour-bantin-pre-events" className="space-y-2.5">
          <SectionTitle label="Sự kiện hôm nay" />
          <div className="space-y-2">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
      {!hasEvents && tourMode && (
        <section data-tour-id="tour-bantin-pre-events" className={TOUR_PLACEHOLDER_CLASS}>
          Lịch sự kiện hôm nay · đang tải dữ liệu…
        </section>
      )}

      {/* ── Watch list ── */}
      {hasWatchlist && (
        <section data-tour-id="tour-bantin-pre-watch" className="space-y-2.5">
          <SectionTitle label="Danh sách theo dõi" />
          <ul className="space-y-1.5">
            {watchlist.map((item, index) => (
              <WatchItem key={index} level={item.level} content={item.content} />
            ))}
          </ul>
        </section>
      )}
      {!hasWatchlist && tourMode && (
        <section data-tour-id="tour-bantin-pre-watch" className={TOUR_PLACEHOLDER_CLASS}>
          Khi vào phiên cần lưu ý · đang tải dữ liệu…
        </section>
      )}

      {/* ── ATO countdown — today's brief only (an old brief must never look live) ── */}
      {isDataForToday && <AtoCountdown />}
    </div>
  )
}
