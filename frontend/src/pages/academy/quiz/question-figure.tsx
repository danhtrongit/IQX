import type { QuestionFigure as QuestionFigureData } from "../api"
import { LessonChart } from "../charts/lesson-chart"
import "../academy.css"

/**
 * Chart or table of a question. It is the main input of the question: it is kept when the
 * questions come from the server and shown again when the answers are reviewed. Question charts
 * carry no "bảng số liệu" toggle; table cells are plain text (React escapes them).
 */
export function QuestionFigure({ figure, label, caption = true }: { figure: QuestionFigureData; label: string; caption?: boolean }) {
  if (figure.type === "table") {
    return (
      <div role="region" tabIndex={0} aria-label={`Bảng của ${label}`} className="academy-table-scroll">
        <table>
          <thead>
            <tr>
              {figure.head.map((cell, index) => (
                <th key={index} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {figure.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <figure className="m-0 my-3 min-w-0 rounded-md border border-border bg-card p-3" data-chart-id={figure.chart_id}>
      <LessonChart model={figure.chart} label={label} />
      {caption && <figcaption className="mt-2 text-xs text-muted-foreground">Dữ liệu minh họa cho câu hỏi này.</figcaption>}
    </figure>
  )
}
