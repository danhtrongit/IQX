/**
 * Update 22-11 · Bot và Chiến lược v2.0, tab Backtest + Quản trị Mẫu IQX + link from Bộ lọc (frontend-observable,
 * API mocked through the in-page fake of `src/pages/strategy/test-support.ts`):
 * spec `backend/docs/update-22-11/IQX-Bot-Chien-Luoc-SPEC.md` §4, §7.2, §12, §13; S01–S14, V01/V02 (Backtest/admin parts).
 */
import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"
import { IQX_STRATEGIES, mockMember, overflows, type MemberOptions } from "./u1911-support"

test.describe.configure({ timeout: 90_000 })

type Calls = NonNullable<MemberOptions["calls"]>

const library = (page: Page) => page.getByRole("complementary", { name: "Thư viện chỉ báo" })
const posts = (calls: Calls, path: string) => calls.filter((call) => call.method === "POST" && call.path === path)

async function openBacktest(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto("/chien-luoc?tab=backtest")
  await expect(page.getByRole("heading", { name: "Điều kiện Mua" })).toBeVisible()
  await expect(page.getByTestId("run-button")).toBeVisible()
}

async function addSide(page: Page, name: string, side: "Mua" | "Bán") {
  await library(page).getByRole("button", { name: `Thêm ${name} vào ${side}` }).click()
  await page.getByRole("button", { name: "Lưu vào bản nháp" }).click()
}

async function run(page: Page) {
  await expect(page.getByTestId("run-button")).toBeEnabled()
  await page.getByTestId("run-button").click()
  await expect(page.getByTestId("backtest-results")).toBeVisible()
}

test.describe("Backtest v2.0 · tab Chỉ báo", () => {
  test("S01 S02 S03: chiến lược mới rổ VN30 giữ 30, vốn khóa, Chạy chờ dòng Mua, kết quả 7 chỉ số và các dòng pháp lý", async ({ page }) => {
    const calls: Calls = []
    await mockMember(page, { premium: true, calls })
    await openBacktest(page)
    await expect(page.getByTestId("strategy-picker")).toContainText("Chiến lược mới")
    await expect(page.getByLabel("Rổ mã", { exact: true })).toHaveValue("vn30")
    await expect(page.getByLabel("Giữ tối đa")).toHaveValue("30")
    await expect(page.getByLabel("Vốn ban đầu (VND)")).toBeDisabled()
    await expect(page.getByTestId("run-button")).toBeDisabled()
    await expect(page.getByTestId("run-hint")).toHaveText("Cần ít nhất một dòng Mua đang bật để chạy.")

    await addSide(page, "MACD", "Mua")
    await addSide(page, "MACD", "Bán")
    await run(page)
    const body = posts(calls, "/strategy/backtests").at(-1)!.body as { strategy: { source: string; content: { universe: unknown; max_holding: number } } }
    expect(body.strategy.source).toBe("draft")
    expect(body.strategy.content).toMatchObject({ universe: { type: "vn30" }, max_holding: 30 })
    const results = page.getByTestId("backtest-results")
    await expect(results.getByTestId("kpi")).toHaveCount(7)
    await expect(results.getByRole("tab")).toHaveCount(5)
    await expect(results.getByTestId("past-results")).toHaveText("Kết quả quá khứ không bảo đảm kết quả tương lai.")
    await results.getByRole("tab", { name: "Giả định" }).click()
    await expect(results.getByText("Giả định khớp đúng giá đóng cửa; thực tế có thể khác.")).toBeVisible()

    // S04: an edit after the run marks the result stale and locks Lưu.
    await page.getByLabel("Giữ tối đa").fill("45")
    await expect(page.getByTestId("stale-label")).toHaveText(/Cấu hình đã đổi sau lần chạy này · cần chạy lại/)
    await page.getByTestId("save-menu-trigger").click()
    await expect(page.getByTestId("save-new")).toHaveAttribute("aria-disabled", "true")
    await page.keyboard.press("Escape")
  })

  test("S05 S06: Lưu thành chiến lược mới sau khi chạy, rồi Lịch sử bản có bản đầu tiên", async ({ page }) => {
    const calls: Calls = []
    await mockMember(page, { premium: true, calls })
    await openBacktest(page)
    await addSide(page, "MACD", "Mua")
    await run(page)
    await page.getByTestId("save-menu-trigger").click()
    await page.getByTestId("save-new").click()
    await page.getByLabel("Tên chiến lược (tối đa 40 ký tự)").fill("Xu hướng của tôi")
    await page.getByRole("button", { name: "Lưu", exact: true }).click()
    await expect(page.getByTestId("strategy-picker")).toContainText("Xu hướng của tôi")
    const saved = posts(calls, "/strategy/strategies")[0]!.body as { from_run_id: string; name: string }
    expect(saved.name).toBe("Xu hướng của tôi")
    expect(saved.from_run_id).toBeTruthy()

    await page.getByRole("button", { name: "Lịch sử bản" }).click()
    const history = page.getByRole("dialog", { name: /Lịch sử bản/ })
    await expect(history.getByTestId("version-1")).toContainText("mới nhất")
    await page.keyboard.press("Escape")

    await page.getByTestId("strategy-picker").click()
    await expect(page.getByTestId("strategy-menu")).toContainText("Chiến lược đã lưu (1/20)")
  })
})

test.describe("Backtest v2.0 · tab IQX", () => {
  test("S07: chiến lược IQX chỉ xem, chạy thử theo tham chiếu, có dòng tham khảo", async ({ page }) => {
    const calls: Calls = []
    await mockMember(page, { premium: true, calls })
    await openBacktest(page)
    await library(page).getByRole("tab", { name: "IQX" }).click()
    await library(page).getByTestId(`iqx-strategy-${IQX_STRATEGIES[1]!.slug}`).click()
    await expect(page.getByTestId("iqx-strategy-strip")).toBeVisible()
    await expect(page.getByLabel("Giữ tối đa")).toBeDisabled()
    await expect(page.getByTestId("save-menu-trigger")).toHaveCount(0)
    await run(page)
    const body = posts(calls, "/strategy/backtests").at(-1)!.body as { strategy: { source: string; id: string } }
    expect(body.strategy).toMatchObject({ source: "iqx", id: IQX_STRATEGIES[1]!.id })
    await expect(page.getByText("Tham khảo để học, không phải khuyến nghị đầu tư.").first()).toBeVisible()
  })
})

test.describe("Bộ lọc → Backtest (§13)", () => {
  test("S13: Backtest với rổ là kết quả này mở chiến lược mới với các mã VN100 của kết quả, báo mã bị bỏ, không tự chạy", async ({ page }) => {
    const calls: Calls = []
    await mockMember(page, { premium: true, calls })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/chien-luoc?tab=bo-loc")
    await expect(page.getByRole("region", { name: "Cơ bản" })).toBeVisible()
    await page.getByRole("button", { name: "Chạy bộ lọc" }).click()
    const results = page.getByRole("region", { name: "Kết quả sàng lọc" })
    await expect(results).toBeVisible()
    await expect(results.getByRole("button", { name: "Áp dụng cho Bot" })).toHaveCount(0)
    await results.getByRole("button", { name: "Backtest với rổ là kết quả này" }).click()
    await expect(page).toHaveURL(/tab=backtest/)
    await expect(page.getByTestId("universe-line")).toContainText("Kết quả bộ lọc chưa lưu")
    await expect(page.getByTestId("universe-excluded")).toContainText("mã ngoài VN100")
    expect(posts(calls, "/strategy/backtests")).toHaveLength(0)
  })
})

test.describe("Quản trị · Mẫu IQX · soạn Chiến lược IQX (§7.2)", () => {
  test("form tab Chỉ báo với Rổ VN30/VN100 và Giữ tối đa, không có Lưu ▾, chiến lược đã lưu, lần chạy đã lưu", async ({ page }) => {
    await mockMember(page, { premium: true, role: "admin" })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/admin/iqx-templates/strategy/new")
    await expect(page.getByTestId("compose-note")).toBeVisible()
    const basket = page.getByLabel("Rổ mã", { exact: true })
    await expect(basket.locator("option")).toHaveText([/^VN30/, /^VN100/])
    await expect(page.getByLabel("Giữ tối đa")).toHaveValue("30")
    await expect(page.getByTestId("save-menu-trigger")).toHaveCount(0)
    await expect(page.getByTestId("strategy-picker")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Lần chạy đã lưu" })).toHaveCount(0)
  })
})

test.describe("V01 390px", () => {
  test("Backtest 390px: không cuộn ngang trước và sau khi chạy, đổi IQX/Chỉ báo được ở thanh trên", async ({ page }) => {
    await mockMember(page, { premium: true })
    await openBacktest(page, 390)
    expect(await overflows(page)).toBe(false)
    await page.getByRole("tablist", { name: "Loại chiến lược" }).first().getByRole("tab", { name: "IQX" }).click()
    await expect(page.getByTestId("iqx-strategy-strip")).toBeVisible()
    await run(page)
    expect(await overflows(page)).toBe(false)
  })
})
