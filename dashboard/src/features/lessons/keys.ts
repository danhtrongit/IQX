import type { CatalogParams } from "./types"

/**
 * Feature-local query keys for lessons / courses.
 * Leaves are `readonly` tuples (or functions returning them) per the foundation
 * key convention.
 */
export const lessonsKeys = {
  all: ["lessons"] as const,
  courses: (params: CatalogParams) =>
    ["lessons", "courses", params] as const,
  course: (slug: string) => ["lessons", "course", slug] as const,
  episodeContent: (id: string) => ["lessons", "episode", id, "content"] as const,
  progress: (courseId: string) => ["lessons", "progress", courseId] as const,
} as const
