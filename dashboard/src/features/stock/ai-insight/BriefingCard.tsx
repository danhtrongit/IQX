import type { BriefingCard as BriefingCardType } from '../types'
import { NarrativeText } from './NarrativeText'

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  } catch {
    return isoString
  }
}

function verdictClass(recommendation: BriefingCardType['recommendation']): string {
  switch (recommendation) {
    case 'Chờ điểm mua':
    case 'Có thể mua thử':
      return 'verdict-bull'
    case 'Quan sát thêm':
      return 'verdict-warn'
    case 'Nên giảm bớt':
    case 'Bán bớt':
      return 'verdict-bear'
    default:
      return 'verdict-neutral'
  }
}

function statusColor(variant: BriefingCardType['statusVariant']): string {
  switch (variant) {
    case 'warn':
      return 'var(--warn)'
    case 'bear':
      return 'var(--bear)'
    case 'bull':
      return 'var(--bull)'
    case 'neutral':
    default:
      return 'var(--text-1)'
  }
}

export function BriefingCard({ data }: { data: BriefingCardType }) {
  const vClass = verdictClass(data.recommendation)

  return (
    <article className="briefing">
      {/* Khối 1 — Eyebrow + Trend row */}
      <div className="briefing-eyebrow">
        <span className="briefing-kicker">BẢN BRIEFING HÔM NAY</span>
        <span className="briefing-meta">Cập nhật {formatTime(data.updatedAt)}</span>
      </div>

      <div className="briefing-trend-row" data-tour-id="tour-aiinsight-trend-row">
        <div className="field">
          <span className="label">Xu hướng</span>
          <span className="value">{data.trend}</span>
        </div>
        <div className="field">
          <span className="label">Trạng thái</span>
          <span
            className={`value ${data.statusVariant !== 'bull' && data.statusVariant !== 'neutral' ? data.statusVariant : ''}`}
            style={{ color: statusColor(data.statusVariant) }}
          >
            {data.status}
          </span>
        </div>
        <div className="field">
          <span className="label">Khung phân tích</span>
          <span className="value neutral">{data.timeframe}</span>
        </div>
      </div>

      {/* Khối 2 — Narrative */}
      <p className="narrative serif" data-tour-id="tour-aiinsight-narrative">
        <NarrativeText fragments={data.narrative} />
      </p>

      {/* Khối 3 — Diff block */}
      <div className="diff-block" data-tour-id="tour-aiinsight-diff">
        <span
          className={`diff-marker${data.diff.isFirstAnalysis ? ' diff-marker-muted' : ''}`}
          style={data.diff.isFirstAnalysis ? { color: 'var(--text-2)' } : undefined}
        >
          SO VỚI PHIÊN TRƯỚC
        </span>
        <span className="diff-text">
          {data.diff.isFirstAnalysis ? (
            'Lần đầu phân tích — chưa có dữ liệu để so sánh'
          ) : (
            <NarrativeText fragments={data.diff.text} />
          )}
        </span>
      </div>

      {/* Khối 4 — Observations */}
      <div className="observations" data-tour-id="tour-aiinsight-observations">
        <div className="obs-eyebrow">QUAN SÁT THEO 5 GÓC</div>
        <div className="obs-list">
          <div className="obs-row">
            <span className="obs-label">Thanh khoản</span>
            <span className="obs-content">
              <NarrativeText fragments={data.observations.liquidity} />
            </span>
          </div>
          <div className="obs-row">
            <span className="obs-label">Dòng tiền</span>
            <span className="obs-content">
              <NarrativeText fragments={data.observations.moneyFlow} />
            </span>
          </div>
          <div className="obs-row">
            <span className="obs-label">Nội bộ</span>
            <span className="obs-content">
              <NarrativeText fragments={data.observations.insider} />
            </span>
          </div>
          <div className="obs-row">
            <span className="obs-label">Tin tức</span>
            <span className="obs-content">
              <NarrativeText fragments={data.observations.news} />
            </span>
          </div>
          <div className="obs-row">
            <span className="obs-label">Hỗ trợ &amp; Kháng cự</span>
            <span className="obs-content">
              <NarrativeText fragments={data.observations.supportResistance} />
            </span>
          </div>
        </div>
      </div>

      {/* Khối 5 — Watch levels */}
      <div className="watch-levels" data-tour-id="tour-aiinsight-watch-levels">
        <div className="watch-eyebrow">MỐC THEO DÕI</div>
        <div className="watch-list">
          {data.watchLevels.map((level, i) => (
            <div key={i} className="watch-row">
              <span className="watch-tag">{level.tag}</span>
              <span>{level.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Khối 6 — Verdict */}
      <div className="verdict" data-tour-id="tour-aiinsight-verdict">
        <span className="verdict-label">GỢI Ý HÔM NAY</span>
        <span className={`verdict-word serif ${vClass}`}>{data.recommendation}</span>
      </div>
    </article>
  )
}
