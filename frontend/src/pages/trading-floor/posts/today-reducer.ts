import type { PostCard, ServerMessageOf } from "../net/types"

export type PostEvent =
  | ServerMessageOf<"post:new">
  | ServerMessageOf<"post:hidden">
  | ServerMessageOf<"post:heart">
  | ServerMessageOf<"post:comment">

export const POST_EVENT_TYPES = [
  "post:new",
  "post:hidden",
  "post:heart",
  "post:comment",
] as const

const byNewest = (a: PostCard, b: PostCard) => b.publishedAt - a.publishedAt

/**
 * Áp một sự kiện realtime lên danh sách nhận định hôm nay (mới nhất ở trên). Trả về chính
 * mảng cũ khi không có gì đổi để store không báo thay đổi thừa.
 */
export function applyPostEvent(list: PostCard[], event: PostEvent): PostCard[] {
  switch (event.type) {
    case "post:new": {
      const previous = list.find((post) => post.id === event.post.id)
      // Sự kiện phát chung cho mọi người nên `hearted` luôn false: giữ tim của chính mình.
      const incoming = previous
        ? { ...event.post, hearted: previous.hearted }
        : event.post
      return [
        incoming,
        ...list.filter((post) => post.id !== event.post.id),
      ].sort(byNewest)
    }
    case "post:hidden":
      return list.some((post) => post.id === event.id)
        ? list.filter((post) => post.id !== event.id)
        : list
    case "post:heart":
      return patch(list, event.id, (post) =>
        post.hearts === event.hearts ? post : { ...post, hearts: event.hearts }
      )
    case "post:comment":
      return patch(list, event.postId, (post) =>
        post.comments === event.comments
          ? post
          : { ...post, comments: event.comments }
      )
  }
}

/** Ghi tim của người xem (lạc quan hoặc theo phản hồi máy chủ). */
export function setHeart(
  list: PostCard[],
  id: string,
  hearted: boolean,
  hearts: number
): PostCard[] {
  return patch(list, id, (post) =>
    post.hearted === hearted && post.hearts === hearts
      ? post
      : { ...post, hearted, hearts }
  )
}

function patch(
  list: PostCard[],
  id: string,
  change: (post: PostCard) => PostCard
): PostCard[] {
  let changed = false
  const next = list.map((post) => {
    if (post.id !== id) return post
    const updated = change(post)
    if (updated !== post) changed = true
    return updated
  })
  return changed ? next : list
}
