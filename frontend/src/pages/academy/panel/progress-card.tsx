import { Button } from "@/components/ui/button"
import type { ProgressResponse } from "../content-types"

/**
 * "Tiến độ học tập x / N": required lessons of the published chapters passed (exams and the
 * optional practice room are not counted). Never shows a fake 0 while progress is unknown.
 */
export function ProgressCard({
  progress,
  total,
  failed,
  loading,
  onRetry,
}: {
  progress: ProgressResponse | undefined
  total: number
  failed: boolean
  loading: boolean
  onRetry: () => void
}) {
  const max = progress?.course_total ?? total
  const done = progress?.course_done
  return (
    <section aria-label="Tiến độ học tập" className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-academy-subtle">Tiến độ học tập</span>
        <b className="text-primary tabular-nums">{done === undefined ? "—" : `${done} / ${max}`}</b>
      </div>
      <div
        role="progressbar"
        aria-label="Tiến độ học tập"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={done}
        aria-valuetext={done === undefined ? "Chưa có tiến độ" : `${done} trên ${max} bài`}
        className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted"
      >
        <i className="block h-full bg-primary" style={{ width: done === undefined || max === 0 ? 0 : `${Math.min(100, (done / max) * 100)}%` }} />
      </div>
      {done === undefined && loading && !failed && (
        <p role="status" className="mt-2 text-xs text-academy-subtle">
          Đang tải tiến độ…
        </p>
      )}
      {failed && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
          <span>{done === undefined ? "Chưa tải được tiến độ." : "Chưa làm mới được tiến độ."}</span>
          <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      )}
    </section>
  )
}
