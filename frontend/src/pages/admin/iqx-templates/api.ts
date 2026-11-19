/**
 * Quản trị › Mẫu IQX (spec Tab IQX §5.6): typed calls to `admin/iqx-templates` and their React Query
 * hooks. Keys live under `["admin", "iqx-templates", …]`; every write refreshes the admin list and
 * detail, and the writes users can see (publish, hide, show, reorder) also refresh the user tab IQX.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"
import type { IqxKind } from "@/pages/strategy/shared/iqx"

export type IqxAdminList = ApiResponseFor<"GET /api/v2/admin/iqx-templates">
export type IqxAdminItem = IqxAdminList["items"][number]
export type IqxAdminDetail = ApiResponseFor<"GET /api/v2/admin/iqx-templates/{id}">
export type IqxHistoryEntry = IqxAdminDetail["history"][number]
export type IqxVersion = IqxAdminDetail["versions"][number]
export type IqxDraftInput = ApiRequestFor<"POST /api/v2/admin/iqx-templates">["body"]["draft"]
export type IqxPublishInput = ApiRequestFor<"POST /api/v2/admin/iqx-templates/{id}/publish">["body"]

export const iqxAdminKeys = {
  all: ["admin", "iqx-templates"] as const,
  list: (kind: IqxKind) => ["admin", "iqx-templates", "list", kind] as const,
  detail: (id: string) => ["admin", "iqx-templates", "detail", id] as const,
}

/** User tab IQX (`iqxKeys.list` in strategy/shared/iqx.ts), refreshed after visible changes. */
const USER_IQX_KEY = ["strategy", "iqx-templates"] as const

export function fetchIqxAdminList(kind: IqxKind, signal?: AbortSignal) {
  return requestOperation("GET /api/v2/admin/iqx-templates", { query: { kind } }, { signal })
}

export function fetchIqxAdminDetail(id: string, signal?: AbortSignal) {
  return requestOperation("GET /api/v2/admin/iqx-templates/{id}", { path: { id } }, { signal })
}

export function createIqxTemplate(kind: IqxKind, draft: IqxDraftInput) {
  return requestOperation("POST /api/v2/admin/iqx-templates", { body: { kind, draft } })
}

export function saveIqxDraft(id: string, draft: IqxDraftInput, draftUpdatedAt: string | null) {
  return requestOperation("PUT /api/v2/admin/iqx-templates/{id}/draft", {
    path: { id },
    body: { draft, draft_updated_at: draftUpdatedAt },
  })
}

export function publishIqxTemplate(id: string, body: IqxPublishInput) {
  return requestOperation("POST /api/v2/admin/iqx-templates/{id}/publish", { path: { id }, body })
}

export function hideIqxTemplate(id: string, reason: string) {
  return requestOperation("POST /api/v2/admin/iqx-templates/{id}/hide", { path: { id }, body: { reason } })
}

export function showIqxTemplate(id: string, reason: string) {
  return requestOperation("POST /api/v2/admin/iqx-templates/{id}/show", { path: { id }, body: { reason } })
}

export function reorderIqxTemplates(kind: IqxKind, ids: string[]) {
  return requestOperation("PUT /api/v2/admin/iqx-templates/order", { body: { kind, ids } })
}

export function deleteIqxTemplate(id: string) {
  return requestOperation("DELETE /api/v2/admin/iqx-templates/{id}", { path: { id } })
}

export function restoreIqxVersion(id: string, version: number) {
  return requestOperation("POST /api/v2/admin/iqx-templates/{id}/restore", { path: { id }, body: { version } })
}

// ---------------------------------------------------------------------------

export function useIqxAdminList(kind: IqxKind, enabled = true) {
  return useQuery({
    queryKey: iqxAdminKeys.list(kind),
    queryFn: ({ signal }) => fetchIqxAdminList(kind, signal),
    enabled,
    staleTime: 10_000,
  })
}

export function useIqxAdminDetail(id: string | null) {
  return useQuery({
    queryKey: iqxAdminKeys.detail(id ?? ""),
    queryFn: ({ signal }) => fetchIqxAdminDetail(id as string, signal),
    enabled: id !== null,
    staleTime: 0,
  })
}

/** Store the returned detail, refresh the admin lists/details and, when users see it, their tab IQX. */
function useCommit() {
  const queryClient = useQueryClient()
  return (detail: IqxAdminDetail | null, userVisible: boolean) => {
    if (detail) queryClient.setQueryData(iqxAdminKeys.detail(detail.id), detail)
    void queryClient.invalidateQueries({ queryKey: iqxAdminKeys.all })
    if (userVisible) void queryClient.invalidateQueries({ queryKey: USER_IQX_KEY })
  }
}

export function useCreateIqxTemplate() {
  const commit = useCommit()
  return useMutation({
    mutationFn: ({ kind, draft }: { kind: IqxKind; draft: IqxDraftInput }) => createIqxTemplate(kind, draft),
    onSuccess: (detail) => commit(detail, false),
  })
}

export function useSaveIqxDraft() {
  const commit = useCommit()
  return useMutation({
    mutationFn: ({ id, draft, draftUpdatedAt }: { id: string; draft: IqxDraftInput; draftUpdatedAt: string | null }) =>
      saveIqxDraft(id, draft, draftUpdatedAt),
    onSuccess: (detail) => commit(detail, false),
  })
}

export function usePublishIqxTemplate() {
  const commit = useCommit()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: IqxPublishInput }) => publishIqxTemplate(id, body),
    onSuccess: (detail) => commit(detail, true),
  })
}

export function useSetIqxVisibility() {
  const commit = useCommit()
  return useMutation({
    mutationFn: ({ id, visible, reason }: { id: string; visible: boolean; reason: string }) =>
      visible ? showIqxTemplate(id, reason) : hideIqxTemplate(id, reason),
    onSuccess: (detail) => commit(detail, true),
  })
}

export function useReorderIqxTemplates() {
  const queryClient = useQueryClient()
  const commit = useCommit()
  return useMutation({
    mutationFn: ({ kind, ids }: { kind: IqxKind; ids: string[] }) => reorderIqxTemplates(kind, ids),
    onSuccess: (list) => {
      queryClient.setQueryData(iqxAdminKeys.list(list.kind), list)
      commit(null, true)
    },
  })
}

export function useDeleteIqxTemplate() {
  const queryClient = useQueryClient()
  const commit = useCommit()
  return useMutation({
    mutationFn: (id: string) => deleteIqxTemplate(id),
    onSuccess: (result) => {
      queryClient.removeQueries({ queryKey: iqxAdminKeys.detail(result.id) })
      commit(null, false)
    },
  })
}

export function useRestoreIqxVersion() {
  const commit = useCommit()
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => restoreIqxVersion(id, version),
    onSuccess: (detail) => commit(detail, false),
  })
}
