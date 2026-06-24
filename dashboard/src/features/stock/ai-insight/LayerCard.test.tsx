import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LayerCard } from './LayerCard'
import type { LayerCard as LayerCardType } from '../types'

const baseFixture: LayerCardType = {
  layerNum: 'L3',
  layerName: 'Dòng tiền',
  statusLabel: 'Cảnh báo nhẹ',
  statusLevel: 2,
  fields: [
    {
      label: 'Khối ngoại',
      value: [
        { type: 'text', content: 'Bán ròng đáng kể, 3 phiên liên tiếp' },
      ],
    },
    {
      label: 'Tự doanh',
      value: [
        { type: 'emphasis', content: 'Mua ròng nhẹ', variant: 'bull' },
        { type: 'text', content: ', không đủ bù' },
      ],
    },
  ],
  diff: {
    text: [
      { type: 'text', content: 'Áp lực bán từ khối ngoại tăng tốc rõ rệt.' },
    ],
    hasChange: true,
  },
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="ai-insight-v2">{children}</div>
}

describe('LayerCard', () => {
  it('renders layerNum "L3" in the header', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('L3')).toBeInTheDocument()
  })

  it('renders layerName "Dòng tiền" in the header', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Dòng tiền')).toBeInTheDocument()
  })

  it('renders statusLabel "Cảnh báo nhẹ" in the header', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Cảnh báo nhẹ')).toBeInTheDocument()
  })

  it('renders a StatusScale with correct aria-label for the given level', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    // StatusScale emits aria-label="bậc 2 trên 5"
    expect(screen.getByRole('img', { name: /bậc 2 trên 5/i })).toBeInTheDocument()
  })

  it('renders field labels from the fields array', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Khối ngoại')).toBeInTheDocument()
    expect(screen.getByText('Tự doanh')).toBeInTheDocument()
  })

  it('renders field values via NarrativeText', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('Bán ròng đáng kể, 3 phiên liên tiếp')).toBeInTheDocument()
    expect(screen.getByText('Mua ròng nhẹ')).toBeInTheDocument()
  })

  it('renders the LayerDiff footer', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.getByText('SO VỚI PHIÊN TRƯỚC')).toBeInTheDocument()
    expect(screen.getByText('Áp lực bán từ khối ngoại tăng tốc rõ rệt.')).toBeInTheDocument()
  })

  it('renders the chart slot when a chart ReactNode is passed', () => {
    const Chart = () => <div data-testid="chart-slot">chart content</div>
    render(<LayerCard data={baseFixture} chart={<Chart />} />, { wrapper: Wrapper })
    expect(screen.getByTestId('chart-slot')).toBeInTheDocument()
  })

  it('does NOT render the chart slot when chart prop is omitted', () => {
    render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    expect(screen.queryByTestId('chart-slot')).toBeNull()
  })

  it('statusLabel has bear color for level 2', () => {
    const { container } = render(<LayerCard data={baseFixture} />, { wrapper: Wrapper })
    const statusLabelEl = container.querySelector('.status-label')
    expect(statusLabelEl).not.toBeNull()
    // level 2 → var(--bear)
    expect((statusLabelEl as HTMLElement).style.color).toBe('var(--bear)')
  })

  it('statusLabel has bull color for level 4', () => {
    const fixture: LayerCardType = { ...baseFixture, statusLevel: 4, statusLabel: 'Hỗ trợ nhẹ' }
    const { container } = render(<LayerCard data={fixture} />, { wrapper: Wrapper })
    const el = container.querySelector('.status-label')
    expect((el as HTMLElement).style.color).toBe('var(--bull)')
  })
})
