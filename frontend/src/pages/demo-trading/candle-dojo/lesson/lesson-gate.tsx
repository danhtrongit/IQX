import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LessonFrame, LessonHeader } from "./lesson-chrome"
import type { LessonContent } from "./lesson-model"
import { useLessonContent } from "./use-lesson-content"

/** Tải nội dung bài rồi mới dựng màn học; có khung chờ, lỗi tải kèm thử lại và thoát. */
export function LessonGate({
  lessonId,
  preview,
  total,
  onExit,
  children,
}: {
  lessonId: string
  preview: boolean
  /** Số đoạn của thanh tiến độ khi chưa có nội dung. */
  total: number
  onExit: () => void
  children: (content: LessonContent) => ReactNode
}) {
  const state = useLessonContent(lessonId)
  if (state.status === "ready") return <>{children(state.content)}</>
  return (
    <LessonFrame>
      <LessonHeader step={0} total={total} onExit={onExit} preview={preview} />
      {state.status === "loading" ? (
        <div role="status" aria-label="Đang tải bài học" className="space-y-3">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-4 text-foreground">
          <p className="font-heading text-lg font-bold">
            {state.status === "missing" ? "Không tìm thấy bài học này." : "Chưa tải được nội dung bài học."}
          </p>
          <div className="flex flex-wrap gap-2">
            {state.status === "error" ? (
              <Button type="button" onClick={state.retry}>
                Thử lại
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onExit}>
              Thoát
            </Button>
          </div>
        </div>
      )}
    </LessonFrame>
  )
}
