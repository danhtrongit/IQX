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

export type WallTextureStyle = "ivory_plaster" | "navy_wainscot" | "cream_paint"
export type WoodSurfaceTone = "walnut" | "oak" | "rosewood" | "honey"
export type FabricSurfacePattern = "weave" | "velvet" | "rug"
export type MarbleSurfaceTone = "cream" | "white_gold"
export type MonitorScreenVariant = "boss" | "staff" | "reception"

export interface HighDprSignOptions extends SignTextureOptions {
  dpr?: number
  anisotropy?: number
  maxWidth?: number
}

export interface StaticCanvasMeta {
  width: number
  height: number
  released: boolean
  pendingUploads: number
  repaint?: (canvas: HTMLCanvasElement) => void
}

export const STATIC_CANVAS_KEY = "__chibiStaticCanvas"
const BASE_TEXTURE_KEY = "__chibiBaseTexture"

interface CachedTextureEntry {
  texture: THREE.Texture
  refCount: number
}

interface CachedTextureHandle {
  map: Map<unknown, CachedTextureEntry>
  key: unknown
  entry: CachedTextureEntry
}

const faceTextureCache = new Map<ChibiFaceVariant, CachedTextureEntry>()
const floorTextureCache = new Map<FloorTextureStyle, CachedTextureEntry>()
const wallTextureCache = new Map<WallTextureStyle, CachedTextureEntry>()
const woodTextureCache = new Map<WoodSurfaceTone, CachedTextureEntry>()
const fabricTextureCache = new Map<string, CachedTextureEntry>()
const marbleTextureCache = new Map<MarbleSurfaceTone, CachedTextureEntry>()
const monitorScreenCache = new Map<MonitorScreenVariant, CachedTextureEntry>()
const altarClothCache = new Map<"default", CachedTextureEntry>()

const cachedTextureRegistry = new WeakMap<THREE.Texture, CachedTextureHandle>()

const MAX_FABRIC_CACHE = 48

export interface TextureCacheStats {
  face: number
  floor: number
  wall: number
  wood: number
  fabric: number
  marble: number
  monitor: number
  altarCloth: number
  total: number
}

export function getTextureCacheStats(): TextureCacheStats {
  const face = faceTextureCache.size
  const floor = floorTextureCache.size
  const wall = wallTextureCache.size
  const wood = woodTextureCache.size
  const fabric = fabricTextureCache.size
  const marble = marbleTextureCache.size
  const monitor = monitorScreenCache.size
  const altarCloth = altarClothCache.size
  return {
    face,
    floor,
    wall,
    wood,
    fabric,
    marble,
    monitor,
    altarCloth,
    total: face + floor + wall + wood + fabric + marble + monitor + altarCloth,
  }
}

function releaseCanvasBackingStore(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/**
 * Marks a static `CanvasTexture` so its CPU-side HTMLCanvasElement backing store is released
 * immediately after GPU upload (`onUpdate`), while retaining an optional `repaint` callback
 * for WebGL context-loss restoration.
 */
export function markStaticCanvasTexture<T extends THREE.Texture>(
  tex: T,
  repaint?: (canvas: HTMLCanvasElement) => void
): T {
  if (!(tex instanceof THREE.CanvasTexture)) return tex
  const canvas = tex.image as HTMLCanvasElement | undefined
  if (!canvas || typeof canvas.width !== "number" || typeof canvas.height !== "number") {
    return tex
  }
  const meta: StaticCanvasMeta = {
    width: canvas.width,
    height: canvas.height,
    released: false,
    pendingUploads: 0,
    repaint,
  }
  ;(tex.userData as Record<string, unknown>)[STATIC_CANVAS_KEY] = meta
  tex.onUpdate = () => {
    if (!meta.released && meta.pendingUploads <= 0) {
      if (canvas.width > 0 && canvas.height > 0) {
        releaseCanvasBackingStore(canvas)
      }
      meta.released = true
    }
    tex.onUpdate = null
  }
  const origDispose = tex.dispose.bind(tex)
  tex.dispose = () => {
    if (!meta.released && canvas.width > 0) {
      releaseCanvasBackingStore(canvas)
      meta.released = true
    }
    tex.onUpdate = null
    origDispose()
  }
  return tex
}

function attachCloneReleaseHook(
  tex: THREE.Texture,
  base: THREE.CanvasTexture,
  meta: StaticCanvasMeta
): void {
  const canvas = base.image as HTMLCanvasElement | undefined
  if (!canvas) return
  let pending = true
  meta.pendingUploads += 1
  const finish = (): void => {
    if (!pending) return
    pending = false
    meta.pendingUploads = Math.max(0, meta.pendingUploads - 1)
    if (!meta.released && meta.pendingUploads <= 0) {
      if (canvas.width > 0 && canvas.height > 0) {
        releaseCanvasBackingStore(canvas)
      }
      meta.released = true
      base.onUpdate = null
    }
    tex.onUpdate = null
  }
  tex.onUpdate = finish
  const origDispose = tex.dispose.bind(tex)
  tex.dispose = (): void => {
    if (pending) {
      pending = false
      meta.pendingUploads = Math.max(0, meta.pendingUploads - 1)
      tex.onUpdate = null
    }
    origDispose()
  }
}

/** Repaints a released static `CanvasTexture` into its backing canvas (e.g. after WebGL context restore). */
export function restoreStaticTexture(tex: THREE.Texture): boolean {
  const base =
    ((tex.userData as Record<string, unknown>)[BASE_TEXTURE_KEY] as
      | THREE.Texture
      | undefined) ?? tex
  const meta = (base.userData as Record<string, unknown>)[STATIC_CANVAS_KEY] as
    | StaticCanvasMeta
    | undefined
  if (!meta || !meta.released || !meta.repaint) return false
  if (!(base instanceof THREE.CanvasTexture)) return false
  const canvas = base.image as HTMLCanvasElement | undefined
  if (!canvas) return false
  canvas.width = meta.width
  canvas.height = meta.height
  meta.repaint(canvas)
  meta.released = false
  base.onUpdate = () => {
    if (!meta.released && meta.pendingUploads <= 0) {
      if (canvas.width > 0 && canvas.height > 0) {
        releaseCanvasBackingStore(canvas)
      }
      meta.released = true
    }
    base.onUpdate = null
  }
  base.needsUpdate = true
  if (tex !== base) {
    attachCloneReleaseHook(tex, base, meta)
  }
  return true
}

/** Traverses a Three.js scene/subtree and restores any released static CanvasTextures (for WebGL context restore). */
export function restoreStaticTextures(root: THREE.Object3D): number {
  const visited = new Set<THREE.Texture>()
  let restored = 0
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    const rawMat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (!rawMat) return
    const mats = Array.isArray(rawMat) ? rawMat : [rawMat]
    for (const mat of mats) {
      if (!mat) continue
      const std = mat as THREE.MeshStandardMaterial & {
        map?: THREE.Texture | null
        emissiveMap?: THREE.Texture | null
        roughnessMap?: THREE.Texture | null
        metalnessMap?: THREE.Texture | null
        alphaMap?: THREE.Texture | null
      }
      for (const tex of [
        std.map,
        std.emissiveMap,
        std.roughnessMap,
        std.metalnessMap,
        std.alphaMap,
      ]) {
        if (!tex || visited.has(tex)) continue
        visited.add(tex)
        if (restoreStaticTexture(tex)) {
          restored += 1
        }
      }
    }
  })
  return restored
}

/**
 * Clones a cached repeated texture sharing the exact same GPU `Source` without forcing
 * redundant uploads, and forwards the first-upload static canvas release hook cleanly.
 */
export function cloneSharedRepeatedTexture(
  base: THREE.Texture,
  repeatX: number,
  repeatY: number,
  anisotropy?: number
): THREE.Texture {
  const tex = base.clone()
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  if (anisotropy !== undefined) {
    tex.anisotropy = anisotropy
  }
  tex.userData = { [BASE_TEXTURE_KEY]: base }
  const meta = (base.userData as Record<string, unknown>)[STATIC_CANVAS_KEY] as
    | StaticCanvasMeta
    | undefined
  if (meta && base instanceof THREE.CanvasTexture) {
    const canvas = base.image as HTMLCanvasElement | undefined
    if (canvas) {
      if (meta.released && meta.repaint) {
        canvas.width = meta.width
        canvas.height = meta.height
        meta.repaint(canvas)
        meta.released = false
      }
      if (!meta.released) {
        attachCloneReleaseHook(tex, base, meta)
      }
    }
  }
  return tex
}

function disposeTextureAndCanvas(tex: THREE.Texture): void {
  const meta = (tex.userData as Record<string, unknown>)[STATIC_CANVAS_KEY] as
    | StaticCanvasMeta
    | undefined
  if (meta && !meta.released && tex instanceof THREE.CanvasTexture) {
    const canvas = tex.image as HTMLCanvasElement | undefined
    if (canvas && canvas.width > 0) {
      releaseCanvasBackingStore(canvas)
    }
    meta.released = true
  }
  tex.onUpdate = null
  tex.dispose()
}

function registerCachedTexture<K>(
  map: Map<K, CachedTextureEntry>,
  key: K,
  texture: THREE.Texture
): THREE.Texture {
  const entry: CachedTextureEntry = { texture, refCount: 0 }
  map.set(key, entry)
  cachedTextureRegistry.set(texture, {
    map: map as unknown as Map<unknown, CachedTextureEntry>,
    key,
    entry,
  })
  return texture
}

/** Increments ref-count on a cached procedural texture owned by a room or shared material. */
export function retainCachedTexture(tex: THREE.Texture | null | undefined): void {
  if (!tex) return
  const base =
    ((tex.userData as Record<string, unknown>)[BASE_TEXTURE_KEY] as
      | THREE.Texture
      | undefined) ?? tex
  const handle = cachedTextureRegistry.get(base)
  if (!handle) return
  handle.entry.refCount += 1
  if (handle.entry.refCount === 1) {
    restoreStaticTexture(base)
  }
}

/** Decrements ref-count on a cached procedural texture and disposes it when count reaches 0. */
export function releaseCachedTexture(tex: THREE.Texture | null | undefined): void {
  if (!tex) return
  const base =
    ((tex.userData as Record<string, unknown>)[BASE_TEXTURE_KEY] as
      | THREE.Texture
      | undefined) ?? tex
  const handle = cachedTextureRegistry.get(base)
  if (!handle || handle.entry.refCount <= 0) return
  handle.entry.refCount -= 1
  if (handle.entry.refCount === 0) {
    handle.map.delete(handle.key)
    cachedTextureRegistry.delete(base)
    disposeTextureAndCanvas(handle.entry.texture)
  }
}

interface CanvasSurface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
}

/** Deterministic PRNG for repeatable procedural surface textures. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function resolveSupersampleDpr(
  baseWidth: number,
  baseHeight: number,
  explicitDpr?: number,
  maxDimCap = 1024
): number {
  const envDpr =
    typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio
      : 2
  const desired = clamp(explicitDpr ?? Math.min(2, Math.max(1.5, envDpr)), 1, 2)
  const maxDim = Math.max(baseWidth, baseHeight, 1)
  const cap = maxDimCap / maxDim
  return clamp(Math.min(desired, cap), 1, 2)
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
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
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
  opts?: {
    repeat?: boolean
    anisotropy?: number
    shared?: boolean
    repaint?: (canvas: HTMLCanvasElement) => void
  }
): THREE.Texture {
  const tex: THREE.Texture = hasContext
    ? new THREE.CanvasTexture(canvas)
    : createFallbackTexture(255, 255, 255, 255)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = opts?.anisotropy ?? 8
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  if (opts?.repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
  }
  tex.needsUpdate = true
  if (hasContext) {
    markStaticCanvasTexture(tex, opts?.repaint)
  }
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
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
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

function disposeCacheMap<K>(map: Map<K, CachedTextureEntry>): void {
  for (const entry of map.values()) {
    cachedTextureRegistry.delete(entry.texture)
    disposeTextureAndCanvas(entry.texture)
  }
  map.clear()
}

/** Disposes cached procedural surface textures (wall, wood, fabric, marble, monitor, altar cloth). */
export function disposeProceduralTextureCaches(): void {
  disposeCacheMap(wallTextureCache)
  disposeCacheMap(woodTextureCache)
  disposeCacheMap(fabricTextureCache)
  disposeCacheMap(marbleTextureCache)
  disposeCacheMap(monitorScreenCache)
  disposeCacheMap(altarClothCache)
}

/** Disposes every cached texture including faces and floors (used when resetting all 3D spaces). */
export function disposeAllTextureCaches(): void {
  disposeCacheMap(faceTextureCache)
  disposeCacheMap(floorTextureCache)
  disposeProceduralTextureCaches()
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

  ctx.save()
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.ellipse(cx, cy + 1, rx * 1.12, ry * 1.06, 0, 0, Math.PI * 2)
  ctx.fill()

  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry)
  grad.addColorStop(0, irisTop)
  grad.addColorStop(0.58, irisTop)
  grad.addColorStop(1, irisBottom)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "#0e1118"
  ctx.beginPath()
  ctx.ellipse(cx, cy - 1, rx * 0.56, ry * 0.56, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = "rgba(255, 255, 255, 0.36)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + ry * 0.48, rx * 0.54, ry * 0.24, 0, 0, Math.PI * 2)
  ctx.fill()

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
  if (cached) return cached.texture

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
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
      for (const cx of [62, 194]) {
        const g = ctx.createRadialGradient(cx, 154, 4, cx, 154, 28)
        g.addColorStop(0, "rgba(239, 68, 68, 0.56)")
        g.addColorStop(1, "rgba(239, 68, 68, 0)")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, 154, 28, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 11
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(58, 92)
      ctx.quadraticCurveTo(84, 76, 108, 90)
      ctx.moveTo(148, 90)
      ctx.quadraticCurveTo(172, 76, 198, 92)
      ctx.stroke()

      ctx.strokeStyle = "#2b1610"
      ctx.lineWidth = 8.5
      ctx.beginPath()
      ctx.arc(84, 134, 20, Math.PI * 1.12, Math.PI * 1.88)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(172, 134, 20, Math.PI * 1.12, Math.PI * 1.88)
      ctx.stroke()

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

      ctx.fillStyle = "rgba(180, 118, 88, 0.55)"
      ctx.beginPath()
      ctx.arc(128, 149, 3.2, 0, Math.PI * 2)
      ctx.fill()

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
    return true
  }

  const { canvas } = createCanvasSurface(256, 256)
  const hasCtx = paint(canvas)
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    anisotropy: 8,
    shared: true,
    repaint: (c) => {
      paint(c)
    },
  })
  return registerCachedTexture(faceTextureCache, variant, tex)
}

// ---------- 2. Procedural Architectural Floor Textures (512x512) ----------

function drawMarbleVeinsInRect(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  rand: () => number,
  veinCount: number
): void {
  for (let i = 0; i < veinCount; i += 1) {
    const startY = ry + rand() * rh
    const endY = ry + rand() * rh
    const c1x = rx + rw * (0.25 + rand() * 0.25)
    const c1y = ry + rand() * rh
    const c2x = rx + rw * (0.55 + rand() * 0.25)
    const c2y = ry + rand() * rh

    // Soft broad under-vein
    ctx.strokeStyle = "rgba(188, 170, 144, 0.18)"
    ctx.lineWidth = 5 + rand() * 4
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(rx, startY)
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, rx + rw, endY)
    ctx.stroke()

    // Crisp mineral hairline vein
    ctx.strokeStyle =
      i % 3 === 0 ? "rgba(206, 178, 126, 0.26)" : "rgba(154, 136, 114, 0.24)"
    ctx.lineWidth = 1.1 + rand() * 1.3
    ctx.beginPath()
    ctx.moveTo(rx, startY + 1)
    ctx.bezierCurveTo(c1x + 4, c1y - 3, c2x - 4, c2y + 3, rx + rw, endY - 1)
    ctx.stroke()

    // Delicate offshoot branch
    if (rand() > 0.35) {
      const bx = rx + rw * (0.35 + rand() * 0.3)
      const by = (c1y + c2y) * 0.5
      ctx.strokeStyle = "rgba(164, 146, 122, 0.17)"
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.quadraticCurveTo(
        bx + (rand() - 0.5) * rw * 0.3,
        by + (rand() - 0.5) * rh * 0.25,
        clamp(bx + (rand() - 0.3) * rw * 0.45, rx + 4, rx + rw - 4),
        clamp(by + (rand() - 0.5) * rh * 0.35, ry + 4, ry + rh - 4)
      )
      ctx.stroke()
    }
  }
}

export function createFloorTexture(style: FloorTextureStyle): THREE.Texture {
  const cached = floorTextureCache.get(style)
  if (cached) return cached.texture

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    if (style === "marble_cream") {
      // Luminous Italian Crema Marfil marble slabs (2x2) with organic veins & bevel polish
      const rand = mulberry32(4109)
      const slabTones = ["#f4ece1", "#ede3d4", "#f0e6d9", "#ebe0d0"]
      const tile = 256
      for (let gy = 0; gy < 2; gy += 1) {
        for (let gx = 0; gx < 2; gx += 1) {
          const tx = gx * tile
          const ty = gy * tile
          ctx.fillStyle = slabTones[gy * 2 + gx]!
          ctx.fillRect(tx, ty, tile, tile)

          // Satin polished sheen wash across slab
          const sheen = ctx.createLinearGradient(tx, ty, tx + tile, ty + tile)
          sheen.addColorStop(0, "rgba(255, 253, 248, 0.22)")
          sheen.addColorStop(0.5, "rgba(255, 250, 240, 0)")
          sheen.addColorStop(1, "rgba(176, 152, 120, 0.10)")
          ctx.fillStyle = sheen
          ctx.fillRect(tx, ty, tile, tile)

          drawMarbleVeinsInRect(ctx, tx, ty, tile, tile, rand, 4)

          // Subtle natural mineral flecks
          for (let f = 0; f < 18; f += 1) {
            ctx.fillStyle =
              f % 2 === 0
                ? "rgba(255, 252, 246, 0.28)"
                : "rgba(168, 148, 120, 0.12)"
            ctx.beginPath()
            ctx.arc(
              tx + rand() * tile,
              ty + rand() * tile,
              0.8 + rand() * 1.4,
              0,
              Math.PI * 2
            )
            ctx.fill()
          }

          // Top/left bevel specular highlight
          ctx.strokeStyle = "rgba(255, 253, 248, 0.52)"
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(tx + 3, ty + tile - 3)
          ctx.lineTo(tx + 3, ty + 3)
          ctx.lineTo(tx + tile - 3, ty + 3)
          ctx.stroke()
        }
      }

      // Clean warm stone grout lines
      ctx.strokeStyle = "rgba(168, 149, 124, 0.52)"
      ctx.lineWidth = 3
      ctx.strokeRect(1.5, 1.5, 509, 509)
      ctx.beginPath()
      ctx.moveTo(256, 0)
      ctx.lineTo(256, 512)
      ctx.moveTo(0, 256)
      ctx.lineTo(512, 256)
      ctx.stroke()
    } else if (style === "parquet") {
      // Rich warm walnut-honey hardwood planks with cathedral wood grain & bevel joints
      const rand = mulberry32(8217)
      const plankH = 64
      const plankW = 256
      const shades = [
        "#cb9f6d",
        "#bf915e",
        "#d3a878",
        "#b68653",
        "#c69864",
        "#cea372",
        "#ba8b58",
        "#c39460",
      ]
      for (let row = 0; row < 8; row += 1) {
        const offset = (row % 2) * 128 + (row % 4 === 2 ? 48 : 0)
        for (let col = -1; col <= 2; col += 1) {
          const x = col * plankW + offset
          const y = row * plankH
          const tone = shades[(row * 5 + col + 8) % shades.length]!
          ctx.fillStyle = tone
          ctx.fillRect(x, y, plankW, plankH)

          // Lengthwise warm polish gradient
          const finish = ctx.createLinearGradient(x, y, x, y + plankH)
          finish.addColorStop(0, "rgba(255, 238, 206, 0.14)")
          finish.addColorStop(0.45, "rgba(255, 240, 210, 0)")
          finish.addColorStop(1, "rgba(74, 42, 14, 0.14)")
          ctx.fillStyle = finish
          ctx.fillRect(x, y, plankW, plankH)

          // Flowing wood grain fibers
          for (let g = 6; g < plankH - 4; g += 8) {
            const wave = (rand() - 0.5) * 7
            ctx.strokeStyle =
              g % 16 === 6
                ? "rgba(84, 48, 18, 0.16)"
                : "rgba(255, 232, 192, 0.09)"
            ctx.lineWidth = g % 16 === 6 ? 1.5 : 1.0
            ctx.beginPath()
            ctx.moveTo(x, y + g)
            ctx.bezierCurveTo(
              x + plankW * 0.33,
              y + g + wave,
              x + plankW * 0.66,
              y + g - wave,
              x + plankW,
              y + g
            )
            ctx.stroke()
          }

          // Occasional subtle timber knot
          if (rand() > 0.72) {
            const kx = x + 36 + rand() * (plankW - 72)
            const ky = y + 18 + rand() * (plankH - 36)
            ctx.fillStyle = "rgba(88, 52, 20, 0.22)"
            ctx.beginPath()
            ctx.ellipse(kx, ky, 9, 4.2, 0.08, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = "rgba(74, 42, 15, 0.20)"
            ctx.lineWidth = 1.1
            ctx.beginPath()
            ctx.ellipse(kx, ky, 15, 6.5, 0.08, 0, Math.PI * 2)
            ctx.stroke()
          }

          // Subtle micro-pores
          ctx.fillStyle = "rgba(72, 40, 14, 0.12)"
          for (let p = 0; p < 12; p += 1) {
            ctx.fillRect(x + rand() * plankW, y + rand() * plankH, 6, 1)
          }

          // Top chamfer highlight + dark plank seam
          ctx.fillStyle = "rgba(255, 238, 206, 0.20)"
          ctx.fillRect(x + 1, y + 1.5, plankW - 2, 1.5)
          ctx.strokeStyle = "rgba(74, 42, 16, 0.36)"
          ctx.lineWidth = 2
          ctx.strokeRect(x, y, plankW, plankH)
        }
      }
    } else if (style === "carpet_slate") {
      // Architectural modular woven slate carpet tiles (2x2 alternating pile direction)
      const rand = mulberry32(9913)
      ctx.fillStyle = "#5c6d85"
      ctx.fillRect(0, 0, 512, 512)

      for (let gy = 0; gy < 2; gy += 1) {
        for (let gx = 0; gx < 2; gx += 1) {
          const tx = gx * 256
          const ty = gy * 256
          const horizontal = (gx + gy) % 2 === 0
          ctx.fillStyle = horizontal ? "#5f7088" : "#586880"
          ctx.fillRect(tx, ty, 256, 256)

          // Fine loop-pile yarn ribs
          for (let step = 4; step < 256; step += 6) {
            ctx.fillStyle =
              step % 12 === 4
                ? "rgba(255, 255, 255, 0.055)"
                : "rgba(18, 28, 46, 0.085)"
            if (horizontal) {
              ctx.fillRect(tx, ty + step, 256, 2)
            } else {
              ctx.fillRect(tx + step, ty, 2, 256)
            }
          }

          // Heather carpet tuft speckles
          for (let i = 0; i < 160; i += 1) {
            const sx = tx + rand() * 256
            const sy = ty + rand() * 256
            ctx.fillStyle =
              i % 3 === 0
                ? "rgba(226, 236, 248, 0.12)"
                : "rgba(20, 30, 48, 0.16)"
            ctx.fillRect(sx, sy, 2.5, 2.5)
          }

          // Subtle modular tile seam
          ctx.strokeStyle = "rgba(22, 32, 50, 0.28)"
          ctx.lineWidth = 2
          ctx.strokeRect(tx + 1, ty + 1, 254, 254)
        }
      }
    } else if (style === "stone_sand") {
      // Warm travertine sandstone tiles (4x4) with subtle per-tile shade variation & mineral veins
      const rand = mulberry32(5521)
      const step = 128
      const tones = ["#dcd0ba", "#d5c7af", "#dfd4bf", "#d2c3aa", "#d9ccb4"]
      for (let gy = 0; gy < 4; gy += 1) {
        for (let gx = 0; gx < 4; gx += 1) {
          const tx = gx * step
          const ty = gy * step
          ctx.fillStyle = tones[(gy * 4 + gx * 3 + Math.floor(rand() * 2)) % tones.length]!
          ctx.fillRect(tx, ty, step, step)

          // Soft sedimentary horizontal bands
          for (let b = 0; b < 5; b += 1) {
            const by = ty + 10 + rand() * (step - 20)
            ctx.fillStyle =
              b % 2 === 0
                ? "rgba(255, 250, 238, 0.16)"
                : "rgba(138, 118, 90, 0.10)"
            ctx.fillRect(tx + 4, by, step - 8, 5 + rand() * 8)
          }

          // Natural stone flecks
          for (let s = 0; s < 16; s += 1) {
            ctx.fillStyle =
              s % 2 === 0
                ? "rgba(116, 94, 66, 0.14)"
                : "rgba(255, 252, 244, 0.22)"
            ctx.fillRect(tx + rand() * step, ty + rand() * step, 2.5, 2.5)
          }

          // Chamfer highlight & warm mortar grout
          ctx.strokeStyle = "rgba(255, 252, 244, 0.34)"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(tx + 2.5, ty + step - 2.5)
          ctx.lineTo(tx + 2.5, ty + 2.5)
          ctx.lineTo(tx + step - 2.5, ty + 2.5)
          ctx.stroke()

          ctx.strokeStyle = "rgba(126, 108, 82, 0.38)"
          ctx.lineWidth = 2.5
          ctx.strokeRect(tx + 1, ty + 1, step - 2, step - 2)
        }
      }
    } else if (style === "ceramic_cream") {
      // Warm cream porcelain tiles (4x4) with gentle organic per-tile variation & satin glaze
      const rand = mulberry32(3197)
      const step = 128
      const tones = ["#f2e5cf", "#eee0c7", "#f4e8d3", "#ebdabe", "#f0e2cb"]
      for (let gy = 0; gy < 4; gy += 1) {
        for (let gx = 0; gx < 4; gx += 1) {
          const tx = gx * step
          const ty = gy * step
          ctx.fillStyle = tones[(gy * 3 + gx * 2 + (gx === gy ? 1 : 0)) % tones.length]!
          ctx.fillRect(tx, ty, step, step)

          // Soft diagonal porcelain glaze sheen
          const glaze = ctx.createLinearGradient(tx, ty, tx + step, ty + step)
          glaze.addColorStop(0, "rgba(255, 253, 248, 0.24)")
          glaze.addColorStop(0.55, "rgba(255, 252, 244, 0)")
          glaze.addColorStop(1, "rgba(168, 138, 98, 0.08)")
          ctx.fillStyle = glaze
          ctx.fillRect(tx, ty, step, step)

          // Subtle ceramic micro-grain
          for (let f = 0; f < 10; f += 1) {
            ctx.fillStyle =
              f % 2 === 0
                ? "rgba(255, 253, 248, 0.22)"
                : "rgba(162, 134, 96, 0.08)"
            ctx.fillRect(tx + rand() * step, ty + rand() * step, 2, 2)
          }

          // Crisp glazed top-left highlight
          ctx.strokeStyle = "rgba(255, 254, 250, 0.48)"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(tx + 2.5, ty + step - 2.5)
          ctx.lineTo(tx + 2.5, ty + 2.5)
          ctx.lineTo(tx + step - 2.5, ty + 2.5)
          ctx.stroke()

          // Refined warm grout line
          ctx.strokeStyle = "rgba(154, 126, 88, 0.36)"
          ctx.lineWidth = 2.4
          ctx.strokeRect(tx + 1, ty + 1, step - 2, step - 2)
        }
      }
    } else {
      // Trading Floor royal crimson plush runner with woven damask & gold brocade trim
      const bg = ctx.createLinearGradient(0, 0, 512, 0)
      bg.addColorStop(0, "#7c111a")
      bg.addColorStop(0.14, "#9a1924")
      bg.addColorStop(0.5, "#a61e29")
      bg.addColorStop(0.86, "#9a1924")
      bg.addColorStop(1, "#7c111a")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 512, 512)

      // Plush velvet micro-pile lines
      ctx.fillStyle = "rgba(255, 224, 178, 0.035)"
      for (let y = 0; y < 512; y += 4) {
        ctx.fillRect(58, y, 396, 1)
      }

      // Subtle royal damask diamond lattice & gold florets
      for (let y = 0; y < 512; y += 64) {
        for (let x = 64; x < 448; x += 64) {
          ctx.strokeStyle = "rgba(246, 210, 122, 0.11)"
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(x + 32, y + 6)
          ctx.lineTo(x + 58, y + 32)
          ctx.lineTo(x + 32, y + 58)
          ctx.lineTo(x + 6, y + 32)
          ctx.closePath()
          ctx.stroke()

          ctx.fillStyle = "rgba(255, 220, 146, 0.09)"
          ctx.beginPath()
          ctx.arc(x + 32, y + 32, 6, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Crisp metallic-gold brocade double border rails + woven diamond motifs
      for (const bx of [14, 484]) {
        ctx.fillStyle = "#e6b647"
        ctx.fillRect(bx, 0, 14, 512)
        ctx.fillStyle = "#fce092"
        ctx.fillRect(bx + 3, 0, 3, 512)
      }
      ctx.fillStyle = "#f4ce72"
      ctx.fillRect(36, 0, 5, 512)
      ctx.fillRect(471, 0, 5, 512)

      ctx.fillStyle = "rgba(248, 218, 134, 0.42)"
      for (let y = 16; y < 512; y += 32) {
        for (const mx of [49, 463]) {
          ctx.beginPath()
          ctx.moveTo(mx, y - 6)
          ctx.lineTo(mx + 5, y)
          ctx.lineTo(mx, y + 6)
          ctx.lineTo(mx - 5, y)
          ctx.closePath()
          ctx.fill()
        }
      }
    }
    return true
  }

  const { canvas } = createCanvasSurface(512, 512)
  const hasCtx = paint(canvas)
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    repeat: true,
    anisotropy: 8,
    shared: true,
    repaint: (c) => {
      paint(c)
    },
  })
  return registerCachedTexture(floorTextureCache, style, tex)
}

// ---------- 2b. Procedural Wall Paint & Furniture Surface Textures ----------

export function createWallTexture(
  style: WallTextureStyle = "ivory_plaster"
): THREE.Texture {
  const cached = wallTextureCache.get(style)
  if (cached) return cached.texture

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    const rand = mulberry32(hashString(`wall:${style}`))
    if (style === "navy_wainscot") {
      const grad = ctx.createLinearGradient(0, 0, 0, 512)
      grad.addColorStop(0, "#1c2d54")
      grad.addColorStop(1, "#13203d")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 512, 512)

      // Subtle architectural wainscot recessed molding rectangles
      for (let gx = 0; gx < 2; gx += 1) {
        const px = gx * 256 + 22
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)"
        ctx.lineWidth = 3
        ctx.strokeRect(px, 28, 212, 456)
        ctx.strokeStyle = "rgba(6, 12, 26, 0.34)"
        ctx.lineWidth = 2
        ctx.strokeRect(px + 6, 34, 200, 444)
      }
      for (let i = 0; i < 420; i += 1) {
        ctx.fillStyle =
          i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)"
        ctx.fillRect(rand() * 512, rand() * 512, 3, 3)
      }
    } else {
      const baseTop = style === "cream_paint" ? "#f5efe4" : "#eee5d8"
      const baseBot = style === "cream_paint" ? "#ebe2d2" : "#e3d7c6"
      const grad = ctx.createLinearGradient(0, 0, 0, 512)
      grad.addColorStop(0, baseTop)
      grad.addColorStop(1, baseBot)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 512, 512)

      // Soft Venetian plaster trowel clouds
      for (let i = 0; i < 28; i += 1) {
        const cx = rand() * 512
        const cy = rand() * 512
        const r = 40 + rand() * 75
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r)
        g.addColorStop(
          0,
          i % 2 === 0
            ? "rgba(255, 253, 248, 0.14)"
            : "rgba(176, 156, 130, 0.07)"
        )
        g.addColorStop(1, "rgba(255, 253, 248, 0)")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Fine matte paint roller stipple
      for (let i = 0; i < 650; i += 1) {
        ctx.fillStyle =
          i % 2 === 0
            ? "rgba(255, 255, 255, 0.18)"
            : "rgba(154, 136, 112, 0.08)"
        ctx.fillRect(rand() * 512, rand() * 512, 2, 2)
      }
    }
    return true
  }

  const { canvas } = createCanvasSurface(512, 512)
  const hasCtx = paint(canvas)
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    repeat: true,
    anisotropy: 8,
    shared: true,
    repaint: (c) => {
      paint(c)
    },
  })
  return registerCachedTexture(wallTextureCache, style, tex)
}

export function createWoodSurfaceTexture(tone: WoodSurfaceTone): THREE.Texture {
  const cached = woodTextureCache.get(tone)
  if (cached) return cached.texture

  const palette: Readonly<
    Record<WoodSurfaceTone, { base: string; dark: string; light: string }>
  > = {
    walnut: {
      base: "#8a5c35",
      dark: "rgba(58, 32, 12, 0.24)",
      light: "rgba(226, 184, 132, 0.15)",
    },
    oak: {
      base: "#bd8f5d",
      dark: "rgba(104, 66, 28, 0.18)",
      light: "rgba(255, 236, 200, 0.16)",
    },
    rosewood: {
      base: "#5b1a1d",
      dark: "rgba(30, 6, 8, 0.30)",
      light: "rgba(182, 78, 66, 0.16)",
    },
    honey: {
      base: "#c89a64",
      dark: "rgba(116, 74, 30, 0.16)",
      light: "rgba(255, 240, 206, 0.18)",
    },
  }
  const p = palette[tone]
  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    const rand = mulberry32(hashString(`wood:${tone}`))
    ctx.fillStyle = p.base
    ctx.fillRect(0, 0, 256, 256)

    // Soft satin sheen strips
    for (let s = 0; s < 8; s += 1) {
      const sy = s * 32
      ctx.fillStyle = s % 2 === 0 ? p.light : "rgba(0,0,0,0.035)"
      ctx.fillRect(0, sy, 256, 16)
    }

    // Flowing organic cathedral wood grain
    for (let y = 4; y < 256; y += 6) {
      const amp = 4 + rand() * 8
      ctx.strokeStyle = y % 12 === 4 ? p.dark : p.light
      ctx.lineWidth = y % 12 === 4 ? 1.6 : 1.0
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(
        84,
        y + amp,
        172,
        y - amp,
        256,
        y
      )
      ctx.stroke()
    }

    // Subtle wood pore dashes
    ctx.fillStyle = p.dark
    for (let i = 0; i < 90; i += 1) {
      ctx.fillRect(rand() * 256, rand() * 256, 5 + rand() * 9, 1)
    }
    return true
  }

  const { canvas } = createCanvasSurface(256, 256)
  const hasCtx = paint(canvas)
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    repeat: true,
    anisotropy: 8,
    shared: true,
    repaint: (c) => {
      paint(c)
    },
  })
  return registerCachedTexture(woodTextureCache, tone, tex)
}

export function createFabricSurfaceTexture(
  colorHex: string,
  pattern: FabricSurfacePattern = "weave"
): THREE.Texture {
  const key = `${pattern}:${colorHex.toLowerCase()}`
  const cached = fabricTextureCache.get(key)
  if (cached) return cached.texture

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    const rand = mulberry32(hashString(`fabric:${key}`))
    ctx.fillStyle = colorHex
    ctx.fillRect(0, 0, 256, 256)

    if (pattern === "velvet") {
      for (let i = 0; i < 24; i += 1) {
        const cx = rand() * 256
        const cy = rand() * 256
        const r = 24 + rand() * 44
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r)
        g.addColorStop(
          0,
          i % 2 === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"
        )
        g.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (pattern === "rug") {
      for (let y = 0; y < 256; y += 6) {
        ctx.fillStyle =
          y % 12 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"
        ctx.fillRect(0, y, 256, 2.5)
      }
      for (let x = 0; x < 256; x += 12) {
        ctx.fillStyle = "rgba(0,0,0,0.04)"
        ctx.fillRect(x, 0, 2, 256)
      }
      for (let i = 0; i < 240; i += 1) {
        ctx.fillStyle =
          i % 2 === 0 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)"
        ctx.fillRect(rand() * 256, rand() * 256, 3, 2)
      }
    } else {
      // Cozy woven upholstery warp & weft
      for (let y = 0; y < 256; y += 4) {
        ctx.fillStyle =
          y % 8 === 0 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"
        ctx.fillRect(0, y, 256, 1.5)
      }
      for (let x = 0; x < 256; x += 4) {
        ctx.fillStyle =
          x % 8 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"
        ctx.fillRect(x, 0, 1.5, 256)
      }
      for (let i = 0; i < 180; i += 1) {
        ctx.fillStyle =
          i % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
        ctx.fillRect(rand() * 256, rand() * 256, 2, 2)
      }
    }
    return true
  }

  const { canvas } = createCanvasSurface(256, 256)
  const hasCtx = paint(canvas)
  const shouldCache = fabricTextureCache.size < MAX_FABRIC_CACHE
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    repeat: true,
    anisotropy: 8,
    shared: shouldCache,
    repaint: (c) => {
      paint(c)
    },
  })
  if (shouldCache) {
    return registerCachedTexture(fabricTextureCache, key, tex)
  }
  return tex
}

export function createMarbleSurfaceTexture(
  tone: MarbleSurfaceTone = "cream"
): THREE.Texture {
  const cached = marbleTextureCache.get(tone)
  if (cached) return cached.texture

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    const rand = mulberry32(hashString(`marble:${tone}`))
    const grad = ctx.createLinearGradient(0, 0, 256, 256)
    if (tone === "white_gold") {
      grad.addColorStop(0, "#faf6ee")
      grad.addColorStop(1, "#eee7d8")
    } else {
      grad.addColorStop(0, "#f5eee3")
      grad.addColorStop(1, "#ebe1d1")
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 256, 256)
    drawMarbleVeinsInRect(ctx, 0, 0, 256, 256, rand, 6)
    return true
  }

  const { canvas } = createCanvasSurface(256, 256)
  const hasCtx = paint(canvas)
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    repeat: true,
    anisotropy: 8,
    shared: true,
    repaint: (c) => {
      paint(c)
    },
  })
  return registerCachedTexture(marbleTextureCache, tone, tex)
}

export function createMonitorScreenTexture(
  variant: MonitorScreenVariant
): THREE.Texture {
  const cached = monitorScreenCache.get(variant)
  if (cached) return cached.texture

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    const bg = ctx.createLinearGradient(0, 0, 0, 160)
    bg.addColorStop(0, "#122142")
    bg.addColorStop(1, "#0b1428")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 256, 160)

    // Top IQX app bar
    ctx.fillStyle = "#182b52"
    ctx.fillRect(0, 0, 256, 24)
    ctx.fillStyle = "#f3cd6a"
    ctx.fillRect(10, 7, 30, 10)
    ctx.fillStyle = "#34c38f"
    ctx.beginPath()
    ctx.arc(240, 12, 4, 0, Math.PI * 2)
    ctx.fill()

    if (variant === "boss") {
      // Candlestick chart panel + KPI cards
      drawRoundedRect(ctx, 10, 32, 152, 116, 8)
      ctx.fillStyle = "#0e1a33"
      ctx.fill()
      ctx.strokeStyle = "rgba(148, 179, 218, 0.25)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Subtle grid lines
      ctx.strokeStyle = "rgba(148, 179, 218, 0.10)"
      ctx.lineWidth = 1
      for (let gy = 52; gy < 140; gy += 22) {
        ctx.beginPath()
        ctx.moveTo(16, gy)
        ctx.lineTo(156, gy)
        ctx.stroke()
      }

      // Stylized rising green/red candlesticks
      const candles: readonly [number, number, number, boolean][] = [
        [28, 118, 22, true],
        [44, 110, 18, false],
        [60, 102, 26, true],
        [76, 94, 20, true],
        [92, 98, 16, false],
        [108, 84, 28, true],
        [124, 72, 24, true],
        [140, 62, 30, true],
      ]
      for (const [cx, cy, ch, up] of candles) {
        const col = up ? "#34c38f" : "#f06a6e"
        ctx.fillStyle = col
        ctx.fillRect(cx + 3, cy - 8, 2, ch + 16)
        ctx.fillRect(cx, cy, 8, ch)
      }

      // Right-hand KPI summary widgets
      for (let i = 0; i < 3; i += 1) {
        const ry = 32 + i * 40
        drawRoundedRect(ctx, 170, ry, 76, 33, 6)
        ctx.fillStyle = "#162647"
        ctx.fill()
        ctx.fillStyle = i === 0 ? "#f3cd6a" : i === 1 ? "#34c38f" : "#4d8ef0"
        ctx.fillRect(178, ry + 8, 26 + i * 8, 5)
        ctx.fillStyle = "#c9d6e4"
        ctx.fillRect(178, ry + 19, 52, 4)
      }
    } else if (variant === "reception") {
      // IQX welcome dashboard
      drawRoundedRect(ctx, 14, 34, 228, 42, 8)
      ctx.fillStyle = "rgba(243, 205, 106, 0.16)"
      ctx.fill()
      ctx.fillStyle = "#f3cd6a"
      ctx.fillRect(28, 46, 96, 8)
      ctx.fillStyle = "#f1f5f9"
      ctx.fillRect(28, 60, 150, 5)

      for (let r = 0; r < 3; r += 1) {
        const ry = 86 + r * 22
        ctx.fillStyle = "#34c38f"
        ctx.beginPath()
        ctx.arc(24, ry + 6, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#f1f5f9"
        ctx.fillRect(36, ry + 3, 128 - r * 14, 6)
        ctx.fillStyle = "#4d8ef0"
        ctx.fillRect(198, ry + 2, 36, 8)
      }
    } else {
      // Staff workspace: task checklist + mini chart
      for (let i = 0; i < 4; i += 1) {
        const ry = 34 + i * 29
        drawRoundedRect(ctx, 10, ry, 142, 23, 5)
        ctx.fillStyle = "#152546"
        ctx.fill()
        ctx.fillStyle = i < 2 ? "#34c38f" : "#f2a33a"
        ctx.beginPath()
        ctx.arc(22, ry + 11.5, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#f1f5f9"
        ctx.fillRect(34, ry + 9, 74 - (i % 2) * 14, 5)
        ctx.fillStyle = "#f6d27a"
        ctx.fillRect(122, ry + 8, 22, 7)
      }

      drawRoundedRect(ctx, 160, 34, 86, 110, 7)
      ctx.fillStyle = "#0f1c36"
      ctx.fill()
      ctx.strokeStyle = "#38bdf8"
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(170, 122)
      ctx.lineTo(186, 108)
      ctx.lineTo(202, 114)
      ctx.lineTo(220, 82)
      ctx.lineTo(236, 68)
      ctx.stroke()
      ctx.fillStyle = "#34c38f"
      ctx.fillRect(170, 44, 48, 6)
    }
    return true
  }

  const { canvas } = createCanvasSurface(256, 160)
  const hasCtx = paint(canvas)
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    anisotropy: 8,
    shared: true,
    repaint: (c) => {
      paint(c)
    },
  })
  return registerCachedTexture(monitorScreenCache, variant, tex)
}

export function createAltarClothTexture(): THREE.Texture {
  const cached = altarClothCache.get("default")
  if (cached) return cached.texture

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    // Deep crimson satin brocade drape
    const bg = ctx.createLinearGradient(0, 0, 0, 256)
    bg.addColorStop(0, "#a8141f")
    bg.addColorStop(0.55, "#8d111a")
    bg.addColorStop(1, "#6f0c14")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 256, 256)

    // Soft vertical drape fold shading
    for (let x = 24; x < 256; x += 42) {
      const fGrad = ctx.createLinearGradient(x - 14, 0, x + 14, 0)
      fGrad.addColorStop(0, "rgba(0,0,0,0)")
      fGrad.addColorStop(0.5, "rgba(0,0,0,0.16)")
      fGrad.addColorStop(1, "rgba(0,0,0,0)")
      ctx.fillStyle = fGrad
      ctx.fillRect(x - 14, 0, 28, 256)
    }

    // Ornate double gold brocade outer & inner frame
    ctx.strokeStyle = "#f3c64a"
    ctx.lineWidth = 10
    ctx.strokeRect(10, 10, 236, 224)
    ctx.strokeStyle = "#fde69b"
    ctx.lineWidth = 3
    ctx.strokeRect(24, 24, 208, 196)

    // Traditional corner gold square frets
    for (const [cx, cy] of [
      [34, 34],
      [222, 34],
      [34, 210],
      [222, 210],
    ] as const) {
      ctx.strokeStyle = "#f6d27a"
      ctx.lineWidth = 3
      ctx.strokeRect(cx - 10, cy - 10, 20, 20)
    }

    // Central golden auspicious lotus medallion
    ctx.save()
    ctx.translate(128, 122)
    ctx.strokeStyle = "#f6d27a"
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(0, 0, 48, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = "#fde69b"
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(0, 0, 38, 0, Math.PI * 2)
    ctx.stroke()

    // 8 golden lotus petals
    ctx.fillStyle = "rgba(246, 210, 122, 0.85)"
    for (let i = 0; i < 8; i += 1) {
      ctx.save()
      ctx.rotate((i * Math.PI) / 4)
      ctx.beginPath()
      ctx.ellipse(0, -22, 7, 13, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = "#fde69b"
    ctx.beginPath()
    ctx.arc(0, 0, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Bottom golden fringe border strip
    ctx.fillStyle = "#e6b647"
    ctx.fillRect(0, 236, 256, 20)
    ctx.fillStyle = "#b57c16"
    for (let x = 4; x < 256; x += 8) {
      ctx.fillRect(x, 238, 2, 18)
    }
    return true
  }

  const { canvas } = createCanvasSurface(256, 256)
  const hasCtx = paint(canvas)
  const tex = finalizeCanvasTexture(canvas, hasCtx, {
    anisotropy: 8,
    shared: true,
    repaint: (c) => {
      paint(c)
    },
  })
  return registerCachedTexture(altarClothCache, "default", tex)
}

// ---------- 3. Crisp High-DPR Floor Zone Decal Texture ----------

export function createFloorDecalTexture(
  text: string,
  color = "#7c5c32",
  subtext?: string
): THREE.Texture {
  const baseW = 512
  const baseH = 128
  const dpr = resolveSupersampleDpr(baseW, baseH, undefined, 768)
  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    ctx.save()
    ctx.scale(canvas.width / baseW, canvas.height / baseH)
    ctx.clearRect(0, 0, baseW, baseH)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = color
    ctx.font = `800 ${text.length > 18 ? 30 : 36}px ${FONT_STACK}`
    ctx.fillText(text, baseW / 2, subtext ? 46 : 64, baseW - 28)

    if (subtext) {
      ctx.globalAlpha = 0.88
      ctx.font = `600 20px ${FONT_STACK}`
      ctx.fillText(subtext, baseW / 2, 92, baseW - 28)
      ctx.globalAlpha = 1
    }
    ctx.restore()
    return true
  }
  const { canvas } = createCanvasSurface(baseW * dpr, baseH * dpr)
  const hasCtx = paint(canvas)
  return finalizeCanvasTexture(canvas, hasCtx, {
    anisotropy: 8,
    repaint: (c) => {
      paint(c)
    },
  })
}

// ---------- 4. Crisp High-DPR Sign, Nameplate, Banner & Medal Texture ----------

export function createSignTexture(
  text: string,
  opts?: HighDprSignOptions
): THREE.Texture {
  const style = opts?.style ?? "navy_gold"
  const width = opts?.width ?? (style === "medal" ? 160 : 512)
  const height = opts?.height ?? (style === "medal" ? 160 : 128)
  const defaultMaxDim =
    style === "medal"
      ? 256
      : style === "gold_banner"
        ? 1024
        : style === "emblem"
          ? 448
          : 512
  const dpr = resolveSupersampleDpr(
    width,
    height,
    opts?.dpr,
    opts?.maxWidth ?? defaultMaxDim
  )
  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    ctx.save()
    ctx.scale(canvas.width / width, canvas.height / height)
    ctx.clearRect(0, 0, width, height)

    if (style === "medal") {
      const cx = width / 2
      const cy = height / 2
      const r = Math.min(width, height) * 0.44
      const accent = opts?.accentColor ?? "#f3c64a"

      const grad = ctx.createRadialGradient(
        cx - r * 0.28,
        cy - r * 0.28,
        r * 0.08,
        cx,
        cy,
        r
      )
      grad.addColorStop(0, "#fffbe8")
      grad.addColorStop(0.4, accent)
      grad.addColorStop(1, "#6f4e12")
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = "#fff5d6"
      ctx.lineWidth = Math.max(4, r * 0.095)
      ctx.stroke()

      // Inner embossed coin ring
      ctx.strokeStyle = "rgba(42, 28, 0, 0.28)"
      ctx.lineWidth = Math.max(2, r * 0.04)
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = opts?.textColor ?? "#261804"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `900 ${Math.round(r * 1.1)}px ${FONT_STACK}`
      ctx.fillText(text, cx, cy + 2)
    } else if (style === "emblem") {
      const bg = ctx.createLinearGradient(0, 0, 0, height)
      bg.addColorStop(0, opts?.bgColor ?? "#14244a")
      bg.addColorStop(1, "#0a1428")
      drawRoundedRect(ctx, 6, 6, width - 12, height - 12, 20)
      ctx.fillStyle = bg
      ctx.fill()

      const borderGrad = ctx.createLinearGradient(0, 0, width, height)
      borderGrad.addColorStop(0, "#fbe29b")
      borderGrad.addColorStop(0.5, "#e9b949")
      borderGrad.addColorStop(1, "#c58d26")
      ctx.strokeStyle = borderGrad
      ctx.lineWidth = 6
      ctx.stroke()

      drawRoundedRect(ctx, 14, 14, width - 28, height - 28, 13)
      ctx.strokeStyle = "rgba(246, 210, 122, 0.35)"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = opts?.textColor ?? "#f8dc8c"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `900 ${Math.round(height * 0.56)}px ${FONT_STACK}`
      ctx.fillText(text, width / 2, height / 2 + 2, width - 40)
    } else if (style === "gold_banner") {
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, "#991620")
      grad.addColorStop(0.5, "#7d1018")
      grad.addColorStop(1, "#590a10")
      drawRoundedRect(ctx, 5, 5, width - 10, height - 10, 18)
      ctx.fillStyle = grad
      ctx.fill()

      ctx.strokeStyle = "#f3c64a"
      ctx.lineWidth = 6
      ctx.stroke()

      drawRoundedRect(ctx, 14, 14, width - 28, height - 28, 12)
      ctx.strokeStyle = "rgba(253, 228, 155, 0.55)"
      ctx.lineWidth = 2
      ctx.stroke()

      // Corner gold accents
      ctx.fillStyle = "#f8dc8c"
      for (const [cx, cy] of [
        [24, 24],
        [width - 24, 24],
        [24, height - 24],
        [width - 24, height - 24],
      ] as const) {
        ctx.beginPath()
        ctx.arc(cx, cy, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 ${Math.round(height * 0.35)}px ${FONT_STACK}`
      ctx.fillStyle = "rgba(40, 4, 6, 0.55)"
      ctx.fillText(
        text,
        width / 2,
        (opts?.subtext ? height * 0.38 : height / 2) + 2,
        width - 52
      )
      ctx.fillStyle = "#fde69b"
      ctx.fillText(
        text,
        width / 2,
        opts?.subtext ? height * 0.38 : height / 2,
        width - 52
      )
      if (opts?.subtext) {
        ctx.fillStyle = "#fef3c7"
        ctx.font = `600 ${Math.round(height * 0.22)}px ${FONT_STACK}`
        ctx.fillText(opts.subtext, width / 2, height * 0.72, width - 52)
      }
    } else if (style === "gold_plate") {
      const grad = ctx.createLinearGradient(0, 0, width, height)
      grad.addColorStop(0, "#fae29c")
      grad.addColorStop(0.45, "#f0c253")
      grad.addColorStop(1, "#d59a30")
      drawRoundedRect(ctx, 5, 5, width - 10, height - 10, 16)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = "#fff8df"
      ctx.lineWidth = 4
      ctx.stroke()

      drawRoundedRect(ctx, 12, 12, width - 24, height - 24, 10)
      ctx.strokeStyle = "rgba(66, 42, 4, 0.32)"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = opts?.textColor ?? "#2a1c00"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 ${Math.round(height * 0.39)}px ${FONT_STACK}`
      ctx.fillText(text, width / 2, height / 2 + 1, width - 40)
    } else {
      // Crisp IQX dark navy & brushed gold nameplate
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, opts?.bgColor ?? "#192a54")
      grad.addColorStop(1, "#0d1730")
      drawRoundedRect(ctx, 5, 5, width - 10, height - 10, 16)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = opts?.accentColor ?? "#e9b949"
      ctx.lineWidth = 5
      ctx.stroke()

      drawRoundedRect(ctx, 12, 12, width - 24, height - 24, 10)
      ctx.strokeStyle = "rgba(246, 210, 122, 0.26)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 ${Math.round(height * (opts?.subtext ? 0.34 : 0.41))}px ${FONT_STACK}`
      ctx.fillStyle = "rgba(4, 8, 18, 0.55)"
      ctx.fillText(
        text,
        width / 2,
        (opts?.subtext ? height * 0.37 : height / 2 + 1) + 1.5,
        width - 40
      )
      ctx.fillStyle = opts?.textColor ?? "#f8dc8c"
      ctx.fillText(
        text,
        width / 2,
        opts?.subtext ? height * 0.37 : height / 2 + 1,
        width - 40
      )
      if (opts?.subtext) {
        ctx.fillStyle = "#c9d6e4"
        ctx.font = `600 ${Math.round(height * 0.24)}px ${FONT_STACK}`
        ctx.fillText(opts.subtext, width / 2, height * 0.72, width - 40)
      }
    }
    ctx.restore()
    return true
  }

  const { canvas } = createCanvasSurface(width * dpr, height * dpr)
  const hasCtx = paint(canvas)
  return finalizeCanvasTexture(canvas, hasCtx, {
    anisotropy: Math.min(8, opts?.anisotropy ?? 8),
    repaint: (c) => {
      paint(c)
    },
  })
}

export interface NameplateAtlasEntry {
  text: string
  style: "navy_gold" | "gold_plate"
}

export interface NameplateAtlasResult {
  texture: THREE.Texture
  cols: number
  rows: number
  /** Returns UV rect `[u0, v0, u1, v1]` for entry `index` in Three.js bottom-left UV space. */
  getUvRect: (index: number) => readonly [number, number, number, number]
}

/**
 * Packs multiple static desk nameplates into ONE crisp atlas texture (256x64 px per cell,
 * still >2x sharper than max-zoom Retina pixels) and releases the backing canvas after GPU upload.
 */
export function createNameplateAtlasTexture(
  entries: readonly NameplateAtlasEntry[],
  opts?: { lite?: boolean; anisotropy?: number }
): NameplateAtlasResult {
  const count = Math.max(1, entries.length)
  const cols = Math.min(4, count)
  const rows = Math.ceil(count / cols)
  const cellW = opts?.lite ? 192 : 256
  const cellH = opts?.lite ? 48 : 64
  const atlasW = cols * cellW
  const atlasH = rows * cellH

  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    ctx.clearRect(0, 0, atlasW, atlasH)

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!
      const col = i % cols
      const row = Math.floor(i / cols)
      const ox = col * cellW
      const oy = row * cellH
      const w = cellW
      const h = cellH

      ctx.save()
      ctx.translate(ox, oy)
      if (entry.style === "gold_plate") {
        const grad = ctx.createLinearGradient(0, 0, w, h)
        grad.addColorStop(0, "#fae29c")
        grad.addColorStop(0.45, "#f0c253")
        grad.addColorStop(1, "#d59a30")
        drawRoundedRect(ctx, 3, 3, w - 6, h - 6, 8)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.strokeStyle = "#fff8df"
        ctx.lineWidth = 2.5
        ctx.stroke()

        drawRoundedRect(ctx, 7, 7, w - 14, h - 14, 5)
        ctx.strokeStyle = "rgba(66, 42, 4, 0.32)"
        ctx.lineWidth = 1.2
        ctx.stroke()

        ctx.fillStyle = "#2a1c00"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.font = `800 ${Math.round(h * 0.4)}px ${FONT_STACK}`
        ctx.fillText(entry.text, w / 2, h / 2 + 1, w - 22)
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, "#192a54")
        grad.addColorStop(1, "#0d1730")
        drawRoundedRect(ctx, 3, 3, w - 6, h - 6, 8)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.strokeStyle = "#e9b949"
        ctx.lineWidth = 2.5
        ctx.stroke()

        drawRoundedRect(ctx, 7, 7, w - 14, h - 14, 5)
        ctx.strokeStyle = "rgba(246, 210, 122, 0.26)"
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.font = `800 ${Math.round(h * 0.41)}px ${FONT_STACK}`
        ctx.fillStyle = "rgba(4, 8, 18, 0.55)"
        ctx.fillText(entry.text, w / 2, h / 2 + 2, w - 22)
        ctx.fillStyle = "#f8dc8c"
        ctx.fillText(entry.text, w / 2, h / 2 + 1, w - 22)
      }
      ctx.restore()
    }
    return true
  }

  const { canvas } = createCanvasSurface(atlasW, atlasH)
  const hasCtx = paint(canvas)
  const texture = finalizeCanvasTexture(canvas, hasCtx, {
    anisotropy: opts?.anisotropy ?? (opts?.lite ? 4 : 8),
    repaint: (c) => {
      paint(c)
    },
  })

  const padU = 1 / atlasW
  const padV = 1 / atlasH
  const getUvRect = (index: number): readonly [number, number, number, number] => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const u0 = col / cols + padU
    const u1 = (col + 1) / cols - padU
    // Canvas y=0 is top; Three.js CanvasTexture flipY=true maps top to v=1
    const v1 = 1 - row / rows - padV
    const v0 = 1 - (row + 1) / rows + padV
    return [u0, v0, u1, v1]
  }

  return { texture, cols, rows, getUvRect }
}

// ---------- 5. Trading Floor LED VN30 Board Painter (1024x280 base) ----------

export function drawLedMarketBoard(
  canvas: HTMLCanvasElement,
  indices: readonly IndexQuote[] | null,
  vn30: readonly Quote[] | null
): void {
  if (canvas.width <= 0) canvas.width = 1024
  if (canvas.height <= 0) canvas.height = 280
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const baseW = 1024
  const baseH = 280
  const sx = canvas.width / baseW
  const sy = canvas.height / baseH

  ctx.save()
  ctx.scale(sx, sy)

  // Deep obsidian LED wall backdrop
  ctx.fillStyle = "#070b14"
  ctx.fillRect(0, 0, baseW, baseH)

  // Header bar gradient + gold underline rule
  const topGrad = ctx.createLinearGradient(0, 0, 0, 52)
  topGrad.addColorStop(0, "#17243d")
  topGrad.addColorStop(1, "#0b1222")
  ctx.fillStyle = topGrad
  ctx.fillRect(0, 0, baseW, 52)

  ctx.fillStyle = "rgba(233, 185, 73, 0.42)"
  ctx.fillRect(18, 50, baseW - 36, 2)

  // Header left live indicator & title
  const padX = 22
  ctx.fillStyle = "#34c38f"
  ctx.beginPath()
  ctx.arc(padX + 6, 26, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  ctx.fillStyle = "#f6d27a"
  ctx.font = `800 21px ${FONT_STACK}`
  ctx.fillText("IQX · BẢNG ĐIỆN VN30", padX + 18, 27)

  // Header right VN-Index pill summary
  const vnIndex = indices?.find((q) => q.code === "VNINDEX") ?? null
  ctx.textAlign = "right"
  if (!vnIndex) {
    ctx.fillStyle = "#c9d6e4"
    ctx.font = `700 19px ${FONT_STACK}`
    ctx.fillText("VN-Index —", baseW - padX, 27)
  } else {
    const weather = marketWeather(vnIndex)
    ctx.fillStyle = PRICE_COLORS[indexTone(vnIndex)]
    ctx.font = `800 20px ${FONT_STACK}`
    ctx.fillText(
      `VN-Index ${formatIndex(vnIndex.value)} ${formatPercent(vnIndex.pct)} · ${weather.label}`,
      baseW - padX,
      27
    )
  }

  // 10 x 3 VN30 Heatmap Grid with crisp high-contrast LED glyphs
  const cols = 10
  const rows = 3
  const gap = 6
  const gridTop = 58
  const gridBottom = baseH - 12
  const innerW = baseW - padX * 2
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
      ctx.fillStyle = "#121c30"
      ctx.fill()
      ctx.strokeStyle = "rgba(148, 179, 218, 0.14)"
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = "#c9d6e4"
      ctx.font = `700 ${Math.round(tileH * 0.34)}px ${FONT_STACK}`
      ctx.fillText(vn30 ? "" : "·", cx, y + tileH * 0.52)
      continue
    }

    const { bg, fg } = heatColour(quote)
    ctx.fillStyle = bg
    ctx.fill()

    // Crisp subtle tile outline & gloss top bar
    ctx.strokeStyle = "rgba(0, 0, 0, 0.24)"
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)"
    ctx.fillRect(x + 4, y + 2, tileW - 8, 2)

    // Crisp shadow behind bright glyphs for legibility on yellow/green LED cells
    const isLightFg = fg.toLowerCase() === "#ffffff" || fg.toLowerCase() === "#f1f5f9"
    if (isLightFg) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)"
      ctx.shadowBlur = 2
      ctx.shadowOffsetY = 1
    }

    ctx.fillStyle = fg
    ctx.font = `900 ${Math.round(tileH * 0.29)}px ${FONT_STACK}`
    ctx.fillText(quote.symbol, cx, y + tileH * 0.26, tileW - 8)

    ctx.font = `700 ${Math.round(tileH * 0.22)}px ${FONT_STACK}`
    ctx.fillText(heatPrice(quote.price), cx, y + tileH * 0.55, tileW - 8)

    ctx.font = `800 ${Math.round(tileH * 0.23)}px ${FONT_STACK}`
    ctx.fillText(heatPct(quote.pct), cx, y + tileH * 0.82, tileW - 8)

    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }

  // Subtle LED horizontal scanline micro-texture
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)"
  for (let y = gridTop; y < gridBottom; y += 4) {
    ctx.fillRect(padX, y, innerW, 1)
  }

  ctx.restore()
}

// ---------- 6. Trading Floor SACO Nhận Định Board Painter (768x288 base) ----------

export function drawSacoBoard(
  canvas: HTMLCanvasElement,
  posts: readonly PostCard[]
): void {
  if (canvas.width <= 0) canvas.width = 768
  if (canvas.height <= 0) canvas.height = 288
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const baseW = 768
  const baseH = 288
  ctx.save()
  ctx.scale(canvas.width / baseW, canvas.height / baseH)

  // Deep IQX navy gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, baseH)
  bg.addColorStop(0, "#16264e")
  bg.addColorStop(1, "#0c152b")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, baseW, baseH)

  // Subtle upper warm gold glow
  const glow = ctx.createRadialGradient(baseW / 2, 34, 8, baseW / 2, 34, 240)
  glow.addColorStop(0, "rgba(243, 205, 106, 0.16)")
  glow.addColorStop(1, "rgba(243, 205, 106, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, baseW, 140)

  // Crisp double gold trim border
  drawRoundedRect(ctx, 10, 10, baseW - 20, baseH - 20, 14)
  ctx.strokeStyle = "rgba(233, 185, 73, 0.65)"
  ctx.lineWidth = 3
  ctx.stroke()

  // Gold header banner pill
  const pillW = Math.round(baseW * 0.46)
  const pillH = 46
  const pillX = (baseW - pillW) / 2
  const pillY = 18
  const goldGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH)
  goldGrad.addColorStop(0, "#f6d67c")
  goldGrad.addColorStop(1, "#d9a03a")
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 12)
  ctx.fillStyle = goldGrad
  ctx.fill()

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#2a1c00"
  ctx.font = `900 23px ${FONT_STACK}`
  ctx.fillText("SACO NHẬN ĐỊNH", baseW / 2, pillY + pillH / 2 + 1)

  // Top 3 headlines
  const left = 36
  const maxTextW = baseW - 84
  ctx.textAlign = "left"
  if (!posts.length) {
    ctx.fillStyle = "#c9d6e4"
    ctx.font = `600 22px ${FONT_STACK}`
    ctx.fillText("Chưa có nhận định hôm nay", left, 142)
  } else {
    const topThree = posts.slice(0, 3)
    topThree.forEach((post, idx) => {
      const rowY = 104 + idx * 48
      drawRoundedRect(ctx, 26, rowY - 19, baseW - 52, 38, 8)
      ctx.fillStyle =
        idx % 2 === 0
          ? "rgba(255, 255, 255, 0.065)"
          : "rgba(255, 255, 255, 0.04)"
      ctx.fill()
      ctx.strokeStyle = "rgba(148, 179, 218, 0.14)"
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.fillStyle = "#f3cd6a"
      ctx.beginPath()
      ctx.arc(44, rowY, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = `700 20px ${FONT_STACK}`
      const prefix = `${post.sacoName}: `
      const prefixW = Math.min(ctx.measureText(prefix).width, maxTextW * 0.42)
      ctx.fillStyle = "#f6d27a"
      ctx.fillText(trimToWidth(ctx, prefix, prefixW + 4), 58, rowY)

      ctx.font = `600 20px ${FONT_STACK}`
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
  ctx.fillStyle = "#f6d27a"
  ctx.font = `700 18px ${FONT_STACK}`
  ctx.fillText("Chạm để xem chi tiết ›", baseW - 34, baseH - 28)

  ctx.restore()
}

// ---------- 7. Office Meeting Room Wall Screen Painter (640x160 base) ----------

export function drawOfficeMeetingScreen(
  canvas: HTMLCanvasElement,
  title: string,
  subtitle: string
): void {
  if (canvas.width <= 0) canvas.width = 640
  if (canvas.height <= 0) canvas.height = 160
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const baseW = 640
  const baseH = 160
  ctx.save()
  ctx.scale(canvas.width / baseW, canvas.height / baseH)

  const bg = ctx.createLinearGradient(0, 0, baseW, baseH)
  bg.addColorStop(0, "#132040")
  bg.addColorStop(1, "#0a1226")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, baseW, baseH)

  // Subtle ambient gold highlight in top-right
  const glow = ctx.createRadialGradient(baseW - 60, 26, 6, baseW - 60, 26, 180)
  glow.addColorStop(0, "rgba(233, 185, 73, 0.16)")
  glow.addColorStop(1, "rgba(233, 185, 73, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, baseW, baseH)

  // Top gold accent rail
  ctx.fillStyle = "#e9b949"
  ctx.fillRect(0, 0, baseW, 5)

  // Live green dot + eyebrow badge
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
  ctx.fillText(trimToWidth(ctx, title || "Phòng họp nhóm", baseW - 64), 30, 84)

  // Subtitle
  ctx.fillStyle = "#f1f5f9"
  ctx.font = `600 20px ${FONT_STACK}`
  ctx.fillText(trimToWidth(ctx, subtitle || "", baseW - 64), 30, 126)

  ctx.restore()
}

// ---------- 8. Office Achievement Standee Painter (460x748 base, Spec §10) ----------

/** Canonical spec §10 personal rank line for the Achievement Standee. */
export function formatStandeePersonalRank(rank: number, points: number): string {
  return `Hạng của bạn #${rank} · ${points} điểm`
}

export function drawOfficeStandee(
  canvas: HTMLCanvasElement,
  payload: OfficeStandeePayload
): void {
  if (canvas.width <= 0) canvas.width = 460
  if (canvas.height <= 0) canvas.height = 748
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const baseW = 460
  const baseH = 748
  ctx.save()
  ctx.scale(canvas.width / baseW, canvas.height / baseH)

  // Dark IQX navy vertical gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, baseH)
  bg.addColorStop(0, "#172750")
  bg.addColorStop(0.55, "#101d3c")
  bg.addColorStop(1, "#0b1429")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, baseW, baseH)

  // Warm gold top radial spotlight glow
  const glow = ctx.createRadialGradient(baseW / 2, 72, 12, baseW / 2, 72, 240)
  glow.addColorStop(0, "rgba(243, 205, 106, 0.28)")
  glow.addColorStop(1, "rgba(243, 205, 106, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, baseW, 330)

  // Double gold exhibition border
  drawRoundedRect(ctx, 12, 12, baseW - 24, baseH - 24, 22)
  ctx.strokeStyle = "#e9b949"
  ctx.lineWidth = 6
  ctx.stroke()

  drawRoundedRect(ctx, 22, 22, baseW - 44, baseH - 44, 15)
  ctx.strokeStyle = "rgba(246, 210, 122, 0.28)"
  ctx.lineWidth = 1.8
  ctx.stroke()

  // Team Eyebrow ("IQX · NHÓM {TÊN SẾP}")
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#f6d27a"
  ctx.font = `800 21px ${FONT_STACK}`
  ctx.fillText(
    trimToWidth(ctx, payload.teamTitle || "IQX · NHÓM", baseW - 68),
    baseW / 2,
    62
  )

  // Ornamental gold divider accent
  ctx.fillStyle = "rgba(233, 185, 73, 0.65)"
  ctx.fillRect(baseW / 2 - 68, 86, 136, 3)

  // Month Headline ("Thành tích tháng {m}")
  ctx.fillStyle = "#f1f5f9"
  ctx.font = `900 36px ${FONT_STACK}`
  ctx.fillText(
    trimToWidth(ctx, payload.monthLabel || "Thành tích tháng", baseW - 58),
    baseW / 2,
    130
  )

  // Subtitle ("Top 3 điểm nhiệm vụ")
  ctx.fillStyle = "#c9d6e4"
  ctx.font = `600 20px ${FONT_STACK}`
  ctx.fillText(payload.subtitle ?? "Top 3 điểm nhiệm vụ", baseW / 2, 170)

  // Top 3 rows
  const medalStyles: Readonly<
    Record<1 | 2 | 3, { hi: string; bg: string; lo: string; fg: string }>
  > = {
    1: { hi: "#fff6d6", bg: "#f6d27a", lo: "#c98f24", fg: "#2a1c00" },
    2: { hi: "#f8fafc", bg: "#d9dee7", lo: "#8c99ad", fg: "#1b2433" },
    3: { hi: "#fde2c4", bg: "#e0a26b", lo: "#9e5c26", fg: "#2b1605" },
  }

  if (!payload.top3.length) {
    drawRoundedRect(ctx, 32, 232, baseW - 64, 136, 16)
    ctx.fillStyle = "rgba(255, 255, 255, 0.065)"
    ctx.fill()
    ctx.strokeStyle = "rgba(148, 179, 218, 0.22)"
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = "#c9d6e4"
    ctx.font = `600 21px ${FONT_STACK}`
    ctx.fillText(
      payload.emptyText ?? "Chưa có ai ghi điểm tháng này",
      baseW / 2,
      300
    )
  } else {
    payload.top3.slice(0, 3).forEach((entry, idx) => {
      const cardY = 216 + idx * 104
      const medal = medalStyles[entry.rank]

      drawRoundedRect(ctx, 30, cardY, baseW - 60, 86, 16)
      ctx.fillStyle =
        entry.rank === 1
          ? "rgba(233, 185, 73, 0.19)"
          : "rgba(255, 255, 255, 0.075)"
      ctx.fill()
      ctx.strokeStyle =
        entry.rank === 1
          ? "rgba(246, 210, 122, 0.78)"
          : "rgba(148, 179, 218, 0.28)"
      ctx.lineWidth = 2
      ctx.stroke()

      // Metallic shaded rank medal circle
      const mGrad = ctx.createRadialGradient(
        68,
        cardY + 36,
        3,
        74,
        cardY + 43,
        24
      )
      mGrad.addColorStop(0, medal.hi)
      mGrad.addColorStop(0.55, medal.bg)
      mGrad.addColorStop(1, medal.lo)
      ctx.fillStyle = mGrad
      ctx.beginPath()
      ctx.arc(74, cardY + 43, 24, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)"
      ctx.lineWidth = 1.8
      ctx.stroke()

      ctx.fillStyle = medal.fg
      ctx.textAlign = "center"
      ctx.font = `900 24px ${FONT_STACK}`
      ctx.fillText(String(entry.rank), 74, cardY + 45)

      // Points (measured first so name uses exact remaining width)
      const pointsText = `${entry.points} điểm`
      ctx.textAlign = "right"
      ctx.fillStyle = medal.bg
      ctx.font = `800 21px ${FONT_STACK}`
      const ptsW = Math.min(ctx.measureText(pointsText).width, 130)
      ctx.fillText(pointsText, baseW - 44, cardY + 44)

      // Name
      ctx.textAlign = "left"
      ctx.fillStyle = "#f1f5f9"
      ctx.font = `700 21px ${FONT_STACK}`
      const nameMaxW = Math.max(96, baseW - 112 - 54 - ptsW)
      ctx.fillText(trimToWidth(ctx, entry.name, nameMaxW), 110, cardY + 44)
    })
  }

  // Personal rank blue pill (for staff): exact spec §10 copy
  if (payload.personalRank) {
    const pillY = 556
    drawRoundedRect(ctx, 32, pillY, baseW - 64, 66, 16)
    const pillGrad = ctx.createLinearGradient(0, pillY, 0, pillY + 66)
    pillGrad.addColorStop(0, "#2b7df5")
    pillGrad.addColorStop(1, "#1a5ec7")
    ctx.fillStyle = pillGrad
    ctx.fill()
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)"
    ctx.lineWidth = 2
    ctx.stroke()

    const rankText = formatStandeePersonalRank(
      payload.personalRank.rank,
      payload.personalRank.points
    )
    const maxPillTextW = baseW - 88
    let fontSize = 21
    ctx.font = `800 ${fontSize}px ${FONT_STACK}`
    while (fontSize > 15 && ctx.measureText(rankText).width > maxPillTextW) {
      fontSize -= 1
      ctx.font = `800 ${fontSize}px ${FONT_STACK}`
    }

    ctx.textAlign = "center"
    ctx.fillStyle = "#f1f5f9"
    ctx.fillText(rankText, baseW / 2, pillY + 34, maxPillTextW)
  }

  // Footer ("Reset ngày 01 hằng tháng")
  ctx.fillStyle = "rgba(233, 185, 73, 0.34)"
  ctx.fillRect(46, baseH - 88, baseW - 92, 2)
  ctx.textAlign = "center"
  ctx.fillStyle = "#c9d6e4"
  ctx.font = `600 18px ${FONT_STACK}`
  ctx.fillText(
    payload.footerText ?? "Reset ngày 01 hằng tháng",
    baseW / 2,
    baseH - 52
  )

  ctx.restore()
}
