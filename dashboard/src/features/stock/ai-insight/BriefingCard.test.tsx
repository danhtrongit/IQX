import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BriefingCard } from './BriefingCard'
import type { BriefingCard as BriefingCardType } from '../types'

const baseFixture: BriefingCardType = {
  updatedAt: '2026-06-19T10:38:00Z',
  trend: 'Đi ngang',
  status: 'Yếu',
  statusVariant: 'warn',
  timeframe: 'trung hạn 1–2 tuần',
  narrative: [
    { type: 'text', content: 'Khối ngoại đã ' },
    { type: 'emphasis', content: 'bán mạnh phiên thứ 3 liên tiếp', variant: 'bear' },
    { type: 'text', content: ', khiến VCB khó khớp lệnh quanh giá 61,600.' },
  ],
  diff: {
    text: [
      { type: 'text', content: 'Khối ngoại từ bán nhẹ chuyển sang ' },
      { type: 'emphasis', content: 'bán mạnh', variant: 'bear' },
      { type: 'text', content: ' — áp lực bán đang tăng tốc đáng chú ý.' },
    ],
    hasChange: true,
    isFirstAnalysis: false,
  },
  observations: {
    liquidity: [{ type: 'text', content: 'Lệnh khó khớp quanh 61,600.' }],
    moneyFlow: [{ type: 'text', content: 'Khối ngoại bán ròng 3 phiên liên tiếp.' }],
    insider: [{ type: 'text', content: 'Chuỗi mua liên tiếp từ lãnh đạo cao cấp.' }],
    news: [{ type: 'text', content: 'Phát hành trái phiếu và dự án tài chính số.' }],
    supportResistance: [
      { type: 'text', content: 'Hỗ trợ ' },
      { type: 'highlight', content: '61,600' },
      { type: 'text', content: ' đã chạm 3 lần.' },
    ],
  },
  watchLevels: [
    { tag: 'Hỗ trợ 61,600', description: 'nếu thủng kèm khối lượng tăng, áp lực bán có thể lan rộng.' },
    { tag: 'Kháng cự 61,900', description: 'nếu vượt kèm khối ngoại ngừng bán, tâm lý cải thiện.' },
  ],
  recommendation: 'Quan sát thêm',
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="ai-insight-v2">{children}</div>
}

describe('BriefingCard', () => {
  it('renders the eyebrow "BẢN BRIEFING HÔM NAY"', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText(/BẢN BRIEFING HÔM NAY/i)).toBeInTheDocument()
  })

  it('renders updatedAt time in the eyebrow area', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    // Should show a "Cập nhật" label and some time derived from updatedAt
    expect(screen.getByText(/Cập nhật/)).toBeInTheDocument()
  })

  it('renders trend row fields', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Xu hướng')).toBeInTheDocument()
    expect(screen.getByText('Đi ngang')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái')).toBeInTheDocument()
    expect(screen.getByText('Yếu')).toBeInTheDocument()
    expect(screen.getByText('Khung phân tích')).toBeInTheDocument()
    expect(screen.getByText('trung hạn 1–2 tuần')).toBeInTheDocument()
  })

  it('renders narrative text via NarrativeText', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    // Trailing-space plain text is nested in a span — match the whole narrative container
    expect(screen.getByText(/Khối ngoại đã/)).toBeInTheDocument()
    expect(screen.getByText('bán mạnh phiên thứ 3 liên tiếp')).toBeInTheDocument()
  })

  it('renders the narrative paragraph with .narrative.serif classes', () => {
    const { container } = render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    const narrativePara = container.querySelector('p.narrative.serif')
    expect(narrativePara).not.toBeNull()
  })

  it('renders diff block with "SO VỚI PHIÊN TRƯỚC" marker', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('SO VỚI PHIÊN TRƯỚC')).toBeInTheDocument()
  })

  it('renders diff text content', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    // Plain text fragment nested in span — use regex to avoid trailing-space matching issues
    expect(screen.getByText(/Khối ngoại từ bán nhẹ chuyển sang/)).toBeInTheDocument()
  })

  it('renders "QUAN SÁT THEO 5 GÓC" eyebrow', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('QUAN SÁT THEO 5 GÓC')).toBeInTheDocument()
  })

  it('renders all 5 observation labels', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Thanh khoản')).toBeInTheDocument()
    expect(screen.getByText('Dòng tiền')).toBeInTheDocument()
    expect(screen.getByText('Nội bộ')).toBeInTheDocument()
    expect(screen.getByText('Tin tức')).toBeInTheDocument()
    expect(screen.getByText('Hỗ trợ & Kháng cự')).toBeInTheDocument()
  })

  it('renders observation content', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Lệnh khó khớp quanh 61,600.')).toBeInTheDocument()
    expect(screen.getByText('Khối ngoại bán ròng 3 phiên liên tiếp.')).toBeInTheDocument()
  })

  it('renders "MỐC THEO DÕI" eyebrow', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('MỐC THEO DÕI')).toBeInTheDocument()
  })

  it('renders watch levels with tags and descriptions', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Hỗ trợ 61,600')).toBeInTheDocument()
    expect(screen.getByText('nếu thủng kèm khối lượng tăng, áp lực bán có thể lan rộng.')).toBeInTheDocument()
    expect(screen.getByText('Kháng cự 61,900')).toBeInTheDocument()
    expect(screen.getByText('nếu vượt kèm khối ngoại ngừng bán, tâm lý cải thiện.')).toBeInTheDocument()
  })

  it('renders "GỢI Ý HÔM NAY" verdict label', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('GỢI Ý HÔM NAY')).toBeInTheDocument()
  })

  it('renders the verdict word "Quan sát thêm" with warn color class', () => {
    render(<BriefingCard data={baseFixture} />, { wrapper: Wrapper })
    const verdictEl = screen.getByText('Quan sát thêm')
    expect(verdictEl).toBeInTheDocument()
    // Should have verdict-word class and warn variant class
    expect(verdictEl.className).toMatch(/verdict-word/)
    expect(verdictEl.className).toMatch(/verdict-warn/)
  })

  it('colors verdict "Chờ điểm mua" with bull class', () => {
    const fixture = { ...baseFixture, recommendation: 'Chờ điểm mua' as const }
    render(<BriefingCard data={fixture} />, { wrapper: Wrapper })
    const el = screen.getByText('Chờ điểm mua')
    expect(el.className).toMatch(/verdict-bull/)
  })

  it('colors verdict "Nên giảm bớt" with bear class', () => {
    const fixture = { ...baseFixture, recommendation: 'Nên giảm bớt' as const }
    render(<BriefingCard data={fixture} />, { wrapper: Wrapper })
    const el = screen.getByText('Nên giảm bớt')
    expect(el.className).toMatch(/verdict-bear/)
  })

  it('colors verdict "Bán bớt" with bear class', () => {
    const fixture = { ...baseFixture, recommendation: 'Bán bớt' as const }
    render(<BriefingCard data={fixture} />, { wrapper: Wrapper })
    const el = screen.getByText('Bán bớt')
    expect(el.className).toMatch(/verdict-bear/)
  })

  it('colors verdict "Có thể mua thử" with bull class', () => {
    const fixture = { ...baseFixture, recommendation: 'Có thể mua thử' as const }
    render(<BriefingCard data={fixture} />, { wrapper: Wrapper })
    const el = screen.getByText('Có thể mua thử')
    expect(el.className).toMatch(/verdict-bull/)
  })

  describe('isFirstAnalysis', () => {
    it('shows "Lần đầu phân tích" text when isFirstAnalysis is true', () => {
      const fixture: BriefingCardType = {
        ...baseFixture,
        diff: {
          text: [],
          hasChange: false,
          isFirstAnalysis: true,
        },
      }
      render(<BriefingCard data={fixture} />, { wrapper: Wrapper })
      expect(screen.getByText(/Lần đầu phân tích/)).toBeInTheDocument()
      expect(screen.getByText(/chưa có dữ liệu để so sánh/)).toBeInTheDocument()
    })

    it('does NOT show normal diff content when isFirstAnalysis is true', () => {
      const fixture: BriefingCardType = {
        ...baseFixture,
        diff: {
          text: [{ type: 'text', content: 'should not appear' }],
          hasChange: true,
          isFirstAnalysis: true,
        },
      }
      render(<BriefingCard data={fixture} />, { wrapper: Wrapper })
      expect(screen.queryByText('should not appear')).toBeNull()
    })

    it('renders diff marker with muted color when isFirstAnalysis is true', () => {
      const fixture: BriefingCardType = {
        ...baseFixture,
        diff: {
          text: [],
          hasChange: false,
          isFirstAnalysis: true,
        },
      }
      const { container } = render(<BriefingCard data={fixture} />, { wrapper: Wrapper })
      // The diff-marker should have muted style (--text-2) when isFirstAnalysis
      const marker = container.querySelector('.diff-marker')
      expect(marker).not.toBeNull()
      // Check the marker has the muted class when isFirstAnalysis
      expect(marker?.className).toMatch(/diff-marker-muted/)
    })
  })
})
