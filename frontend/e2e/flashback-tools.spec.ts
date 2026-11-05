/**
 * Công cụ vẽ của IQLine trong Flashback trên Canvas thật, API giả lập (không cần backend): đủ 36 công cụ qua thanh nhóm, vị thế mua, vùng
 * thời gian Fibonacci và khoảng giá và thời gian kéo sang vùng tương lai, nam châm Mạnh, lăn chuột zoom mà trang không cuộn theo, máy tính
 * (1366px) và điện thoại (390px), giao diện sáng và tối, và biểu đồ SVG cũ (`?iqline=0`) không đổi.
 *
 * Luật công bằng (docs/iqline-design.md §12): chữ canvas của hình vẽ không có ngày, tuần, tháng, giờ, mã hay năm; khoảng thời gian chỉ ghi số nến.
 * Ảnh chụp chỉ ghi khi đặt FLASHBACK_SHOTS=<thư mục>.
 */
import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { SECRET_DATE, SECRET_SYMBOL, VIEW_BARS, WARMUP_BARS, bars, lowContrastTexts, noHorizontalOverflow } from "./flashback-support"
import {
  LAST_OPEN,
  TOTAL_SLOTS,
  canvasTop,
  drawnLabels,
  extrasBar,
  groupsBar,
  layerInk,
  legend,
  openMatch,
  pageScroll,
  pickTool,
  pointOf,
  root,
  shot,
  shotOf,
  useScheme,
  viewportOf,
} from "./flashback-iqline-support"

/** Từ chỉ khoảng thời gian lịch hay giờ giấc, và các dạng ngày: không được có ở chữ nào trên hình vẽ của Flashback. */
const CALENDAR = /(?<![\p{L}\p{N}])(ngày|tuần|tháng|quý|năm|giờ|phút|giây|thứ|hôm)(?![\p{L}\p{N}])|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2}:\d{2}/iu

const group = (page: Page, id: string) => groupsBar(page).locator(`[data-tool-group="${id}"]`)

/** Các nút thật sự thấy được của một thanh: toạ độ trong cửa sổ. */
async function rectsOf(page: Page, selector: string) {
  return page.evaluate((query) => Array.from(document.querySelectorAll(query)).map((node) => node.getBoundingClientRect().toJSON()), selector)
}

for (const scheme of ["light", "dark"] as const) {
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
  ] as const) {
    test(`Flashback ${width}px (${scheme}): thanh công cụ không tràn, vẽ vị thế mua, vùng thời gian Fibonacci và khoảng giá và thời gian sang vùng tương lai`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await useScheme(page, scheme)
      await openMatch(page)
      const narrow = width < 640

      // ---- thanh công cụ: đủ bảy nhóm, không tràn ngang, không đè lên biểu đồ
      const row = page.getByTestId("flashback-draw-toolbar")
      await row.scrollIntoViewIfNeeded()
      await expect(groupsBar(page).locator("[data-tool-group]")).toHaveCount(7)
      expect(await noHorizontalOverflow(page)).toBe(true)
      expect(await lowContrastTexts(page)).toEqual([])
      const buttons = await rectsOf(page, '[data-testid="flashback-draw-toolbar"] button')
      expect(buttons.length).toBeGreaterThanOrEqual(7 + 3 + 1)
      for (const rect of buttons) {
        expect(rect.left, "nút không lệch ra ngoài bên trái").toBeGreaterThanOrEqual(0)
        expect(rect.right, "nút không tràn ra ngoài bên phải").toBeLessThanOrEqual(width)
        expect(rect.height, "đủ cao để bấm").toBeGreaterThanOrEqual(28)
      }
      const toolbarBox = (await row.boundingBox())!
      const chartBox = (await root(page).boundingBox())!
      expect(toolbarBox.y + toolbarBox.height, "thanh công cụ nằm trên biểu đồ, không đè lên").toBeLessThanOrEqual(chartBox.y + 1)
      const groupsBox = (await groupsBar(page).boundingBox())!
      const extrasBox = (await extrasBar(page).boundingBox())!
      if (narrow) expect(groupsBox.y, "điện thoại: bảy nhóm ở hàng riêng bên dưới").toBeGreaterThan(extrasBox.y + extrasBox.height - 1)
      else expect(Math.abs(groupsBox.y - extrasBox.y), "máy tính: cùng một hàng").toBeLessThan(12)
      await shot(page, `tools-${width}-${scheme}-toolbar`)

      // ---- menu nhóm: mở xuống dưới, không che thanh Mua, Bán cố định ở đáy điện thoại
      await group(page, "position").click()
      const menu = page.getByRole("menu")
      await expect(menu).toBeVisible()
      await expect(menu.getByRole("menuitem")).toHaveCount(5)
      const menuBox = (await menu.boundingBox())!
      expect(menuBox.x).toBeGreaterThanOrEqual(0)
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width)
      if (narrow) {
        const barTop = (await page.getByTestId("flashback-buy-mobile").boundingBox())!.y - 8
        expect(menuBox.y + menuBox.height, "menu không che thanh Mua, Bán").toBeLessThanOrEqual(barTop)
      }
      await shot(page, `tools-${width}-${scheme}-menu`)
      await page.keyboard.press("Escape")
      await expect(menu).toBeHidden()

      // ---- vị thế mua: bấm điểm vào ở nến đã mở, rồi bấm điểm chốt lời ở ô tương lai (phiên 80)
      await root(page).scrollIntoViewIfNeeded()
      const before = await layerInk(page, "drawings")
      await pickTool(page, "position", "long-position")
      const entry = await pointOf(page, 40, 190)
      const target = await pointOf(page, 80, 110)
      await page.mouse.click(entry.x, entry.y)
      await page.mouse.move((entry.x + target.x) / 2, (entry.y + target.y) / 2, { steps: 4 })
      await page.mouse.click(target.x, target.y)
      await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(before + 500)
      const styleBar = page.getByRole("toolbar", { name: "Kiểu của Vị thế mua" })
      await expect(styleBar).toBeVisible()
      const styleBox = (await styleBar.boundingBox())!
      const rootBox = (await root(page).boundingBox())!
      expect(styleBox.x).toBeGreaterThanOrEqual(0)
      expect(styleBox.x + styleBox.width).toBeLessThanOrEqual(width)
      expect(styleBox.y + styleBox.height, "thanh kiểu nằm trong khung biểu đồ").toBeLessThanOrEqual(rootBox.y + rootBox.height + 1)
      expect(styleBox.y).toBeGreaterThanOrEqual(rootBox.y)
      await shot(page, `tools-${width}-${scheme}-position`)

      // ---- vùng thời gian Fibonacci: một đơn vị là 8 phiên, nên vạch 8, 13 đơn vị rơi vào ô tương lai
      await pickTool(page, "fib", "fib-time-zones")
      const zoneA = await pointOf(page, 8, 60)
      const zoneB = await pointOf(page, 16, 60)
      await page.mouse.click(zoneA.x, zoneA.y)
      await page.mouse.click(zoneB.x, zoneB.y)
      await expect(page.getByRole("toolbar", { name: "Kiểu của Vùng thời gian Fibonacci" })).toBeVisible()

      // ---- khoảng giá và thời gian từ nến đã mở sang ô tương lai: nhãn chỉ có số nến
      await pickTool(page, "position", "date-price-range")
      const spanA = await pointOf(page, 20, 200)
      const spanB = await pointOf(page, 85, 100)
      await page.mouse.click(spanA.x, spanA.y)
      await page.mouse.click(spanB.x, spanB.y)
      await expect(page.getByRole("toolbar", { name: "Kiểu của Khoảng giá và thời gian" })).toBeVisible()
      // Bỏ chọn bằng cách bấm chỗ trống (xa mọi hình) để thanh kiểu không che hình khi chụp.
      const empty = await pointOf(page, 3, 215)
      await page.mouse.click(empty.x, empty.y)
      await expect(page.getByRole("toolbar", { name: /^Kiểu của/ })).toHaveCount(0)

      const labels = await drawnLabels(page)
      expect(labels.some((label) => /^Chốt lời /.test(label)), `nhãn vị thế: ${labels.join(" | ")}`).toBe(true)
      expect(labels.some((label) => /^Cắt lỗ /.test(label))).toBe(true)
      expect(labels.some((label) => /^Mua .* R:R/.test(label))).toBe(true)
      expect(labels.some((label) => /(^|\s)65 nến$/.test(label)), `nhãn khoảng thời gian: ${labels.join(" | ")}`).toBe(true)
      for (const label of labels) expect(label, `nhãn "${label}"`).not.toMatch(CALENDAR)
      expect(labels.join("|")).not.toContain(SECRET_DATE)
      expect(labels.join("|")).not.toContain(SECRET_SYMBOL)

      // Hình kéo vào tương lai không làm chú giải đọc được gì: trỏ vào ô tương lai thì chú giải vẫn ở nến cuối, không có crosshair.
      const future = await pointOf(page, TOTAL_SLOTS - 2, 200)
      await page.mouse.move(future.x, future.y)
      await expect(page.getByTestId("flashback-session")).toHaveText("Phiên 6")
      await expect.poll(() => layerInk(page, "top")).toBe(0)

      expect(await noHorizontalOverflow(page)).toBe(true)
      await shot(page, `tools-${width}-${scheme}`)
      await shotOf(root(page), `tools-${width}-${scheme}-chart`)
      await shotOf(row, `tools-${width}-${scheme}-toolbar-after`)
    })
  }
}

test("nam châm Mạnh chỉ hút vào nến đã mở: trên nến hút về O, H, L, C của nến đó; ở ô tương lai giữ đúng chỗ bấm", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openMatch(page)
  await extrasBar(page).getByRole("button", { name: /^Nam châm/ }).click()
  await page.getByRole("menuitemradio", { name: /^Mạnh/ }).click()
  await expect(extrasBar(page).getByRole("button", { name: /^Nam châm/ })).toHaveAttribute("data-magnet", "strong")

  const format = (value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
  const ohlc = (session: number) => {
    const bar = bars(1, session, WARMUP_BARS)[0]
    return [bar.open, bar.high, bar.low, bar.close].map(format)
  }
  const labelOf = async (session: number, y: number) => {
    await drawnLabels(page, true)
    await pickTool(page, "annotation", "price-label")
    const point = await pointOf(page, session, y)
    await page.mouse.click(point.x, point.y)
    await page.keyboard.press("Escape")
    await expect.poll(async () => (await drawnLabels(page)).filter((label) => /^[\d.]+$/.test(label)).length).toBeGreaterThan(0)
    return (await drawnLabels(page)).filter((label) => /^[\d.]+$/.test(label))
  }

  // Trên nến 20, ở giữa thân nến và xa mọi đầu mút: nhãn giá phải là một trong bốn giá O, H, L, C của đúng nến 20.
  const onCandle = await labelOf(20, 150)
  expect(onCandle.some((label) => ohlc(20).includes(label)), `nhãn ${onCandle.join(", ")} so với ${ohlc(20).join(", ")}`).toBe(true)

  // Ở ô tương lai (phiên 85) sát đỉnh khung giá: giá cao hơn mọi nến đã mở, nên không thể là giá của nến nào bị hút vào.
  const highest = Math.max(...bars(VIEW_BARS, 0, WARMUP_BARS).map((bar) => bar.high), ...bars(LAST_OPEN - VIEW_BARS + 1, VIEW_BARS, WARMUP_BARS).map((bar) => bar.high))
  const inFuture = await labelOf(85, 12)
  const prices = inFuture.map((label) => Number(label.replaceAll(".", "")))
  expect(Math.max(...prices), `nhãn ${inFuture.join(", ")}`).toBeGreaterThan(highest)
  await shot(page, "tools-magnet-strong")
})

test("lăn chuột zoom quanh con trỏ và trang không cuộn theo; ngoài biểu đồ trang cuộn bình thường; lăn ngang và Shift + lăn kéo khung", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 600 })
  await openMatch(page)
  // Ghi lại `defaultPrevented` của từng cú lăn ở pha nổi bọt (sau khi biểu đồ đã xử lý).
  await page.evaluate(() => {
    const log: { prevented: boolean; inChart: boolean }[] = []
    ;(window as unknown as { __wheelLog: typeof log }).__wheelLog = log
    document.addEventListener("wheel", (event) => log.push({ prevented: event.defaultPrevented, inChart: Boolean((event.target as Element).closest("[data-iqline-root]")) }), { passive: true })
  })
  const wheelLog = () => page.evaluate(() => (window as unknown as { __wheelLog: { prevented: boolean; inChart: boolean }[] }).__wheelLog)
  const span = async () => {
    const [from, to] = await viewportOf(page)
    return to - from
  }

  // Cuộn trang xuống để thấy biểu đồ, và chắc chắn trang còn chỗ để cuộn tiếp (không thì phép thử không chứng minh được gì).
  await root(page).scrollIntoViewIfNeeded()
  const scrollable = await page.evaluate(() => {
    const area = document.querySelector('[data-iqline-root]')?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    return area ? area.scrollHeight - area.clientHeight : document.documentElement.scrollHeight - window.innerHeight
  })
  expect(scrollable, "trang phải còn chỗ cuộn").toBeGreaterThan(40)
  const box = (await canvasTop(page).boundingBox())!
  const centre = { x: box.x + box.width * 0.4, y: box.y + 140 }
  expect(await span()).toBe(TOTAL_SLOTS)
  const scrollBefore = await pageScroll(page)

  // Lăn lên trên biểu đồ: zoom vào, trang đứng yên.
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, -500)
  await expect.poll(span).toBeLessThan(TOTAL_SLOTS - 10)
  expect(await pageScroll(page)).toEqual(scrollBefore)
  await shot(page, "tools-wheel-zoomed")

  // Zoom quanh con trỏ: ô dưới con trỏ vẫn ở nguyên chỗ.
  const [from, to] = await viewportOf(page)
  const slotUnder = from + ((centre.x - box.x) / (box.width - 62)) * (to - from)
  await page.mouse.wheel(0, -300)
  const [from2, to2] = await viewportOf(page)
  const slotUnder2 = from2 + ((centre.x - box.x) / (box.width - 62)) * (to2 - from2)
  expect(Math.abs(slotUnder2 - slotUnder)).toBeLessThan(0.6)

  // Lăn xuống mạnh nhiều lần: zoom ra tới đúng khung mặc định, không rộng hơn trục; trang vẫn không cuộn (con trỏ còn ở trên biểu đồ).
  for (let step = 0; step < 12; step += 1) await page.mouse.wheel(0, 900)
  await expect.poll(() => viewportOf(page)).toEqual([-0.5, TOTAL_SLOTS - 0.5])
  expect(await pageScroll(page)).toEqual(scrollBefore)

  // Lăn ngang và Shift + lăn kéo khung; không cuộn trang.
  await page.mouse.wheel(0, -500)
  await expect.poll(span).toBeLessThan(TOTAL_SLOTS - 10)
  const zoomedFrom = (await viewportOf(page))[0]
  await page.mouse.wheel(-400, 0)
  await expect.poll(async () => (await viewportOf(page))[0]).toBeLessThan(zoomedFrom)
  const panLeft = await viewportOf(page)
  await page.keyboard.down("Shift")
  await page.mouse.wheel(0, 300)
  await page.keyboard.up("Shift")
  await expect.poll(async () => (await viewportOf(page))[0]).toBeGreaterThan(panLeft[0])
  expect(await pageScroll(page)).toEqual(scrollBefore)

  // Mọi cú lăn trên biểu đồ đều bị chặn cuộn trang.
  const inChart = (await wheelLog()).filter((entry) => entry.inChart)
  expect(inChart.length).toBeGreaterThanOrEqual(10)
  expect(inChart.every((entry) => entry.prevented)).toBe(true)

  // Ngoài biểu đồ (hàng thanh công cụ ngay phía trên, cùng khung cuộn): trang cuộn bình thường và cú lăn không bị chặn.
  const rowBox = (await page.getByTestId("flashback-draw-toolbar").boundingBox())!
  await page.mouse.move(rowBox.x + rowBox.width - 12, rowBox.y + rowBox.height / 2)
  const outsideBefore = await wheelLog()
  await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await pageScroll(page)).area + (await pageScroll(page)).window).toBeLessThan(scrollBefore.area + scrollBefore.window)
  const outside = (await wheelLog()).slice(outsideBefore.length)
  expect(outside.length).toBeGreaterThan(0)
  expect(outside.every((entry) => !entry.inChart && !entry.prevented)).toBe(true)
})

test.describe("điện thoại cảm ứng", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

  test("chạm menu nhóm rồi chạm hai điểm vẽ vị thế bán sang tương lai; chạm dọc vẫn cuộn trang khi không vẽ", async ({ page }) => {
    await useScheme(page, "dark")
    await openMatch(page)
    await root(page).scrollIntoViewIfNeeded()
    // Hết công cụ thì chạm dọc vẫn cuộn trang (touch-action pan-y); bật công cụ thì canvas chặn cuộn.
    expect(await canvasTop(page).evaluate((element) => getComputedStyle(element).touchAction)).toBe("pan-y")
    await group(page, "position").tap()
    await page.locator('[role="menuitem"][data-tool="short-position"]').tap()
    await expect(page.getByRole("menu")).toHaveCount(0)
    expect(await canvasTop(page).evaluate((element) => getComputedStyle(element).touchAction)).toBe("none")
    const entry = await pointOf(page, 30, 120)
    // Điểm chốt cao hơn nút phóng thu ở góc dưới bên phải khung giá (nút nằm đè lên biểu đồ nên sẽ nhận cú chạm).
    const target = await pointOf(page, 78, 150)
    await page.touchscreen.tap(entry.x, entry.y)
    await page.touchscreen.tap(target.x, target.y)
    const styleBar = page.getByRole("toolbar", { name: "Kiểu của Vị thế bán" })
    await expect(styleBar).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await canvasTop(page).evaluate((element) => getComputedStyle(element).touchAction)).toBe("pan-y")
    // Thanh kiểu nằm trong khung biểu đồ (không tràn ra các nút Mua, Bán bên ngoài khung); nếu người chơi cuộn để đáy biểu đồ chui xuống dưới
    // thanh Mua, Bán cố định thì cả biểu đồ lẫn thanh kiểu cùng nằm dưới nó, như phần còn lại của trang.
    const styleBox = (await styleBar.boundingBox())!
    const rootBox = (await root(page).boundingBox())!
    expect(styleBox.y).toBeGreaterThanOrEqual(rootBox.y)
    expect(styleBox.y + styleBox.height).toBeLessThanOrEqual(rootBox.y + rootBox.height + 1)
    expect(styleBox.x).toBeGreaterThanOrEqual(0)
    expect(styleBox.x + styleBox.width).toBeLessThanOrEqual(390)
    const labels = await drawnLabels(page)
    expect(labels.some((label) => /^Bán .* R:R/.test(label)), labels.join(" | ")).toBe(true)
    for (const label of labels) expect(label).not.toMatch(CALENDAR)
    await shot(page, "tools-phone-touch-short")
    await shotOf(root(page), "tools-phone-touch-short-chart")
  })
})

test("bản SVG cũ (?iqline=0) giữ nguyên: hai công cụ Xu hướng, Fibonacci và Xoá, không có menu nhóm, nam châm hay danh sách", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openMatch(page, false)
  await expect(page.locator("canvas[data-iqline-layer]")).toHaveCount(0)
  const bar = page.getByTestId("flashback-draw-toolbar")
  await expect(bar.getByRole("button")).toHaveCount(3)
  await expect(page.getByTestId("flashback-draw-trend")).toBeVisible()
  await expect(page.getByTestId("flashback-draw-fib")).toBeVisible()
  await expect(page.getByTestId("flashback-draw-clear")).toBeVisible()
  await expect(page.getByTestId("flashback-draw-horizontal")).toHaveCount(0)
  await expect(page.locator("[data-tool-group]")).toHaveCount(0)
  await expect(page.getByRole("button", { name: /^Nam châm/ })).toHaveCount(0)
  await page.getByTestId("flashback-draw-trend").click()
  await expect(page.getByTestId("flashback-draw-trend")).toHaveAttribute("aria-pressed", "true")
  await shot(page, "tools-svg-legacy")
  await expect(legend(page)).toHaveCount(0)
})
