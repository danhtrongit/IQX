import type { ReactNode, SVGProps } from "react"
import { cn } from "@/shared/lib/cn"

/**
 * Custom SVG icons for the stock directory feature.
 *
 * Kept here — NOT in `src/shared/icons` — to avoid concurrent edits with other
 * feature agents. Standard UI glyphs come from `@arco-design/web-react/icon`;
 * only the handful Arco lacks live here.
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

/** Building — stock directory header glyph (lucide Building2). */
export const IconBuilding = createSvgIcon(
  <>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </>,
)
