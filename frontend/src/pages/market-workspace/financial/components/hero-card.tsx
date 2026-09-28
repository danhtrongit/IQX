import type { ReactNode } from "react"

import { fmtNum } from "../charts/chart-tokens"

export interface HeroCardProps {
  ticker: string
  name: string
  exchange: string
  sector: string
  /** current market price (đồng) */
  price: number
  /** fair value / trung vị định giá (đồng) */
  fairValue: number
  /** upside % of fair value vs price (may be negative) */
  upsidePct: number
  /** one-line AI verdict (≤ 30 từ) — plain text, no pill */
  verdictOneliner: string
  /** optional scorecard slot (RadarScorecard) rendered inside the hero */
  children?: ReactNode
}

function signedPct(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  const sign = v >= 0 ? "+" : "−"
  return `${sign}${Math.abs(v).toFixed(1)}%`
}

/** |Δ| < 1% counts as "ngang giá" (gold), otherwise the up/down tokens. */
function upsideTone(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1) return "text-price-ref"
  return n > 0 ? "text-price-up" : "text-price-down"
}

/**
 * KHỐI 0 — danh thiếp: mã · tên · sàn · ngành · giá · giá hợp lý + kết luận 1 câu.
 * KHÔNG verdict pill; kết luận nằm trong câu văn dưới nhãn "Kết luận một câu".
 */
export function HeroCard({
  ticker,
  name,
  exchange,
  sector,
  price,
  fairValue,
  upsidePct,
  verdictOneliner,
  children,
}: HeroCardProps) {
  return (
    <div className="rounded-lg bg-card">
      <div data-tour-id="tour-bctc-hero">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border p-5 sm:px-8 sm:py-7">
          <div className="flex flex-wrap items-end gap-4">
            <div className="font-heading text-5xl font-semibold leading-[0.85] tracking-tight sm:text-[62px]">
              {ticker}
            </div>
            <div className="pb-1">
              <div className="text-[15px] font-semibold">{name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {exchange} · {sector}
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-sm bg-primary/12 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.05em] text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                Ngành: {sector}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-heading text-[31px] font-medium tabular-nums">
              {fmtNum(price)}
              <span className="text-[13px] text-muted-foreground"> đ</span>
            </div>
            <div className={`mt-1 text-xs font-medium tabular-nums ${upsideTone(upsidePct)}`}>
              Giá hợp lý {fmtNum(fairValue)} ({signedPct(upsidePct)})
            </div>
          </div>
        </div>

        <div className="px-5 pt-5 sm:px-8 sm:pt-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            Kết luận một câu
          </div>
          <h2 className="max-w-[30ch] font-heading text-2xl font-medium leading-snug tracking-tight sm:text-[28px]">
            {verdictOneliner}
          </h2>
        </div>
      </div>

      {children ? (
        <div className="px-5 py-6 sm:px-8" data-tour-id="tour-bctc-scorecard">
          {children}
        </div>
      ) : null}
    </div>
  )
}
