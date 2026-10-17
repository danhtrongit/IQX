import { useId } from "react"

import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import type { DiagramModel } from "./chart-math"
import { DASH, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"

const TEXT_SIZE = { s: 10, m: 12, l: 15 } as const

/**
 * One-off picture: a tone-classed shape list in a fixed viewBox, scaled with the container (text
 * appears only in narrow view boxes, so it stays readable on a phone). No raw SVG strings.
 */
export function DiagramChart({ model, label }: { model: DiagramModel; label: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [w, h] = model.view_box
  const arrowTones = [...new Set(model.shapes.flatMap((shape) => (shape.t === "line" && shape.arrow ? [shape.stroke] : [])))]
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      data-scaled="true"
      className="mx-auto block h-auto w-full"
      style={{ maxWidth: `${Math.round(w * 1.75)}px` }}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {arrowTones.length > 0 && (
        <defs>
          {arrowTones.map((tone: ChartTone) => (
            <marker key={tone} id={`${uid}-${tone}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={TONE_FILL[tone]} />
            </marker>
          ))}
        </defs>
      )}
      {model.shapes.map((shape, index) => {
        switch (shape.t) {
          case "rect":
            return (
              <rect
                key={index}
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
                rx={shape.r}
                fillOpacity={shape.opacity}
                strokeWidth={shape.stroke ? 1.5 : undefined}
                strokeDasharray={shape.dash ? DASH : undefined}
                fill={shape.fill ? undefined : "none"}
                className={cn(shape.fill && TONE_FILL[shape.fill], shape.stroke && TONE_STROKE[shape.stroke])}
              />
            )
          case "circle":
            return (
              <circle
                key={index}
                cx={shape.cx}
                cy={shape.cy}
                r={shape.r}
                fillOpacity={shape.opacity}
                strokeWidth={shape.stroke ? 1.5 : undefined}
                fill={shape.fill ? undefined : "none"}
                className={cn(shape.fill && TONE_FILL[shape.fill], shape.stroke && TONE_STROKE[shape.stroke])}
              />
            )
          case "line":
            return (
              <line
                key={index}
                x1={shape.x1}
                y1={shape.y1}
                x2={shape.x2}
                y2={shape.y2}
                strokeWidth={shape.width ?? 1.5}
                strokeDasharray={shape.dash ? DASH : undefined}
                className={TONE_STROKE[shape.stroke]}
                markerEnd={shape.arrow ? `url(#${uid}-${shape.stroke})` : undefined}
                markerStart={shape.arrow === "both" ? `url(#${uid}-${shape.stroke})` : undefined}
              />
            )
          case "path":
            return (
              <path
                key={index}
                d={shape.d}
                fillOpacity={shape.opacity}
                strokeWidth={shape.stroke ? (shape.width ?? 1.5) : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={shape.fill ? undefined : "none"}
                className={cn(shape.fill && TONE_FILL[shape.fill], shape.stroke && TONE_STROKE[shape.stroke])}
              />
            )
          case "text":
            return (
              <text
                key={index}
                x={shape.x}
                y={shape.y}
                textAnchor={shape.anchor}
                fontSize={TEXT_SIZE[shape.size ?? "m"]}
                fontWeight={shape.weight === "bold" ? 600 : undefined}
                className={textFill(shape.tone)}
              >
                {shape.text}
              </text>
            )
        }
      })}
    </svg>
  )
}
