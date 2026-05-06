import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface SymbolContextType {
  symbol: string
  setSymbol: (s: string) => void
}

const SymbolContext = createContext<SymbolContextType>({
  symbol: "VNINDEX",
  setSymbol: () => {},
})

export function SymbolProvider({ symbol: initial, children }: { symbol: string; children: ReactNode }) {
  const [symbol, setSymbol] = useState(initial)

  // Sync internal state when the prop (from URL) changes
  useEffect(() => {
    if (initial && initial !== symbol) {
      setSymbol(initial)
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SymbolContext.Provider value={{ symbol, setSymbol }}>
      {children}
    </SymbolContext.Provider>
  )
}

export function useSymbol() {
  return useContext(SymbolContext)
}
