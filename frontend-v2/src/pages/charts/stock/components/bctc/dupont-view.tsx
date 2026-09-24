import { Fragment } from "react"

import { cn } from "@/lib/utils"

import { fmtMultiple, fmtPercent, fmtSignedNum, fmtSignedPp } from "../../format"
import type { DuPontData } from "../../types"

/** Driver value formatted by its unit: `%` → biên, `x` → hệ số. */
function driverValue(unit: string, value: number | null): string {
  if (value == null) return "—"
  return unit === "%" ? fmtPercent(value, 1) : fmtMultiple(value, 2)
}

/** Driver delta vs prior period, formatted by unit (pp for biên, plain for hệ số). */
function driverDelta(unit: string, delta: number | null): string {
  if (delta == null) return ""
  return unit === "%" ? fmtSignedPp(delta, 1) : fmtSignedNum(delta, 2)
}

function toneClass(value: number | null): string {
  if (value == null || value === 0) return "text-muted-foreground"
  return value > 0 ? "text-price-up" : "text-price-down"
}

/**
 * DuPont 5-step: driver cards (×-separated) over horizontal bars showing each
 * driver's contribution to the ROE change (exact LMDI, so bars sum to ΔROE).
 */
export function DuPontView({ data }: { data: DuPontData }) {
  const { drivers, roe, roe_prev, roe_delta } = data
  const withContribution = drivers.filter((driver) => driver.contribution != null)
  const maxContribution = Math.max(
    ...withContribution.map((driver) => Math.abs(driver.contribution as number)),
    1e-9,
  )

  return (
    <div>
      <div className="flex flex-wrap items-stretch gap-1">
        {drivers.map((driver, index) => (
          <Fragment key={driver.key}>
            {index > 0 && (
              <div className="flex items-center px-0.5 text-base text-muted-foreground">×</div>
            )}
            <div className="flex min-w-21 flex-1 flex-col rounded-lg bg-secondary p-2 text-center">
              <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                {driver.abbr}
              </span>
              <span className="mt-1 text-lg font-bold tabular-nums">
                {driverValue(driver.unit, driver.value)}
              </span>
              <span className={cn("text-[10px] tabular-nums", toneClass(driver.delta))}>
                {driverDelta(driver.unit, driver.delta) || "±0"}
              </span>
            </div>
          </Fragment>
        ))}
      </div>

      {withContribution.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {withContribution.map((driver) => {
            const contribution = driver.contribution as number
            const half = (Math.abs(contribution) / maxContribution) * 50
            const positive = contribution >= 0
            return (
              <div key={driver.key} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-muted-foreground">
                  {driver.label}
                </span>
                <div className="relative h-3 flex-1 rounded-sm bg-muted">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <span
                    className={cn(
                      "absolute top-0 h-full rounded-sm",
                      positive ? "bg-price-up" : "bg-price-down",
                    )}
                    style={{ left: positive ? "50%" : `${50 - half}%`, width: `${half}%` }}
                  />
                </div>
                <span className={cn("w-14 shrink-0 text-right tabular-nums", toneClass(contribution))}>
                  {fmtSignedPp(contribution)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {roe != null && (
        <div className="mt-3 text-xs text-muted-foreground">
          ROE {fmtPercent(roe_prev, 1)} →{" "}
          <b className="tabular-nums text-foreground">{fmtPercent(roe, 1)}</b>{" "}
          <span className={toneClass(roe_delta)}>({fmtSignedPp(roe_delta)})</span>
        </div>
      )}
    </div>
  )
}
