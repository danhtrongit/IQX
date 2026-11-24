import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "@/pages/demo-trading/bot/test-render"
import { callsTo, createFakeApi, createWorld, type World } from "@/pages/demo-trading/bot/test-support"
import { FALLBACK_LINK, TYPE_LABEL, type NotificationItem, type OfficeNotificationType } from "@/pages/notifications/api"

import { NotificationBell } from "./notification-bell"

const mocks = vi.hoisted(() => ({ api: vi.fn(), auth: { isAuthenticated: true } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.auth.isAuthenticated ? { id: "user-1" } : null, isAuthenticated: mocks.auth.isAuthenticated, isLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("@/pages/demo-trading/bot/test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})

const item = (partial: Partial<NotificationItem> & Pick<NotificationItem, "id" | "type">): NotificationItem => ({
  trade_date: "2026-11-06",
  title: partial.type === "bot_trades" ? "Bot giao dịch · phiên 06/11" : "Bản tin cuối phiên 06/11",
  body: partial.type === "bot_trades" ? "Mua HPG, FPT · Bán VNM (hết thời gian giữ)" : "VN-Index 1.755,61 (−0,63%) · 14 mã trong 3 bộ lọc",
  link: partial.type === "bot_trades" ? "/luyen-tap?tool=bot&bot_tab=lich-su" : "/thi-truong?bt=ban-tin&date=2026-11-06",
  read_at: null,
  created_at: "2026-11-06T12:30:00Z",
  ...partial,
})

const OFFICE_CASES: ReadonlyArray<{
  id: string
  type: OfficeNotificationType
  label: string
  iconClass: string
  title: string
  body: string
  expectedLink:
    | "/khu-giao-dich?phong=van-phong&modal=mine"
    | "/khu-giao-dich?phong=van-phong&modal=mgr"
}> = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    type: "office_task_assigned",
    label: "Giao nhiệm vụ",
    iconClass: "text-primary",
    title: "Nhiệm vụ mới",
    body: 'Sếp giao nhiệm vụ ngày "Gọi 10 khách hàng"',
    expectedLink: "/khu-giao-dich?phong=van-phong&modal=mine",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    type: "office_task_approved",
    label: "Duyệt nhiệm vụ",
    iconClass: "text-price-up",
    title: "Nhiệm vụ đã được duyệt",
    body: 'Sếp đã duyệt "Gọi 10 khách hàng" · +10 điểm',
    expectedLink: "/khu-giao-dich?phong=van-phong&modal=mine",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    type: "office_task_returned",
    label: "Cần làm lại",
    iconClass: "text-destructive",
    title: "Nhiệm vụ cần làm lại",
    body: 'Sếp trả lại "Chia sẻ bản tin lên nhóm Zalo"',
    expectedLink: "/khu-giao-dich?phong=van-phong&modal=mine",
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    type: "office_proposal_replied",
    label: "Trả lời đề xuất",
    iconClass: "text-price-floor",
    title: "Sếp đã trả lời đề xuất",
    body: "Sếp đã trả lời đề xuất của bạn",
    expectedLink: "/khu-giao-dich?phong=van-phong&modal=mine",
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    type: "office_task_submitted",
    label: "Chờ xác nhận",
    iconClass: "text-status-warning",
    title: "Chờ xác nhận nhiệm vụ",
    body: 'Lê Ngọc Hạnh gửi xác nhận "Gọi 10 khách hàng"',
    expectedLink: "/khu-giao-dich?phong=van-phong&modal=mgr",
  },
  {
    id: "00000000-0000-4000-8000-000000000106",
    type: "office_proposal_sent",
    label: "Đề xuất mới",
    iconClass: "text-accent",
    title: "Đề xuất mới",
    body: "Trần Thị Bình gửi đề xuất mới",
    expectedLink: "/khu-giao-dich?phong=van-phong&modal=mgr",
  },
]

function LocationStateProbe() {
  const location = useLocation()
  const state = location.state as { notificationId?: string } | null
  return (
    <>
      <output data-testid="location-key">{location.key}</output>
      <output data-testid="location-notification-id">{state?.notificationId ?? ""}</output>
    </>
  )
}

let world: World

beforeEach(() => {
  mocks.auth.isAuthenticated = true
  world = createWorld({
    notifications: [
      item({ id: "00000000-0000-4000-8000-000000000001", type: "bot_trades" }),
      item({ id: "00000000-0000-4000-8000-000000000002", type: "bulletin" }),
      item({ id: "00000000-0000-4000-8000-000000000003", type: "bulletin", trade_date: "2026-11-05", title: "Bản tin cuối phiên 05/11", read_at: "2026-11-05T13:00:00Z" }),
    ],
  })
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

describe("Header bell (v2.0 §8.3 & Khu Văn phòng §12)", () => {
  it("is not shown to a guest", () => {
    mocks.auth.isAuthenticated = false
    renderBot(<NotificationBell />)
    expect(screen.queryByTestId("notification-bell")).toBeNull()
  })

  it("shows the unread count and hides it at 0", async () => {
    renderBot(<NotificationBell />)
    expect((await screen.findByTestId("notification-badge")).textContent).toBe("2")
    expect(screen.getByRole("button", { name: "Thông báo, 2 chưa đọc" })).toBeTruthy()
    expect(callsTo(world, "GET", "/me/notifications/unread-count")).toHaveLength(1)
  })

  it("lists the newest 50 with title, one line and the unread dot + tint; a click marks it read and opens Bot › Lịch sử (T09)", async () => {
    const user = userEvent.setup()
    renderBot(<NotificationBell />, "/chien-luoc")
    await user.click(await screen.findByTestId("notification-bell"))
    const list = await screen.findByRole("list", { name: "Danh sách thông báo" })
    expect(callsTo(world, "GET", "/me/notifications")[0]!.query).toBe("?limit=50")
    const entries = within(list).getAllByRole("button")
    expect(entries).toHaveLength(3)
    expect(entries[0]!.textContent).toContain("Bot giao dịch · phiên 06/11")
    expect(entries[0]!.textContent).toContain("Mua HPG, FPT · Bán VNM (hết thời gian giữ)")
    expect(entries[0]!.getAttribute("data-unread")).toBe("true")
    expect(entries[0]!.className).toContain("bg-primary/10")
    expect(within(entries[0]!).getByLabelText("Chưa đọc")).toBeTruthy()
    expect(entries[2]!.getAttribute("data-unread")).toBeNull()
    expect(entries[2]!.className).not.toContain("bg-primary/10")
    expect(within(entries[2]!).queryByLabelText("Chưa đọc")).toBeNull()

    await user.click(entries[0]!)
    await waitFor(() => expect(callsTo(world, "POST", "/me/notifications/read")).toHaveLength(1))
    expect(callsTo(world, "POST", "/me/notifications/read")[0]!.body).toEqual({ id: "00000000-0000-4000-8000-000000000001" })
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=bot&bot_tab=lich-su")
    await waitFor(() => expect(screen.getByTestId("notification-badge").textContent).toBe("1"))
  })

  it("a bulletin opens its link; Đánh dấu đã đọc hết marks all and hides the count", async () => {
    const user = userEvent.setup()
    renderBot(<NotificationBell />)
    await user.click(await screen.findByTestId("notification-bell"))
    await user.click(await screen.findByRole("button", { name: "Đánh dấu đã đọc hết" }))
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).toBeNull())
    expect(callsTo(world, "POST", "/me/notifications/read")[0]!.body).toEqual({ all: true })
    const list = screen.getByRole("list", { name: "Danh sách thông báo" })
    await user.click(within(list).getAllByRole("button")[1]!)
    expect(screen.getByTestId("location").textContent).toBe("/thi-truong?bt=ban-tin&date=2026-11-06")
    expect(callsTo(world, "POST", "/me/notifications/read")).toHaveLength(1)
  })

  it("Cài đặt thông báo opens the Bot panel on the THÔNG BÁO card (T10)", async () => {
    const user = userEvent.setup()
    renderBot(<NotificationBell />, "/chien-luoc")
    await user.click(await screen.findByTestId("notification-bell"))
    await user.click(await screen.findByRole("button", { name: "Cài đặt thông báo" }))
    expect(screen.getByTestId("location").textContent).toBe("/luyen-tap?tool=bot&focus=thong-bao")
  })

  it("says so when there is nothing", async () => {
    world.notifications = []
    const user = userEvent.setup()
    renderBot(<NotificationBell />)
    await user.click(await screen.findByTestId("notification-bell"))
    expect(await screen.findByText("Chưa có thông báo.")).toBeTruthy()
    expect(screen.queryByTestId("notification-badge")).toBeNull()
  })

  it("renders all 6 office notification types with distinct icons, labels, and unread/read styling", async () => {
    world.notifications = OFFICE_CASES.map((office, index) =>
      item({
        id: office.id,
        type: office.type,
        title: office.title,
        body: office.body,
        link: office.expectedLink,
        read_at: index === 3 ? "2026-11-06T12:45:00Z" : null,
      }),
    )

    const user = userEvent.setup()
    renderBot(<NotificationBell />, "/chien-luoc")
    expect((await screen.findByTestId("notification-badge")).textContent).toBe("5")

    await user.click(screen.getByTestId("notification-bell"))
    const list = await screen.findByRole("list", { name: "Danh sách thông báo" })
    const entries = within(list).getAllByRole("button")
    expect(entries).toHaveLength(6)

    OFFICE_CASES.forEach((office, index) => {
      const entry = entries[index]!
      expect(entry.getAttribute("data-notification-type")).toBe(office.type)
      expect(within(entry).getByTestId("notification-type-label").textContent).toBe(TYPE_LABEL[office.type])
      expect(within(entry).getByTestId("notification-type-label").textContent).toBe(office.label)
      expect(entry.textContent).toContain(office.title)
      expect(entry.textContent).toContain(office.body)

      const icon = within(entry).getByTestId("notification-icon")
      expect(icon.getAttribute("data-notification-type")).toBe(office.type)
      expect(icon.getAttribute("class")).toContain(office.iconClass)

      if (index === 3) {
        expect(entry.getAttribute("data-unread")).toBeNull()
        expect(entry.className).not.toContain("bg-primary/10")
        expect(within(entry).queryByLabelText("Chưa đọc")).toBeNull()
      } else {
        expect(entry.getAttribute("data-unread")).toBe("true")
        expect(entry.className).toContain("bg-primary/10")
        expect(within(entry).getByLabelText("Chưa đọc")).toBeTruthy()
      }
    })
  })

  it.each(OFFICE_CASES)(
    "clicking $type marks it read and navigates to $expectedLink (including fallback when link is empty)",
    async (office) => {
      world.notifications = [
        item({
          id: office.id,
          type: office.type,
          title: office.title,
          body: office.body,
          link: "",
          read_at: null,
        }),
      ]
      expect(FALLBACK_LINK[office.type]).toBe(office.expectedLink)

      const user = userEvent.setup()
      renderBot(<NotificationBell />, "/chien-luoc")
      await user.click(await screen.findByTestId("notification-bell"))
      const list = await screen.findByRole("list", { name: "Danh sách thông báo" })
      await user.click(within(list).getByRole("button"))

      await waitFor(() => expect(callsTo(world, "POST", "/me/notifications/read")).toHaveLength(1))
      expect(callsTo(world, "POST", "/me/notifications/read")[0]!.body).toEqual({ id: office.id })
      expect(screen.getByTestId("location").textContent).toBe(office.expectedLink)
      await waitFor(() => expect(screen.queryByTestId("notification-badge")).toBeNull())
    },
  )

  it("normalizes legacy /van-phong links and navigates cleanly to /khu-giao-dich?phong=van-phong&modal=mine|mgr even when already in the office", async () => {
    const first = OFFICE_CASES[0]!
    const second = OFFICE_CASES[1]!
    const boss = OFFICE_CASES[4]!
    world.notifications = [
      item({ id: first.id, type: first.type, title: first.title, body: first.body, link: "/van-phong?modal=mine" }),
      item({ id: second.id, type: second.type, title: second.title, body: second.body, link: "/khu-giao-dich?phong=van-phong&modal=mine" }),
      item({ id: boss.id, type: boss.type, title: boss.title, body: boss.body, link: "/van-phong?modal=mgr" }),
    ]

    const user = userEvent.setup()
    renderBot(
      <>
        <NotificationBell />
        <LocationStateProbe />
      </>,
      "/khu-giao-dich?phong=van-phong",
    )

    // 1. From /khu-giao-dich?phong=van-phong -> normalized /khu-giao-dich?phong=van-phong&modal=mine
    await user.click(await screen.findByTestId("notification-bell"))
    let list = await screen.findByRole("list", { name: "Danh sách thông báo" })
    await user.click(within(list).getAllByRole("button")[0]!)
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/khu-giao-dich?phong=van-phong&modal=mine"))
    expect(screen.getByTestId("location-notification-id").textContent).toBe(first.id)
    const firstKey = screen.getByTestId("location-key").textContent

    // 2. Already on /khu-giao-dich?phong=van-phong&modal=mine -> another notification still emits fresh navigation state/key
    await user.click(screen.getByTestId("notification-bell"))
    list = await screen.findByRole("list", { name: "Danh sách thông báo" })
    await user.click(within(list).getAllByRole("button")[1]!)
    await waitFor(() => expect(screen.getByTestId("location-notification-id").textContent).toBe(second.id))
    expect(screen.getByTestId("location").textContent).toBe("/khu-giao-dich?phong=van-phong&modal=mine")
    expect(screen.getByTestId("location-key").textContent).not.toBe(firstKey)

    // 3. Already on modal=mine -> legacy /van-phong?modal=mgr normalizes to /khu-giao-dich?phong=van-phong&modal=mgr
    await user.click(screen.getByTestId("notification-bell"))
    list = await screen.findByRole("list", { name: "Danh sách thông báo" })
    await user.click(within(list).getAllByRole("button")[2]!)
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/khu-giao-dich?phong=van-phong&modal=mgr"))
    expect(screen.getByTestId("location-notification-id").textContent).toBe(boss.id)
    await waitFor(() => expect(callsTo(world, "POST", "/me/notifications/read")).toHaveLength(3))
  })
})
