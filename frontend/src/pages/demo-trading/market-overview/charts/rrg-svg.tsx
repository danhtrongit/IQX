import { useEffect, useMemo, useRef, useState } from "react"
import { formatDayMonth, formatNum } from "../format"
import type { RrgDomain, RrgPoint, RrgQuadrant, RrgSectorTrail } from "../types"

export interface RrgSvgProps {
  sectors: readonly RrgSectorTrail[]
  domain?: RrgDomain
  width?: number
  height?: number
  className?: string
  onSelectSector?: (sector: RrgSectorTrail) => void
}

const DEFAULT_WIDTH = 560
const DEFAULT_HEIGHT = 340
const HEAD_RADIUS = 5.5
const LABEL_HEIGHT = 14

const QUADRANT_META: Readonly<
  Record<RrgQuadrant, { label: string; colorVar: string; fillVar: string }>
> = {
  leading: {
    label: "Dẫn dắt",
    colorVar: "var(--mo-up, var(--price-up))",
    fillVar: "var(--mo-rrg-lead)",
  },
  weakening: {
    label: "Suy yếu",
    colorVar: "var(--mo-ref, var(--price-ref))",
    fillVar: "var(--mo-rrg-weak)",
  },
  lagging: {
    label: "Tụt hậu",
    colorVar: "var(--mo-dn, var(--price-down))",
    fillVar: "var(--mo-rrg-lag)",
  },
  improving: {
    label: "Cải thiện",
    colorVar: "var(--mo-acc2, var(--primary))",
    fillVar: "var(--mo-rrg-imp)",
  },
}

function classifyQuadrant(point: RrgPoint): RrgQuadrant {
  if (point.rsRatio >= 100 && point.rsMomentum >= 100) return "leading"
  if (point.rsRatio >= 100 && point.rsMomentum < 100) return "weakening"
  if (point.rsRatio < 100 && point.rsMomentum < 100) return "lagging"
  return "improving"
}

function computeSymmetricHalfSpan(sectors: readonly RrgSectorTrail[]): number {
  let maxDelta = 0
  for (const sector of sectors) {
    for (const pt of sector.points) {
      if (!Number.isFinite(pt.rsRatio) || !Number.isFinite(pt.rsMomentum)) continue
      const dx = Math.abs(pt.rsRatio - 100)
      const dy = Math.abs(pt.rsMomentum - 100)
      if (dx > maxDelta) maxDelta = dx
      if (dy > maxDelta) maxDelta = dy
    }
  }
  return Math.max(2.5, Math.ceil(maxDelta * 1.18 * 2) / 2)
}

function resolvePlotDomain(
  sectors: readonly RrgSectorTrail[],
  domain?: RrgDomain,
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (
    domain &&
    Number.isFinite(domain.minRatio) &&
    Number.isFinite(domain.maxRatio) &&
    Number.isFinite(domain.minMomentum) &&
    Number.isFinite(domain.maxMomentum) &&
    domain.maxRatio > domain.minRatio &&
    domain.maxMomentum > domain.minMomentum
  ) {
    return {
      minX: Math.min(domain.minRatio, 99.5),
      maxX: Math.max(domain.maxRatio, 100.5),
      minY: Math.min(domain.minMomentum, 99.5),
      maxY: Math.max(domain.maxMomentum, 100.5),
    }
  }
  const halfSpan = computeSymmetricHalfSpan(sectors)
  return {
    minX: 100 - halfSpan,
    maxX: 100 + halfSpan,
    minY: 100 - halfSpan,
    maxY: 100 + halfSpan,
  }
}

function buildCatmullRomPath(pts: readonly [number, number][]): string {
  if (pts.length === 0) return ""
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`

  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2

    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6

    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

interface PlacedLabel {
  x0: number
  x1: number
  y0: number
  y1: number
}

interface ProjectedSector {
  sector: RrgSectorTrail
  quadrant: RrgQuadrant
  color: string
  coords: [number, number][]
  head: [number, number]
  latest: RrgPoint
  pathD: string
  labelX: number
  labelY: number
  labelAnchor: "start" | "end"
}

export function RrgSvg({
  sectors,
  domain,
  width,
  height,
  className,
  onSelectSector,
}: RrgSvgProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState<{ w: number; h: number }>({
    w: width ?? DEFAULT_WIDTH,
    h: height ?? DEFAULT_HEIGHT,
  })
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)

  useEffect(() => {
    if (width !== undefined && height !== undefined) return
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    let rafId = 0
    const syncSize = () => {
      const nextW = Math.round(el.clientWidth)
      const nextH = Math.round(el.clientHeight)
      if (nextW < 40 || nextH < 40) return
      setMeasured((prev) =>
        prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH },
      )
    }

    syncSize()
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncSize)
    })
    observer.observe(el)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [width, height])

  const svgW = width ?? measured.w
  const svgH = height ?? measured.h

  const layout = useMemo(() => {
    const padL = 10
    const padR = 10
    const padT = 10
    const padB = 10
    const innerW = Math.max(40, svgW - padL - padR)
    const innerH = Math.max(40, svgH - padT - padB)

    const { minX, maxX, minY, maxY } = resolvePlotDomain(sectors, domain)
    const rangeX = maxX - minX
    const rangeY = maxY - minY

    const mapX = (rsRatio: number) => padL + ((rsRatio - minX) / rangeX) * innerW
    const mapY = (rsMomentum: number) =>
      padT + innerH - ((rsMomentum - minY) / rangeY) * innerH

    const cx100 = mapX(100)
    const cy100 = mapY(100)

    const validSectors = sectors.filter((s) => s.points.length > 0)
    const rawProjected = validSectors
      .map((sector) => {
        const coords: [number, number][] = sector.points.map((p) => [
          mapX(p.rsRatio),
          mapY(p.rsMomentum),
        ])
        const latest = sector.points[sector.points.length - 1]
        const head = coords[coords.length - 1]
        const quadrant = classifyQuadrant(latest)
        const color = QUADRANT_META[quadrant].colorVar
        const pathD = buildCatmullRomPath(coords)
        return { sector, quadrant, color, coords, head, latest, pathD }
      })
      .sort((a, b) => a.head[1] - b.head[1])

    const placedBoxes: PlacedLabel[] = []
    const items: ProjectedSector[] = rawProjected.map((entry) => {
      const [hx, hy] = entry.head
      const estW = Math.max(40, entry.sector.name.length * 6.5)

      const placeRight = hx + 9 + estW <= padL + innerW - 4
      const anchor: "start" | "end" = placeRight ? "start" : "end"
      const lx = placeRight ? hx + 9 : hx - 9
      const x0 = placeRight ? lx : lx - estW
      const x1 = placeRight ? lx + estW : lx

      const candidateOffsets = [0, 14, -14, 28, -28, 42, -42]
      let chosenY = Math.max(padT + 22, Math.min(padT + innerH - 18, hy + 4))

      for (const offset of candidateOffsets) {
        const candidateY = Math.max(
          padT + 22,
          Math.min(padT + innerH - 18, hy + 4 + offset),
        )
        const box: PlacedLabel = {
          x0,
          x1,
          y0: candidateY - LABEL_HEIGHT + 2,
          y1: candidateY + 2,
        }
        const overlaps = placedBoxes.some(
          (other) =>
            box.x0 < other.x1 + 4 &&
            other.x0 < box.x1 + 4 &&
            box.y0 < other.y1 + 2 &&
            other.y0 < box.y1 + 2,
        )
        if (!overlaps) {
          chosenY = candidateY
          break
        }
      }

      placedBoxes.push({
        x0,
        x1,
        y0: chosenY - LABEL_HEIGHT + 2,
        y1: chosenY + 2,
      })

      return {
        ...entry,
        labelX: lx,
        labelY: chosenY,
        labelAnchor: anchor,
      }
    })

    return {
      padL,
      padT,
      innerW,
      innerH,
      cx100,
      cy100,
      minX,
      maxX,
      minY,
      maxY,
      items,
    }
  }, [sectors, domain, svgW, svgH])

  const hovered = useMemo(
    () => layout.items.find((it) => it.sector.icbCode === hoveredCode) ?? null,
    [layout.items, hoveredCode],
  )

  const tooltipLeft = hovered
    ? hovered.head[0] > svgW * 0.56
      ? Math.max(8, hovered.head[0] - 208)
      : Math.min(svgW - 204, hovered.head[0] + 14)
    : 0
  const tooltipTop = hovered
    ? Math.max(8, Math.min(svgH - 150, hovered.head[1] - 24))
    : 0

  return (
    <div
      ref={wrapRef}
      className={className ? `relative h-full w-full ${className}` : "relative h-full w-full"}
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label="Biểu đồ Chu kỳ ngành (RRG)"
      >
        {/* 4 Quadrant Tinted Backgrounds */}
        <rect
          data-quadrant="leading"
          x={layout.cx100}
          y={layout.padT}
          width={Math.max(0, layout.padL + layout.innerW - layout.cx100)}
          height={Math.max(0, layout.cy100 - layout.padT)}
          fill={QUADRANT_META.leading.fillVar}
        />
        <rect
          data-quadrant="improving"
          x={layout.padL}
          y={layout.padT}
          width={Math.max(0, layout.cx100 - layout.padL)}
          height={Math.max(0, layout.cy100 - layout.padT)}
          fill={QUADRANT_META.improving.fillVar}
        />
        <rect
          data-quadrant="lagging"
          x={layout.padL}
          y={layout.cy100}
          width={Math.max(0, layout.cx100 - layout.padL)}
          height={Math.max(0, layout.padT + layout.innerH - layout.cy100)}
          fill={QUADRANT_META.lagging.fillVar}
        />
        <rect
          data-quadrant="weakening"
          x={layout.cx100}
          y={layout.cy100}
          width={Math.max(0, layout.padL + layout.innerW - layout.cx100)}
          height={Math.max(0, layout.padT + layout.innerH - layout.cy100)}
          fill={QUADRANT_META.weakening.fillVar}
        />

        {/* Center Axes (100, 100) */}
        <line
          x1={layout.cx100}
          x2={layout.cx100}
          y1={layout.padT}
          y2={layout.padT + layout.innerH}
          stroke="var(--mo-line2, var(--border))"
          strokeWidth={1}
        />
        <line
          x1={layout.padL}
          x2={layout.padL + layout.innerW}
          y1={layout.cy100}
          y2={layout.cy100}
          stroke="var(--mo-line2, var(--border))"
          strokeWidth={1}
        />

        {/* Quadrant Corner Labels */}
        <text
          x={layout.padL + layout.innerW - 8}
          y={layout.padT + 18}
          textAnchor="end"
          fill={QUADRANT_META.leading.colorVar}
          fontSize={12}
          fontWeight={700}
        >
          {QUADRANT_META.leading.label}
        </text>
        <text
          x={layout.padL + 8}
          y={layout.padT + 18}
          textAnchor="start"
          fill={QUADRANT_META.improving.colorVar}
          fontSize={12}
          fontWeight={700}
        >
          {QUADRANT_META.improving.label}
        </text>
        <text
          x={layout.padL + 8}
          y={layout.padT + layout.innerH - 8}
          textAnchor="start"
          fill={QUADRANT_META.lagging.colorVar}
          fontSize={12}
          fontWeight={700}
        >
          {QUADRANT_META.lagging.label}
        </text>
        <text
          x={layout.padL + layout.innerW - 8}
          y={layout.padT + layout.innerH - 8}
          textAnchor="end"
          fill={QUADRANT_META.weakening.colorVar}
          fontSize={12}
          fontWeight={700}
        >
          {QUADRANT_META.weakening.label}
        </text>

        {/* Sector 5-Week Trails, Markers, and Labels */}
        {layout.items.map((item) => {
          const isHovered = hoveredCode === item.sector.icbCode
          const isDimmed = hoveredCode !== null && !isHovered
          const tailCoords = item.coords.slice(0, -1)

          return (
            <g
              key={item.sector.icbCode}
              data-sector={item.sector.icbCode}
              tabIndex={0}
              role="button"
              aria-label={`${item.sector.name} — ${QUADRANT_META[item.quadrant].label}`}
              opacity={isDimmed ? 0.3 : 1}
              style={{ cursor: onSelectSector ? "pointer" : "default", outline: "none" }}
              onMouseEnter={() => setHoveredCode(item.sector.icbCode)}
              onMouseLeave={() => setHoveredCode((prev) => (prev === item.sector.icbCode ? null : prev))}
              onFocus={() => setHoveredCode(item.sector.icbCode)}
              onBlur={() => setHoveredCode((prev) => (prev === item.sector.icbCode ? null : prev))}
              onClick={() => onSelectSector?.(item.sector)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelectSector?.(item.sector)
                }
              }}
            >
              {item.coords.length >= 2 && (
                <path
                  d={item.pathD}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={isHovered ? 2.4 : 1.6}
                  strokeOpacity={isHovered ? 0.95 : 0.65}
                />
              )}
              {tailCoords.map(([tx, ty], idx) => (
                <circle
                  key={`${item.sector.icbCode}-pt-${idx}`}
                  cx={tx}
                  cy={ty}
                  r={1.6 + idx * 0.45}
                  fill={item.color}
                  fillOpacity={0.72}
                />
              ))}
              <circle
                cx={item.head[0]}
                cy={item.head[1]}
                r={HEAD_RADIUS}
                fill={item.color}
                stroke={isHovered ? "var(--mo-tx, var(--foreground))" : "none"}
                strokeWidth={isHovered ? 1.5 : 0}
              />
              <text
                x={item.labelX}
                y={item.labelY}
                textAnchor={item.labelAnchor}
                fill="var(--mo-tx, var(--foreground))"
                fontSize={11.5}
                fontWeight={isHovered ? 700 : 500}
              >
                {item.sector.name}
              </text>
            </g>
          )
        })}
      </svg>

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-[188px] rounded-md border px-2.5 py-2 text-[11.5px] shadow-md"
          style={{
            left: `${tooltipLeft}px`,
            top: `${tooltipTop}px`,
            background: "var(--mo-raise, var(--popover))",
            borderColor: "var(--mo-line2, var(--border))",
            color: "var(--mo-tx, var(--popover-foreground))",
          }}
        >
          <div className="flex items-center justify-between gap-2 font-bold">
            <span>{hovered.sector.name}</span>
            <span style={{ color: QUADRANT_META[hovered.quadrant].colorVar }}>
              {QUADRANT_META[hovered.quadrant].label}
            </span>
          </div>
          <div
            className="mt-1 flex items-center justify-between gap-3 tabular-nums"
            style={{ color: "var(--mo-tx2, var(--text-secondary))" }}
          >
            <span>RS-Ratio: {formatNum(hovered.latest.rsRatio, 2)}</span>
            <span>RS-Mom: {formatNum(hovered.latest.rsMomentum, 2)}</span>
          </div>
          <div
            className="mt-1.5 border-t pt-1 text-[10.5px] tabular-nums"
            style={{
              borderColor: "var(--mo-line, var(--border))",
              color: "var(--mo-tx2, var(--text-secondary))",
            }}
          >
            {hovered.sector.points.map((pt, idx) => (
              <div key={`${pt.date}-${idx}`} className="flex justify-between gap-2">
                <span>{formatDayMonth(pt.date)}</span>
                <span>
                  {formatNum(pt.rsRatio, 1)} / {formatNum(pt.rsMomentum, 1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
