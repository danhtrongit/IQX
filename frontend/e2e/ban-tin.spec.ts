/**
 * Phân tích thị trường: Bản tin cuối phiên (PDF.js), Theo dõi và Bản tin cũ. API được giả lập nhưng
 * file PDF là file thật do bộ vẽ của máy chủ dựng (e2e/fixtures/ban-tin), nên kiểm được lớp chữ,
 * lớp liên kết, trang dựng dần và việc đổi giữa bản máy tính và bản điện thoại khi cửa sổ vượt 900 px.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { Page, Route } from "@playwright/test"

import { expect, test } from "./fixtures"

const here = path.dirname(fileURLToPath(import.meta.url))
const pdf = (name: string) => readFileSync(path.join(here, "fixtures", "ban-tin", name))

const DATE = "2026-11-06"
const OLDER = "2026-11-05"
const SHOTS = process.env.E2E_SHOTS_DIR

function bulletin(date: string, revision = 1, updatedAt: string | null = null) {
  const base = `/api/v2/market/bulletins/${date}/files`
  return {
    trade_date: date,
    published_at: `${date}T09:30:00.000Z`,
    updated_at: updatedAt,
    revision,
    summary: { close: 1755.61, change: -10.4, change_pct: -0.59, pick_count: 24, slot_counts: [10, 8, 6] },
    files: [
      { variant: "desktop", revision, file_name: `IQX-Ban-Tin-${date}.pdf`, byte_size: 70468, page_count: 2, page_width: 1123, page_height: 794, url: `${base}/desktop/${revision}`, download_url: `${base}/desktop/${revision}?download=1` },
      { variant: "mobile", revision, file_name: `IQX-Ban-Tin-${date}-Dien-Thoai.pdf`, byte_size: 71753, page_count: 5, page_width: 397, page_height: 707, url: `${base}/mobile/${revision}`, download_url: `${base}/mobile/${revision}?download=1` },
    ],
  }
}

const TRACKING = {
  as_of: DATE,
  slot: null,
  summary: { tracking_count: 3, today_count: 1, profit_count: 1, profit_base: 2, average_return: 1.2, index_return: -0.8 },
  items: [
    { symbol: "FPT", slot: 1, first_trade_date: "2026-11-03", entry_price: 100, price: 106, return_pct: 6, sessions: 3, is_today: false },
    { symbol: "HPG", slot: 2, first_trade_date: "2026-11-04", entry_price: 28, price: 27, return_pct: -3.57, sessions: 2, is_today: false },
    { symbol: "MWG", slot: 3, first_trade_date: DATE, entry_price: 70.5, price: 70.5, return_pct: 0, sessions: 0, is_today: true },
  ],
}

type Seen = { pdf: string[]; tracking: string[]; archive: string[]; byDate: string[] }

async function mockBulletins(page: Page): Promise<Seen> {
  const seen: Seen = { pdf: [], tracking: [], archive: [], byDate: [] }
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  await page.route("**/api/v2/market/bulletins**", async (route) => {
    const url = new URL(route.request().url())
    const rest = url.pathname.replace(/^.*\/api\/v2\/market\/bulletins/, "")
    if (rest === "/latest") return json(route, { bulletin: bulletin(DATE, 2, `${DATE}T10:05:00.000Z`) })
    if (rest === "/archive") {
      const pageNumber = Number(url.searchParams.get("page") ?? "1")
      seen.archive.push(`page=${pageNumber}`)
      const items = pageNumber === 1 ? [bulletin(DATE), bulletin(OLDER)] : [bulletin("2026-11-04")]
      return json(route, { items, total: 3, page: pageNumber, has_more: pageNumber === 1, retention_months: 6 })
    }
    if (rest === "") {
      const date = url.searchParams.get("date") ?? ""
      seen.byDate.push(date)
      return date === OLDER ? json(route, { bulletin: bulletin(OLDER) }) : json(route, { error: { message: "Chưa có bản tin" } }, 404)
    }
    const file = /\/files\/(desktop|mobile)\/\d+$/.exec(rest)
    if (file) {
      seen.pdf.push(file[1]!)
      return route.fulfill({ status: 200, contentType: "application/pdf", body: pdf(`${file[1]}.pdf`) })
    }
    return route.fallback()
  })
  await page.route("**/api/v2/market/tracking**", (route) => {
    const slot = new URL(route.request().url()).searchParams.get("slot")
    seen.tracking.push(slot ?? "all")
    const items = slot ? TRACKING.items.filter((item) => item.slot === Number(slot)) : TRACKING.items
    return json(route, { ...TRACKING, slot: slot ? Number(slot) : null, items })
  })
  return seen
}

const OPEN = "/demo-trading?content=market&view=trading&symbol=FPT"

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
}

test("máy tính: bản tin hiện bản máy tính với lớp chữ, lớp liên kết và nút Tải PDF", async ({ page }) => {
  const seen = await mockBulletins(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(OPEN)

  const tabs = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Theo dõi" }) })
  await expect(tabs.getByRole("tab")).toHaveText(["Bản tin", "Theo dõi", "Bản tin cũ"])
  await expect(page.getByText("Bản tin cuối phiên · Thứ Sáu, 06/11/2026 · Public 16:30 · Cập nhật lúc 17:05")).toBeVisible()

  const download = page.getByRole("link", { name: "Tải PDF" })
  await expect(download).toHaveAttribute("href", /\/files\/desktop\/2\?download=1$/)

  const firstPage = page.locator(".react-pdf__Page").first()
  await expect(firstPage).toBeVisible()
  await expect(page.locator(".react-pdf__Page__textContent").first()).toContainText("VN-Index")
  // Các mã nằm ở trang 2: cuộn tới thì trang mới được vẽ cùng lớp liên kết.
  await page.locator("[data-bulletin-page='2']").scrollIntoViewIfNeeded()
  const link = page.locator(".react-pdf__Page__annotations a[href*='demo-trading']").first()
  await expect(link).toHaveAttribute("href", /symbol=[A-Z]{2,4}/)
  await expect(link).toHaveAttribute("target", "_blank")
  await expect(link).toHaveAttribute("rel", /noopener/)
  expect(seen.pdf).toEqual(["desktop"])
  // Trang co theo khung nội dung (Demo Trading còn chừa cột công cụ bên phải), không gây cuộn ngang.
  const fits = await page.evaluate(() => {
    const viewer = document.querySelector("[data-tour-id='tour-bantin-pdf']")
    for (let element = viewer?.parentElement ?? null; element; element = element.parentElement) {
      const overflow = getComputedStyle(element).overflowX
      if (overflow === "scroll" || overflow === "auto") return element.scrollWidth <= element.clientWidth + 1
    }
    return document.documentElement.scrollWidth <= innerWidth
  })
  expect(fits).toBe(true)
  await shot(page, "ban-tin-desktop")
})

test("kéo cửa sổ qua 900 px thì đổi sang bản điện thoại, không tải lại trang", async ({ page }) => {
  const seen = await mockBulletins(page)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto(OPEN)
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible()
  expect(seen.pdf).toEqual(["desktop"])

  await page.setViewportSize({ width: 600, height: 900 })
  await expect(page.getByRole("link", { name: "Tải PDF" })).toHaveAttribute("href", /\/files\/mobile\/2\?download=1$/)
  await expect(page.locator("[data-variant='mobile']")).toBeVisible()
  await expect(page.locator("[data-bulletin-page]")).toHaveCount(5)
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible()
  expect(seen.pdf).toContain("mobile")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await shot(page, "ban-tin-mobile")
})

test("trang dựng dần: trang cuối chưa vẽ cho tới khi cuộn tới, khung giữ đúng tỉ lệ", async ({ page }) => {
  await mockBulletins(page)
  await page.setViewportSize({ width: 600, height: 700 })
  await page.goto(OPEN)
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible()
  const pages = page.locator("[data-bulletin-page]")
  await expect(pages).toHaveCount(5)
  const lastPage = pages.last()
  await expect(lastPage.locator(".react-pdf__Page")).toHaveCount(0)
  const box = await lastPage.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height / box!.width).toBeCloseTo(707 / 397, 1)
  await lastPage.scrollIntoViewIfNeeded()
  await expect(lastPage.locator(".react-pdf__Page")).toHaveCount(1)
})

test("Theo dõi: ba ô số, lọc theo bộ lọc, sắp xếp đúng chiều và đủ chú thích", async ({ page }) => {
  const seen = await mockBulletins(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(OPEN)
  await page.getByRole("tab", { name: "Theo dõi" }).click()
  expect(new URL(page.url()).searchParams.get("bt")).toBe("theo-doi")

  await expect(page.getByText("Lợi nhuận = (Giá đóng cửa hôm nay − Giá đóng cửa ngày đề xuất) ÷ Giá đóng cửa ngày đề xuất. Giá đã điều chỉnh theo cổ tức, chia tách.")).toBeVisible()
  const stats = page.locator("[data-tour-id='tour-bantin-stats']")
  await expect(stats).toContainText("3 mã")
  await expect(stats).toContainText("Gồm 1 mã đề xuất hôm nay")
  await expect(stats).toContainText("1 / 2 mã")
  await expect(stats).toContainText("Không tính mã đề xuất hôm nay")
  await expect(stats).toContainText("+1,2%")
  await expect(stats).toContainText("VN-Index cùng kỳ: -0,8%")

  const rows = page.locator("table tbody tr")
  await expect(rows.locator("td:first-child")).toHaveText(["MWG", "HPG", "FPT"]) // mặc định: ngày đề xuất mới nhất trước
  await expect(rows.first().locator("td").last()).toHaveText("Hôm nay")
  await expect(rows.nth(2).locator("td").nth(5)).toHaveText("+6,00%")
  await expect(page.locator("table")).not.toContainText(/\/20(?!\d)/)

  await page.getByRole("button", { name: "Lợi nhuận" }).click()
  await expect(rows.locator("td:first-child")).toHaveText(["FPT", "MWG", "HPG"]) // cột số: giảm dần trước
  await page.getByRole("button", { name: "Lợi nhuận" }).click()
  await expect(rows.locator("td:first-child")).toHaveText(["HPG", "MWG", "FPT"])
  await page.getByRole("button", { name: "Mã", exact: true }).click()
  await expect(rows.locator("td:first-child")).toHaveText(["FPT", "HPG", "MWG"]) // cột chữ: tăng dần trước

  await page.getByRole("button", { name: "Bộ lọc 2" }).click()
  await expect(rows).toHaveCount(1)
  expect(seen.tracking).toContain("2")
  await expect(page.getByText("Giá: nghìn đồng. Chưa tính phí, thuế. Không phải khuyến nghị đầu tư. Kết quả quá khứ không đảm bảo kết quả tương lai.")).toBeVisible()
  await shot(page, "theo-doi-desktop")
})

test("Theo dõi trên điện thoại: mỗi mã một thẻ với dòng đề xuất", async ({ page }) => {
  await mockBulletins(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${OPEN}&bt=theo-doi`)
  await expect(page.locator("table")).toHaveCount(0)
  const card = page.locator("li", { hasText: "FPT" }).first()
  await expect(card).toContainText("Bộ lọc 1")
  await expect(card).toContainText("+6,00%")
  await expect(card).toContainText("Đề xuất 03/11 · 100,00 → 106,00 · 3 phiên")
  await expect(page.locator("li", { hasText: "MWG" }).first()).toContainText("hôm nay")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await shot(page, "theo-doi-mobile")
})

test("Bản tin cũ: 15 dòng đầu, Xem thêm, Xem mở đúng ngày ở tab Bản tin", async ({ page }) => {
  const seen = await mockBulletins(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(OPEN)
  await page.getByRole("tab", { name: "Bản tin cũ" }).click()
  await expect(page.getByText("Lưu bản tin của 6 tháng gần nhất (3 phiên). Tải PDF: máy tính tải bản máy tính, điện thoại tải bản điện thoại.")).toBeVisible()
  const rows = page.locator("[data-tour-id='tour-bantin-archive'] ul > li")
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText("Thứ Sáu, 06/11/2026")
  await expect(rows.first()).toContainText("VN-Index 1.755,61 (-0,59%) · 24 mã trong 3 bộ lọc")
  await expect(rows.first().getByRole("link", { name: "Tải PDF" })).toHaveAttribute("href", /\/files\/desktop\/1\?download=1$/)
  await page.getByRole("button", { name: "Xem thêm" }).click()
  await expect(rows).toHaveCount(3)
  expect([...new Set(seen.archive)]).toEqual(["page=1", "page=2"]) // StrictMode của bản dev gọi trang đầu hai lần
  await expect(page.getByRole("button", { name: "Xem thêm" })).toHaveCount(0)
  await shot(page, "ban-tin-cu")

  await rows.nth(1).getByRole("button", { name: "Xem" }).click()
  expect(new URL(page.url()).searchParams.get("date")).toBe(OLDER)
  await expect(page.getByText("Bản tin cuối phiên · Thứ Năm, 05/11/2026 · Public 16:30")).toBeVisible()
  await expect(page.getByRole("button", { name: "Xem bản tin mới nhất" })).toBeVisible()
  expect(seen.byDate).toContain(OLDER)
})

test("chưa có bản tin: hiện câu Chưa có bản tin.", async ({ page }) => {
  await page.route("**/api/v2/market/bulletins/latest", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bulletin: null }) }))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(OPEN)
  await expect(page.getByText("Chưa có bản tin.")).toBeVisible()
})
