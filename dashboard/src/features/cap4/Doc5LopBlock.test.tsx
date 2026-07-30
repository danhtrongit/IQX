import { fireEvent, render, screen } from "@testing-library/react"
import React, { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Doc5LopBlock } from "./Doc5LopBlock"
import { LOP_KEYS } from "./doc5Lop"
import type { Lop, Lop5Partial, NhanDinhLop } from "./types"

const analyzeMock = vi.fn()
const stockAiInsightMock = vi.fn()
vi.mock("@/features/stock", () => ({
  useStockAiInsight: (...args: unknown[]) => stockAiInsightMock(...args),
}))

const bctcDashboardMock = vi.fn()
vi.mock("@/features/stock/bctc-dashboard", () => ({
  useBctcDashboard: (...args: unknown[]) => bctcDashboardMock(...args),
}))

/** A minimal `LayerCard`-shaped payload for one AI Insight layer. */
function layer(
  layerKey: "L1" | "L3" | "L4" | "L5",
  statusLevel: 1 | 2 | 3 | 4 | 5,
  opts: { statusLabel?: string; diff?: string; field?: [string, string] } = {},
) {
  return {
    layerNum: layerKey,
    layerName: layerKey,
    statusLabel: opts.statusLabel ?? "Mạnh",
    statusLevel,
    fields: [
      {
        label: opts.field?.[0] ?? "Xu hướng",
        value: [{ type: "text", content: opts.field?.[1] ?? "Tăng" }],
      },
    ],
    diff: {
      text: opts.diff ? [{ type: "text", content: opts.diff }] : [],
      hasChange: !!opts.diff,
    },
  }
}

/**
 * Default fixture: L1 statusLevel 4 (→ AI 'ok'), L3 3 (→ 'neu'), L4 2 (→ 'bad'),
 * L5 5 (→ 'ok'); BCTC price 90 inside a 80–120 vùng, trung vị 100 (→ 'ok').
 */
function mockInsight(opts: { pending?: boolean; error?: boolean; empty?: boolean } = {}) {
  stockAiInsightMock.mockReturnValue({
    insight:
      opts.empty || opts.error || opts.pending
        ? null
        : {
            symbol: "VNM",
            updatedAt: "t",
            header: {},
            briefing: {},
            layers: {
              L1: layer("L1", 4, { diff: "Trạng thái từ Trung bình lên Mạnh." }),
              L3: layer("L3", 3, {
                statusLabel: "Trung tính",
                field: ["Khối ngoại", "Mua ròng nhẹ"],
                diff: "lực mua khối ngoại tăng tốc.",
              }),
              L4: layer("L4", 2, {
                statusLabel: "Cảnh báo nhẹ",
                field: ["Nội bộ", "Lãnh đạo bán ra"],
              }),
              L5: layer("L5", 5, {
                statusLabel: "Rất tích cực",
                field: ["Tin tức", "1 tin material"],
              }),
            },
            rawInput: {},
          },
    analyze: analyzeMock,
    analyzeAsync: vi.fn(),
    isPending: opts.pending ?? false,
    isError: opts.error ?? false,
    error: opts.error ? new Error("boom") : null,
    reset: vi.fn(),
  })
}

function mockBctc(
  overrides: Partial<{ current_price: number | null; fair_median: number | null }> = {},
  opts: { loading?: boolean; error?: boolean } = {},
) {
  bctcDashboardMock.mockReturnValue({
    data: opts.error
      ? undefined
      : {
          blocks: {
            valuation: {
              methods: [{ name: "PE", bear: 80, base: 100, bull: 120 }],
              current_price: 90,
              fair_median: 100,
              upside_pct: 11.1,
              metrics: [],
              ...overrides,
            },
          },
        },
    isLoading: opts.loading ?? false,
    isError: opts.error ?? false,
  })
}

/** Controlled harness — `TradingPanel` owns the ratings state in production. */
function Harness({
  onAi5Lop,
  onRateSpy,
  initial = {},
}: {
  onAi5Lop?: (ai: Lop5Partial) => void
  onRateSpy?: (lop: Lop, n: NhanDinhLop) => void
  initial?: Lop5Partial
}) {
  const [doc5Lop, setDoc5Lop] = useState<Lop5Partial>(initial)
  return (
    <Doc5LopBlock
      symbol="VNM"
      currentPrice={90}
      doc5Lop={doc5Lop}
      onRate={(lop, n) => {
        onRateSpy?.(lop, n)
        setDoc5Lop((prev) => ({ ...prev, [lop]: n }))
      }}
      onAi5Lop={onAi5Lop}
    />
  )
}

function rateAll(nhanDinh: NhanDinhLop | Partial<Record<Lop, NhanDinhLop>>) {
  for (const lop of LOP_KEYS) {
    const value = typeof nhanDinh === "string" ? nhanDinh : (nhanDinh[lop] ?? "neu")
    fireEvent.click(screen.getByTestId(`cap4-rate-${lop}-${value}`))
  }
}

beforeEach(() => {
  analyzeMock.mockClear()
  stockAiInsightMock.mockReset()
  bctcDashboardMock.mockReset()
  mockInsight()
  mockBctc()
})

describe("Doc5LopBlock — 5 lớp với dữ liệu thật hiện sẵn (spec §5.1)", () => {
  it("renders one row per lớp with its label + 3 self-rating buttons", () => {
    render(<Harness />)
    expect(screen.getByTestId("cap4-doc5lop")).toBeInTheDocument()
    for (const lop of LOP_KEYS) {
      expect(screen.getByTestId(`cap4-lop-${lop}`)).toBeInTheDocument()
      expect(screen.getByTestId(`cap4-rate-${lop}-ok`)).toBeInTheDocument()
      expect(screen.getByTestId(`cap4-rate-${lop}-neu`)).toBeInTheDocument()
      expect(screen.getByTestId(`cap4-rate-${lop}-bad`)).toBeInTheDocument()
    }
    expect(screen.getByText("Kỹ thuật")).toBeInTheDocument()
    expect(screen.getByText("Định giá")).toBeInTheDocument()
  })

  it("shows each lớp's REAL data up-front (no click needed) — 5-bậc status + fields", () => {
    render(<Harness />)
    expect(screen.getByText("Trạng thái: Mạnh")).toBeInTheDocument()
    expect(screen.getByText("Xu hướng: Tăng")).toBeInTheDocument()
    expect(screen.getByText("Khối ngoại: Mua ròng nhẹ")).toBeInTheDocument()
    // Định giá comes from BCTC (vùng giá trị + trung vị + giá hiện tại).
    expect(screen.getByText(/Vùng giá trị: 80 – 120/)).toBeInTheDocument()
    expect(screen.getByText(/Trung vị \(giá hợp lý\): 100/)).toBeInTheDocument()
  })

  it('shows "So với phiên trước" for the lớp that have a diff, and omits it otherwise', () => {
    render(<Harness />)
    expect(
      screen.getByText("So với phiên trước: Trạng thái từ Trung bình lên Mạnh."),
    ).toBeInTheDocument()
    expect(
      screen.getByText("So với phiên trước: lực mua khối ngoại tăng tốc."),
    ).toBeInTheDocument()
    // L4's fixture has no diff → no line for Nội bộ.
    expect(screen.queryByTestId("cap4-diff-noi_bo")).not.toBeInTheDocument()
  })

  it("fetches the AI Insight lazily, exactly once", () => {
    mockInsight({ empty: true })
    render(<Harness />)
    expect(analyzeMock).toHaveBeenCalledTimes(1)
  })

  it("does not refetch when the insight is already loaded", () => {
    render(<Harness />)
    expect(analyzeMock).not.toHaveBeenCalled()
  })

  it("reports each rating up through onRate", () => {
    const onRateSpy = vi.fn()
    render(<Harness onRateSpy={onRateSpy} />)
    fireEvent.click(screen.getByTestId("cap4-rate-dong_tien-ok"))
    expect(onRateSpy).toHaveBeenCalledWith("dong_tien", "ok")
  })

  it("marks the picked button as pressed", () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId("cap4-rate-tin_tuc-bad"))
    expect(screen.getByTestId("cap4-rate-tin_tuc-bad")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("cap4-rate-tin_tuc-ok")).toHaveAttribute("aria-pressed", "false")
  })
})

describe("Doc5LopBlock — AI ẨN tới khi chấm đủ 5 lớp (spec §5.2, chống nhìn bài)", () => {
  it("hides every per-lớp AI đối chiếu cell before all 5 are rated", () => {
    render(<Harness />)
    for (const lop of LOP_KEYS) {
      expect(screen.queryByTestId(`cap4-ai-${lop}`)).not.toBeInTheDocument()
    }
    expect(screen.getByTestId("cap4-ai-locked")).toBeInTheDocument()
    expect(
      screen.getByText("🔒 Chấm đủ 5 lớp để xem AI đối chiếu và đặt lệnh"),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("cap4-dongthuan-summary")).not.toBeInTheDocument()
  })

  it("keeps the AI hidden at 4/5 rated", () => {
    render(<Harness initial={{ ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "bad" }} />)
    expect(screen.getByTestId("cap4-ai-locked")).toBeInTheDocument()
    expect(screen.queryByTestId("cap4-ai-ky_thuat")).not.toBeInTheDocument()
  })

  it("shows how many lớp are rated so far", () => {
    render(<Harness initial={{ ky_thuat: "ok", dong_tien: "ok" }} />)
    expect(screen.getByText(/Đã chấm 2\/5 lớp/)).toBeInTheDocument()
  })

  it("reveals every per-lớp AI cell once all 5 are rated", () => {
    render(<Harness />)
    rateAll("ok")
    expect(screen.queryByTestId("cap4-ai-locked")).not.toBeInTheDocument()
    for (const lop of LOP_KEYS) {
      expect(screen.getByTestId(`cap4-ai-${lop}`)).toBeInTheDocument()
    }
  })
})

describe("Doc5LopBlock — nhãn trung tính khi lệch AI (spec §4.2/§5.2)", () => {
  it('labels a matching lớp "✓ Cùng góc nhìn với AI" with the AI mức', () => {
    render(<Harness />)
    // AI reads ky_thuat as 'ok' (statusLevel 4) — user rates 'ok' too.
    rateAll({ ky_thuat: "ok", dong_tien: "neu", noi_bo: "bad", tin_tuc: "ok", dinh_gia: "ok" })
    expect(screen.getByTestId("cap4-ai-ky_thuat")).toHaveTextContent(
      "✓ Cùng góc nhìn với AI — AI đánh giá: Ủng hộ",
    )
  })

  it('labels a differing lớp "↔ Góc nhìn khác AI" (never "sai") with the AI mức', () => {
    render(<Harness />)
    // AI reads noi_bo as 'bad' (statusLevel 2) — user rates 'ok' → khác AI.
    rateAll({ ky_thuat: "ok", dong_tien: "neu", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" })
    expect(screen.getByTestId("cap4-ai-noi_bo")).toHaveTextContent(
      "↔ Góc nhìn khác AI — AI đánh giá: Ngược chiều",
    )
  })

  it("uses the tím (neutral) class for a differing lớp and the xanh class for a matching one", () => {
    render(<Harness />)
    rateAll({ ky_thuat: "ok", dong_tien: "neu", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" })
    expect(screen.getByTestId("cap4-ai-noi_bo").className).toMatch(/khac/)
    expect(screen.getByTestId("cap4-ai-ky_thuat").className).toMatch(/cung/)
  })

  it('NEVER renders a "đúng/sai" judgement anywhere in the block', () => {
    render(<Harness />)
    rateAll({ ky_thuat: "bad", dong_tien: "bad", noi_bo: "ok", tin_tuc: "bad", dinh_gia: "bad" })
    const block = screen.getByTestId("cap4-doc5lop")
    expect(block.textContent).not.toMatch(/sai/i)
    expect(block.textContent).not.toMatch(/bạn đúng|đúng\/sai|chấm điểm đúng/i)
  })

  it("shows the điểm đồng thuận X/5 + cùng-góc-nhìn Y/5 summary once revealed", () => {
    render(<Harness />)
    // AI: ky_thuat ok · dong_tien neu · noi_bo bad · tin_tuc ok · dinh_gia ok → 3 'ok'.
    // User: all 'ok' → cùng góc nhìn on ky_thuat/tin_tuc/dinh_gia = 3/5.
    rateAll("ok")
    expect(screen.getByTestId("cap4-dongthuan-summary")).toHaveTextContent(
      "Điểm đồng thuận 3/5 · Cùng góc nhìn AI 3/5",
    )
    // §C12c — the numbers carry their provenance.
    expect(screen.getByTestId("cap4-dongthuan-provenance")).toHaveTextContent(
      /3\/5 lớp AI đánh giá Ủng hộ/,
    )
  })

  it("reports the AI's per-lớp view up through onAi5Lop ONLY once all 5 are rated", () => {
    const onAi5Lop = vi.fn()
    render(<Harness onAi5Lop={onAi5Lop} />)
    expect(onAi5Lop).not.toHaveBeenCalled()
    rateAll("ok")
    expect(onAi5Lop).toHaveBeenCalledWith({
      ky_thuat: "ok",
      dong_tien: "neu",
      noi_bo: "bad",
      tin_tuc: "ok",
      dinh_gia: "ok",
    })
  })
})

describe("Doc5LopBlock — degrade gracefully", () => {
  it("still lets the user rate a lớp whose real data failed to load", () => {
    mockInsight({ error: true })
    render(<Harness />)
    expect(screen.getAllByText("Chưa có dữ liệu lớp này.").length).toBeGreaterThan(0)
    // Rating still works (the cổng cứng must not become unpassable).
    fireEvent.click(screen.getByTestId("cap4-rate-ky_thuat-ok"))
    expect(screen.getByTestId("cap4-rate-ky_thuat-ok")).toHaveAttribute("aria-pressed", "true")
  })

  it("says so (neutrally) instead of claiming an AI verdict for a degraded lớp", () => {
    mockInsight({ error: true })
    render(<Harness />)
    rateAll("ok")
    expect(screen.getByTestId("cap4-ai-ky_thuat")).toHaveTextContent(
      "⚪ Chưa có dữ liệu lớp này để đối chiếu",
    )
    // Định giá still resolves from BCTC.
    expect(screen.getByTestId("cap4-ai-dinh_gia")).toHaveTextContent("Cùng góc nhìn")
  })

  it("degrades Định giá when BCTC fails, without blocking the ratings", () => {
    mockBctc({}, { error: true })
    render(<Harness />)
    rateAll("ok")
    expect(screen.getByTestId("cap4-ai-dinh_gia")).toHaveTextContent(
      "⚪ Chưa có dữ liệu lớp này để đối chiếu",
    )
  })

  it("shows a loading hint while the insight fetch is pending", () => {
    mockInsight({ pending: true })
    render(<Harness />)
    expect(screen.getAllByText("Đang tải dữ liệu lớp…").length).toBe(4)
  })
})
