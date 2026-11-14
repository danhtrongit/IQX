import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"

describe("ScrollArea wheel chaining", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("không chặn cuộn dây chuyền: viewport không đặt overscroll-contain", () => {
    const { container } = render(<ScrollArea><p>nội dung</p></ScrollArea>)
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]')
    expect(viewport).not.toBeNull()
    expect(viewport?.className).not.toMatch(/overscroll-(?:y-|x-)?contain/)
  })

  it("bảng cuộn ngang vẫn để bánh xe chuột cuộn trang phía sau", () => {
    const { container } = render(
      <Table><TableBody><TableRow><TableCell>ô</TableCell></TableRow></TableBody></Table>,
    )
    const viewport = container.querySelector('[data-slot="table-container"] [data-slot="scroll-area-viewport"]')
    expect(viewport).not.toBeNull()
    expect(viewport?.className).not.toMatch(/overscroll-(?:y-|x-)?contain/)
  })
})
