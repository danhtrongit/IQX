/**
 * The "Chia sẻ quẻ" picture: a 1080x1350 portrait card drawn by hand on a canvas (dark red and gold,
 * like the shrine window) plus the caption that goes with it. The text helpers are pure and take a
 * `measure(text) => width` callback so they run without a canvas.
 */
import type { ThanTaiDay, ThanTaiLa } from "../../net/types.ts"
import { HANG_META, hexLines } from "../../than-tai.ts"

export const SHARE_URL = "https://iqx.vn/khu-giao-dich"
export const SHARE_W = 1080
export const SHARE_H = 1350

const ELLIPSIS = "…"

export type Measure = (text: string) => number

// ---------- pure text helpers ----------

/** `Quẻ hôm nay của tôi: {quẻ} ({hạng}). {lời chốt} Gieo quẻ tại {url}` */
export function buildCaption(
  la: Pick<ThanTaiLa, "hang" | "chot"> & { que: Pick<ThanTaiLa["que"], "ten"> }
): string {
  return `Quẻ hôm nay của tôi: ${la.que.ten} (${HANG_META[la.hang].label}). ${la.chot} Gieo quẻ tại ${SHARE_URL}`
}

/** Cuts `word` into pieces that each fit `maxWidth` (a word wider than a line, never an empty piece). */
function splitLongWord(
  word: string,
  maxWidth: number,
  measure: Measure
): string[] {
  const parts: string[] = []
  let current = ""
  for (const ch of Array.from(word)) {
    if (current && measure(current + ch) > maxWidth) {
      parts.push(current)
      current = ch
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)
  return parts
}

/** Greedy word wrap. Blank lines in the text stay as empty lines; over-wide words are cut. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: Measure
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push("")
      continue
    }
    let line = ""
    for (const word of words) {
      const pieces =
        measure(word) > maxWidth
          ? splitLongWord(word, maxWidth, measure)
          : [word]
      for (const piece of pieces) {
        const candidate = line ? `${line} ${piece}` : piece
        if (!line || measure(candidate) <= maxWidth) {
          line = candidate
        } else {
          lines.push(line)
          line = piece
        }
      }
    }
    lines.push(line)
  }
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop()
  return lines
}

/** Keeps at most `maxLines` lines; the last kept line ends with "…" and still fits `maxWidth`. */
export function clampLines(
  lines: readonly string[],
  maxLines: number,
  maxWidth: number,
  measure: Measure
): string[] {
  if (maxLines <= 0) return []
  if (lines.length <= maxLines) return [...lines]
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1].trimEnd()
  while (last && measure(last + ELLIPSIS) > maxWidth) {
    last = Array.from(last).slice(0, -1).join("").trimEnd()
  }
  kept[maxLines - 1] = last + ELLIPSIS
  return kept
}

/** Wraps `text` and clamps it to `maxLines` with an ellipsis. */
export function wrapClamp(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: Measure
): string[] {
  return clampLines(
    wrapText(text, maxWidth, measure),
    maxLines,
    maxWidth,
    measure
  )
}

// ---------- canvas drawing ----------

const SERIF = `"Noto Serif", Georgia, "Times New Roman", serif`
const HAN = `"Noto Serif", "Noto Serif CJK SC", "Songti SC", "PingFang SC", "Microsoft YaHei", serif`
const SANS = `"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

const GOLD = "#f2c14e"
const GOLD_DARK = "#a8770f"
const INK = "#fdf4dc"
const INK2 = "#e9d7a8"
const INK3 = "#b89a62"

async function fontsReady(): Promise<void> {
  try {
    await document.fonts.ready
    await Promise.all([
      document.fonts.load(`800 64px "Noto Serif"`),
      document.fonts.load(`500 32px "Be Vietnam Pro"`),
    ])
  } catch {
    // Fonts unavailable: the fallbacks in the stacks above draw instead.
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  y: number,
  lineHeight: number
): void {
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight))
}

function drawHexagram(
  ctx: CanvasRenderingContext2D,
  hao: string,
  moving: number,
  cx: number,
  top: number
): number {
  const lineH = 18
  const gap = 12
  const width = 300
  const yinW = 132
  const lines = hexLines(hao)
  lines.forEach((yang, i) => {
    const y = top + (5 - i) * (lineH + gap)
    const isMoving = i + 1 === moving
    ctx.fillStyle = isMoving ? "#e23b3b" : GOLD
    const x = cx - width / 2
    if (yang) {
      roundRect(ctx, x, y, width, lineH, 4)
      ctx.fill()
    } else {
      roundRect(ctx, x, y, yinW, lineH, 4)
      ctx.fill()
      roundRect(ctx, x + width - yinW, y, yinW, lineH, 4)
      ctx.fill()
    }
    if (isMoving) {
      ctx.strokeStyle = "#e23b3b"
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(x + width + 28, y + lineH / 2, 10, 0, Math.PI * 2)
      ctx.stroke()
    }
  })
  return top + 6 * lineH + 5 * gap
}

/** Draws the share card and returns it as a PNG. Waits for the web fonts first. */
export async function renderShareImage(
  la: ThanTaiLa,
  day: ThanTaiDay
): Promise<Blob> {
  await fontsReady()
  const canvas = document.createElement("canvas")
  canvas.width = SHARE_W
  canvas.height = SHARE_H
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D is not available")
  const hang = HANG_META[la.hang]
  const cx = SHARE_W / 2
  const measure: Measure = (text) => ctx.measureText(text).width

  // Background and double gold frame.
  const bg = ctx.createLinearGradient(0, 0, 0, SHARE_H)
  bg.addColorStop(0, "#6d1111")
  bg.addColorStop(0.55, "#3d0808")
  bg.addColorStop(1, "#170404")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SHARE_W, SHARE_H)
  const glow = ctx.createRadialGradient(cx, 330, 40, cx, 330, 620)
  glow.addColorStop(0, "rgba(242, 193, 78, 0.22)")
  glow.addColorStop(1, "rgba(242, 193, 78, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, SHARE_W, SHARE_H)
  ctx.strokeStyle = GOLD_DARK
  ctx.lineWidth = 6
  roundRect(ctx, 28, 28, SHARE_W - 56, SHARE_H - 56, 34)
  ctx.stroke()
  ctx.strokeStyle = "rgba(242, 193, 78, 0.45)"
  ctx.lineWidth = 2
  roundRect(ctx, 46, 46, SHARE_W - 92, SHARE_H - 92, 24)
  ctx.stroke()

  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"

  // Brand and day line.
  ctx.fillStyle = GOLD
  ctx.font = `800 40px ${SERIF}`
  ctx.fillText("IQX · Khu Giao Dịch", cx, 126)
  ctx.fillStyle = INK2
  ctx.font = `500 31px ${SANS}`
  ctx.fillText(`Ngày ${day.canChi} · hành ${day.hanhLabel}`, cx, 180)

  // Rank pill.
  ctx.font = `800 30px ${SANS}`
  const pillW = Math.max(190, measure(hang.label) + 72)
  ctx.fillStyle = hang.color
  roundRect(ctx, cx - pillW / 2, 212, pillW, 58, 29)
  ctx.fill()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = "#fff3c4"
  ctx.fillText(hang.label, cx, 252)

  // Han characters and quẻ name.
  ctx.fillStyle = GOLD
  ctx.font = `800 132px ${HAN}`
  ctx.fillText(la.que.chuHan, cx, 410)
  ctx.fillStyle = "#fff3c4"
  ctx.font = `800 62px ${SERIF}`
  const nameLines = wrapClamp(la.que.ten, 900, 2, measure)
  drawLines(ctx, nameLines, cx, 490, 70)
  const hexTop = 490 + (nameLines.length - 1) * 70 + 40
  const hexBottom = drawHexagram(ctx, la.que.hao, la.haoDong.so, cx, hexTop)

  // Lời thầy chốt, anchored at the bottom; Thầy luận fills what is left above it.
  const textW = 860
  ctx.font = `800 40px ${SERIF}`
  const chotLines = wrapClamp(la.chot, textW, 3, measure)
  const chotLineH = 54
  const chotTop = 1236 - chotLines.length * chotLineH - 44
  const luanTitleY = hexBottom + 78
  const luanTop = luanTitleY + 52
  ctx.font = `500 33px ${SANS}`
  const luanLineH = 50
  const luanRoom = chotTop - 40 - luanTop
  const luanLines = wrapClamp(
    la.luan,
    textW,
    Math.max(1, Math.floor(luanRoom / luanLineH)),
    measure
  )

  ctx.fillStyle = GOLD
  ctx.font = `800 28px ${SANS}`
  ctx.fillText("THẦY LUẬN", cx, luanTitleY)
  ctx.fillStyle = INK
  ctx.font = `500 33px ${SANS}`
  drawLines(ctx, luanLines, cx, luanTop, luanLineH)

  ctx.strokeStyle = "rgba(242, 193, 78, 0.5)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 300, chotTop - 18)
  ctx.lineTo(cx + 300, chotTop - 18)
  ctx.stroke()
  ctx.fillStyle = INK3
  ctx.font = `800 24px ${SANS}`
  ctx.fillText("LỜI THẦY CHỐT", cx, chotTop + 14)
  ctx.fillStyle = "#ffe08a"
  ctx.font = `800 40px ${SERIF}`
  drawLines(ctx, chotLines, cx, chotTop + 66, chotLineH)

  // Footer.
  ctx.fillStyle = INK3
  ctx.font = `500 27px ${SANS}`
  ctx.fillText("Gieo quẻ đầu phiên tại iqx.vn/khu-giao-dich", cx, 1292)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Canvas could not make a PNG"))
    }, "image/png")
  })
}
