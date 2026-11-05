/**
 * Hàm dùng chung cho các spec e2e của biểu đồ IQLine trong Flashback (`flashback-tools.spec.ts`): mở ván bằng API giả lập, đọc khung nhìn,
 * đổi phiên và giá thành toạ độ màn hình, ghi lại chữ canvas đã vẽ (canvas không có DOM để đọc) và chụp ảnh khi đặt FLASHBACK_SHOTS.
 * `flashback-iqline.spec.ts` có bản riêng của các hàm này từ trước.
 */
import path from "node:path"
import type { Locator, Page } from "@playwright/test"
import { expect, seedMember } from "./fixtures"
import { PLAY_BARS, START_STEP, VIEW_BARS, mockFlashback } from "./flashback-support"

export const SHOTS = process.env.FLASHBACK_SHOTS
export const TOTAL_SLOTS = VIEW_BARS + PLAY_BARS
/** Chỉ số ô cuối cùng của nến đã mở khi vào ván (phiên 0 là nến cuối của phần lịch sử). */
export const LAST_OPEN = VIEW_BARS + START_STEP - 1
/** Bề rộng trục giá bên phải khung vẽ của IQLine. */
export const AXIS_RIGHT = 62

export async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

/** Chụp riêng một khung (gồm cả phần nằm ngoài màn hình). */
export async function shotOf(target: Locator, name: string) {
  if (!SHOTS) return
  await target.scrollIntoViewIfNeeded()
  await target.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

export const root = (page: Page) => page.locator('[data-iqline-root="flashback"]')
export const canvasTop = (page: Page) => page.locator('[data-iqline-mode="flashback"] canvas[data-iqline-layer="top"]')
export const legend = (page: Page) => page.getByRole("group", { name: "Chú giải biểu đồ" })
export const groupsBar = (page: Page) => page.getByRole("toolbar", { name: "Công cụ vẽ" })
export const extrasBar = (page: Page) => page.getByRole("toolbar", { name: "Nam châm và danh sách hình vẽ" })

export async function useScheme(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript((value) => localStorage.setItem("theme", value), scheme)
}

/** Điểm ảnh có nội dung của một lớp canvas (`base`, `data`, `drawings`, `top`). */
export async function layerInk(page: Page, layer: string): Promise<number> {
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

export async function inkOf(page: Page): Promise<number> {
  return (await Promise.all(["base", "data"].map((layer) => layerInk(page, layer)))).reduce((sum, value) => sum + value, 0)
}

/** Ghi lại mọi chữ canvas đã vẽ: bọc `fillText` trước khi trang chạy. */
export async function recordCanvasText(page: Page) {
  await page.addInitScript(() => {
    const store: [string, number, number][] = []
    ;(window as unknown as { __fillTexts: typeof store }).__fillTexts = store
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, ...rest: [number?]) {
      store.push([String(text), x, y])
      return original.call(this, text, x, y, ...rest)
    }
  })
}

/** Chữ canvas đã vẽ: canvas vẽ số từng ký tự nên các ký tự liền nhau cùng dòng được ghép lại thành nhãn. `reset` xoá bản ghi sau khi đọc. */
export async function drawnLabels(page: Page, reset = false): Promise<string[]> {
  return page.evaluate((clear) => {
    const store = (window as unknown as { __fillTexts: [string, number, number][] }).__fillTexts
    const out: string[] = []
    let current = ""
    let last: [number, number] | null = null
    for (const [text, x, y] of store) {
      if (last && y === last[1] && x > last[0] && x - last[0] < 16) current += text
      else {
        if (current) out.push(current)
        current = text
      }
      last = [x, y]
    }
    if (current) out.push(current)
    if (clear) store.length = 0
    return out
  }, reset)
}

export async function viewportOf(page: Page): Promise<[number, number]> {
  const [from, to] = ((await root(page).getAttribute("data-viewport")) ?? "0,0").split(",").map(Number)
  return [from, to]
}

/** Toạ độ màn hình của ô `session` trên trục (theo khung nhìn hiện tại) và độ cao `y` tính từ đỉnh biểu đồ. */
export async function pointOf(page: Page, session: number, y: number) {
  const box = (await canvasTop(page).boundingBox())!
  const [from, to] = await viewportOf(page)
  return { x: box.x + ((session - from) / (to - from)) * (box.width - AXIS_RIGHT), y: box.y + y }
}

/** Mở màn chơi: sảnh, tạo phòng, bắt đầu. `iqline` false mở biểu đồ SVG cũ (`?iqline=0`). */
export async function openMatch(page: Page, iqline = true) {
  await recordCanvasText(page)
  await seedMember(page)
  await mockFlashback(page)
  await page.goto(`/demo-trading?view=flashback&iqline=${iqline ? "1" : "0"}`)
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

/** Chọn một công cụ ở menu nhóm: mở nhóm `group` (mã nhóm như `line`, `fib`, `position`) rồi chọn mục theo mã công cụ (tên truy cập của mục có cả nút ngôi sao yêu thích). */
export async function pickTool(page: Page, group: string, tool: string) {
  await groupsBar(page).locator(`[data-tool-group="${group}"]`).click()
  await page.locator(`[role="menuitem"][data-tool="${tool}"]`).click()
  // Menu đang đóng dần vẫn nằm trên biểu đồ và nhận cú bấm: chờ nó biến mất rồi mới vẽ.
  await expect(page.getByRole("menu")).toHaveCount(0)
}

/** Cuộn của trang: cả cửa sổ lẫn khung cuộn của màn chơi (ScrollArea), để chứng minh lăn chuột trên biểu đồ không làm trang cuộn. */
export async function pageScroll(page: Page): Promise<{ window: number; area: number }> {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-iqline-root]')?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    return { window: window.scrollY, area: viewport?.scrollTop ?? 0 }
  })
}
