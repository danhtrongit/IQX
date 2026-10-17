import type { ReactNode } from "react"

import type { ChartModel, InteractiveBlock, LessonBlock } from "../content-types"
import { isInteractiveBlock } from "../content-types"

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

/**
 * Renders a list of v3.2 lesson blocks in order. F0 stub with the final signature: static block
 * bodies are filled by the renderer package (P5).
 */
export function BlockRenderer({ blocks, renderInteractive }: BlockRendererProps) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`
        if (isInteractiveBlock(block)) return renderInteractive ? renderInteractive(block, key) : null
        return <div key={key} data-academy-block={block.type} />
      })}
    </>
  )
}
