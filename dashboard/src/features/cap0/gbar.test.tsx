import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import { Cap0Provider, useCap0Events } from "./Cap0Context"
import { Gbar } from "./Gbar"
import { TASK5_GBAR_MESSAGE } from "./gbarMachine"
import type { Cap0Progress } from "./types"

const {
  useProgressMock,
  completeTaskMutate,
  useOrdersMock,
  usePortfolioMock,
  messageSuccess,
  trackMock,
} = vi.hoisted(() => ({
  useProgressMock: vi.fn(),
  completeTaskMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  useOrdersMock: vi.fn(),
  usePortfolioMock: vi.fn(),
  messageSuccess: vi.fn(),
  trackMock: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap0Progress: (...args: unknown[]) => useProgressMock(...args),
  useCompleteTask: () => ({ mutate: completeTaskMutate }),
  useCap0Kehoach: () => ({ data: null }),
}))

vi.mock("@/features/trading/hooks", () => ({
  useOrders: (...args: unknown[]) => useOrdersMock(...args),
  usePortfolio: (...args: unknown[]) => usePortfolioMock(...args),
}))

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, success: messageSuccess } }
})
vi.mock("@/shared/analytics/journey", () => ({ trackJourneyEvent: trackMock }))

function progress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return {
    id: "p1", user_id: "u1", entered_at: "2026-07-21T00:00:00Z",
    virtual_balance_init: 100_000_000,
    task_1_done_at: null, task_2_done_at: null, task_3_done_at: null,
    task_4_done_at: null, task_5_done_at: null,
    task1_star_clicked: false, task5_debrief_done: false,
    graduated_at: null, time_to_graduate_hours: null,
    ...overrides,
  }
}

function Events() {
  const events = useCap0Events()
  return <>
    <button onClick={() => events.onReasonPicked?.("Công ty tôi biết")}>reason</button>
    <button onClick={() => events.onOrderFilled?.({ orderId: "b1", symbol: "VNM", side: "buy", quantity: 100, price: 61_800 })}>buy</button>
    <button onClick={() => events.onOrderFilled?.({ orderId: "s1", symbol: "VNM", side: "sell", quantity: 100, price: 63_000 })}>sell</button>
    <button onClick={() => events.onStarToggled?.("VNM", true)}>star</button>
    <button onClick={() => events.onStarToggled?.("HPG", true)}>wrong-star</button>
    <button onClick={() => events.onGbarWarn?.()}>warn</button>
  </>
}

function PanelSpy() {
  const { activePanel } = useSidebar()
  return <span data-testid="panel">{activePanel}</span>
}

function renderGbar(p: Cap0Progress) {
  useProgressMock.mockReturnValue({ data: p })
  return render(
    <SidebarProvider defaultPanel="trading">
      <Cap0Provider><Gbar /><Events /></Cap0Provider>
      <PanelSpy />
    </SidebarProvider>,
  )
}

describe("Gbar — nhiệm vụ 1", () => {
  beforeEach(() => {
    useProgressMock.mockReset()
    completeTaskMutate.mockClear()
    useOrdersMock.mockReturnValue({ data: [] })
    usePortfolioMock.mockReturnValue({ data: { positions: [] } })
    messageSuccess.mockReset()
    trackMock.mockReset()
  })

  it("guides reason → buy 100 VNM → watchlist star", () => {
    renderGbar(progress())
    expect(screen.getByText(/Bước 1\/3/)).toBeInTheDocument()
    fireEvent.click(screen.getByText("reason"))
    expect(screen.getByText("Bước 2/3 — Bấm ĐẶT LỆNH MUA để mua 100 VNM")).toBeInTheDocument()
    fireEvent.click(screen.getByText("buy"))
    expect(screen.getByText(/Bước 3\/3.*gắn ★ cạnh VNM/)).toBeInTheDocument()
  })

  it("requires the VNM star before completing task 1", async () => {
    renderGbar(progress())
    fireEvent.click(screen.getByText("reason"))
    fireEvent.click(screen.getByText("buy"))
    fireEvent.click(screen.getByText("wrong-star"))
    expect(completeTaskMutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("star"))
    await waitFor(() => expect(completeTaskMutate).toHaveBeenCalledWith(
      { taskNo: 1, gate: "star" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    ))
    expect(screen.queryByText(/Bước \d\/3/)).not.toBeInTheDocument()
    expect(screen.getByTestId("panel")).toHaveTextContent("journey")
    expect(trackMock).toHaveBeenCalledWith("cap0_task_complete", { task_id: 1 })
  })

  it("uses Vietnamese thousands separators in the fill toast", () => {
    renderGbar(progress())
    fireEvent.click(screen.getByText("reason"))
    fireEvent.click(screen.getByText("buy"))
    expect(messageSuccess).toHaveBeenCalledWith("✓ Khớp lệnh MUA 100 VNM @ 61.800")
  })

  it("adds the warning prefix for an invalid action", () => {
    renderGbar(progress())
    fireEvent.click(screen.getByText("warn"))
    expect(screen.getByText(/^⚠ Bước 1\/3/)).toBeInTheDocument()
    expect(document.querySelector(".cap0-gbar--warn")).not.toBeNull()
    expect(trackMock).toHaveBeenCalledWith("cap0_gbar_warn", { step_no: 1 })
  })
})

describe("Gbar — nhiệm vụ 5", () => {
  beforeEach(() => {
    useProgressMock.mockReset()
    completeTaskMutate.mockClear()
    useOrdersMock.mockReturnValue({ data: [] })
    messageSuccess.mockReset()
    trackMock.mockReset()
  })

  it("shows the sell reminder only when task 1 is done and a position is open", () => {
    usePortfolioMock.mockReturnValue({ data: { positions: [{ symbol: "VNM", quantity: 100 }] } })
    renderGbar(progress({ task_1_done_at: "t", task1_star_clicked: true }))
    expect(screen.getByText(TASK5_GBAR_MESSAGE)).toBeInTheDocument()
  })

  it("hides the sell reminder after task 5", () => {
    usePortfolioMock.mockReturnValue({ data: { positions: [{ symbol: "VNM", quantity: 100 }] } })
    renderGbar(progress({ task_1_done_at: "t", task_5_done_at: "t", task1_star_clicked: true, task5_debrief_done: true }))
    expect(screen.queryByText(TASK5_GBAR_MESSAGE)).not.toBeInTheDocument()
  })

  it("opens Kết sổ after a sell and completes task 5 when closed", async () => {
    usePortfolioMock.mockReturnValue({ data: { positions: [{ symbol: "VNM", quantity: 100 }] } })
    renderGbar(progress({ task_1_done_at: "t", task1_star_clicked: true }))
    fireEvent.click(screen.getByText("buy"))
    fireEvent.click(screen.getByText("sell"))
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · SÂN TẬP")).toBeInTheDocument()
    expect(screen.getByText("+120.000đ · MUA 100 VNM → BÁN")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    await waitFor(() => expect(completeTaskMutate).toHaveBeenCalledWith(
      { taskNo: 5, gate: "debrief" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    ))
    expect(trackMock).toHaveBeenCalledWith("cap0_task_complete", { task_id: 5 })
  })
})
