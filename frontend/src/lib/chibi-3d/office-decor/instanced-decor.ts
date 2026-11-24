/**
 * Instanced Procedural Office Props & Shadows for Open-Floor Khu Văn phòng:
 * - 3 distinct potted plant & corner tree varieties via InstancedMesh (fiddle-leaf fig,
 *   tropical monstera bush, architectural snake plant) — tiny draw call & triangle budget!
 * - Instanced cable-free chibi desk clutter across all 24+ desks (mugs, mini succulents,
 *   pastel sticky notes, stacked colorful folders, pen cups)
 * - Crisp Candlestick Chart monitor texture (512x256)
 * - Soft Contact-Shadow & Overhead Glow-Pool helpers (KGD presentation language)
 */
import * as THREE from "three"

import { markStaticCanvasTexture, safeGet2DContext } from "@/lib/chibi-3d/textures.ts"
import {
  createMatteMaterial,
  createMetalMaterial,
  mergeIndexedGeometries,
} from "@/lib/chibi-3d/types.ts"

import {
  OFFICE_DECOR_FONT_STACK,
  OfficeDecorBatcher,
  chibiBevelBox,
  createDecorCanvasTexture,
  type MergedSpec,
} from "./palette.ts"

export type OfficePlantKind = "fiddle" | "monstera" | "snake"

export interface OfficePlantTransform {
  readonly x: number
  readonly z: number
  readonly kind: OfficePlantKind
  readonly scale?: number
  readonly rotY?: number
}

export interface DeskClutterSlot {
  readonly wx: number
  readonly wz: number
  readonly deskW: number
  readonly deskD: number
  readonly topY: number
  readonly facingSouth: boolean
  readonly index: number
  readonly occupied: boolean
  readonly hasMug: boolean
}

const scratchMatrix = new THREE.Matrix4()
const scratchPos = new THREE.Vector3()
const scratchQuat = new THREE.Quaternion()
const scratchEuler = new THREE.Euler()
const scratchScale = new THREE.Vector3()

/** Creates a crisp candlestick-chart monitor texture (512x256) for staff & boss desks. */
export function createCandlestickMonitorTexture(lite: boolean): THREE.Texture {
  return createDecorCanvasTexture(
    lite ? 256 : 512,
    lite ? 128 : 256,
    (ctx, w, h) => {
      // Deep trading-terminal canvas
      ctx.fillStyle = "#0b1326"
      ctx.fillRect(0, 0, w, h)

      // Top bar
      ctx.fillStyle = "#132242"
      ctx.fillRect(0, 0, w, h * 0.14)
      ctx.fillStyle = "#f6d27a"
      ctx.font = `800 ${Math.round(h * 0.085)}px ${OFFICE_DECOR_FONT_STACK}`
      ctx.textBaseline = "middle"
      ctx.fillText("IQX · VN30", w * 0.03, h * 0.072)
      ctx.fillStyle = "#34d399"
      ctx.fillText("+1.42%", w * 0.28, h * 0.072)

      // Grid lines
      ctx.strokeStyle = "rgba(148, 163, 184, 0.14)"
      ctx.lineWidth = 1
      for (let i = 1; i <= 4; i += 1) {
        const gy = h * (0.18 + i * 0.16)
        ctx.beginPath()
        ctx.moveTo(w * 0.03, gy)
        ctx.lineTo(w * 0.72, gy)
        ctx.stroke()
      }

      // 11 crisp green/red candlesticks + volume bars
      const bars = [
        [0.64, 0.56, 0.5, 0.7, true],
        [0.57, 0.62, 0.52, 0.68, false],
        [0.61, 0.49, 0.44, 0.65, true],
        [0.5, 0.44, 0.38, 0.55, true],
        [0.45, 0.52, 0.41, 0.58, false],
        [0.51, 0.4, 0.34, 0.55, true],
        [0.41, 0.35, 0.29, 0.45, true],
        [0.36, 0.42, 0.32, 0.47, false],
        [0.41, 0.3, 0.24, 0.44, true],
        [0.31, 0.25, 0.2, 0.36, true],
        [0.26, 0.2, 0.16, 0.3, true],
      ] as const
      const stepX = (w * 0.66) / bars.length
      bars.forEach(([o, c, hi, lo, up], idx) => {
        const cx = w * 0.06 + idx * stepX
        const col = up ? "#34d399" : "#f87171"
        ctx.strokeStyle = col
        ctx.lineWidth = Math.max(1.5, w * 0.004)
        ctx.beginPath()
        ctx.moveTo(cx, h * hi)
        ctx.lineTo(cx, h * lo)
        ctx.stroke()

        ctx.fillStyle = col
        const top = Math.min(o, c) * h
        const bh = Math.max(4, Math.abs(o - c) * h)
        ctx.fillRect(cx - stepX * 0.28, top, stepX * 0.56, bh)

        // Volume bar at bottom
        ctx.fillStyle = up ? "rgba(52, 211, 153, 0.35)" : "rgba(248, 113, 113, 0.35)"
        const vh = (0.04 + ((idx * 3) % 5) * 0.018) * h
        ctx.fillRect(cx - stepX * 0.26, h * 0.94 - vh, stepX * 0.52, vh)
      })

      // Golden EMA moving average curve
      ctx.strokeStyle = "#f6d27a"
      ctx.lineWidth = Math.max(1.5, w * 0.005)
      ctx.beginPath()
      ctx.moveTo(w * 0.05, h * 0.62)
      ctx.quadraticCurveTo(w * 0.36, h * 0.48, w * 0.7, h * 0.24)
      ctx.stroke()

      // Right mini watchlist sidebar
      ctx.fillStyle = "#101b36"
      ctx.fillRect(w * 0.75, h * 0.16, w * 0.22, h * 0.78)
      const watch = [
        ["FPT", "#34d399"],
        ["VCB", "#34d399"],
        ["SSI", "#34d399"],
        ["HPG", "#f87171"],
        ["MWG", "#34d399"],
      ] as const
      watch.forEach(([sym, col], idx) => {
        const wy = h * (0.24 + idx * 0.14)
        ctx.fillStyle = "#e2e8f0"
        ctx.font = `700 ${Math.round(h * 0.068)}px ${OFFICE_DECOR_FONT_STACK}`
        ctx.fillText(sym, w * 0.77, wy)
        ctx.fillStyle = col
        ctx.fillRect(w * 0.89, wy - h * 0.025, w * 0.06, h * 0.045)
      })
    },
    lite ? 2 : 6
  )
}

function buildFiddleTreeSpecs(lite: boolean): MergedSpec[] {
  const batch = new OfficeDecorBatcher()
  const seg = lite ? 7 : 10
  const potMat = createMatteMaterial("#ebe3d6", { roughness: 0.42 })
  const rimMat = createMetalMaterial("#e9b949", { roughness: 0.28, metalness: 0.78 })
  const soilMat = createMatteMaterial("#402d20", { roughness: 0.9 })
  const trunkMat = createMatteMaterial("#734f32", { roughness: 0.74 })
  const leafDark = createMatteMaterial("#266c3b", { roughness: 0.56 })
  const leafMid = createMatteMaterial("#3b914c", { roughness: 0.5 })
  const leafLight = createMatteMaterial("#5db85f", { roughness: 0.48 })

  // Tapered ribbed ceramic planter + gold rim + soil
  batch.addCylinder(0.24, 0.18, 0.42, seg, potMat, 0, 0.21, 0, true, true)
  batch.addCylinder(0.255, 0.248, 0.04, seg, rimMat, 0, 0.42, 0, false)
  batch.addCylinder(0.21, 0.21, 0.03, seg, soilMat, 0, 0.41, 0, false)

  // Sculpted wooden trunk + 2 upper branches
  batch.addCylinder(0.036, 0.052, 0.72, 6, trunkMat, 0, 0.74, 0, true)
  batch.addCylinder(0.022, 0.032, 0.34, 5, trunkMat, -0.1, 1.06, 0.04, false, true, [0.1, 0, 0.42])
  batch.addCylinder(0.022, 0.032, 0.32, 5, trunkMat, 0.11, 1.08, -0.05, false, true, [-0.15, 0, -0.38])

  // Layered chibi rounded foliage puffs (fiddle-leaf tree canopy)
  const wSeg = lite ? 7 : 10
  const hSeg = lite ? 5 : 8
  batch.addSphere(0.32, wSeg, hSeg, leafDark, 0, 1.24, 0, true, true, [1.1, 0.88, 1.1])
  batch.addSphere(0.24, wSeg, hSeg, leafMid, -0.22, 1.18, 0.14, true, true, [1.05, 0.9, 1.0])
  batch.addSphere(0.23, wSeg, hSeg, leafMid, 0.22, 1.22, -0.1, true, true, [1.0, 0.92, 1.05])
  batch.addSphere(0.21, wSeg, hSeg, leafLight, 0.04, 1.46, 0.05, false, true, [1.05, 0.85, 1.05])
  batch.addSphere(0.16, wSeg, hSeg, leafLight, -0.15, 1.38, -0.12, false, false)

  return batch.flushToSpecs()
}

function buildMonsteraPlantSpecs(lite: boolean): MergedSpec[] {
  const batch = new OfficeDecorBatcher()
  const seg = lite ? 7 : 10
  const potMat = createMatteMaterial("#203457", { roughness: 0.46 })
  const rimMat = createMetalMaterial("#e9b949", { roughness: 0.28, metalness: 0.8 })
  const soilMat = createMatteMaterial("#402d20", { roughness: 0.9 })
  const leafDark = createMatteMaterial("#236e42", { roughness: 0.52 })
  const leafBright = createMatteMaterial("#45a858", { roughness: 0.48 })

  // Navy ceramic pot with gold band
  batch.addCylinder(0.2, 0.15, 0.32, seg, potMat, 0, 0.16, 0, true, true)
  batch.addCylinder(0.21, 0.205, 0.032, seg, rimMat, 0, 0.31, 0, false)
  batch.addCylinder(0.18, 0.18, 0.03, seg, soilMat, 0, 0.305, 0, false)

  // Radiating broad tropical monstera fronds
  const frondCount = lite ? 5 : 7
  for (let i = 0; i < frondCount; i += 1) {
    const a = (i * Math.PI * 2) / frondCount + 0.3
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const mat = i % 2 === 0 ? leafDark : leafBright
    const tilt = 0.58 + (i % 2) * 0.18
    batch.add(
      new THREE.SphereGeometry(0.16, lite ? 6 : 8, lite ? 5 : 6),
      mat,
      [cos * 0.2, 0.54 + (i % 2) * 0.12, sin * 0.2],
      [sin * tilt, -a, -cos * tilt],
      [1.25, 0.24, 0.92],
      !lite,
      true
    )
  }
  batch.addSphere(0.14, lite ? 6 : 8, 6, leafBright, 0, 0.58, 0, false, false, [1.0, 0.72, 1.0])
  return batch.flushToSpecs()
}

function buildSnakePlantSpecs(lite: boolean): MergedSpec[] {
  const batch = new OfficeDecorBatcher()
  const seg = lite ? 7 : 10
  const potMat = createMatteMaterial("#c8724e", { roughness: 0.64 })
  const soilMat = createMatteMaterial("#402d20", { roughness: 0.9 })
  const bladeDeep = createMatteMaterial("#2a7043", { roughness: 0.48 })
  const bladeRim = createMatteMaterial("#86c959", { roughness: 0.46 })

  // Terracotta pot
  batch.addCylinder(0.17, 0.13, 0.28, seg, potMat, 0, 0.14, 0, true, true)
  batch.addCylinder(0.18, 0.175, 0.045, seg, potMat, 0, 0.27, 0, false)
  batch.addCylinder(0.15, 0.15, 0.025, seg, soilMat, 0, 0.275, 0, false)

  // Upright sword blades with cute lime tips
  const blades: readonly [number, number, number, number, number][] = [
    [0, 0, 0.56, 0.06, 0],
    [-0.06, 0.04, 0.48, -0.14, 0.5],
    [0.07, -0.03, 0.52, 0.12, 1.2],
    [-0.04, -0.06, 0.44, -0.1, 2.1],
    [0.05, 0.06, 0.42, 0.16, -0.8],
  ]
  for (let i = 0; i < (lite ? 4 : blades.length); i += 1) {
    const [bx, bz, bh, lean, yaw] = blades[i]!
    batch.add(
      new THREE.ConeGeometry(0.046, bh, 4),
      i % 2 === 0 ? bladeDeep : bladeRim,
      [bx, 0.28 + bh / 2, bz],
      [lean, yaw, lean * 0.5],
      [1.0, 1.0, 0.35],
      false,
      true
    )
  }
  return batch.flushToSpecs()
}

/**
 * Mounts all open-floor potted plants & corner trees across 3 distinct varieties using InstancedMesh.
 * Total draw calls: ~12–15 for ALL 20+ plants on the entire office floor!
 */
export function mountInstancedOfficePlants(
  parent: THREE.Object3D,
  plants: readonly OfficePlantTransform[],
  lite: boolean
): void {
  const byKind: Record<OfficePlantKind, OfficePlantTransform[]> = {
    fiddle: [],
    monstera: [],
    snake: [],
  }
  for (const p of plants) {
    byKind[p.kind].push(p)
  }

  const builders: Record<OfficePlantKind, () => MergedSpec[]> = {
    fiddle: () => buildFiddleTreeSpecs(lite),
    monstera: () => buildMonsteraPlantSpecs(lite),
    snake: () => buildSnakePlantSpecs(lite),
  }

  for (const kind of ["fiddle", "monstera", "snake"] as const) {
    const list = byKind[kind]
    if (list.length === 0) continue
    const specs = builders[kind]()
    for (const spec of specs) {
      const inst = new THREE.InstancedMesh(spec.geometry, spec.material, list.length)
      inst.name = `office-plant-${kind}-instanced`
      inst.castShadow = spec.castShadow
      inst.receiveShadow = spec.receiveShadow
      for (let i = 0; i < list.length; i += 1) {
        const p = list[i]!
        const sc = p.scale ?? 1
        scratchPos.set(p.x, 0, p.z)
        scratchEuler.set(0, p.rotY ?? (i * 1.17), 0)
        scratchQuat.setFromEuler(scratchEuler)
        scratchScale.set(sc, sc, sc)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        inst.setMatrixAt(i, scratchMatrix)
      }
      inst.instanceMatrix.needsUpdate = true
      inst.computeBoundingSphere()
      parent.add(inst)
    }
  }
}

/**
 * Mounts cable-free chibi desk clutter across all 24+ staff desks via InstancedMesh:
 * - Coffee mugs (ceramic mug + dark coffee surface)
 * - Mini desk succulents (cute terracotta pot + rosette green puff)
 * - Stacked colorful folders/notebooks
 * - Pastel sticky-note tiles (yellow/pink/sky-blue)
 * - Tidy pen cups
 * Only ~8 draw calls total for ALL 24+ desks!
 */
export function mountInstancedDeskClutter(
  parent: THREE.Object3D,
  slots: readonly DeskClutterSlot[],
  lite: boolean
): void {
  if (slots.length === 0) return
  const seg = lite ? 7 : 10

  const mugSlots: DeskClutterSlot[] = []
  const succulentSlots: DeskClutterSlot[] = []
  const folderSlots: DeskClutterSlot[] = []
  const stickySlots: DeskClutterSlot[] = []
  const penCupSlots: DeskClutterSlot[] = []

  for (const slot of slots) {
    if (slot.occupied && slot.hasMug) mugSlots.push(slot)
    if (slot.index % 2 === 0 || slot.occupied) succulentSlots.push(slot)
    if (slot.occupied || slot.index % 3 === 1) folderSlots.push(slot)
    if (slot.occupied || slot.index % 2 === 1) stickySlots.push(slot)
    if (slot.occupied) penCupSlots.push(slot)
  }

  // 1. Coffee mugs (ceramic cup + coffee top)
  if (mugSlots.length > 0) {
    const mugBatch = new OfficeDecorBatcher()
    const mugMat = createMatteMaterial("#faf8f5", { roughness: 0.24, metalness: 0.06 })
    const coffeeMat = createMatteMaterial("#3f1f0e", { roughness: 0.3 })
    mugBatch.addCylinder(0.044, 0.038, 0.086, seg, mugMat, 0, 0.043, 0, false)
    mugBatch.addBox(0.022, 0.048, 0.014, mugMat, 0.046, 0.045, 0, false)
    mugBatch.addCylinder(0.036, 0.036, 0.01, seg, coffeeMat, 0, 0.084, 0, false)
    const specs = mugBatch.flushToSpecs()
    for (const spec of specs) {
      const inst = new THREE.InstancedMesh(spec.geometry, spec.material, mugSlots.length)
      inst.name = "office-desk-mugs-instanced"
      inst.castShadow = false
      for (let i = 0; i < mugSlots.length; i += 1) {
        const s = mugSlots[i]!
        const dir = s.facingSouth ? 1 : -1
        scratchPos.set(s.wx + dir * (s.deskW * 0.34), s.topY, s.wz + dir * (s.deskD * 0.14))
        scratchEuler.set(0, s.facingSouth ? 0 : Math.PI, 0)
        scratchQuat.setFromEuler(scratchEuler)
        scratchScale.set(1, 1, 1)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        inst.setMatrixAt(i, scratchMatrix)
      }
      inst.instanceMatrix.needsUpdate = true
      inst.computeBoundingSphere()
      parent.add(inst)
    }
  }

  // 2. Mini desk succulents (terracotta mini pot + cute green crown)
  if (succulentSlots.length > 0) {
    const sucBatch = new OfficeDecorBatcher()
    const potMat = createMatteMaterial("#c8724e", { roughness: 0.62 })
    const greenMat = createMatteMaterial("#46a856", { roughness: 0.5 })
    sucBatch.addCylinder(0.046, 0.035, 0.072, seg, potMat, 0, 0.036, 0, false)
    sucBatch.addSphere(0.058, seg, 5, greenMat, 0, 0.092, 0, false, false, [1.1, 0.78, 1.1])
    const specs = sucBatch.flushToSpecs()
    for (const spec of specs) {
      const inst = new THREE.InstancedMesh(spec.geometry, spec.material, succulentSlots.length)
      inst.name = "office-desk-succulents-instanced"
      inst.castShadow = false
      for (let i = 0; i < succulentSlots.length; i += 1) {
        const s = succulentSlots[i]!
        const dir = s.facingSouth ? 1 : -1
        scratchPos.set(s.wx - dir * (s.deskW * 0.38), s.topY, s.wz - dir * (s.deskD * 0.22))
        scratchQuat.identity()
        scratchScale.set(1, 1, 1)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        inst.setMatrixAt(i, scratchMatrix)
      }
      inst.instanceMatrix.needsUpdate = true
      inst.computeBoundingSphere()
      parent.add(inst)
    }
  }

  // 3. Stacked colorful folders / notebooks (tidy 2-layer stack)
  if (folderSlots.length > 0) {
    const foldBatch = new OfficeDecorBatcher()
    const blueMat = createMatteMaterial("#2b68c9", { roughness: 0.52 })
    const creamMat = createMatteMaterial("#f5e6c8", { roughness: 0.62 })
    foldBatch.add(chibiBevelBox(0.24, 0.022, 0.18, 0.004, lite), blueMat, [0, 0.011, 0], undefined, undefined, false)
    foldBatch.add(chibiBevelBox(0.21, 0.02, 0.16, 0.004, lite), creamMat, [0.01, 0.032, 0], [0, 0.12, 0], undefined, false)
    const specs = foldBatch.flushToSpecs()
    for (const spec of specs) {
      const inst = new THREE.InstancedMesh(spec.geometry, spec.material, folderSlots.length)
      inst.name = "office-desk-folders-instanced"
      inst.castShadow = false
      for (let i = 0; i < folderSlots.length; i += 1) {
        const s = folderSlots[i]!
        const dir = s.facingSouth ? 1 : -1
        scratchPos.set(s.wx - dir * (s.deskW * 0.33), s.topY, s.wz + dir * (s.deskD * 0.14))
        scratchEuler.set(0, (s.facingSouth ? 0 : Math.PI) + ((s.index % 3) - 1) * 0.08, 0)
        scratchQuat.setFromEuler(scratchEuler)
        scratchScale.set(1, 1, 1)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        inst.setMatrixAt(i, scratchMatrix)
      }
      inst.instanceMatrix.needsUpdate = true
      inst.computeBoundingSphere()
      parent.add(inst)
    }
  }

  // 4. Pastel sticky notes (uses per-instance color tinting -> 1 single draw call!)
  if (stickySlots.length > 0) {
    const noteGeo = new THREE.BoxGeometry(0.082, 0.008, 0.082)
    const noteMat = createMatteMaterial("#ffffff", { roughness: 0.72 })
    const noteInst = new THREE.InstancedMesh(noteGeo, noteMat, stickySlots.length)
    noteInst.name = "office-desk-stickies-instanced"
    noteInst.castShadow = false
    const paletteHex = [0xffe9a0, 0xffc9d6, 0xbfe3ff, 0xc8f0c2]
    const colorScratch = new THREE.Color()
    for (let i = 0; i < stickySlots.length; i += 1) {
      const s = stickySlots[i]!
      const dir = s.facingSouth ? 1 : -1
      scratchPos.set(
        s.wx + dir * (s.deskW * 0.2),
        s.topY + 0.006,
        s.wz - dir * (s.deskD * 0.05)
      )
      scratchEuler.set(0, ((s.index * 5) % 7 - 3) * 0.09, 0)
      scratchQuat.setFromEuler(scratchEuler)
      scratchScale.set(1, 1, 1)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
      noteInst.setMatrixAt(i, scratchMatrix)
      colorScratch.setHex(paletteHex[s.index % paletteHex.length]!)
      noteInst.setColorAt(i, colorScratch)
    }
    noteInst.instanceMatrix.needsUpdate = true
    if (noteInst.instanceColor) noteInst.instanceColor.needsUpdate = true
    noteInst.computeBoundingSphere()
    parent.add(noteInst)
  }

  // 5. Tidy pen cup on occupied desks
  if (penCupSlots.length > 0) {
    const cupBatch = new OfficeDecorBatcher()
    const cupMat = createMatteMaterial("#1f3359", { roughness: 0.45 })
    const penMat = createMatteMaterial("#e9b949", { roughness: 0.35 })
    cupBatch.addCylinder(0.032, 0.028, 0.09, 7, cupMat, 0, 0.045, 0, false)
    cupBatch.addCylinder(0.006, 0.006, 0.13, 5, penMat, -0.01, 0.075, 0, false, false, [0, 0, 0.14])
    cupBatch.addCylinder(0.006, 0.006, 0.125, 5, penMat, 0.01, 0.072, 0.008, false, false, [0.1, 0, -0.14])
    const specs = cupBatch.flushToSpecs()
    for (const spec of specs) {
      const inst = new THREE.InstancedMesh(spec.geometry, spec.material, penCupSlots.length)
      inst.name = "office-desk-pencups-instanced"
      inst.castShadow = false
      for (let i = 0; i < penCupSlots.length; i += 1) {
        const s = penCupSlots[i]!
        const dir = s.facingSouth ? 1 : -1
        scratchPos.set(s.wx + dir * (s.deskW * 0.34), s.topY, s.wz - dir * (s.deskD * 0.22))
        scratchQuat.identity()
        scratchScale.set(1, 1, 1)
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)
        inst.setMatrixAt(i, scratchMatrix)
      }
      inst.instanceMatrix.needsUpdate = true
      inst.computeBoundingSphere()
      parent.add(inst)
    }
  }
}

/** Creates a soft radial/box/strip ambient-occlusion contact shadow texture (KGD style). */
export function createOfficeContactShadowTexture(
  kind: "oval" | "box" | "strip"
): THREE.Texture {
  const size = 128
  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    ctx.clearRect(0, 0, size, size)
    if (kind === "oval") {
      const grad = ctx.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.08,
        size / 2,
        size / 2,
        size * 0.48
      )
      grad.addColorStop(0, "rgba(14, 20, 34, 0.34)")
      grad.addColorStop(0.55, "rgba(14, 20, 34, 0.16)")
      grad.addColorStop(1, "rgba(14, 20, 34, 0)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)
    } else if (kind === "box") {
      const pad = 18
      const inner = size - pad * 2
      ctx.save()
      ctx.shadowColor = "rgba(12, 18, 32, 0.32)"
      ctx.shadowBlur = 18
      ctx.fillStyle = "rgba(12, 18, 32, 0.28)"
      ctx.beginPath()
      ctx.roundRect?.(pad, pad, inner, inner, 18)
      if (!ctx.roundRect) {
        ctx.rect(pad, pad, inner, inner)
      }
      ctx.fill()
      ctx.restore()
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, size)
      grad.addColorStop(0, "rgba(12, 18, 32, 0.26)")
      grad.addColorStop(0.45, "rgba(12, 18, 32, 0.09)")
      grad.addColorStop(1, "rgba(12, 18, 32, 0)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)
    }
    return true
  }
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const hasCtx = paint(canvas)
  const tex: THREE.Texture = hasCtx
    ? markStaticCanvasTexture(new THREE.CanvasTexture(canvas), (c) => {
        paint(c)
      })
    : new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Creates a warm radial overhead glow-pool texture for the stone floor. */
export function createOfficeGlowPoolTexture(): THREE.Texture {
  const size = 128
  const paint = (canvas: HTMLCanvasElement): boolean => {
    const ctx = safeGet2DContext(canvas)
    if (!ctx) return false
    ctx.clearRect(0, 0, size, size)
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      2,
      size / 2,
      size / 2,
      size * 0.48
    )
    grad.addColorStop(0, "rgba(255, 236, 186, 0.5)")
    grad.addColorStop(0.5, "rgba(255, 224, 152, 0.24)")
    grad.addColorStop(1, "rgba(255, 224, 152, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    return true
  }
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const hasCtx = paint(canvas)
  const tex: THREE.Texture = hasCtx
    ? markStaticCanvasTexture(new THREE.CanvasTexture(canvas), (c) => {
        paint(c)
      })
    : new THREE.DataTexture(new Uint8Array([255, 232, 170, 0]), 1, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Batches flat contact shadows into 1 merged draw call per texture/opacity pair. */
export class ContactShadowBatcher {
  private readonly items: Array<{
    wx: number
    wz: number
    w: number
    d: number
    tex: THREE.Texture
    opacity: number
  }> = []

  add(
    wx: number,
    wz: number,
    w: number,
    d: number,
    tex: THREE.Texture,
    opacity = 0.6
  ): void {
    this.items.push({ wx, wz, w, d, tex, opacity })
  }

  flushInto(parent: THREE.Object3D): void {
    if (this.items.length === 0) return
    const buckets = new Map<
      string,
      { tex: THREE.Texture; opacity: number; geos: THREE.BufferGeometry[] }
    >()
    for (const s of this.items.splice(0)) {
      const opKey = Math.round(s.opacity * 100)
      const key = `${s.tex.uuid}:${opKey}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { tex: s.tex, opacity: opKey / 100, geos: [] }
        buckets.set(key, bucket)
      }
      const geo = new THREE.PlaneGeometry(s.w, s.d)
      geo.rotateX(-Math.PI / 2)
      geo.translate(s.wx, 0.008, s.wz)
      bucket.geos.push(geo)
    }
    for (const bucket of buckets.values()) {
      const merged = mergeIndexedGeometries(bucket.geos, { disposeInputs: true })
      if (!merged) continue
      const mat = new THREE.MeshBasicMaterial({
        map: bucket.tex,
        transparent: true,
        opacity: bucket.opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
      const mesh = new THREE.Mesh(merged, mat)
      mesh.name = "office-contact-shadows"
      parent.add(mesh)
    }
  }
}
