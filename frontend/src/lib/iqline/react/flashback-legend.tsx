/**
 * Chú giải nổi của chế độ `flashback` (docs/iqline-design.md §7, §12; Flashback v2.3 §1): DOM thật, nằm NGOÀI khung `role="img"` của canvas.
 *
 * Giữ đúng luật v2.3 và giao diện hiện tại của Flashback:
 * - Mỗi ô có một khối chú giải ở góc trên bên trái, đè lên phần vẽ và KHÔNG chiếm chiều cao ô (`data-legend-height` chỉ để kiểm tra).
 * - Ô giá: dòng "phiên, O H L C, % đổi" (điện thoại hẹp tách thành hai dòng) rồi mỗi chỉ báo trên ô giá một dòng. Ô khối lượng: dòng
 *   "Khối lượng" rồi các chỉ báo Khối lượng. Ô chỉ báo riêng: một dòng.
 * - Mỗi dòng chỉ báo có ba nút Ẩn, Cài đặt, Xóa. Máy tính hiện nút khi rê chuột hoặc focus; điện thoại chạm dòng nào thì hiện nút
 *   của dòng đó, chạm ra ngoài thì ẩn.
 * - Chữ có viền cùng màu nền khung (`.fb-legend`), không có ô nền.
 *
 * Luật công bằng (§12): giá trị đọc từ `chart.values`, vốn là null ở ô tương lai và không có nến warmup, nên chú giải không bao giờ
 * hiện giá trị của phần chưa mở. Nhãn phiên do `formatX` của trang quyết định, không có ngày thật hay tên mã.
 */
import { useEffect, useState } from "react"
import { Eye, EyeOff, Settings2, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

import { LEGEND_ROW } from "../core/layout"
import { formatVi } from "../core/ticks"
import type { PaneFrame, PreparedIndicator } from "../scene/model"
import type { IndexValues, SeriesValue } from "../scene/values"
import type { IQLineChart } from "./use-iqline-chart"

export type FlashbackLegendProps = {
  chart: IQLineChart
  /** Điện thoại (máy hẹp hoặc cửa sổ hẹp): nút của một dòng chỉ hiện khi dòng đó được chạm (v2.3 §1.3). */
  touch: boolean
  /** Nhãn phiên của nến dưới crosshair hoặc nến cuối; cùng hàm với nhãn trục ngang. */
  formatX: (session: number) => string
  /** Định dạng giá O H L C. */
  formatPrice: (price: number) => string
  onToggleIndicator?: (key: string) => void
  onEditIndicator?: (key: string) => void
  onRemoveIndicator?: (key: string) => void
}

const BUTTON =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
/** Điện thoại: nút to hơn cho ngón tay, có nền để đọc được khi nằm trên nến. */
const TOUCH_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-background/90 text-foreground active:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"

/** Số của một giá trị chỉ báo: lớn thì làm tròn, nhỏ thì hai chữ số thập phân (như bản SVG cũ). */
function flashbackIndicatorValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return Math.abs(value) >= 1000 ? formatVi(value, 0) : `${value.toFixed(2).replace(".", ",")}%`
}

function signedPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${Math.abs(value).toFixed(2).replace(".", ",")}%`
}

/** Khối chú giải của một ô: nổi ở góc trên bên trái, đè lên phần vẽ, không chiếm chiều cao ô. */
function Block({ pane, name, children }: { pane: PaneFrame["box"]; name: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute right-16 left-2 flex flex-col items-start gap-px"
      style={{ top: pane.legendTop + 2, maxHeight: pane.height }}
      data-pane={name}
      data-legend-height={pane.legendHeight}
      data-plot-height={pane.height}
    >
      {children}
    </div>
  )
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fb-legend pointer-events-auto flex max-w-full items-center gap-x-2 overflow-hidden text-[12.5px] leading-6 font-bold whitespace-nowrap tabular-nums"
      style={{ height: LEGEND_ROW }}
    >
      {children}
    </div>
  )
}

function IndicatorRow({
  indicator,
  series,
  touch,
  active,
  onActivate,
  onToggle,
  onEdit,
  onRemove,
}: {
  indicator: PreparedIndicator
  series: readonly SeriesValue[]
  touch: boolean
  active: boolean
  onActivate: (key: string) => void
  onToggle?: (key: string) => void
  onEdit?: (key: string) => void
  onRemove?: (key: string) => void
}) {
  const { key, name, hidden } = indicator
  const button = touch ? TOUCH_BUTTON : BUTTON
  const buttons = (
    <span className={cn("shrink-0 items-center", touch ? (active ? "flex" : "hidden") : "hidden group-focus-within:flex group-hover:flex")} data-legend-buttons>
      <button type="button" className={button} aria-label={hidden ? `Hiện ${name}` : `Ẩn ${name}`} title={hidden ? "Hiện" : "Ẩn"} onClick={() => onToggle?.(key)}>
        {hidden ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
      </button>
      <button type="button" className={button} aria-label={`Cài đặt ${name}`} title="Cài đặt" onClick={() => onEdit?.(key)}>
        <Settings2 className="size-3.5" aria-hidden="true" />
      </button>
      <button type="button" className={button} aria-label={`Xóa ${name}`} title="Xóa" onClick={() => onRemove?.(key)}>
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  )
  return (
    <div
      className={cn("fb-legend group pointer-events-auto flex max-w-full flex-col items-start text-[12.5px] font-bold whitespace-nowrap tabular-nums", hidden && "opacity-45")}
      data-legend-row={key}
      data-active={active || undefined}
      data-touch={touch || undefined}
      onClick={touch ? () => onActivate(key) : undefined}
    >
      <div className="flex max-w-full items-center gap-x-2 overflow-hidden" style={{ height: LEGEND_ROW }}>
        {/* Hẹp chỗ thì các giá trị co lại (có dấu ba chấm) trước tên chỉ báo. */}
        <span className="min-w-0 truncate font-bold text-foreground">{name}</span>
        <span className="min-w-0 shrink-[1000] truncate">
          {series.map((item, index) => {
            const tone = item.seriesKey === "histogram" ? (item.token === "price-down" ? "text-price-down" : "text-price-up") : null
            return (
              <span key={item.seriesKey} style={tone ? undefined : { color: `var(--${item.token})` }} className={cn(index > 0 && "ml-2", tone ?? "text-foreground")}>
                {flashbackIndicatorValue(item.value)}
              </span>
            )
          })}
        </span>
        {/* Máy tính: ba nút cùng dòng, hiện khi rê chuột hoặc focus. */}
        {touch ? null : buttons}
      </div>
      {/* Điện thoại: ba nút nằm ở dòng riêng bên trái, dưới tên chỉ báo, nên không bao giờ đè lên dấu mua bán ở phần chơi (bên phải). */}
      {touch ? buttons : null}
    </div>
  )
}

function OhlcLine({ values, format }: { values: IndexValues; format: (price: number) => string }) {
  const { bar } = values
  const tone = bar.close >= bar.open ? "text-price-up" : "text-price-down"
  return (
    <span className="text-foreground">
      O<b className={tone}>{format(bar.open)}</b> H<b className={tone}>{format(bar.high)}</b> L<b className={tone}>{format(bar.low)}</b> C<b className={tone}>{format(bar.close)}</b>
    </span>
  )
}

export function FlashbackLegend({ chart, touch, formatX, formatPrice, onToggleIndicator, onEditIndicator, onRemoveIndicator }: FlashbackLegendProps) {
  const { frame, values, size } = chart
  // Điện thoại: chạm một dòng chú giải thì hiện 3 nút của dòng đó (v2.3 §1.3); chạm ra ngoài thì ẩn.
  const [activeRow, setActiveRow] = useState<string | null>(null)
  useEffect(() => {
    if (activeRow === null) return undefined
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest?.("[data-legend-row]")) setActiveRow(null)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [activeRow])

  if (!frame) return null
  const narrow = size.width < 600
  const row = (indicator: PreparedIndicator) => (
    <IndicatorRow
      key={indicator.key}
      indicator={indicator}
      series={values?.series.filter((item) => item.indicatorKey === indicator.key) ?? []}
      touch={touch}
      active={activeRow === indicator.key}
      onActivate={setActiveRow}
      onToggle={onToggleIndicator}
      onEdit={onEditIndicator}
      onRemove={onRemoveIndicator}
    />
  )

  const changePct = values?.changePct ?? 0
  const changeClass = changePct > 0 ? "text-price-up" : changePct < 0 ? "text-price-down" : "text-foreground"
  const volumeTone = values && values.bar.close >= values.bar.open ? "text-price-up" : "text-price-down"
  const session = values ? (
    <span className="font-bold text-foreground" data-testid="flashback-session">
      {formatX(values.index)}
    </span>
  ) : null

  return (
    <div className="pointer-events-none absolute inset-0" role="group" aria-label="Chú giải biểu đồ">
      {frame.panes.map((pane) => {
        const { box } = pane
        if (box.kind === "price") {
          return (
            <Block key={box.key} pane={box} name="price">
              {values ? (
                narrow ? (
                  <>
                    <Line>
                      {session}
                      <b className={changeClass}>{signedPercent(changePct)}</b>
                    </Line>
                    <Line>
                      <OhlcLine values={values} format={formatPrice} />
                    </Line>
                  </>
                ) : (
                  <Line>
                    {session}
                    <OhlcLine values={values} format={formatPrice} />
                    <b className={changeClass}>{signedPercent(changePct)}</b>
                  </Line>
                )
              ) : null}
              {pane.indicators.map(row)}
            </Block>
          )
        }
        if (box.kind === "volume") {
          return (
            <Block key={box.key} pane={box} name="volume">
              <Line>
                <span className="font-bold text-foreground">Khối lượng</span>
                {values ? <span className={volumeTone}>{formatVi(values.bar.volume, 0)}</span> : null}
              </Line>
              {pane.indicators.map(row)}
            </Block>
          )
        }
        return (
          <Block key={box.key} pane={box} name="indicator">
            {pane.indicators.map(row)}
          </Block>
        )
      })}
    </div>
  )
}
