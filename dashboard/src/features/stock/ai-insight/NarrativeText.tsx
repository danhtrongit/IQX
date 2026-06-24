import type { NarrativeFragment } from '../types'

interface NarrativeTextProps {
  fragments: NarrativeFragment[]
}

export function NarrativeText({ fragments }: NarrativeTextProps) {
  return (
    <span>
      {fragments.map((fragment, i) => {
        switch (fragment.type) {
          case 'text':
            return <span key={i}>{fragment.content}</span>
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
                {fragment.content}
              </span>
            )
          case 'number':
            return (
              <span key={i} className="num">
                {fragment.content}
              </span>
            )
          case 'highlight':
            return (
              <b key={i} style={{ color: 'var(--gold)', fontWeight: 500 }}>
                {fragment.content}
              </b>
            )
          default:
            return null
        }
      })}
    </span>
  )
}
