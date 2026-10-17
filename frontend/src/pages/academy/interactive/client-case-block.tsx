import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { InlineText } from "../blocks/inline-text"
import type { InteractiveBlock } from "../content-types"
import { NotesStatusLine } from "./notes-status"
import { useLessonInteractive } from "./use-lesson-notes"

type PracticeCaseData = Extract<InteractiveBlock, { type: "practice_case" }>

/**
 * One client case of the practice room: the profile (information, mindset, what the client says),
 * "Bạn tự phân tích trước" with four prompts one per line (15px, foreground) and an answer saved to
 * the account, then "Xem gợi ý phân tích" to reveal the key points.
 */
export function ClientCaseBlock({ block }: { block: PracticeCaseData }) {
  const { notes } = useLessonInteractive()
  const baseId = useId()
  const [revealed, setRevealed] = useState(false)
  return (
    <section aria-labelledby={`${baseId}-title`} className="my-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h4 id={`${baseId}-title`} className="font-heading text-base font-semibold text-foreground">
        {block.title}
      </h4>
      <div className="mt-3 grid gap-3 min-[560px]:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold text-academy-subtle">Thông tin khách</p>
          <ul className="m-0 mt-1.5 list-disc space-y-1 pl-4 text-sm leading-6 text-foreground">
            {block.profile.info.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold text-academy-subtle">Tâm lý</p>
          <ul className="m-0 mt-1.5 list-disc space-y-1 pl-4 text-sm leading-6 text-foreground">
            {block.profile.mindset.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold text-academy-subtle">Câu thường nói</p>
          <p className="mt-1.5 text-sm leading-6 text-foreground italic">{block.profile.quote}</p>
        </div>
      </div>

      <h5 id={`${baseId}-pad`} className="mt-4 text-sm font-semibold text-foreground">
        {block.pad_title}
      </h5>
      <ul id={`${baseId}-prompts`} className="m-0 mt-2 list-none space-y-1 p-0">
        {block.prompts.map((prompt, index) => (
          <li key={index} className="text-[15px] leading-6 text-foreground">
            {prompt}
          </li>
        ))}
      </ul>
      <Textarea
        aria-labelledby={`${baseId}-pad`}
        aria-describedby={`${baseId}-prompts`}
        value={notes.texts[block.id] ?? ""}
        placeholder={block.placeholder}
        maxLength={4000}
        onChange={(event) => notes.setText(block.id, event.target.value)}
        className="mt-3 min-h-28 text-foreground placeholder:text-academy-label"
      />
      <NotesStatusLine blockId={block.id} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        aria-expanded={revealed}
        aria-controls={`${baseId}-hints`}
        onClick={() => setRevealed((value) => !value)}
      >
        <ChevronDown className={cn("transition-transform motion-reduce:transition-none", revealed && "rotate-180")} aria-hidden="true" />
        {revealed ? "Ẩn gợi ý" : "Xem gợi ý phân tích"}
      </Button>
      <dl id={`${baseId}-hints`} hidden={!revealed} className="m-0 mt-3 space-y-3">
        {block.hints.map((hint, index) => (
          <div key={index} className="rounded-md border border-border p-3">
            <dt className="text-sm font-semibold text-primary">{hint.term}</dt>
            <InlineText as="dd" html={hint.text} className="m-0 mt-1 text-sm leading-6 text-foreground" />
          </div>
        ))}
      </dl>
    </section>
  )
}
