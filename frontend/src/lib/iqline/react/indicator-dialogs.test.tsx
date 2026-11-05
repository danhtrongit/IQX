import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { listIndicators } from "../indicators"
import type { ChartIndicatorInput } from "../types"
import IndicatorDialogs, { type IndicatorDialogState } from "./indicator-dialogs"
import { MAX_INDICATORS, newIndicatorKey } from "./market-defaults"
import { installRadixPolyfills } from "./test-env"

installRadixPolyfills()

const EXISTING: ChartIndicatorInput[] = [
  { key: "volume", id: "volume", params: {} },
  { key: "rsi-1", id: "rsi", params: { period: 14 } },
]

function setup(state: IndicatorDialogState, indicators: readonly ChartIndicatorInput[] = EXISTING, limit?: number) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(<IndicatorDialogs state={state} indicators={indicators} limit={limit} onChange={onChange} onClose={onClose} />)
  return { onChange, onClose, user: userEvent.setup() }
}

describe("hộp thoại thêm chỉ báo", () => {
  it("liệt kê đủ chỉ báo của sổ đăng ký, chia ba nhóm", () => {
    setup({ kind: "add" })
    const dialog = screen.getByRole("dialog", { name: "Thêm chỉ báo" })
    expect(within(dialog).getAllByRole("button").length).toBe(listIndicators().length + 1) // cộng nút đóng
    for (const group of ["Vẽ chồng trên giá", "Khối lượng", "Ô riêng bên dưới"]) expect(within(dialog).getByRole("region", { name: group })).toBeTruthy()
  })

  it("tìm theo tên lọc danh sách; không khớp thì báo", async () => {
    const { user } = setup({ kind: "add" })
    const dialog = screen.getByRole("dialog", { name: "Thêm chỉ báo" })
    await user.type(within(dialog).getByRole("textbox", { name: "Tìm chỉ báo" }), "bollinger")
    expect(within(dialog).getByRole("button", { name: "Bollinger Bands" })).toBeTruthy()
    expect(within(dialog).queryByRole("button", { name: "RSI" })).toBeNull()
    await user.clear(within(dialog).getByRole("textbox", { name: "Tìm chỉ báo" }))
    await user.type(within(dialog).getByRole("textbox", { name: "Tìm chỉ báo" }), "zzzz")
    expect(within(dialog).getByText("Không có chỉ báo nào khớp.")).toBeTruthy()
  })

  it("chọn một chỉ báo thêm vào cuối với khoá mới duy nhất rồi đóng", async () => {
    const { onChange, onClose, user } = setup({ kind: "add" })
    await user.click(screen.getByRole("button", { name: "MACD" }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ChartIndicatorInput[]
    expect(next).toHaveLength(3)
    expect(next.slice(0, 2)).toEqual(EXISTING)
    expect(next[2]).toMatchObject({ id: "macd", params: {} })
    expect(new Set(next.map((item) => item.key)).size).toBe(3)
    expect(onClose).toHaveBeenCalled()
  })

  it("đã đủ số chỉ báo tối đa thì không thêm được nữa", async () => {
    const full = Array.from({ length: 3 }, (_, index): ChartIndicatorInput => ({ key: `k${index}`, id: "rsi", params: {} }))
    const { onChange, user } = setup({ kind: "add" }, full, 3)
    expect(screen.getByRole("status").textContent).toContain("tối đa 3")
    await user.click(screen.getByRole("button", { name: "MACD" }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("khoá mới không trùng khoá đang có", () => {
    const taken = [{ key: newIndicatorKey("rsi", []), id: "rsi", params: {} }]
    expect(newIndicatorKey("rsi", taken)).not.toBe(taken[0].key)
    expect(MAX_INDICATORS).toBeGreaterThan(5)
  })
})

describe("hộp thoại sửa chỉ báo", () => {
  it("hiện tham số hiện tại của chỉ báo", () => {
    setup({ kind: "edit", key: "rsi-1" })
    const dialog = screen.getByRole("dialog", { name: "Cài đặt RSI" })
    expect((within(dialog).getByLabelText("Chu kỳ RSI") as HTMLInputElement).value).toBe("14")
    expect((within(dialog).getByLabelText("Ngưỡng quá bán") as HTMLInputElement).value).toBe("30")
  })

  it("đổi chu kỳ rồi lưu: chỉ chỉ báo đó đổi, các chỉ báo khác giữ nguyên", async () => {
    const { onChange, onClose, user } = setup({ kind: "edit", key: "rsi-1" })
    const input = screen.getByLabelText("Chu kỳ RSI")
    await user.clear(input)
    await user.type(input, "21")
    await user.click(screen.getByRole("button", { name: "Lưu" }))
    const next = onChange.mock.calls[0][0] as ChartIndicatorInput[]
    expect(next[0]).toBe(EXISTING[0])
    expect(next[1]).toMatchObject({ key: "rsi-1", id: "rsi", params: { period: 21, lower: 30, upper: 70 } })
    expect(onClose).toHaveBeenCalled()
  })

  it("tham số ngoài giới hạn hiện lỗi và khoá nút Lưu", async () => {
    const { onChange, user } = setup({ kind: "edit", key: "rsi-1" })
    const input = screen.getByLabelText("Chu kỳ RSI")
    await user.clear(input)
    await user.type(input, "1")
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Lưu" }).hasAttribute("disabled")).toBe(true)
    await user.click(screen.getByRole("button", { name: "Lưu" }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("ô trống là lỗi chứ không thành 0", async () => {
    const { user } = setup({ kind: "edit", key: "rsi-1" })
    await user.clear(screen.getByLabelText("Chu kỳ RSI"))
    expect(screen.getByRole("alert").textContent).toContain("phải là một số")
  })

  it("ngưỡng dưới không nhỏ hơn ngưỡng trên bị từ chối", async () => {
    const { user } = setup({ kind: "edit", key: "rsi-1" })
    const lower = screen.getByLabelText("Ngưỡng quá bán")
    await user.clear(lower)
    await user.type(lower, "80")
    expect(screen.getByRole("alert").textContent).toContain("nhỏ hơn")
  })

  it("nút Mặc định đưa các ô về giá trị mặc định", async () => {
    const { user } = setup({ kind: "edit", key: "rsi-1" }, [{ key: "rsi-1", id: "rsi", params: { period: 30 } }])
    expect((screen.getByLabelText("Chu kỳ RSI") as HTMLInputElement).value).toBe("30")
    await user.click(screen.getByRole("button", { name: "Mặc định" }))
    expect((screen.getByLabelText("Chu kỳ RSI") as HTMLInputElement).value).toBe("14")
  })

  it("Huỷ đóng mà không đổi gì", async () => {
    const { onChange, onClose, user } = setup({ kind: "edit", key: "rsi-1" })
    await user.click(screen.getByRole("button", { name: "Huỷ" }))
    expect(onClose).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("khoá không có trong danh sách (chỉ báo vừa bị xoá) thì không mở gì", () => {
    setup({ kind: "edit", key: "da-xoa" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("state null thì không có hộp thoại", () => {
    setup(null)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
