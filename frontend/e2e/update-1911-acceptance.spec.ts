/**
 * Update 19-11 acceptance (frontend-observable cases), API mocked:
 * - `backend/docs/update-19-11/IQX-Bo-Cuc-SPEC.md` §9: N01–N13, N15 (UI), N18, N19, N21, N22.
 * - `backend/docs/update-19-11/IQX-Tab-IQX-Loc-Backtest-SPEC.md` §7: 1, 2, 4, 5, 6 (UI), 7, 8, 9, 10, 12, 14, 15, 17, 21, 23/24, 29.
 * Screenshots of key states go to `backend/docs/update-19-11/evidence/` (`e2e-*.png`).
 */
import path from "node:path"

import type { Page } from "@playwright/test"

import { mockFlashback } from "./flashback-support"
import { closePanelLayer, expect, test } from "./fixtures"
import { EVIDENCE, IQX_FILTERS, IQX_STRATEGIES, json, mockMember, overflows, XU, type MemberOptions } from "./u1911-support"

test.describe.configure({ timeout: 90_000 })

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(EVIDENCE, `e2e-${name}.png`) })
const frame = (page: Page) => page.getByTestId("workspace-frame")
const rail = (page: Page) => page.getByRole("navigation", { name: "Công cụ theo trang" })
const tool = (page: Page, id: string) => rail(page).locator(`[data-tool="${id}"]`)
const railIds = (page: Page) => rail(page).locator("[data-tool]").evaluateAll((items) => items.map((item) => item.getAttribute("data-tool")))
const mainTabs = (page: Page) => page.getByRole("tablist", { name: "Nội dung giao dịch" })
const tradingTabs = (page: Page) => page.locator('[data-trading-panel]:not([hidden]) [role="tablist"][aria-label="Giao dịch"]')
const tradingTab = (page: Page, id: string) => tradingTabs(page).locator(`[data-trading-tab="${id}"]`)
const visiblePanels = (page: Page) => page.locator("[data-trading-panel]:not([hidden])")
const mainWidth = (page: Page) => page.locator(".workspace-main").evaluate((element) => Math.round(element.getBoundingClientRect().width))

async function member(page: Page, options: MemberOptions = {}) {
  await mockMember(page, options)
}

async function desktop(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 })
}

/* ═══════════════════════ Bố cục v1.3 §9 ═══════════════════════ */

test.describe("Bố cục v1.3 · máy tính", () => {
  test.beforeEach(async ({ page }) => {
    await member(page)
    await desktop(page)
  })

  test("N01 thanh trên cùng: Giới thiệu · Luyện tập · Flashback · Chiến lược, không còn Demo Trading, Học viện", async ({ page }) => {
    await page.goto("/")
    const nav = page.getByRole("banner").getByRole("navigation", { name: "Điều hướng chính" })
    // "Khu giao dịch" (2026-11-14) and "Văn phòng" (2026-11-23) stay after Chiến lược.
    await expect(nav.getByRole("link")).toHaveText([/^Giới thiệu$/i, /^Luyện tập$/i, /^Flashback$/i, /^Chiến lược$/i, /^Khu giao dịch$/i, /^Văn phòng$/i])
    await expect(nav.getByRole("link", { name: /Demo Trading|Học viện/i })).toHaveCount(0)
    await shot(page, "N01-header-1440")
  })

  test("N02 LUYỆN TẬP: rail Candle Dojo · Học viện · Bot · Giao dịch · Dashboard phân tích · Toàn cảnh thị trường; không Insight, Shop, Flashback", async ({ page }) => {
    await page.goto("/luyen-tap")
    // Default tool (DEV-NOTES §2.4 decision): Candle Dojo.
    await expect(tool(page, "candle-dojo")).toHaveAttribute("aria-pressed", "true")
    expect(await railIds(page)).toEqual(["candle-dojo", "hoc-vien", "bot", "giao-dich", "phan-tich", "toan-canh"])
    await expect(rail(page).locator("[data-tool]")).toHaveText(["Candle Dojo", "Học viện", "Bot", "Giao dịch", "Dashboard phân tích", "Toàn cảnh thị trường"])
    await expect(rail(page).getByText(/Insight|Shop|Flashback/)).toHaveCount(0)
    // Candle Dojo has no panel: the main area takes the full width.
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    await expect(page.getByTestId("dojo-home")).toBeVisible()
    await shot(page, "N02-luyen-tap-candle-dojo-1440")
  })

  test("N03 N04 N05 N06 Giao dịch: main tabs, panel ba tab thay hẳn nội dung, giữ lệnh đang nhập, thu/mở về đúng tab", async ({ page }) => {
    await page.goto("/luyen-tap")
    await tool(page, "giao-dich").click()
    await expect(page).toHaveURL(/tool=giao-dich&tab=dat-lenh/)
    // N03
    await expect(mainTabs(page).getByRole("tab")).toHaveText(["Biểu đồ", "Bảng giá", "Thị trường"])
    const panel = page.getByRole("complementary", { name: "Giao dịch" })
    await expect(panel.getByRole("heading", { name: "Giao dịch", level: 2 })).toBeVisible()
    await expect(tradingTabs(page).getByRole("tab")).toHaveText(["Đặt lệnh", "Danh mục", "Tin tức"])
    await expect(tradingTab(page, "dat-lenh")).toHaveAttribute("aria-selected", "true")
    // N15 (UI): a new account trades with 100.000.000đ, no xu ↔ cash box anywhere.
    await expect(panel.getByText("Tiền khả dụng")).toBeVisible()
    await expect(panel).toContainText("100.000.000")
    await shot(page, "N03-giao-dich-dat-lenh-1440")

    // N05: type an order, switch away and back.
    const quantity = panel.locator("#quantity")
    await quantity.fill("500")

    // N04: a tab replaces the whole panel content; exactly one tab panel is shown, nothing to scroll to.
    await tradingTab(page, "danh-muc").click()
    await expect(visiblePanels(page)).toHaveCount(1)
    await expect(visiblePanels(page)).toHaveAttribute("data-trading-panel", "danh-muc")
    await expect(page.locator('[data-trading-panel="dat-lenh"]')).toBeHidden()
    await expect(visiblePanels(page)).toContainText("VNM")
    await expect(page).toHaveURL(/tab=danh-muc/)
    await shot(page, "N04-giao-dich-danh-muc-1440")
    await tradingTab(page, "tin-tuc").click()
    await expect(visiblePanels(page)).toHaveAttribute("data-trading-panel", "tin-tuc")
    await expect(page.locator('[data-trading-panel="danh-muc"]')).toBeHidden()
    await shot(page, "N04-giao-dich-tin-tuc-1440")
    // Keyboard: arrows move between tabs.
    await tradingTab(page, "tin-tuc").focus()
    await page.keyboard.press("ArrowRight")
    await expect(tradingTab(page, "dat-lenh")).toHaveAttribute("aria-selected", "true")
    await expect(panel.locator("#quantity")).toHaveValue("500")

    // N06: clicking the open tool collapses the panel, the main area grows; again re-opens on the same tab.
    await tradingTab(page, "danh-muc").click()
    const openWidth = await mainWidth(page)
    await tool(page, "giao-dich").click()
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "true")
    await expect.poll(() => mainWidth(page)).toBeGreaterThan(openWidth + 200)
    await shot(page, "N06-giao-dich-thu-panel-1440")
    await tool(page, "giao-dich").click()
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
    await expect(tradingTab(page, "danh-muc")).toHaveAttribute("aria-selected", "true")
    await tradingTab(page, "dat-lenh").click()
    await expect(panel.locator("#quantity")).toHaveValue("500")
  })

  test("N07 Danh mục → ⋯ Đặt lệnh chuyển sang tab Đặt lệnh với đúng mã", async ({ page }) => {
    await page.goto("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT")
    const panel = page.getByRole("complementary", { name: "Giao dịch" })
    await panel.getByRole("button", { name: "Thao tác với HPG" }).click()
    await page.getByRole("menuitem", { name: "Đặt lệnh" }).click()
    await expect(tradingTab(page, "dat-lenh")).toHaveAttribute("aria-selected", "true")
    await expect(page).toHaveURL(/symbol=HPG/)
    await expect(panel.getByRole("combobox", { name: "Đổi mã đang xem" })).toHaveText(/HPG/)
  })

  test("N08 Học viện, Bot, Dashboard phân tích: mở được, đóng/mở panel đúng v1.2 §5", async ({ page }) => {
    await page.goto("/luyen-tap")
    for (const id of ["hoc-vien", "bot"]) {
      await tool(page, id).click()
      await expect(page).toHaveURL(new RegExp(`tool=${id}`))
      await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
      await expect(frame(page)).toHaveAttribute("data-panel-hidden", "false", { timeout: 20_000 })
      await expect(tool(page, id)).toHaveAttribute("aria-expanded", "true")
      await shot(page, `N08-${id}-1440`)
      // No main-area tabs with Học viện and Bot (§2.2).
      await expect(mainTabs(page)).toHaveCount(0)
      await tool(page, id).click()
      await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "true")
      await tool(page, id).click()
      await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
    }
    // Dashboard phân tích keeps its current layout: main-area tabs, its chart picker inside the main area, no rail panel.
    await tool(page, "phan-tich").click()
    await expect(page).toHaveURL(/tool=phan-tich/)
    await expect(mainTabs(page)).toHaveCount(1)
    await expect(page.getByRole("heading", { name: "Dashboard phân tích", level: 1 })).toBeVisible()
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    await shot(page, "N08-phan-tich-1440")
    await tool(page, "phan-tich").click()
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    // Switching tool never collapses the panel.
    await tool(page, "bot").click()
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
    await expect(page.getByText("Danh mục Bot")).toBeVisible()
    // Candle Dojo (no panel): clicking it again changes nothing.
    await tool(page, "candle-dojo").click()
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    await tool(page, "candle-dojo").click()
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    await expect(page.getByTestId("dojo-home")).toBeVisible()
  })

  test("N09 Insight không có trên giao diện; link cũ chuyển sang Giao dịch → Đặt lệnh giữ mã", async ({ page }) => {
    await page.goto("/luyen-tap?tool=giao-dich")
    await expect(rail(page)).toBeVisible()
    await expect(page.getByText(/Insight/)).toHaveCount(0)
    await page.goto("/demo-trading?view=insight&symbol=FPT")
    await expect(page).toHaveURL(/\/luyen-tap\?tool=giao-dich&tab=dat-lenh&symbol=FPT$/)
    await page.goto("/demo-trading?content=ai-analysis&analysis=stock&symbol=VNM")
    await expect(page).toHaveURL(/\/luyen-tap\?tool=giao-dich&tab=dat-lenh&symbol=VNM$/)
  })

  test("N10 N11 FLASHBACK: rail Flashback · Shop, sảnh rộng hết cỡ; vào phòng chơi có panel đặt lệnh", async ({ page }) => {
    await mockFlashback(page)
    await page.goto("/flashback")
    await expect(tool(page, "flashback")).toHaveAttribute("aria-pressed", "true")
    expect(await railIds(page)).toEqual(["flashback", "shop"])
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    await expect(page.getByRole("button", { name: "Tạo phòng" }).first()).toBeVisible()
    await shot(page, "N10-flashback-sanh-1440")
    // N11: create a room, start, the match has the order panel on the right.
    await page.getByRole("button", { name: "Tạo phòng" }).first().click()
    await page.getByTestId("flashback-create-room").getByRole("button", { name: "Tạo phòng" }).click()
    await expect(page.getByTestId("flashback-room-id")).toBeVisible()
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    await page.getByRole("button", { name: /^Bắt đầu/ }).click()
    await expect(page.getByTestId("flashback-clock")).toBeVisible()
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "false")
    await expect(page.locator(".workspace-panel").getByRole("region", { name: "Đặt lệnh" })).toBeVisible()
    await shot(page, "N11-flashback-van-choi-1440")
  })

  test("N12 Shop: Linh thú và Thẻ nến, không có Premium; panel Shop như cũ", async ({ page }) => {
    await page.goto("/flashback?tool=shop")
    await expect(page.getByText("Linh thú", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Thẻ nến", { exact: true }).first()).toBeVisible()
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
    await expect(page.locator(".workspace-panel")).toContainText(XU.toLocaleString("vi-VN"))
    // The mocked server still sends premium_price_xu / exchange: the UI must not show them.
    await expect(page.locator("body")).not.toContainText(/Premium/i)
    await expect(page.locator("body")).not.toContainText(/đổi xu|Đổi xu|đổi sang tiền|Học bài để nhận vốn/i)
    await shot(page, "N12-shop-1440")
  })

  test("N13 nút xu mở FLASHBACK → Shop, panel mở, từ bất kỳ mục nào", async ({ page }) => {
    for (const from of ["/", "/luyen-tap?tool=bot", "/chien-luoc", "/flashback?tool=flashback"]) {
      await page.goto(from)
      await page.getByTestId("header-coin-chip").click()
      await expect(page).toHaveURL(/\/flashback\?tool=shop/)
      await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
      await expect(frame(page)).toHaveAttribute("data-panel-hidden", "false")
    }
    // Even when the Shop panel was collapsed before (fresh entry: a reload of the chip's entry keeps its state, see BUG test).
    await page.goto("/")
    await page.goto("/flashback?tool=shop")
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
    await page.waitForTimeout(1500)
    await tool(page, "shop").click()
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "true")
    await page.goto("/luyen-tap?tool=bot")
    await page.getByTestId("header-coin-chip").click()
    await expect(page).toHaveURL(/\/flashback\?tool=shop/)
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
  })

  test("N13/v1.2 §5: sau khi mở Shop bằng nút xu, bấm Shop thu được panel", async ({ page }) => {
    await page.goto("/luyen-tap?tool=bot")
    await page.getByTestId("header-coin-chip").click()
    await expect(page).toHaveURL(/\/flashback\?tool=shop/)
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
    await page.waitForTimeout(1500)
    await tool(page, "shop").click()
    await page.waitForTimeout(1500)
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "true", { timeout: 3_000 })
  })

  test("N15 (UI) không có nút hay hộp đổi xu/tiền ở Giao dịch, Danh mục, Shop, Candle Dojo", async ({ page }) => {
    const banned = /đổi xu|Đổi xu|Nạp xu|Rút xu|đổi sang tiền|Học bài để nhận vốn|Premium/i
    for (const url of ["/luyen-tap?tool=giao-dich&tab=dat-lenh", "/luyen-tap?tool=giao-dich&tab=danh-muc", "/flashback?tool=shop", "/luyen-tap?tool=candle-dojo", "/luyen-tap?tool=bot"]) {
      await page.goto(url)
      await expect(frame(page)).toBeVisible()
      await page.waitForTimeout(800)
      await expect(page.locator("body"), url).not.toContainText(banned)
    }
  })

  test("N18 LUYỆN TẬP ↔ FLASHBACK nhiều lần: mỗi mục giữ công cụ, tab Giao dịch và trạng thái đóng/mở", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Điều hướng chính" })
    await page.goto("/luyen-tap?tool=giao-dich&tab=dat-lenh")
    await tradingTab(page, "tin-tuc").click()
    await tool(page, "giao-dich").click()
    await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "true")
    await nav.getByRole("link", { name: /Flashback/i }).click()
    await expect(page).toHaveURL(/\/flashback\?tool=flashback/)
    await tool(page, "shop").click()
    await expect(page).toHaveURL(/tool=shop/)
    for (let round = 0; round < 3; round += 1) {
      await nav.getByRole("link", { name: /Luyện tập/i }).click()
      await expect(page).toHaveURL(/\/luyen-tap\?tool=giao-dich&tab=tin-tuc/)
      await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "true")
      await nav.getByRole("link", { name: /Flashback/i }).click()
      await expect(page).toHaveURL(/\/flashback\?tool=shop/)
      await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "false")
    }
    await nav.getByRole("link", { name: /Luyện tập/i }).click()
    await tool(page, "giao-dich").click()
    await expect(tradingTab(page, "tin-tuc")).toHaveAttribute("aria-selected", "true")
  })

  test("N19 link cũ §6 mở đúng nơi, không 404", async ({ page }) => {
    const cases: [string, RegExp][] = [
      ["/demo-trading", /\/luyen-tap\?tool=giao-dich&tab=dat-lenh$/],
      ["/demo-trading?view=trading", /\/luyen-tap\?tool=giao-dich&tab=dat-lenh$/],
      ["/demo-trading?view=portfolio", /\/luyen-tap\?tool=giao-dich&tab=danh-muc$/],
      ["/demo-trading?view=news", /\/luyen-tap\?tool=giao-dich&tab=tin-tuc$/],
      ["/demo-trading?view=insight&symbol=FPT", /\/luyen-tap\?tool=giao-dich&tab=dat-lenh&symbol=FPT$/],
      ["/demo-trading?content=ai-analysis&analysis=market", /\/luyen-tap\?tool=giao-dich&tab=dat-lenh&content=market$/],
      ["/demo-trading?view=dashboard", /\/luyen-tap\?tool=phan-tich$/],
      ["/demo-trading?view=academy", /\/luyen-tap\?tool=hoc-vien$/],
      ["/demo-trading?view=bot", /\/luyen-tap\?tool=bot$/],
      ["/demo-trading?view=shop", /\/flashback\?tool=shop$/],
      ["/demo-trading?view=flashback", /\/flashback\?tool=flashback$/],
      ["/demo-trading?view=candle-dojo", /\/luyen-tap\?tool=candle-dojo$/],
      ["/hoc-vien", /\/luyen-tap\?tool=hoc-vien$/],
      ["/bang-gia", /\/luyen-tap\?tool=giao-dich&tab=dat-lenh&content=board$/],
      ["/thi-truong", /\/luyen-tap\?tool=giao-dich&tab=dat-lenh&content=market$/],
      ["/dau-truong", /\/luyen-tap\?tool=giao-dich&tab=dat-lenh$/],
    ]
    for (const [from, to] of cases) {
      await page.goto(from)
      await expect(page, from).toHaveURL(to)
      await expect(frame(page), from).toBeVisible()
      await expect(page.getByText(/404|Không tìm thấy trang/), from).toHaveCount(0)
    }
    // A lesson link keeps the lesson (its content is not mocked here, only the redirect is checked).
    await page.goto("/hoc-vien/ch01-l01")
    await expect(page).toHaveURL(/\/luyen-tap\?tool=hoc-vien&lesson=ch01-l01$/)
  })
})

test("N13 (khách) và Candle Dojo › Mở Shop › Thẻ nến dẫn tới FLASHBACK → Shop", async ({ page }) => {
  await member(page)
  await desktop(page)
  await page.goto("/luyen-tap?tool=candle-dojo")
  await page.getByTestId("dojo-cards-block").getByRole("button", { name: /Mở Shop › Thẻ nến/ }).click()
  await expect(page).toHaveURL(/\/flashback\?tool=shop/)
})

/* N21: phones. */
for (const width of [360, 390]) {
  test.describe(`Bố cục v1.3 · điện thoại ${width}px (N21)`, () => {
    test.beforeEach(async ({ page }) => {
      await member(page)
      await page.setViewportSize({ width, height: 800 })
    })

    test(`N21 LUYỆN TẬP ${width}px: không tràn ngang, rail dùng được, chạm công cụ mở/đóng panel, tab Giao dịch chuyển đúng`, async ({ page }) => {
      await page.goto("/luyen-tap?tool=giao-dich&tab=dat-lenh")
      await expect(rail(page)).toBeVisible()
      await expect(frame(page)).toHaveAttribute("data-panel-open", "true")
      expect(await overflows(page)).toBe(false)
      await shot(page, `N21-${width}-giao-dich-panel`)
      // Giao dịch tabs inside the layer.
      await tradingTab(page, "danh-muc").click()
      await expect(visiblePanels(page)).toHaveAttribute("data-trading-panel", "danh-muc")
      await tradingTab(page, "tin-tuc").click()
      await expect(visiblePanels(page)).toHaveAttribute("data-trading-panel", "tin-tuc")
      expect(await overflows(page)).toBe(false)
      await closePanelLayer(page)
      await expect(mainTabs(page)).toBeVisible()
      expect(await overflows(page)).toBe(false)
      await shot(page, `N21-${width}-giao-dich-main`)
      // Tap a tool: opens its panel; tap it again: closes.
      for (const id of ["bot", "hoc-vien", "giao-dich"]) {
        await tool(page, id).click()
        await expect(frame(page), id).toHaveAttribute("data-panel-open", "true")
        expect(await overflows(page)).toBe(false)
        await closePanelLayer(page)
        await tool(page, id).click()
        await expect(frame(page), id).toHaveAttribute("data-panel-open", "true")
        await tool(page, id).click().catch(async () => closePanelLayer(page))
        await closePanelLayer(page)
        await expect(frame(page), id).toHaveAttribute("data-panel-open", "false")
      }
      await tool(page, "giao-dich").click()
      await expect(tradingTab(page, "tin-tuc")).toHaveAttribute("aria-selected", "true")
    })

    test(`N21 FLASHBACK ${width}px: không tràn ngang, rail dùng được, Shop mở/đóng`, async ({ page }) => {
      await mockFlashback(page)
      await page.goto("/flashback")
      await expect(rail(page)).toBeVisible()
      expect(await overflows(page)).toBe(false)
      await shot(page, `N21-${width}-flashback-sanh`)
      await tool(page, "shop").click()
      await expect(page).toHaveURL(/tool=shop/)
      await expect(page.getByText("Linh thú", { exact: true }).first()).toBeVisible()
      expect(await overflows(page)).toBe(false)
      await shot(page, `N21-${width}-shop`)
      await tool(page, "flashback").click()
      await expect(page).toHaveURL(/tool=flashback/)
      expect(await overflows(page)).toBe(false)
    })
  })
}

/* N22: wide screens, panel open and collapsed, rail at the right edge. */
test.describe("Bố cục v1.3 · N22 900/1024/1440/1920", () => {
  for (const width of [900, 1024, 1440, 1920]) {
    test(`N22 ${width}px`, async ({ page }) => {
      await member(page)
      await mockFlashback(page)
      await page.setViewportSize({ width, height: 900 })
      const report: string[] = []
      for (const url of ["/luyen-tap?tool=giao-dich&tab=dat-lenh", "/luyen-tap?tool=bot", "/flashback?tool=shop", "/flashback?tool=flashback"]) {
        await page.goto(url)
        await expect(rail(page)).toBeVisible()
        for (const state of ["open", "collapsed"] as const) {
          if (state === "collapsed") {
            const id = new URL(page.url()).searchParams.get("tool")!
            if (width > 900 && id !== "flashback") {
              await tool(page, id).click()
              await expect(frame(page)).toHaveAttribute("data-panel-collapsed", "true")
            } else {
              await closePanelLayer(page)
            }
          }
          expect(await overflows(page), `${url} ${state}`).toBe(false)
          const box = await rail(page).boundingBox()
          const layout = await frame(page).getAttribute("data-rail")
          report.push(`${width}px ${url} ${state}: rail=${layout} x=${Math.round(box!.x)} right=${Math.round(box!.x + box!.width)}`)
          expect(layout).toBe("column")
          if (width > 900 || state === "open") {
            expect(Math.round(box!.x + box!.width), `${url} ${state}`).toBe(width)
          }
        }
        if (width === 1440 || width === 900) await shot(page, `N22-${width}-${url.includes("shop") ? "shop" : url.includes("flashback") ? "flashback" : url.includes("bot") ? "bot" : "giao-dich"}`)
      }
      test.info().annotations.push({ type: "rail", description: report.join(" | ") })
      console.log(report.join("\n"))
    })
  }
})

/* ═══════════════════════ Tab IQX §7 ═══════════════════════ */

const filterLibrary = (page: Page) => page.getByRole("complementary", { name: "Thư viện chỉ tiêu" })
const backtestLibrary = (page: Page) => page.getByRole("complementary", { name: "Thư viện chỉ báo" })

async function openFilter(page: Page) {
  await page.goto("/chien-luoc?tab=bo-loc")
  await expect(page.getByRole("region", { name: "Cơ bản" })).toBeVisible()
}

async function openBacktest(page: Page) {
  await page.goto("/chien-luoc?tab=backtest")
  await expect(page.getByRole("heading", { name: "Điều kiện Mua" })).toBeVisible()
}

test.describe("Tab IQX · Bộ lọc", () => {
  test("§7.1 item 1, 2, 4, 6: 3 tab, 6 thẻ, Dùng điền ngay / hỏi khi đang có điều kiện, sửa được, lưu có origin", async ({ page }) => {
    const calls: NonNullable<MemberOptions["calls"]> = []
    await member(page, { premium: true, calls })
    await desktop(page)
    await openFilter(page)
    const library = filterLibrary(page)
    // 1: three tabs, Cơ bản stays the default.
    await expect(library.getByRole("tab")).toHaveText(["IQX", "Cơ bản", "Kỹ thuật"])
    await expect(library.getByRole("tab", { name: "Cơ bản" })).toHaveAttribute("aria-selected", "true")
    await library.getByRole("tab", { name: "IQX" }).click()
    const use = library.getByRole("button", { name: /^Dùng / })
    await expect(use).toHaveCount(6)
    expect(await use.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")))).toEqual(IQX_FILTERS.map((item) => `Dùng ${item.content.name}`))
    for (const item of IQX_FILTERS) {
      const card = page.getByTestId(`iqx-filter-${item.slug}`)
      await expect(card).toContainText(`IQX${item.content.name}`)
      await expect(card).toContainText(String(item.content.idea))
    }
    await expect(page.getByTestId("iqx-filter-canslim")).toContainText(/Thị trường 1.*Cơ bản 3.*Kỹ thuật 2/)
    await expect(page.getByTestId("iqx-footer")).toHaveText("Bộ lọc dựng sẵn bởi IQX. Bấm Dùng để điền sẵn vào form, rồi sửa như tự thiết lập. Tham khảo để học, không phải khuyến nghị.")
    await expect(page.locator("body")).not.toContainText(/mẫu|template|preset/i)
    await shot(page, "IQX-1-bo-loc-tab-iqx-1440")

    // 2: Dùng on the empty form fills at once.
    // "Hồi phục từ quá bán" uses only market + technical rows (the in-page fake has no P/E metric to save "Giá trị").
    const giatri = IQX_FILTERS[5]!
    await library.getByRole("button", { name: `Dùng ${giatri.content.name}` }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    const strip = page.getByTestId("iqx-filter-strip")
    await expect(strip).toContainText(`Bắt đầu từ Bộ lọc IQX · ${giatri.content.name}.`)
    await expect(page.getByText("Bộ lọc chưa lưu").first()).toBeVisible()
    await shot(page, "IQX-2-bo-loc-dung-1440")
    // On a form with conditions it asks; Hủy changes nothing.
    const second = IQX_FILTERS[4]!
    await library.getByRole("button", { name: `Dùng ${second.content.name}` }).click()
    const confirm = page.getByRole("dialog", { name: "Thay bộ lọc đang soạn?" })
    await expect(confirm).toContainText(`Điều kiện hiện tại sẽ được thay bằng Bộ lọc IQX · ${second.content.name}. Bộ lọc đã lưu (nếu có) không bị ảnh hưởng.`)
    await confirm.getByRole("button", { name: "Hủy" }).click()
    await expect(strip).toContainText(giatri.content.name)

    // 4: edit after filling: add a fundamental metric from the library like a manual user.
    await library.getByRole("tab", { name: "Cơ bản" }).click()
    const add = library.getByRole("button", { name: /^Thêm .* vào điều kiện lọc$/ }).first()
    const label = (await add.getAttribute("aria-label"))!
    const metric = label.replace(/^Thêm /, "").replace(/ vào điều kiện lọc$/, "")
    await add.click()
    await expect(library.getByRole("button", { name: `${metric} đã có trong điều kiện` })).toBeVisible()
    await page.getByRole("button", { name: `Bỏ điều kiện ${metric}` }).click()
    await expect(library.getByRole("button", { name: `Thêm ${metric} vào điều kiện lọc` })).toBeVisible()
    await expect(strip).toContainText(giatri.content.name)

    // 6 (UI): Lưu bộ lọc suggests the name and keeps the origin.
    await page.getByRole("button", { name: "Lưu bộ lọc" }).click()
    const save = page.getByRole("dialog", { name: "Lưu bộ lọc" })
    await expect(save.getByLabel("Tên bộ lọc")).toHaveValue(`${giatri.content.name} (từ Bộ lọc IQX)`)
    await save.getByRole("button", { name: "Lưu bộ lọc" }).click()
    await expect.poll(() => calls.filter((call) => call.method === "POST" && call.path === "/strategy/filters").length).toBe(1)
    const body = calls.find((call) => call.method === "POST" && call.path === "/strategy/filters")!.body as { definition: { origin?: unknown } }
    expect(body.definition.origin).toEqual({ type: "iqx_filter", id: giatri.id, version: 1 })
  })

  test("§7.4 item 23/24 (UI người dùng): mục bị ẩn biến mất, thứ tự mới hiện ngay ở tab IQX", async ({ page }) => {
    const list = { filter: [...IQX_FILTERS], strategy: [...IQX_STRATEGIES] }
    await member(page, { premium: true, iqx: list })
    await desktop(page)
    await openFilter(page)
    await filterLibrary(page).getByRole("tab", { name: "IQX" }).click()
    await expect(filterLibrary(page).getByRole("button", { name: /^Dùng / })).toHaveCount(6)
    // The admin hid "Giá trị" and moved CANSLIM first.
    list.filter = [IQX_FILTERS[3]!, ...IQX_FILTERS.filter((_, index) => index !== 0 && index !== 3)]
    await page.reload()
    await filterLibrary(page).getByRole("tab", { name: "IQX" }).click()
    const names = await filterLibrary(page).getByRole("button", { name: /^Dùng / }).evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")))
    expect(names).toEqual(list.filter.map((item) => `Dùng ${item.content.name}`))
    expect(names).not.toContain(`Dùng ${IQX_FILTERS[0]!.content.name}`)
  })
})

test.describe("Tab IQX · Backtest", () => {
  // Superseded by Bot và Chiến lược v2.0 (update 22-11): tab Backtest is basket-based, Chiến lược IQX are read only
  // (no Dùng), the pair line and per-symbol links are gone. Covered by e2e/update-2211-backtest.spec.ts.
  test.skip("§7.2 item 9, 10, 12, 14 và §7.3 item 15: 2 tab, Dùng điền thẻ thật, không đổi mã/ngày/vốn/Bot, Về cấu hình đã lưu, Mua và giữ", async ({ page }) => {
    const calls: NonNullable<MemberOptions["calls"]> = []
    await member(page, { premium: true, calls })
    await desktop(page)
    await openBacktest(page)
    const library = backtestLibrary(page)
    // 9
    await expect(library.getByRole("tab")).toHaveText(["IQX", /^Chỉ báo/])
    await expect(library.getByRole("tab", { name: /^Chỉ báo/ })).toHaveAttribute("aria-selected", "true")
    await expect(library.getByPlaceholder(/Tìm chỉ báo/)).toBeVisible()
    await library.getByRole("tab", { name: "IQX" }).click()
    await expect(library.getByPlaceholder(/Tìm chỉ báo/)).toHaveCount(0)
    await expect(library.getByRole("button", { name: /^Dùng / })).toHaveCount(5)
    await expect(page.getByTestId("iqx-footer")).toHaveText("Chiến lược dựng sẵn bởi IQX. Bấm Dùng để điền sẵn các thẻ chỉ báo vào Điều kiện Mua và Bán của bản nháp. Bot không đổi.")
    await shot(page, "IQX-9-backtest-tab-iqx-1440")

    // 12: remember Cổ phiếu, ngày, vốn.
    const info = page.getByRole("region", { name: "Thông tin kiểm thử" })
    const before = await info.innerText()

    // 10: Hồi phục quá bán = Bollinger + RSI to buy, RSI to sell, Giữ tối đa 10.
    const item = IQX_STRATEGIES.find((entry) => entry.slug === "hoiphuc")!
    await library.getByRole("button", { name: `Dùng ${item.content.name}` }).click()
    await expect(page.getByTestId("iqx-strategy-strip")).toContainText(`Bản nháp bắt đầu từ Chiến lược IQX · ${item.content.name}.`)
    await expect(page.getByTestId("draft-badge")).toHaveText("Bản nháp · chưa lưu cho Bot")
    await expect(page.getByLabel("Giữ tối đa (phiên)")).toHaveValue("10")
    const buy = page.getByRole("region", { name: "Điều kiện Mua" })
    const sell = page.getByRole("region", { name: "Điều kiện Bán" })
    await expect(buy).toContainText("Bollinger Bands")
    await expect(buy).toContainText("RSI")
    await expect(buy).not.toContainText("MACD")
    await expect(sell).toContainText("RSI")
    await expect(sell).not.toContainText("Bollinger")
    await shot(page, "IQX-10-backtest-dung-hoi-phuc-1440")
    await buy.getByRole("button", { name: /^Chỉnh/ }).first().click()
    const edit = page.getByRole("dialog")
    await expect(edit).toBeVisible()
    await expect(edit.getByRole("switch").first()).toBeVisible()
    await shot(page, "IQX-10-backtest-chinh-1440")
    await page.keyboard.press("Escape")
    await expect(edit).toHaveCount(0)

    // 12
    expect(await info.innerText()).toBe(before)
    expect(calls.filter((call) => call.method === "PATCH" && call.path === "/strategy/shared-config")).toEqual([])

    // 15: every new run shows "Mua và giữ FPT" next to the profit, with its line.
    await page.getByRole("button", { name: "Chạy backtest" }).click()
    const results = page.getByTestId("backtest-results")
    await expect(results).toBeVisible()
    const kpis = results.getByRole("group", { name: "Sáu chỉ số kết quả" })
    await expect(kpis).toContainText("Mua và giữ FPT")
    await expect(kpis).not.toContainText("Lần chạy cũ chưa có số liệu này")
    await expect(results.getByText("Mua và giữ FPT").nth(1)).toBeVisible()
    await results.scrollIntoViewIfNeeded()
    await shot(page, "IQX-15-backtest-mua-va-giu-1440")
    expect(calls.filter((call) => call.method === "PATCH" && call.path === "/strategy/shared-config")).toEqual([])

    // 14: back to the saved config: the draft and the strip are gone.
    await page.getByRole("button", { name: "Về cấu hình đã lưu" }).click()
    await page.getByRole("dialog", { name: "Về cấu hình đã lưu?" }).getByRole("button", { name: "Về cấu hình đã lưu" }).click()
    await expect(page.getByTestId("draft-badge")).toHaveCount(0)
    await expect(page.getByTestId("iqx-strategy-strip")).toHaveCount(0)
  })

  // Superseded by Bot và Chiến lược v2.0 (update 22-11): tab Backtest is basket-based, Chiến lược IQX are read only
  // (no Dùng), the pair line and per-symbol links are gone. Covered by e2e/update-2211-backtest.spec.ts.
  test.skip("§7.3 item 17: kết quả cũ chưa có Mua và giữ hiện —, không vẽ đường", async ({ page }) => {
    await member(page, { premium: true })
    await desktop(page)
    await openBacktest(page)
    // The next run comes back like a run stored before update 19-11 (no buy_and_hold in its snapshot).
    await page.evaluate(() => {
      const w = window as unknown as { __iqxWorld: { override: Record<string, () => unknown> }; __iqxRunResponse: (options: object) => unknown }
      w.__iqxWorld.override["POST /strategy/backtests"] = () => w.__iqxRunResponse({ buyHold: false, symbol: "FPT" })
    })
    await page.getByRole("button", { name: "Chạy backtest" }).click()
    const results = page.getByTestId("backtest-results")
    const kpis = results.getByRole("group", { name: "Sáu chỉ số kết quả" })
    await expect(kpis).toContainText("Mua và giữ FPT")
    await expect(kpis).toContainText("—")
    await expect(kpis).toContainText("Lần chạy cũ chưa có số liệu này")
    await shot(page, "IQX-17-backtest-ket-qua-cu-1440")
  })
})

test.describe("Tab IQX · Quản trị", () => {
  const ROWS = IQX_FILTERS.slice(0, 2).map((item, index) => ({
    id: item.id, kind: "filter", slug: item.slug, sort_order: index + 1, visibility: "shown", status: "shown", current_version: 1,
    name: item.content.name, idea: item.content.idea, has_draft: index === 1, draft_updated_at: null, updated_at: "2026-11-19T03:00:00.000Z",
    updated_by: { id: "admin-1", name: "Quản trị IQX" }, used_30d: 4,
  }))

  async function mockAdmin(page: Page, hides: unknown[]) {
    await page.route("**/api/v2/admin/iqx-templates**", async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith("/hide") || url.pathname.endsWith("/show")) {
        hides.push(route.request().postDataJSON())
        return json(route, { ...ROWS[0], status: "hidden", visibility: "hidden" })
      }
      return json(route, { items: url.searchParams.get("kind") === "strategy" ? [] : ROWS })
    })
  }

  test("§7.4 item 23 (UI quản trị): Ẩn bắt buộc lý do, mục đã xuất bản không có nút xóa; item 19 hiện Có bản nháp", async ({ page }) => {
    const hides: unknown[] = []
    await member(page, { premium: true, role: "admin" })
    await mockAdmin(page, hides)
    await desktop(page)
    await page.goto("/admin/iqx-templates")
    const row = page.getByRole("row", { name: new RegExp(ROWS[0]!.name) })
    await expect(row).toBeVisible()
    await expect(page.getByRole("row", { name: new RegExp(ROWS[1]!.name) })).toContainText("Có bản nháp")
    await expect(row.getByRole("button", { name: /Xóa/ })).toHaveCount(0)
    await row.getByRole("button", { name: "Ẩn" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(`Ẩn Bộ lọc IQX · ${ROWS[0]!.name}?`)
    const submit = dialog.getByRole("button", { name: "Ẩn", exact: true })
    await expect(submit).toBeDisabled()
    expect(hides).toEqual([])
    await dialog.getByLabel(/Lý do/).fill("Tạm ẩn để rà lại điều kiện")
    await submit.click()
    await expect.poll(() => hides.length).toBe(1)
    expect(JSON.stringify(hides[0])).toContain("Tạm ẩn để rà lại điều kiện")
    await shot(page, "IQX-23-admin-mau-iqx-1440")
  })

  test("§7.5 item 29 (quản trị) 390px: trang Mẫu IQX dùng được, không cuộn ngang cả trang", async ({ page }) => {
    await member(page, { premium: true, role: "admin" })
    await mockAdmin(page, [])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/admin/iqx-templates")
    await expect(page.getByRole("heading", { name: "Mẫu IQX" })).toBeVisible()
    await expect(page.getByText(ROWS[0]!.name).first()).toBeVisible()
    expect(await overflows(page)).toBe(false)
    await shot(page, "IQX-29-admin-390")
  })
})

test.describe("Tab IQX · 390px (§7.5 item 29)", () => {
  test.beforeEach(async ({ page }) => {
    await member(page, { premium: true })
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test("Bộ lọc 390px: tab IQX trong ngăn kéo Thư viện, Dùng điền được, không cuộn ngang", async ({ page }) => {
    await openFilter(page)
    expect(await overflows(page)).toBe(false)
    await page.getByRole("button", { name: "Thư viện" }).click()
    const sheet = page.getByRole("dialog", { name: "Thư viện chỉ tiêu" })
    await sheet.getByRole("tab", { name: "IQX" }).click()
    await expect(sheet.getByRole("button", { name: /^Dùng / })).toHaveCount(6)
    await shot(page, "IQX-29-bo-loc-390-ngan-keo")
    await sheet.getByRole("button", { name: `Dùng ${IQX_FILTERS[5]!.content.name}` }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("iqx-filter-strip")).toBeVisible()
    expect(await overflows(page)).toBe(false)
    await shot(page, "IQX-29-bo-loc-390-sau-dung")
  })

  // Superseded by Bot và Chiến lược v2.0 (update 22-11): tab Backtest is basket-based, Chiến lược IQX are read only
  // (no Dùng), the pair line and per-symbol links are gone. Covered by e2e/update-2211-backtest.spec.ts.
  test.skip("Backtest 390px: tab IQX trong ngăn kéo Chỉ báo, Dùng điền được, không cuộn ngang", async ({ page }) => {
    await openBacktest(page)
    expect(await overflows(page)).toBe(false)
    await page.getByRole("button", { name: "Chỉ báo", exact: true }).click()
    const sheet = page.getByRole("dialog", { name: "Thư viện chỉ báo" })
    await sheet.getByRole("tab", { name: "IQX" }).click()
    await expect(sheet.getByRole("button", { name: /^Dùng / })).toHaveCount(5)
    await shot(page, "IQX-29-backtest-390-ngan-keo")
    await sheet.getByRole("button", { name: `Dùng ${IQX_STRATEGIES[0]!.content.name}` }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("iqx-strategy-strip")).toBeVisible()
    expect(await overflows(page)).toBe(false)
    await shot(page, "IQX-29-backtest-390-sau-dung")
  })
})


/* ═══════════════════════ Tab IQX §7 items 5, 7, 8, 21 ═══════════════════════ */

type Calls = NonNullable<MemberOptions["calls"]>
type Definition = Record<string, unknown>

const runBodies = (calls: Calls) => calls.filter((call) => call.method === "POST" && call.path === "/strategy/screener/run").map((call) => call.body as Definition)
/** A definition without `origin` (the only field allowed to differ from a filter built by hand). */
const withoutOrigin = (definition: Definition) => {
  const { origin: _origin, ...rest } = definition
  void _origin
  return rest
}

async function runFilter(page: Page, calls: Calls) {
  const before = runBodies(calls).length
  await page.getByRole("button", { name: "Chạy bộ lọc" }).click()
  await expect.poll(() => runBodies(calls).length).toBe(before + 1)
  return runBodies(calls).at(-1)!
}

async function useIqxFilter(page: Page, name: string) {
  const library = filterLibrary(page)
  await library.getByRole("tab", { name: "IQX" }).click()
  await library.getByRole("button", { name: `Dùng ${name}` }).click()
  await expect(page.getByTestId("iqx-filter-strip")).toContainText(name)
}

/** Sets one field of a technical card (input or select) by its accessible name. */
async function setField(page: Page, label: string, value: string) {
  const field = page.getByRole("region", { name: "Kỹ thuật" }).getByLabel(label, { exact: true })
  if ((await field.evaluate((element) => element.tagName)) === "SELECT") await field.selectOption(value)
  else await field.fill(value)
}

async function setSwitch(page: Page, name: string, on: boolean) {
  const control = page.getByRole("region", { name: "Kỹ thuật" }).getByRole("switch", { name })
  if ((await control.getAttribute("aria-checked")) !== String(on)) await control.click()
  await expect(control).toHaveAttribute("aria-checked", String(on))
}

/** Thị trường of the two technical Bộ lọc IQX: basket VN100, GTGD TB20 ≥ {min} tỷ. */
async function setMarket(page: Page, avgMin: string) {
  const market = page.getByRole("region", { name: "Thị trường" })
  await market.getByRole("group", { name: "Rổ chỉ số" }).getByRole("button", { name: "VN100" }).click()
  await market.getByLabel("Giá trị giao dịch bình quân tối thiểu (tỷ đồng)").fill(avgMin)
}

async function addTechnical(page: Page, name: string) {
  const library = filterLibrary(page)
  await library.getByRole("tab", { name: "Kỹ thuật" }).click()
  await library.getByRole("button", { name: `Thêm ${name} vào điều kiện kỹ thuật` }).click()
}

/** §2.4 by hand: the same items and values as the seed of each Bộ lọc IQX, entered in the form like a user would. */
const BY_HAND: Record<string, (page: Page) => Promise<void>> = {
  hoiphuc: async (page) => {
    await setMarket(page, "5")
    await addTechnical(page, "Bollinger Bands")
    await addTechnical(page, "RSI")
    await addTechnical(page, "Khối lượng")
    await setField(page, "Hành động giá với Bollinger (dòng 1, Bollinger Bands)", "reenter_lower")
    await setField(page, "Chu kỳ Bollinger (dòng 1, Bollinger Bands)", "20")
    await setField(page, "Hệ số độ lệch chuẩn (dòng 1, Bollinger Bands)", "2")
    await setSwitch(page, "Bật dòng 1 của Bollinger Bands", true)
    await setField(page, "Biến động giá (dòng 2, Bollinger Bands)", "up")
    await setSwitch(page, "Bật dòng 2 của Bollinger Bands", false)
    await setField(page, "Biến động độ rộng dải (dòng 3, Bollinger Bands)", "narrow")
    await setSwitch(page, "Bật dòng 3 của Bollinger Bands", false)
    await setField(page, "Chu kỳ RSI (dòng 1, RSI)", "14")
    await setField(page, "Dấu so sánh (dòng 1, RSI)", "<")
    await setField(page, "Ngưỡng RSI (dòng 1, RSI)", "35")
    await setSwitch(page, "Bật dòng 2 của RSI", false)
    await setField(page, "Số phiên tham chiếu", "20")
    await setField(page, "Hệ số khối lượng", "1,1")
  },
  phadinh: async (page) => {
    await setMarket(page, "10")
    await addTechnical(page, "Donchian Channel")
    await addTechnical(page, "OBV")
    await addTechnical(page, "Bollinger Bands")
    await setSwitch(page, "Bật dòng 1 của Bollinger Bands", false)
    await setField(page, "Biến động giá (dòng 2, Bollinger Bands)", "up")
    await setSwitch(page, "Bật dòng 2 của Bollinger Bands", false)
    await setField(page, "Biến động độ rộng dải (dòng 3, Bollinger Bands)", "widen")
    await setSwitch(page, "Bật dòng 3 của Bollinger Bands", true)
  },
}

/** Every field of the technical region, for a readable diff when a template cannot be matched by hand. */
const technicalFields = (page: Page) =>
  page.getByRole("region", { name: "Kỹ thuật" }).locator("input, select, [role=switch]").evaluateAll((elements) =>
    elements.map((element) => `${element.getAttribute("aria-label") ?? (element.id ? document.querySelector(`label[for="${element.id}"]`)?.textContent : "")} = ${element.getAttribute("role") === "switch" ? element.getAttribute("aria-checked") : (element as HTMLInputElement).value}`),
  )

test.describe("Tab IQX · §7.1 item 5, 7, 8 và §7.4 item 21", () => {
  for (const slug of ["hoiphuc", "phadinh"]) {
    const item = IQX_FILTERS.find((entry) => entry.slug === slug)!
    test(`§7.1 item 5: ${item.content.name} — lệnh chạy sau Dùng giống hệt bộ lọc tự dựng tay (trừ origin)`, async ({ page, context }) => {
      const calls: Calls = []
      await member(page, { premium: true, calls })
      await desktop(page)
      await openFilter(page)
      await useIqxFilter(page, item.content.name)
      const fromIqx = await runFilter(page, calls)
      // The run sends the criteria only; `origin` travels with a save (checked in item 6).

      // A fresh tab (no draft): the same filter entered by hand.
      const manual = await context.newPage()
      const manualCalls: Calls = []
      await member(manual, { premium: true, calls: manualCalls })
      await desktop(manual)
      await openFilter(manual)
      await BY_HAND[slug]!(manual)
      const byHand = await runFilter(manual, manualCalls)
      expect(byHand.origin).toBeUndefined()
      // The name of an unsaved form is the same on both sides ("Bộ lọc chưa lưu").
      expect(withoutOrigin(fromIqx), (await technicalFields(manual)).join("\n")).toEqual(withoutOrigin(byHand))
      await manual.close()
    })
  }

  // Superseded by Bot và Chiến lược v2.0 (update 22-11): tab Backtest is basket-based, Chiến lược IQX are read only
  // (no Dùng), the pair line and per-symbol links are gone. Covered by e2e/update-2211-backtest.spec.ts.
  test.skip("§7.1 item 7: bấm mã trong kết quả có dải IQX mở Backtest mã đó với Chiến lược IQX đi cặp; hỏi khi bản nháp khác", async ({ page }) => {
    const calls: Calls = []
    await member(page, { premium: true, calls })
    await desktop(page)
    const filter = IQX_FILTERS.find((entry) => entry.slug === "hoiphuc")!
    const pair = IQX_STRATEGIES.find((entry) => entry.id === filter.pair!.id)!
    const other = IQX_STRATEGIES.find((entry) => entry.slug === "macd")!

    // A Backtest draft that differs from the pair.
    await openBacktest(page)
    await backtestLibrary(page).getByRole("tab", { name: "IQX" }).click()
    await backtestLibrary(page).getByRole("button", { name: `Dùng ${other.content.name}` }).click()
    await expect(page.getByTestId("iqx-strategy-strip")).toContainText(other.content.name)

    // Bộ lọc tab (the Backtest draft stays mounted): Dùng, Chạy, the strip says "Đi cặp với".
    await page.getByRole("tab", { name: "Bộ lọc" }).click()
    await expect(page.getByRole("region", { name: "Cơ bản" })).toBeVisible()
    await useIqxFilter(page, filter.content.name)
    await page.getByTestId("iqx-filter-strip").getByRole("button", { name: "Xem thêm" }).click()
    await expect(page.getByTestId("iqx-filter-strip")).toContainText(`Đi cặp với`)
    await expect(page.getByTestId("iqx-filter-strip")).toContainText(pair.content.name)
    await runFilter(page, calls)
    const link = page.locator(`a[href*="iqx=${pair.id}"]`).first()
    await expect(link).toBeVisible()
    const href = (await link.getAttribute("href"))!
    const symbol = new URL(href, "http://x").searchParams.get("symbol")!
    expect(href).toContain("tab=backtest")
    await shot(page, "IQX-7-bo-loc-ket-qua-dai-iqx-1440")
    await link.click()

    // The draft differs: confirm first; Hủy keeps it, then the link again and confirm replaces it.
    const confirm = page.getByRole("dialog", { name: "Thay bản nháp đang chỉnh?" })
    await expect(confirm).toBeVisible()
    await shot(page, "IQX-7-backtest-xac-nhan-1440")
    await confirm.getByRole("button", { name: "Hủy" }).click()
    await expect(page.getByTestId("iqx-strategy-strip")).toContainText(other.content.name)
    await page.getByRole("tab", { name: "Bộ lọc" }).click()
    await page.locator(`a[href*="iqx=${pair.id}"]`).first().click()
    await page.getByRole("dialog", { name: "Thay bản nháp đang chỉnh?" }).getByRole("button", { name: "Thay bằng chiến lược IQX" }).click()
    await expect(page.getByTestId("iqx-strategy-strip")).toContainText(pair.content.name)
    await expect(page.getByLabel("Giữ tối đa (phiên)")).toHaveValue(String((pair.content as { max_holding?: number }).max_holding ?? 10))
    await expect(page).toHaveURL(new RegExp(`tab=backtest.*symbol=${symbol}`))
    await expect(page).not.toHaveURL(/iqx=/)
    await expect(page.getByRole("region", { name: "Thông tin kiểm thử" })).toContainText(symbol)
    await shot(page, "IQX-7-backtest-di-cap-1440")
  })

  // Superseded by Bot và Chiến lược v2.0 (update 22-11): tab Backtest is basket-based, Chiến lược IQX are read only
  // (no Dùng), the pair line and per-symbol links are gone. Covered by e2e/update-2211-backtest.spec.ts.
  test.skip("§7.1 item 7: không có bản nháp thì bấm mã điền ngay Chiến lược IQX đi cặp, không hỏi", async ({ page }) => {
    const calls: Calls = []
    await member(page, { premium: true, calls })
    await desktop(page)
    const filter = IQX_FILTERS.find((entry) => entry.slug === "phadinh")!
    const pair = IQX_STRATEGIES.find((entry) => entry.id === filter.pair!.id)!
    await openFilter(page)
    await useIqxFilter(page, filter.content.name)
    await runFilter(page, calls)
    await page.locator(`a[href*="iqx=${pair.id}"]`).first().click()
    await expect(page.getByTestId("iqx-strategy-strip")).toContainText(pair.content.name)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByTestId("draft-badge")).toBeVisible()
  })

  test("§7.1 item 8: tab IQX, thẻ, dải và chân thư viện không có chữ nào về học bài, khóa, Học viện", async ({ page }) => {
    const calls: Calls = []
    await member(page, { premium: true, calls })
    await desktop(page)
    // "Tham khảo để học, không phải khuyến nghị (đầu tư)." is the disclaimer the spec requires (§0.4), not a lesson.
    const lessonText = (text: string) => text.replace(/Tham khảo để học, không phải khuyến nghị( đầu tư)?\./g, "").match(/bài học|\bhọc\b|khóa|khoá|Học viện/gi)
    const check = async (where: string, locator: ReturnType<Page["locator"]>) => {
      // Never a vacuous pass: the region is there and has text.
      await expect(locator.first(), where).toBeVisible()
      expect((await locator.allInnerTexts()).join(" ").length, where).toBeGreaterThan(40)
      for (const text of await locator.allInnerTexts()) expect(lessonText(text), `${where}: ${text}`).toBeNull()
      for (const label of await locator.locator("[aria-label], [title]").evaluateAll((elements) => elements.map((element) => `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`)))
        expect(lessonText(label), `${where} (nhãn): ${label}`).toBeNull()
    }

    await openFilter(page)
    await filterLibrary(page).getByRole("tab", { name: "IQX" }).click()
    // Expand every card (Nguồn gốc, Khi nào dễ sai…) before reading.
    for (const toggle of await filterLibrary(page).locator('[aria-expanded="false"]').all()) await toggle.click().catch(() => undefined)
    await check("Bộ lọc · tab IQX", filterLibrary(page).getByRole("tabpanel"))
    await useIqxFilter(page, IQX_FILTERS[5]!.content.name)
    await check("Bộ lọc · dải IQX", page.getByTestId("iqx-filter-strip"))
    await runFilter(page, calls)
    await check("Bộ lọc · dải IQX sau khi chạy", page.getByTestId("iqx-filter-strip"))

    await page.getByRole("tab", { name: "Backtest" }).click()
    await expect(page.getByRole("heading", { name: "Điều kiện Mua" })).toBeVisible()
    await backtestLibrary(page).getByRole("tab", { name: "IQX" }).click()
    // v2.0 (update 22-11): a Chiến lược IQX card is selected by a click, read only, no Dùng.
    await check("Backtest · tab IQX", backtestLibrary(page).getByTestId(`iqx-strategy-${IQX_STRATEGIES[0]!.slug}`))
    await backtestLibrary(page).getByTestId(`iqx-strategy-${IQX_STRATEGIES[0]!.slug}`).click()
    await check("Backtest · dải IQX", page.getByTestId("iqx-strategy-strip"))
    await shot(page, "IQX-8-backtest-tab-iqx-mo-rong-1440")
  })

  test("§7.4 item 21: quản trị viên soạn và xuất bản bằng đúng form, người dùng bấm Dùng ra đúng định nghĩa đã xuất bản", async ({ page, context }) => {
    const NEW_ID = "c0000000-0000-4000-8000-000000000099"
    const list = { filter: [...IQX_FILTERS], strategy: [...IQX_STRATEGIES] }
    const published: { content?: Record<string, unknown> & { definition: Definition } } = {}
    const adminCalls: Calls = []
    await member(page, { premium: true, role: "admin", calls: adminCalls })
    const detail = (content: Record<string, unknown>, version: number | null) => ({
      id: NEW_ID, kind: "filter", slug: "thu-nghiem", sort_order: 7, visibility: "shown", status: version === null ? "unpublished" : "shown", current_version: version,
      name: content.name, idea: content.idea, has_draft: version === null, draft_updated_at: version === null ? "2026-11-20T01:00:00.000Z" : null,
      updated_at: "2026-11-20T01:00:00.000Z", updated_by: { id: "member-1", name: "Quản trị IQX" }, used_30d: 0,
      draft: version === null ? content : null, draft_updated_by: null,
      current: version === null ? null : { version, content, published_at: "2026-11-20T01:00:00.000Z", published_by: { id: "member-1", name: "Quản trị IQX" }, reason: "Ra mắt" },
      versions: [], history: [],
    })
    await page.route("**/api/v2/admin/iqx-templates**", async (route) => {
      const url = new URL(route.request().url())
      const method = route.request().method()
      const body = route.request().postDataJSON() as Record<string, unknown> | null
      adminCalls.push({ method, path: url.pathname.replace(/^.*\/api\/v2/, ""), body })
      if (method === "POST" && url.pathname.endsWith("/admin/iqx-templates")) return json(route, detail(body!.draft as Record<string, unknown>, null))
      if (method === "POST" && url.pathname.endsWith("/publish")) {
        published.content = structuredClone(body!.content) as typeof published.content
        list.filter = [...list.filter, { id: NEW_ID, kind: "filter", slug: "thu-nghiem", version: 1, content: published.content as never, pair: null }]
        return json(route, detail(published.content!, 1))
      }
      if (method === "GET" && url.pathname.endsWith("/admin/iqx-templates")) return json(route, { kind: url.searchParams.get("kind"), items: [] })
      return json(route, detail({ name: "Thử nghiệm" }, null))
    })
    await desktop(page)
    await page.goto("/admin/iqx-templates/filter/new")
    await expect(page.getByRole("heading", { name: /^Soạn Bộ lọc IQX/ })).toBeVisible()
    await page.getByLabel("Tên", { exact: true }).fill("Thử nghiệm RSI thấp")
    await page.getByLabel(/Ý tưởng/).fill("Cổ phiếu VN30 có RSI thấp và khối lượng tăng.")
    await page.getByLabel(/Nguồn gốc/).fill("Kinh nghiệm giao dịch đảo chiều.")
    await page.getByLabel(/Khi nào dễ sai/).fill("Khi thị trường giảm kéo dài.")
    // The form of the Bộ lọc tab in compose mode.
    await page.getByRole("region", { name: "Thị trường" }).getByRole("group", { name: "Rổ chỉ số" }).getByRole("button", { name: "VN30" }).click()
    await addTechnical(page, "RSI")
    await addTechnical(page, "Khối lượng")
    await setField(page, "Ngưỡng RSI (dòng 1, RSI)", "32")
    await setSwitch(page, "Bật dòng 2 của RSI", false)
    await setField(page, "Hệ số khối lượng", "1,5")
    await shot(page, "IQX-21-admin-soan-1440")
    await page.getByRole("button", { name: "Xuất bản…" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Lý do thay đổi").fill("Ra mắt mục thử nghiệm")
    await dialog.getByRole("button", { name: "Xuất bản", exact: true }).click()
    await expect.poll(() => published.content?.definition ?? null).not.toBeNull()
    const adminDefinition = published.content!.definition
    expect(adminDefinition.origin).toBeUndefined()
    expect(adminDefinition.technical).toEqual([
      { indicator: "rsi", rules: [{ id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 32 }, { id: "rsi.trend", enabled: false, period: 14, dir: "up" }] },
      { indicator: "volume", sessions: 20, factor: 1.5, ops: [">", ">"] },
    ])
    expect((adminDefinition.market as { baskets: string[] }).baskets).toEqual(["VN30"])

    // A user: Dùng the new item, run, save.
    const user = await context.newPage()
    const userCalls: Calls = []
    await member(user, { premium: true, iqx: list, calls: userCalls })
    await desktop(user)
    await openFilter(user)
    await useIqxFilter(user, "Thử nghiệm RSI thấp")
    const run = await runFilter(user, userCalls)
    const { name: _runName, ...runRest } = withoutOrigin(run)
    const { name: _adminName, ...adminRest } = adminDefinition
    void _runName
    void _adminName
    expect(runRest).toEqual(adminRest)
    // Saved, the user's filter keeps the published definition with its origin.
    await user.getByRole("button", { name: "Lưu bộ lọc" }).click()
    const save = user.getByRole("dialog", { name: "Lưu bộ lọc" })
    await expect(save.getByLabel("Tên bộ lọc")).toHaveValue("Thử nghiệm RSI thấp (từ Bộ lọc IQX)")
    await save.getByRole("button", { name: "Lưu bộ lọc" }).click()
    await expect.poll(() => userCalls.filter((call) => call.method === "POST" && call.path === "/strategy/filters").length).toBe(1)
    const saved = (userCalls.find((call) => call.method === "POST" && call.path === "/strategy/filters")!.body as { definition: Definition }).definition
    expect(saved.origin).toEqual({ type: "iqx_filter", id: NEW_ID, version: 1 })
    const { name: _savedName, ...savedRest } = withoutOrigin(saved)
    void _savedName
    expect(savedRest).toEqual(adminRest)
    await shot(user, "IQX-21-nguoi-dung-dung-1440")
    await user.close()
  })
})
