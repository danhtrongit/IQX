import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NewsList } from './NewsList'

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="ai-insight-v2">{children}</div>
}

const materialItems = [
  { title: 'Phát hành trái phiếu thành công', subtitle: 'Củng cố vốn cho 2026', tag: 'PHÁT HÀNH' },
  { title: 'Dự án tài chính số ra mắt', tag: 'VẬN HÀNH' },
]

const fillerItems = [
  { title: 'Khen thưởng nội bộ tháng 6', tag: 'NHÂN SỰ' },
]

describe('NewsList', () => {
  it('renders material item titles', () => {
    render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    expect(screen.getByText('Phát hành trái phiếu thành công')).toBeInTheDocument()
    expect(screen.getByText('Dự án tài chính số ra mắt')).toBeInTheDocument()
  })

  it('renders material item subtitle when present', () => {
    render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    expect(screen.getByText('Củng cố vốn cho 2026')).toBeInTheDocument()
  })

  it('renders material item tags with gold styling', () => {
    const { container } = render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    const tags = container.querySelectorAll('.news-tag')
    // Two material items → two tags in the material section
    expect(tags.length).toBeGreaterThanOrEqual(2)
    expect(tags[0].textContent).toBe('PHÁT HÀNH')
    expect(tags[1].textContent).toBe('VẬN HÀNH')
  })

  it('renders filler list when filler is non-empty', () => {
    const { container } = render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    const fillerList = container.querySelector('.news-filler-list')
    expect(fillerList).not.toBeNull()
    expect(screen.getByText('Khen thưởng nội bộ tháng 6')).toBeInTheDocument()
  })

  it('renders filler tags', () => {
    const { container } = render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    const fillerTags = container.querySelectorAll('.news-filler-list .news-tag')
    expect(fillerTags.length).toBe(1)
    expect(fillerTags[0].textContent).toBe('NHÂN SỰ')
  })

  it('omits the filler section entirely when filler array is empty', () => {
    const { container } = render(<NewsList material={materialItems} filler={[]} />, { wrapper: Wrapper })
    expect(container.querySelector('.news-filler-list')).toBeNull()
  })

  it('renders a "Tin trọng yếu" header above the material section', () => {
    render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    expect(screen.getByText('Tin trọng yếu')).toBeInTheDocument()
  })

  it('renders a "Tin phụ" header above the filler section', () => {
    render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    expect(screen.getByText('Tin phụ')).toBeInTheDocument()
  })

  it('does not render the "Tin phụ" header when filler is empty', () => {
    render(<NewsList material={materialItems} filler={[]} />, { wrapper: Wrapper })
    expect(screen.queryByText('Tin phụ')).toBeNull()
  })

  it('renders every material item as its own block-level line, not an inline chip', () => {
    const { container } = render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    const materialLines = container.querySelectorAll('.news-material .news-item')
    expect(materialLines.length).toBe(materialItems.length)
    materialLines.forEach((el) => expect(el.tagName).toBe('DIV'))
  })

  it('renders every filler item as its own block-level line (div.news-item), not an inline chip run', () => {
    const { container } = render(<NewsList material={materialItems} filler={fillerItems} />, { wrapper: Wrapper })
    const fillerLines = container.querySelectorAll('.news-filler-list .news-item')
    expect(fillerLines.length).toBe(fillerItems.length)
    fillerLines.forEach((el) => expect(el.tagName).toBe('DIV'))
    // old inline-chip markup must be gone
    expect(container.querySelectorAll('.filler-item').length).toBe(0)
  })

  it('renders correctly with no filler and still shows material items', () => {
    render(<NewsList material={materialItems} filler={[]} />, { wrapper: Wrapper })
    expect(screen.getByText('Phát hành trái phiếu thành công')).toBeInTheDocument()
    expect(screen.queryByText('Khen thưởng nội bộ tháng 6')).toBeNull()
  })

  it('renders real LLM tag (e.g. "Phát hành") and not dash placeholder', () => {
    const items = [
      { title: 'Phát hành trái phiếu thành công', tag: 'Phát hành' },
    ]
    render(<NewsList material={items} filler={[]} />, { wrapper: Wrapper })
    const tags = document.querySelectorAll('.news-tag')
    expect(tags[0].textContent).toBe('Phát hành')
    // dash placeholder must NOT appear
    expect(screen.queryByText('—')).toBeNull()
  })
})
