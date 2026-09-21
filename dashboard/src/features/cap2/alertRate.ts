/**
 * UI-only mapping for the escalation already decided by the durable backend.
 * Quota, clean-10 auto-mute and ignored streak must never be recomputed here.
 */
export const GREYED_CONFIRM_SECONDS = 5

export type AlertLevel = "thuong" | "greyed5s" | "typeToConfirm"
