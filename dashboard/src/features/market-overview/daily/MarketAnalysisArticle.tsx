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

function SectionBlock({ label, html, tourId }: { label: string; html: string; tourId?: string }) {
  return (
    <div className="am-paragraph-block" data-tour-id={tourId}>
      <div className="am-section-label">{label}</div>
      <div
        className="am-paragraph"
        dangerouslySetInnerHTML={{ __html: sanitizeInline(html) }}
      />
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function MarketAnalysisArticle({ tourMode = false }: { tourMode?: boolean }) {
  const { data, isLoading, isError } = useDailyMarketAnalysis()

  if (isLoading && !tourMode) {
    return <ArticleSkeleton />
  }

  if ((isError || !data) && tourMode) {
    return <article className="am-article">{[
      ["tour-bantin-end-header", "Bản Cuối phiên · đang tải dữ liệu…"],
      ["tour-bantin-end-structure", "Cấu trúc phiên · đang tải dữ liệu…"],
      ["tour-bantin-end-flow", "Dòng tiền · đang tải dữ liệu…"],
      ["tour-bantin-end-health", "Sức khỏe thị trường · đang tải dữ liệu…"],
      ["tour-bantin-end-unexplained", "Điểm chú ý · đang tải dữ liệu…"],
    ].map(([id, label]) => <section key={id} data-tour-id={id} className="am-paragraph-block">{label}</section>)}</article>
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
      <div data-tour-id="tour-bantin-end-header">
      <div className="am-header">
        <div className="am-title-row">
          <span className="am-badge">IQX AI</span>
          <span className="am-session-label">Nhận định phiên {session_date}</span>
          {session_type_display && (
            <span className="am-session-type">Loại phiên: {session_type_display}</span>
          )}
        </div>
      </div>

      {/* ── Headline ── */}
      <h1 className="am-headline">{headline}</h1>

      {/* ── Tagline ── */}
      <div className={`am-tagline ${taglineClass}`}>
        <span className="am-tagline-marker">{tagline.marker}</span>{" "}
        <span className="am-tagline-text">{tagline.text}</span>
      </div>
      </div>

      {/* ── 3 main sections ── */}
      <div className="am-paragraphs">
        <SectionBlock tourId="tour-bantin-end-structure" label="Cấu trúc phiên" html={paragraphs.structure} />
        <SectionBlock tourId="tour-bantin-end-flow" label="Dòng tiền" html={paragraphs.smart_money} />
        <SectionBlock tourId="tour-bantin-end-health" label="Sức khỏe thị trường" html={paragraphs.market_health} />

        {/* ── Historical pattern (optional) ── */}
        {paragraphs.historical_pattern && (
          <SectionBlock label="Mẫu lịch sử" html={paragraphs.historical_pattern} />
        )}
      </div>

      {/* ── Unexplained callout (optional) ── */}
      {unexplained && (
        <div className="am-unexplained" data-tour-id="tour-bantin-end-unexplained">
          <strong className="am-unexplained-title">Điểm chú ý</strong>
          <div className="am-unexplained-body" dangerouslySetInnerHTML={{ __html: sanitizeInline(unexplained) }} />
        </div>
      )}
      {!unexplained && tourMode && <div className="am-unexplained" data-tour-id="tour-bantin-end-unexplained">Điểm chú ý · đang tải dữ liệu…</div>}
    </article>
  )
}
