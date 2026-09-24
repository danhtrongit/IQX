import { test, expect, assertV2Request, seedMember } from "./fixtures"

test.describe("frontend-v2 browser smoke", () => {
  test("guest can load the introduction and preserves a legacy alias query", async ({ page }) => {
    const requests = assertV2Request(page)
    await page.goto("/gioi-thieu?utm_source=smoke")
    await expect(page.getByRole("banner")).toBeVisible()
    await expect(page).toHaveURL(/\/?utm_source=smoke$/)
    await expect(page.getByRole("link", { name: /IQX.*trang chủ/i })).toBeVisible()
    expect(requests().every(url => url.includes("/api/v2/") || !url.includes("/api/"))).toBeTruthy()
  })

  test("login dialog shows an API error and keeps the user on the page", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Đăng nhập" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByLabel("Email").fill("wrong@example.com")
    await page.getByLabel("Mật khẩu").fill("wrong-password")
    await page.getByRole("dialog").getByRole("button", { name: "Đăng nhập" }).click()
    await expect(page.getByRole("alert")).toContainText("Email hoặc mật khẩu")
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("guest strategy route is denied without fetching premium data", async ({ page }) => {
    const premiumCalls: string[] = []
    page.on("request", request => { if (request.url().includes("/api/v2/premium/") || request.url().includes("/api/v2/strategy/")) premiumCalls.push(request.url()) })
    await page.goto("/chien-luoc")
    await expect(page.getByText("Cần đăng nhập")).toBeVisible()
    expect(premiumCalls).toHaveLength(0)
    await page.getByRole("button", { name: "Đăng nhập" }).last().click()
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("non-admin session is denied from the admin surface", async ({ page }) => {
    await seedMember(page)
    await page.goto("/admin")
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible()
    await expect(page.getByText(/Tài khoản hiện tại không có quyền quản trị/i)).toBeVisible()
  })

  test("learning catalog renders server data and an empty search state", async ({ page }) => {
    await page.goto("/bai-hoc")
    await expect(page.getByRole("heading", { name: "Kiến thức" })).toBeVisible()
    await expect(page.getByText("Nhập môn chứng khoán")).toBeVisible()
    await page.getByLabel("Tìm khoá học").fill("không tồn tại")
    await page.waitForTimeout(450)
    await expect(page.getByText(/Không tìm thấy khoá học/i)).toBeVisible()
  })

  test("premium page exposes plan and payment result states", async ({ page }) => {
    await page.goto("/nang-cap")
    await expect(page.getByText(/Premium tháng/i)).toBeVisible()
    await page.goto("/payment/success?order_id=missing")
    await expect(page.getByText(/Không tìm thấy đơn hàng|Đăng nhập để đối chiếu/i)).toBeVisible()
  })

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    test(`responsive ${viewport.width}px has no document overflow in both themes`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.goto("/bai-hoc")
      await expect(page.getByRole("heading", { name: "Kiến thức", exact: true })).toBeVisible()
      await expect(page.getByText("Nhập môn chứng khoán", { exact: true })).toBeVisible()
      for (const theme of ["dark", "light"]) {
        const currentTheme = await page.locator("html").getAttribute("class")
        if (!currentTheme?.split(" ").includes(theme)) {
          await page.getByRole("button", { name: theme === "light" ? "Chế độ sáng" : "Chế độ tối" }).click()
        }
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`))
        const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
        expect(overflow.width, `${theme} ${viewport.width}px`).toBeLessThanOrEqual(overflow.client)
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.width}.png`), fullPage: true, animations: "disabled" })
      }
    })
  }
})
