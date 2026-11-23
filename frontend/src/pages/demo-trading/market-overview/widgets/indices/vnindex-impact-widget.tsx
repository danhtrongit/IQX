import { useMemo } from "react"
import {
  MISSING_VALUE,
  formatPct,
  formatSessionLabel,
  formatSigned,
  formatStockPrice,
  signedTone,
} from "../../format"
import {
  MoEmptyData,
  MoTickerLink,
  toneToMoClass,
  type WidgetBodyProps,
} from "../shared"

const MAX_ROWS_PER_SIDE = 8

export function VnIndexImpactWidget({
  data,
  meta,
}: WidgetBodyProps<"vnindex_impact">) {
  const { rows, maxAbs } = useMemo(() => {
    if (!data) {
      return { rows: [], maxAbs: 1 }
    }

    const gainers = [...data.gainers]
      .filter((item) => Number.isFinite(item.impact))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, MAX_ROWS_PER_SIDE)

    // Pick top 8 largest negative impacts, then order least-negative -> most-negative
    // so `getRowPruneOrder('vnindex_impact')` prunes smallest impacts symmetrically near center.
    const decliners = [...data.decliners]
      .filter((item) => Number.isFinite(item.impact))
      .sort((a, b) => a.impact - b.impact)
      .slice(0, MAX_ROWS_PER_SIDE)
      .sort((a, b) => b.impact - a.impact)

    const merged = [...gainers, ...decliners]
    const peak = merged.reduce((acc, item) => Math.max(acc, Math.abs(item.impact)), 0)

    return {
      rows: merged,
      maxAbs: Math.max(0.01, peak),
    }
  }, [data])

  if (!data) {
    return <MoEmptyData />
  }

  const sumUp = Math.abs(data.totalPositiveImpact)
  const sumDn = -Math.abs(data.totalNegativeImpact)
  const showOffHours = meta !== undefined && !meta.isMarketOpen
  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")

  return (
    <div className="mo-pad">
      <div className="mo-ihd items-center">
        <span>
          Kéo tăng{" "}
          <b className="mo-up">{formatSigned(sumUp, 2)}</b>
        </span>
        <span>
          Kéo giảm{" "}
          <b className="mo-dn">{formatSigned(sumDn, 2)}</b>
        </span>
        {showOffHours && sessionLabel !== MISSING_VALUE && (
          <span className="mo-note ml-auto">{sessionLabel}</span>
        )}
      </div>

      {rows.length === 0 ? (
        <MoEmptyData />
      ) : (
        rows.map((row) => {
          const isPositive = row.impact >= 0
          const widthPct = Math.min(50, (Math.abs(row.impact) / maxAbs) * 50)
          const tone = signedTone(row.impact)
          const toneClass = toneToMoClass(tone)

          return (
            <MoTickerLink
              key={row.symbol}
              symbol={row.symbol}
              data-fit="true"
              data-sym={row.symbol}
              className="mo-dv rounded hover:bg-[var(--mo-row-hover)] hover:no-underline"
              style={{ gridTemplateColumns: "54px 1fr 56px" }}
              title={`${row.symbol}${row.companyName ? ` · ${row.companyName}` : ""} · Giá ${formatStockPrice(row.price)} (${formatPct(row.changePct)}) · Tác động ${formatSigned(row.impact, 2)} điểm`}
            >
              <span className={`n mo-b ${toneClass}`}>{row.symbol}</span>
              <span className="tr" aria-hidden="true">
                <i
                  style={{
                    left: isPositive ? "50%" : undefined,
                    right: isPositive ? undefined : "50%",
                    width: `${widthPct.toFixed(2)}%`,
                    backgroundColor: isPositive ? "var(--mo-up)" : "var(--mo-dn)",
                  }}
                />
              </span>
              <span className={`v ${toneClass}`}>{formatSigned(row.impact, 2)}</span>
            </MoTickerLink>
          )
        })
      )}
    </div>
  )
}
