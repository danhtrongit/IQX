import { render, screen } from "@testing-library/react"
import { vi } from "vitest"

const progress = vi.fn()
vi.mock("./hooks", () => ({ useCap7Progress: () => progress() }))
vi.mock("@/shared/contexts/sidebar-context", () => ({ useSidebar: () => ({ setActivePanel: vi.fn() }) }))

import { JourneyPanelCap7 } from "./JourneyPanelCap7"

const liveProgress = {
  id: "p7", user_id: "u7", entered_at: "2026-09-01T00:00:00Z", can_doi_ok: false,
  so_ma_dang_giu: 4, so_nganh_dang_giu: 3, ma_ty_trong_cao_nhat: "AAA",
  ty_trong_ma_cao_nhat_pct: 30, nganh_ty_trong_cao_nhat: "Ngân hàng",
  ty_trong_nganh_cao_nhat_pct: 40, ma_chua_co_gia: [], ma_chua_ro_nganh: [],
  du_lieu_day_du: true, nguong_ty_trong_ma_pct: 30, nguong_ty_trong_nganh_pct: 40,
  toi_thieu_ma: 4, toi_thieu_nganh: 3, graduated_at: null, time_to_graduate_hours: null,
}

describe("JourneyPanelCap7", () => {
  it("renders one live allocation task with all three simultaneous conditions", () => {
    progress.mockReturnValue({ data: liveProgress })
    render(<JourneyPanelCap7 />)
    expect(screen.getByTestId("cap7-journey")).toHaveTextContent("CẤP 7 · 0/1")
    expect(screen.getByTestId("cap7-symbol-condition")).toHaveTextContent("AAA 30.0%")
    expect(screen.getByTestId("cap7-sector-condition")).toHaveTextContent("Ngân hàng 40.0%")
    expect(screen.getByTestId("cap7-diversification-condition")).toHaveTextContent("4 mã · 3 ngành")
  })

  it("shows missing data as unsafe rather than a zero allocation", () => {
    progress.mockReturnValue({ data: { ...liveProgress, ma_chua_co_gia: ["BBB"], du_lieu_day_du: false } })
    render(<JourneyPanelCap7 />)
    expect(screen.getByText(/Thiếu giá hoặc ngành/)).toBeInTheDocument()
  })
})
