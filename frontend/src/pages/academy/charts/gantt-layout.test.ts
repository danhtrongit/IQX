import { describe, expect, it } from "vitest"

import { fitColumnHeaders, layoutPills } from "./gantt-layout"

const WEEK = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật", "Thứ Hai"]

describe("gantt layout", () => {
  it("keeps column headers on one line at full size when the columns are wide", () => {
    const { size, lines } = fitColumnHeaders(WEEK, 80)
    expect(size).toBe(10.5)
    expect(lines.every((group) => group.length === 1)).toBe(true)
  })

  it.each([23, 26, 33, 40])("wraps, then shrinks, headers so each line fits a %ipx column", (columnWidth) => {
    const { size, lines } = fitColumnHeaders(WEEK, columnWidth)
    expect(size).toBeGreaterThanOrEqual(8)
    expect(size).toBeLessThanOrEqual(10.5)
    for (const group of lines) {
      expect(group.length).toBeLessThanOrEqual(2)
      for (const line of group) expect(line.length * size * 0.66).toBeLessThanOrEqual(columnWidth)
    }
    // Nothing is dropped: the lines of a header join back to its label.
    expect(lines.map((group) => group.join(" "))).toEqual(WEEK)
  })

  it("pushes neighbouring pills apart and keeps them inside the plot", () => {
    const at = (v: number) => v * 10
    const boxes = layoutPills(
      [
        { at: 0.2, text: "T", tone: "pos" },
        { at: 1, text: "T+2.5", tone: "p1" },
        { at: 11.9, text: "T+2", tone: "warn" },
      ],
      at,
      0,
      120,
    )
    expect(boxes[0].x).toBeGreaterThanOrEqual(0)
    for (let index = 1; index < boxes.length; index += 1) expect(boxes[index].x).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].w)
    const last = boxes[boxes.length - 1]
    expect(last.x + last.w).toBeLessThanOrEqual(120)
  })
})
