import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { Cap3Provider, useCap3Events } from "./Cap3Context"

describe("useCap3Events — no-op outside a provider", () => {
  it("isCap3Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap3Events())
    expect(result.current.isCap3Active).toBe(false)
    expect(result.current.onKhauViPicked).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap3Events())
    expect(() => result.current.registerHandlers({ onKhauViPicked: vi.fn() })).not.toThrow()
  })
})

describe("useCap3Events — inside a Cap3Provider", () => {
  it("isCap3Active is true", () => {
    const { result } = renderHook(() => useCap3Events(), { wrapper: Cap3Provider })
    expect(result.current.isCap3Active).toBe(true)
  })

  it("dispatches onKhauViPicked/onOrderFilled to the registered handlers", () => {
    const onKhauViPicked = vi.fn()
    const onOrderFilled = vi.fn()

    function Registrant() {
      const bus = useCap3Events()
      useEffect(() => {
        bus.registerHandlers({ onKhauViPicked, onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap3Events> | null = null
    function Notifier() {
      bus = useCap3Events()
      return null
    }

    render(
      <Cap3Provider>
        <Registrant />
        <Notifier />
      </Cap3Provider>,
    )

    bus!.onKhauViPicked?.("can_bang")
    expect(onKhauViPicked).toHaveBeenCalledWith("can_bang")

    bus!.onOrderFilled?.({
      symbol: "VNM",
      side: "buy",
      quantity: 200,
      price: 62_400,
      orderId: "o1",
      khauVi: "can_bang",
      mucTuTin: 2,
      cachKhoiLuong: "linh_hoat",
      khoiLuong: 200,
      pctVon: 12.48,
    })
    expect(onOrderFilled).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", orderId: "o1", mucTuTin: 2 }),
    )
  })

  it("merge-semantics: two independent registrants each keep their own handlers (neither wipes the other's)", () => {
    const onKhauViPicked = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap3Events()
      useEffect(() => {
        bus.registerHandlers({ onKhauViPicked })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap3Events()
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap3Events> | null = null
    function Notifier() {
      bus = useCap3Events()
      return null
    }

    render(
      <Cap3Provider>
        <RegistrantA />
        <RegistrantB />
        <Notifier />
      </Cap3Provider>,
    )

    bus!.onKhauViPicked?.("tan_cong")
    bus!.onOrderFilled?.({ symbol: "VNM", side: "sell", quantity: 200, price: 62_400, orderId: "o2" })

    // Both handlers fire — RegistrantB registering AFTER RegistrantA did not
    // wipe RegistrantA's onKhauViPicked (and vice versa).
    expect(onKhauViPicked).toHaveBeenCalledWith("tan_cong")
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
