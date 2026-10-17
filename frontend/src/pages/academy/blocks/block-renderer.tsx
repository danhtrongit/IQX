import type { ReactNode } from "react"

import type { ChartModel, InteractiveBlock, LessonBlock, StaticBlock } from "../content-types"
import { isInteractiveBlock } from "../content-types"
import { CardsBlock, DefinitionsBlock, StepsBlock } from "./card-blocks"
import { ChartBlock, ChartGridBlock } from "./chart-block"
import { FormulaBlock, GaugesBlock, KvCardsBlock, StatsBlock, TilesBlock } from "./data-blocks"
import { HeadingBlock, NoteBlock, ParagraphBlock } from "./prose-blocks"
import { FunnelBlock, ObjectionBlock, QuoteBlock, SamplePostBlock } from "./sales-blocks"
import { TableBlock } from "./table-block"

export type BlockRendererProps = {
  blocks: readonly LessonBlock[]
  /** Chart models of the lesson, keyed by `chart_id` (chart and chart_grid blocks). */
  charts: Readonly<Record<string, ChartModel>>
  /**
   * Renders the interactive blocks (scenario, checklist, workpad, income_calculator, practice_case,
   * roleplay_score). Supplied by the reader; without it interactive blocks render nothing.
   */
  renderInteractive?: (block: InteractiveBlock, key: string) => ReactNode
}

function StaticBlockView({ block, charts }: { block: StaticBlock; charts: BlockRendererProps["charts"] }) {
  switch (block.type) {
    case "paragraph":
      return <ParagraphBlock block={block} />
    case "heading":
      return <HeadingBlock block={block} />
    case "note":
      return <NoteBlock block={block} />
    case "chart":
      return <ChartBlock block={block} charts={charts} />
    case "chart_grid":
      return <ChartGridBlock block={block} charts={charts} />
    case "table":
      return <TableBlock block={block} />
    case "cards":
      return <CardsBlock block={block} />
    case "steps":
      return <StepsBlock block={block} />
    case "definitions":
      return <DefinitionsBlock block={block} />
    case "stats":
      return <StatsBlock block={block} />
    case "gauges":
      return <GaugesBlock block={block} />
    case "kv_cards":
      return <KvCardsBlock block={block} />
    case "formula":
      return <FormulaBlock block={block} />
    case "tiles":
      return <TilesBlock block={block} />
    case "quote":
      return <QuoteBlock block={block} />
    case "objection":
      return <ObjectionBlock block={block} />
    case "funnel":
      return <FunnelBlock block={block} />
    case "sample_post":
      return <SamplePostBlock block={block} />
  }
}

/**
 * Renders a list of v3.2 lesson blocks in order. The wrapper is a size container, so card and
 * chart grids respond to the width of the reader (not of the window): one column below 560px.
 */
export function BlockRenderer({ blocks, charts, renderInteractive }: BlockRendererProps) {
  if (blocks.length === 0) return null
  return (
    <div className="academy-blocks @container flex min-w-0 flex-col gap-4">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`
        if (isInteractiveBlock(block)) return renderInteractive ? renderInteractive(block, key) : null
        return (
          <div key={key} data-academy-block={block.type} className="min-w-0">
            <StaticBlockView block={block} charts={charts} />
          </div>
        )
      })}
    </div>
  )
}
