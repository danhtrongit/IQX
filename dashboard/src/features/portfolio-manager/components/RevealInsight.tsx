import type { NarrativeJSON } from "../types"

interface RevealInsightProps {
  insight: NarrativeJSON["insight"]
}

export function RevealInsight({ insight }: RevealInsightProps) {
  if (!insight || !insight.text) return null

  return (
    <div className="reveal">
      <div className="tag">{insight.label}</div>
      <div className="body">
        <p>{insight.text}</p>
      </div>
    </div>
  )
}
