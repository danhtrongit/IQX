// useMidDayMarketAnalysis.test.ts
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { it, expect, vi } from "vitest"
vi.mock("@/shared/http/client", () => ({ api: { get: () => ({ json: async () => ({ report_type: "midday", headline: "M" }) }) } }))
import { useMidDayMarketAnalysis } from "./useMidDayMarketAnalysis"

it("fetches the midday endpoint", async () => {
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useMidDayMarketAnalysis(), { wrapper })
  await waitFor(() => expect(result.current.data?.headline).toBe("M"))
})
