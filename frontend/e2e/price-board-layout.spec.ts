import { closePanelLayer, expect, test } from "./fixtures"

for (const width of [1440, 1024, 390]) {
  test(`price board keeps spacing between cards, filters and table at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/luyen-tap?tool=giao-dich&content=board")
    await closePanelLayer(page)
    const strip = page.locator('[data-tour-id="tour-banggia-index-strip"]')
    await expect(strip).toBeVisible()
    const gaps = await strip.evaluate(element => {
      const cards = element.parentElement!
      const toolbar = cards.nextElementSibling!
      const table = toolbar.nextElementSibling!
      return {
        cardGap: getComputedStyle(element).gap,
        filtersGap: toolbar.getBoundingClientRect().top - cards.getBoundingClientRect().bottom,
        tableGap: table.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom,
      }
    })
    expect(gaps.cardGap).toBe("12px")
    expect(gaps.filtersGap).toBeGreaterThanOrEqual(12)
    expect(gaps.tableGap).toBeGreaterThanOrEqual(12)
    await expect(page.getByRole("textbox", { name: "Tìm mã trên bảng giá" })).toBeVisible()
  })
}
