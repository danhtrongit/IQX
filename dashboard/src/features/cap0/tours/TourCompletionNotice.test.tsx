import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TourCompletionNotice } from "./TourCompletionNotice"

describe("TourCompletionNotice", () => {
  it("offers a retry without asking the user to replay", () => {
    const retry = vi.fn()
    render(<TourCompletionNotice pending={false} error={new Error("offline")} onRetry={retry} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Bạn không cần xem lại từ đầu")
    fireEvent.click(screen.getByRole("button", { name: "Thử lưu lại" }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
