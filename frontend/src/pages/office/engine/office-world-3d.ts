/**
 * Procedural Cute & Crisp Chibi 3D World for Khu Văn phòng.
 *
 * 100% procedural Three.js built on `frontend/src/lib/chibi-3d/` (zero external models/images):
 * - 4 distinct floor zones (`parquet`, `carpet_slate`, `stone_sand`, `ceramic_cream`),
 *   per-band woven carpets, corridor runner, VIP standee carpet, Big Team Banner Rug
 *   ("IQX · NHÓM {TÊN SẾP}"), and floor zone decals
 * - Cutaway architectural walls with baseboards, navy wainscoting, gold chair/crown rails,
 *   pilasters, sunlit windows with light pools, ceiling light coves, wall sconces & wall art
 * - Framed glass partitions (corridor + interior dividers) with metallic mullions, privacy
 *   frosting bands, and open wooden/glass doorway doors with brass hardware & room plaques
 * - Phòng Sếp (dual-monitor walnut desk, bookshelf, sofa, executive rug, wall frames,
 *   standing floor lamp, trophy & globe)
 * - Phòng Họp (live Wall Screen w/ acoustic slat backdrop & AV credenza, pill conference
 *   table + 8 chairs w/ notebooks & speakerphone, wall whiteboard, meeting rug)
 * - Phòng Tài Liệu (3 north + 1 east bookshelves, reading desk w/ brass banker's lamp &
 *   archive binders, archive wall plaque, documents rug)
 * - Khu Nhân Viên:
 *   - Full open-plan desk pod grid (24+ desks in back-to-back pods with low acoustic
 *     dividers), rendered via `InstancedMesh` + merged geometries for tight draw-call budgets
 *   - Occupied desks: glowing monitor ON, slightly pulled ergonomic chair, optional mug,
 *     member nameplate (yellow highlighted for self per Spec §3.1)
 *   - Empty desks: powered-off dark matte monitor, neatly tucked-in chair, shared neutral
 *     "Bàn trống" nameplate
 *   - Purposeful decor: personal staff lockers, multifunction printer/copier & supply station,
 *     south-center magazine credenza, compact huddle nook, SW lounge + floor lamp, lush plant
 *     clusters, wall art, Coffee Corner (pantry, espresso, water cooler w/ cup dispenser,
 *     bistro table + stools, Cafe menu chalkboard), and Achievement Standee
 * - Click-to-move golden target ring (respects `prefers-reduced-motion`)
 */
import * as THREE from "three"

import {
  runBuildChunked,
  runBuildSync,
  type BuildSteps,
  type ChunkedBuildOptions,
} from "@/lib/chibi-3d/chunked-build.ts"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

import { prefersReducedMotion } from "@/lib/chibi-3d/character-builder.ts"
import {
  createAchievementStandee,
  createBookshelf,
  createCoffeeTable,
  createConferenceTable,
  createInstancedPottedPlants,
  createOfficeDesk,
  createPantryCounter,
  createRug,
  createSofa,
  createWallBoardFrame,
  type DisposableProp,
  type InstancedPropTransform,
  type LiveBoardProp,
} from "@/lib/chibi-3d/furniture-builder.ts"
import {
  cloneSharedRepeatedTexture,
  createFabricSurfaceTexture,
  createFloorDecalTexture,
  createFloorTexture,
  createMonitorScreenTexture,
  createNameplateAtlasTexture,
  createSignTexture,
  createWoodSurfaceTexture,
  drawOfficeMeetingScreen,
  drawOfficeStandee,
  markStaticCanvasTexture,
  releaseCachedTexture,
  retainCachedTexture,
  safeGet2DContext,
  type NameplateAtlasEntry,
} from "@/lib/chibi-3d/textures.ts"
import {
  createClothMaterial,
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  disposeObject3D,
  freezeStaticSubtree,
  getSceneHostBridge,
  isSharedResourceObj,
  logicalToWorld,
  mergeIndexedGeometries,
  type ChibiSceneHostBridge,
  type OfficeStandeeEntry,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

import type { OfficeLeaderboard, OfficeMeeting } from "../types.ts"
import { formatMeetingScheduleVi } from "../utils.ts"
import {
  OFFICE_BASE_W,
  OFFICE_COFFEE_COOLER_RECT,
  OFFICE_COFFEE_TABLE_RECT,
  OFFICE_DESK_H,
  OFFICE_DESK_W,
  OFFICE_DIVIDER_Y,
  OFFICE_DOORWAYS,
  OFFICE_POD_DIVIDER_H,
  OFFICE_POD_W,
  OFFICE_WALL_THICK,
  OFFICE_WORLD_SCALE,
  buildAllDeskSlots,
  computeOfficeDimensions,
  getHuddleNookPositions,
  getLoungePositions,
  getOfficeLockers,
  getOfficePlants,
  getOfficePodDividers,
  getOfficeWallArt,
  getOfficeWindows,
  getOfficeZones,
  getPrinterStationRect,
  getSouthCredenzaRect,
  getTeamBannerRugRect,
  getZoneRugs,
  type OfficeDeskPlacement,
  type OfficeDeskSlot,
} from "./office-layout.ts"

const FONT_STACK =
  '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const scratchMatrix = new THREE.Matrix4()
const scratchPos = new THREE.Vector3()
const scratchQuat = new THREE.Quaternion()
const scratchEuler = new THREE.Euler()
const scratchScale = new THREE.Vector3()

interface MergedSpec {
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

class MeshBatcher {
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

  flushInto(parent: THREE.Object3D): void {
    for (const spec of this.flushToSpecs()) {
      const mesh = new THREE.Mesh(spec.geometry, spec.material)
      mesh.castShadow = spec.castShadow
      mesh.receiveShadow = spec.receiveShadow
      parent.add(mesh)
    }
  }
}

/** Merges non-instanced static prop meshes per `(material, castShadow, receiveShadow)` while keeping `InstancedMesh` intact. */
function mergeStaticPropsInto(
  props: readonly DisposableProp[],
  parent: THREE.Object3D
): void {
  const buckets = new Map<
    string,
    {
      material: THREE.Material
      castShadow: boolean
      receiveShadow: boolean
      geos: THREE.BufferGeometry[]
    }
  >()

  for (const prop of props) {
    prop.group.updateMatrixWorld(true)
    const toRemove: THREE.Mesh[] = []
    prop.group.traverse((node) => {
      if (
        !(node instanceof THREE.Mesh) ||
        node instanceof THREE.InstancedMesh
      ) {
        return
      }
      if (!node.geometry || Array.isArray(node.material) || !node.material) {
        return
      }
      const cloned = node.geometry.clone()
      cloned.userData = {}
      cloned.applyMatrix4(node.matrixWorld)
      const key = `${node.material.uuid}:${node.castShadow ? 1 : 0}:${node.receiveShadow ? 1 : 0}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = {
          material: node.material,
          castShadow: node.castShadow,
          receiveShadow: node.receiveShadow,
          geos: [],
        }
        buckets.set(key, bucket)
      }
      bucket.geos.push(cloned)
      toRemove.push(node)
    })

    for (const mesh of toRemove) {
      mesh.parent?.remove(mesh)
      if (mesh.geometry && !isSharedResourceObj(mesh.geometry)) {
        mesh.geometry.dispose()
      }
    }
  }

  for (const bucket of buckets.values()) {
    const merged = mergeIndexedGeometries(bucket.geos, { disposeInputs: true })
    if (!merged) continue
    merged.computeBoundingSphere()
    const mesh = new THREE.Mesh(merged, bucket.material)
    mesh.castShadow = bucket.castShadow
    mesh.receiveShadow = bucket.receiveShadow
    parent.add(mesh)
  }
}

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
  const r = Math.max(0.002, Math.min(radius, Math.min(sw, sh, sd) * 0.42))
  return new RoundedBoxGeometry(sw, sh, sd, lite ? 1 : 2, r)
}

function createCanvasTextureSafe(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  anisotropy = 4
): THREE.Texture {
  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    draw(ctx, w, h)
    return true
  }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
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
    new Uint8Array([235, 240, 248, 255]),
    1,
    1,
    THREE.RGBAFormat
  )
  fallback.colorSpace = THREE.SRGBColorSpace
  fallback.needsUpdate = true
  return fallback
}

function createWhiteboardTexture(): THREE.Texture {
  return createCanvasTextureSafe(384, 224, (ctx, w, h) => {
    ctx.fillStyle = "#f7f9fc"
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = "rgba(148, 163, 184, 0.22)"
    ctx.lineWidth = 1
    for (let x = 24; x < w; x += 24) {
      ctx.beginPath()
      ctx.moveTo(x, 12)
      ctx.lineTo(x, h - 12)
      ctx.stroke()
    }
    for (let y = 24; y < h; y += 24) {
      ctx.beginPath()
      ctx.moveTo(12, y)
      ctx.lineTo(w - 12, y)
      ctx.stroke()
    }

    ctx.fillStyle = "#16244a"
    ctx.font = `800 18px ${FONT_STACK}`
    ctx.fillText("KẾ HOẠCH TUẦN · KPI", 22, 34)

    ctx.strokeStyle = "#16a34a"
    ctx.lineWidth = 4
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(28, 175)
    ctx.lineTo(78, 152)
    ctx.lineTo(124, 160)
    ctx.lineTo(176, 118)
    ctx.lineTo(222, 126)
    ctx.lineTo(278, 76)
    ctx.lineTo(342, 60)
    ctx.stroke()

    const bars = [
      { x: 40, h: 42, c: "#3b82f6" },
      { x: 64, h: 60, c: "#3b82f6" },
      { x: 88, h: 52, c: "#e9b949" },
      { x: 112, h: 74, c: "#16a34a" },
    ]
    for (const b of bars) {
      ctx.fillStyle = b.c
      ctx.fillRect(b.x + 215, 196 - b.h, 16, b.h)
    }

    ctx.fillStyle = "#fde68a"
    ctx.fillRect(28, 56, 74, 48)
    ctx.fillStyle = "#bfdbfe"
    ctx.fillRect(114, 56, 74, 48)
    ctx.fillStyle = "#1e293b"
    ctx.fillRect(36, 70, 52, 5)
    ctx.fillRect(36, 82, 42, 5)
    ctx.fillRect(122, 70, 52, 5)
    ctx.fillRect(122, 82, 38, 5)
  })
}

function createCafeMenuTexture(): THREE.Texture {
  return createCanvasTextureSafe(320, 192, (ctx, w, h) => {
    ctx.fillStyle = "#1a2335"
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "#e9b949"
    ctx.lineWidth = 5
    ctx.strokeRect(8, 8, w - 16, h - 16)

    ctx.textAlign = "center"
    ctx.fillStyle = "#f6d27a"
    ctx.font = `800 26px ${FONT_STACK}`
    ctx.fillText("IQX CAFÉ", w / 2, 44)

    ctx.strokeStyle = "rgba(233, 185, 73, 0.45)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(40, 58)
    ctx.lineTo(w - 40, 58)
    ctx.stroke()

    ctx.textAlign = "left"
    ctx.fillStyle = "#f1f5f9"
    ctx.font = `600 17px ${FONT_STACK}`
    const items = [
      ["Cà phê sữa đá", "MIỄN PHÍ"],
      ["Cold Brew cam sả", "MIỄN PHÍ"],
      ["Trà đào mật ong", "MIỄN PHÍ"],
      ["Matcha sữa hạt", "MIỄN PHÍ"],
    ]
    items.forEach(([name, tag], idx) => {
      const y = 88 + idx * 25
      ctx.fillStyle = "#f1f5f9"
      ctx.fillText(name, 26, y)
      ctx.textAlign = "right"
      ctx.fillStyle = "#34c38f"
      ctx.font = `700 13px ${FONT_STACK}`
      ctx.fillText(tag, w - 26, y)
      ctx.textAlign = "left"
      ctx.font = `600 17px ${FONT_STACK}`
    })
  })
}

function createArtFrameTexture(
  variant: "chart" | "crest" | "mountain" | "motto" | "target"
): THREE.Texture {
  return createCanvasTextureSafe(320, 210, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    if (variant === "crest" || variant === "motto" || variant === "target") {
      grad.addColorStop(0, "#152548")
      grad.addColorStop(1, "#0c152b")
    } else if (variant === "chart") {
      grad.addColorStop(0, "#172a4f")
      grad.addColorStop(1, "#0e1a33")
    } else {
      grad.addColorStop(0, "#fef3c7")
      grad.addColorStop(1, "#fde68a")
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
      ctx.font = `900 48px ${FONT_STACK}`
      ctx.fillText("IQX", w / 2, h * 0.44)
      ctx.fillStyle = "#c9d6e4"
      ctx.font = `700 17px ${FONT_STACK}`
      ctx.fillText("CHỨNG NHẬN XUẤT SẮC", w / 2, h * 0.74)
    } else if (variant === "motto") {
      ctx.strokeStyle = "#e9b949"
      ctx.lineWidth = 4
      ctx.strokeRect(14, 14, w - 28, h - 28)
      ctx.fillStyle = "#f6d27a"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 26px ${FONT_STACK}`
      ctx.fillText("KỶ LUẬT · TỐC ĐỘ", w / 2, h * 0.42)
      ctx.strokeStyle = "rgba(246, 210, 122, 0.5)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(64, h * 0.58)
      ctx.lineTo(w - 64, h * 0.58)
      ctx.stroke()
      ctx.fillStyle = "#f1f5f9"
      ctx.font = `600 16px ${FONT_STACK}`
      ctx.fillText("ĐỒNG HÀNH TĂNG TRƯỞNG", w / 2, h * 0.74)
    } else if (variant === "target") {
      ctx.strokeStyle = "#34c38f"
      ctx.lineWidth = 4
      ctx.strokeRect(14, 14, w - 28, h - 28)
      ctx.fillStyle = "#34c38f"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `800 22px ${FONT_STACK}`
      ctx.fillText("MỤC TIÊU QUÝ", w / 2, h * 0.36)
      ctx.fillStyle = "#f6d27a"
      ctx.font = `900 32px ${FONT_STACK}`
      ctx.fillText("BỨT PHÁ KPI", w / 2, h * 0.62)
      ctx.fillStyle = "#c9d6e4"
      ctx.font = `600 14px ${FONT_STACK}`
      ctx.fillText("SACO · IQX", w / 2, h * 0.82)
    } else if (variant === "chart") {
      ctx.strokeStyle = "rgba(246, 210, 122, 0.2)"
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
      ctx.lineTo(86, 140)
      ctx.lineTo(140, 146)
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
  })
}

/** High-DPI woven Team Banner Rug texture (`"IQX · NHÓM {TÊN SẾP}"`). */
function createTeamBannerRugTexture(
  bossName: string,
  lite: boolean
): THREE.Texture {
  const cleanBoss = bossName.trim()
  const title = cleanBoss
    ? `IQX · NHÓM ${cleanBoss.toUpperCase()}`
    : "IQX · VĂN PHÒNG"

  return createCanvasTextureSafe(
    lite ? 512 : 1024,
    lite ? 96 : 192,
    (ctx, w, h) => {
      // Deep executive navy woven base
      const bg = ctx.createLinearGradient(0, 0, w, h)
      bg.addColorStop(0, "#152546")
      bg.addColorStop(0.5, "#1c315a")
      bg.addColorStop(1, "#152546")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Subtle carpet weave lines
      ctx.fillStyle = "rgba(255, 255, 255, 0.035)"
      const step = lite ? 4 : 6
      for (let y = 0; y < h; y += step) {
        ctx.fillRect(0, y, w, 1)
      }
      for (let x = 0; x < w; x += step * 2) {
        ctx.fillRect(x, 0, 1, h)
      }

      // Outer & inner brushed-gold carpet borders
      const padOuter = h * 0.08
      const padInner = h * 0.16
      ctx.strokeStyle = "#e9b949"
      ctx.lineWidth = Math.max(2, h * 0.035)
      ctx.strokeRect(padOuter, padOuter, w - padOuter * 2, h - padOuter * 2)

      ctx.strokeStyle = "rgba(246, 210, 122, 0.55)"
      ctx.lineWidth = Math.max(1, h * 0.014)
      ctx.strokeRect(padInner, padInner, w - padInner * 2, h - padInner * 2)

      // Decorative flanking gold diamonds
      const drawDiamond = (cx: number, cy: number, r: number): void => {
        ctx.fillStyle = "#e9b949"
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r * 1.15, cy)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - r * 1.15, cy)
        ctx.closePath()
        ctx.fill()
      }
      drawDiamond(w * 0.08, h * 0.5, h * 0.12)
      drawDiamond(w * 0.92, h * 0.5, h * 0.12)

      // Crisp centered banner text, auto-fitted to rug interior
      const maxTextW = w * 0.74
      let fontSize = Math.round(h * 0.42)
      ctx.font = `800 ${fontSize}px ${FONT_STACK}`
      while (fontSize > 16 && ctx.measureText(title).width > maxTextW) {
        fontSize -= 2
        ctx.font = `800 ${fontSize}px ${FONT_STACK}`
      }
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "rgba(7, 13, 28, 0.55)"
      ctx.fillText(title, w / 2, h * 0.52 + 2)
      ctx.fillStyle = "#f6d27a"
      ctx.fillText(title, w / 2, h * 0.51)
    },
    lite ? 4 : 12
  )
}

/** Shared neutral "Bàn trống" plate texture for all unassigned staff desks. */
function createEmptyDeskPlateTexture(lite: boolean): THREE.Texture {
  return createCanvasTextureSafe(
    lite ? 192 : 256,
    lite ? 48 : 64,
    (ctx, w, h) => {
      ctx.fillStyle = "#192640"
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = "#415780"
      ctx.lineWidth = Math.max(2, h * 0.06)
      ctx.strokeRect(4, 4, w - 8, h - 8)
      ctx.fillStyle = "#c9d6e4"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `700 ${Math.round(h * 0.42)}px ${FONT_STACK}`
      ctx.fillText("Bàn trống", w / 2, h * 0.52)
    },
    lite ? 4 : 8
  )
}

/** Builds merged prototype geometry buckets for an instanced open-plan staff desk. */
function createStaffDeskPrototypeSpecs(
  width: number,
  depth: number,
  lite: boolean,
  retainTex: (tex: THREE.Texture) => void
): MergedSpec[] {
  const batcher = new MeshBatcher()
  const oakTex = createWoodSurfaceTexture("oak")
  retainTex(oakTex)
  const topWoodMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: oakTex,
    roughness: 0.46,
    metalness: 0.05,
  })
  const drawerBodyMat = createMatteMaterial("#8a633b", {
    roughness: 0.58,
    metalness: 0.04,
  })
  const drawerFaceMat = createMatteMaterial("#a3784a", {
    roughness: 0.52,
    metalness: 0.05,
  })
  const legMat = createMetalMaterial("#27334a", {
    roughness: 0.34,
    metalness: 0.68,
  })
  const handleMat = createMetalMaterial("#b8c4d4", {
    roughness: 0.24,
    metalness: 0.84,
  })
  const bezelMat = createMatteMaterial("#161f33", {
    roughness: 0.34,
    metalness: 0.22,
  })
  const blotterMat = createMatteMaterial("#253147", {
    roughness: 0.72,
    metalness: 0.06,
  })
  const keyMat = createMatteMaterial("#eef2f7", {
    roughness: 0.52,
    metalness: 0.04,
  })

  const deskH = 0.76
  const topThick = 0.064
  const topSurfaceY = deskH + topThick / 2

  // Right 3-drawer pedestal
  const pedW = Math.min(0.4, width * 0.22)
  const pedH = deskH - 0.08
  const pedD = depth * 0.82
  const pedX = width / 2 - pedW / 2 - 0.05
  batcher.add(
    roundedBox(pedW - 0.04, 0.04, pedD - 0.04, 0.01, lite),
    legMat,
    [pedX, 0.02, 0]
  )
  batcher.add(
    roundedBox(pedW, pedH, pedD, 0.02, lite),
    drawerBodyMat,
    [pedX, 0.04 + pedH / 2, 0]
  )
  const slotH = (pedH - 0.08) / 3
  for (let i = 0; i < 3; i += 1) {
    const dy = 0.08 + (i + 0.5) * slotH
    batcher.add(
      roundedBox(pedW - 0.05, slotH - 0.024, 0.022, 0.008, lite),
      drawerFaceMat,
      [pedX, dy, pedD / 2 + 0.008]
    )
    batcher.add(
      roundedBox(pedW * 0.34, 0.016, 0.022, 0.006, lite),
      handleMat,
      [pedX, dy + slotH * 0.14, pedD / 2 + 0.022]
    )
  }

  // Left modern steel sled leg + rear modesty panel
  const leftX = -width / 2 + 0.085
  batcher.add(
    roundedBox(0.05, 0.04, depth * 0.84, 0.012, lite),
    legMat,
    [leftX, 0.02, 0]
  )
  for (const sz of [-1, 1] as const) {
    batcher.add(
      roundedBox(0.05, deskH - 0.05, 0.05, 0.012, lite),
      legMat,
      [leftX, deskH / 2, sz * (depth * 0.36)]
    )
  }
  batcher.add(
    roundedBox(width - pedW - 0.18, deskH * 0.54, 0.036, 0.01, lite),
    drawerBodyMat,
    [-pedW * 0.44, deskH * 0.48, -depth * 0.34]
  )

  // Bevelled oak wood-grained desktop slab
  batcher.add(
    roundedBox(width, topThick, depth, 0.022, lite),
    topWoodMat,
    [0, deskH, 0]
  )

  // Leather desk blotter pad
  batcher.add(
    roundedBox(Math.min(width * 0.54, 1.02), 0.008, Math.min(depth * 0.44, 0.36), 0.003, lite),
    blotterMat,
    [0, topSurfaceY + 0.004, depth * 0.1],
    undefined,
    undefined,
    false
  )

  // Widescreen monitor housing & stand near spine (-Z in local south-facing space)
  const mz = -depth * 0.24
  batcher.add(
    roundedBox(0.2, 0.016, 0.13, 0.006, lite),
    handleMat,
    [0, topSurfaceY + 0.008, mz]
  )
  batcher.add(
    roundedBox(0.046, 0.155, 0.03, 0.008, lite),
    handleMat,
    [0, topSurfaceY + 0.088, mz - 0.02],
    [-0.08, 0, 0]
  )
  batcher.add(
    roundedBox(0.56, 0.33, 0.032, 0.014, lite),
    bezelMat,
    [0, topSurfaceY + 0.255, mz]
  )
  batcher.add(
    roundedBox(0.3, 0.14, 0.02, 0.008, lite),
    bezelMat,
    [0, topSurfaceY + 0.245, mz - 0.02]
  )

  // Sloped keyboard + sculpted mouse
  const kz = depth * 0.14
  batcher.add(
    roundedBox(0.4, 0.018, 0.13, 0.006, lite),
    keyMat,
    [-0.04, topSurfaceY + 0.014, kz],
    [0.08, 0, 0],
    undefined,
    false
  )
  batcher.add(
    roundedBox(0.06, 0.026, 0.095, 0.012, lite),
    keyMat,
    [0.25, topSurfaceY + 0.015, kz + 0.01],
    undefined,
    undefined,
    false
  )

  return batcher.flushToSpecs()
}

/** Builds merged prototype geometry buckets for an instanced ergonomic swivel chair (facing +Z). */
function createSwivelChairPrototypeSpecs(
  lite: boolean,
  retainTex: (tex: THREE.Texture) => void
): MergedSpec[] {
  const batcher = new MeshBatcher()
  const fabricTex = createFabricSurfaceTexture("#2f3e60", "weave")
  retainTex(fabricTex)
  const fabricMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: fabricTex,
    roughness: 0.76,
    metalness: 0.03,
  })
  const darkMat = createMatteMaterial("#182032", {
    roughness: 0.52,
    metalness: 0.24,
  })
  const chromeMat = createMetalMaterial("#a4b3c6", {
    roughness: 0.24,
    metalness: 0.84,
  })
  const seg = lite ? 7 : 12

  // Pneumatic stem + hub + 5-star caster legs
  batcher.add(
    new THREE.CylinderGeometry(0.03, 0.034, 0.22, seg),
    chromeMat,
    [0, 0.19, 0]
  )
  batcher.add(
    new THREE.CylinderGeometry(0.052, 0.064, 0.085, seg),
    darkMat,
    [0, 0.095, 0]
  )
  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    batcher.add(
      roundedBox(0.22, 0.034, 0.04, 0.01, lite),
      darkMat,
      [cos * 0.12, 0.068, sin * 0.12],
      [0, -a, -0.14]
    )
    batcher.add(
      new THREE.CylinderGeometry(0.022, 0.022, 0.026, 6),
      darkMat,
      [cos * 0.22, 0.022, sin * 0.22],
      [Math.PI / 2, 0, -a]
    )
  }

  // Contoured seat pan + cushion + spine + ergonomic backrest + padded armrests
  batcher.add(
    roundedBox(0.43, 0.034, 0.41, 0.012, lite),
    darkMat,
    [0, 0.32, 0.01]
  )
  batcher.add(
    roundedBox(0.45, 0.082, 0.43, 0.032, lite),
    fabricMat,
    [0, 0.368, 0.01]
  )
  batcher.add(
    roundedBox(0.065, 0.32, 0.04, 0.014, lite),
    darkMat,
    [0, 0.47, -0.225],
    [-0.14, 0, 0]
  )
  batcher.add(
    roundedBox(0.41, 0.39, 0.078, 0.03, lite),
    fabricMat,
    [0, 0.59, -0.2],
    [-0.12, 0, 0]
  )
  for (const side of [-1, 1] as const) {
    const ax = side * 0.24
    batcher.add(
      roundedBox(0.032, 0.19, 0.036, 0.01, lite),
      darkMat,
      [ax, 0.42, -0.04]
    )
    batcher.add(
      roundedBox(0.058, 0.032, 0.27, 0.012, lite),
      darkMat,
      [ax, 0.515, -0.01]
    )
  }

  return batcher.flushToSpecs()
}

/** Builds merged prototype geometry buckets for an instanced back-to-back pod divider. */
function createPodDividerPrototypeSpecs(
  width: number,
  depth: number,
  lite: boolean,
  retainTex: (tex: THREE.Texture) => void
): MergedSpec[] {
  const batcher = new MeshBatcher()
  const feltTex = createFabricSurfaceTexture("#32476b", "weave")
  retainTex(feltTex)
  const feltMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: feltTex,
    roughness: 0.82,
    metalness: 0.03,
  })
  const oakTex = createWoodSurfaceTexture("oak")
  retainTex(oakTex)
  const railMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: oakTex,
    roughness: 0.48,
    metalness: 0.05,
  })
  const goldMat = createMetalMaterial("#e9b949", {
    roughness: 0.28,
    metalness: 0.8,
  })
  const metalMat = createMetalMaterial("#27334a", {
    roughness: 0.36,
    metalness: 0.65,
  })

  // Lower cable-management modesty spine between back-to-back desks
  batcher.add(
    roundedBox(width - 0.06, 0.72, depth * 0.58, 0.012, lite),
    metalMat,
    [0, 0.36, 0]
  )
  // Low acoustic fabric privacy screen rising gently above desktops (y = 0.76..1.10)
  batcher.add(
    roundedBox(width - 0.02, 0.33, depth * 0.54, 0.016, lite),
    feltMat,
    [0, 0.93, 0]
  )
  // Warm oak divider frame cap + subtle brushed gold top accent strip
  batcher.add(
    roundedBox(width + 0.02, 0.038, depth * 0.74, 0.012, lite),
    railMat,
    [0, 1.11, 0]
  )
  batcher.add(
    roundedBox(width, 0.014, depth * 0.42, 0.004, lite),
    goldMat,
    [0, 1.132, 0],
    undefined,
    undefined,
    false
  )
  // End trim posts & center seam post framing the 2-desk cluster
  for (const px of [-width / 2 + 0.01, 0, width / 2 - 0.01]) {
    batcher.add(
      roundedBox(0.044, 0.38, depth * 0.72, 0.01, lite),
      metalMat,
      [px, 0.93, 0]
    )
  }

  return batcher.flushToSpecs()
}

export class OfficeWorld3D {
  readonly group: THREE.Group
  private readonly world: WorldTransformConfig
  private readonly lite: boolean
  private readonly hostBridge: ChibiSceneHostBridge | null
  private readonly archGroup: THREE.Group
  private readonly teamPropsGroup: THREE.Group
  private readonly staticProps: DisposableProp[] = []
  private readonly teamProps: DisposableProp[] = []
  private readonly archRetainedTextures: THREE.Texture[] = []
  private readonly teamRetainedTextures: THREE.Texture[] = []

  private readonly meetingCanvas: HTMLCanvasElement
  private readonly standeeCanvas: HTMLCanvasElement
  private readonly meetingBoard: LiveBoardProp
  private readonly standeeBoard: LiveBoardProp
  private lastMeetingSig = ""
  private lastStandeeSig = ""

  private readonly targetRing: THREE.Mesh
  private readonly targetRingMat: THREE.MeshStandardMaterial
  private targetRingAge = 1
  private targetRingActive = false
  private targetRingStatic = false

  private currentWorldH: number
  private disposed = false
  /** Pending (or partially run) architecture build; null once built. */
  private buildSteps: BuildSteps | null = null

  constructor(
    scene: THREE.Scene,
    world: WorldTransformConfig,
    lite = false,
    opts: { deferBuild?: boolean } = {}
  ) {
    this.world = world
    this.lite = lite
    this.hostBridge = getSceneHostBridge(scene)
    this.currentWorldH = world.logicalH

    this.group = new THREE.Group()
    this.group.name = "office-world-3d"
    scene.add(this.group)

    this.archGroup = new THREE.Group()
    this.archGroup.name = "office-architecture"
    this.group.add(this.archGroup)

    this.teamPropsGroup = new THREE.Group()
    this.teamPropsGroup.name = "office-team-props"
    this.group.add(this.teamPropsGroup)

    // Live Meeting Room Wall Screen (640x160)
    this.meetingCanvas = document.createElement("canvas")
    this.meetingCanvas.width = 640
    this.meetingCanvas.height = 160
    drawOfficeMeetingScreen(
      this.meetingCanvas,
      "Phòng họp nhóm",
      "Chưa có lịch họp hôm nay"
    )
    this.lastMeetingSig = "init:empty"
    this.meetingBoard = createWallBoardFrame(
      3.2,
      0.96,
      this.meetingCanvas,
      "#e9b949",
      { lite }
    )
    const meetScreenPt = logicalToWorld(1160, 26, this.world)
    this.meetingBoard.group.position.set(meetScreenPt.x, 1.58, meetScreenPt.z)
    this.group.add(this.meetingBoard.group)
    freezeStaticSubtree(this.meetingBoard.group)

    // Live Freestanding Gold-Trimmed Achievement Standee (460x748)
    this.standeeCanvas = document.createElement("canvas")
    this.standeeCanvas.width = 460
    this.standeeCanvas.height = 748
    drawOfficeStandee(this.standeeCanvas, {
      teamTitle: "IQX · VĂN PHÒNG",
      monthLabel: "Thành tích tháng",
      top3: [],
      emptyText: "Chưa có ai ghi điểm tháng này",
      footerText: "Reset ngày 01 hằng tháng",
    })
    this.lastStandeeSig = "init:empty"
    this.standeeBoard = createAchievementStandee(
      this.standeeCanvas,
      2.3,
      3.65,
      { lite }
    )
    const standeePt = logicalToWorld(2195, 1066, this.world)
    this.standeeBoard.group.position.set(standeePt.x, 0, standeePt.z)
    this.group.add(this.standeeBoard.group)
    freezeStaticSubtree(this.standeeBoard.group)

    // Golden click-to-move destination ring
    this.targetRingMat = createGlowMaterial("#f6d27a", 1.1, 0)
    this.targetRingMat.side = THREE.DoubleSide
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, lite ? 18 : 28),
      this.targetRingMat
    )
    this.targetRing.rotation.x = -Math.PI / 2
    this.targetRing.position.set(0, 0.035, 0)
    this.targetRing.visible = false
    this.group.add(this.targetRing)

    this.buildSteps = this.buildArchitectureSteps(this.currentWorldH)
    if (!opts.deferBuild) {
      this.finishBuildSync()
    }
  }

  /** Runs the pending architecture build in ~10 ms slices; resolves false if cancelled first. */
  async buildAsync(opts: ChunkedBuildOptions = {}): Promise<boolean> {
    const steps = this.buildSteps
    if (!steps || this.disposed) return true
    const finished = await runBuildChunked(steps, opts)
    if (finished && this.buildSteps === steps) this.buildSteps = null
    return finished && !this.disposed
  }

  /** Completes any pending architecture build synchronously. */
  finishBuildSync(): void {
    const steps = this.buildSteps
    if (!steps) return
    this.buildSteps = null
    runBuildSync(steps)
  }

  private retainArchTex(tex: THREE.Texture): THREE.Texture {
    retainCachedTexture(tex)
    this.archRetainedTextures.push(tex)
    return tex
  }

  private retainTeamTex(tex: THREE.Texture): THREE.Texture {
    retainCachedTexture(tex)
    this.teamRetainedTextures.push(tex)
    return tex
  }

  private toWorldCenter(x: number, y: number, w: number, h: number): {
    x: number
    z: number
  } {
    return logicalToWorld(x + w / 2, y + h / 2, this.world)
  }

  private clearStaticProps(): void {
    for (const prop of this.staticProps) {
      prop.dispose()
    }
    this.staticProps.length = 0
    while (this.archGroup.children.length > 0) {
      const child = this.archGroup.children[0]
      if (!child) break
      this.archGroup.remove(child)
      disposeObject3D(child)
    }
    for (const tex of this.archRetainedTextures.splice(0)) {
      releaseCachedTexture(tex)
    }
  }

  private clearTeamProps(): void {
    for (const prop of this.teamProps) {
      prop.dispose()
    }
    this.teamProps.length = 0
    while (this.teamPropsGroup.children.length > 0) {
      const child = this.teamPropsGroup.children[0]
      if (!child) break
      this.teamPropsGroup.remove(child)
      disposeObject3D(child)
    }
    for (const tex of this.teamRetainedTextures.splice(0)) {
      releaseCachedTexture(tex)
    }
  }

  private *buildArchitectureSteps(worldH: number): BuildSteps {
    this.clearStaticProps()
    const s = OFFICE_WORLD_SCALE
    const zones = getOfficeZones(worldH)
    const seg = this.lite ? 10 : 16

    // Shared architectural materials (reused across walls, frames, glass & trims)
    const wallNavyMat = createMatteMaterial("#1f3052", { roughness: 0.5 })
    const wallDarkBaseMat = createMatteMaterial("#131f38", { roughness: 0.62 })
    const wallUpperMat = createMatteMaterial("#ebe2d4", { roughness: 0.66 })
    const pilasterMat = createMatteMaterial("#dfd3c0", { roughness: 0.56 })
    const woodTrimMat = createMatteMaterial("#7a5230", { roughness: 0.52 })
    const woodSlatMat = createMatteMaterial("#9c6b3d", { roughness: 0.56 })
    const frameMetalMat = createMetalMaterial("#273654", {
      roughness: 0.36,
      metalness: 0.65,
    })
    const goldMat = createMetalMaterial("#e9b949", {
      roughness: 0.26,
      metalness: 0.82,
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: "#b7dcfb",
      transparent: true,
      opacity: 0.24,
      roughness: 0.12,
      metalness: 0.18,
    })
    const glassFrostMat = new THREE.MeshStandardMaterial({
      color: "#e6f2ff",
      transparent: true,
      opacity: 0.36,
      roughness: 0.42,
      metalness: 0.05,
    })
    const windowGlassMat = createGlowMaterial("#d8eeff", 0.52, 0.92)
    const sunPoolMat = new THREE.MeshBasicMaterial({
      color: "#fff3d1",
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    })
    const ceilingLightMat = createGlowMaterial("#fff4d8", 1.35)
    const lampShadeMat = createGlowMaterial("#fff0c8", 0.75)

    const archBatch = new MeshBatcher()
    const artMaterials = new Map<
      "chart" | "crest" | "mountain" | "motto" | "target",
      THREE.MeshStandardMaterial
    >()
    const getArtMaterial = (
      variant: "chart" | "crest" | "mountain" | "motto" | "target"
    ): THREE.MeshStandardMaterial => {
      let mat = artMaterials.get(variant)
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          map: createArtFrameTexture(variant),
          roughness: 0.36,
        })
        artMaterials.set(variant, mat)
      }
      return mat
    }

    yield 0.037

    // 1. Exterior architectural studio surround apron + framing plinth
    const staffFloorW = OFFICE_BASE_W * s
    const staffFloorH = worldH * s
    const staffFloorCenter = this.toWorldCenter(0, 0, OFFICE_BASE_W, worldH)
    const surroundApron = new THREE.Mesh(
      new THREE.PlaneGeometry(staffFloorW + 48, staffFloorH + 48),
      createMatteMaterial("#141D32", { roughness: 0.92 })
    )
    surroundApron.rotation.x = -Math.PI / 2
    surroundApron.position.set(staffFloorCenter.x, -0.055, staffFloorCenter.z)
    this.archGroup.add(surroundApron)

    const outerTrimMat = createMatteMaterial("#2A3D63", { roughness: 0.7 })
    const plinthMat = createMatteMaterial("#1B2846", { roughness: 0.78 })
    archBatch.addBox(
      staffFloorW + 1.08,
      0.014,
      staffFloorH + 1.08,
      outerTrimMat,
      staffFloorCenter.x,
      -0.044,
      staffFloorCenter.z,
      false
    )
    archBatch.addBox(
      staffFloorW + 0.92,
      0.04,
      staffFloorH + 0.92,
      plinthMat,
      staffFloorCenter.x,
      -0.025,
      staffFloorCenter.z,
      false
    )

    yield 0.074

    // 1b. Base Khu Nhân Viên floor (cream ceramic grid)
    const baseCeramicTex = this.retainArchTex(createFloorTexture("ceramic_cream"))
    const ceramicTex = cloneSharedRepeatedTexture(
      baseCeramicTex,
      OFFICE_BASE_W / 256,
      worldH / 256,
      this.lite ? 2 : 8
    )
    const baseFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(staffFloorW, staffFloorH),
      new THREE.MeshStandardMaterial({
        map: ceramicTex,
        roughness: 0.5,
        metalness: 0.04,
      })
    )
    baseFloor.rotation.x = -Math.PI / 2
    baseFloor.position.set(staffFloorCenter.x, 0, staffFloorCenter.z)
    baseFloor.receiveShadow = true
    this.archGroup.add(baseFloor)

    yield 0.111

    // 2. Three upper room floors (parquet, slate carpet, warm sand tiles)
    const roomMaterials: Record<
      "boss" | "meet" | "docs",
      {
        style: "parquet" | "carpet_slate" | "stone_sand"
        rough: number
        tilePx: number
      }
    > = {
      boss: { style: "parquet", rough: 0.45, tilePx: 220 },
      meet: { style: "carpet_slate", rough: 0.84, tilePx: 180 },
      docs: { style: "stone_sand", rough: 0.6, tilePx: 192 },
    }

    for (const zone of zones) {
      if (zone.id === "staff") continue
      const cfg = roomMaterials[zone.id]
      const baseRoomTex = this.retainArchTex(createFloorTexture(cfg.style))
      const tex = cloneSharedRepeatedTexture(
        baseRoomTex,
        zone.w / cfg.tilePx,
        zone.h / cfg.tilePx,
        this.lite ? 2 : 8
      )
      const pt = this.toWorldCenter(zone.x, zone.y, zone.w, zone.h)
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.w * s, zone.h * s),
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: cfg.rough,
          metalness: 0.04,
        })
      )
      plane.rotation.x = -Math.PI / 2
      plane.position.set(pt.x, 0.006, pt.z)
      plane.receiveShadow = true
      this.archGroup.add(plane)
    }

    yield 0.148

    // 2b. Per-zone rugs, pod-band carpets & corridor runner (composed from furniture-builder.ts)
    for (const rugSpec of getZoneRugs(worldH)) {
      const rug = createRug(rugSpec.w * s, rugSpec.h * s, {
        shape: rugSpec.shape,
        colorHex: rugSpec.colorHex,
        borderHex: rugSpec.borderHex,
        borderWidth: rugSpec.borderWidth,
        lite: this.lite,
      })
      const pt = this.toWorldCenter(rugSpec.x, rugSpec.y, rugSpec.w, rugSpec.h)
      rug.group.position.set(pt.x, 0.008, pt.z)
      this.mountStaticProp(rug)
    }

    yield 0.185

    // 3. Crisp Floor Zone Decals
    const decals: readonly {
      text: string
      x: number
      y: number
      w: number
      h: number
      color: string
    }[] = [
      {
        text: "PHÒNG SẾP",
        x: 175,
        y: 492,
        w: 2.7,
        h: 0.68,
        color: "rgba(255,250,240,0.78)",
      },
      {
        text: "PHÒNG HỌP",
        x: 925,
        y: 492,
        w: 2.7,
        h: 0.68,
        color: "rgba(255,255,255,0.72)",
      },
      {
        text: "PHÒNG TÀI LIỆU",
        x: 1740,
        y: 492,
        w: 3.3,
        h: 0.7,
        color: "rgba(92,62,24,0.7)",
      },
      {
        text: "KHU NHÂN VIÊN",
        x: 245,
        y: 660,
        w: 3.1,
        h: 0.62,
        color: "rgba(110,72,28,0.62)",
      },
      {
        text: "GÓC CÀ PHÊ",
        x: 1945,
        y: 604,
        w: 2.1,
        h: 0.5,
        color: "rgba(96,60,22,0.72)",
      },
    ]
    for (const d of decals) {
      const tex = createFloorDecalTexture(d.text, d.color)
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat)
      mesh.rotation.x = -Math.PI / 2
      const pt = logicalToWorld(d.x, d.y, this.world)
      mesh.position.set(pt.x, 0.028, pt.z)
      this.archGroup.add(mesh)
    }

    yield 0.222

    // 4. Cutaway Architectural Walls with Baseboards, Dado, Chair Rails & Crown Trims
    const t = OFFICE_WALL_THICK * s // 0.16u
    const northH = 2.68
    const sideH = 2.04
    const innerH = 1.84
    const southH = 0.34

    // North outer wall
    const northPt = this.toWorldCenter(0, 0, OFFICE_BASE_W, OFFICE_WALL_THICK)
    archBatch.addBox(OFFICE_BASE_W * s, northH, t, wallUpperMat, northPt.x, northH / 2, northPt.z, false)
    archBatch.addBox(OFFICE_BASE_W * s, 0.82, t + 0.04, wallNavyMat, northPt.x, 0.41, northPt.z, false)
    archBatch.addBox(OFFICE_BASE_W * s, 0.14, t + 0.07, wallDarkBaseMat, northPt.x, 0.07, northPt.z, false)
    archBatch.addBox(OFFICE_BASE_W * s, 0.05, t + 0.08, goldMat, northPt.x, 0.84, northPt.z, false)
    archBatch.addBox(OFFICE_BASE_W * s + 0.1, 0.14, t + 0.1, wallNavyMat, northPt.x, northH + 0.05, northPt.z, false)
    archBatch.addBox(OFFICE_BASE_W * s + 0.14, 0.06, t + 0.12, goldMat, northPt.x, northH - 0.02, northPt.z, false)

    // Architectural pilasters along North wall
    for (const pxLogical of [24, 740, 1560, 2376]) {
      const px = logicalToWorld(pxLogical, OFFICE_WALL_THICK, this.world)
      archBatch.addBox(0.26, northH, 0.16, pilasterMat, px.x, northH / 2, px.z + 0.04, false)
      archBatch.addBox(0.3, 0.08, 0.2, goldMat, px.x, northH - 0.14, px.z + 0.05, false)
    }

    // West & East cutaway walls
    const westPt = this.toWorldCenter(0, 0, OFFICE_WALL_THICK, worldH)
    const eastPt = this.toWorldCenter(
      OFFICE_BASE_W - OFFICE_WALL_THICK,
      0,
      OFFICE_WALL_THICK,
      worldH
    )
    for (const pt of [westPt, eastPt]) {
      archBatch.addBox(t, sideH, worldH * s, wallUpperMat, pt.x, sideH / 2, pt.z, false)
      archBatch.addBox(t + 0.04, 0.82, worldH * s, wallNavyMat, pt.x, 0.41, pt.z, false)
      archBatch.addBox(t + 0.07, 0.13, worldH * s, wallDarkBaseMat, pt.x, 0.065, pt.z, false)
      archBatch.addBox(t + 0.07, 0.045, worldH * s, goldMat, pt.x, 0.84, pt.z, false)
      archBatch.addBox(t + 0.08, 0.07, worldH * s, goldMat, pt.x, sideH + 0.03, pt.z, false)
    }

    // Low South cutaway curb
    const southPt = this.toWorldCenter(
      0,
      worldH - OFFICE_WALL_THICK,
      OFFICE_BASE_W,
      OFFICE_WALL_THICK
    )
    archBatch.addBox(OFFICE_BASE_W * s, southH, t, wallNavyMat, southPt.x, southH / 2, southPt.z, false)
    archBatch.addBox(OFFICE_BASE_W * s, 0.05, t + 0.06, goldMat, southPt.x, southH + 0.025, southPt.z, false)

    yield 0.259

    // 4b. Framed Glass Interior Dividers (vertical x = 740, 1560 & horizontal y = 540)
    for (const vx of [740, 1560]) {
      const spanLen = 524 * s
      const pt = this.toWorldCenter(vx, 16, OFFICE_WALL_THICK, 524)
      archBatch.addBox(t, 0.92, spanLen, wallNavyMat, pt.x, 0.46, pt.z)
      archBatch.addBox(t + 0.05, 0.11, spanLen, wallDarkBaseMat, pt.x, 0.055, pt.z, false)
      archBatch.addBox(t + 0.04, 0.045, spanLen, woodTrimMat, pt.x, 0.94, pt.z, false)
      archBatch.addBox(t * 0.36, 0.78, spanLen, glassMat, pt.x, 1.35, pt.z, false)
      archBatch.addBox(t * 0.4, 0.16, spanLen, glassFrostMat, pt.x, 1.32, pt.z, false)
      archBatch.addBox(t + 0.04, 0.08, spanLen, frameMetalMat, pt.x, innerH - 0.04, pt.z, false)
      archBatch.addBox(t + 0.06, 0.045, spanLen, goldMat, pt.x, innerH + 0.02, pt.z, false)
      const frameCount = 4
      for (let i = 0; i <= frameCount; i += 1) {
        const mz =
          pt.z - spanLen / 2 + 0.08 + (i * (spanLen - 0.16)) / frameCount
        archBatch.addBox(t * 0.78, 0.84, 0.055, frameMetalMat, pt.x, 1.36, mz, false)
      }
    }

    const corridorSegments: readonly [number, number][] = [
      [16, 304],
      [450, 640],
      [1230, 680],
      [2040, 344],
    ]
    for (const [sx, sw] of corridorSegments) {
      const segW = sw * s
      const pt = this.toWorldCenter(sx, OFFICE_DIVIDER_Y, sw, OFFICE_WALL_THICK)
      archBatch.addBox(segW, 0.92, t, wallNavyMat, pt.x, 0.46, pt.z)
      archBatch.addBox(segW, 0.11, t + 0.05, wallDarkBaseMat, pt.x, 0.055, pt.z, false)
      archBatch.addBox(segW, 0.045, t + 0.05, woodTrimMat, pt.x, 0.94, pt.z, false)
      archBatch.addBox(segW, 0.78, t * 0.36, glassMat, pt.x, 1.35, pt.z, false)
      archBatch.addBox(segW, 0.18, t * 0.42, glassFrostMat, pt.x, 1.32, pt.z, false)
      archBatch.addBox(segW, 0.085, t + 0.04, frameMetalMat, pt.x, innerH - 0.04, pt.z, false)
      archBatch.addBox(segW, 0.045, t + 0.06, goldMat, pt.x, innerH + 0.02, pt.z, false)
      const bays = Math.max(2, Math.round(segW / 1.55))
      for (let i = 0; i <= bays; i += 1) {
        const mx = pt.x - segW / 2 + 0.06 + (i * (segW - 0.12)) / bays
        archBatch.addBox(0.055, 0.84, t * 0.78, frameMetalMat, mx, 1.36, pt.z, false)
      }
    }

    yield 0.296

    // 4c. Doorway Frames, Thresholds, Swung-Open Wood/Glass Doors & Room Plaques
    const doorNames: Record<"boss" | "meet" | "docs", string> = {
      boss: "PHÒNG SẾP",
      meet: "PHÒNG HỌP",
      docs: "PHÒNG TÀI LIỆU",
    }
    const doorAngle = Math.PI * 0.43
    const doorCos = Math.cos(doorAngle)
    const doorSin = Math.sin(doorAngle)
    const doorRot: readonly [number, number, number] = [0, doorAngle, 0]

    for (const door of OFFICE_DOORWAYS) {
      const doorW = (door.x2 - door.x1) * s
      for (const edgeX of [door.x1, door.x2]) {
        const jambPt = logicalToWorld(
          edgeX,
          door.y + OFFICE_WALL_THICK / 2,
          this.world
        )
        archBatch.addBox(0.1, innerH + 0.06, t + 0.1, woodTrimMat, jambPt.x, (innerH + 0.06) / 2, jambPt.z)
        archBatch.addBox(0.12, 0.06, t + 0.12, goldMat, jambPt.x, innerH + 0.06, jambPt.z, false)
      }

      const threshPt = this.toWorldCenter(
        door.x1,
        door.y,
        door.x2 - door.x1,
        OFFICE_WALL_THICK
      )
      archBatch.addBox(doorW, 0.022, t + 0.06, goldMat, threshPt.x, 0.011, threshPt.z, false)

      const leafW = Math.min(0.86, doorW * 0.68)
      const leafH = innerH - 0.06
      const hingePt = logicalToWorld(
        door.x2 - 4,
        door.y + OFFICE_WALL_THICK * 0.2,
        this.world
      )
      const addDoorLeafBox = (
        bw: number,
        bh: number,
        bd: number,
        mat: THREE.Material,
        lx: number,
        ly: number
      ): void => {
        archBatch.addBox(
          bw,
          bh,
          bd,
          mat,
          hingePt.x + lx * doorCos,
          ly,
          hingePt.z - lx * doorSin,
          false,
          true,
          doorRot
        )
      }
      addDoorLeafBox(leafW, 0.74, 0.055, woodTrimMat, -leafW / 2, 0.37)
      addDoorLeafBox(leafW, 0.1, 0.055, woodTrimMat, -leafW / 2, leafH - 0.05)
      addDoorLeafBox(0.08, leafH - 0.74, 0.055, woodTrimMat, -0.04, 0.74 + (leafH - 0.74) / 2)
      addDoorLeafBox(0.08, leafH - 0.74, 0.055, woodTrimMat, -leafW + 0.04, 0.74 + (leafH - 0.74) / 2)
      addDoorLeafBox(leafW - 0.16, leafH - 0.84, 0.025, glassMat, -leafW / 2, 0.74 + (leafH - 0.84) / 2)
      addDoorLeafBox(0.12, 0.028, 0.11, goldMat, -leafW + 0.12, 0.84)

      const plaqueTex = createSignTexture(doorNames[door.id], {
        style: "navy_gold",
        width: 360,
        height: 96,
      })
      const plaqueMat = new THREE.MeshStandardMaterial({
        map: plaqueTex,
        roughness: 0.34,
        metalness: 0.18,
      })
      const plaquePt = logicalToWorld(
        door.x1 - 58,
        door.y + OFFICE_WALL_THICK + 2,
        this.world
      )
      archBatch.addBox(0.92, 0.24, 0.03, frameMetalMat, plaquePt.x, 1.14, plaquePt.z + 0.015, false)
      const plaqueFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.86, 0.2),
        plaqueMat
      )
      plaqueFace.position.set(plaquePt.x, 1.14, plaquePt.z + 0.034)
      this.archGroup.add(plaqueFace)
    }

    yield 0.333

    // 4d. Architectural Windows with Warm Sunlight Pools (batched into archBatch)
    for (const win of getOfficeWindows(worldH)) {
      const spanU = win.span * s
      if (win.wall === "north") {
        const pt = logicalToWorld(win.pos, OFFICE_WALL_THICK, this.world)
        archBatch.add(
          new THREE.BoxGeometry(spanU + 0.14, win.heightU + 0.14, 0.08),
          frameMetalMat,
          [pt.x, win.centerY, pt.z + 0.02],
          undefined,
          undefined,
          false
        )
        archBatch.add(
          new THREE.BoxGeometry(spanU + 0.22, 0.06, 0.16),
          woodTrimMat,
          [pt.x, win.centerY - win.heightU / 2 - 0.05, pt.z + 0.06],
          undefined,
          undefined,
          false
        )
        archBatch.add(
          new THREE.PlaneGeometry(spanU, win.heightU),
          windowGlassMat,
          [pt.x, win.centerY, pt.z + 0.064],
          undefined,
          undefined,
          false,
          false
        )
        archBatch.add(
          new THREE.BoxGeometry(0.045, win.heightU, 0.04),
          frameMetalMat,
          [pt.x, win.centerY, pt.z + 0.065],
          undefined,
          undefined,
          false
        )
        if (win.heightU > 0.7) {
          archBatch.add(
            new THREE.BoxGeometry(spanU, 0.04, 0.04),
            frameMetalMat,
            [pt.x, win.centerY + 0.08, pt.z + 0.065],
            undefined,
            undefined,
            false
          )
        }
        if (win.sunPool) {
          archBatch.add(
            new THREE.PlaneGeometry(spanU * 1.08, 1.75),
            sunPoolMat,
            [pt.x, 0.025, pt.z + 1.05],
            [-Math.PI / 2, 0, 0],
            undefined,
            false,
            false
          )
        }
      } else {
        const isWest = win.wall === "west"
        const pt = logicalToWorld(
          isWest ? OFFICE_WALL_THICK : OFFICE_BASE_W - OFFICE_WALL_THICK,
          win.pos,
          this.world
        )
        const dir = isWest ? 1 : -1
        archBatch.add(
          new THREE.BoxGeometry(0.08, win.heightU + 0.14, spanU + 0.14),
          frameMetalMat,
          [pt.x + dir * 0.02, win.centerY, pt.z],
          undefined,
          undefined,
          false
        )
        archBatch.add(
          new THREE.BoxGeometry(0.14, 0.055, spanU + 0.22),
          woodTrimMat,
          [pt.x + dir * 0.06, win.centerY - win.heightU / 2 - 0.05, pt.z],
          undefined,
          undefined,
          false
        )
        archBatch.add(
          new THREE.PlaneGeometry(spanU, win.heightU),
          windowGlassMat,
          [pt.x + dir * 0.065, win.centerY, pt.z],
          [0, isWest ? Math.PI / 2 : -Math.PI / 2, 0],
          undefined,
          false,
          false
        )
        archBatch.add(
          new THREE.BoxGeometry(0.04, win.heightU, 0.045),
          frameMetalMat,
          [pt.x + dir * 0.065, win.centerY, pt.z],
          undefined,
          undefined,
          false
        )
        if (win.sunPool) {
          archBatch.add(
            new THREE.PlaneGeometry(1.55, spanU * 1.04),
            sunPoolMat,
            [pt.x + dir * 0.95, 0.025, pt.z],
            [-Math.PI / 2, 0, 0],
            undefined,
            false,
            false
          )
        }
      }
    }

    yield 0.37

    // 4e. Ceiling Light Coves & Warm Brass Wall Sconces
    const ceilingBars: readonly { x: number; w: number }[] = [
      { x: 380, w: 3.4 },
      { x: 1160, w: 4.2 },
      { x: 1960, w: 3.6 },
    ]
    for (const bar of ceilingBars) {
      const pt = logicalToWorld(bar.x, OFFICE_WALL_THICK + 12, this.world)
      archBatch.add(
        new THREE.BoxGeometry(bar.w + 0.16, 0.09, 0.24),
        frameMetalMat,
        [pt.x, northH - 0.12, pt.z + 0.12],
        undefined,
        undefined,
        false
      )
      archBatch.add(
        new THREE.BoxGeometry(bar.w, 0.045, 0.16),
        ceilingLightMat,
        [pt.x, northH - 0.17, pt.z + 0.14],
        undefined,
        undefined,
        false
      )
    }

    const sconceXs = [170, 620, 910, 1400, 1740, 2220]
    for (const sx of sconceXs) {
      const pt = logicalToWorld(
        sx,
        OFFICE_DIVIDER_Y + OFFICE_WALL_THICK,
        this.world
      )
      archBatch.add(
        new THREE.CylinderGeometry(0.055, 0.055, 0.05, seg),
        goldMat,
        [pt.x, 1.62, pt.z + 0.03],
        [Math.PI / 2, 0, 0],
        undefined,
        false
      )
      archBatch.add(
        new THREE.SphereGeometry(0.075, seg, Math.max(6, seg - 4)),
        ceilingLightMat,
        [pt.x, 1.62, pt.z + 0.09],
        undefined,
        undefined,
        false
      )
    }

    // 5. Room Decorations & Static Furniture Props across all 4 zones

    yield 0.407

    // ----- PHÒNG SẾP -----
    const bossShelf = createBookshelf(2.0, 1.82, 0.46, { lite: this.lite })
    const bossShelfPt = this.toWorldCenter(40, 40, 200, 46)
    bossShelf.group.position.set(bossShelfPt.x, 0, bossShelfPt.z)
    this.mountStaticProp(bossShelf)

    archBatch.add(
      new THREE.CylinderGeometry(0.11, 0.06, 0.18, seg),
      goldMat,
      [bossShelfPt.x - 0.45, 1.98, bossShelfPt.z],
      undefined,
      undefined,
      false
    )
    archBatch.add(
      new THREE.BoxGeometry(0.16, 0.06, 0.16),
      wallDarkBaseMat,
      [bossShelfPt.x - 0.45, 1.86, bossShelfPt.z],
      undefined,
      undefined,
      false
    )
    const globeMat = createMatteMaterial("#3b82f6", { roughness: 0.42 })
    archBatch.add(
      new THREE.SphereGeometry(0.11, seg, seg),
      globeMat,
      [bossShelfPt.x + 0.48, 2.02, bossShelfPt.z],
      undefined,
      undefined,
      false
    )
    archBatch.add(
      new THREE.BoxGeometry(0.14, 0.05, 0.14),
      goldMat,
      [bossShelfPt.x + 0.48, 1.86, bossShelfPt.z],
      undefined,
      undefined,
      false
    )
    const lampPt = logicalToWorld(716, 355, this.world)
    archBatch.add(
      new THREE.CylinderGeometry(0.14, 0.16, 0.04, seg),
      goldMat,
      [lampPt.x, 0.02, lampPt.z],
      undefined,
      undefined,
      false
    )
    archBatch.add(
      new THREE.CylinderGeometry(0.022, 0.026, 1.42, 8),
      goldMat,
      [lampPt.x, 0.73, lampPt.z],
      undefined,
      undefined,
      false
    )
    archBatch.add(
      new THREE.CylinderGeometry(0.14, 0.22, 0.28, seg),
      lampShadeMat,
      [lampPt.x, 1.48, lampPt.z],
      undefined,
      undefined,
      false
    )

    const bossFrames: readonly {
      x: number
      w: number
      h: number
      variant: "crest" | "chart"
    }[] = [
      { x: 325, w: 1.05, h: 0.78, variant: "crest" },
      { x: 445, w: 1.05, h: 0.78, variant: "chart" },
    ]
    for (const f of bossFrames) {
      const fPt = logicalToWorld(f.x, OFFICE_WALL_THICK + 2, this.world)
      archBatch.addBox(f.w + 0.1, f.h + 0.1, 0.04, goldMat, fPt.x, 1.64, fPt.z + 0.02, false)
      archBatch.add(
        new THREE.PlaneGeometry(f.w, f.h),
        getArtMaterial(f.variant),
        [fPt.x, 1.64, fPt.z + 0.044],
        undefined,
        undefined,
        false
      )
    }

    const bossSofa = createSofa(1.5, 0.7, "#24365e", { lite: this.lite })
    const bossSofaPt = this.toWorldCenter(560, 330, 150, 70)
    bossSofa.group.position.set(bossSofaPt.x, 0, bossSofaPt.z)
    this.mountStaticProp(bossSofa)

    const bossLamp = new THREE.PointLight(0xffe7bd, 1.25, 11, 1.5)
    const bossLightPt = logicalToWorld(440, 230, this.world)
    bossLamp.position.set(bossLightPt.x, 3.2, bossLightPt.z)
    this.archGroup.add(bossLamp)

    yield 0.444

    // ----- PHÒNG HỌP -----
    const slatCenter = logicalToWorld(1160, OFFICE_WALL_THICK + 3, this.world)
    const slatCount = this.lite ? 10 : 18
    for (let i = 0; i < slatCount; i += 1) {
      const offset = -1.9 + (i * 3.8) / Math.max(1, slatCount - 1)
      archBatch.add(
        new THREE.BoxGeometry(0.07, 1.56, 0.035),
        woodSlatMat,
        [slatCenter.x + offset, 1.58, slatCenter.z + 0.01],
        undefined,
        undefined,
        false
      )
    }

    const credenzaPt = this.toWorldCenter(1015, 22, 290, 52)
    archBatch.add(new THREE.BoxGeometry(2.9, 0.56, 0.48), wallNavyMat, [
      credenzaPt.x,
      0.28,
      credenzaPt.z,
    ])
    archBatch.add(
      new THREE.BoxGeometry(2.96, 0.05, 0.52),
      woodTrimMat,
      [credenzaPt.x, 0.585, credenzaPt.z],
      undefined,
      undefined,
      false
    )
    archBatch.add(
      new THREE.BoxGeometry(1.1, 0.075, 0.11),
      wallDarkBaseMat,
      [credenzaPt.x, 0.65, credenzaPt.z + 0.08],
      undefined,
      undefined,
      false
    )

    const wbPt = logicalToWorld(758, 275, this.world)
    archBatch.addBox(0.05, 0.92, 1.68, frameMetalMat, wbPt.x + 0.03, 1.26, wbPt.z, false)
    const wbFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.58, 0.84),
      new THREE.MeshStandardMaterial({
        map: createWhiteboardTexture(),
        roughness: 0.3,
      })
    )
    wbFace.rotation.y = Math.PI / 2
    wbFace.position.set(wbPt.x + 0.06, 1.26, wbPt.z)
    this.archGroup.add(wbFace)

    const confTable = createConferenceTable(4.2, 1.5, 8, { lite: this.lite })
    const confPt = this.toWorldCenter(948, 200, 420, 150)
    confTable.group.position.set(confPt.x, 0, confPt.z)
    this.mountStaticProp(confTable)

    if (!this.lite) {
      const meetLight = new THREE.PointLight(0xf6f8ff, 0.9, 10, 1.6)
      meetLight.position.set(confPt.x, 3.2, confPt.z)
      this.archGroup.add(meetLight)
    }

    yield 0.481

    // ----- PHÒNG TÀI LIỆU -----
    for (const bx of [1610, 1860, 2110]) {
      const shelf = createBookshelf(2.2, 1.88, 0.6, { lite: this.lite })
      const pt = this.toWorldCenter(bx, 40, 220, 60)
      shelf.group.position.set(pt.x, 0, pt.z)
      this.mountStaticProp(shelf)
    }
    const eastShelf = createBookshelf(2.4, 1.88, 0.6, { lite: this.lite })
    const eastShelfPt = this.toWorldCenter(2300, 140, 60, 240)
    eastShelf.group.position.set(eastShelfPt.x, 0, eastShelfPt.z)
    eastShelf.group.rotation.y = -Math.PI / 2
    this.mountStaticProp(eastShelf)

    const readingDesk = createOfficeDesk({
      variant: "reading",
      width: 2.0,
      depth: 0.9,
      withChair: false,
      hasMug: false,
      lite: this.lite,
    })
    const readPt = this.toWorldCenter(1840, 240, 200, 90)
    readingDesk.group.position.set(readPt.x, 0, readPt.z)
    this.mountStaticProp(readingDesk)

    const docsSignPt = logicalToWorld(1578, 275, this.world)
    const docsSignTex = createSignTexture("KHO TÀI LIỆU IQX", {
      style: "navy_gold",
      subtext: "Quy trình · Báo cáo · KPI",
      width: 384,
      height: 128,
    })
    archBatch.addBox(0.04, 0.56, 1.36, goldMat, docsSignPt.x + 0.02, 1.32, docsSignPt.z, false)
    const docsSignFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.28, 0.48),
      new THREE.MeshStandardMaterial({ map: docsSignTex, roughness: 0.35 })
    )
    docsSignFace.rotation.y = Math.PI / 2
    docsSignFace.position.set(docsSignPt.x + 0.046, 1.32, docsSignPt.z)
    this.archGroup.add(docsSignFace)

    if (!this.lite) {
      const docsLamp = new THREE.PointLight(0xffe5b8, 0.85, 8.5, 1.6)
      docsLamp.position.set(readPt.x, 2.8, readPt.z)
      this.archGroup.add(docsLamp)
    }

    yield 0.519

    // ----- GÓC CÀ PHÊ & STANDEE (Right Side of Staff Area per Spec §3) -----
    const coffeeBar = createPantryCounter(1.7, 0.6, { lite: this.lite })
    const coffeePt = this.toWorldCenter(1860, 640, 170, 60)
    coffeeBar.group.position.set(coffeePt.x, 0, coffeePt.z)
    this.mountStaticProp(coffeeBar)

    const menuPt = logicalToWorld(
      1945,
      OFFICE_DIVIDER_Y + OFFICE_WALL_THICK + 2,
      this.world
    )
    archBatch.addBox(1.26, 0.76, 0.04, woodTrimMat, menuPt.x, 1.32, menuPt.z + 0.02, false)
    const menuFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.16, 0.68),
      new THREE.MeshStandardMaterial({
        map: createCafeMenuTexture(),
        roughness: 0.42,
      })
    )
    menuFace.position.set(menuPt.x, 1.32, menuPt.z + 0.045)
    this.archGroup.add(menuFace)

    yield 0.556

    // Batched Staff Area purposeful decor (merged directly into archBatch)
    const decorBatch = archBatch
    const coolerMat = createMatteMaterial("#eef2f7", { roughness: 0.34 })
    const waterJugMat = new THREE.MeshStandardMaterial({
      color: "#60a5fa",
      transparent: true,
      opacity: 0.78,
      roughness: 0.16,
      metalness: 0.1,
    })
    const redTapMat = createMatteMaterial("#ef4444", { roughness: 0.35 })
    const blueTapMat = createMatteMaterial("#3b82f6", { roughness: 0.35 })
    const stoolSeatMat = createClothMaterial("#2c416b")
    const oakTopTex = this.retainArchTex(createWoodSurfaceTexture("oak"))
    const oakSlabMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: oakTopTex,
      roughness: 0.5,
      metalness: 0.05,
    })
    const lockerDoorMat = createMatteMaterial("#283d66", { roughness: 0.46 })
    const paperMat = createMatteMaterial("#f8fafc", { roughness: 0.68 })
    const printerBodyMat = createMatteMaterial("#e8edf4", { roughness: 0.36 })
    const printerAccentMat = createMatteMaterial("#334155", { roughness: 0.48 })
    const screenCyanMat = createGlowMaterial("#38bdf8", 0.9)
    const leafSmallMat = createMatteMaterial("#419c42", { roughness: 0.54 })
    const folderColors = [
      createMatteMaterial("#2563eb", { roughness: 0.52 }),
      createMatteMaterial("#d97706", { roughness: 0.52 }),
      createMatteMaterial("#10b981", { roughness: 0.52 }),
    ]

    yield 0.593

    // Water Dispenser Cooler with hot/cold taps & side cup tube
    const coolerPt = this.toWorldCenter(
      OFFICE_COFFEE_COOLER_RECT.x,
      OFFICE_COFFEE_COOLER_RECT.y,
      OFFICE_COFFEE_COOLER_RECT.w,
      OFFICE_COFFEE_COOLER_RECT.h
    )
    decorBatch.add(
      roundedBox(0.44, 0.92, 0.44, 0.022, this.lite),
      coolerMat,
      [coolerPt.x, 0.46, coolerPt.z]
    )
    decorBatch.add(
      roundedBox(0.34, 0.22, 0.06, 0.01, this.lite),
      wallDarkBaseMat,
      [coolerPt.x, 0.7, coolerPt.z + 0.2],
      undefined,
      undefined,
      false
    )
    decorBatch.add(
      new THREE.BoxGeometry(0.045, 0.05, 0.05),
      redTapMat,
      [coolerPt.x - 0.07, 0.74, coolerPt.z + 0.23],
      undefined,
      undefined,
      false
    )
    decorBatch.add(
      new THREE.BoxGeometry(0.045, 0.05, 0.05),
      blueTapMat,
      [coolerPt.x + 0.07, 0.74, coolerPt.z + 0.23],
      undefined,
      undefined,
      false
    )
    decorBatch.add(
      new THREE.CylinderGeometry(0.042, 0.042, 0.36, 8),
      coolerMat,
      [coolerPt.x + 0.24, 0.72, coolerPt.z],
      undefined,
      undefined,
      false
    )
    const jug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.42, seg),
      waterJugMat
    )
    jug.position.set(coolerPt.x, 1.13, coolerPt.z)
    jug.castShadow = true
    this.archGroup.add(jug)

    yield 0.63

    // Cafe Bistro Table + 2 high stools
    const bistroPt = this.toWorldCenter(
      OFFICE_COFFEE_TABLE_RECT.x,
      OFFICE_COFFEE_TABLE_RECT.y,
      OFFICE_COFFEE_TABLE_RECT.w,
      OFFICE_COFFEE_TABLE_RECT.h
    )
    const bistroTable = createCoffeeTable(0.95, 0.72, { lite: this.lite })
    bistroTable.group.position.set(bistroPt.x, 0, bistroPt.z)
    this.mountStaticProp(bistroTable)

    for (const side of [-1, 1] as const) {
      const sx = bistroPt.x + side * 0.68
      decorBatch.add(
        new THREE.CylinderGeometry(0.025, 0.035, 0.34, 8),
        frameMetalMat,
        [sx, 0.17, bistroPt.z]
      )
      decorBatch.add(
        new THREE.CylinderGeometry(0.17, 0.16, 0.07, seg),
        stoolSeatMat,
        [sx, 0.36, bistroPt.z]
      )
    }

    const cafeLamp = new THREE.PointLight(0xffdfb0, 1.05, 9, 1.55)
    cafeLamp.position.set(coffeePt.x + 0.6, 2.8, coffeePt.z + 0.6)
    this.archGroup.add(cafeLamp)

    yield 0.667

    // Twin Brass Stanchions flanking the Achievement Standee
    const standeeCenter = logicalToWorld(2195, 1066, this.world)
    for (const side of [-1, 1] as const) {
      const px = standeeCenter.x + side * 1.42
      const pz = standeeCenter.z + 0.16
      decorBatch.add(
        new THREE.CylinderGeometry(0.11, 0.12, 0.04, seg),
        goldMat,
        [px, 0.02, pz],
        undefined,
        undefined,
        false
      )
      decorBatch.add(
        new THREE.CylinderGeometry(0.028, 0.032, 0.72, 8),
        goldMat,
        [px, 0.38, pz]
      )
      decorBatch.add(
        new THREE.SphereGeometry(0.048, 8, 8),
        goldMat,
        [px, 0.76, pz],
        undefined,
        undefined,
        false
      )
    }

    if (!this.lite) {
      const standeeLight = new THREE.PointLight(0xffdf9a, 0.9, 7.5, 1.6)
      standeeLight.position.set(standeeCenter.x, 3.1, standeeCenter.z + 1.0)
      this.archGroup.add(standeeLight)
    }

    yield 0.704

    // ----- PERSONAL STAFF LOCKERS (West & East Walls) -----
    for (const locker of getOfficeLockers(worldH)) {
      const pt = this.toWorldCenter(locker.x, locker.y, locker.w, locker.h)
      const lw = locker.w * s
      const ld = locker.h * s
      const lh = 1.18
      const faceDir = locker.wall === "west" ? 1 : -1

      // Carcass + oak counter top + plinth
      decorBatch.add(
        roundedBox(lw - 0.04, 0.08, ld - 0.04, 0.01, this.lite),
        wallDarkBaseMat,
        [pt.x, 0.04, pt.z]
      )
      decorBatch.add(
        roundedBox(lw, lh - 0.08, ld, 0.02, this.lite),
        wallNavyMat,
        [pt.x, 0.08 + (lh - 0.08) / 2, pt.z]
      )
      decorBatch.add(
        roundedBox(lw + 0.05, 0.048, ld + 0.05, 0.014, this.lite),
        oakSlabMat,
        [pt.x, lh + 0.024, pt.z]
      )

      const baySpan = (ld - 0.1) / locker.bays
      for (let b = 0; b < locker.bays; b += 1) {
        const bz = pt.z - (ld - 0.1) / 2 + (b + 0.5) * baySpan
        const doorX = pt.x + faceDir * (lw / 2 + 0.012)
        // Upper & lower locker doors
        for (const dy of [0.36, 0.88]) {
          decorBatch.add(
            roundedBox(0.024, 0.45, baySpan - 0.04, 0.008, this.lite),
            lockerDoorMat,
            [doorX, dy, bz]
          )
          // Brass handle + name card slot
          decorBatch.add(
            roundedBox(0.02, 0.08, 0.018, 0.004, this.lite),
            goldMat,
            [doorX + faceDir * 0.016, dy, bz + baySpan * 0.3],
            undefined,
            undefined,
            false
          )
          decorBatch.add(
            new THREE.BoxGeometry(0.01, 0.036, 0.085),
            paperMat,
            [doorX + faceDir * 0.014, dy + 0.14, bz],
            undefined,
            undefined,
            false
          )
        }
      }
    }

    yield 0.741

    // ----- PRINTER / COPIER & SUPPLY STATION -----
    const printer = getPrinterStationRect(worldH)
    const prPt = this.toWorldCenter(printer.x, printer.y, printer.w, printer.h)
    const prW = printer.w * s
    const prD = printer.h * s
    const prBaseH = 0.72
    // Supply cabinet base + oak top
    decorBatch.add(
      roundedBox(prW - 0.06, 0.06, prD - 0.06, 0.01, this.lite),
      wallDarkBaseMat,
      [prPt.x, 0.03, prPt.z]
    )
    decorBatch.add(
      roundedBox(prW, prBaseH - 0.06, prD, 0.022, this.lite),
      wallNavyMat,
      [prPt.x, 0.06 + (prBaseH - 0.06) / 2, prPt.z]
    )
    decorBatch.add(
      roundedBox(prW + 0.06, 0.052, prD + 0.06, 0.016, this.lite),
      oakSlabMat,
      [prPt.x, prBaseH + 0.026, prPt.z]
    )
    for (const side of [-1, 1] as const) {
      decorBatch.add(
        roundedBox(prW * 0.44, prBaseH - 0.18, 0.022, 0.008, this.lite),
        lockerDoorMat,
        [prPt.x + side * (prW * 0.24), prBaseH * 0.52, prPt.z + prD / 2 + 0.008]
      )
      decorBatch.add(
        roundedBox(0.09, 0.018, 0.02, 0.004, this.lite),
        goldMat,
        [prPt.x + side * (prW * 0.24), prBaseH * 0.72, prPt.z + prD / 2 + 0.022],
        undefined,
        undefined,
        false
      )
    }
    const prTopY = prBaseH + 0.052
    // Multifunction copier machine (left side of cabinet)
    const cx = prPt.x - prW * 0.17
    decorBatch.add(
      roundedBox(0.76, 0.44, 0.54, 0.028, this.lite),
      printerBodyMat,
      [cx, prTopY + 0.22, prPt.z - 0.02]
    )
    decorBatch.add(
      roundedBox(0.78, 0.07, 0.52, 0.018, this.lite),
      printerAccentMat,
      [cx, prTopY + 0.47, prPt.z - 0.03]
    )
    // Paper feed tray slots + glowing status LCD + printed sheet in tray
    decorBatch.add(
      roundedBox(0.56, 0.09, 0.03, 0.008, this.lite),
      printerAccentMat,
      [cx, prTopY + 0.12, prPt.z + 0.25],
      undefined,
      undefined,
      false
    )
    decorBatch.add(
      roundedBox(0.18, 0.08, 0.03, 0.006, this.lite),
      screenCyanMat,
      [cx + 0.22, prTopY + 0.36, prPt.z + 0.255],
      [-0.35, 0, 0],
      undefined,
      false
    )
    decorBatch.add(
      new THREE.BoxGeometry(0.28, 0.012, 0.22),
      paperMat,
      [cx - 0.08, prTopY + 0.34, prPt.z + 0.28],
      [0.14, 0, 0],
      undefined,
      false
    )
    // Stacked A4 paper reams & colorful file organizer (right side of cabinet)
    const sx = prPt.x + prW * 0.27
    for (let r = 0; r < 3; r += 1) {
      decorBatch.add(
        roundedBox(0.3, 0.055, 0.22, 0.006, this.lite),
        paperMat,
        [sx, prTopY + 0.028 + r * 0.06, prPt.z + 0.04],
        [0, (r - 1) * 0.05, 0],
        undefined,
        false
      )
    }
    folderColors.forEach((mat, idx) => {
      decorBatch.add(
        roundedBox(0.065, 0.26, 0.22, 0.008, this.lite),
        mat,
        [sx + 0.22 + idx * 0.072, prTopY + 0.13, prPt.z - 0.08],
        undefined,
        undefined,
        false
      )
    })

    yield 0.778

    // ----- SOUTH-CENTER MAGAZINE & SUPPLY CREDENZA -----
    const cred = getSouthCredenzaRect(worldH)
    const crPt = this.toWorldCenter(cred.x, cred.y, cred.w, cred.h)
    const crW = cred.w * s
    const crD = cred.h * s
    const crH = 0.64
    // Tapered brass feet + walnut cabinet + oak slab top
    for (const fx of [-1, 1] as const) {
      for (const fz of [-1, 1] as const) {
        decorBatch.add(
          new THREE.CylinderGeometry(0.026, 0.02, 0.12, 8),
          goldMat,
          [crPt.x + fx * (crW * 0.44), 0.06, crPt.z + fz * (crD * 0.36)]
        )
      }
    }
    decorBatch.add(
      roundedBox(crW, crH - 0.12, crD, 0.024, this.lite),
      woodTrimMat,
      [crPt.x, 0.12 + (crH - 0.12) / 2, crPt.z]
    )
    decorBatch.add(
      roundedBox(crW + 0.06, 0.048, crD + 0.06, 0.016, this.lite),
      oakSlabMat,
      [crPt.x, crH + 0.024, crPt.z]
    )
    const crTopY = crH + 0.048
    // Colorful binders, stacked journals, gold orb & mini succulent on credenza
    folderColors.forEach((mat, idx) => {
      decorBatch.add(
        roundedBox(0.07, 0.26, 0.22, 0.008, this.lite),
        mat,
        [crPt.x - crW * 0.34 + idx * 0.085, crTopY + 0.13, crPt.z - 0.04]
      )
    })
    decorBatch.add(
      roundedBox(0.38, 0.04, 0.26, 0.006, this.lite),
      paperMat,
      [crPt.x + 0.04, crTopY + 0.02, crPt.z + 0.02],
      [0, 0.08, 0],
      undefined,
      false
    )
    decorBatch.add(
      new THREE.SphereGeometry(0.085, seg, seg),
      goldMat,
      [crPt.x + 0.56, crTopY + 0.085, crPt.z]
    )
    decorBatch.add(
      new THREE.CylinderGeometry(0.075, 0.058, 0.11, seg),
      paperMat,
      [crPt.x + crW * 0.36, crTopY + 0.055, crPt.z]
    )
    decorBatch.add(
      new THREE.SphereGeometry(0.11, seg, Math.max(6, seg - 4)),
      leafSmallMat,
      [crPt.x + crW * 0.36, crTopY + 0.16, crPt.z]
    )

    yield 0.815

    // ----- SOUTH-CENTER-RIGHT COLLABORATIVE HUDDLE NOOK -----
    const huddle = getHuddleNookPositions(worldH)
    const huddleRug = createRug(huddle.rug.w * s, huddle.rug.h * s, {
      shape: "rounded",
      colorHex: "#ece0cb",
      borderHex: "#24365e",
      borderWidth: 0.12,
      lite: this.lite,
    })
    const huddleRugPt = this.toWorldCenter(
      huddle.rug.x,
      huddle.rug.y,
      huddle.rug.w,
      huddle.rug.h
    )
    huddleRug.group.position.set(huddleRugPt.x, 0.01, huddleRugPt.z)
    this.mountStaticProp(huddleRug)

    const huddleTable = createCoffeeTable(
      huddle.table.w * s,
      huddle.table.h * s,
      { lite: this.lite }
    )
    const huddleTablePt = this.toWorldCenter(
      huddle.table.x,
      huddle.table.y,
      huddle.table.w,
      huddle.table.h
    )
    huddleTable.group.position.set(huddleTablePt.x, 0, huddleTablePt.z)
    this.mountStaticProp(huddleTable)

    for (const side of [-1, 1] as const) {
      const sx = huddleTablePt.x + side * 0.78
      decorBatch.add(
        new THREE.CylinderGeometry(0.032, 0.04, 0.28, 8),
        goldMat,
        [sx, 0.14, huddleTablePt.z]
      )
      decorBatch.add(
        new THREE.CylinderGeometry(0.21, 0.2, 0.11, seg),
        stoolSeatMat,
        [sx, 0.32, huddleTablePt.z]
      )
    }

    yield 0.852

    // ----- KHU NHÂN VIÊN: SOUTH-WEST LOUNGE + READING LAMP -----
    const lounge = getLoungePositions(worldH)
    const rug = createRug(lounge.rug.w * s, lounge.rug.h * s, {
      shape: "oval",
      colorHex: "#f1e6d2",
      borderHex: "#22325a",
      borderWidth: 0.14,
      lite: this.lite,
    })
    const rugPt = this.toWorldCenter(
      lounge.rug.x,
      lounge.rug.y,
      lounge.rug.w,
      lounge.rug.h
    )
    rug.group.position.set(rugPt.x, 0.01, rugPt.z)
    this.mountStaticProp(rug)

    const loungeSofa = createSofa(
      lounge.sofa.w * s,
      lounge.sofa.h * s,
      "#24365e",
      { lite: this.lite }
    )
    const sofaPt = this.toWorldCenter(
      lounge.sofa.x,
      lounge.sofa.y,
      lounge.sofa.w,
      lounge.sofa.h
    )
    loungeSofa.group.position.set(sofaPt.x, 0, sofaPt.z)
    this.mountStaticProp(loungeSofa)

    const loungeTable = createCoffeeTable(
      lounge.table.w * s,
      lounge.table.h * s,
      { lite: this.lite }
    )
    const loungeTablePt = this.toWorldCenter(
      lounge.table.x,
      lounge.table.y,
      lounge.table.w,
      lounge.table.h
    )
    loungeTable.group.position.set(loungeTablePt.x, 0, loungeTablePt.z)
    this.mountStaticProp(loungeTable)

    // Warm standing floor lamp beside SW lounge sofa
    const loungeLampPt = logicalToWorld(
      lounge.sofa.x + lounge.sofa.w + 18,
      lounge.sofa.y + 24,
      this.world
    )
    decorBatch.add(
      new THREE.CylinderGeometry(0.13, 0.15, 0.04, seg),
      goldMat,
      [loungeLampPt.x, 0.02, loungeLampPt.z],
      undefined,
      undefined,
      false
    )
    decorBatch.add(
      new THREE.CylinderGeometry(0.02, 0.024, 1.32, 8),
      goldMat,
      [loungeLampPt.x, 0.68, loungeLampPt.z],
      undefined,
      undefined,
      false
    )
    decorBatch.add(
      new THREE.CylinderGeometry(0.13, 0.2, 0.25, seg),
      lampShadeMat,
      [loungeLampPt.x, 1.38, loungeLampPt.z],
      undefined,
      undefined,
      false
    )

    yield 0.889

    // ----- FRAMED OFFICE WALL ART ON WEST & EAST STAFF WALLS -----
    for (const art of getOfficeWallArt(worldH)) {
      const isWest = art.wall === "west"
      const dir = isWest ? 1 : -1
      const pt = logicalToWorld(
        isWest ? OFFICE_WALL_THICK + 2 : OFFICE_BASE_W - OFFICE_WALL_THICK - 2,
        art.pos,
        this.world
      )
      archBatch.addBox(0.04, art.heightU + 0.08, art.widthU + 0.08, goldMat, pt.x + dir * 0.02, art.centerY, pt.z, false)
      archBatch.add(
        new THREE.PlaneGeometry(art.widthU, art.heightU),
        getArtMaterial(art.variant),
        [pt.x + dir * 0.046, art.centerY, pt.z],
        [0, isWest ? Math.PI / 2 : -Math.PI / 2, 0],
        undefined,
        false
      )
    }

    archBatch.flushInto(this.archGroup)

    yield 0.926

    // Merge static non-instanced prop meshes (rugs, sofas, tables, pantry, shelf frames) per material
    mergeStaticPropsInto(this.staticProps, this.archGroup)

    yield 0.963

    // ----- INSTANCED POTTED PLANT CLUSTERS -----
    const tallPlantTransforms: InstancedPropTransform[] = []
    const smallPlantTransforms: InstancedPropTransform[] = []
    for (const plantSpec of getOfficePlants(worldH)) {
      const pt = logicalToWorld(plantSpec.x + 28, plantSpec.y + 52, this.world)
      if (plantSpec.tall) {
        tallPlantTransforms.push({ x: pt.x, z: pt.z })
      } else {
        smallPlantTransforms.push({ x: pt.x, z: pt.z })
      }
    }
    if (tallPlantTransforms.length > 0) {
      this.mountStaticProp(
        createInstancedPottedPlants("tall", tallPlantTransforms, {
          lite: this.lite,
        })
      )
    }
    if (smallPlantTransforms.length > 0) {
      this.mountStaticProp(
        createInstancedPottedPlants("small", smallPlantTransforms, {
          lite: this.lite,
        })
      )
    }

    freezeStaticSubtree(this.archGroup)
    this.hostBridge?.markShadowDirty()
  }

  private mountStaticProp(prop: DisposableProp): void {
    this.archGroup.add(prop.group)
    this.staticProps.push(prop)
  }

  /**
   * Builds all open-plan staff desk pods (`totalDesks >= 24`) via `InstancedMesh`
   * (shared desk bodies, ergonomic swivel chairs, ON/OFF monitor screens, acoustic
   * pod dividers, mugs, and neutral "Bàn trống" plates) plus unique member nameplates.
   */
  private *buildInstancedStaffPodsSteps(
    slots: readonly OfficeDeskSlot[],
    podBands: number,
    selfUserId: string | null
  ): BuildSteps {
    if (slots.length === 0) return

    const s = OFFICE_WORLD_SCALE
    const deskW = OFFICE_DESK_W * s
    const deskD = OFFICE_DESK_H * s
    const topSurfaceY = 0.76 + 0.064 / 2

    const retainTeam = (tex: THREE.Texture): void => {
      this.retainTeamTex(tex)
    }
    const deskSpecs = createStaffDeskPrototypeSpecs(
      deskW,
      deskD,
      this.lite,
      retainTeam
    )
    const chairSpecs = createSwivelChairPrototypeSpecs(this.lite, retainTeam)
    const dividerSpecs = createPodDividerPrototypeSpecs(
      OFFICE_POD_W * s,
      OFFICE_POD_DIVIDER_H * s,
      this.lite,
      retainTeam
    )

    // 1. Instanced Desk Bodies (all occupied + empty slots in ~7 draw calls total)
    const deskMeshes = deskSpecs.map((spec) => {
      const inst = new THREE.InstancedMesh(
        spec.geometry,
        spec.material,
        slots.length
      )
      inst.name = "office-staff-desks-instanced"
      inst.castShadow = spec.castShadow
      inst.receiveShadow = spec.receiveShadow
      return inst
    })

    yield 0.55

    // 2. Instanced Ergonomic Swivel Chairs (tucked-in on empty desks, slightly pulled out on occupied)
    const chairMeshes = chairSpecs.map((spec) => {
      const inst = new THREE.InstancedMesh(
        spec.geometry,
        spec.material,
        slots.length
      )
      inst.name = "office-staff-chairs-instanced"
      inst.castShadow = spec.castShadow
      inst.receiveShadow = spec.receiveShadow
      return inst
    })

    const occupiedSlots: OfficeDeskSlot[] = []
    const emptySlots: OfficeDeskSlot[] = []
    const mugSlots: OfficeDeskSlot[] = []

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!
      const pt = this.toWorldCenter(slot.x, slot.y, slot.w, slot.h)
      const isSouth = slot.facing === "south"
      const deskRotY = isSouth ? 0 : Math.PI

      scratchPos.set(pt.x, 0, pt.z)
      scratchEuler.set(0, deskRotY, 0)
      scratchQuat.setFromEuler(scratchEuler)
      scratchScale.set(1, 1, 1)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
      for (const inst of deskMeshes) {
        inst.setMatrixAt(i, scratchMatrix)
      }

      // Chair: tucked neatly under desk when empty, slightly pulled out with natural angle when occupied
      const chairOffset = deskD / 2 + (slot.occupied ? 0.2 : 0.05)
      const chairZ = isSouth ? pt.z + chairOffset : pt.z - chairOffset
      const jitter = slot.occupied ? (((i * 7) % 5) - 2) * 0.045 : 0
      const chairRotY = (isSouth ? Math.PI : 0) + jitter
      scratchPos.set(pt.x, 0, chairZ)
      scratchEuler.set(0, chairRotY, 0)
      scratchQuat.setFromEuler(scratchEuler)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
      for (const inst of chairMeshes) {
        inst.setMatrixAt(i, scratchMatrix)
      }

      if (slot.occupied) {
        occupiedSlots.push(slot)
        if (slot.member?.hasMug) mugSlots.push(slot)
      } else {
        emptySlots.push(slot)
      }
    }

    for (const inst of [...deskMeshes, ...chairMeshes]) {
      inst.instanceMatrix.needsUpdate = true
      inst.computeBoundingSphere()
      this.teamPropsGroup.add(inst)
    }

    yield 0.62

    // 3. Instanced Monitor Screens & Status LEDs: ON (glowing) vs OFF (powered-off dark matte)
    const screenGeo = new THREE.PlaneGeometry(0.51, 0.28)
    const ledGeo = new THREE.SphereGeometry(0.0085, 6, 6)
    const screenLocalZ = -deskD * 0.24 + 0.019
    const screenLocalY = topSurfaceY + 0.258
    const ledLocalY = topSurfaceY + 0.105

    const mountMonitorBatch = (
      targetSlots: readonly OfficeDeskSlot[],
      screenMaterial: THREE.Material,
      ledMaterial: THREE.Material,
      nameSuffix: string
    ): void => {
      if (targetSlots.length === 0) return
      const screens = new THREE.InstancedMesh(
        screenGeo.clone(),
        screenMaterial,
        targetSlots.length
      )
      screens.name = `office-monitors-${nameSuffix}`
      screens.castShadow = false
      screens.receiveShadow = false

      const leds = new THREE.InstancedMesh(
        ledGeo.clone(),
        ledMaterial,
        targetSlots.length
      )
      leds.castShadow = false
      leds.receiveShadow = false

      for (let i = 0; i < targetSlots.length; i += 1) {
        const slot = targetSlots[i]!
        const pt = this.toWorldCenter(slot.x, slot.y, slot.w, slot.h)
        const isSouth = slot.facing === "south"
        const dir = isSouth ? 1 : -1
        const rotY = isSouth ? 0 : Math.PI

        scratchPos.set(pt.x, screenLocalY, pt.z + dir * screenLocalZ)
        scratchEuler.set(0, rotY, 0)
        scratchQuat.setFromEuler(scratchEuler)
        scratchScale.set(1, 1, 1)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        screens.setMatrixAt(i, scratchMatrix)

        scratchPos.set(
          pt.x + dir * 0.22,
          ledLocalY,
          pt.z + dir * (screenLocalZ - 0.001)
        )
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        leds.setMatrixAt(i, scratchMatrix)
      }
      screens.instanceMatrix.needsUpdate = true
      screens.computeBoundingSphere()
      leds.instanceMatrix.needsUpdate = true
      leds.computeBoundingSphere()
      this.teamPropsGroup.add(screens, leds)
    }

    if (occupiedSlots.length > 0) {
      const onTex = this.retainTeamTex(createMonitorScreenTexture("staff"))
      const monitorOnMat = new THREE.MeshStandardMaterial({
        map: onTex,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: onTex,
        emissiveIntensity: 0.54,
        roughness: 0.22,
        metalness: 0.08,
      })
      const ledOnMat = createGlowMaterial("#34c38f", 1.2)
      mountMonitorBatch(occupiedSlots, monitorOnMat, ledOnMat, "on")
    }
    if (emptySlots.length > 0) {
      const monitorOffMat = new THREE.MeshStandardMaterial({
        color: "#0e1525",
        roughness: 0.22,
        metalness: 0.24,
      })
      const ledOffMat = createMatteMaterial("#475569", { roughness: 0.5 })
      mountMonitorBatch(emptySlots, monitorOffMat, ledOffMat, "off")
    }
    screenGeo.dispose()
    ledGeo.dispose()

    yield 0.7

    // 4. Instanced Coffee Mugs (only on occupied desks with hasMug = true)
    if (mugSlots.length > 0) {
      const mugSeg = this.lite ? 8 : 12
      const mugBodyGeo = new THREE.CylinderGeometry(0.044, 0.038, 0.086, mugSeg)
      const mugBodyMat = createMatteMaterial("#faf8f5", {
        roughness: 0.24,
        metalness: 0.06,
      })
      const mugTopGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.01, mugSeg)
      const mugTopMat = createMatteMaterial("#3f1f0e", { roughness: 0.3 })

      const mugInst = new THREE.InstancedMesh(
        mugBodyGeo,
        mugBodyMat,
        mugSlots.length
      )
      const coffeeInst = new THREE.InstancedMesh(
        mugTopGeo,
        mugTopMat,
        mugSlots.length
      )
      for (let i = 0; i < mugSlots.length; i += 1) {
        const slot = mugSlots[i]!
        const pt = this.toWorldCenter(slot.x, slot.y, slot.w, slot.h)
        const dir = slot.facing === "south" ? 1 : -1
        scratchPos.set(
          pt.x + dir * (deskW * 0.34),
          topSurfaceY + 0.043,
          pt.z + dir * (deskD * 0.14)
        )
        scratchQuat.identity()
        scratchScale.set(1, 1, 1)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        mugInst.setMatrixAt(i, scratchMatrix)

        scratchPos.y = topSurfaceY + 0.084
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        coffeeInst.setMatrixAt(i, scratchMatrix)
      }
      mugInst.instanceMatrix.needsUpdate = true
      mugInst.computeBoundingSphere()
      coffeeInst.instanceMatrix.needsUpdate = true
      coffeeInst.computeBoundingSphere()
      this.teamPropsGroup.add(mugInst, coffeeInst)
    }

    yield 0.76

    // 5. Instanced Low Acoustic Pod Dividers between back-to-back rows
    const podDividers = getOfficePodDividers(podBands)
    if (podDividers.length > 0) {
      for (const spec of dividerSpecs) {
        const inst = new THREE.InstancedMesh(
          spec.geometry,
          spec.material,
          podDividers.length
        )
        inst.name = "office-pod-dividers-instanced"
        inst.castShadow = spec.castShadow
        inst.receiveShadow = spec.receiveShadow
        for (let i = 0; i < podDividers.length; i += 1) {
          const div = podDividers[i]!
          const pt = this.toWorldCenter(div.x, div.y, div.w, div.h)
          scratchPos.set(pt.x, 0, pt.z)
          scratchQuat.identity()
          scratchScale.set(1, 1, 1)
          scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
          inst.setMatrixAt(i, scratchMatrix)
        }
        inst.instanceMatrix.needsUpdate = true
        inst.computeBoundingSphere()
        this.teamPropsGroup.add(inst)
      }
    }

    yield 0.82

    // 6. Instanced Neutral "Bàn trống" Nameplates on all empty desks (2 draw calls total!)
    const plateW = 0.96
    const plateH = 0.2

    if (emptySlots.length > 0) {
      const emptyBaseMat = createMatteMaterial("#6f5234", { roughness: 0.56 })
      const emptyBezelMat = createMatteMaterial("#161f33", {
        roughness: 0.34,
        metalness: 0.22,
      })
      const holderBatch = new MeshBatcher()
      holderBatch.add(
        roundedBox(plateW + 0.04, 0.024, 0.088, 0.008, this.lite),
        emptyBaseMat,
        [0, 0.012, 0]
      )
      holderBatch.add(
        roundedBox(plateW, plateH, 0.036, 0.012, this.lite),
        emptyBezelMat,
        [0, 0.1, 0],
        [-0.24, 0, 0]
      )
      const holderSpecs = holderBatch.flushToSpecs()
      const emptyPlateTex = createEmptyDeskPlateTexture(this.lite)
      const emptyPlateMat = new THREE.MeshStandardMaterial({
        map: emptyPlateTex,
        roughness: 0.36,
        metalness: 0.12,
      })
      const emptyFaceGeo = new THREE.PlaneGeometry(plateW - 0.04, plateH - 0.03)
      const emptyFaceInst = new THREE.InstancedMesh(
        emptyFaceGeo,
        emptyPlateMat,
        emptySlots.length
      )
      emptyFaceInst.name = "office-empty-desk-plates"
      emptyFaceInst.castShadow = false

      const holderInsts = holderSpecs.map(
        (spec) =>
          new THREE.InstancedMesh(spec.geometry, spec.material, emptySlots.length)
      )

      for (let i = 0; i < emptySlots.length; i += 1) {
        const slot = emptySlots[i]!
        const pt = this.toWorldCenter(slot.x, slot.y, slot.w, slot.h)
        const plateZ =
          slot.facing === "south"
            ? pt.z + deskD * 0.4
            : pt.z - deskD * 0.38

        scratchPos.set(pt.x, topSurfaceY, plateZ)
        scratchQuat.identity()
        scratchScale.set(1, 1, 1)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        for (const hInst of holderInsts) {
          hInst.setMatrixAt(i, scratchMatrix)
        }

        scratchPos.set(pt.x, topSurfaceY + 0.104, plateZ + 0.024)
        scratchEuler.set(-0.24, 0, 0)
        scratchQuat.setFromEuler(scratchEuler)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        emptyFaceInst.setMatrixAt(i, scratchMatrix)
      }

      for (const hInst of holderInsts) {
        hInst.instanceMatrix.needsUpdate = true
        hInst.computeBoundingSphere()
        this.teamPropsGroup.add(hInst)
      }
      emptyFaceInst.instanceMatrix.needsUpdate = true
      emptyFaceInst.computeBoundingSphere()
      this.teamPropsGroup.add(emptyFaceInst)
    }

    yield 0.9

    // 7. Member Desk Nameplates (packed into ONE atlas texture, 1-2 draw calls total!)
    if (occupiedSlots.length > 0) {
      const validSlots = occupiedSlots.filter((slot) => Boolean(slot.member))
      if (validSlots.length > 0) {
        const hasSelfDesk = Boolean(
          selfUserId &&
            validSlots.some((slot) => slot.member!.userId === selfUserId)
        )
        const hasOtherDesk = validSlots.some(
          (slot) => !selfUserId || slot.member!.userId !== selfUserId
        )
        const plateBaseMat = hasOtherDesk
          ? createMatteMaterial("#6f5234", { roughness: 0.56 })
          : null
        const plateBezelMat = hasOtherDesk
          ? createMatteMaterial("#161f33", { roughness: 0.34, metalness: 0.22 })
          : null
        const plateGoldBaseMat = hasSelfDesk
          ? createMetalMaterial("#e9b949", { roughness: 0.24, metalness: 0.84 })
          : null

        const atlasEntries: NameplateAtlasEntry[] = validSlots.map((slot) => {
          const member = slot.member!
          const isSelf = Boolean(selfUserId && member.userId === selfUserId)
          return {
            text: member.displayName,
            style: isSelf ? "gold_plate" : "navy_gold",
          }
        })
        const atlas = createNameplateAtlasTexture(atlasEntries, {
          lite: this.lite,
        })
        const atlasMat = new THREE.MeshStandardMaterial({
          map: atlas.texture,
          roughness: 0.3,
          metalness: 0.16,
        })

        const memberHolderBatch = new MeshBatcher()
        const otherPlateGeos: THREE.BufferGeometry[] = []

        for (let i = 0; i < validSlots.length; i += 1) {
          const slot = validSlots[i]!
          const member = slot.member!
          const isSelf = Boolean(selfUserId && member.userId === selfUserId)
          const pt = this.toWorldCenter(slot.x, slot.y, slot.w, slot.h)
          const plateZ =
            slot.facing === "south"
              ? pt.z + deskD * 0.4
              : pt.z - deskD * 0.38

          memberHolderBatch.add(
            roundedBox(plateW + 0.05, 0.026, 0.092, 0.008, this.lite),
            (isSelf ? plateGoldBaseMat : plateBaseMat)!,
            [pt.x, topSurfaceY + 0.013, plateZ]
          )
          memberHolderBatch.add(
            roundedBox(plateW + 0.02, plateH + 0.01, 0.04, 0.012, this.lite),
            (isSelf ? plateGoldBaseMat : plateBezelMat)!,
            [pt.x, topSurfaceY + 0.105, plateZ],
            [-0.24, 0, 0]
          )

          const faceGeo = new THREE.PlaneGeometry(plateW - 0.04, plateH - 0.025)
          const [u0, v0, u1, v1] = atlas.getUvRect(i)
          const uv = faceGeo.getAttribute("uv")
          if (uv && uv.count >= 4) {
            uv.setXY(0, u0, v1)
            uv.setXY(1, u1, v1)
            uv.setXY(2, u0, v0)
            uv.setXY(3, u1, v0)
            uv.needsUpdate = true
          }

          if (isSelf) {
            const selfMesh = new THREE.Mesh(faceGeo, atlasMat)
            selfMesh.name = "office-self-desk-plate"
            selfMesh.position.set(pt.x, topSurfaceY + 0.11, plateZ + 0.026)
            selfMesh.rotation.x = -0.24
            this.teamPropsGroup.add(selfMesh)
          } else {
            faceGeo.rotateX(-0.24)
            faceGeo.translate(pt.x, topSurfaceY + 0.11, plateZ + 0.026)
            otherPlateGeos.push(faceGeo)
          }
        }

        if (otherPlateGeos.length > 0) {
          const mergedPlates = mergeIndexedGeometries(otherPlateGeos, {
            disposeInputs: true,
          })
          if (mergedPlates) {
            mergedPlates.computeBoundingSphere()
            const othersMesh = new THREE.Mesh(mergedPlates, atlasMat)
            othersMesh.name = "office-member-desk-plate"
            this.teamPropsGroup.add(othersMesh)
          }
        }

        memberHolderBatch.flushInto(this.teamPropsGroup)
      }
    }
  }

  /**
   * Rebuilds Boss Desk, Big Team Banner Rug ("IQX · NHÓM {TÊN SẾP}"), and ALL
   * furnished open-plan staff desk pods (expanding architecture if `worldH` grew).
   */
  rebuildTeamProps(
    bossName: string,
    desks: readonly OfficeDeskPlacement[],
    selfUserId: string | null,
    worldH: number,
    totalDesks?: number
  ): void {
    runBuildSync(
      this.rebuildTeamPropsSteps(bossName, desks, selfUserId, worldH, totalDesks)
    )
  }

  /** Step-wise `rebuildTeamProps` (yields between desk-pod layers) for time-sliced boot builds. */
  *rebuildTeamPropsSteps(
    bossName: string,
    desks: readonly OfficeDeskPlacement[],
    selfUserId: string | null,
    worldH: number,
    totalDesks?: number
  ): BuildSteps {
    if (this.disposed) return

    if (worldH !== this.currentWorldH) {
      this.currentWorldH = worldH
      this.world.logicalH = worldH
      const meetScreenPt = logicalToWorld(1160, 26, this.world)
      this.meetingBoard.group.position.set(
        meetScreenPt.x,
        1.58,
        meetScreenPt.z
      )
      this.meetingBoard.group.updateMatrix()
      this.meetingBoard.group.updateMatrixWorld(true)
      const standeePt = logicalToWorld(2195, 1066, this.world)
      this.standeeBoard.group.position.set(standeePt.x, 0, standeePt.z)
      this.standeeBoard.group.updateMatrix()
      this.standeeBoard.group.updateMatrixWorld(true)
      yield* this.buildArchitectureSteps(worldH)
    }

    this.clearTeamProps()
    yield 0.1

    // 1. Boss Desk with dual monitors, coffee mug, swivel chair & walnut nameplate
    const bossLabel = bossName.trim()
      ? `Bàn sếp · ${bossName.trim()}`
      : "Bàn sếp"
    const bossDesk = createOfficeDesk({
      variant: "boss",
      width: 2.8,
      depth: 1.0,
      dualMonitor: true,
      hasMug: true,
      withChair: true,
      nameplate: bossLabel,
      highlightGold: false,
      lite: this.lite,
    })
    const bossPt = this.toWorldCenter(300, 180, 280, 100)
    bossDesk.group.position.set(bossPt.x, 0, bossPt.z)
    this.teamPropsGroup.add(bossDesk.group)
    this.teamProps.push(bossDesk)
    yield 0.3

    // 2. Big Walkable Team Banner Rug ("IQX · NHÓM {TÊN SẾP}") centered on the Staff Promenade
    const s = OFFICE_WORLD_SCALE
    const bannerRect = getTeamBannerRugRect()
    const bannerPt = this.toWorldCenter(
      bannerRect.x,
      bannerRect.y,
      bannerRect.w,
      bannerRect.h
    )
    const bannerTex = createTeamBannerRugTexture(bossName, this.lite)
    const bannerMat = new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.78,
      metalness: 0.08,
    })
    const bannerBaseMat = createMatteMaterial("#e9b949", {
      roughness: 0.42,
      metalness: 0.35,
    })
    const bannerPlinth = new THREE.Mesh(
      roundedBox(
        bannerRect.w * s + 0.08,
        0.018,
        bannerRect.h * s + 0.08,
        0.008,
        this.lite
      ),
      bannerBaseMat
    )
    bannerPlinth.position.set(bannerPt.x, 0.009, bannerPt.z)
    bannerPlinth.receiveShadow = true
    this.teamPropsGroup.add(bannerPlinth)

    const bannerFace = new THREE.Mesh(
      new THREE.PlaneGeometry(bannerRect.w * s, bannerRect.h * s),
      bannerMat
    )
    bannerFace.name = "office-team-banner-rug"
    bannerFace.rotation.x = -Math.PI / 2
    bannerFace.position.set(bannerPt.x, 0.02, bannerPt.z)
    bannerFace.receiveShadow = true
    this.teamPropsGroup.add(bannerFace)

    // 3. Full Open-Plan Staff Desk Pod Grid (occupied + empty desks via InstancedMesh!)
    const dims = computeOfficeDimensions(desks.length)
    const resolvedTotal = totalDesks ?? dims.totalDesks
    const podBands = Math.max(dims.podBands, Math.ceil(resolvedTotal / 12))
    const allSlots = buildAllDeskSlots(desks, resolvedTotal)
    yield 0.45
    yield* this.buildInstancedStaffPodsSteps(allSlots, podBands, selfUserId)

    freezeStaticSubtree(this.teamPropsGroup)
    this.hostBridge?.markShadowDirty()
    this.hostBridge?.requestFrame()
  }

  /** Re-flags dynamic canvas textures after a WebGL context restore. */
  refreshDynamicTextures(): void {
    if (this.disposed) return
    this.meetingBoard.update()
    this.standeeBoard.update()
    this.hostBridge?.requestFrame()
  }

  /** Repaints the live Meeting Room Wall Screen canvas texture only on content change. */
  updateMeetingScreen(meeting: OfficeMeeting | null): void {
    if (this.disposed) return
    const title = meeting ? meeting.title : "Phòng họp nhóm"
    const subtitle = meeting
      ? formatMeetingScheduleVi(
          meeting.startsAt,
          meeting.durationMinutes,
          meeting.platform
        )
      : "Chưa có lịch họp sắp tới"
    const sig = `${title}|${subtitle}`
    if (sig === this.lastMeetingSig) return
    this.lastMeetingSig = sig
    drawOfficeMeetingScreen(this.meetingCanvas, title, subtitle)
    this.meetingBoard.update()
    this.hostBridge?.requestFrame()
  }

  /** Repaints the live Freestanding Achievement Standee canvas texture only on content change. */
  updateStandee(
    leaderboard: OfficeLeaderboard | null,
    fallbackTeamName: string,
    isStaff: boolean
  ): void {
    if (this.disposed) return
    if (!leaderboard) {
      const teamTitle = fallbackTeamName
        ? `IQX · ${fallbackTeamName.toUpperCase()}`
        : "IQX · VĂN PHÒNG"
      const sig = `empty|${teamTitle}`
      if (sig === this.lastStandeeSig) return
      this.lastStandeeSig = sig
      drawOfficeStandee(this.standeeCanvas, {
        teamTitle,
        monthLabel: "Thành tích tháng",
        top3: [],
        emptyText: "Chưa có ai ghi điểm tháng này",
        footerText: "Reset ngày 01 hằng tháng",
      })
      this.standeeBoard.update()
      this.hostBridge?.requestFrame()
      return
    }

    const top3: OfficeStandeeEntry[] = leaderboard.top3
      .filter(
        (item): item is typeof item & { rank: 1 | 2 | 3 } =>
          item.rank === 1 || item.rank === 2 || item.rank === 3
      )
      .map((item) => ({
        rank: item.rank,
        name: item.displayName,
        points: item.points,
      }))

    const personalRank =
      isStaff && leaderboard.myRank && leaderboard.myRank.rank !== null
        ? {
            rank: leaderboard.myRank.rank,
            points: leaderboard.myRank.points,
          }
        : null

    const teamTitle = `IQX · ${(leaderboard.teamName || fallbackTeamName).toUpperCase()}`
    const monthLabel = `Thành tích tháng ${leaderboard.monthNumber}`
    const sig = `${teamTitle}|${monthLabel}|${top3.map((e) => `${e.rank}:${e.name}:${e.points}`).join(",")}|${personalRank ? `${personalRank.rank}:${personalRank.points}` : ""}`
    if (sig === this.lastStandeeSig) return
    this.lastStandeeSig = sig

    drawOfficeStandee(this.standeeCanvas, {
      teamTitle,
      monthLabel,
      subtitle: "Top 3 điểm nhiệm vụ",
      top3,
      personalRank,
      emptyText: "Chưa có ai ghi điểm tháng này",
      footerText: "Reset ngày 01 hằng tháng",
    })
    this.standeeBoard.update()
    this.hostBridge?.requestFrame()
  }

  /** Triggers the golden destination ring on click/tap-to-move (static when reduced motion is on). */
  showTargetRing(lx: number, ly: number): void {
    if (this.disposed) return
    const pt = logicalToWorld(lx, ly, this.world)
    this.targetRing.position.set(pt.x, 0.035, pt.z)
    this.targetRingStatic = prefersReducedMotion()
    this.targetRing.scale.setScalar(this.targetRingStatic ? 0.9 : 0.5)
    this.targetRingMat.opacity = this.targetRingStatic ? 0.72 : 0.95
    this.targetRing.visible = true
    this.targetRingAge = 0
    this.targetRingActive = true
    this.hostBridge?.markActive(700)
  }

  /** Immediately hides the click-to-move destination ring (e.g. when a modal opens). */
  hideTargetRing(): void {
    this.targetRingActive = false
    this.targetRing.visible = false
    this.targetRingMat.opacity = 0
  }

  update(dt: number): void {
    if (!this.targetRingActive || this.disposed) return
    this.targetRingAge += dt
    const duration = this.targetRingStatic ? 0.5 : 0.6
    if (this.targetRingAge >= duration) {
      this.hideTargetRing()
      return
    }
    if (this.targetRingStatic) {
      return
    }
    this.hostBridge?.markActive(200)
    const t = this.targetRingAge / duration
    const ease = 1 - (1 - t) * (1 - t)
    this.targetRing.scale.setScalar(0.45 + ease * 1.15)
    this.targetRingMat.opacity = Math.max(0, (1 - t) * 0.95)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // A build abandoned mid-way (room left while loading) stops here; clear only what exists.
    if (this.buildSteps) {
      this.buildSteps.return()
      this.buildSteps = null
    }
    this.clearStaticProps()
    this.clearTeamProps()
    this.meetingBoard.dispose()
    this.standeeBoard.dispose()
    disposeObject3D(this.group)
    this.group.parent?.remove(this.group)
  }
}
