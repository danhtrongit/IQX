import * as THREE from "three"

import { markStaticCanvasTexture, safeGet2DContext } from "../textures.ts"

const FONT_STACK =
  '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function finalizeStaticTex(
  width: number,
  height: number,
  paint: (canvas: HTMLCanvasElement) => boolean,
  opts?: { anisotropy?: number }
): THREE.Texture {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ok = paint(canvas)
  const tex: THREE.Texture = ok
    ? markStaticCanvasTexture(new THREE.CanvasTexture(canvas), (c) => {
        paint(c)
      })
    : new THREE.DataTexture(new Uint8Array([24, 38, 70, 255]), 1, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = opts?.anisotropy ?? 6
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

function drawMiniCandlestickPanel(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  variant: 0 | 1 | 2 | 3
): void {
  const grad = ctx.createLinearGradient(ox, oy, ox, oy + h)
  grad.addColorStop(0, "#0d172c")
  grad.addColorStop(1, "#080f1e")
  ctx.fillStyle = grad
  ctx.fillRect(ox, oy, w, h)

  ctx.strokeStyle = "rgba(233, 185, 73, 0.38)"
  ctx.lineWidth = 3
  ctx.strokeRect(ox + 8, oy + 8, w - 16, h - 16)

  ctx.strokeStyle = "rgba(148, 163, 184, 0.14)"
  ctx.lineWidth = 1
  for (let i = 1; i <= 4; i += 1) {
    const gy = oy + 46 + ((h - 76) * i) / 5
    ctx.beginPath()
    ctx.moveTo(ox + 20, gy)
    ctx.lineTo(ox + w - 20, gy)
    ctx.stroke()
  }

  const titles = [
    ["VN-INDEX · XU HƯỚNG TĂNG", "+1.48%", "#34d399"],
    ["VN30 · NẾN PHÁ ĐỈNH", "+2.15%", "#34d399"],
    ["DÒNG TIỀN NGÀNH", "TÀI CHÍNH · CÔNG NGHỆ", "#f6d27a"],
    ["CHỈ BÁO SÓNG VÀNG", "MA20 / MA50", "#60a5fa"],
  ] as const
  const [title, tag, accent] = titles[variant]
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  ctx.font = `800 18px ${FONT_STACK}`
  ctx.fillStyle = "#f1f5f9"
  ctx.fillText(title, ox + 22, oy + 30)

  ctx.textAlign = "right"
  ctx.font = `700 16px ${FONT_STACK}`
  ctx.fillStyle = accent
  ctx.fillText(tag, ox + w - 22, oy + 30)

  if (variant === 2) {
    const blocks: readonly [number, number, number, number, string, string][] = [
      [22, 54, 175, 92, "#15803d", "NGÂN HÀNG +1.8%"],
      [205, 54, 155, 92, "#0d9488", "CHỨNG KHOÁN +2.4%"],
      [368, 54, 122, 92, "#b45309", "BĐS +0.6%"],
      [22, 154, 140, 80, "#2563eb", "CÔNG NGHỆ +3.1%"],
      [170, 154, 165, 80, "#16a34a", "BÁN LẺ +1.5%"],
      [343, 154, 147, 80, "#be123c", "THÉP -0.4%"],
    ]
    for (const [bx, by, bw, bh, col, lbl] of blocks) {
      drawRoundedRect(ctx, ox + bx, oy + by, bw, bh, 8)
      ctx.fillStyle = col
      ctx.fill()
      ctx.textAlign = "center"
      ctx.font = `700 13px ${FONT_STACK}`
      ctx.fillStyle = "#f1f5f9"
      ctx.fillText(lbl, ox + bx + bw / 2, oy + by + bh / 2)
    }
    return
  }

  const candles = 18
  const plotX = ox + 24
  const plotW = w - 48
  const plotTop = oy + 54
  const plotH = h - 94
  const step = plotW / candles
  const series =
    variant === 0
      ? [0.22, 0.28, 0.25, 0.34, 0.38, 0.35, 0.46, 0.52, 0.49, 0.57, 0.63, 0.6, 0.71, 0.68, 0.76, 0.82, 0.79, 0.88]
      : variant === 1
        ? [0.35, 0.31, 0.36, 0.42, 0.39, 0.44, 0.51, 0.48, 0.59, 0.56, 0.67, 0.74, 0.7, 0.77, 0.84, 0.81, 0.89, 0.92]
        : [0.28, 0.36, 0.45, 0.41, 0.34, 0.42, 0.53, 0.62, 0.58, 0.51, 0.6, 0.69, 0.76, 0.71, 0.65, 0.74, 0.83, 0.87]

  ctx.beginPath()
  for (let i = 0; i < candles; i += 1) {
    const cx = plotX + (i + 0.5) * step
    const cy = plotTop + (1 - series[i]!) * plotH
    if (i === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  }
  ctx.lineTo(plotX + plotW, plotTop + plotH)
  ctx.lineTo(plotX, plotTop + plotH)
  ctx.closePath()
  const areaGrad = ctx.createLinearGradient(0, plotTop, 0, plotTop + plotH)
  areaGrad.addColorStop(0, variant === 3 ? "rgba(96, 165, 250, 0.26)" : "rgba(52, 211, 153, 0.26)")
  areaGrad.addColorStop(1, "rgba(15, 23, 42, 0)")
  ctx.fillStyle = areaGrad
  ctx.fill()

  for (let i = 0; i < candles; i += 1) {
    const prev = series[Math.max(0, i - 1)]!
    const cur = series[i]!
    const bull = cur >= prev
    const cx = plotX + (i + 0.5) * step
    const yOpen = plotTop + (1 - prev) * plotH
    const yClose = plotTop + (1 - cur) * plotH
    const color = bull ? "#34d399" : "#f87171"

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, Math.min(yOpen, yClose) - 9)
    ctx.lineTo(cx, Math.max(yOpen, yClose) + 8)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.fillRect(cx - step * 0.28, Math.min(yOpen, yClose), step * 0.56, Math.max(6, Math.abs(yClose - yOpen)))

    const volH = 8 + ((i * 7 + variant * 5) % 16)
    ctx.fillStyle = bull ? "rgba(52, 211, 153, 0.45)" : "rgba(248, 113, 113, 0.42)"
    ctx.fillRect(cx - step * 0.26, oy + h - 18 - volH, step * 0.52, volH)
  }

  ctx.strokeStyle = "#f6d27a"
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let i = 0; i < candles; i += 1) {
    const avg = (series[Math.max(0, i - 2)]! + series[Math.max(0, i - 1)]! + series[i]!) / 3
    const cx = plotX + (i + 0.5) * step
    const cy = plotTop + (1 - avg) * plotH + 4
    if (i === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  }
  ctx.stroke()
}

function drawClockDial(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  hours: number,
  minutes: number,
  city: string,
  subLabel: string
): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
  ctx.fillStyle = "#e9b949"
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = "#fbf6ec"
  ctx.fill()

  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI) / 6 - Math.PI / 2
    const major = i % 3 === 0
    ctx.strokeStyle = major ? "#162547" : "#64748b"
    ctx.lineWidth = major ? 4 : 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r * (major ? 0.72 : 0.8), cy + Math.sin(a) * r * (major ? 0.72 : 0.8))
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92)
    ctx.stroke()
  }

  const hAngle = (((hours % 12) + minutes / 60) * Math.PI) / 6 - Math.PI / 2
  ctx.strokeStyle = "#162547"
  ctx.lineWidth = 6
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(hAngle) * r * 0.5, cy + Math.sin(hAngle) * r * 0.5)
  ctx.stroke()

  const mAngle = (minutes * Math.PI) / 30 - Math.PI / 2
  ctx.strokeStyle = "#243b6b"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(mAngle) * r * 0.74, cy + Math.sin(mAngle) * r * 0.74)
  ctx.stroke()

  const sAngle = ((hours * 7 + 15) * Math.PI) / 30 - Math.PI / 2
  ctx.strokeStyle = "#dc2626"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(sAngle) * r * 0.78, cy + Math.sin(sAngle) * r * 0.78)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fillStyle = "#d99b26"
  ctx.fill()

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `800 22px ${FONT_STACK}`
  ctx.fillStyle = "#f1f5f9"
  ctx.fillText(city, cx, cy + r + 28)

  ctx.font = `600 15px ${FONT_STACK}`
  ctx.fillStyle = "#f6d27a"
  ctx.fillText(subLabel, cx, cy + r + 50)
}

/**
 * Texture 1 of 3 (`1024×1024`, `512×512` in lite): Master Emissive Visual Atlas packing:
 * - Top half (`0..1024, 0..512`): 4 Framed Stock Charts
 * - Bottom-left (`0..512, 512..1024`): World Clocks (Hà Nội / New York / Tokyo)
 * - Bottom-right (`512..1024, 512..1024`): Trading Monitor, Info Kiosk, Coffee Menu, Newsstand & Newspapers
 */
export function createDecorVisualAtlasTexture(lite: boolean): THREE.Texture {
  const size = lite ? 512 : 1024
  return finalizeStaticTex(
    size,
    size,
    (canvas) => {
      const ctx = safeGet2DContext(canvas)
      if (!ctx) return false
      ctx.save()
      const s = canvas.width / 1024
      ctx.scale(s, s)

      // Top half: 4 framed stock charts (512×256 each)
      drawMiniCandlestickPanel(ctx, 0, 0, 512, 256, 0)
      drawMiniCandlestickPanel(ctx, 512, 0, 512, 256, 1)
      drawMiniCandlestickPanel(ctx, 0, 256, 512, 256, 2)
      drawMiniCandlestickPanel(ctx, 512, 256, 512, 256, 3)

      // Bottom-left (0..512, 512..1024): World Clocks Panel (HÀ NỘI · NEW YORK · TOKYO)
      const bg = ctx.createLinearGradient(0, 512, 0, 1024)
      bg.addColorStop(0, "#17274b")
      bg.addColorStop(1, "#0d172e")
      ctx.fillStyle = bg
      ctx.fillRect(0, 512, 512, 512)
      ctx.strokeStyle = "#e9b949"
      ctx.lineWidth = 6
      ctx.strokeRect(10, 522, 492, 492)
      ctx.strokeStyle = "rgba(246, 210, 122, 0.38)"
      ctx.lineWidth = 2
      ctx.strokeRect(20, 532, 472, 472)
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 24px ${FONT_STACK}`
      ctx.fillStyle = "#f6d27a"
      ctx.fillText("GIỜ THỊ TRƯỜNG QUỐC TẾ", 256, 560)

      const now = new Date()
      const utcH = now.getUTCHours()
      const mins = now.getUTCMinutes()
      drawClockDial(ctx, 256, 666, 72, (utcH + 7) % 24, mins, "HÀ NỘI", "HOSE · GMT+7")
      drawClockDial(ctx, 138, 878, 62, (utcH + 19) % 24, mins, "NEW YORK", "NYSE · GMT-5")
      drawClockDial(ctx, 374, 878, 62, (utcH + 9) % 24, mins, "TOKYO", "TSE · GMT+9")

      // Bottom-right (512..1024, 512..1024): 4 UI/Signage tiles (256×256 each)
      // Sub-TL (512, 512): Trading Island Mini Candlestick Monitor
      ctx.fillStyle = "#081020"
      ctx.fillRect(512, 512, 256, 256)
      ctx.fillStyle = "#112242"
      ctx.fillRect(512, 512, 256, 36)
      ctx.textAlign = "left"
      ctx.font = `800 16px ${FONT_STACK}`
      ctx.fillStyle = "#f6d27a"
      ctx.fillText("IQX PRO", 526, 530)
      ctx.textAlign = "right"
      ctx.fillStyle = "#34d399"
      ctx.fillText("FPT +3.2%", 754, 530)
      const bars = [0.25, 0.34, 0.3, 0.45, 0.54, 0.5, 0.64, 0.72, 0.68, 0.82, 0.88]
      for (let i = 0; i < bars.length; i += 1) {
        const prev = bars[Math.max(0, i - 1)]!
        const cur = bars[i]!
        const bull = cur >= prev
        const x = 530 + i * 20
        const y0 = 728 - prev * 155
        const y1 = 728 - cur * 155
        ctx.strokeStyle = bull ? "#34d399" : "#f87171"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x + 6, Math.min(y0, y1) - 10)
        ctx.lineTo(x + 6, Math.max(y0, y1) + 10)
        ctx.stroke()
        ctx.fillStyle = bull ? "#34d399" : "#f87171"
        ctx.fillRect(x, Math.min(y0, y1), 12, Math.max(8, Math.abs(y1 - y0)))
      }
      ctx.fillStyle = "#15803d"
      ctx.fillRect(526, 736, 108, 22)
      ctx.fillStyle = "#b91c1c"
      ctx.fillRect(646, 736, 108, 22)
      ctx.textAlign = "center"
      ctx.font = `700 13px ${FONT_STACK}`
      ctx.fillStyle = "#f1f5f9"
      ctx.fillText("MUA", 580, 747)
      ctx.fillText("BÁN", 700, 747)

      // Sub-TR (768, 512): Info Kiosk Touchscreen Directory
      ctx.fillStyle = "#0e1a34"
      ctx.fillRect(768, 512, 256, 256)
      ctx.strokeStyle = "#e9b949"
      ctx.lineWidth = 4
      ctx.strokeRect(776, 520, 240, 240)
      ctx.fillStyle = "#1d3566"
      ctx.fillRect(784, 528, 224, 42)
      ctx.textAlign = "center"
      ctx.font = `800 17px ${FONT_STACK}`
      ctx.fillStyle = "#f6d27a"
      ctx.fillText("BẢN ĐỒ KHU GIAO DỊCH", 896, 550)
      const rows = [
        ["THẦN TÀI", "Gieo quẻ đầu phiên", "#f6d27a"],
        ["BẢNG ĐIỆN VN30", "Dữ liệu trực tuyến", "#34d399"],
        ["SACO NHẬN ĐỊNH", "Góc nhìn chuyên gia", "#60a5fa"],
        ["VINH DANH", "Top dự đoán chuẩn", "#fbbf24"],
        ["VĂN PHÒNG NHÓM", "Lối vào phía Tây", "#c9d6e4"],
      ] as const
      for (let i = 0; i < rows.length; i += 1) {
        const [lbl, sub, col] = rows[i]!
        const ry = 582 + i * 34
        drawRoundedRect(ctx, 788, ry, 216, 28, 6)
        ctx.fillStyle = "rgba(30, 58, 108, 0.65)"
        ctx.fill()
        ctx.fillStyle = col
        ctx.fillRect(788, ry, 5, 28)
        ctx.textAlign = "left"
        ctx.font = `700 12px ${FONT_STACK}`
        ctx.fillStyle = "#f1f5f9"
        ctx.fillText(lbl, 802, ry + 11)
        ctx.font = `500 10px ${FONT_STACK}`
        ctx.fillStyle = "#c9d6e4"
        ctx.fillText(sub, 802, ry + 22)
      }

      // Sub-BL (512, 768): Coffee & Tea Bar Menu Board
      ctx.fillStyle = "#1a202e"
      ctx.fillRect(512, 768, 256, 256)
      ctx.strokeStyle = "#d9a94c"
      ctx.lineWidth = 5
      ctx.strokeRect(522, 778, 236, 236)
      ctx.textAlign = "center"
      ctx.font = `800 22px ${FONT_STACK}`
      ctx.fillStyle = "#f6d27a"
      ctx.fillText("TRÀ & CÀ PHÊ IQX", 640, 812)
      ctx.strokeStyle = "rgba(246, 210, 122, 0.4)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(546, 832)
      ctx.lineTo(734, 832)
      ctx.stroke()
      const drinks = [
        ["Cà phê sữa đá", "Tỉnh táo soi nến"],
        ["Trà sen vàng", "Thư thái khớp lệnh"],
        ["Espresso nóng", "Đậm vị đầu phiên"],
        ["Bánh sừng bò", "Nướng mới mỗi sáng"],
      ] as const
      ctx.textAlign = "left"
      for (let i = 0; i < drinks.length; i += 1) {
        const [name, desc] = drinks[i]!
        const dy = 858 + i * 38
        ctx.font = `700 16px ${FONT_STACK}`
        ctx.fillStyle = "#f1f5f9"
        ctx.fillText(name, 538, dy)
        ctx.font = `500 12px ${FONT_STACK}`
        ctx.fillStyle = "#c9d6e4"
        ctx.fillText(desc, 538, dy + 17)
      }

      // Sub-BR (768, 768): Financial Newsstand Banner + Mini Newspaper Front Page
      ctx.fillStyle = "#f6f0e4"
      ctx.fillRect(768, 768, 256, 256)
      ctx.fillStyle = "#15264a"
      ctx.fillRect(768, 768, 256, 56)
      ctx.textAlign = "center"
      ctx.font = `800 20px ${FONT_STACK}`
      ctx.fillStyle = "#f6d27a"
      ctx.fillText("QUẦY BÁO TÀI CHÍNH", 896, 798)
      ctx.fillStyle = "#1e293b"
      ctx.font = `800 17px ${FONT_STACK}`
      ctx.fillText("NHỊP ĐẬP THỊ TRƯỜNG", 896, 848)
      ctx.fillStyle = "#16a34a"
      ctx.fillRect(786, 866, 102, 62)
      ctx.strokeStyle = "#f1f5f9"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(796, 916)
      ctx.lineTo(824, 900)
      ctx.lineTo(846, 906)
      ctx.lineTo(878, 878)
      ctx.stroke()
      ctx.fillStyle = "#475569"
      for (let r = 0; r < 5; r += 1) {
        ctx.fillRect(900, 870 + r * 12, 106, 6)
      }
      for (let r = 0; r < 5; r += 1) {
        ctx.fillRect(786, 942 + r * 14, 220, 7)
      }

      ctx.restore()
      return true
    },
    { anisotropy: lite ? 2 : 8 }
  )
}

/**
 * Texture 2 of 3 (`1024×512`, `512×256` in lite): Floor Decals + Koi Pond Water Atlas:
 * - Left half (`0..512, 0..512`): Gold Compass Rose & IQX Medallion Floor Inlay
 * - Top-right (`512..1024, 0..256`): 4 Right-Side-Up Gold Directional Floor Arrows
 * - Bottom-right (`512..768, 256..512`): Luminous Turquoise Koi Pond Water
 */
export function createDecalsAndWaterAtlasTexture(lite: boolean): THREE.Texture {
  const w = lite ? 512 : 1024
  const h = lite ? 256 : 512
  return finalizeStaticTex(
    w,
    h,
    (canvas) => {
      const ctx = safeGet2DContext(canvas)
      if (!ctx) return false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(canvas.width / 1024, canvas.height / 512)

      // Left half (0..512, 0..512): Ornate Gold Compass Rose & IQX Medallion
      const cx = 256
      const cy = 256
      ctx.strokeStyle = "rgba(186, 134, 42, 0.72)"
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.arc(cx, cy, 232, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = "rgba(186, 134, 42, 0.45)"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx, cy, 212, 0, Math.PI * 2)
      ctx.stroke()

      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4
        const major = i % 2 === 0
        const outerR = major ? 204 : 158
        const baseR = 64
        const spread = major ? 0.14 : 0.11

        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR)
        ctx.lineTo(cx + Math.cos(a - spread) * baseR, cy + Math.sin(a - spread) * baseR)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fillStyle = major ? "rgba(212, 160, 56, 0.56)" : "rgba(180, 130, 44, 0.34)"
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR)
        ctx.lineTo(cx + Math.cos(a + spread) * baseR, cy + Math.sin(a + spread) * baseR)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fillStyle = major ? "rgba(138, 92, 24, 0.44)" : "rgba(138, 92, 24, 0.24)"
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(cx, cy, 78, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(244, 235, 219, 0.8)"
      ctx.fill()
      ctx.strokeStyle = "rgba(186, 134, 42, 0.85)"
      ctx.lineWidth = 5
      ctx.stroke()

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 44px ${FONT_STACK}`
      ctx.fillStyle = "rgba(138, 92, 24, 0.88)"
      ctx.fillText("IQX", cx, cy - 2)
      ctx.font = `700 14px ${FONT_STACK}`
      ctx.fillStyle = "rgba(138, 92, 24, 0.72)"
      ctx.fillText("TRADING HALL", cx, cy + 32)

      const dirs = ["N", "E", "S", "W"] as const
      ctx.font = `800 22px ${FONT_STACK}`
      ctx.fillStyle = "rgba(138, 92, 24, 0.75)"
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2 - Math.PI / 2
        ctx.fillText(dirs[i]!, cx + Math.cos(a) * 194, cy + Math.sin(a) * 194)
      }

      // Top-right (512..1024, 0..256): 4 Right-Side-Up Gold Directional Floor Arrows (64px rows)
      const arrows: readonly { label: string; dir: "left" | "right" }[] = [
        { label: "VĂN PHÒNG", dir: "left" },
        { label: "VINH DANH", dir: "right" },
        { label: "BẢNG ĐIỆN", dir: "left" },
        { label: "PHÒNG CHỜ", dir: "left" },
      ]
      for (let i = 0; i < arrows.length; i += 1) {
        const { label, dir } = arrows[i]!
        const midY = i * 64 + 32
        ctx.fillStyle = "rgba(196, 144, 48, 0.64)"
        ctx.strokeStyle = "rgba(138, 92, 24, 0.82)"
        ctx.lineWidth = 3
        ctx.beginPath()
        if (dir === "right") {
          ctx.moveTo(540, midY - 16)
          ctx.lineTo(900, midY - 16)
          ctx.lineTo(900, midY - 26)
          ctx.lineTo(996, midY)
          ctx.lineTo(900, midY + 26)
          ctx.lineTo(900, midY + 16)
          ctx.lineTo(540, midY + 16)
          ctx.lineTo(562, midY)
        } else {
          ctx.moveTo(996, midY - 16)
          ctx.lineTo(636, midY - 16)
          ctx.lineTo(636, midY - 26)
          ctx.lineTo(540, midY)
          ctx.lineTo(636, midY + 26)
          ctx.lineTo(636, midY + 16)
          ctx.lineTo(996, midY + 16)
          ctx.lineTo(974, midY)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.font = `800 22px ${FONT_STACK}`
        ctx.fillStyle = "rgba(88, 54, 14, 0.94)"
        ctx.fillText(label, dir === "right" ? 734 : 802, midY + 1)
      }

      // Bottom-right square (512..768, 256..512): Luminous Turquoise Koi Pond Water
      const wx = 640
      const wy = 384
      const wGrad = ctx.createRadialGradient(wx, wy, 14, wx, wy, 128)
      wGrad.addColorStop(0, "#4cc9d8")
      wGrad.addColorStop(0.58, "#1f8ea8")
      wGrad.addColorStop(1, "#125870")
      ctx.fillStyle = wGrad
      ctx.fillRect(512, 256, 256, 256)

      for (let i = 0; i < 18; i += 1) {
        const a = i * 2.399
        const rr = 28 + ((i * 19) % 30) * 2.6
        ctx.beginPath()
        ctx.arc(wx + Math.cos(a) * rr, wy + Math.sin(a) * rr, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = i % 3 === 0 ? "rgba(255, 216, 89, 0.58)" : "rgba(226, 232, 240, 0.24)"
        ctx.fill()
      }
      ctx.strokeStyle = "rgba(224, 247, 250, 0.36)"
      ctx.lineWidth = 2.5
      for (const r of [38, 70, 102]) {
        ctx.beginPath()
        ctx.arc(wx, wy, r, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.restore()
      return true
    },
    { anisotropy: lite ? 2 : 8 }
  )
}

/**
 * Texture 3 of 3 (`1024×48`, `512×48` in lite): Scrolling Global & Commodities Secondary LED Ticker.
 */
export function createSecondaryTickerTexture(lite: boolean): {
  canvas: HTMLCanvasElement
  texture: THREE.Texture
} {
  const canvas = document.createElement("canvas")
  canvas.width = lite ? 512 : 1024
  canvas.height = 48
  const ctx = safeGet2DContext(canvas)
  if (ctx) {
    const w = canvas.width
    const h = canvas.height
    ctx.fillStyle = "#080d18"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "rgba(233, 185, 73, 0.45)"
    ctx.fillRect(0, 0, w, 2)
    ctx.fillRect(0, h - 2, w, 2)

    const items: readonly [string, string, string][] = [
      ["VÀNG SJC", "86.50 +0.45%", "#f6d27a"],
      ["S&P 500", "5,942 +0.62%", "#34d399"],
      ["NIKKEI", "39,120 +0.84%", "#34d399"],
      ["USD/VND", "25,380 +0.05%", "#facc15"],
      ["BRENT", "74.20 -0.35%", "#f87171"],
      ["NASDAQ", "19,180 +0.91%", "#34d399"],
    ]
    ctx.save()
    ctx.scale(w / 1024, 1)
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    let x = 16
    const cy = h / 2 + 1
    for (const [label, val, col] of items) {
      ctx.font = `800 17px ${FONT_STACK}`
      ctx.fillStyle = "#f1f5f9"
      ctx.fillText(label, x, cy)
      x += ctx.measureText(label).width + 8
      ctx.font = `700 16px ${FONT_STACK}`
      ctx.fillStyle = col
      ctx.fillText(val, x, cy)
      x += ctx.measureText(val).width + 14
      ctx.fillStyle = "rgba(233, 185, 73, 0.48)"
      ctx.fillRect(x, 14, 2, h - 28)
      x += 14
    }
    ctx.restore()
  }

  let texture: THREE.Texture
  try {
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.anisotropy = lite ? 2 : 6
    tex.needsUpdate = true
    texture = tex
  } catch {
    texture = new THREE.DataTexture(new Uint8Array([8, 13, 24, 255]), 1, 1)
    texture.needsUpdate = true
  }
  return { canvas, texture }
}
