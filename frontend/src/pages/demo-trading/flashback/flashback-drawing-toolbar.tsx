/**
 * Nút công cụ vẽ (spec v2.1 §7.1): Xu hướng, Fibonacci và Xoá, cùng hàng và ngay bên phải nút
 * "Các chỉ báo". Không có nút Con trỏ và không có dòng hướng dẫn; trên điện thoại chỉ hiện biểu tượng.
 * Công cụ đang bật thì nút sáng lên (`aria-pressed`).
 */
import { AlignJustify, Trash2, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { DrawingTool } from "./flashback-drawings"
import type { ChartDrawings } from "./use-chart-drawings"

const TOOLS: { tool: DrawingTool; label: string; icon: typeof TrendingUp }[] = [
  { tool: "trend", label: "Xu hướng", icon: TrendingUp },
  { tool: "fib", label: "Fibonacci", icon: AlignJustify },
]

export function DrawingToolbar({ drawings }: { drawings: ChartDrawings }) {
  const active = drawings.state.tool
  return (
    <div role="group" aria-label="Công cụ vẽ" className="flex items-center gap-2" data-testid="flashback-draw-toolbar">
      {TOOLS.map(({ tool, label, icon: Icon }) => (
        <Button
          key={tool}
          type="button"
          variant={active === tool ? "default" : "outline"}
          size="sm"
          aria-pressed={active === tool}
          title={label}
          data-testid={`flashback-draw-${tool}`}
          onClick={() => drawings.toggleTool(tool)}
        >
          <Icon aria-hidden="true" />
          <span className="max-sm:sr-only">{label}</span>
        </Button>
      ))}
      <Button type="button" variant="outline" size="sm" title="Xoá hình vẽ" data-testid="flashback-draw-clear" onClick={drawings.clear}>
        <Trash2 aria-hidden="true" />
        <span className="max-sm:sr-only">Xoá</span>
      </Button>
    </div>
  )
}
