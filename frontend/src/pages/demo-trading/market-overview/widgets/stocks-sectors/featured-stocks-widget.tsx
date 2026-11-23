import { useMemo } from "react"
import {
  MISSING_VALUE,
  formatBillion,
  formatNum,
  formatPct,
  formatSessionLabel,
  formatStockPrice,
  priceTone,
  signedTone,
} from "../../format"
import type { FeaturedStockItem, FeaturedStocksTab, PriceTone } from "../../types"
import {
  MoEmptyData,
  MoSubTabs,
  MoTickerLink,
  flashClass,
  toneToMoClass,
  useValueFlash,
  type MoSubTabOption,
  type WidgetBodyProps,
} from "../shared"

const FEATURED_TABS: readonly MoSubTabOption<FeaturedStocksTab>[] = [
  { value: "gainers", label: "Tăng" },
  { value: "losers", label: "Giảm" },
  { value: "liquidity", label: "Thanh khoản" },
  { value: "foreign", label: "Khối ngoại" },
  { value: "volume_spike", label: "Đột biến KL" },
]

function getFifthColumnHeader(tab: FeaturedStocksTab): string {
  if (tab === "foreign") return "NN ròng (tỷ)"
  if (tab === "volume_spike") return "KL/TB20"
  return "GT (tỷ)"
}

function resolveStockTone(row: FeaturedStockItem): PriceTone {
  if (row.isCeiling) return "ce"
  if (row.isFloor) return "fl"
  return priceTone(row.price, row.refPrice, row.ceilingPrice, row.floorPrice)
}

interface FeaturedStockRowProps {
  row: FeaturedStockItem
  tab: FeaturedStocksTab
}

function FeaturedStockRow({ row, tab }: FeaturedStockRowProps) {
  const tone = resolveStockTone(row)
  const toneClass = toneToMoClass(tone)
  const priceFlash = useValueFlash(row.price, row.symbol)

  const bandSpan = row.ceilingPrice - row.floorPrice
  const rangePct =
    bandSpan > 1e-6
      ? Math.max(0, Math.min(100, ((row.price - row.floorPrice) / bandSpan) * 100))
      : 50

  let fifthCell: string
  let fifthToneClass = ""

  if (tab === "foreign") {
    fifthCell = formatBillion(row.foreignNetBillion, 1, {
      signed: true,
      includeUnit: false,
    })
    if (row.foreignNetBillion != null && Number.isFinite(row.foreignNetBillion)) {
      fifthToneClass = toneToMoClass(signedTone(row.foreignNetBillion))
    }
  } else if (tab === "volume_spike") {
    fifthCell =
      row.volumeRatio20d != null && Number.isFinite(row.volumeRatio20d)
        ? `×${formatNum(row.volumeRatio20d, 1)}`
        : MISSING_VALUE
  } else {
    fifthCell = formatBillion(row.valueBillion, 1, { includeUnit: false })
  }

  return (
    <tr data-fit="true" data-sym={row.symbol}>
      <td className="l">
        <MoTickerLink symbol={row.symbol} tone={tone} className="mo-code" />
      </td>
      <td className={`${toneClass} ${flashClass(priceFlash)}`}>
        {formatStockPrice(row.price)}
      </td>
      <td className={toneClass}>{formatPct(row.changePct)}</td>
      <td className="o3">
        <span
          className={`mo-rgb ${toneClass}`}
          title={`Sàn ${formatStockPrice(row.floorPrice)} · TC ${formatStockPrice(row.refPrice)} · Trần ${formatStockPrice(row.ceilingPrice)}`}
        >
          <span className="mo-dot" style={{ left: `${rangePct.toFixed(1)}%` }} />
        </span>
      </td>
      <td className={fifthToneClass || undefined}>{fifthCell}</td>
    </tr>
  )
}

export function FeaturedStocksWidget({
  state,
  data,
  meta,
  onStateChange,
}: WidgetBodyProps<"featured_stocks">) {
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const showOffHours = meta !== undefined && !meta.isMarketOpen
  const sessionLabel = formatSessionLabel(data?.sessionDate || meta?.sessionDate || "")

  return (
    <div>
      <MoSubTabs
        options={FEATURED_TABS}
        value={state.tab}
        onChange={(tab) => onStateChange({ tab })}
        ariaLabel="Nhóm cổ phiếu nổi bật"
      />

      {showOffHours && sessionLabel !== MISSING_VALUE && (
        <div className="flex items-center justify-end border-b border-[var(--mo-line)] px-3 py-0.5">
          <span className="mo-note">{sessionLabel}</span>
        </div>
      )}

      {items.length === 0 ? (
        <MoEmptyData className="py-8" />
      ) : (
        <table className="mo-t">
          <thead>
            <tr>
              <th className="l">Mã</th>
              <th>Giá</th>
              <th>%</th>
              <th className="o3">Sàn – Trần</th>
              <th>{getFifthColumnHeader(state.tab)}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <FeaturedStockRow
                key={`${state.tab}-${row.symbol}`}
                row={row}
                tab={state.tab}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
