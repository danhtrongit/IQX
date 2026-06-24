import type { LayerCard as LayerCardType } from '../types'
import { StatusScale } from './StatusScale'
import { NarrativeText } from './NarrativeText'
import { LayerDiff } from './LayerDiff'

const STATUS_LEVEL_COLORS: Record<number, string> = {
  1: 'var(--bear-deep)',
  2: 'var(--bear)',
  3: 'var(--text-1)',
  4: 'var(--bull)',
  5: 'var(--bull-deep)',
}

interface LayerCardProps {
  data: LayerCardType
  chart?: React.ReactNode
}

export function LayerCard({ data, chart }: LayerCardProps) {
  const statusColor = STATUS_LEVEL_COLORS[data.statusLevel] ?? 'var(--text-1)'

  return (
    <section className="layer">
      {/* Header */}
      <div className="layer-head">
        <div className="layer-title">
          <span className="layer-num">{data.layerNum}</span>
          <span className="layer-name serif">{data.layerName}</span>
        </div>
        <div className="layer-status">
          <span
            className="status-label"
            style={{ color: statusColor }}
          >
            {data.statusLabel}
          </span>
          <StatusScale level={data.statusLevel} />
        </div>
      </div>

      {/* Field list */}
      <div className="field-list">
        {data.fields.map((field, i) => (
          <div key={i} className="field-row">
            <span className="field-label">{field.label}</span>
            <span className="field-value">
              <NarrativeText fragments={field.value} />
            </span>
          </div>
        ))}
      </div>

      {/* Optional chart slot */}
      {chart}

      {/* Diff footer */}
      <LayerDiff diff={data.diff} />
    </section>
  )
}
