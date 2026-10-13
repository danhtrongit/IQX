import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { PanelRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RailMenu, type WorkspaceRail } from "@/components/layout/rail-menu"
import { RightSidebar } from "@/components/layout/right-sidebar"
import type { RailItem } from "@/config/chrome"
import { useRail } from "@/context/rail"
import { cn } from "@/lib/utils"

import "./workspace-frame.css"
import {
  WorkspaceFrameContext,
  WorkspaceToggleRegistryContext,
  useWorkspaceFrame,
  useWorkspaceToggleRegistry,
  type WorkspaceFrameState,
} from "./workspace-frame-context"

export type { WorkspaceRail } from "@/components/layout/rail-menu"

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

/** The route's rail as before: every visible tool, selected through the URL. */
function useRouteRail(): WorkspaceRail {
  const { chrome, activeId, activeContentId, setActive } = useRail()
  return {
    items: chrome.items.filter((item) => !item.hidden),
    activeTool: activeId,
    mainToolId: activeContentId,
    onSelectTool: setActive,
    onSelectMainTool: setActive,
  }
}

/**
 * Main content on the left, the context panel in the middle and the tool rail at
 * the far right. A second click on the tool whose panel is showing hides the panel;
 * any other tool shows it (layout v1.2 §5.1).
 *
 * Wide screens: a hidden panel collapses and its width goes to the main area; the
 * panel stays mounted (form input, scroll position...) but takes neither focus nor
 * clicks. At 900px and below the panel is a slide-over layer next to the rail: it is
 * opened from the rail or from `WorkspacePanelToggle`, closes with its close button
 * or Escape (focus returns to the control that opened it), and while closed it takes
 * neither focus nor clicks.
 */
export function WorkspaceFrame({
  main,
  panel,
  panelLabel,
  defaultPanelOpen = false,
  revealKey,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  rail: railProp,
}: {
  main: ReactNode
  panel: ReactNode
  /** Accessible name of the panel, normally the active tool's label. */
  panelLabel: string
  /** Start with the layer open when it is a layer (for example on a direct link to a tool). */
  defaultPanelOpen?: boolean
  /** Opens the layer whenever this value changes to a new non-null value (a direct link to a tool). */
  revealKey?: string | null
  /** Wide screens: the panel column is collapsed. Uncontrolled when omitted. */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** Rail tools and their selection; defaults to the route's chrome. */
  rail?: WorkspaceRail
}) {
  const panelId = useId()
  const routeRail = useRouteRail()
  const rail = railProp ?? routeRail
  const [panelElement, setPanelElement] = useState<HTMLElement | null>(null)
  const [toggleElement, setToggleElement] = useState<HTMLButtonElement | null>(null)
  // The control that last opened the layer; Escape and the close button return focus to it.
  const triggerRef = useRef<HTMLElement | null>(null)
  const overlay = useSyncExternalStore(subscribeOverlay, overlaySnapshot, () => false)
  const [openState, setOpenState] = useState(defaultPanelOpen)
  const [wasOverlay, setWasOverlay] = useState(overlay)
  if (wasOverlay !== overlay) {
    // Crossing the breakpoint either way starts the layer closed; a stale "open"
    // must not pop up after a resize.
    setWasOverlay(overlay)
    setOpenState(false)
  }
  const [seenRevealKey, setSeenRevealKey] = useState(revealKey)
  if (seenRevealKey !== revealKey) {
    setSeenRevealKey(revealKey)
    if (revealKey) setOpenState(true)
  }
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false)
  const collapsedValue = controlledCollapsed ?? uncontrolledCollapsed
  const open = overlay && openState
  const collapsed = !overlay && collapsedValue
  const panelShown = overlay ? open : !collapsed

  const setCollapsed = useCallback((next: boolean) => {
    if (controlledCollapsed === undefined) setUncontrolledCollapsed(next)
    onCollapsedChange?.(next)
  }, [controlledCollapsed, onCollapsedChange])

  const focusTrigger = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger?.isConnected && trigger.offsetParent !== null) trigger.focus()
    else toggleElement?.focus()
  }, [toggleElement])

  const focusClose = useCallback(() => {
    window.requestAnimationFrame(() => {
      panelElement?.querySelector<HTMLElement>("[data-panel-close]")?.focus()
    })
  }, [panelElement])

  // Escape closes the layer wherever focus is, unless a menu or dialog already took the key.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      setOpenState(false)
      focusTrigger()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, focusTrigger])

  const state = useMemo<WorkspaceFrameState>(() => ({
    open,
    overlay,
    collapsed,
    panelId,
    panelLabel,
    setOpen: (next) => {
      setOpenState(next)
      if (next) {
        triggerRef.current = null
        focusClose()
      } else {
        focusTrigger()
      }
    },
    revealPanel: () => {
      if (!overlay) {
        setCollapsed(false)
        return
      }
      setOpenState(true)
      focusClose()
    },
  }), [open, overlay, collapsed, panelId, panelLabel, setCollapsed, focusTrigger, focusClose])

  function selectRailItem(item: RailItem, button: HTMLElement) {
    if (item.affects === "left") {
      // A main-area tool (Insight): entering it hides the panel; leaving it keeps the panel as it is.
      const entering = rail.mainToolId !== item.id
      rail.onSelectMainTool(item.id)
      if (entering) {
        if (overlay) setOpenState(false)
        else setCollapsed(true)
      }
      return
    }
    if (item.id === rail.activeTool && panelShown) {
      if (overlay) setOpenState(false)
      else setCollapsed(true)
      button.focus()
      return
    }
    rail.onSelectTool(item.id)
    if (overlay) {
      triggerRef.current = button
      setOpenState(true)
      focusClose()
    } else {
      setCollapsed(false)
    }
  }

  return (
    <WorkspaceFrameContext.Provider value={state}>
      <WorkspaceToggleRegistryContext.Provider value={setToggleElement}>
        <div className="workspace-frame" data-panel-open={open} data-panel-collapsed={collapsed} data-testid="workspace-frame">
          <main className="workspace-main flex min-h-0 min-w-0 flex-col overflow-hidden">{main}</main>
          <RightSidebar
            ref={setPanelElement}
            id={panelId}
            label={panelLabel}
            inert={!panelShown}
            className="workspace-panel border-l"
          >
            {panel}
          </RightSidebar>
          <RailMenu rail={rail} panelId={panelId} panelShown={panelShown} onSelect={selectRailItem} />
        </div>
      </WorkspaceToggleRegistryContext.Provider>
    </WorkspaceFrameContext.Provider>
  )
}

/** Opens the slide-over panel; only shown while the panel is a layer (≤900px). */
export function WorkspacePanelToggle({ label, className }: { label?: string; className?: string }) {
  const frame = useWorkspaceFrame()
  const register = useWorkspaceToggleRegistry()
  // Only a layer needs a button; on wide screens the rail shows and hides the panel.
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
