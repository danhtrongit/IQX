/**
 * Công cụ vẽ của `market` (docs/iqline-design.md §10), tải khi cần (`React.lazy` ở `IQLine`): thanh công cụ dọc với 14 công cụ chia nhóm,
 * hút vào OHLC, danh sách hình, và thanh kiểu của hình đang chọn (màu, nét, tô, khoá, ẩn, nhân bản, xoá, mẫu kiểu).
 * Chỉ là DOM: mọi thay đổi đi qua `chart.controller.dispatch`, nên hoàn tác và phím tắt chạy như nhau cho cả hai.
 */
import { useState } from "react"
import {
  Activity,
  ArrowRightFromLine,
  Copy,
  Eye,
  EyeOff,
  Layers,
  ListTree,
  Lock,
  LockOpen,
  Magnet,
  Minus,
  MoveDiagonal,
  MoveUpRight,
  Rows3,
  Rows4,
  Ruler,
  SeparatorVertical,
  Spline,
  Square,
  StickyNote,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { ALL_TOOLS, TOOL_SPECS, listDrawings, type ToolGroup } from "../drawings"
import type { ColorToken, Drawing, DrawingStyle, DrawingTool } from "../types"
import type { IQLineChart } from "./use-iqline-chart"

const TOOL_ICONS: Readonly<Record<DrawingTool, LucideIcon>> = {
  trend: TrendingUp,
  ray: MoveUpRight,
  extended: MoveDiagonal,
  horizontal: Minus,
  "horizontal-ray": ArrowRightFromLine,
  vertical: SeparatorVertical,
  channel: Rows3,
  "fib-retracement": Rows4,
  "fib-extension": Layers,
  rectangle: Square,
  "elliott-5": Activity,
  "elliott-abc": Spline,
  note: StickyNote,
  measure: Ruler,
}

const GROUPS: readonly { group: ToolGroup; label: string }[] = [
  { group: "line", label: "Đường" },
  { group: "channel", label: "Kênh" },
  { group: "fib", label: "Fibonacci" },
  { group: "shape", label: "Hình" },
  { group: "wave", label: "Sóng Elliott" },
  { group: "annotation", label: "Chú thích" },
]

/** Màu của hình vẽ: bỏ chart-3, chart-4 (màu tăng giảm) và chart-7 (màu của AI) theo DESIGN.md. */
const DRAWING_COLORS: readonly { token: ColorToken; label: string }[] = [
  { token: "chart-1", label: "Xanh dương" },
  { token: "chart-2", label: "Xanh lam" },
  { token: "chart-5", label: "Vàng" },
  { token: "chart-6", label: "Hồng" },
  { token: "chart-8", label: "Tím nhạt" },
  { token: "foreground", label: "Trắng đen" },
]

const WIDTHS: readonly { value: number; label: string }[] = [
  { value: 1, label: "Mảnh" },
  { value: 1.7, label: "Vừa" },
  { value: 3, label: "Dày" },
]

const TEMPLATE_KEY = "iqx.iqline_style_templates_v1"
const MAX_TEMPLATES = 6

function readTemplates(): DrawingStyle[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is DrawingStyle => typeof item === "object" && item !== null && typeof item.color === "string" && typeof item.width === "number")
      .slice(0, MAX_TEMPLATES)
  } catch {
    return []
  }
}

function writeTemplates(templates: readonly DrawingStyle[]): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates))
  } catch {
    // Không lưu được thì mẫu chỉ sống trong phiên này.
  }
}

const colorLabel = (token: ColorToken): string => DRAWING_COLORS.find((item) => item.token === token)?.label ?? token
const templateLabel = (style: DrawingStyle): string => `${colorLabel(style.color)}, ${style.width.toLocaleString("vi-VN")} px, ${style.dash === "dashed" ? "nét đứt" : "nét liền"}${style.fill ? ", tô vùng" : ""}`

type Props = { chart: IQLineChart }

function DrawingList({ chart }: Props) {
  const { drawings } = chart.state
  const entries = listDrawings(drawings)
  const [confirmClear, setConfirmClear] = useState(false)
  const act = (action: Parameters<typeof chart.controller.dispatch>[0] & { type: "drawing" }) => chart.controller.dispatch(action)
  return (
    <div className="flex w-72 max-w-[80vw] flex-col gap-2">
      <p className="text-xs font-medium text-foreground">Danh sách hình vẽ</p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có hình nào. Chọn một công cụ ở thanh bên trái rồi vẽ lên biểu đồ.</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto" aria-label="Hình vẽ trên biểu đồ">
          {entries.map((entry) => {
            const Icon = TOOL_ICONS[entry.tool]
            return (
              <li key={entry.id} className={cn("flex items-center gap-1 rounded-sm px-1", entry.selected && "bg-muted")}>
                <Button type="button" variant="ghost" size="xs" className="min-w-0 flex-1 justify-start" aria-pressed={entry.selected} onClick={() => act({ type: "drawing", action: { type: "select", id: entry.selected ? null : entry.id } })}>
                  <Icon aria-hidden="true" />
                  <span className="truncate">{entry.label}</span>
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`${entry.locked ? "Mở khoá" : "Khoá"} ${entry.label}`} title={entry.locked ? "Mở khoá" : "Khoá"} onClick={() => act({ type: "drawing", action: { type: "lock", id: entry.id } })}>
                  {entry.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`${entry.hidden ? "Hiện" : "Ẩn"} ${entry.label}`} title={entry.hidden ? "Hiện" : "Ẩn"} onClick={() => act({ type: "drawing", action: { type: "hide", id: entry.id } })}>
                  {entry.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`Xoá ${entry.label}`} title={entry.locked ? "Mở khoá để xoá" : "Xoá"} disabled={entry.locked} onClick={() => act({ type: "drawing", action: { type: "remove", id: entry.id } })}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {entries.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
          <Button type="button" variant="outline" size="xs" onClick={() => act({ type: "drawing", action: { type: "set-all-hidden", hidden: !entries.every((entry) => entry.hidden) } })}>
            {entries.every((entry) => entry.hidden) ? "Hiện tất cả" : "Ẩn tất cả"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true)
              setConfirmClear(false)
              act({ type: "drawing", action: { type: "clear" } })
            }}
            onBlur={() => setConfirmClear(false)}
          >
            {confirmClear ? "Bấm lần nữa để xoá" : "Xoá tất cả"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Thanh công cụ dọc bên trái khung biểu đồ. */
export default function DrawingToolbar({ chart, className }: Props & { className?: string }) {
  const { drawings, magnet } = chart.state
  const [lastOfGroup, setLastOfGroup] = useState<Partial<Record<ToolGroup, DrawingTool>>>({})
  const allowed = chart.config.allowedTools.length > 0 ? chart.config.allowedTools : ALL_TOOLS
  const pick = (tool: DrawingTool) => {
    setLastOfGroup((previous) => ({ ...previous, [TOOL_SPECS[tool].group]: tool }))
    chart.controller.dispatch({ type: "tool", tool })
  }
  return (
    <div role="toolbar" aria-label="Công cụ vẽ" aria-orientation="vertical" className={cn("flex w-9 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-card py-1", className)}>
      {GROUPS.map(({ group, label }) => {
        const tools = ALL_TOOLS.filter((tool) => TOOL_SPECS[tool].group === group && allowed.includes(tool))
        if (tools.length === 0) return null
        const active = drawings.tool !== null && tools.includes(drawings.tool)
        const shown = (active ? drawings.tool : lastOfGroup[group]) ?? tools[0]
        const Icon = TOOL_ICONS[shown!]
        return (
          <DropdownMenu key={group}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label={`${label}: ${TOOL_SPECS[shown!].label}`} aria-pressed={active} title={label} data-tool-group={group}>
                <Icon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuLabel>{label}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {tools.map((tool) => {
                const ToolIcon = TOOL_ICONS[tool]
                return (
                  <DropdownMenuItem key={tool} data-tool={tool} onSelect={() => pick(tool)}>
                    <ToolIcon aria-hidden="true" />
                    {TOOL_SPECS[tool].label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}

      <span aria-hidden="true" className="my-0.5 h-px w-5 shrink-0 bg-border" />

      <Button type="button" variant={magnet ? "secondary" : "ghost"} size="icon-sm" aria-label="Hút vào giá OHLC" aria-pressed={magnet} title="Hút vào giá OHLC" onClick={() => chart.controller.dispatch({ type: "magnet", on: !magnet })}>
        <Magnet aria-hidden="true" />
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Danh sách hình vẽ" title="Danh sách hình vẽ">
            <ListTree aria-hidden="true" />
            {drawings.shapes.length > 0 ? <span className="sr-only">{drawings.shapes.length} hình</span> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-auto p-3">
          <DrawingList chart={chart} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Thanh kiểu nổi của hình đang chọn; null khi không chọn hình nào. */
export function DrawingStyleBar({ chart, className }: Props & { className?: string }) {
  const { drawings } = chart.state
  const shape: Drawing | undefined = drawings.selectedId === null ? undefined : drawings.shapes.find((item) => item.id === drawings.selectedId)
  const [templates, setTemplates] = useState<DrawingStyle[]>(readTemplates)
  if (!shape) return null
  const spec = TOOL_SPECS[shape.tool]
  const act = (action: Parameters<typeof chart.controller.dispatch>[0] & { type: "drawing" }) => chart.controller.dispatch(action)
  const setStyle = (style: Partial<DrawingStyle>) => act({ type: "drawing", action: { type: "style", id: shape.id, style } })
  const saveTemplate = () => {
    const next = [shape.style, ...templates.filter((item) => templateLabel(item) !== templateLabel(shape.style))].slice(0, MAX_TEMPLATES)
    setTemplates(next)
    writeTemplates(next)
  }
  const Icon = TOOL_ICONS[shape.tool]
  return (
    <div role="toolbar" aria-label={`Kiểu của ${spec.label}`} className={cn("pointer-events-auto flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", className)}>
      <span className="flex items-center gap-1 px-1 text-xs font-medium"><Icon aria-hidden="true" className="size-3.5" />{spec.label}</span>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Màu: ${colorLabel(shape.style.color)}`} title="Màu">
            <span aria-hidden="true" className="size-4 rounded-full border border-border" style={{ background: `var(--${shape.style.color})` }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-2">
          <div role="radiogroup" aria-label="Màu hình vẽ" className="flex gap-1">
            {DRAWING_COLORS.map((item) => (
              <button
                key={item.token}
                type="button"
                role="radio"
                aria-checked={shape.style.color === item.token}
                aria-label={item.label}
                title={item.label}
                onClick={() => setStyle({ color: item.token })}
                className={cn("size-6 rounded-full border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50", shape.style.color === item.token && "ring-2 ring-primary ring-offset-1 ring-offset-popover")}
                style={{ background: `var(--${item.token})` }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <ToggleGroup type="single" size="sm" spacing={0} value={String(shape.style.width)} onValueChange={(value) => value && setStyle({ width: Number(value) })} aria-label="Độ dày nét" className="h-7">
        {WIDTHS.map((item) => (
          <ToggleGroupItem key={item.value} value={String(item.value)} aria-label={`Nét ${item.label.toLowerCase()}`} title={item.label} className="px-1.5">
            <span aria-hidden="true" className="w-4 rounded-full bg-current" style={{ height: item.value }} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Button type="button" variant={shape.style.dash === "dashed" ? "secondary" : "ghost"} size="icon-sm" aria-label="Nét đứt" aria-pressed={shape.style.dash === "dashed"} title="Nét đứt" onClick={() => setStyle({ dash: shape.style.dash === "dashed" ? "solid" : "dashed" })}>
        <span aria-hidden="true" className="flex w-4 items-center gap-0.5"><i className="h-0.5 flex-1 bg-current" /><i className="h-0.5 flex-1 bg-current" /><i className="h-0.5 flex-1 bg-current" /></span>
      </Button>

      {spec.defaultStyle.fill !== undefined ? (
        <Button type="button" variant={shape.style.fill ? "secondary" : "ghost"} size="icon-sm" aria-label="Tô vùng" aria-pressed={Boolean(shape.style.fill)} title="Tô vùng" onClick={() => setStyle({ fill: !shape.style.fill })}>
          <Square aria-hidden="true" className="fill-current/30" />
        </Button>
      ) : null}

      {shape.tool === "note" ? (
        <Input aria-label="Nội dung ghi chú" value={shape.text ?? ""} maxLength={120} placeholder="Ghi chú" className="h-7 w-32 text-xs" onChange={(event) => act({ type: "drawing", action: { type: "text", id: shape.id, text: event.target.value } })} />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs" title="Mẫu kiểu">Mẫu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem onSelect={saveTemplate}>Lưu kiểu này làm mẫu</DropdownMenuItem>
          {templates.length > 0 ? <DropdownMenuSeparator /> : null}
          {templates.map((item) => (
            <DropdownMenuItem key={templateLabel(item)} onSelect={() => setStyle(item)}>
              <span aria-hidden="true" className="size-3 rounded-full border border-border" style={{ background: `var(--${item.color})` }} />
              {templateLabel(item)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
      <Button type="button" variant="ghost" size="icon-sm" aria-label={shape.locked ? "Mở khoá hình" : "Khoá hình"} aria-pressed={Boolean(shape.locked)} title={shape.locked ? "Mở khoá" : "Khoá"} onClick={() => act({ type: "drawing", action: { type: "lock", id: shape.id } })}>
        {shape.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Ẩn hình" title="Ẩn" onClick={() => act({ type: "drawing", action: { type: "hide", id: shape.id } })}>
        <EyeOff aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Nhân bản hình" title="Nhân bản" onClick={() => act({ type: "drawing", action: { type: "duplicate", id: shape.id } })}>
        <Copy aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Xoá hình" title={shape.locked ? "Mở khoá để xoá" : "Xoá (Delete)"} disabled={shape.locked} onClick={() => act({ type: "drawing", action: { type: "remove", id: shape.id } })}>
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  )
}
