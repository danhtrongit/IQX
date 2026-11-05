/**
 * Công cụ vẽ đợt 1 của IQLine trên Canvas thật, với API giả lập (không cần backend): vị thế mua và bán, bút vẽ, mũi tên (ba kiểu), nhãn giá,
 * hộp chú thích, khoảng thời gian, khoảng giá và thời gian, elip, tam giác và đường gấp khúc. Cộng thêm thanh công cụ nhóm gọn, công cụ yêu thích và nam châm ba mức.
 *
 * - Vẽ từng công cụ ở máy tính và điện thoại, giao diện sáng và tối: xem trước, hoàn tất, nét thật trên lớp hình vẽ, tay nắm trên lớp trên cùng.
 * - Một vòng đủ ở máy tính sáng: chọn từ danh sách, kéo tay nắm, khoá, ẩn, nhân bản, lưu rồi nạp lại trang.
 * - Đường gấp khúc: Enter, nhấp đúp, nút Xong, Esc và nút Huỷ. Bút vẽ giữ số điểm vừa phải.
 * - Yêu thích và nam châm: không tràn ngang ở điện thoại, được nhớ sau khi nạp lại; nam châm mạnh hút đúng vào O, H, L hoặc C của nến.
 *
 * Ảnh chụp chỉ ghi khi đặt IQLINE_SHOTS=<thư mục> (để xem bằng mắt, không ghi vào repo).
 */
import type { Locator, Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { at, barsFor, chartBox, click, layerHash, layerInk, mockMarket, openChart, park, savedDrawings, SETTLE_MS, shot, useScheme, type Box } from "./iqline-support"

type ToolCase = {
  tool: string
  label: string
  /** Mã nhóm trên thanh công cụ (`data-tool-group`). */
  group: "position" | "shape" | "annotation"
  /** Điểm neo theo tỷ lệ của khung biểu đồ (x từ trái, y từ trên xuống), nằm trong vùng nến. */
  points: [number, number][]
  /** Điểm nằm trên nét của hình (để bấm chọn) và vị trí một tay nắm (để kéo), cùng toạ độ tỷ lệ. */
  grab: [number, number]
  handle: [number, number]
  /** Ít nhất bao nhiêu điểm ảnh trên lớp hình vẽ thì coi là đã vẽ ra nét. */
  minInk: number
  /** Cách hoàn tất sau điểm cuối: bấm thường (mặc định) hay Enter. */
  finish?: "enter"
  /** Số điểm neo đã lưu mong đợi (mặc định bằng số điểm bấm). */
  saved?: number
}

const TOOLS: ToolCase[] = [
  { tool: "long-position", label: "Vị thế mua", group: "position", points: [[0.2, 0.5], [0.46, 0.62]], grab: [0.2, 0.5], handle: [0.2, 0.5], minInk: 600, saved: 3 },
  { tool: "short-position", label: "Vị thế bán", group: "position", points: [[0.2, 0.42], [0.46, 0.28]], grab: [0.2, 0.42], handle: [0.2, 0.42], minInk: 600, saved: 3 },
  { tool: "date-range", label: "Khoảng thời gian", group: "position", points: [[0.14, 0.5], [0.52, 0.5]], grab: [0.14, 0.5], handle: [0.14, 0.5], minInk: 400 },
  { tool: "date-price-range", label: "Khoảng giá và thời gian", group: "position", points: [[0.14, 0.68], [0.52, 0.3]], grab: [0.14, 0.68], handle: [0.14, 0.68], minInk: 500 },
  { tool: "ellipse", label: "Hình elip", group: "shape", points: [[0.14, 0.68], [0.52, 0.3]], grab: [0.33, 0.3], handle: [0.14, 0.68], minInk: 500 },
  { tool: "triangle", label: "Hình tam giác", group: "shape", points: [[0.1, 0.7], [0.3, 0.26], [0.5, 0.64]], grab: [0.1, 0.7], handle: [0.1, 0.7], minInk: 500 },
  { tool: "path", label: "Đường gấp khúc", group: "shape", points: [[0.1, 0.7], [0.24, 0.34], [0.38, 0.62], [0.54, 0.3]], grab: [0.1, 0.7], handle: [0.1, 0.7], minInk: 300, finish: "enter" },
  { tool: "brush", label: "Bút vẽ", group: "shape", points: [[0.1, 0.55], [0.2, 0.3], [0.3, 0.6], [0.4, 0.3], [0.5, 0.58]], grab: [0.1, 0.55], handle: [0.1, 0.3], minInk: 300, saved: 0 },
  { tool: "arrow", label: "Mũi tên", group: "shape", points: [[0.1, 0.7], [0.42, 0.3]], grab: [0.1, 0.7], handle: [0.1, 0.7], minInk: 150 },
  { tool: "arrow-up", label: "Mũi tên lên", group: "shape", points: [[0.24, 0.62]], grab: [0.24, 0.62], handle: [0.24, 0.62], minInk: 60 },
  { tool: "arrow-down", label: "Mũi tên xuống", group: "shape", points: [[0.36, 0.34]], grab: [0.36, 0.34], handle: [0.36, 0.34], minInk: 60 },
  { tool: "price-label", label: "Nhãn giá", group: "annotation", points: [[0.5, 0.44]], grab: [0.5, 0.44], handle: [0.5, 0.44], minInk: 80 },
  { tool: "callout", label: "Hộp chú thích", group: "annotation", points: [[0.4, 0.66], [0.6, 0.36]], grab: [0.4, 0.66], handle: [0.4, 0.66], minInk: 250 },
]

const BY_TOOL = Object.fromEntries(TOOLS.map((tool) => [tool.tool, tool])) as Record<string, ToolCase>

const styleBar = (page: Page, tool: ToolCase): Locator => page.getByRole("toolbar", { name: `Kiểu của ${tool.label}` })

async function pickTool(page: Page, tool: ToolCase): Promise<void> {
  await page.locator(`[data-tool-group="${tool.group}"]`).click()
  await page.locator(`[data-tool="${tool.tool}"]`).click()
  // Công cụ đã bật thì nút nhóm sáng; menu phải biến mất hẳn trước khi bấm lên biểu đồ (menu đang tắt dần vẫn chặn chuột).
  await expect(page.locator(`[data-tool-group="${tool.group}"]`)).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("menu")).toHaveCount(0)
}

/** Đóng menu đang mở bằng Esc và chờ nó biến mất hẳn. */
async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
}

/** Kéo chuột qua các điểm: nhấn ở điểm đầu, đi qua từng điểm, nhả ở điểm cuối. Trả về số điểm ảnh ở lớp trên cùng khi đang kéo (trước khi nhả). */
async function stroke(page: Page, box: Box, points: [number, number][]): Promise<number> {
  const first = at(box, points[0])
  await page.mouse.move(first.x, first.y)
  await page.waitForTimeout(SETTLE_MS)
  await page.mouse.down()
  let midInk = 0
  for (let index = 1; index < points.length; index++) {
    const next = at(box, points[index])
    await page.mouse.move(next.x, next.y, { steps: 12 })
    if (index === points.length - 2) midInk = await layerInk(page, "top")
  }
  await page.waitForTimeout(SETTLE_MS)
  await page.mouse.up()
  await page.waitForTimeout(SETTLE_MS)
  return midInk
}

/**
 * Vẽ một công cụ. Trả về số điểm ảnh ở lớp trên cùng khi đang xem trước: với công cụ nhiều lần bấm là sau khi đã bấm hết trừ điểm cuối và con trỏ ở điểm cuối;
 * với bút vẽ là giữa lúc đang kéo; công cụ một lần bấm không có xem trước nên trả về -1.
 */
async function drawTool(page: Page, tool: ToolCase, box: Box): Promise<number> {
  await pickTool(page, tool)
  if (tool.tool === "brush") return stroke(page, box, tool.points)
  const last = tool.points.length - 1
  for (let index = 0; index < last; index++) {
    const point = at(box, tool.points[index])
    await click(page, point.x, point.y)
  }
  const target = at(box, tool.points[last])
  let previewInk = -1
  if (last > 0) {
    await page.mouse.move(target.x, target.y, { steps: 6 })
    await page.waitForTimeout(SETTLE_MS)
    previewInk = await layerInk(page, "top")
  }
  if (tool.finish === "enter") {
    await click(page, target.x, target.y)
    await page.keyboard.press("Enter")
    await page.waitForTimeout(SETTLE_MS)
  } else {
    await click(page, target.x, target.y)
  }
  return previewInk
}

/** Điểm trống trong vùng nến (không công cụ nào đi qua): bấm vào đây thì bỏ chọn hình. */
const EMPTY: [number, number] = [0.9, 0.78]

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const

async function expectNoPageOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "trang không tràn ngang").toBe(true)
}

/** Thanh công cụ dọc không được tràn ngang và phải nằm gọn trong màn hình. */
async function expectRailFits(page: Page): Promise<void> {
  const rail = page.getByRole("toolbar", { name: "Công cụ vẽ" })
  const fit = await rail.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return { scrollW: element.scrollWidth, clientW: element.clientWidth, left: rect.left, right: rect.right, vw: innerWidth }
  })
  expect(fit.scrollW, "thanh công cụ không tràn ngang").toBeLessThanOrEqual(fit.clientW)
  expect(fit.left).toBeGreaterThanOrEqual(0)
  expect(fit.right).toBeLessThanOrEqual(fit.vw)
}

for (const scheme of ["light", "dark"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`mười ba công cụ đợt 1: vẽ từng công cụ ở ${viewport.name}, giao diện ${scheme}`, async ({ page }) => {
      test.setTimeout(150_000)
      await useScheme(page, scheme)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await mockMarket(page)
      await openChart(page)
      const box = await chartBox(page)
      await expectNoPageOverflow(page)
      await expectRailFits(page)
      expect(await layerInk(page, "drawings")).toBe(0)

      for (const tool of TOOLS) {
        const before = await layerInk(page, "top")
        const previewInk = await drawTool(page, tool, box)
        // Xem trước: các điểm đã bấm và nét chạy theo con trỏ nằm ở lớp trên cùng, trước khi hình hoàn tất.
        if (previewInk >= 0) expect(previewInk, `${tool.tool}: xem trước`).toBeGreaterThan(before + 30)
        // Hoàn tất: hình đang chọn có thanh kiểu, nét thật trên lớp hình vẽ, tay nắm trên lớp trên cùng.
        await expect(styleBar(page, tool), `${tool.tool}: thanh kiểu`).toBeVisible()
        await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: nét trên lớp hình vẽ` }).toBeGreaterThan(tool.minInk)
        await expect.poll(() => layerInk(page, "top"), { message: `${tool.tool}: tay nắm` }).toBeGreaterThan(0)
        await expectNoPageOverflow(page)
        await park(page)
        await shot(page, `${viewport.name}-${scheme}-${tool.tool}`)
        await page.getByRole("button", { name: "Xoá hình", exact: true }).click()
        await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: xoá` }).toBe(0)
      }
    })
  }
}

test("vòng đủ ở máy tính sáng: chọn từ danh sách, kéo tay nắm, khoá, ẩn, nhân bản, lưu rồi nạp lại", async ({ page }) => {
  test.setTimeout(300_000)
  await useScheme(page, "light")
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = await chartBox(page)
  const list = page.getByRole("list", { name: "Hình vẽ trên biểu đồ" })
  const openList = () => page.getByRole("button", { name: "Danh sách hình vẽ" }).click()
  const closeList = async () => {
    await page.keyboard.press("Escape")
    await expect(page.getByText("Danh sách hình vẽ", { exact: true })).toHaveCount(0)
  }
  /** Chọn hình từ danh sách (nếu chưa chọn); dùng khi bấm lên biểu đồ có thể không trúng nét. */
  const selectFromList = async (tool: ToolCase) => {
    await openList()
    const item = list.getByRole("button", { name: tool.label, exact: true })
    if ((await item.getAttribute("aria-pressed")) !== "true") await item.click()
    await closeList()
    await expect(styleBar(page, tool), `${tool.tool}: chọn từ danh sách`).toBeVisible()
  }

  for (const tool of TOOLS) {
    await drawTool(page, tool, box)
    await expect(styleBar(page, tool)).toBeVisible()

    // Bỏ chọn bằng cách bấm vào chỗ trống, rồi chọn lại bằng cách bấm đúng vào một điểm nằm trên nét hình.
    const grab = at(box, tool.grab)
    const empty = at(box, EMPTY)
    await click(page, empty.x, empty.y)
    await expect(styleBar(page, tool), `${tool.tool}: bỏ chọn`).toBeHidden()
    await click(page, grab.x, grab.y)
    await expect(styleBar(page, tool), `${tool.tool}: chọn lại bằng cách bấm vào nét`).toBeVisible()

    // Kéo một tay nắm: lớp hình vẽ đổi.
    const handle = at(box, tool.handle)
    const beforeDrag = await layerHash(page, "drawings")
    const anchorsBeforeDrag = JSON.stringify((await savedDrawings(page))[0].anchors)
    await page.mouse.move(handle.x, handle.y)
    await page.waitForTimeout(SETTLE_MS)
    await page.mouse.down()
    await page.mouse.move(handle.x + 22, handle.y + 16, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => layerHash(page, "drawings"), { message: `${tool.tool}: kéo tay nắm` }).not.toBe(beforeDrag)
    // Kéo tay nắm đổi điểm neo của chính hình này (không phải dịch biểu đồ).
    await expect.poll(async () => JSON.stringify((await savedDrawings(page))[0].anchors), { message: `${tool.tool}: điểm neo đổi` }).not.toBe(anchorsBeforeDrag)

    // Khoá: tay nắm biến mất và kéo vào điểm neo không đổi hình.
    await page.getByRole("button", { name: "Khoá hình" }).click()
    await expect.poll(() => layerInk(page, "top"), { message: `${tool.tool}: khoá bỏ tay nắm` }).toBe(0)
    // So điểm neo đã lưu chứ không so điểm ảnh: kéo trúng chỗ trống (tay nắm của elip nằm ở góc khung, không trên nét) sẽ dịch cả biểu đồ.
    const lockedAnchors = JSON.stringify((await savedDrawings(page))[0].anchors)
    await page.mouse.move(handle.x + 22, handle.y + 16)
    await page.mouse.down()
    await page.mouse.move(handle.x + 70, handle.y + 40, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    expect(JSON.stringify((await savedDrawings(page))[0].anchors), `${tool.tool}: khoá chặn kéo`).toBe(lockedAnchors)
    // Kéo trúng chỗ trống thì bỏ chọn: chọn lại từ danh sách để mở khoá.
    if (!(await styleBar(page, tool).isVisible())) await selectFromList(tool)
    await page.getByRole("button", { name: "Mở khoá hình" }).click()

    // Ẩn rồi hiện lại từ danh sách.
    await page.getByRole("button", { name: "Ẩn hình" }).click()
    await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: ẩn` }).toBe(0)
    await openList()
    await page.getByRole("button", { name: `Hiện ${tool.label}`, exact: true }).click()
    await closeList()
    await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: hiện lại` }).toBeGreaterThan(tool.minInk * 0.6)

    // Nhân bản: chọn từ danh sách, danh sách có hai hình.
    await selectFromList(tool)
    await page.getByRole("button", { name: "Nhân bản hình" }).click()
    await openList()
    await expect(list.getByRole("listitem"), `${tool.tool}: nhân bản`).toHaveCount(2)
    // Xoá tất cả cho công cụ kế tiếp (bấm hai lần để xác nhận).
    await page.getByRole("button", { name: "Xoá tất cả" }).click()
    await page.getByRole("button", { name: "Bấm lần nữa để xoá" }).click()
    await closeList()
    await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: dọn` }).toBe(0)
  }

  // Lưu và nạp lại: vẽ cả mười ba công cụ trên cùng một biểu đồ, kiểm bản đệm rồi tải lại trang.
  for (const tool of TOOLS) {
    await drawTool(page, tool, box)
    await expect(styleBar(page, tool)).toBeVisible()
    const empty = at(box, EMPTY)
    await click(page, empty.x, empty.y)
  }
  await park(page)
  await expect.poll(async () => (await savedDrawings(page)).map((drawing) => drawing.tool)).toEqual(TOOLS.map((tool) => tool.tool))
  const saved = await savedDrawings(page)
  for (const drawing of saved) {
    const tool = BY_TOOL[drawing.tool]
    if (drawing.tool === "brush") {
      // Nét bút được gọn lại: nhiều hơn hai điểm (có uốn) nhưng không quá giới hạn 160, và không điểm nào trùng thời gian ngược chiều.
      expect(drawing.anchors.length, "bút vẽ: số điểm đã lưu").toBeGreaterThan(2)
      expect(drawing.anchors.length).toBeLessThanOrEqual(160)
    } else {
      expect(drawing.anchors.length, `${drawing.tool}: số điểm neo đã lưu`).toBe(tool.saved ?? tool.points.length)
    }
  }
  await shot(page, "desktop-light-all-thirteen")
  const beforeReload = await layerInk(page, "drawings")
  await page.reload()
  await expect(page.locator('[data-iqline-mode="market"]')).toBeVisible()
  await expect.poll(() => layerInk(page, "data"), { timeout: 10_000 }).toBeGreaterThan(200)
  await expect.poll(() => layerInk(page, "drawings"), { message: "nạp lại: hình vẽ về đúng chỗ" }).toBeGreaterThan(beforeReload * 0.9)
  await openList()
  await expect(list.getByRole("listitem")).toHaveCount(TOOLS.length)
  await closeList()
  await shot(page, "desktop-light-all-thirteen-reloaded")
})

test("đường gấp khúc: nhấp đúp hoàn tất, nút Xong, Esc và nút Huỷ", async ({ page }) => {
  test.setTimeout(90_000)
  await useScheme(page, "light")
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = await chartBox(page)
  const tool = BY_TOOL.path
  const pts: [number, number][] = [[0.12, 0.66], [0.26, 0.32], [0.4, 0.6]]
  const finishBar = page.getByRole("toolbar", { name: "Hoàn tất Đường gấp khúc" })

  // Nhấp đúp ở điểm cuối: thêm điểm đó rồi hoàn tất, không thêm điểm trùng.
  await pickTool(page, tool)
  for (const point of pts) {
    const p = at(box, point)
    await click(page, p.x, p.y)
  }
  await expect(finishBar).toContainText("3 điểm")
  await expect(finishBar.getByRole("button", { name: /Xong/ })).toBeEnabled()
  const end = at(box, [0.56, 0.3])
  await page.mouse.move(end.x, end.y)
  await page.waitForTimeout(SETTLE_MS)
  await page.mouse.dblclick(end.x, end.y)
  await expect(styleBar(page, tool)).toBeVisible()
  await expect.poll(async () => (await savedDrawings(page)).map((drawing) => drawing.anchors.length)).toEqual([4])
  await page.getByRole("button", { name: "Xoá hình", exact: true }).click()

  // Nút Xong.
  await pickTool(page, tool)
  for (const point of pts) {
    const p = at(box, point)
    await click(page, p.x, p.y)
  }
  await shot(page, "desktop-light-path-finish-bar")
  await finishBar.getByRole("button", { name: /Xong/ }).click()
  await expect(styleBar(page, tool)).toBeVisible()
  await expect.poll(async () => (await savedDrawings(page)).map((drawing) => drawing.anchors.length)).toEqual([3])
  await page.getByRole("button", { name: "Xoá hình", exact: true }).click()

  // Esc huỷ: không có hình nào được thêm và lớp trên cùng sạch.
  await pickTool(page, tool)
  for (const point of pts.slice(0, 2)) {
    const p = at(box, point)
    await click(page, p.x, p.y)
  }
  await page.keyboard.press("Escape")
  await expect(finishBar).toBeHidden()
  await park(page)
  await expect.poll(() => layerInk(page, "drawings")).toBe(0)
  expect(await savedDrawings(page)).toHaveLength(0)

  // Nút Huỷ.
  await pickTool(page, tool)
  const p0 = at(box, pts[0])
  await click(page, p0.x, p0.y)
  await finishBar.getByRole("button", { name: /Huỷ/ }).click()
  await expect(finishBar).toBeHidden()
  await park(page)
  await expect.poll(() => layerInk(page, "drawings")).toBe(0)
  expect(await savedDrawings(page)).toHaveLength(0)
})

test("bút vẽ: kéo một nét dài chỉ giữ số điểm vừa phải và không thêm hình khi chỉ bấm", async ({ page }) => {
  test.setTimeout(90_000)
  await useScheme(page, "light")
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = await chartBox(page)
  const tool = BY_TOOL.brush
  await pickTool(page, tool)
  // Nét dài, nhiều điểm: đường sin qua gần hết khung.
  const wave: [number, number][] = Array.from({ length: 60 }, (_, index) => [0.08 + index * 0.012, 0.46 + Math.sin(index / 4) * 0.14] as [number, number])
  await stroke(page, box, wave)
  await expect(styleBar(page, tool)).toBeVisible()
  const [drawing] = await savedDrawings(page)
  expect(drawing.tool).toBe("brush")
  expect(drawing.anchors.length).toBeGreaterThan(8)
  expect(drawing.anchors.length).toBeLessThanOrEqual(160)
  // Mọi neo là điểm hữu hạn có thời gian và giá.
  expect(drawing.anchors.every((anchor) => Number.isFinite(anchor.time) && Number.isFinite(anchor.price))).toBe(true)
  await page.getByRole("button", { name: "Xoá hình", exact: true }).click()
  // Chỉ bấm một cái (không kéo) thì không tạo nét.
  await pickTool(page, tool)
  const p = at(box, [0.5, 0.5])
  await click(page, p.x, p.y)
  await park(page)
  await expect.poll(() => layerInk(page, "drawings")).toBe(0)
  expect(await savedDrawings(page)).toHaveLength(0)
})

test("hộp chú thích có ô nhập chữ: gõ chữ thì chữ hiện trên biểu đồ và được lưu", async ({ page }) => {
  test.setTimeout(90_000)
  await useScheme(page, "light")
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = await chartBox(page)
  const tool = BY_TOOL.callout
  await drawTool(page, tool, box)
  await expect(styleBar(page, tool)).toBeVisible()
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(tool.minInk)
  const before = await layerHash(page, "drawings")
  await page.getByRole("textbox", { name: "Nội dung ghi chú" }).fill("Vùng hỗ trợ mạnh")
  await expect.poll(() => layerHash(page, "drawings"), { message: "chữ vẽ lên hộp" }).not.toBe(before)
  await expect.poll(async () => (await savedDrawings(page))[0]?.text).toBe("Vùng hỗ trợ mạnh")
  await park(page)
  await shot(page, "desktop-light-callout-text")
})

for (const viewport of VIEWPORTS) {
  test(`yêu thích: đánh sao, hàng truy cập nhanh, tối đa 8, nhớ sau khi nạp lại, không tràn ở ${viewport.name}`, async ({ page }) => {
    test.setTimeout(90_000)
    await useScheme(page, "dark")
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await mockMarket(page)
    await openChart(page)
    const rail = page.getByRole("toolbar", { name: "Công cụ vẽ" })
    const favorites = rail.getByRole("group", { name: "Công cụ yêu thích" })
    await expect(favorites).toHaveCount(0)

    // Đánh sao một công cụ trong menu nhóm: menu vẫn mở, công cụ chưa được chọn.
    await page.locator('[data-tool-group="annotation"]').click()
    await page.locator('[data-favorite-toggle="callout"]').click()
    await expect(page.locator('[data-tool="callout"]')).toBeVisible()
    await page.waitForTimeout(300)
    await shot(page, `${viewport.name}-dark-favorites-menu`)
    await closeMenu(page)
    await expect(favorites.getByRole("button")).toHaveCount(1)
    await expect(page.getByRole("toolbar", { name: /^Hoàn tất|^Kiểu của/ })).toHaveCount(0)
    await expectRailFits(page)

    // Bấm vào hàng yêu thích thì bật đúng công cụ và vẽ được.
    await favorites.getByRole("button", { name: "Hộp chú thích" }).click()
    await expect(favorites.getByRole("button", { name: "Hộp chú thích" })).toHaveAttribute("aria-pressed", "true")
    const box = await chartBox(page)
    const a = at(box, [0.4, 0.66])
    const b = at(box, [0.6, 0.36])
    await click(page, a.x, a.y)
    await click(page, b.x, b.y)
    await expect(styleBar(page, BY_TOOL.callout)).toBeVisible()
    await page.getByRole("button", { name: "Xoá hình", exact: true }).click()

    // Đánh sao đến đủ 8: các sao còn lại bị khoá.
    const picks: [string, string][] = [
      ["shape", "ellipse"],
      ["shape", "triangle"],
      ["shape", "brush"],
      ["shape", "arrow"],
      ["position", "long-position"],
      ["position", "date-range"],
      ["annotation", "price-label"],
    ]
    for (const [group, tool] of picks) {
      await page.locator(`[data-tool-group="${group}"]`).click()
      await page.locator(`[data-favorite-toggle="${tool}"]`).click()
      await closeMenu(page)
    }
    await expect(favorites.getByRole("button")).toHaveCount(8)
    await page.locator('[data-tool-group="annotation"]').click()
    await expect(page.locator('[data-favorite-toggle="note"]')).toBeDisabled()
    await shot(page, `${viewport.name}-dark-favorites-full`)
    await closeMenu(page)
    await expectRailFits(page)
    await expectNoPageOverflow(page)
    // Thanh dọc không đẩy biểu đồ ra ngoài màn hình: khung biểu đồ vẫn rộng đủ để vẽ.
    expect((await chartBox(page)).width).toBeGreaterThan(viewport.width === 390 ? 250 : 800)

    // Nhớ sau khi nạp lại (cùng tài khoản khách trên máy này).
    await page.reload()
    await expect(page.locator('[data-iqline-mode="market"]')).toBeVisible()
    await expect(rail.getByRole("group", { name: "Công cụ yêu thích" }).getByRole("button")).toHaveCount(8)
    await expectRailFits(page)
    await park(page)
    await shot(page, `${viewport.name}-dark-favorites-reloaded`)

    // Bỏ sao thì hàng ngắn lại.
    await page.locator('[data-tool-group="annotation"]').click()
    await page.locator('[data-favorite-toggle="callout"]').click()
    await closeMenu(page)
    await expect(rail.getByRole("group", { name: "Công cụ yêu thích" }).getByRole("button")).toHaveCount(7)
  })
}

test("yêu thích: kho trình duyệt bị chặn thì thanh vẫn hiện đúng và yêu thích chạy trong phiên", async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    // Chặn các khoá của thanh công cụ (đọc và ghi đều ném), để các phần khác của trang chạy bình thường.
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("iqx.iqline_tool_") || key === "iqx.iqline_magnet_v1") throw new DOMException("chặn", "SecurityError")
      return getItem.call(this, key)
    }
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("iqx.iqline_tool_") || key === "iqx.iqline_magnet_v1") throw new DOMException("đầy", "QuotaExceededError")
      return setItem.call(this, key, value)
    }
  })
  await useScheme(page, "light")
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMarket(page)
  await openChart(page)
  const rail = page.getByRole("toolbar", { name: "Công cụ vẽ" })
  await expect(rail.locator("[data-tool-group]")).toHaveCount(7)
  await expect(rail.getByRole("group", { name: "Công cụ yêu thích" })).toHaveCount(0)
  await page.locator('[data-tool-group="annotation"]').click()
  await page.locator('[data-favorite-toggle="price-label"]').click()
  await closeMenu(page)
  await expect(rail.getByRole("group", { name: "Công cụ yêu thích" }).getByRole("button")).toHaveCount(1)
  await expectRailFits(page)
  // Nam châm cũng chạy trong phiên dù không lưu được.
  await rail.getByRole("button", { name: /^Nam châm/ }).click()
  await page.getByRole("menuitemradio", { name: /^Mạnh/ }).click()
  await expect(rail.locator("[data-magnet]")).toHaveAttribute("data-magnet", "strong")
})

/** Nến giả lập của FPT khung ngày, đúng như route giả cho: để so điểm neo với O, H, L, C thật. */
function mockBars() {
  return barsFor("FPT", "1D", "2025-01-01", "2026-11-05")
}

test("nam châm ba mức: tắt và yếu giữ nguyên chỗ bấm xa nến, mạnh hút vào đúng O, H, L hoặc C của nến gần nhất, và được nhớ", async ({ page }) => {
  test.setTimeout(150_000)
  await useScheme(page, "light")
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = await chartBox(page)
  const rail = page.getByRole("toolbar", { name: "Công cụ vẽ" })
  const magnet = () => rail.locator("[data-magnet]")
  const tool = BY_TOOL["arrow-up"]
  // Điểm xa mọi nến: sát mép trên của khung, nơi chỉ có lưới.
  const far: [number, number] = [0.45, 0.07]

  const bars = mockBars()
  const nearestOhlc = (anchor: { time?: number; price: number }) => {
    const bar = bars.find((item) => item.time === anchor.time)
    if (!bar) return null
    return [bar.open, bar.high, bar.low, bar.close].some((value) => Math.abs(value - anchor.price) < 1e-6) ? bar : null
  }

  const drawOne = async () => {
    await pickTool(page, tool)
    const point = at(box, far)
    await click(page, point.x, point.y)
    await expect(styleBar(page, tool)).toBeVisible()
    const [drawing] = await savedDrawings(page)
    await page.getByRole("button", { name: "Xoá hình", exact: true }).click()
    return drawing.anchors[0]
  }
  const choose = async (name: RegExp) => {
    await magnet().click()
    await page.getByRole("menuitemradio", { name }).click()
    await expect(page.getByRole("menu")).toHaveCount(0)
  }

  // Tắt (mặc định).
  await expect(magnet()).toHaveAttribute("data-magnet", "off")
  await expect(magnet()).toHaveAttribute("aria-label", "Nam châm hút vào giá OHLC: Tắt")
  const off = await drawOne()
  expect(nearestOhlc(off), "tắt: giá giữ nguyên chỗ bấm").toBeNull()

  // Yếu: chỉ hút khi gần, nên điểm xa vẫn giữ nguyên.
  await choose(/^Yếu/)
  await expect(magnet()).toHaveAttribute("data-magnet", "weak")
  const weak = await drawOne()
  expect(nearestOhlc(weak), "yếu: điểm xa không bị hút").toBeNull()

  // Mạnh: luôn hút vào O, H, L hoặc C của nến gần nhất, bất kể xa bao nhiêu.
  await choose(/^Mạnh/)
  await expect(magnet()).toHaveAttribute("data-magnet", "strong")
  await expect(magnet()).toHaveAttribute("aria-label", "Nam châm hút vào giá OHLC: Mạnh")
  const strong = await drawOne()
  expect(nearestOhlc(strong), "mạnh: neo nằm đúng trên một giá O, H, L hoặc C của một nến").not.toBeNull()
  await shot(page, "desktop-light-magnet-strong")

  // Được nhớ sau khi nạp lại.
  await page.reload()
  await expect(page.locator('[data-iqline-mode="market"]')).toBeVisible()
  await expect(magnet()).toHaveAttribute("data-magnet", "strong")
})

test("nam châm: menu ba mức không tràn ở điện thoại", async ({ page }) => {
  test.setTimeout(60_000)
  await useScheme(page, "dark")
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMarket(page)
  await openChart(page)
  await page.getByRole("toolbar", { name: "Công cụ vẽ" }).getByRole("button", { name: /^Nam châm/ }).click()
  const items = page.getByRole("menuitemradio")
  await expect(items).toHaveCount(3)
  const menu = page.getByRole("menu")
  const rect = await menu.evaluate((element: HTMLElement) => {
    const r = element.getBoundingClientRect()
    return { left: r.left, right: r.right, vw: innerWidth }
  })
  expect(rect.left).toBeGreaterThanOrEqual(0)
  expect(rect.right).toBeLessThanOrEqual(rect.vw)
  await page.waitForTimeout(300) // chờ menu hiện hết hiệu ứng rồi mới chụp
  await shot(page, "phone-dark-magnet-menu")
  await closeMenu(page)
  for (const group of ["line", "fib", "pitchfork", "pattern", "shape", "position", "annotation"]) {
    await page.locator(`[data-tool-group="${group}"]`).click()
    const groupMenu = page.getByRole("menu")
    const box = await groupMenu.evaluate((element: HTMLElement) => {
      const r = element.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight }
    })
    expect(box.left, `${group}: menu không tràn trái`).toBeGreaterThanOrEqual(0)
    expect(box.right, `${group}: menu không tràn phải`).toBeLessThanOrEqual(box.vw)
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(box.vh)
    if (group === "position" || group === "shape") {
      await page.waitForTimeout(300) // chờ menu hiện hết hiệu ứng rồi mới chụp
      await shot(page, `phone-dark-menu-${group}`)
    }
    await closeMenu(page)
  }
})
