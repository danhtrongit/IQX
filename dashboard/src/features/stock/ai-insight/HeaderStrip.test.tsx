import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HeaderStrip } from './HeaderStrip'
import type { StockHeader } from '../types'

// Wrap with .ai-insight-v2 so scoped CSS tokens are available
function renderWithWrapper(header: StockHeader) {
  return render(
    <div className="ai-insight-v2">
      <HeaderStrip header={header} />
    </div>,
  )
}

const VCB_POSITIVE: StockHeader = {
  symbol: 'VCB',
  sector: 'Ngân hàng',
  indexGroup: 'VN30',
  price: 61700,
  changePercent: 0.16,
  high: 62000,
  low: 61200,
  volume: '15.6M',
  isLive: true,
}

const VCB_NEGATIVE: StockHeader = {
  ...VCB_POSITIVE,
  changePercent: -1.23,
}

describe('HeaderStrip', () => {
  it('renders the ticker symbol', () => {
    renderWithWrapper(VCB_POSITIVE)
    expect(screen.getByText('VCB')).toBeInTheDocument()
  })

  it('renders the price (61,700)', () => {
    renderWithWrapper(VCB_POSITIVE)
    // toLocaleString('en-US') produces "61,700" (comma thousands separator)
    const priceEl = screen.getByText(/61[.,]700/)
    expect(priceEl).toBeInTheDocument()
  })

  it('renders the sector and indexGroup', () => {
    renderWithWrapper(VCB_POSITIVE)
    expect(screen.getByText(/Ngân hàng/)).toBeInTheDocument()
    expect(screen.getByText(/VN30/)).toBeInTheDocument()
  })

  it('gives the % Phiên cell the bull class for positive changePercent', () => {
    renderWithWrapper(VCB_POSITIVE)
    const pctEl = screen.getByText('+0.16%')
    expect(pctEl).toBeInTheDocument()
    expect(pctEl.className).toMatch(/\bpos\b/)
    expect(pctEl.className).not.toMatch(/\bneg\b/)
  })

  it('gives the % Phiên cell the bear class for negative changePercent', () => {
    renderWithWrapper(VCB_NEGATIVE)
    const pctEl = screen.getByText('-1.23%')
    expect(pctEl).toBeInTheDocument()
    expect(pctEl.className).toMatch(/\bneg\b/)
    expect(pctEl.className).not.toMatch(/\bpos\b/)
  })

  it('shows LIVE indicator when isLive=true', () => {
    renderWithWrapper(VCB_POSITIVE)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('hides LIVE indicator when isLive=false', () => {
    renderWithWrapper({ ...VCB_POSITIVE, isLive: false })
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument()
  })

  it('shows volume', () => {
    renderWithWrapper(VCB_POSITIVE)
    expect(screen.getByText('15.6M')).toBeInTheDocument()
  })
})
