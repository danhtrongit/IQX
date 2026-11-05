import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"
import type { Interval, TimedBar } from "@/lib/iqline/types"

import { getNewsMarkGroup } from "./datafeed"
import { createIQLineDatafeed, iqlinePriceFormatter, spanDaysFor } from "./iqline-datafeed"

vi.mock("@/lib/api", () => ({ api: vi.fn() }))

const DAY = 86_400
const MIN_TIMESTAMP = 946_684_800
/** 2026-09-24 15:00 giờ Việt Nam (thứ năm). */
const TO = Date.UTC(2026, 8, 24, 8) / 1000

beforeEach(() => {
  // Không trả về mock: vitest coi giá trị hàm trả về của hook là hàm dọn dẹp và sẽ gọi nó sau mỗi test.
  vi.mocked(api).mockReset()
})
afterEach(() => vi.useRealTimers())

const quote = { open: 1800, high: 1810, low: 1790, close: 1805, volume: 1000 }
const bar = (time: number | string, extra: Record<string, unknown> = {}) => ({ ...quote, time, ...extra })
const payload = (items: unknown[]) => ({ data: items })

/** Tham số `start`, `end`, `interval` của lần gọi `api` thứ `index`. */
function query(index = 0): { start: string; end: string; interval: string; path: string } {
  const url = String(vi.mocked(api).mock.calls[index]?.[0])
  const [path, search] = url.split("?")
  const params = new URLSearchParams(search)
  return { path, start: params.get("start") ?? "", end: params.get("end") ?? "", interval: params.get("interval") ?? "" }
}

function daysBetween(startKey: string, endKey: string): number {
  return Math.round((Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / (DAY * 1000))
}

function request(overrides: Partial<{ symbol: string; interval: Interval; to: number; countBack: number; signal: AbortSignal }> = {}) {
  return { symbol: "VNM", interval: "D" as Interval, to: TO, countBack: 100, signal: new AbortController().signal, ...overrides }
}

describe("getBars: đổi khung và khoảng ngày", () => {
  it.each([
    ["1", "1m"],
    ["5", "5m"],
    ["15", "15m"],
    ["30", "30m"],
    ["60", "1H"],
    ["D", "1D"],
    ["W", "1W"],
    ["M", "1M"],
  ] as const)("khung %s gọi API với interval %s", async (interval, expected) => {
    vi.mocked(api).mockResolvedValue(payload([]))
    await createIQLineDatafeed().getBars(request({ interval }))
    expect(query().interval).toBe(expected)
    expect(query().path).toBe("/market-data/quotes/VNM/ohlcv")
  })

  it("chuẩn hoá mã thành chữ hoa trong đường dẫn", async () => {
    vi.mocked(api).mockResolvedValue(payload([]))
    await createIQLineDatafeed().getBars(request({ symbol: "vnm" }))
    expect(query().path).toBe("/market-data/quotes/VNM/ohlcv")
  })

  it("khoảng ngày theo khung: 255, 51, 17, 9, 5 nến mỗi phiên và hệ số 7/5", () => {
    expect(spanDaysFor("1", 255)).toBe(6)
    expect(spanDaysFor("5", 51)).toBe(6)
    expect(spanDaysFor("15", 17)).toBe(6)
    expect(spanDaysFor("30", 9)).toBe(6)
    expect(spanDaysFor("60", 5)).toBe(6)
    expect(spanDaysFor("1", 256)).toBe(7)
    expect(spanDaysFor("5", 510)).toBe(Math.ceil((10 * 7) / 5) + 4)
    expect(spanDaysFor("D", 100)).toBe(150)
    expect(spanDaysFor("W", 10)).toBe(84)
    expect(spanDaysFor("M", 10)).toBe(341)
  })

  it("xin khoảng ngày ngắn theo khung, không xin cả lịch sử", async () => {
    vi.mocked(api).mockResolvedValue(payload([]))
    const feed = createIQLineDatafeed()
    // symbol khác nhau để các lần rỗng liền nhau không cộng dồn.
    await feed.getBars(request({ symbol: "AAA", interval: "1", countBack: 255 }))
    await feed.getBars(request({ symbol: "BBB", interval: "D", countBack: 100 }))
    await feed.getBars(request({ symbol: "CCC", interval: "W", countBack: 100 }))
    await feed.getBars(request({ symbol: "DDD", interval: "M", countBack: 100 }))

    expect(query(0)).toMatchObject({ start: "2026-09-18", end: "2026-09-24" })
    expect(daysBetween(query(1).start, query(1).end)).toBe(150)
    expect(daysBetween(query(2).start, query(2).end)).toBe(714)
    expect(daysBetween(query(3).start, query(3).end)).toBe(3131)
  })

  it("ngày end là ngày Việt Nam của nến cuối được phép (to loại trừ)", async () => {
    vi.mocked(api).mockResolvedValue(payload([]))
    // 00:00 giờ Việt Nam ngày 24/9: nến thuộc ngày 24 đã bị loại trừ nên chỉ xin tới ngày 23.
    const midnight = Date.parse("2026-09-24T00:00:00+07:00") / 1000
    await createIQLineDatafeed().getBars(request({ to: midnight, interval: "1", countBack: 255 }))
    expect(query().end).toBe("2026-09-23")
  })

  it("mốc to không hữu hạn hoặc ở rất xa tương lai không làm hỏng yêu cầu", async () => {
    vi.mocked(api).mockResolvedValue(payload([bar(1790208000)]))
    const feed = createIQLineDatafeed()
    const far = await feed.getBars(request({ symbol: "AAA", to: Number.POSITIVE_INFINITY, countBack: 50 }))
    const nan = await feed.getBars(request({ symbol: "BBB", to: Number.NaN, countBack: 50 }))
    expect(far.bars).toHaveLength(1)
    expect(nan.bars).toHaveLength(1)
    expect(query(0).end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("getBars: lọc và chuẩn hoá nến", () => {
  it("chỉ giữ nến có time < to", async () => {
    vi.mocked(api).mockResolvedValue(payload([bar(TO - 120), bar(TO - 60), bar(TO), bar(TO + 60)]))
    const { bars } = await createIQLineDatafeed().getBars(request({ interval: "1", countBack: 10 }))
    expect(bars.map((b) => b.time)).toEqual([TO - 120, TO - 60])
  })

  it("bỏ nến lỗi, sửa high và low, volume lỗi về 0, sắp xếp và loại trùng thời gian", async () => {
    vi.mocked(api).mockResolvedValue(
      payload([
        bar(TO - 300, { open: 10, high: 9, low: 11, close: 10.5, volume: "abc" }),
        bar(TO - 600),
        bar(TO - 400, { open: 0 }),
        bar(TO - 410, { close: -1 }),
        bar(TO - 420, { high: Number.NaN }),
        bar(TO - 430, { low: null }),
        bar("khong phai thoi gian"),
        bar(TO - 500, { close: 1801 }),
        bar(TO - 500, { close: 1802 }),
        null,
        "rác",
      ]),
    )
    const { bars } = await createIQLineDatafeed().getBars(request({ interval: "1", countBack: 10 }))
    expect(bars.map((b) => b.time)).toEqual([TO - 600, TO - 500, TO - 300])
    expect(bars[1].close).toBe(1802)
    expect(bars[2]).toEqual({ time: TO - 300, open: 10, high: 11, low: 9, close: 10.5, volume: 0 })
  })

  it("thời gian ra Unix giây từ giây, mili giây, chuỗi số và ISO", async () => {
    vi.mocked(api).mockResolvedValue(
      payload([bar("1790208000"), bar(1790121600000), bar("1789948800000"), bar("2026-09-22"), bar("invalid")]),
    )
    const { bars } = await createIQLineDatafeed().getBars(request({ to: 1790300000 }))
    expect(bars.map((b) => b.time)).toEqual([1789948800, 1790035200, 1790121600, 1790208000])
    expect(bars.every((b) => Number.isInteger(b.time) && b.time < 1e11)).toBe(true)
  })

  it("nhận cả payload là mảng thuần và trường date hoặc timestamp", async () => {
    vi.mocked(api).mockResolvedValue([{ ...quote, date: "2026-09-22" }, { ...quote, timestamp: 1790121600 }])
    const { bars } = await createIQLineDatafeed().getBars(request({ to: 1790300000 }))
    expect(bars.map((b) => b.time)).toEqual([1790035200, 1790121600])
  })

  it("payload sai dạng thì ném lỗi, không nuốt", async () => {
    vi.mocked(api).mockResolvedValue({ data: "không phải mảng" })
    await expect(createIQLineDatafeed().getBars(request())).rejects.toThrow("Dữ liệu OHLCV không hợp lệ.")
  })

  it("lỗi mạng khác được ném lại nguyên vẹn", async () => {
    const failure = new Error("mất mạng")
    vi.mocked(api).mockRejectedValue(failure)
    await expect(createIQLineDatafeed().getBars(request())).rejects.toBe(failure)
  })
})

describe("getBars: noMoreHistory", () => {
  it("khung ngày chạm MIN_TIMESTAMP thì hết lịch sử, và không xin trước năm 2000", async () => {
    vi.mocked(api).mockResolvedValue(payload([bar(MIN_TIMESTAMP + 5 * DAY), bar(MIN_TIMESTAMP + 6 * DAY)]))
    const result = await createIQLineDatafeed().getBars(request({ to: MIN_TIMESTAMP + 30 * DAY, countBack: 500 }))
    expect(result.noMoreHistory).toBe(true)
    expect(result.bars).toHaveLength(2)
    expect(query().start).toBe("2000-01-01")
  })

  it("to không vượt MIN_TIMESTAMP thì trả rỗng và hết lịch sử mà không gọi API", async () => {
    const result = await createIQLineDatafeed().getBars(request({ to: 0 }))
    expect(result).toEqual({ bars: [], noMoreHistory: true })
    expect(api).not.toHaveBeenCalled()
  })

  it("khoảng xin còn xa MIN_TIMESTAMP thì chưa hết", async () => {
    vi.mocked(api).mockResolvedValue(payload(Array.from({ length: 100 }, (_, i) => bar(TO - (i + 1) * DAY))))
    const result = await createIQLineDatafeed().getBars(request({ countBack: 100 }))
    expect(result.noMoreHistory).toBe(false)
  })

  it("khung trong ngày chỉ về tới 5 năm trước", async () => {
    const now = Math.floor(Date.now() / 1000)
    const fiveYears = 5 * 365 * DAY
    vi.mocked(api).mockResolvedValue(payload([bar(now - fiveYears + DAY)]))
    const feed = createIQLineDatafeed()

    const touching = await feed.getBars(request({ interval: "15", to: now - fiveYears + 2 * DAY, countBack: 500 }))
    expect(touching.noMoreHistory).toBe(true)
    expect(api).toHaveBeenCalledTimes(1)

    const beyond = await feed.getBars(request({ interval: "15", to: now - fiveYears - DAY, countBack: 500 }))
    expect(beyond).toEqual({ bars: [], noMoreHistory: true })
    expect(api).toHaveBeenCalledTimes(1)

    // Khung ngày không bị giới hạn 5 năm.
    vi.mocked(api).mockResolvedValue(payload(Array.from({ length: 100 }, (_, i) => bar(now - fiveYears - (i + 1) * DAY))))
    const daily = await feed.getBars(request({ interval: "D", to: now - fiveYears, countBack: 100 }))
    expect(daily.noMoreHistory).toBe(false)
  })

  it("khung trong ngày ở gần hiện tại thì chưa hết", async () => {
    vi.mocked(api).mockResolvedValue(payload([bar(TO - 60)]))
    const result = await createIQLineDatafeed().getBars(request({ interval: "1", countBack: 255 }))
    expect(result.noMoreHistory).toBe(false)
  })

  it("ba lần liền không có nến thì hết, khoảng xin mở rộng dần, có nến thì đếm lại từ đầu", async () => {
    vi.mocked(api).mockResolvedValue(payload([]))
    const feed = createIQLineDatafeed()
    const q = request({ interval: "1", countBack: 255 })

    expect((await feed.getBars(q)).noMoreHistory).toBe(false)
    expect((await feed.getBars(q)).noMoreHistory).toBe(false)
    expect((await feed.getBars(q)).noMoreHistory).toBe(true)
    // Khoảng ngày gấp đôi sau mỗi lần rỗng: 6, 12, 24 ngày.
    expect([0, 1, 2].map((i) => daysBetween(query(i).start, query(i).end))).toEqual([6, 12, 24])

    // Mỗi cặp mã và khung có bộ đếm riêng.
    expect((await feed.getBars({ ...q, symbol: "FPT" })).noMoreHistory).toBe(false)
    expect((await feed.getBars({ ...q, interval: "5" })).noMoreHistory).toBe(false)

    // Có nến thì reset: hai lần rỗng nữa vẫn chưa hết.
    const other = request({ symbol: "HPG", interval: "1", countBack: 255 })
    await feed.getBars(other)
    await feed.getBars(other)
    vi.mocked(api).mockResolvedValue(payload([bar(TO - 60)]))
    expect((await feed.getBars(other)).noMoreHistory).toBe(false)
    vi.mocked(api).mockResolvedValue(payload([]))
    expect((await feed.getBars(other)).noMoreHistory).toBe(false)
    expect((await feed.getBars(other)).noMoreHistory).toBe(false)
    expect((await feed.getBars(other)).noMoreHistory).toBe(true)
  })

  it("mỗi instance datafeed đếm riêng", async () => {
    vi.mocked(api).mockResolvedValue(payload([]))
    const first = createIQLineDatafeed()
    const second = createIQLineDatafeed()
    const q = request({ interval: "1", countBack: 255 })
    await first.getBars(q)
    await first.getBars(q)
    expect((await second.getBars(q)).noMoreHistory).toBe(false)
  })

  it("ít nến hơn mong muốn và nến cũ nhất còn cách đầu khoảng xin rất xa thì phía trước hết dữ liệu", async () => {
    // Khung ngày, countBack 300 (xin 430 ngày); mã mới niêm yết chỉ có 20 nến ở cuối khoảng.
    vi.mocked(api).mockResolvedValue(payload(Array.from({ length: 20 }, (_, i) => bar(TO - (20 - i) * DAY))))
    const result = await createIQLineDatafeed().getBars(request({ countBack: 300 }))
    expect(result.bars).toHaveLength(20)
    expect(result.noMoreHistory).toBe(true)
  })

  it("ít nến hơn mong muốn nhưng nến cũ nhất sát đầu khoảng xin thì chưa hết (có thể do ngày lễ)", async () => {
    vi.mocked(api).mockResolvedValue(payload(Array.from({ length: 280 }, (_, i) => bar(TO - 425 * DAY + i * DAY))))
    const result = await createIQLineDatafeed().getBars(request({ countBack: 300 }))
    expect(result.noMoreHistory).toBe(false)
  })
})

describe("getBars: huỷ", () => {
  const isAbort = { name: "AbortError" }

  it("signal đã huỷ trước khi gọi thì ném AbortError và không gọi API", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(createIQLineDatafeed().getBars(request({ signal: controller.signal }))).rejects.toMatchObject(isAbort)
    expect(api).not.toHaveBeenCalled()
  })

  it("truyền signal xuống api()", async () => {
    vi.mocked(api).mockResolvedValue(payload([]))
    const { signal } = new AbortController()
    await createIQLineDatafeed().getBars(request({ signal }))
    expect(vi.mocked(api).mock.calls[0]?.[1]).toEqual({ signal })
  })

  it("huỷ khi api trả muộn thì kết quả bị bỏ và ném AbortError", async () => {
    let resolve: (value: unknown) => void = () => undefined
    vi.mocked(api).mockImplementation(() => new Promise((done) => (resolve = done)))
    const controller = new AbortController()
    const pending = createIQLineDatafeed().getBars(request({ signal: controller.signal }))
    controller.abort()
    resolve(payload([bar(TO - DAY)]))
    await expect(pending).rejects.toMatchObject(isAbort)
  })

  it("huỷ làm fetch ném lỗi thì vẫn là AbortError, và không tính vào lần rỗng liền nhau", async () => {
    const controller = new AbortController()
    vi.mocked(api).mockImplementation(async () => {
      controller.abort()
      throw new Error("The operation was aborted")
    })
    const feed = createIQLineDatafeed()
    await expect(feed.getBars(request({ signal: controller.signal, interval: "1", countBack: 255 }))).rejects.toMatchObject(isAbort)

    vi.mocked(api).mockReset()
    vi.mocked(api).mockResolvedValue(payload([]))
    const q = request({ interval: "1", countBack: 255 })
    expect((await feed.getBars(q)).noMoreHistory).toBe(false)
    expect((await feed.getBars(q)).noMoreHistory).toBe(false)
  })
})

describe("subscribeBars", () => {
  const NOW = Date.parse("2026-09-24T03:00:00Z")
  const latest = (time: number, close = 1805): TimedBar => ({ time, open: 1800, high: Math.max(1810, close), low: 1790, close, volume: 1000 })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it("thăm dò sau 15 giây và gọi onBar với nến mới nhất (Unix giây)", async () => {
    vi.mocked(api).mockResolvedValue(payload([bar(1790200000), bar(1790208000, { close: 1812 })]))
    const onBar = vi.fn()
    const stop = createIQLineDatafeed().subscribeBars("VNM", "1", onBar)

    await vi.advanceTimersByTimeAsync(14_999)
    expect(onBar).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onBar).toHaveBeenCalledTimes(1)
    expect(onBar).toHaveBeenCalledWith(latest(1790208000, 1812))
    // Lần đầu xin từ 24 giờ trước tới hiện tại, theo ngày Việt Nam.
    expect(query()).toMatchObject({ interval: "1m", start: "2026-09-23", end: "2026-09-24" })
    stop()
  })

  it("lần sau xin từ nến cuối trừ 60 giây, gọi lại khi nến cập nhật và bỏ nến cũ hơn", async () => {
    const onBar = vi.fn()
    const stop = createIQLineDatafeed().subscribeBars("VNM", "1", onBar)

    vi.mocked(api).mockResolvedValue(payload([bar(1790208000)]))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(onBar).toHaveBeenCalledTimes(1)

    // Nến cũ hơn nến đã gửi: không ép gửi.
    vi.mocked(api).mockResolvedValue(payload([bar(1790100000)]))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(onBar).toHaveBeenCalledTimes(1)

    // Cùng thời gian (nến cuối được cập nhật) và nến mới hơn thì gọi.
    vi.mocked(api).mockResolvedValue(payload([bar(1790208000, { close: 1820 })]))
    await vi.advanceTimersByTimeAsync(15_000)
    vi.mocked(api).mockResolvedValue(payload([bar(1790208060)]))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(onBar.mock.calls.map(([b]) => (b as TimedBar).time)).toEqual([1790208000, 1790208000, 1790208060])
    stop()
  })

  it("lỗi khi thăm dò bị nuốt và lần sau thử lại", async () => {
    const onBar = vi.fn()
    const stop = createIQLineDatafeed().subscribeBars("VNM", "D", onBar)
    vi.mocked(api).mockRejectedValueOnce(new Error("mất mạng"))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(onBar).not.toHaveBeenCalled()

    vi.mocked(api).mockResolvedValue(payload([bar(1790208000)]))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(onBar).toHaveBeenCalledTimes(1)
    stop()
  })

  it("không gọi sau khi huỷ, và dừng bộ hẹn giờ khi hết người nghe", async () => {
    vi.mocked(api).mockResolvedValue(payload([bar(1790208000)]))
    const first = vi.fn()
    const second = vi.fn()
    const feed = createIQLineDatafeed()
    const stopFirst = feed.subscribeBars("VNM", "1", first)
    const stopSecond = feed.subscribeBars("FPT", "5", second)
    // Hai người nghe dùng chung một bộ hẹn giờ.
    expect(vi.getTimerCount()).toBe(1)

    stopFirst()
    stopFirst()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)

    stopSecond()
    expect(vi.getTimerCount()).toBe(0)
    const calls = vi.mocked(api).mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(second).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api).mock.calls.length).toBe(calls)
  })

  it("huỷ trong lúc đang chờ API thì không gọi onBar", async () => {
    let resolve: (value: unknown) => void = () => undefined
    vi.mocked(api).mockImplementation(() => new Promise((done) => (resolve = done)))
    const onBar = vi.fn()
    const stop = createIQLineDatafeed().subscribeBars("VNM", "1", onBar)
    await vi.advanceTimersByTimeAsync(15_000)
    stop()
    resolve(payload([bar(1790208000)]))
    await vi.advanceTimersByTimeAsync(0)
    expect(onBar).not.toHaveBeenCalled()
  })
})

describe("getMarks", () => {
  const iso = (value: string, sentiment: string | null, id: string) => ({ id, title: `Tin ${id}`, slug: id, sentiment, updated_at: value })
  const key = (dateKey: string) => Date.parse(`${dateKey}T00:00:00+07:00`) / 1000

  it("đúng id, time, label, count và token theo sắc thái chiếm ưu thế, đã sắp xếp theo thời gian", async () => {
    vi.mocked(api).mockResolvedValue({
      data: [
        iso("2026-09-23T03:00:00Z", "negative", "n1"),
        iso("2026-09-22T03:00:00Z", "positive", "p1"),
        iso("2026-09-22T05:00:00Z", "positive", "p2"),
        iso("2026-09-22T06:00:00Z", "negative", "p3"),
        iso("2026-09-23T04:00:00Z", "Negative", "n2"),
        iso("2026-09-24T03:00:00Z", null, "z1"),
        iso("2026-09-25T03:00:00Z", "positive", "tie-a"),
        iso("2026-09-25T04:00:00Z", "negative", "tie-b"),
      ],
    })
    const marks = await createIQLineDatafeed().getMarks?.({ symbol: "VNM", from: 1_000_001, to: 1_790_300_001, signal: new AbortController().signal })

    expect(marks).toEqual([
      { id: "2026-09-22", time: key("2026-09-22"), label: "3", count: 3, token: "price-up" },
      { id: "2026-09-23", time: key("2026-09-23"), label: "2", count: 2, token: "price-down" },
      { id: "2026-09-24", time: key("2026-09-24"), label: "1", count: 1, token: "price-ref" },
      { id: "2026-09-25", time: key("2026-09-25"), label: "2", count: 2, token: "price-ref" },
    ])
    expect(api).toHaveBeenCalledWith(expect.stringContaining("/market-data/news/ai?ticker=VNM"), expect.anything())
  })

  it("dùng chung bộ nhớ đệm với getNewsMarkGroup và không gọi API lần hai cho cùng khoảng", async () => {
    vi.mocked(api).mockResolvedValue({
      data: [iso("2026-08-10T03:00:00Z", "positive", "a"), iso("2026-08-10T04:00:00Z", "neutral", "b")],
    })
    const feed = createIQLineDatafeed()
    const q = { symbol: "FPT", from: 2_000_002, to: 1_790_300_002, signal: new AbortController().signal }
    expect(getNewsMarkGroup("FPT", "2026-08-10")).toBeNull()

    await feed.getMarks?.(q)
    const group = getNewsMarkGroup("FPT", "2026-08-10")
    expect(group?.items.map((item) => item.id)).toEqual(["a", "b"])
    expect(group?.dominantSentiment).toBe("positive")
    expect(group?.timestamp).toBe(key("2026-08-10"))

    await feed.getMarks?.(q)
    expect(api).toHaveBeenCalledTimes(1)
  })

  it("lỗi mạng thì trả mảng rỗng như hành vi cũ của fetchNewsMarks", async () => {
    vi.mocked(api).mockRejectedValue(new Error("mất mạng"))
    const marks = await createIQLineDatafeed().getMarks?.({ symbol: "VNM", from: 3_000_003, to: 1_790_300_003, signal: new AbortController().signal })
    expect(marks).toEqual([])
  })

  it("huỷ thì ném AbortError, không trả mảng rỗng", async () => {
    const feed = createIQLineDatafeed()
    const early = new AbortController()
    early.abort()
    await expect(feed.getMarks?.({ symbol: "VNM", from: 4_000_004, to: 1_790_300_004, signal: early.signal })).rejects.toMatchObject({ name: "AbortError" })
    expect(api).not.toHaveBeenCalled()

    let resolve: (value: unknown) => void = () => undefined
    vi.mocked(api).mockImplementation(() => new Promise((done) => (resolve = done)))
    const late = new AbortController()
    const pending = feed.getMarks?.({ symbol: "VNM", from: 5_000_005, to: 1_790_300_005, signal: late.signal })
    late.abort()
    resolve({ data: [iso("2026-09-22T03:00:00Z", "positive", "x")] })
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe("iqlinePriceFormatter", () => {
  it("chỉ số: 2 chữ số thập phân kiểu Việt Nam", () => {
    const format = iqlinePriceFormatter("VNINDEX")
    expect(format(1234.567)).toBe("1.234,57")
    expect(format(1000)).toBe("1.000,00")
    expect(iqlinePriceFormatter("vn30")(1500.5)).toBe("1.500,50")
    expect(iqlinePriceFormatter("HNX")(250.125)).toBe("250,13")
  })

  it("cổ phiếu: 3 chữ số thập phân, giá tính theo nghìn đồng", () => {
    const format = iqlinePriceFormatter("VNM")
    expect(format(58.123)).toBe("58,123")
    expect(format(58)).toBe("58,000")
    expect(format(1234.5)).toBe("1.234,500")
  })
})
