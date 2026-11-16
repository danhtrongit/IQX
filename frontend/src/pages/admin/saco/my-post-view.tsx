/**
 * Xem một bài của SACO trong quản trị: bài đúng như trang đọc, bình luận (tác giả ẩn được) và
 * bình luận bị báo cáo của bài, kèm thao tác của tác giả (Sửa, Thu hồi, Đăng lại, Xoá vĩnh viễn).
 * Mở xem thì đánh dấu đã xem bình luận mới (`comments-seen`).
 */
import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { postsApi } from "@/pages/trading-floor/posts/api"
import { formatVnDateTime } from "@/pages/trading-floor/posts/format"

import { useSacoSelf } from "@/components/layout/admin-saco"

import { myPostsApi } from "./api"
import { MyPostActionButtons } from "./my-post-actions"
import { sacoKeys, useInvalidateMyPosts, useMyCommentReports, useMyPost } from "./hooks"
import { POST_STATUS } from "./labels"
import { PostPreviewBody, PostPreviewDialog } from "./post-preview"
import { ReportedComments } from "./reported-comments"
import { useMyPostActions } from "./use-my-post-actions"

export function MyPostViewDialog({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  return <PostPreviewDialog open={postId !== null} onOpenChange={(open) => !open && onClose()} title="Xem bài của tôi">
    {postId && <MyPostView postId={postId} onClose={onClose} />}
  </PostPreviewDialog>
}

function MyPostView({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { user } = useAuth()
  const post = useMyPost(postId)
  const me = useSacoSelf(true)
  const invalidate = useInvalidateMyPosts()
  const queryClient = useQueryClient()
  const seen = useRef(false)
  const actions = useMyPostActions({ onRemoved: onClose })
  const published = post.data ? post.data.status !== "draft" : false
  // Bình luận công khai chỉ đọc được khi bài đang hiện; bài ẩn hay đã thu hồi trả 410.
  const live = post.data?.status === "published"

  const comments = useQuery({
    queryKey: [...sacoKeys.myPost(user?.id, postId), "comments"],
    enabled: !!user && live,
    queryFn: ({ signal }) => postsApi.comments(postId, signal),
  })
  const reports = useMyCommentReports(live)

  const hide = useMutation({
    mutationFn: (commentId: string) => postsApi.hideComment(commentId),
    onSuccess: () => toast.success("Đã ẩn bình luận"),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => invalidate(),
  })

  useEffect(() => {
    if (!published || seen.current || !post.data || post.data.newComments === 0) return
    seen.current = true
    myPostsApi.commentsSeen(postId).then(() => queryClient.invalidateQueries({ queryKey: sacoKeys.myList(user?.id) }), () => undefined)
  }, [published, post.data, postId, queryClient, user?.id])

  if (post.isError) return <PanelState title="Không tải được bài" description={errorMessage(post.error)} action={{ label: "Thử lại", onClick: () => void post.refetch() }} />
  if (!post.data) return <div className="space-y-3" role="status" aria-label="Đang tải bài"><Skeleton className="h-6 w-40" /><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>

  const status = POST_STATUS[post.data.status]
  const sacoName = me.data?.saco?.name ?? user?.full_name ?? ""
  const items = comments.data?.items ?? []

  return <div className="space-y-5">
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline">{status.label}</Badge>
      <span className="tabular-nums">{post.data.publishedAt ? `Đăng ${formatVnDateTime(post.data.publishedAt)}` : `Lưu ${formatVnDateTime(post.data.savedAt)}`}</span>
      {published && <span>· {post.data.hearts} tim · {post.data.comments} bình luận</span>}
    </p>
    <MyPostActionButtons post={post.data} actions={actions} />
    {post.data.status === "hidden" && <p className="text-xs text-muted-foreground">Bài đang bị quản trị ẩn nên bạn không sửa hay thu hồi được. Cần đăng lại thì liên hệ trưởng nhóm hoặc quản trị viên.</p>}
    {post.data.status === "withdrawn" && <p className="text-xs text-muted-foreground">Bài đã thu hồi, người dùng không còn thấy. Tim và bình luận vẫn được giữ nếu bạn đăng lại.</p>}
    <PostPreviewBody sacoName={sacoName} publishedAt={post.data.publishedAt} editedAt={post.data.editedAt} headline={post.data.headline} bodyHtml={post.data.bodyHtml} />
    {live && <section className="space-y-2" aria-labelledby="my-post-comments-title">
      <h3 id="my-post-comments-title" className="text-sm font-semibold">Bình luận ({comments.data?.total ?? post.data.comments})</h3>
      {comments.isError ? <PanelState title="Không tải được bình luận" description={errorMessage(comments.error)} action={{ label: "Thử lại", onClick: () => void comments.refetch() }} />
        : comments.isPending ? <Skeleton className="h-14 w-full" />
        : items.length === 0 ? <p className="text-xs text-muted-foreground">Chưa có bình luận.</p>
        : <ul className="divide-y divide-border rounded-sm border border-border">
          {items.map((comment) => <li key={comment.id} className={cn("flex items-start gap-3 px-3 py-2", comment.isAuthor && "bg-muted/40")}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.authorName}</span>
                {comment.isAuthor && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">Tác giả</Badge>}
                {" · "}<span className="tabular-nums">{formatVnDateTime(comment.at)}</span>
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{comment.text}</p>
            </div>
            {!comment.isAuthor && <Button type="button" variant="outline" size="xs" disabled={hide.isPending} onClick={() => hide.mutate(comment.id, { onSuccess: () => void comments.refetch() })}>Ẩn</Button>}
          </li>)}
        </ul>}
    </section>}
    {live && <ReportedComments
      title="Bình luận bị báo cáo"
      state={{ items: reports.data?.items.filter((item) => item.postId === postId), isPending: reports.isPending, error: reports.error, refetch: () => void reports.refetch() }}
      showHeadline={false}
      hidePending={hide.isPending}
      onHide={(report) => hide.mutate(report.commentId, { onSuccess: () => void Promise.all([comments.refetch(), reports.refetch()]) })}
    />}
    {actions.element}
  </div>
}
