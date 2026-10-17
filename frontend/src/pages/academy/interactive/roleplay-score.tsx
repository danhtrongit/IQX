import { useId } from "react"

import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { InteractiveBlock } from "../content-types"
import { NotesStatusLine } from "./notes-status"
import { useLessonInteractive } from "./use-lesson-notes"

type RoleplayScoreData = Extract<InteractiveBlock, { type: "roleplay_score" }>

/**
 * The shared Slider draws a 12px white thumb on a 4px track, which reads as a disabled control on a
 * card. The score sliders are the block's main input: a thicker track and a filled azure thumb.
 */
const SCORE_SLIDER = cn(
  "py-2",
  "[&_[data-slot=slider-track]]:h-1.5!",
  "[&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-card [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:shadow-sm",
)

const BAND_TONE = { good: "text-(--status-success)", warn: "text-status-warning", bad: "text-destructive" } as const

/** The band of a total: the highest `min` the total reaches (48 good, 36 warn, 0 bad in the content). */
function bandOf(block: RoleplayScoreData, total: number) {
  return [...block.bands].sort((a, b) => b.min - a.min).find((band) => total >= band.min) ?? null
}

/**
 * "Chấm điểm đóng vai": six criteria scored 0..10, the total "t/60" and its band. The sliders start
 * at the content's default until the learner moves one; the six scores are saved to the account.
 */
export function RoleplayScore({ block }: { block: RoleplayScoreData }) {
  const { notes } = useLessonInteractive()
  const baseId = useId()
  const stored = notes.scores[block.id]
  const values = stored && stored.length === block.criteria.length ? stored : block.criteria.map(() => block.default)
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = block.max * block.criteria.length
  const band = bandOf(block, total)

  function setValue(index: number, value: number) {
    notes.setScores(
      block.id,
      values.map((current, position) => (position === index ? value : current)),
    )
  }

  return (
    <section
      aria-labelledby={block.title ? `${baseId}-title` : undefined}
      aria-label={block.title ? undefined : "Chấm điểm đóng vai"}
      className="my-4 rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      {block.title && (
        <h4 id={`${baseId}-title`} className="mb-3 font-heading text-base font-semibold text-foreground">
          {block.title}
        </h4>
      )}
      <ul className="m-0 list-none space-y-4 p-0">
        {block.criteria.map((criterion, index) => (
          <li key={index}>
            <div className="flex items-baseline justify-between gap-3">
              <span id={`${baseId}-c${index}`} className="text-sm font-medium text-foreground">
                {criterion.title}
              </span>
              <output
                htmlFor={`${baseId}-s${index}`}
                className="inline-flex min-w-12 shrink-0 items-baseline justify-center rounded-sm bg-primary/15 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums"
              >
                {values[index]}
                <span className="text-xs font-medium text-academy-subtle">/{block.max}</span>
              </output>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-academy-subtle">{criterion.hint}</p>
            {/* The shared Slider names its root, not its thumb: the group carries the criterion name. */}
            <div role="group" aria-labelledby={`${baseId}-c${index}`} className="mt-1.5">
              <Slider
                id={`${baseId}-s${index}`}
                min={0}
                max={block.max}
                step={1}
                value={[values[index]]}
                onValueChange={([value]) => setValue(index, value)}
                className={SCORE_SLIDER}
              />
              <div aria-hidden="true" className="flex justify-between text-[11px] text-academy-subtle tabular-nums">
                <span>0</span>
                <span>{block.max}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border bg-muted/40 p-3" aria-live="polite">
        <b className="font-heading text-xl text-foreground tabular-nums">
          {total}/{max}
        </b>
        {band && <span className={cn("text-sm font-semibold", BAND_TONE[band.tone])}>{band.label}</span>}
      </div>
      <NotesStatusLine blockId={block.id} />
    </section>
  )
}
