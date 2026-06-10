import type { ReactNode, SVGProps } from "react"
import { cn } from "@/shared/lib/cn"

/**
 * Custom SVG icons for the app chrome (navigation feature).
 *
 * Kept here — NOT in `src/shared/icons` — to avoid concurrent edits with other
 * feature agents. Standard UI glyphs come from `@arco-design/web-react/icon`;
 * only the handful Arco lacks (finance/brand glyphs) live here.
 */

type IconProps = SVGProps<SVGSVGElement> & { spin?: boolean }

/** Build an Arco-compatible icon component from raw SVG path content. */
function createSvgIcon(content: ReactNode, viewBox = "0 0 24 24") {
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

/** Crown — premium / upgrade (lucide Crown). */
export const IconCrown = createSvgIcon(
  <path d="M2 18h20M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z" />,
)

/** Trending up — search result affordance (lucide TrendingUp). */
export const IconTrendingUp = createSvgIcon(
  <>
    <path d="M22 7l-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </>,
)

/** Trending down (lucide TrendingDown). */
export const IconTrendingDown = createSvgIcon(
  <>
    <path d="M22 17l-8.5-8.5-5 5L2 7" />
    <path d="M16 17h6v-6" />
  </>,
)
