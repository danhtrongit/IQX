import { Clock } from "lucide-react"

import { formatGeneratedAt, formatSessionDate, isSameLocalDay } from "../../date"
import { RichText } from "../../rich-text"
import type { DailyAnalysis, Direction } from "../../types"

/** Tagline tone per direction — the marker is data, the colour is ours. */
const TAGLINE_TONE: Record<Direction, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "text-price-ref",
  anomaly: "text-primary",
}

function SectionBlock({ label, html }: { label: string; html: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 border-b border-border pb-2 font-heading text-sm font-bold tracking-[-0.01em] text-foreground">
        <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-[2px] bg-primary" />
        {label}
      </div>
      <div className="text-[13px] leading-[1.7] text-muted-foreground">
        <RichText html={html} />
      </div>
    </div>
  )
}

/**
 * The end-of-day brief masthead + body: headline, tagline, the four paragraph
 * blocks (the historical pattern only when the backend sends one), the
 * unexplained callout, and the provenance footer.
 *
 * `tourMode` only affects the unexplained callout: when the brief has nothing
 * unexplained the callout is still rendered as a placeholder so the tour has a
 * target, exactly like the legacy page.
 */
export function MarketAnalysisArticle({
  data,
  tourMode = false,
}: {
  data: DailyAnalysis
  tourMode?: boolean
}) {
  const { headline, tagline, paragraphs, session_date, session_type_display, unexplained, generated_at } =
    data

  const dateLabel = formatSessionDate(session_date) || session_date
  const generatedLabel = formatGeneratedAt(generated_at)
  const isToday = isSameLocalDay(session_date)
  // The direction is a closed union in the contract, but a payload with a new
  // value must still render — the reference gold is the neutral fallback.
  const taglineTone = TAGLINE_TONE[tagline.direction] || "text-price-ref"

  return (
    <article className="relative overflow-hidden rounded-lg bg-card p-4">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-primary/40 to-primary"
      />

      <div data-tour-id="tour-bantin-end-header">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-sm bg-primary/12 px-2.5 py-1 text-xs font-semibold tracking-[0.05em] text-primary uppercase">
            IQX AI
          </span>
          <span className="text-xs font-semibold text-foreground">
            Nhận định phiên {dateLabel}
          </span>
          {session_type_display && (
            <span className="text-xs text-muted-foreground">Loại phiên: {session_type_display}</span>
          )}
        </div>

        <h1 className="mt-3 font-heading text-xl leading-snug font-bold tracking-[-0.01em] text-foreground">
          {headline}
        </h1>

        <p className={`mt-2.5 text-[13px] font-medium tracking-[0.02em] ${taglineTone}`}>
          <span aria-hidden>{tagline.marker}</span> <span>{tagline.text}</span>
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <SectionBlock label="Cấu trúc phiên" html={paragraphs.structure} />
        <SectionBlock label="Dòng tiền" html={paragraphs.smart_money} />
        <SectionBlock label="Sức khỏe thị trường" html={paragraphs.market_health} />
        {paragraphs.historical_pattern && (
          <SectionBlock label="Mẫu lịch sử" html={paragraphs.historical_pattern} />
        )}
      </div>

      {unexplained ? (
        <div
          data-tour-id="tour-bantin-end-unexplained"
          className="mt-5 rounded-sm border-l-[3px] border-l-destructive bg-destructive/10 px-4 py-3"
        >
          <strong className="mb-1 block text-xs font-bold tracking-[0.04em] text-destructive uppercase">
            Điểm chú ý
          </strong>
          <div className="text-xs leading-relaxed text-muted-foreground">
            <RichText html={unexplained} />
          </div>
        </div>
      ) : tourMode ? (
        <div
          data-tour-id="tour-bantin-end-unexplained"
          className="mt-5 rounded-sm border-l-[3px] border-l-destructive bg-destructive/10 px-4 py-3 text-xs text-muted-foreground"
        >
          Điểm chú ý · đang tải dữ liệu…
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <Clock aria-hidden className="size-3.5 shrink-0" />
        <span>{generatedLabel ? `Bản tin tạo lúc ${generatedLabel}` : `Phiên ${dateLabel}`}</span>
        {!isToday && <span className="text-price-ref">Bản gần nhất — chưa có bản tin hôm nay</span>}
      </div>
    </article>
  )
}
