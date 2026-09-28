/**
 * Thư viện chỉ tiêu của backtest — port từ
 * `dashboard/src/features/backtest/components/FactorLibrary.tsx`.
 *
 * Tìm kiếm chạy trên cả hai phía MUA/BÁN: nếu từ khoá chỉ khớp phía còn lại thì
 * tự chuyển phía (giữ nguyên hành vi cũ). Chỉ tiêu đã thêm vẫn hiện nhưng không
 * thêm lại được.
 */
import { useState } from "react"
import { ArrowDown, ArrowUp, Check, Info, Search } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { IndicatorInfoPopover } from "../indicators/indicator-info-popover"
import type { Factor, FactorGroup, FactorLibrary as Library, Side } from "../types"

/** Từ khoá khớp nhãn, id chỉ báo hoặc mô tả của chỉ tiêu. */
function matches(factor: Factor, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    factor.label.toLowerCase().includes(needle) ||
    factor.indicator.toLowerCase().includes(needle) ||
    factor.desc.toLowerCase().includes(needle)
  )
}

function countMatches(groups: FactorGroup[], query: string): number {
  return groups.reduce(
    (total, group) => total + group.factors.filter((factor) => matches(factor, query)).length,
    0,
  )
}

function GroupBlock({
  group,
  selectedIds,
  onAdd,
  query,
}: {
  group: FactorGroup
  selectedIds: Set<string>
  onAdd: (factor: Factor) => void
  query: string
}) {
  const factors = group.factors.filter((factor) => matches(factor, query))
  if (factors.length === 0) return null

  return (
    <div className="py-1.5">
      <div className="px-4 pt-1.5 pb-1 text-[10.5px] tracking-wide text-muted-foreground uppercase">
        {group.group} · {group.groupLabel}
      </div>
      {factors.map((factor) => {
        const added = selectedIds.has(factor.id)
        return (
          <div
            key={factor.id}
            className={cn(
              "flex w-full items-center gap-2 py-1.5 pr-4 pl-7 text-xs transition-colors duration-150",
              added ? "text-muted-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            <button
              type="button"
              disabled={added}
              onClick={() => onAdd(factor)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default"
              aria-label={added ? `${factor.label} (đã thêm)` : `Thêm ${factor.label}`}
            >
              {added && <Check className="size-3.5 shrink-0 text-primary" />}
              <span className="truncate">{factor.label}</span>
            </button>

            <IndicatorInfoPopover indicatorId={factor.indicator} label={factor.label}>
              <button
                type="button"
                aria-label={`Thông tin chỉ báo ${factor.label}`}
                className="shrink-0 text-muted-foreground transition-colors duration-150 hover:text-primary"
              >
                <Info className="size-3.5" />
              </button>
            </IndicatorInfoPopover>

            <Badge
              variant="outline"
              className={cn(
                "h-4 shrink-0 rounded-sm border-0 px-1.5 font-mono text-[9.5px] font-semibold",
                factor.kind === "bin" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent",
              )}
            >
              {factor.kind.toUpperCase()}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}

export function FactorLibrary({
  library,
  selectedIds,
  onAdd,
}: {
  library: Library
  selectedIds: Set<string>
  onAdd: (factor: Factor) => void
}) {
  const [query, setQuery] = useState("")
  const [side, setSide] = useState<Side>("buy")

  const buyCount = library.buy.reduce((total, group) => total + group.factors.length, 0)
  const sellCount = library.sell.reduce((total, group) => total + group.factors.length, 0)

  // Tìm kiếm xuyên cả hai phía: từ khoá chỉ khớp phía còn lại thì hiển thị phía
  // đó (bản cũ chuyển hẳn state; ở đây suy ra lúc render nên xoá từ khoá là quay
  // về đúng phía người dùng đã chọn).
  const buyMatches = query.trim() ? countMatches(library.buy, query) : buyCount
  const sellMatches = query.trim() ? countMatches(library.sell, query) : sellCount
  const activeSide: Side =
    side === "buy" && buyMatches === 0 && sellMatches > 0
      ? "sell"
      : side === "sell" && sellMatches === 0 && buyMatches > 0
        ? "buy"
        : side

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden border-r border-border bg-card">
      <div className="shrink-0 border-b border-border p-3">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Thư viện chỉ tiêu · {library.count} chỉ tiêu
        </div>

        <div className="relative mt-2">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm chỉ tiêu…"
            aria-label="Tìm chỉ tiêu"
            className="pl-7 text-xs"
          />
        </div>

        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={activeSide}
          onValueChange={(value) => value && setSide(value as Side)}
          className="mt-2 w-full"
        >
          <ToggleGroupItem
            value="buy"
            className="flex-1 gap-1 text-[10.5px] font-semibold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <ArrowUp className="size-3" />
            MUA ({buyCount})
          </ToggleGroupItem>
          <ToggleGroupItem
            value="sell"
            className="flex-1 gap-1 text-[10.5px] font-semibold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <ArrowDown className="size-3" />
            BÁN ({sellCount})
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="py-2">
          {library[activeSide].map((group) => (
            <GroupBlock
              key={group.group}
              group={group}
              selectedIds={selectedIds}
              onAdd={onAdd}
              query={query}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
