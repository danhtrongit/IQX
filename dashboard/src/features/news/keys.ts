import type { NewsFilter } from "./types"

/**
 * Feature-local query keys for news.
 * Leaves are `readonly` tuples (or functions returning them) per the foundation
 * key convention.
 */
export const newsKeys = {
  all: ["news"] as const,
  list: (filters: NewsFilter, page: number, pageSize: number) =>
    ["news", "list", filters, page, pageSize] as const,
  article: (slug: string) => ["news", "article", slug] as const,
  catalogs: ["news", "catalogs"] as const,
} as const
