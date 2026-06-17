import { api } from "@/shared/http/client"
import type {
  AlertEvent,
  AlertSignal,
  CreateRuleBody,
  Combination,
  TelegramLink,
  TelegramStatus,
  UserAlertRule,
} from "./types"

export const alertsApi = {
  getSignals: (): Promise<AlertSignal[]> => api.get("alerts/signals").json<AlertSignal[]>(),
  getRules: (): Promise<UserAlertRule[]> => api.get("alerts/rules").json<UserAlertRule[]>(),
  createRule: (body: CreateRuleBody): Promise<UserAlertRule> =>
    api.post("alerts/rules", { json: body }).json<UserAlertRule>(),
  updateRule: (
    id: string,
    body: { name?: string; combination?: Combination; is_enabled?: boolean },
  ): Promise<UserAlertRule> => api.put(`alerts/rules/${id}`, { json: body }).json<UserAlertRule>(),
  deleteRule: (id: string): Promise<void> => api.delete(`alerts/rules/${id}`).then(() => undefined),
  getEvents: (): Promise<AlertEvent[]> => api.get("alerts/events").json<AlertEvent[]>(),
  telegramStatus: (): Promise<TelegramStatus> => api.get("alerts/telegram").json<TelegramStatus>(),
  telegramLink: (): Promise<TelegramLink> => api.post("alerts/telegram/link").json<TelegramLink>(),
  telegramUnlink: (): Promise<void> => api.delete("alerts/telegram").then(() => undefined),
}
