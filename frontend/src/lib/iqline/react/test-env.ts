/**
 * Môi trường giả cho test của lớp `react/`: jsdom không có Canvas 2D, `ResizeObserver` hay `requestAnimationFrame` đáng tin, nên
 * dựng ba thứ giả có điều khiển. Chỉ dùng trong test.
 */
import { act } from "@testing-library/react"
import { vi } from "vitest"

import { fakeContext, type FakeContext } from "../render/test-support"

export type CanvasEnv = {
  context: FakeContext
  /** Đặt kích thước khung chứa của mọi `ResizeObserver` đang theo dõi. */
  measure(width: number, height: number): void
  /** Chạy các khung hình đang chờ. */
  flush(): void
  frames: FrameRequestCallback[]
}

export function installCanvasEnv(): CanvasEnv {
  const frames: FrameRequestCallback[] = []
  const observers: { callback: ResizeObserverCallback }[] = []
  const context = fakeContext()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback })
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  return {
    context,
    frames,
    measure: (width, height) =>
      act(() => {
        for (const observer of observers) observer.callback([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver)
      }),
    flush: () =>
      act(() => {
        for (const callback of frames.splice(0)) callback(0)
      }),
  }
}

/** Radix (Select, Dropdown, Popover) gọi các hàm con trỏ mà jsdom không có. Gắn một lần vào prototype; không ảnh hưởng test khác. */
export function installRadixPolyfills(): void {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
}
