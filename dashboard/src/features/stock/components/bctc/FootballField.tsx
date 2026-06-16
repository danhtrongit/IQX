import { usePrice } from "@/features/market-data"
import { fmtNumber } from "../../format"
import type { BctcValuation } from "../../types"

interface Method {
  label: string
  sub?: string
  /** All in nghìn đ/cp (thousands). */
  lo: number | null
  hi: number | null
  mid: number | null
  emphasis?: boolean
}

const ROW_H = 34 // px per method row (must match the markup below)

/** Raw VND → nghìn đ/cp (thousands), the football-field axis unit. */
function k(v: number | null | undefined): number | null {
  return v == null ? null : v / 1000
}

/**
 * Valuation football field: horizontal range bars (P/E band, RIM, Book floor,
 * Tổng hợp) on a shared price axis with a red current-price marker. DCF is
 * omitted — IQX serves no WACC/β, so it is not fabricated.
 */
export function FootballField({ valuation, symbol }: { valuation: BctcValuation; symbol: string }) {
  const { data: price } = usePrice(symbol)
  const curK = price && price.closePrice > 0 ? price.closePrice : null

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
    methods.push({ label: "RIM", sub: "residual income", lo: k(valuation.rim), hi: k(valuation.rim), mid: k(valuation.rim) })
  }
  if (valuation.book_floor != null) {
    methods.push({ label: "Book Floor", sub: "sàn sổ sách", lo: k(valuation.book_floor), hi: k(valuation.book_floor), mid: k(valuation.book_floor) })
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

  const allVals = methods.flatMap((m) => [m.lo, m.hi, m.mid]).filter((x): x is number => x != null)
  if (curK != null) allVals.push(curK)
  if (allVals.length === 0) {
    return <div className="text-xs text-[var(--color-text-3)]">Không đủ dữ liệu định giá.</div>
  }

  let min = Math.min(...allVals)
  let max = Math.max(...allVals)
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.12 || 1
  min = Math.max(0, min - pad)
  max = max + pad
  const span = max - min || 1
  const pct = (v: number) => ((v - min) / span) * 100

  const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4)

  return (
    <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4">
      <div className="flex">
        {/* Method labels */}
        <div className="w-24 shrink-0">
          {methods.map((m) => (
            <div key={m.label} className="flex flex-col justify-center" style={{ height: ROW_H }}>
              <span className={`text-xs ${m.emphasis ? "font-bold" : "font-medium"} text-[var(--color-text-1)]`}>
                {m.label}
              </span>
              {m.sub && <span className="text-[9px] text-[var(--color-text-3)]">{m.sub}</span>}
            </div>
          ))}
        </div>

        {/* Track area */}
        <div className="relative flex-1">
          {methods.map((m) => {
            const lo = m.lo
            const hi = m.hi
            const mid = m.mid
            const isPoint = lo != null && hi != null && Math.abs(hi - lo) < span * 0.005
            return (
              <div key={m.label} className="flex items-center" style={{ height: ROW_H }}>
                <div className="relative h-2 w-full rounded-full bg-[var(--color-fill-2)]">
                  {lo != null && hi != null && !isPoint && (
                    <div
                      className={`absolute inset-y-0 rounded-full ${m.emphasis ? "bg-[rgb(var(--primary-6))]" : "bg-[rgb(var(--primary-6))]/45"}`}
                      style={{ left: `${pct(lo)}%`, width: `${Math.max(pct(hi) - pct(lo), 0)}%` }}
                    />
                  )}
                  {isPoint && mid != null && (
                    <div
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--primary-6))]"
                      style={{ left: `${pct(mid)}%` }}
                    />
                  )}
                  {mid != null && !isPoint && (
                    <div
                      className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--color-text-1)]"
                      style={{ left: `${pct(mid)}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}

          {/* Axis ticks */}
          <div className="relative mt-1 h-4">
            {ticks.map((t, i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 text-[9px] tabular-nums text-[var(--color-text-3)]"
                style={{ left: `${pct(t)}%` }}
              >
                {fmtNumber(t, 0)}
              </span>
            ))}
          </div>

          {/* Current-price marker spanning the method rows */}
          {curK != null && (
            <>
              <div
                className="pointer-events-none absolute top-0 w-px bg-down"
                style={{ left: `${pct(curK)}%`, height: methods.length * ROW_H }}
              />
              <div
                className="pointer-events-none absolute -top-3 -translate-x-1/2 rounded bg-down px-1 text-[9px] font-bold tabular-nums text-white"
                style={{ left: `${pct(curK)}%` }}
              >
                {fmtNumber(curK, 0)}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-[10px] text-[var(--color-text-3)]">
        Đơn vị: nghìn đ/cp · vạch đỏ = giá hiện tại · DCF bỏ qua (thiếu WACC/β) · tham chiếu, không
        phải khuyến nghị.
      </p>
    </div>
  )
}
