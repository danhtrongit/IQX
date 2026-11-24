import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

import {
  createGlowMaterial,
  createMatteMaterial,
  mergeIndexedGeometries,
} from "../types.ts"

const scratchMatrix = new THREE.Matrix4()
const scratchPos = new THREE.Vector3()
const scratchQuat = new THREE.Quaternion()
const scratchEuler = new THREE.Euler()
const scratchScale = new THREE.Vector3()
const scratchColor = new THREE.Color()

/** Semantic swatch hex palette baked into vertex colors so all non-textured props share 4 master PBR materials. */
export const DECOR_COLORS = {
  walnut: "#5e3b22",
  darkWood: "#3a2314",
  honeyWood: "#a47344",
  marbleCream: "#efe6d7",
  marbleLight: "#f8f3ea",
  obsidian: "#131d33",
  gold: "#e9b949",
  goldBright: "#ffd859",
  bronze: "#8e5a38",
  chrome: "#c7d2e0",
  navyVelvet: "#213860",
  crimsonLacquer: "#9b1b26",
  celadonCeramic: "#4d7c74",
  porcelain: "#faf7f2",
  soil: "#38251a",
  leafDark: "#24682c",
  leafMid: "#439c44",
  bambooGreen: "#55a649",
  blossomPink: "#ff9bb8",
  blossomApricot: "#ffd84d",
  pastryGold: "#d9913b",
  paperCream: "#f3ede0",
  koiOrange: "#f97316",
} as const

/**
 * Ultra-compact 5-material PBR palette using `vertexColors: true` for matte & metal surfaces.
 * Keeps ALL merged static decor & InstancedMesh groups down to ~19 total draw calls.
 */
export interface FloorDecorPalette {
  readonly matte: THREE.MeshStandardMaterial
  readonly metal: THREE.MeshStandardMaterial
  readonly redSilk: THREE.MeshStandardMaterial
  readonly warmGlow: THREE.MeshStandardMaterial
  readonly glassDome: THREE.MeshStandardMaterial
  readonly dispose: () => void
}

export function createFloorDecorPalette(): FloorDecorPalette {
  const matte = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.56,
    metalness: 0.06,
  })
  const metal = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.84,
    emissive: new THREE.Color("#452c04"),
    emissiveIntensity: 0.14,
  })
  const redSilk = new THREE.MeshStandardMaterial({
    color: "#dc2626",
    emissive: new THREE.Color("#ff8a34"),
    emissiveIntensity: 0.68,
    roughness: 0.42,
    metalness: 0.06,
  })
  const warmGlow = createGlowMaterial("#ffe4a3", 0.95)
  const glassDome = createMatteMaterial("#d9f0ff", {
    roughness: 0.14,
    metalness: 0.1,
    transparent: true,
    opacity: 0.36,
  })

  return {
    matte,
    metal,
    redSilk,
    warmGlow,
    glassDome,
    dispose: () => {
      matte.dispose()
      metal.dispose()
      redSilk.dispose()
      warmGlow.dispose()
      glassDome.dispose()
    },
  }
}

export interface MergedPartSpec {
  readonly geometry: THREE.BufferGeometry
  readonly material: THREE.Material
  readonly castShadow: boolean
  readonly receiveShadow: boolean
  readonly vertexColored: boolean
}

export interface InstancePlacement {
  readonly x: number
  readonly y?: number
  readonly z: number
  readonly rotY?: number
  readonly scale?: number
  readonly colorHex?: string
}

interface BatchBucket {
  readonly material: THREE.Material
  readonly castShadow: boolean
  readonly receiveShadow: boolean
  readonly vertexColored: boolean
  readonly geometries: THREE.BufferGeometry[]
}

function paintVertexColor(
  geom: THREE.BufferGeometry,
  colorHex: string | undefined
): void {
  const pos = geom.getAttribute("position")
  if (!pos) return
  if (colorHex) {
    scratchColor.set(colorHex)
  } else {
    scratchColor.setRGB(1, 1, 1)
  }
  const arr = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    arr[i * 3] = scratchColor.r
    arr[i * 3 + 1] = scratchColor.g
    arr[i * 3 + 2] = scratchColor.b
  }
  geom.setAttribute("color", new THREE.BufferAttribute(arr, 3))
}

function normalizeGeometry(
  raw: THREE.BufferGeometry,
  disposeRaw: boolean,
  includeVertexColors: boolean,
  colorHex?: string
): THREE.BufferGeometry {
  const geom = disposeRaw ? raw : raw.clone()
  for (const attrName of Object.keys(geom.attributes)) {
    if (
      attrName !== "position" &&
      attrName !== "normal" &&
      attrName !== "uv" &&
      !(includeVertexColors && attrName === "color")
    ) {
      geom.deleteAttribute(attrName)
    }
  }
  if (!geom.getAttribute("normal")) {
    geom.computeVertexNormals()
  }
  if (!geom.getAttribute("uv")) {
    const pos = geom.getAttribute("position")
    const count = pos ? pos.count : 0
    geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2))
  }
  if (includeVertexColors) {
    if (colorHex || !geom.getAttribute("color")) {
      paintVertexColor(geom, colorHex)
    }
  } else if (geom.getAttribute("color")) {
    geom.deleteAttribute("color")
  }
  return geom
}

/**
 * Merges static geometries per `(material, castShadow, receiveShadow)` with optional
 * baked linear vertex colors so 25+ colors collapse into 1 matte + 1 metal draw call.
 */
export class DecorMeshBatcher {
  private readonly buckets = new Map<string, BatchBucket>()

  add(
    raw: THREE.BufferGeometry,
    material: THREE.Material,
    pos: readonly [number, number, number],
    opts?: {
      color?: string
      rot?: readonly [number, number, number]
      scale?: readonly [number, number, number]
      castShadow?: boolean
      receiveShadow?: boolean
      disposeRaw?: boolean
    }
  ): void {
    const vertexColored = Boolean((material as THREE.MeshStandardMaterial).vertexColors)
    const castShadow = opts?.castShadow ?? true
    const receiveShadow = opts?.receiveShadow ?? true
    const disposeRaw = opts?.disposeRaw ?? true
    const geom = normalizeGeometry(raw, disposeRaw, vertexColored, opts?.color)

    scratchPos.set(pos[0], pos[1], pos[2])
    if (opts?.rot) {
      scratchEuler.set(opts.rot[0], opts.rot[1], opts.rot[2])
      scratchQuat.setFromEuler(scratchEuler)
    } else {
      scratchQuat.identity()
    }
    if (opts?.scale) {
      scratchScale.set(opts.scale[0], opts.scale[1], opts.scale[2])
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
        vertexColored,
        geometries: [],
      }
      this.buckets.set(key, bucket)
    }
    bucket.geometries.push(geom)
  }

  /** Appends all parts of a local sub-batcher transformed to `(wx, wy, wz)` + `rotY`. */
  addPlaced(
    specs: readonly MergedPartSpec[],
    wx: number,
    wy: number,
    wz: number,
    rotY = 0,
    scale = 1
  ): void {
    for (const spec of specs) {
      this.add(spec.geometry, spec.material, [wx, wy, wz], {
        rot: rotY !== 0 ? [0, rotY, 0] : undefined,
        scale: scale !== 1 ? [scale, scale, scale] : undefined,
        castShadow: spec.castShadow,
        receiveShadow: spec.receiveShadow,
        disposeRaw: false,
      })
    }
  }

  flushToSpecs(): MergedPartSpec[] {
    const specs: MergedPartSpec[] = []
    for (const bucket of this.buckets.values()) {
      if (bucket.geometries.length === 0) continue
      const merged = mergeIndexedGeometries(bucket.geometries, {
        includeVertexColors: bucket.vertexColored,
        disposeInputs: true,
      })
      if (!merged) continue
      merged.computeBoundingSphere()
      specs.push({
        geometry: merged,
        material: bucket.material,
        castShadow: bucket.castShadow,
        receiveShadow: bucket.receiveShadow,
        vertexColored: bucket.vertexColored,
      })
    }
    this.buckets.clear()
    return specs
  }

  flushInto(parent: THREE.Object3D, namePrefix = "floor-decor"): THREE.Mesh[] {
    const specs = this.flushToSpecs()
    const meshes: THREE.Mesh[] = []
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i]!
      const mesh = new THREE.Mesh(spec.geometry, spec.material)
      mesh.name = `${namePrefix}-${i}`
      mesh.castShadow = spec.castShadow
      mesh.receiveShadow = spec.receiveShadow
      parent.add(mesh)
      meshes.push(mesh)
    }
    return meshes
  }
}

export function disposePartSpecs(specs: readonly MergedPartSpec[]): void {
  for (const s of specs) s.geometry.dispose()
}

export function mountInstancedSpecs(
  parent: THREE.Object3D,
  name: string,
  specs: readonly MergedPartSpec[],
  placements: readonly InstancePlacement[]
): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = []
  if (placements.length === 0) return out
  for (let s = 0; s < specs.length; s += 1) {
    const spec = specs[s]!
    const inst = new THREE.InstancedMesh(
      spec.geometry,
      spec.material,
      placements.length
    )
    inst.name = `${name}-${s}`
    inst.castShadow = spec.castShadow
    inst.receiveShadow = spec.receiveShadow
    let hasPerInstanceColor = false
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i]!
      scratchPos.set(p.x, p.y ?? 0, p.z)
      if (p.rotY) {
        scratchEuler.set(0, p.rotY, 0)
        scratchQuat.setFromEuler(scratchEuler)
      } else {
        scratchQuat.identity()
      }
      const sc = p.scale ?? 1
      scratchScale.set(sc, sc, sc)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
      inst.setMatrixAt(i, scratchMatrix)
      if (p.colorHex) {
        hasPerInstanceColor = true
        scratchColor.set(p.colorHex)
        inst.setColorAt(i, scratchColor)
      }
    }
    inst.instanceMatrix.needsUpdate = true
    if (hasPerInstanceColor && inst.instanceColor) {
      inst.instanceColor.needsUpdate = true
    }
    inst.computeBoundingSphere()
    parent.add(inst)
    out.push(inst)
  }
  return out
}

// ---------- Chibi Procedural Geometry Primitives ----------

export function roundedBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  lite: boolean
): THREE.BufferGeometry {
  const sw = Math.max(0.008, w)
  const sh = Math.max(0.008, h)
  const sd = Math.max(0.008, d)
  if (lite && Math.max(sw, sh, sd) < 0.25) {
    return new THREE.BoxGeometry(sw, sh, sd)
  }
  const maxR = Math.min(sw, sh, sd) * 0.44
  const r = Math.max(0.002, Math.min(radius, maxR))
  // 1 bevel segment preserves crisp chibi rounded silhouettes at 1/4 the triangle cost of 2 segments
  return new RoundedBoxGeometry(sw, sh, sd, 1, r)
}

/** Plane geometry whose UVs map onto `[u0..u1] × [vTop..vBottom]` of a Canvas2D atlas (top-down V). */
export function createAtlasPlaneGeometry(
  w: number,
  h: number,
  u0: number,
  vTop: number,
  u1: number,
  vBottom: number
): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h)
  const uv = geo.getAttribute("uv")
  const yHi = 1 - vTop
  const yLo = 1 - vBottom
  uv.setXY(0, u0, yHi)
  uv.setXY(1, u1, yHi)
  uv.setXY(2, u0, yLo)
  uv.setXY(3, u1, yLo)
  uv.needsUpdate = true
  return geo
}

/** Octagonal pond water disc whose UVs map onto a sub-rectangle of an atlas. */
export function createAtlasCircleGeometry(
  radius: number,
  segments: number,
  u0: number,
  vTop: number,
  u1: number,
  vBottom: number
): THREE.CircleGeometry {
  const geo = new THREE.CircleGeometry(radius, segments)
  const uv = geo.getAttribute("uv")
  const yLo = 1 - vBottom
  const yHi = 1 - vTop
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    uv.setXY(i, u0 + u * (u1 - u0), yLo + v * (yHi - yLo))
  }
  uv.needsUpdate = true
  geo.rotateX(-Math.PI / 2)
  return geo
}

export function createLathePotGeometry(
  botR: number,
  topR: number,
  height: number,
  lite: boolean
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(botR * 0.88, 0),
    new THREE.Vector2(botR, height * 0.12),
    new THREE.Vector2(botR + (topR - botR) * 0.55, height * 0.5),
    new THREE.Vector2(topR * 0.96, height * 0.84),
    new THREE.Vector2(topR * 1.06, height * 0.94),
    new THREE.Vector2(topR * 1.02, height),
    new THREE.Vector2(topR * 0.88, height),
  ]
  return new THREE.LatheGeometry(pts, lite ? 8 : 12)
}

export function createSculptedLeafGeometry(lite: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.08, 0.05, 0.125, 0.16, 0.09, 0.28)
  shape.bezierCurveTo(0.055, 0.36, 0.02, 0.41, 0, 0.44)
  shape.bezierCurveTo(-0.02, 0.41, -0.055, 0.36, -0.09, 0.28)
  shape.bezierCurveTo(-0.125, 0.16, -0.08, 0.05, 0, 0)

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.012,
    bevelEnabled: false,
    curveSegments: lite ? 2 : 3,
  })

  const pos = geom.getAttribute("position")
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const t = Math.max(0, Math.min(1, y / 0.44))
    const arch = Math.sin(t * Math.PI * 0.85) * 0.05 - t * t * 0.08
    const cup = Math.abs(x) * 0.16
    pos.setZ(i, z + arch + cup)
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()
  return geom
}

export function createLatheLanternBodyGeometry(lite: boolean): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.05, 0),
    new THREE.Vector2(0.115, 0.04),
    new THREE.Vector2(0.17, 0.11),
    new THREE.Vector2(0.185, 0.175),
    new THREE.Vector2(0.17, 0.24),
    new THREE.Vector2(0.115, 0.31),
    new THREE.Vector2(0.05, 0.35),
  ]
  return new THREE.LatheGeometry(pts, lite ? 8 : 12)
}

export function createBoatIngotGeometry(lite: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-0.078, 0.044)
  shape.quadraticCurveTo(-0.052, 0, -0.032, 0)
  shape.lineTo(0.032, 0)
  shape.quadraticCurveTo(0.052, 0, 0.078, 0.044)
  shape.quadraticCurveTo(0.038, 0.026, 0, 0.03)
  shape.quadraticCurveTo(-0.038, 0.026, -0.078, 0.044)

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.052,
    bevelEnabled: !lite,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: lite ? 3 : 4,
  })
  geom.translate(0, 0, -0.026)
  return geom
}
