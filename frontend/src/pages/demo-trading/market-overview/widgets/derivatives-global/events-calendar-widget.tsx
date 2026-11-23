import { useMemo } from "react"
import {
  MISSING_VALUE,
  formatDayMonth,
  formatInt,
  formatNum,
  priceTone,
} from "../../format"
import type { CorporateEventItem, EventsFilter } from "../../types"
import {
  MoEmptyData,
  MoSegmentedControl,
  MoTickerLink,
  type MoSegmentOption,
  type WidgetBodyProps,
  type WidgetControlsProps,
} from "../shared"

export type EventsCalendarHeaderControlsProps = WidgetControlsProps<"events_calendar">
export type EventsCalendarWidgetProps = WidgetBodyProps<"events_calendar">

const FILTER_OPTIONS: readonly MoSegmentOption<EventsFilter>[] = [
  { value: "all", label: "Tất cả" },
  { value: "cash_dividend", label: "Cổ tức tiền" },
  { value: "other", label: "Khác" },
]

function formatEventLabel(item: CorporateEventItem): string {
  if (item.type === "cash_dividend" && item.cashPerShareVnd != null && item.cashPerShareVnd > 0) {
    return `Tiền ${formatInt(item.cashPerShareVnd)} đ/cp`
  }
  return item.title
}

function formatDividendYield(item: CorporateEventItem): string {
  if (item.type !== "cash_dividend") return MISSING_VALUE
  if (item.dividendYieldPct != null && Number.isFinite(item.dividendYieldPct)) {
    return `${formatNum(item.dividendYieldPct, 1)}%`
  }
  if (
    item.cashPerShareVnd != null &&
    item.cashPerShareVnd > 0 &&
    item.price != null &&
    item.price > 0
  ) {
    const priceVnd = item.price >= 1000 ? item.price : item.price * 1000
    const yieldPct = (item.cashPerShareVnd / priceVnd) * 100
    if (Number.isFinite(yieldPct)) {
      return `${formatNum(yieldPct, 1)}%`
    }
  }
  return MISSING_VALUE
}

export function EventsCalendarHeaderControls({
  state,
  onStateChange,
}: EventsCalendarHeaderControlsProps) {
  const activeFilter: EventsFilter = state.filter ?? "all"

  return (
    <MoSegmentedControl
      options={FILTER_OPTIONS}
      value={activeFilter}
      onChange={(filter) => onStateChange({ filter })}
      ariaLabel="Bộ lọc sự kiện"
    />
  )
}

export function EventsCalendarWidget({ state, data }: EventsCalendarWidgetProps) {
  const activeFilter: EventsFilter = state.filter ?? data?.filter ?? "all"

  const visibleItems = useMemo<CorporateEventItem[]>(() => {
    const raw = data?.items ?? []
    if (activeFilter === "all") return raw
    if (activeFilter === "cash_dividend") {
      return raw.filter((item) => item.type === "cash_dividend")
    }
    return raw.filter((item) => item.type !== "cash_dividend")
  }, [data, activeFilter])

  if (!data || visibleItems.length === 0) {
    return <MoEmptyData />
  }

  return (
    <div className="w-full">
      <table className="mo-t">
        <thead>
          <tr>
            <th className="l">GDKHQ</th>
            <th className="l">Mã</th>
            <th className="l">Sự kiện</th>
            <th className="o3">Tỷ suất</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item) => {
            const eventText = formatEventLabel(item)
            const yieldText = formatDividendYield(item)
            const hasPriceTone = item.price !== null && item.refPrice !== null
            const tone = hasPriceTone
              ? priceTone(
                  item.price as number,
                  item.refPrice as number,
                  item.ceilingPrice,
                  item.floorPrice,
                )
              : undefined

            return (
              <tr key={item.id} data-fit="">
                <td className="l">{formatDayMonth(item.exDate)}</td>
                <td className="l">
                  <MoTickerLink
                    symbol={item.symbol}
                    tone={tone}
                    data-sym={item.symbol}
                    className="mo-chipm hover:no-underline"
                  />
                </td>
                <td className="l ev" title={eventText}>
                  {eventText}
                </td>
                <td className="o3">{yieldText}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
