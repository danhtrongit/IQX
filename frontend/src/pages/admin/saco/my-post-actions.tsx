/**
 * Nút thao tác của SACO tác giả trên bài của mình ở "Bài của tôi" và trong hộp xem bài:
 * đang đăng: Sửa bài, Thu hồi bài; đã thu hồi: Đăng lại, Xoá vĩnh viễn (xác nhận do
 * `useMyPostActions`). Bài bị quản trị ẩn và nháp không có thao tác nào.
 */
import { LoaderCircle, Pencil, Send, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { TOUCH_BUTTON } from "./labels"
import type { ActionPost, Busy, MyPostActionsApi } from "./use-my-post-actions"

/** Hàng nút thao tác của một bài; không vẽ gì với nháp và bài bị ẩn. */
export function MyPostActionButtons({ post, actions, className }: { post: ActionPost; actions: MyPostActionsApi; className?: string }) {
  const { busy } = actions
  const mine = busy?.id === post.id ? busy.kind : null
  const disabled = busy !== null
  const icon = (kind: NonNullable<Busy>["kind"], Icon: typeof Pencil) => mine === kind
    ? <LoaderCircle data-icon="inline-start" className="animate-spin" />
    : <Icon data-icon="inline-start" />

  if (post.status === "published") {
    return <div className={cn("flex flex-wrap gap-2", className)}>
      <Button type="button" variant="outline" className={TOUCH_BUTTON} disabled={disabled} onClick={() => void actions.edit(post)}>
        {icon("edit", Pencil)}Sửa bài
      </Button>
      <Button type="button" variant="outline" className={TOUCH_BUTTON} disabled={disabled} onClick={() => actions.askWithdraw(post)}>
        {icon("withdraw", Undo2)}Thu hồi bài
      </Button>
    </div>
  }
  if (post.status === "withdrawn") {
    return <div className={cn("flex flex-wrap gap-2", className)}>
      <Button type="button" className={TOUCH_BUTTON} disabled={disabled} onClick={() => void actions.republish(post)}>
        {icon("republish", Send)}Đăng lại
      </Button>
      <Button type="button" variant="destructive" className={TOUCH_BUTTON} disabled={disabled} onClick={() => actions.askPurge(post)}>
        {icon("purge", Trash2)}Xoá vĩnh viễn
      </Button>
    </div>
  }
  return null
}
