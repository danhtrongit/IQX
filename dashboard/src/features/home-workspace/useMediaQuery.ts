import { useState, useEffect } from "react"

export function useMediaQuery(query: string): boolean {
  const getMatches = (): boolean => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false
    }
    return window.matchMedia(query).matches
  }

  const [matches, setMatches] = useState<boolean>(getMatches)

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }

    const mql = window.matchMedia(query)

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange)
    } else if (typeof (mql as { addListener?: unknown }).addListener === "function") {
      // legacy Safari fallback
      ;(mql as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(handleChange)
    }

    return () => {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", handleChange)
      } else if (typeof (mql as { removeListener?: unknown }).removeListener === "function") {
        ;(mql as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(handleChange)
      }
    }
  }, [query])

  return matches
}
