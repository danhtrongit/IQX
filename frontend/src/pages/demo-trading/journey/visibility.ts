import { useEffect, useState, type RefObject } from "react"

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const changed = () => setReduced(media.matches)
    media.addEventListener("change", changed)
    return () => media.removeEventListener("change", changed)
  }, [])
  return reduced
}

const visibilityFractions = [.2, .5, .8]

export function isStageVisible(node: HTMLElement | null) {
  if (!node || document.visibilityState !== "visible") return false
  const rect = node.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  for (const px of visibilityFractions) {
    for (const py of visibilityFractions) {
      const x = rect.left + rect.width * px
      const y = rect.top + rect.height * py
      if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && node.contains(hit)) return true
    }
  }
  return false
}

/** Occlusion is measured, not inferred from the selected functional tab. */
export function useStageVisibility(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let frame = 0
    const measure = () => setVisible(isStageVisible(node))
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const intersection = new IntersectionObserver(schedule)
    const resize = new ResizeObserver(schedule)
    const overlays = new MutationObserver(records => {
      // Sprite frames update an inline transform inside the stage. Those
      // mutations cannot change occlusion and must not force nine hit tests.
      if (records.some(record => !node.contains(record.target))) schedule()
    })
    intersection.observe(node)
    resize.observe(node)
    overlays.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "style", "hidden", "open", "aria-hidden"] })
    document.addEventListener("visibilitychange", schedule)
    document.addEventListener("transitionend", schedule)
    document.addEventListener("animationend", schedule)
    window.addEventListener("resize", schedule)
    window.addEventListener("scroll", schedule, true)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      intersection.disconnect(); resize.disconnect(); overlays.disconnect()
      document.removeEventListener("visibilitychange", schedule)
      document.removeEventListener("transitionend", schedule)
      document.removeEventListener("animationend", schedule)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", schedule, true)
    }
  }, [ref])
  return visible
}
