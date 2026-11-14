/** True on touch-first devices, where "press E" hints make no sense. */
export function isTouchDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  )
}

/** "2026-11-12" to "12/11". */
export function vnDate(session: string): string {
  return `${session.slice(8, 10)}/${session.slice(5, 7)}`
}

/** "09:05" in the browser's time zone. */
export function clock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** Where a SACO writes the nhận định (the admin area of the app). */
export const SACO_POSTS_PATH = "/admin/saco/posts"

/** Joins the class names that are set. Written out instead of template strings so the Tailwind prettier plugin cannot trim the separating spaces. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ")
}
