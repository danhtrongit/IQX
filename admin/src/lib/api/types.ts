export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface BackendPaginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function adaptPage<TIn, TOut>(raw: BackendPaginated<TIn>, adapt: (row: TIn) => TOut): PaginatedResult<TOut> {
  return {
    items: raw.items.map(adapt),
    total: raw.total,
    page: raw.page,
    pageSize: raw.page_size,
    totalPages: raw.total_pages,
  }
}
