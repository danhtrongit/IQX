import { act, render, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { CD_HUNT_SECONDS } from "@/lib/candle-dojo/grading"
import { loadLessonBank } from "../lesson-data"
import { resolveLessonContent, type LessonContent } from "../lesson-model"
import { bandsOf, chartsOnScreen, tagsOf, tapBar } from "../lesson-test-support"
import { HuntStep, type HuntOutcome } from "./hunt-step"

vi.mock("../../candle-chart", async () => ({ CandleChart: (await import("../fake-candle-chart")).FakeCandleChart }))

// Hammer: mục tiêu ở nến 3, 14, 36; mồi nhử ở 25 (không tên) và 47 (Hanging Man).
let content: LessonContent
beforeAll(async () => {
  content = resolveLessonContent("hammer", await loadLessonBank())!
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const onEnd = vi.fn<(taps: number[]) => void>()
  const outcomes: HuntOutcome[] = []
  render(
    <HuntStep
      content={content}
      badge="4 · Săn nến"
      onEnd={onEnd}
      renderBar={(outcome) => {
        outcomes.push(outcome)
        return <div data-testid="bar">{outcome.result.found}/{outcome.result.total}</div>
      }}
    />,
  )
  return { onEnd, outcomes }
}

const chart = () => chartsOnScreen()[0]
const timer = () => screen.getByRole("timer")
const tick = (seconds: number) => act(() => void vi.advanceTimersByTime(seconds * 1000))

describe("Săn nến: chạm", () => {
  it("chạm trúng mẫu thì mẫu hiện tên thẻ và tô xanh, chạm nhầm thì máy nói tên nó nhận ra", () => {
    setup()
    expect(screen.getByText("Chạm vào mẫu nến. Cẩn thận mồi nhử.")).toBeTruthy()
    expect(screen.getByText("0/3")).toBeTruthy()

    tapBar(4) // lệch 1 nến vẫn trúng mẫu ở nến 3
    expect(screen.getByText("Trúng!")).toBeTruthy()
    expect(screen.getByText("1/3")).toBeTruthy()
    expect(bandsOf(chart())).toEqual([expect.objectContaining({ start: 3, end: 3, color: "#0B9A5A" })])
    expect(tagsOf(chart())).toEqual([expect.objectContaining({ start: 3, end: 3, text: "Hammer" })])

    tapBar(47)
    expect(screen.getByText("Đây là Hanging Man")).toBeTruthy()
    expect(tagsOf(chart()).some((tag) => tag.text === "Hanging Man" && tag.start === 47)).toBe(true)
    expect(screen.getByTestId("hunt-ring")).toBeTruthy()

    tapBar(25)
    expect(screen.getByText("Không phải Hammer")).toBeTruthy()
    // Chạm nhầm không làm mất mẫu đã tìm thấy.
    expect(screen.getByText("1/3")).toBeTruthy()
  })

  it("tìm liên tiếp thì tính combo, chạm nhầm thì hết combo", () => {
    setup()
    tapBar(3)
    tapBar(14)
    expect(screen.getByText("Combo x2!")).toBeTruthy()
    expect(screen.getByText("x2")).toBeTruthy()
    tapBar(20)
    expect(screen.queryByText("x2")).toBeNull()
  })

  it("tìm đủ mẫu thì kết thúc ngay và gửi mọi lần chạm, kể cả chạm nhầm và chạm lại", () => {
    const { onEnd, outcomes } = setup()
    tapBar(3)
    tapBar(47)
    tapBar(3) // chạm lại mẫu đã tìm: không tính nhầm
    tapBar(14)
    expect(onEnd).not.toHaveBeenCalled()
    tapBar(36)

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith([3, 47, 3, 14, 36])
    const outcome = outcomes.at(-1)!
    expect(outcome.result).toMatchObject({ found: 3, total: 3, miss: 1, star: true })
    expect(within(screen.getByTestId("bar")).getByText("3/3")).toBeTruthy()
    // Đã xong: không chạm thêm được nữa.
    expect(screen.queryByRole("button", { name: "Nến 3" })).toBeNull()
  })

  it("nhầm từ hai lần trở lên thì tìm đủ cũng không được sao", () => {
    const { outcomes } = setup()
    tapBar(20)
    tapBar(30)
    tapBar(3)
    tapBar(14)
    tapBar(36)
    expect(outcomes.at(-1)!.result).toMatchObject({ found: 3, miss: 2, star: false })
  })

  it("khung biểu đồ cố định: không cuộn, không kéo", () => {
    setup()
    const frame = screen.getByTestId("hunt-frame")
    expect(frame.className).toContain("overflow-hidden")
    expect(frame.className).toContain("touch-none")
    expect(chart().dataset.bars).toBe(String(content.exercises.hunt.bars.length))
  })
})

describe("Săn nến: đồng hồ 30 giây", () => {
  it("đếm ngược từng giây", () => {
    setup()
    expect(timer().textContent).toBe(String(CD_HUNT_SECONDS))
    tick(10)
    expect(timer().textContent).toBe("20")
  })

  it("hết giờ: kết thúc đúng một lần, tô vàng các mẫu chưa tìm, gửi các lần chạm", () => {
    const { onEnd, outcomes } = setup()
    tapBar(3)
    tapBar(25)
    tick(CD_HUNT_SECONDS)

    expect(timer().textContent).toBe("0")
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith([3, 25])
    expect(outcomes.at(-1)!.result).toMatchObject({ found: 1, total: 3, miss: 1, star: false })
    const gold = bandsOf(chart()).filter((band) => band.color === "#D99A00")
    expect(gold.map((band) => band.start)).toEqual([14, 36])
    expect(screen.queryByRole("button", { name: "Nến 14" })).toBeNull()
    expect(screen.getByText("Hết giờ! Mẫu còn sót đã được tô vàng.")).toBeTruthy()

    tick(60)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
