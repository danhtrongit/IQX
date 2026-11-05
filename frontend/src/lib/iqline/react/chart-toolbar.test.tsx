import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ChartToolbar, type ChartToolbarProps } from "./chart-toolbar"
import { installRadixPolyfills } from "./test-env"

installRadixPolyfills()

function setup(overrides: Partial<ChartToolbarProps> = {}) {
  const props: ChartToolbarProps = {
    chartType: "candles",
    onChartTypeChange: vi.fn(),
    priceScale: "linear",
    onPriceScaleChange: vi.fn(),
    indicatorCount: 2,
    onOpenIndicators: vi.fn(),
    canUndo: true,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onFit: vi.fn(),
    onScreenshot: vi.fn(),
    onToggleFullscreen: vi.fn(),
    fullscreen: false,
    ...overrides,
  }
  render(<ChartToolbar {...props} />)
  return { props, user: userEvent.setup() }
}

const bar = () => screen.getByRole("toolbar", { name: "Công cụ biểu đồ" })

describe("ChartToolbar", () => {
  it("nút hoàn tác và làm lại theo trạng thái; bấm gọi đúng hàm", async () => {
    const { props, user } = setup()
    expect(screen.getByRole("button", { name: "Làm lại" }).hasAttribute("disabled")).toBe(true)
    await user.click(screen.getByRole("button", { name: "Hoàn tác" }))
    expect(props.onUndo).toHaveBeenCalledTimes(1)
    expect(props.onRedo).not.toHaveBeenCalled()
  })

  it("về khung mặc định, chụp ảnh, toàn màn hình", async () => {
    const { props, user } = setup()
    await user.click(within(bar()).getByRole("button", { name: "Về khung mặc định" }))
    await user.click(within(bar()).getByRole("button", { name: "Chụp ảnh biểu đồ" }))
    await user.click(within(bar()).getByRole("button", { name: "Toàn màn hình" }))
    expect(props.onFit).toHaveBeenCalled()
    expect(props.onScreenshot).toHaveBeenCalled()
    expect(props.onToggleFullscreen).toHaveBeenCalled()
  })

  it("đang toàn màn hình thì nút đổi nhãn và aria-pressed", () => {
    setup({ fullscreen: true })
    expect(within(bar()).getByRole("button", { name: "Thoát toàn màn hình" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("thang giá: ba lựa chọn, chọn Log gọi hàm", async () => {
    const { props, user } = setup()
    const group = within(bar()).getByRole("radiogroup", { name: "Thang giá" })
    expect(within(group).getAllByRole("radio")).toHaveLength(3)
    await user.click(within(group).getByRole("radio", { name: "Thang giá logarit" }))
    expect(props.onPriceScaleChange).toHaveBeenCalledWith("log")
  })

  it("kiểu hiển thị: mở menu, chọn Đường", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Kiểu hiển thị: Nến" }))
    const items = screen.getAllByRole("menuitemradio").map((item) => item.textContent)
    expect(items).toEqual(["Nến", "Nến rỗng", "Thanh OHLC", "Đường", "Vùng", "Heikin Ashi"])
    await user.click(screen.getByRole("menuitemradio", { name: "Đường" }))
    expect(props.onChartTypeChange).toHaveBeenCalledWith("line")
  })

  it("nút chỉ báo hiện số chỉ báo và mở hộp thoại; bỏ handler thì ẩn nút", async () => {
    const { props, user } = setup()
    const button = screen.getByRole("button", { name: "Chỉ báo" })
    expect(button.textContent).toContain("2")
    await user.click(button)
    expect(props.onOpenIndicators).toHaveBeenCalled()
  })

  it("không có onOpenIndicators thì không có nút chỉ báo", () => {
    setup({ onOpenIndicators: undefined })
    expect(screen.queryByRole("button", { name: "Chỉ báo" })).toBeNull()
  })

  it("ô khung thời gian chỉ hiện khi trang cho đổi khung", async () => {
    const { props, user } = setup({ interval: "D", onIntervalChange: vi.fn() })
    await user.click(screen.getByRole("combobox", { name: "Khung thời gian" }))
    await user.click(screen.getByRole("option", { name: "15 phút" }))
    expect(props.onIntervalChange).toHaveBeenCalledWith("15")
  })

  it("không có onIntervalChange thì không có ô khung", () => {
    setup({ interval: "D" })
    expect(screen.queryByRole("combobox", { name: "Khung thời gian" })).toBeNull()
  })

  it("menu thêm tuỳ chọn cho màn hình hẹp có thang giá và ba tiện ích", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Thêm tuỳ chọn" }))
    await user.click(screen.getByRole("menuitemradio", { name: "Thang giá phần trăm" }))
    expect(props.onPriceScaleChange).toHaveBeenCalledWith("percent")
  })
})
