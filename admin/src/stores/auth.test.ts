import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useAuthStore } from "./auth"
import { authApi } from "@/lib/api/auth"

vi.mock("@/lib/api/auth", () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
  setAccessToken: vi.fn((token: string | null) => {
    if (token) sessionStorage.setItem("admin_accessToken", token)
    else sessionStorage.removeItem("admin_accessToken")
  }),
  setRefreshToken: vi.fn((token: string | null) => {
    if (token) localStorage.setItem("admin_refreshToken", token)
    else localStorage.removeItem("admin_refreshToken")
  }),
  getAccessToken: vi.fn(() => sessionStorage.getItem("admin_accessToken")),
}))

const adminUser = {
  id: "u1",
  email: "admin@example.com",
  fullName: "Admin",
  role: "admin",
  status: "active",
  isActive: true,
  createdAt: "2026-06-10T00:00:00Z",
}

describe("auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it("persists admin session on login", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user: adminUser,
      accessToken: "access",
      refreshToken: "refresh",
    })

    const store = useAuthStore()
    await store.login({ email: "admin@example.com", password: "secret" })

    expect(store.isAuthenticated).toBe(true)
    expect(sessionStorage.getItem("admin_user")).toContain("admin@example.com")
    expect(sessionStorage.getItem("admin_accessToken")).toBe("access")
    expect(localStorage.getItem("admin_refreshToken")).toBe("refresh")
  })

  it("clears session when fresh user is no longer admin", async () => {
    sessionStorage.setItem("admin_accessToken", "access")
    sessionStorage.setItem("admin_user", JSON.stringify(adminUser))
    vi.mocked(authApi.getMe).mockResolvedValue({ ...adminUser, role: "user" })

    const store = useAuthStore()
    await store.bootstrap()

    expect(store.user).toBeNull()
    expect(sessionStorage.getItem("admin_user")).toBeNull()
  })
})
