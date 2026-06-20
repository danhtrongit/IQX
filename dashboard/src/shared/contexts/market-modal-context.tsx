import { createContext, useContext, useState, type ReactNode } from "react"

type Ctx = { isOpen: boolean; openMarketModal: () => void; closeMarketModal: () => void }
const MarketModalCtx = createContext<Ctx | null>(null)

export function MarketModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <MarketModalCtx.Provider value={{ isOpen, openMarketModal: () => setIsOpen(true), closeMarketModal: () => setIsOpen(false) }}>
      {children}
    </MarketModalCtx.Provider>
  )
}

export function useMarketModal(): Ctx {
  const v = useContext(MarketModalCtx)
  if (!v) throw new Error("useMarketModal must be used within MarketModalProvider")
  return v
}
