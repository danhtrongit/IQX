import type { SignedTone } from "../types"

export interface SparklineSvgProps {
  values: readonly number[]
  refValue?: number | null
  tone?: SignedTone
  width?: number
  height?: number
  className?: string
  ariaLabel?: string
}

function resolveToneStroke(tone: SignedTone): string {
  if (tone === "up") return "var(--mo-up, var(--price-up))"
  if (tone === "dn") return "var(--mo-dn, var(--price-down))"
  return "var(--mo-ref, var(--price-ref))"
}

function inferTone(values: readonly number[], refValue?: number | null): SignedTone {
  if (values.length === 0) return "ref"
  const last = values[values.length - 1]
  const baseline =
    refValue != null && Number.isFinite(refValue) ? refValue : values[0]
  if (last > baseline + 1e-9) return "up"
  if (last < baseline - 1e-9) return "dn"
  return "ref"
}

export function SparklineSvg({
  values,
  refValue = null,
  tone,
  width = 72,
  height = 24,
  className,
  ariaLabel,
}: SparklineSvgProps) {
  const cleanValues = values.filter((v) => Number.isFinite(v))
  const padX = 1.5
  const padY = 2
  const innerW = Math.max(1, width - padX * 2)
  const innerH = Math.max(1, height - padY * 2)

  const hasRef = refValue != null && Number.isFinite(refValue)
  const resolvedTone = tone ?? inferTone(cleanValues, refValue)
  const stroke = resolveToneStroke(resolvedTone)

  if (cleanValues.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={className}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
      />
    )
  }

  let minVal = Math.min(...cleanValues)
  let maxVal = Math.max(...cleanValues)
  if (hasRef) {
    minVal = Math.min(minVal, refValue)
    maxVal = Math.max(maxVal, refValue)
  }

  if (Math.abs(maxVal - minVal) < 1e-9) {
    minVal -= 1
    maxVal += 1
  } else {
    const pad = (maxVal - minVal) * 0.08
    minVal -= pad
    maxVal += pad
  }

  const span = maxVal - minVal
  const mapX = (index: number) =>
    cleanValues.length === 1
      ? padX + innerW / 2
      : padX + (index / (cleanValues.length - 1)) * innerW
  const mapY = (val: number) => padY + ((maxVal - val) / span) * innerH

  const linePath =
    cleanValues.length === 1
      ? `M${padX.toFixed(1)} ${mapY(cleanValues[0]).toFixed(1)}L${(padX + innerW).toFixed(1)} ${mapY(cleanValues[0]).toFixed(1)}`
      : cleanValues
          .map((val, idx) => `${idx === 0 ? "M" : "L"}${mapX(idx).toFixed(1)} ${mapY(val).toFixed(1)}`)
          .join("")

  const refY = hasRef ? mapY(refValue) : null

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {refY !== null && (
        <line
          x1={padX}
          x2={padX + innerW}
          y1={refY}
          y2={refY}
          stroke="var(--mo-ref, var(--price-ref))"
          strokeWidth={1}
          strokeDasharray="3 3"
          strokeOpacity={0.75}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
