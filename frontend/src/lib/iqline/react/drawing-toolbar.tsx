/**
 * Công cụ vẽ của `market` (docs/iqline-design.md §10), tải khi cần (`React.lazy` ở `IQLine`): thanh công cụ dọc với hơn 30 công cụ chia bảy nhóm
 * (mỗi nhóm một nút nhớ công cụ dùng gần nhất, mở menu có tiêu đề từng loại), hàng yêu thích, nam châm ba mức, danh sách hình, và thanh kiểu
 * của hình đang chọn (màu, nét, tô, khoá, ẩn, nhân bản, xoá, mẫu kiểu). Thanh dọc cao hơn khung thì cuộn trong chính nó, không bao giờ làm trang tràn.
 * Chỉ là DOM: mọi thay đổi đi qua `chart.controller.dispatch`, nên hoàn tác và phím tắt chạy như nhau cho cả hai.
 */
import { useEffect, useState } from "react"
import {
  Activity,
  ArrowBigDown,
  ArrowBigUp,
  ArrowRightFromLine,
  ArrowUpRight,
  Blinds,
  Brush,
  CalendarRange,
  Check,
  Circle,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  Fan,
  GitFork,
  Grid3x3,
  Layers,
  ListTree,
  Lock,
  LockOpen,
  Magnet,
  Minus,
  MessageSquareText,
  Mountain,
  MoveDiagonal,
  MoveUpRight,
  Network,
  Pyramid,
  Rows3,
  Rows4,
  Route,
  Ruler,
  Scaling,
  SeparatorVertical,
  Spline,
  Square,
  SquareArrowDown,
  SquareArrowUp,
  Star,
  StickyNote,
  Tag,
  Trash2,
  TrendingUp,
  Triangle,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { ALL_TOOLS, TOOL_SPECS, isVariableTool, listDrawings, normalizeMagnet, type MagnetMode, type ToolGroup } from "../drawings"
import type { ColorToken, Drawing, DrawingStyle, DrawingTool } from "../types"
import {
  MAX_FAVORITES,
  readFavorites,
  readLastTools,
  readMagnet,
  toggleFavorite,
  writeFavorites,
  writeLastTools,
  writeMagnet,
} from "./tool-preferences"
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
  "fib-time-zones": Columns3,
  "fib-fan": Fan,
  "fib-channel": Blinds,
  pitchfork: GitFork,
  "gann-fan": Network,
  "gann-box": Grid3x3,
  xabcd: Waypoints,
  "head-shoulders": Mountain,
  "triangle-pattern": Pyramid,
  rectangle: Square,
  "elliott-5": Activity,
  "elliott-abc": Spline,
  note: StickyNote,
  measure: Ruler,
  "long-position": SquareArrowUp,
  "short-position": SquareArrowDown,
  brush: Brush,
  arrow: ArrowUpRight,
  "arrow-up": ArrowBigUp,
  "arrow-down": ArrowBigDown,
  "price-label": Tag,
  callout: MessageSquareText,
  "date-range": CalendarRange,
  "date-price-range": Scaling,
  ellipse: Circle,
  triangle: Triangle,
  path: Route,
}

/** Tiêu đề từng loại công cụ trong menu của nhóm. */
const SECTION_LABELS: Readonly<Record<ToolGroup, string>> = {
  line: "Đường",
  channel: "Kênh",
  fib: "Fibonacci",
  pitchfork: "Pitchfork và Gann",
  pattern: "Mẫu hình",
  wave: "Sóng Elliott",
  shape: "Hình",
  freehand: "Vẽ tự do",
  position: "Vị thế",
  measure: "Đo",
  annotation: "Chú thích",
}

/**
 * Bảy nút nhóm trên thanh dọc. Nhóm ghép nhiều loại để thanh gọn: mỗi nút mở một menu có tiêu đề từng loại bên trong. Nút "Đường" giữ
 * nhãn đầu tiên vì trang dùng nó để tìm nút.
 */
const GROUPS: readonly { id: string; label: string; sections: readonly ToolGroup[] }[] = [
  { id: "line", label: "Đường", sections: ["line", "channel"] },
  { id: "fib", label: "Fibonacci", sections: ["fib"] },
  { id: "pitchfork", label: "Pitchfork và Gann", sections: ["pitchfork"] },
  { id: "pattern", label: "Mẫu hình và sóng", sections: ["pattern", "wave"] },
  { id: "shape", label: "Hình và vẽ tự do", sections: ["shape", "freehand"] },
  { id: "position", label: "Vị thế và đo", sections: ["position", "measure"] },
  { id: "annotation", label: "Chú thích", sections: ["annotation"] },
]

const MAGNET_MODES: readonly { mode: MagnetMode; label: string; hint: string }[] = [
  { mode: "off", label: "Tắt", hint: "Điểm vẽ đúng chỗ con trỏ" },
  { mode: "weak", label: "Yếu", hint: "Hút vào giá O, H, L, C khi con trỏ ở gần" },
  { mode: "strong", label: "Mạnh", hint: "Luôn hút về giá O, H, L, C gần nhất của nến gần nhất" },
]

/** Màu của hình vẽ: bỏ chart-3, chart-4 (màu tăng giảm) và chart-7 (màu của AI) theo DESIGN.md. */
const DRAWING_COLORS: readonly { token: ColorToken; label: string }[] = [
  { token: "chart-1", label: "Xanh dương" },
  { token: "chart-2", label: "Hổ phách" },
  { token: "chart-5", label: "Xám xanh" },
  { token: "chart-6", label: "Xanh lơ" },
  { token: "chart-8", label: "Hồng tím" },
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

/** Màu tăng giảm chỉ dành cho mũi tên một điểm (dấu mua, dấu bán); các hình khác không dùng để đường kẻ không mang nghĩa giá tăng giảm. */
const MARKER_COLORS: readonly { token: ColorToken; label: string }[] = [
  { token: "price-up", label: "Màu tăng" },
  { token: "price-down", label: "Màu giảm" },
]

const colorLabel = (token: ColorToken): string => [...DRAWING_COLORS, ...MARKER_COLORS].find((item) => item.token === token)?.label ?? token
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

/** Một dòng công cụ trong menu nhóm: bấm để chọn; ngôi sao bên phải để thêm hoặc bỏ yêu thích (bàn phím: Shift + Enter). */
function ToolMenuItem({ tool, favorite, canAdd, onPick, onToggleFavorite }: { tool: DrawingTool; favorite: boolean; canAdd: boolean; onPick: () => void; onToggleFavorite: () => void }) {
  const ToolIcon = TOOL_ICONS[tool]
  const label = TOOL_SPECS[tool].label
  const blocked = !favorite && !canAdd
  const starLabel = favorite ? `Bỏ ${label} khỏi yêu thích` : blocked ? `Đã đủ ${MAX_FAVORITES} công cụ yêu thích, không thêm được ${label}` : `Thêm ${label} vào yêu thích`
  return (
    <DropdownMenuItem
      data-tool={tool}
      aria-keyshortcuts="Shift+Enter"
      onSelect={onPick}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault()
          event.stopPropagation()
          if (!blocked) onToggleFavorite()
        }
      }}
    >
      <ToolIcon aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={starLabel}
        aria-pressed={favorite}
        title={starLabel}
        disabled={blocked}
        data-favorite-toggle={tool}
        className="pointer-events-auto -mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground disabled:opacity-40"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleFavorite()
        }}
      >
        <Star aria-hidden="true" className={cn("size-3.5", favorite && "fill-current text-foreground")} />
      </button>
    </DropdownMenuItem>
  )
}

/** Thanh công cụ dọc bên trái khung biểu đồ. `scope` là chủ sở hữu layout (người dùng hay khách): yêu thích lưu riêng theo đó. */
export default function DrawingToolbar({ chart, className, scope = "guest" }: Props & { className?: string; scope?: string }) {
  const { drawings, magnet } = chart.state
  const allowed = chart.config.allowedTools.length > 0 ? chart.config.allowedTools : ALL_TOOLS
  // Đọc kho một lần khi dựng; kho không dùng được thì danh sách rỗng và mọi thay đổi vẫn sống trong phiên (tool-preferences.ts).
  const [stored, setStored] = useState<{ scope: string; tools: DrawingTool[] }>(() => ({ scope, tools: readFavorites(scope, allowed) }))
  const [lastOfGroup, setLastOfGroup] = useState<Record<string, DrawingTool>>(readLastTools)
  // Đổi tài khoản (đăng nhập hoặc đăng xuất) thì nạp danh sách của tài khoản mới, không mang danh sách cũ sang.
  if (stored.scope !== scope) setStored({ scope, tools: readFavorites(scope, allowed) })
  const favorites = stored.scope === scope ? stored.tools : []
  const setFavorites = (tools: DrawingTool[]) => setStored({ scope, tools })
  const pick = (tool: DrawingTool) => {
    const group = GROUPS.find((item) => item.sections.includes(TOOL_SPECS[tool].group))
    if (group) {
      const next = { ...lastOfGroup, [group.id]: tool }
      setLastOfGroup(next)
      writeLastTools(next)
    }
    chart.controller.dispatch({ type: "tool", tool })
  }
  const flip = (tool: DrawingTool) => {
    const next = toggleFavorite(favorites, tool)
    setFavorites(next)
    writeFavorites(scope, next)
  }
  // Nhớ chế độ nam châm từ lần trước (layout cũ lưu boolean thì `true` thành yếu).
  useEffect(() => {
    const saved = readMagnet()
    if (saved !== "off") chart.controller.dispatch({ type: "magnet", on: saved })
    // Chỉ khi dựng thanh: sau đó người dùng là nguồn duy nhất.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const chooseMagnet = (value: string) => {
    const mode = normalizeMagnet(value)
    writeMagnet(mode)
    chart.controller.dispatch({ type: "magnet", on: mode })
  }
  const magnetInfo = MAGNET_MODES.find((item) => item.mode === magnet) ?? MAGNET_MODES[0]
  const favoriteTools = favorites.filter((tool) => allowed.includes(tool))

  return (
    <div role="toolbar" aria-label="Công cụ vẽ" aria-orientation="vertical" className={cn("flex w-9 shrink-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden border-r border-border bg-card py-1", className)}>
      {favoriteTools.length > 0 ? (
        <>
          <div role="group" aria-label="Công cụ yêu thích" data-favorites className="flex flex-col items-center gap-1">
            {favoriteTools.map((tool) => {
              const ToolIcon = TOOL_ICONS[tool]
              const active = drawings.tool === tool
              return (
                <Button key={tool} type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label={TOOL_SPECS[tool].label} aria-pressed={active} title={`${TOOL_SPECS[tool].label} (yêu thích)`} data-favorite-tool={tool} onClick={() => pick(tool)}>
                  <ToolIcon aria-hidden="true" />
                </Button>
              )
            })}
          </div>
          <span aria-hidden="true" className="my-0.5 h-px w-5 shrink-0 bg-border" />
        </>
      ) : null}

      {GROUPS.map(({ id, label, sections }) => {
        const sectionTools = sections.map((section) => ({ section, tools: ALL_TOOLS.filter((tool) => TOOL_SPECS[tool].group === section && allowed.includes(tool)) })).filter((entry) => entry.tools.length > 0)
        const tools = sectionTools.flatMap((entry) => entry.tools)
        if (tools.length === 0) return null
        const active = drawings.tool !== null && tools.includes(drawings.tool)
        const remembered = lastOfGroup[id]
        const shown = (active ? drawings.tool : remembered && tools.includes(remembered) ? remembered : null) ?? tools[0]
        const Icon = TOOL_ICONS[shown]
        return (
          <DropdownMenu key={id}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label={`${label}: ${TOOL_SPECS[shown].label}`} aria-pressed={active} title={label} data-tool-group={id}>
                <Icon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" collisionPadding={8} className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-60 max-w-[calc(100vw-3.5rem)] overflow-y-auto">
              <DropdownMenuLabel>{label}</DropdownMenuLabel>
              {sectionTools.map(({ section, tools: inSection }, index) => (
                <DropdownMenuGroup key={section}>
                  {sectionTools.length > 1 ? (
                    <>
                      {index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{SECTION_LABELS[section]}</DropdownMenuLabel>
                    </>
                  ) : (
                    <DropdownMenuSeparator />
                  )}
                  {inSection.map((tool) => (
                    <ToolMenuItem key={tool} tool={tool} favorite={favorites.includes(tool)} canAdd={favorites.length < MAX_FAVORITES} onPick={() => pick(tool)} onToggleFavorite={() => flip(tool)} />
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}

      <span aria-hidden="true" className="my-0.5 h-px w-5 shrink-0 bg-border" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={magnet === "strong" ? "default" : magnet === "weak" ? "secondary" : "ghost"} size="icon-sm" aria-label={`Nam châm hút vào giá OHLC: ${magnetInfo.label}`} aria-pressed={magnet !== "off"} title={`Nam châm: ${magnetInfo.label}`} data-magnet={magnet}>
            <Magnet aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" collisionPadding={8} className="w-64 max-w-[calc(100vw-3.5rem)]">
          <DropdownMenuLabel>Nam châm</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={magnet} onValueChange={chooseMagnet}>
            {MAGNET_MODES.map((item) => (
              <DropdownMenuRadioItem key={item.mode} value={item.mode} className="items-start py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span>{item.label}</span>
                  <span className="whitespace-normal text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

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

/** Thanh hoàn tất của đường gấp khúc đang vẽ: trên điện thoại nhấp đúp không tin cậy và không có phím Enter, nên có nút bấm. */
function PendingBar({ chart, className }: Props & { className?: string }) {
  const { pending } = chart.state.drawings
  if (!pending) return null
  const spec = TOOL_SPECS[pending.tool]
  const enough = pending.anchors.length >= spec.anchorCount
  const act = (action: Parameters<typeof chart.controller.dispatch>[0] & { type: "drawing" }) => chart.controller.dispatch(action)
  return (
    <div role="toolbar" aria-label={`Hoàn tất ${spec.label}`} className={cn("pointer-events-auto flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", className)}>
      <span className="px-1 text-xs font-medium">{spec.label}: {pending.anchors.length} điểm</span>
      <Button type="button" variant="secondary" size="xs" disabled={!enough} title="Hoàn tất (Enter hoặc nhấp đúp)" onClick={() => act({ type: "drawing", action: { type: "finish" } })}>
        <Check aria-hidden="true" />
        Xong
      </Button>
      <Button type="button" variant="ghost" size="xs" title="Huỷ (Esc)" onClick={() => act({ type: "drawing", action: { type: "cancel" } })}>
        <X aria-hidden="true" />
        Huỷ
      </Button>
    </div>
  )
}

/** Thanh kiểu nổi của hình đang chọn; null khi không chọn hình nào. */
export function DrawingStyleBar({ chart, className }: Props & { className?: string }) {
  const { drawings } = chart.state
  const shape: Drawing | undefined = drawings.selectedId === null ? undefined : drawings.shapes.find((item) => item.id === drawings.selectedId)
  const [templates, setTemplates] = useState<DrawingStyle[]>(readTemplates)
  if (!shape) return drawings.pending && isVariableTool(drawings.pending.tool) && !TOOL_SPECS[drawings.pending.tool].variable?.stroke ? <PendingBar chart={chart} className={className} /> : null
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
            {(shape.tool === "arrow-up" || shape.tool === "arrow-down" ? [...DRAWING_COLORS, ...MARKER_COLORS] : DRAWING_COLORS).map((item) => (
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

      {shape.tool === "note" || shape.tool === "callout" ? (
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
