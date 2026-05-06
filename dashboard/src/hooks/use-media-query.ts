import { useState, useEffect } from "react"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query)
    setMatches(mediaQueryList.matches)

    const documentChangeHandler = () => setMatches(mediaQueryList.matches)

    // Fallback for older browsers (Safari < 14) that don't support addEventListener on MediaQueryList
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener("change", documentChangeHandler)
    } else {
      mediaQueryList.addListener(documentChangeHandler)
    }

    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener("change", documentChangeHandler)
      } else {
        mediaQueryList.removeListener(documentChangeHandler)
      }
    }
  }, [query])

  return matches
}
