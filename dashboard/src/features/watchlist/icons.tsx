import { createSvgIcon } from "@/shared/icons"

/**
 * Custom SVG glyphs for the watchlist / trading panels that Arco's icon set
 * doesn't cover. Built with `createSvgIcon` so they share Arco's sizing and
 * `currentColor` styling. (Per FOUNDATION, feature-specific gap-fillers live
 * here, not in `shared/icons`.) Glyphs Arco already provides — Star, Eye,
 * Search, Plus, History, ClockCircle, ArrowRise/Fall, Minus, Loading,
 * Trophy, Thunderbolt, Storage, Dashboard, DragDotVertical, User — are imported
 * straight from `@arco-design/web-react/icon`.
 */

/** Briefcase — "Nắm giữ" (holdings) tab. */
export const IconBriefcase = createSvgIcon(
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </>,
)

/** Wallet — virtual-trading cash balance. */
export const IconWallet = createSvgIcon(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M3 9h18" />
    <circle cx="16.5" cy="13" r="1" />
  </>,
)

/** Activity / pulse line — unrealized P&L stat. */
export const IconActivity = createSvgIcon(<path d="M3 12h4l3 8 4-16 3 8h4" />)
