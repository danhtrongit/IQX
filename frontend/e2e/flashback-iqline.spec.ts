/**
 * Flashback với IQLine (`?iqline=1`) trên Canvas thật, API giả lập (không cần backend): máy tính 1366x768 và điện thoại 390x844,
 * giao diện sáng và tối; zoom, kéo, về khung mặc định, vẽ đường xu hướng, thêm chỉ báo, nến tương lai không đọc được, và mặc định
 * (không có `?iqline=1`) không tải mã IQLine.
 *
 * Ảnh chụp chỉ ghi khi đặt FLASHBACK_SHOTS=<thư mục> (để xem bằng mắt, không ghi vào repo).
 */
import path from "node:path"
import type { Locator, Page } from "@playwright/test"
import { expect, seedMember, test } from "./fixtures"
import { PLAY_BARS, SECRET_DATE, SECRET_SYMBOL, START_STEP, VIEW_BARS, lowContrastTexts, mockFlashback, noHorizontalOverflow } from "./flashback-support"

const SHOTS = process.env.FLASHBACK_SHOTS
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

/** Chụp riêng khung biểu đồ (gồm trục ngang ở đáy, vốn nằm ngoài màn hình 768px). */
async function shotOf(target: Locator, name: string) {
  if (!SHOTS) return
  await target.scrollIntoViewIfNeeded()
  await target.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

const TOTAL_SLOTS = VIEW_BARS + PLAY_BARS
/** Bề rộng trục giá bên phải khung vẽ của IQLine. */
const AXIS_RIGHT = 62

const root = (page: Page) => page.locator('[data-iqline-root="flashback"]')
const canvasTop = (page: Page) => page.locator('[data-iqline-mode="flashback"] canvas[data-iqline-layer="top"]')
const legend = (page: Page) => page.getByRole("group", { name: "Chú giải biểu đồ" })

async function useScheme(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript((value) => localStorage.setItem("theme", value), scheme)
}

/** Điểm ảnh có nội dung của một lớp canvas (`base`, `data`, `drawings`, `top`). */
async function layerInk(page: Page, layer: string): Promise<number> {
  return page.evaluate((name) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-iqline-mode="flashback"] canvas[data-iqline-layer="${name}"]`)
    const context = canvas?.getContext("2d")
    if (!canvas || !context || canvas.width === 0) return 0
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) ink += 1
    return ink
  }, layer)
}

async function inkOf(page: Page): Promise<number> {
  return (await Promise.all(["base", "data"].map((layer) => layerInk(page, layer)))).reduce((sum, value) => sum + value, 0)
}

async function dataHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-iqline-mode="flashback"] canvas[data-iqline-layer="data"]')
    const url = canvas?.toDataURL() ?? ""
    return `${url.length}:${url.slice(-80)}`
  })
}

async function viewportOf(page: Page): Promise<[number, number]> {
  const [from, to] = ((await root(page).getAttribute("data-viewport")) ?? "0,0").split(",").map(Number)
  return [from, to]
}

/** Toạ độ màn hình của ô `session` trên trục (theo khung nhìn hiện tại) và độ cao `y` tính từ đỉnh biểu đồ. */
async function pointOf(page: Page, session: number, y: number) {
  const box = (await canvasTop(page).boundingBox())!
  const [from, to] = await viewportOf(page)
  return { x: box.x + ((session - from) / (to - from)) * (box.width - AXIS_RIGHT), y: box.y + y }
}

/** Mở màn chơi: sảnh, tạo phòng, bắt đầu. `iqline` thêm `?iqline=1`. */
async function openMatch(page: Page, iqline: boolean) {
  await seedMember(page)
  await mockFlashback(page)
  await page.goto(`/demo-trading?view=flashback${iqline ? "&iqline=1" : ""}`)
  await page.getByRole("button", { name: "Tạo phòng" }).first().click()
  await page.getByTestId("flashback-create-room").getByRole("button", { name: "Tạo phòng" }).click()
  await expect(page.getByTestId("flashback-room-id")).toBeVisible()
  await page.getByRole("button", { name: /^Bắt đầu/ }).click()
  await expect(page.getByTestId("flashback-clock")).toBeVisible()
  if (iqline) {
    await expect(root(page)).toBeVisible()
    await expect(legend(page)).toBeVisible()
    await expect.poll(() => inkOf(page), { timeout: 10_000 }).toBeGreaterThan(500)
  } else {
    await expect(page.getByRole("img", { name: "Biểu đồ nến Flashback" })).toBeVisible()
  }
  await expect(page.getByTestId("flashback-session")).toHaveText("Phiên " + START_STEP)
}

for (const scheme of ["dark", "light"] as const) {
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
  ] as const) {
    test(`IQLine Flashback ở ${width}px (${scheme}): vẽ nến thật, chú giải rõ, không tràn ngang; cùng dữ liệu với biểu đồ SVG`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await useScheme(page, scheme)
      await openMatch(page, true)

      // Canvas thật: bốn lớp, chú giải DOM nằm ngoài khung role img, nhãn tiếp cận không có ngày hay mã.
      const chart = page.getByRole("img", { name: "Biểu đồ nến Flashback" })
      await expect(chart.locator("canvas")).toHaveCount(4)
      await expect(chart.locator("[data-pane]")).toHaveCount(0)
      await expect(legend(page).locator('[data-pane="price"]')).toHaveCount(1)
      await expect(legend(page).locator('[data-pane="volume"]')).toHaveCount(1)
      await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark)/)
      await expect(page.locator("canvas[data-iqline-layer]").first()).toBeVisible()
      expect(await noHorizontalOverflow(page)).toBe(true)
      expect(await lowContrastTexts(page)).toEqual([])
      const touchAction = await canvasTop(page).evaluate((element) => getComputedStyle(element).touchAction)
      expect(touchAction).toBe("pan-y")
      // Chiều cao ô theo v2.3 §2.
      const narrow = width < 600
      await expect(legend(page).locator('[data-pane="price"]')).toHaveAttribute("data-plot-height", narrow ? "240" : /^\d+$/)
      await expect(legend(page).locator('[data-pane="volume"]')).toHaveAttribute("data-plot-height", narrow ? "64" : "80")
      await shot(page, `iqline-${width}-${scheme}`)
      await shotOf(page.locator('[data-iqline-root="flashback"]'), `iqline-${width}-${scheme}-chart`)

      // Cùng dữ liệu, biểu đồ SVG cũ (mặc định): để so bằng mắt.
      await page.goto("/demo-trading?view=flashback")
      await expect(page.getByRole("img", { name: "Biểu đồ nến Flashback" })).toBeVisible()
      await expect(page.getByTestId("flashback-session")).toHaveText("Phiên " + START_STEP)
      await expect(page.locator("canvas[data-iqline-layer]")).toHaveCount(0)
      await shot(page, `svg-${width}-${scheme}`)
      await shotOf(page.getByRole("img", { name: "Biểu đồ nến Flashback" }), `svg-${width}-${scheme}-chart`)
    })
  }
}

test("zoom, kéo và về khung mặc định chỉ trong các nến đã mở", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openMatch(page, true)
  const box = (await canvasTop(page).boundingBox())!
  const centre = { x: box.x + box.width * 0.4, y: box.y + 120 }
  expect(await viewportOf(page)).toEqual([-0.5, TOTAL_SLOTS - 0.5])
  const initial = await dataHash(page)

  // Lăn chuột thường không zoom (để trang cuộn); Ctrl + lăn thì zoom quanh con trỏ.
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, -400)
  expect(await viewportOf(page)).toEqual([-0.5, TOTAL_SLOTS - 0.5])
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -500)
  await page.keyboard.up("Control")
  await expect.poll(async () => (await viewportOf(page))[1] - (await viewportOf(page))[0]).toBeLessThan(TOTAL_SLOTS - 5)
  await expect.poll(() => dataHash(page)).not.toBe(initial)
  await shot(page, "iqline-zoomed")

  // Nút Về khung mặc định đang sáng khi đã zoom.
  const fit = page.getByRole("button", { name: "Về khung mặc định" })
  await expect(fit).toBeEnabled()

  // Kéo sang phải xem phần cũ hơn; kéo thật mạnh không đưa khung ra ngoài trục.
  const zoomed = await viewportOf(page)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(centre.x + 260, centre.y, { steps: 8 })
  await page.mouse.up()
  const dragged = await viewportOf(page)
  expect(dragged[0]).toBeLessThan(zoomed[0])
  expect(dragged[1] - dragged[0]).toBeCloseTo(zoomed[1] - zoomed[0], 6)
  for (let step = 0; step < 6; step += 1) {
    await page.mouse.move(centre.x, centre.y)
    await page.mouse.down()
    await page.mouse.move(centre.x + 700, centre.y, { steps: 6 })
    await page.mouse.up()
  }
  expect((await viewportOf(page))[0]).toBe(-0.5)
  for (let step = 0; step < 8; step += 1) {
    await page.mouse.move(box.x + box.width * 0.8, centre.y)
    await page.mouse.down()
    await page.mouse.move(box.x + 20, centre.y, { steps: 6 })
    await page.mouse.up()
  }
  expect((await viewportOf(page))[1]).toBe(TOTAL_SLOTS - 0.5)
  // Zoom ra hết cỡ: không bao giờ rộng hơn trục.
  await page.keyboard.down("Control")
  for (let step = 0; step < 10; step += 1) await page.mouse.wheel(0, 900)
  await page.keyboard.up("Control")
  await expect.poll(() => viewportOf(page)).toEqual([-0.5, TOTAL_SLOTS - 0.5])

  // Nhấp đúp vào khung vẽ về khung mặc định; nút phóng to cũng hoạt động.
  await page.getByRole("button", { name: "Phóng to biểu đồ" }).click({ force: true })
  expect((await viewportOf(page))[1] - (await viewportOf(page))[0]).toBeLessThan(TOTAL_SLOTS)
  await page.mouse.dblclick(centre.x, centre.y)
  await expect.poll(() => viewportOf(page)).toEqual([-0.5, TOTAL_SLOTS - 0.5])
  await expect(fit).toBeDisabled()
})

test("vẽ đường xu hướng bằng hai cú bấm, xoá bằng Delete; Fibonacci và đường ngang; Esc huỷ; nút Xoá", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openMatch(page, true)
  const trend = page.getByTestId("flashback-draw-trend")
  const fib = page.getByTestId("flashback-draw-fib")
  const horizontal = page.getByTestId("flashback-draw-horizontal")
  const clear = page.getByTestId("flashback-draw-clear")
  await expect(page.getByRole("group", { name: "Công cụ vẽ" }).getByRole("button")).toHaveCount(4)
  expect(await layerInk(page, "drawings")).toBe(0)

  // Đường xu hướng: bấm điểm đầu, rê, bấm điểm cuối; vẽ xong tự về chế độ bình thường.
  await trend.click()
  await expect(trend).toHaveAttribute("aria-pressed", "true")
  expect(await canvasTop(page).evaluate((element) => getComputedStyle(element).touchAction)).toBe("none")
  const a = await pointOf(page, 20, 120)
  const b = await pointOf(page, 45, 200)
  await page.mouse.click(a.x, a.y)
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 })
  await page.mouse.click(b.x, b.y)
  await expect(trend).toHaveAttribute("aria-pressed", "false")
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(200)
  await shot(page, "iqline-trend-line")

  // Delete xoá hình đang chọn.
  await page.keyboard.press("Delete")
  await expect.poll(() => layerInk(page, "drawings")).toBe(0)

  // Fibonacci: hai điểm, nhiều mức nên nhiều nét hơn hẳn đường xu hướng.
  await fib.click()
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(b.x, b.y)
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(1500)
  await shot(page, "iqline-fib")
  await page.keyboard.press("Delete")
  await expect.poll(() => layerInk(page, "drawings")).toBe(0)

  // Đường ngang: một điểm là xong.
  await horizontal.click()
  const h = await pointOf(page, 30, 60)
  await page.mouse.click(h.x, h.y)
  await expect(horizontal).toHaveAttribute("aria-pressed", "false")
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(100)
  const horizontalOnly = await layerInk(page, "drawings")

  // Esc huỷ lúc đang vẽ: bỏ công cụ, không để lại hình nào mới.
  await trend.click()
  await page.mouse.click(a.x, a.y + 40)
  await page.keyboard.press("Escape")
  await expect(trend).toHaveAttribute("aria-pressed", "false")
  expect(await canvasTop(page).evaluate((element) => getComputedStyle(element).touchAction)).toBe("pan-y")
  // Bấm tiếp vào chỗ trống không chốt hình nào: vẫn chỉ có đường ngang.
  const stray = await pointOf(page, 70, 230)
  await page.mouse.click(stray.x, stray.y)
  const afterStray = await layerInk(page, "drawings")
  expect(afterStray).toBeGreaterThan(horizontalOnly * 0.6)
  expect(afterStray).toBeLessThan(horizontalOnly * 1.4)

  // Nút Xoá: đang chọn hình thì xoá hình đó (đường ngang đang được chọn).
  await clear.click()
  await expect.poll(() => layerInk(page, "drawings")).toBe(0)
  // Hai hình, bỏ chọn bằng cách bấm chỗ trống, rồi Xoá thì mất hết.
  await trend.click()
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(b.x, b.y)
  await horizontal.click()
  await page.mouse.click(h.x, h.y)
  const empty = await pointOf(page, 85, 250)
  await page.mouse.click(empty.x, empty.y)
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(200)
  await clear.click()
  await expect.poll(() => layerInk(page, "drawings")).toBe(0)
})

test("thêm RSI và MA từ hộp chọn chỉ báo: ô riêng hiện ra, chú giải có nút ẩn, cài đặt, xóa", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openMatch(page, true)
  const before = Number(await root(page).getAttribute("data-chart-height"))
  const addIndicator = async (name: string) => {
    await page.getByRole("button", { name: "Các chỉ báo" }).click()
    const picker = page.getByTestId("indicator-picker")
    await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click()
    await expect(picker).toBeHidden()
  }
  await addIndicator("RSI")
  const pane = legend(page).locator('[data-pane="indicator"]')
  await expect(pane).toHaveCount(1)
  await expect(pane).toHaveAttribute("data-plot-height", "100")
  await expect(pane).toContainText("RSI 14")
  // Ô giá không bị ép: máy tính 768px có chỗ, ô giá vẫn >= 320.
  expect(Number(await legend(page).locator('[data-pane="price"]').getAttribute("data-plot-height"))).toBeGreaterThanOrEqual(320)
  expect(Number(await root(page).getAttribute("data-chart-height"))).toBeGreaterThanOrEqual(before)
  await addIndicator("MA / SMA")
  await expect(legend(page).locator('[data-pane="price"]')).toContainText(/MA.*20/)
  await shot(page, "iqline-indicators")

  // Nút của dòng chú giải chỉ hiện khi rê chuột vào dòng đó (máy tính).
  const rowButton = async (row: string, name: RegExp) => {
    await legend(page).locator("[data-legend-row]", { hasText: row }).hover()
    return page.getByRole("button", { name })
  }
  await (await rowButton("MA", /^Ẩn MA/)).click()
  await expect(await rowButton("MA", /^Hiện MA/)).toBeVisible()
  await (await rowButton("MA", /^Hiện MA/)).click()
  await (await rowButton("RSI", /^Xóa RSI/)).click()
  await expect(pane).toHaveCount(0)
  // Cài đặt MA: hộp thoại của Flashback mở.
  await (await rowButton("MA", /^Cài đặt MA/)).click()
  await expect(page.getByTestId("indicator-settings")).toBeVisible()
})

test("nến tương lai không đọc được: crosshair và chú giải dừng ở nến cuối; không lộ ngày hay mã", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openMatch(page, true)
  const session = page.getByTestId("flashback-session")
  await expect(session).toHaveText("Phiên " + START_STEP)

  // Rê vào nến quá khứ: chú giải đổi sang "n phiên trước", lớp trên cùng có crosshair.
  const past = await pointOf(page, 20, 120)
  await page.mouse.move(past.x, past.y)
  await expect(session).toHaveText(`${VIEW_BARS - 1 - 20} phiên trước`)
  await expect.poll(() => layerInk(page, "top")).toBeGreaterThan(100)

  // Rê vào từng phiên chưa mở: chú giải trở về nến cuối và không có crosshair nào.
  for (const index of [VIEW_BARS + START_STEP, VIEW_BARS + START_STEP + 3, TOTAL_SLOTS - 1]) {
    const future = await pointOf(page, index, 120)
    await page.mouse.move(future.x, future.y)
    await expect(session).toHaveText("Phiên " + START_STEP)
    await expect.poll(() => layerInk(page, "top")).toBe(0)
  }
  // Bấm vào phiên chưa mở với công cụ vẽ: neo bị kẹp, không có hình ngoài trục.
  await page.getByTestId("flashback-draw-horizontal").click()
  const edge = await pointOf(page, TOTAL_SLOTS - 1, 100)
  await page.mouse.click(edge.x, edge.y)
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(0)
  await shot(page, "iqline-future-hover")

  // Nến tương lai ở nhãn trục: chỉ là phiên ("Phiên n"), không có ngày thật. DOM của biểu đồ không chứa mã hay ngày.
  const surface = await root(page).evaluate((element) => {
    const out: string[] = []
    const visit = (node: Element) => {
      for (const attribute of Array.from(node.attributes)) if (!["xmlns", "d", "class", "style"].includes(attribute.name) && !attribute.name.startsWith("data-testid")) out.push(`${attribute.name}=${attribute.value}`)
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) out.push(child.textContent ?? "")
        else if (child.nodeType === Node.ELEMENT_NODE) visit(child as Element)
      })
    }
    visit(element)
    return out.join("\n")
  })
  expect(surface).not.toContain(SECRET_SYMBOL)
  expect(surface).not.toContain(SECRET_DATE)
  expect(surface).not.toMatch(/\b(19|20)\d{2}\b|\d{4}-\d{2}-\d{2}/)
  expect(await page.getByRole("img", { name: "Biểu đồ nến Flashback" }).getAttribute("aria-label")).toBe("Biểu đồ nến Flashback")
  expect(await page.locator("body").innerText()).not.toContain(SECRET_SYMBOL)
  expect(await page.locator("body").innerText()).not.toContain(SECRET_DATE)
})

test.describe("điện thoại cảm ứng", () => {
  test.use({ hasTouch: true })
  test("chạm dòng chú giải hiện nút; bật công cụ vẽ thì canvas chặn cuộn trang", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openMatch(page, true)
    await page.getByRole("button", { name: "Các chỉ báo" }).click()
    await page.getByTestId("indicator-picker").getByRole("button", { name: /^MA \/ SMA/ }).click()
    const row = legend(page).locator("[data-legend-row]").first()
    await row.scrollIntoViewIfNeeded()
    await expect(row.locator("[data-legend-buttons]")).toBeHidden()
    await row.tap()
    await expect(row.locator("[data-legend-buttons]")).toBeVisible()
    await expect(row.getByRole("button", { name: /^Xóa MA/ })).toBeVisible()
    await shot(page, "iqline-phone-legend-buttons")
    expect(await noHorizontalOverflow(page)).toBe(true)
    // Bật công cụ vẽ thì canvas chặn cuộn trang.
    await page.getByTestId("flashback-draw-trend").tap()
    expect(await canvasTop(page).evaluate((element) => getComputedStyle(element).touchAction)).toBe("none")
  })
})

test("mặc định (không có ?iqline=1) vẫn là biểu đồ SVG và không tải mã Canvas của IQLine", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  const requested: string[] = []
  page.on("request", (request) => requested.push(request.url()))
  await openMatch(page, false)
  await expect(page.locator("canvas[data-iqline-layer]")).toHaveCount(0)
  await expect(page.getByRole("img", { name: "Biểu đồ nến Flashback" })).toBeVisible()
  await expect(page.getByTestId("flashback-draw-horizontal")).toHaveCount(0)
  // Biểu đồ IQLine của Flashback, chú giải, hình vẽ theo ván và phần tương tác không được tải ở đường mặc định.
  // (Các chế độ khác của thư viện, như `IQLineStatic` của Học viện, có thể được tải vì lý do riêng nên không xét ở đây.)
  const loaded = requested.filter((url) => /flashback-chart-iqline|IQLineFlashback|flashback-legend|session-drawings|\/lib\/iqline\/interaction\/|use-iqline-chart/i.test(url))
  expect(loaded).toEqual([])
  // Ngược lại, bật công tắc (cùng trang, ván đang chơi) thì tải biểu đồ IQLine của Flashback.
  requested.length = 0
  await page.goto("/demo-trading?view=flashback&iqline=1")
  await expect(page.locator("[data-iqline-root]")).toBeVisible()
  expect(requested.some((url) => /flashback-chart-iqline|IQLineFlashback/i.test(url))).toBe(true)
})
