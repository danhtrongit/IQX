// ─── World cell ───────────────────────────────────────────────────────────────
// One overnight global indicator. A cell without a value renders an explicit "—"
// (never 0), a cell whose number predates today keeps the legacy " · cũ" tag, and
// the direction tint appears only when there is a value to tint.

import { cn } from "@/lib/utils"

import { formatSignedPercent } from "../../format"
import type { WorldCell } from "../../types"

const CHANGE_TONE: Record<WorldCell["sentiment"], string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "text-muted-foreground",
}

const VALUE_ACCENT: Record<WorldCell["sentiment"], string> = {
  up: "border-l-2 border-l-price-up",
  down: "border-l-2 border-l-price-down",
  flat: "",
}

export function WorldCellCard({ cell }: { cell: WorldCell }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md bg-secondary p-2.5",
        cell.value != null && VALUE_ACCENT[cell.sentiment],
        cell.stale && "opacity-50",
      )}
      title={
        cell.value == null
          ? `${cell.label}: dữ liệu chưa có`
          : cell.stale
            ? `${cell.label}: số phiên gần nhất (chưa cập nhật hôm nay)`
            : undefined
      }
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{cell.label}</span>
        {cell.value != null && cell.stale && <span className="shrink-0"> · cũ</span>}
        {cell.source === "vcb" && <span className="shrink-0"> · VCB</span>}
      </div>
      {cell.value == null ? (
        <div className="text-base font-bold text-muted-foreground">—</div>
      ) : (
        <>
          <div className="tabular-nums text-base font-bold">
            {cell.value.toLocaleString("en-US")}
          </div>
          {cell.change_pct != null && (
            <div className={cn("tabular-nums text-xs", CHANGE_TONE[cell.sentiment])}>
              {formatSignedPercent(cell.change_pct)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
