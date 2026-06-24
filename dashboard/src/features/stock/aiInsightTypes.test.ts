/**
 * Type-only smoke test for v2 AIInsightResponse data contract.
 * Compile-time type check + runtime fixture assertion.
 */

import type {
  AIInsightResponse,
  BriefingCard,
  LayerCard,
  NarrativeFragment,
  StockHeader,
} from "./types"

describe("aiInsightTypes", () => {
  it("should compile and validate AIInsightResponse with v2 structure", () => {
    // Construct a minimal fixture matching the spec
    const narrativeText: NarrativeFragment[] = [
      { type: "text", content: "Sample narrative" },
    ]

    const header: StockHeader = {
      symbol: "VCB",
      sector: "Ngân hàng",
      indexGroup: "VN30",
      price: 61700,
      changePercent: 0.16,
      high: 61800,
      low: 61600,
      volume: "15.6M",
      isLive: true,
    }

    const briefing: BriefingCard = {
      updatedAt: "2026-06-24T10:30:00Z",
      trend: "Đi ngang",
      status: "Yếu",
      statusVariant: "warn",
      timeframe: "trung hạn 1–2 tuần",
      narrative: narrativeText,
      diff: {
        text: [{ type: "text", content: "Tín hiệu ổn định so với phiên trước" }],
        hasChange: false,
        isFirstAnalysis: false,
      },
      observations: {
        liquidity: [{ type: "text", content: "Lệnh khó khớp quanh 61,600" }],
        moneyFlow: [{ type: "text", content: "Khối ngoại bán nhẹ" }],
        insider: [{ type: "text", content: "Giao dịch nhỏ lẻ" }],
        news: [{ type: "text", content: "Không có tin mới" }],
        supportResistance: [{ type: "text", content: "Hỗ trợ 61,600, Kháng cự 61,900" }],
      },
      watchLevels: [
        { tag: "Hỗ trợ", description: "61,600 — nếu thủng có thể lan rộng" },
        { tag: "Kháng cự", description: "61,900 — nếu vượt tâm lý cải thiện" },
      ],
      recommendation: "Quan sát thêm",
    }

    const layer1: LayerCard = {
      layerNum: "L1",
      layerName: "Xu hướng",
      statusLabel: "Yếu",
      statusLevel: 2,
      fields: [
        { label: "Xu hướng", value: [{ type: "text", content: "Đi ngang" }] },
        { label: "Trạng thái", value: [{ type: "text", content: "Yếu" }] },
      ],
      diff: {
        text: [{ type: "text", content: "Tín hiệu ổn định" }],
        hasChange: false,
      },
    }

    const fixture: AIInsightResponse = {
      symbol: "VCB",
      updatedAt: "2026-06-24T10:30:00Z",
      header,
      briefing,
      layers: {
        L1: layer1,
        L2: {
          layerNum: "L2",
          layerName: "Thanh khoản",
          statusLabel: "Bình thường",
          statusLevel: 3,
          fields: [],
          diff: { text: [], hasChange: false },
        },
        L3: {
          layerNum: "L3",
          layerName: "Dòng tiền",
          statusLabel: "Trung tính",
          statusLevel: 3,
          fields: [],
          diff: { text: [], hasChange: false },
        },
        L4: {
          layerNum: "L4",
          layerName: "Nội bộ",
          statusLabel: "Trung tính",
          statusLevel: 3,
          fields: [],
          diff: { text: [], hasChange: false },
        },
        L5: {
          layerNum: "L5",
          layerName: "Tin tức",
          statusLabel: "Trung tính",
          statusLevel: 3,
          fields: [],
          diff: { text: [], hasChange: false },
        },
      },
      rawInput: {
        trend: {
          realtime: null,
          ohlcv: [],
          computed: {
            ma10: 61500,
            ma20: 61400,
            volMa10: 100,
            volMa20: 95,
            latestClose: 61700,
          },
        },
        liquidity: {
          latest: null,
          avg30: null,
          history: [],
        },
        moneyFlow: { foreign: [], proprietary: [] },
        insider: { transactions: [] },
        news: { items: [], tickerScore: null },
      },
    }

    // Runtime assertion
    expect(fixture.briefing.recommendation).toBe("Quan sát thêm")
    expect(fixture.layers.L1.statusLevel).toBe(2)
  })
})
