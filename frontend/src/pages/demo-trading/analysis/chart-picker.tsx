import { useMemo, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

import type { CatalogGroup, ChartName } from "./api"

/** Bỏ dấu và hạ chữ thường, để tìm "khoi luong" ra "Khối lượng". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
}

/**
 * Khung "Biểu đồ" bên phải (spec §3): danh mục 33 chỉ tiêu chia 6 nhóm, ô
 * tick để thêm hoặc bỏ biểu đồ khỏi dashboard.
 */
export function ChartPicker({
  catalog,
  selected,
  isBank,
  onToggle,
}: {
  catalog: readonly CatalogGroup[]
  selected: readonly ChartName[]
  isBank: boolean
  onToggle: (name: ChartName) => void
}) {
  const [query, setQuery] = useState("")
  const needle = normalize(query)
  const total = catalog.reduce((sum, group) => sum + group.items.length, 0) || 33

  const groups = useMemo(
    () =>
      catalog
        .map((group) => {
          const items = group.items.filter((item) => !needle || normalize(item.name).includes(needle))
          return { group, items }
        })
        .filter((entry) => entry.items.length > 0),
    [catalog, needle],
  )

  return (
    <div className="flex flex-col bg-card min-[761px]:h-full">
      <div className="shrink-0 border-b border-border p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-sm font-bold">Biểu đồ</h2>
          <span className="text-xs font-semibold text-academy-subtle">
            Đã chọn {selected.length}/{total}
          </span>
        </div>
        <Input
          type="search"
          value={query}
          placeholder="Tìm chỉ tiêu"
          aria-label="Tìm chỉ tiêu"
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 text-sm placeholder:text-academy-subtle"
        />
      </div>

      <div className="max-h-[320px] overflow-y-auto px-2 pb-4 max-[760px]:max-h-[320px] max-[760px]:overflow-y-auto min-[761px]:max-h-none min-[761px]:min-h-0 min-[761px]:flex-1">
        {groups.length === 0 && (
          <p className="p-3 text-xs font-semibold text-academy-subtle">Không có chỉ tiêu phù hợp</p>
        )}
        {groups.map(({ group, items }) => {
          const chosen = group.items.filter((item) => selected.includes(item.name)).length
          return (
            <section key={group.group}>
              <h3 className="flex items-baseline justify-between gap-2 px-1 pt-3 pb-1 text-[11px] font-bold tracking-wide text-academy-subtle uppercase">
                <span>{group.group}</span>
                <span className="tabular-nums">
                  {chosen}/{group.items.length}
                </span>
              </h3>
              <ul className="m-0 list-none p-0">
                {items.map((item) => {
                  const checked = selected.includes(item.name)
                  return (
                    <li key={item.name}>
                      <label className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] font-semibold hover:bg-muted has-[:checked]:text-foreground">
                        <Checkbox
                          checked={checked}
                          aria-label={`Hiện biểu đồ ${item.name}`}
                          onCheckedChange={() => onToggle(item.name)}
                        />
                        <span className="min-w-0 flex-1 break-words">{item.name}</span>
                        {isBank && item.na_for_bank && (
                          <span className="shrink-0 text-[10px] font-bold text-status-warning">
                            Không áp dụng
                          </span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
