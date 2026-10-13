import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { api } = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, api }
})
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" }, isPremium: true }) }))
vi.mock("../../hooks", () => ({
  useStockAiInsight: () => ({
    insight: null,
    analyze: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}))

import { StockInsightBriefing } from "../stock-insight-briefing"

const injected = { updatedAt: "2026-10-13T01:00:00.000Z", layers: {} } as never

function renderBriefing(teaser: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <StockInsightBriefing symbol="VCB" injected={injected} teaser={teaser} />
    </QueryClientProvider>,
  )
}

describe("StockInsightBriefing investment view", () => {
  beforeEach(() => {
    api.mockReset()
    api.mockResolvedValue({
      data: { status: "ready", version: 1, theses: [{ id: "a", order: 1, title: "Luận điểm", summary: "Tóm tắt" }], valuation: null },
    })
  })
  afterEach(cleanup)

  it("does not render or fetch the block in teaser mode", async () => {
    renderBriefing(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByText("Góc nhìn đầu tư")).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it("renders the block in full mode", async () => {
    renderBriefing(false)
    expect(await screen.findByText("Góc nhìn đầu tư")).toBeTruthy()
  })
})
