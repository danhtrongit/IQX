import { describe, expect, it } from "vitest"

import {
  canRecall,
  IMAGE_TEXT,
  imageBox,
  messagePreview,
  RECALLED_TEXT,
  staffPreview,
} from "./chat-preview.ts"

const image = { id: "11111111-1111-4111-8111-111111111111", w: 1600, h: 1200 }

describe("messagePreview", () => {
  it("shows text as is", () => {
    expect(messagePreview({ text: "Xin chào" })).toBe("Xin chào")
  })
  it("names image messages", () => {
    expect(messagePreview({ text: "", image })).toBe(IMAGE_TEXT)
  })
  it("hides recalled messages", () => {
    expect(messagePreview({ text: "", recalled: true })).toBe(RECALLED_TEXT)
    expect(messagePreview({ text: "còn chữ", recalled: true })).toBe(RECALLED_TEXT)
  })
})

describe("staffPreview", () => {
  it("keeps the original text of a recalled message, marked", () => {
    expect(staffPreview({ text: "Lời gốc", recalled: true })).toBe("Lời gốc (đã thu hồi)")
    expect(staffPreview({ text: "", recalled: true })).toBe(`${IMAGE_TEXT} (đã thu hồi)`)
    expect(staffPreview({ text: "", image })).toBe(IMAGE_TEXT)
    expect(staffPreview({ text: "Bình thường" })).toBe("Bình thường")
  })
})

describe("imageBox", () => {
  it("fits landscape images to 240 px wide", () => {
    expect(imageBox(1600, 1200)).toEqual({ width: 240, height: 180 })
  })
  it("fits tall images to 320 px high", () => {
    expect(imageBox(900, 1600)).toEqual({ width: 180, height: 320 })
  })
  it("never upscales and survives bad sizes", () => {
    expect(imageBox(100, 50)).toEqual({ width: 100, height: 50 })
    expect(imageBox(0, 0)).toEqual({ width: 240, height: 240 })
  })
})

describe("canRecall", () => {
  it("lets each side recall only its own sent messages", () => {
    expect(canRecall({ id: 3, from: "u" }, "user")).toBe(true)
    expect(canRecall({ id: 3, from: "s" }, "user")).toBe(false)
    expect(canRecall({ id: 3, from: "s" }, "saco")).toBe(true)
    expect(canRecall({ id: 3, from: "x" }, "saco")).toBe(false)
  })
  it("refuses recalled and not yet sent messages", () => {
    expect(canRecall({ id: 3, from: "u", recalled: true }, "user")).toBe(false)
    expect(canRecall({ id: -1, from: "u" }, "user")).toBe(false)
  })
})
