import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

import type {
  AvatarGender,
  AvatarId,
  Facing,
  OutfitColorId,
} from "@/pages/trading-floor/net/types.ts"

export type ChibiAnimMode = "idle" | "walk" | "wave" | "bow" | "hop" | "statue"

export type ChibiStatueRank = 1 | 2 | 3 | "empty"

export interface ChibiCharacterSpec {
  avatarId: string
  outfitColorHex?: string | null
  genderHint?: AvatarGender
  isBoss?: boolean
  isThanTai?: boolean
  statueRank?: ChibiStatueRank
  scale?: number
  lite?: boolean
  reducedMotion?: boolean
}

export interface ChibiUpdateState {
  anim: ChibiAnimMode
  facingRad: number
  moveFactor?: number
  animTime?: number
  reducedMotion?: boolean
}

export interface ChibiRig {
  root: THREE.Group
  headHeight: number
  setOutfitColor: (hex: string | null) => void
  setDimmed: (dimmed: boolean) => void
  update: (dt: number, state: ChibiUpdateState) => void
  dispose: () => void
}

export interface ProjectedPoint {
  x: number
  y: number
  visible: boolean
  depth: number
}

export interface WorldTransformConfig {
  logicalW: number
  logicalH: number
  scale: number
}

export interface WorldPoint2D {
  x: number
  z: number
}

export interface LogicalPoint2D {
  x: number
  y: number
}

export type FloorTextureStyle =
  | "marble_cream"
  | "parquet"
  | "carpet_slate"
  | "stone_sand"
  | "ceramic_cream"
  | "red_carpet"

export type ChibiFaceVariant =
  | "male_warm"
  | "male_gentle"
  | "male_energetic"
  | "male_glasses"
  | "female_warm"
  | "female_cheerful"
  | "female_elegant"
  | "female_glasses"
  | "cool_glasses"
  | "thantai"
  | "statue_gold"
  | "statue_silver"
  | "statue_bronze"
  | "statue_empty"

export type ChibiHairStyle =
  | "side_part"
  | "swept_back"
  | "spiky"
  | "slicked"
  | "neat_part"
  | "bob"
  | "ponytail"
  | "long_wavy"
  | "layered_clips"
  | "chignon"
  | "tousled_cool"

export type ChibiOutfitStyle =
  | "suit_tie"
  | "dress_shirt"
  | "polo"
  | "blazer_pin"
  | "skirt_blouse"
  | "dress_belt"
  | "chic_blazer"
  | "tech_blazer"

export interface AvatarStylePreset {
  id: string
  gender: AvatarGender
  hairStyle: ChibiHairStyle
  hairColor: string
  hairHighlight?: string
  skinColor: string
  defaultOutfitHex: string
  bottomHex: string
  innerShirtHex: string
  tieOrAccentHex: string
  shoeHex: string
  outfitStyle: ChibiOutfitStyle
  faceVariant: ChibiFaceVariant
  hasGlasses?: boolean
  glassesColor?: string
  hasHeadband?: boolean
  hasHairClips?: boolean
  hasItEmblem?: boolean
  eyeColor: string
}

export interface SignTextureOptions {
  width?: number
  height?: number
  style?: "navy_gold" | "gold_banner" | "gold_plate" | "medal" | "emblem"
  subtext?: string
  accentColor?: string
  bgColor?: string
  textColor?: string
}

export interface OfficeStandeeEntry {
  rank: 1 | 2 | 3
  name: string
  points: number
}

export interface OfficeStandeePayload {
  teamTitle: string
  monthLabel: string
  subtitle?: string
  top3: readonly OfficeStandeeEntry[]
  personalRank?: {
    rank: number
    points: number
  } | null
  footerText?: string
  emptyText?: string
}

/** Exact outfit palette mirrored from `trading-floor/net/types.ts`. */
export const OUTFIT_COLOR_HEX: Readonly<Record<OutfitColorId, string | null>> =
  {
    default: null,
    navy: "#23395d",
    charcoal: "#2f3542",
    burgundy: "#7c1f2c",
    forest: "#234f3e",
    cobalt: "#2458b8",
    beige: "#c8b294",
    plum: "#58346e",
    gold: "#c69328",
    teal: "#1d6b73",
  }

/** Resolves either an `OutfitColorId` key or a raw `#rrggbb` string to a CSS hex color. */
export function resolveOutfitHex(
  colorIdOrHex: string | null | undefined
): string | null {
  if (!colorIdOrHex || colorIdOrHex === "default") return null
  if (colorIdOrHex in OUTFIT_COLOR_HEX) {
    return OUTFIT_COLOR_HEX[colorIdOrHex as OutfitColorId]
  }
  if (/^#[0-9a-fA-F]{6}$/.test(colorIdOrHex)) return colorIdOrHex
  return null
}

/** Canonical visual presets shared 1-to-1 between 3D Chibi characters and 2D portraits. */
export const AVATAR_STYLE_PRESETS: Readonly<Record<AvatarId, AvatarStylePreset>> =
  {
    male01: {
      id: "male01",
      gender: "male",
      hairStyle: "side_part",
      hairColor: "#261f1b",
      skinColor: "#fddcc1",
      defaultOutfitHex: "#556070",
      bottomHex: "#2c3442",
      innerShirtHex: "#f7f9fc",
      tieOrAccentHex: "#2d6ad0",
      shoeHex: "#23252c",
      outfitStyle: "suit_tie",
      faceVariant: "male_warm",
      eyeColor: "#2a201b",
    },
    male02: {
      id: "male02",
      gender: "male",
      hairStyle: "swept_back",
      hairColor: "#3e2b20",
      skinColor: "#fce0c6",
      defaultOutfitHex: "#4d86c6",
      bottomHex: "#202e48",
      innerShirtHex: "#ffffff",
      tieOrAccentHex: "#1c2d4a",
      shoeHex: "#36251b",
      outfitStyle: "dress_shirt",
      faceVariant: "male_gentle",
      eyeColor: "#31231b",
    },
    male03: {
      id: "male03",
      gender: "male",
      hairStyle: "spiky",
      hairColor: "#231c18",
      skinColor: "#f9d6b8",
      defaultOutfitHex: "#248f74",
      bottomHex: "#b79e78",
      innerShirtHex: "#ffffff",
      tieOrAccentHex: "#e9f5f0",
      shoeHex: "#f1f4f8",
      outfitStyle: "polo",
      faceVariant: "male_energetic",
      eyeColor: "#251c17",
    },
    male04: {
      id: "male04",
      gender: "male",
      hairStyle: "slicked",
      hairColor: "#1d2028",
      skinColor: "#fde0c7",
      defaultOutfitHex: "#23395d",
      bottomHex: "#1b2842",
      innerShirtHex: "#f8fafc",
      tieOrAccentHex: "#9b2638",
      shoeHex: "#1d1e24",
      outfitStyle: "blazer_pin",
      faceVariant: "male_warm",
      eyeColor: "#1e222e",
    },
    male05: {
      id: "male05",
      gender: "male",
      hairStyle: "neat_part",
      hairColor: "#2e241f",
      skinColor: "#fce0c8",
      defaultOutfitHex: "#2e3d5e",
      bottomHex: "#1f2a40",
      innerShirtHex: "#f4f8fc",
      tieOrAccentHex: "#14c8ac",
      shoeHex: "#20232a",
      outfitStyle: "suit_tie",
      faceVariant: "male_glasses",
      hasGlasses: true,
      glassesColor: "#1f2937",
      eyeColor: "#243044",
    },
    female01: {
      id: "female01",
      gender: "female",
      hairStyle: "bob",
      hairColor: "#2a1d17",
      skinColor: "#fee3cc",
      defaultOutfitHex: "#6f3c63",
      bottomHex: "#252b3b",
      innerShirtHex: "#fffaf5",
      tieOrAccentHex: "#e9b949",
      shoeHex: "#262228",
      outfitStyle: "skirt_blouse",
      faceVariant: "female_warm",
      eyeColor: "#33212d",
    },
    female02: {
      id: "female02",
      gender: "female",
      hairStyle: "ponytail",
      hairColor: "#3b261b",
      skinColor: "#fee5cf",
      defaultOutfitHex: "#5594d2",
      bottomHex: "#203154",
      innerShirtHex: "#ffffff",
      tieOrAccentHex: "#f3c64a",
      shoeHex: "#242b3c",
      outfitStyle: "skirt_blouse",
      faceVariant: "female_cheerful",
      eyeColor: "#2c3448",
    },
    female03: {
      id: "female03",
      gender: "female",
      hairStyle: "long_wavy",
      hairColor: "#261813",
      skinColor: "#fee4cd",
      defaultOutfitHex: "#a8385a",
      bottomHex: "#8d2c4a",
      innerShirtHex: "#fff7f2",
      tieOrAccentHex: "#f3c64a",
      shoeHex: "#441f2d",
      outfitStyle: "dress_belt",
      faceVariant: "female_elegant",
      hasHeadband: true,
      eyeColor: "#381f29",
    },
    female04: {
      id: "female04",
      gender: "female",
      hairStyle: "layered_clips",
      hairColor: "#4f3424",
      skinColor: "#fee4ce",
      defaultOutfitHex: "#dfd3be",
      bottomHex: "#24334d",
      innerShirtHex: "#be8c5c",
      tieOrAccentHex: "#e9b949",
      shoeHex: "#5d3f2c",
      outfitStyle: "chic_blazer",
      faceVariant: "female_warm",
      hasHairClips: true,
      eyeColor: "#3c291f",
    },
    female05: {
      id: "female05",
      gender: "female",
      hairStyle: "chignon",
      hairColor: "#241c19",
      skinColor: "#fde2cb",
      defaultOutfitHex: "#1f6b75",
      bottomHex: "#1d2c3f",
      innerShirtHex: "#f8fafc",
      tieOrAccentHex: "#e9b949",
      shoeHex: "#1f2733",
      outfitStyle: "chic_blazer",
      faceVariant: "female_glasses",
      hasGlasses: true,
      glassesColor: "#b68c46",
      eyeColor: "#22343c",
    },
    danhtrongit: {
      id: "danhtrongit",
      gender: "male",
      hairStyle: "tousled_cool",
      hairColor: "#171c26",
      hairHighlight: "#38bdf8",
      skinColor: "#fde0c7",
      defaultOutfitHex: "#1e2a42",
      bottomHex: "#161e2e",
      innerShirtHex: "#22d3ee",
      tieOrAccentHex: "#f5b81c",
      shoeHex: "#141923",
      outfitStyle: "tech_blazer",
      faceVariant: "cool_glasses",
      hasGlasses: true,
      glassesColor: "#0f172a",
      hasItEmblem: true,
      eyeColor: "#163554",
    },
  }

export function getAvatarStylePreset(
  avatarId: string,
  genderHint?: AvatarGender
): AvatarStylePreset {
  if (avatarId in AVATAR_STYLE_PRESETS) {
    return AVATAR_STYLE_PRESETS[avatarId as AvatarId]
  }
  return genderHint === "female"
    ? AVATAR_STYLE_PRESETS.female02
    : AVATAR_STYLE_PRESETS.male02
}

/** Converts 2D logical `(x, y)` (West→East, North→South) to Three.js `(x, z)` (`+X` East, `+Z` South). */
export function logicalToWorld(
  x: number,
  y: number,
  cfg: WorldTransformConfig
): WorldPoint2D {
  return {
    x: (x - cfg.logicalW / 2) * cfg.scale,
    z: (y - cfg.logicalH / 2) * cfg.scale,
  }
}

/** Inverse of `logicalToWorld`. */
export function worldToLogical(
  wx: number,
  wz: number,
  cfg: WorldTransformConfig
): LogicalPoint2D {
  return {
    x: wx / cfg.scale + cfg.logicalW / 2,
    y: wz / cfg.scale + cfg.logicalH / 2,
  }
}

const FACING_RADIANS: Readonly<Record<Facing, number>> = {
  s: 0,
  se: Math.PI / 4,
  e: Math.PI / 2,
  ne: (3 * Math.PI) / 4,
  n: Math.PI,
  nw: (-3 * Math.PI) / 4,
  w: -Math.PI / 2,
  sw: -Math.PI / 4,
}

/**
 * Maps 8-way logical facing to Three.js `rotation.y` radians for characters built facing `+Z` (South).
 * `"s" -> 0`, `"e" -> Math.PI / 2`, `"n" -> Math.PI`, `"w" -> -Math.PI / 2`.
 */
export function facingToRadians(facing: Facing | string): number {
  if (facing in FACING_RADIANS) {
    return FACING_RADIANS[facing as Facing]
  }
  return 0
}

/** Returns signed shortest angular delta in `[-Math.PI, Math.PI]`. */
export function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from + Math.PI) % (Math.PI * 2)
  if (diff < 0) diff += Math.PI * 2
  return diff - Math.PI
}

// ---------- Scene Host Activity Bridge & Static Subtree / Geometry Helpers ----------

export const SCENE_HOST_BRIDGE_KEY = "__chibiHostBridge"

export interface ChibiSceneHostBridge {
  markActive: (holdMs?: number) => void
  requestFrame: () => void
  markShadowDirty: () => void
}

/** Walks up the scene graph to locate an active `ChibiSceneHostBridge` on the owning Scene. */
export function getSceneHostBridge(
  obj: THREE.Object3D | null | undefined
): ChibiSceneHostBridge | null {
  let cur: THREE.Object3D | null | undefined = obj
  while (cur) {
    const bridge = (cur.userData as Record<string, unknown> | undefined)?.[
      SCENE_HOST_BRIDGE_KEY
    ] as ChibiSceneHostBridge | undefined
    if (bridge) return bridge
    cur = cur.parent
  }
  return null
}

/** Updates world matrices once and disables per-frame `matrixAutoUpdate` on all nodes in a static subtree. */
export function freezeStaticSubtree(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    node.matrixAutoUpdate = false
  })
}

/** Ensures a geometry has an index buffer so `mergeGeometries` stays compactly indexed instead of expanding 3x-5x. */
export function ensureIndexedGeometry(
  geom: THREE.BufferGeometry
): THREE.BufferGeometry {
  if (geom.index) return geom
  const pos = geom.getAttribute("position")
  const count = pos ? pos.count : 0
  if (count === 0) return geom
  const idxArray =
    count < 65536 ? new Uint16Array(count) : new Uint32Array(count)
  for (let i = 0; i < count; i += 1) {
    idxArray[i] = i
  }
  geom.setIndex(new THREE.BufferAttribute(idxArray, 1))
  return geom
}

/**
 * Normalizes attributes (`position`, `normal`, `uv`, optional `color`) and merges geometries
 * while preserving indexed buffers to save ~60% geometry RAM and GPU vertex bandwidth.
 * Disposes all input geometries when `disposeInputs` is true.
 */
export function mergeIndexedGeometries(
  geoms: THREE.BufferGeometry[],
  opts?: { includeVertexColors?: boolean; disposeInputs?: boolean }
): THREE.BufferGeometry | null {
  const includeVertexColors = opts?.includeVertexColors ?? false
  const disposeInputs = opts?.disposeInputs ?? true
  if (geoms.length === 0) return null

  const normalizeOne = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
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
    return g
  }

  if (geoms.length === 1) {
    return normalizeOne(geoms[0]!)
  }

  const anyIndexed = geoms.some((g) => g.index !== null)
  const prepared: THREE.BufferGeometry[] = []
  for (const src of geoms) {
    const g = normalizeOne(src)
    if (anyIndexed && !g.index) {
      ensureIndexedGeometry(g)
    }
    prepared.push(g)
  }

  const merged = mergeGeometries(prepared, false)
  if (merged) {
    if (disposeInputs) {
      for (const g of prepared) g.dispose()
    }
    return merged
  }

  // Fallback: non-indexed merge if an unusual attribute layout failed indexed merge
  const fallbackList: THREE.BufferGeometry[] = []
  for (const g of prepared) {
    if (g.index) {
      const ni = g.toNonIndexed()
      if (disposeInputs) g.dispose()
      fallbackList.push(ni)
    } else {
      fallbackList.push(g)
    }
  }
  const fallbackMerged = mergeGeometries(fallbackList, false)
  if (disposeInputs) {
    for (const g of fallbackList) g.dispose()
  }
  return fallbackMerged
}

// ---------- Material Factories & Safe GPU Cleanup ----------

export const SHARED_TEXTURE_FLAG = "__chibiSharedTexture"
export const SHARED_RESOURCE_FLAG = "__chibiSharedResource"

export function markSharedTexture<T extends THREE.Texture>(tex: T): T {
  ;(tex.userData as Record<string, unknown>)[SHARED_TEXTURE_FLAG] = true
  return tex
}

export function isSharedResourceObj(obj: {
  userData?: Record<string, unknown>
}): boolean {
  return Boolean(obj.userData?.[SHARED_RESOURCE_FLAG])
}

export function createMatteMaterial(
  color: THREE.ColorRepresentation,
  opts?: {
    roughness?: number
    metalness?: number
    transparent?: boolean
    opacity?: number
    side?: THREE.Side
  }
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.roughness ?? 0.72,
    metalness: opts?.metalness ?? 0.04,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    side: opts?.side ?? THREE.FrontSide,
  })
}

export function createClothMaterial(
  color: THREE.ColorRepresentation
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: 0.06,
  })
}

export function createMetalMaterial(
  color: THREE.ColorRepresentation,
  opts?: {
    roughness?: number
    metalness?: number
    emissive?: THREE.ColorRepresentation
    emissiveIntensity?: number
    transparent?: boolean
    opacity?: number
  }
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.roughness ?? 0.28,
    metalness: opts?.metalness ?? 0.78,
    emissive: opts?.emissive ?? 0x000000,
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
  })
}

export function createGlowMaterial(
  color: THREE.ColorRepresentation,
  intensity = 0.75,
  opacity = 1
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.1,
    transparent: opacity < 1,
    opacity,
  })
}

function disposeMaterial(mat: THREE.Material): void {
  if (isSharedResourceObj(mat)) return
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

/** Safely disposes geometries, materials, and non-shared textures under `root`. */
export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((node) => {
    if (node instanceof THREE.InstancedMesh) {
      node.dispose()
    }
    const mesh = node as THREE.Mesh
    if (mesh.geometry && !isSharedResourceObj(mesh.geometry)) {
      geometries.add(mesh.geometry)
    }
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined
    if (Array.isArray(material)) {
      for (const m of material) {
        if (m && !isSharedResourceObj(m)) materials.add(m)
      }
    } else if (material && !isSharedResourceObj(material)) {
      materials.add(material)
    }
  })
  for (const g of geometries) g.dispose()
  for (const m of materials) disposeMaterial(m)
}
