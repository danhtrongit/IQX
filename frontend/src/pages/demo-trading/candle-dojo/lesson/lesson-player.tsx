import { useEffect, useRef, useState } from "react"

import { useCompleteDojoLesson } from "../candle-dojo-api"
import { GradingBar, GradingButton, LessonFrame, LessonHeader } from "./lesson-chrome"
import { LessonGate } from "./lesson-gate"
import { gradeLessonLocally, huntMessage, LESSON_STEP_COUNT, type LessonContent, type TwinPick } from "./lesson-model"
import { LessonResult, type LessonSubmitState } from "./lesson-result"
import { HuntStep } from "./steps/hunt-step"
import { IntroStep } from "./steps/intro-step"
import { PlaceStep } from "./steps/place-step"
import { StoryStep } from "./steps/story-step"
import { TwinsStep } from "./steps/twins-step"
import { VolumeStep } from "./steps/volume-step"

export interface LessonPlayerProps {
  lessonId: string
  /** Chế độ xem trước: chạy hoàn toàn ở máy khách, không gọi API, không lưu tiến độ, không thưởng xu. */
  preview: boolean
  /** Thoát (nút ✕): không lưu tiến độ bài đang học. */
  onExit: () => void
  /** Gọi khi người học đóng màn kết thúc bài (sau khi server đã ghi nhận ở chế độ thật). */
  onFinished?: () => void
}

/**
 * Màn học một bài, 6 bước (spec v1.2 §5.1): Giới thiệu, Câu chuyện, Đúng chỗ, Săn nến, Song sinh, Rồi sao?, rồi
 * màn kết thúc. Ở chế độ thật, đi hết bước 6 mới gửi chỗ đã chạm và các lựa chọn Song sinh lên server; server
 * chấm lại và quyết định sao, xu và thẻ. Thoát giữa chừng thì không gửi gì.
 */
export function LessonPlayer({ lessonId, preview, onExit, onFinished }: LessonPlayerProps) {
  return (
    <LessonGate lessonId={lessonId} preview={preview} total={LESSON_STEP_COUNT} onExit={onExit}>
      {(content) => <LessonRun key={lessonId} content={content} preview={preview} onExit={onExit} onFinished={onFinished} />}
    </LessonGate>
  )
}

const RESULT_STEP = LESSON_STEP_COUNT
const NO_TAPS: number[] = []

function LessonRun({
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
  const lessonId = content.lesson.id
  const [step, setStep] = useState(0)
  const [taps, setTaps] = useState<number[]>(NO_TAPS)
  const [picks, setPicks] = useState<TwinPick[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const submit = useCompleteDojoLesson()

  // Sang bước mới thì cuộn về đầu để người học thấy tiêu đề.
  useEffect(() => {
    if (step === 0) return
    const node = rootRef.current
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "start" })
  }, [step])

  function send(variables: Parameters<typeof submit.mutate>[0]) {
    submit.mutate(variables)
  }

  function finish() {
    setStep(RESULT_STEP)
    if (!preview) send({ lessonId, hunt: { taps }, twins: picks })
  }

  const submitState: LessonSubmitState = submit.isSuccess
    ? { status: "success", data: submit.data }
    : submit.isError
      ? { status: "error", error: submit.error }
      : submit.isPending
        ? { status: "pending" }
        : { status: "idle" }

  return (
    <LessonFrame>
      <div ref={rootRef} className="flex min-h-full flex-1 flex-col">
        {step < RESULT_STEP ? <LessonHeader step={step} total={LESSON_STEP_COUNT} onExit={onExit} preview={preview} /> : null}
        {step === 0 ? <IntroStep content={content} onContinue={() => setStep(1)} /> : null}
        {step === 1 ? <StoryStep content={content} onContinue={() => setStep(2)} /> : null}
        {step === 2 ? <PlaceStep content={content} onFinish={() => setStep(3)} /> : null}
        {step === 3 ? (
          <HuntStep
            content={content}
            badge="4 · Săn nến"
            onEnd={setTaps}
            renderBar={({ result }) => (
              <GradingBar
                tone={result.star ? "good" : "bad"}
                title={huntMessage(result)}
                actions={<GradingButton onClick={() => setStep(4)}>Tiếp tục</GradingButton>}
              >
                {result.star ? "Đạt sao Săn nến." : "Tìm đủ và nhầm tối đa 1 lần để đạt sao."}
              </GradingBar>
            )}
          />
        ) : null}
        {step === 4 ? (
          <TwinsStep
            content={content}
            onFinish={(chosen) => {
              setPicks(chosen)
              setStep(5)
            }}
          />
        ) : null}
        {step === 5 ? <VolumeStep content={content} onFinish={finish} /> : null}
        {step === RESULT_STEP ? (
          <LessonResult
            content={content}
            preview={preview}
            local={gradeLessonLocally(content.exercises, taps, picks)}
            submit={submitState}
            onRetry={() => {
              if (submit.variables) send(submit.variables)
            }}
            onDiscard={onExit}
            onDone={() => (onFinished ?? onExit)()}
          />
        ) : null}
      </div>
    </LessonFrame>
  )
}
