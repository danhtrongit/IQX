import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { Cap2Provider, useCap2Events } from "./Cap2Context"

describe("useCap2Events — no-op outside a provider", () => {
  it("isCap2Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap2Events())
    expect(result.current.isCap2Active).toBe(false)
    expect(result.current.onSlTpPicked).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap2Events())
    expect(() => result.current.registerHandlers({ onSlTpPicked: vi.fn() })).not.toThrow()
  })
})

describe("useCap2Events — inside a Cap2Provider", () => {
  it("isCap2Active is true", () => {
    const { result } = renderHook(() => useCap2Events(), { wrapper: Cap2Provider })
    expect(result.current.isCap2Active).toBe(true)
  })

  it("dispatches onSlTpPicked/onOrderFilled to the registered handlers", () => {
    const onSlTpPicked = vi.fn()
    const onOrderFilled = vi.fn()

    function Registrant() {
      const bus = useCap2Events()
      useEffect(() => {
        bus.registerHandlers({ onSlTpPicked, onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap2Events> | null = null
    function Notifier() {
      bus = useCap2Events()
      return null
    }

    render(
      <Cap2Provider>
        <Registrant />
        <Notifier />
      </Cap2Provider>,
    )

    bus!.onSlTpPicked?.("ho_tro_khang_cu", 60_400, 65_800)
    expect(onSlTpPicked).toHaveBeenCalledWith("ho_tro_khang_cu", 60_400, 65_800)

    bus!.onOrderFilled?.({ symbol: "VNM", side: "buy", quantity: 100, price: 62_400, orderId: "o1" })
    expect(onOrderFilled).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", orderId: "o1" }),
    )
  })

  it("merge-semantics: two independent registrants each keep their own handlers (neither wipes the other's)", () => {
    const onSlTpPicked = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap2Events()
      useEffect(() => {
        bus.registerHandlers({ onSlTpPicked })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap2Events()
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap2Events> | null = null
    function Notifier() {
      bus = useCap2Events()
      return null
    }

    render(
      <Cap2Provider>
        <RegistrantA />
        <RegistrantB />
        <Notifier />
      </Cap2Provider>,
    )

    bus!.onSlTpPicked?.("bien_do_dao_dong", 60_700, 65_800)
    bus!.onOrderFilled?.({ symbol: "VNM", side: "sell", quantity: 100, price: 62_400, orderId: "o2" })

    // Both handlers fire — RegistrantB registering AFTER RegistrantA did not
    // wipe RegistrantA's onSlTpPicked (and vice versa).
    expect(onSlTpPicked).toHaveBeenCalledWith("bien_do_dao_dong", 60_700, 65_800)
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
