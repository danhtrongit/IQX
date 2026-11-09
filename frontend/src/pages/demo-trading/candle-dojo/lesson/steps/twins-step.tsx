import { useState } from "react"

import type { CdSide, CdTwin } from "@/lib/candle-dojo/grading"
import { cn } from "@/lib/utils"
import { CandleChart } from "../../candle-chart"
import { CD_CHART_COLORS } from "../../candle-chart-model"
import { ChartStage, GradingBar, GradingButton, StepHeading } from "../lesson-chrome"
import { LESSON_STEPS, recognisedName, twinSides, type LessonContent, type TwinPick } from "../lesson-model"

/** Bước 5 · Song sinh: 3 câu, mỗi câu hai biểu đồ, một có mẫu và một là biến thể gần giống. */
export function TwinsStep({ content, onFinish }: { content: LessonContent; onFinish: (picks: TwinPick[]) => void }) {
  const twins = content.exercises.twins
  const [index, setIndex] = useState(0)
  // Lựa chọn theo thứ tự câu; câu nào hiện nút "Câu tiếp" thì đã có lựa chọn, nên khi xong đủ 3 câu.
  const [picks, setPicks] = useState<TwinPick[]>([])
  const twin = twins[index]
  if (!twin) return null

  function choose(side: CdSide) {
    setPicks((current) => [...current.slice(0, index), side])
  }

  function next() {
    if (index + 1 < twins.length) {
      setIndex(index + 1)
      return
    }
    onFinish(picks)
  }

  return (
    <TwinQuestion
      key={index}
      twin={twin}
      cardName={content.mainCard.name}
      position={`${index + 1}/${twins.length}`}
      chosen={picks[index] ?? null}
      isLast={index + 1 === twins.length}
      onChoose={choose}
      onNext={next}
    />
  )
}

function TwinQuestion({
  twin,
  cardName,
  position,
  chosen,
  isLast,
  onChoose,
  onNext,
}: {
  twin: CdTwin
  cardName: string
  position: string
  chosen: CdSide | null
  isLast: boolean
  onChoose: (side: CdSide) => void
  onNext: () => void
}) {
  const revealed = chosen !== null
  const correct = chosen === twin.goodSide
  return (
    <>
      <div className="flex-1 pb-4">
        <StepHeading badge={`5 · ${LESSON_STEPS[4]}`} title={`Biểu đồ nào có ${cardName}? (${position})`} />
        <div className="grid gap-2 min-[900px]:grid-cols-2">
          {twinSides(twin).map(({ side, bars, patternBars, good }) => {
            const start = bars.length - patternBars
            const end = bars.length - 1
            return (
              <button
                key={side}
                type="button"
                disabled={revealed}
                onClick={() => onChoose(side)}
                aria-label={`Biểu đồ ${side.toUpperCase()}`}
                className={cn(
                  "flex flex-col items-center rounded-2xl border-2 border-border bg-card p-1.5 text-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  !revealed && "hover:border-primary/60",
                  revealed && good && "border-(--status-success)",
                  revealed && !good && side === chosen && "border-destructive",
                )}
              >
                <ChartStage className="w-full border-0 p-0">
                  <CandleChart
                    bars={bars}
                    height={160}
                    bands={[{ start, end, color: CD_CHART_COLORS.gold }]}
                    tags={
                      revealed
                        ? [
                            {
                              start,
                              end,
                              text: good ? cardName : recognisedName(twin.badName),
                              color: good ? CD_CHART_COLORS.up : CD_CHART_COLORS.down,
                            },
                          ]
                        : []
                    }
                    aria-label={`Biểu đồ ${side.toUpperCase()}${revealed ? (good ? `: có ${cardName}` : `: máy nhận ra ${recognisedName(twin.badName)}`) : ""}`}
                  />
                </ChartStage>
                <b className="mt-1 font-heading text-lg" aria-hidden="true">
                  {side.toUpperCase()}
                </b>
              </button>
            )
          })}
        </div>
      </div>
      {revealed ? (
        <GradingBar
          tone={correct ? "good" : "bad"}
          title={correct ? "Đúng!" : "Chưa đúng."}
          actions={<GradingButton onClick={onNext}>{isLast ? "Tiếp tục" : "Câu tiếp"}</GradingButton>}
        >
          {twin.why}
        </GradingBar>
      ) : null}
    </>
  )
}
