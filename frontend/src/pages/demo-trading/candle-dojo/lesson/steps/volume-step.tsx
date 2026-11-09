import { useEffect, useState } from "react"

import type { CdSide } from "@/lib/candle-dojo/grading"
import { cn } from "@/lib/utils"
import { CandleChart } from "../../candle-chart"
import { CD_CHART_COLORS } from "../../candle-chart-model"
import { ChartStage, GradingBar, GradingButton, StepHeading } from "../lesson-chrome"
import { LESSON_STEPS, volumeView, type LessonContent } from "../lesson-model"
import { usePrefersReducedMotion } from "../use-reduced-motion"

/** Chờ biểu đồ chạy xong 6 phiên rồi mới hiện lời giải thích (ms). */
const FEEDBACK_DELAY_MS = 800

/**
 * Bước 6 · Rồi sao?: hai lần cùng mẫu, khối lượng lớn và nhỏ. Chọn lần đáng tin thì biểu đồ chạy tiếp 6 phiên.
 * Mẫu trung tính (Doji, Inside Bar) thì so hai cú bứt phá. Bước này không tính sao và không gửi lên server.
 */
export function VolumeStep({ content, onFinish }: { content: LessonContent; onFinish: () => void }) {
  const view = volumeView(content)
  const reduced = usePrefersReducedMotion()
  const [chosen, setChosen] = useState<CdSide | null>(null)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!chosen || reduced) return
    const timer = setTimeout(() => setSettled(true), FEEDBACK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [chosen, reduced])

  const revealed = chosen !== null
  const showFeedback = revealed && (reduced || settled)
  const correct = view.sides.find((side) => side.side === chosen)?.trusted === true

  return (
    <>
      <div className="flex-1 pb-4">
        <StepHeading badge={`6 · ${LESSON_STEPS[5]}`} title={view.question} />
        <div className="grid gap-2 min-[900px]:grid-cols-2">
          {view.sides.map(({ side, bars, trusted }) => (
            <button
              key={side}
              type="button"
              disabled={revealed}
              onClick={() => setChosen(side)}
              aria-label={`Biểu đồ ${side.toUpperCase()}`}
              className={cn(
                "flex flex-col items-center rounded-2xl border-2 border-border bg-card p-1.5 text-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                !revealed && "hover:border-primary/60",
                revealed && trusted && "border-(--status-success)",
                revealed && !trusted && side === chosen && "border-destructive",
              )}
            >
              <ChartStage className="w-full border-0 p-0">
                <CandleChart
                  bars={revealed ? bars : bars.slice(0, view.cut)}
                  slots={bars.length}
                  height={190}
                  volume
                  bands={[{ start: view.bandStart, end: view.bandEnd, color: CD_CHART_COLORS.gold }]}
                  fadeFrom={revealed && !reduced ? view.cut : undefined}
                  aria-label={`Biểu đồ ${side.toUpperCase()}: khối lượng ở vùng tô vàng`}
                />
              </ChartStage>
              <b className="mt-1 font-heading text-lg" aria-hidden="true">
                {side.toUpperCase()}
              </b>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-sm font-bold text-foreground">Nhìn cột khối lượng ở vùng tô vàng.</p>
      </div>
      {showFeedback ? (
        <GradingBar
          tone={correct ? "good" : "bad"}
          title={correct ? "Chuẩn!" : "Nhìn lại khối lượng."}
          actions={<GradingButton onClick={onFinish}>Tiếp tục</GradingButton>}
        >
          {view.explanation}
        </GradingBar>
      ) : null}
    </>
  )
}
