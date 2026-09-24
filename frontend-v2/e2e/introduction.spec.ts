import { expect, test } from "./fixtures"

const title = "Tập đầu tư có hệ thống, bắt đầu từ tư duy."
const poster = "/assets/mascots-2d/v2/thanh-long/hero-sharp-v1.webp"

async function expectReady(page: import("@playwright/test").Page) {
  const main = page.getByRole("main", { name: "Giới thiệu IQX" })
  await expect(
    main.getByRole("heading", { name: title, exact: true })
  ).toBeVisible()
  await expect(main.getByText("Đang tải nội dung")).toHaveCount(0)
  return main
}

test.describe("introduction landing", () => {
  test("home and legacy alias show the journey CTA and preserve query parameters", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto("/")
    const main = await expectReady(page)
    const header = page.getByRole("banner")
    await expect(header).toHaveCSS("height", "48px")
    const nav = header.getByRole("navigation", { name: "Điều hướng chính" })
    await expect(nav).toBeVisible()
    await expect(header.getByRole("button", { name: "Mở menu điều hướng" })).toBeHidden()
    for (const [name, href] of [
      ["Giới thiệu", "/"],
      ["Demo Trading", "/demo-trading"],
      ["Chiến lược", "/chien-luoc"],
      ["Bài học", "/bai-hoc"],
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href)
    }
    await expect(header.getByRole("link", { name: "Bắt đầu ngay" })).toHaveAttribute(
      "href",
      "/demo-trading?view=journey"
    )
    const cta = main
      .getByRole("link", { name: "Bắt đầu hành trình", exact: true })
      .first()
    await expect(cta).toHaveAttribute("href", /^\/demo-trading(?:\?.*)?$/)
    await expect(cta).toBeInViewport()
    const box = await cta.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(768)

    await cta.click()
    await expect(page).toHaveURL(/\/demo-trading\?view=journey$/)

    await page.goto("/gioi-thieu?utm_source=intro-test")
    await expectReady(page)
    await expect(page).toHaveURL(/\/?utm_source=intro-test$/)
  })

  test("mobile menu keeps introduction links and roadmap reachable without page overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await expectReady(page)
    const header = page.getByRole("banner")
    await expect(header).toHaveCSS("height", "48px")
    await expect(header.getByRole("navigation", { name: "Điều hướng chính" })).toBeHidden()
    const trigger = header.getByRole("button", { name: "Mở menu điều hướng" })
    await trigger.click()
    const menu = page.getByRole("dialog", { name: "Điều hướng IQX" })
    const nav = menu.getByRole("navigation", { name: "Điều hướng di động" })
    for (const [name, href] of [
      ["Giới thiệu", "/"],
      ["Demo Trading", "/demo-trading"],
      ["Chiến lược", "/chien-luoc"],
      ["Bài học", "/bai-hoc"],
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href)
    }
    await expect(menu.getByRole("link", { name: "Bắt đầu ngay" })).toHaveAttribute("href", "/demo-trading?view=journey")
    await nav.getByRole("link", { name: "Demo Trading", exact: true }).click()
    await expect(menu).not.toBeVisible()
    await expect(page).toHaveURL(/\/demo-trading$/)
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(overflow.width).toBeLessThanOrEqual(overflow.client)
  })

  test("canonical Thanh Long poster and egg artwork appear in the roadmap", async ({
    page,
  }) => {
    await page.goto("/")
    const main = await expectReady(page)
    const mascot = main.locator(`img[src="${poster}"]`)
    await expect(mascot).toBeAttached()
    await mascot.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        mascot.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
        )
      )
      .toBe(true)

    const levels = await main
      .locator('[data-artwork="recreated-egg"]')
      .evaluateAll((elements) =>
        [
          ...new Set(
            elements.map((element) =>
              Number(element.getAttribute("data-egg-level"))
            )
          ),
        ].sort((a, b) => a - b)
      )
    expect(levels).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test("level previews remain read-only", async ({ page }) => {
    const posts: string[] = []
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/"))
        posts.push(request.url())
    })
    await page.goto("/")
    const main = await expectReady(page)
    for (const level of [0, 2, 4]) {
      const preview = main.getByRole("button", {
        name: new RegExp(`Cấp\\s*${level}\\b`, "i"),
      })
      await preview.click()
      await expect(preview).toHaveAttribute("aria-pressed", "true")
      await expect(main.getByText(new RegExp(`^Cấp ${level} ·`))).toBeVisible()
      await expect(
        preview.locator(
          `[data-artwork="recreated-egg"][data-egg-level="${level}"]`
        )
      ).toBeVisible()
    }
    expect(posts).toEqual([])
  })

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}px renders every image and fits in light and dark themes`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.goto("/")
      const main = await expectReady(page)
      for (const theme of ["dark", "light"]) {
        const currentTheme = await page.locator("html").getAttribute("class")
        if (!currentTheme?.split(" ").includes(theme)) {
          await page
            .getByRole("button", {
              name: theme === "light" ? "Chế độ sáng" : "Chế độ tối",
            })
            .click()
        }
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`\\b${theme}\\b`)
        )
        const images = main.locator("img:visible")
        for (let index = 0; index < (await images.count()); index += 1) {
          const image = images.nth(index)
          await image.scrollIntoViewIfNeeded()
          await expect
            .poll(() =>
              image.evaluate(
                (node: HTMLImageElement) =>
                  node.complete && node.naturalWidth > 0
              )
            )
            .toBe(true)
        }
        const overflow = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }))
        expect(
          overflow.width,
          `${theme} at ${viewport.width}px`
        ).toBeLessThanOrEqual(overflow.client)
        await expectReady(page)
        const contentViewport = main.locator(
          '[data-slot="scroll-area-viewport"]'
        )
        for (const [position, scrollTop] of [
          ["top", 0],
          ["middle", 600],
          ["bottom", 1_000_000],
        ] as const) {
          await contentViewport.evaluate((node, target) => {
            node.scrollTop = target
          }, scrollTop)
          await page.screenshot({
            path: testInfo.outputPath(
              `introduction-${theme}-${viewport.width}-${position}.png`
            ),
            animations: "disabled",
          })
        }
      }
    })
  }
})
