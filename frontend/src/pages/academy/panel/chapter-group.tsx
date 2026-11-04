import { useId } from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import type { CatalogChapter, ItemState, ProgressResponse } from "../content-types"
import { ItemRow } from "./item-row"

/**
 * One chapter of the learner's program: "Chương c · Tên chương" in bold foreground (c is his `display_no`,
 * spec v4.1 §2), its required-lesson count and, when open, every item (lessons, the chapter exam and, for the
 * personal-brand chapter, the optional practice room).
 */
export function ChapterGroup({
  chapter,
  open,
  onToggle,
  states,
  progress,
  currentItemId,
  onSelect,
}: {
  chapter: CatalogChapter
  open: boolean
  onToggle: () => void
  states: ReadonlyMap<string, ItemState>
  progress: ProgressResponse | undefined
  currentItemId: string | null
  onSelect: (itemId: string) => void
}) {
  const listId = useId()
  const counts = progress?.chapters?.find((candidate) => candidate.chapter_id === chapter.chapter_id)
  const total = counts?.total ?? chapter.lesson_count
  return (
    <section data-chapter={chapter.display_no} data-chapter-id={chapter.chapter_id} className="overflow-hidden rounded-lg border border-border bg-card">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
          className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-academy-label transition-transform motion-reduce:transition-none", open && "rotate-90")}
            aria-hidden="true"
          />
          <b className="min-w-0 flex-1 text-xs leading-snug font-bold text-foreground">
            Chương {chapter.display_no} · {chapter.title}
          </b>
          <span
            className="shrink-0 text-[11px] text-academy-subtle tabular-nums"
            aria-label={counts ? `${counts.done} trên ${total} bài đã hoàn thành` : `${total} bài`}
          >
            {counts ? counts.done : "—"}/{total}
          </span>
        </button>
      </h3>
      <ul id={listId} hidden={!open} className="m-0 list-none px-3 pb-1">
        {chapter.items.map((item) => (
          <ItemRow key={item.id} item={item} state={states.get(item.id)} current={currentItemId === item.id} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  )
}
