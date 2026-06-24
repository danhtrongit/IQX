import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIInsightResponse } from '../types'

// ── Fixture ──────────────────────────────────────────────────────────────────

const fixture: AIInsightResponse = {
  symbol: 'VCB',
  updatedAt: '2026-06-24T10:30:00Z',
  header: {
    symbol: 'VCB',
    sector: 'Ngân hàng',
    indexGroup: 'VN30',
    price: 61700,
    changePercent: 0.16,
    high: 61800,
    low: 61600,
    volume: '15.6M',
    isLive: false,
  },
  briefing: {
    updatedAt: '2026-06-24T10:30:00Z',
    trend: 'Đi ngang',
    status: 'Yếu',
    statusVariant: 'warn',
    timeframe: 'trung hạn 1–2 tuần',
    narrative: [{ type: 'text', content: 'Phân tích VCB.' }],
    diff: {
      text: [],
      hasChange: false,
      isFirstAnalysis: true,
    },
    observations: {
      liquidity: [{ type: 'text', content: 'Lệnh khó khớp.' }],
      moneyFlow: [{ type: 'text', content: 'Khối ngoại bán nhẹ.' }],
      insider: [{ type: 'text', content: 'Giao dịch nhỏ lẻ.' }],
      news: [{ type: 'text', content: 'Không có tin mới.' }],
      supportResistance: [{ type: 'text', content: 'Hỗ trợ 61,600.' }],
    },
    watchLevels: [
      { tag: 'Hỗ trợ', description: '61,600 — nếu thủng có thể lan rộng' },
      { tag: 'Kháng cự', description: '61,900 — nếu vượt tâm lý cải thiện' },
    ],
    recommendation: 'Quan sát thêm',
  },
  layers: {
    L1: {
      layerNum: 'L1',
      layerName: 'Xu hướng',
      statusLabel: 'Yếu',
      statusLevel: 2,
      fields: [{ label: 'Xu hướng', value: [{ type: 'text', content: 'Đi ngang' }] }],
      diff: { text: [], hasChange: false },
    },
    L2: {
      layerNum: 'L2',
      layerName: 'Thanh khoản',
      statusLabel: 'Bình thường',
      statusLevel: 3,
      fields: [],
      diff: { text: [], hasChange: false },
    },
    L3: {
      layerNum: 'L3',
      layerName: 'Dòng tiền',
      statusLabel: 'Trung tính',
      statusLevel: 3,
      fields: [],
      diff: { text: [], hasChange: false },
    },
    L4: {
      layerNum: 'L4',
      layerName: 'Nội bộ',
      statusLabel: 'Trung tính',
      statusLevel: 3,
      fields: [],
      diff: { text: [], hasChange: false },
    },
    L5: {
      layerNum: 'L5',
      layerName: 'Tin tức',
      statusLabel: 'Trung tính',
      statusLevel: 3,
      fields: [],
      diff: { text: [], hasChange: false },
      news: {
        material: [
          { title: 'Phát hành trái phiếu thành công', subtitle: 'củng cố vốn cho năm 2026', tag: 'Phát hành' },
        ],
        filler: [
          { title: 'Khen thưởng nội bộ', tag: 'Nhân sự' },
        ],
      },
    },
  },
  rawInput: {
    trend: {
      realtime: null,
      ohlcv: [],
      computed: { ma10: 61500, ma20: 61400, volMa10: 100, volMa20: 95, latestClose: 61700 },
    },
    liquidity: { latest: null, avg30: null, history: [] },
    moneyFlow: { foreign: [], proprietary: [] },
    insider: { transactions: [] },
    news: { items: [], tickerScore: null },
  },
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../hooks', () => ({
  useStockAiInsight: vi.fn(),
  isIndexSymbol: vi.fn(() => false),
}))

// Mock the chart sub-components to avoid canvas / recharts DOM complexity in unit tests
vi.mock('./LayerCharts', () => ({
  LayerCharts: ({ layer }: { layer: string }) => (
    <div data-testid={`layer-chart-${layer}`}>chart-{layer}</div>
  ),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

import { useStockAiInsight } from '../hooks'
const mockUseStockAiInsight = useStockAiInsight as ReturnType<typeof vi.fn>

describe('AiInsightBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('with full insight (not pending)', () => {
    beforeEach(() => {
      mockUseStockAiInsight.mockReturnValue({
        insight: fixture,
        analyze: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
      })
    })

    it('renders the ticker symbol "VCB"', async () => {
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      // symbol appears in the HeaderStrip ticker block
      expect(screen.getAllByText('VCB').length).toBeGreaterThan(0)
    })

    it('renders the verdict word "Quan sát thêm"', async () => {
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      expect(screen.getByText('Quan sát thêm')).toBeInTheDocument()
    })

    it('renders all 5 layer names', async () => {
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      // layer names may appear more than once (BriefingCard observations + LayerCard headers)
      expect(screen.getAllByText('Xu hướng').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Thanh khoản').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Dòng tiền').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Nội bộ').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Tin tức').length).toBeGreaterThan(0)
    })

    it('renders the "Chi tiết phân tích" divider', async () => {
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      expect(screen.getByText(/Chi tiết phân tích/i)).toBeInTheDocument()
    })

    it('renders L5 NewsList tag "Phát hành" from layers.L5.news (not rawInput)', async () => {
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      // The real LLM tag "Phát hành" must appear; "—" must NOT appear as a tag
      expect(screen.getByText('Phát hành')).toBeInTheDocument()
    })

    it('calls analyze() once on mount', async () => {
      const analyze = vi.fn()
      mockUseStockAiInsight.mockReturnValue({
        insight: fixture,
        analyze,
        isPending: false,
        isError: false,
        error: null,
      })
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      expect(analyze).toHaveBeenCalledTimes(1)
    })
  })

  describe('loading state (isPending:true, insight:null)', () => {
    beforeEach(() => {
      mockUseStockAiInsight.mockReturnValue({
        insight: null,
        analyze: vi.fn(),
        isPending: true,
        isError: false,
        error: null,
      })
    })

    it('renders a loading skeleton node', async () => {
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      // The loading skeleton should have data-testid="ai-insight-skeleton"
      expect(screen.getByTestId('ai-insight-skeleton')).toBeInTheDocument()
    })
  })

  describe('error state (isError:true, insight:null)', () => {
    beforeEach(() => {
      mockUseStockAiInsight.mockReturnValue({
        insight: null,
        analyze: vi.fn(),
        isPending: false,
        isError: true,
        error: new Error('Network error'),
      })
    })

    it('renders an inline error message', async () => {
      const { AiInsightBriefing } = await import('./AiInsightBriefing')
      render(<AiInsightBriefing symbol="VCB" />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
