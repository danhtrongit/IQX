import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot } from "@/pages/demo-trading/bot/test-render"
import { FakeApiError } from "@/pages/demo-trading/bot/test-support"

import { UnsubscribePage } from "./unsubscribe-page"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("@/pages/demo-trading/bot/test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})

beforeEach(() => mocks.api.mockReset())

describe("/thong-bao/tat (v2.0 §8.4, T07)", () => {
  it("posts the token once, without login, and confirms the type turned off", async () => {
    mocks.api.mockResolvedValue({ type: "bot_trades", status: "unsubscribed" })
    renderBot(<UnsubscribePage />, "/thong-bao/tat?token=abc.def")
    expect(await screen.findByRole("heading", { name: "Đã tắt thông báo Bot giao dịch." })).toBeTruthy()
    expect(mocks.api).toHaveBeenCalledTimes(1)
    expect(mocks.api).toHaveBeenCalledWith("/notifications/unsubscribe", { method: "POST", body: JSON.stringify({ token: "abc.def" }) })
  })

  it("a used token says so", async () => {
    mocks.api.mockResolvedValue({ type: "bulletin", status: "already_used" })
    renderBot(<UnsubscribePage />, "/thong-bao/tat?token=abc")
    expect(await screen.findByRole("heading", { name: "Liên kết này đã được dùng." })).toBeTruthy()
    expect(screen.getByText("Thông báo Bản tin cuối phiên đã được tắt trước đó.")).toBeTruthy()
  })

  it("an invalid or missing token is reported without a request for a missing one", async () => {
    mocks.api.mockRejectedValue(new FakeApiError("bad", 400, { code: "TOKEN_INVALID" }))
    renderBot(<UnsubscribePage />, "/thong-bao/tat?token=bad")
    expect(await screen.findByRole("heading", { name: "Liên kết không hợp lệ." })).toBeTruthy()
    mocks.api.mockReset()
    renderBot(<UnsubscribePage />, "/thong-bao/tat")
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Liên kết không hợp lệ." })).toHaveLength(2))
    expect(mocks.api).not.toHaveBeenCalled()
  })
})
