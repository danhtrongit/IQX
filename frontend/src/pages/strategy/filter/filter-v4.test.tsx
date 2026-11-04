/**
 * Bộ lọc 4.0 on screen: the two library tabs, Thị trường, the Kỹ thuật cards, the new result columns,
 * sorting, the technical detail, the 3.0 sector review, and what is frozen when a result is saved.
 */
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot as render, stubBrowser } from "../../demo-trading/bot/test-render"
import { callsTo } from "../../demo-trading/bot/test-support"
import { createStrategyApi, createStrategyWorld, FakeApiError, T0, type StrategyWorld } from "../test-support"
import { FilterTab } from "./filter-tab"
import { emptyMarket } from "./market"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, isPremium: true, premiumLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

let world: StrategyWorld
type User = ReturnType<typeof userEvent.setup>

beforeEach(() => {
  world = createStrategyWorld()
  mocks.api.mockReset()
  mocks.api.mockImplementation(createStrategyApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

const posts = (path: string) => callsTo(world, "POST", path)
const runBody = () => posts("/strategy/screener/run").at(-1)!.body as Record<string, unknown> & { market: Record<string, unknown>; technical: Array<Record<string, unknown>>; rules: unknown[]; columns?: unknown[] }

async function renderTab() {
  render(<FilterTab />, "/chien-luoc?tab=bo-loc")
  await screen.findByRole("region", { name: "Cơ bản" })
}

const library = () => screen.getByRole("complementary", { name: "Thư viện chỉ tiêu" })
const results = () => screen.findByRole("region", { name: "Kết quả sàng lọc" })
const runButton = () => screen.getByRole("button", { name: /Chạy bộ lọc|Đang lọc/ })
const chip = (group: string, name: string) => within(screen.getByRole("group", { name: group })).getByRole("button", { name })

async function openTechnicalTab(user: User) {
  await user.click(within(library()).getByRole("tab", { name: "Kỹ thuật" }))
  await within(library()).findByTestId("indicator-rsi")
}

async function openBasicTab(user: User) {
  await user.click(within(library()).getByRole("tab", { name: "Cơ bản" }))
  await within(library()).findByTestId("metric-roe")
}

async function addMetric(user: User, name: string) {
  await openBasicTab(user)
  await user.click(within(library()).getByRole("button", { name: `Thêm ${name} vào điều kiện lọc` }))
}

async function addIndicator(user: User, name: string) {
  await openTechnicalTab(user)
  await user.click(within(library()).getByRole("button", { name: `Thêm ${name} vào điều kiện kỹ thuật` }))
}

async function runFilter(user: User) {
  await user.click(runButton())
  return results()
}

/** RSI row 1 is `RSI14 > 60`, row 2 `RSI14 xu hướng lên`: FPT and CMG pass both. */
async function addRsiAbove60(user: User) {
  await addIndicator(user, "RSI")
  const card = screen.getByTestId("tech-rsi")
  await user.selectOptions(within(card).getByLabelText("Dấu so sánh (dòng 1, RSI)"), ">")
  const threshold = within(card).getByLabelText("Ngưỡng RSI (dòng 1, RSI)")
  await user.clear(threshold)
  await user.type(threshold, "60")
}

describe("library", () => {
  it("has two tabs, Cơ bản first, and lists the metrics the account can use in the blocks, groups and names of the Dashboard", async () => {
    await renderTab()
    const tabs = within(library()).getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Cơ bản", "Kỹ thuật"])
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true")
    // First level groups per Học viện v4.1 §6.2; second level groups and order per the Dashboard.
    expect(within(library()).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Chỉ tiêu chung", "Chỉ tiêu doanh nghiệp sản xuất"])
    expect(within(library()).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["Tăng trưởng", "Hiệu quả", "Hiệu quả và biên lợi nhuận"])
    expect(within(library()).getAllByTestId(/^metric-/).map((item) => item.getAttribute("data-testid"))).toEqual([
      "metric-revenue_yoy", "metric-profit_yoy", "metric-eps_yoy", "metric-roe", "metric-net_margin", "metric-gross_margin", "metric-roic",
    ])
    expect(within(library()).getByText("Tăng trưởng LNST")).toBeTruthy()
    expect(library().textContent).not.toContain("YoY")
    // Never a chapter name, an "Đã mở" label or a way to unlock; a metric the account cannot use is not listed.
    expect(library().textContent).not.toMatch(/Chương|đã mở|Chưa mở|học bài/)
    expect(within(library()).queryByTestId("metric-roa")).toBeNull()
    expect(within(library()).getByLabelText("5 mục")).toBeTruthy()
    // One that is open but not ready says why.
    const eps = within(library()).getByTestId("metric-eps_yoy")
    expect(eps.textContent).toMatch(/Chưa dùng được: Nguồn dữ liệu hiện tại chưa có EPS/)
    expect(within(eps).getByRole("button").hasAttribute("disabled")).toBe(true)
    expect(within(library()).getByTestId("metric-roic").textContent).toMatch(/Chưa có thuế suất chuẩn hóa/)
  })

  it("names all 42 lessons in the catalog dialog with what each is missing, by industry group and never by chapter", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(within(library()).getByRole("button", { name: "Danh mục 42 chỉ tiêu" }))
    const dialog = await screen.findByRole("dialog", { name: /Danh mục 8 chỉ tiêu/ })
    expect(within(dialog).getByTestId("catalog-roa").textContent).toContain("Chưa dùng được")
    expect(within(dialog).getByTestId("catalog-roa").textContent).toContain("Chỉ tiêu doanh nghiệp sản xuất")
    expect(dialog.textContent).not.toMatch(/Chương|Chưa mở/)
    expect(within(dialog).getByTestId("catalog-roic").textContent).toContain("Chờ định nghĩa")
    expect(within(dialog).getByTestId("catalog-eps_yoy").textContent).toContain("Chưa có nguồn dữ liệu")
    expect(within(dialog).getByTestId("catalog-roe").textContent).toContain("Dùng được")
    // The Dashboard's name, not the lesson's.
    expect(within(dialog).getByTestId("catalog-revenue_yoy").textContent).toContain("Tăng trưởng doanh thu")
  })

  it("lists the 16 indicators of the Bot in 7 groups, all open, and each can be added once: + becomes a tick, the card's X gives it back", async () => {
    const user = userEvent.setup()
    await renderTab()
    await openTechnicalTab(user)
    expect(within(library()).getAllByTestId(/^indicator-/)).toHaveLength(16)
    expect(within(library()).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["Đường trung bình", "Động lượng", "Biến động", "Kênh giá", "Xu hướng", "Khối lượng", "Dòng tiền"])
    expect(within(library()).getAllByRole("button", { name: /^Thêm .* vào điều kiện kỹ thuật$/ }).every((button) => !(button as HTMLButtonElement).disabled)).toBe(true)

    await user.click(within(library()).getByRole("button", { name: "Thêm RSI vào điều kiện kỹ thuật" }))
    const added = within(library()).getByRole("button", { name: "RSI đã có trong điều kiện kỹ thuật" })
    expect((added as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByTestId("tech-rsi")).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Bỏ RSI" }))
    expect(screen.queryByTestId("tech-rsi")).toBeNull()
    expect((within(library()).getByRole("button", { name: "Thêm RSI vào điều kiện kỹ thuật" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("searches the library by name without accents or case, in either tab", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.type(within(library()).getByLabelText("Tìm trong thư viện"), "tang truong")
    expect(within(library()).getAllByTestId(/^metric-/).map((item) => item.getAttribute("data-testid"))).toEqual(["metric-revenue_yoy", "metric-profit_yoy", "metric-eps_yoy"])
    await user.click(within(library()).getByRole("tab", { name: "Kỹ thuật" }))
    expect(await within(library()).findByText("Không có chỉ báo phù hợp.")).toBeTruthy()
    await user.clear(within(library()).getByLabelText("Tìm trong thư viện"))
    await user.type(within(library()).getByLabelText("Tìm trong thư viện"), "chaikin")
    expect(within(library()).getAllByTestId(/^indicator-/).map((item) => item.getAttribute("data-testid"))).toEqual(["indicator-cmf"])
  })
})

describe("Thị trường", () => {
  it("is at the top of Cơ bản with the six items of the spec, and has no ICB sector or single-exchange box any more", async () => {
    await renderTab()
    const basic = screen.getByRole("region", { name: "Cơ bản" })
    const market = within(basic).getByRole("region", { name: "Thị trường" })
    expect(market.compareDocumentPosition(within(basic).getByRole("region", { name: "Chỉ tiêu tài chính" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(screen.getByRole("group", { name: "Sàn" })).getAllByRole("button").map((button) => button.textContent)).toEqual(["HOSE", "HNX", "UPCOM"])
    expect(within(screen.getByRole("group", { name: "Rổ chỉ số" })).getAllByRole("button").map((button) => button.textContent)).toEqual(["VN30", "VN100", "VNMidcap", "VNSmallcap", "HNX30"])
    expect(within(screen.getByRole("group", { name: "Ngành (nhóm báo cáo tài chính)" })).getAllByRole("button").map((button) => button.textContent)).toEqual(["Thường", "Ngân hàng", "Chứng khoán", "Bảo hiểm"])
    for (const label of ["Vốn hóa từ (tỷ đồng)", "Vốn hóa đến (tỷ đồng)", "Số phiên tính giá trị giao dịch bình quân", "Giá trị giao dịch bình quân tối thiểu (tỷ đồng)", "Giá đóng cửa từ (nghìn đồng)", "Giá đóng cửa đến (nghìn đồng)"]) {
      expect(within(market).getByLabelText(label)).toBeTruthy()
    }
    expect((within(market).getByLabelText("Số phiên tính giá trị giao dịch bình quân") as HTMLInputElement).value).toBe("20")
    expect(within(market).queryByRole("combobox")).toBeNull()
    expect(screen.queryByText("Phạm vi lọc")).toBeNull()
    expect(within(basic).queryByText(/ICB/)).toBeNull()
  })

  it("sends every choice in the unit shown, and nothing for what is left blank", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(chip("Sàn", "HNX"))
    await user.click(chip("Sàn", "HOSE"))
    await user.click(chip("Rổ chỉ số", "VNMidcap"))
    await user.click(chip("Ngành (nhóm báo cáo tài chính)", "Ngân hàng"))
    await user.type(screen.getByLabelText("Vốn hóa từ (tỷ đồng)"), "1000")
    const sessions = screen.getByLabelText("Số phiên tính giá trị giao dịch bình quân")
    await user.clear(sessions)
    await user.type(sessions, "30")
    await user.type(screen.getByLabelText("Giá trị giao dịch bình quân tối thiểu (tỷ đồng)"), "2,5")
    await user.type(screen.getByLabelText("Giá đóng cửa đến (nghìn đồng)"), "50")
    await runFilter(user)
    expect(runBody().market).toEqual({
      exchanges: ["HOSE", "HNX"], baskets: ["VNMIDCAP"], statement_groups: ["nh"],
      market_cap: { min: 1000, max: null }, avg_value: { sessions: 30, min: 2.5 }, close_price: { min: null, max: 50 },
    })
    // Without a fundamental condition the run needs no fundamental data and no reference column.
    expect(runBody().columns).toBeUndefined()
    expect(runBody().rules).toEqual([])
  })

  it("stops the run on a wrong value, with the Cơ bản · Thị trường prefix, and shows the message under the field", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.type(screen.getByLabelText("Vốn hóa từ (tỷ đồng)"), "500")
    await user.type(screen.getByLabelText("Vốn hóa đến (tỷ đồng)"), "100")
    expect(within(screen.getByRole("region", { name: "Thị trường" })).getByText('Vốn hóa: "từ" phải nhỏ hơn hoặc bằng "đến".')).toBeTruthy()
    expect(screen.getByLabelText("Vốn hóa từ (tỷ đồng)").getAttribute("aria-invalid")).toBe("true")
    await user.click(runButton())
    expect((await screen.findByRole("alert")).textContent).toBe('Cơ bản · Thị trường: Vốn hóa: "từ" phải nhỏ hơn hoặc bằng "đến".')
    expect(posts("/strategy/screener/run")).toHaveLength(0)

    await user.clear(screen.getByLabelText("Vốn hóa đến (tỷ đồng)"))
    const sessions = screen.getByLabelText("Số phiên tính giá trị giao dịch bình quân")
    await user.clear(sessions)
    await user.type(sessions, "3")
    await user.click(runButton())
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Cơ bản · Thị trường: Số phiên phải từ 5 đến 100, số nguyên."))
    expect(posts("/strategy/screener/run")).toHaveLength(0)
  })

  it("keeps the market and shows the companies in scope: several exchanges are a union, an exchange with a basket is an intersection", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(chip("Sàn", "HOSE"))
    await user.click(chip("Sàn", "HNX"))
    let panel = await runFilter(user)
    expect(within(panel).getAllByTestId(/^row-/).map((row) => row.getAttribute("data-testid"))).toEqual(["row-CMG", "row-FPT", "row-HPG", "row-MBB", "row-XYZ"])
    expect(within(panel).getByTestId("result-counts").textContent).toBe("5 doanh nghiệp trong phạm vi · 5 đạt · 0 không đạt ngưỡng · 0 có điều kiện không tính được")

    await user.click(chip("Sàn", "HNX"))
    await user.click(chip("Rổ chỉ số", "VN30"))
    panel = await runFilter(user)
    await waitFor(() => expect(within(panel).getAllByTestId(/^row-/).map((row) => row.getAttribute("data-testid"))).toEqual(["row-FPT", "row-HPG", "row-MBB"]))
  })

  it("does not read HOSE and VN30 as a no-filter: with no choice at all every company is in scope, all of them pass", async () => {
    const user = userEvent.setup()
    await renderTab()
    expect(screen.getByTestId("run-summary").textContent).toBe("Chưa áp tiêu chí: xem toàn bộ doanh nghiệp trong phạm vi.")
    const panel = await runFilter(user)
    expect(within(panel).getByTestId("passed-count").textContent).toBe("6 doanh nghiệp")
  })
})

describe("Kỹ thuật", () => {
  it("starts a card from the Bot's Mua defaults: every row, its values and its switch", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "RSI")
    const card = screen.getByTestId("tech-rsi")
    expect(within(card).getAllByRole("switch").map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "true"])
    expect((within(card).getByLabelText("Chu kỳ RSI (dòng 1, RSI)") as HTMLInputElement).value).toBe("14")
    expect((within(card).getByLabelText("Dấu so sánh (dòng 1, RSI)") as HTMLSelectElement).value).toBe("<")
    expect((within(card).getByLabelText("Ngưỡng RSI (dòng 1, RSI)") as HTMLInputElement).value).toBe("30")
    expect((within(card).getByLabelText("Chu kỳ RSI (dòng 2, RSI)") as HTMLInputElement).value).toBe("14")
    // MACD has rows that the Bot keeps off.
    await user.click(within(library()).getByRole("button", { name: "Thêm MACD vào điều kiện kỹ thuật" }))
    expect(within(screen.getByTestId("tech-macd")).getAllByRole("switch").map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false", "false"])
    expect(screen.queryByRole("tab", { name: /^(Mua|Bán)$/ })).toBeNull()
    expect(screen.getByTestId("technical-count").textContent).toBe("2 chỉ báo · 3 dòng bật · AND · xét tại phiên đã đóng cửa gần nhất")
  })

  it("starts Khối lượng at N = 20, k = 1,1 with two rows that are always on", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "Khối lượng")
    const card = screen.getByTestId("tech-volume")
    expect((within(card).getByLabelText("Số phiên tham chiếu") as HTMLInputElement).value).toBe("20")
    expect((within(card).getByLabelText("Hệ số khối lượng") as HTMLInputElement).value).toBe("1,1")
    expect((within(card).getByLabelText("Dấu so sánh giá đóng cửa") as HTMLSelectElement).value).toBe(">")
    expect((within(card).getByLabelText("Dấu so sánh khối lượng") as HTMLSelectElement).value).toBe(">")
    expect(within(card).queryAllByRole("switch")).toHaveLength(0)
    expect(within(card).getByText("1,1 × TB 20 phiên")).toBeTruthy()
    expect(screen.getByTestId("run-summary").textContent).toBe("2 điều kiện · AND")
  })

  it("reports a wrong value of a row with the indicator's name instead of the Bot's Mua tab, and stops the run", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "RSI")
    const period = within(screen.getByTestId("tech-rsi")).getByLabelText("Chu kỳ RSI (dòng 1, RSI)")
    await user.clear(period)
    await user.type(period, "1")
    expect(within(screen.getByTestId("tech-rsi")).getByTestId("row-errors-rsi").textContent).toBe("RSI · Dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")
    expect(period.getAttribute("aria-invalid")).toBe("true")
    await user.click(runButton())
    await waitFor(() => expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toContain("RSI · Dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên."))
    expect(posts("/strategy/screener/run")).toHaveLength(0)
  })

  it("checks Khối lượng by its own limits", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "Khối lượng")
    const card = screen.getByTestId("tech-volume")
    const sessions = within(card).getByLabelText("Số phiên tham chiếu")
    await user.clear(sessions)
    await user.type(sessions, "4")
    const factor = within(card).getByLabelText("Hệ số khối lượng")
    await user.clear(factor)
    await user.type(factor, "3,5")
    expect(within(card).getByTestId("row-errors-volume").textContent).toBe("Khối lượng · Số phiên tham chiếu phải từ 5 đến 100, số nguyên.Khối lượng · Hệ số khối lượng phải từ 0,5 đến 3.")
    await user.clear(factor)
    await user.type(factor, "1,25")
    expect(within(card).getByTestId("row-errors-volume").textContent).toContain("Khối lượng · Hệ số khối lượng phải theo bước 0,1.")
    await user.click(runButton())
    await waitFor(() => expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toContain("Khối lượng · Số phiên tham chiếu phải từ 5 đến 100, số nguyên."))
    expect(posts("/strategy/screener/run")).toHaveLength(0)
  })

  it("sends the cards as definition items: every row of the indicator with its switch, Khối lượng with N, k and its two signs", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "RSI")
    await user.click(within(library()).getByRole("button", { name: "Thêm Khối lượng vào điều kiện kỹ thuật" }))
    await user.click(within(screen.getByTestId("tech-rsi")).getByRole("switch", { name: "Bật dòng 2 của RSI" }))
    await user.selectOptions(within(screen.getByTestId("tech-volume")).getByLabelText("Dấu so sánh khối lượng"), "<")
    await runFilter(user)
    expect(runBody().technical).toEqual([
      { indicator: "rsi", rules: [{ id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 30 }, { id: "rsi.trend", enabled: false, period: 14, dir: "up" }] },
      { indicator: "volume", sessions: 20, factor: 1.1, ops: [">", "<"] },
    ])
  })
})

describe("results", () => {
  it("adds Sàn, Ngành (the statement group), Giá, +/− %, Vốn hóa and GTGD TB{N} to every result, and a column for each switched-on technical row under its session", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addRsiAbove60(user)
    await user.click(within(library()).getByRole("button", { name: "Thêm Khối lượng vào điều kiện kỹ thuật" }))
    const panel = await runFilter(user)
    expect(within(panel).getByTestId("passed-count").textContent).toBe("2 doanh nghiệp")
    expect(within(panel).getByTestId("result-fundamental-line").textContent).toBe("Cơ bản: báo cáo mới nhất đã công bố · Mốc dữ liệu: 10:00 08/10/2026 · Nguồn VCI")
    expect(within(panel).getByTestId("result-session-line").textContent).toBe("Thị trường và kỹ thuật: phiên đã đóng cửa 07/10/2026")
    const heads = within(panel).getAllByRole("columnheader").map((head) => head.textContent)
    expect(heads.slice(1, 9)).toEqual(["Mã▲", "Doanh nghiệp", "Sàn", "Ngành", "Giá(nghìn đ)", "+/− %", "Vốn hóa(tỷ đ)", "GTGD TB20(tỷ đ)"])
    expect(heads.slice(9)).toEqual(["RSI14phiên 07/10", "RSI14 nay / 14 phiên trướcphiên 07/10", "Giá nay / trướcphiên 07/10", "KL / 1,1×TB20 (nghìn cp)phiên 07/10"])

    const fpt = within(panel).getByTestId("row-FPT")
    expect(within(fpt).getAllByRole("cell").map((cellElement) => cellElement.textContent).slice(1, 9)).toEqual(["FPT", "CTCP FPT", "HOSE", "Thường", "124,50", "+1,23", "183.000", "480,5"])
    expect(fpt.textContent).toContain("63,7")
    expect(fpt.textContent).toContain("63,7 / 55,2")
    expect(fpt.textContent).toContain("230 / 189")
    expect(within(fpt).getByRole("button", { name: "FPT · Giá nay / trước: 124,50 / 123,50, đạt. Xem chi tiết" })).toBeTruthy()
    expect(within(panel).getByTestId("row-CMG")).toBeTruthy()
    expect(within(panel).queryByTestId("row-HPG")).toBeNull()
  })

  it("shows the red and the green of the change, and writes a company that is not on the list with a dash instead of 0", async () => {
    const user = userEvent.setup()
    await renderTab()
    const panel = await runFilter(user)
    expect(within(within(panel).getByTestId("row-HPG")).getByText("−0,55").className).toContain("text-price-down")
    expect(within(within(panel).getByTestId("row-FPT")).getByText("+1,23").className).toContain("text-price-up")
  })

  it("turns NO_SIGNAL into 'Chưa đủ lịch sử giá', counts the company as one whose condition cannot be calculated and never passes it", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addRsiAbove60(user)
    const panel = await runFilter(user)
    expect(within(panel).queryByTestId("row-XYZ")).toBeNull()
    expect(within(panel).getByTestId("result-counts").textContent).toBe("6 doanh nghiệp trong phạm vi · 2 đạt · 3 không đạt ngưỡng · 1 có điều kiện không tính được")
    await user.click(within(panel).getByRole("checkbox", { name: "Hiện cả doanh nghiệp không đạt" }))
    const xyz = await within(panel).findByTestId("row-XYZ")
    expect(xyz.textContent).toContain("Chưa đủ lịch sử giá")
    expect(xyz.textContent).toContain("Thiếu dữ liệu")
    expect(xyz.textContent).not.toMatch(/\b0\b/)
    expect(within(await within(panel).findByTestId("row-HPG")).getByText("Không đạt", { selector: "td" })).toBeTruthy()
    // The exception is explained by condition and by cause.
    await user.click(within(panel).getByRole("button", { name: "Xem chi tiết" }))
    const dialog = await screen.findByRole("dialog", { name: "Dữ liệu của các điều kiện lọc" })
    const table = within(dialog).getByRole("table", { name: "Thống kê dữ liệu theo điều kiện kỹ thuật" })
    expect(within(table).getByTestId("quality-tech-rsi.level").textContent).toContain("Chưa đủ dữ liệu: 1")
    expect(within(table).getByTestId("quality-tech-rsi.level").textContent).toContain("Chưa đủ lịch sử giá: 1")
    expect(within(dialog).queryByRole("table", { name: "Thống kê dữ liệu theo chỉ tiêu" })).toBeNull()
  })

  it("does not show the fundamental figures of a company that failed Thị trường or Kỹ thuật as missing data: they were not evaluated", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addRsiAbove60(user)
    await addMetric(user, "ROE")
    await user.type(screen.getByLabelText("Ngưỡng"), "15")
    const panel = await runFilter(user)
    // The fundamental step only ran for the two that passed the technical one.
    expect(runBody().columns).toBeDefined()
    expect(within(panel).getByTestId("passed-count").textContent).toBe("2 doanh nghiệp")
    await user.click(within(panel).getByRole("checkbox", { name: "Hiện cả doanh nghiệp không đạt" }))
    const hpg = await within(panel).findByTestId("row-HPG")
    expect(hpg.textContent).toContain("Chưa xét")
    expect(within(hpg).getByText("Không đạt", { selector: "td" })).toBeTruthy()
    expect(hpg.textContent).not.toContain("Thiếu dữ liệu")
    expect(within(panel).getByTestId("row-FPT").textContent).not.toContain("Chưa xét")
  })

  it("says why the list is shorter than it could be when more companies survive than the fundamental cap, and when a basket has no members", async () => {
    const user = userEvent.setup()
    world.truncated = true
    world.basketsUnavailable = ["HNX30"]
    await renderTab()
    await addMetricAndThreshold(user)
    const panel = await runFilter(user)
    expect(within(panel).getByTestId("truncated-note").textContent).toBe("Sau lọc thị trường và kỹ thuật còn 812 doanh nghiệp, nhiều hơn giới hạn tính chỉ tiêu cơ bản của một lần lọc. Thu hẹp điều kiện để xét đủ.")
    expect(within(panel).getByTestId("baskets-note").textContent).toContain("HNX30")
  })

  it("explains a market without a closed session instead of an empty table", async () => {
    const user = userEvent.setup()
    world.marketDataUnavailable = true
    await renderTab()
    await user.click(runButton())
    expect((await screen.findByRole("alert")).textContent).toMatch(/Chưa có dữ liệu giá ngày đã chốt/)
  })
})

async function addMetricAndThreshold(user: User) {
  await addMetric(user, "ROE")
  await user.type(screen.getByLabelText("Ngưỡng"), "15")
}

describe("sorting", () => {
  const symbols = (panel: HTMLElement) => within(panel).getAllByTestId(/^row-/).map((row) => row.getAttribute("data-testid")!.slice(4))
  const head = (panel: HTMLElement, key: string) => within(panel).getByTestId(`head-${key}`)
  const sorts = () => world.calls.filter((call) => call.method === "GET" && call.path.startsWith("/strategy/screener/results/"))

  it("starts A to Z by Mã, with the arrow and aria-sort on that column only", async () => {
    const user = userEvent.setup()
    await renderTab()
    const panel = await runFilter(user)
    expect(symbols(panel)).toEqual(["CMG", "FPT", "HPG", "MBB", "NEG", "XYZ"])
    expect(head(panel, "symbol").getAttribute("aria-sort")).toBe("ascending")
    expect(head(panel, "symbol").textContent).toContain("▲")
    expect(head(panel, "price").getAttribute("aria-sort")).toBe("none")
    expect(head(panel, "price").textContent).not.toMatch(/[▲▼]/)
  })

  it("sorts the whole result on the server: a number column from the largest first, then reversed; a text column A to Z first", async () => {
    const user = userEvent.setup()
    await renderTab()
    const panel = await runFilter(user)
    await user.click(within(head(panel, "price")).getByRole("button"))
    await waitFor(() => expect(symbols(panel)).toEqual(["FPT", "CMG", "HPG", "MBB", "XYZ", "NEG"]))
    expect(sorts().at(-1)!.query).toContain("sort=price")
    expect(sorts().at(-1)!.query).toContain("order=desc")
    expect(head(panel, "price").getAttribute("aria-sort")).toBe("descending")
    expect(head(panel, "price").textContent).toContain("▼")
    expect(head(panel, "symbol").getAttribute("aria-sort")).toBe("none")

    await user.click(within(head(panel, "price")).getByRole("button"))
    await waitFor(() => expect(symbols(panel)).toEqual(["NEG", "XYZ", "MBB", "HPG", "CMG", "FPT"]))
    expect(head(panel, "price").getAttribute("aria-sort")).toBe("ascending")

    await user.click(within(head(panel, "exchange")).getByRole("button"))
    await waitFor(() => expect(symbols(panel)).toEqual(["XYZ", "CMG", "FPT", "HPG", "MBB", "NEG"]))
    expect(sorts().at(-1)!.query).toContain("sort=exchange")
    expect(sorts().at(-1)!.query).toContain("order=asc")
    // Ties keep Mã A to Z; nothing was run again.
    expect(posts("/strategy/screener/run")).toHaveLength(1)
  })

  it("sorts a technical column and a fundamental column by their own keys", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addRsiAbove60(user)
    await addMetric(user, "ROE")
    await user.type(screen.getByLabelText("Ngưỡng"), "15")
    const panel = await runFilter(user)
    await user.click(within(head(panel, "tech-rsi.level")).getByRole("button"))
    await waitFor(() => expect(symbols(panel)).toEqual(["CMG", "FPT"]))
    expect(sorts().at(-1)!.query).toContain(`sort=${encodeURIComponent("tech:rsi.level")}`)
    await user.click(within(head(panel, "roe")).getByRole("button"))
    await waitFor(() => expect(sorts().at(-1)!.query).toContain(`sort=${encodeURIComponent("metric:roe")}`))
    expect(head(panel, "roe").getAttribute("aria-sort")).toBe("descending")
  })

  it("goes back to page 1 when the order changes, and keeps the symbols that were ticked", async () => {
    const user = userEvent.setup()
    world.extraCompanies = 70
    await renderTab()
    const panel = await runFilter(user)
    await user.click(within(panel).getByRole("checkbox", { name: "Chọn FPT" }))
    await user.click(within(panel).getByRole("button", { name: "Trang sau" }))
    await waitFor(() => expect(within(panel).getByText(/Trang 2\/2/)).toBeTruthy())
    await user.click(within(head(panel, "market_cap")).getByRole("button"))
    await waitFor(() => expect(within(panel).getByText(/Trang 1\/2/)).toBeTruthy())
    expect(within(panel).getByTestId("selection-line").textContent).toMatch(/Đã chọn 1 mã/)
    await waitFor(() => expect((within(panel).getByRole("checkbox", { name: "Chọn FPT" }) as HTMLInputElement).getAttribute("aria-checked")).toBe("true"))
  })

  it("falls back to Mã A to Z when a new run replaces the result", async () => {
    const user = userEvent.setup()
    await renderTab()
    let panel = await runFilter(user)
    await user.click(within(head(panel, "price")).getByRole("button"))
    await waitFor(() => expect(head(panel, "price").getAttribute("aria-sort")).toBe("descending"))
    await user.click(runButton())
    await waitFor(() => expect(posts("/strategy/screener/run")).toHaveLength(2))
    panel = await results()
    await waitFor(() => expect(head(panel, "symbol").getAttribute("aria-sort")).toBe("ascending"))
  })
})

describe("technical detail", () => {
  async function openCell(user: User, name: RegExp) {
    await addRsiAbove60(user)
    await user.click(within(library()).getByRole("button", { name: "Thêm Khối lượng vào điều kiện kỹ thuật" }))
    const panel = await runFilter(user)
    await user.click(within(panel).getByRole("button", { name }))
    return screen.findByRole("dialog", { name: /^FPT · / })
  }

  it("shows the row in the Bot's words, the value at T and at T−1, the session and the source of the prices", async () => {
    const user = userEvent.setup()
    await renderTab()
    const dialog = await openCell(user, /FPT · RSI14: 63,7, đạt/)
    expect(dialog.getAttribute("aria-label") ?? dialog.textContent).toBeTruthy()
    expect(screen.getByRole("dialog", { name: "FPT · RSI" })).toBeTruthy()
    expect(within(dialog).getByTestId("technical-sentence").textContent).toBe("RSI 14 > 60")
    expect(within(dialog).getByTestId("technical-row-text").textContent).toBe("RSI 14 > 60")
    expect(within(dialog).getByTestId("technical-value").textContent).toBe("63,7")
    expect(within(dialog).getByTestId("technical-previous").textContent).toBe("55,2")
    expect(within(dialog).getByRole("status").textContent).toBe("Đạt tại phiên T")
    expect(dialog.textContent).toContain("07/10/2026")
    expect(dialog.textContent).toContain("DNSE (giá điều chỉnh)")
    expect(dialog.textContent).toContain("iqx-fund-2.0+tech-1.0")
  })

  it("shows both sessions at once for a row that compares T with T−N", async () => {
    const user = userEvent.setup()
    await renderTab()
    const dialog = await openCell(user, /FPT · RSI14 nay \/ 14 phiên trước: 63,7 \/ 55,2, đạt/)
    expect(within(dialog).getByText("Giá trị tại T và T−14")).toBeTruthy()
    expect(within(dialog).getByTestId("technical-value").textContent).toBe("63,7 / 55,2")
    expect(within(dialog).queryByTestId("technical-previous")).toBeNull()
    expect(within(dialog).getByTestId("technical-sentence").textContent).toBe("RSI 14 xu hướng lên")
  })

  it("writes Khối lượng's two rows with N, k and the sign", async () => {
    const user = userEvent.setup()
    await renderTab()
    const dialog = await openCell(user, /FPT · KL \/ 1,1×TB20 \(nghìn cp\): 230 \/ 189, đạt/)
    expect(within(dialog).getByTestId("technical-sentence").textContent).toBe("Khối lượng > 1,1 × khối lượng trung bình 20 phiên trước")
    expect(screen.getByRole("dialog", { name: "FPT · Khối lượng" })).toBeTruthy()
  })

  it("explains a NO_SIGNAL cell instead of a value, and says the company is not counted as a pass", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addRsiAbove60(user)
    const panel = await runFilter(user)
    await user.click(within(panel).getByRole("checkbox", { name: "Hiện cả doanh nghiệp không đạt" }))
    await user.click(await within(panel).findByRole("button", { name: /XYZ · RSI14: Chưa đủ lịch sử giá/ }))
    const dialog = await screen.findByRole("dialog", { name: "XYZ · RSI" })
    expect(within(dialog).getByRole("status").textContent).toContain("Chưa đủ lịch sử giá")
    expect(within(dialog).getByRole("status").textContent).toContain("Không được coi là đạt")
    expect(within(dialog).getByTestId("technical-value").textContent).toBe("—")
  })
})

describe("stale results", () => {
  it("flags a change of Thị trường or of a technical row, and clears the flag when the criteria come back", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "RSI")
    const panel = await runFilter(user)
    expect(within(panel).queryByText("Điều kiện đã đổi · cần lọc lại")).toBeNull()

    await user.click(chip("Sàn", "HNX"))
    expect(within(panel).getByText("Điều kiện đã đổi · cần lọc lại")).toBeTruthy()
    await user.click(chip("Sàn", "HNX"))
    expect(within(panel).queryByText("Điều kiện đã đổi · cần lọc lại")).toBeNull()

    await user.click(within(screen.getByTestId("tech-rsi")).getByRole("switch", { name: "Bật dòng 2 của RSI" }))
    expect(within(panel).getByText("Điều kiện đã đổi · cần lọc lại")).toBeTruthy()
    await user.click(within(screen.getByTestId("tech-rsi")).getByRole("switch", { name: "Bật dòng 2 của RSI" }))
    expect(within(panel).queryByText("Điều kiện đã đổi · cần lọc lại")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Bỏ RSI" }))
    expect(within(panel).getByText("Điều kiện đã đổi · cần lọc lại")).toBeTruthy()
  })

  it("does not treat a change in a switched-off row as a change of the criteria", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "RSI")
    await user.click(within(screen.getByTestId("tech-rsi")).getByRole("switch", { name: "Bật dòng 2 của RSI" }))
    const panel = await runFilter(user)
    const period = within(screen.getByTestId("tech-rsi")).getByLabelText("Chu kỳ RSI (dòng 2, RSI)")
    await user.clear(period)
    await user.type(period, "21")
    expect(within(panel).queryByText("Điều kiện đã đổi · cần lọc lại")).toBeNull()
  })
})

describe("filters saved before 4.0", () => {
  const market = (partial: Record<string, unknown>) => ({ ...emptyMarket(), ...partial })
  const sectorFilter = () => ({
    id: "f0000000-0000-4000-8000-000000000003", name: "Ngân hàng cũ", current_version: 1, version: 1, stored_schema_version: "3.0", legacy_review: null, sector_review: { sector: "Ngân hàng" }, definition_hash: "h", created_at: T0, updated_at: T0,
    definition: { schema_version: "4.0", name: "Ngân hàng cũ", logic: "AND", data_mode: "latest_disclosed", market: market({ exchanges: ["HOSE"], needs_review: "sector", legacy_sector: "Ngân hàng" }), technical: [], rules: [{ id: "x1", metric_id: "roe", period: "ttm", operator: ">", value: 0.15, api_unit: "ratio" }] },
  })
  const alerts = () => screen.getAllByRole("alert").map((alert) => alert.textContent ?? "")

  async function useSectorFilter(user: User) {
    world.filters = [sectorFilter()] as never
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Bộ lọc đã lưu" }))
    const dialog = await screen.findByRole("dialog", { name: "Bộ lọc đã lưu" })
    expect(await within(dialog).findByText("Cần chọn lại ngành")).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: /Dùng Ngân hàng cũ/ }))
    await screen.findByTestId("rule-roe")
  }

  it("labels the saved filter, says so when it is used, and keeps the sector out of the Ngành choices", async () => {
    const user = userEvent.setup()
    await useSectorFilter(user)
    expect(mocks.toast.warning).toHaveBeenCalledWith("Đã tải bộ lọc cũ. Ngành ICB không còn được hỗ trợ: hãy chọn lại Ngành trước khi chạy.")
    expect(alerts()).toContain("Bộ lọc cũ dùng ngành ICB “Ngân hàng”, không còn được hỗ trợ. Hệ thống không tự đổi: hãy chọn lại Ngành bên dưới.Lọc mọi ngành")
    for (const button of within(screen.getByRole("group", { name: "Ngành (nhóm báo cáo tài chính)" })).getAllByRole("button")) expect(button.getAttribute("aria-pressed")).toBe("false")
    // The exchange of the 3.0 scope was mapped.
    expect(chip("Sàn", "HOSE").getAttribute("aria-pressed")).toBe("true")
    expect(posts("/strategy/screener/run")).toHaveLength(0)
  })

  it("blocks the run, and the save, until the sector is chosen again", async () => {
    const user = userEvent.setup()
    await useSectorFilter(user)
    await user.click(runButton())
    await waitFor(() => expect(alerts()).toContain("Chọn lại ngành: ngành ICB “Ngân hàng” của bộ lọc cũ không còn được hỗ trợ."))
    expect(posts("/strategy/screener/run")).toHaveLength(0)

    await user.click(screen.getByRole("button", { name: "Lưu bộ lọc" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu bộ lọc" })
    expect((within(dialog).getByRole("button", { name: "Lưu bộ lọc" }) as HTMLButtonElement).disabled).toBe(true)
    expect(dialog.textContent).toContain("Chọn lại ngành: ngành ICB “Ngân hàng” của bộ lọc cũ không còn được hỗ trợ.")
    expect(posts("/strategy/filters")).toHaveLength(0)
  })

  it.each([
    ["choosing a group", async (user: User) => { await user.click(chip("Ngành (nhóm báo cáo tài chính)", "Ngân hàng")) }],
    ["clearing the group choices", async (user: User) => { await user.click(screen.getByRole("button", { name: "Bỏ chọn Ngành (nhóm báo cáo tài chính)" })) }],
    ["Lọc mọi ngành", async (user: User) => { await user.click(screen.getByRole("button", { name: "Lọc mọi ngành" })) }],
  ])("clears the flag by %s and then runs with the exchange of the old filter", async (_name, act) => {
    const user = userEvent.setup()
    await useSectorFilter(user)
    await act(user)
    expect(screen.queryByText(/Bộ lọc cũ dùng ngành ICB/)).toBeNull()
    await runFilter(user)
    expect(runBody().market.exchanges).toEqual(["HOSE"])
    expect((runBody().market as { needs_review?: string }).needs_review).toBeUndefined()
  })

  it("shows the server's refusal of a definition that still carries the flag", async () => {
    const user = userEvent.setup()
    world.override["POST /strategy/screener/run"] = () => {
      throw new FakeApiError("Chọn lại ngành: ngành ICB “Ngân hàng” của bộ lọc cũ không còn được hỗ trợ.", 422, { code: "SECTOR_REVIEW_REQUIRED" })
    }
    await renderTab()
    await user.click(runButton())
    await waitFor(() => expect(alerts().join(" ")).toContain("Chọn lại ngành"))
  })
})

describe("saving", () => {
  it("saves every technical row, a switched-off one too, and opens the filter again exactly as it was", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addIndicator(user, "RSI")
    await user.click(within(library()).getByRole("button", { name: "Thêm Khối lượng vào điều kiện kỹ thuật" }))
    await user.click(chip("Sàn", "HOSE"))
    await user.click(within(screen.getByTestId("tech-rsi")).getByRole("switch", { name: "Bật dòng 2 của RSI" }))
    await user.click(screen.getByRole("button", { name: "Lưu bộ lọc" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu bộ lọc" })
    await user.type(within(dialog).getByLabelText("Tên bộ lọc"), "Kỹ thuật thử")
    expect(dialog.textContent).toContain("HOSE · RSI (1 dòng) · Khối lượng")
    await user.click(within(dialog).getByRole("button", { name: "Lưu bộ lọc" }))
    await waitFor(() => expect(posts("/strategy/filters")).toHaveLength(1))
    const saved = (posts("/strategy/filters")[0]!.body as { definition: { market: Record<string, unknown>; technical: Array<{ indicator: string; rules?: Array<{ id: string; enabled: boolean }> }> } }).definition
    expect(saved.market.exchanges).toEqual(["HOSE"])
    expect(saved.technical.map((item) => item.indicator)).toEqual(["rsi", "volume"])
    expect(saved.technical[0]!.rules!.map((row) => [row.id, row.enabled])).toEqual([["rsi.level", true], ["rsi.trend", false]])

    // Open it again in a fresh editor.
    await user.click(screen.getByRole("button", { name: "Bỏ RSI" }))
    await user.click(screen.getByRole("button", { name: "Bỏ Khối lượng" }))
    await user.click(chip("Sàn", "HOSE"))
    await user.click(screen.getByRole("button", { name: "Bộ lọc đã lưu" }))
    const list = await screen.findByRole("dialog", { name: "Bộ lọc đã lưu" })
    expect(await within(list).findByText(/HOSE · RSI \(1 dòng\) · Khối lượng/)).toBeTruthy()
    await user.click(within(list).getByRole("button", { name: /Dùng Kỹ thuật thử/ }))
    const card = await screen.findByTestId("tech-rsi")
    expect(within(card).getAllByRole("switch").map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false"])
    expect(screen.getByTestId("tech-volume")).toBeTruthy()
    expect(chip("Sàn", "HOSE").getAttribute("aria-pressed")).toBe("true")
    expect(mocks.toast.warning).not.toHaveBeenCalled()
    expect(posts("/strategy/screener/run")).toHaveLength(0)
  })

  it("freezes the market and technical columns and the session in a saved result, and opens them as saved", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addRsiAbove60(user)
    const panel = await runFilter(user)
    await user.click(within(panel).getByRole("button", { name: "Lưu kết quả" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Lưu kết quả" })).getByRole("button", { name: "Lưu kết quả" }))
    await waitFor(() => expect(world.snapshots).toHaveLength(1))
    expect(world.snapshots[0]!.session_date).toBe("2026-10-07")
    await user.click(screen.getByRole("button", { name: "Kết quả đã lưu" }))
    const list = await screen.findByRole("dialog", { name: "Kết quả đã lưu" })
    await user.click(await within(list).findByRole("button", { name: /Xem/ }))
    const detail = await screen.findByRole("dialog", { name: /Kết quả lọc/ })
    const table = await within(detail).findByRole("table", { name: "Số liệu đã lưu" })
    expect(within(table).getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
      "Mã", "Sàn", "Ngành", "Giá(nghìn đ)", "+/− %", "Vốn hóa(tỷ đ)", "GTGD TB20(tỷ đ)", "RSI14phiên 07/10", "RSI14 nay / 14 phiên trướcphiên 07/10",
    ])
    const fpt = within(table).getAllByRole("row").find((row) => row.textContent?.startsWith("FPT"))!
    expect(fpt.textContent).toContain("124,50")
    expect(fpt.textContent).toContain("63,7 / 55,2")
    expect(detail.textContent).toContain("phiên 07/10/2026")
    expect(detail.textContent).toMatch(/HOSE|RSI \(2 dòng\)/)
  })

  it("keeps the criteria, the market and the session in a saved list", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(chip("Sàn", "HOSE"))
    await addRsiAbove60(user)
    const panel = await runFilter(user)
    await user.click(within(panel).getByRole("button", { name: "Lưu danh mục" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Lưu danh mục" })).getByRole("button", { name: "Lưu danh mục" }))
    await waitFor(() => expect(world.lists).toHaveLength(1))
    const provenance = world.lists[0]!.provenance as { criteria: { market: { exchanges: string[] }; technical: unknown[] }; session_date: string }
    expect(provenance.criteria.market.exchanges).toEqual(["HOSE"])
    expect(provenance.criteria.technical).toHaveLength(1)
    expect(provenance.session_date).toBe("2026-10-07")
    await user.click(screen.getByRole("button", { name: "Danh mục đã lưu" }))
    const lists = await screen.findByRole("dialog", { name: "Danh mục đã lưu" })
    await user.click(await within(lists).findByRole("button", { name: /^Xem/ }))
    const detail = await screen.findByRole("dialog", { name: /Kết quả lọc/ })
    expect(await within(detail).findByText(/HOSE · RSI \(2 dòng\)/)).toBeTruthy()
  })
})

describe("apply to Bot", () => {
  it("keeps the rule of the Bot for a result with technical conditions: confirm first, then the list of the stored result", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addRsiAbove60(user)
    const panel = await runFilter(user)
    await user.click(within(panel).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await waitFor(() => expect(within(dialog).getByTestId("apply-count").textContent).toBe("2 / 2 mã"))
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(1))
    expect(posts("/strategy/lists/from-result")[0]!.body).toMatchObject({ selection: { mode: "all" }, visibility: "internal" })
    expect((posts("/bot/universe/apply-list")[0]!.body as { symbols: string[] }).symbols).toEqual(["CMG", "FPT"])
  })

  it("collects every page of the companies that passed (the server answers at most 500 at a time)", async () => {
    const user = userEvent.setup()
    world.extraCompanies = 600
    await renderTab()
    const panel = await runFilter(user)
    await user.click(within(panel).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await waitFor(() => expect(within(dialog).getByTestId("apply-count").textContent).toBe("606 / 606 mã"))
    const pages = world.calls.filter((call) => call.method === "GET" && call.path.startsWith("/strategy/screener/results/") && call.query?.includes("limit=500"))
    expect(pages).toHaveLength(2)
  })
})
