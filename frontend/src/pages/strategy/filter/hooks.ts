/**
 * React Query hooks of the Bộ lọc tab. Private data (learned metrics, filters, lists, snapshots)
 * is keyed by `user.id`, so nothing leaks between accounts that share a cache.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { retryUnlessFinal } from "../shared/errors"
import {
  createFilter,
  createListFromResult,
  createSnapshot,
  deleteFilter,
  deleteList,
  deleteSnapshot,
  getResultPage,
  getScreenerMetrics,
  listFilters,
  listLists,
  listSnapshots,
  RESULT_PAGE_SIZE,
  updateFilter,
} from "./api"
import type { FilterDefinition, Selection } from "./types"

export const filterKeys = {
  all: ["strategy", "filter"] as const,
  metrics: (userId?: string) => ["strategy", "filter", "metrics", userId] as const,
  filters: (userId?: string) => ["strategy", "filter", "filters", userId] as const,
  lists: (userId?: string) => ["strategy", "filter", "lists", userId] as const,
  snapshots: (userId?: string) => ["strategy", "filter", "snapshots", userId] as const,
  page: (userId: string | undefined, resultId: string, page: number, passedOnly: boolean) =>
    ["strategy", "filter", "result", userId, resultId, page, passedOnly] as const,
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

/** One page of a stored result: every page shares the same `as_of`, so sorting and paging never change the data. */
export function useResultPage(resultId: string | null, page: number, passedOnly: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: filterKeys.page(user?.id, resultId ?? "", page, passedOnly),
    enabled: !!user && isPremium && !!resultId,
    queryFn: ({ signal }) =>
      getResultPage(resultId as string, { offset: page * RESULT_PAGE_SIZE, limit: RESULT_PAGE_SIZE, passedOnly }, signal),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: retryUnlessFinal,
  })
}

/** Filters saved on purpose. */
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

/** "Danh mục đã lưu": lists the user saved on purpose (internal lists of "Áp dụng cho Bot" are not here). */
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

export function useSnapshots(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: filterKeys.snapshots(user?.id),
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => listSnapshots(signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useSaveFilter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id?: string; name: string; definition: FilterDefinition; idempotencyKey?: string }) =>
      input.id
        ? updateFilter(input.id, { name: input.name, definition: input.definition })
        : createFilter({ name: input.name, definition: input.definition, ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}) }),
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

export function useCreateList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      runId: string
      selection: Selection
      visibility: "saved" | "internal"
      filterId?: string
      filterVersion?: number
      idempotencyKey?: string
    }) => createListFromResult(input),
    onSuccess: (_list, input) => {
      if (input.visibility === "saved") void queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "lists"] })
    },
  })
}

export function useDeleteList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteList(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "lists"] }),
  })
}

export function useCreateSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; runId: string; selection: Selection; filterId?: string; filterVersion?: number; idempotencyKey?: string }) =>
      createSnapshot(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "snapshots"] }),
  })
}

export function useDeleteSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSnapshot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...filterKeys.all, "snapshots"] }),
  })
}
