import { useId } from "react"

import { Textarea } from "@/components/ui/textarea"
import type { InteractiveBlock } from "../content-types"
import { NotesStatusLine } from "./notes-status"
import { useLessonInteractive } from "./use-lesson-notes"

type WorkpadBlockData = Extract<InteractiveBlock, { type: "workpad" }>

/** "Bài tự làm": the prompts one per line (15px, foreground) and a text area saved to the account. */
export function WorkpadBlock({ block }: { block: WorkpadBlockData }) {
  const { notes } = useLessonInteractive()
  const baseId = useId()
  return (
    <section aria-labelledby={`${baseId}-title`} className="my-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h4 id={`${baseId}-title`} className="font-heading text-base font-semibold text-foreground">
        {block.title}
      </h4>
      {block.prompts.length > 0 && (
        <ul id={`${baseId}-prompts`} className="m-0 mt-2 list-none space-y-1 p-0">
          {block.prompts.map((prompt, index) => (
            <li key={index} className="text-[15px] leading-6 text-foreground">
              {prompt}
            </li>
          ))}
        </ul>
      )}
      <Textarea
        aria-labelledby={`${baseId}-title`}
        aria-describedby={block.prompts.length > 0 ? `${baseId}-prompts` : undefined}
        value={notes.texts[block.id] ?? ""}
        placeholder={block.placeholder}
        maxLength={4000}
        onChange={(event) => notes.setText(block.id, event.target.value)}
        className="mt-3 min-h-28 text-foreground placeholder:text-academy-label"
      />
      <NotesStatusLine blockId={block.id} />
    </section>
  )
}
