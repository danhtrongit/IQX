import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"

import type { TeamLeadDetail, TeamLeadLookup } from "./api"

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Radix ScrollArea trong WorkspacePage cần ResizeObserver, jsdom không có. */
export function installResizeObserver() {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub
}

export function renderRoute(path: string, pattern: string, element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={element} />
          <Route path="*" element={<p>Trang khác</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export function leadDetail(overrides: Partial<TeamLeadDetail> = {}): TeamLeadDetail {
  return {
    user: { id: "lead-1", username: "lan.nguyen", email: "lan@iqx.test", fullName: "Nguyễn Lan", role: "team_lead", status: "active" },
    code: "lan.nguyen",
    status: "active",
    acceptingNewUsers: true,
    appointedAt: "2026-10-01T00:00:00Z",
    revokedAt: null,
    policy: {
      id: "p-1",
      commissionPct: 20,
      offerType: "days",
      offerDays: 30,
      offerVersionId: "v-1",
      effectiveFrom: "2026-10-01T00:00:00Z",
      reason: "Bổ nhiệm",
      createdBy: "admin-1",
    },
    metrics: { memberCount: 2, revenue30dVnd: 990000, commission30dVnd: 198000, activeFreePremiumCount: 1 },
    history: [],
    ...overrides,
  }
}

export function lookupResult(overrides: Partial<TeamLeadLookup> = {}): TeamLeadLookup {
  return {
    user: { id: "u-9", username: "minh.tran", email: "minh@iqx.test", fullName: "Trần Minh", role: "user", status: "active" },
    teamLead: null,
    group: null,
    appoint: { eligible: true, reason: null },
    addMember: { eligible: true, reason: null, action: "add" },
    ...overrides,
  }
}
