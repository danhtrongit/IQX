import type { ReactNode, SVGProps } from "react"
import { cn } from "@/shared/lib/cn"

/**
 * Icon strategy (migrated from lucide → Arco):
 *
 *   import { IconSearch, IconUser, IconSettings } from "@arco-design/web-react/icon"
 *
 * Arco ships ~250 icons covering the standard UI surface. For the handful Arco
 * lacks (TradingView drawing tools, brand marks, finance-specific glyphs), add a
 * custom SVG HERE via `createSvgIcon` so it shares Arco's sizing/`currentColor`
 * styling and stays in one place.
 */

type IconProps = SVGProps<SVGSVGElement> & { spin?: boolean }

/** Build an Arco-compatible icon component from raw SVG path content. */
export function createSvgIcon(content: ReactNode, viewBox = "0 0 24 24") {
  return function CustomIcon({ className, spin, ...rest }: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("arco-icon", spin && "arco-icon-loading", className)}
        aria-hidden="true"
        {...rest}
      >
        {content}
      </svg>
    )
  }
}

// ── Custom gap-fillers (extend as features need them) ──

/** TradingView-style trend-line drawing tool. */
export const IconTrendline = createSvgIcon(<path d="M4 20 L20 4 M14 4 h6 v6" />)

/** Fibonacci retracement drawing tool. */
export const IconFibonacci = createSvgIcon(
  <>
    <path d="M3 5h18M3 9h18M3 15h18M3 19h18" />
    <path d="M3 12h18" strokeDasharray="2 2" />
  </>,
)

/** Horizontal ray / price line drawing tool. */
export const IconHorizontalLine = createSvgIcon(<path d="M3 12h18M7 9v6" />)

// ── Marketing landing gap-fillers (lucide → custom SVG; finance/UI glyphs Arco lacks) ──

/** Water droplet — liquidity (lucide Droplets). */
export const IconDroplet = createSvgIcon(
  <path d="M12 2.5C12 2.5 5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0c0-4.5-6.5-11.5-6.5-11.5Z" />,
)

/** Candlestick chart (lucide CandlestickChart). */
export const IconCandlestick = createSvgIcon(
  <>
    <path d="M8 4v3M8 17v3M8 7h0a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h0a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <path d="M16 2v5M16 16v6M16 7h0a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h0a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
  </>,
)

/** Vertical bar chart (lucide BarChart2 / BarChart3). */
export const IconBars = createSvgIcon(<path d="M18 20V10M12 20V4M6 20v-6" />)

/** Line chart with trend (lucide LineChart). */
export const IconTrendLineChart = createSvgIcon(
  <>
    <path d="M3 3v18h18" />
    <path d="m7 14 4-4 3 3 5-6" />
  </>,
)

/** Target / crosshair (lucide Target). */
export const IconTarget = createSvgIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </>,
)

/** Activity / pulse line (lucide Activity). */
export const IconActivity = createSvgIcon(
  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
)

/** Dollar sign (lucide DollarSign). */
export const IconDollar = createSvgIcon(
  <>
    <path d="M12 2v20" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </>,
)

/** Rocket (lucide Rocket). */
export const IconRocket = createSvgIcon(
  <>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </>,
)

/** Crown (lucide Crown). */
export const IconCrown = createSvgIcon(
  <path d="M2 18h20M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z" />,
)

/** Lightning bolt / zap (lucide Zap). */
export const IconZap = createSvgIcon(
  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />,
)

/** Sparkles (lucide Sparkles). */
export const IconSparkles = createSvgIcon(
  <>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
  </>,
)

/** Newspaper (lucide Newspaper). */
export const IconNewspaper = createSvgIcon(
  <>
    <path d="M4 22h14a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a2 2 0 0 1-2-2V8" />
    <path d="M16 7h-6M16 11h-6M10 15H8" />
  </>,
)

/** Robot / bot (lucide Bot). */
export const IconBot = createSvgIcon(
  <>
    <path d="M12 7V4M9 4h6" />
    <rect x="4" y="7" width="16" height="12" rx="2" />
    <path d="M2 14h2M20 14h2M9 13v2M15 13v2" />
  </>,
)

/** Brain-circuit (lucide BrainCircuit). */
export const IconBrainCircuit = createSvgIcon(
  <>
    <path d="M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5v13M9 9h1.5M9 14h1.5" />
  </>,
)

/** Git compare arrows (lucide GitCompareArrows). */
export const IconGitCompare = createSvgIcon(
  <>
    <circle cx="5" cy="6" r="3" />
    <circle cx="19" cy="18" r="3" />
    <path d="M12 3h3a2 2 0 0 1 2 2v10M8 4 6 6l2 2M12 21H9a2 2 0 0 1-2-2V9M16 20l2-2-2-2" />
  </>,
)

/** Shield with alert (lucide ShieldAlert). */
export const IconShieldAlert = createSvgIcon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="M12 8v4M12 16h.01" />
  </>,
)

/** Shield with check (lucide ShieldCheck). */
export const IconShieldCheck = createSvgIcon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
)

/** Timer (lucide Timer). */
export const IconTimer = createSvgIcon(
  <>
    <path d="M10 2h4M12 14l3-3" />
    <circle cx="12" cy="14" r="8" />
  </>,
)

/** Bell (lucide Bell). */
export const IconBell = createSvgIcon(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>,
)

/** Lightbulb (lucide Lightbulb). */
export const IconBulb = createSvgIcon(
  <>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
  </>,
)
