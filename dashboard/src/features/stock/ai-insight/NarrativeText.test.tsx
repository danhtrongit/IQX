import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NarrativeText } from './NarrativeText'
import type { NarrativeFragment } from '../types'

describe('NarrativeText', () => {
  it('renders plain text fragment', () => {
    const fragments: NarrativeFragment[] = [{ type: 'text', content: 'Hello world' }]
    render(<NarrativeText fragments={fragments} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders emphasis(bear) with a bear-indicating class', () => {
    const fragments: NarrativeFragment[] = [
      { type: 'emphasis', content: 'bán mạnh', variant: 'bear' },
    ]
    render(<NarrativeText fragments={fragments} />)
    const el = screen.getByText('bán mạnh')
    expect(el).toBeInTheDocument()
    expect(el.className).toMatch(/bear/)
  })

  it('renders emphasis(bull) with a bull-indicating class', () => {
    const fragments: NarrativeFragment[] = [
      { type: 'emphasis', content: 'mua thêm', variant: 'bull' },
    ]
    render(<NarrativeText fragments={fragments} />)
    const el = screen.getByText('mua thêm')
    expect(el.className).toMatch(/bull/)
  })

  it('renders number fragment with .num class', () => {
    const fragments: NarrativeFragment[] = [{ type: 'number', content: '61,600' }]
    render(<NarrativeText fragments={fragments} />)
    const el = screen.getByText('61,600')
    expect(el).toBeInTheDocument()
    expect(el.className).toMatch(/\bnum\b/)
  })

  it('renders highlight fragment as <b>', () => {
    const fragments: NarrativeFragment[] = [{ type: 'highlight', content: 'VCB' }]
    render(<NarrativeText fragments={fragments} />)
    const el = screen.getByText('VCB')
    expect(el.tagName.toLowerCase()).toBe('b')
  })

  it('renders multiple fragments in order', () => {
    const fragments: NarrativeFragment[] = [
      { type: 'text', content: 'Giá ' },
      { type: 'number', content: '62,000' },
      { type: 'text', content: ' đồng' },
    ]
    const { container } = render(<NarrativeText fragments={fragments} />)
    expect(container.textContent).toBe('Giá 62,000 đồng')
  })
})
