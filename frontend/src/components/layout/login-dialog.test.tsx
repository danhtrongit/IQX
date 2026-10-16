import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { normalizeVietnamMobile, usernameFormatProblem } from "./auth-identity"
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
  checkUsernameAvailable: vi.fn(),
  checkReferralCode: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mocks.auth }))
vi.mock("./auth-identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth-identity")>()),
  checkUsernameAvailable: mocks.checkUsernameAvailable,
  checkReferralCode: mocks.checkReferralCode,
}))

beforeEach(() => {
  mocks.auth.openAuth.mockClear()
  mocks.auth.register.mockReset().mockResolvedValue(undefined)
  mocks.auth.login.mockClear()
  mocks.auth.setAuthOpen.mockClear()
  mocks.auth.authOpen = true
  mocks.auth.isLoading = false
  mocks.auth.authMode = "register"
  mocks.auth.referralCode = null
  mocks.checkUsernameAvailable.mockReset().mockResolvedValue(true)
  mocks.checkReferralCode.mockReset().mockResolvedValue({ offerType: "none", offerDays: null })
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

function renderDialog(path = "/signup") {
  return render(<MemoryRouter initialEntries={[path]}><LoginDialog /></MemoryRouter>)
}

const createButton = () => screen.getByRole("button", { name: "Tạo tài khoản" })

async function fillRequiredRegistration(user: ReturnType<typeof userEvent.setup>, overrides: { username?: string; phone?: string; password?: string } = {}) {
  await user.type(screen.getByLabelText("Họ và tên"), "Nguyen Van A")
  await user.type(screen.getByLabelText("Tên đăng nhập"), overrides.username ?? "nguyen.a")
  await user.type(screen.getByLabelText("Email"), "a@example.com")
  await user.type(screen.getByLabelText("Số điện thoại"), overrides.phone ?? "0912 345 678")
  await user.type(screen.getByLabelText("Mật khẩu"), overrides.password ?? "Password!1")
}

describe("identity rules", () => {
  it("normalizes referral codes: usernames lowercase with dots, legacy LS_/CTV_ codes uppercase", () => {
    expect(normalizeReferralCode("  Lan.Nguyen ")).toBe("lan.nguyen")
    expect(normalizeReferralCode("lan_99")).toBe("lan_99")
    expect(normalizeReferralCode("ctv_0a1b2c3d4e")).toBe("CTV_0A1B2C3D4E")
    expect(normalizeReferralCode("LS_ABCDEF0123")).toBe("LS_ABCDEF0123")
    expect(normalizeReferralCode("abc")).toBeNull()
    expect(normalizeReferralCode("ab-12")).toBeNull()
    expect(normalizeReferralCode("not a code")).toBeNull()
    expect(normalizeReferralCode("")).toBeNull()
  })

  it("matches the backend username and Vietnamese mobile rules", () => {
    expect(usernameFormatProblem("nguyen.a_1")).toBeNull()
    expect(usernameFormatProblem("abc")).not.toBeNull()
    expect(usernameFormatProblem("ctv_0a1b2c3d4e")).toBe("Tên đăng nhập này không dùng được.")
    expect(normalizeVietnamMobile("0912 345 678")).toBe("+84912345678")
    expect(normalizeVietnamMobile("+84 912.345-678")).toBe("+84912345678")
    expect(normalizeVietnamMobile("84912345678")).toBe("+84912345678")
    expect(normalizeVietnamMobile("024 3825 1234")).toBeNull()
    expect(normalizeVietnamMobile("+84 0912 345 678")).toBeNull()
  })
})

describe("registration form (spec §2.2)", () => {
  it("orders the fields as Họ và tên, Tên đăng nhập, Email, Số điện thoại, Mã giới thiệu, Mật khẩu", () => {
    renderDialog()
    const labels = Array.from(document.querySelectorAll("form label")).map(label => label.textContent)
    expect(labels).toEqual(["Họ và tên", "Tên đăng nhập", "Email", "Số điện thoại", "Mã giới thiệu (không bắt buộc)", "Mật khẩu"])
  })

  it("keeps Tạo tài khoản disabled until every required field is valid, then submits the full payload", async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(createButton().hasAttribute("disabled")).toBe(true)
    await user.type(screen.getByLabelText("Họ và tên"), "Nguyen Van A")
    await user.type(screen.getByLabelText("Tên đăng nhập"), "Nguyen.A")
    expect((screen.getByLabelText("Tên đăng nhập") as HTMLInputElement).value).toBe("nguyen.a")
    await user.type(screen.getByLabelText("Email"), "a@example.com")
    await user.type(screen.getByLabelText("Số điện thoại"), "0912 345 678")
    expect(createButton().hasAttribute("disabled")).toBe(true)
    await user.type(screen.getByLabelText("Mật khẩu"), "Password!1")
    expect(await screen.findByText("Tên đăng nhập dùng được.")).toBeTruthy()
    expect(mocks.checkUsernameAvailable).toHaveBeenLastCalledWith("nguyen.a", expect.any(AbortSignal))
    await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))
    await user.click(createButton())
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalledWith({
      full_name: "Nguyen Van A",
      username: "nguyen.a",
      email: "a@example.com",
      phone_number: "0912 345 678",
      password: "Password!1",
    }))
  })

  it("debounces the username check and reports a taken name", async () => {
    mocks.checkUsernameAvailable.mockResolvedValue(false)
    const user = userEvent.setup()
    renderDialog()
    await fillRequiredRegistration(user)
    expect(await screen.findByText("Tên đăng nhập đã được sử dụng.")).toBeTruthy()
    expect(mocks.checkUsernameAvailable).toHaveBeenCalledTimes(1)
    expect(createButton().hasAttribute("disabled")).toBe(true)
  })

  it("flags a malformed username without asking the server", async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText("Tên đăng nhập"), "ab-cd")
    expect(await screen.findByText(/Tên đăng nhập gồm 4 đến 30 ký tự/)).toBeTruthy()
    expect(mocks.checkUsernameAvailable).not.toHaveBeenCalled()
  })

  it("shows the spec message for a non-mobile phone number", async () => {
    const user = userEvent.setup()
    renderDialog()
    await fillRequiredRegistration(user, { phone: "024 3825 1234" })
    expect(screen.getByText("Số điện thoại chưa đúng, ví dụ 0912 345 678.")).toBeTruthy()
    expect(createButton().hasAttribute("disabled")).toBe(true)
  })

  it("only counts the backend's special characters in the password rule", async () => {
    const user = userEvent.setup()
    renderDialog()
    await fillRequiredRegistration(user, { password: "Password-1" })
    await user.tab()
    expect(screen.getByText("Mật khẩu phải chứa ít nhất một ký tự đặc biệt")).toBeTruthy()
    expect(createButton().hasAttribute("disabled")).toBe(true)
  })

  it("maps a server USERNAME_TAKEN back onto the username field", async () => {
    mocks.auth.register.mockRejectedValue(new ApiError("Tên đăng nhập đã được sử dụng.", 409, "USERNAME_TAKEN"))
    const user = userEvent.setup()
    renderDialog()
    await fillRequiredRegistration(user)
    await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))
    await user.click(createButton())
    expect(await screen.findByText("Tên đăng nhập đã được sử dụng.")).toBeTruthy()
    expect(screen.getByLabelText("Tên đăng nhập").getAttribute("aria-invalid")).toBe("true")
    expect(createButton().hasAttribute("disabled")).toBe(true)
  })
})

describe("referral code at registration", () => {
  it("opens registration from a referral deep link with the normalized code", async () => {
    mocks.auth.authOpen = false
    renderDialog("/?ref=Lan.Nguyen")
    await waitFor(() => expect(mocks.auth.openAuth).toHaveBeenCalledWith("register", "lan.nguyen"))
  })

  it("accepts a legacy CTV_ deep link", async () => {
    mocks.auth.authOpen = false
    renderDialog("/?ref=CTV_0A1B2C3D4E")
    await waitFor(() => expect(mocks.auth.openAuth).toHaveBeenCalledWith("register", "CTV_0A1B2C3D4E"))
  })

  it("waits for session verification before opening a referral link", async () => {
    mocks.auth.authOpen = false
    mocks.auth.isLoading = true
    renderDialog("/?ref=lan.nguyen")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.auth.openAuth).not.toHaveBeenCalled()
  })

  it("prefills a deep-link code that stays editable and optional", async () => {
    const user = userEvent.setup()
    renderDialog("/?ref=Lan.Nguyen")
    const referral = screen.getByLabelText("Mã giới thiệu (không bắt buộc)") as HTMLInputElement
    expect(referral.value).toBe("lan.nguyen")
    expect(referral.hasAttribute("readonly")).toBe(false)
    expect(referral.hasAttribute("required")).toBe(false)
    await user.clear(referral)
    expect(referral.value).toBe("")
  })

  it("shows the offer of a valid code without naming the team lead", async () => {
    mocks.checkReferralCode.mockResolvedValue({ offerType: "days", offerDays: 30 })
    renderDialog("/?ref=lan.nguyen")
    expect(await screen.findByText("Mã giới thiệu hợp lệ. Bạn được miễn phí Premium 30 ngày.")).toBeTruthy()
    expect(mocks.checkReferralCode).toHaveBeenCalledWith("lan.nguyen", expect.any(AbortSignal))
  })

  it("words lifetime and no-offer codes as the spec says", async () => {
    mocks.checkReferralCode.mockResolvedValue({ offerType: "lifetime", offerDays: null })
    const view = renderDialog("/?ref=lan.nguyen")
    expect(await screen.findByText("Mã giới thiệu hợp lệ. Bạn được miễn phí Premium trọn đời.")).toBeTruthy()
    view.unmount()
    mocks.checkReferralCode.mockResolvedValue({ offerType: "none", offerDays: null })
    renderDialog("/?ref=lan.nguyen")
    expect(await screen.findByText("Mã giới thiệu hợp lệ.")).toBeTruthy()
  })

  it("blocks registration with an unknown or revoked code", async () => {
    mocks.checkReferralCode.mockResolvedValue(null)
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText("Mã giới thiệu (không bắt buộc)"), "khong.ton.tai")
    await fillRequiredRegistration(user)
    expect(await screen.findByText("Mã giới thiệu không tồn tại hoặc đã ngừng sử dụng.")).toBeTruthy()
    expect(createButton().hasAttribute("disabled")).toBe(true)
    expect(mocks.auth.register).not.toHaveBeenCalled()
  })

  it("flags a malformed deep-link code at once and allows clearing it", async () => {
    const user = userEvent.setup()
    renderDialog("/?ref=not%20a%20code")
    const referral = screen.getByLabelText("Mã giới thiệu (không bắt buộc)") as HTMLInputElement
    expect(referral.value).toBe("not a code")
    expect(screen.getByText("Mã giới thiệu không tồn tại hoặc đã ngừng sử dụng.")).toBeTruthy()
    expect(mocks.checkReferralCode).not.toHaveBeenCalled()
    await fillRequiredRegistration(user)
    expect(createButton().hasAttribute("disabled")).toBe(true)
    await user.clear(referral)
    await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))
    await user.click(createButton())
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalledWith(expect.not.objectContaining({ referral_code: expect.anything() })))
  })

  it("submits a valid manual code normalized to lowercase", async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText("Mã giới thiệu (không bắt buộc)"), " Lan.Nguyen ")
    await fillRequiredRegistration(user)
    await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))
    await user.click(createButton())
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalledWith(expect.objectContaining({ referral_code: "lan.nguyen" })))
  })

  it("maps a server REFERRAL_CODE_INVALID back onto the referral field", async () => {
    mocks.auth.register.mockRejectedValue(new ApiError("Mã giới thiệu không hợp lệ", 422, "REFERRAL_CODE_INVALID"))
    const user = userEvent.setup()
    renderDialog("/?ref=lan.nguyen")
    await fillRequiredRegistration(user)
    await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))
    await user.click(createButton())
    expect(await screen.findByText("Mã giới thiệu không tồn tại hoặc đã ngừng sử dụng.")).toBeTruthy()
  })
})

describe("login form", () => {
  it("signs in with an email or username identifier", async () => {
    mocks.auth.authMode = "login"
    const user = userEvent.setup()
    renderDialog()
    const identifier = screen.getByLabelText("Email hoặc tên đăng nhập")
    expect(identifier.getAttribute("type")).toBe("text")
    expect(identifier.getAttribute("autocomplete")).toBe("username")
    expect(screen.queryByLabelText("Mã giới thiệu (không bắt buộc)")).toBeNull()
    await user.type(identifier, " nguyen.a ")
    await user.type(screen.getByLabelText("Mật khẩu"), "Password!1")
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))
    await waitFor(() => expect(mocks.auth.login).toHaveBeenCalledWith("nguyen.a", "Password!1", true))
  })
})
