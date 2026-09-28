/**
 * Valuation football field: horizontal range bars (P/E band, RIM, book floor,
 * tổng hợp) on a shared nghìn đ/cp axis with the current-price marker. DCF is
 * deliberately absent — IQX serves no WACC/β, so it is not fabricated.
 */
import { cn } from "@/lib/utils"
import { useQuote } from "@/pages/demo-trading/market/use-quote"

import { fmtNumber } from "../../format"
import type { BctcValuation } from "../../types"

type Method = {
  label: string
  sub?: string
  /** All in nghìn đ/cp (thousands). */
  lo: number | null
  hi: number | null
  mid: number | null
  emphasis?: boolean
}

/** px per method row (must match the markup below) */
const ROW_HEIGHT = 34

/** Raw đồng → nghìn đồng, the axis unit. */
function k(value: number | null | undefined): number | null {
  return value == null ? null : value / 1000
}

export function FootballField({
  valuation,
  symbol,
}: {
  valuation: BctcValuation
  symbol: string
}) {
  const quote = useQuote(symbol)
  // The price board is already in nghìn đồng.
  const current = quote.data?.price ?? null

  const methods: Method[] = []
  if (valuation.pe_band) {
    methods.push({
      label: "P/E Band",
      sub: "lịch sử",
      lo: k(valuation.pe_band.bear),
      hi: k(valuation.pe_band.bull),
      mid: k(valuation.pe_band.base),
    })
  }
  if (valuation.rim != null) {
    methods.push({
      label: "RIM",
      sub: "residual income",
      lo: k(valuation.rim),
      hi: k(valuation.rim),
      mid: k(valuation.rim),
    })
  }
  if (valuation.book_floor != null) {
    methods.push({
      label: "Book Floor",
      sub: "sàn sổ sách",
      lo: k(valuation.book_floor),
      hi: k(valuation.book_floor),
      mid: k(valuation.book_floor),
    })
  }
  if (valuation.summary && (valuation.summary.bear != null || valuation.summary.bull != null)) {
    methods.push({
      label: "Tổng hợp",
      lo: k(valuation.summary.bear),
      hi: k(valuation.summary.bull),
      mid: k(valuation.summary.base),
      emphasis: true,
    })
  }

  const values = methods.flatMap((method) => [method.lo, method.hi, method.mid]).filter(
    (value): value is number => value != null,
  )
  if (current != null) values.push(current)

  if (values.length === 0) {
    return <div className="text-xs text-muted-foreground">Không đủ dữ liệu định giá.</div>
  }

  let min = Math.min(...values)
  let max = Math.max(...values)
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.12 || 1
  min = Math.max(0, min - pad)
  max += pad
  const span = max - min || 1
  const pct = (value: number) => ((value - min) / span) * 100
  const ticks = Array.from({ length: 5 }, (_, index) => min + (span * index) / 4)

  return (
    <div className="rounded-lg bg-card p-4">
      <div className="flex">
        <div className="w-24 shrink-0">
          {methods.map((method) => (
            <div
              key={method.label}
              className="flex flex-col justify-center"
              style={{ height: ROW_HEIGHT }}
            >
              <span className={cn("text-xs", method.emphasis ? "font-bold" : "font-medium")}>
                {method.label}
              </span>
              {method.sub && (
                <span className="text-[10px] text-muted-foreground">{method.sub}</span>
              )}
            </div>
          ))}
        </div>

        <div className="relative flex-1">
          {methods.map((method) => {
            const { lo, hi, mid } = method
            const isPoint = lo != null && hi != null && Math.abs(hi - lo) < span * 0.005
            return (
              <div
                key={method.label}
                className="flex items-center"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="relative h-2 w-full rounded-full bg-muted">
                  {lo != null && hi != null && !isPoint && (
                    <div
                      className={cn(
                        "absolute inset-y-0 rounded-full",
                        method.emphasis ? "bg-primary" : "bg-primary/45",
                      )}
                      style={{ left: `${pct(lo)}%`, width: `${Math.max(pct(hi) - pct(lo), 0)}%` }}
                    />
                  )}
                  {isPoint && mid != null && (
                    <div
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                      style={{ left: `${pct(mid)}%` }}
                    />
                  )}
                  {mid != null && !isPoint && (
                    <div
                      className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground"
                      style={{ left: `${pct(mid)}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}

          <div className="relative mt-1 h-4">
            {ticks.map((tick, index) => (
              <span
                key={index}
                className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ left: `${pct(tick)}%` }}
              >
                {fmtNumber(tick, 0)}
              </span>
            ))}
          </div>

          {current != null && (
            <>
              <div
                className="pointer-events-none absolute top-0 w-px bg-price-down"
                style={{ left: `${pct(current)}%`, height: methods.length * ROW_HEIGHT }}
              />
              <div
                className="pointer-events-none absolute -top-3 -translate-x-1/2 rounded-sm bg-price-down px-1 text-[10px] font-bold tabular-nums text-white"
                style={{ left: `${pct(current)}%` }}
              >
                {fmtNumber(current, 0)}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
        Đơn vị: nghìn đ/cp · vạch đỏ = giá hiện tại · DCF bỏ qua (thiếu WACC/β) · tham chiếu, không
        phải khuyến nghị.
      </p>
    </div>
  )
}
