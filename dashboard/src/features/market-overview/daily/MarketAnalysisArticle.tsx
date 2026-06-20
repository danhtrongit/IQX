// ─── MarketAnalysisArticle — v1.4 nhận định renderer ─────────────────────
// Renders the daily VN-Index market analysis produced by useDailyMarketAnalysis().
// HTML content in paragraphs is sanitized via sanitizeInline() before injection.

import { Skeleton } from "@arco-design/web-react"
import { useDailyMarketAnalysis } from "./useDailyMarketAnalysis"
import { sanitizeInline } from "@/shared/utils/sanitize-inline"
import type { Direction } from "./types"
import "./article.css"

// ─── Direction → tagline CSS modifier ──────────────────────────────────────

const DIRECTION_CLASS: Record<Direction, string> = {
  up:      "am-tagline--up",
  down:    "am-tagline--down",
  flat:    "am-tagline--flat",
  anomaly: "am-tagline--anomaly",
}

// ─── Loading skeleton ───────────────────────────────────────────────────────

function ArticleSkeleton() {
  return (
    <div className="am-skeleton-wrapper">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          animation
          text={{ rows: 1, width: `${90 - i * 8}%` }}
          image={false}
        />
      ))}
    </div>
  )
}

// ─── Section block ──────────────────────────────────────────────────────────

function SectionBlock({ label, html }: { label: string; html: string }) {
  return (
    <div className="am-paragraph-block">
      <div className="am-section-label">{label}</div>
      <div
        className="am-paragraph"
        dangerouslySetInnerHTML={{ __html: sanitizeInline(html) }}
      />
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function MarketAnalysisArticle() {
  const { data, isLoading, isError } = useDailyMarketAnalysis()

  if (isLoading) {
    return <ArticleSkeleton />
  }

  if (isError || !data) {
    return (
      <div className="am-error">
        Không thể tải nhận định thị trường. Vui lòng thử lại sau.
      </div>
    )
  }

  const { headline, tagline, paragraphs, session_date, session_type_display, unexplained } = data
  const taglineClass = DIRECTION_CLASS[tagline.direction] ?? "am-tagline--flat"

  return (
    <article className="am-article">
      {/* ── Header ── */}
      <div className="am-header">
        <div className="am-title-row">
          <span className="am-badge">IQX AI</span>
          <span className="am-session-label">Nhận định phiên {session_date}</span>
          <span className="am-session-type">Loại phiên: {session_type_display}</span>
        </div>
      </div>

      {/* ── Headline ── */}
      <h1 className="am-headline">{headline}</h1>

      {/* ── Tagline ── */}
      <div className={`am-tagline ${taglineClass}`}>
        <span className="am-tagline-marker">{tagline.marker}</span>{" "}
        <span className="am-tagline-text">{tagline.text}</span>
      </div>

      {/* ── 3 main sections ── */}
      <div className="am-paragraphs">
        <SectionBlock label="Cấu trúc phiên" html={paragraphs.structure} />
        <SectionBlock label="Dòng tiền" html={paragraphs.smart_money} />
        <SectionBlock label="Sức khỏe thị trường" html={paragraphs.market_health} />

        {/* ── Historical pattern (optional) ── */}
        {paragraphs.historical_pattern && (
          <SectionBlock label="Mẫu lịch sử" html={paragraphs.historical_pattern} />
        )}
      </div>

      {/* ── Unexplained callout (optional) ── */}
      {unexplained && (
        <div className="am-unexplained">
          <strong className="am-unexplained-title">Điểm chú ý</strong>
          {unexplained}
        </div>
      )}
    </article>
  )
}
