import { render, renderHook } from "@testing-library/react"
import React, { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import { Cap8Provider, useCap8Events } from "./Cap8Context"

describe("useCap8Events — no-op outside a provider", () => {
  it("isCap8Active is false and notify fns are undefined", () => {
    const { result } = renderHook(() => useCap8Events())
    expect(result.current.isCap8Active).toBe(false)
    expect(result.current.onCheckShown).toBeUndefined()
    expect(result.current.onCheckHanhVi).toBeUndefined()
    expect(result.current.onOrderFilled).toBeUndefined()
  })

  it("registerHandlers is a safe no-op", () => {
    const { result } = renderHook(() => useCap8Events())
    expect(() => result.current.registerHandlers({ onCheckShown: vi.fn() })).not.toThrow()
  })
})

describe("useCap8Events — inside a Cap8Provider", () => {
  it("isCap8Active is true", () => {
    const { result } = renderHook(() => useCap8Events(), { wrapper: Cap8Provider })
    expect(result.current.isCap8Active).toBe(true)
  })

  it("dispatches onCheckShown/onCheckHanhVi/onOrderFilled", () => {
    const onCheckShown = vi.fn()
    const onCheckHanhVi = vi.fn()
    const onOrderFilled = vi.fn()

    function Registrant() {
      const bus = useCap8Events()
      useEffect(() => {
        bus.registerHandlers({ onCheckShown, onCheckHanhVi, onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap8Events> | null = null
    function Notifier() {
      bus = useCap8Events()
      return null
    }

    render(
      <Cap8Provider>
        <Registrant />
        <Notifier />
      </Cap8Provider>,
    )

    bus!.onCheckShown?.("VCB", ["don_nganh", "tuong_quan"])
    expect(onCheckShown).toHaveBeenCalledWith("VCB", ["don_nganh", "tuong_quan"])

    // ★ Một lệnh SẠCH vẫn bắn event với danh sách RỖNG — "đã kiểm tra và không
    // có gì" khác hẳn "chưa kiểm tra bao giờ".
    bus!.onCheckShown?.("HPG", [])
    expect(onCheckShown).toHaveBeenCalledWith("HPG", [])

    // ★ "Vẫn mua" là một lựa chọn HỢP LỆ được GHI LẠI, không phải vi phạm
    // (spec §9: cảnh báo mềm, §C8: hệ không quyết thay user).
    bus!.onCheckHanhVi?.("van_mua")
    expect(onCheckHanhVi).toHaveBeenCalledWith("van_mua")

    bus!.onOrderFilled?.({
      symbol: "VCB",
      side: "buy",
      quantity: 200,
      price: 62_400,
      orderId: "o1",
      donNganhPct: 46.2,
      tuongQuanCaoVoi: { symbol: "MBB", he_so: 0.82 },
      tongRuiRoPct: 17.4,
      danhMucCanhBao: ["don_nganh"],
      hanhViCanhBao: "giam_kl",
    })
    expect(onOrderFilled).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VCB", orderId: "o1", hanhViCanhBao: "giam_kl" }),
    )
  })

  it("merge-semantics: two independent registrants each keep their own handlers", () => {
    const onCheckShown = vi.fn()
    const onOrderFilled = vi.fn()

    function RegistrantA() {
      const bus = useCap8Events()
      useEffect(() => {
        bus.registerHandlers({ onCheckShown })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }
    function RegistrantB() {
      const bus = useCap8Events()
      useEffect(() => {
        bus.registerHandlers({ onOrderFilled })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    }

    let bus: ReturnType<typeof useCap8Events> | null = null
    function Notifier() {
      bus = useCap8Events()
      return null
    }

    render(
      <Cap8Provider>
        <RegistrantA />
        <RegistrantB />
        <Notifier />
      </Cap8Provider>,
    )

    bus!.onCheckShown?.("HPG", [])
    bus!.onOrderFilled?.({
      symbol: "HPG",
      side: "sell",
      quantity: 200,
      price: 27_000,
      orderId: "o2",
    })

    // Both fire — B registering AFTER A did not wipe A's handler.
    expect(onCheckShown).toHaveBeenCalledWith("HPG", [])
    expect(onOrderFilled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o2" }))
  })
})
