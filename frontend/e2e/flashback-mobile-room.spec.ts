/**
 * Phòng chờ Flashback trên điện thoại: Rời phòng, Chat, Sẵn sàng hoặc Bắt đầu luôn nằm trong màn hình và
 * bấm được, kể cả phòng đông và màn hình thấp; cuộn hết danh sách người chơi thì cuộn tiếp được ra trang.
 */
import type { Page, Route } from "@playwright/test"
import { expect, seedMember, test } from "./fixtures"
import { ROOM_ID, noHorizontalOverflow } from "./flashback-support"

const SHOTS = process.env.FLASHBACK_SHOTS

function room(owner: boolean, count: number, maxPlayers: number) {
  const me = owner ? 0 : 1
  return {
    auto_close_at: null,
    chat_enabled: true,
    created_at: "2026-10-30T01:00:00.000Z",
    id: ROOM_ID,
    is_owner: owner,
    locked: false,
    match: null,
    max_players: maxPlayers,
    members: Array.from({ length: count }, (_, index) => ({
      avatar_url: null,
      is_me: index === me,
      is_owner: index === 0,
      joined_at: "2026-10-30T01:00:00.000Z",
      name: `Người chơi ${index + 1}`,
      ready: false,
      user_id: index === me ? "member-1" : `member-x${index}`,
    })),
    minutes: 10,
    owner_id: me === 0 ? "member-1" : "member-x0",
    play_bars: 30,
    server_now: "2026-10-30T01:00:30.000Z",
    stake_xu: 100,
    status: "waiting",
    view_bars: 60,
  }
}

const incoming = (id: string) => ({
  created_at: "2026-10-30T01:00:10.000Z",
  id,
  is_me: false,
  name: "Người chơi 3",
  phien: 0,
  text: "Vào đi cả nhà",
  user_id: "member-x2",
  waiting: true,
})

async function mockRoom(page: Page, owner: boolean, count: number, maxPlayers: number) {
  const state = { messages: [] as ReturnType<typeof incoming>[] }
  async function json(route: Route, body: unknown) {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
  }
  await page.route("**/api/v2/flashback/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v2/, "")
    const current = room(owner, count, maxPlayers)
    if (path === "/flashback/rooms/me") return json(route, { room: current, notice: null, kicked: false })
    if (path === `/flashback/rooms/${ROOM_ID}`) return json(route, current)
    if (path === `/flashback/rooms/${ROOM_ID}/chat`) return json(route, { enabled: true, messages: state.messages, muted: [] })
    return json(route, {})
  })
  return state
}

/** Nút nằm trọn trong màn hình và không bị thứ gì khác đè lên. */
async function expectTappable(page: Page, testId: string | null, name?: RegExp) {
  const button = testId ? page.getByTestId(testId) : page.getByRole("button", { name: name! })
  await expect(button).toBeVisible()
  const box = (await button.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  const hit = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    // Nút đang khoá (chờ người khác) không nhận con trỏ nên điểm rơi vào chính thanh chứa nó.
    return !!top?.closest("[data-testid=flashback-room-actions]")
  })
  expect(hit).toBe(true)
}

for (const [width, height] of [[320, 568], [390, 660], [844, 390]] as const) {
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true })

    for (const [label, owner, count, maxPlayers] of [
      ["người chơi, phòng 4 người", false, 2, 4],
      ["chủ phòng đang chờ, phòng 30 người", true, 20, 30],
    ] as const) {
      test(`${label}: Rời phòng, Chat và nút chính luôn trong màn hình`, async ({ page }) => {
        await seedMember(page)
        await mockRoom(page, owner, count, maxPlayers)
        await page.goto("/demo-trading?view=flashback")
        await expect(page.getByTestId("flashback-room-id")).toHaveText(ROOM_ID)

        const primary = owner ? /^Bắt đầu/ : /^Sẵn sàng$/
        for (const check of [
          () => expectTappable(page, null, /^Rời phòng$/),
          () => expectTappable(page, "flashback-chat-room-mobile"),
          () => expectTappable(page, null, primary),
        ]) await check()
        // Một hàng nút, không rớt dòng làm thanh cao lên.
        const tops = await page.getByTestId("flashback-room-actions").getByRole("button").evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)))
        expect(new Set(tops).size).toBe(1)
        expect(await noHorizontalOverflow(page)).toBe(true)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/room-${width}-${owner ? "owner" : "player"}.png` })

        // Cuộn tới cuối trang: ô cuối cùng không bị thanh đáy che.
        const scroller = page.locator("[data-testid=workspace-frame] main [data-slot=scroll-area-viewport]").first()
        await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight })
        const bar = (await page.getByTestId("flashback-room-actions").boundingBox())!
        // Khung danh sách người chơi (phòng đông tự cuộn bên trong, nên đo khung chứ không đo cả lưới).
        const nested = page.getByTestId("flashback-slots").locator("xpath=ancestor::*[@data-slot='scroll-area-viewport'][1]")
        const slots = (await nested.boundingBox())!
        expect(slots.y + slots.height).toBeLessThanOrEqual(bar.y + 1)
        await expectTappable(page, null, /^Rời phòng$/)

        // Cuộn hết danh sách thì cuộn tiếp ra trang, không kẹt lại trong danh sách.
        await expect(nested).toHaveCSS("overscroll-behavior-y", "auto")
      })
    }

    test("Chat mở khung kéo từ dưới lên, có số tin chưa đọc, đóng lại vẫn còn nút", async ({ page }) => {
      await seedMember(page)
      const state = await mockRoom(page, false, 3, 4)
      await page.goto("/demo-trading?view=flashback")
      await expect(page.getByTestId("flashback-room-id")).toHaveText(ROOM_ID)
      const chatButton = page.getByTestId("flashback-chat-room-mobile")
      await expect(chatButton).toBeVisible()
      await expect(page.getByTestId("flashback-chat")).toHaveCount(0)

      // Chờ lần đọc chat đầu về (tin có sẵn coi như đã đọc), rồi có tin mới.
      await page.waitForResponse((response) => response.url().endsWith("/chat"))
      state.messages.push(incoming("c1"))
      await expect(chatButton).toContainText("1", { timeout: 6_000 })

      await chatButton.click()
      const box = page.getByTestId("flashback-chat")
      await expect(box.getByText("Vào đi cả nhà")).toBeVisible()
      await expect(box.getByRole("textbox")).toBeVisible()
      // Khung còn đang trượt lên một lúc sau khi hiện.
      await expect.poll(async () => {
        const rect = (await box.boundingBox())!
        return rect.y + rect.height
      }).toBeLessThanOrEqual(height + 1)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/room-${width}-chat.png` })

      await box.getByRole("button", { name: "Đóng chat" }).click()
      await expect(box).toHaveCount(0)
      await expect(chatButton).toHaveText("Chat")
      await expectTappable(page, "flashback-chat-room-mobile")
    })
  })
}
