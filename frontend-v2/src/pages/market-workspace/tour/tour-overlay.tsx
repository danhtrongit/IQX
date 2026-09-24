import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { ArrowRight, Check, ChevronLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

import type { TourConfig, TourController, TourStep } from "./types"

export interface TourOverlayProps {
  config: TourConfig
  controller: TourController
}

/** Total visual-transition window per step change. */
const TRANSITION_MS = 380
/** Extra settle time after `scrollIntoView` before the final reposition measurement. */
const SCROLL_SETTLE_MS = 300
/** Padding around the spotlight hole. */
const HOLE_PADDING = 9
const TOOLTIP_GAP = 14
const VIEWPORT_MARGIN = 12
/** Poll cadence while waiting for a lazily-rendered step target. */
const TARGET_POLL_INTERVAL_MS = 50
/** Shared dim tone for product tours (strong spotlight contrast on dark chrome). */
const DEFAULT_DIM = "rgba(6, 8, 14, 0.72)"

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

/** Minimal rich text required by the handoff copy: bold spans and paragraph breaks. */
function renderBody(body: string): ReactNode {
  return body
    .replaceAll("&amp;", "&")
    .split(/(\*\*[^*]+\*\*|<br\s*\/?>(?:\s*<br\s*\/?>)?|\n\n)/gi)
    .filter(Boolean)
    .map((part, index) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>
      if (/^(?:<br|\n\n)/i.test(part)) return <Fragment key={index}><br /><br /></Fragment>
      return <Fragment key={index}>{part}</Fragment>
    })
}

function isInViewport(rect: DOMRect): boolean {
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  )
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
 * The 4 rectangles that tile the viewport around the hole. Each is a real
 * element, so besides painting the dim they also block clicks outside the
 * spotlight. `null` hole (centered step, or target not found) → one
 * full-viewport band.
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
    { top: 0, left: 0, width: vw, height: Math.max(holeTop, 0) },
    { top: holeBottom, left: 0, width: vw, height: Math.max(vh - holeBottom, 0) },
    { top: holeTop, left: 0, width: Math.max(holeLeft, 0), height: Math.max(hole.height, 0) },
    {
      top: holeTop,
      left: holeRight,
      width: Math.max(vw - holeRight, 0),
      height: Math.max(hole.height, 0),
    },
  ]
}

/**
 * Tooltip position: below → right → left, clamped inside the viewport.
 * `hole === null` (centered step, or target not found) centers the tooltip.
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
    placement === "right"
      ? ["right", "below", "left"]
      : placement === "left"
        ? ["left", "below", "right"]
        : ["below", "right", "left"]

  const candidates: Record<"below" | "right" | "left", { top: number; left: number }> = {
    below: { top: hole.top + hole.height + TOOLTIP_GAP, left: hole.left },
    right: { top: hole.top, left: hole.left + hole.width + TOOLTIP_GAP },
    left: { top: hole.top, left: hole.left - tw - TOOLTIP_GAP },
  }

  let chosen = candidates[order[0]]
  for (const key of order) {
    const c = candidates[key]
    const fits =
      c.top >= 0 && c.left >= 0 && c.top + th <= window.innerHeight && c.left + tw <= window.innerWidth
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
 * Renders the active step via a `document.body` portal: dim bands + spotlight
 * hole + tooltip. Renders nothing while `controller.active` is false.
 */
export function TourOverlay({ config, controller }: TourOverlayProps) {
  const { active, index, busy, step, totalSteps, isFirst, isLast } = controller
  const [hole, setHole] = useState<Rect | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 })

  // Step-change transition: resolve the new target, scroll it into view when
  // off-screen (settling before the final measurement), then clear `busy` once
  // the transition window elapsed. Keyed on [active, index] only.
  useLayoutEffect(() => {
    if (!active || !step) return

    const el = resolveTarget(step)
    const measure = (target: HTMLElement | null) =>
      setHole(target ? toHole(target.getBoundingClientRect()) : null)
    measure(el)

    let settleTimer: number | undefined
    let busyTimer: number | undefined
    let pollTimer: number | undefined
    let pollSettleTimer: number | undefined

    const stopPolling = () => {
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
      pollTimer = undefined
      if (pollSettleTimer !== undefined) window.clearTimeout(pollSettleTimer)
      pollSettleTimer = undefined
    }

    // The target may only mount after a sibling effect switches the visible
    // session/view for this step — poll briefly instead of settling on a
    // permanent centered fallback.
    if (!el && !step.centered) {
      const deadline = Date.now() + (step.targetWaitMs ?? 1000)
      const poll = () => {
        pollTimer = undefined
        const found = resolveTarget(step)
        if (found) {
          if (isInViewport(found.getBoundingClientRect())) {
            measure(found)
          } else {
            found.scrollIntoView({ block: "start", behavior: "smooth" })
            pollSettleTimer = window.setTimeout(() => measure(resolveTarget(step)), SCROLL_SETTLE_MS)
          }
          return
        }
        if (Date.now() < deadline) pollTimer = window.setTimeout(poll, TARGET_POLL_INTERVAL_MS)
      }
      pollTimer = window.setTimeout(poll, TARGET_POLL_INTERVAL_MS)
    }

    if (el && !isInViewport(el.getBoundingClientRect())) {
      el.scrollIntoView({ block: "start", behavior: "smooth" })
      settleTimer = window.setTimeout(() => measure(el), SCROLL_SETTLE_MS)
      busyTimer = window.setTimeout(() => controller.setBusy(false), SCROLL_SETTLE_MS + TRANSITION_MS)
    } else {
      busyTimer = window.setTimeout(() => controller.setBusy(false), TRANSITION_MS)
    }

    return () => {
      stopPolling()
      if (settleTimer !== undefined) window.clearTimeout(settleTimer)
      if (busyTimer !== undefined) window.clearTimeout(busyTimer)
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

  const tooltipStyle = computeTooltipStyle(hole, step.placement, tooltipSize)
  const dim = config.overlayColor ?? DEFAULT_DIM

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[2000]"
      data-tour-name={config.name}
      data-busy={busy ? "true" : "false"}
    >
      {dimBands(hole).map((band, i) => (
        <div
          key={i}
          className="pointer-events-auto fixed transition-opacity duration-300"
          style={{
            top: band.top,
            left: band.left,
            width: band.width,
            height: band.height,
            background: dim,
          }}
        />
      ))}
      {hole && (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl border-2 border-primary ring-1 ring-white/70 transition-opacity duration-300 data-[busy=true]:opacity-0"
          data-busy={busy ? "true" : "false"}
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={step.title}
        className="pointer-events-auto fixed w-[min(420px,calc(100vw-24px))] rounded-lg bg-card p-4 text-card-foreground shadow-[0_18px_48px_rgba(0,0,0,0.55)] transition-opacity duration-300 data-[busy=true]:opacity-0"
        data-busy={busy ? "true" : "false"}
        style={tooltipStyle}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
          Điểm {index + 1}/{totalSteps}
        </div>
        {step.tang && (
          <div className="mt-2 inline-flex rounded-sm bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
            {step.tang}
          </div>
        )}
        <h2 className="mt-2 font-heading text-base font-semibold leading-snug">{step.title}</h2>
        <div className="mt-2 text-[13px] leading-6 text-muted-foreground">{renderBody(step.body)}</div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={controller.skip}>
            Bỏ qua tour
          </Button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={handleBack}>
                <ChevronLeft aria-hidden />
                Quay lại
              </Button>
            )}
            <Button size="sm" onClick={isLast ? controller.complete : handleNext} disabled={!isLast && busy}>
              {isLast ? <Check aria-hidden /> : <ArrowRight aria-hidden />}
              {isLast ? "Hoàn thành" : "Tiếp theo"}
            </Button>
            <span aria-hidden className="text-[11px] tabular-nums text-muted-foreground">
              {index + 1}/{totalSteps}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
