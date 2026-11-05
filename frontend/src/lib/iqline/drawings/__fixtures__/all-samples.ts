/**
 * Điểm neo mẫu (phiên, giá) cho cả 36 công cụ, theo khung 500 x 300 của các fixture khác (10 pixel mỗi phiên, giá 0 đến 300, phiên 0 đến 49).
 * 23 công cụ đầu là bản sao của `paint-contract.test.ts`; đợt 1 và đợt 2 dùng lại fixture riêng của từng đợt.
 */
import type { DrawingTool } from "../../types"
import { ADVANCED_SAMPLE } from "./advanced-samples"
import { BASIC_SAMPLE } from "./basic-samples"

export const ALL_SAMPLES: Readonly<Record<DrawingTool, readonly (readonly [number, number])[]>> = {
  trend: [[5, 100], [30, 200]],
  ray: [[5, 100], [30, 200]],
  extended: [[5, 100], [30, 200]],
  horizontal: [[10, 150]],
  "horizontal-ray": [[10, 150]],
  vertical: [[10, 150]],
  channel: [[5, 100], [30, 150], [15, 200]],
  "fib-retracement": [[5, 100], [30, 200]],
  "fib-extension": [[5, 100], [20, 200], [30, 150]],
  rectangle: [[5, 100], [30, 200]],
  "elliott-5": [[2, 100], [8, 160], [12, 130], [22, 220], [28, 180], [40, 260]],
  "elliott-abc": [[2, 100], [10, 220], [18, 160], [30, 250]],
  note: [[10, 150]],
  measure: [[5, 100], [30, 200]],
  ...ADVANCED_SAMPLE,
  ...BASIC_SAMPLE,
}
