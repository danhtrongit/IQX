/**
 * React Query hooks của tab Bộ lọc. Dữ liệu riêng tư (chỉ tiêu đã học, bộ lọc,
 * danh sách) khoá theo `user.id` để không rò giữa các tài khoản.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { isFeatureDisabled } from "@/lib/shared-config"

import {
  createFilter,
  createList,
  deleteFilter,
  deleteList,
  getFilter,
  getScreenerMetrics,
  listFilters,
  listLists,
  runScreener,
  updateFilter,
} from "./api"
import type { CreateListBody, FilterDefinition } from "./types"

export const filterKeys = {
  all: ["strategy", "filter"] as const,
  metrics: (userId?: string) => ["strategy", "filter", "metrics", userId] as const,
  filters: (userId?: string) => ["strategy", "filter", "filters", userId] as const,
  lists: (userId?: string) => ["strategy", "filter", "lists", userId] as const,
}

/** Không thử lại khi tính năng tắt hoặc bị khoá quyền — kết quả sẽ không đổi. */
function retryUnlessFinal(failureCount: number, error: unknown): boolean {
  if (isFeatureDisabled(error)) return false
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status
    if (status >= 400 && status < 500) return false
  }
  return failureCount < 2
}

export function useScreenerMetrics() {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: filterKeys.metrics(user?.id),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => getScreenerMetrics(signal),
    staleTime: 60_000,
    retry: retryUnlessFinal,
  })
}

export function useRunScreener() {
  const { user } = useAuth()
  return useMutation({
    mutationKey: ["strategy", "filter", "run", user?.id],
    mutationFn: (definition: FilterDefinition) => runScreener(definition),
  })
}

export function useSavedFilters(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: filterKeys.filters(user?.id),
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => listFilters(signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useSavedLists(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: filterKeys.lists(user?.id),
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => listLists(signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useLoadFilter() {
  return useMutation({ mutationFn: (id: string) => getFilter(id) })
}

export function useSaveFilter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id?: string; name: string; definition: FilterDefinition }) =>
      input.id
        ? updateFilter(input.id, { name: input.name, definition: input.definition })
        : createFilter({ name: input.name, definition: input.definition }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "filters"] }),
  })
}

export function useDeleteFilter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFilter(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "filters"] }),
  })
}

export function useSaveList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateListBody) => createList(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "lists"] }),
  })
}

export function useDeleteList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteList(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "lists"] }),
  })
}
