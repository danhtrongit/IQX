import { act, render } from "@testing-library/react"
import type { Time } from "lightweight-charts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LwcBaselineChart, LwcHistogramChart, LwcMultiLineChart } from "./lwc-host"

const lwcMocks = vi.hoisted(() => {
  const setData = vi.fn()
  const applyOptions = vi.fn()
  const createPriceLine = vi.fn(() => ({ applyOptions: vi.fn() }))
  const removePriceLine = vi.fn()
  const priceScale = vi.fn(() => ({
    applyOptions: vi.fn(),
    width: () => 68,
  }))
  const fitContent = vi.fn()
  const resize = vi.fn()
  const chartApplyOptions = vi.fn()
  const subscribeCrosshairMove = vi.fn()
  const unsubscribeCrosshairMove = vi.fn()
  const remove = vi.fn()
  const removeSeries = vi.fn()
  const addSeries = vi.fn(() => ({
    setData,
    applyOptions,
    createPriceLine,
    removePriceLine,
    priceScale,
    priceToCoordinate: vi.fn(() => 40),
  }))
  const createChart = vi.fn(() => ({
    addSeries,
    removeSeries,
    applyOptions: chartApplyOptions,
    resize,
    timeScale: () => ({ fitContent }),
    priceScale,
    subscribeCrosshairMove,
    unsubscribeCrosshairMove,
    remove,
  }))

  return {
    setData,
    applyOptions,
    fitContent,
    resize,
    createChart,
    addSeries,
  }
})

vi.mock("lightweight-charts", () => ({
  BaselineSeries: "BaselineSeries",
  LineSeries: "LineSeries",
  HistogramSeries: "HistogramSeries",
  ColorType: { Solid: "solid" },
  CrosshairMode: { Magnet: 1 },
  LineStyle: { Solid: 0, Dashed: 2 },
  createChart: lwcMocks.createChart,
}))

describe("LwcBaselineChart defensive daily sanitization (BUG-1) & off-screen resize + data flush ([H7])", () => {
  let resizeCb: (() => void) | null = null
  let intersectionCb: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null
  let getContextSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    resizeCb = null
    intersectionCb = null

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(
        () => ({ measureText: () => ({ width: 10 }) }) as unknown as CanvasRenderingContext2D,
      )

    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          resizeCb = cb
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )

    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
          intersectionCb = cb
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      },
    )

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it("strips invalid intraday 'HH:mm' strings before setData in daily mode so LWC never throws", () => {
    render(
      <LwcBaselineChart
        seriesName="VN-Index"
        refPrice={null}
        timeMode="daily"
        data={[
          { time: "09:15" as Time, value: 1700 },
          { time: "2026-11-20" as Time, value: 1703 },
          { time: "2026-02-30" as Time, value: 1705 },
        ]}
      />,
    )

    expect(lwcMocks.setData).toHaveBeenCalledTimes(1)
    expect(lwcMocks.setData).toHaveBeenLastCalledWith([
      { time: "2026-11-20", value: 1703 },
    ])
  })

  it("flushes BOTH resize (first) and data sync (second) when re-entering viewport after off-screen data update + resize", () => {
    let width = 400
    let height = 240

    const { container, rerender } = render(
      <LwcBaselineChart
        seriesName="VN-Index"
        refPrice={null}
        timeMode="daily"
        data={[{ time: "2026-11-19" as Time, value: 1700 }]}
      />,
    )

    const wrap = container.firstElementChild as HTMLElement
    Object.defineProperty(wrap, "clientWidth", { configurable: true, get: () => width })
    Object.defineProperty(wrap, "clientHeight", { configurable: true, get: () => height })

    const callOrder: string[] = []
    lwcMocks.resize.mockImplementation(() => {
      callOrder.push("resize")
    })
    lwcMocks.setData.mockImplementation(() => {
      callOrder.push("setData")
    })
    lwcMocks.resize.mockClear()
    lwcMocks.setData.mockClear()

    // Scroll off-screen
    act(() => {
      intersectionCb?.([{ isIntersecting: false }])
    })

    // 1. Live data update arrives while off-screen
    rerender(
      <LwcBaselineChart
        seriesName="VN-Index"
        refPrice={null}
        timeMode="daily"
        data={[
          { time: "2026-11-19" as Time, value: 1700 },
          { time: "2026-11-20" as Time, value: 1712 },
        ]}
      />,
    )
    expect(lwcMocks.setData).not.toHaveBeenCalled()

    // 2. Container resizes while STILL off-screen (must NOT overwrite pending data sync!)
    width = 620
    height = 300
    act(() => {
      resizeCb?.()
    })
    expect(lwcMocks.resize).not.toHaveBeenCalled()

    // 3. Re-enter viewport -> BOTH resize (first) and setData (second) flush cleanly!
    act(() => {
      intersectionCb?.([{ isIntersecting: true }])
    })

    expect(lwcMocks.resize).toHaveBeenCalledWith(620, 300)
    expect(lwcMocks.setData).toHaveBeenCalledWith([
      { time: "2026-11-19", value: 1700 },
      { time: "2026-11-20", value: 1712 },
    ])
    expect(callOrder).toEqual(["resize", "setData"])
  })

  it("cancels pending IntersectionObserver flushRaf on unmount and guards disposed chart across all 3 chart hosts ([R2-L1])", () => {
    const cases: Array<{
      name: string
      renderInitial: () => ReturnType<typeof render>
      rerenderUpdated: (rerender: ReturnType<typeof render>["rerender"]) => void
    }> = [
      {
        name: "LwcBaselineChart",
        renderInitial: () =>
          render(
            <LwcBaselineChart
              seriesName="VN-Index"
              refPrice={null}
              timeMode="daily"
              data={[{ time: "2026-11-19" as Time, value: 1700 }]}
            />,
          ),
        rerenderUpdated: (rerender) =>
          rerender(
            <LwcBaselineChart
              seriesName="VN-Index"
              refPrice={null}
              timeMode="daily"
              data={[
                { time: "2026-11-19" as Time, value: 1700 },
                { time: "2026-11-20" as Time, value: 1712 },
              ]}
            />,
          ),
      },
      {
        name: "LwcMultiLineChart",
        renderInitial: () =>
          render(
            <LwcMultiLineChart
              timeMode="daily"
              series={[
                {
                  id: "today",
                  name: "Hôm nay",
                  colorToken: "acc2",
                  data: [{ time: "2026-11-19" as Time, value: 15_000 }],
                },
              ]}
            />,
          ),
        rerenderUpdated: (rerender) =>
          rerender(
            <LwcMultiLineChart
              timeMode="daily"
              series={[
                {
                  id: "today",
                  name: "Hôm nay",
                  colorToken: "acc2",
                  data: [
                    { time: "2026-11-19" as Time, value: 15_000 },
                    { time: "2026-11-20" as Time, value: 17_454 },
                  ],
                },
              ]}
            />,
          ),
      },
      {
        name: "LwcHistogramChart",
        renderInitial: () =>
          render(
            <LwcHistogramChart
              seriesName="Khối ngoại"
              timeMode="daily"
              data={[{ time: "2026-11-19" as Time, value: 120 }]}
            />,
          ),
        rerenderUpdated: (rerender) =>
          rerender(
            <LwcHistogramChart
              seriesName="Khối ngoại"
              timeMode="daily"
              data={[
                { time: "2026-11-19" as Time, value: 120 },
                { time: "2026-11-20" as Time, value: -85 },
              ]}
            />,
          ),
      },
    ]

    for (const hostCase of cases) {
      vi.clearAllMocks()
      let nextRafId = 100
      const pendingRafs = new Map<number, FrameRequestCallback>()
      const cancelSpy = vi.fn((id: number) => {
        pendingRafs.delete(id)
      })
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        const id = nextRafId++
        pendingRafs.set(id, cb)
        return id
      })
      vi.stubGlobal("cancelAnimationFrame", cancelSpy)

      const { container, rerender, unmount } = hostCase.renderInitial()
      const wrap = container.firstElementChild as HTMLElement
      let width = 400
      let height = 240
      Object.defineProperty(wrap, "clientWidth", { configurable: true, get: () => width })
      Object.defineProperty(wrap, "clientHeight", { configurable: true, get: () => height })

      // Drain any initial rAFs (e.g., end-label positioning) then clear mocks.
      for (const [, cb] of Array.from(pendingRafs.entries())) cb(0)
      pendingRafs.clear()
      lwcMocks.resize.mockClear()
      lwcMocks.setData.mockClear()
      cancelSpy.mockClear()

      // Go off-screen, enqueue pending data sync + pending resize.
      act(() => {
        intersectionCb?.([{ isIntersecting: false }])
      })
      hostCase.rerenderUpdated(rerender)
      width = 640
      height = 320
      act(() => {
        resizeCb?.()
      })
      // Run resizeObserver's rAF while off-screen so pendingResizeRef is armed.
      for (const [id, cb] of Array.from(pendingRafs.entries())) {
        pendingRafs.delete(id)
        cb(0)
      }

      // Re-enter viewport -> schedules IntersectionObserver flushRaf (NOT fired yet).
      act(() => {
        intersectionCb?.([{ isIntersecting: true }])
      })
      const scheduledEntries = Array.from(pendingRafs.entries())
      expect(scheduledEntries.length, `${hostCase.name} scheduled flushRaf`).toBe(1)
      const [flushRafId, flushRafCb] = scheduledEntries[0]!

      // Unmount BEFORE flushRaf fires -> must cancel flushRaf!
      unmount()
      expect(cancelSpy, `${hostCase.name} cancelAnimationFrame(flushRaf)`).toHaveBeenCalledWith(
        flushRafId,
      )

      // Even if a stale callback were invoked after disposal, chartRef guard must prevent calls.
      flushRafCb(0)
      expect(lwcMocks.resize, `${hostCase.name} resize after unmount`).not.toHaveBeenCalled()
      expect(lwcMocks.setData, `${hostCase.name} setData after unmount`).not.toHaveBeenCalled()
    }
  })
})
