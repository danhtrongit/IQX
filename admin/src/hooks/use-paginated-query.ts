import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { useDebouncedValue } from "./use-debounced-value"

export interface PaginatedParams {
  page: number
  pageSize: number
  sortBy?: string
  sortDir?: "asc" | "desc"
  [key: string]: unknown
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface UsePaginatedQueryOptions<T> {
  queryFn: (params: PaginatedParams) => Promise<PaginatedResult<T>>
  defaults?: Partial<PaginatedParams>
  debounceMs?: number
}

interface UsePaginatedQueryReturn<T> {
  data: PaginatedResult<T> | null
  isLoading: boolean
  error: Error | null
  params: PaginatedParams
  setParams: (updates: Partial<PaginatedParams>) => void
  refetch: () => void
}

function parseIntOrDefault(value: string | null, def: number): number {
  if (value === null) return def
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? def : parsed
}

export function usePaginatedQuery<T>({
  queryFn,
  defaults,
  debounceMs = 300,
}: UsePaginatedQueryOptions<T>): UsePaginatedQueryReturn<T> {
  const [searchParams, setSearchParams] = useSearchParams()

  const defaultPage = defaults?.page ?? 1
  const defaultPageSize = defaults?.pageSize ?? 20

  // Read params from URL
  const params: PaginatedParams = {
    page: parseIntOrDefault(searchParams.get("page"), defaultPage),
    pageSize: parseIntOrDefault(searchParams.get("pageSize"), defaultPageSize),
    sortBy: searchParams.get("sortBy") ?? defaults?.sortBy,
    sortDir: (searchParams.get("sortDir") as "asc" | "desc") ?? defaults?.sortDir,
    // Propagate any extra filter keys
    ...Object.fromEntries(
      Array.from(searchParams.entries()).filter(
        ([k]) => !["page", "pageSize", "sortBy", "sortDir"].includes(k),
      ),
    ),
  }

  const debouncedParams = useDebouncedValue(params, debounceMs)

  const [data, setData] = useState<PaginatedResult<T> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const refetchTrigger = useRef(0)

  const setParams = useCallback(
    (updates: Partial<PaginatedParams>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === null || value === "") {
              next.delete(key)
            } else {
              next.set(key, String(value))
            }
          }
          // Reset to page 1 when filters change (not when page itself changes)
          if (!("page" in updates)) {
            next.set("page", "1")
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const refetch = useCallback(() => {
    refetchTrigger.current += 1
    setIsLoading(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    queryFn(debouncedParams)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Unknown error"))
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(debouncedParams), refetchTrigger.current])

  return { data, isLoading, error, params, setParams, refetch }
}
