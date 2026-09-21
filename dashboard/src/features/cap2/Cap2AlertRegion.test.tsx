import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap2ActiveAlerts, Cap2Alert } from "./types"

const {
  activeAlertsMock,
  actMock,
  setSymbolMock,
  setActivePanelMock,
  setIsOpenMock,
  prepareSellIntentMock,
} = vi.hoisted(() => ({
  activeAlertsMock: vi.fn(),
  actMock: vi.fn(),
  setSymbolMock: vi.fn(),
  setActivePanelMock: vi.fn(),
  setIsOpenMock: vi.fn(),
  prepareSellIntentMock: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap2ActiveAlerts: (...args: unknown[]) => activeAlertsMock(...args),
  useActOnCap2Alert: () => ({ mutate: actMock, isPending: false }),
}))
vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ setSymbol: setSymbolMock }),
}))
vi.mock("@/shared/contexts/sidebar-context", () => ({
  useSidebar: () => ({ setActivePanel: setActivePanelMock, setIsOpen: setIsOpenMock }),
}))
vi.mock("@/shared/analytics/journey", () => ({ trackJourneyEvent: vi.fn() }))
vi.mock("./Cap2Context", () => ({
  useCap2Events: () => ({ prepareSellIntent: prepareSellIntentMock }),
}))

import { Cap2AlertRegion } from "./Cap2AlertRegion"

function stopAlert(overrides: Partial<Cap2Alert> = {}): Cap2Alert {
  return {
    id: "alert-stop-1",
    alert_type: "cham_cat_lo",
    symbol: "VNM",
    session_date: "2026-09-15",
    observed_price_vnd: 59_100,
    threshold_price_vnd: 59_300,
    loss_pct: -5.3,
    official_close_session_date: "2026-09-14",
    breach_session_no: 2,
    status: "shown",
    suppression_reason: null,
    escalation: "normal",
    impression_count: 1,
    first_shown_at: "2026-09-15T01:45:00Z",
    last_shown_at: "2026-09-15T01:45:00Z",
    action: null,
    acted_at: null,
    priority: "next_session",
    position_quantity: 100,
    position_avg_cost_vnd: 62_400,
    plan_started_at: "2026-09-10T02:00:00Z",
    ...overrides,
  }
}

function inbox(...alerts: Cap2Alert[]): Cap2ActiveAlerts {
  return { session_date: "2026-09-15", alerts }
}

describe("Cap2AlertRegion", () => {
  beforeEach(() => {
    activeAlertsMock.mockReset()
    activeAlertsMock.mockReturnValue({ data: inbox(stopAlert()) })
    actMock.mockReset()
    setSymbolMock.mockReset()
    setActivePanelMock.mockReset()
    setIsOpenMock.mockReset()
    prepareSellIntentMock.mockReset()
  })

  it("mounts the durable stop-loss alert at the top-level Cấp 2 region", () => {
    render(<Cap2AlertRegion />)
    expect(activeAlertsMock).toHaveBeenCalledWith(undefined, true)
    expect(screen.getByRole("region", { name: "Cảnh báo kỷ luật Cấp 2" })).toBeInTheDocument()
    expect(screen.getByTestId("cap2-chamsl-figures")).toHaveTextContent(
      "VNM · ngưỡng cắt lỗ 59,300 · giá hiện tại 59,100",
    )
    expect(screen.getByText("Kế hoạch ban đầu (từ 10/09/2026)")).toBeInTheDocument()
    expect(screen.getByText("100 CP · −5.3%")).toBeInTheDocument()
  })

  it("posts hold with the required phrase at strongest server escalation", () => {
    activeAlertsMock.mockReturnValue({
      data: inbox(stopAlert({ escalation: "type_phrase" })),
    })
    render(<Cap2AlertRegion />)
    const hold = screen.getByTestId("cap2-chamsl-hold")
    expect(hold).toBeDisabled()
    fireEvent.change(screen.getByTestId("cap2-chamsl-input"), {
      target: { value: "Tôi hiểu" },
    })
    fireEvent.click(hold)
    expect(actMock).toHaveBeenCalledWith(
      {
        alertId: "alert-stop-1",
        action: "hold",
        confirmationPhrase: "Tôi hiểu",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it("opens the exact symbol's trading panel only after sell_ato is accepted", () => {
    actMock.mockImplementation((_input, options) =>
      options?.onSuccess?.({ next_step: "confirm_ato_sell", alert: stopAlert() }),
    )
    render(<Cap2AlertRegion />)
    fireEvent.click(screen.getByText("Mở form bán theo kế hoạch"))
    expect(actMock).toHaveBeenCalledWith(
      { alertId: "alert-stop-1", action: "sell_ato" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(setSymbolMock).toHaveBeenCalledWith("VNM")
    expect(prepareSellIntentMock).toHaveBeenCalledWith("VNM")
    expect(setActivePanelMock).toHaveBeenCalledWith("trading")
    expect(setIsOpenMock).toHaveBeenCalledWith(true)
    expect(screen.queryByTestId("cap2-alert-chamsl")).not.toBeInTheDocument()
  })

  it("does not render a post-fill nhồi-lệnh alert as a fake pre-submit control", () => {
    activeAlertsMock.mockReturnValue({
      data: inbox(
        stopAlert({
          id: "alert-buy-1",
          alert_type: "nhoi_lenh",
          threshold_price_vnd: null,
          escalation: "delay_5s",
        }),
      ),
    })
    render(<Cap2AlertRegion />)
    expect(screen.queryByRole("region", { name: "Cảnh báo kỷ luật Cấp 2" })).not.toBeInTheDocument()
  })
})
