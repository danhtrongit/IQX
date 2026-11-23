import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
  layoutSectorTreemap,
  layoutStockTreemap,
  resolveHeatmapTone,
} from "../../charts/treemap-layout"
import {
  MISSING_VALUE,
  formatBillion,
  formatInt,
  formatPct,
  formatSessionLabel,
  formatStockPrice,
  signedTone,
} from "../../format"
import type {
  HeatmapSectorGroup,
  HeatmapSizeBy,
  HeatmapStockItem,
  HeatmapView,
} from "../../types"
import {
  MoEmptyData,
  MoSegmentedControl,
  MoTickerLink,
  toneToMoClass,
  type MoSegmentOption,
  type WidgetBodyProps,
  type WidgetControlsProps,
} from "../shared"

const VIEW_OPTIONS: readonly MoSegmentOption<HeatmapView>[] = [
  { value: "stock", label: "Mã" },
  { value: "sector", label: "Ngành" },
]

const SIZE_BY_OPTIONS: readonly MoSegmentOption<HeatmapSizeBy>[] = [
  { value: "market_cap", label: "Vốn hoá" },
  { value: "value", label: "GTGD" },
]

type HeatmapTooltip =
  | {
      kind: "stock"
      stock: HeatmapStockItem
      x: number
      y: number
    }
  | {
      kind: "sector"
      sector: HeatmapSectorGroup
      x: number
      y: number
    }

function clampTipPosition(
  anchorX: number,
  anchorY: number,
  boxW: number,
  boxH: number,
): { left: number; top: number } {
  const tipW = 196
  const tipH = 112
  const preferRight = anchorX + 12 + tipW <= boxW - 4
  const left = preferRight
    ? Math.max(4, anchorX + 12)
    : Math.max(4, anchorX - tipW - 12)
  const top = Math.max(4, Math.min(Math.max(4, boxH - tipH - 4), anchorY + 8))
  return { left, top }
}

export function MarketHeatmapHeaderControls({
  state,
  onStateChange,
}: WidgetControlsProps<"market_heatmap">) {
  return (
    <div className="flex items-center gap-1.5" data-no-drag="true">
      <MoSegmentedControl
        options={VIEW_OPTIONS}
        value={state.view}
        onChange={(view) => onStateChange({ view })}
        ariaLabel="Chế độ xem bản đồ nhiệt"
      />
      <MoSegmentedControl
        options={SIZE_BY_OPTIONS}
        value={state.sizeBy}
        onChange={(sizeBy) => onStateChange({ sizeBy })}
        ariaLabel="Tiêu chí diện tích ô"
      />
    </div>
  )
}

export function MarketHeatmapFooter() {
  return (
    <div className="mo-leg2 w-full justify-between">
      <span>Giảm sàn</span>
      <span className="g" aria-hidden="true" />
      <span>Tăng trần</span>
    </div>
  )
}

export function MarketHeatmapWidget({
  state,
  data,
  meta,
}: WidgetBodyProps<"market_heatmap">) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [tooltip, setTooltip] = useState<HeatmapTooltip | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    let rafId = 0
    const syncSize = () => {
      const nextW = Math.floor(el.clientWidth)
      const nextH = Math.floor(el.clientHeight)
      if (nextW <= 0 || nextH <= 0) return
      setBox((prev) =>
        prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH },
      )
    }

    rafId = requestAnimationFrame(syncSize)
    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(rafId)
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncSize)
    })
    observer.observe(el)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  const sectors = useMemo(() => data?.sectors ?? [], [data?.sectors])

  const stockLayout = useMemo(() => {
    if (state.view !== "stock" || box.w <= 0 || box.h <= 0 || sectors.length === 0) {
      return null
    }
    return layoutStockTreemap(sectors, state.sizeBy, box.w, box.h)
  }, [state.view, state.sizeBy, sectors, box.w, box.h])

  const sectorTiles = useMemo(() => {
    if (state.view !== "sector" || box.w <= 0 || box.h <= 0 || sectors.length === 0) {
      return null
    }
    return layoutSectorTreemap(sectors, state.sizeBy, box.w, box.h)
  }, [state.view, state.sizeBy, sectors, box.w, box.h])

  const pointerCoords = (
    event: ReactPointerEvent<HTMLElement>,
    fallbackX: number,
    fallbackY: number,
  ): { x: number; y: number } => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: fallbackX, y: fallbackY }
    }
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  if (!data || sectors.length === 0) {
    return <MoEmptyData />
  }

  const tipPos = tooltip
    ? clampTipPosition(tooltip.x, tooltip.y, box.w, box.h)
    : null
  const showOffHours = meta !== undefined && !meta.isMarketOpen
  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {showOffHours && sessionLabel !== MISSING_VALUE && (
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--mo-line)] px-3 py-0.5">
          <span className="mo-note">{sessionLabel}</span>
        </div>
      )}

      <div
        ref={wrapRef}
        className="mo-tm min-h-0 flex-1"
        onPointerLeave={() => setTooltip(null)}
        onMouseLeave={() => setTooltip(null)}
      >
        {state.view === "stock" && stockLayout && (
          <>
            {stockLayout.groups.map((group) =>
              group.showHeader ? (
                <div
                  key={group.icbCode}
                  className="mo-tm-gl"
                  style={{
                    left: `${group.x}px`,
                    top: `${group.y}px`,
                    width: `${group.w}px`,
                    height: `${group.headerHeight}px`,
                    lineHeight: `${Math.max(12, group.headerHeight - 2)}px`,
                    backgroundColor: "var(--mo-canvas)",
                  }}
                >
                  {group.name}
                </div>
              ) : null,
            )}

            {stockLayout.tiles.map((tile) => {
              const tone = resolveHeatmapTone(
                tile.stock.changePct,
                tile.stock.isCeiling,
                tile.stock.isFloor,
              )
              const showSymbol = tile.w >= 28 && tile.h >= 18
              const showPct = tile.w >= 40 && tile.h >= 30
              const fontSize = Math.max(
                9.5,
                Math.min(14, Math.min(tile.w / 4.2, tile.h / 2.5)),
              )
              const centerX = tile.x + tile.w / 2
              const centerY = tile.y + tile.h / 2

              return (
                <MoTickerLink
                  key={`${tile.sectorCode}-${tile.stock.symbol}`}
                  symbol={tile.stock.symbol}
                  className="mo-tm-tile hover:brightness-110 hover:no-underline"
                  title=""
                  aria-label={`${tile.stock.symbol} ${formatPct(tile.stock.changePct)}`}
                  style={{
                    left: `${tile.x}px`,
                    top: `${tile.y}px`,
                    width: `${tile.w}px`,
                    height: `${tile.h}px`,
                    background: tone.background,
                    color: tone.textColor,
                    fontSize: `${fontSize.toFixed(1)}px`,
                  }}
                  onPointerEnter={(event) => {
                    const pos = pointerCoords(event, centerX, centerY)
                    setTooltip({ kind: "stock", stock: tile.stock, ...pos })
                  }}
                  onPointerMove={(event) => {
                    const pos = pointerCoords(event, centerX, centerY)
                    setTooltip({ kind: "stock", stock: tile.stock, ...pos })
                  }}
                  onMouseEnter={() =>
                    setTooltip({
                      kind: "stock",
                      stock: tile.stock,
                      x: centerX,
                      y: centerY,
                    })
                  }
                  onFocus={() =>
                    setTooltip({
                      kind: "stock",
                      stock: tile.stock,
                      x: centerX,
                      y: centerY,
                    })
                  }
                  onBlur={() => setTooltip(null)}
                >
                  {showSymbol && (
                    <span className="max-w-full truncate px-0.5">{tile.stock.symbol}</span>
                  )}
                  {showPct && (
                    <small style={{ fontSize: `${Math.max(9, fontSize - 2).toFixed(1)}px` }}>
                      {formatPct(tile.stock.changePct)}
                    </small>
                  )}
                </MoTickerLink>
              )
            })}
          </>
        )}

        {state.view === "sector" &&
          sectorTiles &&
          sectorTiles.map((tile) => {
            const tone = resolveHeatmapTone(tile.changePct, false, false)
            const showName = tile.w >= 46 && tile.h >= 22
            const showPct = tile.w >= 46 && tile.h >= 36
            const fontSize = Math.max(
              10,
              Math.min(14, Math.min(tile.w / 8.5, tile.h / 3)),
            )
            const centerX = tile.x + tile.w / 2
            const centerY = tile.y + tile.h / 2

            return (
              <div
                key={tile.sector.icbCode}
                role="button"
                tabIndex={0}
                data-no-drag="true"
                className="mo-tm-tile px-1 hover:brightness-110"
                style={{
                  left: `${tile.x}px`,
                  top: `${tile.y}px`,
                  width: `${tile.w}px`,
                  height: `${tile.h}px`,
                  background: tone.background,
                  color: tone.textColor,
                  fontSize: `${fontSize.toFixed(1)}px`,
                }}
                aria-label={`${tile.sector.name} ${formatPct(tile.changePct)}`}
                onPointerEnter={(event) => {
                  const pos = pointerCoords(event, centerX, centerY)
                  setTooltip({ kind: "sector", sector: tile.sector, ...pos })
                }}
                onPointerMove={(event) => {
                  const pos = pointerCoords(event, centerX, centerY)
                  setTooltip({ kind: "sector", sector: tile.sector, ...pos })
                }}
                onMouseEnter={() =>
                  setTooltip({
                    kind: "sector",
                    sector: tile.sector,
                    x: centerX,
                    y: centerY,
                  })
                }
                onFocus={() =>
                  setTooltip({
                    kind: "sector",
                    sector: tile.sector,
                    x: centerX,
                    y: centerY,
                  })
                }
                onBlur={() => setTooltip(null)}
              >
                {showName && (
                  <span className="line-clamp-2 max-w-full">{tile.sector.name}</span>
                )}
                {showPct && (
                  <small style={{ fontSize: `${Math.max(9.5, fontSize - 1.5).toFixed(1)}px` }}>
                    {formatPct(tile.changePct)}
                  </small>
                )}
              </div>
            )
          })}

        {tooltip && tipPos && (
          <div
            role="tooltip"
            className="mo-tip"
            style={{ left: `${tipPos.left}px`, top: `${tipPos.top}px` }}
          >
            {tooltip.kind === "stock" ? (
              <>
                <b>
                  {tooltip.stock.symbol} · {tooltip.stock.exchange}
                </b>
                <div className="mo-note">{tooltip.stock.sectorName}</div>
                <div>
                  Giá: <b>{formatStockPrice(tooltip.stock.price)}</b>{" "}
                  <span
                    className={
                      tooltip.stock.isCeiling
                        ? "mo-ce"
                        : tooltip.stock.isFloor
                          ? "mo-fl"
                          : toneToMoClass(signedTone(tooltip.stock.changePct))
                    }
                  >
                    ({formatPct(tooltip.stock.changePct)})
                  </span>
                </div>
                <div>Vốn hoá: {formatBillion(tooltip.stock.marketCapBillion, 0)}</div>
                <div>GTGD: {formatBillion(tooltip.stock.valueBillion, 1)}</div>
              </>
            ) : (
              <>
                <b>{tooltip.sector.name}</b>
                <div>
                  Biến động:{" "}
                  <b className={toneToMoClass(signedTone(tooltip.sector.changePct))}>
                    {formatPct(tooltip.sector.changePct)}
                  </b>
                </div>
                <div>Vốn hoá: {formatBillion(tooltip.sector.marketCapBillion, 0)}</div>
                <div>GTGD: {formatBillion(tooltip.sector.valueBillion, 0)}</div>
                <div>Số mã: {formatInt(tooltip.sector.stocks.length)}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
