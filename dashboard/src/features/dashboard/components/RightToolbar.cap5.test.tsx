import { render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/shared/contexts/sidebar-context"

/**
 * ★★ GÁC THEO CẤP — `RightToolbar` là thanh công cụ DÙNG CHUNG của /bieu-do,
 * /co-phieu và cả chín shell cấp. Hai nút MỚI của Cấp 5 («Săn mã», «Watchlist»)
 * chỉ được mọc ra khi `isCap5Active`; ngoài Cấp 5 thanh công cụ phải giữ NGUYÊN
 * hình dạng cũ. Bài này canh CẢ HAI chiều.
 */
const { useCap0EventsMock, useCap0ProgressMock, useCap5EventsMock } = vi.hoisted(() => ({
  useCap0EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap0Active: false })),
  useCap0ProgressMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ data: null })),
  useCap5EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap5Active: false })),
}))

vi.mock("@/features/cap0/Cap0Context", () => ({ useCap0Events: () => useCap0EventsMock() }))
vi.mock("@/features/cap0/hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
}))
vi.mock("@/features/cap5/Cap5Context", () => ({ useCap5Events: () => useCap5EventsMock() }))

import { RightToolbar } from "./RightToolbar"

const CAP5_LABELS = ["Săn mã", "Watchlist"]

beforeEach(() => {
  vi.clearAllMocks()
  useCap0EventsMock.mockReturnValue({ isCap0Active: false })
  useCap0ProgressMock.mockReturnValue({ data: null })
  useCap5EventsMock.mockReturnValue({ isCap5Active: false })
})

function renderToolbar() {
  return render(
    <SidebarProvider>
      <RightToolbar />
    </SidebarProvider>,
  )
}

describe("RightToolbar — hai nút Cấp 5 gác theo cấp", () => {
  it("TRONG Cấp 5: hiện «Săn mã» + «Watchlist»", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    renderToolbar()
    for (const l of CAP5_LABELS) expect(screen.getByText(l)).toBeInTheDocument()
  })

  it("★ NGOÀI Cấp 5 (/bieu-do, /co-phieu, Cấp 0-4): KHÔNG có nút nào của Cấp 5", () => {
    renderToolbar()
    for (const l of CAP5_LABELS) expect(screen.queryByText(l)).not.toBeInTheDocument()
  })

  it("★ NGOÀI Cấp 5 thanh công cụ giữ NGUYÊN các nút cũ", () => {
    renderToolbar()
    for (const l of ["Hành trình", "Đặt lệnh", "Danh mục", "Tin tức", "AI Phân tích", "AI Mẫu nến"]) {
      expect(screen.getByText(l)).toBeInTheDocument()
    }
  })

  it("★ TRONG Cấp 5 nút «Danh mục» (Theo dõi/Nắm giữ/Lịch sử dùng chung) VẪN còn", () => {
    useCap5EventsMock.mockReturnValue({ isCap5Active: true })
    renderToolbar()
    expect(screen.getByText("Danh mục")).toBeInTheDocument()
  })

  it("★ Cấp 0 vẫn ẩn «Tin tức»/«AI Mẫu nến» đúng như cũ (không bị hai nút mới làm lệch)", () => {
    useCap0EventsMock.mockReturnValue({ isCap0Active: true })
    useCap0ProgressMock.mockReturnValue({ data: { graduated_at: null } })
    renderToolbar()
    expect(screen.queryByText("Tin tức")).not.toBeInTheDocument()
    expect(screen.queryByText("AI Mẫu nến")).not.toBeInTheDocument()
    for (const l of CAP5_LABELS) expect(screen.queryByText(l)).not.toBeInTheDocument()
  })
})
