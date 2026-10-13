/**
 * "Góc nhìn đầu tư" — the investment-view block of the AI Insight briefing:
 * numbered main theses plus a reference valuation. It is non-blocking: it
 * renders a skeleton while the job runs and nothing at all when there is no
 * view (empty, feature off, not premium, any error) — never a message.
 */
import { type JSX, useId } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { InvestmentThesis, InvestmentValuation } from "./types"
import { useInvestmentView } from "./use-investment-view"

const EYEBROW_CLASS = "text-xs font-semibold tracking-widest uppercase"
const LABEL_CLASS = "text-xs font-medium tracking-wide text-muted-foreground uppercase"

const percentFormat = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
})

/** `+10,2%` / `-3,5%` — vi-VN comma, one decimal, explicit sign. */
function formatUpside(value: number): string {
  return `${percentFormat.format(value).replace("−", "-")}%`
}

function upsideTone(value: number): string {
  if (value > 0) return "text-price-up"
  if (value < 0) return "text-price-down"
  return "text-foreground"
}

function Frame({
  children,
  busy = false,
}: {
  children: React.ReactNode
  busy?: boolean
}): JSX.Element {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      data-testid="investment-view"
      className="flex flex-col gap-5 rounded-lg border-0 bg-card px-4 py-4"
    >
      <h2 id={titleId} className={cn(EYEBROW_CLASS, "text-price-ref")}>
        Góc nhìn đầu tư
      </h2>
      {children}
    </section>
  )
}

function ThesesModule({ theses }: { theses: InvestmentThesis[] }): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h3 className={LABEL_CLASS}>Luận điểm chính</h3>
      <ol className="flex flex-col gap-4">
        {theses.map((thesis, index) => {
          const number = String(index + 1).padStart(2, "0")
          return (
            <li key={thesis.id} className="sm:flex sm:gap-4">
              <span
                aria-hidden="true"
                className="hidden w-8 shrink-0 pt-0.5 text-sm font-semibold text-muted-foreground tabular-nums sm:block"
              >
                {number}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-heading text-base font-bold">
                  <span aria-hidden="true" className="text-muted-foreground tabular-nums sm:hidden">
                    {number} ·{" "}
                  </span>
                  {thesis.title}
                </h4>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{thesis.summary}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ValuationCell({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className={cn("font-heading text-base font-bold tabular-nums", className)}>{value}</dd>
    </div>
  )
}

function ValuationModule({ valuation }: { valuation: InvestmentValuation }): JSX.Element {
  const isRange = valuation.mode === "range"
  const upside = valuation.upsidePercent
  return (
    <div role="group" aria-label="Định giá tham chiếu" className="flex flex-col gap-3">
      <h3 className={LABEL_CLASS}>Định giá tham chiếu</h3>
      <dl className="grid gap-4 sm:grid-cols-3">
        <ValuationCell
          label={isRange ? "Giá mục tiêu trung vị" : "Giá mục tiêu"}
          value={formatNumber(valuation.targetMedian)}
        />
        {valuation.mode === "range" ? (
          <ValuationCell
            label="Khoảng tham chiếu"
            value={`${formatNumber(valuation.targetMin)} – ${formatNumber(valuation.targetMax)}`}
          />
        ) : null}
        {upside !== null && upside !== undefined ? (
          <ValuationCell
            label="So với giá hiện tại"
            value={formatUpside(upside)}
            className={upsideTone(upside)}
          />
        ) : null}
      </dl>
    </div>
  )
}

function InvestmentViewSkeleton(): JSX.Element {
  return (
    <Frame busy>
      <div className="flex flex-col gap-3" data-testid="investment-view-skeleton">
        <Skeleton className="h-3 w-28" />
        {[0, 1, 2].map((n) => (
          <div key={n} className="flex gap-3 sm:gap-4">
            <Skeleton className="hidden h-4 w-8 shrink-0 sm:block" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-full" />
      </div>
    </Frame>
  )
}

export function InvestmentViewBlock({ symbol }: { symbol: string }): JSX.Element | null {
  const { view, isProcessing } = useInvestmentView(symbol)

  if (isProcessing) return <InvestmentViewSkeleton />
  if (!view || view.status !== "ready") return null

  const theses = [...view.theses].sort((a, b) => a.order - b.order)
  const hasTheses = theses.length > 0
  const valuation = view.valuation
  if (!hasTheses && !valuation) return null

  return (
    <Frame>
      {hasTheses ? <ThesesModule theses={theses} /> : null}
      {valuation ? <ValuationModule valuation={valuation} /> : null}
    </Frame>
  )
}
