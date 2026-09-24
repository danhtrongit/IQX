import { expect, test } from "./fixtures"

for (const width of [1440, 1024, 390, 320]) {
  test(`content tabs fit vertically and keep keyboard navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/demo-trading?content=board&view=trading")
    const list = page.getByRole("tablist", { name: "Nội dung demo trading" })
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
    await list.getByRole("tab", { name: "Bảng giá", exact: true }).focus()
    await page.keyboard.press("End")
    await expect(list.getByRole("tab", { name: "AI Phân Tích", exact: true })).toHaveAttribute("aria-selected", "true")
    expect(new URL(page.url()).searchParams.get("view")).toBe("trading")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
