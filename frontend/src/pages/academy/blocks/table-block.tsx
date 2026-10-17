import { cn } from "@/lib/utils"
import { CARD_TONE_TEXT, STATE_BG, STATE_TEXT, type CardTone } from "./block-tones"
import type { BlockOf } from "./block-types"
import { InlineText } from "./inline-text"

type Table = BlockOf<"table">
type Cell = Table["rows"][number]["cells"][number]
type Column = Table["columns"][number]

const ALIGN = { l: "text-left", r: "text-right", c: "text-center" } as const
const RATING_LABEL = { good: "Tốt", mid: "Trung bình", bad: "Kém" } as const

function CellContent({ cell }: { cell: Cell }) {
  if (typeof cell === "string") return <InlineText html={cell} />
  if ("rating" in cell) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 font-medium", STATE_TEXT[cell.rating])}>
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATE_BG[cell.rating])} />
        <span>{cell.text}</span>
        <span className="sr-only">({RATING_LABEL[cell.rating]})</span>
      </span>
    )
  }
  return <InlineText html={cell.text} className={cell.tone ? CARD_TONE_TEXT[cell.tone] : undefined} />
}

function cellClass(column: Column | undefined, tone: CardTone | undefined, highlight: boolean): string {
  return cn(
    column?.align ? ALIGN[column.align] : undefined,
    (highlight || column?.highlight) && "academy-col-highlight",
    tone ? CARD_TONE_TEXT[tone] : column?.tone ? CARD_TONE_TEXT[column.tone] : undefined,
  )
}

/**
 * `table.cmp` (grid), `.cmp.two` (rows: the first cell is the row label) and `.cmp.step` (grouped:
 * a rowspan group label in the first column). Scrolls inside a focusable region on a phone.
 */
export function TableBlock({ block }: { block: Table }) {
  const label = block.aria_label ?? block.title ?? "Bảng so sánh"
  const grouped = block.variant === "grouped"
  return (
    <figure className="m-0 space-y-2">
      {block.title && <figcaption className="text-sm font-semibold text-foreground">{block.title}</figcaption>}
      <div role="region" tabIndex={0} aria-label={label} className="academy-table-scroll">
        <table>
          <thead>
            <tr>
              {block.columns.map((column, index) => (
                <th key={index} scope="col" className={cellClass(column, undefined, false)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => {
              let columnIndex = grouped ? 1 : 0
              return (
                <tr key={rowIndex}>
                  {grouped && row.group && (
                    <th scope="rowgroup" rowSpan={row.group.span} className="academy-group-cell">
                      {row.group.label}
                    </th>
                  )}
                  {row.cells.map((cell, cellIndex) => {
                    const column = block.columns[columnIndex]
                    const span = typeof cell === "object" && "colspan" in cell ? (cell.colspan ?? 1) : 1
                    const tone = typeof cell === "object" && "tone" in cell ? cell.tone : undefined
                    const highlight = typeof cell === "object" && "highlight" in cell && cell.highlight === true
                    columnIndex += span
                    const className = cellClass(column, tone, highlight)
                    const content = <CellContent cell={cell} />
                    return block.variant === "rows" && cellIndex === 0 ? (
                      <th key={cellIndex} scope="row" colSpan={span > 1 ? span : undefined} className={className}>
                        {content}
                      </th>
                    ) : (
                      <td key={cellIndex} colSpan={span > 1 ? span : undefined} className={className}>
                        {content}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
