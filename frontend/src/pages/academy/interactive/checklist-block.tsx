import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { InteractiveBlock } from "../content-types"
import { NotesStatusLine } from "./notes-status"
import { useLessonInteractive } from "./use-lesson-notes"

type ChecklistBlockData = Extract<InteractiveBlock, { type: "checklist" }>

/**
 * "Việc làm ngay" (todo) and "Tự kiểm tra" (self_check, with "{result_label}: x/N"). Every tick is
 * saved to the account under `${id}:${item.id}`; it never changes progress.
 */
export function ChecklistBlock({ block }: { block: ChecklistBlockData }) {
  const { notes } = useLessonInteractive()
  const baseId = useId()
  const done = block.items.filter((item) => notes.checks[`${block.id}:${item.id}`]).length
  return (
    <section aria-labelledby={`${baseId}-title`} className="my-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={`${baseId}-title`} className="font-heading text-base font-semibold text-foreground">
          {block.title}
        </h4>
        {block.mode === "self_check" && (
          <span aria-live="polite" className="text-sm font-semibold text-foreground tabular-nums">
            {block.result_label ?? "Số mục đã đạt"}: {done}/{block.items.length}
          </span>
        )}
      </div>
      <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
        {block.items.map((item) => {
          const key = `${block.id}:${item.id}`
          const checked = notes.checks[key] === true
          const inputId = `${baseId}-${item.id}`
          return (
            <li key={item.id} className="flex items-start gap-2.5">
              <Checkbox id={inputId} checked={checked} onCheckedChange={(value) => notes.setCheck(key, value === true)} className="mt-1" />
              <label htmlFor={inputId} className={cn("cursor-pointer text-sm leading-6", checked ? "text-(--status-success)" : "text-foreground")}>
                {item.text}
              </label>
            </li>
          )
        })}
      </ul>
      <NotesStatusLine blockId={block.id} />
    </section>
  )
}
