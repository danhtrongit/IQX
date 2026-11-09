/**
 * Candle Dojo ở 390 px và 1280 px (spec v1.2 §11.7, §13): màn Dojo một cột trên điện thoại, hai cột trên máy tính;
 * màn thi đai không tràn ngang, tên thẻ xếp dọc (điện thoại) hoặc 2 x 2 (máy tính), và rail công cụ ẩn khi đang thi.
 *
 * Chạy với API giả lập (fixtures.ts) cộng các route Candle Dojo bên dưới, không cần backend. Đặt
 * `E2E_SHOTS_DIR` để lưu ảnh chụp từng màn.
 */
import type { Page, Route } from "@playwright/test"
import { CD_DOJOS, CD_LESSONS } from "../src/lib/candle-dojo/lessons"
import { expect, seedMember, test } from "./fixtures"

const dojo1 = CD_LESSONS.filter((lesson) => lesson.dojo === 1)

function state() {
  const stars = Object.fromEntries(dojo1.map((lesson, index) => [lesson.id, (index % 3) + 1]))
  return {
    catalog_version: "iqx-candle-dojo-v1",
    wallet: { balance: 1500 },
    progress: {
      belt: 0, belt_name: "Đai trắng", intro_completed: true, streak_days: 4, best_streak: 4, drills_total: 4,
      drill_unlocked: false, drill_done_today: false,
    },
    lessons: dojo1.map((lesson) => ({
      lesson_id: lesson.id, dojo: 1, stars: stars[lesson.id], hunt_star: true, twin_star: false, attempts: 1,
      completed_at: "2026-11-01T00:00:00.000Z",
    })),
    open_lessons: dojo1.map((lesson) => lesson.id),
    dojos: CD_DOJOS.filter((dojo) => dojo.n >= 1).map((dojo) => ({
      n: dojo.n, unlocked: dojo.n === 1,
      lessons_total: CD_LESSONS.filter((lesson) => lesson.dojo === dojo.n).length,
      lessons_done: dojo.n === 1 ? dojo1.length : 0,
      exam_ready: dojo.n === 1, passed: false,
    })),
    cards: { total: 47, owned_count: 3, owned: ["doji", "bua", "treo_co"].map((card_id) => ({ card_id, acquired_at: "2026-11-01T00:00:00.000Z", seen_at: null })) },
    rewards: { intro_xu: 100, lesson_xu: 100, belt_xu: 300, drill_xu: 20 },
  }
}

const bars = Array.from({ length: 30 }, (_, index) => {
  const base = 100 + Math.sin(index / 3) * 6 + index * 0.2
  return { o: base, h: base + 3, l: base - 3, c: base + (index % 2 ? 1.5 : -1.5), v: 100 + index * 5 }
})

const exam = {
  attempt_id: "00000000-0000-4000-8000-000000000001",
  dojo: 1,
  belt_name: "Vàng",
  pass_mark: 6,
  total: 8,
  questions: Array.from({ length: 8 }, (_, index) => ({
    index,
    n: 1,
    bars,
    options: ["marubozu_tang", "marubozu_giam", "doji", "bua"],
  })),
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

async function mockDojo(page: Page) {
  await page.route("**/api/v2/candle-dojo/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v2/, "")
    if (path === "/candle-dojo/state") return json(route, state())
    if (path === "/candle-dojo/exams") return json(route, exam)
    if (path.endsWith("/answers")) {
      const body = route.request().postDataJSON() as { index: number }
      return json(route, { attempt_id: exam.attempt_id, index: body.index, correct: false, answer: "marubozu_tang", answered: body.index + 1, finished: false, result: null })
    }
    return json(route, { error: { message: "Không có" } }, 404)
  })
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    // The phone tool bar scrolls inside itself on purpose; everything else must stay inside the screen.
    const overflowing = Array.from(document.querySelectorAll("body *")).filter((node) => {
      if (node.closest("nav[aria-label='Công cụ theo trang']")) return false
      const box = node.getBoundingClientRect()
      return box.width > 0 && box.right > window.innerWidth + 1
    })
    return { page: document.documentElement.scrollWidth - window.innerWidth, nodes: overflowing.slice(0, 5).map((node) => node.outerHTML.slice(0, 120)) }
  })
  expect(overflow.page).toBeLessThanOrEqual(0)
  expect(overflow.nodes).toEqual([])
}

async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` })
}

async function useTheme(page: Page, theme: "dark" | "light") {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("theme", value)
    } catch {
      // Bỏ qua khi trình duyệt chặn localStorage.
    }
  }, theme)
}

const SIZES = [["390", { width: 390, height: 844 }], ["1280", { width: 1280, height: 800 }]] as const

for (const [size, viewport] of SIZES) for (const theme of ["dark", "light"] as const) {
  const label = `${size}-${theme}`
  test.describe(`Candle Dojo ở ${size} px (${theme})`, () => {
    test.use({ viewport })
    test.beforeEach(async ({ page }) => useTheme(page, theme))

    test("màn Dojo không tràn ngang, đủ đai, thẻ, luyện công, xem trước và các Dojo", async ({ page }) => {
      await seedMember(page)
      await mockDojo(page)
      await page.goto("/demo-trading?view=candle-dojo")
      await expect(page.getByTestId("dojo-home")).toBeVisible()
      await expect(page.getByTestId("dojo-belt-card")).toContainText("Đai trắng")
      await expect(page.getByTestId("dojo-cards-count")).toHaveText("3 / 47")
      await expect(page.getByTestId("dojo-drill")).toContainText("Mở khi bạn có đai vàng.")
      await expect(page.getByRole("switch", { name: "Chế độ xem trước" })).toBeVisible()
      await expect(page.locator("[data-dojo-locked]")).toHaveCount(4)
      await noHorizontalScroll(page)
      await shot(page, `dojo-home-${label}`)
      // Desktop: two columns with the right one 330 px wide.
      const aside = await page.getByRole("complementary", { name: "Tiến độ của bạn" }).boundingBox()
      const list = await page.locator("[data-dojo='1']").boundingBox()
      expect(aside).not.toBeNull()
      expect(list).not.toBeNull()
      if (viewport.width >= 900) {
        expect(Math.round(aside!.width)).toBe(330)
        expect(aside!.x).toBeGreaterThan(list!.x)
      } else {
        expect(aside!.x).toBeLessThanOrEqual(list!.x + 1)
        expect(aside!.width).toBeLessThanOrEqual(480)
      }

      await page.getByRole("switch", { name: "Chế độ xem trước" }).click()
      await expect(page.locator("[data-dojo-locked]")).toHaveCount(0)
      await noHorizontalScroll(page)
      await shot(page, `dojo-home-preview-${label}`)
    })

    test("thi đai: ẩn rail, tên thẻ xếp theo cỡ màn, không tràn ngang", async ({ page }) => {
      await seedMember(page)
      await mockDojo(page)
      await page.goto("/demo-trading?view=candle-dojo")
      await page.locator("[data-exam='1']").click()
      await expect(page.getByTestId("dojo-exam")).toBeVisible()
      await expect(page.getByRole("navigation", { name: "Công cụ theo trang" })).toHaveCount(0)
      const options = page.locator("[data-option]")
      await expect(options).toHaveCount(4)
      const boxes = await options.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON() as { x: number; y: number; width: number }))
      if (viewport.width >= 900) {
        expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(2)
      } else {
        expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(1)
      }
      await noHorizontalScroll(page)
      await shot(page, `dojo-exam-${label}`)
      await options.nth(1).click()
      await expect(page.getByRole("status")).toContainText("Chưa đúng.")
      await noHorizontalScroll(page)
      await shot(page, `dojo-exam-feedback-${label}`)
      await page.getByRole("button", { name: "Thoát bài thi" }).click()
      await expect(page.getByTestId("dojo-home")).toBeVisible()
      await expect(page.getByRole("navigation", { name: "Công cụ theo trang" })).toBeVisible()
    })
  })
}
