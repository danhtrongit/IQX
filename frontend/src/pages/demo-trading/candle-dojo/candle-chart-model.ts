/** Màu và kiểu dữ liệu của biểu đồ nến Candle Dojo (tách khỏi component để tải nóng không mất trạng thái). */

export const CD_CHART_COLORS = {
  up: "#0B9A5A",
  down: "#D63939",
  ink: "#1A1410",
  ink2: "#4A3B2E",
  line: "#E3D9CC",
  red: "#C8312B",
  gold: "#D99A00",
  ema: "#2F7BF5",
} as const

/** Vùng tô quanh các nến [start, end] (chỉ số nến). */
export interface CdBand {
  start: number
  end: number
  color?: string
  opacity?: number
}

/** Nhãn tên gắn trên các nến [start, end]. */
export interface CdTag {
  start: number
  end: number
  text: string
  color?: string
}

/** Toạ độ và cỡ nến của lần vẽ hiện tại, để lớp phủ (vòng tròn, dấu chạm) vẽ đúng chỗ. */
export interface CdChartScale {
  x: (index: number) => number
  y: (price: number) => number
  barWidth: number
  width: number
  height: number
}

