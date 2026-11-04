import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

import type { AcademyCatalogChapter, AcademyMode } from "./academy-config-api"
import { ACADEMY_MODE_OPTIONS, chapterLabel } from "./academy-config-format"

/** Ô chọn "Cách học": Học tự do hoặc Học lần lượt (spec §1.2, §3). */
export function AcademyModeField({
  value,
  disabled,
  onChange,
}: {
  value: AcademyMode
  disabled: boolean
  onChange: (mode: AcademyMode) => void
}) {
  const baseId = useId()
  return (
    <div className="space-y-2">
      <p id={`${baseId}-label`} className="text-sm font-medium">
        Cách học
      </p>
      <RadioGroup
        aria-labelledby={`${baseId}-label`}
        value={value}
        disabled={disabled}
        onValueChange={(next) => onChange(next as AcademyMode)}
        className="gap-2"
      >
        {ACADEMY_MODE_OPTIONS.map((option) => (
          <div
            key={option.value}
            className="flex items-start gap-2.5 rounded-md border border-border bg-card px-3 py-2.5 has-[[role=radio][aria-checked=true]]:border-primary"
          >
            <RadioGroupItem
              id={`${baseId}-${option.value}`}
              value={option.value}
              aria-describedby={`${baseId}-${option.value}-hint`}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor={`${baseId}-${option.value}`}>{option.label}</Label>
              <p id={`${baseId}-${option.value}-hint`} className="text-xs text-muted-foreground">
                {option.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}

function chapterNote(chapter: AcademyCatalogChapter): string | null {
  const notes = []
  if (chapter.has_practice) notes.push("Kèm Phòng tập thực chiến")
  if (chapter.has_dashboard_metrics) notes.push("Có bài cho nút Học ở Dashboard")
  return notes.length > 0 ? notes.join(" · ") : null
}

/**
 * 12 chương theo thứ tự và số gốc của danh mục, mỗi chương một ô tick (spec §1.4). Chọn theo cả
 * chương. Số ở đây là số gốc; số người học thấy (đã đánh lại) chỉ có ở phần xem trước.
 */
export function AcademyChapterField({
  catalog,
  selected,
  disabled,
  onToggle,
  onSelectAll,
}: {
  catalog: AcademyCatalogChapter[]
  selected: ReadonlySet<string>
  disabled: boolean
  onToggle: (chapterId: string) => void
  onSelectAll: () => void
}) {
  const baseId = useId()
  const allSelected = catalog.every((chapter) => selected.has(chapter.chapter_id))
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${baseId}-label`} className="text-sm font-medium">
          Chương được học
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            Đã chọn {selected.size}/{catalog.length} chương
          </span>
          <Button type="button" variant="ghost" size="xs" disabled={disabled || allSelected} onClick={onSelectAll}>
            Chọn tất cả
          </Button>
        </div>
      </div>
      <div role="group" aria-labelledby={`${baseId}-label`}>
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {catalog.map((chapter) => {
            const id = `${baseId}-${chapter.chapter_id}`
            const note = chapterNote(chapter)
            return (
              <li key={chapter.chapter_id} className="flex items-start gap-3 px-3 py-2">
                <Checkbox
                  id={id}
                  checked={selected.has(chapter.chapter_id)}
                  disabled={disabled}
                  onCheckedChange={() => onToggle(chapter.chapter_id)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor={id} className="leading-snug">
                    {chapterLabel(chapter.no, chapter.title)}
                  </Label>
                  {note && <p className="text-xs text-muted-foreground">{note}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{chapter.lesson_count} bài</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
