// ─── MidDayArticle — orange variant of MarketAnalysisArticle ─────────────────
// Prop-driven (MidDayView owns the fetch). Renders:
//   • Orange badge "IQX AI · PHIÊN SÁNG"
//   • Headline + tagline (◆ prefix, colored by tagline.color)
//   • 2 published paragraphs: Cấu trúc phiên sáng / Dòng tiền phiên sáng
//   • market_health pending placeholder (dashed border, ⏱, pending_message)
//   • "Điểm cần xác nhận trong phiên chiều" callout (orange left-border)
// HTML content is sanitized via sanitizeInline — same mechanism as MarketAnalysisArticle.

import { sanitizeInline } from "@/shared/utils/sanitize-inline"
import type { MidDayAnalysis } from "./types"
import "./midday.css"

// ─── Color → tagline CSS modifier ────────────────────────────────────────────

const COLOR_CLASS: Record<string, string> = {
  up:      "mm-tagline--up",
  down:    "mm-tagline--down",
  neutral: "mm-tagline--neutral",
}

// ─── Section block (published paragraph) ─────────────────────────────────────

function SectionBlock({ label, html }: { label: string; html: string }) {
  return (
    <div className="mm-paragraph-block">
      <div className="mm-section-label">{label}</div>
      <div
        className="mm-paragraph"
        dangerouslySetInnerHTML={{ __html: sanitizeInline(html) }}
      />
    </div>
  )
}

// ─── Pending placeholder ──────────────────────────────────────────────────────

function PendingBlock({ label, message }: { label: string; message: string }) {
  return (
    <div className="mm-paragraph-block">
      <div className="mm-section-label">{label}</div>
      <div className="mm-pending">
        <span className="mm-pending-icon" aria-hidden>⏱</span>
        <div>
          <span className="mm-pending-label">Đang chờ</span>
          <span className="mm-pending-message">{message}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MidDayArticle({ data }: { data: MidDayAnalysis }) {
  const { headline, tagline, paragraphs, session_date, unexplained } = data
  const taglineClass = COLOR_CLASS[tagline.color] ?? "mm-tagline--neutral"

  return (
    <article className="mm-article">
      {/* ── Header ── */}
      <div className="mm-header">
        <div className="mm-title-row">
          <span className="mm-badge">IQX AI · PHIÊN SÁNG</span>
          {session_date && (
            <span className="mm-session-label">Nhận định phiên sáng {session_date}</span>
          )}
        </div>
      </div>

      {/* ── Headline ── */}
      <h1 className="mm-headline">{headline}</h1>

      {/* ── Tagline ── */}
      <div className={`mm-tagline ${taglineClass}`}>
        <span className="mm-tagline-marker" aria-hidden>◆</span>
        <span className="mm-tagline-text">{tagline.text}</span>
      </div>

      {/* ── 3 paragraphs ── */}
      <div className="mm-paragraphs">
        <SectionBlock
          label="Cấu trúc phiên sáng"
          html={paragraphs.session_structure.content}
        />
        <SectionBlock
          label="Dòng tiền phiên sáng"
          html={paragraphs.money_flow.content}
        />
        <PendingBlock
          label="Sức khỏe thị trường"
          message={paragraphs.market_health.pending_message}
        />
      </div>

      {/* ── Unexplained callout ── */}
      {unexplained && (
        <div className="mm-unexplained">
          <strong className="mm-unexplained-title">{unexplained.title}</strong>
          <div
            className="mm-unexplained-body"
            dangerouslySetInnerHTML={{ __html: sanitizeInline(unexplained.content) }}
          />
        </div>
      )}
    </article>
  )
}
