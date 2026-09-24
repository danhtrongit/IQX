import type { CatalogParams } from "./types"

/**
 * Khoá truy vấn cho khu "Bài học".
 *
 * Dữ liệu riêng của người dùng (`progress`, `episodeContent`) được khoá theo
 * `userId` để không rò rỉ tiến độ/nội dung giữa các tài khoản trên cùng máy.
 */
export const learningKeys = {
  all: ["lessons"] as const,
  courses: (params: CatalogParams) => ["lessons", "courses", params] as const,
  course: (slug: string) => ["lessons", "course", slug] as const,
  episodeContent: (userId: string | null, episodeId: string) =>
    ["lessons", "episode", userId ?? "anonymous", episodeId, "content"] as const,
  progress: (userId: string | null, courseId: string) =>
    ["lessons", "progress", userId ?? "anonymous", courseId] as const,
} as const
