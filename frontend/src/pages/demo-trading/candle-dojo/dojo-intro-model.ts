/** Nhập môn "Giải phẫu cây nến" (spec v1.2 §5.2): hình học của cây nến lớn và bốn câu chạm (cổng từ `introAnat`). */

export type AnatomyPart = "upper" | "body" | "lower" | "close"

export const ANATOMY_VIEWBOX = { width: 360, height: 300 } as const

const CENTER = 180
/** Giá trị 0 đến 100 đổi sang toạ độ dọc của khung vẽ. */
const Y = (value: number) => 20 + ((100 - value) / 100) * 260

export type Rect = { x: number; y: number; width: number; height: number }

export const CANDLE = {
  center: CENTER,
  wickTop: Y(90),
  wickBottom: Y(8),
  bodyTop: Y(66),
  bodyBottom: Y(34),
  bodyWidth: 60,
  openY: Y(34),
  closeY: Y(66),
} as const

/** Vùng của từng phần: bóng trên, thân, bóng dưới và đường giá đóng cửa ở đỉnh thân (nến xanh). */
export const ANATOMY_ZONES: Record<AnatomyPart, Rect> = {
  upper: { x: CENTER - 14, y: Y(90), width: 28, height: Y(66) - Y(90) },
  body: { x: CENTER - 30, y: Y(66), width: 60, height: Y(34) - Y(66) },
  lower: { x: CENTER - 14, y: Y(34), width: 28, height: Y(8) - Y(34) },
  close: { x: CENTER - 40, y: Y(66) - 10, width: 80, height: 20 },
}

export const ANATOMY_QUESTIONS: readonly { part: AnatomyPart; prompt: string; explain: string; name: string }[] = [
  { part: "upper", prompt: "Chạm vào bóng trên", explain: "Bóng trên: giá cao nhất phiên", name: "Bóng trên" },
  { part: "body", prompt: "Chạm vào thân nến", explain: "Thân: từ giá mở đến giá đóng", name: "Thân nến" },
  { part: "lower", prompt: "Chạm vào bóng dưới", explain: "Bóng dưới: giá thấp nhất phiên", name: "Bóng dưới" },
  { part: "close", prompt: "Nến xanh: chạm vào giá đóng cửa", explain: "Nến xanh đóng ở đỉnh thân", name: "Giá đóng cửa" },
]

/** Điểm (x, y) trong khung vẽ có nằm trong vùng của `part` không (nới 10 ngang, 6 dọc cho ngón tay). */
export function hitsAnatomyPart(part: AnatomyPart, x: number, y: number): boolean {
  const zone = ANATOMY_ZONES[part]
  return x >= zone.x - 10 && x <= zone.x + zone.width + 10 && y >= zone.y - 6 && y <= zone.y + zone.height + 6
}
