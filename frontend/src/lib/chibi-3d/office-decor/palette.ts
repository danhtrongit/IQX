/**
 * Shared material palette, lightweight rounded-bevel geometry helpers, and batched static
 * geometry merger for the open-floor Khu Văn phòng procedural 3D decorations.
 */
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

import {
  createWoodSurfaceTexture,
  markStaticCanvasTexture,
  safeGet2DContext,
} from "@/lib/chibi-3d/textures.ts"
import {
  createClothMaterial,
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  isSharedResourceObj,
  mergeIndexedGeometries,
} from "@/lib/chibi-3d/types.ts"

export const OFFICE_DECOR_FONT_STACK =
  '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const scratchMatrix = new THREE.Matrix4()
const scratchPos = new THREE.Vector3()
const scratchQuat = new THREE.Quaternion()
const scratchEuler = new THREE.Euler()
const scratchScale = new THREE.Vector3()

export interface MergedSpec {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
}

interface BatchBucket {
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
  geometries: THREE.BufferGeometry[]
}

/**
 * Creates a chibi beveled box geometry.
 * Uses 1 bevel segment by default (crisp chamfered silhouette at ~1/3 the triangles of 2-segment).
 */
export function chibiBevelBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  lite = false,
  segments?: number
): THREE.BufferGeometry {
  const sw = Math.max(0.008, w)
  const sh = Math.max(0.008, h)
  const sd = Math.max(0.008, d)
  const r = Math.max(0.002, Math.min(radius, Math.min(sw, sh, sd) * 0.4))
  return new RoundedBoxGeometry(sw, sh, sd, segments ?? (lite ? 1 : 1), r)
}

/**
 * Safely creates a static CanvasTexture (<= 1024px) with automatic CPU canvas release
 * after GPU upload and context-loss repaint support; falls back cleanly in jsdom.
 */
export function createDecorCanvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  anisotropy = 4
): THREE.Texture {
  const safeW = Math.min(1024, Math.max(2, Math.round(w)))
  const safeH = Math.min(1024, Math.max(2, Math.round(h)))
  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    draw(ctx, safeW, safeH)
    return true
  }
  const canvas = document.createElement("canvas")
  canvas.width = safeW
  canvas.height = safeH
  const hasCtx = paint(canvas)
  if (hasCtx) {
    const tex = markStaticCanvasTexture(new THREE.CanvasTexture(canvas), (c) => {
      paint(c)
    })
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = Math.min(8, anisotropy)
    tex.needsUpdate = true
    return tex
  }
  const fallback = new THREE.DataTexture(
    new Uint8Array([232, 238, 246, 255]),
    1,
    1,
    THREE.RGBAFormat
  )
  fallback.colorSpace = THREE.SRGBColorSpace
  fallback.needsUpdate = true
  return fallback
}

/** Batches static geometries by `(material, castShadow, receiveShadow)` into merged draw calls. */
export class OfficeDecorBatcher {
  private readonly buckets = new Map<string, BatchBucket>()

  add(
    raw: THREE.BufferGeometry,
    material: THREE.Material,
    pos: readonly [number, number, number],
    rot?: readonly [number, number, number],
    scale?: readonly [number, number, number],
    castShadow = true,
    receiveShadow = true
  ): void {
    const geom = isSharedResourceObj(raw) ? raw.clone() : raw
    if (isSharedResourceObj(geom)) {
      geom.userData = {}
    }
    scratchPos.set(pos[0], pos[1], pos[2])
    if (rot) {
      scratchEuler.set(rot[0], rot[1], rot[2])
      scratchQuat.setFromEuler(scratchEuler)
    } else {
      scratchQuat.identity()
    }
    if (scale) {
      scratchScale.set(scale[0], scale[1], scale[2])
    } else {
      scratchScale.set(1, 1, 1)
    }
    scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
    geom.applyMatrix4(scratchMatrix)

    const key = `${material.uuid}:${castShadow ? 1 : 0}:${receiveShadow ? 1 : 0}`
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = {
        material,
        castShadow,
        receiveShadow,
        geometries: [],
      }
      this.buckets.set(key, bucket)
    }
    bucket.geometries.push(geom)
  }

  addBox(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    castShadow = true,
    receiveShadow = true,
    rot?: readonly [number, number, number]
  ): void {
    this.add(
      new THREE.BoxGeometry(w, h, d),
      material,
      [x, y, z],
      rot,
      undefined,
      castShadow,
      receiveShadow
    )
  }

  addBevelBox(
    w: number,
    h: number,
    d: number,
    radius: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    lite = false,
    castShadow = true,
    receiveShadow = true,
    rot?: readonly [number, number, number]
  ): void {
    this.add(
      chibiBevelBox(w, h, d, radius, lite),
      material,
      [x, y, z],
      rot,
      undefined,
      castShadow,
      receiveShadow
    )
  }

  addCylinder(
    rt: number,
    rb: number,
    h: number,
    segs: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    castShadow = true,
    receiveShadow = true,
    rot?: readonly [number, number, number]
  ): void {
    this.add(
      new THREE.CylinderGeometry(rt, rb, h, segs),
      material,
      [x, y, z],
      rot,
      undefined,
      castShadow,
      receiveShadow
    )
  }

  addSphere(
    r: number,
    wSegs: number,
    hSegs: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    castShadow = true,
    receiveShadow = true,
    scale?: readonly [number, number, number]
  ): void {
    this.add(
      new THREE.SphereGeometry(r, wSegs, hSegs),
      material,
      [x, y, z],
      undefined,
      scale,
      castShadow,
      receiveShadow
    )
  }

  flushToSpecs(): MergedSpec[] {
    const specs: MergedSpec[] = []
    for (const bucket of this.buckets.values()) {
      if (bucket.geometries.length === 0) continue
      const merged = mergeIndexedGeometries(bucket.geometries, {
        disposeInputs: true,
      })
      if (merged) {
        merged.computeBoundingSphere()
        specs.push({
          geometry: merged,
          material: bucket.material,
          castShadow: bucket.castShadow,
          receiveShadow: bucket.receiveShadow,
        })
      }
    }
    this.buckets.clear()
    return specs
  }

  flushInto(parent: THREE.Object3D): Set<THREE.Material> {
    const used = new Set<THREE.Material>()
    for (const spec of this.flushToSpecs()) {
      const mesh = new THREE.Mesh(spec.geometry, spec.material)
      mesh.castShadow = spec.castShadow
      mesh.receiveShadow = spec.receiveShadow
      parent.add(mesh)
      used.add(spec.material)
    }
    return used
  }
}

export interface OfficeDecorPalette {
  readonly wallCream: THREE.MeshStandardMaterial
  readonly wallDadoNavy: THREE.MeshStandardMaterial
  readonly skirtingDark: THREE.MeshStandardMaterial
  readonly pilasterCream: THREE.MeshStandardMaterial
  readonly pilasterFlute: THREE.MeshStandardMaterial
  readonly gold: THREE.MeshStandardMaterial
  readonly silver: THREE.MeshStandardMaterial
  readonly bronze: THREE.MeshStandardMaterial
  readonly brassDark: THREE.MeshStandardMaterial
  readonly obsidian: THREE.MeshStandardMaterial
  readonly frameMetal: THREE.MeshStandardMaterial
  readonly oakWood: THREE.MeshStandardMaterial
  readonly walnutWood: THREE.MeshStandardMaterial
  readonly slatWood: THREE.MeshStandardMaterial
  readonly whiteCeramic: THREE.MeshStandardMaterial
  readonly marbleLight: THREE.MeshStandardMaterial
  readonly slateFabric: THREE.MeshStandardMaterial
  readonly navyFabric: THREE.MeshStandardMaterial
  readonly creamFabric: THREE.MeshStandardMaterial
  readonly terracotta: THREE.MeshStandardMaterial
  readonly soilDark: THREE.MeshStandardMaterial
  readonly leafDeep: THREE.MeshStandardMaterial
  readonly leafMid: THREE.MeshStandardMaterial
  readonly leafBright: THREE.MeshStandardMaterial
  readonly feltGreen: THREE.MeshStandardMaterial
  readonly redAccent: THREE.MeshStandardMaterial
  readonly blueAccent: THREE.MeshStandardMaterial
  readonly amberAccent: THREE.MeshStandardMaterial
  readonly emeraldAccent: THREE.MeshStandardMaterial
  readonly pinkAccent: THREE.MeshStandardMaterial
  readonly paperWhite: THREE.MeshStandardMaterial
  readonly warmGlow: THREE.MeshStandardMaterial
  readonly lampShadeGlow: THREE.MeshStandardMaterial
  readonly ledGreen: THREE.MeshStandardMaterial
  readonly screenCyan: THREE.MeshStandardMaterial
  readonly waterGlass: THREE.MeshStandardMaterial
  readonly sunPool: THREE.MeshBasicMaterial
  readonly allMaterials: readonly THREE.Material[]
  /** Disposes any palette materials that were not attached to a mounted mesh. */
  disposeUnused: (used: ReadonlySet<THREE.Material>) => void
}

/** Creates ONE shared chibi PBR material palette for the entire static open-floor office. */
export function createOfficeDecorPalette(
  lite: boolean,
  retainTex: (tex: THREE.Texture) => void
): OfficeDecorPalette {
  const oakTex = createWoodSurfaceTexture("oak")
  retainTex(oakTex)

  const wallCream = createMatteMaterial("#ece4d6", { roughness: 0.66 })
  const wallDadoNavy = createMatteMaterial("#18274a", { roughness: 0.46 })
  const skirtingDark = createMatteMaterial("#0f1a33", {
    roughness: 0.44,
    metalness: 0.16,
  })
  const pilasterCream = createMatteMaterial("#e2d7c5", { roughness: 0.54 })
  const pilasterFlute = createMatteMaterial("#cfc1aa", { roughness: 0.62 })
  const gold = createMetalMaterial("#e9b949", {
    roughness: 0.25,
    metalness: 0.84,
  })
  const silver = createMetalMaterial("#cbd5e1", {
    roughness: 0.24,
    metalness: 0.84,
  })
  const bronze = createMetalMaterial("#c97e48", {
    roughness: 0.3,
    metalness: 0.78,
  })
  const brassDark = createMetalMaterial("#a67c2e", {
    roughness: 0.34,
    metalness: 0.72,
  })
  const obsidian = createMatteMaterial("#0d1526", {
    roughness: 0.38,
    metalness: 0.32,
  })
  const frameMetal = createMetalMaterial("#273654", {
    roughness: 0.36,
    metalness: 0.65,
  })
  const oakWood = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: oakTex,
    roughness: 0.48,
    metalness: 0.05,
  })
  const walnutWood = createMatteMaterial("#6f4929", { roughness: 0.54 })
  const slatWood = createMatteMaterial("#9c6b3d", { roughness: 0.56 })
  const whiteCeramic = createMatteMaterial("#f4f6fa", { roughness: 0.3 })
  const marbleLight = createMatteMaterial("#f1eadf", {
    roughness: 0.34,
    metalness: 0.06,
  })
  const slateFabric = createClothMaterial("#364a6e")
  const navyFabric = createClothMaterial("#1f3359")
  const creamFabric = createClothMaterial("#efe2cc")
  const terracotta = createMatteMaterial("#c26a48", { roughness: 0.66 })
  const soilDark = createMatteMaterial("#402d20", { roughness: 0.9 })
  const leafDeep = createMatteMaterial("#286e3c", { roughness: 0.56 })
  const leafMid = createMatteMaterial("#3a914c", { roughness: 0.52 })
  const leafBright = createMatteMaterial("#59b35d", { roughness: 0.5 })
  const feltGreen = createMatteMaterial("#1f8a5b", { roughness: 0.78 })
  const redAccent = createMatteMaterial("#dc4c54", { roughness: 0.44 })
  const blueAccent = createMatteMaterial("#2d6fe8", { roughness: 0.46 })
  const amberAccent = createMatteMaterial("#e89a2c", { roughness: 0.48 })
  const emeraldAccent = createMatteMaterial("#19a974", { roughness: 0.46 })
  const pinkAccent = createMatteMaterial("#e879a0", { roughness: 0.5 })
  const paperWhite = createMatteMaterial("#f8fafc", { roughness: 0.68 })
  const warmGlow = createGlowMaterial("#ffe4a3", lite ? 0.85 : 1.08)
  const lampShadeGlow = createGlowMaterial("#fff0c8", 0.78)
  const ledGreen = createGlowMaterial("#34d399", 1.1)
  const screenCyan = createGlowMaterial("#38bdf8", 0.9)
  const waterGlass = new THREE.MeshStandardMaterial({
    color: "#60a5fa",
    transparent: true,
    opacity: 0.74,
    roughness: 0.16,
    metalness: 0.1,
  })
  const sunPool = new THREE.MeshBasicMaterial({
    color: "#fff3d1",
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  })

  const allMaterials: THREE.Material[] = [
    wallCream,
    wallDadoNavy,
    skirtingDark,
    pilasterCream,
    pilasterFlute,
    gold,
    silver,
    bronze,
    brassDark,
    obsidian,
    frameMetal,
    oakWood,
    walnutWood,
    slatWood,
    whiteCeramic,
    marbleLight,
    slateFabric,
    navyFabric,
    creamFabric,
    terracotta,
    soilDark,
    leafDeep,
    leafMid,
    leafBright,
    feltGreen,
    redAccent,
    blueAccent,
    amberAccent,
    emeraldAccent,
    pinkAccent,
    paperWhite,
    warmGlow,
    lampShadeGlow,
    ledGreen,
    screenCyan,
    waterGlass,
    sunPool,
  ]

  return {
    wallCream,
    wallDadoNavy,
    skirtingDark,
    pilasterCream,
    pilasterFlute,
    gold,
    silver,
    bronze,
    brassDark,
    obsidian,
    frameMetal,
    oakWood,
    walnutWood,
    slatWood,
    whiteCeramic,
    marbleLight,
    slateFabric,
    navyFabric,
    creamFabric,
    terracotta,
    soilDark,
    leafDeep,
    leafMid,
    leafBright,
    feltGreen,
    redAccent,
    blueAccent,
    amberAccent,
    emeraldAccent,
    pinkAccent,
    paperWhite,
    warmGlow,
    lampShadeGlow,
    ledGreen,
    screenCyan,
    waterGlass,
    sunPool,
    allMaterials,
    disposeUnused: (used) => {
      for (const m of allMaterials) {
        if (!used.has(m)) {
          m.dispose()
        }
      }
    },
  }
}
