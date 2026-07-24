import type { NarrativeFragment } from '../types'
import { normalizeNumberFormat } from '@/shared/lib/normalizeNumberFormat'

interface NarrativeTextProps {
  fragments: NarrativeFragment[]
}

export function NarrativeText({ fragments }: NarrativeTextProps) {
  return (
    <span>
      {fragments.map((fragment, i) => {
        // AI-written narrative is rendered verbatim → normalize vi-VN
        // number formatting (e.g. "−4,9 triệu") to the app-wide en-US standard.
        const content = normalizeNumberFormat(fragment.content)
        switch (fragment.type) {
          case 'text':
            return <span key={i}>{content}</span>
          case 'emphasis':
            return (
              <span
                key={i}
                className={`em-${fragment.variant}`}
                style={{
                  color: `var(--${fragment.variant})`,
                  fontStyle: 'italic',
                  fontWeight: 500,
                }}
              >
                {content}
              </span>
            )
          case 'number':
            return (
              <span key={i} className="num">
                {content}
              </span>
            )
          case 'highlight':
            return (
              <b key={i} style={{ color: 'var(--gold)', fontWeight: 500 }}>
                {content}
              </b>
            )
          default:
            return null
        }
      })}
    </span>
  )
}
