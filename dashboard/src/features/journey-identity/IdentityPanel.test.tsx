import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { identityFixture } from "./test-fixtures"

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  useIdentity: vi.fn(),
}))

vi.mock("./hooks", () => ({ useIdentity: () => mocks.useIdentity() }))

import { IdentityPanel } from "./IdentityPanel"

describe("IdentityPanel 2D integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useIdentity.mockReturnValue({
      data: identityFixture(),
      isPending: false,
      isError: false,
      refetch: mocks.refetch,
    })
  })

  it("hiển thị avatar body tĩnh đúng linh thú và không mount animation player", () => {
    const view = render(<IdentityPanel />)

    expect(screen.getByRole("heading", { name: "Bạch Hổ" })).toBeInTheDocument()
    expect(view.container.querySelector("img.mascot-avatar")).toHaveAttribute(
      "src",
      "/assets/mascots-2d/v2/bach-ho/avatar-body.webp?v=2.0.1",
    )
    expect(view.container.querySelector(".mascot-2d-stage")).not.toBeInTheDocument()
    expect(view.container.querySelector(".sprite-strip-player")).not.toBeInTheDocument()
  })

  it("giữ nút làm mới là thao tác đọc dữ liệu", () => {
    render(<IdentityPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })
})
