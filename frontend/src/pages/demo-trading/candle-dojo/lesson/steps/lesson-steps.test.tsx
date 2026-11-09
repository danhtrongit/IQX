import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { loadLessonBank } from "../lesson-data"
import { resolveLessonContent, type LessonContent } from "../lesson-model"
import { bandsOf, chartsOnScreen, stubReducedMotion, tagsOf } from "../lesson-test-support"
import { IntroStep } from "./intro-step"
import { PlaceStep } from "./place-step"
import { StoryStep } from "./story-step"
import { VolumeStep } from "./volume-step"

vi.mock("../../candle-chart", async () => ({ CandleChart: (await import("../fake-candle-chart")).FakeCandleChart }))

let bank: Awaited<ReturnType<typeof loadLessonBank>>
const content = (id: string): LessonContent => resolveLessonContent(id, bank)!

beforeAll(async () => {
  bank = await loadLessonBank()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Mỗi bước của hoạt cảnh đặt hẹn giờ sau khi React vẽ xong, nên tua từng nhịp nhỏ. */
const runFor = (ms: number, step = 10) => {
  for (let elapsed = 0; elapsed < ms; elapsed += step) act(() => void vi.advanceTimersByTime(step))
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }))
const chart = () => chartsOnScreen()[0]

describe("bước 1 · Giới thiệu", () => {
  it("hiện thẻ của bài, 6 nến bối cảnh mờ, mẫu tô vàng đánh số khi nhiều nến và các nhãn đặc điểm", () => {
    const onContinue = vi.fn()
    render(<IntroStep content={content("engulfing")} onContinue={onContinue} />)

    expect(screen.getAllByRole("img", { name: /thẻ/ })).toHaveLength(2)
    expect(chart().dataset.bars).toBe("8")
    expect(chart().dataset.dimTo).toBe("6")
    expect(JSON.parse(chart().dataset.nums!)).toEqual([6, 7])
    expect(bandsOf(chart())).toEqual([expect.objectContaining({ start: 6, end: 7 })])
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText("Thân nến 2 nuốt trọn thân nến 1")).toBeTruthy()

    click("Tiếp tục")
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it("mẫu một nến không đánh số", () => {
    render(<IntroStep content={content("doji")} onContinue={vi.fn()} />)
    expect(chart().dataset.bars).toBe("7")
    expect(JSON.parse(chart().dataset.nums!)).toEqual([])
  })
})

describe("bước 2 · Câu chuyện", () => {
  it("nến bối cảnh hiện từng nến, mẫu hình thành, rồi tô vàng, gắn tên và hiện nút Tiếp tục", () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const onContinue = vi.fn()
    const lesson = content("hammer")
    render(<StoryStep content={lesson} onContinue={onContinue} />)

    expect(chart().dataset.bars).toBe("1")
    expect(chart().dataset.slots).toBe(String(lesson.exercises.story.length + 2))
    expect(screen.getByText(lesson.lesson.captions[0])).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Tiếp tục" })).toBeNull()

    runFor(120)
    expect(chart().dataset.bars).toBe("2")
    runFor(120 * 3)
    expect(chart().dataset.bars).toBe("5")

    // Đang hình thành nến của mẫu: chú thích giai đoạn 2, chưa có vùng vàng.
    const contextCount = lesson.exercises.story.length - 1
    runFor(120 * (contextCount - 5) + 400 + 55 * 4)
    expect(screen.getByText(lesson.lesson.captions[1])).toBeTruthy()
    expect(bandsOf(chart())).toEqual([])

    runFor(10_000)
    expect(chart().dataset.bars).toBe(String(lesson.exercises.story.length))
    expect(bandsOf(chart())).toEqual([expect.objectContaining({ start: contextCount, end: contextCount })])
    expect(tagsOf(chart())).toEqual([expect.objectContaining({ text: "Hammer", color: "#0B9A5A" })])
    expect(screen.getByText(lesson.lesson.captions.at(-1)!)).toBeTruthy()

    click("Tiếp tục")
    expect(onContinue).toHaveBeenCalledTimes(1)

    click("Xem lại")
    expect(chart().dataset.bars).toBe("1")
  })

  it("khi người học chọn giảm chuyển động thì hiện ngay kết quả cuối kèm đủ các chú thích", () => {
    stubReducedMotion(true)
    const lesson = content("engulfing")
    render(<StoryStep content={lesson} onContinue={vi.fn()} />)

    expect(chart().dataset.bars).toBe(String(lesson.exercises.story.length))
    expect(screen.getAllByRole("listitem")).toHaveLength(lesson.lesson.captions.length)
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeTruthy()
  })
})

describe("bước 3 · Đúng chỗ", () => {
  it("chọn sai: máy hiện tên nhận ra trên cả hai biểu đồ rồi cho tiếp; hết các thẻ của bài thì xong bước", () => {
    const onFinish = vi.fn()
    render(<PlaceStep content={content("hammer")} onFinish={onFinish} />)

    expect(screen.getByRole("heading", { name: "Hammer xuất hiện ở đâu?" })).toBeTruthy()
    expect(chartsOnScreen().flatMap(tagsOf)).toEqual([])

    click("Sau nhịp tăng") // đáp án đúng là sau nhịp giảm
    expect(screen.getByText("Chưa đúng.")).toBeTruthy()
    const [down, up] = chartsOnScreen()
    expect(tagsOf(down)).toEqual([expect.objectContaining({ text: "Hammer", color: "#0B9A5A" })])
    expect(tagsOf(up)).toEqual([expect.objectContaining({ text: "Hanging Man" })])
    expect(screen.queryByRole("button", { name: "Sau nhịp giảm" })?.hasAttribute("disabled")).toBe(true)

    click("Tiếp tục")
    expect(screen.getByRole("heading", { name: "Hanging Man xuất hiện ở đâu?" })).toBeTruthy()
    expect(onFinish).not.toHaveBeenCalled()
    click("Sau nhịp tăng")
    expect(screen.getByText("Chính xác!")).toBeTruthy()
    click("Tiếp tục")
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it("mẫu đúng ở đâu cũng được (Doji): chọn đúng báo không phụ thuộc xu hướng", () => {
    render(<PlaceStep content={content("doji")} onFinish={vi.fn()} />)
    click("Ở đâu cũng được")
    expect(screen.getByText("Chính xác!")).toBeTruthy()
    expect(screen.getByText("Doji không phụ thuộc xu hướng trước đó.")).toBeTruthy()
  })
})

describe("bước 6 · Rồi sao?", () => {
  it("chọn xong biểu đồ chạy tiếp 6 phiên, chờ rồi mới giải thích; chọn lần khối lượng lớn là đúng", () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const onFinish = vi.fn()
    const lesson = content("hammer") // bài số 3 trong danh mục: lần khối lượng lớn ở bên A
    render(<VolumeStep content={lesson} onFinish={onFinish} />)

    expect(screen.getByRole("heading", { name: "Hai lần Hammer. Lần nào đáng tin hơn?" })).toBeTruthy()
    const cut = lesson.exercises.vol.idx + 1
    expect(chartsOnScreen().map((c) => c.dataset.bars)).toEqual([String(cut), String(cut)])

    click("Biểu đồ A")
    expect(chartsOnScreen().map((c) => c.dataset.bars)).toEqual([String(lesson.exercises.vol.A.length), String(lesson.exercises.vol.B.length)])
    expect(chart().dataset.fadeFrom).toBe(String(cut))
    expect(screen.queryByText("Chuẩn!")).toBeNull()

    act(() => void vi.advanceTimersByTime(800))
    expect(screen.getByText("Chuẩn!")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it("mẫu trung tính so hai cú bứt phá và chọn nhầm lần khối lượng nhỏ thì báo nhìn lại", () => {
    stubReducedMotion(true)
    const lesson = content("doji")
    render(<VolumeStep content={lesson} onFinish={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "Sau Doji, cú bứt phá nào đáng tin hơn?" })).toBeTruthy()
    // Có cả cú bứt phá ngay từ đầu (mẫu một nến trung tính).
    expect(chart().dataset.bars).toBe(String(lesson.exercises.vol.idx + 2))
    // Doji là bài thứ hai trong danh mục nên lần khối lượng lớn đổi sang bên B: chọn A là nhầm.
    click("Biểu đồ A")
    expect(screen.getByText("Nhìn lại khối lượng.")).toBeTruthy()
    expect(screen.getByText(/Bứt phá đi kèm khối lượng lớn/)).toBeTruthy()
  })
})
