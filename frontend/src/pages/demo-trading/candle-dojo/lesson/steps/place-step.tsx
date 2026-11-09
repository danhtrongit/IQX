import { useState } from "react"

import { cdCard } from "@/lib/candle-dojo/cards"
import type { CdChart, CdPlaceItem } from "@/lib/candle-dojo/grading"
import { cn } from "@/lib/utils"
import { CandleChart } from "../../candle-chart"
import { CD_CHART_COLORS } from "../../candle-chart-model"
import { ChartStage, GradingBar, GradingButton, StepHeading } from "../lesson-chrome"
import {
  LESSON_STEPS,
  PLACE_OPTIONS,
  placeFeedback,
  placePatternBars,
  recognisedName,
  type LessonContent,
  type PlaceAnswer,
} from "../lesson-model"

/** Bước 3 · Đúng chỗ: cùng một hình nến sau nhịp giảm và sau nhịp tăng; máy hiện tên nó nhận ra sau khi chọn. */
export function PlaceStep({ content, onFinish }: { content: LessonContent; onFinish: () => void }) {
  const items = content.exercises.place
  const [index, setIndex] = useState(0)
  const item = items[index]
  if (!item) return null
  return (
    <PlaceQuestion
      key={index}
      item={item}
      position={items.length > 1 ? `${index + 1}/${items.length}` : null}
      onNext={() => (index + 1 < items.length ? setIndex(index + 1) : onFinish())}
    />
  )
}

function PlaceQuestion({ item, position, onNext }: { item: CdPlaceItem; position: string | null; onNext: () => void }) {
  const [chosen, setChosen] = useState<PlaceAnswer | null>(null)
  const cardName = cdCard(item.card)?.name ?? item.card
  const revealed = chosen !== null
  const correct = chosen === item.ans

  return (
    <>
      <div className="flex-1 pb-4">
        <StepHeading
          badge={`3 · ${LESSON_STEPS[2]}${position ? ` · ${position}` : ""}`}
          title={`${cardName} xuất hiện ở đâu?`}
        />
        <div className="grid grid-cols-2 gap-2">
          <PlaceChart label="Sau nhịp giảm" chart={item.D} cardName={cardName} revealed={revealed} />
          <PlaceChart label="Sau nhịp tăng" chart={item.T} cardName={cardName} revealed={revealed} />
        </div>
        <div role="group" aria-label="Chọn nơi mẫu xuất hiện" className="mt-3 grid gap-2 min-[900px]:grid-cols-3">
          {PLACE_OPTIONS.map(({ answer, label }) => (
            <button
              key={answer}
              type="button"
              disabled={revealed}
              onClick={() => setChosen(answer)}
              className={cn(
                "min-h-12 rounded-xl border-2 border-border bg-card px-3 py-2.5 text-center text-base font-bold text-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                !revealed && "hover:border-primary/60 hover:bg-muted",
                revealed && answer === item.ans && "border-(--status-success) bg-(--status-success)/10",
                revealed && answer === chosen && answer !== item.ans && "border-destructive bg-destructive/10",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {revealed ? (
        <GradingBar tone={correct ? "good" : "bad"} title={correct ? "Chính xác!" : "Chưa đúng."} actions={<GradingButton onClick={onNext}>Tiếp tục</GradingButton>}>
          {placeFeedback(item, cardName)}
        </GradingBar>
      ) : null}
    </>
  )
}

function PlaceChart({ label, chart, cardName, revealed }: { label: string; chart: CdChart; cardName: string; revealed: boolean }) {
  const patternBars = placePatternBars(chart)
  const start = chart.bars.length - patternBars
  const end = chart.bars.length - 1
  const name = recognisedName(chart.name)
  return (
    <div>
      <ChartStage className="p-1">
        <CandleChart
          bars={chart.bars}
          height={170}
          bands={[{ start, end, color: CD_CHART_COLORS.gold }]}
          tags={revealed ? [{ start, end, text: name, color: chart.name === cardName ? CD_CHART_COLORS.up : CD_CHART_COLORS.ink2 }] : []}
          aria-label={`${label}: ${revealed ? `máy nhận ra ${name}` : "mẫu nến tô vàng"}`}
        />
      </ChartStage>
      <p className="mt-1 text-center text-xs font-bold text-foreground">{label}</p>
    </div>
  )
}
