import * as THREE from "three"

import { AVATARS } from "@/pages/trading-floor/net/types.ts"

import { createChibiCharacter } from "./character-builder.ts"
import { safeGet2DContext } from "./textures.ts"
import {
  getAvatarStylePreset,
  resolveOutfitHex,
  type AvatarStylePreset,
  type ChibiAnimMode,
  type ChibiRig,
} from "./types.ts"

const portraitCache = new Map<string, string>()

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** Crisp SVG fallback when Canvas2D is unavailable (e.g. jsdom without native canvas). */
function buildSvgChibiPortraitDataUrl(
  preset: AvatarStylePreset,
  outfitHex: string,
  size: number
): string {
  const isFemale = preset.gender === "female"
  const isCool = preset.id === "danhtrongit"
  const glassesSvg = preset.hasGlasses
    ? `<g stroke="${escapeXml(preset.glassesColor ?? "#1f2937")}" stroke-width="2.6" fill="${isCool ? "rgba(56,189,248,0.22)" : "rgba(224,242,254,0.18)"}"><circle cx="62" cy="79" r="13"/><circle cx="98" cy="79" r="13"/><line x1="75" y1="79" x2="85" y2="79"/></g>`
    : ""
  const badgeSvg = preset.hasItEmblem
    ? `<rect x="86" y="128" width="18" height="10" rx="3" fill="#f5b81c"/>`
    : ""
  const backHairSvg = isFemale
    ? `<ellipse cx="80" cy="86" rx="46" ry="44" fill="${escapeXml(preset.hairColor)}"/>`
    : ""
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">`,
    `<defs><radialGradient id="bg" cx="50%" cy="38%" r="65%"><stop offset="0%" stop-color="#22355f"/><stop offset="100%" stop-color="#0f182e"/></radialGradient></defs>`,
    `<rect width="160" height="160" rx="22" fill="url(#bg)"/>`,
    backHairSvg,
    `<path d="M36 160 C38 124 54 114 80 114 C106 114 122 124 124 160 Z" fill="${escapeXml(outfitHex)}"/>`,
    `<polygon points="68,116 92,116 80,136" fill="${escapeXml(preset.innerShirtHex)}"/>`,
    `<polygon points="77,120 83,120 85,146 80,152 75,146" fill="${escapeXml(preset.tieOrAccentHex)}"/>`,
    badgeSvg,
    `<ellipse cx="80" cy="76" rx="39" ry="36" fill="${escapeXml(preset.skinColor)}"/>`,
    `<path d="M40 72 C40 36 62 28 80 28 C98 28 120 36 120 72 C110 56 96 52 80 54 C64 52 50 56 40 72 Z" fill="${escapeXml(preset.hairColor)}"/>`,
    `<ellipse cx="52" cy="89" rx="8" ry="5" fill="#ff768e" opacity="0.42"/>`,
    `<ellipse cx="108" cy="89" rx="8" ry="5" fill="#ff768e" opacity="0.42"/>`,
    `<ellipse cx="63" cy="79" rx="7.2" ry="8.6" fill="${escapeXml(preset.eyeColor)}"/>`,
    `<ellipse cx="97" cy="79" rx="7.2" ry="8.6" fill="${escapeXml(preset.eyeColor)}"/>`,
    `<circle cx="60.5" cy="75.8" r="2.6" fill="#ffffff"/>`,
    `<circle cx="94.5" cy="75.8" r="2.6" fill="#ffffff"/>`,
    `<circle cx="65.5" cy="82.2" r="1.2" fill="#ffffff"/>`,
    `<circle cx="99.5" cy="82.2" r="1.2" fill="#ffffff"/>`,
    `<path d="M72 95 Q80 103 88 95" fill="none" stroke="#7a3b2e" stroke-width="2.6" stroke-linecap="round"/>`,
    glassesSvg,
    `</svg>`,
  ].join("")
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function drawPortraitEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  eyeColor: string,
  isFemale: boolean,
  isCool: boolean,
  side: -1 | 1
): void {
  // Sclera highlight
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.ellipse(cx, cy + 0.5, rx * 1.14, ry * 1.07, 0, 0, Math.PI * 2)
  ctx.fill()

  // Iris gradient
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry)
  grad.addColorStop(0, eyeColor)
  grad.addColorStop(1, isCool ? "#38bdf8" : isFemale ? "#7b4b7a" : "#5d4332")
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  // Pupil
  ctx.fillStyle = "#0e1118"
  ctx.beginPath()
  ctx.ellipse(cx, cy - 0.5, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()

  // Lower jewel crescent
  ctx.fillStyle = "rgba(255,255,255,0.34)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + ry * 0.45, rx * 0.5, ry * 0.24, 0, 0, Math.PI * 2)
  ctx.fill()

  // Dual catchlight sparkles
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.arc(cx - rx * 0.3, cy - ry * 0.34, rx * 0.32, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + rx * 0.3, cy + ry * 0.28, rx * 0.15, 0, Math.PI * 2)
  ctx.fill()

  // Upper lash line
  ctx.strokeStyle = "#18131a"
  ctx.lineWidth = isCool ? 2.6 : 2.3
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.ellipse(
    cx,
    cy + 0.5,
    rx * 1.1,
    ry * 1.04,
    0,
    Math.PI * 1.12,
    Math.PI * 1.88
  )
  ctx.stroke()

  if (isFemale) {
    const ox = cx + side * rx * 1.05
    const oy = cy - ry * 0.36
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + side * 4.5, oy - 3.2)
    ctx.stroke()
  }
}

/**
 * Renders a razor-sharp `size×size` (default `160×160`) Chibi portrait PNG data URL
 * matching the exact 3D Chibi hairstyle, accessories, face expression, and outfit color.
 */
export function renderChibiPortraitDataUrl(
  avatarId: string,
  colorHex?: string | null,
  size = 160
): string {
  const preset = getAvatarStylePreset(avatarId)
  const resolvedHex = resolveOutfitHex(colorHex) ?? preset.defaultOutfitHex
  const cacheKey = `${preset.id}|${resolvedHex}|${size}`
  const cached = portraitCache.get(cacheKey)
  if (cached) return cached

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = safeGet2DContext(canvas)
  if (!ctx) {
    const fallback = buildSvgChibiPortraitDataUrl(preset, resolvedHex, size)
    portraitCache.set(cacheKey, fallback)
    return fallback
  }

  ctx.save()
  const s = size / 160
  ctx.scale(s, s)

  const isFemale = preset.gender === "female"
  const isCool = preset.id === "danhtrongit"

  // Warm-navy studio portrait backdrop
  const bg = ctx.createRadialGradient(80, 56, 12, 80, 82, 98)
  bg.addColorStop(0, "#243b6b")
  bg.addColorStop(0.65, "#152342")
  bg.addColorStop(1, "#0d162c")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 160, 160)

  // Subtle gold studio halo behind chibi head
  const halo = ctx.createRadialGradient(80, 74, 16, 80, 74, 62)
  halo.addColorStop(0, "rgba(243, 205, 106, 0.22)")
  halo.addColorStop(1, "rgba(243, 205, 106, 0)")
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(80, 74, 62, 0, Math.PI * 2)
  ctx.fill()

  // Back hair layer for female hairstyles
  ctx.fillStyle = preset.hairColor
  if (preset.hairStyle === "ponytail") {
    // Bouncy ponytail peeking at upper-right
    ctx.beginPath()
    ctx.ellipse(116, 66, 20, 28, -0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#f3c64a"
    ctx.beginPath()
    ctx.arc(108, 49, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = preset.hairColor
  } else if (
    preset.hairStyle === "long_wavy" ||
    preset.hairStyle === "layered_clips"
  ) {
    ctx.beginPath()
    ctx.ellipse(80, 96, 47, 46, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (preset.hairStyle === "bob") {
    ctx.beginPath()
    ctx.ellipse(80, 86, 45, 39, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (preset.hairStyle === "chignon") {
    ctx.beginPath()
    ctx.arc(114, 92, 16, 0, Math.PI * 2)
    ctx.fill()
  }

  // Shoulders & outfit body (flattering slight 3/4 portrait curve)
  ctx.fillStyle = resolvedHex
  ctx.beginPath()
  ctx.moveTo(30, 162)
  ctx.quadraticCurveTo(36, 118, 66, 114)
  ctx.lineTo(94, 114)
  ctx.quadraticCurveTo(124, 118, 130, 162)
  ctx.closePath()
  ctx.fill()

  // Crisp inner shirt V-collar
  ctx.fillStyle = preset.innerShirtHex
  ctx.beginPath()
  ctx.moveTo(66, 115)
  ctx.lineTo(94, 115)
  ctx.lineTo(81, 141)
  ctx.closePath()
  ctx.fill()

  // Tie / ribbon / gold pin / IT emblem
  if (
    preset.outfitStyle === "suit_tie" ||
    preset.outfitStyle === "blazer_pin"
  ) {
    ctx.fillStyle = preset.tieOrAccentHex
    ctx.beginPath()
    ctx.moveTo(77, 118)
    ctx.lineTo(84, 118)
    ctx.lineTo(86, 146)
    ctx.lineTo(80.5, 154)
    ctx.lineTo(75, 146)
    ctx.closePath()
    ctx.fill()
  } else if (preset.outfitStyle === "skirt_blouse") {
    ctx.fillStyle = preset.tieOrAccentHex
    ctx.beginPath()
    ctx.moveTo(80, 128)
    ctx.lineTo(68, 122)
    ctx.lineTo(68, 134)
    ctx.closePath()
    ctx.moveTo(80, 128)
    ctx.lineTo(92, 122)
    ctx.lineTo(92, 134)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.arc(80, 128, 4.2, 0, Math.PI * 2)
    ctx.fill()
  }
  if (preset.hasItEmblem) {
    ctx.fillStyle = "#f5b81c"
    ctx.fillRect(92, 130, 19, 11)
    ctx.fillStyle = "#1c1404"
    ctx.font = "900 8px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("IT", 101.5, 136)
  }

  // Cute neck
  ctx.fillStyle = preset.skinColor
  ctx.fillRect(72, 105, 16, 14)

  // Ears
  ctx.beginPath()
  ctx.arc(41, 79, 8, 0, Math.PI * 2)
  ctx.arc(119, 79, 8, 0, Math.PI * 2)
  ctx.fill()

  // Plump rounded Chibi head
  const skinGrad = ctx.createRadialGradient(74, 66, 8, 80, 77, 42)
  skinGrad.addColorStop(0, "#fff0e0")
  skinGrad.addColorStop(0.55, preset.skinColor)
  skinGrad.addColorStop(1, "#eebc98")
  ctx.fillStyle = skinGrad
  ctx.beginPath()
  ctx.ellipse(80, 76, 40, 36.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Cheek blush
  for (const bx of [54, 106]) {
    const blush = ctx.createRadialGradient(bx, 88, 1, bx, 88, 10)
    blush.addColorStop(
      0,
      `rgba(255, 118, 142, ${isFemale ? 0.46 : isCool ? 0.24 : 0.34})`
    )
    blush.addColorStop(1, "rgba(255, 118, 142, 0)")
    ctx.fillStyle = blush
    ctx.beginPath()
    ctx.ellipse(bx, 88, 10, 6.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Glossy sparkle eyes (shifted slightly right for cute 3/4 feel)
  const exShift = 2
  drawPortraitEye(
    ctx,
    63 + exShift,
    78,
    isFemale ? 7.8 : 7,
    isCool ? 7 : isFemale ? 9.2 : 8.2,
    preset.eyeColor,
    isFemale,
    isCool,
    -1
  )
  drawPortraitEye(
    ctx,
    97 + exShift,
    78,
    isFemale ? 7.8 : 7,
    isCool ? 7 : isFemale ? 9.2 : 8.2,
    preset.eyeColor,
    isFemale,
    isCool,
    1
  )

  // Eyebrows
  ctx.strokeStyle = isCool ? "#151b26" : "#3a271d"
  ctx.lineWidth = isFemale ? 1.8 : 2.3
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(56 + exShift, 65)
  ctx.quadraticCurveTo(63 + exShift, 62, 70 + exShift, 65)
  ctx.moveTo(90 + exShift, 65)
  ctx.quadraticCurveTo(97 + exShift, 62, 104 + exShift, 65)
  ctx.stroke()

  // Warm smile / smirk
  ctx.strokeStyle = "#7a3b2e"
  ctx.lineWidth = 2.2
  ctx.beginPath()
  if (isCool) {
    ctx.moveTo(75 + exShift, 96)
    ctx.quadraticCurveTo(83 + exShift, 98, 90 + exShift, 93)
  } else {
    ctx.arc(80 + exShift, 91, 6.5, 0.16 * Math.PI, 0.84 * Math.PI)
  }
  ctx.stroke()

  // Front sculpted hair crown + bangs
  ctx.fillStyle = preset.hairColor
  ctx.beginPath()
  ctx.arc(80, 66, 42, Math.PI * 0.98, Math.PI * 2.02)
  ctx.quadraticCurveTo(118, 56, 114, 72)
  ctx.quadraticCurveTo(100, 56, 84, 62)
  ctx.quadraticCurveTo(64, 54, 46, 72)
  ctx.quadraticCurveTo(41, 56, 38, 66)
  ctx.closePath()
  ctx.fill()

  if (preset.hairStyle === "spiky" || preset.hairStyle === "tousled_cool") {
    ctx.beginPath()
    ctx.moveTo(56, 34)
    ctx.lineTo(66, 18)
    ctx.lineTo(76, 32)
    ctx.lineTo(88, 17)
    ctx.lineTo(98, 34)
    ctx.lineTo(110, 26)
    ctx.lineTo(112, 46)
    ctx.closePath()
    ctx.fill()
  }
  if (preset.hairHighlight) {
    ctx.fillStyle = preset.hairHighlight
    ctx.beginPath()
    ctx.moveTo(96, 48)
    ctx.quadraticCurveTo(108, 56, 106, 68)
    ctx.quadraticCurveTo(96, 62, 92, 52)
    ctx.closePath()
    ctx.fill()
  }
  if (preset.hasHeadband) {
    ctx.strokeStyle = "#f3c64a"
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(80, 68, 40, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
    ctx.fillStyle = "#fffaf0"
    ctx.beginPath()
    ctx.arc(98, 33, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }
  if (preset.hasHairClips) {
    ctx.fillStyle = "#f3c64a"
    ctx.save()
    ctx.translate(105, 55)
    ctx.rotate(-0.35)
    ctx.fillRect(-7, -2, 14, 3.2)
    ctx.fillRect(-6, 3, 12, 3)
    ctx.restore()
  }

  // Sleek glasses overlay
  if (preset.hasGlasses) {
    ctx.strokeStyle = preset.glassesColor ?? "#1f2937"
    ctx.lineWidth = 2.4
    ctx.fillStyle = isCool
      ? "rgba(56, 189, 248, 0.22)"
      : "rgba(224, 242, 254, 0.16)"
    for (const gx of [63 + exShift, 97 + exShift]) {
      ctx.beginPath()
      ctx.arc(gx, 78, 12.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(75.2 + exShift, 78)
    ctx.lineTo(84.8 + exShift, 78)
    ctx.stroke()
  }

  ctx.restore()
  const url = canvas.toDataURL("image/png")
  portraitCache.set(cacheKey, url)
  return url
}

/** Generates crisp Chibi portrait data URLs for all 11 canonical Trading Floor avatars. */
export function buildAllChibiPortraits(
  colorHex?: string | null,
  size = 160
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const avatar of AVATARS) {
    out[avatar.id] = renderChibiPortraitDataUrl(avatar.id, colorHex, size)
  }
  return out
}

// ---------- Live Interactive 3D Mini-Stage Controller ----------

export interface Chibi3DPreviewSpec {
  avatarId: string
  colorHex?: string | null
  size?: number
  anim?: ChibiAnimMode
  interactive?: boolean
  onContextLost?: () => void
}

export interface Chibi3DPreviewHandle {
  update: (next: {
    avatarId?: string
    colorHex?: string | null
    size?: number
    anim?: ChibiAnimMode
  }) => void
  dispose: () => void
}

/** Charming 3/4 front idle presentation angle & gentle sway bounds (never turns back to camera). */
export const PREVIEW_INITIAL_YAW = 0.22
export const PREVIEW_SWAY_AMP = 0.32
export const PREVIEW_SWAY_FREQ = 0.9

export function computePreviewYaw(baseYaw: number, swayTimeS: number): number {
  return baseYaw + Math.sin(swayTimeS * PREVIEW_SWAY_FREQ) * PREVIEW_SWAY_AMP
}

/**
 * Mounts a live, responsive interactive 3D Chibi character inside `container`.
 * Presents the character at a charming 3/4 front angle with gentle idle sway while supporting smooth 360° drag.
 * Returns `null` cleanly if WebGL is unavailable so callers can render the crisp 2D portrait fallback.
 */
export function mountChibi3DPreview(
  container: HTMLElement,
  initial: Chibi3DPreviewSpec
): Chibi3DPreviewHandle | null {
  if (
    typeof navigator !== "undefined" &&
    /\bjsdom\b/i.test(navigator.userAgent)
  ) {
    return null
  }
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    })
  } catch {
    return null
  }

  let fallbackSize = initial.size ?? 168
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08

  const dom = renderer.domElement
  dom.style.width = "100%"
  dom.style.height = "100%"
  dom.style.display = "block"
  dom.style.cursor = initial.interactive === false ? "default" : "grab"
  container.appendChild(dom)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30)
  camera.position.set(0, 1.32, 3.65)
  camera.lookAt(0, 0.88, 0)

  let disposed = false

  const syncRendererSize = (): void => {
    if (disposed) return
    const w = Math.max(1, Math.round(container.clientWidth || fallbackSize))
    const h = Math.max(1, Math.round(container.clientHeight || fallbackSize))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  syncRendererSize()

  let resizeObserver: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => syncRendererSize())
    resizeObserver.observe(container)
  }

  // Warm 3-point chibi studio lighting
  const hemi = new THREE.HemisphereLight(0xfff9f0, 0x6f7c99, 1.35)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xfff4e0, 1.6)
  key.position.set(2.4, 3.8, 3.2)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.85)
  rim.position.set(-2.6, 2.2, -2.5)
  scene.add(rim)

  // Subtle glowing circular pedestal ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe9b949,
    transparent: true,
    opacity: 0.42,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.52, 32), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.005
  scene.add(ring)

  let currentAvatarId = initial.avatarId
  let currentColorHex = initial.colorHex ?? null
  let currentAnim: ChibiAnimMode = initial.anim ?? "idle"
  let rig: ChibiRig = createChibiCharacter({
    avatarId: currentAvatarId,
    outfitColorHex: currentColorHex,
  })
  scene.add(rig.root)

  let baseYaw = PREVIEW_INITIAL_YAW
  let swayTime = 0
  let dragging = false
  let lastX = 0
  let contextLost = false
  let rafId = 0
  let lastTs = performance.now()

  // Present initial frame immediately facing front 3/4
  rig.update(0, { anim: currentAnim, facingRad: baseYaw })
  renderer.render(scene, camera)

  const onPointerDown = (e: PointerEvent): void => {
    if (initial.interactive === false) return
    baseYaw = computePreviewYaw(baseYaw, swayTime)
    swayTime = 0
    dragging = true
    lastX = e.clientX
    dom.style.cursor = "grabbing"
    dom.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return
    const dx = e.clientX - lastX
    lastX = e.clientX
    baseYaw += dx * 0.015
  }
  const onPointerUp = (): void => {
    dragging = false
    dom.style.cursor = initial.interactive === false ? "default" : "grab"
  }
  const onContextLost = (e: Event): void => {
    e.preventDefault()
    contextLost = true
    initial.onContextLost?.()
  }
  const onContextRestored = (): void => {
    contextLost = false
    syncRendererSize()
  }

  dom.addEventListener("pointerdown", onPointerDown)
  dom.addEventListener("pointermove", onPointerMove)
  dom.addEventListener("pointerup", onPointerUp)
  dom.addEventListener("pointercancel", onPointerUp)
  dom.addEventListener("webglcontextlost", onContextLost)
  dom.addEventListener("webglcontextrestored", onContextRestored)

  const tick = (now: number): void => {
    if (disposed) return
    rafId = requestAnimationFrame(tick)
    if (contextLost) return
    const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000))
    lastTs = now
    if (!dragging) {
      swayTime += dt
    }
    const facingRad = dragging
      ? baseYaw
      : computePreviewYaw(baseYaw, swayTime)
    rig.update(dt, {
      anim: currentAnim,
      facingRad,
    })
    renderer.render(scene, camera)
  }
  rafId = requestAnimationFrame(tick)

  return {
    update: (next) => {
      if (disposed) return
      if (next.anim !== undefined) currentAnim = next.anim
      if (next.size !== undefined && next.size > 0) {
        fallbackSize = next.size
        syncRendererSize()
      }
      const nextColor =
        next.colorHex !== undefined ? next.colorHex : currentColorHex
      if (next.avatarId !== undefined && next.avatarId !== currentAvatarId) {
        scene.remove(rig.root)
        rig.dispose()
        currentAvatarId = next.avatarId
        currentColorHex = nextColor
        rig = createChibiCharacter({
          avatarId: currentAvatarId,
          outfitColorHex: currentColorHex,
        })
        scene.add(rig.root)
        baseYaw = PREVIEW_INITIAL_YAW
        swayTime = 0
        rig.update(0, { anim: currentAnim, facingRad: baseYaw })
      } else if (nextColor !== currentColorHex) {
        currentColorHex = nextColor
        rig.setOutfitColor(currentColorHex)
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      dom.removeEventListener("pointerdown", onPointerDown)
      dom.removeEventListener("pointermove", onPointerMove)
      dom.removeEventListener("pointerup", onPointerUp)
      dom.removeEventListener("pointercancel", onPointerUp)
      dom.removeEventListener("webglcontextlost", onContextLost)
      dom.removeEventListener("webglcontextrestored", onContextRestored)
      scene.remove(rig.root)
      rig.dispose()
      ring.geometry.dispose()
      ringMat.dispose()
      renderer.dispose()
      if (dom.parentNode === container) {
        container.removeChild(dom)
      }
    },
  }
}
