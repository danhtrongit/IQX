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
  // Cấp 5 "Phân tích danh mục" (Cấp 5 spec §6) — only reachable from
  // `JourneyPanelCap5`'s button while inside `Cap5Provider`; harmless
  // elsewhere (mirrors "cap4-analysis"'s own doc, one level up).
  | "cap5-analysis"
  // Cấp 5 «Săn mã» (spec §5) và «Watchlist» (spec §6) — hai màn MỚI của Cấp 5,
  // chỉ tới được từ `RightToolbar` khi `isCap5Active`; ngoài Cấp 5 chúng rơi về
  // đúng nhánh phòng thủ như "cap5-analysis" (`SidebarProvider` là singleton
  // app-root nên `activePanel` có thể còn sót giá trị cũ).
  | "cap5-sanma"
  | "cap5-watchlist"
  // Cấp 6 "Phân tích danh mục" (Cấp 6 spec §7) — only reachable from
  // `JourneyPanelCap6`'s button while inside `Cap6Provider`; harmless
  // elsewhere (mirrors "cap5-analysis"'s own doc, one level up).
  | "cap6-analysis"
  // Cấp 7 "Phân tích danh mục" (Cấp 7 spec §7) — only reachable from
  // `JourneyPanelCap7`'s button while inside `Cap7Provider`; harmless
  // elsewhere (mirrors "cap6-analysis"'s own doc, one level up).
  | "cap7-analysis"
  // Cấp 8 "Phân tích danh mục" (Cấp 8 spec §7) — only reachable from
  // `JourneyPanelCap8`'s button while inside `Cap8Provider`; harmless
  // elsewhere (mirrors "cap7-analysis"'s own doc, one level up).
  | "cap8-analysis"

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
