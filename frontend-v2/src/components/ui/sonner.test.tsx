import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { ThemeProvider } from "@/components/theme-provider"

import { Toaster } from "./sonner"

function renderToaster(props: React.ComponentProps<typeof Toaster> = {}) {
  return render(
    <ThemeProvider defaultTheme="dark" disableTransitionOnChange={false}>
      <Toaster {...props} />
    </ThemeProvider>
  )
}

beforeEach(() => {
  toast.dismiss()
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = vi.fn()
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})

describe("Toaster", () => {
  it("renders the IQX defaults and follows the provider theme", async () => {
    renderToaster()
    toast("Probe")

    const toaster = await waitFor(() => {
      const element = document.querySelector("[data-sonner-toaster]")
      if (!element) throw new Error("Toaster has not mounted")
      return element
    })
    expect(toaster.classList.contains("iqx-toaster")).toBe(true)
    expect(toaster.getAttribute("data-x-position")).toBe("right")
    expect(toaster.getAttribute("data-y-position")).toBe("top")
    expect(toaster.getAttribute("data-sonner-theme")).toBe("dark")
    expect(
      document.querySelector('section[aria-label^="Thông báo"]')
    ).not.toBeNull()
    expect((toaster as HTMLElement).style.getPropertyValue("--offset-top")).toContain(
      "calc(var(--header-top"
    )
    expect((toaster as HTMLElement).style.getPropertyValue("--offset-top")).toContain(
      "+ 12px)"
    )
  })

  it("keeps default classes and styles when caller options are supplied", async () => {
    renderToaster({
      className: "caller-toaster",
      style: { zIndex: 1234 },
      toastOptions: {
        duration: 9000,
        className: "caller-toast",
        classNames: { toast: "caller-toast-slot", title: "caller-title" },
      },
    })
    toast("Probe")

    const toaster = await waitFor(() => {
      const element = document.querySelector("[data-sonner-toaster]")
      if (!element) throw new Error("Toaster has not mounted")
      return element
    })
    expect(toaster.classList.contains("iqx-toaster")).toBe(true)
    expect(toaster.classList.contains("caller-toaster")).toBe(true)
    expect((toaster as HTMLElement).style.zIndex).toBe("1234")

    toast.success("Merged options")
    const item = await screen.findByText("Merged options")
    const toastElement = item.closest("[data-sonner-toast]") as HTMLElement
    expect(toastElement.classList.contains("iqx-toast")).toBe(true)
    expect(toastElement.classList.contains("caller-toast")).toBe(true)
    expect(toastElement.classList.contains("caller-toast-slot")).toBe(true)
    expect(item.classList.contains("caller-title")).toBe(true)
  })

  it.each([
    ["success", toast.success],
    ["error", toast.error],
    ["info", toast.info],
    ["warning", toast.warning],
    ["loading", toast.loading],
  ] as const)(
    "renders the %s type with its custom icon",
    async (type, emit) => {
      renderToaster()
      emit(`${type} message`)

      const item = await screen.findByText(`${type} message`)
      const toastElement = item.closest("[data-sonner-toast]")
      expect(toastElement?.getAttribute("data-type")).toBe(type)
      expect(toastElement?.classList.contains("iqx-toast")).toBe(true)
      expect(toastElement?.querySelector("[data-icon] svg")).not.toBeNull()
    }
  )

  it("renders neutral toasts and invokes action, cancel, and close callbacks", async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    const cancel = vi.fn()
    const dismissed = vi.fn()
    renderToaster()

    toast("Neutral", {
      id: "neutral",
      action: { label: "Thực hiện", onClick: action },
      cancel: { label: "Hủy", onClick: cancel },
      closeButton: true,
      onDismiss: dismissed,
    })
    const item = await screen.findByText("Neutral")
    const toastElement = item.closest("[data-sonner-toast]") as HTMLElement
    expect(toastElement.hasAttribute("data-type")).toBe(false)
    await user.click(
      within(toastElement).getByRole("button", { name: "Thực hiện" })
    )
    await user.click(within(toastElement).getByRole("button", { name: "Hủy" }))
    expect(action).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    await user.click(
      within(toastElement).getByRole("button", { name: "Đóng thông báo" })
    )
    await waitFor(() => expect(dismissed).toHaveBeenCalledOnce())
  })

  it("updates a loading toast in place when its id is reused", async () => {
    renderToaster()
    const id = toast.loading("Đang tải", { id: "request-1" })
    expect(await screen.findByText("Đang tải")).toBeTruthy()

    toast.success("Hoàn tất", { id })
    await waitFor(() => {
      expect(screen.getByText("Hoàn tất")).toBeTruthy()
      expect(screen.queryByText("Đang tải")).toBeNull()
      expect(
        document.querySelectorAll('[data-sonner-toast][data-visible="true"]')
          .length
      ).toBe(1)
    })
  })

  it("keeps a toast.promise lifecycle to one rendered toast", async () => {
    renderToaster()
    let resolve: (value: string) => void = () => undefined
    const pending = new Promise<string>((res) => {
      resolve = res
    })
    toast.promise(pending, { loading: "Đang lưu", success: "Đã lưu" })
    expect(await screen.findByText("Đang lưu")).toBeTruthy()
    resolve("ok")
    await waitFor(() => expect(screen.getByText("Đã lưu")).toBeTruthy())
    expect(
      document.querySelectorAll('[data-sonner-toast][data-visible="true"]')
        .length
    ).toBe(1)
  })
})
