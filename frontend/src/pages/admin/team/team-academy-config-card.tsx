import { useId } from "react"
import { Info, RotateCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import {
  ACADEMY_MODE_LABELS,
  chapterCountLabel,
  chapterLabel,
  lessonTotalLabel,
} from "@/pages/admin/academy/academy-config-format"

import type { TeamAcademyConfig } from "./api"

/**
 * Thẻ "Cấu hình Học viện của nhóm" trên Tổng quan của trưởng nhóm (Học viện v4.1 §1.3): chỉ xem,
 * không có điều khiển sửa nào. Danh sách chương dùng số đã đánh lại do máy chủ trả về, đúng như
 * người dùng của nhóm thấy.
 */
export function TeamAcademyConfigCard({
  config,
  loading,
  error,
  onRetry,
}: {
  config: TeamAcademyConfig | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  const titleId = useId()
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>Cấu hình Học viện của nhóm</CardTitle>
        <CardDescription>Cách học và các chương mà người dùng trong nhóm được học</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div role="status" aria-label="Đang tải cấu hình Học viện" className="space-y-2">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error || !config ? (
          <div className="space-y-2 py-4 text-center">
            <p className="text-sm text-destructive">
              {error ? errorMessage(error) : "Không tải được cấu hình Học viện của nhóm."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCw />
              Thử lại
            </Button>
          </div>
        ) : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Nguồn</dt>
                <dd>
                  <Badge variant={config.has_own_config ? "secondary" : "outline"}>
                    {config.has_own_config ? "Cấu hình riêng của nhóm" : "Theo mặc định"}
                  </Badge>
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Cách học</dt>
                <dd className="font-medium">{ACADEMY_MODE_LABELS[config.mode]}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Chương trình</dt>
                <dd className="font-medium tabular-nums">
                  {`${chapterCountLabel(config.chapter_count, config.chapter_total)} · ${lessonTotalLabel(config.required_total)}`}
                </dd>
              </div>
            </dl>
            <ol aria-label="Chương của nhóm" className="grid gap-x-6 sm:grid-cols-2">
              {config.chapters.map((chapter) => (
                <li
                  key={chapter.chapter_id}
                  className="flex items-start justify-between gap-3 border-b border-border py-2 text-sm"
                >
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
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <p className="flex gap-2">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>Chỉ quản trị viên mới thay đổi được cấu hình này.</span>
              </p>
              {config.updated_at && (
                <span className="tabular-nums">{`Cập nhật lần cuối ${formatDateTime(config.updated_at)}`}</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
