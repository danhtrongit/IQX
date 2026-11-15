import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"

import type { ThanTaiLa, ThanTaiToday } from "../../net/types.ts"

const api = vi.hoisted(() => ({
  today: vi.fn(),
  draw: vi.fn(),
  predict: vi.fn(),
  cau: vi.fn(),
  results: vi.fn(),
}))

vi.mock("../../net/api.ts", () => ({ floorApi: { thanTai: api } }))
vi.mock("../../net/market.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../net/market.ts")>()
  return {
    ...real,
    directory: () =>
      Promise.resolve([
        { symbol: "FPT", name: "CTCP FPT", exchange: "HOSE" },
        { symbol: "FPTS", name: "Chứng khoán FPT", exchange: "HNX" },
        { symbol: "HPG", name: "Tập đoàn Hòa Phát", exchange: "HOSE" },
      ]),
  }
})

const { ThanTaiPanel } = await import("../panels/ThanTaiPanel.tsx")
const bridge = await import("../../bridge.ts")

const NOW = Date.parse("2026-11-15T02:45:00Z") // 09:45 VN
const DEADLINE = Date.parse("2026-11-15T04:30:00Z") // 11:30 VN

const LA: ThanTaiLa = {
  id: 7,
  hang: "than_trong",
  hangLabel: "Thận trọng",
  que: {
    id: 3,
    ten: "Thủy Lôi Truân",
    chuHan: "水雷屯",
    hao: "100010",
    tren: { key: "kham", ten: "Khảm", symbol: "☵" },
    duoi: { key: "chan", ten: "Chấn", symbol: "☳" },
    tuong: "Sấm động dưới mây dày.",
    thoan: "Truân, nguyên hanh lợi trinh",
    thoanNghia: "Buổi đầu gian nan.",
  },
  haoDong: {
    so: 3,
    ten: "Lục Tam",
    van: "Tức lộc vô ngu",
    nghia: "Đuổi hươu không người dẫn.",
  },
  luan: "Đuổi theo con hươu mình không hiểu đường đi thì lạc trong rừng.",
  chot: "Không hiểu đường rừng, chớ đuổi hươu.",
}

function today(over: Partial<ThanTaiToday> = {}): ThanTaiToday {
  return {
    status: "chua_khan",
    step: 1,
    serverTime: NOW,
    deadline: DEADLINE,
    day: {
      date: "2026-11-15",
      canChi: "Bính Ngọ",
      napAm: "Thiên Hà Thủy",
      hanh: "thuy",
      hanhLabel: "Thủy",
      hop: [
        { hanh: "thuy", label: "Thủy", nganh: ["Thủy sản", "Cảng biển"] },
        { hanh: "moc", label: "Mộc", nganh: ["Cao su"] },
      ],
      kieng: [
        { hanh: "hoa", label: "Hỏa", nganh: ["Điện"] },
        { hanh: "tho", label: "Thổ", nganh: ["Bất động sản"] },
      ],
      mau: [{ ten: "Xanh lam", hex: "#2563eb" }],
      huong: "Bắc",
    },
    vnindexRef: 1746.9,
    la: null,
    prediction: null,
    tickers: null,
    ...over,
  }
}

beforeEach(() => {
  // Reduced motion: no shake or flip waits, so the flow runs straight through.
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("reduce"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  )
  bridge.resetBridge()
  for (const fn of Object.values(api)) fn.mockReset()
})

describe("ThanTaiPanel", () => {
  it("runs draw → predict → cầu → results against the contract", async () => {
    const user = userEvent.setup()
    api.today.mockResolvedValue(today())
    api.draw.mockResolvedValue(today({ status: "dang_do", step: 2, la: LA }))
    api.predict.mockResolvedValue(
      today({ status: "dang_do", step: 3, la: LA, prediction: "up" })
    )
    api.cau.mockResolvedValue(
      today({
        status: "da_xong",
        step: 4,
        la: LA,
        prediction: "up",
        tickers: ["FPT"],
      })
    )
    api.results.mockResolvedValue({
      total: 1284,
      up: 742,
      flat: 93,
      down: 449,
      top5: [
        { ticker: "FPT", count: 214 },
        { ticker: "HPG", count: 107 },
      ],
      asOf: NOW,
    })

    render(<ThanTaiPanel />)
    expect(
      await screen.findByText("Mỗi ngày một lần, trước 11:30.")
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Thành tâm khấn" }))

    const dialog = screen.getByRole("dialog", { name: "Khấn Thần Tài" })
    await user.click(
      within(dialog).getByRole("button", { name: "Lắc ống xăm" })
    )
    expect(await within(dialog).findByText("水雷屯")).toBeTruthy()
    expect(within(dialog).getByText(/☵ Khảm trên/)).toBeTruthy()
    // The luận stays behind its button on the first reading.
    expect(within(dialog).queryByText(LA.chot)).toBeNull()
    await user.click(
      within(dialog).getByRole("button", { name: "Xin thầy luận" })
    )
    expect(within(dialog).getByText(LA.chot)).toBeTruthy()
    expect(
      within(dialog).getByText("Luận theo ngũ hành, mang tính tham khảo vui.")
    ).toBeTruthy()

    await user.click(
      within(dialog).getByRole("button", { name: "Tiếp: Dự đoán VNINDEX →" })
    )
    expect(within(dialog).getByText("1.746,90")).toBeTruthy()
    const confirm = within(dialog).getByRole("button", {
      name: "Xác nhận dự đoán",
    })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(dialog).getByRole("radio", { name: /Tăng/ }))
    await user.click(confirm)
    expect(api.predict).toHaveBeenCalledWith("up")

    const offer = await within(dialog).findByRole("button", {
      name: /Dâng lễ cầu/,
    })
    expect((offer as HTMLButtonElement).disabled).toBe(true)
    await user.type(within(dialog).getByRole("searchbox"), "fpt")
    await user.click(
      await within(dialog).findByRole("option", { name: /FPT CTCP FPT/ })
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Dâng lễ cầu 1 mã" })
    )
    expect(api.cau).toHaveBeenCalledWith(["FPT"])

    expect(
      await within(dialog).findByText("Lộc hôm nay của cả sàn")
    ).toBeTruthy()
    expect(await within(dialog).findByText(/Tăng 742 · bạn/)).toBeTruthy()
    expect(within(dialog).getByText("57,8%")).toBeTruthy()
    expect(within(dialog).queryByText("7,2%")).toBeNull()
    await user.click(within(dialog).getByRole("button", { name: "Hoàn tất" }))
    expect(screen.queryByRole("dialog", { name: "Khấn Thần Tài" })).toBeNull()
    expect(
      screen.getByText("Lễ đã dâng. Lộc hôm nay đã về với bạn.")
    ).toBeTruthy()
  })

  it("resumes an unfinished ritual at its open step", async () => {
    const user = userEvent.setup()
    api.today.mockResolvedValue(
      today({ status: "dang_do", step: 3, la: LA, prediction: "down" })
    )
    render(<ThanTaiPanel />)
    await user.click(
      await screen.findByRole("button", { name: "Khấn tiếp" })
    )
    expect(screen.getByText("Cầu mã tăng")).toBeTruthy()
  })

  it("closes the window with a toast when the server says HET_GIO", async () => {
    const user = userEvent.setup()
    api.today.mockResolvedValueOnce(today())
    api.today.mockResolvedValue(today({ status: "het_gio" }))
    api.draw.mockRejectedValue(new ApiError("late", 409, { code: "HET_GIO" }))
    render(<ThanTaiPanel />)
    await user.click(
      await screen.findByRole("button", { name: "Thành tâm khấn" })
    )
    await user.click(screen.getByRole("button", { name: "Lắc ống xăm" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Khấn Thần Tài" })).toBeNull()
    )
    expect(bridge.ui.toasts.get().map((t) => t.text)).toContain(
      "Đã qua 11:30, không khấn tiếp được"
    )
  })

  it("lets the user retry after a network error", async () => {
    const user = userEvent.setup()
    api.today.mockResolvedValue(today())
    api.draw.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    api.draw.mockResolvedValue(today({ status: "dang_do", step: 2, la: LA }))
    render(<ThanTaiPanel />)
    await user.click(
      await screen.findByRole("button", { name: "Thành tâm khấn" })
    )
    await user.click(screen.getByRole("button", { name: "Lắc ống xăm" }))
    expect(
      await screen.findByText("Chưa gửi được, bạn thử lại nhé")
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Lắc lại" }))
    expect(await screen.findByText("水雷屯")).toBeTruthy()
  })
})
