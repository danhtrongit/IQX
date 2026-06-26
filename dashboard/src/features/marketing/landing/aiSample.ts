import type { AIInsightResponse } from "@/features/stock/types"

/**
 * A faithful sample AI Insight response used to render the REAL
 * <AiInsightBriefing> on the public landing page (the live endpoint is
 * premium-gated, so anonymous visitors get this injected instead). Shape
 * matches the production contract exactly; numbers are illustrative
 * (session 19/06/2026).
 */

// ~22 daily bars around 60–61.7k so the L1 "Giá & MA" chart renders for real.
const OHLCV = [
  ["2026-05-20", 59800, 13.1], ["2026-05-21", 60050, 12.4], ["2026-05-22", 59950, 11.8],
  ["2026-05-23", 60300, 14.2], ["2026-05-26", 60500, 13.6], ["2026-05-27", 60450, 12.0],
  ["2026-05-28", 60800, 15.1], ["2026-05-29", 61050, 16.3], ["2026-05-30", 60900, 12.7],
  ["2026-06-02", 61200, 14.8], ["2026-06-03", 61400, 15.9], ["2026-06-04", 61250, 11.5],
  ["2026-06-05", 61500, 13.2], ["2026-06-06", 61650, 14.0], ["2026-06-09", 61550, 12.1],
  ["2026-06-10", 61700, 13.4], ["2026-06-11", 61600, 11.9], ["2026-06-12", 61750, 12.8],
  ["2026-06-13", 61650, 10.7], ["2026-06-16", 61700, 11.2], ["2026-06-17", 61600, 13.9],
  ["2026-06-18", 61750, 12.5], ["2026-06-19", 61700, 15.6],
].map(([date, close, volM]) => ({
  date: date as string,
  open: (close as number) - 100,
  high: (close as number) + 150,
  low: (close as number) - 200,
  close: close as number,
  volume: Math.round((volM as number) * 1e6),
}))

export const AI_SAMPLE: AIInsightResponse = {
  symbol: "VCB",
  updatedAt: "2026-06-19T10:38:00+07:00",
  header: {
    symbol: "VCB",
    sector: "Ngân hàng",
    indexGroup: "VN30",
    price: 61700,
    changePercent: 0.16,
    high: 61900,
    low: 61600,
    volume: "15.6M",
    isLive: false,
  },
  briefing: {
    updatedAt: "2026-06-19T10:38:00+07:00",
    trend: "Đi ngang",
    status: "Yếu",
    statusVariant: "warn",
    timeframe: "trung hạn 1–2 tuần",
    narrative: [
      { type: "text", content: "Khối ngoại " },
      { type: "emphasis", content: "bán mạnh phiên thứ 3 liên tiếp", variant: "bear" },
      { type: "text", content: ", khiến VCB khó bứt phá quanh " },
      { type: "number", content: "61.600" },
      { type: "text", content: ". Tin phát hành trái phiếu và " },
      { type: "emphasis", content: "lãnh đạo mua thêm", variant: "bull" },
      { type: "text", content: " giữ tâm lý ổn định, nhưng chưa đủ lấn át áp lực bán. Vùng " },
      { type: "highlight", content: "61.600–61.900" },
      { type: "text", content: " sẽ quyết định hướng đi." },
    ],
    diff: {
      hasChange: true,
      isFirstAnalysis: false,
      text: [
        { type: "text", content: "Trạng thái giữ " },
        { type: "emphasis", content: "Yếu", variant: "warn" },
        { type: "text", content: "; khối ngoại bán ròng nới rộng so với phiên trước." },
      ],
    },
    observations: {
      liquidity: [
        { type: "text", content: "Khớp " },
        { type: "number", content: "15,6 triệu cp" },
        { type: "text", content: ", dưới trung bình 30 phiên." },
      ],
      moneyFlow: [
        { type: "emphasis", content: "Khối ngoại bán ròng 3 phiên", variant: "bear" },
        { type: "text", content: " (tổng " },
        { type: "number", content: "−4,9 triệu cp" },
        { type: "text", content: "), tự doanh mua nhẹ không đủ bù." },
      ],
      insider: [
        { type: "emphasis", content: "HĐQT và Phó TGĐ mua thêm", variant: "bull" },
        { type: "text", content: " trong 14 ngày, hỗ trợ tâm lý." },
      ],
      news: [{ type: "text", content: "Phát hành trái phiếu và tài chính số củng cố định giá dài hạn." }],
      supportResistance: [
        { type: "text", content: "Hỗ trợ " },
        { type: "number", content: "61.600" },
        { type: "text", content: " chạm 3 lần, kháng cự " },
        { type: "number", content: "61.900" },
        { type: "text", content: " cản trên." },
      ],
    },
    watchLevels: [
      { tag: "Hỗ trợ", description: "61.600 — chạm 3 lần, nếu thủng có thể lan rộng" },
      { tag: "Kháng cự", description: "61.900 — nếu vượt, tâm lý cải thiện" },
    ],
    recommendation: "Quan sát thêm",
  },
  layers: {
    L1: {
      layerNum: "L1",
      layerName: "Xu hướng",
      statusLabel: "Yếu",
      statusLevel: 2,
      fields: [
        {
          label: "Cấu trúc giá",
          value: [
            { type: "text", content: "Giá dưới " },
            { type: "number", content: "MA20" },
            { type: "text", content: ", dao động hẹp quanh " },
            { type: "number", content: "61.700" },
            { type: "text", content: "." },
          ],
        },
        {
          label: "Động lượng",
          value: [
            { type: "emphasis", content: "Suy yếu", variant: "warn" },
            { type: "text", content: " — chưa thủng hỗ trợ 61.600." },
          ],
        },
      ],
      diff: { text: [], hasChange: false },
    },
    L2: {
      layerNum: "L2",
      layerName: "Thanh khoản",
      statusLabel: "Dưới trung bình",
      statusLevel: 2,
      fields: [],
      diff: { text: [], hasChange: false },
    },
    L3: {
      layerNum: "L3",
      layerName: "Dòng tiền",
      statusLabel: "Cảnh báo nhẹ",
      statusLevel: 2,
      fields: [],
      diff: { text: [], hasChange: false },
    },
    L4: {
      layerNum: "L4",
      layerName: "Nội bộ",
      statusLabel: "Tích cực",
      statusLevel: 4,
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
      news: {
        material: [
          { title: "Phát hành trái phiếu thành công", subtitle: "củng cố vốn cho 2026", tag: "Phát hành" },
        ],
        filler: [{ title: "Khen thưởng nội bộ", tag: "Nhân sự" }],
      },
    },
  },
  rawInput: {
    trend: {
      realtime: null,
      ohlcv: OHLCV,
      computed: { ma10: 61650, ma20: 61050, volMa10: 12_600_000, volMa20: 13_100_000, latestClose: 61700 },
    },
    liquidity: { latest: null, avg30: null, history: [] },
    moneyFlow: { foreign: [], proprietary: [] },
    insider: { transactions: [] },
    news: { items: [], tickerScore: null },
  },
}
