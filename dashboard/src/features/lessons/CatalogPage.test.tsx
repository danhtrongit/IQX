// CatalogPage.test.tsx — Bài học tour wiring (T5, docs/superpowers/plans/
// 2026-07-27-feature-tours.md), spec `IQX-Tour-BaiHoc.md` v1.0.
//
// FREE tour — no premium gate on the launch button (unlike the Backtester/
// Cảnh báo/Portfolio Manager/AI Mẫu nến tours). Every step is a `centered`
// concept card (see `tour/configs/baiHocTour.ts`), so this test only checks
// the launch wiring on `CatalogPage`, not any cross-route `data-tour-id`
// grounding. `useCourses` (`./hooks`) is mocked to keep the page
// network-free/deterministic; `LessonCard` uses `useNavigate`, so the page is
// rendered inside a `MemoryRouter` (same approach as
// `price-board/BangGiaPage.test.tsx`).
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { baiHocTour } from "@/features/tour/configs/baiHocTour"
import CatalogPage from "./CatalogPage"

const STORAGE_KEY = "iqx_tour_baihoc"

vi.mock("./hooks", () => ({
  useCourses: () => ({
    data: { items: [], total: 0 },
    isFetching: false,
  }),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <CatalogPage />
    </MemoryRouter>,
  )
}

describe("CatalogPage — Bài học tour wiring", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY)
  })

  it("shows the 'Xem hướng dẫn' launch button (free feature — no premium gate)", () => {
    renderPage()
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()
  })

  it("does not render the tour overlay before the button is clicked", () => {
    renderPage()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("clicking the launch button starts the tour and renders step 1", () => {
    renderPage()
    fireEvent.click(screen.getByText("Xem hướng dẫn"))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(baiHocTour.steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(`ĐIỂM 1/${baiHocTour.steps.length}`)).toBeInTheDocument()
  })
})
