import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LayerCharts } from './LayerCharts'
import type { InsightRawInput } from '../types'

/** Minimal rawInput fixture — only moneyFlow is needed for the L3 test */
const fixture: InsightRawInput = {
  trend: {
    realtime: null,
    ohlcv: [],
    computed: { ma10: 0, ma20: 0, volMa10: 0, volMa20: 0, latestClose: 0 },
  },
  liquidity: {
    latest: null,
    avg30: null,
    history: [],
  },
  moneyFlow: {
    foreign: [
      { date: '2024-06-01', totalNetVolume: 100000 },
      { date: '2024-06-02', totalNetVolume: -50000 },
    ],
    proprietary: [
      { date: '2024-06-01', totalNetVolume: 20000 },
      { date: '2024-06-02', totalNetVolume: -10000 },
    ],
  },
  insider: { transactions: [] },
  news: { items: [], tickerScore: null },
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="ai-insight-v2">{children}</div>
}

describe('LayerCharts L3', () => {
  it('renders two chart-block titles for L3', () => {
    render(<LayerCharts layer="L3" rawInput={fixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Nước ngoài (10 phiên)')).toBeInTheDocument()
    expect(screen.getByText('Tự doanh (10 phiên)')).toBeInTheDocument()
  })

  it('renders two chart-block containers for L3', () => {
    const { container } = render(<LayerCharts layer="L3" rawInput={fixture} />, {
      wrapper: Wrapper,
    })
    const blocks = container.querySelectorAll('.chart-block')
    expect(blocks.length).toBe(2)
  })

  it('renders a recharts ResponsiveContainer (svg wrapper) for each chart block', () => {
    const { container } = render(<LayerCharts layer="L3" rawInput={fixture} />, {
      wrapper: Wrapper,
    })
    // Recharts renders a <div class="recharts-responsive-container"> per chart
    const containers = container.querySelectorAll('.recharts-responsive-container')
    expect(containers.length).toBeGreaterThanOrEqual(2)
  })
})
