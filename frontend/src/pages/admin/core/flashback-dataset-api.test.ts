import { describe, expect, it } from "vitest"

import {
  adaptDatasetStatus,
  adaptDatasetVersion,
  datasetSignature,
  latestDatasetRun,
  readDatasetLog,
  toWireConfigPatch,
} from "./flashback-dataset-api"
import {
  DATASET_NUMERIC_FIELDS,
  buildDatasetPatch,
  datasetFieldError,
  describePriceSources,
  formatDatasetNumeric,
  initialDrafts,
} from "./flashback-dataset-fields"
import {
  describeDatasetSchedule,
  formatDatasetDate,
  formatDatasetDuration,
} from "./flashback-dataset-format"
import {
  DATASET_CONFIG_WIRE,
  DATASET_LOG_WIRE,
  datasetBuildingWire,
  datasetStatusWire,
  datasetVersionWire,
} from "./flashback-dataset-test-support"

const status = (over: Parameters<typeof datasetStatusWire>[0] = {}) =>
  adaptDatasetStatus(datasetStatusWire(over) as Parameters<typeof adaptDatasetStatus>[0])

describe("readDatasetLog", () => {
  it("đọc đủ nhật ký một lần tạo kho", () => {
    const log = readDatasetLog(DATASET_LOG_WIRE)
    expect(log.outcome).toBe("active")
    expect(log.basket).toEqual({ index: "VN100", count: 100, source: "VCI:VN100" })
    expect(log.calendar).toEqual({ sessions: 3_400, first: "2012-03-20", last: "2026-10-30", source: "DNSE:VNINDEX" })
    expect(log.symbolsOk).toBe(97)
    expect(log.symbolsExcluded).toBe(3)
    expect(log.excluded.map((item) => item.symbol)).toEqual(["AAA", "BBB", "CCC"])
    expect(log.valueBasis).toEqual({ matched: 97, mixed: 0, approx: 0 })
    expect(log.sources).toEqual([{ source: "DNSE:x1000:adjusted", count: 97 }])
    expect(log.cuts).toEqual({ viewBars: 60, playBars: 30, symbolsWithCut: 90, totalCuts: 120_000 })
    expect(log.raw).toBe(DATASET_LOG_WIRE)
  })

  it("nhật ký rỗng hoặc sai kiểu: khoá nào hỏng thì bỏ, không ném lỗi", () => {
    const empty = readDatasetLog({})
    expect(empty).toMatchObject({
      outcome: null,
      error: null,
      basket: null,
      calendar: null,
      symbolsOk: null,
      excluded: [],
      valueBasis: null,
      sources: [],
      cuts: null,
    })

    const broken = readDatasetLog({
      outcome: "weird",
      error: 12,
      basket: "VN100",
      calendar: { sessions: "3400" },
      symbols: { ok: "97" },
      excluded: [null, 5, { reason: "thiếu mã" }, { symbol: "ZZZ" }, { symbol: "YYY", reason: "lý do" }],
      value_basis: [],
      sources: { "DNSE:x1000:adjusted": "97", "VCI:dong:adjusted": 3 },
      cuts: { total_cuts: "x" },
    })
    expect(broken.outcome).toBeNull()
    expect(broken.error).toBeNull()
    expect(broken.basket).toBeNull()
    expect(broken.calendar).toBeNull()
    expect(broken.symbolsOk).toBeNull()
    expect(broken.excluded).toEqual([
      { symbol: "ZZZ", reason: "" },
      { symbol: "YYY", reason: "lý do" },
    ])
    expect(broken.valueBasis).toBeNull()
    expect(broken.sources).toEqual([{ source: "VCI:dong:adjusted", count: 3 }])
    expect(broken.cuts).toBeNull()
  })

  it("lần tạo thất bại giữ lý do lỗi", () => {
    expect(readDatasetLog({ outcome: "failed", error: "Kho mới chỉ có 60 mã hợp lệ" })).toMatchObject({
      outcome: "failed",
      error: "Kho mới chỉ có 60 mã hợp lệ",
    })
  })
})

describe("adapt", () => {
  it("phiên bản: đổi tên khoá và đọc nhật ký", () => {
    const version = adaptDatasetVersion(datasetVersionWire({ requested_by: "admin-1", trigger: "manual" }))
    expect(version).toMatchObject({
      version: 3,
      status: "active",
      symbolsCount: 97,
      excludedCount: 3,
      firstDate: "2012-03-20",
      lastDate: "2026-10-30",
      trigger: "manual",
      requestedBy: "admin-1",
      durationMs: 70_000,
    })
    expect(version.log.excluded).toHaveLength(3)
  })

  it("tổng quan: tiến độ lần dựng, tham số và mặc định", () => {
    const adapted = status({ building: datasetBuildingWire() })
    expect(adapted.building).toMatchObject({
      version: 4,
      stale: false,
      trigger: "manual",
      progress: { phase: "symbols", total: 100, done: 40, ok: 38, excluded: 2 },
    })
    expect(adapted.config.minSymbols).toBe(80)
    expect(adapted.configDefaults.warmupSessions).toBe(252)
  })

  it("dấu hiệu kho đổi khi có bản mới, bản thất bại hoặc lần dựng", () => {
    expect(datasetSignature(undefined)).toBeNull()
    expect(datasetSignature(status())).toBe("3.0.0")
    expect(datasetSignature(status({ building: datasetBuildingWire({ version: 4 }) }))).toBe("3.0.4")
    expect(datasetSignature(status({ active: null, latest_failed: datasetVersionWire({ version: 1, status: "failed" }) }))).toBe(
      "0.1.0",
    )
  })

  it("lần làm mới gần nhất là bản có số phiên bản lớn hơn", () => {
    expect(latestDatasetRun(status())?.version).toBe(3)
    expect(latestDatasetRun(status({ latest_failed: datasetVersionWire({ version: 4, status: "failed" }) }))?.version).toBe(4)
    expect(latestDatasetRun(status({ latest_failed: datasetVersionWire({ version: 2, status: "failed" }) }))?.version).toBe(3)
    expect(latestDatasetRun(status({ active: null }))).toBeNull()
  })
})

describe("tham số kho: đổi đơn vị", () => {
  const config = status().config
  const field = (key: string) => DATASET_NUMERIC_FIELDS.find((item) => item.key === key)!

  it("tỷ lệ hiện dưới dạng phần trăm, tiền hiện dưới dạng tỷ đồng", () => {
    expect(formatDatasetNumeric(field("maxZeroVolumeRatio"), 0.025)).toContain("2,5")
    expect(formatDatasetNumeric(field("minLiquidityVnd"), 3_000_000_000)).toContain("3 tỷ đồng/phiên")
    expect(formatDatasetNumeric(field("minDailyVolatility"), 0.01)).toBe("1 %")
    expect(initialDrafts(config)).toMatchObject({
      maxZeroVolumeRatio: "2.5",
      minLiquidityVnd: "3",
      minDailyVolatility: "1",
      minSymbols: "80",
      warmupSessions: "252",
    })
  })

  it("không đổi gì thì không có khoá nào để gửi", () => {
    expect(buildDatasetPatch(config, initialDrafts(config), "DNSE,VCI")).toEqual({})
  })

  it("chỉ gửi khoá đã đổi, đã đổi ngược về đơn vị của máy chủ không dính sai số", () => {
    const drafts = {
      ...initialDrafts(config),
      maxZeroVolumeRatio: "1.1",
      minLiquidityVnd: "2.5",
      minDailyVolatility: "0.7",
      minSymbols: "85",
    }
    expect(buildDatasetPatch(config, drafts, "DNSE,VCI")).toEqual({
      maxZeroVolumeRatio: 0.011,
      minLiquidityVnd: 2_500_000_000,
      minDailyVolatility: 0.007,
      minSymbols: 85,
    })
    expect(toWireConfigPatch({ maxZeroVolumeRatio: 0.011, minLiquidityVnd: 2_500_000_000, minSymbols: 85 })).toEqual({
      max_zero_volume_ratio: 0.011,
      min_liquidity_vnd: 2_500_000_000,
      min_symbols: 85,
    })
  })

  it("đổi thứ tự nguồn giá thì gửi price_sources", () => {
    const patch = buildDatasetPatch(config, initialDrafts(config), "VCI,DNSE")
    expect(patch).toEqual({ priceSources: ["VCI", "DNSE"] })
    expect(toWireConfigPatch(patch)).toEqual({ price_sources: ["VCI", "DNSE"] })
    expect(describePriceSources(["VCI", "DNSE"])).toBe("VCI trước, DNSE dự phòng")
    expect(describePriceSources(["DNSE"])).toBe("Chỉ DNSE")
  })

  it("kiểm tra khoảng giá trị và kiểu số giống máy chủ", () => {
    const warmup = field("warmupSessions")
    expect(datasetFieldError(warmup, "252")).toBeNull()
    expect(datasetFieldError(warmup, "100")).toBeNull()
    expect(datasetFieldError(warmup, "99")).toMatch(/từ 100 đến 500/)
    expect(datasetFieldError(warmup, "501")).toMatch(/từ 100 đến 500/)
    expect(datasetFieldError(warmup, "252.5")).toBe("Nhập số nguyên.")
    expect(datasetFieldError(warmup, "")).toBe("Nhập một số.")
    expect(datasetFieldError(warmup, "abc")).toBe("Nhập một số.")
    expect(datasetFieldError(field("maxZeroVolumeRatio"), "50")).toBeNull()
    expect(datasetFieldError(field("maxZeroVolumeRatio"), "50.1")).not.toBeNull()
    expect(datasetFieldError(field("minDailyVolatility"), "20")).toBeNull()
    expect(datasetFieldError(field("minDailyVolatility"), "-1")).not.toBeNull()
  })

  it("khoảng hợp lệ của giao diện khớp khoảng của máy chủ sau khi đổi đơn vị", () => {
    const ranges = Object.fromEntries(
      DATASET_NUMERIC_FIELDS.map((item) => [item.key, [item.toWire(item.min), item.toWire(item.max)]]),
    )
    expect(ranges).toEqual({
      warmupSessions: [100, 500],
      minMonthsAgo: [0, 60],
      maxGapSessions: [0, 60],
      maxZeroVolumeRatio: [0, 0.5],
      minLiquidityVnd: [0, 1_000_000_000_000],
      minDailyVolatility: [0, 0.2],
      minSymbols: [1, 500],
      refreshDelayDays: [0, 60],
    })
    expect(DATASET_CONFIG_WIRE.min_symbols).toBe(80)
  })
})

describe("định dạng", () => {
  it("ngày ISO thành dd/mm/yyyy, giá trị lạ giữ nguyên, rỗng thành dấu gạch", () => {
    expect(formatDatasetDate("2012-03-20")).toBe("20/03/2012")
    expect(formatDatasetDate("hôm qua")).toBe("hôm qua")
    expect(formatDatasetDate(null)).toBe("—")
    expect(formatDatasetDate("")).toBe("—")
  })

  it("thời gian dựng", () => {
    expect(formatDatasetDuration(250)).toBe("250 ms")
    expect(formatDatasetDuration(45_000)).toBe("45 giây")
    expect(formatDatasetDuration(62_000)).toBe("1 phút 2 giây")
    expect(formatDatasetDuration(120_000)).toBe("2 phút")
    expect(formatDatasetDuration(null)).toBe("—")
    expect(formatDatasetDuration(-5)).toBe("—")
    expect(formatDatasetDuration(Number.NaN)).toBe("—")
  })

  it("mô tả lịch làm mới tự động theo lý do máy chủ báo", () => {
    expect(describeDatasetSchedule({ due: true, reason: "no_active_version", anchor: null })).toMatch(/chưa có kho đang dùng/)
    expect(describeDatasetSchedule({ due: true, reason: "rebalance_passed", anchor: "2026-08-10" })).toContain("10/08/2026")
    expect(describeDatasetSchedule({ due: false, reason: "up_to_date", anchor: "2026-08-10" })).toMatch(/^Chưa tới hạn/)
    expect(describeDatasetSchedule({ due: false, reason: "up_to_date", anchor: null })).toMatch(/chưa có kỳ cơ cấu/)
    expect(describeDatasetSchedule({ due: true, reason: "khác", anchor: null })).toBe("Tới hạn làm mới.")
  })
})
