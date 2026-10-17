import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { UsernameChangeDialog } from "./username-change-dialog"

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refreshUser: vi.fn(),
  checkUsernameAvailable: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ refreshUser: mocks.refreshUser }) }))
vi.mock("./hooks", () => ({ useChangeUsername: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }) }))
vi.mock("@/components/layout/auth-identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/layout/auth-identity")>()),
  checkUsernameAvailable: mocks.checkUsernameAvailable,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  mocks.mutateAsync.mockReset().mockResolvedValue({})
  mocks.refreshUser.mockReset().mockResolvedValue(undefined)
  mocks.checkUsernameAvailable.mockReset().mockResolvedValue(true)
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<UsernameChangeDialog current="nguyen.a" />)
  await user.click(screen.getByRole("button", { name: "Đổi tên đăng nhập" }))
  return screen.getByLabelText("Tên đăng nhập mới")
}

describe("one-time username change (DECISION 1)", () => {
  it("lowercases the new name, checks it and saves it once", async () => {
    const user = userEvent.setup()
    const input = await openDialog(user)
    const save = screen.getByRole("button", { name: "Lưu tên đăng nhập" })
    expect((save as HTMLButtonElement).disabled).toBe(true)

    await user.type(input, "Lan.Nguyen")
    expect((input as HTMLInputElement).value).toBe("lan.nguyen")
    expect(await screen.findByText("Tên đăng nhập dùng được.")).toBeTruthy()
    expect(mocks.checkUsernameAvailable).toHaveBeenLastCalledWith("lan.nguyen", expect.any(AbortSignal))

    await user.click(save)
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith("lan.nguyen"))
    await waitFor(() => expect(mocks.refreshUser).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByLabelText("Tên đăng nhập mới")).toBeNull())
  })

  it("keeps saving disabled for the current name, a reserved name or a taken name", async () => {
    const user = userEvent.setup()
    const input = await openDialog(user)
    const save = screen.getByRole("button", { name: "Lưu tên đăng nhập" })

    await user.type(input, "nguyen.a")
    expect(screen.getByText("Đây là tên đăng nhập hiện tại của bạn.")).toBeTruthy()
    expect((save as HTMLButtonElement).disabled).toBe(true)

    await user.clear(input)
    await user.type(input, "ctv_0a1b2c3d4e")
    expect(screen.getByText("Tên đăng nhập này không dùng được.")).toBeTruthy()
    expect((save as HTMLButtonElement).disabled).toBe(true)

    mocks.checkUsernameAvailable.mockResolvedValue(false)
    await user.clear(input)
    await user.type(input, "da.co.nguoi")
    expect(await screen.findByText("Tên đăng nhập đã được sử dụng.")).toBeTruthy()
    expect((save as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it("maps a server USERNAME_TAKEN onto the field and shows USERNAME_LOCKED as an error", async () => {
    const user = userEvent.setup()
    const input = await openDialog(user)
    mocks.mutateAsync.mockRejectedValueOnce(new ApiError("Tên đăng nhập đã tồn tại", 409, "USERNAME_TAKEN"))
    await user.type(input, "lan.nguyen")
    await screen.findByText("Tên đăng nhập dùng được.")
    await user.click(screen.getByRole("button", { name: "Lưu tên đăng nhập" }))
    expect(await screen.findByText("Tên đăng nhập đã được sử dụng.")).toBeTruthy()

    mocks.mutateAsync.mockRejectedValueOnce(new ApiError("Bạn đã đổi tên đăng nhập rồi.", 422, "USERNAME_LOCKED"))
    await user.clear(input)
    await user.type(input, "lan.nguyen2")
    await screen.findByText("Tên đăng nhập dùng được.")
    await user.click(screen.getByRole("button", { name: "Lưu tên đăng nhập" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Bạn đã đổi tên đăng nhập rồi.")
    expect(mocks.refreshUser).not.toHaveBeenCalled()
  })
})
