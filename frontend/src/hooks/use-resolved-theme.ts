import { useSyncExternalStore } from "react"

import { useTheme } from "@/components/theme-provider"

const QUERY = "(prefers-color-scheme: dark)"

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener("change", onStoreChange)
  return () => mq.removeEventListener("change", onStoreChange)
}

function snapshot() {
  return window.matchMedia(QUERY).matches
}

export function useResolvedTheme(): "dark" | "light" {
  const { theme } = useTheme()
  const systemDark = useSyncExternalStore(subscribe, snapshot, () => true)
  if (theme === "dark") return "dark"
  if (theme === "light") return "light"
  return systemDark ? "dark" : "light"
}
