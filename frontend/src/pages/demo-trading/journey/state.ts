/** Whitelisted local instrumentation; never includes answers or trading data. */
export function identityEvent(name: string, fields: Record<string, string | number | boolean> = {}) {
  window.dispatchEvent(new CustomEvent("iqx:identity-telemetry", { detail: { name, ...fields } }))
}
