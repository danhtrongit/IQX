/**
 * Best-effort tour/lesson telemetry. UI events never grant progress or
 * authorize trades, so every failure is swallowed — a telemetry outage must
 * never interrupt a tour.
 */
import { api, getAccessToken } from "@/lib/api"

export type JourneyEventFields = Record<string, string | number | boolean | null>

export function trackJourneyEvent(name: string, fields: JourneyEventFields = {}): void {
  try {
    if (!getAccessToken() || !globalThis.crypto?.randomUUID) return
    const event = { event_id: crypto.randomUUID(), name, fields }
    void api("/journey/events", { method: "POST", body: JSON.stringify(event) }).catch(() => {})
  } catch {
    // Never surface a telemetry failure to the user.
  }
}
