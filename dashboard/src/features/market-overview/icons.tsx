import { createSvgIcon } from "@/shared/icons"

/**
 * Market-overview custom SVG icons (lucide → custom SVG; finance/UI glyphs Arco
 * lacks). Built via the shared `createSvgIcon` factory so they share Arco's
 * sizing / `currentColor` styling. Where Arco or `@/shared/icons` already ships
 * an equivalent, panels import that instead of redefining it here.
 */

/** Trending up arrow (lucide TrendingUp). */
export const IconTrendingUp = createSvgIcon(
  <>
    <path d="m22 7-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </>,
)

/** Trending down arrow (lucide TrendingDown). */
export const IconTrendingDown = createSvgIcon(
  <>
    <path d="m22 17-8.5-8.5-5 5L2 7" />
    <path d="M16 17h6v-6" />
  </>,
)

/** Stacked layers (lucide Layers) — sectors. */
export const IconLayers = createSvgIcon(
  <>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </>,
)

/** Globe (lucide Globe2) — foreign flow. */
export const IconGlobe = createSvgIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
)

/** Briefcase (lucide Briefcase) — proprietary trading. */
export const IconBriefcase = createSvgIcon(
  <>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
  </>,
)

/** Percent sign (lucide Percent) — interbank rates. */
export const IconPercent = createSvgIcon(
  <>
    <path d="M19 5 5 19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </>,
)

/** Landmark / classical building (lucide Landmark) — bonds. */
export const IconLandmark = createSvgIcon(
  <>
    <path d="M3 22h18M6 18V11M10 18V11M14 18V11M18 18V11" />
    <path d="m12 2 9 5H3l9-5Z" />
  </>,
)

/** Gem / diamond (lucide Gem) — commodities. */
export const IconGem = createSvgIcon(
  <>
    <path d="M6 3h12l4 6-10 12L2 9l4-6Z" />
    <path d="M11 3 8 9l4 12 4-12-3-6M2 9h20" />
  </>,
)

/** Water droplet (lucide Droplets) — oil. */
export const IconDroplet = createSvgIcon(
  <path d="M12 2.5C12 2.5 5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0c0-4.5-6.5-11.5-6.5-11.5Z" />,
)

/** Flame (lucide Flame) — natural gas. */
export const IconFlame = createSvgIcon(
  <path d="M12 2c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-2.5C9 9 9 7 12 2Z M8.5 14a3.5 3.5 0 0 0 7 0c0-2-2-3-2.5-4.5C12 11 10 11 8.5 14Z" />,
)

/** Pickaxe (lucide Pickaxe) — iron/steel. */
export const IconPickaxe = createSvgIcon(
  <>
    <path d="M14.5 9.5 21 3M3 21l8-8" />
    <path d="M14 6c2.5-1.5 6-1.5 7 0 .5 1-1 4-4 6M10 18c-2.5 1.5-6 1.5-7 0-.5-1 1-4 4-6" />
  </>,
)

/** Wheat / grain (lucide Wheat) — corn. */
export const IconWheat = createSvgIcon(
  <>
    <path d="M12 22V8M12 8c-2 0-3-1-3-3 2 0 3 1 3 3ZM12 8c2 0 3-1 3-3-2 0-3 1-3 3Z" />
    <path d="M12 14c-2 0-3-1-3-3 2 0 3 1 3 3ZM12 14c2 0 3-1 3-3-2 0-3 1-3 3Z" />
  </>,
)

/** Shopping cart (lucide ShoppingCart) — retail. */
export const IconShoppingCart = createSvgIcon(
  <>
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.5 3h2l2.5 13h12l2.5-9H6" />
  </>,
)

/** Up/down swap arrows (lucide ArrowUpDown) — export/import. */
export const IconArrowUpDown = createSvgIcon(
  <path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />,
)

/** Vertical bar chart (lucide BarChart3) — industrial production. */
export const IconBarChart = createSvgIcon(<path d="M3 3v18h18M7 16v-5M12 16V8M17 16v-9" />)
