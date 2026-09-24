import type { CourseListParams } from "./types"

/**
 * Khoá truy vấn cho quản trị bài học. Dữ liệu quản trị là dữ liệu riêng nên
 * khoá kèm id người dùng đang đăng nhập (`scope`).
 */
export const adminLessonKeys = {
  all: ["admin", "lessons"] as const,
  courses: (scope: string, params: CourseListParams) =>
    ["admin", "lessons", "courses", scope, params] as const,
  course: (scope: string, courseId: string) => ["admin", "lessons", "course", scope, courseId] as const,
} as const
