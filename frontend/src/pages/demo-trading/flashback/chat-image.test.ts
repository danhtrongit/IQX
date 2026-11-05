import { describe, expect, it, vi } from "vitest"

import {
  base64ToBlob,
  blobToBase64,
  ChatImageError,
  compressImage,
  dragHasFiles,
  fitWithin,
  IMAGE_HARD_LIMIT_BYTES,
  IMAGE_NOT_SUPPORTED,
  IMAGE_TARGET_BYTES,
  IMAGE_TOO_BIG,
  IMAGE_UNREADABLE,
  imageFromClipboard,
  imageFromDrop,
  mergeTimeline,
  type ChatImageItem,
  type ImageCodec,
} from "./chat-image"
import type { FlashbackChatMessage } from "./flashback-api"

const file = (type: string, size = 100) => new File([new Uint8Array(size)], "x", { type })

/** Bộ mã giả: dung lượng tỉ lệ với diện tích và chất lượng. */
function fakeCodec(options: { width?: number; height?: number; webp?: boolean; bytesPerPixel?: number } = {}) {
  const { width = 4000, height = 3000, webp = true, bytesPerPixel = 0.5 } = options
  const encode = vi.fn(async (_image, w: number, h: number, mime: string, quality: number) => {
    if (mime === "image/webp" && !webp) return new Blob([new Uint8Array(10)], { type: "image/png" })
    return new Blob([new Uint8Array(Math.round(w * h * quality * bytesPerPixel))], { type: mime })
  })
  const dispose = vi.fn()
  const codec: ImageCodec = {
    decode: async () => ({ width, height, source: {}, dispose }),
    encode: encode as unknown as ImageCodec["encode"],
  }
  return { codec, encode, dispose }
}

describe("nén ảnh", () => {
  it("cạnh dài tối đa 1600 px, giữ tỉ lệ, WebP, dưới 600 KB", async () => {
    const { codec, encode, dispose } = fakeCodec()
    const result = await compressImage(file("image/png"), codec)
    expect(result.mime).toBe("image/webp")
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1600)
    expect(result.width).toBe(1600)
    expect(result.height).toBe(1200)
    expect(result.blob.size).toBeLessThanOrEqual(IMAGE_TARGET_BYTES)
    expect(result.blob.type).toBe("image/webp")
    // Giảm chất lượng dần: lần đầu 0,85 rồi thấp hơn.
    const qualities = encode.mock.calls.map((call) => call[4])
    expect(qualities[0]).toBe(0.85)
    expect(qualities.at(-1)).toBeLessThan(0.85)
    expect(dispose).toHaveBeenCalled()
  })

  it("ảnh nhỏ không bị phóng to và đạt mục tiêu ngay lần đầu", async () => {
    const { codec, encode } = fakeCodec({ width: 400, height: 300 })
    const result = await compressImage(file("image/jpeg"), codec)
    expect([result.width, result.height]).toEqual([400, 300])
    expect(encode).toHaveBeenCalledTimes(1)
  })

  it("trình duyệt không mã hoá được WebP thì dùng JPEG", async () => {
    const { codec } = fakeCodec({ webp: false })
    const result = await compressImage(file("image/png"), codec)
    expect(result.mime).toBe("image/jpeg")
    expect(result.blob.type).toBe("image/jpeg")
    expect(result.blob.size).toBeLessThanOrEqual(IMAGE_TARGET_BYTES)
  })

  it("ảnh khó nén: giảm cả kích thước cho tới khi dưới mục tiêu", async () => {
    const { codec } = fakeCodec({ bytesPerPixel: 1.2 })
    const result = await compressImage(file("image/png"), codec)
    expect(result.blob.size).toBeLessThanOrEqual(IMAGE_TARGET_BYTES)
    expect(result.width).toBeLessThan(1600)
    expect(result.width / result.height).toBeCloseTo(4 / 3, 1)
  })

  it("không đạt mục tiêu 600 KB nhưng dưới trần 1,5 MB thì vẫn gửi bản nhỏ nhất", async () => {
    const codec: ImageCodec = {
      decode: async () => ({ width: 800, height: 600, source: {} }),
      encode: async (_i, _w, _h, mime) => new Blob([new Uint8Array(900_000)], { type: mime }),
    }
    const result = await compressImage(file("image/png"), codec)
    expect(result.blob.size).toBe(900_000)
  })

  it("quá trần 1,5 MB dù đã nén hết cỡ thì từ chối bằng câu tiếng Việt", async () => {
    const codec: ImageCodec = {
      decode: async () => ({ width: 800, height: 600, source: {} }),
      encode: async (_i, _w, _h, mime) => new Blob([new Uint8Array(IMAGE_HARD_LIMIT_BYTES + 1)], { type: mime }),
    }
    await expect(compressImage(file("image/png"), codec)).rejects.toMatchObject({ message: IMAGE_TOO_BIG })
  })

  it("từ chối tệp không phải ảnh, SVG, tệp quá lớn và ảnh không giải mã được", async () => {
    const { codec } = fakeCodec()
    await expect(compressImage(file("application/pdf"), codec)).rejects.toThrow(IMAGE_NOT_SUPPORTED)
    await expect(compressImage(file("image/svg+xml"), codec)).rejects.toThrow(IMAGE_NOT_SUPPORTED)
    const huge = new File([new Uint8Array(1)], "x", { type: "image/png" })
    Object.defineProperty(huge, "size", { value: 40 * 1024 * 1024 })
    await expect(compressImage(huge, codec)).rejects.toThrow(IMAGE_TOO_BIG)
    const broken: ImageCodec = { decode: async () => Promise.reject(new Error("hỏng")), encode: async () => null }
    await expect(compressImage(file("image/png"), broken)).rejects.toThrow(IMAGE_UNREADABLE)
    const empty: ImageCodec = { decode: async () => ({ width: 0, height: 0, source: {} }), encode: async () => null }
    await expect(compressImage(file("image/png"), empty)).rejects.toBeInstanceOf(ChatImageError)
  })

  it("fitWithin chỉ thu nhỏ", () => {
    expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 })
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe("base64", () => {
  it("Blob đi qua base64 và trở lại giữ nguyên byte và kiểu", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 255])
    const base64 = await blobToBase64(new Blob([bytes], { type: "image/webp" }))
    expect(base64).not.toContain("data:")
    const back = base64ToBlob(base64, "image/webp")
    expect(back.type).toBe("image/webp")
    // jsdom chưa có Blob.arrayBuffer: đọc lại bằng FileReader.
    const read = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(back)
    })
    expect(new Uint8Array(read)).toEqual(bytes)
  })
})

describe("dán và kéo thả", () => {
  const png = file("image/png")
  const items = (...list: Array<{ kind: string; type: string; file?: File }>) =>
    list.map((item) => ({ kind: item.kind, type: item.type, getAsFile: () => item.file ?? null }))

  it("dán ảnh chụp màn hình (chỉ có ảnh) thì lấy ra tệp", () => {
    expect(imageFromClipboard({ types: ["Files"], items: items({ kind: "file", type: "image/png", file: png }) })).toBe(png)
    expect(imageFromClipboard({ types: ["Files"], files: [png] })).toBe(png)
  })

  it("clipboard có chữ thì để dán chữ như thường", () => {
    expect(
      imageFromClipboard({
        types: ["text/plain", "Files"],
        items: items({ kind: "string", type: "text/plain" }, { kind: "file", type: "image/png", file: png }),
      }),
    ).toBeNull()
    expect(imageFromClipboard({ types: ["text/html"], files: [png] })).toBeNull()
  })

  it("tệp không phải ảnh hoặc clipboard trống thì null", () => {
    expect(imageFromClipboard({ types: ["Files"], files: [file("application/pdf")] })).toBeNull()
    expect(imageFromClipboard(null)).toBeNull()
    expect(imageFromClipboard({})).toBeNull()
  })

  it("thả tệp: lấy ảnh đầu tiên; nhận biết thao tác kéo có tệp", () => {
    const first = file("image/jpeg")
    expect(imageFromDrop({ files: [file("text/plain"), first, png] })).toBe(first)
    expect(imageFromDrop({ files: [file("text/plain")] })).toBeNull()
    expect(dragHasFiles({ types: ["Files"] })).toBe(true)
    expect(dragHasFiles({ types: ["text/plain"] })).toBe(false)
    expect(dragHasFiles(null)).toBe(false)
  })
})

describe("xếp ảnh xen với tin chữ", () => {
  const at = (second: number) => new Date(Date.UTC(2026, 10, 6, 10, 0, second)).toISOString()
  const message = (id: string, second: number): FlashbackChatMessage =>
    ({ id, user_id: "u", name: "n", is_me: false, waiting: true, phien: 0, text: id, created_at: at(second) }) as FlashbackChatMessage
  const image = (id: string, second: number): ChatImageItem => ({
    id,
    clientId: null,
    userId: "u",
    name: "n",
    isMe: false,
    url: `blob:${id}`,
    width: 1,
    height: 1,
    sentAt: at(second),
    status: "sent",
  })

  it("ảnh đứng đúng chỗ theo giờ gửi giữa các tin chữ", () => {
    const entries = mergeTimeline([message("m1", 10), message("m2", 30), message("m3", 50)], [image("i2", 40), image("i0", 5), image("i1", 20)])
    expect(entries.map((entry) => (entry.kind === "message" ? entry.message.id : entry.image.id))).toEqual([
      "i0",
      "m1",
      "i1",
      "m2",
      "i2",
      "m3",
    ])
  })

  it("ảnh mới nhất đứng cuối; không có tin chữ vẫn hiện ảnh theo thời gian", () => {
    const entries = mergeTimeline([message("m1", 10)], [image("late", 99)])
    expect(entries.at(-1)).toMatchObject({ kind: "image" })
    expect(mergeTimeline([], [image("b", 20), image("a", 10)]).map((entry) => entry.key)).toEqual(["image:a", "image:b"])
    expect(mergeTimeline([], [])).toEqual([])
  })

  it("giữ nguyên thứ tự tin chữ của server", () => {
    const entries = mergeTimeline([message("m2", 30), message("m1", 10)], [])
    expect(entries.map((entry) => entry.key)).toEqual(["message:m2", "message:m1"])
  })
})
