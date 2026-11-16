/**
 * Trạng thái và hộp xác nhận cho các thao tác của SACO tác giả trên bài của mình (Sửa, Thu hồi,
 * Đăng lại, Xoá vĩnh viễn); bộ nút dùng chung nằm ở `my-post-actions.tsx`.
 */
import { useState } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { useConfirmDialog } from "@/pages/admin/core/components/use-confirm-dialog"
import type { PostStatus } from "@/pages/trading-floor/net/types"

import { myPostsApi } from "./api"
import { sacoKeys, useDeleteDraft, useRepublishPost, useWithdrawPost } from "./hooks"

export type ActionPost = { id: string; headline: string; status: PostStatus }
export type Busy = { id: string; kind: "edit" | "withdraw" | "republish" | "purge" } | null

/** Trạng thái và hộp xác nhận của các thao tác; hiển thị `element` một lần trong trang. */
export function useMyPostActions({ onRemoved }: { onRemoved?: (postId: string) => void } = {}) {
  const confirm = useConfirmDialog()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const withdraw = useWithdrawPost()
  const republish = useRepublishPost()
  const remove = useDeleteDraft()
  const [busy, setBusy] = useState<Busy>(null)

  const run = async <T,>(post: ActionPost, kind: NonNullable<Busy>["kind"], action: () => Promise<T>, success: string): Promise<T> => {
    setBusy({ id: post.id, kind })
    try {
      const result = await action()
      toast.success(success)
      return result
    } catch (error) {
      toast.error(errorMessage(error))
      throw error
    } finally {
      setBusy(null)
    }
  }

  /** Mở trình soạn với bản mới nhất của bài (không dùng bản cũ trong bộ nhớ đệm). */
  const edit = async (post: ActionPost) => {
    setBusy({ id: post.id, kind: "edit" })
    try {
      await queryClient.fetchQuery({
        queryKey: sacoKeys.myPost(user?.id, post.id),
        queryFn: ({ signal }) => myPostsApi.get(post.id, signal),
        staleTime: 0,
      })
      navigate(`/admin/saco/posts/${encodeURIComponent(post.id)}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const askWithdraw = (post: ActionPost) => confirm.ask({
    title: "Thu hồi bài",
    description: "Bài sẽ biến mất khỏi Khu giao dịch. Bạn có thể đăng lại sau.",
    body: <p className="font-medium">{post.headline}</p>,
    confirmLabel: "Thu hồi bài",
    tone: "destructive",
    run: async () => {
      await run(post, "withdraw", () => withdraw.mutateAsync(post.id), "Đã thu hồi bài")
    },
  })

  const askPurge = (post: ActionPost) => confirm.ask({
    title: "Xoá vĩnh viễn",
    description: "Bài cùng ảnh, tim và bình luận bị xoá hẳn và không khôi phục được.",
    body: <p className="font-medium">{post.headline}</p>,
    confirmLabel: "Xoá vĩnh viễn",
    tone: "destructive",
    run: async () => {
      await run(post, "purge", () => remove.mutateAsync(post.id), "Đã xoá bài vĩnh viễn")
      onRemoved?.(post.id)
    },
  })

  const doRepublish = async (post: ActionPost) => {
    try {
      await run(post, "republish", () => republish.mutateAsync(post.id), "Đã đăng lại bài")
    } catch {
      // Đã báo lỗi bằng toast.
    }
  }

  return { busy, edit, askWithdraw, askPurge, republish: doRepublish, element: confirm.element }
}

export type MyPostActionsApi = ReturnType<typeof useMyPostActions>
