import { Flame, LoaderCircle } from "lucide-react"

import { ApiError } from "@/lib/api"
import { useCompleteDojoDrill } from "../candle-dojo-api"
import { GradingBar, GradingButton, LessonFrame, LessonHeader } from "./lesson-chrome"
import { LessonGate } from "./lesson-gate"
import { formatXu, type LessonContent } from "./lesson-model"
import { HuntStep, type HuntOutcome } from "./steps/hunt-step"

export interface DrillPlayerProps {
  lessonId: string
  /** Chế độ xem trước: chạy ở máy khách, không gọi API, không nhận xu. */
  preview: boolean
  onExit: () => void
  /** Gọi khi người học đóng màn kết quả. */
  onFinished?: () => void
}

/**
 * Luyện công mỗi ngày (spec v1.2 §5.4): chỉ bước Săn nến của một bài đã học. Ở chế độ thật, khi hết giờ hoặc tìm
 * đủ mẫu thì gửi mọi chỗ đã chạm lên server; server chấm lại, cộng xu (mỗi ngày một lần) và giữ chuỗi ngày.
 */
export function DrillPlayer({ lessonId, preview, onExit, onFinished }: DrillPlayerProps) {
  return (
    <LessonGate lessonId={lessonId} preview={preview} total={1} onExit={onExit}>
      {(content) => <DrillRun key={lessonId} content={content} preview={preview} onExit={onExit} onFinished={onFinished} />}
    </LessonGate>
  )
}

function DrillRun({
  content,
  preview,
  onExit,
  onFinished,
}: {
  content: LessonContent
  preview: boolean
  onExit: () => void
  onFinished?: () => void
}) {
  const drill = useCompleteDojoDrill()
  const lessonId = content.lesson.id

  function send(taps: number[]) {
    drill.mutate({ lesson_id: lessonId, taps })
  }

  return (
    <LessonFrame>
      <div className="flex min-h-full flex-1 flex-col">
        <LessonHeader step={0} total={1} onExit={onExit} preview={preview} />
        <HuntStep
          content={content}
          badge="Luyện công mỗi ngày"
          onEnd={(taps) => {
            if (!preview) send(taps)
          }}
          renderBar={(outcome) => (
            <DrillBar
              outcome={outcome}
              preview={preview}
              drill={drill}
              onRetry={() => {
                if (drill.variables) send(drill.variables.taps)
              }}
              onDone={() => (onFinished ?? onExit)()}
              onLeave={onExit}
            />
          )}
        />
      </div>
    </LessonFrame>
  )
}

function DrillBar({
  outcome,
  preview,
  drill,
  onRetry,
  onDone,
  onLeave,
}: {
  outcome: HuntOutcome
  preview: boolean
  drill: ReturnType<typeof useCompleteDojoDrill>
  onRetry: () => void
  onDone: () => void
  onLeave: () => void
}) {
  const { result } = outcome
  const tone = result.star ? "good" : "bad"
  const score = `${result.found}/${result.total}`

  if (preview) {
    return (
      <GradingBar tone={tone} title={score} actions={<GradingButton onClick={onDone}>Về Dojo</GradingButton>}>
        Chế độ xem trước không nhận xu và không giữ chuỗi luyện công.
      </GradingBar>
    )
  }
  if (drill.isSuccess) {
    const data = drill.data
    const rewarded = data.reward_xu > 0
    return (
      <GradingBar
        tone={tone}
        title={rewarded ? `${data.found}/${data.total} · +${formatXu(data.reward_xu)}` : `${data.found}/${data.total}`}
        actions={<GradingButton onClick={onDone}>Về Dojo</GradingButton>}
      >
        <p>{rewarded ? "Đã giữ chuỗi luyện công." : "Hôm nay bạn đã nhận xu luyện công."}</p>
        <p className="mt-0.5 inline-flex items-center gap-1.5 font-bold">
          <Flame aria-hidden="true" className="size-4 text-amber-700 dark:text-chart-2" />
          Chuỗi luyện công: {data.streak_days} ngày
        </p>
      </GradingBar>
    )
  }
  if (drill.isError) {
    const message = drill.error instanceof ApiError && drill.error.message ? drill.error.message : "Kiểm tra kết nối rồi thử lại."
    return (
      <GradingBar
        tone="bad"
        title="Chưa ghi nhận được luyện công."
        actions={
          <>
            <GradingButton onClick={onRetry}>Thử lại</GradingButton>
            <GradingButton variant="outline" onClick={onLeave}>
              Thoát, không lưu
            </GradingButton>
          </>
        }
      >
        {message} Kết quả của bạn vẫn được giữ để gửi lại.
      </GradingBar>
    )
  }
  return (
    <GradingBar tone={tone} title={score} actions={<GradingButton disabled>Về Dojo</GradingButton>}>
      <span className="inline-flex items-center gap-2">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        Đang ghi nhận luyện công
      </span>
    </GradingBar>
  )
}
