/**
 * Dashboard-feature custom SVG icons.
 *
 * These are the TradingView drawing-tool + terminal-toolbar glyphs Arco does
 * not ship. Built with the shared `createSvgIcon` helper so they share Arco's
 * `1em` sizing + `currentColor` styling. Drawing-rail / right-toolbar icons
 * that DO exist in Arco are imported directly from `@arco-design/web-react/icon`
 * at the call site; only the gap-fillers live here (per FOUNDATION.md).
 */

import { createSvgIcon } from "@/shared/icons"

// ── Drawing-tool rail (left sidebar) ──

/** Cursor / select arrow (lucide MousePointer2). */
export const IconCursor = createSvgIcon(
  <path d="M5 3 L19 12 L12.5 13.5 L16 20 L13 21.5 L9.5 14.5 L5 18 Z" />,
)

/** Trend-line drawing tool (lucide TrendingUp). */
export const IconTrendUp = createSvgIcon(
  <>
    <path d="M3 17 L9 11 L13 15 L21 7" />
    <path d="M15 7h6v6" />
  </>,
)

/** Freehand / brush drawing (lucide PenLine). */
export const IconFreehand = createSvgIcon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
)

/** Rectangle drawing tool (lucide RectangleHorizontal). */
export const IconRectangle = createSvgIcon(
  <rect x="3" y="7" width="18" height="10" rx="1" />,
)

/** Fibonacci retracement (lucide GitBranchPlus). */
export const IconFibonacci = createSvgIcon(
  <>
    <path d="M3 5h18M3 9h18M3 15h18M3 19h18" />
    <path d="M3 12h18" strokeDasharray="2 2" />
  </>,
)

/** Measure / ruler (lucide Ruler). */
export const IconRuler = createSvgIcon(
  <>
    <path d="M3 9l12-6 6 6-12 6-6-6Z" />
    <path d="M7 7l1.5 1.5M11 5l1.5 1.5M9 11l1.5 1.5M13 9l1.5 1.5" />
  </>,
)

/** Text note (lucide Type). */
export const IconTextTool = createSvgIcon(
  <>
    <path d="M4 7V4h16v3" />
    <path d="M9 20h6M12 4v16" />
  </>,
)

/** Magnet / snap (lucide Magnet). */
export const IconMagnet = createSvgIcon(
  <>
    <path d="M6 15a6 6 0 1 0 12 0V3h-4v12a2 2 0 1 1-4 0V3H6Z" />
    <path d="M6 8h4M14 8h4" />
  </>,
)

/** Grid (lucide Grid3x3). */
export const IconGrid = createSvgIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </>,
)

// ── Right toolbar (vertical action bar) ──

/** Shopping cart — place order (lucide ShoppingCart). */
export const IconShoppingCart = createSvgIcon(
  <>
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.5 3h2l2.6 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L23 6H6" />
  </>,
)

/** Newspaper — news feed (lucide Newspaper). */
export const IconNewspaper = createSvgIcon(
  <>
    <path d="M4 22h14a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a2 2 0 0 1-2-2V8" />
    <path d="M16 7h-6M16 11h-6M10 15H8" />
  </>,
)

/** Candlestick chart — AI candle patterns (lucide CandlestickChart). */
export const IconCandlestick = createSvgIcon(
  <>
    <path d="M8 4v3M8 17v3M8 7h0a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h0a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <path d="M16 2v5M16 16v6M16 7h0a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h0a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
  </>,
)
