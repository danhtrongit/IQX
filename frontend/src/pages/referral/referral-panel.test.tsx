import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ReferralPanel } from "./referral-panel"

const mocks = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  fetchTeamReferralCode: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchTeamReferralCode: mocks.fetchTeamReferralCode,
}))

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><ReferralPanel /></QueryClientProvider>)
}

beforeEach(() => {
  mocks.fetchTeamReferralCode.mockReset().mockResolvedValue({
    code: "lan.nguyen",
    commissionPct: 40,
    offerType: "days",
    offerDays: 30,
    memberCount: 12,
    appointedAt: "2026-10-01T00:00:00.000Z",
  })
})

describe("settings referral card", () => {
  it.each(["user", "premium", "admin"])("renders nothing and fetches nothing for role %s", (role) => {
    mocks.user = { id: "u1", role }
    const { container } = renderPanel()
    expect(container.textContent).toBe("")
    expect(mocks.fetchTeamReferralCode).not.toHaveBeenCalled()
  })

  it("shows a team lead their code (the username), commission and offer", async () => {
    mocks.user = { id: "lead-1", role: "team_lead" }
    renderPanel()
    expect(await screen.findByText("lan.nguyen")).toBeTruthy()
    expect(screen.getByText("Mã giới thiệu")).toBeTruthy()
    expect(screen.getByText("40%")).toBeTruthy()
    expect(screen.getByText("Premium miễn phí 30 ngày")).toBeTruthy()
    expect(screen.getByText(`${window.location.origin}/?ref=lan.nguyen`)).toBeTruthy()
  })
})
