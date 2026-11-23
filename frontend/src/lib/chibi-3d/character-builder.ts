import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

import { createSignTexture } from "./textures.ts"
import {
  SHARED_TEXTURE_FLAG,
  createClothMaterial,
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  getAvatarStylePreset,
  resolveOutfitHex,
  shortestAngleDiff,
  type AvatarStylePreset,
  type ChibiCharacterSpec,
  type ChibiHairStyle,
  type ChibiRig,
  type ChibiStatueRank,
  type ChibiUpdateState,
} from "./types.ts"

// ---------- Accessibility: Reduced Motion Detection ----------

let cachedReducedMotionMql: MediaQueryList | null = null
let cachedMatchMediaRef: typeof window.matchMedia | null = null

/**
 * Returns true when the user prefers reduced motion (`(prefers-reduced-motion: reduce)`).
 * Safe in SSR/jsdom environments and zero-allocation per frame in real browsers.
 */
export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false
  }
  const mm = window.matchMedia
  const isMocked = "mock" in (mm as unknown as Record<string, unknown>)
  if (!isMocked && mm === cachedMatchMediaRef && cachedReducedMotionMql) {
    return Boolean(cachedReducedMotionMql.matches)
  }
  try {
    const mql = mm.call(window, "(prefers-reduced-motion: reduce)")
    if (!isMocked && mql && typeof mql.addEventListener === "function") {
      cachedMatchMediaRef = mm
      cachedReducedMotionMql = mql
    } else {
      cachedMatchMediaRef = null
      cachedReducedMotionMql = null
    }
    return Boolean(mql?.matches)
  } catch {
    return false
  }
}

// ---------- Material Slots, Detail Levels & Ref-Counted Shared Caches ----------

type MaterialSlot =
  | "skin"
  | "skinShade"
  | "hair"
  | "hairHighlight"
  | "outfit"
  | "outfitShade"
  | "bottom"
  | "shirt"
  | "accent"
  | "belt"
  | "shoe"
  | "sole"
  | "gold"
  | "pearl"
  | "sclera"
  | "iris"
  | "pupilLash"
  | "eyeHighlight"
  | "browMouth"
  | "mouthFill"
  | "blush"
  | "glassesFrame"
  | "glassesLens"
  | "medalRim"
  | "medalFace"
  | "crimson"
  | "deepRed"
  | "brightGold"
  | "beard"
  | "ruby"
  | "jade"
  | "halo"

interface DetailLevel {
  lite: boolean
  headSegW: number
  headSegH: number
  torsoSeg: number
  limbSeg: number
  capSeg: number
  strandTubular: number
  strandRadial: number
  ringTubular: number
  ringRadial: number
  smallSphereW: number
  smallSphereH: number
}

const FULL_DETAIL: DetailLevel = {
  lite: false,
  headSegW: 22,
  headSegH: 16,
  torsoSeg: 18,
  limbSeg: 10,
  capSeg: 5,
  strandTubular: 7,
  strandRadial: 6,
  ringTubular: 18,
  ringRadial: 7,
  smallSphereW: 10,
  smallSphereH: 8,
}

const LITE_DETAIL: DetailLevel = {
  lite: true,
  headSegW: 14,
  headSegH: 10,
  torsoSeg: 12,
  limbSeg: 8,
  capSeg: 4,
  strandTubular: 5,
  strandRadial: 4,
  ringTubular: 12,
  ringRadial: 5,
  smallSphereW: 8,
  smallSphereH: 6,
}

interface MergedPartEntry {
  slot: MaterialSlot
  geometry: THREE.BufferGeometry
  noShadow?: boolean
  renderOrder?: number
}

interface VariantGeometryBundle {
  key: string
  refCount: number
  shadowGeo: THREE.BufferGeometry
  leftLeg: MergedPartEntry[]
  rightLeg: MergedPartEntry[]
  torso: MergedPartEntry[]
  leftArm: MergedPartEntry[]
  rightArm: MergedPartEntry[]
  head: MergedPartEntry[]
  eyes: MergedPartEntry[]
  hair: MergedPartEntry[]
  ponytail: MergedPartEntry[]
  glasses: MergedPartEntry[]
  medal: MergedPartEntry[]
  halo: MergedPartEntry[]
  ingot: MergedPartEntry[]
  eyeCenterY: number
  hasDynamicEyes: boolean
  hasPonytail: boolean
}

interface VariantMaterialPalette {
  key: string
  refCount: number
  materials: Map<MaterialSlot, THREE.Material>
  shadowMat: THREE.MeshBasicMaterial
}

const geometryBundleCache = new Map<string, VariantGeometryBundle>()
const materialPaletteCache = new Map<string, VariantMaterialPalette>()

/** Exposes active ref-counted cache sizes for diagnostics and unit tests. */
export function getCharacterCacheStats(): {
  geometryBundles: number
  materialPalettes: number
} {
  return {
    geometryBundles: geometryBundleCache.size,
    materialPalettes: materialPaletteCache.size,
  }
}

function disposeMaterialSafely(mat: THREE.Material): void {
  const std = mat as THREE.MeshStandardMaterial & {
    map?: THREE.Texture | null
    emissiveMap?: THREE.Texture | null
    roughnessMap?: THREE.Texture | null
    metalnessMap?: THREE.Texture | null
    alphaMap?: THREE.Texture | null
    bumpMap?: THREE.Texture | null
    normalMap?: THREE.Texture | null
  }
  const textures = [
    std.map,
    std.emissiveMap,
    std.roughnessMap,
    std.metalnessMap,
    std.alphaMap,
    std.bumpMap,
    std.normalMap,
  ]
  for (const tex of textures) {
    if (
      tex &&
      !(tex.userData as Record<string, unknown>)[SHARED_TEXTURE_FLAG]
    ) {
      tex.dispose()
    }
  }
  mat.dispose()
}

function releaseGeometryBundle(bundle: VariantGeometryBundle): void {
  bundle.refCount -= 1
  if (bundle.refCount > 0) return
  geometryBundleCache.delete(bundle.key)
  const disposed = new Set<THREE.BufferGeometry>()
  disposed.add(bundle.shadowGeo)
  bundle.shadowGeo.dispose()
  const lists = [
    bundle.leftLeg,
    bundle.rightLeg,
    bundle.torso,
    bundle.leftArm,
    bundle.rightArm,
    bundle.head,
    bundle.eyes,
    bundle.hair,
    bundle.ponytail,
    bundle.glasses,
    bundle.medal,
    bundle.halo,
    bundle.ingot,
  ]
  for (const list of lists) {
    for (const entry of list) {
      if (!disposed.has(entry.geometry)) {
        disposed.add(entry.geometry)
        entry.geometry.dispose()
      }
    }
  }
}

function releaseMaterialPalette(palette: VariantMaterialPalette): void {
  palette.refCount -= 1
  if (palette.refCount > 0) return
  materialPaletteCache.delete(palette.key)
  for (const mat of palette.materials.values()) {
    disposeMaterialSafely(mat)
  }
  palette.shadowMat.dispose()
}

// ---------- Geometry Batching & Merging Helper ----------

const _buildMat4 = new THREE.Matrix4()
const _buildQuat = new THREE.Quaternion()
const _buildEuler = new THREE.Euler()
const _buildPos = new THREE.Vector3()
const _buildScale = new THREE.Vector3()

class PivotGeometryCollector {
  private readonly buckets = new Map<
    MaterialSlot,
    {
      geoms: THREE.BufferGeometry[]
      noShadow: boolean
      renderOrder: number
    }
  >()

  add(
    slot: MaterialSlot,
    rawGeom: THREE.BufferGeometry,
    pos?: [number, number, number],
    rot?: [number, number, number],
    scale?: [number, number, number],
    opts?: { noShadow?: boolean; renderOrder?: number }
  ): void {
    const g = rawGeom
    if (pos || rot || scale) {
      _buildEuler.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)
      _buildQuat.setFromEuler(_buildEuler)
      _buildPos.set(pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0)
      _buildScale.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1)
      _buildMat4.compose(_buildPos, _buildQuat, _buildScale)
      g.applyMatrix4(_buildMat4)
    }
    let bucket = this.buckets.get(slot)
    if (!bucket) {
      bucket = {
        geoms: [],
        noShadow: opts?.noShadow ?? false,
        renderOrder: opts?.renderOrder ?? 0,
      }
      this.buckets.set(slot, bucket)
    } else {
      if (opts?.noShadow) bucket.noShadow = true
      if (opts?.renderOrder && opts.renderOrder > bucket.renderOrder) {
        bucket.renderOrder = opts.renderOrder
      }
    }
    bucket.geoms.push(g)
  }

  flush(): MergedPartEntry[] {
    const out: MergedPartEntry[] = []
    for (const [slot, bucket] of this.buckets) {
      if (bucket.geoms.length === 0) continue
      const useVertexColors = slot === "iris"
      const merged = mergeNormalizedGeometries(bucket.geoms, useVertexColors)
      out.push({
        slot,
        geometry: merged,
        noShadow: bucket.noShadow,
        renderOrder: bucket.renderOrder,
      })
    }
    return out
  }
}

function mergeNormalizedGeometries(
  geoms: THREE.BufferGeometry[],
  includeVertexColors: boolean
): THREE.BufferGeometry {
  if (geoms.length === 1) {
    const single = geoms[0]
    if (!single.getAttribute("normal")) {
      single.computeVertexNormals()
    }
    if (!includeVertexColors && single.getAttribute("color")) {
      single.deleteAttribute("color")
    }
    return single
  }

  const prepared: THREE.BufferGeometry[] = []
  for (const src of geoms) {
    let g: THREE.BufferGeometry
    if (src.index) {
      g = src.toNonIndexed()
      src.dispose()
    } else {
      g = src
    }
    if (!g.getAttribute("normal")) {
      g.computeVertexNormals()
    }
    const pos = g.getAttribute("position")
    if (!g.getAttribute("uv") && pos) {
      g.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2)
      )
    }
    if (includeVertexColors) {
      if (!g.getAttribute("color") && pos) {
        const white = new Float32Array(pos.count * 3)
        white.fill(1)
        g.setAttribute("color", new THREE.Float32BufferAttribute(white, 3))
      }
    } else if (g.getAttribute("color")) {
      g.deleteAttribute("color")
    }
    for (const key of Object.keys(g.attributes)) {
      if (
        key !== "position" &&
        key !== "normal" &&
        key !== "uv" &&
        !(includeVertexColors && key === "color")
      ) {
        g.deleteAttribute(key)
      }
    }
    prepared.push(g)
  }
  const merged = mergeGeometries(prepared, false)
  for (const g of prepared) {
    g.dispose()
  }
  return merged ?? new THREE.BufferGeometry()
}

// ---------- Color Utilities ----------

function shadeHex(hex: string, lightnessMul: number, satShift = 0): string {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(
    hsl.h,
    Math.max(0, Math.min(1, hsl.s + satShift)),
    Math.max(0.05, Math.min(0.95, hsl.l * lightnessMul))
  )
  return `#${c.getHexString()}`
}

function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

// ---------- Sculpted Chibi Head & Surface Projection Math ----------

function sculptHeadPoint(
  ux: number,
  uy: number,
  uz: number,
  isFemale: boolean,
  isThanTai: boolean
): [number, number, number] {
  const rx = isThanTai ? 0.39 : isFemale ? 0.372 : 0.376
  const ry = isThanTai ? 0.352 : 0.342
  const rz = isThanTai ? 0.362 : 0.352

  let x = ux * rx
  let y = uy * ry
  let z = uz * rz

  // Soft chubby chibi lower cheeks
  const cheekY = Math.exp(-Math.pow((uy + 0.22) / 0.27, 2))
  const cheekSide = Math.exp(-Math.pow((Math.abs(ux) - 0.62) / 0.34, 2))
  const cheekFront = Math.max(0, (uz + 0.16) / 1.16)
  const cheekAmp = isThanTai ? 0.036 : isFemale ? 0.028 : 0.022
  const cheekW = cheekY * cheekSide * cheekFront
  x += Math.sign(ux) * cheekW * cheekAmp
  z += cheekW * cheekAmp * 0.52

  // Gently tapered cute chin & contoured jaw
  if (uy < -0.34) {
    const chinT = Math.min(1, (-uy - 0.34) / 0.66)
    const chinS = chinT * chinT * (3 - 2 * chinT)
    x *= 1 - chinS * (isFemale ? 0.17 : isThanTai ? 0.07 : 0.13)
    y -= chinS * Math.max(0, uz) * (isFemale ? 0.022 : 0.017)
    z += chinS * Math.min(0, uz) * 0.032
  }

  // Gently softened front face curvature so facial features read crisply
  if (uz > 0.55) {
    const faceFlat = (uz - 0.55) * Math.exp(-Math.pow(uy / 0.44, 2))
    z -= faceFlat * 0.022
  }

  // Subtle crown loft
  if (uy > 0.32) {
    y += (uy - 0.32) * 0.014
  }

  return [x, y, z]
}

interface HeadFrame {
  pos: THREE.Vector3
  normal: THREE.Vector3
  tangentX: THREE.Vector3
  tangentY: THREE.Vector3
}

function evaluateHeadFrame(
  ux: number,
  uy: number,
  uz: number,
  isFemale: boolean,
  isThanTai: boolean
): HeadFrame {
  const len = Math.hypot(ux, uy, uz) || 1
  const nx0 = ux / len
  const ny0 = uy / len
  const nz0 = uz / len
  const [px, py, pz] = sculptHeadPoint(nx0, ny0, nz0, isFemale, isThanTai)
  const pos = new THREE.Vector3(px, py, pz)

  const eps = 0.015
  // Tangent along +X on sphere
  const [x1, y1, z1] = sculptHeadPoint(
    (nx0 + eps) / Math.hypot(nx0 + eps, ny0, nz0),
    ny0 / Math.hypot(nx0 + eps, ny0, nz0),
    nz0 / Math.hypot(nx0 + eps, ny0, nz0),
    isFemale,
    isThanTai
  )
  const [x2, y2, z2] = sculptHeadPoint(
    nx0 / Math.hypot(nx0, ny0 + eps, nz0),
    (ny0 + eps) / Math.hypot(nx0, ny0 + eps, nz0),
    nz0 / Math.hypot(nx0, ny0 + eps, nz0),
    isFemale,
    isThanTai
  )
  const tx = new THREE.Vector3(x1 - px, y1 - py, z1 - pz).normalize()
  const ty = new THREE.Vector3(x2 - px, y2 - py, z2 - pz).normalize()
  const normal = new THREE.Vector3().crossVectors(tx, ty).normalize()
  if (normal.dot(pos) < 0) normal.negate()
  const tangentX = new THREE.Vector3().crossVectors(ty, normal).normalize()
  const tangentY = new THREE.Vector3().crossVectors(normal, tangentX).normalize()

  return { pos, normal, tangentX, tangentY }
}

function createSculptedHeadGeometry(
  isFemale: boolean,
  isThanTai: boolean,
  segW: number,
  segH: number
): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(1, segW, segH)
  const pos = geom.getAttribute("position")
  for (let i = 0; i < pos.count; i += 1) {
    const ux = pos.getX(i)
    const uy = pos.getY(i)
    const uz = pos.getZ(i)
    const [x, y, z] = sculptHeadPoint(ux, uy, uz, isFemale, isThanTai)
    pos.setXYZ(i, x, y, z)
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()
  return geom
}

/**
 * Generates a curved oval disc conformed to the sculpted head surface,
 * optionally with rich top-to-bottom vertex color gradient (used for jewel chibi irises).
 */
function createConformalFaceOval(opts: {
  dirX: number
  dirY: number
  rx: number
  ry: number
  surfaceOffset: number
  yPivotOffset?: number
  segs: number
  isFemale: boolean
  isThanTai: boolean
  domeBulge?: number
  gradientColors?: {
    top: string
    mid: string
    bottom: string
  }
}): THREE.BufferGeometry {
  const {
    dirX,
    dirY,
    rx,
    ry,
    surfaceOffset,
    yPivotOffset = 0,
    segs,
    isFemale,
    isThanTai,
    domeBulge = 0.004,
    gradientColors,
  } = opts
  const dirZ = Math.sqrt(Math.max(0.05, 1 - dirX * dirX - dirY * dirY))
  const centerFrame = evaluateHeadFrame(dirX, dirY, dirZ, isFemale, isThanTai)

  const rings = gradientColors ? 3 : 2
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  const topC = gradientColors ? new THREE.Color(gradientColors.top) : null
  const midC = gradientColors ? new THREE.Color(gradientColors.mid) : null
  const botC = gradientColors ? new THREE.Color(gradientColors.bottom) : null
  const tmpC = new THREE.Color()

  const sampleColor = (nyNorm: number): void => {
    if (!topC || !midC || !botC) return
    if (nyNorm >= 0) {
      tmpC.copy(midC).lerp(topC, nyNorm)
    } else {
      tmpC.copy(midC).lerp(botC, Math.min(1, -nyNorm * 1.15))
    }
    colors.push(tmpC.r, tmpC.g, tmpC.b)
  }

  const projectLocal = (lx: number, ly: number, rFrac: number): THREE.Vector3 => {
    const worldApprox = centerFrame.pos
      .clone()
      .addScaledVector(centerFrame.tangentX, lx)
      .addScaledVector(centerFrame.tangentY, ly)
    const dir = worldApprox.clone().normalize()
    const [sx, sy, sz] = sculptHeadPoint(
      dir.x,
      dir.y,
      dir.z,
      isFemale,
      isThanTai
    )
    const bulge = (1 - rFrac * rFrac) * domeBulge
    const pt = new THREE.Vector3(sx, sy, sz).addScaledVector(
      centerFrame.normal,
      surfaceOffset + bulge
    )
    pt.y -= yPivotOffset
    return pt
  }

  // Center vertex
  const cPt = projectLocal(0, 0, 0)
  positions.push(cPt.x, cPt.y, cPt.z)
  uvs.push(0.5, 0.5)
  sampleColor(0)

  for (let r = 1; r <= rings; r += 1) {
    const rf = r / rings
    for (let s = 0; s < segs; s += 1) {
      const a = (s / segs) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const pt = projectLocal(ca * rx * rf, sa * ry * rf, rf)
      positions.push(pt.x, pt.y, pt.z)
      uvs.push(0.5 + ca * 0.5 * rf, 0.5 + sa * 0.5 * rf)
      sampleColor(sa * rf)
    }
  }

  // Inner fan
  for (let s = 0; s < segs; s += 1) {
    const next = (s + 1) % segs
    indices.push(0, 1 + s, 1 + next)
  }
  // Outer rings
  for (let r = 1; r < rings; r += 1) {
    const row0 = 1 + (r - 1) * segs
    const row1 = 1 + r * segs
    for (let s = 0; s < segs; s += 1) {
      const next = (s + 1) % segs
      indices.push(row0 + s, row1 + s, row1 + next)
      indices.push(row0 + s, row1 + next, row0 + next)
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  if (gradientColors) {
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  }
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

/**
 * Sweeps a smooth tapered 3D tube along points projected onto the sculpted head surface.
 * Used for eyelashes, upper eyelids, eyebrows, and sculpted 3D smiles.
 */
function createConformalFaceTube(opts: {
  points2D: [number, number][]
  radii: number[]
  surfaceOffset: number
  yPivotOffset?: number
  isFemale: boolean
  isThanTai: boolean
  tubularSegs: number
  radialSegs: number
}): THREE.BufferGeometry {
  const {
    points2D,
    radii,
    surfaceOffset,
    yPivotOffset = 0,
    isFemale,
    isThanTai,
    tubularSegs,
    radialSegs,
  } = opts
  const pts3D = points2D.map(([dx, dy]) => {
    const dz = Math.sqrt(Math.max(0.05, 1 - dx * dx - dy * dy))
    const f = evaluateHeadFrame(dx, dy, dz, isFemale, isThanTai)
    const p = f.pos.clone().addScaledVector(f.normal, surfaceOffset)
    p.y -= yPivotOffset
    return p
  })
  return createTaperedStrandGeometry(
    pts3D,
    radii,
    0.72,
    tubularSegs,
    radialSegs,
    new THREE.Vector3(0, -yPivotOffset, 0)
  )
}

/**
 * Builds a closed, smooth, elliptical-cross-section tapered 3D strand along a Catmull-Rom curve.
 * Cross-section flattens cleanly toward `originCenter` so hair strands and facial strokes hug the skull.
 */
function createTaperedStrandGeometry(
  controlPoints: THREE.Vector3[],
  radii: number[],
  thicknessRatio: number,
  tubularSegs: number,
  radialSegs: number,
  originCenter = new THREE.Vector3(0, 0, 0)
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(controlPoints)
  const sampleRadius = (t: number): number => {
    if (radii.length === 1) return radii[0]
    const scaled = t * (radii.length - 1)
    const i0 = Math.min(radii.length - 2, Math.floor(scaled))
    const frac = scaled - i0
    return radii[i0] + (radii[i0 + 1] - radii[i0]) * frac
  }

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const ringPts: THREE.Vector3[] = []
  const tangent = new THREE.Vector3()
  const outVec = new THREE.Vector3()
  const sideVec = new THREE.Vector3()
  const normalVec = new THREE.Vector3()

  for (let i = 0; i <= tubularSegs; i += 1) {
    const t = i / tubularSegs
    const p = curve.getPoint(t)
    curve.getTangent(t, tangent).normalize()
    outVec.subVectors(p, originCenter)
    if (outVec.lengthSq() < 1e-5) outVec.set(0, 0, 1)
    outVec.normalize()
    sideVec.crossVectors(tangent, outVec)
    if (sideVec.lengthSq() < 1e-5) {
      sideVec.crossVectors(tangent, new THREE.Vector3(0, 1, 0))
    }
    if (sideVec.lengthSq() < 1e-5) {
      sideVec.set(1, 0, 0)
    }
    sideVec.normalize()
    normalVec.crossVectors(sideVec, tangent).normalize()

    const r = Math.max(0.002, sampleRadius(t))
    const rFlat = r * thicknessRatio
    ringPts.push(p)

    for (let j = 0; j < radialSegs; j += 1) {
      const a = (j / radialSegs) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const vx = p.x + sideVec.x * ca * r + normalVec.x * sa * rFlat
      const vy = p.y + sideVec.y * ca * r + normalVec.y * sa * rFlat
      const vz = p.z + sideVec.z * ca * r + normalVec.z * sa * rFlat
      positions.push(vx, vy, vz)
      uvs.push(j / radialSegs, t)
    }
  }

  for (let i = 0; i < tubularSegs; i += 1) {
    const row0 = i * radialSegs
    const row1 = (i + 1) * radialSegs
    for (let j = 0; j < radialSegs; j += 1) {
      const next = (j + 1) % radialSegs
      indices.push(row0 + j, row1 + j, row1 + next)
      indices.push(row0 + j, row1 + next, row0 + next)
    }
  }

  // Start & end caps (outward winding: -tangent at start, +tangent at end)
  const startCenterIdx = positions.length / 3
  const pStart = ringPts[0]
  positions.push(pStart.x, pStart.y, pStart.z)
  uvs.push(0.5, 0)
  for (let j = 0; j < radialSegs; j += 1) {
    const next = (j + 1) % radialSegs
    indices.push(startCenterIdx, j, next)
  }

  const endCenterIdx = positions.length / 3
  const pEnd = ringPts[ringPts.length - 1]
  positions.push(pEnd.x, pEnd.y, pEnd.z)
  uvs.push(0.5, 1)
  const lastRow = tubularSegs * radialSegs
  for (let j = 0; j < radialSegs; j += 1) {
    const next = (j + 1) % radialSegs
    indices.push(endCenterIdx, lastRow + next, lastRow + j)
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

function strandFromTuples(
  pts: [number, number, number][],
  radii: number[],
  detail: DetailLevel,
  thicknessRatio = 0.62
): THREE.BufferGeometry {
  return createTaperedStrandGeometry(
    pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    radii,
    thicknessRatio,
    detail.strandTubular,
    detail.strandRadial
  )
}

/**
 * Generates a closed, thick, form-fitting sculpted hair base shell hugging `sculptHeadPoint`.
 * Front hairline sits strictly above `y >= 0.165` across `|x| <= 0.19` so eyes/eyebrows are never blocked.
 */
function createSculptedHairCapGeometry(
  isFemale: boolean,
  backDrop: number,
  segU: number,
  segV: number
): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  // Azimuth `az = 0` is +Z (front), `±π/2` are sides, `±π` is -Z (back)
  const maxThetaAtAz = (az: number): number => {
    const absAz = Math.abs(az)
    // Smooth angular blend from forehead hairline (~1.01 rad -> uy ~0.53 -> y ~0.185)
    // to temple (~1.42 rad -> uy ~0.15) to back nape (~2.25..2.45 rad -> uy ~ -0.63..-0.77)
    if (absAz < 0.72) {
      const t = absAz / 0.72
      const s = t * t * (3 - 2 * t)
      return 0.99 + s * 0.14
    }
    if (absAz < 1.38) {
      const t = (absAz - 0.72) / 0.66
      const s = t * t * (3 - 2 * t)
      return 1.13 + s * (0.48 + (isFemale ? 0.14 : 0))
    }
    const t = Math.min(1, (absAz - 1.38) / (Math.PI - 1.38))
    const s = t * t * (3 - 2 * t)
    const sideTheta = 1.61 + (isFemale ? 0.14 : 0)
    return sideTheta + s * (backDrop - sideTheta)
  }

  const ringCount = segV + 2 // +1 outer tucked rim +1 inner tucked rim
  for (let v = 0; v <= ringCount; v += 1) {
    const isRimTurn = v === segV + 1
    const isInnerEdge = v === ringCount
    const vFrac = Math.min(1, v / segV)

    for (let u = 0; u < segU; u += 1) {
      const az = (u / segU) * Math.PI * 2 - Math.PI
      const thetaMax = maxThetaAtAz(az)
      const theta = vFrac * thetaMax
      const sinT = Math.sin(theta)
      const cosT = Math.cos(theta)
      const ux = Math.sin(az) * sinT
      const uy = cosT
      const uz = Math.cos(az) * sinT

      const [hx, hy, hz] = sculptHeadPoint(ux, uy, uz, isFemale, false)
      const crownLoft = Math.max(0, cosT) * 0.018
      const baseThickness = isInnerEdge ? 0.004 : isRimTurn ? 0.016 : 0.029
      const radialScale = 1 + (baseThickness + crownLoft) / 0.36
      const rimPull = isRimTurn ? 0.008 : 0

      positions.push(
        hx * radialScale,
        hy * radialScale - rimPull,
        hz * radialScale
      )
      uvs.push(u / segU, v / ringCount)
    }
  }

  for (let v = 0; v < ringCount; v += 1) {
    const row0 = v * segU
    const row1 = (v + 1) * segU
    for (let u = 0; u < segU; u += 1) {
      const next = (u + 1) % segU
      indices.push(row0 + u, row1 + u, row1 + next)
      indices.push(row0 + u, row1 + next, row0 + next)
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

// ---------- Sculpted Torso, Skirt & Shoe Primitives ----------

function createSculptedLathe(
  profile: [number, number][],
  radialSegs: number,
  scaleX = 1,
  scaleZ = 1,
  pleats?: { amp: number; count: number; minY: number; maxY: number }
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y))
  const geom = new THREE.LatheGeometry(pts, radialSegs)
  const pos = geom.getAttribute("position")
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i)
    const y = pos.getY(i)
    let z = pos.getZ(i)
    if (pleats && y >= pleats.minY && y <= pleats.maxY) {
      const a = Math.atan2(z, x)
      const weight = 1 - (y - pleats.minY) / Math.max(0.001, pleats.maxY - pleats.minY)
      const pMul = 1 + Math.sin(a * pleats.count) * pleats.amp * weight
      x *= pMul
      z *= pMul
    }
    pos.setXYZ(i, x * scaleX, y, z * scaleZ)
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()
  return geom
}

function createExtrudedBevelPlate(
  shapePts: [number, number][],
  depth: number,
  bevelSize = 0.008,
  bevelSegs = 2
): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(shapePts[0][0], shapePts[0][1])
  for (let i = 1; i < shapePts.length; i += 1) {
    shape.lineTo(shapePts[i][0], shapePts[i][1])
  }
  shape.closePath()
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 4,
    bevelEnabled: bevelSize > 0,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: Math.min(1, bevelSegs),
  })
}

// ---------- Hairstyles Builder (All 11 Distinct Chibi Hairstyles) ----------

function buildHairGeometry(
  hairCol: PivotGeometryCollector,
  ponytailCol: PivotGeometryCollector,
  style: ChibiHairStyle,
  isFemale: boolean,
  hasHighlight: boolean,
  detail: DetailLevel
): boolean {
  const capU = detail.lite ? 14 : 20
  const capV = detail.lite ? 7 : 10
  const backDrop =
    style === "long_wavy" || style === "layered_clips"
      ? 2.42
      : style === "bob"
        ? 2.38
        : isFemale
          ? 2.26
          : 2.18

  hairCol.add(
    "hair",
    createSculptedHairCapGeometry(isFemale, backDrop, capU, capV)
  )

  if (style === "side_part" || style === "neat_part") {
    const isNeat = style === "neat_part"
    // Layered sweeping front fringe strictly above y >= 0.145 across front face
    const bangs: [number, number, number][][] = isNeat
      ? [
          [
            [-0.04, 0.35, 0.14],
            [-0.14, 0.29, 0.27],
            [-0.22, 0.21, 0.275],
            [-0.28, 0.14, 0.22],
          ],
          [
            [0.03, 0.35, 0.15],
            [0.14, 0.295, 0.27],
            [0.23, 0.21, 0.27],
            [0.29, 0.135, 0.215],
          ],
          [
            [-0.06, 0.355, 0.16],
            [-0.07, 0.28, 0.295],
            [-0.05, 0.205, 0.31],
          ],
          [
            [0.04, 0.355, 0.16],
            [0.07, 0.275, 0.295],
            [0.08, 0.205, 0.305],
          ],
        ]
      : [
          [
            [-0.14, 0.34, 0.15],
            [-0.02, 0.31, 0.285],
            [0.12, 0.255, 0.295],
            [0.24, 0.185, 0.245],
          ],
          [
            [-0.15, 0.335, 0.16],
            [-0.07, 0.275, 0.3],
            [0.02, 0.215, 0.31],
          ],
          [
            [-0.16, 0.32, 0.17],
            [-0.22, 0.25, 0.265],
            [-0.29, 0.16, 0.21],
          ],
        ]
    for (const pts of bangs) {
      hairCol.add(
        "hair",
        strandFromTuples(pts, [0.056, 0.064, 0.046, 0.016], detail, 0.56)
      )
    }
    // Crisp tapered sideburns framing temples behind the face window
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.33, 0.18, 0.07],
            [side * 0.365, 0.06, 0.09],
            [side * 0.355, -0.05, 0.07],
          ],
          [0.052, 0.048, 0.018],
          detail,
          0.62
        )
      )
    }
  } else if (style === "swept_back") {
    // Voluminous swept-back executive quiff ribbons
    const quiffOffsets = detail.lite ? [-0.12, 0, 0.12] : [-0.16, -0.06, 0.04, 0.14]
    for (const ox of quiffOffsets) {
      const lift = 0.05 - Math.abs(ox) * 0.12
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [ox * 0.9, 0.24, 0.275],
            [ox, 0.375 + lift, 0.2],
            [ox * 1.05, 0.405 + lift * 0.7, 0.01],
            [ox * 0.95, 0.33, -0.22],
          ],
          [0.05, 0.078, 0.072, 0.036],
          detail,
          0.62
        )
      )
    }
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.29, 0.21, 0.16],
            [side * 0.365, 0.11, 0.07],
            [side * 0.355, -0.02, 0.03],
          ],
          [0.048, 0.046, 0.02],
          detail,
          0.6
        )
      )
    }
  } else if (style === "spiky") {
    // Dynamic curved anime spikes radiating from crown and forehead
    const spikes: { pts: [number, number, number][]; r: number[] }[] = [
      {
        pts: [
          [0, 0.32, 0.18],
          [0.02, 0.37, 0.27],
          [0.03, 0.28, 0.355],
        ],
        r: [0.064, 0.056, 0.012],
      },
      {
        pts: [
          [-0.12, 0.31, 0.16],
          [-0.17, 0.34, 0.26],
          [-0.21, 0.24, 0.315],
        ],
        r: [0.06, 0.05, 0.012],
      },
      {
        pts: [
          [0.12, 0.31, 0.16],
          [0.18, 0.34, 0.255],
          [0.22, 0.24, 0.31],
        ],
        r: [0.06, 0.05, 0.012],
      },
      {
        pts: [
          [0, 0.36, 0.06],
          [-0.02, 0.47, 0.12],
          [-0.04, 0.52, 0.18],
        ],
        r: [0.07, 0.052, 0.012],
      },
      {
        pts: [
          [-0.16, 0.33, 0.03],
          [-0.27, 0.43, 0.08],
          [-0.35, 0.46, 0.12],
        ],
        r: [0.064, 0.048, 0.012],
      },
      {
        pts: [
          [0.16, 0.33, 0.03],
          [0.27, 0.43, 0.08],
          [0.35, 0.46, 0.12],
        ],
        r: [0.064, 0.048, 0.012],
      },
      {
        pts: [
          [0, 0.36, -0.1],
          [0, 0.46, -0.18],
          [0, 0.49, -0.27],
        ],
        r: [0.066, 0.048, 0.012],
      },
    ]
    if (!detail.lite) {
      spikes.push(
        {
          pts: [
            [-0.26, 0.23, 0.08],
            [-0.37, 0.25, 0.12],
            [-0.43, 0.2, 0.13],
          ],
          r: [0.052, 0.038, 0.01],
        },
        {
          pts: [
            [0.26, 0.23, 0.08],
            [0.37, 0.25, 0.12],
            [0.43, 0.2, 0.13],
          ],
          r: [0.052, 0.038, 0.01],
        }
      )
    }
    for (const sp of spikes) {
      hairCol.add("hair", strandFromTuples(sp.pts, sp.r, detail, 0.72))
    }
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.33, 0.16, 0.06],
            [side * 0.365, 0.04, 0.08],
            [side * 0.35, -0.06, 0.05],
          ],
          [0.048, 0.042, 0.016],
          detail,
          0.62
        )
      )
    }
  } else if (style === "slicked") {
    // Sculpted executive pompadour wave + neat tapered sides
    hairCol.add(
      "hair",
      strandFromTuples(
        [
          [-0.14, 0.27, 0.255],
          [-0.02, 0.395, 0.22],
          [0.12, 0.415, 0.06],
          [0.14, 0.34, -0.18],
        ],
        [0.072, 0.098, 0.09, 0.05],
        detail,
        0.74
      )
    )
    hairCol.add(
      "hair",
      strandFromTuples(
        [
          [0.04, 0.285, 0.26],
          [0.16, 0.355, 0.21],
          [0.24, 0.33, 0.04],
          [0.22, 0.24, -0.18],
        ],
        [0.058, 0.072, 0.064, 0.038],
        detail,
        0.68
      )
    )
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.32, 0.18, 0.08],
            [side * 0.36, 0.06, 0.07],
            [side * 0.34, -0.04, 0.03],
          ],
          [0.048, 0.042, 0.018],
          detail,
          0.56
        )
      )
    }
  } else if (style === "bob") {
    // Plush chin-length inward-curling bob + soft wispy forehead bangs
    const bangXs = detail.lite ? [-0.14, 0, 0.14] : [-0.17, -0.06, 0.06, 0.17]
    for (const bx of bangXs) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [bx * 0.75, 0.35, 0.15],
            [bx * 0.96, 0.285, 0.285],
            [bx * 1.04, 0.19, 0.305 - Math.abs(bx) * 0.16],
          ],
          [0.056, 0.062, 0.022],
          detail,
          0.52
        )
      )
    }
    // Cheek-hugging inward-curling bob side curtains (|x| >= 0.26 so never blocks face)
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.29, 0.24, 0.15],
            [side * 0.375, 0.06, 0.11],
            [side * 0.38, -0.14, 0.08],
            [side * 0.305, -0.27, 0.09],
          ],
          [0.068, 0.082, 0.082, 0.046],
          detail,
          0.66
        )
      )
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.31, 0.18, -0.08],
            [side * 0.375, -0.04, -0.1],
            [side * 0.34, -0.25, -0.09],
          ],
          [0.072, 0.086, 0.058],
          detail,
          0.68
        )
      )
    }
    // Full rounded back bob drape
    const backPts = detail.lite ? [-0.16, 0, 0.16] : [-0.22, -0.08, 0.08, 0.22]
    for (const bx of backPts) {
      const zCurve = -0.34 + Math.abs(bx) * 0.26
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [bx * 0.8, 0.16, zCurve + 0.04],
            [bx, -0.06, zCurve - 0.05],
            [bx * 0.92, -0.26, zCurve + 0.02],
          ],
          [0.085, 0.098, 0.062],
          detail,
          0.64
        )
      )
    }
  } else if (style === "ponytail") {
    // Wispy parted bangs + cute framing cheek tendrils + gold scrunchie + dynamic flowing ponytail
    const bangXs = detail.lite ? [-0.14, 0.02, 0.16] : [-0.17, -0.05, 0.06, 0.17]
    for (const bx of bangXs) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [bx * 0.75, 0.35, 0.15],
            [bx * 0.96, 0.285, 0.285],
            [bx * 1.02, 0.192, 0.3 - Math.abs(bx) * 0.14],
          ],
          [0.052, 0.058, 0.018],
          detail,
          0.5
        )
      )
    }
    // Delicate cheek tendrils outside safe zone (|x| >= 0.27)
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.3, 0.21, 0.16],
            [side * 0.36, 0.04, 0.14],
            [side * 0.325, -0.14, 0.14],
          ],
          [0.048, 0.044, 0.015],
          detail,
          0.6
        )
      )
    }
    // Gold scrunchie band at high back crown
    hairCol.add(
      "gold",
      new THREE.TorusGeometry(
        0.086,
        0.032,
        detail.ringRadial,
        detail.ringTubular
      ),
      [0, 0.16, -0.37],
      [0.48, 0, 0]
    )
    // Multi-strand dynamic ponytail (placed in ponytail pivot centered at [0, 0.16, -0.37])
    ponytailCol.add(
      "hair",
      strandFromTuples(
        [
          [0, 0, 0],
          [0, 0.02, -0.14],
          [0, -0.18, -0.22],
          [0, -0.44, -0.17],
          [0, -0.54, -0.22],
        ],
        [0.072, 0.115, 0.11, 0.068, 0.016],
        detail,
        0.82
      )
    )
    for (const side of [-1, 1] as const) {
      ponytailCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.02, -0.01, -0.02],
            [side * 0.09, -0.06, -0.13],
            [side * 0.11, -0.26, -0.18],
            [side * 0.06, -0.44, -0.15],
          ],
          [0.052, 0.072, 0.062, 0.016],
          detail,
          0.74
        )
      )
    }
    return true
  } else if (style === "long_wavy") {
    // Side-swept bangs + long S-wavy framing locks + cascading wavy back + gold pearl headband
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.06, 0.35, 0.15],
            [side * 0.17, 0.285, 0.275],
            [side * 0.27, 0.19, 0.24],
          ],
          [0.056, 0.064, 0.022],
          detail,
          0.52
        )
      )
      // Long wavy side locks past shoulders
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.31, 0.21, 0.13],
            [side * 0.38, 0.02, 0.11],
            [side * 0.355, -0.2, 0.13],
            [side * 0.39, -0.38, 0.08],
            [side * 0.34, -0.52, 0.11],
          ],
          [0.064, 0.076, 0.074, 0.064, 0.02],
          detail,
          0.66
        )
      )
    }
    // Cascading wavy back curtain
    const waveXs = detail.lite ? [-0.2, 0, 0.2] : [-0.24, -0.1, 0.1, 0.24]
    for (const wx of waveXs) {
      const z0 = -0.32 + Math.abs(wx) * 0.22
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [wx * 0.85, 0.12, z0 + 0.04],
            [wx, -0.1, z0 - 0.05],
            [wx * 1.06, -0.32, z0 + 0.02],
            [wx * 1.02, -0.52, z0 - 0.04],
          ],
          [0.082, 0.098, 0.095, 0.036],
          detail,
          0.64
        )
      )
    }
    // Gold arched headband + pearl centerpiece + tiny side pearls
    hairCol.add(
      "gold",
      new THREE.TorusGeometry(
        0.388,
        0.021,
        detail.ringRadial,
        detail.ringTubular,
        Math.PI * 1.04
      ),
      [0, 0.055, 0.045],
      [0.14, 0, -0.02]
    )
    hairCol.add(
      "pearl",
      new THREE.SphereGeometry(0.042, detail.smallSphereW, detail.smallSphereH),
      [0.14, 0.4, 0.095]
    )
    if (!detail.lite) {
      hairCol.add(
        "pearl",
        new THREE.SphereGeometry(0.024, 8, 6),
        [0.195, 0.375, 0.095]
      )
      hairCol.add(
        "pearl",
        new THREE.SphereGeometry(0.024, 8, 6),
        [0.085, 0.415, 0.095]
      )
    }
  } else if (style === "layered_clips") {
    // Shoulder-length layered cut with outward flicked tips + twin beveled gold hairclips
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.05, 0.35, 0.15],
            [side * 0.16, 0.285, 0.275],
            [side * 0.26, 0.19, 0.24],
          ],
          [0.056, 0.062, 0.02],
          detail,
          0.52
        )
      )
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.31, 0.21, 0.12],
            [side * 0.375, 0.02, 0.1],
            [side * 0.36, -0.18, 0.09],
            [side * 0.41, -0.35, 0.07],
          ],
          [0.064, 0.076, 0.07, 0.024],
          detail,
          0.66
        )
      )
    }
    const backXs = detail.lite ? [-0.18, 0, 0.18] : [-0.22, -0.08, 0.08, 0.22]
    for (const bx of backXs) {
      const z0 = -0.32 + Math.abs(bx) * 0.24
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [bx * 0.85, 0.14, z0 + 0.04],
            [bx, -0.08, z0 - 0.04],
            [bx * 1.05, -0.33, z0 - 0.02],
          ],
          [0.082, 0.092, 0.038],
          detail,
          0.64
        )
      )
    }
    // Twin sleek rounded gold hairclips on right temple
    hairCol.add(
      "gold",
      new THREE.CapsuleGeometry(0.013, 0.095, 4, 8),
      [0.245, 0.218, 0.265],
      [0, 0.56, Math.PI / 2 - 0.22]
    )
    hairCol.add(
      "gold",
      new THREE.CapsuleGeometry(0.012, 0.086, 4, 8),
      [0.27, 0.178, 0.245],
      [0, 0.58, Math.PI / 2 - 0.18]
    )
  } else if (style === "chignon") {
    // Sleek advisor low twisted chignon bun + curved side bangs above glasses + gold hair cuff & pin
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.04, 0.35, 0.15],
            [side * 0.16, 0.285, 0.275],
            [side * 0.27, 0.19, 0.235],
          ],
          [0.056, 0.062, 0.02],
          detail,
          0.52
        )
      )
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.31, 0.18, 0.1],
            [side * 0.355, 0.02, 0.06],
            [side * 0.29, -0.1, -0.14],
          ],
          [0.048, 0.046, 0.03],
          detail,
          0.58
        )
      )
    }
    // Sculpted layered chignon bun at nape
    hairCol.add(
      "hair",
      new THREE.SphereGeometry(0.15, detail.smallSphereW, detail.smallSphereH),
      [0, -0.055, -0.4],
      undefined,
      [1.15, 0.92, 0.85]
    )
    hairCol.add(
      "hair",
      new THREE.TorusGeometry(0.092, 0.042, detail.ringRadial, detail.ringTubular),
      [0, -0.055, -0.44]
    )
    // Gold hair cuff ring + ornamental diagonal hairpin
    hairCol.add(
      "gold",
      new THREE.TorusGeometry(0.112, 0.02, detail.ringRadial, detail.ringTubular),
      [0, -0.055, -0.34]
    )
    hairCol.add(
      "gold",
      new THREE.CylinderGeometry(0.01, 0.008, 0.36, 8),
      [0, -0.04, -0.42],
      [0, 0, -0.82]
    )
    hairCol.add(
      "pearl",
      new THREE.SphereGeometry(0.028, 8, 8),
      [0.135, 0.085, -0.42]
    )
  } else {
    // "tousled_cool" (danhtrongit): layered stylish cool locks + signature electric-blue highlight lock
    const coolLocks: {
      pts: [number, number, number][]
      r: number[]
      hi?: boolean
    }[] = [
      {
        pts: [
          [-0.08, 0.36, 0.14],
          [-0.17, 0.31, 0.265],
          [-0.24, 0.21, 0.27],
        ],
        r: [0.06, 0.056, 0.014],
      },
      {
        pts: [
          [0.01, 0.365, 0.14],
          [-0.01, 0.305, 0.295],
          [-0.04, 0.205, 0.32],
        ],
        r: [0.062, 0.056, 0.014],
      },
      {
        // Signature cyan highlight lock sweeping dynamically across front-right fringe!
        pts: [
          [0.06, 0.37, 0.14],
          [0.15, 0.31, 0.27],
          [0.23, 0.205, 0.275],
        ],
        r: [0.06, 0.056, 0.014],
        hi: true,
      },
      {
        pts: [
          [-0.14, 0.35, 0.04],
          [-0.25, 0.43, 0.1],
          [-0.31, 0.43, 0.16],
        ],
        r: [0.06, 0.046, 0.012],
      },
      {
        pts: [
          [0.14, 0.35, 0.04],
          [0.24, 0.43, 0.1],
          [0.3, 0.43, 0.16],
        ],
        r: [0.06, 0.046, 0.012],
      },
      {
        pts: [
          [0, 0.37, -0.02],
          [0.04, 0.46, 0.06],
          [0.08, 0.48, 0.14],
        ],
        r: [0.064, 0.048, 0.012],
      },
    ]
    for (const lock of coolLocks) {
      const slot: MaterialSlot = lock.hi && hasHighlight ? "hairHighlight" : "hair"
      hairCol.add(slot, strandFromTuples(lock.pts, lock.r, detail, 0.62))
    }
    for (const side of [-1, 1] as const) {
      hairCol.add(
        "hair",
        strandFromTuples(
          [
            [side * 0.33, 0.18, 0.07],
            [side * 0.368, 0.04, 0.095],
            [side * 0.35, -0.07, 0.07],
          ],
          [0.052, 0.046, 0.016],
          detail,
          0.62
        )
      )
    }
  }

  return false
}

// ---------- 3D Expressive Face Builder (Eyes, Lashes, Brows, Nose, Mouth, Blush) ----------

function buildStandardFaceGeometry(
  headCol: PivotGeometryCollector,
  eyesCol: PivotGeometryCollector,
  preset: AvatarStylePreset,
  isStatue: boolean,
  detail: DetailLevel
): { eyeCenterY: number } {
  const isFemale = preset.gender === "female"
  const isCool = preset.id === "danhtrongit"
  const isCheerful =
    preset.faceVariant === "male_energetic" ||
    preset.faceVariant === "female_cheerful"
  const isElegant = preset.faceVariant === "female_elegant"

  const eyeDirX = 0.305
  const eyeDirY = 0.045
  const eyeDirZ = Math.sqrt(1 - eyeDirX * eyeDirX - eyeDirY * eyeDirY)
  const sampleEyePos = sculptHeadPoint(eyeDirX, eyeDirY, eyeDirZ, isFemale, false)
  const eyeCenterY = sampleEyePos[1]

  const eyeRx = isFemale ? 0.064 : 0.058
  const eyeRy = isCool ? 0.054 : isFemale ? 0.074 : 0.064
  const ovalSegs = detail.lite ? 12 : 18
  const tubeTubular = detail.lite ? 6 : 10
  const tubeRadial = detail.lite ? 4 : 6

  const irisTop = isCool
    ? "#0e223d"
    : isFemale
      ? preset.eyeColor
      : preset.eyeColor
  const irisMid = isCool
    ? "#1e4b7a"
    : isFemale
      ? shadeHex(preset.eyeColor, 1.35, 0.12)
      : shadeHex(preset.eyeColor, 1.25, 0.06)
  const irisBottom = isCool
    ? "#38bdf8"
    : preset.faceVariant === "female_cheerful"
      ? "#60a5fa"
      : isFemale
        ? "#a86ea8"
        : "#8b6347"

  for (const side of [-1, 1] as const) {
    const cx = side * eyeDirX
    if (isStatue) {
      // Sculpted metallic relief eyes for Hall of Fame statues
      eyesCol.add(
        "pupilLash",
        createConformalFaceOval({
          dirX: cx,
          dirY: eyeDirY,
          rx: eyeRx * 0.85,
          ry: eyeRy * 0.85,
          surfaceOffset: 0.008,
          yPivotOffset: eyeCenterY,
          segs: ovalSegs,
          isFemale,
          isThanTai: false,
          domeBulge: 0.006,
        }),
        undefined,
        undefined,
        undefined,
        { noShadow: true }
      )
    } else {
      // 1. Soft white sclera
      eyesCol.add(
        "sclera",
        createConformalFaceOval({
          dirX: cx,
          dirY: eyeDirY,
          rx: eyeRx * 1.12,
          ry: eyeRy * 1.05,
          surfaceOffset: 0.004,
          yPivotOffset: eyeCenterY,
          segs: ovalSegs,
          isFemale,
          isThanTai: false,
          domeBulge: 0.004,
        }),
        undefined,
        undefined,
        undefined,
        { noShadow: true }
      )
      // 2. Glossy vertex-colored jewel iris
      eyesCol.add(
        "iris",
        createConformalFaceOval({
          dirX: cx,
          dirY: eyeDirY - 0.005,
          rx: eyeRx * 0.9,
          ry: eyeRy * 0.88,
          surfaceOffset: 0.0085,
          yPivotOffset: eyeCenterY,
          segs: ovalSegs,
          isFemale,
          isThanTai: false,
          domeBulge: 0.004,
          gradientColors: {
            top: irisTop,
            mid: irisMid,
            bottom: irisBottom,
          },
        }),
        undefined,
        undefined,
        undefined,
        { noShadow: true }
      )
      // 3. Glossy dark pupil
      eyesCol.add(
        "pupilLash",
        createConformalFaceOval({
          dirX: cx,
          dirY: eyeDirY,
          rx: eyeRx * 0.46,
          ry: eyeRy * 0.46,
          surfaceOffset: 0.0125,
          yPivotOffset: eyeCenterY,
          segs: detail.lite ? 8 : 12,
          isFemale,
          isThanTai: false,
          domeBulge: 0.003,
        }),
        undefined,
        undefined,
        undefined,
        { noShadow: true }
      )
      // 4. Dual crisp catchlight sparkles
      eyesCol.add(
        "eyeHighlight",
        createConformalFaceOval({
          dirX: cx - 0.055,
          dirY: eyeDirY + 0.068,
          rx: eyeRx * 0.28,
          ry: eyeRy * 0.25,
          surfaceOffset: 0.0155,
          yPivotOffset: eyeCenterY,
          segs: 8,
          isFemale,
          isThanTai: false,
          domeBulge: 0.002,
        }),
        undefined,
        undefined,
        undefined,
        { noShadow: true }
      )
      if (!detail.lite) {
        eyesCol.add(
          "eyeHighlight",
          createConformalFaceOval({
            dirX: cx + 0.05,
            dirY: eyeDirY - 0.058,
            rx: eyeRx * 0.14,
            ry: eyeRy * 0.13,
            surfaceOffset: 0.0155,
            yPivotOffset: eyeCenterY,
            segs: 6,
            isFemale,
            isThanTai: false,
            domeBulge: 0.001,
          }),
          undefined,
          undefined,
          undefined,
          { noShadow: true }
        )
      }
      // 5. Curved upper eyelid / lash rim (+ winged outer lashes for female!)
      const lidPts: [number, number][] = isCool
        ? [
            [cx - side * 0.175, eyeDirY + 0.115],
            [cx, eyeDirY + 0.155],
            [cx + side * 0.185, eyeDirY + 0.11],
          ]
        : [
            [cx - side * 0.175, eyeDirY + 0.08],
            [cx - side * 0.07, eyeDirY + 0.19],
            [cx + side * 0.08, eyeDirY + 0.195],
            [cx + side * 0.185, eyeDirY + 0.085],
          ]
      eyesCol.add(
        "pupilLash",
        createConformalFaceTube({
          points2D: lidPts,
          radii: isCool ? [0.007, 0.013, 0.008] : [0.006, 0.012, 0.012, 0.007],
          surfaceOffset: 0.014,
          yPivotOffset: eyeCenterY,
          isFemale,
          isThanTai: false,
          tubularSegs: tubeTubular,
          radialSegs: tubeRadial,
        }),
        undefined,
        undefined,
        undefined,
        { noShadow: true }
      )

      if (isFemale) {
        // Winged outer eyelash flick
        const ox = cx + side * 0.175
        const oy = eyeDirY + 0.105
        eyesCol.add(
          "pupilLash",
          createConformalFaceTube({
            points2D: [
              [ox - side * 0.02, oy],
              [ox + side * 0.055, oy + 0.032],
              [ox + side * 0.105, oy + 0.068],
            ],
            radii: [0.009, 0.007, 0.0025],
            surfaceOffset: 0.015,
            yPivotOffset: eyeCenterY,
            isFemale,
            isThanTai: false,
            tubularSegs: 4,
            radialSegs: 4,
          }),
          undefined,
          undefined,
          undefined,
          { noShadow: true }
        )
        if (isElegant && !detail.lite) {
          eyesCol.add(
            "pupilLash",
            createConformalFaceTube({
              points2D: [
                [ox, oy - 0.04],
                [ox + side * 0.07, oy - 0.01],
              ],
              radii: [0.0065, 0.002],
              surfaceOffset: 0.015,
              yPivotOffset: eyeCenterY,
              isFemale,
              isThanTai: false,
              tubularSegs: 3,
              radialSegs: 4,
            }),
            undefined,
            undefined,
            undefined,
            { noShadow: true }
          )
        }
      }
    }

    // 6. Expressive sculpted eyebrows
    const browPts: [number, number][] = isCool
      ? [
          [cx - side * 0.16, 0.255],
          [cx, 0.285],
          [cx + side * 0.175, 0.305],
        ]
      : [
          [cx - side * 0.155, 0.275],
          [cx, 0.312],
          [cx + side * 0.165, 0.278],
        ]
    headCol.add(
      "browMouth",
      createConformalFaceTube({
        points2D: browPts,
        radii: isFemale ? [0.006, 0.009, 0.005] : [0.008, 0.012, 0.007],
        surfaceOffset: 0.011,
        isFemale,
        isThanTai: false,
        tubularSegs: detail.lite ? 4 : 7,
        radialSegs: tubeRadial,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true }
    )

    // 7. Rosy chibi cheek blush (omitted on statues)
    if (!isStatue) {
      headCol.add(
        "blush",
        createConformalFaceOval({
          dirX: side * 0.51,
          dirY: -0.175,
          rx: 0.056,
          ry: 0.032,
          surfaceOffset: 0.0045,
          segs: detail.lite ? 8 : 12,
          isFemale,
          isThanTai: false,
          domeBulge: 0.001,
        }),
        undefined,
        undefined,
        undefined,
        { noShadow: true, renderOrder: 2 }
      )
    }
  }

  // 8. Cute sculpted small chibi nose button
  const noseFrame = evaluateHeadFrame(0, -0.095, 0.995, isFemale, false)
  const nosePos = noseFrame.pos.clone().addScaledVector(noseFrame.normal, 0.011)
  headCol.add(
    isStatue ? "skin" : "skinShade",
    new THREE.SphereGeometry(0.022, detail.smallSphereW, detail.smallSphereH),
    [nosePos.x, nosePos.y, nosePos.z],
    undefined,
    [1.0, 0.78, 0.85],
    { noShadow: true }
  )

  // 9. Sculpted expressive mouth
  if (isCool) {
    // Confident slight asymmetric smirk
    headCol.add(
      "browMouth",
      createConformalFaceTube({
        points2D: [
          [-0.1, -0.325],
          [0.01, -0.335],
          [0.125, -0.285],
        ],
        radii: [0.0055, 0.008, 0.006],
        surfaceOffset: 0.01,
        isFemale,
        isThanTai: false,
        tubularSegs: detail.lite ? 5 : 8,
        radialSegs: tubeRadial,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true }
    )
  } else if (isCheerful && !isStatue) {
    // Joyful open smile
    headCol.add(
      "mouthFill",
      createConformalFaceOval({
        dirX: 0,
        dirY: -0.33,
        rx: 0.044,
        ry: 0.026,
        surfaceOffset: 0.007,
        segs: detail.lite ? 8 : 12,
        isFemale,
        isThanTai: false,
        domeBulge: 0.002,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true }
    )
    headCol.add(
      "browMouth",
      createConformalFaceTube({
        points2D: [
          [-0.125, -0.295],
          [0, -0.32],
          [0.125, -0.295],
        ],
        radii: [0.005, 0.0075, 0.005],
        surfaceOffset: 0.011,
        isFemale,
        isThanTai: false,
        tubularSegs: detail.lite ? 5 : 8,
        radialSegs: tubeRadial,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true }
    )
  } else {
    // Warm gentle smile curve
    headCol.add(
      "browMouth",
      createConformalFaceTube({
        points2D: [
          [-0.115, -0.295],
          [0, -0.345],
          [0.115, -0.295],
        ],
        radii: [0.005, 0.0085, 0.005],
        surfaceOffset: 0.01,
        isFemale,
        isThanTai: false,
        tubularSegs: detail.lite ? 5 : 8,
        radialSegs: tubeRadial,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true }
    )
  }

  return { eyeCenterY }
}

// ---------- Glasses Builder ----------

function buildGlassesGeometry(
  col: PivotGeometryCollector,
  style: "saco" | "female" | "cool",
  detail: DetailLevel
): void {
  const rx = style === "cool" ? 0.084 : 0.078
  const tube = style === "female" ? 0.0095 : 0.012
  const segR = detail.ringRadial
  const segT = detail.ringTubular

  for (const side of [-1, 1] as const) {
    const lx = side * 0.112
    const rimScaleY = style === "cool" ? 0.84 : 0.96
    // Rim
    col.add(
      "glassesFrame",
      new THREE.TorusGeometry(rx, tube, segR, segT),
      [lx, 0.014, 0.366],
      [0, side * 0.24, 0],
      [1.04, rimScaleY, 1]
    )
    // Translucent lens (depthWrite: false, noShadow: true)
    col.add(
      "glassesLens",
      new THREE.CircleGeometry(rx * 0.94, detail.lite ? 12 : 18),
      [lx, 0.014, 0.363],
      [0, side * 0.24, 0],
      [1.04, rimScaleY, 1],
      { noShadow: true, renderOrder: 3 }
    )
    // Sleek curved temple arm reaching over ear
    col.add(
      "glassesFrame",
      strandFromTuples(
        [
          [side * 0.195, 0.018, 0.34],
          [side * 0.335, 0.022, 0.2],
          [side * 0.375, 0.016, 0.02],
          [side * 0.365, -0.025, -0.055],
        ],
        [0.011, 0.01, 0.01, 0.008],
        detail,
        0.7
      )
    )
  }
  // Curved nose bridge
  col.add(
    "glassesFrame",
    strandFromTuples(
      [
        [-0.032, 0.022, 0.382],
        [0, 0.032, 0.39],
        [0.032, 0.022, 0.382],
      ],
      [0.009, 0.01, 0.009],
      detail,
      0.85
    )
  )
}

// ---------- Shoes & Mitten Hands Builders ----------

function buildChibiLegAndShoe(
  legCol: PivotGeometryCollector,
  isSkirtOrDress: boolean,
  isSneaker: boolean,
  detail: DetailLevel
): void {
  const seg = detail.limbSeg
  const legSlot: MaterialSlot = isSkirtOrDress ? "skin" : "bottom"

  // Tapered sculpted leg (wider at hip, trim near ankle)
  legCol.add(
    legSlot,
    createSculptedLathe(
      [
        [0.052, -0.255],
        [0.058, -0.2],
        [0.068, -0.11],
        [0.075, -0.03],
        [0.066, 0.01],
      ],
      seg,
      1.02,
      0.98
    )
  )

  if (isSkirtOrDress) {
    // Cute ankle sock cuff
    legCol.add(
      "shirt",
      new THREE.CylinderGeometry(0.058, 0.056, 0.052, seg),
      [0, -0.245, 0]
    )
  } else if (!detail.lite) {
    // Crisp trouser hem cuff
    legCol.add(
      "bottom",
      new THREE.TorusGeometry(0.058, 0.011, 6, seg),
      [0, -0.242, 0],
      [Math.PI / 2, 0, 0]
    )
  }

  // Sculpted shoe upper (rounded vamp + raised heel collar + cute toe-box)
  legCol.add(
    "shoe",
    new THREE.SphereGeometry(0.082, detail.smallSphereW, detail.smallSphereH),
    [0, -0.278, 0.038],
    undefined,
    [0.98, 0.62, 1.38]
  )
  legCol.add(
    "shoe",
    new THREE.CylinderGeometry(0.062, 0.072, 0.055, seg),
    [0, -0.264, -0.012]
  )

  // Distinct outsole + subtle heel ledge
  legCol.add(
    "sole",
    new THREE.CylinderGeometry(0.084, 0.087, 0.024, seg),
    [0, -0.312, 0.036],
    undefined,
    [1.0, 1.0, 1.38]
  )

  if (!detail.lite) {
    // Lace / Mary-Jane saddle strap accent
    legCol.add(
      isSneaker ? "sole" : "belt",
      new THREE.TorusGeometry(0.056, 0.0085, 5, 10, Math.PI),
      [0, -0.258, 0.036],
      [0.35, 0, 0]
    )
  }
}

function buildChibiArmAndMitten(
  armCol: PivotGeometryCollector,
  side: -1 | 1,
  outfitStyle: AvatarStylePreset["outfitStyle"],
  detail: DetailLevel
): void {
  const seg = detail.limbSeg
  const isShortSleeve = outfitStyle === "polo"
  const hasShirtCuff =
    outfitStyle === "suit_tie" ||
    outfitStyle === "blazer_pin" ||
    outfitStyle === "dress_shirt" ||
    outfitStyle === "chic_blazer" ||
    outfitStyle === "tech_blazer"

  // Rounded shoulder cap blending seamlessly into sculpted torso shoulder
  armCol.add(
    "outfit",
    new THREE.SphereGeometry(0.074, detail.smallSphereW, detail.smallSphereH),
    [0, -0.01, 0],
    undefined,
    [1.04, 0.96, 0.98]
  )

  if (isShortSleeve) {
    // Short athletic polo sleeve + trim band + bare forearm
    armCol.add(
      "outfit",
      createSculptedLathe(
        [
          [0.068, -0.145],
          [0.07, -0.075],
          [0.072, -0.01],
        ],
        seg
      ),
      [0, 0, 0],
      [0, 0, side * 0.08]
    )
    armCol.add(
      "outfitShade",
      new THREE.TorusGeometry(0.068, 0.01, 6, seg),
      [side * 0.012, -0.145, 0],
      [Math.PI / 2, side * 0.08, 0]
    )
    armCol.add(
      "skin",
      createSculptedLathe(
        [
          [0.048, -0.255],
          [0.056, -0.195],
          [0.06, -0.135],
        ],
        seg
      ),
      [0, 0, 0],
      [0, 0, side * 0.08]
    )
  } else {
    // Tailored tapered sleeve
    armCol.add(
      "outfit",
      createSculptedLathe(
        [
          [0.058, -0.238],
          [0.064, -0.14],
          [0.072, -0.01],
        ],
        seg
      ),
      [0, 0, 0],
      [0, 0, side * 0.08]
    )
    if (hasShirtCuff) {
      // Crisp shirt cuff peeking out at wrist
      armCol.add(
        "shirt",
        new THREE.CylinderGeometry(0.056, 0.054, 0.032, seg),
        [side * 0.019, -0.244, 0],
        [0, 0, side * 0.08]
      )
    } else {
      // Soft blouse cuff band
      armCol.add(
        "outfitShade",
        new THREE.TorusGeometry(0.057, 0.01, 6, seg),
        [side * 0.018, -0.235, 0],
        [Math.PI / 2, side * 0.08, 0]
      )
    }
  }

  // Cute sculpted chibi mitten hand (flattened palm + distinct angled thumb bud)
  const handX = side * 0.022
  const handY = -0.285
  armCol.add(
    "skin",
    new THREE.SphereGeometry(0.062, detail.smallSphereW, detail.smallSphereH),
    [handX, handY, 0.01],
    undefined,
    [0.82, 1.06, 0.94]
  )
  // Distinct thumb bud pointing inward & slightly forward
  armCol.add(
    "skin",
    new THREE.CapsuleGeometry(0.021, 0.024, 4, detail.lite ? 6 : 8),
    [handX - side * 0.038, handY + 0.012, 0.036],
    [0.45, 0, -side * 0.65]
  )
}

// ---------- Layered Outfit & Torso Builder ----------

function buildLayeredTorso(
  torsoCol: PivotGeometryCollector,
  preset: AvatarStylePreset,
  isBoss: boolean,
  detail: DetailLevel
): void {
  const seg = detail.torsoSeg
  const isFemale = preset.gender === "female"
  const style = preset.outfitStyle

  // Sculpted torso silhouette matching outfit category (oval cross-section, sloped shoulders!)
  if (style === "dress_belt") {
    // Elegant fitted bodice -> tapered waist -> fluted A-line financial dress
    torsoCol.add(
      "outfit",
      createSculptedLathe(
        [
          [0.315, -0.04],
          [0.29, 0.05],
          [0.245, 0.14],
          [0.195, 0.24],
          [0.205, 0.36],
          [0.215, 0.46],
          [0.16, 0.51],
          [0.09, 0.525],
        ],
        seg,
        1.12,
        0.88,
        detail.lite ? undefined : { amp: 0.045, count: 12, minY: -0.04, maxY: 0.22 }
      )
    )
    // Curved cream neckline trim
    torsoCol.add(
      "shirt",
      new THREE.TorusGeometry(0.115, 0.018, 6, detail.ringTubular),
      [0, 0.49, 0.02],
      [Math.PI / 2 + 0.22, 0, 0],
      [1.15, 0.9, 1]
    )
    // Gold waist belt + sculpted buckle clasp
    torsoCol.add(
      "gold",
      new THREE.TorusGeometry(0.198, 0.021, detail.ringRadial, detail.ringTubular),
      [0, 0.24, 0],
      [Math.PI / 2, 0, 0],
      [1.12, 0.88, 1]
    )
    torsoCol.add(
      "gold",
      createExtrudedBevelPlate(
        [
          [-0.036, -0.022],
          [0.036, -0.022],
          [0.036, 0.022],
          [-0.036, 0.022],
        ],
        0.018,
        0.005,
        1
      ),
      [0, 0.24, 0.192]
    )
  } else if (style === "skirt_blouse") {
    // Fitted office blouse/vest upper
    torsoCol.add(
      "outfit",
      createSculptedLathe(
        [
          [0.195, 0.19],
          [0.205, 0.31],
          [0.215, 0.45],
          [0.165, 0.505],
          [0.095, 0.52],
        ],
        seg,
        1.12,
        0.86
      )
    )
    // Waist belt seam
    torsoCol.add(
      "belt",
      new THREE.TorusGeometry(0.196, 0.016, 6, detail.ringTubular),
      [0, 0.205, 0],
      [Math.PI / 2, 0, 0],
      [1.12, 0.86, 1]
    )
    // Sculpted pleated A-line skirt
    torsoCol.add(
      "bottom",
      createSculptedLathe(
        [
          [0.305, -0.045],
          [0.275, 0.05],
          [0.23, 0.14],
          [0.198, 0.205],
        ],
        seg,
        1.12,
        0.88,
        detail.lite ? undefined : { amp: 0.055, count: 14, minY: -0.045, maxY: 0.19 }
      )
    )
    // Peter Pan rounded blouse collar flaps
    for (const side of [-1, 1] as const) {
      torsoCol.add(
        "shirt",
        new THREE.SphereGeometry(0.075, detail.smallSphereW, detail.smallSphereH),
        [side * 0.072, 0.485, 0.132],
        [0.32, side * 0.35, -side * 0.28],
        [1.15, 0.32, 0.85]
      )
    }
    // Charming 3D sculpted ribbon bow at collar
    torsoCol.add(
      "accent",
      new THREE.SphereGeometry(0.028, 8, 8),
      [0, 0.445, 0.202]
    )
    for (const side of [-1, 1] as const) {
      torsoCol.add(
        "accent",
        new THREE.SphereGeometry(0.038, 8, 8),
        [side * 0.046, 0.448, 0.196],
        [0, side * 0.15, side * 0.15],
        [1.35, 0.72, 0.55]
      )
      if (!detail.lite) {
        torsoCol.add(
          "accent",
          new THREE.BoxGeometry(0.022, 0.062, 0.012),
          [side * 0.024, 0.4, 0.2],
          [0, 0, -side * 0.22]
        )
      }
    }
  } else {
    // Tailored suit / blazer / dress shirt / polo / tech blazer / chic blazer
    const shoulderW = isFemale ? 1.12 : 1.18
    const chestD = isFemale ? 0.86 : 0.88
    torsoCol.add(
      "outfit",
      createSculptedLathe(
        [
          [0.215, 0.08],
          [0.212, 0.18],
          [0.218, 0.32],
          [0.226, 0.45],
          [0.178, 0.505],
          [0.1, 0.522],
        ],
        seg,
        shoulderW,
        chestD
      )
    )
    // Tailored waist-to-hip trouser block
    torsoCol.add(
      "bottom",
      createSculptedLathe(
        [
          [0.205, -0.02],
          [0.218, 0.04],
          [0.212, 0.115],
        ],
        seg,
        shoulderW,
        chestD
      )
    )
    // Waist belt + metallic buckle
    torsoCol.add(
      "belt",
      new THREE.TorusGeometry(0.214, 0.018, 6, detail.ringTubular),
      [0, 0.115, 0],
      [Math.PI / 2, 0, 0],
      [shoulderW, chestD, 1]
    )
    torsoCol.add(
      "gold",
      new THREE.BoxGeometry(0.052, 0.036, 0.022),
      [0, 0.115, 0.204]
    )

    // Outfit-specific front layers
    if (style === "polo") {
      // Ribbed polo collar + contrasting 2-button placket
      torsoCol.add(
        "outfitShade",
        new THREE.TorusGeometry(0.105, 0.022, 6, detail.ringTubular),
        [0, 0.505, -0.005],
        [Math.PI / 2 + 0.15, 0, 0],
        [1.12, 0.95, 1]
      )
      for (const side of [-1, 1] as const) {
        torsoCol.add(
          "outfitShade",
          createExtrudedBevelPlate(
            [
              [0, 0],
              [side * 0.085, 0.02],
              [side * 0.072, -0.058],
              [side * 0.01, -0.048],
            ],
            0.014,
            0.004,
            1
          ),
          [side * 0.012, 0.492, 0.165],
          [0.22, side * 0.35, 0]
        )
      }
      // Contrasting front placket
      torsoCol.add(
        "accent",
        new THREE.BoxGeometry(0.056, 0.175, 0.024),
        [0, 0.39, 0.198]
      )
      if (!detail.lite) {
        for (const by of [0.43, 0.365]) {
          torsoCol.add(
            "shirt",
            new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8),
            [0, by, 0.213],
            [Math.PI / 2, 0, 0]
          )
        }
      }
    } else if (style === "dress_shirt") {
      // Crisp spread collar + front button placket + chest pocket
      torsoCol.add(
        "outfitShade",
        new THREE.TorusGeometry(0.104, 0.019, 6, detail.ringTubular),
        [0, 0.505, -0.005],
        [Math.PI / 2 + 0.14, 0, 0],
        [1.1, 0.95, 1]
      )
      for (const side of [-1, 1] as const) {
        torsoCol.add(
          "shirt",
          createExtrudedBevelPlate(
            [
              [0, 0],
              [side * 0.09, 0.015],
              [side * 0.072, -0.062],
              [side * 0.01, -0.042],
            ],
            0.012,
            0.004,
            1
          ),
          [side * 0.008, 0.494, 0.168],
          [0.2, side * 0.32, 0]
        )
      }
      // Subtle center placket strip & buttons
      torsoCol.add(
        "outfitShade",
        new THREE.BoxGeometry(0.038, 0.33, 0.016),
        [0, 0.31, 0.201]
      )
      if (!detail.lite) {
        for (const by of [0.41, 0.33, 0.25]) {
          torsoCol.add(
            "shirt",
            new THREE.CylinderGeometry(0.01, 0.01, 0.01, 8),
            [0, by, 0.211],
            [Math.PI / 2, 0, 0]
          )
        }
        // Subtle left chest pocket
        torsoCol.add(
          "outfitShade",
          new THREE.BoxGeometry(0.068, 0.064, 0.012),
          [0.11, 0.37, 0.194],
          [0, 0.34, 0]
        )
      }
    } else {
      // Suit / Blazer / Chic Blazer / Tech Blazer with sculpted notched lapels & inner shirt!
      // Inner shirt front V-panel sitting clearly proud of upper chest slope
      const innerWidth =
        style === "chic_blazer" || style === "tech_blazer" ? 0.12 : 0.105
      torsoCol.add(
        "shirt",
        createExtrudedBevelPlate(
          [
            [-innerWidth, 0.21],
            [innerWidth, 0.21],
            [innerWidth * 0.45, -0.14],
            [-innerWidth * 0.45, -0.14],
          ],
          0.022,
          0.005,
          1
        ),
        [0, 0.295, 0.184],
        [-0.04, 0, 0]
      )

      // Back jacket collar wrap hugging the neck
      torsoCol.add(
        "outfitShade",
        new THREE.TorusGeometry(
          0.118,
          0.022,
          6,
          detail.ringTubular,
          Math.PI * 1.4
        ),
        [0, 0.502, -0.01],
        [Math.PI / 2 + 0.14, 0, Math.PI * 0.8],
        [1.12, 0.96, 1]
      )

      // Sculpted V-notched left & right lapels stepped proud of inner shirt
      for (const side of [-1, 1] as const) {
        torsoCol.add(
          "outfitShade",
          createExtrudedBevelPlate(
            [
              [side * 0.015, -0.17],
              [side * 0.095, 0.075],
              [side * 0.13, 0.055],
              [side * 0.088, -0.04],
              [side * 0.112, -0.06],
              [side * 0.042, -0.185],
            ],
            0.022,
            0.006,
            1
          ),
          [side * 0.018, 0.425, 0.193],
          [0.03, side * 0.2, 0]
        )
      }

      if (style === "suit_tie" || style === "blazer_pin") {
        // Folded white shirt collar wings
        for (const side of [-1, 1] as const) {
          torsoCol.add(
            "shirt",
            createExtrudedBevelPlate(
              [
                [0, 0],
                [side * 0.072, 0.012],
                [side * 0.058, -0.05],
                [side * 0.008, -0.036],
              ],
              0.012,
              0.003,
              1
            ),
            [side * 0.008, 0.495, 0.168],
            [0.2, side * 0.25, 0]
          )
        }
        // Sculpted necktie knot + tapered blade clearly proud of shirt V-panel
        torsoCol.add(
          "accent",
          createExtrudedBevelPlate(
            [
              [-0.026, 0.022],
              [0.026, 0.022],
              [0.018, -0.022],
              [-0.018, -0.022],
            ],
            0.018,
            0.005,
            1
          ),
          [0, 0.455, 0.208]
        )
        torsoCol.add(
          "accent",
          createExtrudedBevelPlate(
            [
              [-0.018, 0.14],
              [0.018, 0.14],
              [0.029, -0.08],
              [0, -0.125],
              [-0.029, -0.08],
            ],
            0.014,
            0.004,
            1
          ),
          [0, 0.295, 0.208]
        )
        // Subtle suit buttons & pocket square
        if (!detail.lite) {
          for (const by of [0.22, 0.165]) {
            torsoCol.add(
              "belt",
              new THREE.CylinderGeometry(0.013, 0.013, 0.012, 8),
              [0, by, 0.214],
              [Math.PI / 2, 0, 0]
            )
          }
          torsoCol.add(
            "shirt",
            new THREE.BoxGeometry(0.056, 0.022, 0.012),
            [0.128, 0.385, 0.196],
            [0, 0.42, 0.12]
          )
        }
      } else if (style === "chic_blazer") {
        // Subtle gold necklace pendant & single chic blazer button
        torsoCol.add(
          "gold",
          new THREE.SphereGeometry(0.02, 8, 8),
          [0, 0.44, 0.212]
        )
        if (!detail.lite) {
          torsoCol.add(
            "gold",
            new THREE.CylinderGeometry(0.014, 0.014, 0.012, 8),
            [0, 0.21, 0.214],
            [Math.PI / 2, 0, 0]
          )
        }
      } else if (style === "tech_blazer" && preset.hasItEmblem) {
        // Vibrant cyan crew collar + beveled gold IT chest emblem badge
        torsoCol.add(
          "shirt",
          new THREE.TorusGeometry(0.098, 0.016, 6, detail.ringTubular),
          [0, 0.492, 0.022],
          [Math.PI / 2 + 0.16, 0, 0]
        )
        torsoCol.add(
          "gold",
          createExtrudedBevelPlate(
            [
              [-0.048, -0.028],
              [0.048, -0.028],
              [0.048, 0.028],
              [-0.048, 0.028],
            ],
            0.018,
            0.005,
            1
          ),
          [0.115, 0.39, 0.204],
          [0, 0.34, 0]
        )
      }
    }
  }

  // Boss or executive gold lapel pin
  if (isBoss || style === "blazer_pin") {
    torsoCol.add(
      "gold",
      new THREE.SphereGeometry(0.024, 8, 8),
      [-0.105, 0.415, 0.222]
    )
  }

  // Smooth tapered chibi neck
  torsoCol.add(
    "skin",
    new THREE.CylinderGeometry(0.082, 0.098, 0.12, detail.limbSeg),
    [0, 0.545, 0]
  )
}

// ---------- Standard Chibi Geometry Bundle Builder ----------

function buildStandardGeometryBundle(
  key: string,
  preset: AvatarStylePreset,
  isBoss: boolean,
  statueRank: ChibiStatueRank | undefined,
  detail: DetailLevel
): VariantGeometryBundle {
  const isStatue = statueRank !== undefined
  const isFemale = preset.gender === "female"
  const isSkirtOrDress =
    preset.outfitStyle === "skirt_blouse" || preset.outfitStyle === "dress_belt"
  const isSneaker = preset.outfitStyle === "polo"

  const legCol = new PivotGeometryCollector()
  const torsoCol = new PivotGeometryCollector()
  const leftArmCol = new PivotGeometryCollector()
  const rightArmCol = new PivotGeometryCollector()
  const headCol = new PivotGeometryCollector()
  const eyesCol = new PivotGeometryCollector()
  const hairCol = new PivotGeometryCollector()
  const ponytailCol = new PivotGeometryCollector()
  const glassesCol = new PivotGeometryCollector()
  const medalCol = new PivotGeometryCollector()

  // Legs & sculpted shoes with soles (symmetric geometry shared by both legs!)
  buildChibiLegAndShoe(legCol, isSkirtOrDress, isSneaker, detail)
  const legEntries = legCol.flush()

  // Sculpted layered torso
  buildLayeredTorso(torsoCol, preset, isBoss, detail)

  // Sculpted arms, cuffs & mitten hands
  buildChibiArmAndMitten(leftArmCol, -1, preset.outfitStyle, detail)
  buildChibiArmAndMitten(rightArmCol, 1, preset.outfitStyle, detail)

  // Sculpted chibi head (cheeks + tapered chin + brow contour)
  headCol.add(
    "skin",
    createSculptedHeadGeometry(isFemale, false, detail.headSegW, detail.headSegH)
  )

  // Sculpted ears with inner conch detail
  for (const side of [-1, 1] as const) {
    headCol.add(
      "skin",
      new THREE.SphereGeometry(0.072, detail.smallSphereW, detail.smallSphereH),
      [side * 0.366, -0.025, -0.018],
      [0, -side * 0.18, 0],
      [0.64, 1.08, 0.88]
    )
    if (!isStatue && !detail.lite) {
      headCol.add(
        "skinShade",
        new THREE.SphereGeometry(0.044, 8, 8),
        [side * 0.378, -0.026, 0.002],
        [0, -side * 0.18, 0],
        [0.45, 0.9, 0.65]
      )
    }
  }

  // 3D expressive face + blinkable eyes
  const { eyeCenterY } = buildStandardFaceGeometry(
    headCol,
    eyesCol,
    preset,
    isStatue,
    detail
  )

  // Sculpted custom hairstyle
  const hasPonytail = buildHairGeometry(
    hairCol,
    ponytailCol,
    preset.hairStyle,
    isFemale,
    Boolean(preset.hairHighlight) && !isStatue,
    detail
  )

  // 3D glasses for specialist & owner avatars
  if (preset.hasGlasses && !isStatue) {
    const gStyle =
      preset.id === "danhtrongit"
        ? "cool"
        : preset.gender === "female"
          ? "female"
          : "saco"
    buildGlassesGeometry(glassesCol, gStyle, detail)
  }

  // Hall of Fame floating rank medal
  if (isStatue) {
    medalCol.add(
      "medalRim",
      new THREE.CylinderGeometry(0.16, 0.16, 0.036, detail.ringTubular),
      [0, 0, 0],
      [Math.PI / 2, 0, 0]
    )
    for (const side of [-1, 1] as const) {
      medalCol.add(
        "medalFace",
        new THREE.CircleGeometry(0.145, detail.ringTubular),
        [0, 0, side * 0.02],
        side < 0 ? [0, Math.PI, 0] : undefined,
        undefined,
        { noShadow: true }
      )
    }
  }

  return {
    key,
    refCount: 0,
    shadowGeo: new THREE.CircleGeometry(0.34, detail.lite ? 14 : 20),
    leftLeg: legEntries,
    rightLeg: legEntries,
    torso: torsoCol.flush(),
    leftArm: leftArmCol.flush(),
    rightArm: rightArmCol.flush(),
    head: headCol.flush(),
    eyes: eyesCol.flush(),
    hair: hairCol.flush(),
    ponytail: ponytailCol.flush(),
    glasses: glassesCol.flush(),
    medal: medalCol.flush(),
    halo: [],
    ingot: [],
    eyeCenterY,
    hasDynamicEyes: !isStatue,
    hasPonytail,
  }
}

// ---------- Thần Tài NPC Upgraded Geometry Bundle Builder ----------

function buildThanTaiGeometryBundle(
  key: string,
  detail: DetailLevel
): VariantGeometryBundle {
  const leftLegCol = new PivotGeometryCollector()
  const rightLegCol = new PivotGeometryCollector()
  const torsoCol = new PivotGeometryCollector()
  const leftArmCol = new PivotGeometryCollector()
  const rightArmCol = new PivotGeometryCollector()
  const headCol = new PivotGeometryCollector()
  const eyesCol = new PivotGeometryCollector()
  const haloCol = new PivotGeometryCollector()
  const ingotCol = new PivotGeometryCollector()

  const seg = detail.torsoSeg

  // Imperial boots with upturned toes & gold trim
  for (const legCol of [leftLegCol, rightLegCol]) {
    legCol.add(
      "deepRed",
      new THREE.CapsuleGeometry(0.085, 0.12, detail.capSeg, detail.limbSeg),
      [0, -0.145, 0]
    )
    legCol.add(
      "shoe",
      new THREE.SphereGeometry(0.1, detail.smallSphereW, detail.smallSphereH),
      [0, -0.272, 0.042],
      undefined,
      [0.98, 0.66, 1.38]
    )
    legCol.add(
      "sole",
      new THREE.CylinderGeometry(0.098, 0.102, 0.028, detail.limbSeg),
      [0, -0.312, 0.04],
      undefined,
      [1.0, 1.0, 1.38]
    )
    if (!detail.lite) {
      legCol.add(
        "gold",
        new THREE.TorusGeometry(0.072, 0.012, 5, 12),
        [0, -0.23, 0.008],
        [Math.PI / 2, 0, 0]
      )
    }
  }

  // Sculpted flared imperial crimson robe (Lathe silhouette!)
  torsoCol.add(
    "crimson",
    createSculptedLathe(
      [
        [0.355, -0.04],
        [0.33, 0.08],
        [0.295, 0.22],
        [0.268, 0.36],
        [0.258, 0.49],
        [0.2, 0.545],
        [0.115, 0.56],
      ],
      seg,
      1.1,
      0.94
    )
  )
  // Golden robe bottom hem trim + deep red under-hem
  torsoCol.add(
    "gold",
    new THREE.TorusGeometry(0.355, 0.026, detail.ringRadial, detail.ringTubular),
    [0, -0.028, 0],
    [Math.PI / 2, 0, 0],
    [1.1, 0.94, 1]
  )
  // Ornate mandarin V-collar gold & deep-red lapel trim
  for (const side of [-1, 1] as const) {
    torsoCol.add(
      "gold",
      createExtrudedBevelPlate(
        [
          [0, -0.14],
          [side * 0.125, 0.06],
          [side * 0.158, 0.04],
          [side * 0.032, -0.16],
        ],
        0.024,
        0.006,
        1
      ),
      [side * 0.008, 0.47, 0.236],
      [0.14, side * 0.2, 0]
    )
  }
  // Golden front brocade tabard panel angled along flared robe slope
  torsoCol.add(
    "gold",
    createExtrudedBevelPlate(
      [
        [-0.076, -0.25],
        [0.076, -0.25],
        [0.064, 0.22],
        [-0.064, 0.22],
      ],
      0.024,
      0.006,
      1
    ),
    [0, 0.23, 0.272],
    [-0.14, 0, 0]
  )
  if (!detail.lite) {
    for (const [ry, rz] of [
      [0.06, 0.325],
      [0.14, 0.312],
      [0.36, 0.28],
    ] as const) {
      torsoCol.add(
        "deepRed",
        new THREE.BoxGeometry(0.115, 0.018, 0.014),
        [0, ry, rz]
      )
    }
  }
  // Imperial gold waist girdle + beveled emerald jade medallion + tassel
  torsoCol.add(
    "gold",
    new THREE.TorusGeometry(0.286, 0.034, detail.ringRadial, detail.ringTubular),
    [0, 0.245, 0],
    [Math.PI / 2, 0, 0],
    [1.1, 0.94, 1]
  )
  torsoCol.add(
    "brightGold",
    new THREE.CylinderGeometry(0.082, 0.082, 0.032, detail.limbSeg),
    [0, 0.245, 0.298],
    [Math.PI / 2, 0, 0]
  )
  torsoCol.add(
    "jade",
    new THREE.CylinderGeometry(0.062, 0.062, 0.04, detail.limbSeg),
    [0, 0.245, 0.31],
    [Math.PI / 2, 0, 0]
  )

  // Wide flared imperial sleeves + layered gold cuffs + plump mitten hands
  for (const [armCol, side] of [
    [leftArmCol, -1],
    [rightArmCol, 1],
  ] as const) {
    armCol.add(
      "crimson",
      createSculptedLathe(
        [
          [0.135, -0.26],
          [0.11, -0.14],
          [0.088, -0.02],
          [0.072, 0.02],
        ],
        detail.limbSeg
      ),
      [0, -0.01, 0.04],
      [-0.35, 0, side * 0.16]
    )
    armCol.add(
      "gold",
      new THREE.TorusGeometry(0.13, 0.02, detail.ringRadial, detail.ringTubular),
      [side * 0.022, -0.25, 0.115],
      [Math.PI / 2 - 0.35, 0, 0]
    )
    armCol.add(
      "skin",
      new THREE.SphereGeometry(0.072, detail.smallSphereW, detail.smallSphereH),
      [side * 0.022, -0.295, 0.14],
      undefined,
      [0.92, 0.96, 1.02]
    )
    armCol.add(
      "skin",
      new THREE.CapsuleGeometry(0.024, 0.024, 4, 6),
      [side * 0.022 - side * 0.042, -0.285, 0.172],
      [0.45, 0, -side * 0.65]
    )
  }

  // Gleaming upgraded 3D Kim Nguyên Bảo (Gold Sycee Ingot)
  ingotCol.add(
    "brightGold",
    createSculptedLathe(
      [
        [0.085, -0.065],
        [0.125, -0.025],
        [0.175, 0.048],
        [0.152, 0.056],
        [0.115, 0.015],
      ],
      detail.torsoSeg,
      1.38,
      0.78
    )
  )
  for (const side of [-1, 1] as const) {
    ingotCol.add(
      "brightGold",
      new THREE.SphereGeometry(0.074, detail.smallSphereW, detail.smallSphereH),
      [side * 0.195, 0.064, 0],
      [0, 0, side * 0.25],
      [1.12, 0.72, 0.8]
    )
  }
  // Central gleaming gold mound + rim ridge
  ingotCol.add(
    "brightGold",
    new THREE.SphereGeometry(0.102, detail.smallSphereW, detail.smallSphereH),
    [0, 0.068, 0],
    undefined,
    [1.15, 0.85, 0.92]
  )
  ingotCol.add(
    "gold",
    new THREE.TorusGeometry(0.115, 0.014, 6, detail.ringTubular),
    [0, 0.028, 0],
    [Math.PI / 2, 0, 0],
    [1.32, 0.78, 1]
  )

  // Sculpted jolly Thần Tài head + auspicious long earlobes
  headCol.add(
    "skin",
    createSculptedHeadGeometry(false, true, detail.headSegW, detail.headSegH)
  )
  for (const side of [-1, 1] as const) {
    headCol.add(
      "skin",
      new THREE.SphereGeometry(0.09, detail.smallSphereW, detail.smallSphereH),
      [side * 0.392, -0.035, -0.015],
      [0, -side * 0.16, 0],
      [0.68, 1.28, 0.9]
    )
  }

  // Jolly crescent laughing eyes (^ ^), thick white brows, rosy cheeks, beaming smile
  const eyeCenterY = sculptHeadPoint(0.31, 0.05, 0.949, false, true)[1]
  for (const side of [-1, 1] as const) {
    const cx = side * 0.31
    // Laughing crescent eyes (^ ^)
    eyesCol.add(
      "pupilLash",
      createConformalFaceTube({
        points2D: [
          [cx - 0.135, 0.01],
          [cx, 0.125],
          [cx + 0.135, 0.01],
        ],
        radii: [0.012, 0.02, 0.012],
        surfaceOffset: 0.013,
        yPivotOffset: eyeCenterY,
        isFemale: false,
        isThanTai: true,
        tubularSegs: detail.lite ? 5 : 8,
        radialSegs: 5,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true }
    )
    // Thick fluffy sculpted white eyebrows
    headCol.add(
      "beard",
      createConformalFaceTube({
        points2D: [
          [cx - 0.16, 0.24],
          [cx, 0.345],
          [cx + 0.16, 0.25],
        ],
        radii: [0.018, 0.028, 0.016],
        surfaceOffset: 0.018,
        isFemale: false,
        isThanTai: true,
        tubularSegs: detail.lite ? 5 : 8,
        radialSegs: 5,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true }
    )
    // Extra rosy jolly cheeks
    headCol.add(
      "blush",
      createConformalFaceOval({
        dirX: side * 0.54,
        dirY: -0.14,
        rx: 0.072,
        ry: 0.044,
        surfaceOffset: 0.006,
        segs: detail.lite ? 8 : 12,
        isFemale: false,
        isThanTai: true,
      }),
      undefined,
      undefined,
      undefined,
      { noShadow: true, renderOrder: 2 }
    )
  }
  // Jolly rosy button nose
  const ttNose = evaluateHeadFrame(0, -0.07, 0.997, false, true)
  const ttNoseP = ttNose.pos.clone().addScaledVector(ttNose.normal, 0.018)
  headCol.add(
    "skinShade",
    new THREE.SphereGeometry(0.036, detail.smallSphereW, detail.smallSphereH),
    [ttNoseP.x, ttNoseP.y, ttNoseP.z],
    undefined,
    [1.15, 0.85, 0.9],
    { noShadow: true }
  )
  // Joyful wide smile
  headCol.add(
    "mouthFill",
    createConformalFaceOval({
      dirX: 0,
      dirY: -0.295,
      rx: 0.072,
      ry: 0.038,
      surfaceOffset: 0.01,
      segs: detail.lite ? 8 : 12,
      isFemale: false,
      isThanTai: true,
    }),
    undefined,
    undefined,
    undefined,
    { noShadow: true }
  )

  // Sculpted flowing cloud white beard & gracefully curled twin moustache
  const beardStrands: [number, number, number][][] = [
    [
      [0, -0.22, 0.32],
      [0, -0.35, 0.34],
      [0, -0.49, 0.28],
    ],
    [
      [-0.12, -0.21, 0.29],
      [-0.14, -0.34, 0.29],
      [-0.08, -0.45, 0.25],
    ],
    [
      [0.12, -0.21, 0.29],
      [0.14, -0.34, 0.29],
      [0.08, -0.45, 0.25],
    ],
  ]
  for (const pts of beardStrands) {
    headCol.add(
      "beard",
      strandFromTuples(pts, [0.095, 0.115, 0.055], detail, 0.72)
    )
  }
  for (const side of [-1, 1] as const) {
    // Curled auspicious moustache sweeps
    headCol.add(
      "beard",
      strandFromTuples(
        [
          [side * 0.03, -0.175, 0.365],
          [side * 0.16, -0.185, 0.355],
          [side * 0.275, -0.155, 0.28],
          [side * 0.32, -0.1, 0.21],
        ],
        [0.058, 0.068, 0.048, 0.018],
        detail,
        0.7
      )
    )
  }

  // Ornate Tiered Mandarin Hat (Mũ Cánh Chuồn)
  const hatY = 0.26
  headCol.add(
    "crimson",
    createSculptedLathe(
      [
        [0.39, 0],
        [0.37, 0.11],
        [0.33, 0.21],
        [0.24, 0.285],
        [0.12, 0.32],
        [0.02, 0.325],
      ],
      detail.torsoSeg
    ),
    [0, hatY - 0.03, -0.01]
  )
  // Upper crown gold band & brim band
  headCol.add(
    "gold",
    new THREE.TorusGeometry(0.395, 0.034, detail.ringRadial, detail.ringTubular),
    [0, hatY - 0.035, 0],
    [Math.PI / 2, 0, 0]
  )
  headCol.add(
    "gold",
    new THREE.TorusGeometry(0.34, 0.018, 6, detail.ringTubular),
    [0, hatY + 0.14, -0.01],
    [Math.PI / 2, 0, 0]
  )
  // Glowing ruby centerpiece in ornate gold bezel
  headCol.add(
    "brightGold",
    new THREE.CylinderGeometry(0.098, 0.098, 0.04, detail.limbSeg),
    [0, hatY + 0.055, 0.375],
    [Math.PI / 2, 0, 0]
  )
  headCol.add(
    "ruby",
    new THREE.SphereGeometry(0.062, detail.smallSphereW, detail.smallSphereH),
    [0, hatY + 0.055, 0.402]
  )
  // Gracefully curved traditional beveled Mandarin Hat Wings (Cánh chuồn)
  for (const side of [-1, 1] as const) {
    headCol.add(
      "gold",
      strandFromTuples(
        [
          [side * 0.35, hatY + 0.04, -0.02],
          [side * 0.5, hatY + 0.075, -0.02],
          [side * 0.64, hatY + 0.105, -0.02],
        ],
        [0.036, 0.032, 0.028],
        detail,
        0.55
      )
    )
    // Sculpted arched fin blade at each wing tip
    headCol.add(
      "brightGold",
      createExtrudedBevelPlate(
        [
          [0, -0.038],
          [side * 0.14, -0.052],
          [side * 0.22, 0.01],
          [side * 0.16, 0.072],
          [0, 0.042],
        ],
        0.024,
        0.008,
        2
      ),
      [side * 0.55, hatY + 0.095, -0.032]
    )
  }

  // Luminous Golden Halo Ring behind head
  haloCol.add(
    "halo",
    new THREE.TorusGeometry(0.57, 0.024, detail.ringRadial, detail.lite ? 22 : 36),
    [0, 0, 0],
    undefined,
    undefined,
    { noShadow: true }
  )
  if (!detail.lite) {
    haloCol.add(
      "brightGold",
      new THREE.TorusGeometry(0.49, 0.011, 6, 28),
      [0, 0, 0],
      undefined,
      undefined,
      { noShadow: true }
    )
  }

  return {
    key,
    refCount: 0,
    shadowGeo: new THREE.CircleGeometry(0.42, detail.lite ? 16 : 24),
    leftLeg: leftLegCol.flush(),
    rightLeg: rightLegCol.flush(),
    torso: torsoCol.flush(),
    leftArm: leftArmCol.flush(),
    rightArm: rightArmCol.flush(),
    head: headCol.flush(),
    eyes: eyesCol.flush(),
    hair: [],
    ponytail: [],
    glasses: [],
    medal: [],
    halo: haloCol.flush(),
    ingot: ingotCol.flush(),
    eyeCenterY,
    hasDynamicEyes: false,
    hasPonytail: false,
  }
}

// ---------- Material Palette Factory & Cache Acquisition ----------

function createStatueMaterial(
  rank: ChibiStatueRank
): THREE.MeshStandardMaterial {
  if (rank === 1) {
    return createMetalMaterial("#f3c64a", {
      roughness: 0.24,
      metalness: 0.82,
      emissive: "#854d0e",
      emissiveIntensity: 0.12,
    })
  }
  if (rank === 2) {
    return createMetalMaterial("#cfd5de", {
      roughness: 0.26,
      metalness: 0.78,
      emissive: "#334155",
      emissiveIntensity: 0.08,
    })
  }
  if (rank === 3) {
    return createMetalMaterial("#c98a52", {
      roughness: 0.32,
      metalness: 0.74,
      emissive: "#5c2d0c",
      emissiveIntensity: 0.08,
    })
  }
  return createMatteMaterial("#64748b", {
    roughness: 0.82,
    metalness: 0.08,
    transparent: true,
    opacity: 0.76,
  })
}

function buildMaterialPalette(
  key: string,
  isThanTai: boolean,
  preset: AvatarStylePreset,
  outfitHex: string,
  statueRank: ChibiStatueRank | undefined,
  dimmed: boolean
): VariantMaterialPalette {
  const materials = new Map<MaterialSlot, THREE.Material>()

  if (isThanTai) {
    materials.set("crimson", createClothMaterial("#b91c1c"))
    materials.set("deepRed", createClothMaterial("#88131a"))
    materials.set(
      "gold",
      createMetalMaterial("#f5c542", {
        roughness: 0.24,
        metalness: 0.82,
        emissive: "#a16207",
        emissiveIntensity: 0.15,
      })
    )
    materials.set(
      "brightGold",
      createMetalMaterial("#fde047", {
        roughness: 0.2,
        metalness: 0.86,
        emissive: "#ca8a04",
        emissiveIntensity: 0.25,
      })
    )
    materials.set("skin", createMatteMaterial("#fde0c2", { roughness: 0.56 }))
    materials.set("skinShade", createMatteMaterial("#f3b497", { roughness: 0.54 }))
    materials.set("beard", createMatteMaterial("#f8fafc", { roughness: 0.72 }))
    materials.set("ruby", createGlowMaterial("#ef4444", 0.9))
    materials.set(
      "jade",
      createMetalMaterial("#10b981", { roughness: 0.22, metalness: 0.35 })
    )
    materials.set("shoe", createMatteMaterial("#261913", { roughness: 0.52 }))
    materials.set("sole", createMatteMaterial("#18100c", { roughness: 0.74 }))
    materials.set("pupilLash", createMatteMaterial("#2b1610", { roughness: 0.25 }))
    materials.set("mouthFill", createMatteMaterial("#b91c1c", { roughness: 0.42 }))
    materials.set(
      "blush",
      new THREE.MeshStandardMaterial({
        color: "#f43f5e",
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        roughness: 0.6,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
    )
    materials.set("halo", createGlowMaterial("#fbbf24", 0.95, 0.88))
  } else {
    const isStatue = statueRank !== undefined
    const isFemale = preset.gender === "female"
    const isCool = preset.id === "danhtrongit"

    if (isStatue) {
      const statueBase = createStatueMaterial(statueRank)
      const statueShade = createMetalMaterial(
        statueRank === 1
          ? "#d4a024"
          : statueRank === 2
            ? "#94a3b8"
            : statueRank === 3
              ? "#9c6232"
              : "#475569",
        {
          roughness: statueRank === "empty" ? 0.86 : 0.34,
          metalness: statueRank === "empty" ? 0.06 : 0.72,
          transparent: statueRank === "empty",
          opacity: statueRank === "empty" ? 0.72 : 1,
        }
      )
      const inkMat = createMatteMaterial(
        statueRank === 1
          ? "#6f4b0c"
          : statueRank === 2
            ? "#475569"
            : statueRank === 3
              ? "#5a3214"
              : "#334155",
        { roughness: 0.42, metalness: 0.35 }
      )
      for (const slot of [
        "skin",
        "skinShade",
        "outfit",
        "shirt",
        "gold",
        "pearl",
      ] as MaterialSlot[]) {
        materials.set(slot, statueBase)
      }
      for (const slot of [
        "hair",
        "hairHighlight",
        "outfitShade",
        "bottom",
        "accent",
        "belt",
        "shoe",
        "sole",
      ] as MaterialSlot[]) {
        materials.set(slot, statueShade)
      }
      materials.set("pupilLash", inkMat)
      materials.set("browMouth", inkMat)

      const label = statueRank === "empty" ? "?" : String(statueRank)
      const accent =
        statueRank === 1
          ? "#f3c64a"
          : statueRank === 2
            ? "#cfd5de"
            : statueRank === 3
              ? "#c98a52"
              : "#64748b"
      const medalTex = createSignTexture(label, {
        style: "medal",
        accentColor: accent,
        textColor: statueRank === "empty" ? "#e2e8f0" : "#261804",
      })
      materials.set(
        "medalRim",
        createMetalMaterial(accent, { roughness: 0.25, metalness: 0.8 })
      )
      materials.set(
        "medalFace",
        new THREE.MeshStandardMaterial({
          map: medalTex,
          transparent: true,
          roughness: 0.3,
          metalness: 0.2,
        })
      )
    } else {
      materials.set(
        "skin",
        createMatteMaterial(preset.skinColor, { roughness: 0.56 })
      )
      materials.set(
        "skinShade",
        createMatteMaterial(shadeHex(preset.skinColor, 0.89, 0.08), {
          roughness: 0.58,
        })
      )
      materials.set(
        "hair",
        createMatteMaterial(preset.hairColor, {
          roughness: 0.44,
          metalness: 0.08,
        })
      )
      if (preset.hairHighlight) {
        materials.set(
          "hairHighlight",
          createMatteMaterial(preset.hairHighlight, {
            roughness: 0.36,
            metalness: 0.16,
          })
        )
      }
      materials.set("outfit", createClothMaterial(outfitHex))
      materials.set(
        "outfitShade",
        createClothMaterial(shadeHex(outfitHex, 0.78, 0.04))
      )
      materials.set("bottom", createClothMaterial(preset.bottomHex))
      materials.set(
        "shirt",
        createMatteMaterial(preset.innerShirtHex, { roughness: 0.58 })
      )
      materials.set(
        "accent",
        createMetalMaterial(preset.tieOrAccentHex, {
          roughness: 0.38,
          metalness: 0.26,
        })
      )
      materials.set(
        "belt",
        createMatteMaterial("#231f20", { roughness: 0.45, metalness: 0.15 })
      )
      materials.set(
        "shoe",
        createMatteMaterial(preset.shoeHex, { roughness: 0.46, metalness: 0.14 })
      )
      materials.set(
        "sole",
        createMatteMaterial(
          preset.outfitStyle === "polo" ? "#e2e8f0" : "#18181b",
          { roughness: 0.74, metalness: 0.04 }
        )
      )
      materials.set(
        "gold",
        createMetalMaterial("#f5c542", { roughness: 0.24, metalness: 0.82 })
      )
      materials.set(
        "pearl",
        createMatteMaterial("#fffaf0", { roughness: 0.2, metalness: 0.16 })
      )
      materials.set(
        "sclera",
        createMatteMaterial("#fcfdff", { roughness: 0.22, metalness: 0.02 })
      )
      materials.set(
        "iris",
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          vertexColors: true,
          roughness: 0.14,
          metalness: 0.08,
        })
      )
      materials.set(
        "pupilLash",
        createMatteMaterial("#14111a", { roughness: 0.16, metalness: 0.05 })
      )
      materials.set(
        "eyeHighlight",
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          emissive: "#ffffff",
          emissiveIntensity: 0.34,
          roughness: 0.1,
          metalness: 0.02,
        })
      )
      materials.set(
        "browMouth",
        createMatteMaterial(isCool ? "#19202e" : "#5a3228", { roughness: 0.48 })
      )
      materials.set(
        "mouthFill",
        createMatteMaterial("#e06b74", { roughness: 0.42 })
      )
      materials.set(
        "blush",
        new THREE.MeshStandardMaterial({
          color: "#ff7490",
          transparent: true,
          opacity: isFemale ? 0.42 : isCool ? 0.22 : 0.32,
          depthWrite: false,
          roughness: 0.62,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        })
      )
      if (preset.hasGlasses) {
        materials.set(
          "glassesFrame",
          createMetalMaterial(preset.glassesColor ?? "#1f2937", {
            roughness: 0.24,
            metalness: 0.74,
          })
        )
        materials.set(
          "glassesLens",
          new THREE.MeshStandardMaterial({
            color: isCool ? "#38bdf8" : "#e0f2fe",
            transparent: true,
            opacity: isCool ? 0.24 : 0.16,
            depthWrite: false,
            roughness: 0.08,
            metalness: 0.22,
          })
        )
      }
    }
  }

  // Deduplicate shared material references before applying dimmed state
  if (dimmed) {
    const visited = new Set<THREE.Material>()
    for (const mat of materials.values()) {
      if (visited.has(mat)) continue
      visited.add(mat)
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.transparent = true
        mat.opacity = Math.min(mat.opacity, 0.56)
      }
    }
  }

  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x0d111a,
    transparent: true,
    opacity: dimmed || statueRank === "empty" ? 0.14 : 0.26,
    depthWrite: false,
  })

  return { key, refCount: 0, materials, shadowMat }
}

function acquireGeometryBundle(
  isThanTai: boolean,
  preset: AvatarStylePreset,
  isBoss: boolean,
  statueRank: ChibiStatueRank | undefined,
  lite: boolean
): VariantGeometryBundle {
  const key = isThanTai
    ? `thantai|${lite ? "lite" : "full"}`
    : `std|${preset.id}|${isBoss ? 1 : 0}|${statueRank ?? "std"}|${lite ? "lite" : "full"}`
  let bundle = geometryBundleCache.get(key)
  if (!bundle) {
    const detail = lite ? LITE_DETAIL : FULL_DETAIL
    bundle = isThanTai
      ? buildThanTaiGeometryBundle(key, detail)
      : buildStandardGeometryBundle(key, preset, isBoss, statueRank, detail)
    geometryBundleCache.set(key, bundle)
  }
  bundle.refCount += 1
  return bundle
}

function acquireMaterialPalette(
  isThanTai: boolean,
  preset: AvatarStylePreset,
  outfitHex: string,
  statueRank: ChibiStatueRank | undefined,
  dimmed: boolean
): VariantMaterialPalette {
  const key = isThanTai
    ? `thantai|${dimmed ? "dim" : "lit"}`
    : `std|${preset.id}|${statueRank ?? "std"}|${statueRank ? "fixed" : outfitHex}|${dimmed ? "dim" : "lit"}`
  let palette = materialPaletteCache.get(key)
  if (!palette) {
    palette = buildMaterialPalette(
      key,
      isThanTai,
      preset,
      outfitHex,
      statueRank,
      dimmed
    )
    materialPaletteCache.set(key, palette)
  }
  palette.refCount += 1
  return palette
}

// ---------- Mesh Instantiation Helper ----------

interface BoundMesh {
  mesh: THREE.Mesh
  slot: MaterialSlot
}

function mountPartList(
  parent: THREE.Object3D,
  entries: MergedPartEntry[],
  palette: VariantMaterialPalette,
  bindings: BoundMesh[]
): void {
  for (const entry of entries) {
    const mat = palette.materials.get(entry.slot)
    if (!mat) continue
    const mesh = new THREE.Mesh(entry.geometry, mat)
    const noShadow = entry.noShadow === true
    mesh.castShadow = !noShadow
    mesh.receiveShadow = !noShadow
    if (noShadow) {
      mesh.userData.noShadow = true
    }
    if (entry.renderOrder) {
      mesh.renderOrder = entry.renderOrder
    }
    parent.add(mesh)
    bindings.push({ mesh, slot: entry.slot })
  }
}

// ---------- Blink Envelope Computation (Zero Allocation) ----------

function computeBlinkScaleY(t: number, phaseOffset: number): number {
  const cycleLen = 3.8 + phaseOffset * 1.1
  const localT = (t + phaseOffset * 4.7) % cycleLen
  const blinkDur = 0.16
  if (localT >= blinkDur) return 1
  // Smooth organic close -> brief hold -> open
  const u = localT / blinkDur
  let closeAmt: number
  if (u < 0.38) {
    const p = u / 0.38
    closeAmt = p * p * (3 - 2 * p)
  } else if (u < 0.56) {
    closeAmt = 1
  } else {
    const p = (u - 0.56) / 0.44
    closeAmt = 1 - p * p * (3 - 2 * p)
  }
  return 1 - closeAmt * 0.92
}

// ---------- Public Character Factory ----------

/**
 * Builds an articulated, sculpted 3D Chibi character rig with shared ref-counted
 * geometries/materials, live color swapping, blinking, reduced-motion support,
 * and smooth zero-allocation procedural animations (`idle`, `walk`, `wave`, `bow`, `hop`, `statue`).
 */
export function createChibiCharacter(spec: ChibiCharacterSpec): ChibiRig {
  const isThanTai = spec.isThanTai === true || spec.avatarId === "thantai"
  const isBoss = spec.isBoss === true
  const lite = spec.lite === true
  const preset = getAvatarStylePreset(spec.avatarId, spec.genderHint)
  let currentOutfitHex =
    resolveOutfitHex(spec.outfitColorHex) ?? preset.defaultOutfitHex
  let dimmedState = spec.statueRank === "empty"

  const baseScale = isThanTai
    ? 1.75 * (spec.scale ?? 1)
    : (isBoss ? 1.06 : 1.0) * (spec.scale ?? 1)

  const bundle = acquireGeometryBundle(
    isThanTai,
    preset,
    isBoss,
    spec.statueRank,
    lite
  )
  let palette = acquireMaterialPalette(
    isThanTai,
    preset,
    currentOutfitHex,
    spec.statueRank,
    dimmedState
  )

  const root = new THREE.Group()
  root.name = `chibi-${spec.avatarId}`
  root.scale.setScalar(baseScale)

  // Child[0]: Soft ground contact shadow disc (stays pinned to floor during hops)
  const shadowDisc = new THREE.Mesh(bundle.shadowGeo, palette.shadowMat)
  shadowDisc.rotation.x = -Math.PI / 2
  shadowDisc.position.y = 0.012
  shadowDisc.renderOrder = 1
  root.add(shadowDisc)

  // Child[1]: Articulated character hierarchy
  // Hierarchy order preserved for deterministic animation & tests:
  // root[1]=bodyPivot -> [0]=hipsPivot -> [0]=leftLegPivot, [1]=rightLegPivot, [2]=torsoPivot
  const bodyPivot = new THREE.Group()
  const hipsPivot = new THREE.Group()
  const torsoPivot = new THREE.Group()
  const headPivot = new THREE.Group()
  const leftArmPivot = new THREE.Group()
  const rightArmPivot = new THREE.Group()
  const leftLegPivot = new THREE.Group()
  const rightLegPivot = new THREE.Group()

  root.add(bodyPivot)
  bodyPivot.add(hipsPivot)
  hipsPivot.add(leftLegPivot, rightLegPivot, torsoPivot)
  torsoPivot.add(leftArmPivot, rightArmPivot, headPivot)

  hipsPivot.position.set(0, 0.34, 0)
  const legOffsetX = isThanTai ? 0.112 : 0.105
  leftLegPivot.position.set(-legOffsetX, 0, 0)
  rightLegPivot.position.set(legOffsetX, 0, 0)

  if (isThanTai) {
    leftArmPivot.position.set(-0.28, 0.47, 0.04)
    rightArmPivot.position.set(0.28, 0.47, 0.04)
    headPivot.position.set(0, 0.89, 0)
  } else {
    const armX = preset.gender === "female" ? 0.245 : 0.258
    leftArmPivot.position.set(-armX, 0.455, 0)
    rightArmPivot.position.set(armX, 0.455, 0)
    headPivot.position.set(0, 0.875, 0)
  }

  const bindings: BoundMesh[] = []
  mountPartList(leftLegPivot, bundle.leftLeg, palette, bindings)
  mountPartList(rightLegPivot, bundle.rightLeg, palette, bindings)
  mountPartList(torsoPivot, bundle.torso, palette, bindings)
  mountPartList(leftArmPivot, bundle.leftArm, palette, bindings)
  mountPartList(rightArmPivot, bundle.rightArm, palette, bindings)
  mountPartList(headPivot, bundle.head, palette, bindings)

  // Blinkable eyes group anchored at exact eye center Y
  const eyesPivot = new THREE.Group()
  eyesPivot.name = "chibi-face"
  eyesPivot.position.set(0, bundle.eyeCenterY, 0)
  headPivot.add(eyesPivot)
  mountPartList(eyesPivot, bundle.eyes, palette, bindings)

  // Sculpted hairstyle group ("chibi-hair" direct child of headPivot)
  let ponytailPivot: THREE.Group | null = null
  if (bundle.hair.length > 0) {
    const hairGroup = new THREE.Group()
    hairGroup.name = "chibi-hair"
    headPivot.add(hairGroup)
    mountPartList(hairGroup, bundle.hair, palette, bindings)

    if (bundle.hasPonytail && bundle.ponytail.length > 0) {
      ponytailPivot = new THREE.Group()
      ponytailPivot.position.set(0, 0.16, -0.37)
      hairGroup.add(ponytailPivot)
      mountPartList(ponytailPivot, bundle.ponytail, palette, bindings)
    }
  }

  // 3D glasses group ("chibi-glasses" direct child of headPivot)
  if (bundle.glasses.length > 0) {
    const glassesGroup = new THREE.Group()
    glassesGroup.name = "chibi-glasses"
    headPivot.add(glassesGroup)
    mountPartList(glassesGroup, bundle.glasses, palette, bindings)
  }

  // Floating Hall of Fame rank medal
  let medalGroup: THREE.Group | null = null
  if (bundle.medal.length > 0) {
    medalGroup = new THREE.Group()
    medalGroup.position.set(0, 0.56, 0)
    headPivot.add(medalGroup)
    mountPartList(medalGroup, bundle.medal, palette, bindings)
  }

  // Thần Tài floating luminous golden halo
  let haloGroup: THREE.Group | null = null
  if (bundle.halo.length > 0) {
    haloGroup = new THREE.Group()
    haloGroup.position.set(0, 0.08, -0.26)
    headPivot.add(haloGroup)
    mountPartList(haloGroup, bundle.halo, palette, bindings)
  }

  // Thần Tài gleaming gold sycee ingot
  let ingotGroup: THREE.Group | null = null
  if (bundle.ingot.length > 0) {
    ingotGroup = new THREE.Group()
    ingotGroup.position.set(0, 0.32, 0.37)
    torsoPivot.add(ingotGroup)
    mountPartList(ingotGroup, bundle.ingot, palette, bindings)
  }

  const swapPalette = (nextOutfitHex: string, nextDimmed: boolean): void => {
    const nextPalette = acquireMaterialPalette(
      isThanTai,
      preset,
      nextOutfitHex,
      spec.statueRank,
      nextDimmed
    )
    if (nextPalette === palette) {
      // Same palette key: balance the extra increment immediately
      releaseMaterialPalette(nextPalette)
      return
    }
    const prevPalette = palette
    palette = nextPalette
    for (let i = 0; i < bindings.length; i += 1) {
      const b = bindings[i]
      const mat = palette.materials.get(b.slot)
      if (mat) b.mesh.material = mat
    }
    shadowDisc.material = palette.shadowMat
    releaseMaterialPalette(prevPalette)
  }

  const setOutfitColor = (hex: string | null): void => {
    const resolved = resolveOutfitHex(hex) ?? preset.defaultOutfitHex
    if (resolved === currentOutfitHex) return
    currentOutfitHex = resolved
    if (!isThanTai && spec.statueRank === undefined) {
      swapPalette(currentOutfitHex, dimmedState)
    }
  }

  const setDimmed = (dimmed: boolean): void => {
    if (dimmed === dimmedState) return
    dimmedState = dimmed
    swapPalette(currentOutfitHex, dimmedState)
  }

  const baseHipsY = hipsPivot.position.y
  const blinkPhase = hashSeed(spec.avatarId)
  let internalTime = 0
  let currentFacing = 0
  let facingInitialized = false
  let disposed = false

  const update = (dt: number, state: ChibiUpdateState): void => {
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0
    internalTime += safeDt
    const t =
      state.animTime !== undefined && Number.isFinite(state.animTime)
        ? state.animTime
        : internalTime
    const targetFacing = Number.isFinite(state.facingRad) ? state.facingRad : 0
    const moveFactor = Math.max(
      0,
      Math.min(1, Number.isFinite(state.moveFactor) ? (state.moveFactor ?? 1) : 1)
    )
    const reduced =
      state.reducedMotion ?? spec.reducedMotion ?? prefersReducedMotion()

    if (!facingInitialized || state.anim === "statue") {
      currentFacing = targetFacing
      facingInitialized = true
    } else {
      const delta = shortestAngleDiff(currentFacing, targetFacing)
      const alpha = 1 - Math.exp(-15 * safeDt)
      currentFacing += delta * alpha
    }
    bodyPivot.rotation.y = currentFacing

    // Reset articulated transforms cleanly before applying active animation mode
    bodyPivot.position.set(0, 0, 0)
    bodyPivot.scale.set(1, 1, 1)
    hipsPivot.position.y = baseHipsY
    hipsPivot.rotation.set(0, 0, 0)
    torsoPivot.rotation.set(0, 0, 0)
    torsoPivot.scale.set(1, 1, 1)
    headPivot.rotation.set(0, 0, 0)
    eyesPivot.scale.set(1, 1, 1)
    leftArmPivot.rotation.set(0, 0, 0)
    rightArmPivot.rotation.set(0, 0, 0)
    leftLegPivot.rotation.set(0, 0, 0)
    rightLegPivot.rotation.set(0, 0, 0)
    if (ponytailPivot) {
      ponytailPivot.rotation.set(0, 0, 0)
    }
    shadowDisc.scale.setScalar(1)

    // Periodic organic blinking (disabled for statues & reduced motion)
    if (bundle.hasDynamicEyes && !reduced && state.anim !== "statue") {
      eyesPivot.scale.y = computeBlinkScaleY(t, blinkPhase)
    }

    if (haloGroup) {
      haloGroup.rotation.z = reduced
        ? 0
        : t * (state.anim === "wave" ? 2.2 : 0.65)
    }
    if (ingotGroup) {
      ingotGroup.position.y = reduced ? 0.32 : 0.32 + Math.sin(t * 2.6) * 0.014
    }
    if (medalGroup) {
      medalGroup.position.y = reduced ? 0.56 : 0.56 + Math.sin(t * 2.2) * 0.028
      medalGroup.rotation.y = reduced ? 0 : t * 1.1
    }

    switch (state.anim) {
      case "idle": {
        if (reduced) {
          leftArmPivot.rotation.z = 0.05
          rightArmPivot.rotation.z = -0.05
        } else {
          const breath = Math.sin(t * 2.4)
          torsoPivot.scale.set(
            1 + breath * 0.013,
            1 + breath * 0.02,
            1 + breath * 0.008
          )
          headPivot.rotation.z = Math.sin(t * 1.15) * 0.036
          headPivot.rotation.x = Math.sin(t * 2.4 - 0.5) * 0.022
          headPivot.rotation.y = Math.sin(t * 0.72 + blinkPhase * 6.28) * 0.045
          leftArmPivot.rotation.z = 0.06 + breath * 0.028
          rightArmPivot.rotation.z = -0.06 - breath * 0.028
          if (ponytailPivot) {
            ponytailPivot.rotation.x = Math.sin(t * 2.4 - 0.6) * 0.05
          }
        }
        break
      }
      case "walk": {
        const phase = t * 10.2
        const stride = Math.sin(phase) * moveFactor
        if (reduced) {
          // Reduced motion: no walk bob/bounce or head/hip sway; keep minimal calm leg motion
          leftLegPivot.rotation.x = stride * 0.24
          rightLegPivot.rotation.x = -stride * 0.24
          leftArmPivot.rotation.x = -stride * 0.14
          rightArmPivot.rotation.x = stride * 0.14
          leftArmPivot.rotation.z = 0.05
          rightArmPivot.rotation.z = -0.05
        } else {
          const bounce = Math.abs(Math.sin(phase)) * 0.068 * moveFactor
          hipsPivot.position.y = baseHipsY + bounce
          hipsPivot.rotation.z = Math.sin(phase) * 0.048 * moveFactor
          torsoPivot.rotation.x = 0.085 * moveFactor
          headPivot.rotation.z = -Math.sin(phase) * 0.035 * moveFactor
          leftLegPivot.rotation.x = stride * 0.62
          rightLegPivot.rotation.x = -stride * 0.62
          leftArmPivot.rotation.x = -stride * 0.52
          rightArmPivot.rotation.x = stride * 0.52
          leftArmPivot.rotation.z = 0.08
          rightArmPivot.rotation.z = -0.08
          if (ponytailPivot) {
            ponytailPivot.rotation.x = 0.14 * moveFactor + bounce * 2.4
            ponytailPivot.rotation.z = -Math.sin(phase) * 0.09 * moveFactor
          }
          shadowDisc.scale.setScalar(1 - bounce * 1.35)
        }
        break
      }
      case "wave": {
        if (reduced) {
          rightArmPivot.rotation.z = -2.2
          rightArmPivot.rotation.x = -0.2
          leftArmPivot.rotation.z = 0.12
        } else {
          const wave = Math.sin(t * 11)
          const hop = Math.abs(Math.sin(t * 4.2)) * 0.042
          hipsPivot.position.y = baseHipsY + hop
          headPivot.rotation.z = -0.1 + wave * 0.055
          headPivot.rotation.x = -0.04
          rightArmPivot.rotation.z = -2.35 + wave * 0.34
          rightArmPivot.rotation.x = -0.25
          leftArmPivot.rotation.z = 0.18
          if (ingotGroup) {
            ingotGroup.position.y = 0.35 + Math.abs(wave) * 0.038
          }
        }
        break
      }
      case "bow": {
        if (reduced) {
          torsoPivot.rotation.x = 0.32
          headPivot.rotation.x = 0.12
          leftArmPivot.rotation.x = -0.35
          rightArmPivot.rotation.x = -0.35
        } else {
          // Polite rhythmic bow cycle: 3 clean bows of 0.9s each over 2.7s (peaks at 0.45s, 1.35s, 2.25s)
          const bowT = Math.max(0, t)
          const bowCycle = (bowT % 0.9) / 0.9
          const bowAmt = Math.pow(Math.sin(bowCycle * Math.PI), 1.35)
          torsoPivot.rotation.x = bowAmt * 0.58
          headPivot.rotation.x = bowAmt * 0.24
          leftArmPivot.rotation.x = -0.45 - bowAmt * 0.22
          rightArmPivot.rotation.x = -0.45 - bowAmt * 0.22
          leftArmPivot.rotation.z = -0.18
          rightArmPivot.rotation.z = 0.18
        }
        break
      }
      case "hop": {
        if (reduced) {
          leftArmPivot.rotation.z = 0.28
          rightArmPivot.rotation.z = -0.28
        } else {
          // Energetic hop & stomp squash-stretch (0.52s cycle; stomp impact peaks at t=0.26s with egg shatter)
          const hopT = Math.max(0, t)
          const cycle = (hopT / 0.52) % 1
          if (cycle < 0.14) {
            const s = cycle / 0.14
            bodyPivot.scale.set(1 + s * 0.12, 1 - s * 0.16, 1 + s * 0.12)
          } else if (cycle < 0.48) {
            const u = (cycle - 0.14) / 0.34
            const jump = Math.sin(u * Math.PI)
            bodyPivot.position.y = jump * 0.44
            bodyPivot.scale.set(
              1 - jump * 0.08,
              1 + jump * 0.12,
              1 - jump * 0.08
            )
            leftArmPivot.rotation.z = 0.55 + jump * 0.9
            rightArmPivot.rotation.z = -0.55 - jump * 0.9
            leftLegPivot.rotation.x = -jump * 0.38
            rightLegPivot.rotation.x = jump * 0.22
            if (ponytailPivot) {
              ponytailPivot.rotation.x = jump * 0.42
            }
            shadowDisc.scale.setScalar(Math.max(0.55, 1 - jump * 0.42))
          } else if (cycle < 0.76) {
            // Stomp impact peaks right at cycle=0.50 (t=0.26s) then rebounds cleanly
            const impact =
              cycle <= 0.5
                ? (cycle - 0.48) / 0.02
                : Math.max(0, 1 - (cycle - 0.5) / 0.26)
            bodyPivot.scale.set(
              1 + impact * 0.2,
              1 - impact * 0.26,
              1 + impact * 0.2
            )
            leftArmPivot.rotation.z = 0.32 * impact
            rightArmPivot.rotation.z = -0.32 * impact
          } else {
            const settle = Math.sin(((cycle - 0.76) / 0.24) * Math.PI)
            bodyPivot.scale.set(
              1 - settle * 0.03,
              1 + settle * 0.04,
              1 - settle * 0.03
            )
          }
        }
        break
      }
      case "statue": {
        leftArmPivot.rotation.z = 0.08
        rightArmPivot.rotation.z = -0.08
        break
      }
    }
  }

  const headHeight =
    (isThanTai ? 1.82 : spec.statueRank ? 1.98 : 1.72) * baseScale

  return {
    root,
    headHeight,
    setOutfitColor,
    setDimmed,
    update,
    dispose: () => {
      if (disposed) return
      disposed = true
      releaseGeometryBundle(bundle)
      releaseMaterialPalette(palette)
    },
  }
}
