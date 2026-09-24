/**
 * Config-driven spotlight-tour contract. A `TourConfig` is a name plus an
 * ordered list of steps; the engine (`use-tour` + `tour-overlay`) has zero
 * product knowledge, and each workspace view ships its own config.
 */

/** One stop of a tour: a spotlighted DOM target, or a `centered` concept card. */
export interface TourStep {
  /** Matches a `data-tour-id="..."` attribute present in the DOM. Tried first. */
  targetId?: string
  /** Fallback CSS selector, used when `targetId` isn't set or doesn't resolve. */
  targetSelector?: string
  /** No spotlight hole — the tooltip renders centered (concept cards). */
  centered?: boolean
  /** Small pill label above the title, e.g. "XEM MỘT MÃ". */
  tang?: string
  title: string
  /** Minimal inline markup: `**bold**` and `<br>` / blank lines. */
  body: string
  /** How long the overlay waits for a lazy-rendered target before centering. */
  targetWaitMs?: number
  /** Preferred tooltip side. Default resolution order is below → right → left. */
  placement?: "below" | "right" | "left" | "auto"
}

export interface TourConfig {
  /** Stable identifier, e.g. "bantin" — also the analytics event suffix. */
  name: string
  /** Optional per-spec dim tone; product tours use the shared darker default. */
  overlayColor?: string
  steps: TourStep[]
}

export interface TourController {
  active: boolean
  index: number
  /** Gate for the overlay's transition animation. */
  busy: boolean
  step: TourStep | undefined
  totalSteps: number
  isFirst: boolean
  isLast: boolean
  start: () => void
  stop: () => void
  next: () => void
  back: () => void
  /** "Bỏ qua tour" — skip counts as complete (spec). */
  skip: () => void
  complete: () => void
  setBusy: (busy: boolean) => void
}

export interface UseTourOptions {
  /** Fires on "Hoàn thành ✓" (last step) AND on "Bỏ qua tour". */
  onComplete: () => void
  /** Fires whenever a step becomes visible. */
  onStepView?: (index: number) => void
  onStart?: () => void
  /** Fires only on `skip()`, with the index the user bailed at. */
  onSkip?: (index: number) => void
  /** Runs before leaving a step — product tours use it to load the demo symbol. */
  onBeforeNext?: (index: number) => void | Promise<void>
}
