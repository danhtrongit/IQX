import React from "react"
import type { AnalysisJSON, NarrativeJSON } from "../types"
import { score } from "../format"

interface ProgressCompareProps {
  meta: AnalysisJSON["meta"]
  scores: AnalysisJSON["scores"]
  progress: AnalysisJSON["progress"]
  progress_text: NarrativeJSON["progress_text"]
}

export function ProgressCompare({
  meta,
  scores,
  progress,
  progress_text,
}: ProgressCompareProps) {
  // Only rendered when mode is not "first"
  if (meta.mode === "first") return null

  const { overall, prev_overall } = scores
  const deltaLabel =
    prev_overall !== null
      ? `${score(prev_overall)} → ${score(overall)}`
      : score(overall)

  // Count done / total prev_actions
  const doneCount = progress.prev_actions.filter((a) => a.done).length
  const totalCount = progress.prev_actions.length

  return (
    <div className="compare">
      <div className="ico">↗</div>
      <div className="ct">
        <span dangerouslySetInnerHTML={{ __html: progress_text }} />
        {totalCount > 0 && (
          <span>
            {" "}
            ({doneCount}/{totalCount} việc hoàn thành)
          </span>
        )}
      </div>
      <div className="delta pm-mono">{deltaLabel}</div>
    </div>
  )
}
