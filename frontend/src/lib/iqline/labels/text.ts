/**
 * Đo và ngắt chữ cho nhãn trên biểu đồ. Thư viện không chạm DOM, nên bề rộng chữ do bên gọi truyền vào qua
 * `MeasureText` (adapter Canvas đo bằng `ctx.measureText` sau khi font đã tải). Không truyền thì dùng ước lượng.
 */

/** Bề rộng (CSS pixel) của một dòng chữ cỡ `size` px, độ đậm `weight` (mặc định 400). */
export type MeasureText = (text: string, size: number, weight?: number) => number

/**
 * Ước lượng khi chưa có số đo thật: Be Vietnam Pro trung bình khoảng 0,56em mỗi ký tự, chữ đậm rộng hơn nên
 * lấy 0,6em. Dùng trong test và trong môi trường không có Canvas.
 */
export const estimateText: MeasureText = (text, size, weight = 400) => text.length * size * (weight >= 600 ? 0.6 : 0.56)

/**
 * Tách nhãn thành các dòng vừa `maxWidth` px. Không cắt bớt chữ: dòng cuối nhận phần còn lại. Một từ dài hơn
 * `maxWidth` đứng một mình trên một dòng.
 */
export function wrapText(text: string, maxWidth: number, size = 11, maxLines = 3, measure: MeasureText = estimateText, weight = 400): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (current && measure(`${current} ${word}`, size, weight) > maxWidth) {
      lines.push(current)
      current = word
    } else current = current ? `${current} ${word}` : word
  }
  if (current) lines.push(current)
  if (lines.length <= maxLines) return lines
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")]
}

export type AxisLabel = { index: number; text: string; anchor: "start" | "middle" | "end"; at: number }

/**
 * Bỏ các nhãn trục sẽ đè lên nhau: duyệt từ trái sang phải, cách nhau `gap` px; nhãn cuối luôn được giữ, nếu nó
 * va thì bỏ nhãn đứng trước. Đường lưới do bên gọi vẽ, chỉ nhãn bị thưa đi.
 */
export function thinAxisLabels(labels: AxisLabel[], size = 10.5, gap = 6, measure: MeasureText = estimateText): AxisLabel[] {
  const span = (label: AxisLabel): [number, number] => {
    const w = measure(label.text, size)
    const l = label.anchor === "start" ? label.at : label.anchor === "end" ? label.at - w : label.at - w / 2
    return [l, l + w]
  }
  const kept: AxisLabel[] = []
  for (const label of labels) {
    const previous = kept[kept.length - 1]
    if (previous && span(label)[0] < span(previous)[1] + gap) continue
    kept.push(label)
  }
  const last = labels[labels.length - 1]
  if (last && kept[kept.length - 1] !== last) {
    while (kept.length > 0 && span(last)[0] < span(kept[kept.length - 1])[1] + gap) kept.pop()
    kept.push(last)
  }
  return kept
}
