import { RotateCw, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

import type { AcademyConfigDraft } from "./academy-config-api"
import {
  ACADEMY_MODE_LABELS,
  chapterCountLabel,
  chapterLabel,
  lessonTotalLabel,
} from "./academy-config-format"
import { useAcademyConfigPreview } from "./academy-config-hooks"

function PreviewSkeleton() {
  return (
    <div role="status" aria-label="Đang tải bản xem trước" className="space-y-2">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-6 w-full" />
      ))}
    </div>
  )
}

/**
 * Xem trước: chương trình đúng như người dùng của nhóm sẽ thấy, do máy chủ đánh số lại từ 1
 * (spec §2). `live` là bản nháp đang gõ, `settled` là bản đã ngừng thay đổi và được gửi đi.
 * Cảnh báo chỉ nhắc, không bao giờ chặn lưu (spec §4).
 */
export function AcademyConfigPreviewPanel({ live, settled }: { live: AcademyConfigDraft; settled: AcademyConfigDraft }) {
  const preview = useAcademyConfigPreview(settled)
  const empty = live.chapter_ids.length === 0
  const refreshing = !empty && (live !== settled || preview.isFetching)
  const data = preview.data

  return (
    <section
      aria-label="Xem trước"
      aria-busy={refreshing}
      className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
    >
      <div>
        <h3 className="font-heading text-sm font-bold">Xem trước</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Chương đúng như người dùng của nhóm sẽ thấy, đã đánh số lại liên tục từ 1.
        </p>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">Chọn ít nhất một chương để xem trước.</p>
      ) : preview.isError ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">Không tải được bản xem trước: {errorMessage(preview.error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void preview.refetch()}>
            <RotateCw />
            Thử lại
          </Button>
        </div>
      ) : !data ? (
        <PreviewSkeleton />
      ) : (
        <div className={cn("space-y-3 transition-opacity", refreshing && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{ACADEMY_MODE_LABELS[data.mode]}</Badge>
            <span className="tabular-nums">
              {`${chapterCountLabel(data.chapter_count, data.chapter_total)} · ${lessonTotalLabel(data.required_total)}`}
            </span>
          </div>
          <ol className="divide-y divide-border rounded-md border border-border bg-card px-3">
            {data.chapters.map((chapter) => (
              <li key={chapter.chapter_id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{chapterLabel(chapter.display_no, chapter.title)}</p>
                  {chapter.has_practice && (
                    <p className="text-xs text-muted-foreground">Kèm Phòng tập thực chiến</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {chapter.lesson_count} bài
                </span>
              </li>
            ))}
          </ol>
          {data.warnings.map((warning) => (
            <Alert
              key={`${warning.code}-${warning.chapter_id}`}
              className="border-status-warning/45 bg-status-warning/10 text-status-warning"
            >
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{`Đã bỏ chương ${warning.title}`}</AlertTitle>
              <AlertDescription className="text-status-warning/90">{warning.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </section>
  )
}
