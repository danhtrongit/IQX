/**
 * Procedural North Back Wall props for Open-Floor Khu Văn phòng:
 * - Grand LED-style Team Board ("IQX · {Tên nhóm}" + live monthly Top 3 / KPI strip)
 * - Stock-Ticker LED Ribbon (VNINDEX / VN30 / IQX glowing ribbon)
 * - Panoramic City-Skyline Window Strips with sunlit glass & soft floor pools
 * - 3 World Market Wall Clocks (Hà Nội · Tokyo · New York)
 * - Hanging Pendant Lamp silhouettes near the back wall (ceiling-less open look)
 * - Framed Corporate Wall Art prints
 */
import * as THREE from "three"

import { safeGet2DContext } from "@/lib/chibi-3d/textures.ts"
import type { OfficeStandeeEntry } from "@/lib/chibi-3d/types.ts"

import {
  OFFICE_DECOR_FONT_STACK,
  createDecorCanvasTexture,
  type OfficeDecorBatcher,
  type OfficeDecorPalette,
} from "./palette.ts"

export interface TeamBoardDrawPayload {
  teamTitle: string
  monthLabel: string
  top3: readonly OfficeStandeeEntry[]
  totalRanked?: number
}

/** Paints the grand LED-style Team Board ("IQX · {Tên nhóm}" + live Top 3 / KPI strip). */
export function drawTeamLedBoard(
  canvas: HTMLCanvasElement,
  payload: TeamBoardDrawPayload
): void {
  if (canvas.width <= 0) canvas.width = 1024
  if (canvas.height <= 0) canvas.height = 320
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height

  // Deep executive LED matrix backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, "#0c1730")
  bg.addColorStop(0.55, "#112042")
  bg.addColorStop(1, "#091124")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Subtle LED matrix grid sheen
  ctx.fillStyle = "rgba(148, 197, 255, 0.035)"
  for (let y = 16; y < h; y += 14) {
    ctx.fillRect(0, y, w, 1)
  }

  // Brushed gold double border
  ctx.strokeStyle = "#e9b949"
  ctx.lineWidth = 5
  ctx.strokeRect(8, 8, w - 16, h - 16)
  ctx.strokeStyle = "rgba(246, 210, 122, 0.35)"
  ctx.lineWidth = 2
  ctx.strokeRect(18, 18, w - 36, h - 36)

  // Header band: glowing IQX badge + Team Name + Month pill
  const headerGrad = ctx.createLinearGradient(22, 22, w - 22, 22)
  headerGrad.addColorStop(0, "rgba(233, 185, 73, 0.22)")
  headerGrad.addColorStop(0.5, "rgba(233, 185, 73, 0.08)")
  headerGrad.addColorStop(1, "rgba(52, 211, 153, 0.14)")
  ctx.fillStyle = headerGrad
  ctx.fillRect(22, 22, w - 44, 78)

  ctx.textBaseline = "middle"
  ctx.textAlign = "left"

  // Live green status dot
  ctx.fillStyle = "#34d399"
  ctx.beginPath()
  ctx.arc(54, 61, 8, 0, Math.PI * 2)
  ctx.fill()

  // Main Team Sign Title ("IQX · {TÊN NHÓM}")
  const title = payload.teamTitle || "IQX · VĂN PHÒNG"
  const maxTitleW = w - 310
  let fontSize = 40
  ctx.font = `900 ${fontSize}px ${OFFICE_DECOR_FONT_STACK}`
  while (fontSize > 22 && ctx.measureText(title).width > maxTitleW) {
    fontSize -= 2
    ctx.font = `900 ${fontSize}px ${OFFICE_DECOR_FONT_STACK}`
  }
  ctx.fillStyle = "#f6d27a"
  ctx.fillText(title, 78, 62, maxTitleW)

  // Right-side month badge
  ctx.textAlign = "right"
  ctx.fillStyle = "#c9d6e4"
  ctx.font = `700 20px ${OFFICE_DECOR_FONT_STACK}`
  ctx.fillText(payload.monthLabel.toUpperCase(), w - 42, 62)

  // Horizontal gold rule
  ctx.fillStyle = "rgba(233, 185, 73, 0.45)"
  ctx.fillRect(26, 106, w - 52, 2)

  // Body: Left 62% = Monthly Top 3 Leaderboard strip; Right 38% = KPI Progress / Rhythm panel
  const hasTop = payload.top3.length > 0
  const leftX = 36
  const leftW = 588

  ctx.textAlign = "left"
  ctx.fillStyle = "#94b8e8"
  ctx.font = `800 17px ${OFFICE_DECOR_FONT_STACK}`
  ctx.fillText(
    hasTop ? "BẢNG XẾP HẠNG THÁNG · TOP 3" : "MỤC TIÊU THÁNG · KPI NHÓM",
    leftX,
    134
  )

  if (hasTop) {
    const badgeColors: Record<1 | 2 | 3, { bg: string; text: string; bar: string }> = {
      1: { bg: "#f6d27a", text: "#2a1c00", bar: "#e9b949" },
      2: { bg: "#cbd5e1", text: "#0f172a", bar: "#94a3b8" },
      3: { bg: "#d69462", text: "#261205", bar: "#c97e48" },
    }
    const maxPts = Math.max(1, payload.top3[0]?.points ?? 100)
    for (let i = 0; i < Math.min(3, payload.top3.length); i += 1) {
      const entry = payload.top3[i]!
      const rowY = 156 + i * 48
      const sty = badgeColors[entry.rank]

      // Row card
      ctx.fillStyle = "rgba(27, 45, 82, 0.78)"
      ctx.fillRect(leftX, rowY, leftW, 40)

      // Rank pill
      ctx.fillStyle = sty.bg
      ctx.fillRect(leftX + 6, rowY + 6, 40, 28)
      ctx.fillStyle = sty.text
      ctx.textAlign = "center"
      ctx.font = `900 18px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(`#${entry.rank}`, leftX + 26, rowY + 21)

      // Name
      ctx.textAlign = "left"
      ctx.fillStyle = "#f1f5f9"
      ctx.font = `700 20px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(entry.name, leftX + 60, rowY + 21, 290)

      // Mini progress bar
      const barX = leftX + 360
      const barW = 115
      const frac = Math.max(0.16, Math.min(1, entry.points / maxPts))
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)"
      ctx.fillRect(barX, rowY + 14, barW, 12)
      ctx.fillStyle = sty.bar
      ctx.fillRect(barX, rowY + 14, Math.round(barW * frac), 12)

      // Points
      ctx.textAlign = "right"
      ctx.fillStyle = "#f6d27a"
      ctx.font = `800 20px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(`${entry.points} đ`, leftX + leftW - 14, rowY + 21)
    }
  } else {
    // Crisp decorative KPI strip when no monthly scores exist yet
    const kpis = [
      { label: "KỶ LUẬT · ĐÚNG GIỜ", pct: 0.92, color: "#34d399", tag: "08:30" },
      { label: "TỐC ĐỘ XỬ LÝ NHIỆM VỤ", pct: 0.84, color: "#60a5fa", tag: "KPI" },
      { label: "TĂNG TRƯỞNG DANH MỤC", pct: 0.78, color: "#f6d27a", tag: "IQX" },
    ]
    kpis.forEach((item, idx) => {
      const rowY = 156 + idx * 48
      ctx.fillStyle = "rgba(27, 45, 82, 0.72)"
      ctx.fillRect(leftX, rowY, leftW, 38)
      ctx.fillStyle = "#f1f5f9"
      ctx.font = `700 18px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(item.label, leftX + 14, rowY + 19, 270)

      const barX = leftX + 300
      const barW = 195
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)"
      ctx.fillRect(barX, rowY + 13, barW, 12)
      ctx.fillStyle = item.color
      ctx.fillRect(barX, rowY + 13, Math.round(barW * item.pct), 12)

      ctx.textAlign = "right"
      ctx.fillStyle = item.color
      ctx.font = `800 16px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(item.tag, leftX + leftW - 14, rowY + 19)
      ctx.textAlign = "left"
    })
  }

  // Right column: stylized upward candlestick KPI chart card
  const rx = 648
  const rw = w - rx - 34
  ctx.fillStyle = "rgba(15, 27, 54, 0.86)"
  ctx.fillRect(rx, 120, rw, 174)
  ctx.strokeStyle = "rgba(233, 185, 73, 0.32)"
  ctx.lineWidth = 2
  ctx.strokeRect(rx, 120, rw, 174)

  ctx.textAlign = "left"
  ctx.fillStyle = "#34d399"
  ctx.font = `800 16px ${OFFICE_DECOR_FONT_STACK}`
  ctx.fillText("HIỆU SUẤT NHÓM", rx + 16, 144)

  // Stylized candlesticks + trend line
  const candles = [
    { x: 24, o: 120, c: 96, hi: 86, lo: 132, up: true },
    { x: 64, o: 98, c: 112, hi: 88, lo: 124, up: false },
    { x: 104, o: 110, c: 82, hi: 74, lo: 118, up: true },
    { x: 144, o: 84, c: 64, hi: 54, lo: 92, up: true },
    { x: 184, o: 68, c: 76, hi: 58, lo: 88, up: false },
    { x: 224, o: 74, c: 46, hi: 36, lo: 82, up: true },
    { x: 264, o: 48, c: 28, hi: 18, lo: 56, up: true },
  ]
  const chartBaseY = 152
  for (const c of candles) {
    const cx = rx + c.x + 12
    ctx.strokeStyle = c.up ? "#34d399" : "#f87171"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx, chartBaseY + c.hi)
    ctx.lineTo(cx, chartBaseY + c.lo)
    ctx.stroke()

    ctx.fillStyle = c.up ? "#34d399" : "#f87171"
    const top = Math.min(c.o, c.c)
    const bodyH = Math.max(8, Math.abs(c.o - c.c))
    ctx.fillRect(cx - 9, chartBaseY + top, 18, bodyH)
  }

  ctx.strokeStyle = "#f6d27a"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(rx + 28, chartBaseY + 114)
  ctx.lineTo(rx + 116, chartBaseY + 90)
  ctx.lineTo(rx + 196, chartBaseY + 68)
  ctx.lineTo(rx + 278, chartBaseY + 34)
  ctx.stroke()
}

/** Creates a static crisp stock-ticker LED ribbon texture (1024x48, zero per-frame work). */
export function createOfficeStockTickerTexture(lite: boolean): THREE.Texture {
  return createDecorCanvasTexture(
    lite ? 512 : 1024,
    48,
    (ctx, w, h) => {
      ctx.fillStyle = "#080d18"
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = "rgba(233, 185, 73, 0.55)"
      ctx.fillRect(0, 0, w, 2)
      ctx.fillRect(0, h - 2, w, 2)

      const items = [
        { code: "VNINDEX", val: "1,697.14", pct: "+0.49%", color: "#34d399" },
        { code: "VN30", val: "1,791.12", pct: "+0.62%", color: "#34d399" },
        { code: "FPT", val: "148.5", pct: "+1.8%", color: "#34d399" },
        { code: "VCB", val: "94.2", pct: "+0.7%", color: "#34d399" },
        { code: "SSI", val: "31.4", pct: "+1.2%", color: "#34d399" },
        { code: "HPG", val: "28.9", pct: "-0.3%", color: "#f87171" },
        { code: "IQX SACO", val: "ONLINE", pct: "KPI", color: "#f6d27a" },
      ]

      const scale = w / 1024
      ctx.textBaseline = "middle"
      ctx.textAlign = "left"
      let x = Math.round(16 * scale)
      const cy = h / 2 + 1

      for (const item of items) {
        if (x > w - 40) break
        ctx.font = `800 ${Math.round(17 * scale)}px ${OFFICE_DECOR_FONT_STACK}`
        ctx.fillStyle = "#f1f5f9"
        ctx.fillText(item.code, x, cy)
        x += ctx.measureText(item.code).width + Math.round(7 * scale)

        ctx.font = `700 ${Math.round(16 * scale)}px ${OFFICE_DECOR_FONT_STACK}`
        ctx.fillStyle = item.color
        const str = `${item.val} ${item.pct}`
        ctx.fillText(str, x, cy)
        x += ctx.measureText(str).width + Math.round(14 * scale)

        ctx.fillStyle = "rgba(233, 185, 73, 0.45)"
        ctx.fillRect(x, 12, 2, h - 24)
        x += Math.round(14 * scale)
      }
    },
    lite ? 2 : 6
  )
}

/** Creates a sunlit panoramic city-skyline window canvas texture (512x256). */
export function createCitySkylineTexture(lite: boolean): THREE.Texture {
  return createDecorCanvasTexture(
    lite ? 256 : 512,
    lite ? 128 : 256,
    (ctx, w, h) => {
      // Crisp sunlit blue-to-warm-horizon sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, "#7ec4f8")
      sky.addColorStop(0.52, "#bae0ff")
      sky.addColorStop(0.84, "#fce9cb")
      sky.addColorStop(1, "#f7d7a8")
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      // Soft warm sun disc & atmospheric glow
      const sunGrad = ctx.createRadialGradient(
        w * 0.78,
        h * 0.28,
        w * 0.02,
        w * 0.78,
        h * 0.28,
        w * 0.24
      )
      sunGrad.addColorStop(0, "rgba(255, 250, 224, 0.95)")
      sunGrad.addColorStop(0.4, "rgba(255, 236, 179, 0.42)")
      sunGrad.addColorStop(1, "rgba(255, 236, 179, 0)")
      ctx.fillStyle = sunGrad
      ctx.fillRect(0, 0, w, h)

      // Fluffy chibi stylized clouds
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)"
      const drawCloud = (cx: number, cy: number, s: number): void => {
        ctx.beginPath()
        ctx.arc(cx, cy, 18 * s, 0, Math.PI * 2)
        ctx.arc(cx + 18 * s, cy - 5 * s, 22 * s, 0, Math.PI * 2)
        ctx.arc(cx + 38 * s, cy, 16 * s, 0, Math.PI * 2)
        ctx.fill()
      }
      drawCloud(w * 0.14, h * 0.24, w / 512)
      drawCloud(w * 0.48, h * 0.19, (w / 512) * 0.85)

      // Far misty city silhouette layer
      ctx.fillStyle = "#8ba8cc"
      const farTowers: readonly [number, number, number][] = [
        [0.02, 0.08, 0.36],
        [0.11, 0.07, 0.48],
        [0.2, 0.09, 0.4],
        [0.31, 0.06, 0.56],
        [0.4, 0.1, 0.42],
        [0.52, 0.07, 0.62],
        [0.62, 0.09, 0.46],
        [0.74, 0.08, 0.5],
        [0.85, 0.12, 0.38],
      ]
      for (const [fx, fw, fh] of farTowers) {
        const bx = fx * w
        const bw = fw * w
        const bh = fh * h
        ctx.fillRect(bx, h - bh, bw, bh)
      }

      // Iconic tapered landmark spire in mid-distance
      ctx.fillStyle = "#5f7fa8"
      const lx = w * 0.54
      ctx.fillRect(lx - w * 0.026, h * 0.32, w * 0.052, h * 0.68)
      ctx.fillRect(lx - w * 0.017, h * 0.22, w * 0.034, h * 0.14)
      ctx.fillRect(lx - w * 0.008, h * 0.14, w * 0.016, h * 0.1)
      ctx.fillRect(lx - 1.5, h * 0.08, 3, h * 0.08)

      // Foreground stylized modern financial towers with sunlit window bands
      const frontTowers: readonly [number, number, number, string][] = [
        [0.0, 0.09, 0.34, "#4b6891"],
        [0.14, 0.11, 0.44, "#3b567d"],
        [0.28, 0.08, 0.36, "#4f6d96"],
        [0.38, 0.1, 0.48, "#334d73"],
        [0.64, 0.11, 0.42, "#3f5b84"],
        [0.78, 0.09, 0.36, "#4c6a92"],
        [0.89, 0.11, 0.46, "#375178"],
      ]
      for (const [fx, fw, fh, col] of frontTowers) {
        const bx = fx * w
        const bw = fw * w
        const bh = fh * h
        const by = h - bh
        ctx.fillStyle = col
        ctx.fillRect(bx, by, bw, bh)
        // Warm sunlit glass highlight strip on right edge
        ctx.fillStyle = "rgba(255, 240, 198, 0.28)"
        ctx.fillRect(bx + bw - Math.max(3, bw * 0.14), by, Math.max(3, bw * 0.14), bh)
        // Crisp horizontal window bands
        ctx.fillStyle = "rgba(218, 240, 255, 0.45)"
        const step = Math.max(8, h * 0.055)
        for (let wy = by + step; wy < h - 6; wy += step) {
          ctx.fillRect(bx + 4, wy, bw - 10, Math.max(2, step * 0.34))
        }
      }

      // Soft diagonal glass sheen reflection
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)"
      ctx.beginPath()
      ctx.moveTo(w * 0.08, 0)
      ctx.lineTo(w * 0.24, 0)
      ctx.lineTo(w * 0.08, h)
      ctx.lineTo(0, h)
      ctx.closePath()
      ctx.fill()
    },
    lite ? 2 : 6
  )
}

/** Creates a crisp round wall-clock face texture (128x128) with hour/minute hands for a city timezone. */
export function createWallClockFaceTexture(
  cityLabel: string,
  hourAngleRad: number,
  minAngleRad: number
): THREE.Texture {
  return createDecorCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const cx = w / 2
      const cy = h / 2
      const r = w * 0.44

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = "#faf8f3"
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = "#18274a"
      ctx.lineWidth = 4
      ctx.stroke()

      // 12 crisp hour ticks
      for (let i = 0; i < 12; i += 1) {
        const a = (i * Math.PI) / 6
        const inner = i % 3 === 0 ? r * 0.72 : r * 0.8
        ctx.strokeStyle = i % 3 === 0 ? "#18274a" : "#64748b"
        ctx.lineWidth = i % 3 === 0 ? 3 : 1.5
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
        ctx.lineTo(cx + Math.cos(a) * (r * 0.9), cy + Math.sin(a) * (r * 0.9))
        ctx.stroke()
      }

      // City label on dial
      ctx.fillStyle = "#1e3a5f"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 13px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(cityLabel, cx, cy + r * 0.44)

      // Hour hand
      ctx.strokeStyle = "#0f172a"
      ctx.lineWidth = 4.5
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(
        cx + Math.cos(hourAngleRad - Math.PI / 2) * (r * 0.48),
        cy + Math.sin(hourAngleRad - Math.PI / 2) * (r * 0.48)
      )
      ctx.stroke()

      // Minute hand
      ctx.strokeStyle = "#1e3a5f"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(
        cx + Math.cos(minAngleRad - Math.PI / 2) * (r * 0.68),
        cy + Math.sin(minAngleRad - Math.PI / 2) * (r * 0.68)
      )
      ctx.stroke()

      // Center brass pin
      ctx.fillStyle = "#e9b949"
      ctx.beginPath()
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
      ctx.fill()
    },
    4
  )
}

/** Creates a framed wall-art print texture (320x210). */
export function createWallArtPrintTexture(
  variant: "crest" | "motto" | "chart" | "mountain"
): THREE.Texture {
  return createDecorCanvasTexture(
    320,
    210,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      if (variant === "mountain") {
        grad.addColorStop(0, "#fef3c7")
        grad.addColorStop(1, "#fde68a")
      } else {
        grad.addColorStop(0, "#15264a")
        grad.addColorStop(1, "#0b1429")
      }
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      if (variant === "crest") {
        ctx.strokeStyle = "#e9b949"
        ctx.lineWidth = 4
        ctx.strokeRect(14, 14, w - 28, h - 28)
        ctx.fillStyle = "#f6d27a"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.font = `900 46px ${OFFICE_DECOR_FONT_STACK}`
        ctx.fillText("IQX", w / 2, h * 0.42)
        ctx.fillStyle = "#c9d6e4"
        ctx.font = `700 16px ${OFFICE_DECOR_FONT_STACK}`
        ctx.fillText("CHỨNG NHẬN XUẤT SẮC", w / 2, h * 0.74)
      } else if (variant === "motto") {
        ctx.strokeStyle = "#e9b949"
        ctx.lineWidth = 4
        ctx.strokeRect(14, 14, w - 28, h - 28)
        ctx.fillStyle = "#f6d27a"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.font = `800 25px ${OFFICE_DECOR_FONT_STACK}`
        ctx.fillText("KỶ LUẬT · TỐC ĐỘ", w / 2, h * 0.4)
        ctx.fillStyle = "rgba(246, 210, 122, 0.5)"
        ctx.fillRect(62, h * 0.56, w - 124, 2)
        ctx.fillStyle = "#f1f5f9"
        ctx.font = `600 16px ${OFFICE_DECOR_FONT_STACK}`
        ctx.fillText("ĐỒNG HÀNH TĂNG TRƯỞNG", w / 2, h * 0.73)
      } else if (variant === "chart") {
        ctx.strokeStyle = "rgba(246, 210, 122, 0.22)"
        ctx.lineWidth = 1.5
        for (let y = 36; y < h - 24; y += 30) {
          ctx.beginPath()
          ctx.moveTo(20, y)
          ctx.lineTo(w - 20, y)
          ctx.stroke()
        }
        ctx.strokeStyle = "#34c38f"
        ctx.lineWidth = 5
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(28, 162)
        ctx.lineTo(86, 138)
        ctx.lineTo(140, 144)
        ctx.lineTo(204, 92)
        ctx.lineTo(284, 52)
        ctx.stroke()
        ctx.fillStyle = "#f6d27a"
        ctx.beginPath()
        ctx.arc(284, 52, 8, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = "#f59e0b"
        ctx.beginPath()
        ctx.arc(224, 68, 28, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#2b426d"
        ctx.beginPath()
        ctx.moveTo(0, h)
        ctx.lineTo(96, 98)
        ctx.lineTo(192, h)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = "#1b2d52"
        ctx.beginPath()
        ctx.moveTo(118, h)
        ctx.lineTo(234, 108)
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fill()
      }
    },
    4
  )
}

/** Adds a framed panoramic city-skyline window strip + optional sunlit floor pool into `batch`. */
export function addSkylineWindowToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  skylineMat: THREE.Material,
  opts: {
    wx: number
    wallFaceZ: number
    widthU: number
    heightU: number
    centerY: number
    mullions: number
    sunPool?: boolean
  }
): void {
  const { wx, wallFaceZ, widthU, heightU, centerY, mullions, sunPool } = opts
  // Dark architectural frame + warm oak sill
  batch.addBox(
    widthU + 0.16,
    heightU + 0.16,
    0.09,
    palette.frameMetal,
    wx,
    centerY,
    wallFaceZ + 0.03,
    false
  )
  batch.addBox(
    widthU + 0.26,
    0.065,
    0.18,
    palette.oakWood,
    wx,
    centerY - heightU / 2 - 0.055,
    wallFaceZ + 0.07,
    false
  )
  batch.addBox(
    widthU + 0.2,
    0.04,
    0.11,
    palette.gold,
    wx,
    centerY + heightU / 2 + 0.08,
    wallFaceZ + 0.04,
    false
  )
  // Painted skyline pane
  batch.add(
    new THREE.PlaneGeometry(widthU, heightU),
    skylineMat,
    [wx, centerY, wallFaceZ + 0.08],
    undefined,
    undefined,
    false,
    false
  )
  // Vertical mullions
  for (let i = 1; i < mullions; i += 1) {
    const mx = wx - widthU / 2 + (i * widthU) / mullions
    batch.addBox(
      0.045,
      heightU,
      0.04,
      palette.frameMetal,
      mx,
      centerY,
      wallFaceZ + 0.09,
      false
    )
  }
  if (heightU > 0.9) {
    batch.addBox(
      widthU,
      0.04,
      0.04,
      palette.frameMetal,
      wx,
      centerY + heightU * 0.16,
      wallFaceZ + 0.09,
      false
    )
  }
  if (sunPool) {
    batch.add(
      new THREE.PlaneGeometry(widthU * 1.06, 1.9),
      palette.sunPool,
      [wx, 0.022, wallFaceZ + 1.25],
      [-Math.PI / 2, 0, 0],
      undefined,
      false,
      false
    )
  }
}

/** Adds 3 world market clocks (Hà Nội · Tokyo · New York) flush on the North back wall. */
export function addWorldClocks(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  parent: THREE.Object3D,
  centerWx: number,
  wallFaceZ: number,
  centerY: number,
  lite: boolean
): void {
  const seg = lite ? 12 : 20
  const clocks: readonly { label: string; dx: number; hRad: number; mRad: number }[] = [
    { label: "VN", dx: -0.78, hRad: (9.2 / 12) * Math.PI * 2, mRad: (12 / 60) * Math.PI * 2 },
    { label: "TYO", dx: 0, hRad: (11.2 / 12) * Math.PI * 2, mRad: (12 / 60) * Math.PI * 2 },
    { label: "NYC", dx: 0.78, hRad: (21.2 / 12) * Math.PI * 2, mRad: (12 / 60) * Math.PI * 2 },
  ]
  const radius = 0.24
  for (const clk of clocks) {
    const cx = centerWx + clk.dx
    // Brass bezel ring + dark backing
    batch.addCylinder(
      radius + 0.032,
      radius + 0.032,
      0.06,
      seg,
      palette.gold,
      cx,
      centerY,
      wallFaceZ + 0.035,
      false,
      false,
      [Math.PI / 2, 0, 0]
    )
    const faceTex = createWallClockFaceTexture(clk.label, clk.hRad, clk.mRad)
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.32,
      metalness: 0.05,
    })
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius, seg), faceMat)
    face.position.set(cx, centerY, wallFaceZ + 0.072)
    parent.add(face)
  }
}

/** Adds sleek ceiling-less hanging pendant lamp silhouettes near the north back wall. */
export function addHangingPendantsToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  xs: readonly number[],
  zPos: number,
  lite: boolean
): void {
  const seg = lite ? 8 : 14
  for (const wx of xs) {
    // Slim dark suspension rod reaching upward into open ceiling silhouette
    batch.addCylinder(
      0.014,
      0.014,
      1.15,
      6,
      palette.obsidian,
      wx,
      4.18,
      zPos,
      false,
      false
    )
    // Brass collar
    batch.addCylinder(
      0.06,
      0.08,
      0.08,
      seg,
      palette.gold,
      wx,
      3.58,
      zPos,
      false,
      false
    )
    // Sleek navy conical bell dome
    batch.addCylinder(
      0.09,
      0.28,
      0.22,
      seg,
      palette.wallDadoNavy,
      wx,
      3.44,
      zPos,
      false,
      false
    )
    // Gold lower rim ring
    batch.addCylinder(
      0.285,
      0.29,
      0.028,
      seg,
      palette.gold,
      wx,
      3.33,
      zPos,
      false,
      false
    )
    // Warm glowing filament bulb peeking out below rim
    batch.addSphere(
      0.09,
      seg,
      Math.max(6, seg - 4),
      palette.warmGlow,
      wx,
      3.29,
      zPos,
      false,
      false
    )
  }
}
