import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener?.("change", onChange)
  return () => media.removeEventListener?.("change", onChange)
}

function read() {
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches
}

/** Người học chọn giảm chuyển động: bỏ hoạt cảnh, hiện thẳng kết quả. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, read, () => false)
}
