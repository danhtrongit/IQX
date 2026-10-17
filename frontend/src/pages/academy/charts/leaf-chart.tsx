import type { LeafChartModel } from "../content-types"
import { CandleGlyphsChart } from "./candle-glyphs-chart"
import { CategoryChart } from "./category-chart"
import { DiagramChart } from "./diagram-chart"
import { FlowChart } from "./flow-chart"
import { GanttChart } from "./gantt-chart"
import { MilestonesChart } from "./milestones-chart"
import { ScaleChart } from "./scale-chart"
import { SchematicChart } from "./schematic-chart"
import { SegmentBarChart } from "./segment-bar-chart"
import { SeriesPanelsChart } from "./series-panels-chart"

/** Draws one non-compare chart model. `autoLegend` is off when the block already carries a legend. */
export function LeafChart({ model, label, autoLegend = true }: { model: LeafChartModel; label: string; autoLegend?: boolean }) {
  switch (model.kind) {
    case "series_panels":
      return <SeriesPanelsChart model={model} label={label} autoLegend={autoLegend} />
    case "category":
      return <CategoryChart model={model} label={label} autoLegend={autoLegend} />
    case "segment_bar":
      return <SegmentBarChart model={model} label={label} />
    case "scale":
      return <ScaleChart model={model} label={label} />
    case "schematic":
      return <SchematicChart model={model} label={label} />
    case "gantt":
      return <GanttChart model={model} label={label} />
    case "milestones":
      return <MilestonesChart model={model} label={label} />
    case "candle_glyphs":
      return <CandleGlyphsChart model={model} label={label} />
    case "flow":
      return <FlowChart model={model} label={label} />
    case "diagram":
      return <DiagramChart model={model} label={label} />
  }
}
