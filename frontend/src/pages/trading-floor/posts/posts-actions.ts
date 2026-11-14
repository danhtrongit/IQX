/** Thao tác dùng chung của bảng trượt: tim lạc quan có hoàn tác và Nhắn SACO. */
import { errorMessage } from "@/lib/api"

import { closePosts, toast, world } from "../bridge"
import { openDirectChat } from "../net/chat"
import { postsApi } from "./api"
import { setHeart } from "./today-reducer"

const inFlight = new Set<string>()

export type HeartState = { hearted: boolean; hearts: number }

/**
 * Đổi tim ngay trên màn hình rồi gửi máy chủ; lỗi thì trả lại như cũ. `applyLocal` cập nhật
 * bản chi tiết đang mở (bài có thể không còn trong danh sách hôm nay). Một bài chỉ có một
 * yêu cầu tim đang chạy.
 */
export async function toggleHeart(
  id: string,
  current: HeartState,
  applyLocal?: (next: HeartState) => void
): Promise<void> {
  if (inFlight.has(id)) return
  inFlight.add(id)
  const apply = (next: HeartState) => {
    world.posts.update((list) => setHeart(list, id, next.hearted, next.hearts))
    applyLocal?.(next)
  }
  const hearted = !current.hearted
  apply({ hearted, hearts: Math.max(0, current.hearts + (hearted ? 1 : -1)) })
  try {
    const result = await postsApi.heart(id, hearted)
    apply({ hearted: result.hearted, hearts: result.hearts })
  } catch (error) {
    apply(current)
    toast(errorMessage(error), "warn")
  } finally {
    inFlight.delete(id)
  }
}

/** Mở chat có sẵn với đúng SACO tác giả và đóng bảng trượt; người dùng vẫn ở khu giao dịch. */
export function messageSaco(sacoId: string): void {
  closePosts()
  void openDirectChat(sacoId)
}
