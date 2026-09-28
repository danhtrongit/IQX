import { Check, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ChecklistItem {
  /** the yes/no question */
  label: string
  /** true → ✓ (khỏe) ; false → ! (cần theo dõi) */
  ok: boolean
  /** optional supporting detail line */
  detail?: string
}

export interface ChecklistProps {
  items: ChecklistItem[]
}

/**
 * Danh sách ✓ / ! (khối 6C): mỗi mục là 1 câu hỏi + trạng thái. Xanh = ổn,
 * vàng = cần theo dõi.
 */
export function Checklist({ items }: ChecklistProps) {
  return (
    <div className="mb-5 flex flex-col">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-border px-1 py-3 last:border-b-0"
        >
          <div
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
              item.ok ? "bg-price-up/15 text-price-up" : "bg-price-ref/15 text-price-ref",
            )}
            aria-hidden="true"
          >
            {item.ok ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">{item.label}</div>
            {item.detail ? (
              <div className="text-sm leading-5 text-muted-foreground">{item.detail}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
