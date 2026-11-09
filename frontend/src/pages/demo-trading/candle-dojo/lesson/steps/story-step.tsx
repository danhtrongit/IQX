import { useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CandleChart } from "../../candle-chart"
import { CD_CHART_COLORS } from "../../candle-chart-model"
import { ChartStage, GradingBar, GradingButton, StepHeading } from "../lesson-chrome"
import {
  advanceStory,
  cardTagColor,
  captionAt,
  LESSON_STEPS,
  STORY_DONE,
  STORY_START,
  storyFrame,
  type LessonContent,
  type StoryState,
} from "../lesson-model"
import { usePrefersReducedMotion } from "../use-reduced-motion"

/** Bước 2 · Câu chuyện: nến bối cảnh hiện lần lượt, từng nến của mẫu hình thành, cuối cùng tô vàng và gắn tên. */
export function StoryStep({ content, onContinue }: { content: LessonContent; onContinue: () => void }) {
  const [round, setRound] = useState(0)
  return <StoryPlayback key={round} content={content} onContinue={onContinue} onReplay={() => setRound((value) => value + 1)} />
}

function StoryPlayback({ content, onContinue, onReplay }: { content: LessonContent; onContinue: () => void; onReplay: () => void }) {
  const { lesson, mainCard, exercises } = content
  const all = exercises.story
  const patternBars = lesson.patternBars
  const contextCount = all.length - patternBars
  const reduced = usePrefersReducedMotion()
  const [state, setState] = useState<StoryState>(() => (reduced ? STORY_DONE : STORY_START))

  useEffect(() => {
    const step = advanceStory(state, contextCount, patternBars)
    if (!step) return
    const timer = setTimeout(() => setState(step.next), step.delay)
    return () => clearTimeout(timer)
  }, [state, contextCount, patternBars])

  const done = state.stage === "done"
  const frame = storyFrame(all, patternBars, state)
  const lastCaption = lesson.captions.length - 1

  return (
    <>
      <div className="flex-1 pb-4">
        <StepHeading badge={`2 · ${LESSON_STEPS[1]}`} title="Mẫu này xuất hiện như thế nào?" />
        <ChartStage>
          <CandleChart
            bars={frame.bars}
            slots={all.length + 2}
            height={230}
            volume
            bands={done ? [{ start: contextCount, end: all.length - 1, color: CD_CHART_COLORS.gold }] : []}
            tags={done ? [{ start: contextCount, end: all.length - 1, text: mainCard.name, color: cardTagColor(mainCard) }] : []}
            aria-label={`Biểu đồ nến: ${lesson.title} hình thành từng nến`}
          />
        </ChartStage>
        {done && reduced ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm font-semibold text-foreground">
            {lesson.captions.map((caption) => (
              <li key={caption}>{caption}</li>
            ))}
          </ol>
        ) : (
          <p aria-live="polite" className="mt-3 min-h-11 text-center text-base font-bold text-foreground">
            {captionAt(lesson.captions, done ? lastCaption : frame.caption)}
          </p>
        )}
      </div>
      {done ? (
        <GradingBar
          actions={
            <>
              <Button type="button" variant="outline" className="h-11 w-full gap-1.5 font-bold min-[900px]:w-auto" onClick={onReplay}>
                <RotateCcw aria-hidden="true" />
                Xem lại
              </Button>
              <GradingButton onClick={onContinue}>Tiếp tục</GradingButton>
            </>
          }
        />
      ) : null}
    </>
  )
}
