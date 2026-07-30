import { createContext, useContext, useState, type ReactNode } from "react"

export type SidebarPanel =
  | "news"
  | "trading"
  | "watchlist"
  | "patterns"
  | "journey"
  // Cấp 1 "Phân tích danh mục" (spec §7) — only reachable from
  // `JourneyPanelCap1`'s button while inside `Cap1Provider`; harmless
  // elsewhere (mirrors "journey"'s own doc).
  | "cap1-analysis"
  // Cấp 2 "Phân tích danh mục" (spec §12) — only reachable from
  // `JourneyPanelCap2`'s button while inside `Cap2Provider`; harmless
  // elsewhere (mirrors "cap1-analysis"'s own doc, one level up).
  | "cap2-analysis"
  // Cấp 3 "Phân tích danh mục" (Cấp 3 spec §8) — only reachable from
  // `JourneyPanelCap3`'s button while inside `Cap3Provider`; harmless
  // elsewhere (mirrors "cap2-analysis"'s own doc, one level up).
  | "cap3-analysis"
  // Cấp 4 "Phân tích danh mục" (Cấp 4 spec §7) — only reachable from
  // `JourneyPanelCap4`'s button while inside `Cap4Provider`; harmless
  // elsewhere (mirrors "cap3-analysis"'s own doc, one level up).
  | "cap4-analysis"

interface SidebarContextValue {
  activePanel: SidebarPanel
  setActivePanel: (panel: SidebarPanel) => void
  togglePanel: (panel: SidebarPanel) => void
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  forecastWindowOpen: boolean
  openForecastWindow: () => void
  closeForecastWindow: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  activePanel: "news",
  setActivePanel: () => {},
  togglePanel: () => {},
  isOpen: false,
  setIsOpen: () => {},
  forecastWindowOpen: false,
  openForecastWindow: () => {},
  closeForecastWindow: () => {},
})

export function SidebarProvider({
  defaultPanel = "news",
  children,
}: {
  defaultPanel?: SidebarPanel
  children: ReactNode
}) {
  const [activePanel, setActivePanel] = useState<SidebarPanel>(defaultPanel)
  const [isOpen, setIsOpen] = useState(false)
  const [forecastWindowOpen, setForecastWindowOpen] = useState(false)

  const togglePanel = (panel: SidebarPanel) => {
    setActivePanel((prev) => {
      if (prev === panel) {
        setIsOpen((prevOpen) => !prevOpen)
        return prev
      }
      setIsOpen(true)
      return panel
    })
  }

  const handleSetActivePanel = (panel: SidebarPanel) => {
    setActivePanel(panel)
    setIsOpen(true)
  }

  return (
    <SidebarContext.Provider
      value={{
        activePanel,
        setActivePanel: handleSetActivePanel,
        togglePanel,
        isOpen,
        setIsOpen,
        forecastWindowOpen,
        openForecastWindow: () => setForecastWindowOpen(true),
        closeForecastWindow: () => setForecastWindowOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
