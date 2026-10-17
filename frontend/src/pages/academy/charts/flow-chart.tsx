import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RefreshCw } from "lucide-react"
import { Fragment } from "react"

import { cn } from "@/lib/utils"
import type { FlowModel } from "./chart-math"
import { TONE_BG, TONE_BORDER, titleColor } from "./chart-theme"
import { useChartWidth } from "./use-chart-width"

type Node = FlowModel["nodes"][number]
type Edge = { from: string; to: string; label?: string }

/** Below this width a row of 4+ nodes (or 3 with labelled edges) becomes a column (design §7.3). */
const COLUMN_BELOW = 560

function edgesOf(model: FlowModel): Edge[] {
  if (model.edges === "sequential") return model.nodes.slice(1).map((node, index) => ({ from: model.nodes[index].id, to: node.id }))
  return model.edges ?? []
}

/**
 * K8: boxes and arrows in HTML so text wraps. Edges between neighbours are drawn as Lucide arrows
 * with their label beside them; any other edge is listed under the drawing. A cycle is a numbered
 * grid that loops back to step 1.
 */
export function FlowChart({ model, label }: { model: FlowModel; label: string }) {
  const [measure, width] = useChartWidth()
  const edges = edgesOf(model)
  const labelled = edges.some((edge) => edge.label)
  const vertical =
    model.layout === "column" ||
    (model.layout === "row" && width < COLUMN_BELOW && (model.nodes.length >= 4 || (model.nodes.length >= 3 && labelled)))
  const indexOf = new Map(model.nodes.map((node, index) => [node.id, index]))
  const between = (a: number) =>
    edges.filter((edge) => {
      const from = indexOf.get(edge.from)
      const to = indexOf.get(edge.to)
      return from !== undefined && to !== undefined && Math.min(from, to) === a && Math.abs(from - to) === 1
    })
  const distant = edges.filter((edge) => {
    const from = indexOf.get(edge.from)
    const to = indexOf.get(edge.to)
    return from === undefined || to === undefined || Math.abs(from - to) !== 1
  })
  const titleOf = (id: string) => model.nodes.find((node) => node.id === id)?.title ?? id

  return (
    <div ref={measure} role="img" aria-label={label} className="w-full min-w-0 space-y-3">
      {model.header && (
        <p aria-hidden="true" className={cn("rounded-md border px-3 py-1.5 text-center text-xs font-semibold", TONE_BORDER[model.header.tone], titleColor(model.header.tone))}>
          {model.header.text}
        </p>
      )}
      {model.layout === "cycle" ? (
        <div aria-hidden="true" className="space-y-2">
          <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
            {model.nodes.map((node, index) => (
              <li key={node.id} className="flex min-w-0 items-start gap-2">
                <span className="mt-2 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground tabular-nums">
                  {index + 1}
                </span>
                <FlowNode node={node} className="flex-1" />
              </li>
            ))}
          </ol>
          <p className="flex items-center gap-1.5 text-xs text-academy-subtle">
            <RefreshCw aria-hidden="true" className="size-3.5 shrink-0" />
            Sau bước {model.nodes.length}, vòng lặp quay lại bước 1.
          </p>
        </div>
      ) : (
        <div aria-hidden="true" className={cn("flex min-w-0", vertical ? "flex-col items-stretch" : "flex-row items-stretch")}>
          {model.nodes.map((node, index) => (
            <Fragment key={node.id}>
              {index > 0 && <Connector edges={between(index - 1)} leftId={model.nodes[index - 1].id} vertical={vertical} />}
              <FlowNode node={node} className={vertical ? "w-full" : "min-w-0 flex-1"} />
            </Fragment>
          ))}
        </div>
      )}
      {distant.length > 0 && (
        <ul aria-hidden="true" className="m-0 list-none space-y-1 p-0 text-xs text-foreground">
          {distant.map((edge, index) => (
            <li key={index} className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{titleOf(edge.from)}</span>
              <ArrowRight aria-hidden="true" className="size-3.5 text-academy-label" />
              <span className="font-semibold">{titleOf(edge.to)}</span>
              {edge.label && <span className="text-academy-subtle">{edge.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Connector({ edges, leftId, vertical }: { edges: Edge[]; leftId: string; vertical: boolean }) {
  if (edges.length === 0) return <span className={vertical ? "h-2" : "w-2"} />
  return (
    <div className={cn("flex shrink-0 items-center justify-center gap-1", vertical ? "flex-row flex-wrap gap-x-4 py-1.5" : "flex-col px-1.5")}>
      {edges.map((edge, index) => {
        const forward = edge.from === leftId
        const Icon = vertical ? (forward ? ArrowDown : ArrowUp) : forward ? ArrowRight : ArrowLeft
        return (
          <span key={index} className={cn("flex items-center gap-1 text-academy-label", vertical ? "flex-row" : "flex-col")}>
            {edge.label && <span className="max-w-24 text-center text-[11px] leading-tight font-medium">{edge.label}</span>}
            <Icon aria-hidden="true" className="size-4 shrink-0" />
          </span>
        )
      })}
    </div>
  )
}

function FlowNode({ node, className }: { node: Node; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md border bg-card px-3 py-2 text-center",
          node.emph && node.tone ? cn("border-2", TONE_BORDER[node.tone]) : node.emph ? "border-2 border-foreground/40" : "border-border",
        )}
      >
        <p className={cn("text-sm leading-snug font-semibold break-words", titleColor(node.tone))}>{node.title}</p>
        {node.sub && <p className="text-xs leading-snug text-academy-subtle">{node.sub}</p>}
        {node.value && <p className="text-sm font-semibold text-foreground tabular-nums">{node.value}</p>}
        {node.children && (
          <div className="mt-1.5 flex flex-col gap-1">
            {node.children.map((child, index) => (
              <div key={index} className="flex items-start gap-1.5 rounded-sm bg-muted/60 px-2 py-1 text-left">
                {child.tone && <span aria-hidden="true" className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TONE_BG[child.tone])} />}
                <span className="min-w-0">
                  <span className={cn("block text-xs font-semibold", titleColor(child.tone))}>{child.title}</span>
                  {child.sub && <span className="block text-[11px] text-academy-subtle">{child.sub}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {node.caption && <p className="text-center text-xs leading-snug text-academy-subtle">{node.caption}</p>}
    </div>
  )
}
