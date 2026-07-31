import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { Cap6Provider, useCap6Events } from "./Cap6Context"

describe("useCap6Events — no-op outside a provider", () => {
  it("isCap6Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap6Events())
    expect(result.current.isCap6Active).toBe(false)
    expect(result.current.onConflictShown).toBeUndefined()
    expect(result.current.onLopQuyetDinhPicked).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap6Events())
    expect(() => result.current.registerHandlers({ onConflictShown: vi.fn() })).not.toThrow()
  })
})

describe("useCap6Events — inside a Cap6Provider", () => {
  it("isCap6Active is true", () => {
    const { result } = renderHook(() => useCap6Events(), { wrapper: Cap6Provider })
    expect(result.current.isCap6Active).toBe(true)
  })

  it("dispatches onConflictShown/onLopQuyetDinhPicked/onOrderFilled", () => {
    const onConflictShown = vi.fn()
    const onLopQuyetDinhPicked = vi.fn()
    const onOrderFilled = vi.fn()

    function Registrant() {
      const bus = useCap6Events()
      useEffect(() => {
        bus.registerHandlers({ onConflictShown, onLopQuyetDinhPicked, onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap6Events> | null = null
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

    bus!.onConflictShown?.("VNM", "ngan_hang")
    expect(onConflictShown).toHaveBeenCalledWith("VNM", "ngan_hang")

    // khớp gợi ý = `false` là một SỰ THẬT TRUNG TÍNH (spec §5/§10), không phải "sai".
    bus!.onLopQuyetDinhPicked?.("ky_thuat", false)
    expect(onLopQuyetDinhPicked).toHaveBeenCalledWith("ky_thuat", false)

    bus!.onOrderFilled?.({
      symbol: "VNM",
      side: "buy",
      quantity: 200,
      price: 62_400,
      orderId: "o1",
      kieuCoPhieu: "ngan_hang",
      lopQuyetDinh: "dinh_gia",
    })
    expect(onOrderFilled).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", orderId: "o1", lopQuyetDinh: "dinh_gia" }),
    )
  })

  it("merge-semantics: two independent registrants each keep their own handlers", () => {
    const onConflictShown = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap6Events()
      useEffect(() => {
        bus.registerHandlers({ onConflictShown })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap6Events()
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap6Events> | null = null
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

    bus!.onConflictShown?.("HPG", null)
    bus!.onOrderFilled?.({
      symbol: "HPG",
      side: "sell",
      quantity: 200,
      price: 27_000,
      orderId: "o2",
    })

    // Both fire — B registering AFTER A did not wipe A's handler.
    expect(onConflictShown).toHaveBeenCalledWith("HPG", null)
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
