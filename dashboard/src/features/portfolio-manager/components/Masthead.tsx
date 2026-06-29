import type { AnalysisJSON, NarrativeJSON } from "../types"
import { vnd } from "../format"

interface MastheadProps {
  title: NarrativeJSON["title"]
  meta: AnalysisJSON["meta"]
  nav: AnalysisJSON["overview"]["nav"]
}

export function Masthead({ title, meta, nav }: MastheadProps) {
  // Format date "2026-06-23" → "23.06.2026"
  const [y, m, d] = meta.date.split("-")
  const dateFormatted = `${d}.${m}.${y}`

  return (
    <header className="head">
      <div className="head-top">
        <div className="brand">
          <div className="brand-mark">Q</div>
          <div className="brand-name">
            IQ<span>X</span>
          </div>
        </div>
        <div className="kicker">
          Báo cáo phân tích danh mục · {meta.period}
        </div>
      </div>

      <h1 className="title">{title.split("\n").map((line, i, arr) => (
        <span key={i}>{line}{i < arr.length - 1 ? <br /> : null}</span>
      ))}</h1>

      <div className="sub">
        <span>
          Danh mục{" "}
          <span className="mono pm-mono">#{meta.portfolio_id}</span>
        </span>
        <span>
          Giá trị hiện tại{" "}
          <span className="mono pm-mono">{vnd(nav)}</span>
        </span>
        <span>
          Ngày <span className="mono pm-mono">{dateFormatted}</span>
        </span>
      </div>
    </header>
  )
}
