/**
 * REST của Quản lý SACO (staff: admin, trưởng nhóm) và bài nhận định của chính SACO, dưới
 * `/api/v2/trading-floor`. Dạng dây camelCase, thời gian là epoch ms.
 */
import { api, apiResponse, ApiError } from "@/lib/api"
import type { ChatMessage, InviteResult, MyPost, MyPostDetail, PostStatus } from "@/pages/trading-floor/net/types"

const BASE = "/trading-floor"
const id = (value: string) => encodeURIComponent(value)
const send = (method: "POST" | "PUT" | "PATCH", body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

// ---------- Quản lý SACO ----------

export type ManageSaco = {
  id: string
  userId: string
  name: string
  email: string
  icon: string
  leadUserId: string
  leadName: string
  active: boolean
  onDuty: boolean
  online: boolean
  position: number | null
  convs: number
  accepted: number
  declined: number
  timedOut: number
  mine: boolean
}

export type SacoLead = { id: string; name: string }
export type ManageSacos = { items: ManageSaco[]; leads: SacoLead[] }
export type SacoCandidate = { userId: string; name: string; email: string; leadUserId: string | null; leadName: string | null }
export type InviteLogRow = { at: number; userName: string; sacoName: string; sacoIcon: string; result: InviteResult }
export type ManageConv = { id: string; userName: string; sacoName: string; sacoIcon: string; matched: boolean; last: ChatMessage | null }
export type ManageConvDetail = ManageConv & { messages: ChatMessage[] }

export type ManagePost = {
  id: string
  sacoId: string
  sacoName: string
  leadName: string
  headline: string
  status: Exclude<PostStatus, "draft">
  publishedAt: number | null
  hearts: number
  comments: number
  reports: number
}

export type PostLogEntry = { action: string; actorName: string; actorRole: string; at: number }
export type ManagePostDetail = MyPostDetail & { sacoName: string; log: PostLogEntry[] }

export type CommentReport = {
  commentId: string
  postId: string
  headline: string
  sacoName: string
  authorName: string
  text: string
  at: number
  reports: number
}

export type AssignSacoInput = { userId: string; leadUserId?: string; displayName?: string }

export const manageApi = {
  sacos: (signal?: AbortSignal) => api<ManageSacos>(`${BASE}/manage/sacos`, { signal }),
  candidates: (q: string, signal?: AbortSignal) =>
    api<{ items: SacoCandidate[] }>(`${BASE}/manage/saco-candidates?q=${encodeURIComponent(q)}`, { signal }),
  assign: (input: AssignSacoInput) => api<ManageSaco>(`${BASE}/manage/sacos`, send("POST", input)),
  update: (sacoId: string, input: { displayName?: string; leadUserId?: string }) =>
    api<ManageSaco>(`${BASE}/manage/sacos/${id(sacoId)}`, send("PATCH", input)),
  move: (sacoId: string, dir: "up" | "down") => api<unknown>(`${BASE}/manage/sacos/${id(sacoId)}/move`, send("POST", { dir })),
  remove: (sacoId: string) => api<unknown>(`${BASE}/manage/sacos/${id(sacoId)}/remove`, send("POST")),
  invites: (limit: number, signal?: AbortSignal) => api<{ items: InviteLogRow[] }>(`${BASE}/manage/invites?limit=${limit}`, { signal }),
  convs: (signal?: AbortSignal) => api<{ items: ManageConv[] }>(`${BASE}/manage/convs`, { signal }),
  conv: (convId: string, signal?: AbortSignal) => api<ManageConvDetail>(`${BASE}/manage/convs/${id(convId)}`, { signal }),
  posts: (signal?: AbortSignal) => api<{ items: ManagePost[] }>(`${BASE}/manage/posts`, { signal }),
  post: (postId: string, signal?: AbortSignal) => api<ManagePostDetail>(`${BASE}/manage/posts/${id(postId)}`, { signal }),
  hidePost: (postId: string) => api<unknown>(`${BASE}/manage/posts/${id(postId)}/hide`, send("POST")),
  unhidePost: (postId: string) => api<unknown>(`${BASE}/manage/posts/${id(postId)}/unhide`, send("POST")),
  commentReports: (signal?: AbortSignal) => api<{ items: CommentReport[] }>(`${BASE}/manage/comment-reports`, { signal }),
  hideComment: (commentId: string) => api<unknown>(`${BASE}/posts/comments/${id(commentId)}/hide`, send("POST")),
}

// ---------- Bài của tôi (SACO) ----------

export type SavedDraft = { revision: number; savedAt: number }
export type DraftInput = { headline: string; bodyHtml: string; baseRevision: number }
export type UploadedImage = { id: string; url: string; width: number; height: number }

export const myPostsApi = {
  list: (signal?: AbortSignal) => api<{ items: MyPost[] }>(`${BASE}/saco/posts`, { signal }),
  create: () => api<MyPostDetail>(`${BASE}/saco/posts`, send("POST")),
  get: (postId: string, signal?: AbortSignal) => api<MyPostDetail>(`${BASE}/saco/posts/${id(postId)}`, { signal }),
  save: (postId: string, input: DraftInput, keepalive = false) =>
    api<SavedDraft>(`${BASE}/saco/posts/${id(postId)}`, { ...send("PUT", input), keepalive }),
  remove: (postId: string) => api<unknown>(`${BASE}/saco/posts/${id(postId)}`, { method: "DELETE" }),
  publish: (postId: string, input: DraftInput) => api<MyPostDetail>(`${BASE}/saco/posts/${id(postId)}/publish`, send("POST", input)),
  commentsSeen: (postId: string) => api<unknown>(`${BASE}/saco/posts/${id(postId)}/comments-seen`, send("POST")),
  commentReports: (signal?: AbortSignal) => api<{ items: CommentReport[] }>(`${BASE}/saco/comment-reports`, { signal }),
  /** Tải một ảnh lên nháp (trường `file`); máy chủ kiểm tra lại định dạng và nén. */
  uploadImage: async (postId: string, file: File): Promise<UploadedImage> => {
    const body = new FormData()
    body.append("file", file)
    const response = await apiResponse(`${BASE}/saco/posts/${id(postId)}/images`, { method: "POST", body })
    try {
      return (await response.json()) as UploadedImage
    } catch {
      throw new ApiError("Phản hồi máy chủ không hợp lệ", 502, { code: "INVALID_RESPONSE" })
    }
  },
}

export function isApiError(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code
}
