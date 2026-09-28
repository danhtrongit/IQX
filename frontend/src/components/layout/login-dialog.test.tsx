import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LoginDialog } from "./login-dialog"
import { normalizeReferralCode } from "./referral"

const mocks = vi.hoisted(() => ({
  auth: {
    user: null,
    isLoading: false,
    authOpen: true,
    authMode: "register" as "login" | "register",
    referralCode: null as string | null,
    openAuth: vi.fn(),
    setAuthOpen: vi.fn(),
    register: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  },
}))

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.auth }))

beforeEach(() => {
  mocks.auth.openAuth.mockClear()
  mocks.auth.register.mockClear()
  mocks.auth.login.mockClear()
  mocks.auth.setAuthOpen.mockClear()
  mocks.auth.authOpen = true
  mocks.auth.isLoading = false
  mocks.auth.authMode = "register"
  mocks.auth.referralCode = null
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

function renderDialog(path = "/signup") {
  return render(<MemoryRouter initialEntries={[path]}><LoginDialog /></MemoryRouter>)
}

async function fillRequiredRegistration(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Họ và tên"), "Nguyen Van A")
  await user.type(screen.getByLabelText("Email"), "a@example.com")
  await user.type(screen.getByLabelText("Mật khẩu"), "Password!1")
}

describe("referral registration", () => {
  it("normalizes referral codes for display and rejects malformed values", () => {
    expect(normalizeReferralCode("  ab-12 ")).toBe("AB-12")
    expect(normalizeReferralCode("a")).toBeNull()
    expect(normalizeReferralCode("ab")).toBeNull()
    expect(normalizeReferralCode("abc")).toBe("ABC")
    expect(normalizeReferralCode("not a code")).toBeNull()
  })

  it("opens registration from a referral deep link", async () => {
    mocks.auth.authOpen = false
    renderDialog("/?ref=ab-12")
    await waitFor(() => expect(mocks.auth.openAuth).toHaveBeenCalledWith("register", "AB-12"))
  })

  it("waits for session verification before opening a referral link", async () => {
    mocks.auth.authOpen = false
    mocks.auth.isLoading = true
    renderDialog("/?ref=ab-12")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.auth.openAuth).not.toHaveBeenCalled()
  })

  it("shows and allows clearing a valid deep-link prefill", async () => {
    const user = userEvent.setup()
    renderDialog("/?ref=ab-12")
    const referral = screen.getByLabelText("Mã giới thiệu (không bắt buộc)")
    expect((referral as HTMLInputElement).value).toBe("AB-12")
    expect(referral.hasAttribute("readonly")).toBe(false)
    expect(referral.hasAttribute("required")).toBe(false)
    await user.clear(referral)
    expect((referral as HTMLInputElement).value).toBe("")
  })

  it("submits an edited deep-link prefill", async () => {
    const user = userEvent.setup()
    renderDialog("/?ref=ab-12")
    const referral = screen.getByLabelText("Mã giới thiệu (không bắt buộc)")
    await user.clear(referral)
    await user.type(referral, " cd_3 ")
    await fillRequiredRegistration(user)
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }))
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalledWith(expect.objectContaining({ referral_code: "CD_3" })))
  })

  it("keeps an invalid deep-link code editable and validates it on submit", async () => {
    const user = userEvent.setup()
    renderDialog("/?ref=not%20a%20code")
    const referral = screen.getByLabelText("Mã giới thiệu (không bắt buộc)")
    expect((referral as HTMLInputElement).value).toBe("not a code")
    expect(screen.queryByRole("alert")).toBeNull()
    await fillRequiredRegistration(user)
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }))
    expect(mocks.auth.register).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toContain("3 đến 32")
  })

  it("allows manual codes and normalizes them", async () => {
    const user = userEvent.setup()
    renderDialog()
    const referral = screen.getByLabelText("Mã giới thiệu (không bắt buộc)")
    await user.type(referral, " ab-12 ")
    await fillRequiredRegistration(user)
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }))
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "Password!1",
      full_name: "Nguyen Van A",
      referral_code: "AB-12",
    }))
  })

  it("omits a blank optional code", async () => {
    const user = userEvent.setup()
    renderDialog()
    await fillRequiredRegistration(user)
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }))
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "Password!1",
      full_name: "Nguyen Van A",
    }))
  })

  it("blocks malformed input, then allows clearing and submitting a valid code", async () => {
    const user = userEvent.setup()
    renderDialog()
    const referral = screen.getByLabelText("Mã giới thiệu (không bắt buộc)")
    await user.type(referral, "not a code")
    await fillRequiredRegistration(user)
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }))
    expect(mocks.auth.register).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toContain("3 đến 32")

    await user.clear(referral)
    await user.type(referral, " xy_9 ")
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }))
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalledWith(expect.objectContaining({ referral_code: "XY_9" })))
  })

  it("does not render the referral field in login mode", () => {
    mocks.auth.authMode = "login"
    renderDialog()
    expect(screen.queryByLabelText("Mã giới thiệu (không bắt buộc)")).toBeNull()
  })
})
