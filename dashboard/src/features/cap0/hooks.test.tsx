import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Same pattern as `gbar.test.tsx` — mock the ky client only (NOT `./hooks`
// itself), so `useCompleteTask` is the REAL hook: this file is the one place
// that tests its `onSuccess` auto-tab centralization directly, independent of
// any particular UI call site (`Gbar`/①, `TradingPanel`/⑤, `DebriefModal`/⑥).
const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  unwrap: <T,>(r: T) => r,
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }))

import { readFileSync } from "node:fs"
import { useCap0Kehoach, useCompleteTask } from "./hooks"
import { Cap0Provider } from "./Cap0Context"

function Harness() {
  const completeTask = useCompleteTask()
  return (
    <>
      <button onClick={() => completeTask.mutate({ taskNo: 4, gate: "debrief" })}>complete</button>
      <button
        onClick={() => completeTask.mutate({ taskNo: 4, gate: "debrief", keepPanel: true })}
      >
        complete-keep
      </button>
    </>
  )
}

function PanelSpy() {
  const { activePanel } = useSidebar()
  return <div data-testid="panel-spy">{activePanel}</div>
}

/**
 * `inCap0` chọn có bọc `Cap0Provider` hay không — ĐÓ là tín hiệu quyết định,
 * không phải `window.location.pathname`. `mounted` mô phỏng shell Cấp 0 bị
 * tháo giữa lúc PATCH còn bay.
 */
function renderHarness({ inCap0 = true, mounted = true } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (m: boolean) => (
    <QueryClientProvider client={client}>
      <SidebarProvider defaultPanel="trading">
        {inCap0 ? (
          <Cap0Provider>{m && <Harness />}</Cap0Provider>
        ) : (
          m && <Harness />
        )}
        <PanelSpy />
      </SidebarProvider>
    </QueryClientProvider>
  )
  const utils = render(tree(mounted))
  return { ...utils, unmountHarness: () => utils.rerender(tree(false)) }
}

function makeTaskResponse() {
  return {
    json: () =>
      Promise.resolve({
        id: "1",
        user_id: "2",
        entered_at: "2026-07-21T00:00:00Z",
        virtual_balance_init: 250_000_000,
        task_1_done_at: "t",
        task_2_done_at: null,
        task_3_done_at: null,
        task_4_done_at: "t",
        task4_debrief_done: true,
        graduated_at: null,
        time_to_graduate_hours: null,
      }),
  }
}

// ── useCompleteTask auto-tab (spec §7) ──────────────────────────────────────
/**
 * ★★ TÍN HIỆU LÀ PROVIDER, KHÔNG PHẢI ĐƯỜNG DẪN.
 *
 * `onSuccess` từng hỏi `window.location.pathname === "/dau-truong"`. Đó là
 * đúng cái anti-pattern đợt này đi gỡ: đổi route của trang cấp (hoặc thêm một
 * sub-path) là điều kiện lặng lẽ thành false — phần thưởng hoàn thành nhiệm vụ
 * không còn kéo tab Hành trình lên, hành trình "biến mất" khỏi tầm mắt user dù
 * họ vẫn đang ở trong cấp; và ngược lại, một trang khác dùng đúng path này thì
 * panel Cấp 0 rò ra ngoài.
 *
 * Hai điều kiện THẬT, cả hai đều không liên quan URL:
 *  · đang ở trong `Cap0Provider` (`isCap0Active` — cùng cơ chế `RightSidebar`/
 *    `RightToolbar` dùng); VÀ
 *  · component gọi mutation CÒN mount khi PATCH trả về — vì `onSuccess` mức
 *    config vẫn chạy sau khi component đã tháo, và `Cap0TradingPage` khôi phục
 *    panel cũ lúc unmount, nên một `onSuccess` đến muộn sẽ ghi đè lại "journey"
 *    và rò panel Cấp 0 sang /bieu-do & /co-phieu (`SidebarProvider` là singleton
 *    ở app root).
 */
describe("useCompleteTask", () => {
  const originalPathname = window.location.pathname

  beforeEach(() => {
    get.mockReset()
    get.mockReturnValue({ json: () => Promise.resolve(null) })
    post.mockReset()
    patch.mockReset()
  })

  afterEach(() => {
    window.history.pushState({}, "", originalPathname)
  })

  it('★★ trong Cấp 0: chuyển sidebar sang "journey" — KỂ CẢ khi đường dẫn không phải /dau-truong', async () => {
    // Đường dẫn cố tình SAI: nếu bài này xanh thì quyết định thật sự không còn
    // đến từ URL nữa.
    window.history.pushState({}, "", "/mot-duong-dan-khac")
    patch.mockReturnValue(makeTaskResponse())

    renderHarness()
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")

    fireEvent.click(screen.getByText("complete"))

    await waitFor(() => expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey"))
    expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 4, gate: "debrief" } })
  })

  it('★★ NGOÀI Cap0Provider: không đụng vào sidebar (không rò panel Cấp 0)', async () => {
    window.history.pushState({}, "", "/dau-truong")
    patch.mockReturnValue(makeTaskResponse())

    renderHarness({ inCap0: false })
    fireEvent.click(screen.getByText("complete"))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap0/task", { json: { task_no: 4, gate: "debrief" } }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it('★★ PATCH trả về SAU khi shell đã tháo: không ghi đè panel đã khôi phục', async () => {
    window.history.pushState({}, "", "/dau-truong")
    let resolvePatch: (v: unknown) => void = () => {}
    patch.mockReturnValue({
      json: () => new Promise((r) => { resolvePatch = r }),
    })

    const { unmountHarness } = renderHarness()
    fireEvent.click(screen.getByText("complete"))
    await waitFor(() => expect(patch).toHaveBeenCalled())

    // Shell Cấp 0 tháo (user rời trang) TRƯỚC khi PATCH trả về.
    unmountHarness()
    resolvePatch(await makeTaskResponse().json())

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("keepPanel: không tự chuyển tab (nhiệm vụ ②③ đứng yên tại chỗ)", async () => {
    window.history.pushState({}, "", "/dau-truong")
    patch.mockReturnValue(makeTaskResponse())

    renderHarness()
    fireEvent.click(screen.getByText("complete-keep"))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("★★ mã nguồn của hook KHÔNG còn dò window.location (bỏ qua phần chú thích)", () => {
    const src = readFileSync(`${process.cwd()}/src/features/cap0/hooks.ts`, "utf8")
    const code = src
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n")
    expect(code).not.toMatch(/window\.location/)
  })
})

// ── useCap0Kehoach — the REAL `enabled` guard ───────────────────────────────
/**
 * ★ This is the file that can actually test the guard. `debrief.test.tsx` mocks
 * `./hooks` wholesale, so its "does not query while the modal is closed" test
 * only ever observed what `DebriefModal` passed DOWN — it would have passed
 * unchanged if the hook fetched unconditionally. Here the hook is real and only
 * the ky client is mocked, so "no request" means no request.
 */
describe("useCap0Kehoach — the enabled guard", () => {
  function KehoachHarness({ orderId }: { orderId: string | null }) {
    const { data } = useCap0Kehoach(orderId)
    return <div data-testid="chip">{data?.ly_do_label ?? "none"}</div>
  }

  function renderKehoach(orderId: string | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <KehoachHarness orderId={orderId} />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    get.mockReset()
    get.mockReturnValue({
      json: () => Promise.resolve({ ly_do_label: "Thử cho biết", so_phien_giu: 0 }),
    })
  })

  it("★ issues NO request at all when there is no order key (modal closed)", async () => {
    renderKehoach(null)
    // Give TanStack Query every chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByTestId("chip")).toHaveTextContent("none")
  })

  it("fetches `GET /cap0/kehoach?order_id=` once an order key is supplied", async () => {
    renderKehoach("buy-order-1")
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("cap0/kehoach", {
        searchParams: { order_id: "buy-order-1" },
      }),
    )
    await waitFor(() => expect(screen.getByTestId("chip")).toHaveTextContent("Thử cho biết"))
  })
})
