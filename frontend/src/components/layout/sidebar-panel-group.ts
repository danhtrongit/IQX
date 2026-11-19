import { createContext, useContext, type ReactNode } from "react"

/**
 * Several existing panels shown as tabs of one panel (layout v1.3 §3, Giao dịch): each panel keeps its
 * content, description and actions, but its header carries the group's title and the tab bar sits right
 * under it.
 */
export type SidebarPanelGroup = { title: string; tabs: ReactNode }

export const SidebarPanelGroupContext = createContext<SidebarPanelGroup | null>(null)

export function useSidebarPanelGroup(): SidebarPanelGroup | null {
  return useContext(SidebarPanelGroupContext)
}
