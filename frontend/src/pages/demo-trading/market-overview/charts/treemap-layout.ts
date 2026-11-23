import type {
  HeatmapSectorGroup,
  HeatmapSizeBy,
  HeatmapStockItem,
  PriceTone,
} from "../types"

export interface TreemapRect {
  x: number
  y: number
  w: number
  h: number
}

export interface SquarifyInput<T> {
  item: T
  weight: number
}

export interface SquarifiedTile<T> extends TreemapRect {
  item: T
  weight: number
}

export interface SectorTreemapTile extends TreemapRect {
  sector: HeatmapSectorGroup
  weight: number
  changePct: number
}

export interface StockTreemapGroupBox extends TreemapRect {
  icbCode: string
  name: string
  headerHeight: number
  showHeader: boolean
}

export interface StockTreemapTile extends TreemapRect {
  stock: HeatmapStockItem
  sectorCode: string
  sectorName: string
  weight: number
}

export interface StockTreemapLayout {
  groups: StockTreemapGroupBox[]
  tiles: StockTreemapTile[]
}

export interface StockTreemapOptions {
  headerHeight?: number
  minHeaderWidth?: number
  minHeaderHeight?: number
}

export interface HeatmapTileTone {
  tone: PriceTone
  background: string
  textColor: string
  intensity: number
}

interface AreaNode<T> {
  item: T
  weight: number
  area: number
}

function worstAspectRatio<T>(row: readonly AreaNode<T>[], shortSide: number): number {
  if (row.length === 0 || shortSide <= 0) return Infinity

  let sum = 0
  let maxA = -Infinity
  let minA = Infinity
  for (const node of row) {
    sum += node.area
    if (node.area > maxA) maxA = node.area
    if (node.area < minA) minA = node.area
  }
  if (sum <= 0 || minA <= 0) return Infinity

  const s2 = shortSide * shortSide
  const sum2 = sum * sum
  return Math.max((s2 * maxA) / sum2, sum2 / (s2 * minA))
}

/**
 * Pure Bruls-Huizing-van Wijk squarified treemap layout.
 * Produces non-overlapping rectangles filling `bounds` completely.
 */
export function squarify<T>(
  items: readonly SquarifyInput<T>[],
  bounds: TreemapRect,
): SquarifiedTile<T>[] {
  if (bounds.w <= 0 || bounds.h <= 0) return []

  const valid = items
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  if (valid.length === 0) return []

  const totalWeight = valid.reduce((acc, entry) => acc + entry.weight, 0)
  if (totalWeight <= 0) return []

  const totalArea = bounds.w * bounds.h
  const remaining: AreaNode<T>[] = valid.map((entry) => ({
    item: entry.item,
    weight: entry.weight,
    area: (entry.weight / totalWeight) * totalArea,
  }))

  let cx = bounds.x
  let cy = bounds.y
  let cw = bounds.w
  let ch = bounds.h

  const out: SquarifiedTile<T>[] = []

  const placeRow = (row: readonly AreaNode<T>[], isFinalRow: boolean) => {
    const rowSum = row.reduce((acc, node) => acc + node.area, 0)
    if (rowSum <= 0 || cw <= 0 || ch <= 0) return

    if (cw >= ch) {
      const stripW = isFinalRow ? cw : Math.min(cw, rowSum / ch)
      let yCursor = cy
      const bottomEdge = cy + ch

      for (let i = 0; i < row.length; i += 1) {
        const node = row[i]
        const isLastItem = i === row.length - 1
        const tileH = isLastItem
          ? Math.max(0, bottomEdge - yCursor)
          : stripW > 0
            ? Math.min(Math.max(0, bottomEdge - yCursor), node.area / stripW)
            : 0

        out.push({
          item: node.item,
          weight: node.weight,
          x: cx,
          y: yCursor,
          w: stripW,
          h: tileH,
        })
        yCursor += tileH
      }

      cx += stripW
      cw = Math.max(0, cw - stripW)
    } else {
      const stripH = isFinalRow ? ch : Math.min(ch, rowSum / cw)
      let xCursor = cx
      const rightEdge = cx + cw

      for (let i = 0; i < row.length; i += 1) {
        const node = row[i]
        const isLastItem = i === row.length - 1
        const tileW = isLastItem
          ? Math.max(0, rightEdge - xCursor)
          : stripH > 0
            ? Math.min(Math.max(0, rightEdge - xCursor), node.area / stripH)
            : 0

        out.push({
          item: node.item,
          weight: node.weight,
          x: xCursor,
          y: cy,
          w: tileW,
          h: stripH,
        })
        xCursor += tileW
      }

      cy += stripH
      ch = Math.max(0, ch - stripH)
    }
  }

  let row: AreaNode<T>[] = []
  let idx = 0

  while (idx < remaining.length) {
    const shortSide = Math.min(cw, ch)
    const nextNode = remaining[idx]
    if (
      row.length === 0 ||
      worstAspectRatio([...row, nextNode], shortSide) <= worstAspectRatio(row, shortSide)
    ) {
      row.push(nextNode)
      idx += 1
    } else {
      placeRow(row, false)
      row = []
    }
  }

  if (row.length > 0) {
    placeRow(row, true)
  }

  return out
}

function stockWeight(stock: HeatmapStockItem, sizeBy: HeatmapSizeBy): number {
  return sizeBy === "value" ? stock.valueBillion : stock.marketCapBillion
}

function sectorWeight(sector: HeatmapSectorGroup, sizeBy: HeatmapSizeBy): number {
  const direct = sizeBy === "value" ? sector.valueBillion : sector.marketCapBillion
  if (Number.isFinite(direct) && direct > 0) return direct
  return sector.stocks.reduce((acc, stock) => acc + Math.max(0, stockWeight(stock, sizeBy)), 0)
}

/** Squarified treemap layout for `Ngành` (sector) mode. */
export function layoutSectorTreemap(
  sectors: readonly HeatmapSectorGroup[],
  sizeBy: HeatmapSizeBy,
  width: number,
  height: number,
): SectorTreemapTile[] {
  const inputs: SquarifyInput<HeatmapSectorGroup>[] = sectors.map((sector) => ({
    item: sector,
    weight: sectorWeight(sector, sizeBy),
  }))

  return squarify(inputs, { x: 0, y: 0, w: width, h: height }).map((tile) => ({
    sector: tile.item,
    weight: tile.weight,
    changePct: tile.item.changePct,
    x: tile.x,
    y: tile.y,
    w: tile.w,
    h: tile.h,
  }))
}

/**
 * Squarified treemap layout for `Mã` (stock) mode grouped by ICB Level 2 sector,
 * reserving a sector header strip whenever the group box fits.
 */
export function layoutStockTreemap(
  sectors: readonly HeatmapSectorGroup[],
  sizeBy: HeatmapSizeBy,
  width: number,
  height: number,
  options?: StockTreemapOptions,
): StockTreemapLayout {
  const headerH = options?.headerHeight ?? 16
  const minHeaderW = options?.minHeaderWidth ?? 50
  const minHeaderH = options?.minHeaderHeight ?? 40

  const sectorInputs: SquarifyInput<{
    sector: HeatmapSectorGroup
    stocks: SquarifyInput<HeatmapStockItem>[]
  }>[] = []

  for (const sector of sectors) {
    const stockInputs: SquarifyInput<HeatmapStockItem>[] = sector.stocks
      .map((stock) => ({ item: stock, weight: stockWeight(stock, sizeBy) }))
      .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0)

    if (stockInputs.length === 0) continue
    const groupWeight = stockInputs.reduce((acc, entry) => acc + entry.weight, 0)
    sectorInputs.push({
      item: { sector, stocks: stockInputs },
      weight: groupWeight,
    })
  }

  const groupRects = squarify(sectorInputs, { x: 0, y: 0, w: width, h: height })
  const groups: StockTreemapGroupBox[] = []
  const tiles: StockTreemapTile[] = []

  for (const groupRect of groupRects) {
    const { sector, stocks } = groupRect.item
    const showHeader = groupRect.w >= minHeaderW && groupRect.h >= minHeaderH
    const reservedH = showHeader ? Math.min(headerH, groupRect.h * 0.4) : 0

    groups.push({
      icbCode: sector.icbCode,
      name: sector.name,
      x: groupRect.x,
      y: groupRect.y,
      w: groupRect.w,
      h: groupRect.h,
      headerHeight: reservedH,
      showHeader,
    })

    const innerRect: TreemapRect = {
      x: groupRect.x,
      y: groupRect.y + reservedH,
      w: groupRect.w,
      h: Math.max(0, groupRect.h - reservedH),
    }

    const placedStocks = squarify(stocks, innerRect)
    for (const tile of placedStocks) {
      tiles.push({
        stock: tile.item,
        sectorCode: sector.icbCode,
        sectorName: sector.name,
        weight: tile.weight,
        x: tile.x,
        y: tile.y,
        w: tile.w,
        h: tile.h,
      })
    }
  }

  return { groups, tiles }
}

/**
 * Theme-aware color scale helper for heatmap tiles (`-7%..+7%`).
 * Uses purely CSS theme tokens so Light and Dark themes both stay legible;
 * ceiling is strictly `var(--mo-ce)` and floor is strictly `var(--mo-fl)`.
 */
export function resolveHeatmapTone(
  changePct: number,
  isCeiling = false,
  isFloor = false,
): HeatmapTileTone {
  const textColor = "var(--mo-heat-fg, #ffffff)"

  if (isCeiling) {
    return {
      tone: "ce",
      background: "var(--mo-ce)",
      textColor,
      intensity: 1,
    }
  }

  if (isFloor) {
    return {
      tone: "fl",
      background: "var(--mo-fl)",
      textColor,
      intensity: 1,
    }
  }

  if (!Number.isFinite(changePct) || Math.abs(changePct) < 0.05) {
    return {
      tone: "ref",
      background: "var(--mo-heat-ref, var(--mo-ref))",
      textColor,
      intensity: 0,
    }
  }

  const intensity = Math.min(1, Math.max(0, Math.abs(changePct) / 7))
  const mixPct = Math.round(35 + intensity * 65)

  if (changePct > 0) {
    return {
      tone: "up",
      background: `color-mix(in srgb, var(--mo-up) ${mixPct}%, var(--mo-heat-neutral))`,
      textColor,
      intensity,
    }
  }

  return {
    tone: "dn",
    background: `color-mix(in srgb, var(--mo-dn) ${mixPct}%, var(--mo-heat-neutral))`,
    textColor,
    intensity,
  }
}
