import { createSvgIcon } from "@/shared/icons"

/**
 * Stock-feature custom SVG icons (gap-fillers Arco lacks). Built via the shared
 * `createSvgIcon` factory so they share Arco's sizing / `currentColor` styling.
 */

/** Water droplet — liquidity layer (lucide Droplets). */
export const IconDroplets = createSvgIcon(
  <path d="M12 2.5C12 2.5 5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0c0-4.5-6.5-11.5-6.5-11.5Z" />,
)

/** Two-way arrows — money flow layer (lucide ArrowLeftRight). */
export const IconArrowLeftRight = createSvgIcon(
  <>
    <path d="M8 3 4 7l4 4" />
    <path d="M4 7h16" />
    <path d="m16 21 4-4-4-4" />
    <path d="M20 17H4" />
  </>,
)

/** Newspaper — news layer (lucide Newspaper). */
export const IconNewspaper = createSvgIcon(
  <>
    <path d="M4 22h14a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a2 2 0 0 1-2-2V8" />
    <path d="M16 7h-6M16 11h-6M10 15H8" />
  </>,
)

/** Brain — AI synthesis layer (lucide Brain). */
export const IconBrain = createSvgIcon(
  <>
    <path d="M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.142 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
  </>,
)

/** Sparkles — AI accent (lucide Sparkles). */
export const IconSparkles = createSvgIcon(
  <>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
  </>,
)

/** Layers / valuation (lucide Layers). */
export const IconLayers = createSvgIcon(
  <>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </>,
)

/** Wallet — cash flow (lucide Wallet). */
export const IconWallet = createSvgIcon(
  <>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5" />
    <path d="M16 12h.01" />
  </>,
)

/** Pie chart — ratios (lucide PieChart). */
export const IconPieChart = createSvgIcon(
  <>
    <path d="M21 12A9 9 0 1 1 12 3v9Z" />
    <path d="M21 12a9 9 0 0 0-9-9v9Z" />
  </>,
)

/** Vertical bar chart (lucide BarChart3). */
export const IconBars = createSvgIcon(<path d="M3 3v18h18M8 17v-5M13 17V7M18 17v-9" />)

/** Briefcase — management (lucide Briefcase). */
export const IconBriefcase = createSvgIcon(
  <>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </>,
)
