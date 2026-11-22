import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"

import { installResizeObserver } from "../team-leads/test-support"
import type { IqxAdminDetail, IqxAdminItem } from "./api"
import { IqxComposePage } from "./iqx-compose-page"
import { IqxTemplatesPage } from "./iqx-templates-page"

const compose = vi.hoisted(() => ({
  state: { definition: { schema_version: "4.0", rules: [{ id: "pe" }] } as unknown, errors: [] as string[] },
  mounts: 0,
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/contract-client", () => ({ requestOperation: vi.fn() }))
vi.mock("@/pages/strategy/filter/filter-tab", async () => {
  const React = await import("react")
  return {
    FilterTab: ({ compose: binding }: { compose?: { onChange: (state: unknown) => void } }) => {
      React.useEffect(() => {
        compose.mounts += 1
        binding?.onChange(compose.state)
      }, [binding])
      return <div>Form Bộ lọc</div>
    },
  }
})
vi.mock("@/pages/strategy/backtest/backtest-tab", () => ({ BacktestTab: () => <div>Form Backtest</div> }))

installResizeObserver()

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const C = "33333333-3333-4333-8333-333333333333"
const ACTOR = { id: "44444444-4444-4444-8444-444444444444", name: "Admin IQX" }

function item(overrides: Partial<IqxAdminItem>): IqxAdminItem {
  return {
    id: A,
    kind: "filter",
    slug: "a",
    sort_order: 1,
    visibility: "shown",
    status: "shown",
    current_version: 2,
    name: "Cổ phiếu giá trị",
    idea: "Doanh nghiệp tốt đang bị định giá thấp.",
    has_draft: false,
    draft_updated_at: null,
    updated_at: "2026-11-18T03:00:00.000Z",
    updated_by: ACTOR,
    used_30d: 17,
    universe: null,
    max_holding: null,
    bots_using: null,
    trial_runs_30d: null,
    ...overrides,
  }
}

const ROWS = [
  item({ id: B, slug: "b", sort_order: 2, name: "Tăng trưởng", status: "hidden", visibility: "hidden", has_draft: true, used_30d: 3 }),
  item({}),
  item({ id: C, slug: "c", sort_order: 3, name: "Mục nháp", status: "unpublished", current_version: null, used_30d: 0 }),
]

const CONTENT = {
  name: "Cổ phiếu giá trị",
  idea: "Doanh nghiệp tốt đang bị định giá thấp.",
  origin: "Benjamin Graham.",
  when_wrong: "Khi thị trường giảm mạnh.",
  pair_slug: null,
  definition: { schema_version: "4.0", rules: [{ id: "pe" }] },
}

function detail(overrides: Partial<IqxAdminDetail> = {}): IqxAdminDetail {
  return {
    ...item({}),
    draft: null,
    draft_updated_by: null,
    current: { version: 2, content: CONTENT, published_at: "2026-11-17T03:00:00.000Z", published_by: ACTOR, reason: "Ra mắt" },
    versions: [],
    history: [],
    ...overrides,
  }
}

const request = vi.mocked(requestOperation)
let detailResponse: IqxAdminDetail

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/iqx-templates" element={<IqxTemplatesPage />} />
          <Route path="/admin/iqx-templates/:kind/:id" element={<IqxComposePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function calls(key: string) {
  return request.mock.calls.filter(([operation]) => operation === key)
}

beforeEach(() => {
  compose.state = { definition: { schema_version: "4.0", rules: [{ id: "pe" }] }, errors: [] }
  compose.mounts = 0
  detailResponse = detail()
  vi.mocked(toast.success).mockReset()
  request.mockReset().mockImplementation((async (key: string, input: { body?: { kind?: string; ids?: string[] } }) => {
    switch (key) {
      case "GET /api/v2/admin/iqx-templates":
        return { kind: "filter", items: ROWS }
      case "GET /api/v2/admin/iqx-templates/{id}":
        return detailResponse
      case "PUT /api/v2/admin/iqx-templates/order":
        return { kind: input.body?.kind, items: ROWS }
      case "POST /api/v2/admin/iqx-templates/{id}/hide":
        return detail({ status: "hidden", visibility: "hidden" })
      case "POST /api/v2/admin/iqx-templates":
        return detail({ id: C, current_version: null, current: null, status: "unpublished", draft: CONTENT, draft_updated_at: "2026-11-19T00:00:00.000Z" })
      default:
        throw new Error(`unexpected ${key}`)
    }
  }) as unknown as typeof requestOperation)
})

describe("danh sách Mẫu IQX", () => {
  it("hiện trạng thái, phiên bản, số lần Dùng và ↑ gửi thứ tự đã đổi chỗ", async () => {
    const user = userEvent.setup()
    renderAt("/admin/iqx-templates")
    expect(await screen.findByText("Tăng trưởng")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Bộ lọc IQX" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Chiến lược IQX" })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Thêm bộ lọc IQX/ })).toBeTruthy()
    expect(screen.getByText("Đang hiện")).toBeTruthy()
    expect(screen.getByText("Đã ẩn")).toBeTruthy()
    expect(screen.getByText("Chưa xuất bản")).toBeTruthy()
    expect(screen.getByText("Có bản nháp")).toBeTruthy()
    expect(screen.getAllByText("v2").length).toBe(2)
    expect(screen.getByText("—")).toBeTruthy()
    expect(screen.getByText("17")).toBeTruthy()
    expect(screen.getByText("Người dùng bấm Dùng · 30 ngày")).toBeTruthy()

    // Sorted by sort_order: A (1), B (2), C (3). Ends are disabled.
    expect((screen.getByRole("button", { name: "Đưa Cổ phiếu giá trị lên" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Đưa Mục nháp xuống" }) as HTMLButtonElement).disabled).toBe(true)
    // Xóa nháp only for a never published item; Ẩn/Hiện only for published ones.
    expect(screen.getAllByRole("button", { name: "Xóa nháp" }).length).toBe(1)
    expect(screen.getByRole("button", { name: "Hiện" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Đưa Tăng trưởng lên" }))
    await waitFor(() => expect(calls("PUT /api/v2/admin/iqx-templates/order")).toHaveLength(1))
    expect(calls("PUT /api/v2/admin/iqx-templates/order")[0][1]).toEqual({ body: { kind: "filter", ids: [B, A, C] } })
  })

  it("tab Chiến lược IQX: cột Rổ mã, Giữ tối đa, Bot đang dùng, Lần chạy thử · 30 ngày và lời Ẩn riêng (spec v2.0 §7.2)", async () => {
    const user = userEvent.setup()
    const original = ROWS[0]!
    ROWS[0] = { ...original, ...({ universe: { type: "vn100" }, max_holding: 45, bots_using: 12, trial_runs_30d: 340 } as object) }
    onTestFinished(() => { ROWS[0] = original })
    renderAt("/admin/iqx-templates?tab=strategy")
    await screen.findByText("Cổ phiếu giá trị")
    for (const header of ["Rổ mã", "Giữ tối đa", "Bot đang dùng", "Lần chạy thử · 30 ngày"]) expect(screen.getByText(header)).toBeTruthy()
    expect(screen.queryByText("Người dùng bấm Dùng · 30 ngày")).toBeNull()
    expect(screen.getByText("VN100")).toBeTruthy()
    expect(screen.getByText("45 phiên")).toBeTruthy()
    expect(screen.getByText("340")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Ẩn" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog.textContent).toContain('Bot đang chạy chiến lược này vẫn chạy tiếp phiên bản đã chọn, có nhãn "IQX đã ngừng cung cấp"; người dùng không chọn mới được.')
  })

  it("Ẩn cần lý do thay đổi", async () => {
    const user = userEvent.setup()
    renderAt("/admin/iqx-templates?tab=filter")
    await screen.findByText("Cổ phiếu giá trị")
    await user.click(screen.getByRole("button", { name: "Ẩn" }))
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText(
        "Mục này biến mất khỏi tab IQX của người dùng. Bộ lọc, bản nháp và cấu hình Bot người dùng đã tạo từ mục này không bị ảnh hưởng.",
      ),
    ).toBeTruthy()
    const confirm = within(dialog).getByRole("button", { name: "Ẩn" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    await user.type(within(dialog).getByLabelText("Lý do thay đổi"), "   ")
    expect(confirm.disabled).toBe(true)
    await user.type(within(dialog).getByLabelText("Lý do thay đổi"), "Tạm dừng để sửa")
    expect(confirm.disabled).toBe(false)
    await user.click(confirm)
    await waitFor(() => expect(calls("POST /api/v2/admin/iqx-templates/{id}/hide")).toHaveLength(1))
    expect(calls("POST /api/v2/admin/iqx-templates/{id}/hide")[0][1]).toEqual({ path: { id: A }, body: { reason: "Tạm dừng để sửa" } })
  })
})

describe("soạn Mẫu IQX", () => {
  it("chặn Xuất bản và hiện lỗi khi thiếu trường, ý tưởng hơn 1 câu và lỗi của form", async () => {
    const user = userEvent.setup()
    compose.state = { definition: null, errors: ["Bộ lọc cần ít nhất một điều kiện."] }
    renderAt("/admin/iqx-templates/filter/new")
    expect(await screen.findByText("QUẢN TRỊ")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Soạn Bộ lọc IQX · Mục mới" })).toBeTruthy()
    expect(screen.getByText("Mục mới · chưa xuất bản")).toBeTruthy()
    expect(screen.getByText("Form Bộ lọc")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Xuất bản…" }))
    expect(screen.getByText("Tên: bắt buộc nhập.")).toBeTruthy()
    expect(screen.getByText("Ý tưởng: bắt buộc nhập.")).toBeTruthy()
    expect(screen.getByText("Nguồn gốc: bắt buộc nhập.")).toBeTruthy()
    expect(screen.getByText("Khi nào dễ sai: bắt buộc nhập.")).toBeTruthy()
    expect(screen.getByText("Bộ lọc cần ít nhất một điều kiện.")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()

    await user.type(screen.getByLabelText("Tên"), "Thử")
    await user.type(screen.getByLabelText(/Ý tưởng/), "Câu một. Câu hai")
    expect(screen.getByRole("heading", { name: "Soạn Bộ lọc IQX · Thử" })).toBeTruthy()
    expect(screen.getByText("Ý tưởng: chỉ viết 1 câu.")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Xuất bản…" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(request.mock.calls.some(([key]) => String(key).startsWith("POST"))).toBe(false)
  })

  it("Lưu nháp mục mới tạo mục với bản nháp rồi mở mục vừa tạo", async () => {
    const user = userEvent.setup()
    renderAt("/admin/iqx-templates/filter/new")
    await screen.findByText("QUẢN TRỊ")
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }))
    expect(screen.getByText("Tên: bắt buộc nhập.")).toBeTruthy()
    expect(calls("POST /api/v2/admin/iqx-templates")).toHaveLength(0)

    await user.type(screen.getByLabelText("Tên"), "Mới")
    await user.click(screen.getByRole("button", { name: "Lưu nháp" }))
    await waitFor(() => expect(calls("POST /api/v2/admin/iqx-templates")).toHaveLength(1))
    expect(calls("POST /api/v2/admin/iqx-templates")[0][1]).toEqual({
      body: {
        kind: "filter",
        draft: { name: "Mới", idea: "", origin: "", when_wrong: "", pair_slug: null, definition: compose.state.definition },
      },
    })
    expect(toast.success).toHaveBeenCalledWith("Đã lưu nháp. Người dùng chưa thấy thay đổi.")
    expect(await screen.findByText(/đang mở bản nháp/)).toBeTruthy()
  })

  it("hộp xác nhận xuất bản và báo xung đột 409 kèm nút Tải lại", async () => {
    const user = userEvent.setup()
    request.mockImplementation((async (key: string) => {
      if (key === "GET /api/v2/admin/iqx-templates") return { kind: "strategy", items: [] }
      if (key === "GET /api/v2/admin/iqx-templates/{id}") return detailResponse
      if (key === "POST /api/v2/admin/iqx-templates/{id}/publish")
        throw new ApiError("Mục này vừa được người khác thay đổi. Tải lại để xem bản mới nhất.", 409, "IQX_TEMPLATE_CONFLICT")
      throw new Error(`unexpected ${key}`)
    }) as unknown as typeof requestOperation)
    renderAt(`/admin/iqx-templates/filter/${A}`)
    expect(await screen.findByText("Đang hiện với người dùng · v2")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Xuất bản…" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Xuất bản Bộ lọc IQX · Cổ phiếu giá trị (v3)?")).toBeTruthy()
    expect(within(dialog).getByText("Người dùng thấy phiên bản mới ngay trong tab IQX.")).toBeTruthy()
    expect(within(dialog).getByText("Bộ lọc, bản nháp và cấu hình Bot người dùng đã tạo từ phiên bản cũ không đổi theo.")).toBeTruthy()
    const confirm = within(dialog).getByRole("button", { name: "Xuất bản" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    await user.type(within(dialog).getByLabelText("Lý do thay đổi"), "Sửa ngưỡng P/E")
    await user.click(confirm)

    await waitFor(() => expect(calls("POST /api/v2/admin/iqx-templates/{id}/publish")).toHaveLength(1))
    expect(calls("POST /api/v2/admin/iqx-templates/{id}/publish")[0][1]).toMatchObject({
      path: { id: A },
      body: { reason: "Sửa ngưỡng P/E", expected_version: 2, draft_updated_at: null, content: { name: "Cổ phiếu giá trị", pair_slug: null } },
    })
    expect(await screen.findByText("Mục này vừa được người khác thay đổi. Tải lại để xem bản mới nhất.")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()

    const detailCalls = calls("GET /api/v2/admin/iqx-templates/{id}").length
    const mounts = compose.mounts
    await user.click(screen.getByRole("button", { name: "Tải lại" }))
    await waitFor(() => expect(calls("GET /api/v2/admin/iqx-templates/{id}").length).toBeGreaterThan(detailCalls))
    await waitFor(() => expect(compose.mounts).toBeGreaterThan(mounts))
    expect(screen.queryByText("Mục này vừa được người khác thay đổi. Tải lại để xem bản mới nhất.")).toBeNull()
  })
})
