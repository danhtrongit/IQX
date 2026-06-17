import { useState } from "react"
import { IconSearch } from "@arco-design/web-react/icon"
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
          <button
            key={f.id}
            type="button"
            disabled={added}
            onClick={() => onAdd(f)}
            className={`flex w-full items-center justify-between gap-2 border-l-2 border-transparent py-1.5 pl-7 pr-4 text-left text-xs transition-colors ${
              added
                ? "cursor-default text-[var(--color-text-3)]"
                : "text-[var(--color-text-2)] hover:bg-[var(--color-fill-2)] hover:text-[var(--color-text-1)]"
            }`}
          >
            <span className="truncate">
              {added && <span className="mr-1 text-[rgb(var(--primary-6))]">✓</span>}
              {f.label}
            </span>
            <span
              className={`shrink-0 rounded px-1.5 py-px font-mono text-[9.5px] ${
                f.kind === "bin"
                  ? "bg-[rgba(79,141,239,0.15)] text-[rgb(var(--primary-6))]"
                  : "bg-[rgba(245,158,11,0.14)] text-[#F59E0B]"
              }`}
            >
              {f.kind.toUpperCase()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function FactorLibrary({ library, selectedIds, onAdd }: Props) {
  const [query, setQuery] = useState("")
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
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-[var(--color-border-2)] py-2">
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-up">▲ Nhóm MUA</span>
            <span className="font-mono text-[10px] text-[var(--color-text-3)]">
              {library.buy.reduce((n, g) => n + g.factors.length, 0)}
            </span>
          </div>
          {library.buy.map((g) => (
            <GroupBlock key={g.group} group={g} selectedIds={selectedIds} onAdd={onAdd} query={query} />
          ))}
        </div>

        <div className="py-2">
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-down">▼ Nhóm BÁN</span>
            <span className="font-mono text-[10px] text-[var(--color-text-3)]">
              {library.sell.reduce((n, g) => n + g.factors.length, 0)}
            </span>
          </div>
          {library.sell.map((g) => (
            <GroupBlock key={g.group} group={g} selectedIds={selectedIds} onAdd={onAdd} query={query} />
          ))}
        </div>
      </div>
    </aside>
  )
}
