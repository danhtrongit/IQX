import { closePanelLayer, expect, test } from "./fixtures"

// LUYỆN TẬP → Giao dịch: main-area tabs Biểu đồ · Bảng giá · Thị trường (layout v1.3 §2.2).
for (const width of [1440, 1024, 390, 320]) {
  test(`content tabs fit vertically and keep keyboard navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/luyen-tap?tool=giao-dich&content=board&symbol=FPT")
    await closePanelLayer(page)
    const list = page.getByRole("tablist", { name: "Nội dung giao dịch" })
    await expect(list).toBeVisible()
    const dimensions = await list.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
    }))
    expect(dimensions.height).toBe(44)
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight)
    expect(dimensions.overflowY).toBe("hidden")
    expect(dimensions.scrollbarWidth).toBe("none")
    await expect(list.getByRole("tab")).toHaveText(["Biểu đồ", "Bảng giá", "Thị trường"])
    await expect(list.getByRole("tab", { name: "AI Phân Tích" })).toHaveCount(0)
    await list.getByRole("tab", { name: "Bảng giá", exact: true }).focus()
    await page.keyboard.press("End")
    await expect(list.getByRole("tab", { name: "Thị trường", exact: true })).toHaveAttribute("aria-selected", "true")
    const params = new URL(page.url()).searchParams
    expect(params.get("content")).toBe("market")
    expect(params.get("tool")).toBe("giao-dich")
    expect(params.get("symbol")).toBe("FPT")
    await expect(page.getByRole("tabpanel", { name: "Thị trường", exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

// Old links keep working (layout v1.3 §6): the retired AI Phân Tích tab opens Thị trường.
test("old /demo-trading link with content=ai-analysis&analysis=market redirects to Giao dịch → Thị trường", async ({ page }) => {
  await page.goto("/demo-trading?content=ai-analysis&analysis=market&view=trading&symbol=FPT")
  await expect(page).toHaveURL(/\/luyen-tap\?tool=giao-dich&tab=dat-lenh&content=market&symbol=FPT$/)
  await expect(page.getByRole("tablist", { name: "Nội dung giao dịch" }).getByRole("tab", { name: "Thị trường" })).toHaveAttribute("aria-selected", "true")
})
