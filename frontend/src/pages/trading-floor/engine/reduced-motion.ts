/**
 * Checks whether the user prefers reduced motion (`prefers-reduced-motion: reduce`).
 * Kept in sync with `character-builder.ts` if/when exported there.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
