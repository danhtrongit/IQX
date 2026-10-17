import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, X } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { chooseScenario, type ItemResponse } from "../api"
import { InlineText } from "../blocks/inline-text"
import type { InteractiveBlock } from "../content-types"
import { academyKeys } from "../queries"
import { useLessonInteractive } from "./use-lesson-notes"

type ScenarioBlockData = Extract<InteractiveBlock, { type: "scenario" }>

/**
 * "Tình huống" of a chapter 2-3 lesson: three options, one choice per account (spec §2.3). The
 * choice is stored by the server first; only the accepted response marks the options (best option
 * with a check, a wrong pick with a cross), shows the debrief and opens the quiz gate. The scenario
 * is a teaching device: it is never scored.
 */
export function ScenarioBlock({ block }: { block: ScenarioBlockData }) {
  const { lesson } = useLessonInteractive()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const choose = useMutation({
    mutationFn: (choice: 0 | 1 | 2) => chooseScenario(lesson.id, choice),
    onSuccess: (stored) => {
      queryClient.setQueryData<ItemResponse>(academyKeys.item(user?.id, lesson.id), (current) =>
        current && current.kind !== "chapter_exam"
          ? { ...current, scenario_choice: { choice: stored.choice, chosen_at: stored.chosen_at } }
          : current,
      )
    },
  })

  const chosen = lesson.scenario_choice?.choice ?? null
  const decided = chosen !== null
  return (
    <section data-academy-scenario aria-labelledby={`scenario-${lesson.id}`} className="academy-scenario my-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h4 id={`scenario-${lesson.id}`} className="font-heading text-base font-semibold text-foreground">
        {block.title}
      </h4>
      <div className="mt-2 space-y-2 text-sm leading-6 text-foreground">
        {block.story.map((paragraph, index) => (
          <InlineText key={index} as="p" html={paragraph} />
        ))}
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{block.question}</p>
      <div role="group" aria-label={block.question} className="mt-2 grid gap-2">
        {block.options.map((option, index) => {
          const best = decided && index === block.best_option
          const wrongPick = decided && index === chosen && index !== block.best_option
          return (
            <button
              key={index}
              type="button"
              aria-pressed={chosen === index}
              disabled={decided || choose.isPending}
              onClick={() => choose.mutate(index as 0 | 1 | 2)}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2.5 text-left text-sm leading-6 text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default",
                best ? "border-(--status-success) bg-(--status-success)/10" : wrongPick ? "border-destructive bg-destructive/10" : "border-border",
                !decided && "hover:bg-muted/60",
              )}
            >
              {best && <Check className="mt-1 size-4 shrink-0 text-(--status-success)" aria-hidden="true" />}
              {wrongPick && <X className="mt-1 size-4 shrink-0 text-destructive" aria-hidden="true" />}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {option}
                {best && <span className="sr-only"> (cách tốt nhất)</span>}
                {wrongPick && <span className="sr-only"> (lựa chọn của bạn, chưa phải cách tốt nhất)</span>}
              </span>
            </button>
          )
        })}
      </div>
      {choose.isError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Chưa lưu được lựa chọn. {errorMessage(choose.error)}
        </p>
      )}
      {decided && (
        <div role="status" className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm leading-6 text-foreground">
          <InlineText as="p" html={block.debrief} />
        </div>
      )}
    </section>
  )
}
