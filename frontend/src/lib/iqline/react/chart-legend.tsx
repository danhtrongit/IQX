/**
 * Chú giải nổi của biểu đồ (docs/iqline-design.md §7 "Tiếp cận"): DOM thật, đọc được bằng trình đọc màn hình. Nằm NGOÀI khung
 * `role="img"` của canvas (con của `role="img"` bị coi là trang trí). Mỗi ô một khối, đặt đúng chỗ canvas chừa (`legendTop`):
 * ô giá có dòng O H L C và các chỉ báo chồng; ô khối lượng và ô chỉ báo có một dòng cho mỗi chỉ báo, kèm nút ẩn, sửa, xoá.
 *
 * Giá trị theo nến dưới crosshair, hoặc nến cuối khi crosshair rời đi (`chart.values`).
 */
import { Eye, EyeOff, Settings2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { NARROW_WIDTH, LEGEND_ROW } from "../core/layout"
import { formatCompact, formatTimeLabel, formatVi } from "../core/ticks"
import type { MarketTimeScale } from "../core/time-scale"
import type { PaneFrame, PreparedIndicator } from "../scene/model"
import type { IndexValues } from "../scene/values"
import type { IQLineChart } from "./use-iqline-chart"

export type ChartLegendProps = {
  chart: IQLineChart
  /** Mã đang xem, hiện ở đầu dòng O H L C. */
  symbol?: string
  formatPrice?: (price: number) => string
  /** Có nút ẩn, sửa, xoá cạnh mỗi chỉ báo không (các hàm dưới bắt buộc khi bật). */
  editable?: boolean
  onToggleIndicator?: (key: string) => void
  onEditIndicator?: (key: string) => void
  onRemoveIndicator?: (key: string) => void
}

const ROW = "flex h-6 w-fit items-center gap-x-2 rounded-sm bg-background/70 px-1.5"

const priceTone = (change: number | null): string => (change === null || change === 0 ? "text-price-ref" : change > 0 ? "text-price-up" : "text-price-down")

function Item({ label, name, children, tone }: { label: string; name: string; children: string; tone?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap" title={name}>
      <span aria-hidden="true" className="text-muted-foreground">{label}</span>
      <span className="sr-only">{name}</span>
      <span className={cn("font-medium tabular-nums", tone ?? "text-foreground")}>{children}</span>
    </span>
  )
}

function OhlcRows({ values, symbol, format, narrow, interval }: { values: IndexValues; symbol?: string; format: (price: number) => string; narrow: boolean; interval: MarketTimeScale["interval"] | null }) {
  const { bar, change, changePct, time } = values
  const tone = priceTone(change)
  const pct = changePct === null ? null : `${changePct > 0 ? "+" : ""}${formatVi(changePct, 2)}%`
  const delta = change === null ? null : `${change > 0 ? "+" : ""}${format(change)}`
  const when = time !== null && interval ? formatTimeLabel(time, interval) : null
  // Hẹp: bỏ ngày (đã có nhãn ở trục thời gian khi rê chuột) để dòng đầu không chạm cột giá bên phải.
  const first = (
    <>
      {symbol ? <span className="font-semibold text-foreground">{symbol}</span> : null}
      {when && !narrow ? <span className="text-muted-foreground tabular-nums">{when}</span> : null}
      <Item label="O" name="Giá mở cửa" tone={tone}>{format(bar.open)}</Item>
      <Item label="H" name="Giá cao nhất" tone={tone}>{format(bar.high)}</Item>
      {narrow ? <Item label="L" name="Giá thấp nhất" tone={tone}>{format(bar.low)}</Item> : null}
    </>
  )
  const second = (
    <>
      {narrow ? null : <Item label="L" name="Giá thấp nhất" tone={tone}>{format(bar.low)}</Item>}
      <Item label="C" name="Giá đóng cửa" tone={tone}>{format(bar.close)}</Item>
      {delta && pct ? <Item label="" name="Thay đổi so với phiên trước" tone={tone}>{`${delta} (${pct})`}</Item> : null}
    </>
  )
  if (narrow) {
    return (
      <>
        <div className={ROW}>{first}</div>
        <div className={ROW}>{second}</div>
      </>
    )
  }
  return (
    <div className={ROW}>
      {first}
      {second}
    </div>
  )
}

function IndicatorRow({ indicator, values, editable, onToggle, onEdit, onRemove }: { indicator: PreparedIndicator; values: IndexValues | null; editable: boolean; onToggle?: () => void; onEdit?: () => void; onRemove?: () => void }) {
  const series = values?.series.filter((item) => item.indicatorKey === indicator.key) ?? []
  return (
    <div className={cn("group/legend pointer-events-auto flex h-6 w-fit max-w-full items-center gap-x-2 rounded-sm bg-background/70 pl-1.5 pr-1", indicator.hidden && "opacity-60")} data-indicator-key={indicator.key}>
      <span className="whitespace-nowrap font-medium text-foreground">{indicator.name}</span>
      {!indicator.hidden && indicator.plot.kind === "vol" && values ? (
        <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums", priceTone(values.change))}>
          <span className="sr-only">Khối lượng</span>
          {formatCompact(values.bar.volume)}
        </span>
      ) : null}
      {!indicator.hidden &&
        series.map((item) => (
          <span key={item.seriesKey} className="inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums" style={{ color: `var(--${item.token})` }}>
            <span className="sr-only">{item.label}</span>
            {item.value === null ? "-" : Math.abs(item.value) >= 10_000 ? formatCompact(item.value) : formatVi(item.value, 2)}
          </span>
        ))}
      {editable ? (
        <span className="inline-flex items-center opacity-0 transition-opacity group-hover/legend:opacity-100 group-focus-within/legend:opacity-100 [@media(pointer:coarse)]:opacity-100">
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`${indicator.hidden ? "Hiện" : "Ẩn"} ${indicator.name}`} title={indicator.hidden ? "Hiện" : "Ẩn"} aria-pressed={indicator.hidden} onClick={onToggle}>
            {indicator.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Cài đặt ${indicator.name}`} title="Cài đặt" onClick={onEdit}>
            <Settings2 aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Xoá ${indicator.name}`} title="Xoá" onClick={onRemove}>
            <X aria-hidden="true" />
          </Button>
        </span>
      ) : null}
    </div>
  )
}

function PaneLegend({ pane, chart, values, props, narrow, format }: { pane: PaneFrame; chart: IQLineChart; values: IndexValues | null; props: ChartLegendProps; narrow: boolean; format: (price: number) => string }) {
  const { box } = pane
  const interval = chart.data.timeScale.kind === "market" ? chart.data.timeScale.interval : null
  const rows = pane.indicators.map((indicator) => (
    <IndicatorRow
      key={indicator.key}
      indicator={indicator}
      values={values}
      editable={props.editable === true}
      onToggle={() => props.onToggleIndicator?.(indicator.key)}
      onEdit={() => props.onEditIndicator?.(indicator.key)}
      onRemove={() => props.onRemoveIndicator?.(indicator.key)}
    />
  ))
  return (
    <div className="absolute left-2 flex max-w-[calc(100%-4.5rem)] flex-col text-xs" style={{ top: box.legendTop, minHeight: Math.min(box.legendHeight, LEGEND_ROW * 4) }} data-legend-pane={box.key}>
      {box.kind === "price" && values ? <OhlcRows values={values} symbol={props.symbol} format={format} narrow={narrow} interval={interval} /> : null}
      {rows}
    </div>
  )
}

export function ChartLegend(props: ChartLegendProps) {
  const { chart } = props
  const { frame, values, size } = chart
  if (!frame) return null
  const format = props.formatPrice ?? ((price: number) => formatVi(price, 2))
  const narrow = size.width < NARROW_WIDTH
  return (
    <div role="group" aria-label="Chú giải biểu đồ" className="pointer-events-none absolute inset-0 overflow-hidden text-xs leading-none">
      {frame.panes.map((pane) => (
        <PaneLegend key={pane.box.key} pane={pane} chart={chart} values={values} props={props} narrow={narrow} format={format} />
      ))}
    </div>
  )
}
