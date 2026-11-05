/**
 * Điểm neo mẫu (phiên, giá) cho chín công cụ đợt 2, đặt sẵn cho khung vẽ 500 x 300 của `commands.test.ts` và `paint-contract.test.ts`
 * (10 pixel mỗi phiên, tâm nến ở (phiên + 0,5) x 10, y = 300 - giá). Dùng chung để các test lặp qua `ALL_TOOLS` có đủ dữ liệu.
 */
import type { AdvancedTool } from "../tools-advanced"

export const ADVANCED_SAMPLE: Record<AdvancedTool, [number, number][]> = {
  "fib-time-zones": [[3, 120], [6, 160]],
  "fib-fan": [[5, 100], [30, 200]],
  "fib-channel": [[5, 100], [30, 150], [15, 200]],
  pitchfork: [[5, 100], [15, 200], [25, 120]],
  "gann-fan": [[5, 100], [15, 150]],
  "gann-box": [[8, 90], [30, 210]],
  // Gartley: AB = 0,618 XA, BC = 0,838 AB, CD = 1,324 BC, AD = 0,786 XA.
  xabcd: [[4, 100], [12, 200], [20, 138.2], [28, 190], [38, 121.4]],
  "head-shoulders": [[2, 100], [8, 170], [13, 130], [22, 220], [31, 128], [37, 175], [44, 110]],
  "triangle-pattern": [[3, 250], [9, 60], [22, 190], [28, 110]],
}
