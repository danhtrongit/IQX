import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.hoisted(() => ({
  user: { id: "u-1", username: "minhanh" } as {
    id: string
    username: string
  } | null,
}))

const shopMock = vi.hoisted(() => ({
  balance: 740 as number | undefined,
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: authMock.user }),
}))

vi.mock("@/pages/demo-trading/shop/use-shop", () => ({
  useShopState: () => ({
    data:
      shopMock.balance != null
        ? { wallet: { balance: shopMock.balance } }
        : undefined,
  }),
}))

const { FxBar } = await import("./FxBar.tsx")
const bridge = await import("../bridge.ts")
const { floorFx } = await import("../net/fx.ts")

function renderBar(wrapper?: (children: ReactNode) => ReactNode) {
  const queryClient = new QueryClient()
  const content = wrapper ? wrapper(<FxBar />) : <FxBar />
  return render(
    <QueryClientProvider client={queryClient}>
      <div className="tf-root">{content}</div>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  bridge.resetBridge()
  authMock.user = { id: "u-1", username: "minhanh" }
  shopMock.balance = 740
  bridge.ui.guest.set(false)
  bridge.ui.profile.set({
    name: "Minh Anh",
    avatar: "male01",
    color: "default",
  })
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  )
})

describe("FxBar", () => {
  it("opens the chibi Gáy card, updates live counter and banner preview, and submits typed text", async () => {
    const user = userEvent.setup()
    const onFx = vi.fn()
    const off = bridge.commands.on("fx", onFx)

    try {
      renderBar()
      await user.click(screen.getByTitle("Gáy · 100 xu"))

      const dialog = screen.getByRole("dialog", { name: "Gáy" })
      expect(within(dialog).getByText("100 xu")).toBeTruthy()
      expect(within(dialog).getByText(/740 xu/)).toBeTruthy()
      expect(within(dialog).getByText("0/80")).toBeTruthy()
      expect(within(dialog).getByText("Minh Anh gáy:")).toBeTruthy()
      expect(dialog.querySelector("svg.fx-rooster-svg")).toBeTruthy()

      const textarea = within(dialog).getByPlaceholderText("Gáy một câu...")
      expect(document.activeElement).toBe(textarea)

      const submitBtn = within(dialog).getByRole("button", { name: "Gáy" })
      expect((submitBtn as HTMLButtonElement).disabled).toBe(true)

      await user.type(textarea, "  VNINDEX xanh tím!  ")
      expect(within(dialog).getByText("21/80")).toBeTruthy()
      expect(
        dialog.querySelector(".fx-banner-preview-body")?.textContent
      ).toBe("VNINDEX xanh tím!")
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false)

      await user.click(submitBtn)
      expect(onFx).toHaveBeenCalledTimes(1)
      expect(onFx).toHaveBeenCalledWith({
        kind: "gay",
        text: "VNINDEX xanh tím!",
      })
      expect(screen.queryByRole("dialog", { name: "Gáy" })).toBeNull()
    } finally {
      off()
    }
  })

  it("opens the chibi Khấn card with incense art and submits typed text via Thành tâm khấn", async () => {
    const user = userEvent.setup()
    const onFx = vi.fn()
    const off = bridge.commands.on("fx", onFx)

    try {
      renderBar()
      await user.click(screen.getByTitle("Khấn Thần Tài · 50 xu"))

      const dialog = screen.getByRole("dialog", { name: "Khấn Thần Tài" })
      expect(within(dialog).getByText("50 xu")).toBeTruthy()
      expect(within(dialog).getByText(/740 xu/)).toBeTruthy()
      expect(dialog.querySelector("svg.fx-incense-svg")).toBeTruthy()
      expect(dialog.querySelectorAll(".fx-smoke-wisp")).toHaveLength(3)

      const textarea = within(dialog).getByPlaceholderText(
        "Con xin Thần Tài phù hộ..."
      )
      expect(document.activeElement).toBe(textarea)

      await user.type(textarea, "Cầu lộc đỏ cả tuần")
      expect(
        dialog.querySelector(".fx-banner-preview-body")?.textContent
      ).toBe("Cầu lộc đỏ cả tuần")

      await user.click(
        within(dialog).getByRole("button", { name: "Thành tâm khấn" })
      )
      expect(onFx).toHaveBeenCalledTimes(1)
      expect(onFx).toHaveBeenCalledWith({
        kind: "khan",
        text: "Cầu lộc đỏ cả tuần",
      })
      expect(screen.queryByRole("dialog", { name: "Khấn Thần Tài" })).toBeNull()
    } finally {
      off()
    }
  })

  it("submits when pressing Enter inside the textarea", async () => {
    const user = userEvent.setup()
    const onFx = vi.fn()
    const off = bridge.commands.on("fx", onFx)

    try {
      renderBar()
      await user.click(screen.getByTitle("Gáy · 100 xu"))
      const textarea = screen.getByPlaceholderText("Gáy một câu...")
      await user.type(textarea, "Chốt lời thôi{Enter}")
      expect(onFx).toHaveBeenCalledWith({ kind: "gay", text: "Chốt lời thôi" })
    } finally {
      off()
    }
  })

  it("shows bad-word error and blocks submit in both Gáy and Khấn", async () => {
    const user = userEvent.setup()
    const onFx = vi.fn()
    const off = bridge.commands.on("fx", onFx)

    try {
      renderBar()
      await user.click(screen.getByTitle("Gáy · 100 xu"))
      const gayDialog = screen.getByRole("dialog", { name: "Gáy" })
      const gayInput = within(gayDialog).getByPlaceholderText("Gáy một câu...")
      await user.type(gayInput, "nói bậy vcl")
      expect(
        within(gayDialog).getByText("Câu có từ ngữ không phù hợp")
      ).toBeTruthy()
      expect(
        (
          within(gayDialog).getByRole("button", {
            name: "Gáy",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true)
      await user.keyboard("{Enter}")
      expect(onFx).not.toHaveBeenCalled()

      await user.click(screen.getByTitle("Khấn Thần Tài · 50 xu"))
      const khanDialog = screen.getByRole("dialog", { name: "Khấn Thần Tài" })
      const khanInput = within(khanDialog).getByPlaceholderText(
        "Con xin Thần Tài phù hộ..."
      )
      await user.type(khanInput, "fuck")
      expect(
        within(khanDialog).getByText("Câu có từ ngữ không phù hợp")
      ).toBeTruthy()
      expect(
        (
          within(khanDialog).getByRole("button", {
            name: "Thành tâm khấn",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true)
      expect(onFx).not.toHaveBeenCalled()
    } finally {
      off()
    }
  })

  it("shows Không đủ xu and disables submit when balance is below cost", async () => {
    const user = userEvent.setup()
    shopMock.balance = 40

    renderBar()
    await user.click(screen.getByTitle("Gáy · 100 xu"))
    const gayDialog = screen.getByRole("dialog", { name: "Gáy" })
    expect(within(gayDialog).getByText("Không đủ xu")).toBeTruthy()
    await user.type(
      within(gayDialog).getByPlaceholderText("Gáy một câu..."),
      "Gáy nhẹ"
    )
    expect(
      (
        within(gayDialog).getByRole("button", {
          name: "Gáy",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)

    await user.click(screen.getByTitle("Khấn Thần Tài · 50 xu"))
    const khanDialog = screen.getByRole("dialog", { name: "Khấn Thần Tài" })
    expect(within(khanDialog).getByText("Không đủ xu")).toBeTruthy()
    await user.type(
      within(khanDialog).getByPlaceholderText("Con xin Thần Tài phù hộ..."),
      "Xin lộc"
    )
    expect(
      (
        within(khanDialog).getByRole("button", {
          name: "Thành tâm khấn",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
  })

  it("displays cooldown countdown labels and disables buttons after selfFx", () => {
    renderBar()

    act(() => {
      floorFx.emit("selfFx", { kind: "gay", text: "Xanh!" })
      floorFx.emit("selfFx", { kind: "khan", text: "Lộc!" })
    })

    const gayBtn = screen.getByTitle("Gáy · 100 xu") as HTMLButtonElement
    const khanBtn = screen.getByTitle(
      "Khấn Thần Tài · 50 xu"
    ) as HTMLButtonElement

    expect(gayBtn.disabled).toBe(true)
    expect(gayBtn.textContent).toMatch(/^\d+s$/)
    expect(khanBtn.disabled).toBe(true)
    expect(khanBtn.textContent).toMatch(/^\d+s$/)
  })

  it("stops keydown events inside the textarea from bubbling to parent or window, and Escape closes + restores focus", async () => {
    const user = userEvent.setup()
    const parentKeyDown = vi.fn()
    const windowKeyDown = vi.fn()
    window.addEventListener("keydown", windowKeyDown)

    try {
      renderBar((children) => (
        <div onKeyDown={parentKeyDown}>{children}</div>
      ))

      const gayBtn = screen.getByTitle("Gáy · 100 xu")
      await user.click(gayBtn)
      const textarea = screen.getByPlaceholderText("Gáy một câu...")

      fireEvent.keyDown(textarea, { key: "w", code: "KeyW" })
      fireEvent.keyDown(textarea, { key: "a", code: "KeyA" })
      fireEvent.keyDown(textarea, { key: "s", code: "KeyS" })
      fireEvent.keyDown(textarea, { key: "d", code: "KeyD" })
      fireEvent.keyDown(textarea, { key: "e", code: "KeyE" })

      expect(parentKeyDown).not.toHaveBeenCalled()
      expect(windowKeyDown).not.toHaveBeenCalled()

      fireEvent.keyDown(textarea, { key: "Escape", code: "Escape" })
      expect(screen.queryByRole("dialog", { name: "Gáy" })).toBeNull()
      expect(document.activeElement).toBe(gayBtn)
    } finally {
      window.removeEventListener("keydown", windowKeyDown)
    }
  })

  it("enforces guest login-only rules for Gáy, Khấn, Tán lộc and Xả xui", async () => {
    const user = userEvent.setup()
    bridge.ui.guest.set(true)
    const onFx = vi.fn()
    const off = bridge.commands.on("fx", onFx)

    try {
      renderBar()
      await user.click(screen.getByTitle("Gáy · 100 xu"))
      expect(bridge.ui.loginPrompt.get()).toBe("Đăng nhập để gáy")
      expect(screen.queryByRole("dialog")).toBeNull()

      await user.click(screen.getByTitle("Khấn Thần Tài · 50 xu"))
      expect(bridge.ui.loginPrompt.get()).toBe("Đăng nhập để khấn Thần Tài")

      await user.click(screen.getByTitle("Tán lộc"))
      expect(bridge.ui.loginPrompt.get()).toBe("Đăng nhập để tán lộc")

      await user.click(screen.getByTitle("Xả xui · 50 xu"))
      expect(bridge.ui.loginPrompt.get()).toBe("Đăng nhập để xả xui")
      expect(onFx).not.toHaveBeenCalled()
    } finally {
      off()
    }
  })

  it("keeps Xả xui and Tán lộc working with preset selection and validation", async () => {
    const user = userEvent.setup()
    const onFx = vi.fn()
    const onRain = vi.fn()
    const offFx = bridge.commands.on("fx", onFx)
    const offRain = bridge.commands.on("rainGive", onRain)

    try {
      renderBar()
      await user.click(screen.getByTitle("Xả xui · 50 xu"))
      expect(onFx).toHaveBeenCalledWith({ kind: "xaxui" })

      await user.click(screen.getByTitle("Tán lộc"))
      const dialog = screen.getByRole("dialog", { name: "Tán lộc" })
      await user.click(within(dialog).getByRole("button", { name: "200" }))
      await user.click(
        within(dialog).getByRole("button", { name: "Tán lộc 200 xu" })
      )
      expect(onRain).toHaveBeenCalledWith(200)
    } finally {
      offFx()
      offRain()
    }
  })
})
