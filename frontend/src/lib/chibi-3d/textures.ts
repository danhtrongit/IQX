import * as THREE from "three"

import {
  formatIndex,
  formatPercent,
} from "@/pages/trading-floor/net/market/format.ts"
import {
  heatColour,
  heatPct,
  heatPrice,
  marketWeather,
} from "@/pages/trading-floor/net/market/heat.ts"
import {
  PRICE_COLORS,
  indexTone,
} from "@/pages/trading-floor/net/market/tone.ts"
import type {
  IndexQuote,
  Quote,
} from "@/pages/trading-floor/net/market/types.ts"
import type { PostCard } from "@/pages/trading-floor/net/types.ts"

import {
  markSharedTexture,
  type ChibiFaceVariant,
  type FloorTextureStyle,
  type OfficeStandeePayload,
  type SignTextureOptions,
} from "./types.ts"

const FONT_STACK =
  '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const faceTextureCache = new Map<ChibiFaceVariant, THREE.Texture>()
const floorTextureCache = new Map<FloorTextureStyle, THREE.Texture>()

interface CanvasSurface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
}

/** Safely obtains a 2D canvas context without triggering jsdom's unimplemented-canvas stderr spam. */
export function safeGet2DContext(
  canvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
  const fn = canvas.getContext as unknown as Record<string, unknown> | undefined
  if (!fn) return null
  const isJsdom =
    typeof navigator !== "undefined" && /\bjsdom\b/i.test(navigator.userAgent)
  if (
    isJsdom &&
    !("mock" in fn) &&
    !Object.prototype.hasOwnProperty.call(canvas, "getContext")
  ) {
    return null
  }
  try {
    return canvas.getContext("2d")
  } catch {
    return null
  }
}

function createCanvasSurface(w: number, h: number): CanvasSurface {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = safeGet2DContext(canvas)
  return { canvas, ctx }
}

function createFallbackTexture(
  r = 255,
  g = 255,
  b = 255,
  a = 255
): THREE.DataTexture {
  const data = new Uint8Array([r, g, b, a])
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function finalizeCanvasTexture(
  canvas: HTMLCanvasElement,
  hasContext: boolean,
  opts?: { repeat?: boolean; anisotropy?: number; shared?: boolean }
): THREE.Texture {
  const tex: THREE.Texture = hasContext
    ? new THREE.CanvasTexture(canvas)
    : createFallbackTexture(255, 255, 255, 255)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = opts?.anisotropy ?? 8
  if (opts?.repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
  }
  tex.needsUpdate = true
  return opts?.shared ? markSharedTexture(tex) : tex
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function trimToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  const ellipsis = "…"
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${text.slice(0, mid)}${ellipsis}`
    if (ctx.measureText(candidate).width <= maxWidth) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo <= 0 ? ellipsis : `${text.slice(0, lo).trimEnd()}${ellipsis}`
}

// ---------- 1. High-DPI Kawaii Chibi Face Textures (256x256) ----------

function drawSparkleEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  opts: {
    rx: number
    ry: number
    irisTop: string
    irisBottom: string
    lashStyle: "none" | "female" | "elegant" | "cool"
    side: -1 | 1
  }
): void {
  const { rx, ry, irisTop, irisBottom, lashStyle, side } = opts

  // Soft eye socket white sclera crescent
  ctx.save()
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.ellipse(cx, cy + 1, rx * 1.12, ry * 1.06, 0, 0, Math.PI * 2)
  ctx.fill()

  // Main glossy iris gradient
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry)
  grad.addColorStop(0, irisTop)
  grad.addColorStop(0.58, irisTop)
  grad.addColorStop(1, irisBottom)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  // Deep pupil center
  ctx.fillStyle = "#0e1118"
  ctx.beginPath()
  ctx.ellipse(cx, cy - 1, rx * 0.56, ry * 0.56, 0, 0, Math.PI * 2)
  ctx.fill()

  // Bright lower jewel crescent reflection
  ctx.fillStyle = "rgba(255, 255, 255, 0.36)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + ry * 0.48, rx * 0.54, ry * 0.24, 0, 0, Math.PI * 2)
  ctx.fill()

  // Dual crisp white catchlight sparkles
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.ellipse(
    cx - rx * 0.32,
    cy - ry * 0.34,
    rx * 0.31,
    ry * 0.29,
    -0.2,
    0,
    Math.PI * 2
  )
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + rx * 0.3, cy + ry * 0.28, rx * 0.16, 0, Math.PI * 2)
  ctx.fill()

  // Crisp upper eyelid arc
  ctx.strokeStyle = "#161318"
  ctx.lineWidth = lashStyle === "cool" ? 5.5 : 4.5
  ctx.lineCap = "round"
  ctx.beginPath()
  if (lashStyle === "cool") {
    ctx.moveTo(cx - rx * 1.1, cy - ry * 0.55)
    ctx.quadraticCurveTo(cx, cy - ry * 1.02, cx + rx * 1.12, cy - ry * 0.58)
  } else {
    ctx.ellipse(
      cx,
      cy + 1,
      rx * 1.08,
      ry * 1.04,
      0,
      Math.PI * 1.1,
      Math.PI * 1.9
    )
  }
  ctx.stroke()

  // Cute outer eyelash flicks for female variants
  if (lashStyle === "female" || lashStyle === "elegant") {
    const outerX = cx + side * rx * 1.04
    const outerY = cy - ry * 0.38
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(outerX, outerY)
    ctx.lineTo(outerX + side * 8, outerY - 6)
    if (lashStyle === "elegant") {
      ctx.moveTo(outerX - side * 2, outerY + 6)
      ctx.lineTo(outerX + side * 7, outerY + 2)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export function createChibiFaceTexture(
  variant: ChibiFaceVariant
): THREE.Texture {
  const cached = faceTextureCache.get(variant)
  if (cached) return cached

  const { canvas, ctx } = createCanvasSurface(256, 256)
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256)

    const isStatue = variant.startsWith("statue_")
    if (isStatue) {
      const ink =
        variant === "statue_gold"
          ? "#6f4b0c"
          : variant === "statue_silver"
            ? "#475569"
            : variant === "statue_bronze"
              ? "#5a3214"
              : "#334155"
      const shine =
        variant === "statue_empty" ? "rgba(255,255,255,0.28)" : "#fff8dc"

      // Sculpted metallic eyes + brows + calm proud smile
      ctx.fillStyle = ink
      for (const cx of [86, 170]) {
        ctx.beginPath()
        ctx.ellipse(cx, 124, 15, 18, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = shine
        ctx.beginPath()
        ctx.arc(cx - 5, 118, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = ink
      }
      ctx.strokeStyle = ink
      ctx.lineWidth = 5
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(68, 94)
      ctx.quadraticCurveTo(86, 86, 102, 93)
      ctx.moveTo(154, 93)
      ctx.quadraticCurveTo(170, 86, 188, 94)
      ctx.stroke()

      ctx.lineWidth = 5.5
      ctx.beginPath()
      ctx.arc(128, 158, 17, 0.16 * Math.PI, 0.84 * Math.PI)
      ctx.stroke()
    } else if (variant === "thantai") {
      // Extra rosy jolly cheeks
      for (const cx of [62, 194]) {
        const g = ctx.createRadialGradient(cx, 154, 4, cx, 154, 28)
        g.addColorStop(0, "rgba(239, 68, 68, 0.56)")
        g.addColorStop(1, "rgba(239, 68, 68, 0)")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, 154, 28, 0, Math.PI * 2)
        ctx.fill()
      }

      // Thick friendly white eyebrows
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 11
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(58, 92)
      ctx.quadraticCurveTo(84, 76, 108, 90)
      ctx.moveTo(148, 90)
      ctx.quadraticCurveTo(172, 76, 198, 92)
      ctx.stroke()

      // Happy laughing crescent eyes (^ ^)
      ctx.strokeStyle = "#2b1610"
      ctx.lineWidth = 8.5
      ctx.beginPath()
      ctx.arc(84, 134, 20, Math.PI * 1.12, Math.PI * 1.88)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(172, 134, 20, Math.PI * 1.12, Math.PI * 1.88)
      ctx.stroke()

      // Beaming wide joyful smile
      ctx.fillStyle = "#b91c1c"
      ctx.beginPath()
      ctx.arc(128, 162, 24, 0.06 * Math.PI, 0.94 * Math.PI)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = "#451510"
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.fillStyle = "#fff5f5"
      ctx.fillRect(108, 164, 40, 7)
    } else {
      const isFemale = variant.startsWith("female_")
      const isCool = variant === "cool_glasses"
      const isEnergetic = variant === "male_energetic"

      // Rosy kawaii cheek blush
      const blushAlpha = isFemale ? 0.44 : isCool ? 0.24 : 0.34
      for (const cx of [62, 194]) {
        const g = ctx.createRadialGradient(cx, 156, 3, cx, 156, 26)
        g.addColorStop(0, `rgba(255, 118, 142, ${blushAlpha})`)
        g.addColorStop(1, "rgba(255, 118, 142, 0)")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(cx, 156, 26, 17, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // Glossy chibi eyes
      const irisTop = isCool
        ? "#11243e"
        : isFemale
          ? "#261b2e"
          : "#231d1a"
      const irisBottom = isCool
        ? "#38bdf8"
        : variant === "female_cheerful"
          ? "#4f7dc9"
          : isFemale
            ? "#7b4b7a"
            : "#5c4333"
      const lashStyle = isCool
        ? "cool"
        : variant === "female_elegant"
          ? "elegant"
          : isFemale
            ? "female"
            : "none"
      const eyeRx = isFemale ? 21 : 19
      const eyeRy = isCool ? 19 : isFemale ? 25 : 22

      drawSparkleEye(ctx, 84, 126, {
        rx: eyeRx,
        ry: eyeRy,
        irisTop,
        irisBottom,
        lashStyle,
        side: -1,
      })
      drawSparkleEye(ctx, 172, 126, {
        rx: eyeRx,
        ry: eyeRy,
        irisTop,
        irisBottom,
        lashStyle,
        side: 1,
      })

      // Expressive eyebrows
      ctx.strokeStyle = isCool ? "#151b26" : "#38261d"
      ctx.lineWidth = isFemale ? 4.2 : 5.6
      ctx.lineCap = "round"
      ctx.beginPath()
      if (isCool) {
        ctx.moveTo(64, 92)
        ctx.lineTo(104, 98)
        ctx.moveTo(152, 98)
        ctx.lineTo(192, 90)
      } else {
        ctx.moveTo(65, 92)
        ctx.quadraticCurveTo(84, 83, 103, 91)
        ctx.moveTo(153, 91)
        ctx.quadraticCurveTo(172, 83, 191, 92)
      }
      ctx.stroke()

      // Tiny cute nose dot
      ctx.fillStyle = "rgba(180, 118, 88, 0.55)"
      ctx.beginPath()
      ctx.arc(128, 149, 3.2, 0, Math.PI * 2)
      ctx.fill()

      // Expressive mouth
      ctx.strokeStyle = "#7a3b2e"
      ctx.lineWidth = 4.8
      ctx.lineCap = "round"
      if (isEnergetic || variant === "female_cheerful") {
        ctx.fillStyle = "#e06b74"
        ctx.beginPath()
        ctx.arc(128, 166, 15, 0.08 * Math.PI, 0.92 * Math.PI)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else if (isCool) {
        ctx.beginPath()
        ctx.moveTo(114, 173)
        ctx.quadraticCurveTo(130, 177, 145, 166)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(128, 162, 15, 0.18 * Math.PI, 0.82 * Math.PI)
        ctx.stroke()
      }
    }
  }

  const tex = finalizeCanvasTexture(canvas, Boolean(ctx), { shared: true })
  faceTextureCache.set(variant, tex)
  return tex
}

// ---------- 2. Procedural Architectural Floor Textures (512x512) ----------

export function createFloorTexture(style: FloorTextureStyle): THREE.Texture {
  const cached = floorTextureCache.get(style)
  if (cached) return cached

  const { canvas, ctx } = createCanvasSurface(512, 512)
  if (ctx) {
    if (style === "marble_cream") {
      ctx.fillStyle = "#efe6d8"
      ctx.fillRect(0, 0, 512, 512)

      // Subtle checkerboard stone shade shift (2x2 tiles)
      const tile = 256
      for (let gy = 0; gy < 2; gy += 1) {
        for (let gx = 0; gx < 2; gx += 1) {
          ctx.fillStyle = (gx + gy) % 2 === 0 ? "#f3ebe0" : "#eae0d1"
          ctx.fillRect(gx * tile, gy * tile, tile, tile)
        }
      }
      // Subtle organic warm veins
      ctx.strokeStyle = "rgba(182, 164, 140, 0.22)"
      ctx.lineWidth = 2.5
      for (let i = 0; i < 8; i += 1) {
        ctx.beginPath()
        const sy = (i * 67 + 24) % 512
        ctx.moveTo(0, sy)
        ctx.bezierCurveTo(160, sy + 28, 340, sy - 24, 512, (sy + 14) % 512)
        ctx.stroke()
      }
      // Crisp grout lines
      ctx.strokeStyle = "rgba(176, 158, 134, 0.45)"
      ctx.lineWidth = 3
      ctx.strokeRect(1.5, 1.5, 509, 509)
      ctx.beginPath()
      ctx.moveTo(256, 0)
      ctx.lineTo(256, 512)
      ctx.moveTo(0, 256)
      ctx.lineTo(512, 256)
      ctx.stroke()
    } else if (style === "parquet") {
      // Office Boss Room warm walnut hardwood planks (#C99D6B)
      const plankH = 64
      const plankW = 256
      const shades = ["#c99d6b", "#c0925e", "#d1a676", "#b98a57"]
      for (let row = 0; row < 8; row += 1) {
        const offset = (row % 2) * 128
        for (let col = -1; col <= 2; col += 1) {
          const x = col * plankW + offset
          const y = row * plankH
          ctx.fillStyle = shades[(row * 3 + col + 4) % shades.length]
          ctx.fillRect(x, y, plankW, plankH)

          // Fine wood grain lines
          ctx.strokeStyle = "rgba(92, 56, 22, 0.13)"
          ctx.lineWidth = 1.5
          for (let g = 10; g < plankH; g += 14) {
            ctx.beginPath()
            ctx.moveTo(x, y + g)
            ctx.bezierCurveTo(
              x + plankW * 0.35,
              y + g + 3,
              x + plankW * 0.7,
              y + g - 3,
              x + plankW,
              y + g
            )
            ctx.stroke()
          }

          ctx.strokeStyle = "rgba(82, 48, 18, 0.30)"
          ctx.lineWidth = 2
          ctx.strokeRect(x, y, plankW, plankH)
        }
      }
    } else if (style === "carpet_slate") {
      // Office Meeting Room speckled blue-gray carpet (#5E6E86)
      ctx.fillStyle = "#5e6e86"
      ctx.fillRect(0, 0, 512, 512)
      for (let y = 0; y < 512; y += 16) {
        for (let x = 0; x < 512; x += 16) {
          const light = ((x / 16 + y / 16) & 1) === 0
          ctx.fillStyle = light
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(18, 28, 44, 0.14)"
          ctx.beginPath()
          ctx.arc(x + 8, y + 8, 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      // Subtle commercial carpet tile seam
      ctx.strokeStyle = "rgba(25, 36, 54, 0.22)"
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, 254, 254)
      ctx.strokeRect(257, 1, 254, 254)
      ctx.strokeRect(1, 257, 254, 254)
      ctx.strokeRect(257, 257, 254, 254)
    } else if (style === "stone_sand") {
      // Office Document Room warm sand tiles (#D8CBB4)
      ctx.fillStyle = "#d8cbb4"
      ctx.fillRect(0, 0, 512, 512)
      const step = 128
      for (let gy = 0; gy < 4; gy += 1) {
        for (let gx = 0; gx < 4; gx += 1) {
          ctx.fillStyle =
            (gx + gy) % 2 === 0 ? "rgba(255,250,240,0.22)" : "rgba(155,134,104,0.1)"
          ctx.fillRect(gx * step, gy * step, step, step)
          ctx.strokeStyle = "rgba(130, 112, 86, 0.34)"
          ctx.lineWidth = 2.5
          ctx.strokeRect(gx * step + 1, gy * step + 1, step - 2, step - 2)
        }
      }
      // Subtle sandstone speckles
      for (let i = 0; i < 180; i += 1) {
        const sx = (i * 97) % 512
        const sy = (i * 53 + 19) % 512
        ctx.fillStyle =
          i % 2 === 0 ? "rgba(120, 98, 70, 0.12)" : "rgba(255, 252, 244, 0.18)"
        ctx.fillRect(sx, sy, 3, 3)
      }
    } else if (style === "ceramic_cream") {
      // Office Staff Zone cream ceramic grid (#EEDFC6)
      ctx.fillStyle = "#eedfc6"
      ctx.fillRect(0, 0, 512, 512)
      const step = 128
      for (let gy = 0; gy < 4; gy += 1) {
        for (let gx = 0; gx < 4; gx += 1) {
          ctx.fillStyle =
            (gx + gy) % 2 === 0 ? "#f1e3cc" : "#ead9be"
          ctx.fillRect(gx * step, gy * step, step, step)
          ctx.strokeStyle = "rgba(156, 126, 86, 0.34)"
          ctx.lineWidth = 2.5
          ctx.strokeRect(gx * step + 1, gy * step + 1, step - 2, step - 2)
        }
      }
    } else {
      // Trading Floor royal crimson red carpet with gold border trim
      ctx.fillStyle = "#981b24"
      ctx.fillRect(0, 0, 512, 512)
      // Subtle plush weave pattern
      ctx.fillStyle = "rgba(255, 214, 150, 0.05)"
      for (let y = 0; y < 512; y += 32) {
        for (let x = 48; x < 464; x += 32) {
          ctx.beginPath()
          ctx.moveTo(x + 16, y + 4)
          ctx.lineTo(x + 28, y + 16)
          ctx.lineTo(x + 16, y + 28)
          ctx.lineTo(x + 4, y + 16)
          ctx.closePath()
          ctx.fill()
        }
      }
      // Crisp double gold border rails along left & right edges
      ctx.fillStyle = "#e9b949"
      ctx.fillRect(14, 0, 14, 512)
      ctx.fillRect(484, 0, 14, 512)
      ctx.fillStyle = "#f6d27a"
      ctx.fillRect(36, 0, 6, 512)
      ctx.fillRect(470, 0, 6, 512)
    }
  }

  const tex = finalizeCanvasTexture(canvas, Boolean(ctx), {
    repeat: true,
    shared: true,
  })
  floorTextureCache.set(style, tex)
  return tex
}

// ---------- 3. Crisp Floor Zone Decal Texture ----------

export function createFloorDecalTexture(
  text: string,
  color = "#7c5c32",
  subtext?: string
): THREE.Texture {
  const { canvas, ctx } = createCanvasSurface(512, 128)
  if (ctx) {
    ctx.clearRect(0, 0, 512, 128)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = color
    ctx.font = `800 ${text.length > 18 ? 30 : 36}px ${FONT_STACK}`
    ctx.fillText(text, 256, subtext ? 48 : 64, 484)

    if (subtext) {
      ctx.globalAlpha = 0.85
      ctx.font = `600 20px ${FONT_STACK}`
      ctx.fillText(subtext, 256, 92, 484)
      ctx.globalAlpha = 1
    }
  }
  return finalizeCanvasTexture(canvas, Boolean(ctx))
}

// ---------- 4. Crisp Sign, Nameplate, Banner & Medal Texture ----------

export function createSignTexture(
  text: string,
  opts?: SignTextureOptions
): THREE.Texture {
  const style = opts?.style ?? "navy_gold"
  const width = opts?.width ?? (style === "medal" ? 160 : 512)
  const height = opts?.height ?? (style === "medal" ? 160 : 128)
  const { canvas, ctx } = createCanvasSurface(width, height)

  if (ctx) {
    ctx.clearRect(0, 0, width, height)
    if (style === "medal") {
      const cx = width / 2
      const cy = height / 2
      const r = Math.min(width, height) * 0.44
      const accent = opts?.accentColor ?? "#f3c64a"

      const grad = ctx.createRadialGradient(
        cx - r * 0.25,
        cy - r * 0.25,
        r * 0.1,
        cx,
        cy,
        r
      )
      grad.addColorStop(0, "#fff8dc")
      grad.addColorStop(0.42, accent)
      grad.addColorStop(1, "#7c5a18")
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = "#fff4cc"
      ctx.lineWidth = Math.max(4, r * 0.1)
      ctx.stroke()

      ctx.fillStyle = opts?.textColor ?? "#261804"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `900 ${Math.round(r * 1.15)}px ${FONT_STACK}`
      ctx.fillText(text, cx, cy + 2)
    } else if (style === "emblem") {
      const grad = ctx.createLinearGradient(0, 0, width, height)
      grad.addColorStop(0, "#f6d27a")
      grad.addColorStop(1, "#d9a03a")
      drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 20)
      ctx.fillStyle = opts?.bgColor ?? "#0f1c38"
      ctx.fill()
      ctx.strokeStyle = grad
      ctx.lineWidth = 6
      ctx.stroke()

      ctx.fillStyle = opts?.textColor ?? "#f6d27a"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `900 ${Math.round(height * 0.56)}px ${FONT_STACK}`
      ctx.fillText(text, width / 2, height / 2 + 2, width - 32)
    } else if (style === "gold_banner") {
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, "#8f161f")
      grad.addColorStop(1, "#5c0c12")
      drawRoundedRect(ctx, 6, 6, width - 12, height - 12, 18)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = "#f3c64a"
      ctx.lineWidth = 6
      ctx.stroke()

      ctx.fillStyle = "#fde49b"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 ${Math.round(height * 0.34)}px ${FONT_STACK}`
      ctx.fillText(
        text,
        width / 2,
        opts?.subtext ? height * 0.38 : height / 2,
        width - 40
      )
      if (opts?.subtext) {
        ctx.fillStyle = "#fef3c7"
        ctx.font = `600 ${Math.round(height * 0.22)}px ${FONT_STACK}`
        ctx.fillText(opts.subtext, width / 2, height * 0.72, width - 40)
      }
    } else if (style === "gold_plate") {
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, "#f6d27a")
      grad.addColorStop(1, "#d9a03a")
      drawRoundedRect(ctx, 6, 6, width - 12, height - 12, 16)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = "#fff5d6"
      ctx.lineWidth = 4
      ctx.stroke()

      ctx.fillStyle = opts?.textColor ?? "#2a1c00"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 ${Math.round(height * 0.38)}px ${FONT_STACK}`
      ctx.fillText(text, width / 2, height / 2 + 1, width - 36)
    } else {
      // Default IQX dark navy & gold nameplate
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, opts?.bgColor ?? "#16244a")
      grad.addColorStop(1, "#0e1830")
      drawRoundedRect(ctx, 6, 6, width - 12, height - 12, 16)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = opts?.accentColor ?? "#e9b949"
      ctx.lineWidth = 5
      ctx.stroke()

      ctx.fillStyle = opts?.textColor ?? "#f6d27a"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 ${Math.round(height * (opts?.subtext ? 0.34 : 0.4))}px ${FONT_STACK}`
      ctx.fillText(
        text,
        width / 2,
        opts?.subtext ? height * 0.37 : height / 2 + 1,
        width - 36
      )
      if (opts?.subtext) {
        ctx.fillStyle = "#c9d6e4"
        ctx.font = `600 ${Math.round(height * 0.24)}px ${FONT_STACK}`
        ctx.fillText(opts.subtext, width / 2, height * 0.72, width - 36)
      }
    }
  }

  return finalizeCanvasTexture(canvas, Boolean(ctx))
}

// ---------- 5. Trading Floor LED VN30 Board Painter (1024x280) ----------

export function drawLedMarketBoard(
  canvas: HTMLCanvasElement,
  indices: readonly IndexQuote[] | null,
  vn30: readonly Quote[] | null
): void {
  if (canvas.width <= 0) canvas.width = 1024
  if (canvas.height <= 0) canvas.height = 280
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height

  // Deep obsidian LED backdrop
  ctx.fillStyle = "#090e18"
  ctx.fillRect(0, 0, w, h)

  // Subtle top bar glow
  const topGrad = ctx.createLinearGradient(0, 0, 0, 52)
  topGrad.addColorStop(0, "#151f33")
  topGrad.addColorStop(1, "#0b111e")
  ctx.fillStyle = topGrad
  ctx.fillRect(0, 0, w, 52)

  // Header left title
  const padX = Math.round(w * 0.022)
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  ctx.fillStyle = "#f3cd6a"
  ctx.font = `800 ${Math.round(h * 0.075)}px ${FONT_STACK}`
  ctx.fillText("IQX · BẢNG ĐIỆN VN30", padX, 27)

  // Header right VN-Index summary
  const vnIndex = indices?.find((q) => q.code === "VNINDEX") ?? null
  ctx.textAlign = "right"
  if (!vnIndex) {
    ctx.fillStyle = "#c9d6e4"
    ctx.font = `700 ${Math.round(h * 0.068)}px ${FONT_STACK}`
    ctx.fillText("VN-Index —", w - padX, 27)
  } else {
    const weather = marketWeather(vnIndex)
    ctx.fillStyle = PRICE_COLORS[indexTone(vnIndex)]
    ctx.font = `700 ${Math.round(h * 0.072)}px ${FONT_STACK}`
    ctx.fillText(
      `VN-Index ${formatIndex(vnIndex.value)} ${formatPercent(vnIndex.pct)} · ${weather.label}`,
      w - padX,
      27
    )
  }

  // 10 x 3 VN30 Heatmap Grid
  const cols = 10
  const rows = 3
  const gap = 6
  const gridTop = 58
  const gridBottom = h - 12
  const innerW = w - padX * 2
  const tileW = (innerW - gap * (cols - 1)) / cols
  const tileH = (gridBottom - gridTop - gap * (rows - 1)) / rows

  ctx.textAlign = "center"
  for (let i = 0; i < cols * rows; i += 1) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = padX + col * (tileW + gap)
    const y = gridTop + row * (tileH + gap)
    const cx = x + tileW / 2
    const quote = vn30?.[i]

    drawRoundedRect(ctx, x, y, tileW, tileH, 7)
    if (!quote) {
      ctx.fillStyle = "#162033"
      ctx.fill()
      ctx.fillStyle = "#64748b"
      ctx.font = `700 ${Math.round(tileH * 0.34)}px ${FONT_STACK}`
      ctx.fillText(vn30 ? "" : "·", cx, y + tileH * 0.52)
      continue
    }

    const { bg, fg } = heatColour(quote)
    ctx.fillStyle = bg
    ctx.fill()

    // Crisp gloss top hairline on tile
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)"
    ctx.fillRect(x + 4, y + 2, tileW - 8, 2)

    ctx.fillStyle = fg
    ctx.font = `800 ${Math.round(tileH * 0.28)}px ${FONT_STACK}`
    ctx.fillText(quote.symbol, cx, y + tileH * 0.26, tileW - 8)

    ctx.font = `600 ${Math.round(tileH * 0.22)}px ${FONT_STACK}`
    ctx.fillText(heatPrice(quote.price), cx, y + tileH * 0.56, tileW - 8)

    ctx.font = `700 ${Math.round(tileH * 0.22)}px ${FONT_STACK}`
    ctx.fillText(heatPct(quote.pct), cx, y + tileH * 0.82, tileW - 8)
  }
}

// ---------- 6. Trading Floor SACO Nhận Định Board Painter (768x288) ----------

export function drawSacoBoard(
  canvas: HTMLCanvasElement,
  posts: readonly PostCard[]
): void {
  if (canvas.width <= 0) canvas.width = 768
  if (canvas.height <= 0) canvas.height = 288
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height

  // Deep IQX navy gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, "#14244a")
  bg.addColorStop(1, "#0c162c")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Inner gold trim border
  drawRoundedRect(ctx, 10, 10, w - 20, h - 20, 14)
  ctx.strokeStyle = "rgba(233, 185, 73, 0.55)"
  ctx.lineWidth = 3
  ctx.stroke()

  // Gold header banner pill
  const pillW = Math.round(w * 0.48)
  const pillH = 48
  const pillX = (w - pillW) / 2
  const pillY = 18
  const goldGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH)
  goldGrad.addColorStop(0, "#f3cd6a")
  goldGrad.addColorStop(1, "#d9a03a")
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 12)
  ctx.fillStyle = goldGrad
  ctx.fill()

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#1a1406"
  ctx.font = `800 24px ${FONT_STACK}`
  ctx.fillText("SACO NHẬN ĐỊNH", w / 2, pillY + pillH / 2 + 1)

  // Top 3 headlines
  const left = 36
  const maxTextW = w - 84
  ctx.textAlign = "left"
  if (!posts.length) {
    ctx.fillStyle = "#c9d6e4"
    ctx.font = `600 22px ${FONT_STACK}`
    ctx.fillText("Chưa có nhận định hôm nay", left, 140)
  } else {
    const topThree = posts.slice(0, 3)
    topThree.forEach((post, idx) => {
      const rowY = 104 + idx * 48
      // Subtle row pill divider
      drawRoundedRect(ctx, 26, rowY - 19, w - 52, 38, 8)
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)"
      ctx.fill()

      // Gold bullet dot
      ctx.fillStyle = "#f3cd6a"
      ctx.beginPath()
      ctx.arc(44, rowY, 5, 0, Math.PI * 2)
      ctx.fill()

      // Prefix + ellipsized headline
      ctx.font = `700 20px ${FONT_STACK}`
      const prefix = `${post.sacoName}: `
      const prefixW = Math.min(ctx.measureText(prefix).width, maxTextW * 0.42)
      ctx.fillStyle = "#f6d27a"
      ctx.fillText(trimToWidth(ctx, prefix, prefixW + 4), 58, rowY)

      ctx.font = `500 20px ${FONT_STACK}`
      ctx.fillStyle = "#f1f5f9"
      const remaining = Math.max(80, maxTextW - prefixW - 24)
      ctx.fillText(
        trimToWidth(ctx, post.headline, remaining),
        58 + prefixW + 2,
        rowY
      )
    })
  }

  // Bottom-right CTA
  ctx.textAlign = "right"
  ctx.fillStyle = "#f3cd6a"
  ctx.font = `700 18px ${FONT_STACK}`
  ctx.fillText("Chạm để xem chi tiết ›", w - 34, h - 28)
}

// ---------- 7. Office Meeting Room Wall Screen Painter (640x160) ----------

export function drawOfficeMeetingScreen(
  canvas: HTMLCanvasElement,
  title: string,
  subtitle: string
): void {
  if (canvas.width <= 0) canvas.width = 640
  if (canvas.height <= 0) canvas.height = 160
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height

  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, "#101a34")
  bg.addColorStop(1, "#0b1224")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Subtle top accent bar
  ctx.fillStyle = "#e9b949"
  ctx.fillRect(0, 0, w, 5)

  // Live green dot + badge
  ctx.fillStyle = "#34c38f"
  ctx.beginPath()
  ctx.arc(34, 34, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#c9d6e4"
  ctx.font = `700 16px ${FONT_STACK}`
  ctx.fillText("PHÒNG HỌP · IQX", 50, 34)

  // Main title
  ctx.fillStyle = "#f6d27a"
  ctx.font = `800 34px ${FONT_STACK}`
  ctx.fillText(trimToWidth(ctx, title || "Phòng họp nhóm", w - 64), 30, 84)

  // Subtitle
  ctx.fillStyle = "#f1f5f9"
  ctx.font = `600 20px ${FONT_STACK}`
  ctx.fillText(trimToWidth(ctx, subtitle || "", w - 64), 30, 126)
}

// ---------- 8. Office Achievement Standee Painter (460x748) ----------

export function drawOfficeStandee(
  canvas: HTMLCanvasElement,
  payload: OfficeStandeePayload
): void {
  if (canvas.width <= 0) canvas.width = 460
  if (canvas.height <= 0) canvas.height = 748
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height

  // Dark navy gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, "#16244a")
  bg.addColorStop(0.55, "#101c3a")
  bg.addColorStop(1, "#0c152b")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Warm gold top radial glow
  const glow = ctx.createRadialGradient(w / 2, 70, 10, w / 2, 70, 240)
  glow.addColorStop(0, "rgba(243, 205, 106, 0.24)")
  glow.addColorStop(1, "rgba(243, 205, 106, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, 320)

  // Crisp gold inner border
  drawRoundedRect(ctx, 12, 12, w - 24, h - 24, 22)
  ctx.strokeStyle = "#e9b949"
  ctx.lineWidth = 6
  ctx.stroke()

  // Team Eyebrow
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#f3cd6a"
  ctx.font = `800 21px ${FONT_STACK}`
  ctx.fillText(trimToWidth(ctx, payload.teamTitle, w - 64), w / 2, 62)

  // Gold divider accent
  ctx.fillStyle = "rgba(233, 185, 73, 0.55)"
  ctx.fillRect(w / 2 - 64, 86, 128, 3)

  // Month Headline
  ctx.fillStyle = "#ffffff"
  ctx.font = `900 36px ${FONT_STACK}`
  ctx.fillText(trimToWidth(ctx, payload.monthLabel, w - 56), w / 2, 130)

  // Subtitle
  ctx.fillStyle = "#c9d6e4"
  ctx.font = `600 20px ${FONT_STACK}`
  ctx.fillText(payload.subtitle ?? "Top 3 điểm nhiệm vụ", w / 2, 170)

  // Top 3 rows
  const medalColors: Readonly<Record<1 | 2 | 3, { bg: string; fg: string }>> = {
    1: { bg: "#f6d27a", fg: "#2a1c00" },
    2: { bg: "#d9dee7", fg: "#1b2433" },
    3: { bg: "#e0a26b", fg: "#2b1605" },
  }

  if (!payload.top3.length) {
    drawRoundedRect(ctx, 32, 232, w - 64, 130, 16)
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)"
    ctx.fill()
    ctx.fillStyle = "#c9d6e4"
    ctx.font = `600 21px ${FONT_STACK}`
    ctx.fillText(
      payload.emptyText ?? "Chưa có ai ghi điểm tháng này",
      w / 2,
      298
    )
  } else {
    payload.top3.slice(0, 3).forEach((entry, idx) => {
      const cardY = 216 + idx * 104
      const medal = medalColors[entry.rank]

      drawRoundedRect(ctx, 30, cardY, w - 60, 86, 16)
      ctx.fillStyle =
        entry.rank === 1
          ? "rgba(233, 185, 73, 0.18)"
          : "rgba(255, 255, 255, 0.07)"
      ctx.fill()
      ctx.strokeStyle =
        entry.rank === 1
          ? "rgba(246, 210, 122, 0.72)"
          : "rgba(148, 179, 218, 0.25)"
      ctx.lineWidth = 2
      ctx.stroke()

      // Rank circle
      ctx.fillStyle = medal.bg
      ctx.beginPath()
      ctx.arc(74, cardY + 43, 24, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = medal.fg
      ctx.textAlign = "center"
      ctx.font = `900 24px ${FONT_STACK}`
      ctx.fillText(String(entry.rank), 74, cardY + 45)

      // Name
      ctx.textAlign = "left"
      ctx.fillStyle = "#f1f5f9"
      ctx.font = `700 22px ${FONT_STACK}`
      ctx.fillText(trimToWidth(ctx, entry.name, w - 224), 112, cardY + 44)

      // Points
      ctx.textAlign = "right"
      ctx.fillStyle = medal.bg
      ctx.font = `800 24px ${FONT_STACK}`
      ctx.fillText(`${entry.points} đ`, w - 48, cardY + 44)
    })
  }

  // Personal rank blue pill (for staff)
  if (payload.personalRank) {
    const pillY = 556
    drawRoundedRect(ctx, 36, pillY, w - 72, 64, 16)
    ctx.fillStyle = "#1d6fe8"
    ctx.fill()
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.textAlign = "center"
    ctx.fillStyle = "#ffffff"
    ctx.font = `800 22px ${FONT_STACK}`
    ctx.fillText(
      `Hạng của bạn: #${payload.personalRank.rank} · ${payload.personalRank.points} đ`,
      w / 2,
      pillY + 33
    )
  }

  // Footer
  ctx.fillStyle = "rgba(233, 185, 73, 0.28)"
  ctx.fillRect(46, h - 88, w - 92, 2)
  ctx.textAlign = "center"
  ctx.fillStyle = "#c9d6e4"
  ctx.font = `600 18px ${FONT_STACK}`
  ctx.fillText(
    payload.footerText ?? "Reset ngày 01 hằng tháng",
    w / 2,
    h - 52
  )
}
