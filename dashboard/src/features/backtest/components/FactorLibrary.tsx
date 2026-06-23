import { useState, useEffect } from "react"
import { IconSearch, IconInfoCircle } from "@arco-design/web-react/icon"
import { IndicatorInfoPopover } from "../../strategy/IndicatorInfoPopover"
import type { Factor, FactorGroup, FactorLibrary as Lib } from "../types"

interface Props {
  library: Lib
  selectedIds: Set<string>
  onAdd: (factor: Factor) => void
}

function matches(f: Factor, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    f.label.toLowerCase().includes(needle) ||
    f.indicator.toLowerCase().includes(needle) ||
    f.desc.toLowerCase().includes(needle)
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
  onAdd: (f: Factor) => void
  query: string
}) {
  const factors = group.factors.filter((f) => matches(f, query))
  if (!factors.length) return null
  return (
    <div className="py-1.5">
      <div className="px-4 pt-1.5 pb-1 text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
        {group.group} · {group.group_label}
      </div>
      {factors.map((f) => {
        const added = selectedIds.has(f.id)
        return (
          <div
            key={f.id}
            className={`flex w-full items-center gap-2 border-l-2 border-transparent py-1.5 pl-7 pr-4 text-xs transition-colors ${
              added
                ? "cursor-default text-[var(--color-text-3)]"
                : "text-[var(--color-text-2)] hover:bg-[var(--color-fill-2)] hover:text-[var(--color-text-1)]"
            }`}
          >
            {/* Add-action area — fills available space */}
            <button
              type="button"
              disabled={added}
              onClick={() => onAdd(f)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              aria-label={f.label}
            >
              <span className="truncate">
                {added && <span className="mr-1 text-[rgb(var(--primary-6))]">✓</span>}
                {f.label}
              </span>
            </button>
            {/* ⓘ info button — sibling, not nested in the add button */}
            <IndicatorInfoPopover indicatorId={f.indicator} label={f.label}>
              <button
                type="button"
                aria-label="Thông tin chỉ báo"
                onClick={(e) => { e.stopPropagation() }}
                className="shrink-0 text-[var(--color-text-3)] transition-colors hover:text-[rgb(var(--primary-6))]"
              >
                <IconInfoCircle />
              </button>
            </IndicatorInfoPopover>
            {/* NUM/BIN badge */}
            <span
              className={`shrink-0 rounded px-1.5 py-px font-mono text-[9.5px] ${
                f.kind === "bin"
                  ? "bg-[rgba(79,141,239,0.15)] text-[rgb(var(--primary-6))]"
                  : "bg-[rgba(245,158,11,0.14)] text-[#F59E0B]"
              }`}
            >
              {f.kind.toUpperCase()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function FactorLibrary({ library, selectedIds, onAdd }: Props) {
  const [query, setQuery] = useState("")
  const [side, setSide] = useState<"buy" | "sell">("buy")

  const buyCount = library.buy.reduce((n, g) => n + g.factors.length, 0)
  const sellCount = library.sell.reduce((n, g) => n + g.factors.length, 0)

  // Search-spans-both: auto-switch side when query matches only the other side
  useEffect(() => {
    if (!query) return
    const buyMatches = library.buy.reduce(
      (n, g) => n + g.factors.filter((f) => matches(f, query)).length,
      0,
    )
    const sellMatches = library.sell.reduce(
      (n, g) => n + g.factors.filter((f) => matches(f, query)).length,
      0,
    )
    if (side === "buy" && buyMatches === 0 && sellMatches > 0) {
      setSide("sell")
    } else if (side === "sell" && sellMatches === 0 && buyMatches > 0) {
      setSide("buy")
    }
  }, [query, library, side])

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden border-r border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
      <div className="sticky top-0 z-[5] border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
          Factor Library · {library.count} chỉ tiêu
        </div>
        <div className="relative mt-2">
          <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm chỉ tiêu..."
            className="w-full rounded border border-[var(--color-border-2)] bg-[var(--color-bg-1)] py-1.5 pl-7 pr-2 text-xs text-[var(--color-text-1)] outline-none focus:border-[rgb(var(--primary-6))]"
          />
        </div>

        {/* Segmented control */}
        <div className="mt-2 flex overflow-hidden rounded border border-[var(--color-border-2)] text-[10.5px] font-semibold">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`flex-1 py-1 transition-colors ${
              side === "buy"
                ? "bg-[rgb(var(--primary-6))] text-white"
                : "bg-[var(--color-bg-1)] text-[var(--color-text-3)]"
            }`}
          >
            ▲ Chỉ báo MUA ({buyCount})
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`flex-1 py-1 transition-colors ${
              side === "sell"
                ? "bg-[rgb(var(--primary-6))] text-white"
                : "bg-[var(--color-bg-1)] text-[var(--color-text-3)]"
            }`}
          >
            ▼ Chỉ báo BÁN ({sellCount})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="py-2">
          {library[side].map((g) => (
            <GroupBlock key={g.group} group={g} selectedIds={selectedIds} onAdd={onAdd} query={query} />
          ))}
        </div>
      </div>
    </aside>
  )
}
