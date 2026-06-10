import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { newsApi } from "./api"
import { newsKeys } from "./keys"
import type {
  NewsArticle,
  NewsCatalogs,
  NewsFilter,
  NewsListResult,
} from "./types"

const DEFAULT_PAGE_SIZE = 15

/**
 * Paginated news list with server-side filters (ticker / sentiment / source /
 * industry). Pagination is local: changing filters resets to page 1, and
 * `placeholderData` keeps the previous page visible while the next loads.
 */
export function useNewsList(filters: NewsFilter = {}, pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1)

  const query = useQuery<NewsListResult>({
    queryKey: newsKeys.list(filters, page, pageSize),
    queryFn: () => newsApi.listNews(filters, page, pageSize),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  // Reset to page 1 whenever the filter set changes (mirrors bak behaviour
  // without an effect: the serialized filter signature drives a render-time reset).
  const filterSignature = JSON.stringify(filters)
  const [lastSignature, setLastSignature] = useState(filterSignature)
  if (filterSignature !== lastSignature) {
    setLastSignature(filterSignature)
    if (page !== 1) setPage(1)
  }

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    page,
    pageSize,
    loadPage: setPage,
    refresh: query.refetch,
  }
}

/** A single article by slug (disabled when slug is null/empty). */
export function useNewsArticle(slug: string | null) {
  const query = useQuery<NewsArticle | null>({
    queryKey: newsKeys.article(slug ?? ""),
    queryFn: () => newsApi.getArticle(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
  })

  return {
    article: query.data ?? null,
    isLoading: query.isLoading && !!slug,
  }
}

/** Filter catalogs (industries + sources) for the dropdowns. */
export function useNewsFilters() {
  const query = useQuery<NewsCatalogs>({
    queryKey: newsKeys.catalogs,
    queryFn: () => newsApi.getCatalogs(),
    staleTime: 5 * 60_000,
  })

  return {
    industries: query.data?.industries ?? [],
    sources: query.data?.sources ?? [],
  }
}
