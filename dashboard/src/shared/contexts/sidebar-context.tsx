import { createContext, useContext, useState, type ReactNode } from "react"

export type SidebarPanel = "news" | "trading" | "watchlist" | "patterns"

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
