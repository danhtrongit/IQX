import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SpaceLoadingScreen } from "./SpaceLoadingScreen.tsx"
import {
  clampProgress,
  computeMonotonicProgress,
  EXIT_DURATION_DOOR_MS,
  EXIT_DURATION_ENTER_MS,
  EXIT_DURATION_REDUCED_MS,
  formatDoorSign,
  formatRoomTitle,
  TIP_ROTATE_INTERVAL_MS,
} from "./loading-helpers.ts"
import { FLOOR_TIPS, OFFICE_TIPS } from "./loading-tips.ts"

type MediaChangeListener = (event: MediaQueryListEvent) => void

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<MediaChangeListener>()

  const mql = {
    get matches() {
      return matches
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((event: string, listener: MediaChangeListener) => {
      if (event === "change") listeners.add(listener)
    }),
    removeEventListener: vi.fn(
      (event: string, listener: MediaChangeListener) => {
        if (event === "change") listeners.delete(listener)
      }
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  })

  return {
    setMatches(next: boolean) {
      matches = next
      const evt = { matches: next } as MediaQueryListEvent
      for (const listener of listeners) {
        listener(evt)
      }
    },
  }
}

describe("loading-helpers", () => {
  it("clamps invalid and out-of-range progress values", () => {
    expect(clampProgress(Number.NaN)).toBe(0)
    expect(clampProgress(-0.5)).toBe(0)
    expect(clampProgress(0.42)).toBe(0.42)
    expect(clampProgress(1.8)).toBe(1)
  })

  it("computes monotonic progress and snaps to 1 when done", () => {
    expect(computeMonotonicProgress(0.5, 0.2, false)).toBe(0.5)
    expect(computeMonotonicProgress(0.5, 0.85, false)).toBe(0.85)
    expect(computeMonotonicProgress(0.3, 0.1, true)).toBe(1)
  })

  it("formats enter titles and door signs accurately", () => {
    expect(formatRoomTitle("floor")).toBe("Khu Giao Dịch")
    expect(formatRoomTitle("office", "Nhóm Trưởng Nhóm An")).toBe(
      "Văn phòng · Nhóm Trưởng Nhóm An"
    )
    expect(formatRoomTitle("office")).toBe("Văn phòng")
    expect(formatDoorSign("floor")).toBe("KHU GIAO DỊCH")
    expect(formatDoorSign("office")).toBe("VĂN PHÒNG NHÓM")
  })
})

describe("SpaceLoadingScreen", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders stage text, accessible status semantics, and room title in enter mode", () => {
    mockMatchMedia(false)

    render(
      <SpaceLoadingScreen
        room="floor"
        progress={0.35}
        stage="Đang dựng sàn giao dịch"
        mode="enter"
        done={false}
      />
    )

    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-live")).toBe("polite")
    expect(status.getAttribute("aria-busy")).toBe("true")
    expect(screen.getByText("Khu Giao Dịch")).toBeTruthy()
    expect(screen.getByTestId("loading-stage-text").textContent).toBe(
      "Đang dựng sàn giao dịch"
    )

    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuenow")).toBe("35")
    expect(screen.getByTestId("loading-progress-fill").style.width).toBe("35%")
  })

  it("renders office title with teamName and office-filtered tips", () => {
    mockMatchMedia(false)

    render(
      <SpaceLoadingScreen
        room="office"
        progress={0.2}
        mode="enter"
        done={false}
        teamName="Nhóm Trưởng Nhóm An"
      />
    )

    expect(screen.getByText("Văn phòng · Nhóm Trưởng Nhóm An")).toBeTruthy()
    expect(screen.getByTestId("loading-tip-text").textContent).toBe(
      OFFICE_TIPS[0]
    )
  })

  it("keeps progress width strictly monotonic when progress prop decreases", () => {
    mockMatchMedia(false)

    const { rerender } = render(
      <SpaceLoadingScreen
        room="floor"
        progress={0.25}
        stage="Khởi tạo cảnh 3D"
        mode="enter"
        done={false}
      />
    )

    const fill = screen.getByTestId("loading-progress-fill")
    expect(fill.style.width).toBe("25%")

    rerender(
      <SpaceLoadingScreen
        room="floor"
        progress={0.72}
        stage="Đang nạp vật liệu"
        mode="enter"
        done={false}
      />
    )
    expect(fill.style.width).toBe("72%")

    // Decreasing progress must never shrink visual bar width
    rerender(
      <SpaceLoadingScreen
        room="floor"
        progress={0.4}
        stage="Đang biên dịch shader"
        mode="enter"
        done={false}
      />
    )
    expect(fill.style.width).toBe("72%")
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "72"
    )

    // Higher progress advances normally
    rerender(
      <SpaceLoadingScreen
        room="floor"
        progress={0.91}
        stage="Sẵn sàng vào sàn"
        mode="enter"
        done={false}
      />
    )
    expect(fill.style.width).toBe("91%")
  })

  it("rotates room-filtered friendly tips every ~3.5 seconds", () => {
    vi.useFakeTimers()
    mockMatchMedia(false)

    render(
      <SpaceLoadingScreen
        room="floor"
        progress={0.4}
        mode="enter"
        done={false}
      />
    )

    expect(screen.getByTestId("loading-tip-text").textContent).toBe(
      FLOOR_TIPS[0]
    )

    act(() => {
      vi.advanceTimersByTime(TIP_ROTATE_INTERVAL_MS)
    })
    expect(screen.getByTestId("loading-tip-text").textContent).toBe(
      FLOOR_TIPS[1]
    )

    act(() => {
      vi.advanceTimersByTime(TIP_ROTATE_INTERVAL_MS)
    })
    expect(screen.getByTestId("loading-tip-text").textContent).toBe(
      FLOOR_TIPS[2]
    )
  })

  it("plays exit animation on done, invokes onExited once, then unmounts", () => {
    vi.useFakeTimers()
    mockMatchMedia(false)
    const onExited = vi.fn()

    const { rerender, container } = render(
      <SpaceLoadingScreen
        room="floor"
        progress={0.65}
        stage="Đang dựng sàn giao dịch"
        mode="enter"
        done={false}
        onExited={onExited}
      />
    )

    rerender(
      <SpaceLoadingScreen
        room="floor"
        progress={0.65}
        stage="Hoàn tất"
        mode="enter"
        done={true}
        onExited={onExited}
      />
    )

    const status = screen.getByRole("status")
    expect(status.classList.contains("is-exiting")).toBe(true)
    expect(status.getAttribute("aria-busy")).toBe("false")
    // Snaps progress bar to 100% on completion
    expect(screen.getByTestId("loading-progress-fill").style.width).toBe("100%")
    expect(onExited).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(EXIT_DURATION_ENTER_MS - 1)
    })
    expect(onExited).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onExited).toHaveBeenCalledTimes(1)
    expect(container.firstChild).toBeNull()
  })

  it("supports door mode with double panels, room sign, and exit completion", () => {
    vi.useFakeTimers()
    mockMatchMedia(false)
    const onExited = vi.fn()

    const { rerender, container } = render(
      <SpaceLoadingScreen
        room="office"
        progress={0.5}
        stage="Đang mở cửa văn phòng"
        mode="door"
        done={false}
        teamName="Nhóm Trưởng Nhóm An"
        onExited={onExited}
      />
    )

    const status = screen.getByRole("status")
    expect(status.classList.contains("sls-mode-door")).toBe(true)
    expect(screen.getByTestId("door-panel-left")).toBeTruthy()
    expect(screen.getByTestId("door-panel-right")).toBeTruthy()
    expect(screen.getByText("VĂN PHÒNG NHÓM")).toBeTruthy()
    expect(screen.getByText("Nhóm Trưởng Nhóm An")).toBeTruthy()
    expect(screen.getByText("Đang mở cửa văn phòng")).toBeTruthy()

    rerender(
      <SpaceLoadingScreen
        room="office"
        progress={1}
        stage="Đang mở cửa văn phòng"
        mode="door"
        done={true}
        teamName="Nhóm Trưởng Nhóm An"
        onExited={onExited}
      />
    )

    expect(screen.getByRole("status").classList.contains("is-exiting")).toBe(
      true
    )

    act(() => {
      vi.advanceTimersByTime(EXIT_DURATION_DOOR_MS)
    })
    expect(onExited).toHaveBeenCalledTimes(1)
    expect(container.firstChild).toBeNull()
  })

  it("applies reduced-motion class and uses fast fade exit when prefers-reduced-motion matches", () => {
    vi.useFakeTimers()
    const media = mockMatchMedia(true)
    const onExited = vi.fn()

    const { rerender } = render(
      <SpaceLoadingScreen
        room="floor"
        progress={0.5}
        mode="enter"
        done={false}
        onExited={onExited}
      />
    )

    const status = screen.getByRole("status")
    expect(status.classList.contains("sls-reduced-motion")).toBe(true)
    expect(status.getAttribute("data-reduced-motion")).toBe("true")

    // Reacts dynamically if user toggles system reduced-motion setting
    act(() => {
      media.setMatches(false)
    })
    expect(status.classList.contains("sls-reduced-motion")).toBe(false)

    act(() => {
      media.setMatches(true)
    })
    expect(status.classList.contains("sls-reduced-motion")).toBe(true)

    rerender(
      <SpaceLoadingScreen
        room="floor"
        progress={1}
        mode="enter"
        done={true}
        onExited={onExited}
      />
    )

    act(() => {
      vi.advanceTimersByTime(EXIT_DURATION_REDUCED_MS)
    })
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it("cancels exit timer cleanly if unmounted before exit finishes", () => {
    vi.useFakeTimers()
    mockMatchMedia(false)
    const onExited = vi.fn()

    const { unmount } = render(
      <SpaceLoadingScreen
        room="floor"
        progress={1}
        mode="enter"
        done={true}
        onExited={onExited}
      />
    )

    unmount()
    act(() => {
      vi.advanceTimersByTime(EXIT_DURATION_ENTER_MS * 2)
    })
    expect(onExited).not.toHaveBeenCalled()
  })

  it("renders KHU GIAO DỊCH door sign for floor and resets progress if reused after exit", () => {
    vi.useFakeTimers()
    mockMatchMedia(false)

    const { rerender } = render(
      <SpaceLoadingScreen
        room="floor"
        progress={0.8}
        mode="door"
        done={false}
      />
    )
    expect(screen.getByText("KHU GIAO DỊCH")).toBeTruthy()

    rerender(
      <SpaceLoadingScreen
        room="floor"
        progress={0.8}
        mode="enter"
        done={true}
      />
    )
    act(() => {
      vi.advanceTimersByTime(EXIT_DURATION_ENTER_MS)
    })

    // Reusing the same instance for a fresh enter cycle resets monotonic progress cleanly
    rerender(
      <SpaceLoadingScreen
        room="floor"
        progress={0.15}
        mode="enter"
        done={false}
      />
    )
    expect(screen.getByTestId("loading-progress-fill").style.width).toBe("15%")
  })
})
