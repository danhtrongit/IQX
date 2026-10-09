import type { ReactNode } from "react"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ChartModel, LessonBlock } from "../api"
import { ChartDataTable, LessonChart } from "../charts/lesson-chart"
import { HtmlContent } from "./html-content"
import { LessonImage } from "./lesson-image"
import { TableBlock } from "./table-block"
import "../academy.css"

type ChartBlockData = Extract<LessonBlock, { type: "chart" }>
type StepsBlockData = Extract<LessonBlock, { type: "steps" }>
type CalloutBlockData = Extract<LessonBlock, { type: "callout" }>
type DetailsBlockData = Extract<LessonBlock, { type: "details" }>

export type BlockContext = {
  /** Chart models of the lesson, keyed by `chart_id`. */
  charts: Readonly<Record<string, ChartModel>>
  /** Re-reads the lesson when a chart model is missing from it. */
  onReload?: () => void
}

function ChartBlockView({ block, context }: { block: ChartBlockData; context: BlockContext }) {
  const model = context.charts[block.chart_id]
  return (
    <figure className="m-0 my-4 min-w-0 rounded-md border border-border bg-card p-3 sm:p-4" data-chart-id={block.chart_id}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug">{block.title}</h4>
        {block.illustrative && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Dữ liệu minh họa</span>
        )}
      </div>
      {model ? (
        <>
          <LessonChart model={model} label={block.title} />
          {block.table_toggle && <ChartDataTable model={model} label={block.title} />}
        </>
      ) : (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-sm border border-border bg-muted/40 p-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="size-4 text-muted-foreground" aria-hidden="true" />
            Chưa có dữ liệu của biểu đồ này.
          </span>
          {context.onReload && (
            <Button type="button" variant="outline" size="sm" onClick={context.onReload}>
              Thử lại
            </Button>
          )}
        </div>
      )}
      {block.caption && <figcaption className="mt-2 border-t border-border pt-2 text-xs leading-5 text-muted-foreground">{block.caption}</figcaption>}
    </figure>
  )
}

function StepsBlockView({ block }: { block: StepsBlockData }) {
  return (
    <ol className="m-0 my-4 list-none space-y-3 p-0">
      {block.items.map((item) => (
        <li key={item.no} className="flex gap-3">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-sm border border-border bg-muted text-[11px] font-semibold tabular-nums text-primary"
          >
            {item.no}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold leading-7">
              <span className="sr-only">Bước {item.no}: </span>
              {item.title}
            </h4>
            <HtmlContent html={item.html} />
          </div>
        </li>
      ))}
    </ol>
  )
}

const CALLOUT_TONE: Record<CalloutBlockData["variant"], string> = {
  notice: "border-primary/40 bg-primary/5",
  worked: "border-border bg-muted/40",
  "signal-buy": "border-price-up/50 bg-price-up/5",
  "signal-sell": "border-price-down/50 bg-price-down/5",
  "filter-example": "border-dashed border-border bg-card",
}

function CalloutBlockView({ block, context }: { block: CalloutBlockData; context: BlockContext }) {
  const label = block.aria_label ?? block.title
  return (
    <div
      role={block.variant === "notice" ? "note" : "group"}
      aria-label={label}
      data-variant={block.variant}
      className={cn("my-4 min-w-0 rounded-md border p-3 sm:p-4", CALLOUT_TONE[block.variant])}
    >
      {block.title && <h4 className="mb-2 text-sm font-semibold leading-snug">{block.title}</h4>}
      <BlockRenderer blocks={block.blocks} context={context} />
    </div>
  )
}

function DetailsBlockView({ block, context }: { block: DetailsBlockData; context: BlockContext }) {
  return (
    <details className="academy-details my-3">
      <summary>{block.summary}</summary>
      <div className="pt-3">
        <BlockRenderer blocks={block.blocks} context={context} />
      </div>
    </details>
  )
}

/** An adjacent signal-buy + signal-sell pair was one side-by-side box in the approved layout. */
function isSignalPair(first: LessonBlock | undefined, second: LessonBlock | undefined): first is CalloutBlockData {
  return (
    first?.type === "callout" &&
    second?.type === "callout" &&
    ((first.variant === "signal-buy" && second.variant === "signal-sell") ||
      (first.variant === "signal-sell" && second.variant === "signal-buy"))
  )
}

function renderBlock(block: LessonBlock, context: BlockContext): ReactNode {
  switch (block.type) {
    case "html":
      return <HtmlContent html={block.html} />
    case "table":
      return <TableBlock block={block} />
    case "chart":
      return <ChartBlockView block={block} context={context} />
    case "image":
      return <LessonImage block={block} />
    case "steps":
      return <StepsBlockView block={block} />
    case "callout":
      return <CalloutBlockView block={block} context={context} />
    case "details":
      return <DetailsBlockView block={block} context={context} />
  }
}

/** Renders the typed blocks of one lesson section in the order the package gives them. */
export function BlockRenderer({ blocks, context }: { blocks: readonly LessonBlock[]; context: BlockContext }) {
  const nodes: ReactNode[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const next = blocks[index + 1]
    if (isSignalPair(block, next)) {
      nodes.push(
        <div key={index} className="grid gap-3 min-[640px]:grid-cols-2 [&>*]:my-0" data-testid="signal-pair">
          {renderBlock(block, context)}
          {renderBlock(next as LessonBlock, context)}
        </div>,
      )
      index += 1
      continue
    }
    nodes.push(<div key={index} className="min-w-0">{renderBlock(block, context)}</div>)
  }
  return <>{nodes}</>
}
