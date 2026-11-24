import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

import {
  createAltarClothTexture,
  createFabricSurfaceTexture,
  createMarbleSurfaceTexture,
  createMonitorScreenTexture,
  createSignTexture,
  createWoodSurfaceTexture,
  disposeProceduralTextureCaches,
  releaseCachedTexture,
  retainCachedTexture,
  type FabricSurfacePattern,
  type MarbleSurfaceTone,
  type MonitorScreenVariant,
  type WoodSurfaceTone,
} from "./textures.ts"
import {
  SHARED_RESOURCE_FLAG,
  SHARED_TEXTURE_FLAG,
  createClothMaterial,
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  mergeIndexedGeometries,
} from "./types.ts"

export interface DisposableProp {
  group: THREE.Group
  dispose: () => void
}

export interface LiveBoardProp extends DisposableProp {
  texture: THREE.CanvasTexture | THREE.Texture
  update: () => void
}

export interface PropDetailOptions {
  lite?: boolean
}

export interface OfficeDeskOptions extends PropDetailOptions {
  variant: "boss" | "staff" | "reading"
  width: number
  depth: number
  dualMonitor?: boolean
  hasMug?: boolean
  withChair?: boolean
  nameplate?: string
  highlightGold?: boolean
}

export interface BookshelfOptions extends PropDetailOptions {
  variant?: "books" | "documents" | "auto"
}

export interface LanternOptions extends PropDetailOptions {
  colorHex?: string
  lit?: boolean
  scale?: number
}

export interface RugOptions extends PropDetailOptions {
  shape?: "oval" | "rounded"
  colorHex?: string
  borderHex?: string
  borderWidth?: number
}

// ---------- Global Detail Mode & Ref-Counted Shared Resource Caches ----------

const GEO_CACHE_KEY = "__chibiGeoCacheKey"
const MAT_CACHE_KEY = "__chibiMatCacheKey"
const PART_CACHE_OWNER = "__chibiPartCacheOwner"
const CHILD_PROP_FLAG = "__chibiChildProp"
const MAX_CACHED_MATERIALS = 256
const MAX_CACHED_GEOMETRIES = 256

let globalLiteMode = false

export function setFurnitureLiteMode(lite: boolean): void {
  globalLiteMode = lite
}

export function isFurnitureLiteMode(): boolean {
  return globalLiteMode
}

function resolveLite(opts?: PropDetailOptions): boolean {
  return opts?.lite ?? globalLiteMode
}

const noopDispose = (): void => undefined

interface CachedGeometryEntry {
  geometry: THREE.BufferGeometry
  refCount: number
  partOwner?: { cache: Map<string, readonly MergedPartSpec[]>; key: string }
}

interface CachedMaterialEntry {
  material: THREE.Material
  refCount: number
  textures: THREE.Texture[]
}

const sharedGeometries = new Map<string, CachedGeometryEntry>()
const sharedMaterials = new Map<string, CachedMaterialEntry>()

interface MergedPartSpec {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
}

const chairPartCache = new Map<string, readonly MergedPartSpec[]>()
const plantPartCache = new Map<string, readonly MergedPartSpec[]>()
const lanternPartCache = new Map<string, readonly MergedPartSpec[]>()

export interface FurnitureCacheStats {
  geometries: number
  materials: number
  chairSpecs: number
  plantSpecs: number
  lanternSpecs: number
}

/** Exposes active ref-counted furniture cache sizes for diagnostics and tear-down tests. */
export function getFurnitureCacheStats(): FurnitureCacheStats {
  return {
    geometries: sharedGeometries.size,
    materials: sharedMaterials.size,
    chairSpecs: chairPartCache.size,
    plantSpecs: plantPartCache.size,
    lanternSpecs: lanternPartCache.size,
  }
}

function markSharedGeometry<T extends THREE.BufferGeometry>(
  geom: T,
  cacheKey: string
): T {
  const ud = geom.userData as Record<string, unknown>
  ud[SHARED_RESOURCE_FLAG] = true
  ud[GEO_CACHE_KEY] = cacheKey
  geom.dispose = noopDispose
  return geom
}

function markSharedMaterial<T extends THREE.Material>(
  mat: T,
  cacheKey: string
): T {
  const ud = mat.userData as Record<string, unknown>
  ud[SHARED_RESOURCE_FLAG] = true
  ud[MAT_CACHE_KEY] = cacheKey
  mat.dispose = noopDispose
  return mat
}

function isSharedResource(obj: { userData?: Record<string, unknown> }): boolean {
  return Boolean(obj.userData?.[SHARED_RESOURCE_FLAG])
}

function collectMaterialTextures(mat: THREE.Material): THREE.Texture[] {
  const std = mat as THREE.MeshStandardMaterial & {
    map?: THREE.Texture | null
    emissiveMap?: THREE.Texture | null
    roughnessMap?: THREE.Texture | null
    metalnessMap?: THREE.Texture | null
    alphaMap?: THREE.Texture | null
    bumpMap?: THREE.Texture | null
    normalMap?: THREE.Texture | null
  }
  const unique = new Set<THREE.Texture>()
  for (const tex of [
    std.map,
    std.emissiveMap,
    std.roughnessMap,
    std.metalnessMap,
    std.alphaMap,
    std.bumpMap,
    std.normalMap,
  ]) {
    if (tex) unique.add(tex)
  }
  return [...unique]
}

function getCachedGeometry(
  key: string,
  factory: () => THREE.BufferGeometry
): THREE.BufferGeometry {
  const existing = sharedGeometries.get(key)
  if (existing) return existing.geometry
  const geom = factory()
  if (sharedGeometries.size < MAX_CACHED_GEOMETRIES) {
    markSharedGeometry(geom, key)
    sharedGeometries.set(key, { geometry: geom, refCount: 0 })
  }
  return geom
}

function getCachedMaterial<T extends THREE.Material>(
  key: string,
  factory: () => T
): T {
  const existing = sharedMaterials.get(key)
  if (existing) return existing.material as T
  const mat = factory()
  if (sharedMaterials.size < MAX_CACHED_MATERIALS) {
    markSharedMaterial(mat, key)
    const textures = collectMaterialTextures(mat)
    for (const tex of textures) {
      retainCachedTexture(tex)
    }
    sharedMaterials.set(key, { material: mat, refCount: 0, textures })
  }
  return mat
}

interface RetainedSharedRefs {
  geoKeys: string[]
  matKeys: string[]
}

function retainSubtreeSharedRefs(root: THREE.Object3D): RetainedSharedRefs {
  const geoSet = new Set<string>()
  const matSet = new Set<string>()
  const visit = (node: THREE.Object3D): void => {
    if (
      node !== root &&
      (node.userData as Record<string, unknown> | undefined)?.[CHILD_PROP_FLAG]
    ) {
      return
    }
    const mesh = node as THREE.Mesh
    if (mesh.geometry) {
      const gKey = (mesh.geometry.userData as Record<string, unknown>)[
        GEO_CACHE_KEY
      ] as string | undefined
      if (gKey && sharedGeometries.has(gKey)) {
        geoSet.add(gKey)
      }
    }
    const rawMat = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined
    const mats = Array.isArray(rawMat) ? rawMat : rawMat ? [rawMat] : []
    for (const m of mats) {
      if (!m) continue
      const mKey = (m.userData as Record<string, unknown>)[MAT_CACHE_KEY] as
        | string
        | undefined
      if (mKey && sharedMaterials.has(mKey)) {
        matSet.add(mKey)
      }
    }
    for (const child of node.children) {
      visit(child)
    }
  }
  visit(root)

  const geoKeys = [...geoSet]
  const matKeys = [...matSet]
  for (const k of geoKeys) {
    const entry = sharedGeometries.get(k)
    if (entry) entry.refCount += 1
  }
  for (const k of matKeys) {
    const entry = sharedMaterials.get(k)
    if (entry) entry.refCount += 1
  }
  return { geoKeys, matKeys }
}

function releaseSubtreeSharedRefs(refs: RetainedSharedRefs): void {
  for (const k of refs.geoKeys) {
    const entry = sharedGeometries.get(k)
    if (!entry) continue
    if (entry.refCount > 0) entry.refCount -= 1
    if (entry.refCount === 0) {
      sharedGeometries.delete(k)
      if (entry.partOwner) {
        entry.partOwner.cache.delete(entry.partOwner.key)
      }
      THREE.BufferGeometry.prototype.dispose.call(entry.geometry)
    }
  }
  for (const k of refs.matKeys) {
    const entry = sharedMaterials.get(k)
    if (!entry) continue
    if (entry.refCount > 0) entry.refCount -= 1
    if (entry.refCount === 0) {
      sharedMaterials.delete(k)
      for (const tex of entry.textures) {
        releaseCachedTexture(tex)
      }
      THREE.Material.prototype.dispose.call(entry.material)
    }
  }
  pruneUnreferencedSharedCaches()
}

/** Reclaims any cached geometry/material entries with refCount === 0 (e.g. optional branch resources not mounted). */
function pruneUnreferencedSharedCaches(): void {
  for (const [k, entry] of sharedGeometries) {
    if (entry.refCount > 0) continue
    sharedGeometries.delete(k)
    if (entry.partOwner) {
      entry.partOwner.cache.delete(entry.partOwner.key)
    }
    THREE.BufferGeometry.prototype.dispose.call(entry.geometry)
  }
  for (const [k, entry] of sharedMaterials) {
    if (entry.refCount > 0) continue
    sharedMaterials.delete(k)
    for (const tex of entry.textures) {
      releaseCachedTexture(tex)
    }
    THREE.Material.prototype.dispose.call(entry.material)
  }
}

/** Explicitly releases all shared cached furniture geometries, materials, and procedural surface maps. */
export function disposeFurnitureCaches(): void {
  for (const entry of sharedGeometries.values()) {
    THREE.BufferGeometry.prototype.dispose.call(entry.geometry)
  }
  sharedGeometries.clear()

  for (const entry of sharedMaterials.values()) {
    for (const tex of entry.textures) {
      releaseCachedTexture(tex)
    }
    THREE.Material.prototype.dispose.call(entry.material)
  }
  sharedMaterials.clear()

  chairPartCache.clear()
  plantPartCache.clear()
  lanternPartCache.clear()
  disposeProceduralTextureCaches()
}

function disposeMaterialSafe(mat: THREE.Material): void {
  if (isSharedResource(mat)) return
  const textures = collectMaterialTextures(mat)
  for (const tex of textures) {
    if (!(tex.userData as Record<string, unknown>)[SHARED_TEXTURE_FLAG]) {
      tex.dispose()
    }
  }
  mat.dispose()
}

function disposePropGroup(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const visit = (node: THREE.Object3D): void => {
    if (
      node !== root &&
      (node.userData as Record<string, unknown> | undefined)?.[CHILD_PROP_FLAG]
    ) {
      return
    }
    if (node instanceof THREE.InstancedMesh) {
      node.dispose()
    }
    const mesh = node as THREE.Mesh
    if (mesh.geometry && !isSharedResource(mesh.geometry)) {
      geometries.add(mesh.geometry)
    }
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined
    if (Array.isArray(material)) {
      for (const m of material) {
        if (m && !isSharedResource(m)) materials.add(m)
      }
    } else if (material && !isSharedResource(material)) {
      materials.add(material)
    }
    for (const child of node.children) {
      visit(child)
    }
  }
  visit(root)
  for (const g of geometries) g.dispose()
  for (const m of materials) disposeMaterialSafe(m)
}

function wrapProp(
  group: THREE.Group,
  extraChildren?: readonly DisposableProp[]
): DisposableProp {
  const retained = retainSubtreeSharedRefs(group)
  let disposed = false
  return {
    group,
    dispose: () => {
      if (disposed) return
      disposed = true
      if (extraChildren) {
        for (const child of extraChildren) child.dispose()
      }
      disposePropGroup(group)
      releaseSubtreeSharedRefs(retained)
    },
  }
}

// ---------- Cached Procedural Material Helpers ----------

function matteMat(
  color: string,
  roughness = 0.72,
  metalness = 0.04,
  extra?: { transparent?: boolean; opacity?: number; side?: THREE.Side }
): THREE.MeshStandardMaterial {
  const key = `matte:${color}:${roughness}:${metalness}:${extra?.transparent ? 1 : 0}:${extra?.opacity ?? 1}:${extra?.side ?? THREE.FrontSide}`
  return getCachedMaterial(key, () =>
    createMatteMaterial(color, {
      roughness,
      metalness,
      transparent: extra?.transparent,
      opacity: extra?.opacity,
      side: extra?.side,
    })
  )
}

function clothMat(
  color: string,
  pattern: FabricSurfacePattern = "weave"
): THREE.MeshStandardMaterial {
  const key = `cloth:${pattern}:${color.toLowerCase()}`
  return getCachedMaterial(key, () => {
    const tex = createFabricSurfaceTexture(color, pattern)
    return new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: tex,
      roughness: pattern === "velvet" ? 0.84 : 0.76,
      metalness: 0.03,
    })
  })
}

function plainClothMat(color: string): THREE.MeshStandardMaterial {
  const key = `plainCloth:${color.toLowerCase()}`
  return getCachedMaterial(key, () => createClothMaterial(color))
}

function woodMat(
  tone: WoodSurfaceTone,
  roughness = 0.54
): THREE.MeshStandardMaterial {
  const key = `wood:${tone}:${roughness}`
  return getCachedMaterial(key, () => {
    const tex = createWoodSurfaceTexture(tone)
    return new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: tex,
      roughness,
      metalness: 0.05,
    })
  })
}

function marbleMat(
  tone: MarbleSurfaceTone = "cream",
  roughness = 0.28
): THREE.MeshStandardMaterial {
  const key = `marble:${tone}:${roughness}`
  return getCachedMaterial(key, () => {
    const tex = createMarbleSurfaceTexture(tone)
    return new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: tex,
      roughness,
      metalness: 0.06,
    })
  })
}

function metalMat(
  color: string,
  roughness = 0.28,
  metalness = 0.78,
  emissive?: string,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  const key = `metal:${color}:${roughness}:${metalness}:${emissive ?? ""}:${emissiveIntensity}`
  return getCachedMaterial(key, () =>
    createMetalMaterial(color, {
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
    })
  )
}

function glowMat(
  color: string,
  intensity = 0.75,
  opacity = 1
): THREE.MeshStandardMaterial {
  const key = `glow:${color}:${intensity}:${opacity}`
  return getCachedMaterial(key, () => createGlowMaterial(color, intensity, opacity))
}

function screenMat(variant: MonitorScreenVariant): THREE.MeshStandardMaterial {
  const key = `screen:${variant}`
  return getCachedMaterial(key, () => {
    const tex = createMonitorScreenTexture(variant)
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tex,
      emissiveIntensity: 0.52,
      roughness: 0.22,
      metalness: 0.08,
    })
  })
}

function altarClothMat(): THREE.MeshStandardMaterial {
  return getCachedMaterial("altarCloth", () => {
    const tex = createAltarClothTexture()
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.52,
      metalness: 0.14,
      side: THREE.DoubleSide,
    })
  })
}

// ---------- Static Sub-Mesh Merging Batcher ----------

const scratchMatrix = new THREE.Matrix4()
const scratchPos = new THREE.Vector3()
const scratchQuat = new THREE.Quaternion()
const scratchEuler = new THREE.Euler()
const scratchScale = new THREE.Vector3()

function normalizeForMerge(
  raw: THREE.BufferGeometry,
  disposeRaw: boolean
): THREE.BufferGeometry {
  const geom = disposeRaw && !isSharedResource(raw) ? raw : raw.clone()
  for (const attrName of Object.keys(geom.attributes)) {
    if (attrName !== "position" && attrName !== "normal" && attrName !== "uv") {
      geom.deleteAttribute(attrName)
    }
  }
  if (!geom.getAttribute("normal")) {
    geom.computeVertexNormals()
  }
  if (!geom.getAttribute("uv")) {
    const posAttr = geom.getAttribute("position")
    const count = posAttr ? posAttr.count : 0
    geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2))
  }
  return geom
}

interface BatchBucket {
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
  geometries: THREE.BufferGeometry[]
}

class PropMeshBatcher {
  private readonly buckets = new Map<string, BatchBucket>()

  add(
    raw: THREE.BufferGeometry,
    material: THREE.Material,
    pos: readonly [number, number, number],
    rot?: readonly [number, number, number],
    scale?: readonly [number, number, number],
    castShadow = true,
    receiveShadow = true,
    disposeRaw = true
  ): void {
    const geom = normalizeForMerge(raw, disposeRaw)
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

  flushToSpecs(
    cachePrefix?: string,
    partOwner?: { cache: Map<string, readonly MergedPartSpec[]>; key: string }
  ): MergedPartSpec[] {
    const specs: MergedPartSpec[] = []
    let idx = 0
    for (const bucket of this.buckets.values()) {
      if (bucket.geometries.length === 0) continue
      const merged = mergeIndexedGeometries(bucket.geometries, {
        disposeInputs: true,
      })

      if (merged) {
        merged.computeBoundingSphere()
        if (cachePrefix) {
          const cacheKey = `${cachePrefix}:${idx}`
          if (sharedGeometries.size < MAX_CACHED_GEOMETRIES) {
            markSharedGeometry(merged, cacheKey)
            if (partOwner) {
              ;(merged.userData as Record<string, unknown>)[PART_CACHE_OWNER] =
                partOwner
            }
            sharedGeometries.set(cacheKey, {
              geometry: merged,
              refCount: 0,
              partOwner,
            })
          }
        }
        specs.push({
          geometry: merged,
          material: bucket.material,
          castShadow: bucket.castShadow,
          receiveShadow: bucket.receiveShadow,
        })
        idx += 1
      } else {
        for (const g of bucket.geometries) {
          specs.push({
            geometry: g,
            material: bucket.material,
            castShadow: bucket.castShadow,
            receiveShadow: bucket.receiveShadow,
          })
        }
      }
    }
    this.buckets.clear()
    return specs
  }

  flushInto(parent: THREE.Object3D, cachePrefix?: string): void {
    const specs = this.flushToSpecs(cachePrefix)
    mountSpecs(parent, specs)
  }
}

function mountSpecs(
  parent: THREE.Object3D,
  specs: readonly MergedPartSpec[]
): void {
  for (const spec of specs) {
    const mesh = new THREE.Mesh(spec.geometry, spec.material)
    mesh.castShadow = spec.castShadow
    mesh.receiveShadow = spec.receiveShadow
    parent.add(mesh)
  }
}

function addDirectMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  pos: readonly [number, number, number],
  rot?: readonly [number, number, number],
  castShadow = true,
  receiveShadow = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(pos[0], pos[1], pos[2])
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2])
  mesh.castShadow = castShadow
  mesh.receiveShadow = receiveShadow
  parent.add(mesh)
  return mesh
}

// ---------- Safe Procedural Geometry Primitives ----------

function roundedBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  lite: boolean
): THREE.BufferGeometry {
  const sw = Math.max(0.008, w)
  const sh = Math.max(0.008, h)
  const sd = Math.max(0.008, d)
  const maxR = Math.min(sw, sh, sd) * 0.44
  const r = Math.max(0.002, Math.min(radius, maxR))
  return new RoundedBoxGeometry(sw, sh, sd, lite ? 1 : 2, r)
}

function remapHorizontalUVs(
  geom: THREE.BufferGeometry,
  width: number,
  depth: number
): void {
  const pos = geom.getAttribute("position")
  const uv = geom.getAttribute("uv")
  if (!pos || !uv) return
  const invW = width > 0.001 ? 1 / width : 1
  const invD = depth > 0.001 ? 1 / depth : 1
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    uv.setXY(i, x * invW + 0.5, z * invD + 0.5)
  }
  uv.needsUpdate = true
}

function extrudedRoundedRect(
  width: number,
  depth: number,
  thickness: number,
  cornerRadius: number,
  bevel: number,
  lite: boolean
): THREE.BufferGeometry {
  const w = Math.max(0.04, width)
  const d = Math.max(0.04, depth)
  const b = Math.min(bevel, thickness * 0.35, Math.min(w, d) * 0.16)
  const iw = Math.max(0.02, w - b * 2)
  const id = Math.max(0.02, d - b * 2)
  const r = Math.min(cornerRadius, iw * 0.45, id * 0.45)

  const hw = iw / 2
  const hd = id / 2
  const shape = new THREE.Shape()
  shape.moveTo(-hw + r, -hd)
  shape.lineTo(hw - r, -hd)
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r)
  shape.lineTo(hw, hd - r)
  shape.quadraticCurveTo(hw, hd, hw - r, hd)
  shape.lineTo(-hw + r, hd)
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r)
  shape.lineTo(-hw, -hd + r)
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd)

  const extrudeDepth = Math.max(0.002, thickness - b * 2)
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: lite ? 1 : 3,
    curveSegments: lite ? 6 : 12,
  })
  geom.rotateX(-Math.PI / 2)
  geom.translate(0, -extrudeDepth / 2, 0)
  remapHorizontalUVs(geom, w, d)
  return geom
}

function extrudedEllipse(
  width: number,
  depth: number,
  thickness: number,
  bevel: number,
  lite: boolean
): THREE.BufferGeometry {
  const w = Math.max(0.06, width)
  const d = Math.max(0.06, depth)
  const b = Math.min(bevel, thickness * 0.35, Math.min(w, d) * 0.14)
  const rx = Math.max(0.02, w / 2 - b)
  const rz = Math.max(0.02, d / 2 - b)

  const shape = new THREE.Shape()
  shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0)

  const extrudeDepth = Math.max(0.002, thickness - b * 2)
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: lite ? 1 : 2,
    curveSegments: lite ? 18 : 36,
  })
  geom.rotateX(-Math.PI / 2)
  geom.translate(0, -extrudeDepth / 2, 0)
  remapHorizontalUVs(geom, w, d)
  return geom
}

function extrudedStadium(
  width: number,
  depth: number,
  thickness: number,
  bevel: number,
  lite: boolean
): THREE.BufferGeometry {
  const w = Math.max(depth + 0.04, width)
  const d = Math.max(0.2, depth)
  const b = Math.min(bevel, thickness * 0.36, d * 0.12)
  const r = Math.max(0.04, d / 2 - b)
  const halfStraight = Math.max(0.01, (w - d) / 2)

  const shape = new THREE.Shape()
  shape.absarc(-halfStraight, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false)
  shape.absarc(halfStraight, 0, r, -Math.PI / 2, Math.PI / 2, false)
  shape.closePath()

  const extrudeDepth = Math.max(0.004, thickness - b * 2)
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: lite ? 1 : 3,
    curveSegments: lite ? 10 : 20,
  })
  geom.rotateX(-Math.PI / 2)
  geom.translate(0, -extrudeDepth / 2, 0)
  remapHorizontalUVs(geom, w, d)
  return geom
}

function createSculptedLeafGeometry(lite: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.09, 0.05, 0.145, 0.16, 0.105, 0.29)
  shape.bezierCurveTo(0.07, 0.37, 0.025, 0.43, 0, 0.46)
  shape.bezierCurveTo(-0.025, 0.43, -0.07, 0.37, -0.105, 0.29)
  shape.bezierCurveTo(-0.145, 0.16, -0.09, 0.05, 0, 0)

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 1,
    curveSegments: lite ? 4 : 6,
  })

  // Gently arch the leaf blade backward and cup along its midrib for organic botanical shape
  const pos = geom.getAttribute("position")
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const t = Math.max(0, Math.min(1, y / 0.46))
    const arch = Math.sin(t * Math.PI * 0.85) * 0.055 - t * t * 0.09
    const cup = Math.abs(x) * 0.18
    pos.setZ(i, z + arch + cup)
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()
  return geom
}

function createLathePotGeometry(
  botR: number,
  topR: number,
  height: number,
  lite: boolean
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(botR * 0.86, 0),
    new THREE.Vector2(botR, height * 0.08),
    new THREE.Vector2(botR + (topR - botR) * 0.48, height * 0.42),
    new THREE.Vector2(topR * 0.96, height * 0.8),
    new THREE.Vector2(topR * 0.92, height * 0.87),
    new THREE.Vector2(topR * 1.07, height * 0.93),
    new THREE.Vector2(topR * 1.06, height),
    new THREE.Vector2(topR * 0.9, height),
    new THREE.Vector2(topR * 0.87, height * 0.9),
  ]
  return new THREE.LatheGeometry(pts, lite ? 12 : 22)
}

function createLatheMugGeometry(
  radius: number,
  height: number,
  lite: boolean
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(radius * 0.78, 0),
    new THREE.Vector2(radius * 0.88, height * 0.14),
    new THREE.Vector2(radius, height * 0.65),
    new THREE.Vector2(radius * 1.03, height * 0.94),
    new THREE.Vector2(radius * 0.96, height),
    new THREE.Vector2(radius * 0.84, height),
    new THREE.Vector2(radius * 0.82, height * 0.86),
  ]
  return new THREE.LatheGeometry(pts, lite ? 10 : 18)
}

function createLatheUrnGeometry(lite: boolean): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(0.11, 0),
    new THREE.Vector2(0.125, 0.03),
    new THREE.Vector2(0.095, 0.06),
    new THREE.Vector2(0.165, 0.12),
    new THREE.Vector2(0.185, 0.18),
    new THREE.Vector2(0.15, 0.23),
    new THREE.Vector2(0.195, 0.26),
    new THREE.Vector2(0.185, 0.28),
    new THREE.Vector2(0.15, 0.28),
    new THREE.Vector2(0.14, 0.23),
  ]
  return new THREE.LatheGeometry(pts, lite ? 12 : 22)
}

function createLathePedestalTrayGeometry(
  topR: number,
  height: number,
  lite: boolean
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(topR * 0.56, 0),
    new THREE.Vector2(topR * 0.48, height * 0.22),
    new THREE.Vector2(topR * 0.28, height * 0.46),
    new THREE.Vector2(topR * 0.34, height * 0.68),
    new THREE.Vector2(topR, height * 0.9),
    new THREE.Vector2(topR * 1.04, height),
    new THREE.Vector2(topR * 0.92, height),
    new THREE.Vector2(topR * 0.8, height * 0.82),
    new THREE.Vector2(0.002, height * 0.8),
  ]
  return new THREE.LatheGeometry(pts, lite ? 12 : 20)
}

function createLatheLanternBodyGeometry(lite: boolean): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.055, 0),
    new THREE.Vector2(0.11, 0.03),
    new THREE.Vector2(0.165, 0.1),
    new THREE.Vector2(0.19, 0.18),
    new THREE.Vector2(0.165, 0.26),
    new THREE.Vector2(0.11, 0.33),
    new THREE.Vector2(0.055, 0.36),
  ]
  return new THREE.LatheGeometry(pts, lite ? 12 : 20)
}

function createBoatIngotGeometry(lite: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-0.08, 0.045)
  shape.quadraticCurveTo(-0.055, 0, -0.035, 0)
  shape.lineTo(0.035, 0)
  shape.quadraticCurveTo(0.055, 0, 0.08, 0.045)
  shape.quadraticCurveTo(0.04, 0.028, 0, 0.032)
  shape.quadraticCurveTo(-0.04, 0.028, -0.08, 0.045)

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.056,
    bevelEnabled: true,
    bevelThickness: 0.009,
    bevelSize: 0.008,
    bevelSegments: lite ? 1 : 2,
    curveSegments: lite ? 5 : 10,
  })
  geom.translate(0, 0, -0.028)
  return geom
}

function createMugParts(
  batcher: PropMeshBatcher,
  pos: readonly [number, number, number],
  opts: {
    radius?: number
    height?: number
    bodyMat: THREE.Material
    rimMat?: THREE.Material
    coffeeMat?: THREE.Material
    handleYaw?: number
    lite: boolean
  }
): void {
  const r = opts.radius ?? 0.048
  const h = opts.height ?? 0.094
  const [mx, my, mz] = pos
  const yaw = opts.handleYaw ?? 0.35

  batcher.add(createLatheMugGeometry(r, h, opts.lite), opts.bodyMat, [
    mx,
    my,
    mz,
  ])

  // Curved D-handle on the mug side
  const hx = mx + Math.cos(yaw) * (r * 1.02)
  const hz = mz - Math.sin(yaw) * (r * 1.02)
  batcher.add(
    new THREE.TorusGeometry(
      h * 0.29,
      r * 0.14,
      opts.lite ? 6 : 8,
      opts.lite ? 8 : 14,
      Math.PI
    ),
    opts.bodyMat,
    [hx, my + h * 0.52, hz],
    [0, yaw, -Math.PI / 2]
  )

  if (opts.rimMat) {
    batcher.add(
      new THREE.TorusGeometry(r * 0.96, r * 0.11, 6, opts.lite ? 10 : 16),
      opts.rimMat,
      [mx, my + h - 0.003, mz],
      [Math.PI / 2, 0, 0]
    )
  }

  if (opts.coffeeMat) {
    batcher.add(
      new THREE.CylinderGeometry(
        r * 0.82,
        r * 0.82,
        0.008,
        opts.lite ? 8 : 14
      ),
      opts.coffeeMat,
      [mx, my + h * 0.86, mz],
      undefined,
      undefined,
      false
    )
  }
}

// ---------- Shared Ergonomic Swivel Chair (Merged per Material) ----------

function getSwivelChairSpecs(
  colorHex: string,
  lite: boolean
): readonly MergedPartSpec[] {
  const key = `chair:${colorHex.toLowerCase()}:${lite ? "lite" : "hi"}`
  const cached = chairPartCache.get(key)
  if (cached) return cached

  const batcher = new PropMeshBatcher()
  const fabricMat = clothMat(colorHex, "weave")
  const darkMat = matteMat("#182032", 0.52, 0.24)
  const chromeMat = metalMat("#a4b3c6", 0.24, 0.84)
  const rubberMat = matteMat("#101522", 0.78, 0.1)

  const cylSegs = lite ? 8 : 14

  // Pneumatic gas-lift cylinder + telescopic shroud + hub
  batcher.add(
    new THREE.CylinderGeometry(0.032, 0.036, 0.22, cylSegs),
    chromeMat,
    [0, 0.19, 0]
  )
  batcher.add(
    new THREE.CylinderGeometry(0.055, 0.068, 0.09, cylSegs),
    darkMat,
    [0, 0.1, 0]
  )
  batcher.add(
    roundedBox(0.18, 0.055, 0.2, 0.018, lite),
    darkMat,
    [0, 0.3, -0.02]
  )

  // 5-star sculpted spider legs + rolling casters
  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    batcher.add(
      roundedBox(0.24, 0.036, 0.044, 0.012, lite),
      darkMat,
      [cos * 0.13, 0.072, sin * 0.13],
      [0, -a, -0.14]
    )
    const tipX = cos * 0.24
    const tipZ = sin * 0.24
    // Caster fork + wheel
    batcher.add(
      new THREE.CylinderGeometry(0.014, 0.014, 0.035, 6),
      chromeMat,
      [tipX, 0.044, tipZ]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.025, 0.025, 0.03, lite ? 7 : 12),
      rubberMat,
      [tipX, 0.025, tipZ],
      [Math.PI / 2, 0, -a]
    )
  }

  // Contoured seat pan + plush bevelled cushion
  batcher.add(
    roundedBox(0.45, 0.036, 0.43, 0.014, lite),
    darkMat,
    [0, 0.325, 0.01]
  )
  batcher.add(
    roundedBox(0.47, 0.088, 0.45, 0.036, lite),
    fabricMat,
    [0, 0.372, 0.01]
  )

  // Rear curved spine bracket connecting under-seat to backrest
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.31, -0.06),
    new THREE.Vector3(0, 0.32, -0.22),
    new THREE.Vector3(0, 0.48, -0.255),
    new THREE.Vector3(0, 0.64, -0.27),
  ])
  batcher.add(
    new THREE.TubeGeometry(spineCurve, lite ? 6 : 12, 0.024, lite ? 5 : 8, false),
    darkMat,
    [0, 0, 0]
  )

  // Ergonomic contoured backrest + lumbar bolster + rounded headrest crest
  batcher.add(
    roundedBox(0.43, 0.41, 0.082, 0.034, lite),
    fabricMat,
    [0, 0.61, -0.21],
    [-0.12, 0, 0]
  )
  batcher.add(
    roundedBox(0.39, 0.11, 0.045, 0.02, lite),
    fabricMat,
    [0, 0.49, -0.175],
    [-0.08, 0, 0]
  )
  batcher.add(
    new THREE.CapsuleGeometry(0.044, 0.31, lite ? 4 : 6, lite ? 8 : 12),
    fabricMat,
    [0, 0.82, -0.235],
    [0, 0, Math.PI / 2]
  )

  // Sculpted L-shaped padded armrests
  for (const side of [-1, 1] as const) {
    const ax = side * 0.255
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.18, 0.33, -0.04),
      new THREE.Vector3(ax, 0.35, -0.04),
      new THREE.Vector3(ax, 0.51, -0.04),
    ])
    batcher.add(
      new THREE.TubeGeometry(armCurve, lite ? 6 : 10, 0.017, lite ? 5 : 8, false),
      darkMat,
      [0, 0, 0]
    )
    batcher.add(
      roundedBox(0.062, 0.034, 0.29, 0.014, lite),
      darkMat,
      [ax, 0.525, -0.01]
    )
  }

  const specs = batcher.flushToSpecs(key, { cache: chairPartCache, key })
  chairPartCache.set(key, specs)
  return specs
}

function mountSwivelChair(
  parent: THREE.Object3D,
  colorHex: string,
  pos: readonly [number, number, number],
  rotY: number,
  lite: boolean
): void {
  const chair = new THREE.Group()
  chair.position.set(pos[0], pos[1], pos[2])
  chair.rotation.y = rotY
  mountSpecs(chair, getSwivelChairSpecs(colorHex, lite))
  parent.add(chair)
}

// ---------- 1. Potted Plant (Sculpted Pot, Soil, Curved Stems & Layered Leaves) ----------

function getPottedPlantSpecs(
  size: "tall" | "small",
  lite: boolean
): readonly MergedPartSpec[] {
  const key = `plant:${size}:${lite ? "lite" : "hi"}`
  const cached = plantPartCache.get(key)
  if (cached) return cached

  const isTall = size === "tall"
  const batcher = new PropMeshBatcher()

  const potMat = matteMat(isTall ? "#2c3442" : "#be6b47", 0.52, 0.08)
  const potAccentMat = isTall
    ? metalMat("#d9a94c", 0.32, 0.72)
    : matteMat("#efe2cf", 0.42, 0.05)
  const soilMat = matteMat("#3a271c", 0.94, 0.02)
  const pebbleMat = matteMat("#9e9486", 0.78, 0.04)
  const trunkMat = woodMat("walnut", 0.78)
  const leafDark = matteMat("#256b2b", 0.56, 0.04)
  const leafMid = matteMat("#419c42", 0.52, 0.04)
  const leafLight = matteMat("#6cc258", 0.48, 0.04)
  const budMat = matteMat("#f6ecd6", 0.46, 0.04)

  const potH = isTall ? 0.44 : 0.3
  const potTopR = isTall ? 0.25 : 0.2
  const potBotR = isTall ? 0.175 : 0.135

  // Drip saucer + lathe-turned ribbed planter pot with rolled lip
  batcher.add(
    new THREE.CylinderGeometry(
      potBotR * 1.18,
      potBotR * 1.06,
      0.028,
      lite ? 10 : 18
    ),
    potMat,
    [0, 0.014, 0]
  )
  batcher.add(
    createLathePotGeometry(potBotR, potTopR, potH - 0.02, lite),
    potMat,
    [0, 0.02, 0]
  )
  // Decorative band below rim
  batcher.add(
    new THREE.TorusGeometry(
      potTopR * 0.96,
      0.012,
      6,
      lite ? 12 : 20
    ),
    potAccentMat,
    [0, potH * 0.85, 0],
    [Math.PI / 2, 0, 0]
  )

  // Gently mounded rich dark humus soil + decorative river pebbles
  batcher.add(
    new THREE.SphereGeometry(
      potTopR * 0.88,
      lite ? 10 : 16,
      lite ? 6 : 10,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    ),
    soilMat,
    [0, potH - 0.04, 0],
    undefined,
    [1, 0.26, 1],
    false
  )
  if (!lite) {
    for (let p = 0; p < 5; p += 1) {
      const a = p * 1.28 + 0.4
      const rr = potTopR * (0.42 + (p % 2) * 0.24)
      batcher.add(
        new THREE.SphereGeometry(0.022 + (p % 3) * 0.005, 7, 6),
        pebbleMat,
        [Math.cos(a) * rr, potH - 0.012, Math.sin(a) * rr],
        [0.2, a, 0.1],
        [1.2, 0.65, 0.95],
        false
      )
    }
  }

  const leafGeom = createSculptedLeafGeometry(lite)
  const leafMats = [leafDark, leafMid, leafLight] as const

  const addLeafRosette = (
    cx: number,
    cy: number,
    cz: number,
    scaleBase: number,
    tiers: readonly { count: number; pitch: number; yOff: number; matIdx: 0 | 1 | 2; scale: number }[]
  ): void => {
    for (let ti = 0; ti < tiers.length; ti += 1) {
      const tier = tiers[ti]!
      const count = lite ? Math.max(3, Math.ceil(tier.count * 0.6)) : tier.count
      for (let i = 0; i < count; i += 1) {
        const yaw = (i * Math.PI * 2) / count + ti * 0.58 + cx * 2.1
        const s = scaleBase * tier.scale * (0.9 + ((i * 3 + ti) % 3) * 0.09)
        batcher.add(
          leafGeom,
          leafMats[tier.matIdx],
          [cx, cy + tier.yOff, cz],
          [tier.pitch, yaw, 0],
          [s, s, s],
          true,
          true,
          false
        )
      }
    }
  }

  if (isTall) {
    // 3 gracefully curved woody branches rising from the pot into a multi-tier lush canopy
    const branches: readonly {
      pts: readonly [number, number, number][]
      r: number
      crownScale: number
    }[] = [
      {
        pts: [
          [0, potH - 0.02, 0],
          [-0.03, potH + 0.34, 0.02],
          [0.04, potH + 0.68, -0.02],
          [0, potH + 0.96, 0],
        ],
        r: 0.038,
        crownScale: 1.0,
      },
      {
        pts: [
          [0.01, potH + 0.18, 0.01],
          [-0.12, potH + 0.44, 0.08],
          [-0.2, potH + 0.7, 0.12],
        ],
        r: 0.024,
        crownScale: 0.82,
      },
      {
        pts: [
          [-0.01, potH + 0.24, -0.01],
          [0.14, potH + 0.52, -0.08],
          [0.21, potH + 0.78, -0.11],
        ],
        r: 0.023,
        crownScale: 0.84,
      },
    ]

    for (const br of branches) {
      const curve = new THREE.CatmullRomCurve3(
        br.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
      )
      batcher.add(
        new THREE.TubeGeometry(curve, lite ? 6 : 12, br.r, lite ? 5 : 8, false),
        trunkMat,
        [0, 0, 0]
      )
      const tip = br.pts[br.pts.length - 1]!
      addLeafRosette(tip[0], tip[1], tip[2], br.crownScale, [
        { count: 6, pitch: 1.08, yOff: -0.04, matIdx: 0, scale: 0.88 },
        { count: 5, pitch: 0.72, yOff: 0.04, matIdx: 1, scale: 0.8 },
        { count: 4, pitch: 0.36, yOff: 0.1, matIdx: 2, scale: 0.62 },
      ])
    }
  } else {
    // Cozy tabletop/corner tropical foliage rosette with arching leaves & twin buds
    addLeafRosette(0, potH - 0.01, 0, 0.78, [
      { count: 7, pitch: 1.04, yOff: 0.0, matIdx: 0, scale: 0.96 },
      { count: 6, pitch: 0.64, yOff: 0.04, matIdx: 1, scale: 0.84 },
      { count: 4, pitch: 0.3, yOff: 0.07, matIdx: 2, scale: 0.64 },
    ])
    if (!lite) {
      for (const [bx, bz, tilt] of [
        [0.05, 0.03, 0.24],
        [-0.05, -0.04, -0.22],
      ] as const) {
        batcher.add(
          new THREE.CylinderGeometry(0.008, 0.01, 0.24, 6),
          leafMid,
          [bx, potH + 0.11, bz],
          [tilt, 0, -tilt * 0.6]
        )
        batcher.add(
          new THREE.CapsuleGeometry(0.022, 0.045, 4, 8),
          budMat,
          [bx * 1.4, potH + 0.23, bz * 1.4],
          [tilt, 0, 0]
        )
      }
    }
  }

  leafGeom.dispose()
  const specs = batcher.flushToSpecs(key, { cache: plantPartCache, key })
  plantPartCache.set(key, specs)
  return specs
}

export interface InstancedPropTransform {
  x: number
  y?: number
  z: number
  rotY?: number
  scale?: number
}

/**
 * Renders multiple identical potted plants using `InstancedMesh` (one draw call per material
 * bucket across all instances) with full ref-counted shared cache cleanup.
 */
export function createInstancedPottedPlants(
  size: "tall" | "small",
  transforms: readonly InstancedPropTransform[],
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = `prop-plant-${size}-instanced`
  if (transforms.length === 0) {
    return wrapProp(group)
  }
  const specs = getPottedPlantSpecs(size, lite)
  for (const spec of specs) {
    const inst = new THREE.InstancedMesh(
      spec.geometry,
      spec.material,
      transforms.length
    )
    inst.castShadow = spec.castShadow
    inst.receiveShadow = spec.receiveShadow
    for (let i = 0; i < transforms.length; i += 1) {
      const tr = transforms[i]!
      scratchPos.set(tr.x, tr.y ?? 0, tr.z)
      if (tr.rotY) {
        scratchEuler.set(0, tr.rotY, 0)
        scratchQuat.setFromEuler(scratchEuler)
      } else {
        scratchQuat.identity()
      }
      const sc = tr.scale ?? 1
      scratchScale.set(sc, sc, sc)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
      inst.setMatrixAt(i, scratchMatrix)
    }
    inst.instanceMatrix.needsUpdate = true
    inst.computeBoundingSphere()
    group.add(inst)
  }
  return wrapProp(group)
}

export function createPottedPlant(
  size: "tall" | "small",
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = `prop-plant-${size}`
  mountSpecs(group, getPottedPlantSpecs(size, lite))
  return wrapProp(group)
}

// ---------- 2. Plush Cozy Sofa (Rounded Cushions, Piping Seams, Turned Legs) ----------

export function createSofa(
  width: number,
  depth: number,
  colorHex = "#24365e",
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-sofa"
  const batcher = new PropMeshBatcher()

  const fabricMat = clothMat(colorHex, "weave")
  const seamMat = matteMat("#141e36", 0.82, 0.04)
  const woodLegMat = woodMat("walnut", 0.56)
  const brassMat = metalMat("#e4b44a", 0.26, 0.82)
  const pillowGoldMat = clothMat("#e9b949", "weave")
  const pillowCreamMat = clothMat("#f3ead8", "weave")

  const seatH = 0.42
  const armW = Math.min(0.24, width * 0.13)
  const backD = Math.min(0.24, depth * 0.28)
  const innerW = Math.max(0.36, width - armW * 2)

  // Splayed tapered wooden legs with brass foot ferrules
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const lx = sx * (width / 2 - 0.13)
      const lz = sz * (depth / 2 - 0.12)
      batcher.add(
        new THREE.CylinderGeometry(0.036, 0.022, 0.14, lite ? 7 : 12),
        woodLegMat,
        [lx, 0.07, lz],
        [sz * 0.1, 0, -sx * 0.1]
      )
      batcher.add(
        new THREE.CylinderGeometry(0.025, 0.023, 0.032, lite ? 7 : 10),
        brassMat,
        [lx + sx * 0.006, 0.016, lz + sz * 0.006]
      )
    }
  }

  // Bevelled lower timber trim skirt & upholstered deck base
  batcher.add(
    roundedBox(width - 0.04, 0.05, depth - 0.04, 0.015, lite),
    woodLegMat,
    [0, 0.15, 0]
  )
  batcher.add(
    roundedBox(width, 0.14, depth, 0.036, lite),
    seamMat,
    [0, 0.23, 0]
  )

  // Plump rounded seat cushions with visible piped seams
  const count = width > 2.35 ? 3 : 2
  const cushGap = 0.024
  const cushW = Math.max(0.2, (innerW - cushGap * (count - 1)) / count)
  const cushD = Math.max(0.24, depth - backD * 0.85)
  for (let i = 0; i < count; i += 1) {
    const cx = -innerW / 2 + cushW / 2 + i * (cushW + cushGap)
    batcher.add(
      roundedBox(cushW, 0.175, cushD, 0.052, lite),
      fabricMat,
      [cx, seatH - 0.035, backD * 0.34]
    )
    // Recessed welt seam line between cushions
    if (i < count - 1) {
      batcher.add(
        roundedBox(0.014, 0.12, cushD * 0.9, 0.005, lite),
        seamMat,
        [cx + cushW / 2 + cushGap / 2, seatH - 0.045, backD * 0.34],
        undefined,
        undefined,
        false
      )
    }
  }

  // Upholstered rear shell + individual contoured back cushions + tufted dimples
  batcher.add(
    roundedBox(width - 0.02, 0.58, backD * 0.72, 0.045, lite),
    fabricMat,
    [0, 0.56, -depth / 2 + backD * 0.36]
  )
  for (let i = 0; i < count; i += 1) {
    const cx = -innerW / 2 + cushW / 2 + i * (cushW + cushGap)
    batcher.add(
      roundedBox(cushW - 0.01, 0.42, backD * 0.76, 0.058, lite),
      fabricMat,
      [cx, 0.65, -depth / 2 + backD * 0.72],
      [-0.1, 0, 0]
    )
    if (!lite) {
      for (const bx of [-cushW * 0.22, cushW * 0.22]) {
        batcher.add(
          new THREE.SphereGeometry(0.018, 8, 6),
          seamMat,
          [cx + bx, 0.66, -depth / 2 + backD * 1.07],
          undefined,
          [1, 1, 0.45],
          false
        )
      }
    }
  }

  // Soft curved bolster armrests
  for (const side of [-1, 1] as const) {
    const ax = side * (width / 2 - armW / 2)
    batcher.add(
      roundedBox(armW, 0.44, depth - 0.02, 0.052, lite),
      fabricMat,
      [ax, 0.44, 0.01]
    )
    batcher.add(
      new THREE.CapsuleGeometry(
        armW * 0.48,
        Math.max(0.12, depth - armW * 1.05),
        lite ? 5 : 8,
        lite ? 8 : 14
      ),
      fabricMat,
      [ax, 0.65, 0.01],
      [Math.PI / 2, 0, 0]
    )
  }

  // Plump rounded accent throw pillows
  batcher.add(
    roundedBox(0.28, 0.27, 0.12, 0.054, lite),
    pillowGoldMat,
    [-innerW * 0.34, 0.58, -depth / 2 + backD + 0.09],
    [-0.22, 0.34, 0.15]
  )
  batcher.add(
    roundedBox(0.26, 0.25, 0.115, 0.052, lite),
    pillowCreamMat,
    [innerW * 0.34, 0.57, -depth / 2 + backD + 0.09],
    [-0.18, -0.36, -0.14]
  )

  batcher.flushInto(group)
  return wrapProp(group)
}

// ---------- 3. Coffee Table (Marble Top, Lower Shelf, Mugs & Magazines) ----------

export function createCoffeeTable(
  width: number,
  depth: number,
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-coffee-table"
  const batcher = new PropMeshBatcher()

  const walnutMat = woodMat("walnut", 0.52)
  const topMarbleMat = marbleMat("cream", 0.24)
  const brassMat = metalMat("#e4b44a", 0.26, 0.82)
  const cupMat = matteMat("#faf8f5", 0.22, 0.06)
  const cupRimMat = matteMat("#d97706", 0.3, 0.12)
  const coffeeMat = matteMat("#3f1f0e", 0.28, 0.06)
  const magBlueMat = matteMat("#1d4ed8", 0.48, 0.05)
  const magCreamMat = matteMat("#f5efe2", 0.6, 0.02)
  const leafSmallMat = matteMat("#4aa449", 0.52, 0.04)

  const tableH = 0.46

  // Splayed tapered walnut legs with brass tips
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const lx = sx * (width / 2 - 0.14)
      const lz = sz * (depth / 2 - 0.12)
      batcher.add(
        new THREE.CylinderGeometry(0.032, 0.02, tableH - 0.05, lite ? 8 : 12),
        walnutMat,
        [lx, (tableH - 0.05) / 2, lz],
        [sz * 0.08, 0, -sx * 0.08]
      )
      batcher.add(
        new THREE.CylinderGeometry(0.023, 0.021, 0.04, lite ? 7 : 10),
        brassMat,
        [lx + sx * 0.012, 0.02, lz + sz * 0.012]
      )
    }
  }

  // Lower slatted/bevelled magazine shelf
  batcher.add(
    roundedBox(width * 0.84, 0.026, depth * 0.72, 0.01, lite),
    walnutMat,
    [0, 0.15, 0]
  )

  // Chamfered walnut apron frame + thick bevelled veined marble tabletop
  batcher.add(
    roundedBox(width * 0.94, 0.052, depth * 0.91, 0.018, lite),
    walnutMat,
    [0, tableH - 0.045, 0]
  )
  batcher.add(
    roundedBox(width, 0.052, depth, 0.022, lite),
    topMarbleMat,
    [0, tableH, 0]
  )

  const surfaceY = tableH + 0.026

  // Sculpted ceramic cups on saucers with handles & coffee inside
  for (const [cx, cz, yaw] of [
    [-width * 0.23, depth * 0.09, 0.4],
    [width * 0.2, -depth * 0.11, -2.5],
  ] as const) {
    batcher.add(
      new THREE.CylinderGeometry(0.086, 0.064, 0.014, lite ? 10 : 16),
      cupMat,
      [cx, surfaceY + 0.007, cz]
    )
    createMugParts(batcher, [cx, surfaceY + 0.012, cz], {
      radius: 0.048,
      height: 0.078,
      bodyMat: cupMat,
      rimMat: cupRimMat,
      coffeeMat,
      handleYaw: yaw,
      lite,
    })
  }

  // Layered finance magazine stack with paper pages & gold cover stripe
  batcher.add(
    roundedBox(0.3, 0.018, 0.21, 0.006, lite),
    magCreamMat,
    [0.01, surfaceY + 0.009, 0.04],
    [0, 0.06, 0]
  )
  batcher.add(
    roundedBox(0.28, 0.016, 0.2, 0.005, lite),
    magBlueMat,
    [-0.01, surfaceY + 0.025, 0.04],
    [0, 0.2, 0]
  )
  batcher.add(
    roundedBox(0.2, 0.004, 0.032, 0.001, lite),
    brassMat,
    [-0.01, surfaceY + 0.034, 0.005],
    [0, 0.2, 0],
    undefined,
    false
  )

  // Tiny ceramic succulent centerpiece
  if (!lite) {
    const sx = width * 0.31
    const sz = depth * 0.18
    batcher.add(
      new THREE.CylinderGeometry(0.052, 0.04, 0.055, 10),
      cupMat,
      [sx, surfaceY + 0.027, sz]
    )
    const leafGeom = createSculptedLeafGeometry(true)
    for (let i = 0; i < 5; i += 1) {
      batcher.add(
        leafGeom,
        leafSmallMat,
        [sx, surfaceY + 0.052, sz],
        [0.85, (i * Math.PI * 2) / 5, 0],
        [0.24, 0.22, 0.24],
        false,
        true,
        false
      )
    }
  }

  batcher.flushInto(group)
  return wrapProp(group)
}

// ---------- 4. Pantry / Coffee Corner Counter ----------

export function createPantryCounter(
  width: number,
  depth: number,
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-pantry-counter"
  const batcher = new PropMeshBatcher()

  const cabinetMat = woodMat("walnut", 0.56)
  const doorMat = matteMat("#54361d", 0.6, 0.05)
  const kickMat = matteMat("#251a12", 0.72, 0.08)
  const topMarbleMat = marbleMat("white_gold", 0.24)
  const steelMat = metalMat("#d4dde8", 0.22, 0.86)
  const darkSteelMat = metalMat("#2d394c", 0.32, 0.74)
  const ledMat = glowMat("#34c38f", 1.2)
  const mugMat = matteMat("#faf8f5", 0.24, 0.06)
  const mugAccentMat = matteMat("#c0392b", 0.32, 0.08)
  const coffeeMat = matteMat("#3f1f0e", 0.34, 0.04)
  const goldMat = metalMat("#e9b949", 0.24, 0.82)
  const glassJarMat = matteMat("#d8eefc", 0.14, 0.1, {
    transparent: true,
    opacity: 0.42,
  })

  const h = 0.92

  // Recessed toe-kick plinth + bevelled walnut cabinet carcass
  batcher.add(
    roundedBox(width - 0.04, 0.08, depth - 0.08, 0.01, lite),
    kickMat,
    [0, 0.04, -0.02]
  )
  batcher.add(
    roundedBox(width, h - 0.08, depth, 0.022, lite),
    cabinetMat,
    [0, 0.08 + (h - 0.08) / 2, 0]
  )

  // Bevelled marble countertop + rear backsplash lip
  batcher.add(
    roundedBox(width + 0.08, 0.068, depth + 0.08, 0.022, lite),
    topMarbleMat,
    [0, h + 0.034, 0]
  )
  batcher.add(
    roundedBox(width + 0.06, 0.09, 0.036, 0.01, lite),
    topMarbleMat,
    [0, h + 0.09, -depth / 2 - 0.012]
  )

  // Shaker-style framed cabinet doors & turned brass knobs
  const doors = Math.max(2, Math.round(width / 0.72))
  const spanW = width - 0.14
  const doorW = spanW / doors - 0.036
  for (let i = 0; i < doors; i += 1) {
    const dx = -spanW / 2 + (i + 0.5) * (spanW / doors)
    batcher.add(
      roundedBox(doorW, h - 0.2, 0.028, 0.01, lite),
      doorMat,
      [dx, 0.08 + (h - 0.08) / 2, depth / 2 + 0.008]
    )
    batcher.add(
      roundedBox(doorW * 0.74, h - 0.34, 0.018, 0.008, lite),
      cabinetMat,
      [dx, 0.08 + (h - 0.08) / 2, depth / 2 + 0.018]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.012, 0.01, 0.024, 8),
      goldMat,
      [dx + doorW * 0.3, h * 0.68, depth / 2 + 0.028],
      [Math.PI / 2, 0, 0]
    )
    batcher.add(
      new THREE.SphereGeometry(0.022, lite ? 7 : 10, lite ? 6 : 8),
      goldMat,
      [dx + doorW * 0.3, h * 0.68, depth / 2 + 0.042]
    )
  }

  const counterY = h + 0.068

  // Detailed Barista Espresso Machine (left)
  const ex = -width * 0.25
  const ez = -depth * 0.04
  batcher.add(
    roundedBox(0.44, 0.38, 0.32, 0.034, lite),
    steelMat,
    [ex, counterY + 0.22, ez]
  )
  // Drip tray & dark splash panel
  batcher.add(
    roundedBox(0.42, 0.065, 0.22, 0.016, lite),
    darkSteelMat,
    [ex, counterY + 0.032, ez + 0.1]
  )
  // Overhanging chrome brew group-head + portafilter handle
  batcher.add(
    roundedBox(0.4, 0.11, 0.14, 0.02, lite),
    steelMat,
    [ex, counterY + 0.34, ez + 0.14]
  )
  batcher.add(
    new THREE.CylinderGeometry(0.046, 0.042, 0.055, lite ? 8 : 14),
    darkSteelMat,
    [ex, counterY + 0.26, ez + 0.16]
  )
  batcher.add(
    new THREE.CylinderGeometry(0.014, 0.018, 0.14, 8),
    kickMat,
    [ex + 0.03, counterY + 0.25, ez + 0.24],
    [Math.PI / 2 + 0.12, 0, -0.22]
  )
  // Curved steam wand
  const wandCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(ex - 0.13, counterY + 0.3, ez + 0.15),
    new THREE.Vector3(ex - 0.16, counterY + 0.22, ez + 0.19),
    new THREE.Vector3(ex - 0.15, counterY + 0.13, ez + 0.21),
  ])
  batcher.add(
    new THREE.TubeGeometry(wandCurve, lite ? 5 : 8, 0.008, 6, false),
    steelMat,
    [0, 0, 0]
  )
  // Pressure gauge + ready LED + cup-warmer rail
  batcher.add(
    new THREE.CylinderGeometry(0.032, 0.032, 0.014, lite ? 8 : 14),
    mugMat,
    [ex - 0.12, counterY + 0.35, ez + 0.21],
    [Math.PI / 2, 0, 0]
  )
  batcher.add(
    new THREE.SphereGeometry(0.014, 8, 6),
    ledMat,
    [ex + 0.15, counterY + 0.36, ez + 0.212]
  )
  batcher.add(
    roundedBox(0.38, 0.014, 0.24, 0.005, lite),
    goldMat,
    [ex, counterY + 0.425, ez]
  )

  // Ceramic mugs with handles + glass coffee bean canister (center)
  for (let i = 0; i < 2; i += 1) {
    createMugParts(batcher, [width * 0.05 + i * 0.12, counterY, 0.06], {
      radius: 0.044,
      height: 0.082,
      bodyMat: mugMat,
      rimMat: i === 0 ? mugAccentMat : goldMat,
      handleYaw: 0.3 + i * 0.7,
      lite,
    })
  }
  const jarX = width * 0.11
  const jarZ = -depth * 0.14
  batcher.add(
    new THREE.CylinderGeometry(0.058, 0.058, 0.13, lite ? 8 : 14),
    coffeeMat,
    [jarX, counterY + 0.068, jarZ]
  )
  batcher.add(
    new THREE.CylinderGeometry(0.066, 0.066, 0.175, lite ? 10 : 16),
    glassJarMat,
    [jarX, counterY + 0.09, jarZ],
    undefined,
    undefined,
    false
  )
  batcher.add(
    new THREE.CylinderGeometry(0.068, 0.068, 0.026, lite ? 8 : 14),
    cabinetMat,
    [jarX, counterY + 0.188, jarZ]
  )

  // Sleek tapered gooseneck electric kettle (right)
  const kx = width * 0.34
  const kz = 0.0
  batcher.add(
    new THREE.CylinderGeometry(0.112, 0.116, 0.022, lite ? 10 : 16),
    kickMat,
    [kx, counterY + 0.011, kz]
  )
  const kettlePts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(0.105, 0),
    new THREE.Vector2(0.102, 0.07),
    new THREE.Vector2(0.082, 0.19),
    new THREE.Vector2(0.076, 0.22),
    new THREE.Vector2(0.002, 0.228),
  ]
  batcher.add(
    new THREE.LatheGeometry(kettlePts, lite ? 10 : 18),
    darkSteelMat,
    [kx, counterY + 0.022, kz]
  )
  batcher.add(
    new THREE.SphereGeometry(0.02, 8, 6),
    cabinetMat,
    [kx, counterY + 0.265, kz]
  )
  // Kettle C-handle & gooseneck spout
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(kx + 0.075, counterY + 0.2, kz),
    new THREE.Vector3(kx + 0.14, counterY + 0.16, kz),
    new THREE.Vector3(kx + 0.135, counterY + 0.07, kz),
    new THREE.Vector3(kx + 0.09, counterY + 0.055, kz),
  ])
  batcher.add(
    new THREE.TubeGeometry(handleCurve, lite ? 6 : 10, 0.011, 6, false),
    kickMat,
    [0, 0, 0]
  )
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(kx - 0.095, counterY + 0.055, kz),
    new THREE.Vector3(kx - 0.145, counterY + 0.12, kz),
    new THREE.Vector3(kx - 0.155, counterY + 0.21, kz),
    new THREE.Vector3(kx - 0.185, counterY + 0.23, kz),
  ])
  batcher.add(
    new THREE.TubeGeometry(spoutCurve, lite ? 6 : 10, 0.009, 6, false),
    darkSteelMat,
    [0, 0, 0]
  )

  batcher.flushInto(group)
  return wrapProp(group)
}

// ---------- 5. Reception Desk ----------

export function createReceptionDesk(
  width: number,
  depth: number,
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-reception-desk"
  const batcher = new PropMeshBatcher()

  const navyMat = matteMat("#162547", 0.44, 0.08)
  const kickMat = matteMat("#0e172c", 0.56, 0.12)
  const walnutMat = woodMat("walnut", 0.48)
  const goldMat = metalMat("#e9b949", 0.24, 0.84)
  const darkMat = matteMat("#121b30", 0.36, 0.2)
  const keyMat = matteMat("#e5e9f0", 0.5, 0.04)
  const vaseMat = matteMat("#faf6ef", 0.26, 0.08)
  const leafMat = matteMat("#419c42", 0.52, 0.04)

  const deskH = 0.88
  const riserH = 1.12

  // Recessed kickplate + bevelled navy reception body
  batcher.add(
    roundedBox(width - 0.06, 0.09, depth - 0.06, 0.015, lite),
    kickMat,
    [0, 0.045, 0]
  )
  batcher.add(
    roundedBox(width, deskH - 0.08, depth, 0.032, lite),
    navyMat,
    [0, 0.08 + (deskH - 0.08) / 2, 0]
  )
  // Upper front modesty riser + bevelled walnut transaction ledge
  batcher.add(
    roundedBox(width - 0.02, riserH - deskH, depth * 0.36, 0.024, lite),
    navyMat,
    [0, deskH + (riserH - deskH) / 2 - 0.01, depth * 0.31]
  )
  batcher.add(
    roundedBox(width + 0.08, 0.072, depth * 0.52, 0.024, lite),
    walnutMat,
    [0, riserH, depth * 0.22]
  )

  // Architectural fluted walnut accent slats flanking center emblem
  const emblemW = Math.min(1.12, width * 0.36)
  const sideStart = emblemW / 2 + 0.14
  const sideEnd = width / 2 - 0.1
  if (!lite && sideEnd > sideStart) {
    for (const side of [-1, 1] as const) {
      for (let sx = sideStart; sx <= sideEnd; sx += 0.11) {
        batcher.add(
          roundedBox(0.044, riserH - 0.34, 0.026, 0.01, true),
          walnutMat,
          [side * sx, 0.18 + (riserH - 0.34) / 2, depth / 2 + 0.008]
        )
      }
    }
  }

  // Brushed-gold horizontal trim rails + recessed emblem frame
  batcher.add(
    roundedBox(width + 0.04, 0.042, 0.034, 0.012, lite),
    goldMat,
    [0, 0.16, depth / 2 + 0.014]
  )
  batcher.add(
    roundedBox(width + 0.04, 0.042, 0.034, 0.012, lite),
    goldMat,
    [0, riserH - 0.06, depth / 2 + 0.014]
  )
  batcher.add(
    roundedBox(emblemW + 0.08, 0.54, 0.036, 0.014, lite),
    goldMat,
    [0, 0.62, depth / 2 + 0.012]
  )

  // Inner receptionist monitor, keyboard, service bell & bud vase
  const monX = width * 0.22
  const monZ = -depth * 0.16
  batcher.add(roundedBox(0.18, 0.02, 0.13, 0.008, lite), darkMat, [
    monX,
    deskH + 0.01,
    monZ,
  ])
  batcher.add(roundedBox(0.04, 0.16, 0.03, 0.01, lite), darkMat, [
    monX,
    deskH + 0.09,
    monZ - 0.015,
  ])
  batcher.add(roundedBox(0.5, 0.32, 0.034, 0.014, lite), darkMat, [
    monX,
    deskH + 0.26,
    monZ,
  ])
  batcher.add(roundedBox(0.36, 0.018, 0.12, 0.006, lite), keyMat, [
    monX,
    deskH + 0.01,
    monZ + 0.14,
  ])

  // Brass concierge service bell on transaction ledge
  batcher.add(
    new THREE.CylinderGeometry(0.055, 0.062, 0.016, lite ? 8 : 14),
    darkMat,
    [-width * 0.3, riserH + 0.044, depth * 0.24]
  )
  batcher.add(
    new THREE.SphereGeometry(
      0.048,
      lite ? 8 : 14,
      lite ? 6 : 10,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    ),
    goldMat,
    [-width * 0.3, riserH + 0.05, depth * 0.24]
  )

  // Small ceramic welcome vase with leaves on left ledge
  const vx = -width * 0.39
  const vz = depth * 0.22
  batcher.add(
    createLathePotGeometry(0.036, 0.048, 0.13, lite),
    vaseMat,
    [vx, riserH + 0.036, vz]
  )
  const leafGeom = createSculptedLeafGeometry(lite)
  for (let i = 0; i < (lite ? 3 : 5); i += 1) {
    batcher.add(
      leafGeom,
      leafMat,
      [vx, riserH + 0.155, vz],
      [0.42, (i * Math.PI * 2) / (lite ? 3 : 5), 0],
      [0.32, 0.36, 0.32],
      false,
      true,
      false
    )
  }

  batcher.flushInto(group)

  // Glowing crisp "IQX" front emblem plaque (unique per instance)
  const emblemTex = createSignTexture("IQX", {
    style: "emblem",
    width: 320,
    height: 140,
    anisotropy: lite ? 4 : 16,
  })
  const emblemMat = new THREE.MeshStandardMaterial({
    map: emblemTex,
    emissive: new THREE.Color("#d9a03a"),
    emissiveMap: emblemTex,
    emissiveIntensity: 0.36,
    roughness: 0.28,
  })
  addDirectMesh(
    group,
    new THREE.PlaneGeometry(emblemW, 0.48),
    emblemMat,
    [0, 0.62, depth / 2 + 0.034],
    undefined,
    false
  )

  // Glowing reception screen plane
  addDirectMesh(
    group,
    new THREE.PlaneGeometry(0.45, 0.27),
    screenMat("reception"),
    [monX, deskH + 0.26, monZ + 0.02],
    undefined,
    false
  )

  return wrapProp(group)
}

// ---------- 5b. Traditional Glowing Silk Lantern ----------

function getLanternSpecs(
  colorHex: string,
  lit: boolean,
  lite: boolean
): readonly MergedPartSpec[] {
  const key = `lantern:${colorHex.toLowerCase()}:${lit ? 1 : 0}:${lite ? "lite" : "hi"}`
  const cached = lanternPartCache.get(key)
  if (cached) return cached

  const batcher = new PropMeshBatcher()
  const silkMat = lit
    ? getCachedMaterial(`lanternSilk:${colorHex}`, () =>
        new THREE.MeshStandardMaterial({
          color: colorHex,
          emissive: new THREE.Color("#ff9d3b"),
          emissiveIntensity: 0.72,
          roughness: 0.42,
          metalness: 0.06,
        })
      )
    : matteMat(colorHex, 0.54, 0.06)
  const goldMat = metalMat("#f3c64a", 0.22, 0.84, "#a16207", 0.16)
  const tasselMat = matteMat("#d92b32", 0.62, 0.08)

  // Bottom tassel (y = 0..0.16)
  batcher.add(
    new THREE.CylinderGeometry(0.012, 0.028, 0.13, lite ? 6 : 10),
    tasselMat,
    [0, 0.065, 0],
    undefined,
    undefined,
    false
  )
  batcher.add(
    new THREE.SphereGeometry(0.022, lite ? 6 : 10, 6),
    goldMat,
    [0, 0.145, 0],
    undefined,
    undefined,
    false
  )
  // Bottom gold collar
  batcher.add(
    new THREE.CylinderGeometry(0.065, 0.052, 0.036, lite ? 8 : 14),
    goldMat,
    [0, 0.175, 0]
  )
  // Sculpted oblate ribbed silk lantern body (y = 0.19..0.55)
  batcher.add(createLatheLanternBodyGeometry(lite), silkMat, [0, 0.19, 0])
  if (!lite) {
    for (let i = 0; i < 6; i += 1) {
      batcher.add(
        new THREE.TorusGeometry(0.184, 0.006, 5, 18),
        goldMat,
        [0, 0.37, 0],
        [0, (i * Math.PI) / 6, 0],
        [1, 0.96, 1],
        false
      )
    }
  }
  // Top gold crown cap + hanging cord
  batcher.add(
    new THREE.CylinderGeometry(0.056, 0.072, 0.04, lite ? 8 : 14),
    goldMat,
    [0, 0.565, 0]
  )
  batcher.add(
    new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6),
    goldMat,
    [0, 0.65, 0],
    undefined,
    undefined,
    false
  )

  const specs = batcher.flushToSpecs(key, { cache: lanternPartCache, key })
  lanternPartCache.set(key, specs)
  return specs
}

export function createLantern(opts?: LanternOptions): DisposableProp {
  const lite = resolveLite(opts)
  const colorHex = opts?.colorHex ?? "#d9232e"
  const lit = opts?.lit ?? true
  const group = new THREE.Group()
  group.name = "prop-lantern"
  mountSpecs(group, getLanternSpecs(colorHex, lit, lite))
  if (opts?.scale && opts.scale !== 1) {
    group.scale.setScalar(opts.scale)
  }
  return wrapProp(group)
}

// ---------- 6. Thần Tài Offering Altar & Ceremonial Shrine ----------

export function createOfferingAltar(
  width = 3.2,
  depth = 1.1,
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-offering-altar"
  const batcher = new PropMeshBatcher()

  const crimsonMat = matteMat("#8f161f", 0.4, 0.08)
  const rosewoodMat = woodMat("rosewood", 0.42)
  const goldMat = metalMat("#f3c64a", 0.2, 0.86, "#a16207", 0.18)
  const ashMat = matteMat("#cbd5e1", 0.92, 0.02)
  const emberMat = glowMat("#ff5e2b", 1.7)
  const flameMat = glowMat("#ffe066", 1.65)
  const lotusMat = glowMat("#fde047", 1.15)
  const candleWaxMat = matteMat("#c81d25", 0.36, 0.06)
  const orangeMat = matteMat("#f97316", 0.38, 0.04)
  const peachMat = matteMat("#fb7185", 0.42, 0.04)
  const pomeloMat = matteMat("#84cc16", 0.46, 0.04)
  const leafSmallMat = matteMat("#2f7a32", 0.54, 0.04)
  const smokeMat = matteMat("#f1f5f9", 0.9, 0, {
    transparent: true,
    opacity: 0.28,
  })

  const h = 0.86

  // 4 carved altar legs with stepped feet & lower stretcher rail
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const lx = sx * (width * 0.44)
      const lz = sz * (depth * 0.38)
      batcher.add(
        roundedBox(0.11, h - 0.06, 0.11, 0.024, lite),
        rosewoodMat,
        [lx, (h - 0.06) / 2, lz]
      )
      batcher.add(
        roundedBox(0.145, 0.07, 0.145, 0.018, lite),
        goldMat,
        [lx, 0.035, lz]
      )
    }
  }
  // Lower horizontal stretcher frame
  batcher.add(
    roundedBox(width * 0.86, 0.05, 0.06, 0.014, lite),
    rosewoodMat,
    [0, 0.16, depth * 0.36]
  )
  batcher.add(
    roundedBox(width * 0.86, 0.05, 0.06, 0.014, lite),
    rosewoodMat,
    [0, 0.16, -depth * 0.36]
  )

  // Recessed crimson lacquer altar cabinet body + gold accent apron moldings
  batcher.add(
    roundedBox(width * 0.86, h - 0.2, depth * 0.76, 0.03, lite),
    crimsonMat,
    [0, 0.18 + (h - 0.2) / 2, 0]
  )
  batcher.add(
    roundedBox(width * 0.88, 0.05, 0.045, 0.014, lite),
    goldMat,
    [0, h - 0.1, depth * 0.4]
  )

  // Overhanging bevelled rosewood tabletop + traditional upturned end scrolls (đầu hồi)
  batcher.add(
    roundedBox(width, 0.09, depth, 0.024, lite),
    rosewoodMat,
    [0, h, 0]
  )
  for (const side of [-1, 1] as const) {
    batcher.add(
      new THREE.CylinderGeometry(0.058, 0.058, depth + 0.02, lite ? 8 : 14),
      rosewoodMat,
      [side * (width / 2 + 0.015), h + 0.038, 0],
      [Math.PI / 2, 0, 0]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.042, 0.042, depth + 0.04, lite ? 8 : 12),
      goldMat,
      [side * (width / 2 + 0.015), h + 0.038, 0],
      [Math.PI / 2, 0, 0]
    )
  }

  // Draped crimson altar cloth (khăn phủ bàn thờ) with gold trim & hanging tassels
  const clothW = width * 0.64
  const clothH = 0.56
  batcher.add(
    roundedBox(clothW + 0.05, 0.034, 0.034, 0.01, lite),
    goldMat,
    [0, h - 0.045, depth / 2 + 0.01]
  )
  batcher.add(
    roundedBox(clothW + 0.05, 0.034, 0.03, 0.01, lite),
    goldMat,
    [0, h - 0.055 - clothH, depth / 2 + 0.015]
  )
  for (const tx of [-clothW * 0.42, 0, clothW * 0.42]) {
    batcher.add(
      new THREE.CylinderGeometry(0.012, 0.022, 0.09, 6),
      goldMat,
      [tx, h - 0.105 - clothH, depth / 2 + 0.018],
      undefined,
      undefined,
      false
    )
  }

  const topY = h + 0.045

  // Central Tripod Golden Incense Urn (Lư hương) + ash + 3 lit sticks + smoke wisps
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 6
    batcher.add(
      new THREE.CylinderGeometry(0.024, 0.018, 0.055, 8),
      goldMat,
      [Math.cos(a) * 0.095, topY + 0.026, 0.04 + Math.sin(a) * 0.095]
    )
  }
  batcher.add(createLatheUrnGeometry(lite), goldMat, [0, topY + 0.035, 0.04])
  for (const side of [-1, 1] as const) {
    batcher.add(
      new THREE.TorusGeometry(0.045, 0.012, 6, lite ? 8 : 12, Math.PI),
      goldMat,
      [side * 0.17, topY + 0.23, 0.04],
      [0, 0, -side * (Math.PI / 2)]
    )
  }
  batcher.add(
    new THREE.CylinderGeometry(0.145, 0.145, 0.02, lite ? 10 : 16),
    ashMat,
    [0, topY + 0.29, 0.04],
    undefined,
    undefined,
    false
  )
  for (const sx of [-0.052, 0, 0.052]) {
    batcher.add(
      new THREE.CylinderGeometry(0.009, 0.009, 0.34, 6),
      rosewoodMat,
      [sx, topY + 0.45, 0.04],
      [0, 0, -sx * 0.9]
    )
    batcher.add(
      new THREE.SphereGeometry(0.02, 7, 6),
      emberMat,
      [sx * 1.18, topY + 0.625, 0.04],
      undefined,
      undefined,
      false
    )
  }
  if (!lite) {
    const smokeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, topY + 0.65, 0.04),
      new THREE.Vector3(0.04, topY + 0.8, 0.02),
      new THREE.Vector3(-0.03, topY + 0.96, 0.04),
      new THREE.Vector3(0.02, topY + 1.1, 0.03),
    ])
    batcher.add(
      new THREE.TubeGeometry(smokeCurve, 10, 0.014, 5, false),
      smokeMat,
      [0, 0, 0],
      undefined,
      undefined,
      false,
      false
    )
  }

  // Twin Ceremonial Wax Candles in Brass Holders flanking the Urn
  for (const side of [-1, 1] as const) {
    const cx = side * (width * 0.14)
    const cz = -0.14
    batcher.add(
      createLathePedestalTrayGeometry(0.068, 0.075, lite),
      goldMat,
      [cx, topY, cz]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.032, 0.034, 0.22, lite ? 8 : 14),
      candleWaxMat,
      [cx, topY + 0.18, cz]
    )
    batcher.add(
      new THREE.ConeGeometry(0.02, 0.07, lite ? 6 : 10),
      flameMat,
      [cx, topY + 0.325, cz],
      undefined,
      undefined,
      false
    )
  }

  // Twin Sculpted Glowing Lotus Lamps at outer edges
  const leafGeom = createSculptedLeafGeometry(lite)
  for (const side of [-1, 1] as const) {
    const lx = side * (width * 0.39)
    const lz = -0.04
    batcher.add(
      createLathePedestalTrayGeometry(0.095, 0.18, lite),
      goldMat,
      [lx, topY, lz]
    )
    const petalCount = lite ? 5 : 8
    for (let i = 0; i < petalCount; i += 1) {
      const yaw = (i * Math.PI * 2) / petalCount
      batcher.add(
        leafGeom,
        lotusMat,
        [lx, topY + 0.17, lz],
        [0.62, yaw, 0],
        [0.42, 0.42, 0.42],
        false,
        false,
        false
      )
    }
    batcher.add(
      new THREE.SphereGeometry(0.075, lite ? 8 : 14, lite ? 6 : 10),
      flameMat,
      [lx, topY + 0.26, lz],
      undefined,
      [1, 1.25, 1],
      false
    )
  }

  // Pedestal Fruit Tray (Mâm ngũ quả - left) with oranges, peaches, pomelo & leaves
  const fx = -width * 0.26
  const fz = 0.07
  batcher.add(
    createLathePedestalTrayGeometry(0.22, 0.1, lite),
    goldMat,
    [fx, topY, fz]
  )
  batcher.add(
    new THREE.SphereGeometry(0.078, lite ? 8 : 14, lite ? 6 : 10),
    pomeloMat,
    [fx, topY + 0.17, fz - 0.05]
  )
  batcher.add(
    new THREE.SphereGeometry(0.064, lite ? 8 : 12, lite ? 6 : 10),
    orangeMat,
    [fx - 0.082, topY + 0.145, fz + 0.055]
  )
  batcher.add(
    new THREE.SphereGeometry(0.064, lite ? 8 : 12, lite ? 6 : 10),
    peachMat,
    [fx + 0.082, topY + 0.145, fz + 0.055]
  )
  batcher.add(
    new THREE.SphereGeometry(0.062, lite ? 8 : 12, lite ? 6 : 10),
    orangeMat,
    [fx, topY + 0.225, fz + 0.03]
  )
  for (let i = 0; i < 3; i += 1) {
    batcher.add(
      leafGeom,
      leafSmallMat,
      [fx, topY + 0.25, fz + 0.02],
      [0.9, i * 2.1, 0],
      [0.24, 0.24, 0.24],
      false,
      true,
      false
    )
  }

  // Pedestal Gold Ingots Tray (Mâm thỏi vàng - right) with sculpted sycee boats
  const ix = width * 0.26
  const iz = 0.07
  batcher.add(
    createLathePedestalTrayGeometry(0.21, 0.095, lite),
    goldMat,
    [ix, topY, iz]
  )
  const ingotGeom = createBoatIngotGeometry(lite)
  const ingotSpots: readonly [number, number, number, number][] = [
    [-0.068, 0.092, 0.05, 0.18],
    [0.068, 0.092, 0.05, -0.18],
    [0, 0.092, -0.055, 0],
    [0, 0.155, 0.015, 0.08],
  ]
  for (const [dx, dy, dz, yaw] of ingotSpots) {
    batcher.add(
      ingotGeom,
      goldMat,
      [ix + dx, topY + dy, iz + dz],
      [0, yaw, 0],
      undefined,
      true,
      true,
      false
    )
    batcher.add(
      new THREE.SphereGeometry(0.032, lite ? 7 : 10, 6),
      goldMat,
      [ix + dx, topY + dy + 0.038, iz + dz],
      undefined,
      [1.25, 0.78, 0.9]
    )
  }
  ingotGeom.dispose()

  batcher.flushInto(group)

  // Mount patterned crimson-and-gold brocade altar cloth drape on front face
  addDirectMesh(
    group,
    new THREE.PlaneGeometry(clothW, clothH),
    altarClothMat(),
    [0, h - 0.05 - clothH / 2, depth / 2 + 0.016],
    undefined,
    false
  )

  return wrapProp(group)
}

export function createThanTaiShrine(opts?: {
  includeAltar?: boolean
  lite?: boolean
}): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-thantai-shrine"
  const batcher = new PropMeshBatcher()

  const crimsonMat = matteMat("#9b1620", 0.4, 0.08)
  const roofMat = matteMat("#7a1018", 0.44, 0.08)
  const rosewoodMat = woodMat("rosewood", 0.46)
  const goldMat = metalMat("#f3c64a", 0.2, 0.86, "#a16207", 0.18)
  const backPanelMat = matteMat("#4f0a10", 0.54, 0.06)

  // Raised stepped ceremonial crimson dais (top surface = 0.185 matching Thần Tài at y = 0.19)
  batcher.add(
    roundedBox(4.24, 0.15, 1.58, 0.03, lite),
    crimsonMat,
    [0, 0.075, -0.26]
  )
  batcher.add(
    roundedBox(4.36, 0.038, 1.68, 0.014, lite),
    goldMat,
    [0, 0.166, -0.26]
  )

  // Carved back lacquered wall screen + gold trim frame + circular golden auspicious halo
  batcher.add(
    roundedBox(3.64, 3.24, 0.18, 0.03, lite),
    backPanelMat,
    [0, 1.78, -0.82]
  )
  batcher.add(
    roundedBox(3.42, 0.06, 0.05, 0.015, lite),
    goldMat,
    [0, 3.3, -0.72]
  )
  batcher.add(
    roundedBox(3.42, 0.06, 0.05, 0.015, lite),
    goldMat,
    [0, 0.34, -0.72]
  )
  batcher.add(
    new THREE.TorusGeometry(0.88, 0.042, lite ? 8 : 12, lite ? 20 : 36),
    goldMat,
    [0, 1.66, -0.71]
  )
  if (!lite) {
    batcher.add(
      new THREE.TorusGeometry(0.74, 0.018, 8, 28),
      goldMat,
      [0, 1.66, -0.71]
    )
  }

  // Twin crimson lacquered pillars with stepped lathe lotus plinths & pagoda capitals
  const pillarBasePts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(0.24, 0),
    new THREE.Vector2(0.23, 0.08),
    new THREE.Vector2(0.18, 0.15),
    new THREE.Vector2(0.21, 0.22),
    new THREE.Vector2(0.16, 0.28),
  ]
  const pillarBaseGeom = new THREE.LatheGeometry(pillarBasePts, lite ? 10 : 18)

  for (const side of [-1, 1] as const) {
    const px = side * 1.86
    batcher.add(
      pillarBaseGeom,
      goldMat,
      [px, 0.18, -0.68],
      undefined,
      undefined,
      true,
      true,
      false
    )
    batcher.add(
      new THREE.CylinderGeometry(0.135, 0.152, 3.16, lite ? 10 : 18),
      crimsonMat,
      [px, 1.94, -0.68]
    )
    // Mid-column ornamental gold collar + stepped bracket capital
    batcher.add(
      new THREE.TorusGeometry(0.15, 0.022, 6, lite ? 10 : 18),
      goldMat,
      [px, 2.75, -0.68],
      [Math.PI / 2, 0, 0]
    )
    batcher.add(
      roundedBox(0.36, 0.14, 0.36, 0.024, lite),
      goldMat,
      [px, 3.48, -0.68]
    )
  }
  pillarBaseGeom.dispose()

  // Multi-tiered ornate upturned pagoda eave canopy
  batcher.add(
    roundedBox(4.36, 0.18, 1.12, 0.036, lite),
    roofMat,
    [0, 3.62, -0.58]
  )
  batcher.add(
    roundedBox(4.64, 0.09, 1.26, 0.026, lite),
    goldMat,
    [0, 3.74, -0.58]
  )
  // Upper sloped hip roof tier + central ridge beam & lotus finial (bảo đỉnh)
  batcher.add(
    roundedBox(3.7, 0.22, 0.86, 0.045, lite),
    roofMat,
    [0, 3.9, -0.58]
  )
  batcher.add(
    roundedBox(3.92, 0.08, 0.16, 0.024, lite),
    goldMat,
    [0, 4.04, -0.58]
  )
  batcher.add(
    new THREE.SphereGeometry(0.11, lite ? 8 : 14, lite ? 6 : 10),
    goldMat,
    [0, 4.18, -0.58]
  )
  batcher.add(
    new THREE.ConeGeometry(0.065, 0.18, lite ? 6 : 10),
    goldMat,
    [0, 4.32, -0.58]
  )

  // Sweeping upturned golden pagoda corner eave tips
  for (const side of [-1, 1] as const) {
    const tipCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 2.1, 3.76, -0.58),
      new THREE.Vector3(side * 2.38, 3.84, -0.58),
      new THREE.Vector3(side * 2.52, 4.08, -0.58),
    ])
    batcher.add(
      new THREE.TubeGeometry(tipCurve, lite ? 5 : 10, 0.065, lite ? 5 : 8, false),
      goldMat,
      [0, 0, 0]
    )
    batcher.add(
      new THREE.SphereGeometry(0.075, 8, 6),
      goldMat,
      [side * 2.52, 4.09, -0.58]
    )
  }

  // Carved hoành phi plaque frame mounted proudly at z = -0.06 so 52° camera never clips text!
  batcher.add(
    roundedBox(3.32, 0.78, 0.09, 0.024, lite),
    rosewoodMat,
    [0, 3.06, -0.09]
  )
  batcher.add(
    roundedBox(3.38, 0.84, 0.05, 0.02, lite),
    goldMat,
    [0, 3.06, -0.11]
  )

  batcher.flushInto(group)

  // Crisp gold-bordered hoành phi banner "Thần Tài · Khấn trước 11:30"
  const bannerTex = createSignTexture("Thần Tài · Khấn trước 11:30", {
    style: "gold_banner",
    width: 640,
    height: 140,
    anisotropy: lite ? 4 : 16,
  })
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    emissive: new THREE.Color("#f3c64a"),
    emissiveMap: bannerTex,
    emissiveIntensity: 0.3,
    roughness: 0.32,
  })
  addDirectMesh(
    group,
    new THREE.PlaneGeometry(3.2, 0.7),
    bannerMat,
    [0, 3.06, -0.04],
    undefined,
    false
  )

  // Hanging glowing crimson-gold silk lanterns on left & right pagoda eaves
  const lanternSpecs = getLanternSpecs("#d9232e", true, lite)
  for (const side of [-1, 1] as const) {
    const lanternGroup = new THREE.Group()
    lanternGroup.position.set(side * 1.94, 2.86, -0.16)
    mountSpecs(lanternGroup, lanternSpecs)
    group.add(lanternGroup)
  }

  const extraChildren: DisposableProp[] = []
  if (opts?.includeAltar) {
    const altar = createOfferingAltar(3.2, 1.1, { lite })
    ;(altar.group.userData as Record<string, unknown>)[CHILD_PROP_FLAG] = true
    altar.group.position.set(0, 0, 1.25)
    group.add(altar.group)
    extraChildren.push(altar)
  }

  return wrapProp(group, extraChildren)
}

// ---------- 7. Hall of Fame Statue Podium (Exact Top Y Preserved!) ----------

export function createStatuePodium(
  rank: 1 | 2 | 3,
  width = 1.75,
  depth = 1.05,
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = `prop-podium-${rank}`
  const batcher = new PropMeshBatcher()

  const podiumMarbleMat = marbleMat("cream", 0.28)
  const trimHex = rank === 1 ? "#f3c64a" : rank === 2 ? "#cfd5de" : "#c98a52"
  const trimMetalMat = metalMat(trimHex, 0.22, 0.84)
  const plaqueBackMat = matteMat("#141f38", 0.42, 0.22)
  const velvetHex = rank === 1 ? "#8b1d27" : rank === 2 ? "#1e3a5f" : "#4a2c18"
  const velvetMat = clothMat(velvetHex, "velvet")

  // Exact top surface must equal h + 0.05 -> 0.77 (rank 1), 0.61 (rank 2), 0.53 (rank 3)!
  const h = rank === 1 ? 0.72 : rank === 2 ? 0.56 : 0.48

  // 2-step bevelled marble plinth base + metallic molding skirt
  batcher.add(
    roundedBox(width, 0.1, depth, 0.024, lite),
    podiumMarbleMat,
    [0, 0.05, 0]
  )
  batcher.add(
    roundedBox(width * 0.94, 0.06, depth * 0.93, 0.018, lite),
    podiumMarbleMat,
    [0, 0.125, 0]
  )
  batcher.add(
    roundedBox(width * 0.96, 0.032, depth * 0.95, 0.012, lite),
    trimMetalMat,
    [0, 0.16, 0]
  )

  // Sculpted bevelled marble body + 4 corner chamfered mini-pilasters
  const bodyH = Math.max(0.18, h - 0.18)
  const bodyCenterY = 0.165 + bodyH / 2
  const bodyW = width * 0.84
  const bodyD = depth * 0.82
  batcher.add(
    roundedBox(bodyW, bodyH, bodyD, 0.03, lite),
    podiumMarbleMat,
    [0, bodyCenterY, 0]
  )
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      batcher.add(
        new THREE.CylinderGeometry(0.042, 0.046, bodyH, lite ? 6 : 12),
        podiumMarbleMat,
        [sx * (bodyW / 2 - 0.01), bodyCenterY, sz * (bodyD / 2 - 0.01)]
      )
      batcher.add(
        new THREE.CylinderGeometry(0.052, 0.052, 0.028, lite ? 6 : 10),
        trimMetalMat,
        [sx * (bodyW / 2 - 0.01), h - 0.04, sz * (bodyD / 2 - 0.01)]
      )
    }
  }

  // Upper stepped metallic cornice + plush bevelled velvet cushion pad (top = h + 0.05)
  batcher.add(
    roundedBox(width * 0.93, 0.052, depth * 0.91, 0.018, lite),
    trimMetalMat,
    [0, h - 0.005, 0]
  )
  batcher.add(
    roundedBox(width * 0.83, 0.036, depth * 0.8, 0.014, lite),
    velvetMat,
    [0, h + 0.032, 0]
  )

  // Ornate recessed front plaque bezel + corner rivets + circular medallion ring
  const plaqueY = Math.max(0.28, bodyCenterY)
  const plaqueZ = bodyD / 2 + 0.012
  const plaqueW = Math.min(0.68, bodyW * 0.5)
  const plaqueH = Math.min(0.32, bodyH * 0.72)
  batcher.add(
    roundedBox(plaqueW + 0.05, plaqueH + 0.045, 0.028, 0.012, lite),
    trimMetalMat,
    [0, plaqueY, plaqueZ]
  )
  batcher.add(
    roundedBox(plaqueW, plaqueH, 0.026, 0.008, lite),
    plaqueBackMat,
    [0, plaqueY, plaqueZ + 0.008]
  )
  if (!lite) {
    for (const rx of [-plaqueW * 0.42, plaqueW * 0.42]) {
      for (const ry of [-plaqueH * 0.36, plaqueH * 0.36]) {
        batcher.add(
          new THREE.SphereGeometry(0.011, 6, 6),
          trimMetalMat,
          [rx, plaqueY + ry, plaqueZ + 0.022],
          undefined,
          undefined,
          false
        )
      }
    }
  }
  const medalSize = Math.min(0.28, plaqueH * 0.86)
  batcher.add(
    new THREE.TorusGeometry(medalSize * 0.47, 0.014, 6, lite ? 12 : 20),
    trimMetalMat,
    [0, plaqueY, plaqueZ + 0.024],
    undefined,
    undefined,
    false
  )

  batcher.flushInto(group)

  // Crisp high-DPR rank medal plaque face
  const medalTex = createSignTexture(String(rank), {
    style: "medal",
    accentColor: trimHex,
    anisotropy: lite ? 4 : 16,
  })
  const medalMat = new THREE.MeshStandardMaterial({
    map: medalTex,
    transparent: true,
    roughness: 0.24,
    metalness: 0.32,
  })
  addDirectMesh(
    group,
    new THREE.PlaneGeometry(medalSize, medalSize),
    medalMat,
    [0, plaqueY, plaqueZ + 0.026],
    undefined,
    false
  )

  return wrapProp(group)
}

// ---------- 8. Crisp Emissive Wall Board Frame (LED / SACO / Meeting) ----------

export function createWallBoardFrame(
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
  borderColor = "#e9b949",
  opts?: PropDetailOptions
): LiveBoardProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-wall-board"
  const batcher = new PropMeshBatcher()

  const cabinetMat = matteMat("#111b30", 0.4, 0.36)
  const innerBezelMat = matteMat("#090f1d", 0.5, 0.25)
  const trimMat = metalMat(borderColor, 0.24, 0.82)
  const ledOkMat = glowMat("#34c38f", 1.2)
  const ledGoldMat = glowMat("#f6d27a", 1.0)

  const frameDepth = 0.16
  const border = 0.095

  // Bevelled dark cabinet housing + recessed screen bezel well
  batcher.add(
    roundedBox(width + border * 2, height + border * 2, frameDepth, 0.028, lite),
    cabinetMat,
    [0, 0, -frameDepth / 2]
  )
  batcher.add(
    roundedBox(width + 0.05, height + 0.05, 0.025, 0.01, lite),
    innerBezelMat,
    [0, 0, 0.002],
    undefined,
    undefined,
    false
  )

  // Sculpted bevelled metallic outer frame rails + corner caps
  const railW = 0.068
  const railD = frameDepth + 0.04
  batcher.add(
    roundedBox(width + border * 2.24, railW, railD, 0.018, lite),
    trimMat,
    [0, height / 2 + border, -frameDepth / 2 + 0.014]
  )
  batcher.add(
    roundedBox(width + border * 2.24, railW, railD, 0.018, lite),
    trimMat,
    [0, -height / 2 - border, -frameDepth / 2 + 0.014]
  )
  for (const side of [-1, 1] as const) {
    batcher.add(
      roundedBox(railW, height + border * 2.24, railD, 0.018, lite),
      trimMat,
      [side * (width / 2 + border), 0, -frameDepth / 2 + 0.014]
    )
    // Corner accent blocks
    for (const sy of [-1, 1] as const) {
      batcher.add(
        roundedBox(0.11, 0.11, railD + 0.02, 0.02, lite),
        trimMat,
        [
          side * (width / 2 + border),
          sy * (height / 2 + border),
          -frameDepth / 2 + 0.018,
        ]
      )
    }
  }

  // Subtle status indicator LEDs on bottom-right bezel
  batcher.add(
    new THREE.SphereGeometry(0.016, 6, 6),
    ledOkMat,
    [width / 2 - 0.14, -height / 2 - border, 0.036],
    undefined,
    undefined,
    false
  )
  batcher.add(
    new THREE.SphereGeometry(0.014, 6, 6),
    ledGoldMat,
    [width / 2 - 0.07, -height / 2 - border, 0.036],
    undefined,
    undefined,
    false
  )

  batcher.flushInto(group)

  let texture: THREE.Texture
  try {
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = lite ? 4 : 16
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
    texture = tex
  } catch {
    texture = new THREE.DataTexture(new Uint8Array([15, 24, 48, 255]), 1, 1)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
  }

  const liveScreenMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: texture,
    emissiveIntensity: 0.44,
    roughness: 0.24,
    metalness: 0.06,
  })
  addDirectMesh(
    group,
    new THREE.PlaneGeometry(width, height),
    liveScreenMat,
    [0, 0, 0.016],
    undefined,
    false
  )

  const retained = retainSubtreeSharedRefs(group)
  let disposed = false
  return {
    group,
    texture,
    update: () => {
      texture.needsUpdate = true
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      disposePropGroup(group)
      releaseSubtreeSharedRefs(retained)
    },
  }
}

// ---------- 9. Office Desk (Boss / Staff / Reading) ----------

export function createOfficeDesk(opts: OfficeDeskOptions): DisposableProp {
  const { width, depth, variant } = opts
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = `prop-desk-${variant}`
  const batcher = new PropMeshBatcher()

  const topWoodMat = woodMat(
    variant === "boss" ? "walnut" : variant === "reading" ? "honey" : "oak",
    0.46
  )
  const drawerBodyMat = matteMat(
    variant === "boss" ? "#5a3920" : "#8a633b",
    0.58,
    0.04
  )
  const handleMat = metalMat(
    variant === "boss" ? "#e9b949" : "#b8c4d4",
    0.24,
    0.84
  )
  const getDrawerFaceMat = (): THREE.MeshStandardMaterial =>
    matteMat(variant === "boss" ? "#6d4628" : "#a3784a", 0.52, 0.05)
  const getLegMat = (): THREE.MeshStandardMaterial =>
    metalMat("#27334a", 0.34, 0.68)
  const getBezelMat = (): THREE.MeshStandardMaterial =>
    matteMat("#161f33", 0.34, 0.22)

  const deskH = 0.76
  const topThick = 0.068
  const topSurfaceY = deskH + topThick / 2

  const addDrawerPedestal = (centerX: number, pedW: number): void => {
    const pedH = deskH - 0.08
    const pedD = depth * 0.8
    const legMat = getLegMat()
    const drawerFaceMat = getDrawerFaceMat()
    // Foot glides + bevelled pedestal carcass
    batcher.add(
      roundedBox(pedW - 0.04, 0.04, pedD - 0.04, 0.01, lite),
      legMat,
      [centerX, 0.02, 0]
    )
    batcher.add(
      roundedBox(pedW, pedH, pedD, 0.02, lite),
      drawerBodyMat,
      [centerX, 0.04 + pedH / 2, 0]
    )
    // 3 bevelled drawer faces + metallic bar handles (facing -Z user side & subtle trim on +Z)
    const drawers = 3
    const slotH = (pedH - 0.08) / drawers
    for (let i = 0; i < drawers; i += 1) {
      const dy = 0.08 + (i + 0.5) * slotH
      batcher.add(
        roundedBox(pedW - 0.05, slotH - 0.024, 0.024, 0.008, lite),
        drawerFaceMat,
        [centerX, dy, -pedD / 2 - 0.008]
      )
      batcher.add(
        roundedBox(pedW * 0.34, 0.016, 0.024, 0.006, lite),
        handleMat,
        [centerX, dy + slotH * 0.14, -pedD / 2 - 0.024]
      )
    }
  }

  if (variant === "boss") {
    const pedW = Math.min(0.46, width * 0.2)
    if (width >= 2.2) {
      addDrawerPedestal(-width / 2 + pedW / 2 + 0.05, pedW)
      addDrawerPedestal(width / 2 - pedW / 2 - 0.05, pedW)
    } else {
      addDrawerPedestal(width / 2 - pedW / 2 - 0.05, pedW)
      batcher.add(
        roundedBox(0.08, deskH - 0.04, depth * 0.82, 0.02, lite),
        drawerBodyMat,
        [-width / 2 + 0.09, (deskH - 0.04) / 2, 0]
      )
    }
    // Framed executive modesty panel with gold inlay strip
    batcher.add(
      roundedBox(width - pedW * 2 - 0.06, deskH * 0.64, 0.045, 0.014, lite),
      drawerBodyMat,
      [0, deskH * 0.45, depth * 0.32]
    )
    batcher.add(
      roundedBox(width - pedW * 2 - 0.16, 0.024, 0.018, 0.006, lite),
      handleMat,
      [0, deskH * 0.64, depth * 0.348]
    )
  } else if (variant === "staff") {
    const legMat = getLegMat()
    const pedW = Math.min(0.4, width * 0.23)
    addDrawerPedestal(width / 2 - pedW / 2 - 0.05, pedW)
    // Modern metal sled leg frame on left side
    const leftX = -width / 2 + 0.09
    batcher.add(
      roundedBox(0.05, 0.04, depth * 0.84, 0.014, lite),
      legMat,
      [leftX, 0.02, 0]
    )
    for (const sz of [-1, 1] as const) {
      batcher.add(
        roundedBox(0.052, deskH - 0.05, 0.052, 0.014, lite),
        legMat,
        [leftX, deskH / 2, sz * (depth * 0.37)]
      )
    }
    batcher.add(
      roundedBox(width - pedW - 0.18, deskH * 0.56, 0.04, 0.012, lite),
      drawerBodyMat,
      [-pedW * 0.45, deskH * 0.48, depth * 0.32]
    )
  } else {
    // Reading desk: 4 tapered wooden legs with brass foot ferrules + under-top apron & center drawer
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const lx = sx * (width / 2 - 0.1)
        const lz = sz * (depth / 2 - 0.1)
        batcher.add(
          new THREE.CylinderGeometry(0.036, 0.024, deskH - 0.04, lite ? 7 : 12),
          drawerBodyMat,
          [lx, (deskH - 0.04) / 2, lz]
        )
        batcher.add(
          new THREE.CylinderGeometry(0.027, 0.025, 0.045, lite ? 7 : 10),
          handleMat,
          [lx, 0.022, lz]
        )
      }
    }
    batcher.add(
      roundedBox(width - 0.16, 0.09, depth - 0.16, 0.018, lite),
      drawerBodyMat,
      [0, deskH - 0.075, 0]
    )
    batcher.add(
      roundedBox(0.16, 0.016, 0.024, 0.006, lite),
      handleMat,
      [0, deskH - 0.075, depth / 2 - 0.068]
    )
  }

  // Bevelled wood-grained desktop slab
  batcher.add(
    roundedBox(width, topThick, depth, 0.024, lite),
    topWoodMat,
    [0, deskH, 0]
  )

  const showMonitors = variant !== "reading"
  const dual = opts.dualMonitor ?? variant === "boss"
  const screenPlanes: {
    pos: [number, number, number]
    rotY: number
    w: number
    h: number
    variant: MonitorScreenVariant
  }[] = []

  if (showMonitors) {
    const blotterMat = matteMat(
      variant === "boss" ? "#162138" : "#253147",
      0.72,
      0.06
    )
    const bezelMat = getBezelMat()
    const standMetalMat = metalMat("#64748b", 0.28, 0.78)
    const keyBaseMat = matteMat("#cfd7e3", 0.48, 0.08)
    const keyCapMat = matteMat("#f8fafc", 0.56, 0.04)
    const powerLedMat = glowMat("#34c38f", 1.2)
    // Soft leather desk blotter pad
    const blotterW = Math.min(width * 0.56, 1.06)
    const blotterD = Math.min(depth * 0.44, 0.4)
    batcher.add(
      roundedBox(blotterW, 0.008, blotterD, 0.003, lite),
      blotterMat,
      [0, topSurfaceY + 0.004, depth * 0.1],
      undefined,
      undefined,
      false
    )

    // Sculpted Monitor(s) with bevelled bezel, chin, metallic neck & base stand
    const xs = dual ? [-0.34, 0.34] : [0]
    for (const mx of xs) {
      const yaw = dual ? (mx < 0 ? 0.14 : -0.14) : 0
      const mz = -depth * 0.17
      const cos = Math.cos(yaw)
      const sin = Math.sin(yaw)

      // Weighted flat bevelled metallic foot + angled neck column
      batcher.add(
        roundedBox(0.21, 0.016, 0.14, 0.007, lite),
        standMetalMat,
        [mx, topSurfaceY + 0.008, mz],
        [0, yaw, 0]
      )
      batcher.add(
        roundedBox(0.048, 0.17, 0.032, 0.01, lite),
        standMetalMat,
        [mx - sin * 0.025, topSurfaceY + 0.095, mz - cos * 0.025],
        [-0.08, yaw, 0]
      )
      // Sleek bevelled monitor body + contoured rear hump + power LED
      batcher.add(
        roundedBox(0.58, 0.35, 0.034, 0.014, lite),
        bezelMat,
        [mx, topSurfaceY + 0.285, mz],
        [0, yaw, 0]
      )
      batcher.add(
        roundedBox(0.32, 0.16, 0.024, 0.01, lite),
        bezelMat,
        [mx - sin * 0.022, topSurfaceY + 0.275, mz - cos * 0.022],
        [0, yaw, 0]
      )
      batcher.add(
        new THREE.SphereGeometry(0.008, 6, 6),
        powerLedMat,
        [mx + cos * 0.24 + sin * 0.018, topSurfaceY + 0.128, mz - sin * 0.24 + cos * 0.018],
        undefined,
        undefined,
        false
      )

      screenPlanes.push({
        pos: [mx + sin * 0.02, topSurfaceY + 0.292, mz + cos * 0.02],
        rotY: yaw,
        w: 0.525,
        h: 0.295,
        variant: variant === "boss" ? "boss" : "staff",
      })
    }

    // Sloped keyboard chassis + sculpted keycap clusters
    const kz = depth * 0.13
    batcher.add(
      roundedBox(0.42, 0.018, 0.14, 0.007, lite),
      keyBaseMat,
      [-0.03, topSurfaceY + 0.014, kz],
      [0.08, 0, 0]
    )
    batcher.add(
      roundedBox(0.28, 0.012, 0.1, 0.004, lite),
      keyCapMat,
      [-0.08, topSurfaceY + 0.025, kz],
      [0.08, 0, 0],
      undefined,
      false
    )
    batcher.add(
      roundedBox(0.085, 0.012, 0.1, 0.004, lite),
      keyCapMat,
      [0.125, topSurfaceY + 0.025, kz],
      [0.08, 0, 0],
      undefined,
      false
    )

    // Ergonomic sculpted mouse on subtle pad
    batcher.add(
      roundedBox(0.062, 0.028, 0.098, 0.014, lite),
      keyCapMat,
      [0.27, topSurfaceY + 0.016, kz + 0.01]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.007, 0.007, 0.016, 6),
      bezelMat,
      [0.27, topSurfaceY + 0.03, kz - 0.012],
      [0, 0, Math.PI / 2],
      undefined,
      false
    )

    // Executive boss desk accents: brass pen cup & leather portfolio on left wing
    if (variant === "boss" && width >= 2.2) {
      const accentPenMat = matteMat("#c0392b", 0.34, 0.06)
      const px = -width * 0.37
      const pz = -depth * 0.12
      batcher.add(
        new THREE.CylinderGeometry(0.04, 0.036, 0.098, lite ? 8 : 14),
        handleMat,
        [px, topSurfaceY + 0.049, pz]
      )
      batcher.add(
        new THREE.CylinderGeometry(0.007, 0.007, 0.15, 6),
        bezelMat,
        [px - 0.012, topSurfaceY + 0.085, pz],
        [0.12, 0, 0.16]
      )
      batcher.add(
        new THREE.CylinderGeometry(0.007, 0.007, 0.145, 6),
        accentPenMat,
        [px + 0.014, topSurfaceY + 0.082, pz + 0.008],
        [-0.1, 0, -0.18]
      )
      batcher.add(
        roundedBox(0.32, 0.024, 0.24, 0.008, lite),
        blotterMat,
        [-width * 0.34, topSurfaceY + 0.012, depth * 0.15],
        [0, 0.12, 0]
      )
    }
  } else {
    // Reading desk in Document Room: open ledger book, stacked archive folders, pen cup & brass lamp
    const pageMat = matteMat("#faf5e8", 0.66, 0.02)
    const folderNavyMat = matteMat("#1f3a68", 0.56, 0.05)
    const folderTerraMat = matteMat("#b45309", 0.56, 0.05)
    const lampShadeMat = matteMat("#1e5631", 0.34, 0.12)
    const bulbMat = glowMat("#fde68a", 1.2)

    // Open ledger book in center
    batcher.add(
      roundedBox(0.46, 0.014, 0.3, 0.005, lite),
      folderNavyMat,
      [-0.08, topSurfaceY + 0.008, 0.04],
      [0, 0.08, 0]
    )
    for (const side of [-1, 1] as const) {
      batcher.add(
        roundedBox(0.21, 0.018, 0.27, 0.006, lite),
        pageMat,
        [-0.08 + side * 0.11, topSurfaceY + 0.02, 0.04],
        [0, 0.08, -side * 0.04]
      )
    }

    // Stacked document folders on right
    batcher.add(
      roundedBox(0.32, 0.028, 0.24, 0.008, lite),
      folderNavyMat,
      [width * 0.28, topSurfaceY + 0.014, 0.08],
      [0, -0.14, 0]
    )
    batcher.add(
      roundedBox(0.3, 0.024, 0.23, 0.008, lite),
      folderTerraMat,
      [width * 0.27, topSurfaceY + 0.04, 0.07],
      [0, 0.05, 0]
    )

    // Classic banker's reading lamp on back-left corner
    const lx = -width * 0.34
    const lz = -depth * 0.2
    batcher.add(
      new THREE.CylinderGeometry(0.08, 0.092, 0.024, lite ? 8 : 14),
      handleMat,
      [lx, topSurfaceY + 0.012, lz]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.016, 0.02, 0.34, lite ? 6 : 10),
      handleMat,
      [lx, topSurfaceY + 0.18, lz]
    )
    batcher.add(
      roundedBox(0.22, 0.085, 0.12, 0.036, lite),
      lampShadeMat,
      [lx + 0.04, topSurfaceY + 0.36, lz + 0.03],
      [0.24, 0.22, 0]
    )
    batcher.add(
      new THREE.SphereGeometry(0.026, 8, 6),
      bulbMat,
      [lx + 0.04, topSurfaceY + 0.33, lz + 0.03],
      undefined,
      undefined,
      false
    )
  }

  // Cozy lathe-turned coffee mug with handle on wooden coaster
  if (opts.hasMug ?? variant === "boss") {
    const mugMat = matteMat("#faf8f5", 0.24, 0.06)
    const mugRimMat = matteMat("#c0392b", 0.34, 0.06)
    const coffeeMat = matteMat("#3f1f0e", 0.3, 0.04)
    const coasterMat = matteMat("#7a5230", 0.68, 0.04)
    const mx = width * 0.35
    const mz = depth * 0.14
    batcher.add(
      new THREE.CylinderGeometry(0.062, 0.062, 0.008, lite ? 8 : 14),
      coasterMat,
      [mx, topSurfaceY + 0.004, mz],
      undefined,
      undefined,
      false
    )
    createMugParts(batcher, [mx, topSurfaceY + 0.008, mz], {
      radius: 0.046,
      height: 0.09,
      bodyMat: mugMat,
      rimMat: mugRimMat,
      coffeeMat,
      handleYaw: 0.5,
      lite,
    })
  }

  // Sculpted angled nameplate holder facing front (+Z)
  let nameplateData: { w: number; tex: THREE.Texture } | null = null
  if (opts.nameplate) {
    const plateW = Math.min(width * 0.62, 1.05)
    batcher.add(
      roundedBox(plateW + 0.04, 0.026, 0.095, 0.009, lite),
      opts.highlightGold ? handleMat : drawerBodyMat,
      [0, topSurfaceY + 0.013, depth * 0.42]
    )
    batcher.add(
      roundedBox(plateW, 0.215, 0.042, 0.014, lite),
      getBezelMat(),
      [0, topSurfaceY + 0.105, depth * 0.42],
      [-0.22, 0, 0]
    )
    nameplateData = {
      w: plateW,
      tex: createSignTexture(opts.nameplate, {
        style: opts.highlightGold ? "gold_plate" : "navy_gold",
        width: 440,
        height: 112,
        anisotropy: lite ? 4 : 16,
      }),
    }
  }

  batcher.flushInto(group)

  for (const sp of screenPlanes) {
    addDirectMesh(
      group,
      new THREE.PlaneGeometry(sp.w, sp.h),
      screenMat(sp.variant),
      sp.pos,
      [0, sp.rotY, 0],
      false
    )
  }

  if (nameplateData) {
    const plateMat = new THREE.MeshStandardMaterial({
      map: nameplateData.tex,
      roughness: 0.3,
      metalness: 0.16,
    })
    addDirectMesh(
      group,
      new THREE.PlaneGeometry(nameplateData.w - 0.04, 0.186),
      plateMat,
      [0, topSurfaceY + 0.11, depth * 0.446],
      [-0.22, 0, 0],
      false
    )
  }

  if (opts.withChair ?? variant !== "reading") {
    mountSwivelChair(
      group,
      variant === "boss" ? "#1e2e52" : "#2f3e60",
      [0, 0, -depth * 0.56],
      0,
      lite
    )
  }

  return wrapProp(group)
}

// ---------- 10. Bookshelf & Document Shelf (InstancedMesh Books, Binders & Archive Boxes) ----------

function getUnitBookGeometry(lite: boolean): THREE.BufferGeometry {
  return getCachedGeometry(`unitBook:${lite ? "lite" : "hi"}`, () =>
    roundedBox(1, 1, 1, 0.1, true)
  )
}

function getUnitBoxGeometry(lite: boolean): THREE.BufferGeometry {
  return getCachedGeometry(`unitArchiveBox:${lite ? "lite" : "hi"}`, () =>
    roundedBox(1, 1, 1, 0.06, true)
  )
}

interface InstanceTransformColor {
  pos: [number, number, number]
  rot: [number, number, number]
  scale: [number, number, number]
  color: string
}

function emitInstancedGroup(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  items: readonly InstanceTransformColor[],
  castShadow = true
): void {
  if (items.length === 0) return
  const inst = new THREE.InstancedMesh(geometry, material, items.length)
  inst.castShadow = castShadow
  inst.receiveShadow = true
  const color = new THREE.Color()
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!
    scratchPos.set(item.pos[0], item.pos[1], item.pos[2])
    scratchEuler.set(item.rot[0], item.rot[1], item.rot[2])
    scratchQuat.setFromEuler(scratchEuler)
    scratchScale.set(item.scale[0], item.scale[1], item.scale[2])
    scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
    inst.setMatrixAt(i, scratchMatrix)
    color.set(item.color)
    inst.setColorAt(i, color)
  }
  inst.instanceMatrix.needsUpdate = true
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  inst.computeBoundingSphere()
  parent.add(inst)
}

export function createBookshelf(
  width: number,
  height: number,
  depth: number,
  opts?: BookshelfOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const resolvedVariant =
    opts?.variant && opts.variant !== "auto"
      ? opts.variant
      : depth >= 0.55
        ? "documents"
        : "books"

  const group = new THREE.Group()
  group.name =
    resolvedVariant === "documents" ? "prop-document-shelf" : "prop-bookshelf"
  const batcher = new PropMeshBatcher()

  const shelfWoodMat = woodMat("walnut", 0.56)
  const backMat = matteMat("#462f1a", 0.72, 0.04)
  const trimGoldMat = metalMat("#d9a94c", 0.3, 0.76)

  const thick = 0.058
  const baseH = 0.095

  // Recessed kickplate base + wood-grained back panel + bevelled sides + crown cornice
  batcher.add(
    roundedBox(width - 0.04, baseH, depth - 0.04, 0.012, lite),
    backMat,
    [0, baseH / 2, -0.01]
  )
  batcher.add(
    roundedBox(width - 0.02, height - baseH * 0.5, 0.036, 0.008, lite),
    backMat,
    [0, baseH * 0.25 + (height - baseH * 0.5) / 2, -depth / 2 + 0.02]
  )
  for (const side of [-1, 1] as const) {
    batcher.add(
      roundedBox(thick, height, depth, 0.016, lite),
      shelfWoodMat,
      [side * (width / 2 - thick / 2), height / 2, 0]
    )
  }
  // Sculpted 2-step top crown cornice molding
  batcher.add(
    roundedBox(width + 0.04, 0.055, depth + 0.03, 0.016, lite),
    shelfWoodMat,
    [0, height - 0.04, 0]
  )
  batcher.add(
    roundedBox(width + 0.08, 0.048, depth + 0.06, 0.016, lite),
    shelfWoodMat,
    [0, height, 0]
  )

  const shelves = Math.max(2, Math.min(5, Math.round((height - baseH) / 0.42)))
  const innerW = Math.max(0.26, width - thick * 2 - 0.06)
  const shelfStep = (height - baseH - 0.1) / shelves

  const bookInstances: InstanceTransformColor[] = []
  const labelInstances: InstanceTransformColor[] = []
  const boxInstances: InstanceTransformColor[] = []
  const lidInstances: InstanceTransformColor[] = []

  const cozyBookColors = [
    "#9b2c2c",
    "#234e70",
    "#c9922c",
    "#285e47",
    "#5b3a6e",
    "#b85c38",
    "#e8dfd1",
    "#2d6a7a",
  ]
  const binderColors = [
    "#1e3a5f",
    "#2c5282",
    "#7f1d1d",
    "#1e4d3b",
    "#92400e",
    "#334155",
  ]
  const archiveBoxColors = ["#d6c3a3", "#e6dcc8", "#c9b38c", "#d8cbb4"]

  for (let s = 0; s < shelves; s += 1) {
    const sy = baseH + s * shelfStep
    const shelfTop = sy + 0.022
    batcher.add(
      roundedBox(width - thick * 1.4, 0.044, depth - 0.01, 0.012, lite),
      shelfWoodMat,
      [0, sy, 0]
    )

    let cursor = -innerW / 2 + 0.025
    let idx = s * 11 + 3

    if (resolvedVariant === "documents") {
      // Mix archive banker boxes + labeled ring binders across shelves
      const boxRow = s === 0 || s === shelves - 1
      if (boxRow) {
        const boxW = Math.min(0.36, innerW * 0.28)
        const boxH = Math.min(shelfStep - 0.1, 0.26)
        const boxD = depth * 0.78
        const maxBoxes = Math.max(1, Math.floor((innerW - 0.5) / (boxW + 0.05)))
        for (let b = 0; b < maxBoxes; b += 1) {
          const bx = cursor + boxW / 2
          const col = archiveBoxColors[(s + b) % archiveBoxColors.length]!
          boxInstances.push({
            pos: [bx, shelfTop + boxH / 2, 0.02],
            rot: [0, ((b % 3) - 1) * 0.03, 0],
            scale: [boxW, boxH, boxD],
            color: col,
          })
          // Overhanging lid
          lidInstances.push({
            pos: [bx, shelfTop + boxH + 0.018, 0.02],
            rot: [0, ((b % 3) - 1) * 0.03, 0],
            scale: [boxW + 0.024, 0.042, boxD + 0.022],
            color: col,
          })
          // Front white index card label
          labelInstances.push({
            pos: [bx, shelfTop + boxH * 0.56, 0.02 + boxD / 2 + 0.004],
            rot: [0, 0, 0],
            scale: [boxW * 0.42, boxH * 0.24, 0.008],
            color: "#f8fafc",
          })
          cursor += boxW + 0.05
        }
        cursor += 0.04
      }

      // Fill remaining shelf span with tall lever-arch office binders + spine labels
      while (cursor < innerW / 2 - 0.095) {
        if ((idx % 7) === 6 && cursor < innerW / 2 - 0.22) {
          cursor += 0.07 // Natural shelf breathing gap
        }
        const bw = 0.068 + (idx % 3) * 0.01
        const bh = Math.min(shelfStep - 0.07, 0.31 + (idx % 2) * 0.02)
        const bd = depth * 0.74
        const lean = idx % 9 === 0 && cursor + bw + 0.09 < innerW / 2 ? -0.18 : 0
        const bx = cursor + bw / 2 + (lean !== 0 ? 0.035 : 0)
        const col = binderColors[idx % binderColors.length]!
        bookInstances.push({
          pos: [bx, shelfTop + bh / 2, 0.025],
          rot: [0, 0, lean],
          scale: [bw, bh, bd],
          color: col,
        })
        // White spine label strip + brass finger ring accent
        labelInstances.push({
          pos: [bx - Math.sin(lean) * 0.04, shelfTop + bh * 0.68, 0.025 + bd / 2 + 0.004],
          rot: [0, 0, lean],
          scale: [bw * 0.68, bh * 0.26, 0.008],
          color: "#f4f6fa",
        })
        if (!lite && lean === 0) {
          batcher.add(
            new THREE.TorusGeometry(0.012, 0.003, 5, 8),
            trimGoldMat,
            [bx, shelfTop + bh * 0.25, 0.025 + bd / 2 + 0.006],
            undefined,
            undefined,
            false
          )
        }
        cursor += bw + (lean !== 0 ? 0.08 : 0.012)
        idx += 1
      }
    } else {
      // Cozy varied bookshelf: standing varied books, occasional tilted book, horizontal stack + gold bookend
      while (cursor < innerW / 2 - 0.1) {
        // Horizontal stacked book pile once per alternating shelf
        if (idx % 11 === 5 && cursor + 0.26 < innerW / 2) {
          const stackW = 0.22
          const stackD = depth * 0.68
          for (let hIdx = 0; hIdx < 3; hIdx += 1) {
            const hh = 0.036 + (hIdx % 2) * 0.008
            bookInstances.push({
              pos: [
                cursor + stackW / 2 + (hIdx - 1) * 0.008,
                shelfTop + hh / 2 + hIdx * 0.04,
                0.02,
              ],
              rot: [0, (hIdx - 1) * 0.08, 0],
              scale: [stackW - hIdx * 0.014, hh, stackD],
              color: cozyBookColors[(idx + hIdx) % cozyBookColors.length]!,
            })
          }
          // Cute brass sphere decor sitting on top of the book stack
          if (!lite) {
            batcher.add(
              new THREE.SphereGeometry(0.038, 10, 8),
              trimGoldMat,
              [cursor + stackW / 2, shelfTop + 0.158, 0.02]
            )
          }
          cursor += stackW + 0.08
          idx += 2
          continue
        }

        const bw = 0.044 + ((idx * 17) % 5) * 0.011
        const bh = Math.min(
          shelfStep - 0.075,
          shelfStep * (0.58 + ((idx * 29) % 5) * 0.068)
        )
        const bd = depth * (0.64 + (idx % 3) * 0.06)
        const isLeaning = idx % 8 === 7 && cursor + bw + 0.11 < innerW / 2
        const tilt = isLeaning ? -0.24 : 0
        const bx = cursor + bw / 2 + (isLeaning ? 0.042 : 0)

        bookInstances.push({
          pos: [bx, shelfTop + bh / 2, 0.02 + (idx % 2) * 0.015],
          rot: [0, 0, tilt],
          scale: [bw, bh, bd],
          color: cozyBookColors[idx % cozyBookColors.length]!,
        })
        cursor += bw + (isLeaning ? 0.11 : 0.01)
        idx += 1
      }
    }
  }

  batcher.flushInto(group)

  if (bookInstances.length > 0) {
    const instWhiteMat = matteMat("#ffffff", 0.56, 0.05)
    emitInstancedGroup(group, getUnitBookGeometry(lite), instWhiteMat, bookInstances)
  }
  if (boxInstances.length > 0 || lidInstances.length > 0) {
    const instBoxMat = matteMat("#ffffff", 0.78, 0.02)
    const unitBox = getUnitBoxGeometry(lite)
    emitInstancedGroup(group, unitBox, instBoxMat, boxInstances)
    emitInstancedGroup(group, unitBox, instBoxMat, lidInstances)
  }
  if (labelInstances.length > 0) {
    const instLabelMat = matteMat("#ffffff", 0.45, 0.02)
    emitInstancedGroup(
      group,
      getUnitBoxGeometry(true),
      instLabelMat,
      labelInstances,
      false
    )
  }

  return wrapProp(group)
}

export function createDocumentShelf(
  width: number,
  height: number,
  depth: number,
  opts?: PropDetailOptions
): DisposableProp {
  return createBookshelf(width, height, depth, {
    ...opts,
    variant: "documents",
  })
}

// ---------- 11. Conference Table + Instanced Swivel Chairs ----------

export function createConferenceTable(
  width: number,
  depth: number,
  chairCount = 8,
  opts?: PropDetailOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-conference-table"
  const batcher = new PropMeshBatcher()

  const topMat = marbleMat("white_gold", 0.3)
  const apronWoodMat = woodMat("walnut", 0.5)
  const baseMat = metalMat("#25334e", 0.34, 0.64)
  const goldMat = metalMat("#e4b44a", 0.24, 0.82)
  const trayMat = metalMat("#475569", 0.3, 0.78)
  const puckMat = matteMat("#182032", 0.36, 0.24)
  const ledMat = glowMat("#34c38f", 1.15)

  const tableH = 0.76
  const straightW = Math.max(0.2, width - depth)

  // Seamless bevelled stadium/pill tabletop + recessed walnut under-apron
  batcher.add(
    extrudedStadium(width, depth, 0.068, 0.016, lite),
    topMat,
    [0, tableH, 0]
  )
  batcher.add(
    extrudedStadium(width - 0.12, depth - 0.12, 0.048, 0.012, lite),
    apronWoodMat,
    [0, tableH - 0.048, 0]
  )

  // Twin architectural sculpted lathe pedestals with weighted floor plates & gold collars
  const pedPts: THREE.Vector2[] = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(0.32, 0),
    new THREE.Vector2(0.3, 0.045),
    new THREE.Vector2(0.18, 0.12),
    new THREE.Vector2(0.145, (tableH - 0.06) * 0.55),
    new THREE.Vector2(0.2, tableH - 0.06),
  ]
  const pedGeom = new THREE.LatheGeometry(pedPts, lite ? 10 : 18)

  for (const side of [-1, 1] as const) {
    const px = side * Math.max(0.32, straightW * 0.36)
    batcher.add(pedGeom, baseMat, [px, 0, 0], undefined, undefined, true, true, false)
    batcher.add(
      new THREE.TorusGeometry(0.175, 0.016, 6, lite ? 10 : 18),
      goldMat,
      [px, 0.095, 0],
      [Math.PI / 2, 0, 0]
    )
    batcher.add(
      new THREE.TorusGeometry(0.19, 0.014, 6, lite ? 10 : 18),
      goldMat,
      [px, tableH - 0.095, 0],
      [Math.PI / 2, 0, 0]
    )
  }
  pedGeom.dispose()

  const topY = tableH + 0.034

  // Central brushed-steel power/cable hub with split lids + conference speakerphone puck
  const trayW = Math.max(0.42, straightW * 0.56)
  batcher.add(
    roundedBox(trayW, 0.016, 0.21, 0.006, lite),
    trayMat,
    [0, topY + 0.008, 0],
    undefined,
    undefined,
    false
  )
  batcher.add(
    new THREE.CylinderGeometry(0.11, 0.13, 0.032, lite ? 10 : 18),
    puckMat,
    [0, topY + 0.024, 0]
  )
  batcher.add(
    new THREE.TorusGeometry(0.075, 0.006, 5, lite ? 10 : 16),
    ledMat,
    [0, topY + 0.042, 0],
    [Math.PI / 2, 0, 0],
    undefined,
    false
  )

  // Subtle tabletop meeting props (notepads & carafe)
  if (!lite && width >= 2.6) {
    const folderMat = matteMat("#1e3a5f", 0.52, 0.06)
    const paperMat = matteMat("#f8fafc", 0.65, 0.02)
    const glassMat = matteMat("#d8eefc", 0.14, 0.1, {
      transparent: true,
      opacity: 0.46,
    })
    for (const [fx, fz, yaw] of [
      [-width * 0.28, depth * 0.26, 0.08],
      [width * 0.26, -depth * 0.26, -0.1],
      [-width * 0.1, -depth * 0.28, 0.04],
    ] as const) {
      batcher.add(
        roundedBox(0.24, 0.014, 0.18, 0.004, true),
        folderMat,
        [fx, topY + 0.007, fz],
        [0, yaw, 0],
        undefined,
        false
      )
      batcher.add(
        roundedBox(0.2, 0.006, 0.14, 0.002, true),
        paperMat,
        [fx, topY + 0.016, fz],
        [0, yaw, 0],
        undefined,
        false
      )
    }
    // Water carafe + 2 tumblers near center-right
    const cx = width * 0.18
    batcher.add(
      new THREE.CylinderGeometry(0.036, 0.056, 0.19, 12),
      glassMat,
      [cx, topY + 0.095, 0.05],
      undefined,
      undefined,
      false
    )
    for (const tz of [-0.08, 0.18]) {
      batcher.add(
        new THREE.CylinderGeometry(0.028, 0.024, 0.07, 10),
        glassMat,
        [cx + 0.09, topY + 0.035, tz],
        undefined,
        undefined,
        false
      )
    }
  }

  batcher.flushInto(group)

  // Swivel chairs arranged along north & south sides via InstancedMesh!
  const perSide = Math.max(1, Math.floor(chairCount / 2))
  const totalChairs = perSide * 2
  const span = Math.max(0.4, width - 0.9)
  const chairSpecs = getSwivelChairSpecs("#283654", lite)

  const chairTransforms: { x: number; z: number; rotY: number }[] = []
  for (let i = 0; i < perSide; i += 1) {
    const t = perSide === 1 ? 0.5 : i / (perSide - 1)
    const cx = -span / 2 + t * span
    chairTransforms.push({ x: cx, z: -depth / 2 - 0.34, rotY: 0 })
    chairTransforms.push({ x: cx, z: depth / 2 + 0.34, rotY: Math.PI })
  }

  for (const spec of chairSpecs) {
    const inst = new THREE.InstancedMesh(
      spec.geometry,
      spec.material,
      totalChairs
    )
    inst.castShadow = spec.castShadow
    inst.receiveShadow = spec.receiveShadow
    for (let i = 0; i < chairTransforms.length; i += 1) {
      const ct = chairTransforms[i]!
      scratchPos.set(ct.x, 0, ct.z)
      scratchEuler.set(0, ct.rotY, 0)
      scratchQuat.setFromEuler(scratchEuler)
      scratchScale.set(1, 1, 1)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
      inst.setMatrixAt(i, scratchMatrix)
    }
    inst.instanceMatrix.needsUpdate = true
    inst.computeBoundingSphere()
    group.add(inst)
  }

  return wrapProp(group)
}

// ---------- 12. Freestanding Office Achievement Standee ----------

export function createAchievementStandee(
  canvas: HTMLCanvasElement,
  width = 2.15,
  height = 3.45,
  opts?: PropDetailOptions
): LiveBoardProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-achievement-standee"
  const batcher = new PropMeshBatcher()

  const frameMat = matteMat("#0e1830", 0.36, 0.24)
  const goldMat = metalMat("#e9b949", 0.22, 0.86, "#a16207", 0.14)
  const legMat = metalMat("#2e3c58", 0.3, 0.74)
  const chromeMat = metalMat("#cbd5e1", 0.22, 0.86)
  const rubberMat = matteMat("#101624", 0.82, 0.08)
  const spotGlowMat = glowMat("#fff1c2", 1.1)

  const legH = 0.42
  const boardH = height - legH
  const boardY = legH + boardH / 2

  // Sculpted weighted exhibition baseplate + corner rubber feet + gold skirt collar
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      batcher.add(
        new THREE.CylinderGeometry(0.05, 0.055, 0.02, 8),
        rubberMat,
        [sx * (width * 0.42), 0.01, sz * 0.25]
      )
    }
  }
  batcher.add(
    roundedBox(width * 0.94, 0.085, 0.62, 0.026, lite),
    legMat,
    [0, 0.058, 0]
  )
  batcher.add(
    roundedBox(width * 0.96, 0.028, 0.64, 0.012, lite),
    goldMat,
    [0, 0.105, 0]
  )

  // Twin chrome uprights with gold collars + rear angled support kickstand braces
  for (const side of [-1, 1] as const) {
    const sx = side * (width * 0.34)
    batcher.add(
      new THREE.CylinderGeometry(0.042, 0.05, legH + 0.1, lite ? 8 : 14),
      chromeMat,
      [sx, legH / 2 + 0.08, 0]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.062, 0.068, 0.045, lite ? 8 : 14),
      goldMat,
      [sx, 0.13, 0]
    )
    // Rear diagonal support strut bracing the standee cabinet
    const braceCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx, 0.11, -0.24),
      new THREE.Vector3(sx, legH + 0.52, -0.05),
    ])
    batcher.add(
      new THREE.TubeGeometry(braceCurve, lite ? 4 : 8, 0.018, 6, false),
      legMat,
      [0, 0, 0]
    )
  }

  // Bevelled deep-navy standee cabinet + mitered brushed-gold frame + corner caps
  batcher.add(
    roundedBox(width, boardH, 0.12, 0.028, lite),
    frameMat,
    [0, boardY, 0]
  )
  batcher.add(
    roundedBox(width + 0.09, 0.066, 0.155, 0.02, lite),
    goldMat,
    [0, legH + boardH, 0]
  )
  batcher.add(
    roundedBox(width + 0.09, 0.066, 0.155, 0.02, lite),
    goldMat,
    [0, legH, 0]
  )
  for (const side of [-1, 1] as const) {
    batcher.add(
      roundedBox(0.066, boardH + 0.06, 0.155, 0.02, lite),
      goldMat,
      [side * (width / 2 + 0.022), boardY, 0]
    )
    for (const sy of [legH, legH + boardH]) {
      batcher.add(
        roundedBox(0.11, 0.11, 0.175, 0.022, lite),
        goldMat,
        [side * (width / 2 + 0.022), sy, 0]
      )
    }
  }

  // Subtle top exhibition spotlight hood bar illuminating poster face
  batcher.add(
    roundedBox(width * 0.54, 0.036, 0.14, 0.012, lite),
    goldMat,
    [0, legH + boardH + 0.045, 0.08]
  )
  batcher.add(
    roundedBox(width * 0.46, 0.012, 0.04, 0.004, lite),
    spotGlowMat,
    [0, legH + boardH + 0.025, 0.11],
    undefined,
    undefined,
    false
  )

  batcher.flushInto(group)

  let texture: THREE.Texture
  try {
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = lite ? 4 : 16
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
    texture = tex
  } catch {
    texture = new THREE.DataTexture(new Uint8Array([14, 24, 48, 255]), 1, 1)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
  }

  const faceMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: texture,
    emissiveIntensity: 0.34,
    roughness: 0.26,
  })
  addDirectMesh(
    group,
    new THREE.PlaneGeometry(width - 0.08, boardH - 0.08),
    faceMat,
    [0, boardY, 0.072],
    undefined,
    false
  )

  const retained = retainSubtreeSharedRefs(group)
  let disposed = false
  return {
    group,
    texture,
    update: () => {
      texture.needsUpdate = true
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      disposePropGroup(group)
      releaseSubtreeSharedRefs(retained)
    },
  }
}

// ---------- 13. Plush Bevelled Oval / Rounded Rug ----------

export function createRug(
  width: number,
  depth: number,
  opts?: RugOptions
): DisposableProp {
  const lite = resolveLite(opts)
  const group = new THREE.Group()
  group.name = "prop-rug"
  const batcher = new PropMeshBatcher()

  const shape = opts?.shape ?? "oval"
  const colorHex = opts?.colorHex ?? "#f1e6d2"
  const borderHex = opts?.borderHex ?? "#22325a"
  const borderW = Math.min(
    opts?.borderWidth ?? 0.14,
    Math.min(width, depth) * 0.28
  )

  const fillMat = clothMat(colorHex, "rug")
  const borderMat = clothMat(borderHex, "rug")
  const pipingMat = plainClothMat("#e4b95a")

  const innerW = Math.max(0.14, width - borderW * 2)
  const innerD = Math.max(0.14, depth - borderW * 2)

  if (shape === "oval") {
    batcher.add(
      extrudedEllipse(width, depth, 0.022, 0.008, lite),
      borderMat,
      [0, 0.011, 0],
      undefined,
      undefined,
      false,
      true
    )
    batcher.add(
      extrudedEllipse(innerW + 0.04, innerD + 0.04, 0.025, 0.007, lite),
      pipingMat,
      [0, 0.013, 0],
      undefined,
      undefined,
      false,
      true
    )
    batcher.add(
      extrudedEllipse(innerW, innerD, 0.027, 0.007, lite),
      fillMat,
      [0, 0.0145, 0],
      undefined,
      undefined,
      false,
      true
    )
  } else {
    const cornerR = Math.min(width, depth) * 0.14
    const innerCornerR = Math.max(0.04, cornerR - borderW * 0.4)
    batcher.add(
      extrudedRoundedRect(width, depth, 0.022, cornerR, 0.008, lite),
      borderMat,
      [0, 0.011, 0],
      undefined,
      undefined,
      false,
      true
    )
    batcher.add(
      extrudedRoundedRect(
        innerW + 0.04,
        innerD + 0.04,
        0.025,
        innerCornerR + 0.015,
        0.007,
        lite
      ),
      pipingMat,
      [0, 0.013, 0],
      undefined,
      undefined,
      false,
      true
    )
    batcher.add(
      extrudedRoundedRect(innerW, innerD, 0.027, innerCornerR, 0.007, lite),
      fillMat,
      [0, 0.0145, 0],
      undefined,
      undefined,
      false,
      true
    )
  }

  batcher.flushInto(group)
  return wrapProp(group)
}
