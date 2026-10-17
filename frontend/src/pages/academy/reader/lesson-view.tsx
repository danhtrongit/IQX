import { useEffect, useRef } from "react"
import { Check, Coins } from "lucide-react"

import { LESSON_REWARD_XU } from "../api"
import { BlockRenderer } from "../blocks/block-renderer"
import { InlineText } from "../blocks/inline-text"
import type { ItemLocation } from "../catalog-model"
import type { ItemState, LessonContent } from "../content-types"
import { renderInteractiveBlock } from "../interactive/interactive-block"
import { LessonInteractiveProvider } from "../interactive/lesson-interactive-context"
import { ItemPager } from "./item-pager"
import { LessonQuizGate } from "./lesson-quiz-gate"
import { SummaryList } from "./summary-list"

function StatusTags({ lesson }: { lesson: LessonContent }) {
  if (lesson.state !== "passed") return null
  const coins = lesson.reward?.status === "credited" ? lesson.reward.delta : lesson.reward?.status === "already_rewarded" ? LESSON_REWARD_XU : null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-sm border border-(--status-success)/50 bg-(--status-success)/10 px-2 py-0.5 text-xs font-semibold text-(--status-success)">
        <Check className="size-3" aria-hidden="true" />
        Đã hoàn thành
      </span>
      {coins !== null && (
        <span className="inline-flex items-center gap-1 rounded-sm border border-chart-2/60 bg-chart-2/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-chart-2">
          <Coins className="size-3" aria-hidden="true" />
          Đã nhận {coins} xu
        </span>
      )}
    </div>
  )
}

/**
 * A lesson or the practice room: title, lead and status, the typed blocks of every section (the
 * interactive ones through `renderInteractiveBlock`), "Tóm tắt", the quiz gate and the pager over
 * the flat learning chain.
 */
export function LessonView({
  lesson,
  location,
  states,
  onStartQuiz,
  onOpen,
}: {
  lesson: LessonContent
  location: ItemLocation | null
  states: ReadonlyMap<string, ItemState>
  onStartQuiz: () => void
  onOpen: (itemId: string) => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <LessonInteractiveProvider lesson={lesson}>
      <header className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2
          id="academy-reader-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl leading-tight font-bold text-foreground outline-none sm:text-[28px]"
        >
          {lesson.title}
        </h2>
        {lesson.lead && <InlineText as="p" html={lesson.lead} className="mt-3 block max-w-[70ch] text-sm leading-7 text-foreground" />}
        <StatusTags lesson={lesson} />
      </header>

      {lesson.intro_blocks.length > 0 && (
        <div className="mt-3 min-w-0 rounded-lg border border-border bg-card p-4 sm:p-6">
          <BlockRenderer blocks={lesson.intro_blocks} charts={lesson.charts} renderInteractive={renderInteractiveBlock} />
        </div>
      )}

      {lesson.sections.map((section, index) => (
        <section
          key={section.id}
          id={`academy-section-${index + 1}`}
          aria-labelledby={`academy-section-title-${index + 1}`}
          className="mt-3 min-w-0 scroll-mt-3 rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          <h3 id={`academy-section-title-${index + 1}`} className="mb-4 border-b border-border pb-3 font-heading text-lg font-semibold text-foreground">
            {section.title}
          </h3>
          <BlockRenderer blocks={section.blocks} charts={lesson.charts} renderInteractive={renderInteractiveBlock} />
        </section>
      ))}

      <SummaryList items={lesson.summary} />
      <LessonQuizGate lesson={lesson} onStart={onStartQuiz} />
      <ItemPager prev={location?.prev ?? null} next={location?.next ?? null} states={states} onOpen={onOpen} />
    </LessonInteractiveProvider>
  )
}
