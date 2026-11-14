/** Danh sách bình luận bị báo cáo (còn hiển thị) với nút Ẩn; dùng cho quản trị và cho SACO tác giả. */
import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatVnDateTime } from "@/pages/trading-floor/posts/format"

import type { CommentReport } from "./api"

export type ReportsState = { items: CommentReport[] | undefined; isPending: boolean; error: unknown; refetch: () => void }

export function ReportedComments({ title, state, onHide, hidePending, showHeadline = true }: {
  title: string
  state: ReportsState
  onHide: (report: CommentReport) => void
  hidePending: boolean
  showHeadline?: boolean
}) {
  const items = state.items ?? []
  return <section className="space-y-2" aria-labelledby="reported-comments-title">
    <h2 id="reported-comments-title" className="text-sm font-semibold">{title}{state.items ? ` (${items.length})` : ""}</h2>
    {state.error ? <PanelState title="Không tải được bình luận bị báo cáo" description={errorMessage(state.error)} action={{ label: "Thử lại", onClick: state.refetch }} />
      : state.isPending ? <div className="space-y-2" role="status" aria-label="Đang tải bình luận bị báo cáo"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      : items.length === 0 ? <p className="text-xs text-muted-foreground">Không có bình luận nào đang bị báo cáo.</p>
      : <Card className="gap-0 divide-y divide-border py-0">
        {items.map((report) => <div key={report.commentId} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{report.authorName}</span>
              {" · "}<span className="tabular-nums">{formatVnDateTime(report.at)}</span>
              {" · "}<span className="font-medium text-status-warning">{report.reports} báo cáo</span>
            </p>
            <p className="text-sm whitespace-pre-wrap break-words">{report.text}</p>
            {showHeadline && <p className="truncate text-[11px] text-muted-foreground">Bài: {report.headline} · {report.sacoName}</p>}
          </div>
          <Button type="button" variant="destructive" size="xs" disabled={hidePending} onClick={() => onHide(report)}>Ẩn</Button>
        </div>)}
      </Card>}
  </section>
}
