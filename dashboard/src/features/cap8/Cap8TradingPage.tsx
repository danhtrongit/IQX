import { useEffect } from "react"
import { Cap7TradingPage } from "@/features/cap7/Cap7TradingPage"
import { Cap8Provider } from "./Cap8Context"

const SEO_TITLE = "IQX Demo Trading · Cấp 8"

/**
 * Cấp 8 keeps its provider boundary while its exit journey is being realigned.
 * It deliberately inherits the live Cấp 7 allocation surface instead of the
 * removed order-book overlay and related client event contracts.
 */
export function Cap8TradingPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = SEO_TITLE
    return () => {
      document.title = previousTitle
    }
  }, [])

  return <Cap8Provider><Cap7TradingPage /></Cap8Provider>
}
