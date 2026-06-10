import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

interface SymbolContextValue {
  symbol: string
  setSymbol: (s: string) => void
}

const SymbolContext = createContext<SymbolContextValue>({
  symbol: "VNINDEX",
  setSymbol: () => {},
})

/** Provides the active ticker. `symbol` is normally fed from the URL param. */
export function SymbolProvider({ symbol: initial, children }: { symbol: string; children: ReactNode }) {
  const [symbol, setSymbol] = useState(initial)

  useEffect(() => {
    if (initial && initial !== symbol) setSymbol(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  return <SymbolContext.Provider value={{ symbol, setSymbol }}>{children}</SymbolContext.Provider>
}

export function useSymbol() {
  return useContext(SymbolContext)
}
