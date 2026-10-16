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
    <button onClick={() => auth.openAuth("register", " Lan.Nguyen ")}>set referral</button>
    <button onClick={() => auth.openAuth("register", " ctv_0a1b2c3d4e ")}>set legacy referral</button>
    <button onClick={() => auth.openAuth("register", " not a code ")}>set malformed referral</button>
    <button onClick={() => void auth.register({ full_name: "New User", username: "new.user", email: "new@example.com", phone_number: "0912 345 678", password: "Password!1", referral_code: auth.referralCode ?? undefined })}>register</button>
    <button onClick={() => void auth.login("new.user", "Password!1")}>login by username</button>
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
    if (path === "/auth/me") return Promise.resolve({ id: "u1", email: "new@example.com", username: "new.user", full_name: "New User", role: "user" })
    if (path === "/premium/me") return Promise.resolve({ is_premium: false })
    return Promise.resolve({})
  })
})

describe("AuthProvider referral registration", () => {
  it("forwards referral_code to registration and clears it after login", async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole("button", { name: "set referral" }))
    expect(screen.getByLabelText("referral").textContent).toBe("lan.nguyen")

    await user.click(screen.getByRole("button", { name: "register" }))
    await waitFor(() => expect(screen.getByLabelText("authenticated").textContent).toBe("true"))
    const registerCall = api.mock.calls.find(([path]) => path === "/auth/register")
    expect(registerCall).toBeTruthy()
    expect(JSON.parse(registerCall?.[1]?.body as string)).toEqual({
      full_name: "New User",
      username: "new.user",
      email: "new@example.com",
      phone_number: "0912 345 678",
      password: "Password!1",
      referral_code: "lan.nguyen",
    })
    const loginCall = api.mock.calls.find(([path]) => path === "/auth/login")
    expect(JSON.parse(loginCall?.[1]?.body as string)).toEqual({ identifier: "new@example.com", password: "Password!1" })
    expect(screen.getByLabelText("referral").textContent).toBe("")
  })

  it("keeps legacy LS_/CTV_ codes uppercase and leaves malformed codes for the form to flag", async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole("button", { name: "set legacy referral" }))
    expect(screen.getByLabelText("referral").textContent).toBe("CTV_0A1B2C3D4E")
    await user.click(screen.getByRole("button", { name: "set malformed referral" }))
    expect(screen.getByLabelText("referral").textContent).toBe("not a code")
  })

  it("logs in with an identifier, never the legacy email key", async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole("button", { name: "login by username" }))
    await waitFor(() => expect(screen.getByLabelText("authenticated").textContent).toBe("true"))
    const loginCall = api.mock.calls.find(([path]) => path === "/auth/login")
    expect(JSON.parse(loginCall?.[1]?.body as string)).toEqual({ identifier: "new.user", password: "Password!1" })
  })

  it("clears referral state when logging out", async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole("button", { name: "set referral" }))
    await user.click(screen.getByRole("button", { name: "logout" }))
    await waitFor(() => expect(screen.getByLabelText("referral").textContent).toBe(""))
  })
})
