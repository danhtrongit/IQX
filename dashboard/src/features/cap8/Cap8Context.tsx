import { createContext, useContext, type ReactNode } from "react"

/** Provider boundary used to prevent Cấp 8 exit controls leaking into lower levels. */
const Cap8Context = createContext(false)

export function Cap8Provider({ children }: { children: ReactNode }) {
  return <Cap8Context.Provider value={true}>{children}</Cap8Context.Provider>
}
export function useCap8Active(): boolean {
  return useContext(Cap8Context)
}
