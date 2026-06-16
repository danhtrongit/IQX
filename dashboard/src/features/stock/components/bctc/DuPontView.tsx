import { Fragment } from "react"
import { fmtMultiple, fmtPercent, fmtSignedNum, fmtSignedPp } from "../../format"
import type { DuPontData } from "../../types"

/** Driver value formatted by its unit: `%` → biên, `x` → hệ số. */
function driverValue(unit: string, v: number | null): string {
  if (v == null) return "—"
  return unit === "%" ? fmtPercent(v, 1) : fmtMultiple(v, 2)
}

/** Driver delta vs prior period, formatted by unit (pp for biên, plain for hệ số). */
function driverDelta(unit: string, d: number | null): string {
  if (d == null) return ""
  return unit === "%" ? fmtSignedPp(d, 1) : fmtSignedNum(d, 2)
}

function toneClass(v: number | null): string {
  if (v == null || v === 0) return "text-[var(--color-text-3)]"
  return v > 0 ? "text-up" : "text-down"
}

/**
 * DuPont 5-step: driver cards (×-separated) over horizontal bars showing each
 * driver's contribution to the ROE change (exact LMDI, so bars sum to ΔROE).
 */
export function DuPontView({ data }: { data: DuPontData }) {
  const { drivers, roe, roe_prev, roe_delta } = data
  const withContrib = drivers.filter((d) => d.contribution != null)
  const maxContrib = Math.max(...withContrib.map((d) => Math.abs(d.contribution as number)), 1e-9)

  return (
    <div>
      {/* Driver cards, multiplied left → right */}
      <div className="flex flex-wrap items-stretch gap-1">
        {drivers.map((d, i) => (
          <Fragment key={d.key}>
            {i > 0 && (
              <div className="flex items-center px-0.5 text-base text-[var(--color-text-3)]">×</div>
            )}
            <div className="flex min-w-[84px] flex-1 flex-col rounded-lg border border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-2 text-center">
              <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--color-text-3)]">
                {d.abbr}
              </span>
              <span className="mt-1 text-lg font-bold tabular-nums">{driverValue(d.unit, d.value)}</span>
              <span className={`text-[10px] tabular-nums ${toneClass(d.delta)}`}>
                {driverDelta(d.unit, d.delta) || "±0"}
              </span>
            </div>
          </Fragment>
        ))}
      </div>

      {/* Contribution-to-ΔROE bars (diverging at 0) */}
      {withContrib.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {withContrib.map((d) => {
            const c = d.contribution as number
            const half = (Math.abs(c) / maxContrib) * 50
            const positive = c >= 0
            return (
              <div key={d.key} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-[var(--color-text-2)]">{d.label}</span>
                <div className="relative h-3 flex-1 rounded bg-[var(--color-fill-2)]">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--color-border-3)]" />
                  <span
                    className={`absolute top-0 h-full rounded ${positive ? "bg-up" : "bg-down"}`}
                    style={{
                      left: positive ? "50%" : `${50 - half}%`,
                      width: `${half}%`,
                    }}
                  />
                </div>
                <span className={`w-14 shrink-0 text-right tabular-nums ${toneClass(c)}`}>
                  {fmtSignedPp(c)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ROE bridge summary */}
      {roe != null && (
        <div className="mt-3 text-xs text-[var(--color-text-3)]">
          ROE {fmtPercent(roe_prev, 1)} →{" "}
          <b className="text-[var(--color-text-1)] tabular-nums">{fmtPercent(roe, 1)}</b>{" "}
          <span className={toneClass(roe_delta)}>({fmtSignedPp(roe_delta)})</span>
        </div>
      )}
    </div>
  )
}
