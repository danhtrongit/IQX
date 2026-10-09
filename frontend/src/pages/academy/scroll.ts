/** Scrolling helpers that only ever move the left (reader) area, never the page or the Học viện panel. */

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** The scrolling element (the ScrollArea viewport) that contains `element`. */
export function scrollContainerOf(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>("[data-slot=scroll-area-viewport]")
}

/** Scrolls the reader area so `target` sits at its top; instant when the learner prefers reduced motion. */
export function scrollReaderTo(target: HTMLElement | null, offset = 8): void {
  if (!target) return
  const container = scrollContainerOf(target)
  if (!container) {
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" })
    return
  }
  const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - offset
  if (typeof container.scrollTo === "function") container.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" })
  else container.scrollTop = Math.max(0, top)
}

export function scrollReaderToTop(from: Element | null): void {
  if (!from) return
  const container = scrollContainerOf(from)
  if (!container) return
  if (typeof container.scrollTo === "function") container.scrollTo({ top: 0, behavior: "auto" })
  else container.scrollTop = 0
}
