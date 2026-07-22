// ─── PreMarketView ────────────────────────────────────────────────────────────
// Fetches pre-market analysis and renders the full "trước phiên" layout.
// Always renders ITS OWN latest brief — never falls back to the end-of-day
// (cuối phiên) report. When the latest brief isn't today's, a stale banner is
// shown and the ATO countdown is suppressed (an old brief must never look live).
//
// Accent colour: cyan #4FD0FF  (EOD=default, midday=orange, premarket=cyan)
// Countdown: ticks every 1 000 ms → renders HH:MM:SS to 09:00:00

import { useState, useEffect } from "react"
import { Spin } from "@arco-design/web-react"
import { sanitizeInline } from "@/shared/utils/sanitize-inline"
import { usePreMarketAnalysis } from "./usePreMarketAnalysis"
import { localTodayIso } from "../home-analysis/localDate"
import { formatSessionDate } from "../home-analysis/formatSessionDate"
import type { WorldCell, ResolvedEvent } from "./types"
import "./premarket.css"

// ─── Event type → icon map ────────────────────────────────────────────────────

const EVENT_ICON: Record<string, string> = {
  ex_dividend: "₫",
  agm:         "◆",
  insider:     "▲",
  listing:     "★",
  other:       "•",
}

function eventIcon(type: string): string {
  return EVENT_ICON[type] ?? "•"
}

// ─── Impact chip labels ───────────────────────────────────────────────────────

const IMPACT_LABEL: Record<string, string> = {
  high:   "Cao",
  medium: "Trung bình",
  low:    "Thấp",
}

const IMPACT_CLASS: Record<string, string> = {
  high:   "pm-event-impact--high",
  medium: "pm-event-impact--medium",
  low:    "pm-event-impact--low",
}

// ─── ATO countdown hook (ticks every 1 s, renders HH:MM:SS) ──────────────────

function useAtoCountdown(): string {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const now = new Date()
  const target = new Date(now)
  target.setHours(9, 0, 0, 0)

  if (now >= target) return "00:00:00"

  const diffMs = target.getTime() - now.getTime()
  const totalSec = Math.floor(diffMs / 1000)
  const hh = Math.floor(totalSec / 3600)
  const mm = Math.floor((totalSec % 3600) / 60)
  const ss = totalSec % 60

  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}

// ─── World cell ───────────────────────────────────────────────────────────────

export function WorldCellCard({ cell }: { cell: WorldCell }) {
  const hasValue = cell.value != null
  const sentimentClass = !hasValue
    ? ""
    : cell.sentiment === "up"
      ? "pm-world-cell--up"
      : cell.sentiment === "down"
        ? "pm-world-cell--down"
        : ""
  const staleClass = cell.stale ? " pm-world-cell--stale" : ""
  const changeClass =
    cell.sentiment === "up"
      ? "pm-world-cell-change--up"
      : cell.sentiment === "down"
        ? "pm-world-cell-change--down"
        : "pm-world-cell-change--flat"

  return (
    <div
      className={`pm-world-cell ${sentimentClass}${staleClass}`}
      title={
        !hasValue
          ? `${cell.label}: dữ liệu chưa có`
          : cell.stale
            ? `${cell.label}: số phiên gần nhất (chưa cập nhật hôm nay)`
            : undefined
      }
    >
      <div className="pm-world-cell-label">
        {cell.label}
        {hasValue && cell.stale && <span className="pm-world-cell-stale-tag"> · cũ</span>}
      </div>
      {!hasValue ? (
        <div className="pm-world-cell-value">—</div>
      ) : (
        <>
          <div className="pm-world-cell-value">{cell.value!.toLocaleString("vi-VN")}</div>
          {cell.change_pct != null && (
            <div className={`pm-world-cell-change ${changeClass}`}>
              {cell.change_pct > 0 ? "+" : ""}
              {cell.change_pct.toFixed(2)}%
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── News card ────────────────────────────────────────────────────────────────

function NewsCard({ item }: { item: import("./types").ResolvedNews }) {
  // Backend passes vietcap sentiment through VERBATIM ("Positive"/"Negative"/
  // "Neutral") — match case-insensitively by prefix, like NewsFeedPanel does.
  const sentiment = (item.sentiment ?? "").toLowerCase()
  const sentimentChipClass = sentiment.startsWith("pos")
    ? "pm-news-chip--pos"
    : sentiment.startsWith("neg")
      ? "pm-news-chip--neg"
      : "pm-news-chip--neu"

  const sentimentLabel = sentiment.startsWith("pos")
    ? "Tích cực"
    : sentiment.startsWith("neg")
      ? "Tiêu cực"
      : "Trung lập"

  // Format published_at → simple HH:MM
  let timeStr = ""
  try {
    const d = new Date(item.published_at)
    const hh = String(d.getUTCHours()).padStart(2, "0")
    const mm = String(d.getUTCMinutes()).padStart(2, "0")
    timeStr = `${hh}:${mm} UTC`
  } catch {
    // ignore
  }

  return (
    <div className="pm-news-card">
      <div className="pm-news-meta">
        <span className={`pm-news-chip ${sentimentChipClass}`}>{sentimentLabel}</span>
        <span className="pm-news-source">{item.source}</span>
        {timeStr && <span className="pm-news-source">{timeStr}</span>}
      </div>
      <div className="pm-news-title">{item.title}</div>
      {item.tickers.length > 0 && (
        <div className="pm-news-tickers">
          {item.tickers.map(t => (
            <span key={t} className="pm-ticker-pill">{t}</span>
          ))}
        </div>
      )}
      {item.insight && (
        <div
          className="pm-news-insight"
          dangerouslySetInnerHTML={{ __html: sanitizeInline(item.insight) }}
        />
      )}
    </div>
  )
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: ResolvedEvent }) {
  const impactLabel = IMPACT_LABEL[event.impact] ?? event.impact
  const impactClass = IMPACT_CLASS[event.impact] ?? "pm-event-impact--low"

  return (
    <div className="pm-event-row">
      <div className="pm-event-icon" aria-hidden>{eventIcon(event.type)}</div>
      <div className="pm-event-body">
        <div className="pm-event-time">{event.time_label}</div>
        <div className="pm-event-title">{event.title}</div>
        {event.tickers.length > 0 && (
          <div className="pm-event-tickers">
            {event.tickers.map(t => (
              <span key={t} className="pm-ticker-pill">{t}</span>
            ))}
          </div>
        )}
      </div>
      <span className={`pm-event-impact ${impactClass}`}>{impactLabel}</span>
    </div>
  )
}

// ─── Watchlist item ───────────────────────────────────────────────────────────

function WatchItem({ level, content }: { level: string; content: string }) {
  const dotColor =
    level === "warn"
      ? "#ef4444"
      : level === "alert"
        ? "#eab308"
        : "#4FD0FF" // cyan for normal

  const rowClass =
    level === "warn"
      ? " pm-watchlist-item--warn"
      : level === "alert"
        ? " pm-watchlist-item--alert"
        : ""

  return (
    <li className={`pm-watchlist-item${rowClass}`}>
      <span
        className="pm-watchlist-dot"
        style={{ background: dotColor }}
        aria-hidden
      />
      <span
        className="text-[var(--color-text-2)]"
        dangerouslySetInnerHTML={{ __html: sanitizeInline(content) }}
      />
    </li>
  )
}

// ─── ATO Countdown section ────────────────────────────────────────────────────

function AtoCountdown() {
  const clock = useAtoCountdown()
  return (
    <div className="pm-countdown-section">
      <span className="pm-countdown-label">
        Phiên giao dịch sắp mở lúc 9:00 — khớp lệnh ATO bắt đầu
      </span>
      <span
        className="pm-countdown-clock"
        data-testid="ato-countdown"
        aria-label={`Còn ${clock} đến phiên ATO`}
      >
        {clock}
      </span>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }) {
  return <div className="pm-section-title">{label}</div>
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PreMarketView() {
  const { data, isLoading } = usePreMarketAnalysis()

  // ─── Stale-brief gate ─────────────────────────────────────────────────────
  // Backend always returns the LATEST row (200), so `data` is truthy even when it
  // belongs to a previous session. We always render THIS view's own brief —
  // never the end-of-day (cuối phiên) report. When it isn't today's, show a
  // stale banner instead of hiding the content.
  const isDataForToday = !!data && data.session_date === localTodayIso()
  const isStale = !!data && !isDataForToday

  // Belt-and-suspenders: only show ATO countdown when brief is today's
  const showAtoCountdown = isDataForToday

  // Loading spinner (first load only)
  if (isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spin tip="Đang tải nhận định trước phiên…" />
      </div>
    )
  }

  // No brief at all → "processing" notice (there is nothing else to show)
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-2 py-2 md:px-4">
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px]"
          style={{
            background: "var(--color-fill-2)",
            border: "1px solid var(--color-border-2)",
            color: "var(--color-text-3)",
          }}
        >
          <span aria-hidden>⏱</span>
          <span>Bản trước phiên đang xử lý.</span>
        </div>
      </div>
    )
  }

  const { headline, tagline, paragraphs, watchlist, meta } = data

  const worldCells = meta?.world_overview?.cells ?? []
  const hasWorldGrid = worldCells.length > 0
  const hasWorldPara = !!paragraphs?.world_paragraph
  const hotNews = meta?.hot_news ?? []
  const hasNews = hotNews.length > 0
  const events = meta?.events_filtered ?? []
  const hasEvents = events.length > 0
  const hasWatchlist = watchlist.length > 0

  return (
    <div className="pm-view mx-auto w-full max-w-[1280px] px-2 py-3 md:px-4">
      {/* ── Stale banner — shown when the latest brief isn't today's ── */}
      {isStale && (
        <div className="pm-stale-banner">
          <span aria-hidden>⏱</span>
          <span>
            Bản gần nhất {formatSessionDate(data.session_date)} · chưa cập nhật hôm nay
          </span>
        </div>
      )}

      {/* ── Article card ── */}
      <article className="pm-article" style={{ marginBottom: 14 }}>
        {/* Header */}
        <div className="pm-header">
          <div className="pm-title-row">
            <span className="pm-badge">IQX AI · SÁNG NAY</span>
            {data.session_date && (
              <span className="pm-session-label">Nhận định trước phiên {data.session_date}</span>
            )}
          </div>
        </div>

        {/* Headline */}
        <h1 className="pm-headline">{headline}</h1>

        {/* Tagline — always cyan, not sentiment-driven */}
        <div className="pm-tagline">
          <span className="pm-tagline-marker" aria-hidden>◆</span>
          <span className="pm-tagline-text">{tagline.text}</span>
        </div>

        {/* World grid */}
        {hasWorldGrid && (
          <>
            <div className="pm-world-grid">
              {worldCells.map(cell => (
                <WorldCellCard key={cell.id} cell={cell} />
              ))}
            </div>
          </>
        )}

        {/* World paragraph */}
        {hasWorldPara && (
          <div
            className="pm-world-paragraph"
            dangerouslySetInnerHTML={{ __html: sanitizeInline(paragraphs.world_paragraph!) }}
          />
        )}
      </article>

      {/* ── Hot news ── */}
      {hasNews && (
        <section style={{ marginBottom: 14 }}>
          <SectionTitle label="Tin tức nổi bật" />
          <div className="pm-news-list">
            {hotNews.map(item => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── Events timeline ── */}
      {hasEvents && (
        <section style={{ marginBottom: 14 }}>
          <SectionTitle label="Sự kiện hôm nay" />
          <div className="pm-events-list">
            {events.map(ev => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </div>
        </section>
      )}

      {/* ── Watch list ── */}
      {hasWatchlist && (
        <section style={{ marginBottom: 14 }}>
          <SectionTitle label="Danh sách theo dõi" />
          <ul className="pm-watchlist-list list-none p-0 m-0">
            {watchlist.map((item, i) => (
              <WatchItem key={i} level={item.level} content={item.content} />
            ))}
          </ul>
        </section>
      )}

      {/* ── ATO Countdown — only for today's brief ── */}
      {showAtoCountdown && <AtoCountdown />}
    </div>
  )
}
