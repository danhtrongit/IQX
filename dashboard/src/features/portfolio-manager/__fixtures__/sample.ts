import type { AnalysisJSON, NarrativeJSON } from "../types"

export const sampleAnalysis: AnalysisJSON = {
  meta: {
    portfolio_id: "A-0412",
    date: "2026-06-23",
    mode: "full_changed",
    period: "kỳ 3",
    period_number: 3,
  },
  overview: {
    nav: 534000000,
    cash_pct: 0.092,
    n_positions: 7,
    total_return: 0.107,
    total_pnl: 52000000,
    holding_months: 7,
    positions: [
      { ticker: "HPG", sector: "Thép",       weight: 0.160, pnl:  38000000, low_confidence: false },
      { ticker: "TCB", sector: "Ngân hàng",  weight: 0.187, pnl:   9000000, low_confidence: false },
      { ticker: "MBB", sector: "Ngân hàng",  weight: 0.157, pnl:   6000000, low_confidence: false },
      { ticker: "FPT", sector: "Công nghệ",  weight: 0.142, pnl:  11000000, low_confidence: false },
      { ticker: "DGC", sector: "Hóa chất",   weight: 0.108, pnl:  -4000000, low_confidence: false },
      { ticker: "VND", sector: "Chứng khoán",weight: 0.074, pnl:  -7000000, low_confidence: false },
      { ticker: "APG", sector: "Chứng khoán",weight: 0.080, pnl:  -1000000, low_confidence: true  },
    ],
  },
  performance: {
    portfolio_return: 0.107,
    benchmark_return: 0.072,
    excess_return: 0.035,
    max_drawdown: -0.09,
    method: "simple_inception",
  },
  allocation: [
    { sector: "Ngân hàng",   weight: 0.344, benchmark: 0.38,  active: -0.036 },
    { sector: "Thép",        weight: 0.160, benchmark: 0.04,  active:  0.120 },
    { sector: "Chứng khoán", weight: 0.154, benchmark: 0.045, active:  0.109 },
    { sector: "Công nghệ",   weight: 0.142, benchmark: 0.06,  active:  0.082 },
    { sector: "Hóa chất",    weight: 0.108, benchmark: 0.025, active:  0.083 },
  ],
  concentration: {
    top1: 0.187,
    top3: 0.504,
    effective_n: 5.8,
    largest_sector: 0.344,
  },
  risk: {
    beta: 1.25,
    volatility: 0.21,
    tracking_error: 0.08,
    correlation: [
      { a: "TCB", b: "MBB", value: 0.82 },
      { a: "HPG", b: "TCB", value: 0.31 },
      { a: "HPG", b: "MBB", value: 0.28 },
      { a: "HPG", b: "FPT", value: 0.22 },
      { a: "TCB", b: "FPT", value: 0.41 },
      { a: "MBB", b: "FPT", value: 0.38 },
    ],
    excluded: [{ ticker: "APG", reason: "low_liquidity_short_history" }],
  },
  attribution: [
    { ticker: "HPG",     pnl:  38000000, pct:  0.63 },
    { ticker: "FPT",     pnl:  11000000, pct:  0.18 },
    { ticker: "TCB+MBB", pnl:  15000000, pct:  0.24 },
    { ticker: "DGC",     pnl:  -4000000, pct: -0.07 },
    { ticker: "VND",     pnl:  -7000000, pct: -0.11 },
  ],
  quality: {
    pe: 11.4,
    pb: 1.6,
    roe: 0.18,
    dividend: 0.02,
    sector_benchmark: {
      sector: "Ngân hàng",
      your_return: 0.09,
      industry_return: 0.14,
      gap: -0.05,
    },
  },
  behavior: {
    avg_holding_days: 48,
    losing_count: 3,
    disposition_flag: true,
    worst_loser: { ticker: "VND", pnl_pct: -0.15, periods_held: 3 },
  },
  scores: {
    overall: 3.5,
    prev_overall: 3.2,
    pillars: {
      performance: 4,
      risk: 3,
      diversification: 3,
      quality: 4,
      discipline: 2,
    },
  },
  selected_insights: [
    { id: "sector_tilt", data: { sector: "Thép", ratio: 3.2, weight: 0.16 } },
  ],
  progress: {
    prev_actions: [
      { id: "trim_hpg", done: true,  detail: "Giảm HPG từ 25% về 16%, khóa phần lãi." },
      { id: "cut_vnd",  done: false, detail: "Cắt VND khi lỗ vượt ngưỡng." },
    ],
  },
}

export const sampleNarrative: NarrativeJSON = {
  title: "Danh mục bạn khỏe lên,\ngiờ là lúc chuẩn bị cho lúc xấu.",
  verdict:
    "Một danh mục đang khỏe lên nhưng vẫn nghiêng về kịch bản thị trường tăng. Việc cần làm bây giờ là siết kỷ luật và dựng đệm phòng thủ.",
  lede:
    "Một câu trước khi đi vào chi tiết: danh mục của bạn đã bớt mong manh so với kỳ trước, nhưng vẫn còn hai điểm cần xử lý — một mã lỗ chưa dứt, và đệm tiền mặt hơi mỏng so với mức rủi ro đang gánh.",
  progress_text:
    "Bạn đã làm đúng việc tôi gợi ý. Kỳ trước tôi đề nghị chốt bớt HPG — bạn đã giảm từ 25,0% về 16,0%, khóa được phần lãi và hạ độ tập trung.",
  layers: {
    overview:
      "Danh mục vẫn giải ngân gần hết, tiền mặt 9,2% — tôi sẽ quay lại con số này, vì nó liên quan trực tiếp tới phần kiểm tra sức chịu đựng phía dưới.",
    performance:
      "Bạn vẫn vượt thị trường 3,5 điểm % — kết quả tốt. Nhưng phần thắng đã bớt phụ thuộc vào một mã so với kỳ trước, đó là tiến bộ thật.",
    allocation:
      "Bạn đã hạ thép xuống nhưng vẫn còn nặng nhóm chứng khoán (VND + APG = 15,4%) — gấp đôi thị trường.",
    stress:
      "Đây không phải dự báo thị trường sẽ giảm — nó cho bạn thấy đang gánh bao nhiêu rủi ro để đổi lấy phần lãi.",
    risk: "Bạn giữ hai mã ngân hàng TCB và MBB — chúng vận động như một (tương quan 0,82).",
    attribution:
      "Tin tốt: HPG giờ chỉ còn đóng góp ~63% lợi nhuận, giảm từ 87% kỳ trước.",
    quality:
      "Bạn đặt cược đúng ngành — ngân hàng dẫn dắt kỳ vừa rồi. Nhưng kém 5,0 điểm % so với chính ngành mình chọn.",
    behavior:
      "Vẫn còn dấu hiệu giữ mã lỗ quá lâu: bạn chốt lãi khá nhanh nhưng để mã thua kéo dài.",
  },
  insight: {
    label: "Điều bạn có thể chưa để ý",
    text: "Bạn giữ hai mã ngân hàng TCB và MBB, có lẽ nghĩ cầm hai thì an toàn hơn một. Nhưng nhìn dữ liệu, chúng vận động như một (tương quan 0,82).",
  },
  low_data_note:
    "Với APG bạn mới thêm tuần trước, tôi chưa đưa con số rủi ro: mã này thanh khoản mỏng và lịch sử giá ngắn.",
  actions: [
    {
      title: "Dứt điểm cổ phiếu VND — đặt ngưỡng dừng rõ ràng",
      detail:
        "Kỳ thứ ba tôi nhắc. Mã đang lỗ −15,0% và bạn vẫn chờ về giá vốn. Nếu VND giảm thêm dưới ngưỡng bạn tự đặt, bán dứt khoát.",
    },
    {
      title: "Nâng tiền mặt từ 9,2% lên quanh 15,0% trước khi mua thêm",
      detail:
        "Bài kiểm tra phía trên cho thấy đệm phòng thủ còn mỏng so với rủi ro đang gánh.",
    },
    {
      title: "Xem lại lựa chọn mã trong nhóm ngân hàng",
      detail:
        "Bạn đúng ngành nhưng kém ngành 5,0 điểm %, lại thêm việc TCB và MBB trùng lặp.",
    },
  ],
  watch:
    "Ba mốc tôi sẽ chú ý: VND đã được xử lý chưa, tiền mặt có nâng lên không, và APG khi đủ dữ liệu.",
  closing:
    "Tổng kết: bạn đang đi đúng hướng — danh mục khỏe hơn thật, điểm số lên đều hai kỳ, lợi nhuận đã bớt dồn vào một mã.",
}
