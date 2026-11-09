import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DojoIntro } from "./dojo-intro"
import { ANATOMY_QUESTIONS, ANATOMY_ZONES, type AnatomyPart } from "./dojo-intro-model"
import { apiError, createDojoBackend, renderDojo, type DojoBackend } from "./dojo-test-support"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))

let backend: DojoBackend
const onExit = vi.fn()

function setup({ preview = false, introFirstTime = true }: { preview?: boolean; introFirstTime?: boolean } = {}) {
  backend = createDojoBackend({ belt: -1, introFirstTime })
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return renderDojo(<DojoIntro preview={preview} onExit={onExit} />)
}

const introPosts = () => backend.callsTo("POST", "/candle-dojo/intro/complete")
const chart = () => screen.getByTestId("dojo-anatomy-chart")
const mark = () => screen.getByTestId("dojo-anatomy-mark")

/** A tap of the part the question asks for, by keyboard (a named part is always the asked one only when it is). */
function pressPart(part: AnatomyPart) {
  const target = document.querySelector(`[data-part="${part}"]`) as Element
  fireEvent.keyDown(target, { key: "Enter" })
}

/** A pointer tap at the middle of `part`, with the chart laid out at its own 360 x 300 size. */
function tapMiddleOf(part: AnatomyPart) {
  const zone = ANATOMY_ZONES[part]
  fireEvent.click(chart(), { clientX: zone.x + zone.width / 2, clientY: zone.y + zone.height / 2 })
}

async function next(user: ReturnType<typeof userEvent.setup>, name = "Tiếp tục") {
  await user.click(screen.getByRole("button", { name }))
}

beforeEach(() => {
  mocks.api.mockReset()
  onExit.mockReset()
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 360, bottom: 300, width: 360, height: 300, toJSON: () => ({}),
  })
})

describe("Candle Dojo intro (Giải phẫu cây nến)", () => {
  it("asks four taps in order and judges each by where the tap landed", async () => {
    const user = userEvent.setup()
    setup()
    expect(screen.getByRole("heading", { name: ANATOMY_QUESTIONS[0].prompt })).toBeTruthy()

    tapMiddleOf("upper")
    expect(mark().getAttribute("data-good")).toBe("true")
    expect(screen.getByRole("status").textContent).toContain("Đúng!")
    await next(user)

    // A tap far from the body is wrong: the right place is marked instead.
    expect(screen.getByRole("heading", { name: "Chạm vào thân nến" })).toBeTruthy()
    fireEvent.click(chart(), { clientX: 20, clientY: 280 })
    expect(mark().getAttribute("data-good")).toBe("false")
    expect(Number(mark().getAttribute("x"))).toBeCloseTo(ANATOMY_ZONES.body.x - 4)
    expect(screen.getByRole("status").textContent).toContain("Chỗ được đánh dấu mới đúng.")
    expect(screen.getByRole("status").textContent).toContain("Thân: từ giá mở đến giá đóng")
    await next(user)

    tapMiddleOf("lower")
    await next(user)

    // The last question names the close of a green candle and labels the open and close prices.
    expect(screen.getByRole("heading", { name: "Nến xanh: chạm vào giá đóng cửa" })).toBeTruthy()
    expect(chart().textContent).toContain("Đóng ?")
    expect(screen.getAllByRole("progressbar")).toHaveLength(1)
  })

  it("real mode: after the fourth answer calls the server once and shows the belt, +100 xu and Dojo 1 from the response", async () => {
    const user = userEvent.setup()
    setup()
    for (const question of ANATOMY_QUESTIONS) {
      pressPart(question.part)
      await next(user, question === ANATOMY_QUESTIONS[3] ? "Hoàn thành" : "Tiếp tục")
    }
    const result = await screen.findByTestId("dojo-intro-result")
    expect(within(result).getByRole("heading", { name: "Hoàn thành nhập môn" })).toBeTruthy()
    expect(result.textContent).toContain("Nhận đai trắng · +100 xu · mở Dojo 1")
    expect(within(result).getByRole("img", { name: "Đai trắng" })).toBeTruthy()
    expect(introPosts()).toHaveLength(1)
    await user.click(within(result).getByRole("button", { name: "Về Dojo" }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it("repeating the intro shows no reward line when the server says it is not the first time", async () => {
    const user = userEvent.setup()
    setup({ introFirstTime: false })
    for (const question of ANATOMY_QUESTIONS) {
      pressPart(question.part)
      await next(user, question === ANATOMY_QUESTIONS[3] ? "Hoàn thành" : "Tiếp tục")
    }
    const result = await screen.findByTestId("dojo-intro-result")
    expect(result.textContent).not.toContain("xu")
    expect(result.textContent).not.toContain("Nhận đai")
    expect(within(result).getByRole("img", { name: "Đai trắng" })).toBeTruthy()
  })

  it("preview mode finishes locally: no API call, nothing saved, clearly said", async () => {
    const user = userEvent.setup()
    setup({ preview: true })
    for (const question of ANATOMY_QUESTIONS) {
      pressPart(question.part)
      await next(user, question === ANATOMY_QUESTIONS[3] ? "Hoàn thành" : "Tiếp tục")
    }
    const result = await screen.findByTestId("dojo-intro-result")
    expect(result.textContent).toContain("Chế độ xem trước: không lưu đai, không nhận xu.")
    expect(result.textContent).not.toContain("+100")
    expect(within(result).getByRole("img", { name: "Đai trắng" })).toBeTruthy()
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it("a failed save says so and Thử lại saves again", async () => {
    const user = userEvent.setup()
    setup()
    backend.intercept((call) => call.path === "/candle-dojo/intro/complete", () => {
      throw apiError(500, "INTERNAL", "boom")
    })
    for (const question of ANATOMY_QUESTIONS) {
      pressPart(question.part)
      await next(user, question === ANATOMY_QUESTIONS[3] ? "Hoàn thành" : "Tiếp tục")
    }
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Máy chủ đang bận")
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    expect((await screen.findByTestId("dojo-intro-result")).textContent).toContain("+100 xu")
    expect(introPosts()).toHaveLength(2)
  })

  it("the ✕ button leaves without calling the server", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole("button", { name: "Thoát nhập môn" }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(mocks.api).not.toHaveBeenCalled()
  })
})
