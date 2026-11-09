import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { installResizeObserver } from "../team-leads/test-support"
import * as api from "./bulletin-admin-api"
import { BulletinEditorPage } from "./bulletin-editor-page"
import { BulletinsPage } from "./bulletins-page"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("./bulletin-admin-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bulletin-admin-api")>()
  return {
    ...actual,
    fetchAdminBulletins: vi.fn(),
    fetchAdminBulletin: vi.fn(),
    saveAdminBulletinContent: vi.fn(),
    previewAdminBulletin: vi.fn(),
    publishAdminBulletin: vi.fn(),
    unpublishAdminBulletin: vi.fn(),
  }
})

installResizeObserver()

const DATE = "2026-11-06"
const LEVELS = { r1: 1782, r2: 1832, s1: 1712, s2: 1662, pa: 1802, pt: 1702, na: 1732, nt: 1632 }

function detail(overrides: Partial<api.AdminBulletinDetail> = {}): api.AdminBulletinDetail {
  return {
    trade_date: DATE,
    status: "draft",
    data_ready: true,
    data_ready_at: "2026-11-06T08:20:00.000Z",
    content: { trend: "Xu hướng tăng.", momentum: "Động lực còn dư địa.", liquidity: "Thanh khoản cải thiện.", levels: LEVELS },
    metrics: {
      close: 1741.6, change: 6.61, change_pct: 0.38, volume_millions: 899, volume_ma20_millions: 797, value_bn: 21346,
      advances: 212, unchanged: 61, declines: 143, sma20: 1708.6, sma50: 1659.4, sma200: 1505.4, rsi: 77.5,
      rsi_previous: 75.6, macd: 12.1, signal: 10.4, histogram: 1.7,
    },
    suggestions: [{ label: "Đỉnh 20 phiên", value: 1832, side: "resistance" }],
    model_available: true,
    slots: [
      { slot: 1, snapshot: null },
      { slot: 2, snapshot: null },
      { slot: 3, snapshot: null },
    ],
    slots_locked: false,
    checks: { errors: 0, warnings: 0, checked_at: "2026-11-06T09:00:00.000Z", items: [{ level: "info", code: "ok", message: "Số liệu phiên đầy đủ." }] },
    has_changes: false,
    can_publish: true,
    published_revision: null,
    published_at: null,
    updated_at: null,
    published_by_name: null,
    files: [],
    history: [],
    retention_months: 6,
    ...overrides,
  }
}

const PREVIEW: api.AdminBulletinPreview = {
  variant: "desktop",
  ready: true,
  pages: [{ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>window.__xss = 1</script><rect width="10" height="10" onclick="window.__xss = 2"/></svg>', width: 1123, height: 794 }],
  overflow: [],
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/market-bulletins" element={<BulletinsPage />} />
          <Route path="/admin/market-bulletins/:date" element={<BulletinEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(api.fetchAdminBulletin).mockReset().mockResolvedValue(detail())
  vi.mocked(api.previewAdminBulletin).mockReset().mockResolvedValue(PREVIEW)
  vi.mocked(api.saveAdminBulletinContent).mockReset().mockImplementation(async (_date, content) => detail({ content }))
  vi.mocked(api.publishAdminBulletin).mockReset().mockResolvedValue(detail({ status: "public", published_at: "2026-11-06T09:30:00.000Z", published_revision: 1 }))
  vi.mocked(api.unpublishAdminBulletin).mockReset().mockResolvedValue(detail({ status: "unpublic" }))
  vi.mocked(api.fetchAdminBulletins).mockReset().mockResolvedValue({
    items: [
      { trade_date: DATE, status: "draft", data_ready: true, published_at: null, updated_at: null, edited_at: null, actor_name: null, error_count: 2 },
      { trade_date: "2026-11-05", status: "public", data_ready: true, published_at: "2026-11-05T09:30:00.000Z", updated_at: "2026-11-05T10:05:00.000Z", edited_at: null, actor_name: "Admin IQX", error_count: 0 },
      { trade_date: "2026-11-04", status: "unpublic", data_ready: true, published_at: null, updated_at: null, edited_at: null, actor_name: null, error_count: null },
    ],
    retention_months: 6,
  })
})

describe("danh sách bản tin quản trị", () => {
  it("hiện trạng thái, người thực hiện, ghi chú 6 tháng và không có nút tạo bản tin", async () => {
    renderAt("/admin/market-bulletins")
    expect(await screen.findByText("Nháp")).toBeTruthy()
    expect(screen.getByText("Đang trên web")).toBeTruthy()
    expect(screen.getByText("Đã gỡ")).toBeTruthy()
    expect(screen.getByText("Admin IQX")).toBeTruthy()
    expect(screen.getByText(/Lưu 6 tháng gần nhất\. Bản cũ hơn tự xoá khỏi web và khỏi danh sách này\./)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Tạo bản tin/ })).toBeNull()
    expect(screen.getAllByRole("link", { name: /Viết nhận định|Mở/ }).length).toBeGreaterThanOrEqual(3)
  })
})

describe("màn soạn bản tin", () => {
  it("hiện 4 bước, trạng thái Nháp và cho Public khi không có lỗi", async () => {
    const user = userEvent.setup()
    renderAt(`/admin/market-bulletins/${DATE}`)
    for (const title of ["Bước 1 · Số liệu VN-Index", "Bước 2 · Nhận định", "Bước 3 · Bộ lọc", "Bước 4 · Kiểm tra và Public"]) {
      expect(await screen.findByRole("heading", { name: title })).toBeTruthy()
    }
    expect(screen.getByText("0 lỗi")).toBeTruthy()
    expect(screen.getByText("0 lưu ý")).toBeTruthy()
    expect(screen.getByText("Nháp. Chưa lên web.")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Public" }))
    await waitFor(() => expect(api.publishAdminBulletin).toHaveBeenCalledWith(DATE))
  })

  it("khoá Public và hiện lỗi đỏ khi máy chủ báo lỗi", async () => {
    vi.mocked(api.fetchAdminBulletin).mockResolvedValue(
      detail({
        can_publish: false,
        checks: {
          errors: 1,
          warnings: 1,
          checked_at: "2026-11-06T09:00:00.000Z",
          items: [
            { level: "error", code: "trend_empty", message: "Chưa viết nhận định xu hướng.", field: "trend" },
            { level: "warn", code: "level_far", message: "Kháng cự 2 cách giá hiện tại hơn 15%." },
          ],
        },
      }),
    )
    renderAt(`/admin/market-bulletins/${DATE}`)
    expect(await screen.findByText("1 lỗi")).toBeTruthy()
    expect(screen.getByText("1 lưu ý")).toBeTruthy()
    expect(screen.getByText("Chưa viết nhận định xu hướng.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Public" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("Sửa hết lỗi đỏ để Public.")).toBeTruthy()
    expect(screen.getByLabelText("Xu hướng").getAttribute("aria-invalid")).toBe("true")
  })

  it("tự lưu sau khi ngừng gõ và gửi nội dung vừa gõ", async () => {
    const user = userEvent.setup()
    renderAt(`/admin/market-bulletins/${DATE}`)
    const trend = await screen.findByLabelText("Xu hướng")
    await user.clear(trend)
    await user.type(trend, "Đà tăng được giữ.")
    await waitFor(() => expect(api.saveAdminBulletinContent).toHaveBeenCalled(), { timeout: 3000 })
    const [date, content] = vi.mocked(api.saveAdminBulletinContent).mock.calls.at(-1)!
    expect(date).toBe(DATE)
    expect(content.trend).toBe("Đà tăng được giữ.")
    expect(content.levels.r1).toBe(1782)
    await waitFor(() => expect(screen.getByText("Đã lưu")).toBeTruthy())
  })

  it("nhận số điểm kiểu Việt Nam và không lưu khi số điểm sai", async () => {
    const user = userEvent.setup()
    renderAt(`/admin/market-bulletins/${DATE}`)
    const r1 = await screen.findByLabelText("Kháng cự 1")
    await user.clear(r1)
    await user.type(r1, "1.755,5")
    await waitFor(() => expect(api.saveAdminBulletinContent).toHaveBeenCalled(), { timeout: 3000 })
    expect(vi.mocked(api.saveAdminBulletinContent).mock.calls.at(-1)![1].levels.r1).toBe(1755.5)

    vi.mocked(api.saveAdminBulletinContent).mockClear()
    await user.clear(r1)
    await user.type(r1, "abc")
    expect(await screen.findByText("Nhập số điểm, ví dụ 1.755,5.")).toBeTruthy()
    expect(screen.getByText("Có ô số điểm chưa đúng, chưa lưu")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Public" }) as HTMLButtonElement).disabled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(api.saveAdminBulletinContent).not.toHaveBeenCalled()
  })

  it("xem trước dựng từ nội dung đang gõ và gỡ script khỏi SVG", async () => {
    renderAt(`/admin/market-bulletins/${DATE}`)
    const pages = await screen.findAllByRole("img", { name: /Trang 1 \/ 1 của bản xem trước/ })
    expect(pages[0].querySelector("svg")).not.toBeNull()
    expect(pages[0].querySelector("script")).toBeNull()
    expect(pages[0].querySelector("rect")?.getAttribute("onclick")).toBeNull()
    expect(api.previewAdminBulletin).toHaveBeenCalled()
    expect(vi.mocked(api.previewAdminBulletin).mock.calls[0][1]).toBe("desktop")
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
  })

  it("chuyển xem trước sang bản điện thoại", async () => {
    const user = userEvent.setup()
    renderAt(`/admin/market-bulletins/${DATE}`)
    await screen.findAllByRole("img", { name: /bản xem trước/ })
    await user.click(screen.getByRole("radio", { name: "Điện thoại" }))
    await waitFor(() => expect(vi.mocked(api.previewAdminBulletin).mock.calls.some((call) => call[1] === "mobile")).toBe(true))
  })

  it("bản đã Public: có Public lại khi có thay đổi và Gỡ khỏi web cần xác nhận", async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchAdminBulletin).mockResolvedValue(
      detail({ status: "public", has_changes: true, published_at: "2026-11-06T09:30:00.000Z", published_revision: 1, published_by_name: "Admin IQX", slots_locked: true }),
    )
    renderAt(`/admin/market-bulletins/${DATE}`)
    expect(((await screen.findByRole("button", { name: "Public lại bản đã sửa" })) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getAllByText("Danh sách mã đã khoá khi Public.")).toHaveLength(3)

    await user.click(screen.getByRole("button", { name: "Gỡ khỏi web" }))
    const dialog = await screen.findByRole("dialog")
    expect(api.unpublishAdminBulletin).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("button", { name: "Gỡ khỏi web" }))
    await waitFor(() => expect(api.unpublishAdminBulletin).toHaveBeenCalledWith(DATE))
  })
})
