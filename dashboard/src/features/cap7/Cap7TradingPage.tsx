import { useEffect } from "react"
import { Cap6TradingPage } from "@/features/cap6/Cap6TradingPage"
import { Cap7Provider } from "./Cap7Context"
import { GraduationModalCap7 } from "./GraduationModalCap7"

const SEO_TITLE = "IQX Demo Trading · Cấp 7 «Quản trị danh mục»"

/** Cấp 7 adds a provider-gated live allocation journey to the cumulative trading shell. */
export function Cap7TradingPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = SEO_TITLE
    return () => {
      document.title = previousTitle
    }
  }, [])

  return <Cap7Provider><Cap6TradingPage /><GraduationModalCap7 /></Cap7Provider>
}
