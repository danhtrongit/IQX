import { useEffect } from "react"
import { Cap7TradingPage } from "@/features/cap7/Cap7TradingPage"
import { Cap8Provider } from "./Cap8Context"
import { GraduationModalCap8 } from "./GraduationModalCap8"

const SEO_TITLE = "IQX Demo Trading · Cấp 8"

/**
 * Level 8 inherits the cumulative trading shell and adds only a provider-gated
 * exit surface; allocation analysis continues to come from Level 7.
 */
export function Cap8TradingPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = SEO_TITLE
    return () => {
      document.title = previousTitle
    }
  }, [])

  return <Cap8Provider><Cap7TradingPage /><GraduationModalCap8 /></Cap8Provider>
}
