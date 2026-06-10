import { createSvgIcon } from "@/shared/icons"

/**
 * Finance/AI glyphs the forecast feature needs that Arco's icon set lacks.
 * Migrated 1:1 from the lucide icons used in `dashboard-bak`'s forecast +
 * pattern components. They share Arco's sizing / `currentColor` styling via
 * `createSvgIcon`.
 *
 * (Standard UI glyphs — close, chevron, star, alert, info, check, drag handle,
 * sort — come straight from `@arco-design/web-react/icon`.)
 */

/** Trending up (lucide TrendingUp) — L1 Xu hướng. */
export const IconTrendingUp = createSvgIcon(
  <>
    <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
    <path d="M16 7h6v6" />
  </>,
)

/** Water droplets (lucide Droplets) — L2 Thanh khoản. */
export const IconDroplets = createSvgIcon(
  <>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 4.8 7 3.5c-.29 1.3-1.15 2.66-2.29 3.56S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05Z" />
    <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.36.5-2.86 1.5-4.5" />
  </>,
)

/** Left-right arrows (lucide ArrowLeftRight) — L3 Dòng tiền. */
export const IconArrowLeftRight = createSvgIcon(
  <>
    <path d="M8 3 4 7l4 4" />
    <path d="M4 7h16" />
    <path d="m16 21 4-4-4-4" />
    <path d="M20 17H4" />
  </>,
)

/** Shield (lucide Shield) — L4 Nội bộ. */
export const IconShield = createSvgIcon(
  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />,
)

/** Newspaper (lucide Newspaper) — L5 Tin tức. */
export const IconNewspaper = createSvgIcon(
  <>
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
  </>,
)

/** Sparkles (lucide Sparkles). */
export const IconSparkles = createSvgIcon(
  <>
    <path d="M9.94 14.66A2 2 0 0 1 8.66 13.4L7 8l1.66 5.4a2 2 0 0 0 1.28 1.26L15 16l-5.06 1.34a2 2 0 0 0-1.28 1.26L7 24l1.66-5.4a2 2 0 0 1 1.28-1.26L15 16Z" />
    <path d="M18 5 19 8 22 9 19 10 18 13 17 10 14 9 17 8Z" />
  </>,
)

/** Settings sliders (lucide Settings2). */
export const IconSliders = createSvgIcon(
  <>
    <path d="M20 7h-9M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </>,
)

/** Brain-circuit (lucide BrainCircuit) — AI analysing overlay. */
export const IconBrainCircuit = createSvgIcon(
  <>
    <path d="M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5v13M9 9h1.5M9 14h1.5" />
  </>,
)

/** Scan-line (lucide ScanLine) — AI analysing overlay. */
export const IconScanLine = createSvgIcon(
  <>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10" />
  </>,
)
