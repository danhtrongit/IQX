import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider } from "./auth-provider"
import { useAuth } from "@/hooks/use-auth"

const { api, clearTokens, saveTokens } = vi.hoisted(() => ({
  api: vi.fn(),
  clearTokens: vi.fn(),
  saveTokens: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  ACCESS_TOKEN_KEY: "iqx.v2.access_token",
  api,
  clearTokens,
  getAccessToken: vi.fn(() => null),
  saveTokens,
}))

function Probe() {
  const auth = useAuth()
  return <>
    <output aria-label="referral">{auth.referralCode ?? ""}</output>
    <output aria-label="authenticated">{String(auth.isAuthenticated)}</output>
    <button onClick={() => auth.openAuth("register", " ab-12 ")}>set referral</button>
    <button onClick={() => void auth.register({ email: "new@example.com", password: "Password!1", full_name: "New User", referral_code: auth.referralCode ?? undefined })}>register</button>
    <button onClick={() => void auth.logout()}>logout</button>
  </>
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>)
}

beforeEach(() => {
  api.mockReset()
  clearTokens.mockClear()
  saveTokens.mockClear()
  localStorage.clear()
  sessionStorage.clear()
  api.mockImplementation((path: string) => {
    if (path === "/auth/login") return Promise.resolve({ access_token: "access", refresh_token: "refresh", token_type: "bearer" })
    if (path === "/auth/me") return Promise.resolve({ id: "u1", email: "new@example.com", full_name: "New User", role: "user" })
    if (path === "/premium/me") return Promise.resolve({ is_premium: false })
    return Promise.resolve({})
  })
})

describe("AuthProvider referral registration", () => {
  it("forwards referral_code to registration and clears it after login", async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole("button", { name: "set referral" }))
    expect(screen.getByLabelText("referral").textContent).toBe("AB-12")

    await user.click(screen.getByRole("button", { name: "register" }))
    await waitFor(() => expect(screen.getByLabelText("authenticated").textContent).toBe("true"))
    const registerCall = api.mock.calls.find(([path]) => path === "/auth/register")
    expect(registerCall).toBeTruthy()
    expect(JSON.parse(registerCall?.[1]?.body as string)).toMatchObject({ referral_code: "AB-12" })
    expect(screen.getByLabelText("referral").textContent).toBe("")
  })

  it("clears referral state when logging out", async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole("button", { name: "set referral" }))
    await user.click(screen.getByRole("button", { name: "logout" }))
    await waitFor(() => expect(screen.getByLabelText("referral").textContent).toBe(""))
  })
})
