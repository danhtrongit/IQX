/**
 * "Đẩy vào bản tin" (spec §4): năm điều kiện chặn đúng câu và đúng thứ tự, danh sách chọn tối đa 10 mã
 * xếp theo GTGD, và lệnh đẩy gửi đúng nội dung tới máy chủ.
 */
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot as render, stubBrowser } from "../../demo-trading/bot/test-render"
import type { PushCandidate, PushContext } from "./bulletin-push-api"
import { PushBulletinDialog, type PushBulletinDialogProps } from "./push-bulletin-dialog"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

const FILTER = { id: "11111111-1111-4111-8111-111111111111", name: "Tăng giá thanh khoản", version: 3, signature: "SIG" }

const CONTEXT: PushContext = {
  trade_date: "2026-11-06",
  status: "draft",
  locked: false,
  slots: [
    { slot: 1, default_name: "Tăng giá, thanh khoản cao", pushed: null },
    { slot: 2, default_name: null, pushed: { pushed_at: "2026-11-06T09:00:00.000Z", display_name: "Đã đẩy", picks: 4, passed_count: 9 } },
    { slot: 3, default_name: null, pushed: null },
  ],
}

function candidate(symbol: string, value: number): PushCandidate {
  return { symbol, close: 20 + value / 100, change_pct: value % 2 === 0 ? 1.25 : -0.5, value_bn: value }
}

let context: PushContext
let candidates: PushCandidate[]

beforeEach(() => {
  context = CONTEXT
  candidates = [candidate("FPT", 500), candidate("MWG", 300), candidate("HPG", 100)]
  mocks.api.mockReset()
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
  mocks.api.mockImplementation(async (path: string, options?: { method?: string; body?: string }) => {
    if (path === "/admin/market-bulletins/push-context") return context
    if (path.startsWith("/admin/market-bulletins/push-candidates")) {
      return { result_id: "run-1", session_date: "2026-11-06", passed_count: candidates.length, items: candidates }
    }
    if (options?.method === "POST" && path.startsWith("/market/bulletins/")) {
      const body = JSON.parse(options.body ?? "{}") as { picks: string[] }
      return { slot: Number(path.split("/").at(-1)), trade_date: "2026-11-06", picks: body.picks.length, passed_count: candidates.length, pushed_at: "2026-11-06T09:30:00.000Z" }
    }
    throw new Error(`unexpected call ${path}`)
  })
  stubBrowser()
})

function props(overrides: Partial<PushBulletinDialogProps> = {}): PushBulletinDialogProps {
  return {
    resultId: "11111111-aaaa-4aaa-8aaa-111111111111",
    sessionDate: "2026-11-06",
    runSignature: "SIG",
    loaded: FILTER,
    draftSignature: "SIG",
    tableSelection: new Set(),
    criteriaParts: ["HOSE · VN30", "RSI14 > 55"],
    onClose: vi.fn(),
    ...overrides,
  }
}

const calls = (method: string) =>
  mocks.api.mock.calls.filter(([, options]) => ((options as { method?: string } | undefined)?.method ?? "GET") === method)

/** The dialog is replaced (not updated) once the bulletin and the passed list have loaded, so query it after that. */
async function formDialog(ready: "push-count" | "push-zero" = "push-count") {
  await screen.findByTestId(ready)
  return screen.getByRole("dialog", { name: /Đẩy vào bản tin/ })
}

describe("điều kiện chặn", () => {
  it("1: chưa lưu bộ lọc, chỉ hiện câu báo và nút Đóng, không gọi máy chủ", async () => {
    const onClose = vi.fn()
    render(<PushBulletinDialog {...props({ loaded: null, onClose })} />)
    const dialog = await screen.findByRole("dialog", { name: /Đẩy vào bản tin/ })
    expect(within(dialog).getByTestId("push-blocked").textContent).toBe(
      "Lưu bộ lọc trước khi đẩy vào bản tin. Bản tin dùng bộ lọc đã lưu để ghi nguồn.",
    )
    expect(within(dialog).queryByRole("button", { name: /Đẩy \d+ mã/ })).toBeNull()
    expect(within(dialog).getByText("Quản trị")).toBeTruthy()
    expect(mocks.api).not.toHaveBeenCalled()
    await userEvent.setup().click(within(dialog).getAllByRole("button", { name: "Đóng" })[0]!)
    expect(onClose).toHaveBeenCalled()
  })

  it("2: điều kiện đã sửa sau lần lưu", async () => {
    render(<PushBulletinDialog {...props({ draftSignature: "EDITED", runSignature: "EDITED" })} />)
    expect((await screen.findByTestId("push-blocked")).textContent).toBe(
      "Điều kiện đã sửa sau lần lưu. Bấm Lưu bộ lọc (lưu thành phiên bản mới), chạy lại rồi đẩy.",
    )
  })

  it("3: điều kiện đã đổi sau lần chạy", async () => {
    render(<PushBulletinDialog {...props({ runSignature: "OLD-RUN" })} />)
    expect((await screen.findByTestId("push-blocked")).textContent).toBe("Điều kiện đã đổi sau lần chạy. Bấm Chạy bộ lọc trước khi đẩy.")
  })

  it("4: phiên của kết quả khác phiên bản tin", async () => {
    render(<PushBulletinDialog {...props({ sessionDate: "2026-11-05" })} />)
    expect((await screen.findByTestId("push-blocked")).textContent).toBe(
      "Kết quả là của phiên 05/11, khác phiên bản tin 06/11. Chạy lại bộ lọc.",
    )
    expect(calls("GET").some(([path]) => String(path).includes("push-candidates"))).toBe(false)
  })

  it("5: bản tin đã Public, danh sách mã đã khoá", async () => {
    context = { ...CONTEXT, status: "public", locked: true }
    render(<PushBulletinDialog {...props()} />)
    expect((await screen.findByTestId("push-blocked")).textContent).toBe("Bản tin phiên 06/11/2026 đã Public, danh sách mã đã khoá.")
  })
})

describe("hộp đẩy", () => {
  it("hiện nguồn, ô còn trống được chọn sẵn, tên gợi ý, điều kiện chỉ đọc và mã xếp theo GTGD", async () => {
    render(<PushBulletinDialog {...props()} />)
    const dialog = await formDialog()
    expect(within(dialog).getByTestId("push-source").textContent).toBe("Bộ lọc Tăng giá thanh khoản · phiên bản 3 · kết quả phiên 06/11/2026")
    // Ô 1 chưa đẩy nên được chọn sẵn; ô 2 đã đẩy hiện trạng thái.
    expect((within(dialog).getByRole("radio", { name: /Bộ lọc 1/ }) as HTMLElement).getAttribute("aria-checked")).toBe("true")
    expect(within(dialog).getByText("Đã đẩy 4 mã (thay khi đẩy lại)")).toBeTruthy()
    expect((within(dialog).getByLabelText("Tên hiển thị trong bản tin") as HTMLInputElement).value).toBe("Tăng giá, thanh khoản cao")
    expect(within(dialog).getByTestId("push-conditions").textContent).toBe("HOSE · VN30RSI14 > 55")
    expect(within(dialog).getByTestId("push-count").textContent).toBe("đã chọn 3/10 · 3 mã đạt, xếp theo GTGD hôm nay")
    const rows = within(dialog).getAllByRole("row").slice(1)
    expect(rows.map((row) => within(row).getAllByRole("cell")[1]?.textContent)).toEqual(["FPT", "MWG", "HPG"])
  })

  it("đẩy: gửi mã đã chọn, tên, điều kiện và bộ lọc nguồn rồi báo thành công", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<PushBulletinDialog {...props({ onClose, tableSelection: new Set(["MWG", "HPG"]) })} />)
    const dialog = await formDialog()
    await user.click(within(dialog).getByRole("radio", { name: /Bộ lọc 3/ }))
    const name = within(dialog).getByLabelText("Tên hiển thị trong bản tin")
    await user.clear(name)
    await user.type(name, "Dòng tiền mạnh")
    await user.click(within(dialog).getByRole("button", { name: "Đẩy 2 mã vào Bộ lọc 3" }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const post = calls("POST").at(-1)!
    expect(post[0]).toBe("/market/bulletins/2026-11-06/slots/3")
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({
      result_id: "11111111-aaaa-4aaa-8aaa-111111111111",
      filter_id: FILTER.id,
      filter_version: 3,
      picks: ["MWG", "HPG"],
      display_name: "Dòng tiền mạnh",
      conditions: ["HOSE · VN30", "RSI14 > 55"],
    })
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã đẩy 2 mã vào Bộ lọc 3 của bản tin phiên 06/11/2026.")
  })

  it("khoá ở 10 mã và mở lại khi bỏ chọn một mã", async () => {
    const user = userEvent.setup()
    candidates = Array.from({ length: 12 }, (_, index) => candidate(`S${String(index).padStart(2, "0")}`, 1000 - index * 10))
    render(<PushBulletinDialog {...props()} />)
    const dialog = await formDialog()
    await waitFor(() => expect(within(dialog).getByTestId("push-count").textContent).toBe("đã chọn 10/10 · 12 mã đạt, xếp theo GTGD hôm nay"))
    expect(within(dialog).getByText("Đã đủ 10 mã. Bỏ chọn một mã để chọn mã khác.")).toBeTruthy()
    const eleventh = within(dialog).getByRole("checkbox", { name: "Chọn S10" })
    expect(eleventh.hasAttribute("disabled") || eleventh.getAttribute("data-disabled") !== null).toBe(true)
    await user.click(within(dialog).getByRole("checkbox", { name: "Chọn S00" }))
    expect(within(dialog).getByTestId("push-count").textContent).toBe("đã chọn 9/10 · 12 mã đạt, xếp theo GTGD hôm nay")
    await user.click(within(dialog).getByRole("checkbox", { name: "Chọn S10" }))
    expect(within(dialog).getByTestId("push-count").textContent).toBe("đã chọn 10/10 · 12 mã đạt, xếp theo GTGD hôm nay")
  })

  it("có mã đạt mà không chọn mã nào thì nút đẩy bị khoá", async () => {
    const user = userEvent.setup()
    candidates = [candidate("FPT", 500)]
    render(<PushBulletinDialog {...props()} />)
    const dialog = await formDialog()
    await user.click(within(dialog).getByRole("checkbox", { name: "Chọn FPT" }))
    expect(within(dialog).getByRole("button", { name: "Đẩy 0 mã vào Bộ lọc 1" }).hasAttribute("disabled")).toBe(true)
  })

  it("phiên không có mã đạt: hiện câu thay thế và vẫn đẩy được 0 mã", async () => {
    const user = userEvent.setup()
    candidates = []
    render(<PushBulletinDialog {...props()} />)
    const dialog = await formDialog("push-zero")
    expect(within(dialog).getByTestId("push-zero").textContent).toBe(
      "Phiên này không có mã đạt. Bản tin sẽ in câu “Phiên này không có mã đạt.”",
    )
    await user.click(within(dialog).getByRole("button", { name: "Đẩy 0 mã vào Bộ lọc 1" }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Đã đẩy 0 mã vào Bộ lọc 1 của bản tin phiên 06/11/2026."))
    expect(JSON.parse((calls("POST").at(-1)![1] as { body: string }).body).picks).toEqual([])
  })

  it("máy chủ từ chối thì hộp ở lại và hiện lý do", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.api.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/admin/market-bulletins/push-context") return context
      if (path.startsWith("/admin/market-bulletins/push-candidates")) return { result_id: "r", session_date: "2026-11-06", passed_count: 1, items: [candidate("FPT", 500)] }
      if (options?.method === "POST") throw new Error("Bản tin phiên 06/11/2026 đã Public, danh sách mã đã khoá.")
      throw new Error(`unexpected call ${path}`)
    })
    render(<PushBulletinDialog {...props({ onClose })} />)
    const dialog = await formDialog()
    await user.click(within(dialog).getByRole("button", { name: "Đẩy 1 mã vào Bộ lọc 1" }))
    expect(await within(dialog).findByText("Bản tin phiên 06/11/2026 đã Public, danh sách mã đã khoá.")).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})
