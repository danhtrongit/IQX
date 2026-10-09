import { createContext, useContext } from "react"

export type WorkspaceFrameState = {
  /** Slide-over panel (≤900px). Always `false` on wider screens, where the panel is a fixed column. */
  open: boolean
  /** `true` while the panel is a layer next to the rail instead of a column. */
  overlay: boolean
  panelId: string
  panelLabel: string
  setOpen: (open: boolean) => void
  /** Opens the panel when it is a layer; a no-op on wide screens. */
  revealPanel: () => void
}

export const WorkspaceFrameContext = createContext<WorkspaceFrameState | null>(null)

export function useWorkspaceFrame(): WorkspaceFrameState | null {
  return useContext(WorkspaceFrameContext)
}

type ToggleRegistry = (element: HTMLButtonElement | null) => void

/** Callback ref the frame hands to its toggle button, so Escape/close can return focus to it. */
export const WorkspaceToggleRegistryContext = createContext<ToggleRegistry | null>(null)

export function useWorkspaceToggleRegistry(): ToggleRegistry | null {
  return useContext(WorkspaceToggleRegistryContext)
}
