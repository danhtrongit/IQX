/**
 * Thanh công cụ ngang của Flashback (`HorizontalToolGroups`, `HorizontalToolExtras`) nối với `SessionDrawingController` qua
 * `useSessionToolbarChart`. Biểu đồ thật được kiểm ở `flashback-match-iqline.test.tsx` và e2e; ở đây kiểm phần nối, mà không cần Canvas.
 */
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ALL_TOOLS, TOOL_SPECS } from "../drawings"
import type { Drawing } from "../types"
import { HorizontalToolExtras, HorizontalToolGroups } from "./drawing-toolbar"
import { createSessionDrawings, type SessionDrawingController } from "./session-drawings"
import { useSessionToolbarChart } from "./session-toolbar"
import { installRadixPolyfills } from "./test-env"
import { readFavorites, writeFavorites } from "./tool-preferences"

installRadixPolyfills()
beforeEach(() => localStorage.clear())

function Bar({ drawings, defaults }: { drawings: SessionDrawingController; defaults?: readonly (typeof ALL_TOOLS)[number][] }) {
  const chart = useSessionToolbarChart(drawings)
  return (
    <div>
      <HorizontalToolGroups chart={chart} scope="user:1" defaultFavorites={defaults} />
      <HorizontalToolExtras chart={chart} />
    </div>
  )
}

const shape = (id: string): Drawing => ({ id, tool: "trend", anchors: [{ session: 1, price: 100 }, { session: 5, price: 110 }], style: { ...TOOL_SPECS.trend.defaultStyle } })

describe("thanh công cụ ngang của Flashback", () => {
  it("bảy nhóm liệt kê đủ 36 công cụ, mỗi công cụ đúng một lần", async () => {
    const drawings = createSessionDrawings()
    render(<Bar drawings={drawings} />)
    const user = userEvent.setup()
    const toolbar = screen.getByRole("toolbar", { name: "Công cụ vẽ" })
    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal")
    const groups = within(toolbar).getAllByRole("button").filter((button) => button.dataset.toolGroup)
    expect(groups.map((group) => group.dataset.toolGroup)).toEqual(["line", "fib", "pitchfork", "pattern", "shape", "position", "annotation"])
    const names: string[] = []
    for (const group of groups) {
      await user.click(group)
      names.push(...screen.getAllByRole("menuitem").map((item) => item.dataset.tool ?? ""))
      await user.keyboard("{Escape}")
    }
    expect(names.sort()).toEqual([...ALL_TOOLS].sort())
  })

  it("chọn công cụ gửi hành động vào biểu đồ đang gắn; nút nhóm sáng theo snapshot", async () => {
    const drawings = createSessionDrawings()
    const sink = vi.fn()
    drawings.attach({ dispatch: sink })
    render(<Bar drawings={drawings} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /^Vị thế và đo:/ }))
    await user.click(screen.getByRole("menuitem", { name: "Vị thế bán" }))
    expect(sink).toHaveBeenLastCalledWith({ type: "tool", tool: "short-position" })
    act(() => drawings.report({ tool: "short-position", selectedId: null, shapes: [], pending: null }))
    expect(screen.getByRole("button", { name: "Vị thế và đo: Vị thế bán" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("nam châm: chọn mức gửi hành động và nhớ; danh sách hình vẽ liệt kê hình của ván", async () => {
    const drawings = createSessionDrawings()
    const sink = vi.fn()
    drawings.attach({ dispatch: sink })
    act(() => drawings.report({ tool: null, selectedId: "d1", shapes: [shape("d1"), shape("d2")], pending: null }))
    render(<Bar drawings={drawings} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /^Nam châm/ }))
    await user.click(screen.getByRole("menuitemradio", { name: /^Mạnh/ }))
    expect(sink).toHaveBeenLastCalledWith({ type: "magnet", on: "strong" })
    expect(localStorage.getItem("iqx.iqline_magnet_v1")).toBe('"strong"')
    act(() => drawings.report({ tool: null, selectedId: "d1", shapes: [shape("d1"), shape("d2")], pending: null, magnet: "strong" }))
    expect(screen.getByRole("button", { name: /^Nam châm/ }).getAttribute("data-magnet")).toBe("strong")
    await user.click(screen.getByRole("button", { name: "Danh sách hình vẽ" }))
    expect(within(screen.getByRole("list", { name: "Hình vẽ trên biểu đồ" })).getAllByRole("listitem")).toHaveLength(2)
  })

  it("yêu thích mặc định chỉ áp dụng khi máy chưa lưu danh sách nào; bỏ hết yêu thích thì không tự quay lại", async () => {
    const drawings = createSessionDrawings()
    const view = render(<Bar drawings={drawings} defaults={["trend", "horizontal"]} />)
    const user = userEvent.setup()
    const favorites = () => Array.from(document.querySelectorAll<HTMLElement>("[data-favorite-tool]")).map((button) => button.dataset.favoriteTool)
    expect(favorites()).toEqual(["trend", "horizontal"])
    // Bỏ hai công cụ khỏi yêu thích qua ngôi sao trong menu của nhóm Đường.
    await user.click(screen.getByRole("button", { name: /^Đường:/ }))
    for (const tool of ["trend", "horizontal"]) await user.click(document.querySelector<HTMLElement>(`[data-favorite-toggle="${tool}"]`)!)
    await user.keyboard("{Escape}")
    expect(favorites()).toEqual([])
    expect(localStorage.getItem("iqx.iqline_tool_favorites_v1:user:1")).toBe("[]")
    view.unmount()
    render(<Bar drawings={drawings} defaults={["trend", "horizontal"]} />)
    expect(favorites()).toEqual([])
  })

  it("readFavorites: mặc định chỉ khi khoá vắng mặt, lọc theo công cụ cho phép và bỏ tên lạ", () => {
    expect(readFavorites("a", undefined, ["trend"])).toEqual(["trend"])
    expect(readFavorites("a", ["ray"], ["trend", "ray"])).toEqual(["ray"])
    writeFavorites("a", [])
    expect(readFavorites("a", undefined, ["trend"])).toEqual([])
    localStorage.setItem("iqx.iqline_tool_favorites_v1:b", JSON.stringify(["trend", "khong-co"]))
    expect(readFavorites("b", undefined, ["ray"])).toEqual(["trend"])
  })
})
