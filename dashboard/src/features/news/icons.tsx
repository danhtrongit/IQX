import { createSvgIcon } from "@/shared/icons"

/**
 * News-feature custom SVG icons (gap-fillers Arco lacks). Built via the shared
 * `createSvgIcon` factory so they share Arco's sizing / `currentColor` styling.
 */

/** Newspaper (lucide Newspaper) — Arco has no equivalent. */
export const IconNewspaper = createSvgIcon(
  <>
    <path d="M4 22h14a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a2 2 0 0 1-2-2V8" />
    <path d="M16 7h-6M16 11h-6M10 15H8" />
  </>,
)
