// ─── MidDayArticle — thân bản tin Giữa phiên ─────────────────────────────────
// Prop-driven (MidDayView owns the fetch). Renders the AI header (badge,
// headline, tagline), the two published paragraphs, the pending market-health
// card and the "điểm cần xác nhận" callout.
//
// Every AI-authored fragment goes through RichText, so model output is never
// injected as raw HTML — the legacy sanitizeInline + dangerouslySetInnerHTML pair
// is replaced by an allowlisted React renderer.

import { Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { formatGeneratedAt } from "../../date"
import { RichText } from "../../rich-text"
import type { MidDayAnalysis } from "../../types"

/** Tagline tone — the AI's own read of the morning, so it drives the colour. */
const TAGLINE_TONE: Record<MidDayAnalysis["tagline"]["color"], string> = {
  up: "text-price-up",
  down: "text-price-down",
  neutral: "text-accent",
}

function SectionHeading({ label }: { label: string }) {
  return (
    <h2 className="flex items-center gap-2.5 border-b border-border pb-2 font-heading text-sm font-bold tracking-tight text-foreground">
      <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden />
      {label}
    </h2>
  )
}

function SectionBlock({ label, html, tourId }: { label: string; html: string; tourId: string }) {
  return (
    <section data-tour-id={tourId} className="flex flex-col gap-2">
      <SectionHeading label={label} />
      <div className="text-[13px] leading-relaxed text-muted-foreground">
        <RichText html={html} />
      </div>
    </section>
  )
}

/**
 * `market_health` is always pending in the mid-day brief: the health indices can
 * only be computed once the session closes, so the card says when it lands
 * instead of rendering an empty chart.
 */
function PendingBlock({
  label,
  message,
  until,
  tourId,
}: {
  label: string
  message: string
  until: string
  tourId: string
}) {
  const untilLabel = until ? formatGeneratedAt(until) || until : ""

  return (
    <section data-tour-id={tourId} className="flex flex-col gap-2">
      <SectionHeading label={label} />
      <div className="flex items-start gap-2.5 rounded-md border border-dashed border-accent/60 bg-accent/10 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Clock className="mt-px size-4 shrink-0 text-accent" aria-hidden />
        <div>
          <span className="mb-0.5 block text-xs font-bold uppercase tracking-[0.05em] text-accent">
            Đang chờ
          </span>
          <span>{message}</span>
          {untilLabel && <span className="text-muted-foreground/80"> · {untilLabel}</span>}
        </div>
      </div>
    </section>
  )
}

export function MidDayArticle({ data, tourMode = false }: { data: MidDayAnalysis; tourMode?: boolean }) {
  const { headline, tagline, paragraphs, session_date, unexplained } = data

  return (
    <article className="rounded-lg bg-card p-4">
      <div data-tour-id="tour-bantin-mid-header">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="gold" className="text-xs font-bold tracking-[0.05em] uppercase">
            IQX AI · PHIÊN SÁNG
          </Badge>
          {session_date && (
            <span className="text-xs text-muted-foreground">Nhận định phiên sáng {session_date}</span>
          )}
        </div>

        <h1 className="mt-3 font-heading text-xl font-bold tracking-tight text-foreground">{headline}</h1>

        <p className={cn("mt-2 text-[13px] font-medium tracking-[0.02em]", TAGLINE_TONE[tagline.color])}>
          <span className="mr-1" aria-hidden>
            ◆
          </span>
          {tagline.text}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <SectionBlock
          tourId="tour-bantin-mid-structure"
          label="Cấu trúc phiên sáng"
          html={paragraphs.session_structure.content}
        />
        <SectionBlock
          tourId="tour-bantin-mid-flow"
          label="Dòng tiền phiên sáng"
          html={paragraphs.money_flow.content}
        />
        <PendingBlock
          tourId="tour-bantin-mid-health"
          label="Sức khỏe thị trường"
          message={paragraphs.market_health.pending_message}
          until={paragraphs.market_health.pending_until}
        />
      </div>

      {unexplained ? (
        <div
          data-tour-id="tour-bantin-mid-confirm"
          className="mt-4 rounded-md border-l-[3px] border-l-accent bg-accent/10 px-4 py-3"
        >
          <strong className="mb-1 block text-xs font-bold tracking-[0.04em] text-accent uppercase">
            {unexplained.title}
          </strong>
          <div className="text-xs leading-relaxed text-muted-foreground">
            <RichText html={unexplained.content} />
          </div>
        </div>
      ) : tourMode ? (
        <div
          data-tour-id="tour-bantin-mid-confirm"
          className="mt-4 rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
        >
          Điểm cần xác nhận trong phiên chiều · đang tải dữ liệu…
        </div>
      ) : null}
    </article>
  )
}
