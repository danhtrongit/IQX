import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IMAGE_BLOCK } from "../test-fixtures"
import { stubBrowser } from "../test-support"
import { LessonImage } from "./lesson-image"

beforeEach(() => stubBrowser())
afterEach(() => vi.unstubAllGlobals())

describe("LessonImage", () => {
  it("opens the lightbox from the title and from the image, with Vừa khung / 100% / Đóng", async () => {
    const user = userEvent.setup()
    render(<LessonImage block={IMAGE_BLOCK} />)

    await user.click(screen.getByRole("button", { name: `Phóng to ảnh: ${IMAGE_BLOCK.title}` }))
    const dialog = screen.getByRole("dialog", { name: IMAGE_BLOCK.zoom_title })
    expect(dialog).toBeTruthy()
    const fit = screen.getByRole("button", { name: "Vừa khung" })
    const actual = screen.getByRole("button", { name: "100%" })
    expect(fit.getAttribute("aria-pressed")).toBe("true")
    await user.click(actual)
    expect(actual.getAttribute("aria-pressed")).toBe("true")
    expect((dialog.querySelector("img") as HTMLImageElement).style.width).toBe("2160px")
    await user.click(screen.getByRole("button", { name: /Đóng/ }))
    expect(screen.queryByRole("dialog")).toBeNull()

    await user.click(screen.getByRole("button", { name: `Phóng to: ${IMAGE_BLOCK.alt}` }))
    expect(screen.getByRole("dialog", { name: IMAGE_BLOCK.zoom_title })).toBeTruthy()
  })

  it("closes with Escape and returns focus to the control that opened it", async () => {
    const user = userEvent.setup()
    render(<LessonImage block={IMAGE_BLOCK} />)
    const opener = screen.getByRole("button", { name: `Phóng to: ${IMAGE_BLOCK.alt}` })
    await user.click(opener)
    expect(screen.getByRole("dialog")).toBeTruthy()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)

    const titleButton = screen.getByRole("button", { name: `Phóng to ảnh: ${IMAGE_BLOCK.title}` })
    titleButton.focus()
    await user.keyboard("{Enter}")
    await user.keyboard("{Escape}")
    expect(document.activeElement).toBe(titleButton)
  })

  it("says so when the image fails and loads it again on Thử lại", async () => {
    const user = userEvent.setup()
    render(<LessonImage block={IMAGE_BLOCK} />)
    fireEvent.error(screen.getByRole("img", { name: IMAGE_BLOCK.alt }))
    expect(screen.getByRole("alert").textContent).toContain("Chưa tải được ảnh hướng dẫn.")
    expect(screen.queryByRole("img", { name: IMAGE_BLOCK.alt })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("img", { name: IMAGE_BLOCK.alt }).getAttribute("src")).toBe(IMAGE_BLOCK.src)
  })
})
