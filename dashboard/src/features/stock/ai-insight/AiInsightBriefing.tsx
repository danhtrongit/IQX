import { useEffect } from 'react'
import './aiInsight.css'
import { useStockAiInsight } from '../hooks'
import { Masthead } from './Masthead'
import { HeaderStrip } from './HeaderStrip'
import { BriefingCard } from './BriefingCard'
import { LayerCard } from './LayerCard'
import { LayerCharts } from './LayerCharts'
import { NewsList } from './NewsList'

/** Compact loading skeleton scoped inside .ai-insight-v2. */
function LoadingSkeleton() {
  return (
    <div data-testid="ai-insight-skeleton" style={{ padding: '32px 24px' }}>
      {/* Masthead placeholder */}
      <div
        style={{
          height: 40,
          borderRadius: 6,
          background: 'var(--color-fill-2)',
          marginBottom: 16,
          opacity: 0.7,
        }}
      />
      {/* HeaderStrip placeholder */}
      <div
        style={{
          height: 72,
          borderRadius: 8,
          background: 'var(--color-fill-2)',
          marginBottom: 16,
          opacity: 0.6,
        }}
      />
      {/* BriefingCard placeholder */}
      <div
        style={{
          height: 220,
          borderRadius: 8,
          background: 'var(--color-fill-2)',
          marginBottom: 24,
          opacity: 0.5,
        }}
      />
      {/* Layer placeholders */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 80,
            borderRadius: 8,
            background: 'var(--color-fill-2)',
            marginBottom: 12,
            opacity: 0.4 - i * 0.04,
          }}
        />
      ))}
    </div>
  )
}

export function AiInsightBriefing({ symbol }: { symbol: string }) {
  const { insight, analyze, isPending, isError } = useStockAiInsight(symbol)

  // Call analyze() exactly once on first mount (like old StockAiInsight did).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { analyze() }, [])

  if (isPending) {
    return (
      <div className="ai-insight-v2">
        <LoadingSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="ai-insight-v2" style={{ padding: '32px 24px' }}>
        <p
          role="alert"
          style={{
            color: 'var(--color-danger-6, var(--bear))',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Không thể tải phân tích AI — vui lòng thử lại sau.
        </p>
      </div>
    )
  }

  if (!insight) return null

  const layers = [
    insight.layers.L1,
    insight.layers.L2,
    insight.layers.L3,
    insight.layers.L4,
    insight.layers.L5,
  ] as const

  return (
    <div
      className="ai-insight-v2"
      style={{ maxWidth: 920, margin: '0 auto', padding: '0 0 40px' }}
    >
      <Masthead updatedAt={insight.updatedAt} />
      <HeaderStrip header={insight.header} />
      <BriefingCard data={insight.briefing} />

      {/* Divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '28px 0 20px',
          padding: '0 4px',
        }}
      >
        <span
          style={{
            flex: 1,
            height: 1,
            background: 'var(--color-border-2)',
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
          }}
        >
          Chi tiết phân tích
        </span>
        <span
          style={{
            flex: 1,
            height: 1,
            background: 'var(--color-border-2)',
          }}
        />
      </div>

      {/* 5 LayerCards */}
      {layers.map((layer) => {
        const isL5 = layer.layerNum === 'L5'

        // L1–L4: pass LayerCharts as chart slot; L5: pass NewsList from structured layer news
        const chartSlot = isL5
          ? <NewsList
              material={layer.news?.material ?? []}
              filler={layer.news?.filler ?? []}
            />
          : (
            <LayerCharts
              layer={layer.layerNum as 'L1' | 'L2' | 'L3' | 'L4'}
              rawInput={insight.rawInput}
            />
          )

        return (
          <LayerCard
            key={layer.layerNum}
            data={layer}
            chart={chartSlot}
          />
        )
      })}
    </div>
  )
}
