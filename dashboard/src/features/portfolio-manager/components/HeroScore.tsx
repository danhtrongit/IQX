import React from "react"
import type { AnalysisJSON, NarrativeJSON } from "../types"
import { score } from "../format"

interface HeroScoreProps {
  scores: AnalysisJSON["scores"]
  verdict: NarrativeJSON["verdict"]
}

export function HeroScore({ scores, verdict }: HeroScoreProps) {
  const { overall, prev_overall } = scores
  const improved = prev_overall !== null && overall > prev_overall
  const trendLabel =
    prev_overall !== null
      ? `${improved ? "▲" : "▼"} từ ${score(prev_overall)} kỳ trước`
      : null

  return (
    <section className="hero">
      <div className="hero-score">
        <div className="lbl">Sức khỏe</div>
        <div className="num pm-mono">
          {score(overall)}
          <small>/5</small>
        </div>
        {trendLabel && <div className="trend pm-mono">{trendLabel}</div>}
      </div>

      <div className="hero-verdict">
        <div className="eb">Kết luận</div>
        <div
          className="vh pm-serif"
          dangerouslySetInnerHTML={{ __html: verdict }}
        />
      </div>
    </section>
  )
}
