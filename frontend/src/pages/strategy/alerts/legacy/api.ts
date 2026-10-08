/**
 * "Cảnh báo cũ": the rule-based alerts and Telegram link that existed before the Strategy
 * alerts. Their endpoints (`/alerts/rules`, `/alerts/events`, `/alerts/telegram`) are untouched,
 * so existing rules stay visible and can still be paused or deleted. New alerts are created
 * with the pinned-snapshot alerts of the main section only.
 */
import { api } from "@/lib/api"

type Raw = Record<string, unknown>

export type LegacyLogic = "AND" | "OR"

export type LegacyCondition = { indicator: string; op: string; value: number | string | null; join?: LegacyLogic | null }
export type LegacyCombination = { logic: LegacyLogic; conditions: LegacyCondition[] }

export type LegacyRule = {
  id: string
  name: string
  side: "buy" | "sell"
  baseSignalKey: string | null
  combination: LegacyCombination | null
  isEnabled: boolean
}

export type LegacyEvent = {
  id: string
  symbol: string
  signalKey: string | null
  sessionDate: string
  firedAt: string
  price: number | null
  delivered: boolean
}

export type TelegramStatus = { linked: boolean; linkedAt: string | null; botUsername: string | null }
export type TelegramLink = { deepLink: string; token: string }

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function rows(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[]
  const wrapped = record(payload)
  if (!wrapped) return []
  const items = wrapped.items ?? wrapped.data
  return Array.isArray(items) ? (items as Raw[]) : []
}

function toCombination(payload: unknown): LegacyCombination | null {
  const raw = record(payload)
  if (!raw) return null
  const conditions = rows(raw.conditions).flatMap((item) => {
    const indicator = str(item.indicator)
    const op = str(item.op)
    if (!indicator || !op) return []
    const value = item.value
    const condition: LegacyCondition = { indicator, op, value: typeof value === "number" || typeof value === "string" ? value : null }
    return [condition]
  })
  return { logic: raw.logic === "OR" ? "OR" : "AND", conditions }
}

function toRule(raw: Raw): LegacyRule | null {
  const id = str(raw.id)
  const name = str(raw.name)
  if (!id || !name) return null
  return {
    id,
    name,
    side: raw.side === "sell" ? "sell" : "buy",
    baseSignalKey: str(raw.base_signal_key),
    combination: toCombination(raw.combination),
    isEnabled: bool(raw.is_enabled) ?? true,
  }
}

export async function fetchLegacyRules(signal?: AbortSignal): Promise<LegacyRule[]> {
  const payload = await api<unknown>("/alerts/rules", { signal })
  return rows(payload).flatMap((raw) => {
    const rule = toRule(raw)
    return rule ? [rule] : []
  })
}

/** Pause or resume one legacy rule; its conditions are not touched. */
export async function setLegacyRuleEnabled(id: string, isEnabled: boolean): Promise<void> {
  await api<unknown>(`/alerts/rules/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ is_enabled: isEnabled }),
  })
}

export async function deleteLegacyRule(id: string): Promise<void> {
  await api<unknown>(`/alerts/rules/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function fetchLegacyEvents(signal?: AbortSignal): Promise<LegacyEvent[]> {
  const payload = await api<unknown>("/alerts/events", { signal })
  return rows(payload).flatMap((raw) => {
    const id = str(raw.id)
    const symbol = str(raw.symbol)
    const firedAt = str(raw.fired_at)
    if (!id || !symbol || !firedAt) return []
    return [{ id, symbol, signalKey: str(raw.signal_key), sessionDate: str(raw.session_date) ?? "", firedAt, price: num(raw.price), delivered: bool(raw.delivered) ?? false }]
  })
}

export async function fetchTelegramStatus(signal?: AbortSignal): Promise<TelegramStatus> {
  const raw = record(await api<Raw>("/alerts/telegram", { signal })) ?? {}
  return { linked: bool(raw.linked) ?? false, linkedAt: str(raw.linked_at), botUsername: str(raw.bot_username) }
}

export async function createTelegramLink(): Promise<TelegramLink> {
  const raw = record(await api<Raw>("/alerts/telegram/link", { method: "POST" })) ?? {}
  return { deepLink: str(raw.deep_link) ?? "", token: str(raw.token) ?? "" }
}

export async function unlinkTelegram(): Promise<void> {
  await api<unknown>("/alerts/telegram", { method: "DELETE" })
}

