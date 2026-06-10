import { createContext, useContext, useState, type ReactNode } from "react"

// ─── Selected-sector context ────────────────────────────
// Shared between SectorDataPanel (click a sector row) and AISectorAnalysisPanel
// (auto-selects the matching ICB code). Ported from dashboard-bak SectorContext.

interface SectorContextValue {
  selectedSectorCode: string | null
  setSelectedSectorCode: (code: string | null) => void
}

const SectorContext = createContext<SectorContextValue>({
  selectedSectorCode: null,
  setSelectedSectorCode: () => {},
})

export function SectorProvider({ children }: { children: ReactNode }) {
  const [selectedSectorCode, setSelectedSectorCode] = useState<string | null>(null)
  return (
    <SectorContext.Provider value={{ selectedSectorCode, setSelectedSectorCode }}>
      {children}
    </SectorContext.Provider>
  )
}

export function useSelectedSector() {
  return useContext(SectorContext)
}
