import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SlTpBlock } from "./SlTpBlock"

const analyzeMock = vi.fn()
const stockAiInsightMock = vi.fn()
vi.mock("@/features/stock", () => ({
  useStockAiInsight: (...args: unknown[]) => stockAiInsightMock(...args),
}))

/** 15 flat OHLCV bars (high-low=850 every bar) → biên độ dao động = 850,
 * matching spec §5.3's "Ví dụ VNM ... biên độ 850đ". */
function flatOhlcv(n = 15) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    open: 61_500,
    high: 61_925,
    low: 61_075,
    close: 61_500,
    volume: 1_000_000,
  }))
}

function mockInsight(opts: {
  hoTro?: string | null
  khangCu?: string | null
  ohlcv?: ReturnType<typeof flatOhlcv> | []
  pending?: boolean
  error?: boolean
  noInsight?: boolean
} = {}) {
  const fields = []
  if (opts.hoTro !== null) {
    fields.push({ label: "Hỗ trợ", value: [{ type: "number", content: opts.hoTro ?? "61.000" }] })
  }
  if (opts.khangCu !== null) {
    fields.push({
      label: "Kháng cự",
      value: [{ type: "number", content: opts.khangCu ?? "66.500" }],
    })
  }
  stockAiInsightMock.mockReturnValue({
    insight: opts.noInsight || opts.error
      ? null
      : {
          symbol: "VNM",
          updatedAt: "t",
          header: {},
          briefing: {},
          layers: { L1: { layerNum: "L1", layerName: "Xu hướng", statusLabel: "", statusLevel: 3, fields, diff: { text: [], hasChange: false } } },
          rawInput: { trend: { realtime: null, ohlcv: opts.ohlcv ?? flatOhlcv(), computed: { ma10: 0, ma20: 0, volMa10: 0, volMa20: 0, latestClose: 0 } }, liquidity: { latest: null, avg30: null, history: [] }, moneyFlow: { foreign: [], proprietary: [] }, insider: { transactions: [] }, news: { items: [], tickerScore: null } },
        },
    analyze: analyzeMock,
    analyzeAsync: vi.fn(),
    isPending: opts.pending ?? false,
    isError: opts.error ?? false,
    error: opts.error ? new Error("boom") : null,
    reset: vi.fn(),
  })
}

beforeEach(() => {
  analyzeMock.mockClear()
  stockAiInsightMock.mockReset()
  mockInsight()
})

describe("SlTpBlock (spec §5 — Cắt lỗ/Chốt lời 2 cách chọn 1)", () => {
  it('shows the "3. Cắt lỗ / Chốt lời" label + "chọn 1 trong 2 cách" note', () => {
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={vi.fn()} />)
    expect(screen.getByText("3. Cắt lỗ / Chốt lời")).toBeInTheDocument()
    expect(screen.getByText("chọn 1 trong 2 cách")).toBeInTheDocument()
  })

  it("triggers analyze() once on mount (reuses useStockAiInsight, same as AiThanhTra)", () => {
    mockInsight({ noInsight: true })
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={vi.fn()} />)
    expect(analyzeMock).toHaveBeenCalledTimes(1)
  })

  it("renders cách 1 (Hỗ trợ/Kháng cự) with the spec §5.2 VNM example numbers", () => {
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={vi.fn()} />)
    const card = screen.getByTestId("sltp-card-ho_tro_khang_cu")
    expect(within(card).getByText(/Hỗ trợ.*Kháng cự|Hỗ trợ \/ Kháng cự/i)).toBeInTheDocument()
    expect(within(card).getByText("60,400", { exact: false })).toBeInTheDocument()
    expect(within(card).getByText("65,800", { exact: false })).toBeInTheDocument()
  })

  it("renders cách 2 (Biên độ dao động) with the spec §5.3 VNM example numbers, and NEVER says ATR", () => {
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={vi.fn()} />)
    const card = screen.getByTestId("sltp-card-bien_do_dao_dong")
    expect(within(card).getByText("60,700", { exact: false })).toBeInTheDocument()
    expect(within(card).getByText("65,800", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/ATR/)).not.toBeInTheDocument()
  })

  it('selecting cách 1 calls onSelect with the method + computed catLo/chotLoi, and highlights that card', () => {
    const onSelect = vi.fn()
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={onSelect} />)
    const card = screen.getByTestId("sltp-card-ho_tro_khang_cu")
    fireEvent.click(within(card).getByText("Chọn cách này"))
    expect(onSelect).toHaveBeenCalledWith("ho_tro_khang_cu", 60_400, 65_800)
  })

  it("selecting cách 2 calls onSelect with the method + computed catLo/chotLoi", () => {
    const onSelect = vi.fn()
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={onSelect} />)
    const card = screen.getByTestId("sltp-card-bien_do_dao_dong")
    fireEvent.click(within(card).getByText("Chọn cách này"))
    expect(onSelect).toHaveBeenCalledWith("bien_do_dao_dong", 60_700, 65_800)
  })

  it("shows the selected card as chosen (data-selected) when the selected prop matches", () => {
    render(
      <SlTpBlock symbol="VNM" giaVao={62_400} selected="ho_tro_khang_cu" onSelect={vi.fn()} />,
    )
    expect(screen.getByTestId("sltp-card-ho_tro_khang_cu")).toHaveAttribute(
      "data-selected",
      "true",
    )
    expect(screen.getByTestId("sltp-card-bien_do_dao_dong")).toHaveAttribute(
      "data-selected",
      "false",
    )
  })

  it("degrades gracefully: disables cách 1 with a short reason when hỗ trợ/kháng cự aren't available (no crash)", () => {
    mockInsight({ hoTro: null, khangCu: null })
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={vi.fn()} />)
    const card = screen.getByTestId("sltp-card-ho_tro_khang_cu")
    expect(within(card).getByText("Chọn cách này")).toBeDisabled()
    expect(within(card).getByText(/không/i)).toBeInTheDocument()
  })

  it("degrades gracefully: disables cách 2 with a short reason when there isn't enough OHLCV history (no crash)", () => {
    mockInsight({ ohlcv: [] })
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={vi.fn()} />)
    const card = screen.getByTestId("sltp-card-bien_do_dao_dong")
    expect(within(card).getByText("Chọn cách này")).toBeDisabled()
    expect(within(card).getByText(/không/i)).toBeInTheDocument()
  })

  it("degrades gracefully when the insight fetch fails entirely (both cards disabled, no crash)", () => {
    mockInsight({ error: true })
    render(<SlTpBlock symbol="VNM" giaVao={62_400} selected={null} onSelect={vi.fn()} />)
    expect(within(screen.getByTestId("sltp-card-ho_tro_khang_cu")).getByText("Chọn cách này")).toBeDisabled()
    expect(within(screen.getByTestId("sltp-card-bien_do_dao_dong")).getByText("Chọn cách này")).toBeDisabled()
  })
})
