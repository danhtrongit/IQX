import { useSyncExternalStore } from "react"

const NARROW = "(max-width: 1023px)"

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const media = window.matchMedia(NARROW)
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

function snapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches
}

/** True below 1024px, where the library moves into a drawer opened by the toolbar button. */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}


/** Accent-insensitive, case-insensitive match used by both library searches. */
export function matchesQuery(text: string, query: string): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN")
  const needle = normalize(query.trim())
  return needle === "" || normalize(text).includes(needle)
}
