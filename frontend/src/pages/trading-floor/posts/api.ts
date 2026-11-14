/** REST của SACO nhận định phía người xem (`/api/v2/trading-floor/posts/*`). */
import { api } from "@/lib/api"

import type { PostCard, PostComment, PostDetail } from "../net/types"

const BASE = "/trading-floor/posts"

export type TodayPosts = { date: string; items: PostCard[] }
export type PostComments = { total: number; items: PostComment[] }

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
})

export const postsApi = {
  today: (signal?: AbortSignal) => api<TodayPosts>(`${BASE}/today`, { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    api<PostDetail>(`${BASE}/${encodeURIComponent(id)}`, { signal }),
  heart: (id: string, on: boolean) =>
    api<{ hearts: number; hearted: boolean }>(
      `${BASE}/${encodeURIComponent(id)}/heart`,
      json({ on })
    ),
  comments: (id: string, signal?: AbortSignal) =>
    api<PostComments>(`${BASE}/${encodeURIComponent(id)}/comments`, { signal }),
  comment: (id: string, text: string) =>
    api<PostComment>(
      `${BASE}/${encodeURIComponent(id)}/comments`,
      json({ text })
    ),
  deleteComment: (commentId: string) =>
    api<{ ok: true }>(`${BASE}/comments/${encodeURIComponent(commentId)}`, {
      method: "DELETE",
    }),
  hideComment: (commentId: string) =>
    api<{ ok: true }>(
      `${BASE}/comments/${encodeURIComponent(commentId)}/hide`,
      { method: "POST" }
    ),
  reportComment: (commentId: string) =>
    api<{ ok: true }>(
      `${BASE}/comments/${encodeURIComponent(commentId)}/report`,
      { method: "POST" }
    ),
}

/** Độ dài tối đa của một bình luận (đếm sau khi bỏ khoảng trắng đầu cuối). */
export const COMMENT_MAX = 500
