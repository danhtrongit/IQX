/** Phím tắt (§7): + - mũi tên, hoàn tác, làm lại, Esc, Delete. */
import { describe, expect, it } from "vitest"

import { createInteractionState, flashbackConfig, keyToAction, marketConfig, staticConfig } from "./index"

const market = marketConfig({ barCount: 100, defaultViewport: { from: 40, to: 100 } })
const flashback = flashbackConfig({ warmup: 20, barCount: 60, totalSlots: 100 })
const fixed = staticConfig({ barCount: 50, viewport: { from: 0, to: 50 } })
const idle = createInteractionState(market)
const withDrawing = (selectedId: string | null, tool: "trend" | null = null) => ({ ...idle, drawings: { ...idle.drawings, selectedId, tool } })

describe("phím tắt", () => {
  it("+ và = phóng to, - và _ thu nhỏ", () => {
    expect(keyToAction({ key: "+" }, market, idle)).toEqual({ type: "zoom", direction: "in" })
    expect(keyToAction({ key: "=" }, market, idle)).toEqual({ type: "zoom", direction: "in" })
    expect(keyToAction({ key: "-" }, market, idle)).toEqual({ type: "zoom", direction: "out" })
    expect(keyToAction({ key: "_", shiftKey: true }, market, idle)).toEqual({ type: "zoom", direction: "out" })
    expect(keyToAction({ key: "+" }, fixed, idle)).toBeNull()
  })

  it("mũi tên kéo 1 nến, Shift kéo 10 nến; Alt hoặc không kéo được thì di chuyển crosshair", () => {
    expect(keyToAction({ key: "ArrowLeft" }, market, idle)).toEqual({ type: "pan", bars: -1 })
    expect(keyToAction({ key: "ArrowRight", shiftKey: true }, market, idle)).toEqual({ type: "pan", bars: 10 })
    expect(keyToAction({ key: "ArrowLeft", altKey: true }, market, idle)).toEqual({ type: "move-crosshair", bars: -1 })
    expect(keyToAction({ key: "ArrowRight" }, fixed, idle)).toEqual({ type: "move-crosshair", bars: 1 })
    expect(keyToAction({ key: "ArrowUp" }, market, idle)).toBeNull()
  })

  it("Ctrl hoặc Cmd + Z hoàn tác, thêm Shift hoặc Ctrl + Y làm lại; chỉ ở market", () => {
    expect(keyToAction({ key: "z", ctrlKey: true }, market, idle)).toEqual({ type: "undo" })
    expect(keyToAction({ key: "z", metaKey: true }, market, idle)).toEqual({ type: "undo" })
    expect(keyToAction({ key: "Z", ctrlKey: true, shiftKey: true }, market, idle)).toEqual({ type: "redo" })
    expect(keyToAction({ key: "y", ctrlKey: true }, market, idle)).toEqual({ type: "redo" })
    expect(keyToAction({ key: "z", ctrlKey: true }, flashback, idle)).toBeNull()
    expect(keyToAction({ key: "s", ctrlKey: true }, market, idle)).toBeNull()
  })

  it("Esc huỷ vẽ trước, rồi bỏ chọn, rồi tắt crosshair", () => {
    expect(keyToAction({ key: "Escape" }, market, withDrawing(null, "trend"))).toEqual({ type: "drawing", action: { type: "cancel" } })
    expect(keyToAction({ key: "Escape" }, market, withDrawing("d1"))).toEqual({ type: "drawing", action: { type: "select", id: null } })
    const hovering = { ...idle, crosshair: { x: 1, y: 1, paneKey: "price", bar: 3, source: "pointer" as const } }
    expect(keyToAction({ key: "Escape" }, market, hovering)).toEqual({ type: "clear-crosshair" })
    expect(keyToAction({ key: "Escape" }, market, idle)).toBeNull()
  })

  it("Delete và Backspace xoá hình đang chọn; không có hình đang chọn hay static thì không làm gì", () => {
    expect(keyToAction({ key: "Delete" }, market, withDrawing("d3"))).toEqual({ type: "drawing", action: { type: "remove", id: "d3" } })
    expect(keyToAction({ key: "Backspace" }, market, withDrawing("d3"))).toEqual({ type: "drawing", action: { type: "remove", id: "d3" } })
    expect(keyToAction({ key: "Delete" }, market, idle)).toBeNull()
    expect(keyToAction({ key: "Delete" }, fixed, withDrawing("d3"))).toBeNull()
  })
})
