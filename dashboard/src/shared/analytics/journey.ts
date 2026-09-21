import { api, getAccessToken } from "@/shared/http/client"

export type JourneyEventFields = Record<string, string | number | boolean | null>

/** Best-effort diagnostics; UI events never grant progress or authorize trades. */
export function trackJourneyEvent(name: string, fields: JourneyEventFields = {}): void {
  try {
    if (!getAccessToken() || !globalThis.crypto?.randomUUID) return
    const event = { event_id: crypto.randomUUID(), name, fields }
    void api.post("journey/events", { json: event, timeout: 5000 }).catch(() => {})
  } catch {
    // A telemetry failure must never interrupt a lesson, order, or animation.
  }
}
