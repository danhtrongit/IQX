import { useMemo } from "react"

import type { LessonBlock } from "../api"
import { sanitizeLessonHtml } from "../sanitize"
import "../academy.css"

type TableBlockData = Extract<LessonBlock, { type: "table" }>

const ALIGN_CLASS = { l: undefined, r: "align-r", c: "align-c" } as const

/**
 * A table of the package: header and cells hold inline HTML (sanitized), columns keep their
 * alignment, and a wide table scrolls inside its own keyboard-focusable region so the page
 * itself never scrolls sideways.
 */
export function TableBlock({ block }: { block: TableBlockData }) {
  const { head, rows } = useMemo(
    () => ({
      head: block.head.map((cell) => sanitizeLessonHtml(cell, "inline")),
      rows: block.rows.map((row) => row.map((cell) => sanitizeLessonHtml(cell, "inline"))),
    }),
    [block.head, block.rows],
  )
  return (
    <div role="region" tabIndex={0} aria-label={block.aria_label ?? "Bảng số liệu"} className="academy-table-scroll">
      <table>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index} scope="col" className={ALIGN_CLASS[block.align?.[index] ?? "l"]} dangerouslySetInnerHTML={{ __html: cell }} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index} className={ALIGN_CLASS[block.align?.[index] ?? "l"]} dangerouslySetInnerHTML={{ __html: cell }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
