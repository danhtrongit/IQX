import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { PanelRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RailMenu } from "@/components/layout/rail-menu"
import { RightSidebar } from "@/components/layout/right-sidebar"
import { cn } from "@/lib/utils"

import "./workspace-frame.css"
import {
  WorkspaceFrameContext,
  WorkspaceToggleRegistryContext,
  useWorkspaceFrame,
  useWorkspaceToggleRegistry,
  type WorkspaceFrameState,
} from "./workspace-frame-context"

const OVERLAY_QUERY = "(max-width: 900px)"

function subscribeOverlay(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {}
  const media = window.matchMedia(OVERLAY_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function overlaySnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia(OVERLAY_QUERY).matches
}

/**
 * Main content on the left, the context panel in the middle and the tool rail at
 * the far right. At 900px and below the panel is a slide-over layer next to the
 * rail: it is opened from the rail or from `WorkspacePanelToggle`, closes with its
 * close button or Escape (focus returns to the toggle), and while closed it takes
 * neither focus nor clicks.
 */
export function WorkspaceFrame({
  main,
  panel,
  panelLabel,
  defaultPanelOpen = false,
}: {
  main: ReactNode
  panel: ReactNode
  /** Accessible name of the panel, normally the active tool's label. */
  panelLabel: string
  /** Start with the layer open when it is a layer (for example on a direct link to a tool). */
  defaultPanelOpen?: boolean
}) {
  const panelId = useId()
  const [panelElement, setPanelElement] = useState<HTMLElement | null>(null)
  const [toggleElement, setToggleElement] = useState<HTMLButtonElement | null>(null)
  const overlay = useSyncExternalStore(subscribeOverlay, overlaySnapshot, () => false)
  const [openState, setOpenState] = useState(defaultPanelOpen)
  const [wasOverlay, setWasOverlay] = useState(overlay)
  if (wasOverlay !== overlay) {
    // Crossing the breakpoint either way starts the layer closed; a stale "open"
    // must not pop up after a resize.
    setWasOverlay(overlay)
    setOpenState(false)
  }
  const open = overlay && openState

  // Escape closes the layer wherever focus is, unless a menu or dialog already took the key.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      setOpenState(false)
      toggleElement?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, toggleElement])

  const state = useMemo<WorkspaceFrameState>(() => {
    const focusClose = () =>
      window.requestAnimationFrame(() => {
        panelElement?.querySelector<HTMLElement>("[data-panel-close]")?.focus()
      })
    return {
      open,
      overlay,
      panelId,
      panelLabel,
      setOpen: (next) => {
        setOpenState(next)
        if (next) focusClose()
        else toggleElement?.focus()
      },
      revealPanel: () => {
        if (!overlay) return
        setOpenState(true)
        focusClose()
      },
    }
  }, [open, overlay, panelId, panelLabel, panelElement, toggleElement])

  return (
    <WorkspaceFrameContext.Provider value={state}>
      <WorkspaceToggleRegistryContext.Provider value={setToggleElement}>
        <div className="workspace-frame" data-panel-open={open} data-testid="workspace-frame">
          <main className="workspace-main flex min-h-0 min-w-0 flex-col overflow-hidden">{main}</main>
          <RightSidebar
            ref={setPanelElement}
            id={panelId}
            label={panelLabel}
            className="workspace-panel border-l"
          >
            {panel}
          </RightSidebar>
          <RailMenu />
        </div>
      </WorkspaceToggleRegistryContext.Provider>
    </WorkspaceFrameContext.Provider>
  )
}

/** Opens the slide-over panel; only shown while the panel is a layer (≤900px). */
export function WorkspacePanelToggle({ label, className }: { label?: string; className?: string }) {
  const frame = useWorkspaceFrame()
  const register = useWorkspaceToggleRegistry()
  // Only a layer needs a button; on wide screens the panel is always on screen.
  if (!frame?.overlay) return null
  return (
    <Button
      ref={register}
      type="button"
      variant="outline"
      size="sm"
      aria-expanded={frame.open}
      aria-controls={frame.panelId}
      onClick={() => frame.setOpen(!frame.open)}
      className={cn("shrink-0", className)}
    >
      <PanelRight aria-hidden="true" />
      <span className="max-w-24 truncate max-[480px]:sr-only">{label ?? frame.panelLabel}</span>
    </Button>
  )
}
