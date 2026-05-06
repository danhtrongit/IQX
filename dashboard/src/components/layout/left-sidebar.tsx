import {
  MousePointer2,
  TrendingUp,
  Minus,
  PenLine,
  Type,
  RectangleHorizontal,
  Ruler,
  GitBranchPlus,
  Eraser,
  Magnet,
  Grid3x3,
  Eye,
  Undo2,
  Redo2,
  Trash2,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

interface ToolItem {
  icon: React.ReactNode
  label: string
  id: string
  shortcut?: string
}

const DRAWING_TOOLS: ToolItem[] = [
  { icon: <MousePointer2 className="size-4" />, label: "Con trỏ", id: "cursor", shortcut: "V" },
  { icon: <TrendingUp className="size-4" />, label: "Đường xu hướng", id: "trendline", shortcut: "T" },
  { icon: <Minus className="size-4" />, label: "Đường ngang", id: "horizontal-line", shortcut: "H" },
  { icon: <PenLine className="size-4" />, label: "Vẽ tự do", id: "freehand", shortcut: "F" },
  { icon: <RectangleHorizontal className="size-4" />, label: "Hình chữ nhật", id: "rectangle", shortcut: "R" },
  { icon: <GitBranchPlus className="size-4" />, label: "Fibonacci", id: "fibonacci" },
  { icon: <Ruler className="size-4" />, label: "Đo lường", id: "measure" },
  { icon: <Type className="size-4" />, label: "Ghi chú", id: "text", shortcut: "N" },
]

const ACTION_TOOLS: ToolItem[] = [
  { icon: <Magnet className="size-4" />, label: "Bắt dính", id: "snap" },
  { icon: <Grid3x3 className="size-4" />, label: "Lưới", id: "grid" },
  { icon: <Eye className="size-4" />, label: "Ẩn/Hiện vẽ", id: "toggle-drawings" },
  { icon: <Lock className="size-4" />, label: "Khóa vẽ", id: "lock-drawings" },
]

const HISTORY_TOOLS: ToolItem[] = [
  { icon: <Undo2 className="size-4" />, label: "Hoàn tác", id: "undo", shortcut: "⌘Z" },
  { icon: <Redo2 className="size-4" />, label: "Làm lại", id: "redo", shortcut: "⌘⇧Z" },
  { icon: <Eraser className="size-4" />, label: "Xóa tất cả", id: "clear" },
  { icon: <Trash2 className="size-4" />, label: "Xóa chọn", id: "delete", shortcut: "Del" },
]

function ToolButton({ tool, active = false }: { tool: ToolItem; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id={`tool-${tool.id}`}
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={`size-8 ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          {tool.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        <span>{tool.label}</span>
        {tool.shortcut && (
          <kbd className="text-[10px] bg-muted px-1 rounded font-mono">
            {tool.shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function LeftSidebar() {
  return (
    <aside
      id="left-sidebar"
      className="flex w-10 shrink-0 flex-col items-center border-r border-border bg-card py-1.5 gap-0.5"
    >
      {/* Drawing Tools */}
      <div className="flex flex-col items-center gap-0.5">
        {DRAWING_TOOLS.map((tool) => (
          <ToolButton
            key={tool.id}
            tool={tool}
            active={tool.id === "cursor"}
          />
        ))}
      </div>

      <Separator className="w-6 my-1" />

      {/* Action Tools */}
      <div className="flex flex-col items-center gap-0.5">
        {ACTION_TOOLS.map((tool) => (
          <ToolButton key={tool.id} tool={tool} />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      <Separator className="w-6 my-1" />

      {/* History Tools */}
      <div className="flex flex-col items-center gap-0.5">
        {HISTORY_TOOLS.map((tool) => (
          <ToolButton key={tool.id} tool={tool} />
        ))}
      </div>
    </aside>
  )
}
