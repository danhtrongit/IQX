/**
 * Thanh công cụ phía trên biểu đồ `market` (docs/iqline-design.md §2): kiểu hiển thị, thang giá, chỉ báo, hoàn tác và làm lại,
 * về khung mặc định, chụp ảnh, toàn màn hình. Chỉ là DOM (shadcn và Lucide), không biết gì về canvas; trạng thái và hành động
 * do `IQLine` truyền vào. Khung thời gian nằm ở trang (URL), không ở đây.
 */
import {
  ChartArea,
  ChartBarBig,
  ChartCandlestick,
  ChartLine,
  Camera,
  ChevronDown,
  Ellipsis,
  Maximize2,
  Minimize2,
  Redo2,
  ScanLine,
  SlidersHorizontal,
  Undo2,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import type { ChartType, Interval, PriceScaleMode } from "../types"

type TypeOption = { value: ChartType; label: string; icon: LucideIcon }

const CHART_TYPE_OPTIONS: readonly TypeOption[] = [
  { value: "candles", label: "Nến", icon: ChartCandlestick },
  { value: "hollow", label: "Nến rỗng", icon: ChartCandlestick },
  { value: "ohlc", label: "Thanh OHLC", icon: ChartBarBig },
  { value: "line", label: "Đường", icon: ChartLine },
  { value: "area", label: "Vùng", icon: ChartArea },
  { value: "heikin-ashi", label: "Heikin Ashi", icon: ChartCandlestick },
]

const SCALE_OPTIONS: readonly { value: PriceScaleMode; label: string; title: string }[] = [
  { value: "linear", label: "Tuyến tính", title: "Thang giá tuyến tính" },
  { value: "log", label: "Log", title: "Thang giá logarit" },
  { value: "percent", label: "%", title: "Thang giá phần trăm" },
]

const INTERVAL_OPTIONS: readonly { value: Interval; label: string }[] = [
  { value: "1", label: "1 phút" },
  { value: "5", label: "5 phút" },
  { value: "15", label: "15 phút" },
  { value: "30", label: "30 phút" },
  { value: "60", label: "1 giờ" },
  { value: "D", label: "1 ngày" },
  { value: "W", label: "1 tuần" },
  { value: "M", label: "1 tháng" },
]

export type ChartToolbarProps = {
  interval?: Interval
  /** Bỏ trống thì ẩn ô khung thời gian (trang tự có ô chọn riêng). */
  onIntervalChange?: (next: Interval) => void
  chartType: ChartType
  onChartTypeChange: (next: ChartType) => void
  priceScale: PriceScaleMode
  onPriceScaleChange: (next: PriceScaleMode) => void
  indicatorCount: number
  /** Bỏ trống thì ẩn nút chỉ báo (trang không cho sửa chỉ báo). */
  onOpenIndicators?: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onFit: () => void
  onScreenshot: () => void
  onToggleFullscreen: () => void
  fullscreen: boolean
  className?: string
}

export function ChartToolbar(props: ChartToolbarProps) {
  const current = CHART_TYPE_OPTIONS.find((option) => option.value === props.chartType) ?? CHART_TYPE_OPTIONS[0]
  const CurrentIcon = current.icon
  const fullscreenLabel = props.fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"
  // Bố cục theo bề rộng của chính thanh công cụ (container query), không theo cửa sổ: biểu đồ thường nằm cạnh các bảng khác.
  return (
    <div className="@container shrink-0">
      <div role="toolbar" aria-label="Công cụ biểu đồ" className={cn("flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1", props.className)}>
        {props.onIntervalChange && props.interval ? (
          <Select value={props.interval} onValueChange={(value) => props.onIntervalChange?.(value as Interval)}>
            <SelectTrigger size="sm" className="h-7 w-[5.5rem] shrink-0 gap-1 border-transparent bg-transparent px-2 text-xs shadow-none" aria-label="Khung thời gian"><SelectValue /></SelectTrigger>
            <SelectContent>{INTERVAL_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={`Kiểu hiển thị: ${current.label}`} title="Kiểu hiển thị">
              <CurrentIcon aria-hidden="true" />
              <span className="hidden @md:inline">{current.label}</span>
              <ChevronDown aria-hidden="true" className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={props.chartType} onValueChange={(value) => props.onChartTypeChange(value as ChartType)}>
              {CHART_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon aria-hidden="true" />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToggleGroup type="single" size="sm" spacing={0} value={props.priceScale} onValueChange={(value) => value && props.onPriceScaleChange(value as PriceScaleMode)} aria-label="Thang giá" className="hidden h-7 shrink-0 @lg:flex">
          {SCALE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} aria-label={option.title} title={option.title} className="px-2 text-xs">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {props.onOpenIndicators ? (
          <Button type="button" variant="ghost" size="sm" onClick={props.onOpenIndicators} aria-label="Chỉ báo" title="Thêm hoặc sửa chỉ báo">
            <SlidersHorizontal aria-hidden="true" />
            <span className="hidden @md:inline">Chỉ báo</span>
            {props.indicatorCount > 0 ? <span className="rounded-sm bg-muted px-1 text-[0.7rem] tabular-nums text-muted-foreground">{props.indicatorCount}</span> : null}
          </Button>
        ) : null}

        <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />

        <Button type="button" variant="ghost" size="icon-sm" onClick={props.onUndo} disabled={!props.canUndo} aria-label="Hoàn tác" title="Hoàn tác (Ctrl+Z)">
          <Undo2 aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={props.onRedo} disabled={!props.canRedo} aria-label="Làm lại" title="Làm lại (Ctrl+Shift+Z)">
          <Redo2 aria-hidden="true" />
        </Button>

        <span className="ml-auto hidden shrink-0 items-center gap-1 @lg:flex">
          <Button type="button" variant="ghost" size="icon-sm" onClick={props.onFit} aria-label="Về khung mặc định" title="Về khung mặc định">
            <ScanLine aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={props.onScreenshot} aria-label="Chụp ảnh biểu đồ" title="Chụp ảnh biểu đồ">
            <Camera aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={props.onToggleFullscreen} aria-label={fullscreenLabel} aria-pressed={props.fullscreen} title={fullscreenLabel}>
            {props.fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </Button>
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="ml-auto @lg:hidden" aria-label="Thêm tuỳ chọn" title="Thêm tuỳ chọn">
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Thang giá</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={props.priceScale} onValueChange={(value) => props.onPriceScaleChange(value as PriceScaleMode)}>
              {SCALE_OPTIONS.map((option) => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.title}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onFit}><ScanLine aria-hidden="true" />Về khung mặc định</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onScreenshot}><Camera aria-hidden="true" />Chụp ảnh biểu đồ</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onToggleFullscreen}>{props.fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{fullscreenLabel}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
