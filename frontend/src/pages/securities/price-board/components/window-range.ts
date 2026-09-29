/** Only windows boards larger than this; small tabs render every row. */
export const WINDOW_THRESHOLD = 80
export const FALLBACK_ROW_HEIGHT = 30
export const OVERSCAN = 10

/** Half-open [start, end) range of rows to mount for the current scroll position. */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan: number,
): { start: number; end: number } {
  if (count <= 0 || rowHeight <= 0 || viewportHeight <= 0) return { start: 0, end: count }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const last = Math.ceil((Math.max(0, scrollTop) + viewportHeight) / rowHeight)
  return {
    start: Math.min(count, Math.max(0, first - overscan)),
    end: Math.min(count, Math.max(0, last + overscan)),
  }
}

