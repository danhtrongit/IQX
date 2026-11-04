import { useMemo, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

import type { CatalogIndustry, ChartName } from "./api"
import { LearnLink } from "./learn-link"
import { chapterSize, chosenCount, industryItems, normalizeSearch } from "./model"

/**
 * Khung "Biểu đồ" bên phải (spec Dashboard v2 §3): chỉ gồm chỉ tiêu của ngành đang xem, chia hai
 * cấp là chương (Phân tích cơ bản chung và chương riêng của ngành) rồi nhóm, mỗi cấp kèm số đã
 * chọn. Mỗi dòng có ô tick để thêm hoặc bỏ biểu đồ khỏi dashboard và nút "Học" mở bài học của chỉ
 * tiêu; nút "Học" đứng ngoài nhãn của ô tick nên không làm tick hay bỏ tick.
 */
export function ChartPicker({
  industry,
  selected,
  onToggle,
}: {
  /** Ngành đang xem; chưa biết thì khung trống. */
  industry: CatalogIndustry | undefined
  selected: readonly ChartName[]
  onToggle: (name: ChartName) => void
}) {
  const [query, setQuery] = useState("")
  const needle = normalizeSearch(query)
  const total = industry?.total ?? industryItems(industry).length

  const chapters = useMemo(
    () =>
      (industry?.chapters ?? [])
        .map((chapter) => ({
          chapter,
          groups: chapter.groups
            .map((group) => ({
              group,
              items: group.items.filter((item) => !needle || normalizeSearch(item.name).includes(needle)),
            }))
            .filter((entry) => entry.items.length > 0),
        }))
        .filter((entry) => entry.groups.length > 0),
    [industry, needle],
  )

  return (
    <div className="flex flex-col bg-card min-[761px]:h-full">
      <div className="shrink-0 border-b border-border p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-sm font-bold">Biểu đồ</h2>
          <span className="text-xs font-semibold text-text-secondary">
            Đã chọn {selected.length}/{total}
          </span>
        </div>
        <Input
          type="search"
          value={query}
          placeholder="Tìm chỉ tiêu"
          aria-label="Tìm chỉ tiêu"
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 text-sm placeholder:text-text-secondary"
        />
      </div>

      <div className="max-h-[320px] overflow-y-auto px-2 pb-4 max-[760px]:max-h-[320px] max-[760px]:overflow-y-auto min-[761px]:max-h-none min-[761px]:min-h-0 min-[761px]:flex-1">
        {chapters.length === 0 && (
          <p className="p-3 text-xs font-semibold text-text-secondary">Không có chỉ tiêu phù hợp</p>
        )}
        {chapters.map(({ chapter, groups }) => (
          <section key={chapter.chapter} data-chapter={chapter.chapter} className="mt-3 first:mt-0">
            <h3 className="flex items-baseline justify-between gap-2 border-b border-border px-1 pt-2 pb-1.5 text-[13px] font-bold text-foreground">
              <span>{chapter.chapter}</span>
              <span className="text-xs font-semibold text-text-secondary tabular-nums">
                {chosenCount(
                  chapter.groups.flatMap((group) => group.items),
                  selected,
                )}
                /{chapterSize(chapter)}
              </span>
            </h3>
            {groups.map(({ group, items }) => (
              <section key={group.group} data-group={group.group}>
                <h4 className="flex items-baseline justify-between gap-2 px-1 pt-3 pb-1 text-[11px] font-bold tracking-wide text-text-secondary uppercase">
                  <span>{group.group}</span>
                  <span className="tabular-nums">
                    {chosenCount(group.items, selected)}/{group.items.length}
                  </span>
                </h4>
                <ul className="m-0 list-none p-0">
                  {items.map((item) => {
                    const checked = selected.includes(item.name)
                    return (
                      <li key={item.name} className="flex items-center gap-1 rounded-sm hover:bg-muted">
                        <label className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-[13px] font-semibold has-[:checked]:text-foreground">
                          <Checkbox
                            checked={checked}
                            aria-label={`Hiện biểu đồ ${item.name}`}
                            onCheckedChange={() => onToggle(item.name)}
                          />
                          <span className="min-w-0 flex-1 break-words">{item.name}</span>
                        </label>
                        <LearnLink metricKey={item.metric_key} name={item.name} className="mr-1" />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
