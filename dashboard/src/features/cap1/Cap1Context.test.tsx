import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { Cap1Provider, useCap1Events } from "./Cap1Context"

describe("useCap1Events — no-op outside a provider", () => {
  it("isCap1Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap1Events())
    expect(result.current.isCap1Active).toBe(false)
    expect(result.current.onLyDoPicked).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
    expect(result.current.onDocChiTietClicked).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap1Events())
    expect(() => result.current.registerHandlers({ onLyDoPicked: vi.fn() })).not.toThrow()
  })
})

describe("useCap1Events — inside a Cap1Provider", () => {
  it("isCap1Active is true", () => {
    const { result } = renderHook(() => useCap1Events(), { wrapper: Cap1Provider })
    expect(result.current.isCap1Active).toBe(true)
  })

  it("dispatches onLyDoPicked/onOrderFilled/onDocChiTietClicked to the registered handlers", () => {
    const onLyDoPicked = vi.fn()
    const onOrderFilled = vi.fn()
    const onDocChiTietClicked = vi.fn()

    function Registrant() {
      const bus = useCap1Events()
      useEffect(() => {
        bus.registerHandlers({ onLyDoPicked, onOrderFilled, onDocChiTietClicked })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap1Events> | null = null
    function Notifier() {
      bus = useCap1Events()
      return null
    }

    render(
      <Cap1Provider>
        <Registrant />
        <Notifier />
      </Cap1Provider>,
    )

    bus!.onLyDoPicked?.("dong_tien")
    expect(onLyDoPicked).toHaveBeenCalledWith("dong_tien")

    bus!.onOrderFilled?.({ symbol: "VNM", side: "buy", quantity: 100, price: 62_400, orderId: "o1" })
    expect(onOrderFilled).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", orderId: "o1" }),
    )

    bus!.onDocChiTietClicked?.("ky_thuat")
    expect(onDocChiTietClicked).toHaveBeenCalledWith("ky_thuat")
  })

  it("merge-semantics: two independent registrants each keep their own handlers (neither wipes the other's)", () => {
    const onLyDoPicked = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap1Events()
      useEffect(() => {
        bus.registerHandlers({ onLyDoPicked })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap1Events()
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap1Events> | null = null
    function Notifier() {
      bus = useCap1Events()
      return null
    }

    render(
      <Cap1Provider>
        <RegistrantA />
        <RegistrantB />
        <Notifier />
      </Cap1Provider>,
    )

    bus!.onLyDoPicked?.("noi_bo")
    bus!.onOrderFilled?.({ symbol: "VNM", side: "sell", quantity: 100, price: 62_400, orderId: "o2" })

    // Both handlers fire — RegistrantB registering AFTER RegistrantA did not
    // wipe RegistrantA's onLyDoPicked (and vice versa).
    expect(onLyDoPicked).toHaveBeenCalledWith("noi_bo")
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
