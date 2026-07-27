/**
 * IQX reusable spotlight/tour engine — shared types (T1, `docs/superpowers/plans/
 * 2026-07-27-cap0-tours.md`). Config-driven: a `TourConfig` is just a name + an
 * ordered list of `TourStep`s; later tasks (T2/T3/T4) each ship one of these
 * (`bangDienTour.ts`, `banTinTour.ts`, `sauNguoiChoiTour.ts`) and hand it to
 * `useTour`/`TourOverlay` — this file has ZERO cap0-specific knowledge.
 */

/** One stop of a tour: a spotlighted DOM target (or a `centered` concept card). */
export interface TourStep {
  /** Matches a `data-tour-id="..."` attribute already present in the DOM. Tried first. */
  targetId?: string
  /** Fallback CSS selector, used when `targetId` isn't set or doesn't resolve. */
  targetSelector?: string
  /** No spotlight hole — tooltip renders centered on screen (concept cards, e.g. "6 người chơi"). */
  centered?: boolean
  /** Small pill label above the title, e.g. "XEM MỘT MÃ". */
  tang?: string
  title: string
  /** May contain minimal inline markup in the source (e.g. `**bold**`) — rendered as plain text, not parsed. */
  body: string
  /** Preferred tooltip side. Default resolution order is below → right → left regardless. */
  placement?: "below" | "right" | "left" | "auto"
}

export interface TourConfig {
  /** Stable identifier, e.g. "bang-dien" — used for analytics event names by consumers. */
  name: string
  steps: TourStep[]
}
