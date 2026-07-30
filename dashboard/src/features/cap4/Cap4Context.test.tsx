import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { Cap4Provider, useCap4Events } from "./Cap4Context"

describe("useCap4Events — no-op outside a provider", () => {
  it("isCap4Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap4Events())
    expect(result.current.isCap4Active).toBe(false)
    expect(result.current.onLopRated).toBeUndefined()
    expect(result.current.onAiRevealed).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap4Events())
    expect(() => result.current.registerHandlers({ onLopRated: vi.fn() })).not.toThrow()
  })
})

describe("useCap4Events — inside a Cap4Provider", () => {
  it("isCap4Active is true", () => {
    const { result } = renderHook(() => useCap4Events(), { wrapper: Cap4Provider })
    expect(result.current.isCap4Active).toBe(true)
  })

  it("dispatches onLopRated/onAiRevealed/onOrderFilled to the registered handlers", () => {
    const onLopRated = vi.fn()
    const onAiRevealed = vi.fn()
    const onOrderFilled = vi.fn()

    function Registrant() {
      const bus = useCap4Events()
      useEffect(() => {
        bus.registerHandlers({ onLopRated, onAiRevealed, onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap4Events> | null = null
    function Notifier() {
      bus = useCap4Events()
      return null
    }

    render(
      <Cap4Provider>
        <Registrant />
        <Notifier />
      </Cap4Provider>,
    )

    bus!.onLopRated?.("dong_tien", "ok")
    expect(onLopRated).toHaveBeenCalledWith("dong_tien", "ok")

    bus!.onAiRevealed?.(2)
    expect(onAiRevealed).toHaveBeenCalledWith(2)

    bus!.onOrderFilled?.({
      symbol: "VNM",
      side: "buy",
      quantity: 200,
      price: 62_400,
      orderId: "o1",
      doc5Lop: {
        ky_thuat: "ok",
        dong_tien: "ok",
        noi_bo: "neu",
        tin_tuc: "bad",
        dinh_gia: "ok",
      },
      soLopDongThuan: 3,
      soLopKhacAi: 1,
    })
    expect(onOrderFilled).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", orderId: "o1", soLopKhacAi: 1 }),
    )
  })

  it("merge-semantics: two independent registrants each keep their own handlers", () => {
    const onLopRated = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap4Events()
      useEffect(() => {
        bus.registerHandlers({ onLopRated })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap4Events()
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap4Events> | null = null
    function Notifier() {
      bus = useCap4Events()
      return null
    }

    render(
      <Cap4Provider>
        <RegistrantA />
        <RegistrantB />
        <Notifier />
      </Cap4Provider>,
    )

    bus!.onLopRated?.("tin_tuc", "bad")
    bus!.onOrderFilled?.({
      symbol: "VNM",
      side: "sell",
      quantity: 200,
      price: 62_400,
      orderId: "o2",
    })

    // Both fire — B registering AFTER A did not wipe A's handler.
    expect(onLopRated).toHaveBeenCalledWith("tin_tuc", "bad")
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
