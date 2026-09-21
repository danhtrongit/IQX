import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, expect, it, vi } from "vitest"
import { AuthProvider, useAuth } from "./auth-context"
import { useAnalyzePortfolio } from "@/features/portfolio-manager/hooks"

vi.mock("@/shared/http/client", () => ({
  AUTH_LOGOUT_EVENT: "auth:logout", clearAuthTokens: vi.fn(), getAccessToken: () => "token",
  setAccessToken: vi.fn(), setRefreshToken: vi.fn(),
}))
vi.mock("./api", () => ({ authApi: {
  login: vi.fn(async () => ({ user: { id: "user-b", email: "b@example.test" }, accessToken: "b", refreshToken: "b" })),
  logout: vi.fn(async () => {}),
} }))
vi.mock("@/features/portfolio-manager/api", () => ({ portfolioManagerApi: {
  analyze: vi.fn(async () => ({ report_owner: "user-a" })),
} }))

function Session() {
  const auth = useAuth()
  return <><span>{auth.user?.id ?? "anonymous"}</span>
    <button onClick={() => void auth.login({ email: "b@example.test", password: "test" })}>Switch account</button></>
}

function PortfolioSession() {
  const analysis = useAnalyzePortfolio()
  return <><Session /><button onClick={() => analysis.analyze()}>Analyze</button>
    <output data-testid="portfolio-report">{JSON.stringify(analysis.report)}</output></>
}

beforeEach(() => localStorage.clear())

it("removes old-account journey, trading and Bot evidence on logout and account switch", async () => {
  localStorage.setItem("user", JSON.stringify({ id: "user-a" }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const privateKeys = [["cap0", "placement"], ["cap6", "progress"], ["bot", "overview"],
    ["trading", "portfolio"], ["journey-identity", "user-a"], ["journey-reading", "user-a", "VNM"],
    ["settings", "profile"], ["alerts", "rules"], ["lessons", "progress"],
    ["backtest", "strategies"], ["stock", "ai", "VNM"], ["portfolio-manager", "report"]]
  const seedPrivate = () => privateKeys.forEach(key => client.setQueryData(key, { owner: "user-a" }))
  seedPrivate()
  client.getMutationCache().build(client, { mutationKey: ["portfolio-manager"] })
  client.setQueryData(["public-quotes", "VNM"], { price: 100 })
  render(<QueryClientProvider client={client}><AuthProvider><Session /></AuthProvider></QueryClientProvider>)
  act(() => window.dispatchEvent(new Event("auth:logout")))
  expect(screen.getByText("anonymous")).toBeInTheDocument()
  expect(client.getMutationCache().getAll()).toHaveLength(0)
  privateKeys.forEach(key => expect(client.getQueryData(key)).toBeUndefined())
  expect(client.getQueryData(["public-quotes", "VNM"])).toEqual({ price: 100 })

  seedPrivate()
  fireEvent.click(screen.getByText("Switch account"))
  await waitFor(() => expect(screen.getByText("user-b")).toBeInTheDocument())
  privateKeys.forEach(key => expect(client.getQueryData(key)).toBeUndefined())
  client.clear()
})

it("clears an active portfolio report when its owner logs out", async () => {
  localStorage.setItem("user", JSON.stringify({ id: "user-a" }))
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><AuthProvider><PortfolioSession /></AuthProvider></QueryClientProvider>)
  fireEvent.click(screen.getByText("Analyze"))
  await waitFor(() => expect(screen.getByTestId("portfolio-report")).toHaveTextContent("user-a"))
  act(() => window.dispatchEvent(new Event("auth:logout")))
  await waitFor(() => expect(screen.getByTestId("portfolio-report")).toHaveTextContent("null"))
  client.clear()
})
