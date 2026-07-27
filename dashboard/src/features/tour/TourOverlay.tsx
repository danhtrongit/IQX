import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import type { TourConfig, TourStep } from "./tourTypes"
import type { TourController } from "./useTour"
import "./tour.css"

export interface TourOverlayProps {
  config: TourConfig
  controller: TourController
}

/** Total visual-transition window per step change (Global Constraints: "350-400ms"). */
const TRANSITION_MS = 380
/** Extra settle time after `scrollIntoView` before the final reposition measurement. */
const SCROLL_SETTLE_MS = 300
/** Padding around the spotlight hole (Global Constraints: "đệm 9px"). */
const HOLE_PADDING = 9
const TOOLTIP_GAP = 14
const VIEWPORT_MARGIN = 12
/**
 * Bound on re-resolving a non-`centered` step's target when it isn't in the
 * DOM yet on the first attempt (~1s at one rAF tick each) — see the
 * `useLayoutEffect` below for why this race exists.
 */
const TARGET_POLL_MAX_FRAMES = 30

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function resolveTarget(step: TourStep): HTMLElement | null {
  if (step.centered) return null
  if (step.targetId) {
    const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`)
    if (el) return el
  }
  if (step.targetSelector) {
    const el = document.querySelector<HTMLElement>(step.targetSelector)
    if (el) return el
  }
  return null
}

function isInViewport(rect: DOMRect): boolean {
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
}

function toHole(rect: DOMRect): Rect {
  return {
    top: rect.top - HOLE_PADDING,
    left: rect.left - HOLE_PADDING,
    width: rect.width + HOLE_PADDING * 2,
    height: rect.height + HOLE_PADDING * 2,
  }
}

/**
 * The 4 rectangles that tile the viewport around the hole (top/bottom/left/
 * right bands) — each is a REAL element, so besides painting the dim colour
 * they also correctly block clicks on the underlying page outside the
 * spotlight. Deliberately not a single box-shadow/clip-path cutout: that
 * technique either doesn't block clicks (box-shadow) or needs a fill-rule
 * argument to `clip-path: polygon()` that isn't reliably supported. `null`
 * hole (centered step, or target not found) → one full-viewport band.
 */
function dimBands(hole: Rect | null): Rect[] {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!hole) return [{ top: 0, left: 0, width: vw, height: vh }]

  const holeTop = Math.max(hole.top, 0)
  const holeLeft = Math.max(hole.left, 0)
  const holeBottom = hole.top + hole.height
  const holeRight = hole.left + hole.width

  return [
    { top: 0, left: 0, width: vw, height: Math.max(holeTop, 0) }, // top band
    { top: holeBottom, left: 0, width: vw, height: Math.max(vh - holeBottom, 0) }, // bottom band
    { top: holeTop, left: 0, width: Math.max(holeLeft, 0), height: Math.max(hole.height, 0) }, // left band
    { top: holeTop, left: holeRight, width: Math.max(vw - holeRight, 0), height: Math.max(hole.height, 0) }, // right band
  ]
}

/**
 * Tooltip position: below → right → left, clamped inside the viewport
 * (Global Constraints). `hole === null` (centered step, or target not found)
 * always centers the tooltip on screen instead.
 */
function computeTooltipStyle(
  hole: Rect | null,
  placement: TourStep["placement"],
  size: { width: number; height: number },
): CSSProperties {
  if (!hole) {
    return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
  }

  const { width: tw, height: th } = size
  const order: Array<"below" | "right" | "left"> =
    placement === "right" ? ["right", "below", "left"] : placement === "left" ? ["left", "below", "right"] : ["below", "right", "left"]

  const candidates: Record<"below" | "right" | "left", { top: number; left: number }> = {
    below: { top: hole.top + hole.height + TOOLTIP_GAP, left: hole.left },
    right: { top: hole.top, left: hole.left + hole.width + TOOLTIP_GAP },
    left: { top: hole.top, left: hole.left - tw - TOOLTIP_GAP },
  }

  let chosen = candidates[order[0]]
  for (const key of order) {
    const c = candidates[key]
    const fits = c.top >= 0 && c.left >= 0 && c.top + th <= window.innerHeight && c.left + tw <= window.innerWidth
    if (fits) {
      chosen = c
      break
    }
  }

  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tw - VIEWPORT_MARGIN)
  const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - th - VIEWPORT_MARGIN)
  return {
    position: "fixed",
    left: Math.min(Math.max(chosen.left, VIEWPORT_MARGIN), maxLeft),
    top: Math.min(Math.max(chosen.top, VIEWPORT_MARGIN), maxTop),
  }
}

/**
 * Renders the active step of a tour via a `document.body` portal: dimmed
 * backdrop + spotlight hole (skipped for `centered` steps) + tooltip. Renders
 * nothing while `controller.active` is false.
 */
export function TourOverlay({ config, controller }: TourOverlayProps) {
  const { active, index, busy, step, totalSteps, isFirst, isLast } = controller
  const [hole, setHole] = useState<Rect | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 })

  // Step-change transition: resolve the new target, scroll it into view if it's
  // off-screen (settling before the final reposition), and clear `busy` once
  // the ~350-400ms window has elapsed. Keyed on [active, index] only — `step`
  // is fully determined by `index` for a given `config`, and `controller`'s
  // handler identities are stable (`useCallback` in useTour).
  //
  // Target-resolution race: some steps (e.g. `bangDienTour`'s step 0/7) only
  // have their target mount once a SIBLING effect switches the sidebar panel
  // (`Cap0TradingPage`'s `onStepView` → `setActivePanel`, a passive effect
  // that commits AFTER this layout effect). On the first render of such a
  // step, `resolveTarget` finds nothing. Rather than settling for a
  // permanent `hole: null` (no-target/centered fallback), poll for the
  // target via `requestAnimationFrame` for up to `TARGET_POLL_MAX_FRAMES`
  // (~1s) — once it appears, measure it (scrolling into view first if it's
  // off-screen) same as the immediate-resolution path. `centered` steps and
  // steps whose target resolves immediately never enter this branch, so
  // their behaviour is unchanged.
  useLayoutEffect(() => {
    if (!active || !step) return

    const el = resolveTarget(step)
    const measure = (target: HTMLElement | null) => setHole(target ? toHole(target.getBoundingClientRect()) : null)
    measure(el)

    let settleTimer: ReturnType<typeof window.setTimeout> | undefined
    let busyTimer: ReturnType<typeof window.setTimeout>
    let pollRafId: number | undefined
    let pollSettleTimer: ReturnType<typeof window.setTimeout> | undefined

    const stopPolling = () => {
      if (pollRafId !== undefined && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(pollRafId)
      }
      pollRafId = undefined
      if (pollSettleTimer !== undefined) window.clearTimeout(pollSettleTimer)
    }

    if (!el && !step.centered && typeof window.requestAnimationFrame === "function") {
      let framesLeft = TARGET_POLL_MAX_FRAMES
      const poll = () => {
        pollRafId = undefined
        const found = resolveTarget(step)
        if (found) {
          if (isInViewport(found.getBoundingClientRect())) {
            measure(found)
          } else {
            if (typeof found.scrollIntoView === "function") {
              found.scrollIntoView({ block: "center" })
            }
            pollSettleTimer = window.setTimeout(() => measure(resolveTarget(step)), SCROLL_SETTLE_MS)
          }
          return
        }
        framesLeft -= 1
        if (framesLeft > 0) {
          pollRafId = window.requestAnimationFrame(poll)
        }
      }
      pollRafId = window.requestAnimationFrame(poll)
    }

    if (el && !isInViewport(el.getBoundingClientRect())) {
      if (typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "center" })
      }
      settleTimer = window.setTimeout(() => measure(el), SCROLL_SETTLE_MS)
      busyTimer = window.setTimeout(() => controller.setBusy(false), SCROLL_SETTLE_MS + TRANSITION_MS)
    } else {
      busyTimer = window.setTimeout(() => controller.setBusy(false), TRANSITION_MS)
    }

    return () => {
      stopPolling()
      if (settleTimer !== undefined) window.clearTimeout(settleTimer)
      window.clearTimeout(busyTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index])

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const r = tooltipRef.current.getBoundingClientRect()
      setTooltipSize({ width: r.width, height: r.height })
    }
  }, [hole, step])

  if (!active || !step) return null

  // Next/Back re-measure & reposition (busy gates a rapid double-click mid-transition).
  // Skip/Complete just end the tour — no transition to guard, so no busy check needed.
  const handleNext = () => {
    if (busy) return
    controller.setBusy(true)
    controller.next()
  }
  const handleBack = () => {
    if (busy) return
    controller.setBusy(true)
    controller.back()
  }
  const handleSkip = () => controller.skip()
  const handleComplete = () => controller.complete()

  const tooltipStyle = computeTooltipStyle(hole, step.placement, tooltipSize)

  return createPortal(
    <div className="iqx-tour-root" data-tour-name={config.name}>
      {dimBands(hole).map((band, i) => (
        <div
          key={i}
          className="iqx-tour-dim"
          style={{ top: band.top, left: band.left, width: band.width, height: band.height }}
        />
      ))}
      {hole && (
        <div
          className="iqx-tour-hole"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      <div ref={tooltipRef} className="iqx-tour-tooltip" style={tooltipStyle} role="dialog" aria-label={step.title}>
        <div className="iqx-tour-counter">
          ĐIỂM {index + 1}/{totalSteps}
        </div>
        {step.tang && <div className="iqx-tour-tang">{step.tang}</div>}
        <div className="iqx-tour-title">{step.title}</div>
        <div className="iqx-tour-body">{step.body}</div>
        <div className="iqx-tour-actions">
          <button type="button" className="iqx-tour-btn iqx-tour-btn--ghost" onClick={handleSkip}>
            Bỏ qua tour
          </button>
          <div className="iqx-tour-nav">
            {!isFirst && (
              <button type="button" className="iqx-tour-btn iqx-tour-btn--back" onClick={handleBack}>
                ← Quay lại
              </button>
            )}
            <button
              type="button"
              className="iqx-tour-btn iqx-tour-btn--primary"
              onClick={isLast ? handleComplete : handleNext}
            >
              {isLast ? "Hoàn thành ✓" : "Tiếp theo →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
