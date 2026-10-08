import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, FakeApiError, request, savedList, universeState, type World } from "../test-support"
import { UniverseCard } from "./universe-card"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

const LIST_ID = "11111111-1111-4111-8111-111111111111"
let world: World

beforeEach(() => {
  world = createWorld({ lists: [savedList(LIST_ID, "Cổ phiếu tăng trưởng", ["FPT", "MWG", "HPG", "VNM", "VCB", "ACB"]), savedList("22222222-2222-4222-8222-222222222222", "Ngân hàng", ["VCB", "BID"])] })
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

const card = () => screen.getByRole("region", { name: "Danh mục mua mới" })
const posts = (path: string) => callsTo(world, "POST", path)
type ApplyBody = { list_id: string; symbols: string[]; expected_revision: number; idempotency_key: string }

async function renderCard() {
  renderBot(<UniverseCard />)
  await screen.findByRole("heading", { name: /VN30|Cổ phiếu|Ngân hàng/ })
}
function useCustomSource() {
  world.universe = universeState({
    revision: 1,
    effective: {
      ...request({ kind: "custom", name: "Ngân hàng", revision: 1, status: "effective", symbol_count: 2, effective_session: "2026-10-02" }),
      symbols: [{ symbol: "VCB", name: null, exchange: "HOSE" }, { symbol: "BID", name: null, exchange: "HOSE" }],
      membership_session: null,
      unavailable_reason: null,
    },
  })
}
async function openApply(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(card()).getByRole("button", { name: "Danh mục đã lưu" }))
  const lists = await screen.findByRole("dialog", { name: "Danh mục từ Bộ lọc" })
  await user.click(await within(lists).findByRole("button", { name: /Chọn danh mục Cổ phiếu tăng trưởng/ }))
  return screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
}

describe("source card", () => {
  it("shows the effective VN30 source and its count with the two links and no 'Về VN30'", async () => {
    await renderCard()
    expect(within(card()).getByText("DANH MỤC MUA MỚI", { exact: false })).toBeTruthy()
    expect(within(card()).getByRole("heading", { name: /VN30/ }).textContent).toContain("30 mã")
    expect(within(card()).getByRole("button", { name: "Xem danh sách" })).toBeTruthy()
    expect(within(card()).getByRole("button", { name: "Danh mục đã lưu" })).toBeTruthy()
    expect(within(card()).queryByRole("button", { name: "Về VN30" })).toBeNull()
    expect(within(card()).queryByText(/Chờ hiệu lực/)).toBeNull()
  })

  it("lists the symbols of the effective source", async () => {
    const user = userEvent.setup()
    await renderCard()
    await user.click(within(card()).getByRole("button", { name: "Xem danh sách" }))
    const dialog = await screen.findByRole("dialog", { name: /Danh mục mua mới · VN30/ })
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(30)
    expect(dialog.textContent).toMatch(/Thành phần VN30 theo phiên 08\/10\/2026/)
    expect(dialog.textContent).toMatch(/vị thế đang giữ ngoài danh mục vẫn được xét theo điều kiện Bán/)
  })

  it("shows the pending source under the effective one with its session, and cancels only the pending change", async () => {
    world.universe = universeState({ revision: 2, pending: request({ kind: "custom", name: "Cổ phiếu tăng trưởng", revision: 2, symbol_count: 4 }) })
    const user = userEvent.setup()
    await renderCard()
    const pending = within(card()).getByRole("status")
    expect(pending.textContent).toContain("Chờ hiệu lực: Cổ phiếu tăng trưởng · 4 mã · từ phiên 09/10/2026")

    await user.click(within(card()).getByRole("button", { name: "Hủy thay đổi" }))
    await waitFor(() => expect(posts("/bot/universe/pending/cancel")).toHaveLength(1))
    expect(posts("/bot/universe/pending/cancel")[0]!.body).toEqual({ expected_revision: 2 })
    await waitFor(() => expect(within(card()).queryByText(/Chờ hiệu lực/)).toBeNull())
    expect(within(card()).getByRole("heading", { name: /VN30/ })).toBeTruthy()
    expect(mocks.toast.success).toHaveBeenCalled()
  })

  it("refetches and says so when the pending change already became effective (409)", async () => {
    world.universe = universeState({ revision: 2, pending: request({ kind: "custom", name: "Cổ phiếu tăng trưởng", revision: 2 }) })
    world.override["POST /bot/universe/pending/cancel"] = () => {
      throw new FakeApiError("Thay đổi đã có hiệu lực hoặc đã được Bot sử dụng nên không thể hủy.", 409, { code: "PENDING_ALREADY_EFFECTIVE" })
    }
    const user = userEvent.setup()
    await renderCard()
    const before = callsTo(world, "GET", "/bot/universe").length
    await user.click(within(card()).getByRole("button", { name: "Hủy thay đổi" }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("không thể hủy")))
    await waitFor(() => expect(callsTo(world, "GET", "/bot/universe").length).toBeGreaterThan(before))
  })

  it("flags an unverifiable source instead of falling back to VN30", async () => {
    world.universe = universeState({ effective: { ...universeState().effective, unavailable_reason: "membership_missing" } })
    await renderCard()
    expect(within(card()).getByRole("status").textContent).toMatch(/Bot không mua mới cho đến khi xác minh được/)
  })
})

describe("apply a saved list", () => {
  it("sends the chosen subset with expected_revision and an idempotency key, then shows the pending source", async () => {
    world.universe = universeState({ revision: 4 })
    const user = userEvent.setup()
    await renderCard()
    const dialog = await openApply(user)

    expect(within(dialog).getAllByRole("checkbox").every((box) => box.getAttribute("aria-checked") === "true")).toBe(true)
    expect(within(dialog).getByText("Đã chọn 6/6 mã")).toBeTruthy()
    expect(dialog.textContent).toMatch(/Danh mục này thay nguồn mua mới VN30/)
    expect(dialog.textContent).toMatch(/Không bán cổ phiếu đang giữ/)
    await user.click(within(dialog).getByRole("checkbox", { name: "Chọn MWG" }))
    await user.click(within(dialog).getByRole("checkbox", { name: "Chọn ACB" }))
    expect(within(dialog).getByText("Đã chọn 4/6 mã")).toBeTruthy()

    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(1))
    const body = posts("/bot/universe/apply-list")[0]!.body as unknown as ApplyBody
    expect(body).toMatchObject({ list_id: LIST_ID, symbols: ["FPT", "HPG", "VNM", "VCB"], expected_revision: 4 })
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã nhận danh mục 4 mã. Chờ phiên giao dịch tiếp theo.")
    expect(within(card()).getByRole("status").textContent).toContain("Chờ hiệu lực: Cổ phiếu tăng trưởng · 4 mã")
  })

  it("does not allow an empty selection", async () => {
    const user = userEvent.setup()
    await renderCard()
    const dialog = await openApply(user)
    await user.click(within(dialog).getByRole("button", { name: "Bỏ chọn tất cả" }))
    expect(within(dialog).getByText("Chọn ít nhất một mã để áp dụng.")).toBeTruthy()
    expect((within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }) as HTMLButtonElement).disabled).toBe(true)
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)
  })

  it("lists the invalid symbols on 422, keeps the selection and lets the user decide, never dropping them silently", async () => {
    world.invalidSymbols = [{ symbol: "MWG", reason: "not_tradable" }, { symbol: "ACB", reason: "unknown_symbol" }]
    const user = userEvent.setup()
    await renderCard()
    const dialog = await openApply(user)
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))

    const alert = await within(dialog).findByRole("alert")
    expect(alert.textContent).toMatch(/Một số mã không hợp lệ/)
    expect(alert.textContent).toMatch(/MWG: Không giao dịch được/)
    expect(alert.textContent).toMatch(/ACB: Mã không tồn tại/)
    expect(within(dialog).getByText("Đã chọn 6/6 mã")).toBeTruthy()
    expect((posts("/bot/universe/apply-list")[0]!.body as unknown as ApplyBody).symbols).toHaveLength(6)
    expect(world.universe.pending).toBeNull()

    world.invalidSymbols = null
    await user.click(within(dialog).getByRole("button", { name: "Bỏ chọn các mã không hợp lệ" }))
    expect(within(dialog).getByText("Đã chọn 4/6 mã")).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(2))
    expect((posts("/bot/universe/apply-list")[1]!.body as unknown as ApplyBody).symbols).toEqual(["FPT", "HPG", "VNM", "VCB"])
  })

  it("on a 409 refetches the source, keeps the selection and applies with the new revision on the next try", async () => {
    world.universe = universeState({ revision: 1 })
    const user = userEvent.setup()
    await renderCard()
    const dialog = await openApply(user)
    // Another tab changed the source after this one loaded it.
    world.universe = universeState({ revision: 5 })

    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    expect(await within(dialog).findByText(/Nguồn mua đã được thay đổi ở nơi khác/)).toBeTruthy()
    expect(within(dialog).getByText("Đã chọn 6/6 mã")).toBeTruthy()
    await waitFor(() => expect(callsTo(world, "GET", "/bot/universe").length).toBeGreaterThan(1))

    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(2))
    const [first, second] = posts("/bot/universe/apply-list").map((call) => call.body as unknown as ApplyBody)
    expect([first!.expected_revision, second!.expected_revision]).toEqual([1, 5])
    expect(second!.idempotency_key).not.toBe(first!.idempotency_key)
  })

  it("shows the server's refusal when a metric of the list is not learned yet (403)", async () => {
    world.override["POST /bot/universe/apply-list"] = () => {
      throw new FakeApiError("Bạn cần hoàn thành bài học của chỉ tiêu đã dùng trong bộ lọc trước khi áp dụng.", 403, { code: "CAPABILITY_LOCKED" })
    }
    const user = userEvent.setup()
    await renderCard()
    const dialog = await openApply(user)
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    expect(await within(dialog).findByText(/hoàn thành bài học của chỉ tiêu/)).toBeTruthy()
  })

  it("Quay lại returns to the saved lists", async () => {
    const user = userEvent.setup()
    await renderCard()
    const dialog = await openApply(user)
    await user.click(within(dialog).getByRole("button", { name: "Quay lại" }))
    expect(await screen.findByRole("dialog", { name: "Danh mục từ Bộ lọc" })).toBeTruthy()
  })

  it("explains an empty list of saved lists", async () => {
    world.lists = []
    const user = userEvent.setup()
    await renderCard()
    await user.click(within(card()).getByRole("button", { name: "Danh mục đã lưu" }))
    expect(await screen.findByText("Chưa có danh mục đã lưu")).toBeTruthy()
  })
})

describe("back to VN30", () => {
  it("is offered only for a custom source and needs a confirmation", async () => {
    useCustomSource()
    const user = userEvent.setup()
    await renderCard()
    await user.click(within(card()).getByRole("button", { name: "Về VN30" }))
    const confirm = await screen.findByRole("dialog", { name: "Quay về VN30" })
    expect(confirm.textContent).toMatch(/không bị bán do thay danh mục/)

    await user.click(within(confirm).getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(posts("/bot/universe/revert-vn30")).toHaveLength(0)

    await user.click(within(card()).getByRole("button", { name: "Về VN30" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Quay về VN30" })).getByRole("button", { name: "Xác nhận" }))
    await waitFor(() => expect(posts("/bot/universe/revert-vn30")).toHaveLength(1))
    const body = posts("/bot/universe/revert-vn30")[0]!.body as { expected_revision: number; idempotency_key: string }
    expect(body.expected_revision).toBe(1)
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.toast.success).toHaveBeenCalledWith("VN30 sẽ là nguồn mua mới từ phiên giao dịch tiếp theo.")
    expect(within(card()).getByRole("status").textContent).toContain("Chờ hiệu lực: VN30")
    // The newest request is VN30 already, so it cannot be requested again.
    expect(within(card()).queryByRole("button", { name: "Về VN30" })).toBeNull()
  })

  it("keeps the dialog and shows the message when the source is already VN30 (409)", async () => {
    useCustomSource()
    world.override["POST /bot/universe/revert-vn30"] = () => {
      throw new FakeApiError("Nguồn mua đã là VN30 hoặc đang chờ chuyển về VN30.", 409, { code: "ALREADY_VN30" })
    }
    const user = userEvent.setup()
    await renderCard()
    await user.click(within(card()).getByRole("button", { name: "Về VN30" }))
    const confirm = await screen.findByRole("dialog", { name: "Quay về VN30" })
    await user.click(within(confirm).getByRole("button", { name: "Xác nhận" }))
    expect(await within(confirm).findByRole("alert")).toBeTruthy()
    expect(within(confirm).getByRole("alert").textContent).toMatch(/đã là VN30/)
  })
})
