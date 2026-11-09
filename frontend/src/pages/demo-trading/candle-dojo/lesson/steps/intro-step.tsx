import { CandleCard } from "../../candle-card"
import { CandleChart } from "../../candle-chart"
import { ChartStage, GradingBar, GradingButton, StepHeading } from "../lesson-chrome"
import { introView, LESSON_STEPS, rangeOf, type LessonContent } from "../lesson-model"

/** Bước 1 · Giới thiệu: thẻ của bài, 6 nến bối cảnh mờ, mẫu tô vàng (đánh số nếu nhiều nến) và các đặc điểm. */
export function IntroStep({ content, onContinue }: { content: LessonContent; onContinue: () => void }) {
  const { lesson, cards, exercises } = content
  const { bars, contextCount } = introView(exercises.story, lesson.patternBars)
  return (
    <>
      <div className="flex-1 pb-4">
        <StepHeading badge={`1 · ${LESSON_STEPS[0]}`} title={lesson.title} />
        <div className="mb-3 flex justify-center gap-3">
          {cards.map((card) => (
            <CandleCard key={card.id} card={card} width={110} />
          ))}
        </div>
        <ChartStage>
          <CandleChart
            bars={bars}
            height={200}
            dimTo={contextCount}
            bands={[{ start: contextCount, end: bars.length - 1 }]}
            nums={lesson.patternBars > 1 ? rangeOf(lesson.patternBars, contextCount) : []}
            aria-label={`Biểu đồ nến: mẫu ${lesson.title} tô vàng sau ${contextCount} nến bối cảnh`}
          />
        </ChartStage>
        <ul className="mt-3 flex flex-wrap justify-center gap-1.5" aria-label="Đặc điểm của mẫu">
          {lesson.features.map((feature) => (
            <li key={feature} className="rounded-full border border-border bg-card px-2.5 py-1 text-sm font-semibold text-foreground">
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <GradingBar actions={<GradingButton onClick={onContinue}>Tiếp tục</GradingButton>} />
    </>
  )
}
