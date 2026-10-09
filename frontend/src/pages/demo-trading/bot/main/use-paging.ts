import { useState } from "react"

/** Client-side paging of a list that is already fully loaded. */
export function usePaging(total: number, size: number) {
  const [requested, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(requested, pages - 1)
  return { page, pages, setPage, start: page * size, end: Math.min(total, (page + 1) * size) }
}

export type Paging = ReturnType<typeof usePaging>
