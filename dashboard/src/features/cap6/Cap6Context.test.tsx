import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const trackJourneyEventMock = vi.hoisted(() => vi.fn())
vi.mock("@/shared/analytics/journey", () => ({
  trackJourneyEvent: trackJourneyEventMock,
}))

import { Cap6Provider, type Cap6EventBus, useCap6Events } from "./Cap6Context"

beforeEach(() => {
  trackJourneyEventMock.mockClear()
})

describe("useCap6Events — no-op outside a provider", () => {
  it("isCap6Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap6Events())
    expect(result.current.isCap6Active).toBe(false)
    expect(result.current.onMauThuanShown).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap6Events())
    expect(() => result.current.registerHandlers({ onMauThuanShown: vi.fn() })).not.toThrow()
  })
})

describe("useCap6Events — inside a Cap6Provider", () => {
  it("isCap6Active is true", () => {
    const { result } = renderHook(() => useCap6Events(), { wrapper: Cap6Provider })
    expect(result.current.isCap6Active).toBe(true)
  })

  it("dispatches conflict evidence and filled orders", () => {
    const onMauThuanShown = vi.fn()
    const onNhanDinhPicked = vi.fn()
    const onOrderFilled = vi.fn()

    function Registrant() {
      const bus = useCap6Events()
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => {
        bus.registerHandlers({ onMauThuanShown, onNhanDinhPicked, onOrderFilled })
      }, [])
      return null
    }

    let bus: Cap6EventBus | null = null
    function Notifier() {
      bus = useCap6Events()
      return null
    }

    render(
      <Cap6Provider>
        <Registrant />
        <Notifier />
      </Cap6Provider>,
    )

    bus!.onMauThuanShown?.("VNM", ["tin_tuc"])
    expect(onMauThuanShown).toHaveBeenCalledWith("VNM", ["tin_tuc"])
    expect(trackJourneyEventMock).toHaveBeenCalledWith("cap6_conflict_shown", {
      symbol: "VNM",
      veto_layers: "tin_tuc",
    })
    bus!.onNhanDinhPicked?.("VNM", "nghiem")
    expect(onNhanDinhPicked).toHaveBeenCalledWith("VNM", "nghiem")
    expect(trackJourneyEventMock).toHaveBeenCalledWith("cap6_conflict_rated", {
      symbol: "VNM",
      level: "nghiem",
    })
    bus!.onOrderFilled?.({ symbol: "VNM", side: "buy", quantity: 200, price: 62_400, orderId: "o1" })
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ symbol: "VNM", orderId: "o1" }))
  })

  it("tracks a skip with scalar, bounded fields and no free-form text", () => {
    const { result } = renderHook(() => useCap6Events(), { wrapper: Cap6Provider })
    result.current.onKhongMua?.("  really-long-symbol  ", "ngai")
    expect(trackJourneyEventMock).toHaveBeenCalledWith("cap6_skip", {
      symbol: "REALLY-LONG-",
      level: "ngai",
    })
  })

  it("merges independent handler registrations", () => {
    const onMauThuanShown = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap6Events()
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => {
        bus.registerHandlers({ onMauThuanShown })
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap6Events()
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
      }, [])
      return null
    }

    let bus: Cap6EventBus | null = null
    function Notifier() {
      bus = useCap6Events()
      return null
    }

    render(
      <Cap6Provider>
        <RegistrantA />
        <RegistrantB />
        <Notifier />
      </Cap6Provider>,
    )

    bus!.onMauThuanShown?.("HPG", [])
    bus!.onOrderFilled?.({ symbol: "HPG", side: "sell", quantity: 200, price: 27_000, orderId: "o2" })
    expect(onMauThuanShown).toHaveBeenCalledWith("HPG", [])
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
