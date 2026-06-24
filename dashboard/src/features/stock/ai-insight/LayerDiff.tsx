import type { NarrativeFragment } from '../types'
import { NarrativeText } from './NarrativeText'

interface LayerDiffProps {
  diff: {
    text: NarrativeFragment[]
    hasChange?: boolean
  }
}

export function LayerDiff({ diff }: LayerDiffProps) {
  return (
    <div className="layer-diff">
      <span className="diff-marker">SO VỚI PHIÊN TRƯỚC</span>
      <span className="diff-text">
        <NarrativeText fragments={diff.text} />
      </span>
    </div>
  )
}
