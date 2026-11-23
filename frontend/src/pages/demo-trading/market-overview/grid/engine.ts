import type {
  EmptyHole,
  FuturesContractGroup,
  FuturesContractRow,
  FuturesMaturity,
  FuturesUnderlying,
  GridItem,
  GridRect,
  SectorPerfTab,
  WidgetMeta,
  WidgetSlug,
} from "../types"

export const GRID_COLS = 12
export const ROW_HEIGHT = 56
export const GRID_GAP = 12
export const MAX_WIDGET_HEIGHT = 18
export const MAX_WIDGETS_PER_PAGE = 40

export interface ExpandableNeighbor<T extends GridRect & { uid: string }> {
  item: T
  direction: "left" | "right"
  nextRect: { x: number; w: number }
}

export interface FuturesPruneRowMeta {
  underlying: FuturesUnderlying
  isGroupHeader?: boolean
  maturity?: FuturesMaturity
}

export interface RowPruneMeta {
  tab?: SectorPerfTab | string
  gainerCount?: number
  declinerCount?: number
  futuresRows?: readonly FuturesPruneRowMeta[]
}

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function getGridMaxY(items: readonly GridRect[]): number {
  let maxY = 0
  for (const item of items) {
    const bottom = item.y + item.h
    if (bottom > maxY) maxY = bottom
  }
  return maxY
}

export function createEndSlot(items: readonly GridRect[]): EmptyHole {
  return {
    x: 0,
    y: getGridMaxY(items),
    w: GRID_COLS,
    h: 2,
    isEnd: true,
  }
}

/**
 * Pure vertical gravity compaction.
 * Pushes colliding items down, then pulls each item up to the lowest non-colliding `y >= 0`
 * without jumping over widgets above it. Preserves caller's array order.
 */
export function compactLayout<T extends GridRect & { uid: string }>(
  items: readonly T[],
  fixedUid?: string,
): T[] {
  const clones = items.map((item) => ({
    ...item,
    x: Math.max(0, Math.min(GRID_COLS - Math.min(item.w, GRID_COLS), item.x)),
    y: Math.max(0, item.y),
    w: Math.max(1, Math.min(GRID_COLS, item.w)),
    h: Math.max(1, Math.min(MAX_WIDGET_HEIGHT, item.h)),
  }))

  const fixed = fixedUid !== undefined ? clones.find((i) => i.uid === fixedUid) : undefined
  const placed: T[] = fixed ? [fixed] : []

  const movable = clones
    .filter((i) => i !== fixed)
    .sort((a, b) => a.y - b.y || a.x - b.x)

  for (const item of movable) {
    while (placed.some((p) => rectsOverlap(p, item))) {
      item.y += 1
    }
    while (item.y > 0 && !placed.some((p) => rectsOverlap(p, { ...item, y: item.y - 1 }))) {
      item.y -= 1
    }
    placed.push(item)
  }

  return clones
}

/** Top-to-bottom, left-to-right first-fit placement scan. */
export function firstFitPosition(
  items: readonly GridRect[],
  w: number,
  h: number,
): { x: number; y: number } {
  const clampedW = Math.max(1, Math.min(GRID_COLS, w))
  const clampedH = Math.max(1, Math.min(MAX_WIDGET_HEIGHT, h))

  for (let y = 0; ; y += 1) {
    for (let x = 0; x <= GRID_COLS - clampedW; x += 1) {
      const candidate: GridRect = { x, y, w: clampedW, h: clampedH }
      if (!items.some((p) => rectsOverlap(p, candidate))) {
        return { x, y }
      }
    }
  }
}

/**
 * Places a widget into a selected empty slot (interior hole or bottom end slot).
 * Guarantees `w >= minW`, `h >= minH`, `h <= MAX_WIDGET_HEIGHT`, and `x + w <= GRID_COLS`.
 */
export function placeInEmptySlot<W extends WidgetSlug>(
  items: readonly GridItem[],
  slot: EmptyHole,
  widgetMeta: WidgetMeta<W>,
  uid: string,
): GridItem[] {
  let w: number
  let h: number
  let x: number
  let y: number

  if (slot.isEnd) {
    w = Math.min(GRID_COLS, Math.max(widgetMeta.defaultW, widgetMeta.minW))
    h = Math.min(MAX_WIDGET_HEIGHT, Math.max(widgetMeta.defaultH, widgetMeta.minH))
    x = 0
    y = Math.max(0, slot.y)
  } else {
    w = Math.min(GRID_COLS, Math.max(slot.w, widgetMeta.minW))
    x = Math.max(0, Math.min(slot.x, GRID_COLS - w))
    h = Math.min(MAX_WIDGET_HEIGHT, Math.max(slot.h, widgetMeta.minH))
    y = Math.max(0, slot.y)
  }

  const inserted = {
    uid,
    widget: widgetMeta.id,
    x,
    y,
    w,
    h,
    state: { ...widgetMeta.defaultState },
  } as GridItem

  const withInserted: GridItem[] = [...items, inserted]
  const pushed = compactLayout(withInserted, uid)
  return compactLayout(pushed)
}

/**
 * Greedily extracts maximal empty rectangles from the occupancy matrix `maxY × 12`
 * top-to-bottom, left-to-right, returning only holes with area `w * h >= 2`.
 */
export function findEmptyHoles(items: readonly GridRect[]): EmptyHole[] {
  const maxY = getGridMaxY(items)
  if (maxY === 0) return []

  const occ: boolean[][] = Array.from({ length: maxY }, () =>
    Array.from({ length: GRID_COLS }, () => false),
  )

  for (const item of items) {
    const yStart = Math.max(0, item.y)
    const yEnd = Math.min(maxY, item.y + item.h)
    const xStart = Math.max(0, item.x)
    const xEnd = Math.min(GRID_COLS, item.x + item.w)
    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        occ[y][x] = true
      }
    }
  }

  const holes: EmptyHole[] = []
  for (let y = 0; y < maxY; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (occ[y][x]) continue

      let w = 0
      while (x + w < GRID_COLS && !occ[y][x + w]) {
        w += 1
      }

      let h = 1
      while (y + h < maxY) {
        let rowFree = true
        for (let xx = x; xx < x + w; xx += 1) {
          if (occ[y + h][xx]) {
            rowFree = false
            break
          }
        }
        if (!rowFree) break
        h += 1
      }

      for (let yy = y; yy < y + h; yy += 1) {
        for (let xx = x; xx < x + w; xx += 1) {
          occ[yy][xx] = true
        }
      }

      if (w * h >= 2) {
        holes.push({ x, y, w, h })
      }
    }
  }

  return holes
}

/**
 * Finds an immediately left-adjacent or right-adjacent widget that vertically spans `hole`
 * and can expand into it with zero collisions.
 */
export function findExpandableNeighbor<T extends GridRect & { uid: string }>(
  items: readonly T[],
  hole: GridRect,
): ExpandableNeighbor<T> | null {
  const candidates: ExpandableNeighbor<T>[] = []

  for (const item of items) {
    const spansVertically = item.y <= hole.y && item.y + item.h >= hole.y + hole.h
    if (!spansVertically) continue

    if (item.x + item.w === hole.x) {
      candidates.push({
        item,
        direction: "right",
        nextRect: { x: item.x, w: item.w + hole.w },
      })
    } else if (hole.x + hole.w === item.x) {
      candidates.push({
        item,
        direction: "left",
        nextRect: { x: hole.x, w: item.w + hole.w },
      })
    }
  }

  for (const candidate of candidates) {
    const { item, nextRect } = candidate
    if (nextRect.x < 0 || nextRect.x + nextRect.w > GRID_COLS) continue
    const expanded: GridRect = { ...item, ...nextRect }
    const collides = items.some(
      (other) => other.uid !== item.uid && rectsOverlap(other, expanded),
    )
    if (!collides) return candidate
  }

  return null
}

/** Expands `targetUid` horizontally into an adjacent `hole` if collision-free, then compacts. */
export function expandWidgetIntoHole<T extends GridRect & { uid: string }>(
  items: readonly T[],
  targetUid: string,
  hole: GridRect,
): T[] {
  const target = items.find((item) => item.uid === targetUid)
  if (!target) return items.map((item) => ({ ...item }))

  const spansVertically = target.y <= hole.y && target.y + target.h >= hole.y + hole.h
  if (!spansVertically) return items.map((item) => ({ ...item }))

  let nextRect: { x: number; w: number } | null = null
  if (target.x + target.w === hole.x) {
    nextRect = { x: target.x, w: target.w + hole.w }
  } else if (hole.x + hole.w === target.x) {
    nextRect = { x: hole.x, w: target.w + hole.w }
  }

  if (!nextRect || nextRect.x < 0 || nextRect.x + nextRect.w > GRID_COLS) {
    return items.map((item) => ({ ...item }))
  }

  const expanded: GridRect = { ...target, ...nextRect }
  const collides = items.some(
    (other) => other.uid !== target.uid && rectsOverlap(other, expanded),
  )
  if (collides) return items.map((item) => ({ ...item }))

  const updated = items.map((item) =>
    item.uid === targetUid ? { ...item, x: nextRect.x, w: nextRect.w } : { ...item },
  )
  return compactLayout(updated)
}

/**
 * Re-packs all items in reading order (`y` asc, `x` asc) via `firstFitPosition`,
 * preserving each item's `w × h` and eliminating internal gaps.
 */
export function packLayout<T extends GridRect & { uid: string }>(items: readonly T[]): T[] {
  const ordered = items
    .map((item) => ({
      ...item,
      w: Math.max(1, Math.min(GRID_COLS, item.w)),
      h: Math.max(1, Math.min(MAX_WIDGET_HEIGHT, item.h)),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const placed: T[] = []
  for (const item of ordered) {
    const pos = firstFitPosition(placed, item.w, item.h)
    placed.push({ ...item, x: pos.x, y: pos.y })
  }
  return placed
}

/**
 * Computes dynamic font/spacing scale factor `--k` for widget content auto-scaling.
 * Returns `1` in narrow single-column mode; otherwise clamps to `[0.86, 1.25]`.
 */
export function computeScaleK(
  actualW: number,
  actualH: number,
  defaultCols: number,
  defaultRows: number,
  cellW: number,
  isNarrow: boolean,
): number {
  if (
    isNarrow ||
    actualW <= 0 ||
    actualH <= 0 ||
    cellW <= 0 ||
    defaultCols <= 0 ||
    defaultRows <= 0
  ) {
    return 1
  }

  const defaultW = defaultCols * cellW + (defaultCols - 1) * GRID_GAP
  const defaultH = defaultRows * ROW_HEIGHT + (defaultRows - 1) * GRID_GAP
  if (defaultW <= 0 || defaultH <= 0) return 1

  const kw = actualW / defaultW
  const kh = actualH / defaultH
  const raw = Math.min(kw, kh * 1.15)
  return Math.max(0.86, Math.min(1.25, raw))
}

const FUTURES_UNDERLYING_ORDER: Readonly<Record<FuturesUnderlying, number>> = {
  VN30: 0,
  VN100: 1,
}

const MATURITY_PRUNE_RANK: Readonly<Record<FuturesMaturity, number>> = {
  "1M": 1,
  "2M": 2,
  "1Q": 3,
  "2Q": 4,
}

/** Shared canonical ordering for futures contracts (1M -> 2M -> 1Q -> 2Q) across widget UI and row pruner. */
export function sortFuturesContracts(
  contracts: readonly FuturesContractRow[],
): FuturesContractRow[] {
  return [...contracts].sort(
    (a, b) => MATURITY_PRUNE_RANK[a.maturity] - MATURITY_PRUNE_RANK[b.maturity],
  )
}

/** Shared canonical ordering for futures groups (VN30 -> VN100) and their contracts. */
export function sortFuturesGroups(
  groups: readonly FuturesContractGroup[],
): FuturesContractGroup[] {
  return [...groups]
    .sort(
      (a, b) =>
        FUTURES_UNDERLYING_ORDER[a.underlying] - FUTURES_UNDERLYING_ORDER[b.underlying],
    )
    .map((group) => ({
      ...group,
      contracts: sortFuturesContracts(group.contracts),
    }))
}

/**
 * Returns row indices ordered by pruning priority (first element is hidden first when vertical
 * space is tight) per Spec Section 2.7.
 */
export function getRowPruneOrder(
  widget: WidgetSlug,
  rowCount: number,
  meta?: RowPruneMeta,
): number[] {
  if (rowCount <= 0) return []

  if (widget === "vnindex_impact") {
    const gainerCount = Math.max(
      0,
      Math.min(rowCount, meta?.gainerCount ?? Math.ceil(rowCount / 2)),
    )
    const declinerCount = Math.max(
      0,
      Math.min(rowCount - gainerCount, meta?.declinerCount ?? rowCount - gainerCount),
    )

    const scored: Array<{ idx: number; priority: number }> = []
    for (let i = 0; i < rowCount; i += 1) {
      let priority: number
      if (i < gainerCount) {
        // Gainers ordered strongest (0) -> weakest (gainerCount - 1)
        priority = i
      } else if (i < gainerCount + declinerCount) {
        // Decliners ordered weakest (gainerCount) -> strongest (gainerCount + declinerCount - 1)
        priority = gainerCount + declinerCount - 1 - i
      } else {
        priority = rowCount + i
      }
      scored.push({ idx: i, priority })
    }

    return scored
      .sort((a, b) => b.priority - a.priority || a.idx - b.idx)
      .map((entry) => entry.idx)
  }

  if (widget === "sector_performance" && meta?.tab !== "flow") {
    const center = (rowCount - 1) / 2
    const scored = Array.from({ length: rowCount }, (_, idx) => ({
      idx,
      dist: Math.abs(idx - center),
    }))
    return scored
      .sort((a, b) => a.dist - b.dist || a.idx - b.idx)
      .map((entry) => entry.idx)
  }

  if (widget === "futures_table" && meta?.futuresRows && meta.futuresRows.length === rowCount) {
    const scored = meta.futuresRows.map((row, idx) => {
      let priority: number
      if (row.underlying === "VN100") {
        if (row.isGroupHeader) {
          priority = 99
        } else {
          priority = 100 + (row.maturity ? MATURITY_PRUNE_RANK[row.maturity] : 5)
        }
      } else if (row.isGroupHeader) {
        priority = 0
      } else {
        priority = 10 + (row.maturity ? MATURITY_PRUNE_RANK[row.maturity] : 5)
      }
      return { idx, priority }
    })

    return scored
      .sort((a, b) => b.priority - a.priority || b.idx - a.idx)
      .map((entry) => entry.idx)
  }

  // Default (including futures_table standard row sequence & generic tables): bottom-up.
  const order: number[] = []
  for (let i = rowCount - 1; i >= 0; i -= 1) {
    order.push(i)
  }
  return order
}
