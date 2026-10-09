import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { completeGuide, isVersionConflict, LESSON_REWARD_XU, newRequestId, type AcademyGuideResult, type AcademyLesson } from "./api"
import { academyKeys, invalidateAfterCompletion } from "./queries"
import { creditedText, PENDING_COINS_TEXT, RECEIVED_TEXT } from "./quiz/quiz-copy"
import { clearGuideRequestId, loadGuideRequestId, saveGuideRequestId } from "./view-state"

/**
 * "Hoàn thành bài học" of a guide lesson. Reading, scrolling and zooming never complete it; the
 * learner presses the button, the server records the completion once (a retry carries the same
 * request id, so it is a replay, not a second completion) and answers with the committed state.
 * Nothing is shown as done before that answer.
 */
export function GuideCompletion({ lesson, onReload }: { lesson: AcademyLesson; onReload: () => void }) {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const [requestId] = useState(() => loadGuideRequestId(userId, lesson.id) ?? newRequestId())

  const mutation = useMutation<AcademyGuideResult, unknown, void>({
    mutationFn: () => {
      saveGuideRequestId(userId, lesson.id, requestId)
      return completeGuide(lesson.id, {
        catalog_version: lesson.catalog_version,
        content_version: lesson.content_version ?? "",
        request_id: requestId,
      })
    },
    onSuccess: (response) => {
      clearGuideRequestId(userId, lesson.id)
      // The committed answer replaces what the lesson header shows right away; the rest is re-read.
      queryClient.setQueryData<AcademyLesson>(academyKeys.lesson(userId, lesson.id), (previous) =>
        previous && {
          ...previous,
          completed: response.completion.completed,
          completion_method: response.completion.completion_method,
          completed_at: response.completion.completed_at,
          reward: response.reward ?? previous.reward,
        },
      )
      invalidateAfterCompletion(queryClient)
      const reward = response.reward
      if (!response.completion.newly_completed) toast("Bài đã được ghi nhận. Không cộng thêm tiến độ hoặc xu.")
      else if (reward?.status === "credited") toast.success(creditedText(reward.delta))
      else if (reward?.status === "unavailable") toast(PENDING_COINS_TEXT)
      else toast.success("Đã ghi nhận bài học.")
    },
  })

  const completed = lesson.completed || mutation.isSuccess
  const reward = mutation.data?.reward ?? lesson.reward
  const coinLine =
    reward?.status === "credited" || reward?.status === "already_rewarded"
      ? RECEIVED_TEXT
      : reward?.status === "unavailable" && completed
        ? PENDING_COINS_TEXT
        : null
  const label = lesson.completion.button_label ?? "Hoàn thành bài học"

  return (
    <section aria-label={label} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div role="status" aria-live="polite" className="min-w-0 text-sm">
        {completed ? (
          <>
            <b className="block">Đã hoàn thành bài học</b>
            {coinLine && <small className="mt-0.5 block text-muted-foreground">{coinLine}</small>}
          </>
        ) : (
          <>
            <b className="block">{label}</b>
            <small className="mt-0.5 block text-muted-foreground">Lần đầu · +{LESSON_REWARD_XU} xu</small>
          </>
        )}
      </div>
      <Button
        type="button"
        disabled={mutation.isPending || completed}
        onClick={() => mutation.mutate()}
        className={cn("min-h-9 max-[480px]:w-full", completed && "disabled:opacity-100")}
        variant={completed ? "outline" : "default"}
      >
        {mutation.isPending && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {completed && <Check aria-hidden="true" />}
        {mutation.isPending ? "Đang ghi nhận…" : completed ? "Đã hoàn thành" : label}
      </Button>
      {mutation.isError && !completed && (
        <div role="alert" className="flex w-full flex-wrap items-center gap-3 text-sm text-destructive">
          <p>Chưa ghi nhận được hoàn thành. Vui lòng thử lại.</p>
          {isVersionConflict(mutation.error) && (
            <Button type="button" variant="outline" size="sm" onClick={onReload}>
              Tải lại bài học
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
