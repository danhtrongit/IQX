import { useEffect } from 'react'
import { Spin } from '@arco-design/web-react'
import { usePremiumStatus } from '@/features/premium'
import { TourLaunchButton, TourOverlay, useFeatureTour } from '@/features/tour'
import { phanTichCoPhieuTour } from '@/features/tour/configs/phanTichCoPhieuTour'
import './aiInsight.css'
import type { AIInsightResponse } from '../types'
import { useStockAiInsight } from '../hooks'
import { Masthead } from './Masthead'
import { HeaderStrip } from './HeaderStrip'
import { BriefingCard } from './BriefingCard'
import { LayerCard } from './LayerCard'
import { LayerCharts } from './LayerCharts'
import { NewsList } from './NewsList'

/**
 * Loading state: an explicit spinner + message (the analyze call is an LLM
 * request that can take ~30–60s) above an animated shimmer skeleton, so the
 * user clearly sees it is working.
 */
function LoadingState({ symbol }: { symbol: string }) {
  return (
    <div className="ai-insight-v2" data-testid="ai-insight-skeleton" style={{ padding: '24px' }}>
      <div className="ai-loading-head">
        <Spin />
        <div>
          <div className="ai-loading-title">AI đang phân tích {symbol}…</div>
          <div className="ai-loading-sub">
            Đang tổng hợp 6 lớp dữ liệu (xu hướng, thanh khoản, dòng tiền, nội bộ, tin tức).
            Có thể mất khoảng 30–60 giây.
          </div>
        </div>
      </div>
      <div className="skel" style={{ height: 72, marginTop: 18, marginBottom: 16 }} />
      <div className="skel" style={{ height: 220, marginBottom: 24 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skel" style={{ height: 80, marginBottom: 12 }} />
      ))}
    </div>
  )
}

export function AiInsightBriefing({
  symbol,
  injected,
  teaser = false,
}: {
  symbol: string
  /** Pre-supplied analysis — skips the (premium-gated) API call. Used by the
   *  public landing page so the real component renders without auth. */
  injected?: AIInsightResponse
  /** Show only the briefing + L1 (the public teaser); hide detail layers L2–L5. */
  teaser?: boolean
}) {
  const { insight: fetched, analyze, isPending, isError } = useStockAiInsight(symbol)
  const insight = injected ?? fetched

  // On-demand product tour (increment 2b, docs/superpowers/plans/
  // 2026-07-27-feature-tours.md's Global Constraints). PREMIUM feature — see
  // phanTichCoPhieuTour.ts's file header: `AiInsightBriefing` is always
  // rendered (blurred) behind `PremiumGate` for free users at both real call
  // sites, so the launch button gates on its own explicit `usePremiumStatus()`
  // check rather than the ambient gate. Hidden entirely on the public
  // landing-page teaser (`injected`/`teaser`), which only shows briefing + L1.
  const { isPremium } = usePremiumStatus()
  const tour = useFeatureTour(phanTichCoPhieuTour, { storageKey: 'iqx_tour_phantichcophieu' })
  const showTourButton = !injected && !teaser && isPremium

  // Call analyze() exactly once on first mount — but never when data is injected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!injected) analyze() }, [])

  // Show the loading state while the request is in flight AND for the initial
  // render before analyze() fires (isPending is still false then) — avoids a
  // blank flash. Only the error / loaded branches below take over.
  if (!injected && (isPending || (!fetched && !isError))) {
    return <LoadingState symbol={symbol} />
  }

  if (!injected && isError) {
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

  const layers = teaser
    ? ([insight.layers.L1] as const)
    : ([
        insight.layers.L1,
        insight.layers.L2,
        insight.layers.L3,
        insight.layers.L4,
        insight.layers.L5,
      ] as const)

  return (
    <div
      className="ai-insight-v2"
      style={{ maxWidth: 920, margin: '0 auto', padding: '0 0 40px' }}
    >
      <Masthead updatedAt={insight.updatedAt} />
      {showTourButton && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0 8px' }}>
          <TourLaunchButton onClick={tour.start} />
        </div>
      )}
      <HeaderStrip header={insight.header} />
      <BriefingCard data={insight.briefing} />

      {/* Divider */}
      <div
        data-tour-id="tour-aiinsight-divider"
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

      <TourOverlay config={phanTichCoPhieuTour} controller={tour.controller} />
    </div>
  )
}
