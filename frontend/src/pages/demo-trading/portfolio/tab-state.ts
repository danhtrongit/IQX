export type PortfolioTab = "watchlist" | "holdings" | "history"

const TAB_STORAGE_KEY = "iqx.demo.portfolio.tab"

/** The tab last used in the "Danh mục" panel; storage may be unavailable, so it is optional. */
export function readStoredPortfolioTab(): PortfolioTab {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY)
    return stored === "holdings" || stored === "history" ? stored : "watchlist"
  } catch {
    return "watchlist"
  }
}

export function rememberPortfolioTab(tab: PortfolioTab): void {
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // Remembering the tab is a convenience; the panel works without it.
  }
}
