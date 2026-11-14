/**
 * /admin/saco/posts "Bài của tôi": mọi bài của SACO đang đăng nhập, mới nhất ở trên. Nháp:
 * Sửa, Xoá. Đã đăng / Đã ẩn: Xem (mở bằng `?view=<id>`, cũng là nơi trình soạn chuyển bài đã
 * đăng tới). Trên điện thoại ẩn cột Giờ, Tim, Bình luận.
 */
import { Link, useNavigate, useSearchParams } from "react-router"
import { PenLine } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage } from "@/lib/api"
import { useConfirmDialog } from "@/pages/admin/core/components/use-confirm-dialog"
import { StatusBadge, TableLoadingRows, TableNoticeRow } from "@/pages/admin/revenue/ui"
import type { MyPost } from "@/pages/trading-floor/net/types"
import { formatVnDateTime } from "@/pages/trading-floor/posts/format"

import { useDeleteDraft, useMyPosts } from "./hooks"
import { POST_STATUS } from "./labels"
import { MyPostViewDialog } from "./my-post-view"

const COLS = 6
const PHONE_HIDDEN = "hidden sm:table-cell"

export function MyPostsPage() {
  const posts = useMyPosts()
  const remove = useDeleteDraft()
  const confirm = useConfirmDialog()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const viewing = params.get("view")

  const setViewing = (postId: string | null) => setParams((current) => {
    const next = new URLSearchParams(current)
    if (postId) next.set("view", postId)
    else next.delete("view")
    return next
  }, { replace: !postId })

  const askDelete = (post: MyPost) => confirm.ask({
    title: "Xoá nháp",
    description: "Nháp bị xoá hẳn và không khôi phục được.",
    body: <p className="font-medium">{post.headline || "(chưa có câu tiêu điểm)"}</p>,
    confirmLabel: "Xoá nháp",
    tone: "destructive",
    run: async () => {
      try {
        await remove.mutateAsync(post.id)
        toast.success("Đã xoá nháp")
      } catch (error) {
        toast.error(errorMessage(error))
        throw error
      }
    },
  })

  const items = posts.data?.items ?? []
  const writeNew = <Button type="button" onClick={() => navigate("/admin/saco/posts/new")}><PenLine data-icon="inline-start" />Viết bài mới</Button>

  return <WorkspacePage title="Bài của tôi" description="Bài nhận định của bạn, mới nhất ở trên. Bài đã đăng không sửa được; muốn đính chính thì đăng bài mới.">
    {posts.isError ? <PanelState title="Không tải được bài của bạn" description={errorMessage(posts.error)} action={{ label: "Thử lại", onClick: () => void posts.refetch() }} />
      : <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3">Câu tiêu điểm</TableHead>
              <TableHead className={PHONE_HIDDEN}>Giờ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className={`${PHONE_HIDDEN} text-right`}>Tim</TableHead>
              <TableHead className={`${PHONE_HIDDEN} text-right`}>Bình luận</TableHead>
              <TableHead className="pr-3 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.isLoading ? <TableLoadingRows colSpan={COLS} />
              : items.length === 0 ? <TableNoticeRow colSpan={COLS}>Bạn chưa có bài nào. Bấm “Viết bài mới” để soạn bài nhận định đầu tiên.</TableNoticeRow>
              : items.map((post) => {
                const status = POST_STATUS[post.status]
                const isDraft = post.status === "draft"
                return <TableRow key={post.id}>
                  <TableCell className="max-w-[360px] pl-3 whitespace-normal">
                    {post.headline ? <span className="font-medium">{post.headline}</span> : <span className="text-muted-foreground">(chưa có câu tiêu điểm)</span>}
                  </TableCell>
                  <TableCell className={`${PHONE_HIDDEN} tabular-nums text-muted-foreground`}>{formatVnDateTime(post.publishedAt ?? post.savedAt)}</TableCell>
                  <TableCell><StatusBadge label={status.label} tone={status.tone} /></TableCell>
                  <TableCell className={`${PHONE_HIDDEN} text-right tabular-nums`}>{isDraft ? "—" : post.hearts}</TableCell>
                  <TableCell className={`${PHONE_HIDDEN} text-right tabular-nums`}>
                    {isDraft ? "—" : <span className="inline-flex items-center justify-end gap-1.5">
                      {post.comments}
                      {post.newComments > 0 && <Badge variant="default" className="h-5 px-1.5 text-[10px]">{post.newComments} mới</Badge>}
                    </span>}
                  </TableCell>
                  <TableCell className="pr-3 text-right">
                    <div className="flex justify-end gap-1">
                      {isDraft ? <>
                        <Button asChild variant="outline" size="xs"><Link to={`/admin/saco/posts/${post.id}`}>Sửa</Link></Button>
                        <Button type="button" variant="destructive" size="xs" onClick={() => askDelete(post)}>Xoá</Button>
                      </> : <Button type="button" variant="outline" size="xs" onClick={() => setViewing(post.id)}>
                        Xem
                        {post.newComments > 0 && <span className="sm:hidden">({post.newComments} mới)</span>}
                      </Button>}
                    </div>
                  </TableCell>
                </TableRow>
              })}
          </TableBody>
        </Table>
        <div className="flex justify-end border-t border-border px-3 py-2">{writeNew}</div>
      </Card>}
    <MyPostViewDialog postId={viewing} onClose={() => setViewing(null)} />
    {confirm.element}
  </WorkspacePage>
}
