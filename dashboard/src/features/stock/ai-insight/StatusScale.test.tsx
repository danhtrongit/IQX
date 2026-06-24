import React from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusScale } from './StatusScale'

describe('StatusScale', () => {
  it('renders 5 segments', () => {
    const { container } = render(<StatusScale level={2} />)
    const segments = container.querySelectorAll('[data-seg]')
    expect(segments).toHaveLength(5)
  })

  it('has exactly 1 active segment for level=2', () => {
    const { container } = render(<StatusScale level={2} />)
    const active = container.querySelectorAll('[data-active="true"]')
    expect(active).toHaveLength(1)
  })

  it('the active segment is the 2nd one (index 1) for level=2', () => {
    const { container } = render(<StatusScale level={2} />)
    const segments = container.querySelectorAll('[data-seg]')
    expect(segments[1].getAttribute('data-active')).toBe('true')
  })

  it('has aria-label including "2" for level=2', () => {
    const { container } = render(<StatusScale level={2} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('aria-label')).toMatch(/2/)
  })

  it('has role="img" on container', () => {
    const { container } = render(<StatusScale level={2} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('role')).toBe('img')
  })

  it('renders exactly 1 active segment for each level', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const { container } = render(<StatusScale level={level} />)
      const active = container.querySelectorAll('[data-active="true"]')
      expect(active).toHaveLength(1)
      const segments = container.querySelectorAll('[data-seg]')
      expect(segments[level - 1].getAttribute('data-active')).toBe('true')
    }
  })

  it('aria-label says "bậc N trên 5"', () => {
    const { container } = render(<StatusScale level={3} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.getAttribute('aria-label')).toBe('bậc 3 trên 5')
  })
})
