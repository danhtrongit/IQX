/**
 * Thông báo (spec Bot và Chiến lược v2.0 §8, Khu Văn phòng §12): settings, the inbox behind the
 * header bell and the one-click unsubscribe of an email link.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"
import type { NotificationListResponse } from "@/lib/generated/backend-v2"

export const OFFICE_NOTIFICATION_TYPES = [
  "office_task_assigned",
  "office_task_approved",
  "office_task_returned",
  "office_proposal_replied",
  "office_task_submitted",
  "office_proposal_sent",
] as const

export type OfficeNotificationType = (typeof OFFICE_NOTIFICATION_TYPES)[number]

export type NotificationType = NotificationListResponse["items"][number]["type"]

export type NotificationSettings = {
  enabled: boolean
  types: { bulletin: boolean; bot_trades: boolean }
  /** `Trên web` is always on. */
  channels: { web?: true; email: boolean }
  /** The account has a verified email; otherwise Email is locked (`Chưa có email`). */
  email_available: boolean
  updated_at: string | null
}

export type NotificationSettingsInput = { enabled: boolean; types: NotificationSettings["types"]; channels: { email: boolean } }

export type NotificationItem = NotificationListResponse["items"][number]

export type NotificationList = NotificationListResponse

export type UnsubscribeResult = { type: NotificationType; status: "unsubscribed" | "already_used" }

/** Bell list size (§8.3) and unread polling period. */
export const NOTIFICATION_LIST_LIMIT = 50
export const UNREAD_POLL_MS = 60_000

/** The Bot tool with its panel open, scrolled to the THÔNG BÁO card (§8.3, T10). */
export const NOTIFICATION_SETTINGS_PATH = "/luyen-tap?tool=bot&focus=thong-bao"
/** `focus` value the Bot panel answers by scrolling to its THÔNG BÁO card. */
export const NOTIFICATION_FOCUS = "thong-bao"

export const TYPE_LABEL: Record<NotificationType, string> = {
  bulletin: "Bản tin cuối phiên",
  bot_trades: "Bot giao dịch",
  office_task_assigned: "Giao nhiệm vụ",
  office_task_approved: "Duyệt nhiệm vụ",
  office_task_returned: "Cần làm lại",
  office_proposal_replied: "Trả lời đề xuất",
  office_task_submitted: "Chờ xác nhận",
  office_proposal_sent: "Đề xuất mới",
}

export const FALLBACK_LINK: Record<NotificationType, string> = {
  bot_trades: "/luyen-tap?tool=bot&bot_tab=lich-su",
  bulletin: "/thi-truong?bt=ban-tin",
  office_task_assigned: "/khu-giao-dich?phong=van-phong&modal=mine",
  office_task_approved: "/khu-giao-dich?phong=van-phong&modal=mine",
  office_task_returned: "/khu-giao-dich?phong=van-phong&modal=mine",
  office_proposal_replied: "/khu-giao-dich?phong=van-phong&modal=mine",
  office_task_submitted: "/khu-giao-dich?phong=van-phong&modal=mgr",
  office_proposal_sent: "/khu-giao-dich?phong=van-phong&modal=mgr",
}

export const notificationKeys = {
  all: (userId: string | undefined) => ["notifications", userId] as const,
  settings: (userId: string | undefined) => ["notifications", userId, "settings"] as const,
  list: (userId: string | undefined) => ["notifications", userId, "list"] as const,
  unread: (userId: string | undefined) => ["notifications", userId, "unread"] as const,
}

export function fetchNotificationSettings(signal?: AbortSignal): Promise<NotificationSettings> {
  return api<NotificationSettings>("/me/notification-settings", { signal })
}

export function putNotificationSettings(body: NotificationSettingsInput): Promise<NotificationSettings> {
  return api<NotificationSettings>("/me/notification-settings", { method: "PUT", body: JSON.stringify(body) })
}

export function fetchNotifications(signal?: AbortSignal): Promise<NotificationList> {
  return api<NotificationList>(`/me/notifications?limit=${NOTIFICATION_LIST_LIMIT}`, { signal })
}

export function fetchUnreadCount(signal?: AbortSignal): Promise<{ unread_count: number }> {
  return api<{ unread_count: number }>("/me/notifications/unread-count", { signal })
}

export function markRead(body: { id: string } | { all: true }): Promise<{ unread_count: number }> {
  return api<{ unread_count: number }>("/me/notifications/read", { method: "POST", body: JSON.stringify(body) })
}

export function unsubscribe(token: string): Promise<UnsubscribeResult> {
  return api<UnsubscribeResult>("/notifications/unsubscribe", { method: "POST", body: JSON.stringify({ token }) })
}

/**
 * The card's switch rules (§8.2): the master off greys every row out; turning it on while both types
 * are off turns both on; turning both types off turns the master off.
 */
export function nextSettings(current: NotificationSettingsInput, change: { enabled?: boolean; bulletin?: boolean; bot_trades?: boolean; email?: boolean }): NotificationSettingsInput {
  const types = { ...current.types }
  let enabled = current.enabled
  if (change.bulletin !== undefined) types.bulletin = change.bulletin
  if (change.bot_trades !== undefined) types.bot_trades = change.bot_trades
  if (change.enabled !== undefined) {
    enabled = change.enabled
    if (enabled && !types.bulletin && !types.bot_trades) {
      types.bulletin = true
      types.bot_trades = true
    }
  } else if (!types.bulletin && !types.bot_trades) {
    enabled = false
  }
  return { enabled, types, channels: { email: change.email ?? current.channels.email } }
}

export function useNotificationSettings() {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: notificationKeys.settings(user?.id),
    queryFn: ({ signal }) => fetchNotificationSettings(signal),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 60_000,
  })
}

/** Saves the settings; the card shows the new value at once and rolls back on failure. */
export function useSaveNotificationSettings() {
  const { user } = useAuth()
  const client = useQueryClient()
  const key = notificationKeys.settings(user?.id)
  return useMutation({
    mutationFn: putNotificationSettings,
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<NotificationSettings>(key)
      if (previous) client.setQueryData<NotificationSettings>(key, { ...previous, ...input, channels: { ...previous.channels, ...input.channels } })
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    onSuccess: (saved) => client.setQueryData(key, saved),
  })
}

export function useUnreadCount() {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: notificationKeys.unread(user?.id),
    queryFn: ({ signal }) => fetchUnreadCount(signal),
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  })
}

export function useNotificationList(enabled: boolean) {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: notificationKeys.list(user?.id),
    queryFn: ({ signal }) => fetchNotifications(signal),
    enabled: isAuthenticated && enabled,
    retry: false,
    staleTime: 0,
  })
}

/** Marks one or all notifications read; the unread count comes back from the server. */
export function useMarkRead() {
  const { user } = useAuth()
  const client = useQueryClient()
  return useMutation({
    mutationFn: markRead,
    onMutate: (input) => {
      const now = new Date().toISOString()
      client.setQueryData<NotificationList>(notificationKeys.list(user?.id), (list) =>
        list
          ? {
              ...list,
              items: list.items.map((item) => ("all" in input || item.id === input.id) && !item.read_at ? { ...item, read_at: now } : item),
            }
          : list,
      )
    },
    onSuccess: (result) => {
      client.setQueryData(notificationKeys.unread(user?.id), { unread_count: result.unread_count })
      client.setQueryData<NotificationList>(notificationKeys.list(user?.id), (list) => (list ? { ...list, unread_count: result.unread_count } : list))
    },
    onError: () => void client.invalidateQueries({ queryKey: notificationKeys.all(user?.id) }),
  })
}
