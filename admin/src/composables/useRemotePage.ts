import { computed, reactive, ref } from "vue"
import type { PaginatedResult } from "@/lib/api/types"

export interface PageParams {
  page: number
  pageSize: number
  [key: string]: string | number | boolean | null | undefined
}

export function useRemotePage<T>(queryFn: (params: PageParams) => Promise<PaginatedResult<T>>, defaults?: Partial<PageParams>) {
  const params = reactive<PageParams>({ page: 1, pageSize: 20, ...defaults })
  const data = ref<PaginatedResult<T> | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(patch?: Partial<PageParams>) {
    Object.assign(params, patch)
    loading.value = true
    error.value = null
    try {
      data.value = await queryFn({ ...params })
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Không thể tải dữ liệu"
    } finally {
      loading.value = false
    }
  }

  function setPage(page: number) {
    void load({ page })
  }

  function setPageSize(pageSize: number) {
    void load({ page: 1, pageSize })
  }

  const rows = computed(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)

  return { params, data, rows, total, loading, error, load, setPage, setPageSize }
}
