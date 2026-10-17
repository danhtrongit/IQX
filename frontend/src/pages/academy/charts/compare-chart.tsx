import { cn } from "@/lib/utils"
import { chartLabel, type CompareModel } from "./chart-math"
import { titleColor } from "./chart-theme"
import { LeafChart } from "./leaf-chart"
import { useChartWidth } from "./use-chart-width"

/** Below this width a `row` compare stacks its items (design §7.3). */
const STACK_BELOW = 560

/** Small multiples side by side (`row`) or stacked (`stack`); each item is a leaf chart model. */
export function CompareChart({ model, label }: { model: CompareModel; label: string }) {
  const [measure, width] = useChartWidth()
  const columns = model.layout === "stack" || width < STACK_BELOW ? 1 : Math.min(model.items.length, 3)
  return (
    <div ref={measure} role="group" aria-label={label} className="w-full min-w-0 space-y-2">
      {model.title && <p className="text-xs font-semibold text-foreground">{model.title}</p>}
      <div className="grid gap-x-5 gap-y-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {model.items.map((item, index) => (
          <figure key={index} className="m-0 min-w-0 space-y-1.5">
            {item.title && <figcaption className={cn("text-xs font-semibold", titleColor(item.tone))}>{item.title}</figcaption>}
            <LeafChart model={item.model} label={chartLabel(item.model, item.title ?? `${label}, phần ${index + 1}`)} />
          </figure>
        ))}
      </div>
    </div>
  )
}
