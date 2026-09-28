// ─── News card ────────────────────────────────────────────────────────────────
// One overnight/session-relevant news item: sentiment chip, source, published
// time, title, affected tickers, the AI's reading of the impact on this
// morning's session (its "Tác động phiên sáng nay:" label is part of `insight`),
// and an outbound link to the original article when the backend supplied one.

import { ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"

import { RichText } from "../../rich-text"
import type { ResolvedNews } from "../../types"
import { TickerPill } from "./ticker-pill"

type Sentiment = "pos" | "neg" | "neu"

const CHIP_TONE: Record<Sentiment, string> = {
  pos: "bg-price-up/15 text-price-up",
  neg: "bg-price-down/15 text-price-down",
  neu: "bg-muted text-muted-foreground",
}

const CHIP_LABEL: Record<Sentiment, string> = {
  pos: "Tích cực",
  neg: "Tiêu cực",
  neu: "Trung lập",
}

export function NewsCard({ item }: { item: ResolvedNews }) {
  // The backend passes vietcap sentiment through VERBATIM ("Positive" /
  // "Negative" / "Neutral"), so it is matched case-insensitively by prefix.
  const sentiment = (item.sentiment ?? "").toLowerCase()
  const kind: Sentiment = sentiment.startsWith("pos")
    ? "pos"
    : sentiment.startsWith("neg")
      ? "neg"
      : "neu"
  const tickers = item.tickers ?? []

  // published_at is rendered as the UTC wall clock, like the legacy card did.
  const publishedAt = new Date(item.published_at)
  const timeStr = Number.isNaN(publishedAt.getTime())
    ? ""
    : `${String(publishedAt.getUTCHours()).padStart(2, "0")}:${String(publishedAt.getUTCMinutes()).padStart(2, "0")} UTC`

  return (
    <article className="rounded-md bg-secondary p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-xs font-bold tracking-[0.04em] uppercase",
            CHIP_TONE[kind],
          )}
        >
          {CHIP_LABEL[kind]}
        </span>
        <span className="text-xs text-muted-foreground">{item.source}</span>
        {timeStr && <span className="text-xs text-muted-foreground">{timeStr}</span>}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden="true" />
            Mở bài gốc
          </a>
        )}
      </div>

      <div className="mt-1.5 text-sm font-semibold leading-snug">{item.title}</div>

      {tickers.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tickers.map((ticker) => (
            <TickerPill key={ticker} ticker={ticker} />
          ))}
        </div>
      )}

      {item.insight && (
        <div className="mt-1.5 text-sm leading-6 text-muted-foreground">
          <RichText html={item.insight} />
        </div>
      )}
    </article>
  )
}
