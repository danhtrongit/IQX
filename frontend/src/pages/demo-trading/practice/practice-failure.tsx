import { CircleAlert } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PRACTICE_INDICATORS, lessonLink, type PracticeFailure } from "./practice-api"

/**
 * One place that explains a practice failure: not learned yet (with the lesson link), data not
 * available, compute failed (retry keeps the locked config), stale tab, invalid input.
 */
export function PracticeFailureNotice({
  failure,
  indicatorId,
  onRetry,
  retryLabel = "Thử lại",
  className,
}: {
  failure: PracticeFailure
  indicatorId: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  const name = PRACTICE_INDICATORS[indicatorId]?.name ?? indicatorId
  const lesson = lessonLink(indicatorId)
  const retryable = failure.kind === "data_unavailable" || failure.kind === "compute_failed" || failure.kind === "network" || failure.kind === "unknown"
  return (
    <div
      role="alert"
      data-failure={failure.kind}
      className={cn("space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed", className)}
    >
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          {failure.kind === "not_granted" ? (
            <>
              <p className="font-medium">Bạn chưa mở khóa chỉ báo {name}.</p>
              <p className="text-muted-foreground">
                Hoàn thành bài học {name} (đúng 8/8 câu) để được luyện tập chỉ báo này.
              </p>
            </>
          ) : failure.kind === "not_found" ? (
            <p className="font-medium">Chỉ báo này không có trong bộ luyện tập.</p>
          ) : failure.kind === "stale" ? (
            <>
              <p className="font-medium">Tiến trình đã thay đổi ở nơi khác.</p>
              <p className="text-muted-foreground">Tải lại để tiếp tục từ trạng thái mới nhất.</p>
            </>
          ) : failure.kind === "set_completed" ? (
            <p className="font-medium">Bạn đã hoàn thành cả 30 tình huống của bộ này.</p>
          ) : (
            <p className="font-medium">{failure.message}</p>
          )}
          {failure.kind === "invalid" && failure.details.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {failure.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
        {failure.kind === "not_granted" && lesson && (
          <Button asChild size="sm">
            <Link to={lesson}>Học bài {name}</Link>
          </Button>
        )}
        {retryable && onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {failure.kind === "stale" && onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Tải lại
          </Button>
        )}
      </div>
    </div>
  )
}
