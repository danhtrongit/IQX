import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { identityFixture } from "./test-fixtures"
const mocked = vi.hoisted(() => ({ useIdentity: vi.fn() }))
vi.mock("./hooks", () => ({ useIdentity: () => mocked.useIdentity() }))
import { IdentityPanel } from "./IdentityPanel"

describe("legacy mascot recovery provenance", () => {
  it("shows the real stored match counts and tie, explicitly labelled as historical records", () => {
    const state = identityFixture()
    state.mascot = { ...state.mascot!, id: "thanh_long", name: "Thanh Long", dominant_layer: "dong_tien",
      assignment_basis: "legacy_order_snapshot", valid_pair_count: 10,
      match_counts: { ky_thuat: 3, dong_tien: 5, noi_bo: 5, tin_tuc: 5, dinh_gia: 4 },
      tied_layers: ["dong_tien", "noi_bo", "tin_tuc"] }
    mocked.useIdentity.mockReturnValue({ data: state, refetch: vi.fn() })
    render(<IdentityPanel />)
    expect(screen.getByRole("heading", { name: "Thanh Long" })).toBeInTheDocument()
    expect(screen.getByText(/khôi phục từ các bản tự chấm và nhận định AI đã lưu/)).toBeInTheDocument()
    expect(screen.getByText(/10 bộ nhận định đã lưu/)).toHaveTextContent("5 lần")
    expect(screen.getByText(/IQX chọn Thanh Long theo thứ tự ổn định/)).toBeInTheDocument()
    expect(screen.getByRole("table")).toBeInTheDocument()
  })
})
