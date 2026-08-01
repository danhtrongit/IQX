import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { Cap7Provider, useCap7Events } from "./Cap7Context"

describe("useCap7Events — no-op outside a provider", () => {
  it("isCap7Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap7Events())
    expect(result.current.isCap7Active).toBe(false)
    expect(result.current.onLucShown).toBeUndefined()
    expect(result.current.onLucDoc).toBeUndefined()
    expect(result.current.onCoShown).toBeUndefined()
    expect(result.current.onCoHanhVi).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap7Events())
    expect(() => result.current.registerHandlers({ onLucShown: vi.fn() })).not.toThrow()
  })
})

describe("useCap7Events — inside a Cap7Provider", () => {
  it("isCap7Active is true", () => {
    const { result } = renderHook(() => useCap7Events(), { wrapper: Cap7Provider })
    expect(result.current.isCap7Active).toBe(true)
  })

  it("dispatches onLucShown/onLucDoc/onCoShown/onCoHanhVi/onOrderFilled", () => {
    const onLucShown = vi.fn()
    const onLucDoc = vi.fn()
    const onCoShown = vi.fn()
    const onCoHanhVi = vi.fn()
    const onOrderFilled = vi.fn()

    function Registrant() {
      const bus = useCap7Events()
      useEffect(() => {
        bus.registerHandlers({ onLucShown, onLucDoc, onCoShown, onCoHanhVi, onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap7Events> | null = null
    function Notifier() {
      bus = useCap7Events()
      return null
    }

    render(
      <Cap7Provider>
        <Registrant />
        <Notifier />
      </Cap7Provider>,
    )

    bus!.onLucShown?.("VNM", 1.94)
    expect(onLucShown).toHaveBeenCalledWith("VNM", 1.94)

    bus!.onLucDoc?.("manh")
    expect(onLucDoc).toHaveBeenCalledWith("manh")

    bus!.onCoShown?.("VNM", 62_000, 2_000_000)
    expect(onCoShown).toHaveBeenCalledWith("VNM", 62_000, 2_000_000)

    // ★ "mua_duoi_theo" là một SỰ THẬT được GHI LẠI, không phải một hình phạt
    // (spec §5 "không phạt cứng").
    bus!.onCoHanhVi?.("mua_duoi_theo")
    expect(onCoHanhVi).toHaveBeenCalledWith("mua_duoi_theo")

    bus!.onOrderFilled?.({
      symbol: "VNM",
      side: "buy",
      quantity: 200,
      price: 62_400,
      orderId: "o1",
      lucChiSo: 1.94,
      lucDocUser: "manh",
      coCanhGiac: false,
      hanhViCo: null,
    })
    expect(onOrderFilled).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", orderId: "o1", lucDocUser: "manh" }),
    )
  })

  it("merge-semantics: two independent registrants each keep their own handlers", () => {
    const onLucShown = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap7Events()
      useEffect(() => {
        bus.registerHandlers({ onLucShown })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap7Events()
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap7Events> | null = null
    function Notifier() {
      bus = useCap7Events()
      return null
    }

    render(
      <Cap7Provider>
        <RegistrantA />
        <RegistrantB />
        <Notifier />
      </Cap7Provider>,
    )

    bus!.onLucShown?.("HPG", 0.62)
    bus!.onOrderFilled?.({
      symbol: "HPG",
      side: "sell",
      quantity: 200,
      price: 27_000,
      orderId: "o2",
    })

    // Both fire — B registering AFTER A did not wipe A's handler.
    expect(onLucShown).toHaveBeenCalledWith("HPG", 0.62)
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
