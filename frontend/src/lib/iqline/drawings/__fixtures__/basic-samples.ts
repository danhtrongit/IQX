/**
 * Điểm neo mẫu (phiên, giá) cho 13 công cụ đợt 1, đặt sẵn cho khung vẽ 500 x 300 của `commands.test.ts` và `paint-contract.test.ts`
 * (10 pixel mỗi phiên, tâm nến ở (phiên + 0,5) x 10, y = 300 - giá). Vị thế có ba điểm neo: điểm vào, cắt lỗ, chốt lời (hai mức sau cùng thời điểm).
 */
import type { BasicTool } from "../tools-basic"

export const BASIC_SAMPLE: Record<BasicTool, [number, number][]> = {
  "long-position": [[8, 150], [30, 120], [30, 210]],
  "short-position": [[8, 150], [30, 180], [30, 90]],
  brush: [[4, 100], [7, 130], [10, 120], [13, 170], [16, 150], [19, 200], [22, 180], [25, 230]],
  arrow: [[6, 90], [24, 200]],
  "arrow-up": [[12, 120]],
  "arrow-down": [[18, 210]],
  "price-label": [[14, 160]],
  callout: [[10, 120], [20, 200]],
  "date-range": [[6, 140], [30, 170]],
  "date-price-range": [[6, 100], [30, 190]],
  ellipse: [[6, 90], [28, 200]],
  triangle: [[6, 90], [22, 220], [34, 120]],
  path: [[4, 80], [12, 160], [18, 110], [27, 210]],
}
