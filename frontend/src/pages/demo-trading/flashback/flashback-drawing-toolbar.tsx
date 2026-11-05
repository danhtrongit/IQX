/**
 * Nút công cụ vẽ (spec v2.1 §7.1): Xu hướng, Fibonacci và Xoá, cùng hàng và ngay bên phải nút
 * "Các chỉ báo". Không có nút Con trỏ và không có dòng hướng dẫn; trên điện thoại chỉ hiện biểu tượng.
 * Công cụ đang bật thì nút sáng lên (`aria-pressed`).
 *
 * `DrawingToolbarView` là phần hiển thị dùng chung; biểu đồ SVG cũ dùng `DrawingToolbar` (hai công cụ), biểu đồ IQLine
 * (`?iqline=1`) dùng cùng phần hiển thị với bộ công cụ của nó (thêm Đường ngang) ở `flashback-chart-iqline.tsx`.
 */
import type { LucideIcon } from "lucide-react"
import { AlignJustify, Trash2, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { DrawingTool } from "./flashback-drawings"
import type { ChartDrawings } from "./use-chart-drawings"

export type ToolButton = {
  /** Phần cuối của `data-testid` (`flashback-draw-{key}`). */
  key: string
  /** Giá trị đưa cho `onToggle`: tên công cụ của bên vẽ. */
  tool: string
  label: string
  icon: LucideIcon
}

const SVG_TOOLS: readonly ToolButton[] = [
  { key: "trend", tool: "trend", label: "Xu hướng", icon: TrendingUp },
  { key: "fib", tool: "fib", label: "Fibonacci", icon: AlignJustify },
]

export function DrawingToolbarView({
  tools,
  active,
  onToggle,
  onClear,
}: {
  tools: readonly ToolButton[]
  active: string | null
  onToggle: (tool: string) => void
  onClear: () => void
}) {
  return (
    <div role="group" aria-label="Công cụ vẽ" className="flex items-center gap-2" data-testid="flashback-draw-toolbar">
      {tools.map(({ key, tool, label, icon: Icon }) => (
        <Button
          key={key}
          type="button"
          variant={active === tool ? "default" : "outline"}
          size="sm"
          aria-pressed={active === tool}
          title={label}
          data-testid={`flashback-draw-${key}`}
          onClick={() => onToggle(tool)}
        >
          <Icon aria-hidden="true" />
          <span className="max-sm:sr-only">{label}</span>
        </Button>
      ))}
      <Button type="button" variant="outline" size="sm" title="Xoá hình vẽ" data-testid="flashback-draw-clear" onClick={onClear}>
        <Trash2 aria-hidden="true" />
        <span className="max-sm:sr-only">Xoá</span>
      </Button>
    </div>
  )
}

export function DrawingToolbar({ drawings }: { drawings: ChartDrawings }) {
  return (
    <DrawingToolbarView
      tools={SVG_TOOLS}
      active={drawings.state.tool}
      onToggle={(tool) => drawings.toggleTool(tool as DrawingTool)}
      onClear={drawings.clear}
    />
  )
}
