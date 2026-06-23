export type Archetype =
  | "price-ma"
  | "distance"
  | "oscillator"
  | "macd"
  | "volatility"
  | "volume"
  | "level-breakout"
  | "candlestick"

export interface IndicatorInfo {
  tagline: string
  levels: { range: string; state: string; action: string }[]
  archetype: Archetype
}

export const INDICATOR_INFO: Record<string, IndicatorInfo> = {
  // price-ma
  ma_5: {
    tagline: "Đường trung bình động 5 phiên — phản ánh xu hướng siêu ngắn hạn của giá.",
    levels: [
      { range: "Close > MA5", state: "Tăng ngắn hạn", action: "Xu hướng siêu ngắn đang tích cực" },
      { range: "Close < MA5", state: "Giảm ngắn hạn", action: "Áp lực bán ngắn hạn" },
      { range: "Close cắt lên MA5", state: "Tín hiệu sớm", action: "Có thể là khởi đầu nhịp tăng" },
      { range: "Close cắt xuống MA5", state: "Cảnh báo sớm", action: "Có thể là khởi đầu nhịp điều chỉnh" },
    ],
    archetype: "price-ma",
  },
  ma_20: {
    tagline: "Đường trung bình động 20 phiên — chuẩn cho swing trader, gần tương đương 1 tháng giao dịch.",
    levels: [
      { range: "Close > MA20", state: "Xu hướng tăng ngắn-trung hạn", action: "Có thể giữ vị thế mua" },
      { range: "Close < MA20", state: "Xu hướng giảm ngắn-trung hạn", action: "Cẩn trọng vị thế mua" },
      { range: "Close cắt lên MA20", state: "Tín hiệu mua swing", action: "Cân nhắc vào lệnh có volume xác nhận" },
      { range: "Close cắt xuống MA20", state: "Tín hiệu thoát swing", action: "Cân nhắc chốt lời / bảo toàn vốn" },
    ],
    archetype: "price-ma",
  },
  ma_50: {
    tagline: "Đường trung bình động 50 phiên — biên giới giữa uptrend trung hạn và downtrend.",
    levels: [
      { range: "Close > MA50", state: "Uptrend trung hạn", action: "Bias dài thiên về mua" },
      { range: "Close < MA50", state: "Downtrend trung hạn", action: "Bias dài thiên về thận trọng" },
      { range: "Close cắt lên MA50", state: "Chuyển sang uptrend", action: "Tín hiệu chuyển pha tích cực" },
      { range: "Close cắt xuống MA50", state: "Chuyển sang downtrend", action: "Cảnh báo chuyển pha tiêu cực" },
    ],
    archetype: "price-ma",
  },
  ma_200: {
    tagline: "Đường trung bình động 200 phiên — chuẩn vàng phân định bull market vs bear market.",
    levels: [
      { range: "Close > MA200", state: "Bull market dài hạn", action: "Ưu tiên long, tránh short" },
      { range: "Close < MA200", state: "Bear market dài hạn", action: "Thận trọng, ưu tiên bảo toàn vốn" },
      { range: "Close cắt lên MA200", state: "Bull market xác lập", action: "Tín hiệu chuyển pha lớn" },
      { range: "Close cắt xuống MA200", state: "Bear market xác lập", action: "Cảnh báo nghiêm trọng" },
    ],
    archetype: "price-ma",
  },
  ma_stack_bull: {
    tagline: "4 đường MA xếp chồng tăng — xu hướng tăng rõ ràng nhất có thể.",
    levels: [],
    archetype: "price-ma",
  },
  uptrend: {
    tagline: "Uptrend cấu trúc dài hạn — MA trung hạn vượt MA dài hạn.",
    levels: [],
    archetype: "price-ma",
  },
  death_cross: {
    tagline: "Tín hiệu cảnh báo đảo chiều giảm trung hạn — MA ngắn cắt xuống MA trung hạn.",
    levels: [],
    archetype: "price-ma",
  },

  // distance
  dist_ma_20: {
    tagline: "Giá cách MA20 bao nhiêu phần trăm — đo độ mở rộng (extension) của giá.",
    levels: [
      { range: "< −10%", state: "Quá bán cực đoan", action: "Cơ hội mua mean-reversion mạnh" },
      { range: "−10% → −3%", state: "Pullback", action: "Cân nhắc mua dip trong uptrend" },
      { range: "−3% → +3%", state: "Cân bằng", action: "Bình thường" },
      { range: "+3% → +10%", state: "Mở rộng tăng", action: "Cẩn trọng vào lệnh mới" },
      { range: "> +10%", state: "Quá mua cực đoan", action: "Nguy cơ điều chỉnh, cân nhắc chốt lời" },
    ],
    archetype: "distance",
  },
  dist_ma_200: {
    tagline: "Giá cách MA200 bao nhiêu phần trăm — đo regime dài hạn và mức extension.",
    levels: [
      { range: "> +20%", state: "Quá mở rộng", action: "Cẩn trọng, có thể correction lớn" },
      { range: "0% → +20%", state: "Bull market", action: "Bias dài hạn tích cực" },
      { range: "−10% → 0%", state: "Yếu, gần MA200", action: "Vùng quan trọng - test" },
      { range: "< −10%", state: "Bear market sâu", action: "Tránh long, chờ recovery" },
    ],
    archetype: "distance",
  },
  dist_52w_high: {
    tagline: "Giá cách đỉnh năm bao nhiêu phần trăm — đo strength dài hạn.",
    levels: [
      { range: "> −2% (gần đỉnh)", state: "Đang test đỉnh năm", action: "Setup breakout mạnh" },
      { range: "−5% → −2%", state: "Pullback nông trong uptrend", action: "Cơ hội mua dip" },
      { range: "−10% → −5%", state: "Pullback rõ", action: "Đợi confirm reversal" },
      { range: "−20% → −10%", state: "Correction sâu", action: "Cẩn trọng" },
      { range: "< −20%", state: "Bear hoặc trend đảo", action: "Tránh long" },
    ],
    archetype: "distance",
  },
  dist_52w_low: {
    tagline: "Giá cách đáy năm bao nhiêu phần trăm — đo recovery hoặc extension.",
    levels: [
      { range: "< 5%", state: "Đang ở đáy năm", action: "Có thể setup bottom fishing hoặc tránh xa" },
      { range: "5% — 30%", state: "Hồi phục đầu", action: "Cẩn trọng, chưa khẳng định" },
      { range: "30% — 100%", state: "Hồi phục rõ", action: "Trend lên đã xác lập" },
      { range: "> 100%", state: "Đã tăng gấp đôi từ đáy", action: "Cẩn trọng quá extended" },
    ],
    archetype: "distance",
  },
  ma_20_slope: {
    tagline: "Tốc độ thay đổi của MA20 qua 10 phiên — đo lực và hướng xu hướng.",
    levels: [
      { range: "> +5%", state: "Uptrend rất mạnh", action: "Bias mua mạnh" },
      { range: "+2% → +5%", state: "Uptrend ổn định", action: "Bias mua" },
      { range: "−2% → +2%", state: "Sideway", action: "Trung lập" },
      { range: "−5% → −2%", state: "Downtrend ổn định", action: "Bias thận trọng" },
      { range: "< −5%", state: "Downtrend rất mạnh", action: "Tránh long" },
    ],
    archetype: "distance",
  },

  // oscillator
  rsi_14: {
    tagline: "Chỉ số sức mạnh tương đối — đo độ kiệt sức của xu hướng giá.",
    levels: [
      { range: "< 30", state: "Quá bán", action: "Mua khi RSI bật ngược lên" },
      { range: "30 — 50", state: "Vùng yếu", action: "Chờ xác nhận xu hướng" },
      { range: "50 — 70", state: "Vùng mạnh", action: "Có thể giữ vị thế mua" },
      { range: "> 70", state: "Quá mua", action: "Chốt lời khi RSI quay đầu" },
    ],
    archetype: "oscillator",
  },
  roc_20d: {
    tagline: "Tỷ lệ thay đổi giá so với 20 phiên trước — đo momentum trực tiếp.",
    levels: [
      { range: "> +15%", state: "Momentum cực mạnh", action: "Có thể tiếp diễn nhưng cẩn trọng quá mua" },
      { range: "+5% → +15%", state: "Momentum tăng tốt", action: "Bias mua" },
      { range: "−5% → +5%", state: "Sideway", action: "Trung lập" },
      { range: "−15% → −5%", state: "Momentum giảm", action: "Bias thận trọng" },
      { range: "< −15%", state: "Momentum cực yếu", action: "Có thể oversold, cân nhắc mean revert" },
    ],
    archetype: "oscillator",
  },

  // macd
  macd_hist: {
    tagline: "Khoảng cách giữa đường MACD và Signal — đo lực động lượng và hướng.",
    levels: [
      { range: "Histogram > 0 và tăng", state: "Động lượng tăng đang tăng tốc", action: "Tích cực" },
      { range: "Histogram > 0 và giảm", state: "Động lượng tăng đang chậm lại", action: "Cảnh báo sớm" },
      { range: "Histogram < 0 và giảm", state: "Động lượng giảm đang tăng tốc", action: "Tiêu cực" },
      { range: "Histogram < 0 và tăng", state: "Động lượng giảm đang chậm lại", action: "Cơ hội recovery" },
    ],
    archetype: "macd",
  },
  macd_bull_cross: {
    tagline: "Tín hiệu mua kinh điển — động lượng chuyển sang tích cực.",
    levels: [],
    archetype: "macd",
  },
  macd_bear_cross: {
    tagline: "Tín hiệu bán — động lượng chuyển sang tiêu cực.",
    levels: [],
    archetype: "macd",
  },

  // volatility
  atr_14: {
    tagline: "Biên độ dao động trung bình 14 phiên — chuẩn vàng để đặt stop loss dynamic.",
    levels: [],
    archetype: "volatility",
  },
  atr_pct: {
    tagline: "ATR chia cho giá — so sánh biến động được giữa các mã.",
    levels: [
      { range: "< 2%", state: "Biến động cực thấp", action: "Phù hợp swing dài, ít stop hit" },
      { range: "2% — 5%", state: "Biến động bình thường", action: "Trade được mọi strategy" },
      { range: "5% — 8%", state: "Biến động cao", action: "Cẩn trọng position sizing" },
      { range: "> 8%", state: "Biến động cực cao", action: "Bất ổn, có thể event-driven" },
    ],
    archetype: "volatility",
  },
  bb_width: {
    tagline: "Khoảng cách giữa BB trên và BB dưới — đo cycle biến động.",
    levels: [
      { range: "< 5%", state: "Squeeze - tích lũy", action: "Chờ breakout" },
      { range: "5% — 10%", state: "Biến động bình thường", action: "Trade theo trend" },
      { range: "10% — 15%", state: "Biến động cao", action: "Trend đang chạy" },
      { range: "> 15%", state: "Biến động cực cao", action: "Có thể đỉnh/đáy local" },
    ],
    archetype: "volatility",
  },
  bb_squeeze: {
    tagline: "Dải Bollinger thắt hẹp bất thường — báo trước biến động mạnh.",
    levels: [],
    archetype: "volatility",
  },
  bb_breakout_down: {
    tagline: "Giá phá xuống dưới Bollinger dưới — vượt khỏi vùng dao động bình thường.",
    levels: [],
    archetype: "volatility",
  },

  // volume
  vol_ma_20: {
    tagline: "Khối lượng trung bình 20 phiên — baseline để phát hiện volume spike.",
    levels: [
      { range: "Vol / MA20 > 2.0", state: "Volume spike cực mạnh", action: "Sự kiện quan trọng đang xảy ra" },
      { range: "1.5 < Vol / MA20 ≤ 2.0", state: "Volume cao", action: "Confirmation cho signal" },
      { range: "0.8 < Vol / MA20 ≤ 1.5", state: "Volume bình thường", action: "Không có tín hiệu đặc biệt" },
      { range: "Vol / MA20 < 0.8", state: "Volume thấp", action: "Thiếu interest, signal kém tin cậy" },
    ],
    archetype: "volume",
  },
  vol_zscore: {
    tagline: "Volume lệch bao nhiêu lần σ so với bình thường — phát hiện spike thống kê.",
    levels: [
      { range: "> 3σ", state: "Volume cực bất thường", action: "Sự kiện lớn, phải điều tra" },
      { range: "1.5σ — 3σ", state: "Volume spike", action: "Confirmation rất mạnh cho signal" },
      { range: "−1.5σ — 1.5σ", state: "Volume bình thường", action: "Không có gì đặc biệt" },
      { range: "< −1.5σ", state: "Volume cực thấp", action: "Mất interest, có thể setup squeeze" },
    ],
    archetype: "volume",
  },
  obv: {
    tagline: "On-Balance Volume — khối lượng cộng dồn theo hướng giá, đo dòng tiền tích lũy.",
    levels: [
      { range: "OBV > MA20 OBV và tăng", state: "Dòng tiền tích lũy", action: "Bias mua" },
      { range: "OBV < MA20 OBV và giảm", state: "Dòng tiền phân phối", action: "Bias thận trọng" },
      { range: "OBV cross lên MA20", state: "Bắt đầu accumulation", action: "Tín hiệu mua sớm" },
      { range: "OBV cross xuống MA20", state: "Bắt đầu distribution", action: "Tín hiệu thoát" },
    ],
    archetype: "volume",
  },
  obv_ma_20: {
    tagline: "Đường trung bình 20 phiên của OBV — baseline để OBV so sánh.",
    levels: [],
    archetype: "volume",
  },

  // level-breakout
  high_20: {
    tagline: "Giá cao nhất trong 20 phiên giao dịch gần nhất — kháng cự ngắn-trung hạn.",
    levels: [
      { range: "Close gần High 20 (< 1%)", state: "Test kháng cự", action: "Có thể breakout hoặc reject" },
      { range: "Close vượt High 20", state: "Breakout", action: "Tín hiệu mua mạnh nếu volume xác nhận" },
      { range: "Close cách xa High 20 (> 10%)", state: "Yếu", action: "Trong downtrend hoặc pullback sâu" },
    ],
    archetype: "level-breakout",
  },
  high_52w: {
    tagline: "Giá cao nhất trong 252 phiên (~52 tuần) gần nhất — kháng cự dài hạn.",
    levels: [
      { range: "Close gần High 52w (< 3%)", state: "Test kháng cự lớn", action: "Tâm lý thị trường rất tích cực" },
      { range: "Close vượt High 52w", state: "Breakout cấp cao", action: "Setup mua mạnh — nhiều flow theo" },
      { range: "Close cách xa High 52w", state: "Pullback hoặc downtrend", action: "Chờ recovery" },
    ],
    archetype: "level-breakout",
  },
  breakout_20d: {
    tagline: "Giá vượt qua đỉnh 20 phiên gần nhất — tín hiệu breakout ngắn-trung hạn.",
    levels: [],
    archetype: "level-breakout",
  },
  breakout_52w: {
    tagline: "Giá vượt qua đỉnh 52 tuần — tín hiệu mua mạnh cấp cao nhất.",
    levels: [],
    archetype: "level-breakout",
  },
  low_20: {
    tagline: "Giá thấp nhất trong 20 phiên giao dịch gần nhất — hỗ trợ ngắn-trung hạn.",
    levels: [
      { range: "Close gần Low 20 (< 2%)", state: "Test hỗ trợ", action: "Có thể bounce hoặc phá" },
      { range: "Close phá Low 20", state: "Breakdown", action: "Tín hiệu bán" },
      { range: "Close cách xa Low 20", state: "Mạnh trong khung 20 phiên", action: "Tốt" },
    ],
    archetype: "level-breakout",
  },
  low_52w: {
    tagline: "Giá thấp nhất trong 252 phiên (~52 tuần) gần nhất — hỗ trợ dài hạn.",
    levels: [
      { range: "Close gần Low 52w (< 5%)", state: "Test hỗ trợ lớn", action: "Cực kỳ quan trọng — bounce mạnh hoặc breakdown lớn" },
      { range: "Close phá Low 52w", state: "Breakdown cấp cao", action: "Tín hiệu bán mạnh, bear market" },
      { range: "Close cách xa Low 52w", state: "Khỏe so với đáy năm", action: "Bias tích cực" },
    ],
    archetype: "level-breakout",
  },
  breakdown_20d: {
    tagline: "Giá phá xuống đáy 20 phiên — tín hiệu bán ngắn-trung hạn.",
    levels: [],
    archetype: "level-breakout",
  },
  breakdown_52w: {
    tagline: "Giá phá xuống đáy 52 tuần — cảnh báo bear market xác lập.",
    levels: [],
    archetype: "level-breakout",
  },

  // candlestick
  hammer: {
    tagline: "Nến đảo chiều tăng — bóng dưới dài, thân nhỏ ở trên, xuất hiện sau giai đoạn giảm.",
    levels: [],
    archetype: "candlestick",
  },
  bull_engulfing: {
    tagline: "Nến xanh phủ kín nến đỏ phiên trước — tín hiệu đảo chiều tăng.",
    levels: [],
    archetype: "candlestick",
  },
  bear_engulfing: {
    tagline: "Nến đỏ phủ kín nến xanh phiên trước — tín hiệu đảo chiều giảm.",
    levels: [],
    archetype: "candlestick",
  },
  shooting_star: {
    tagline: "Nến đảo chiều giảm — bóng trên dài, thân nhỏ ở dưới, xuất hiện sau giai đoạn tăng.",
    levels: [],
    archetype: "candlestick",
  },
}

export function indicatorInfo(id: string): IndicatorInfo | null {
  return INDICATOR_INFO[id] ?? null
}
