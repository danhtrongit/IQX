/** Nhóm chỉ báo theo cách dùng cho hộp thoại thêm chỉ báo. Tách khỏi component để file component chỉ export component. */

/** Nhóm theo cách dùng (không phải nơi vẽ): danh sách 40 chỉ báo cần chia theo mục đích mới tìm được. */
export const INDICATOR_CATEGORIES = [
  { id: "trend", label: "Xu hướng và đường trung bình" },
  { id: "momentum", label: "Động lượng và dao động" },
  { id: "volatility", label: "Biến động và kênh giá" },
  { id: "volume", label: "Khối lượng và dòng tiền" },
  { id: "levels", label: "Mức giá" },
  { id: "other", label: "Khác" },
] as const
export type IndicatorCategoryId = (typeof INDICATOR_CATEGORIES)[number]["id"]

const CATEGORY_IDS: Readonly<Record<IndicatorCategoryId, readonly string[]>> = {
  trend: ["ma", "ema", "wma", "hma", "vwma", "ma_cross", "vwap", "ichimoku", "supertrend", "psar", "adx", "dmi", "aroon"],
  momentum: ["rsi", "macd", "stochastic", "cci", "roc", "williams_r", "momentum", "trix", "ultimate_oscillator", "awesome_oscillator"],
  volatility: ["bollinger", "bb_width", "donchian", "keltner", "envelope", "atr", "atr_percent", "std_dev", "volatility_ohlc"],
  volume: ["volume", "obv", "mfi", "cmf", "accum_dist", "relative_volume", "volume_profile"],
  levels: ["pivot_points"],
  other: [],
}

/** Nhóm của một chỉ báo; chỉ báo đăng ký thêm bằng code mà chưa có trong bảng rơi vào "Khác". */
export function categoryOf(id: string): IndicatorCategoryId {
  for (const category of INDICATOR_CATEGORIES) if (CATEGORY_IDS[category.id].includes(id)) return category.id
  return "other"
}
