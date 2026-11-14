/**
 * Thẻ "Nhận định": bài đã đăng và đã ẩn trong phạm vi (quản trị viên: mọi nhóm; trưởng nhóm:
 * nhóm mình). Ẩn có xác nhận, Bỏ ẩn chỉ quản trị viên. Bên dưới là bình luận bị báo cáo.
 */
import { useState } from "react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { useConfirmDialog } from "@/pages/admin/core/components/use-confirm-dialog"
import { StatusBadge, TableLoadingRows, TableNoticeRow } from "@/pages/admin/revenue/ui"
import { formatVnDateTime } from "@/pages/trading-floor/posts/format"

import type { ManagePost } from "./api"
import { useCommentReports, useHidePost, useHideReportedComment, useManagePost, useManagePosts, useUnhidePost } from "./hooks"
import { actorRoleLabel, POST_STATUS, postLogAction } from "./labels"
import { PostPreviewBody, PostPreviewDialog } from "./post-preview"
import { ReportedComments } from "./reported-comments"

const COLS = 9

export function SacoPostsTab({ isAdmin }: { isAdmin: boolean }) {
  const posts = useManagePosts()
  const reports = useCommentReports()
  const hide = useHidePost()
  const unhide = useUnhidePost()
  const hideComment = useHideReportedComment()
  const confirm = useConfirmDialog()
  const [viewing, setViewing] = useState<ManagePost | null>(null)

  const askHide = (post: ManagePost) => confirm.ask({
    title: "Ẩn bài nhận định",
    description: "Bài biến mất khỏi bảng và danh sách ngay; ai đang mở bài sẽ thấy “Bài viết không còn hiển thị”. Lần ẩn được ghi lại người làm và lúc làm.",
    body: <p className="font-medium">{post.headline}</p>,
    confirmLabel: "Ẩn bài",
    tone: "destructive",
    run: async () => {
      try {
        await hide.mutateAsync(post.id)
        toast.success("Đã ẩn bài")
      } catch (error) {
        toast.error(errorMessage(error))
        throw error
      }
    },
  })

  const askUnhide = (post: ManagePost) => confirm.ask({
    title: "Bỏ ẩn bài nhận định",
    description: "Bài hiện lại cho mọi người dùng; nếu đăng hôm nay, bài trở lại bảng SACO nhận định.",
    body: <p className="font-medium">{post.headline}</p>,
    confirmLabel: "Bỏ ẩn",
    run: async () => {
      try {
        await unhide.mutateAsync(post.id)
        toast.success("Đã bỏ ẩn bài")
      } catch (error) {
        toast.error(errorMessage(error))
        throw error
      }
    },
  })

  const items = posts.data?.items ?? []

  return <div className="space-y-6">
    {posts.isError ? <PanelState title="Không tải được bài nhận định" description={errorMessage(posts.error)} action={{ label: "Thử lại", onClick: () => void posts.refetch() }} />
      : <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3">Câu tiêu điểm</TableHead>
              <TableHead>SACO</TableHead>
              <TableHead>Nhóm</TableHead>
              <TableHead>Giờ đăng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Tim</TableHead>
              <TableHead className="text-right">Bình luận</TableHead>
              <TableHead className="text-right">Báo cáo</TableHead>
              <TableHead className="pr-3 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.isLoading ? <TableLoadingRows colSpan={COLS} />
              : items.length === 0 ? <TableNoticeRow colSpan={COLS}>Chưa có bài nhận định nào được đăng.</TableNoticeRow>
              : items.map((post) => {
                const status = POST_STATUS[post.status]
                return <TableRow key={post.id}>
                  <TableCell className="max-w-[320px] pl-3 whitespace-normal font-medium">{post.headline}</TableCell>
                  <TableCell>{post.sacoName}</TableCell>
                  <TableCell>{post.leadName || "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{post.publishedAt ? formatVnDateTime(post.publishedAt) : "—"}</TableCell>
                  <TableCell><StatusBadge label={status.label} tone={status.tone} /></TableCell>
                  <TableCell className="text-right tabular-nums">{post.hearts}</TableCell>
                  <TableCell className="text-right tabular-nums">{post.comments}</TableCell>
                  <TableCell className="text-right tabular-nums">{post.reports > 0 ? <span className="font-semibold text-status-warning">{post.reports}</span> : 0}</TableCell>
                  <TableCell className="pr-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="outline" size="xs" onClick={() => setViewing(post)}>Xem</Button>
                      {post.status === "published" && <Button type="button" variant="destructive" size="xs" onClick={() => askHide(post)}>Ẩn</Button>}
                      {post.status === "hidden" && isAdmin && <Button type="button" variant="outline" size="xs" onClick={() => askUnhide(post)}>Bỏ ẩn</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              })}
          </TableBody>
        </Table>
      </Card>}

    <ReportedComments
      title="Bình luận bị báo cáo"
      state={{ items: reports.data?.items, isPending: reports.isPending, error: reports.error, refetch: () => void reports.refetch() }}
      hidePending={hideComment.isPending}
      onHide={(report) => confirm.ask({
        title: "Ẩn bình luận",
        description: `Bình luận của ${report.authorName} dưới bài “${report.headline}” sẽ không còn hiển thị.`,
        body: <p className="whitespace-pre-wrap break-words text-muted-foreground">{report.text}</p>,
        confirmLabel: "Ẩn bình luận",
        tone: "destructive",
        run: async () => {
          try {
            await hideComment.mutateAsync(report.commentId)
            toast.success("Đã ẩn bình luận")
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        },
      })}
    />

    <ManagePostDialog post={viewing} onClose={() => setViewing(null)} />
    {confirm.element}
  </div>
}

function ManagePostDialog({ post, onClose }: { post: ManagePost | null; onClose: () => void }) {
  const detail = useManagePost(post?.id ?? null)
  return <PostPreviewDialog open={post !== null} onOpenChange={(open) => !open && onClose()} title="Xem bài nhận định">
    {detail.isError ? <PanelState title="Không tải được bài" description={errorMessage(detail.error)} action={{ label: "Thử lại", onClick: () => void detail.refetch() }} />
      : !detail.data ? <div className="space-y-3" role="status" aria-label="Đang tải bài"><Skeleton className="h-6 w-40" /><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>
      : <div className="space-y-4">
        <PostPreviewBody sacoName={detail.data.sacoName} publishedAt={detail.data.publishedAt} headline={detail.data.headline} bodyHtml={detail.data.bodyHtml} />
        <section aria-labelledby="post-log-title" className="space-y-2">
          <h3 id="post-log-title" className="text-sm font-semibold">Nhật ký bài</h3>
          {detail.data.log.length === 0 ? <p className="text-xs text-muted-foreground">Chưa có thao tác nào.</p>
            : <ul className="space-y-1 text-xs">
              {detail.data.log.map((entry, index) => <li key={`${entry.at}-${index}`} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-muted-foreground">{formatVnDateTime(entry.at)}</span>
                <span className="font-medium">{postLogAction(entry.action)}</span>
                <span>{entry.actorName} ({actorRoleLabel(entry.actorRole)})</span>
              </li>)}
            </ul>}
        </section>
      </div>}
  </PostPreviewDialog>
}
