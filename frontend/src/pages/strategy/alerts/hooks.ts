import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import { retryUnlessFinal } from "../shared/errors"
import {
  alertKeys,
  createAlert,
  deleteAlert,
  EVENT_PAGE_SIZE,
  getAlert,
  listAlertEvents,
  listAlerts,
  listConfigRevisions,
  listRunsForAlerts,
  previewAlertSource,
  updateAlert,
  type AlertCreateBody,
  type AlertSide,
  type AlertSourceInput,
  type AlertUpdateBody,
} from "./api"

export function useAlerts() {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: alertKeys.list(user?.id),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => listAlerts(signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useAlertDetail(alertId: string | null) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: alertKeys.detail(user?.id, alertId ?? ""),
    enabled: !!user && isPremium && !!alertId,
    queryFn: ({ signal }) => getAlert(alertId as string, signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

/** One page of the signal history, newest session first; the server counts the whole history. */
export function useAlertEvents(side: AlertSide | "all", page: number) {
  const { user, isPremium } = useAuth()
  const offset = page * EVENT_PAGE_SIZE
  return useQuery({
    queryKey: alertKeys.events(user?.id, side, offset),
    enabled: !!user && isPremium,
    queryFn: ({ signal }) => listAlertEvents({ ...(side === "all" ? {} : { side }), offset, limit: EVENT_PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useConfigRevisions(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: ["strategy", "alerts", "revisions", user?.id],
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => listConfigRevisions(50, signal),
    staleTime: 0,
    retry: retryUnlessFinal,
  })
}

export function useRunsForAlerts(enabled: boolean) {
  const { user, isPremium } = useAuth()
  return useQuery({
    queryKey: ["strategy", "alerts", "runs", user?.id],
    enabled: enabled && !!user && isPremium,
    queryFn: ({ signal }) => listRunsForAlerts(50, signal),
    staleTime: 0,
    retry: retryUnlessFinal,
  })
}

/** Which sides the chosen source would pin; read-only, nothing is saved. */
export function useSourcePreview(source: AlertSourceInput | null) {
  const { user, isPremium } = useAuth()
  const fingerprint = source ? JSON.stringify(source) : ""
  return useQuery({
    queryKey: alertKeys.preview(user?.id, fingerprint),
    enabled: !!user && isPremium && !!source,
    queryFn: ({ signal }) => previewAlertSource(source as AlertSourceInput, signal),
    staleTime: 30_000,
    retry: retryUnlessFinal,
  })
}

export function useCreateAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AlertCreateBody) => createAlert(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  })
}

export function useUpdateAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: AlertUpdateBody }) => updateAlert(input.id, input.body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  })
}

export function useDeleteAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  })
}
