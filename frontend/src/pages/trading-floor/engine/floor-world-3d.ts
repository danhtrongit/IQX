/**
 * Procedural Cute & Crisp Chibi 3D World for Khu Giao Dịch (`2048 × 1408` logical space -> `32u × 22u`).
 * Preserves 100% of `layout.ts` footprints & all 4 backend bot corridors, mounts live VN30 LED + scrolling ticker
 * & SACO wall boards, animated Thần Tài NPC with sparkles/greetings/celebrate, Receptionist NPC, Hall of Fame
 * statues, architectural skirting/columns/sconces/ceiling glow pools, and soft contact shadows.
 */
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

import { createChibiCharacter } from "@/lib/chibi-3d/character-builder.ts"
import {
  createCoffeeTable,
  createOfferingAltar,
  createPantryCounter,
  createPottedPlant,
  createReceptionDesk,
  createRug,
  createSofa,
  createStatuePodium,
  createThanTaiShrine,
  createWallBoardFrame,
  type DisposableProp,
  type LiveBoardProp,
  type RugOptions,
} from "@/lib/chibi-3d/furniture-builder.ts"
import {
  createFloorDecalTexture,
  createFloorTexture,
  drawLedMarketBoard,
  drawSacoBoard,
  safeGet2DContext,
} from "@/lib/chibi-3d/textures.ts"
import {
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  disposeObject3D,
  facingToRadians,
  logicalToWorld,
  type ChibiCharacterSpec,
  type ChibiRig,
  type ProjectedPoint,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

import { formatIndex, formatPercent } from "../net/market/format.ts"
import { heatPct, heatPrice } from "../net/market/heat.ts"
import { PRICE_COLORS, indexTone } from "../net/market/tone.ts"
import type { IndexQuote, Quote } from "../net/market/types.ts"
import {
  normalizeAvatarId,
  type PostCard,
  type ThanTaiLeaderboard,
} from "../net/types.ts"
import {
  BOARDS,
  NAV_CELL,
  PLACEMENTS,
  RECEPTIONIST,
  SIDE,
  WALL_H,
  WORLD_H,
  WORLD_W,
  ZONE_LABELS,
  type Interact,
  type Placement,
} from "./layout.ts"
import { NavGrid } from "./nav.ts"
import type { OverlayLayer } from "./overlay-layer.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"

export const FLOOR_WORLD_CONFIG: WorldTransformConfig = {
  logicalW: WORLD_W,
  logicalH: WORLD_H,
  scale: 1 / 64,
}

const FONT_STACK =
  '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

/** Thần Tài auto-greeting zone (matches original OfficeScene contract). */
const GREET = { x: 1024, y: 500, r: 210, leave: 260, gapMs: 2600 }
const GREETINGS: readonly ((who: string) => string)[] = [
  (n) => `Chào ${n}! Chúc danh mục xanh rực, lệnh nào cũng khớp!`,
  (n) => `${n} đến rồi! Thần Tài chúc tiền vô như nước!`,
  (n) => `Chào ${n}, chúc phát tài phát lộc!`,
  (n) => `A, ${n}! Gieo một quẻ lấy hên đầu phiên nhé!`,
]

type CharacterSpecWithLite = ChibiCharacterSpec & { lite?: boolean }
type ShrineOptionsWithLite = { includeAltar?: boolean; lite?: boolean }
type RugOptionsWithLite = RugOptions & { lite?: boolean }

export interface FloorWorld3DOptions {
  lite?: boolean
}

export interface FloorHotspot {
  root: THREE.Object3D
  interact: Interact
  depth: number
}

interface ShrineSpark {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  vx: number
  vy: number
  vz: number
  age: number
  life: number
  baseScale: number
}

interface StatueSlot {
  rank: 1 | 2 | 3
  placement: Placement
  podiumTopY: number
  wx: number
  wz: number
  rig: ChibiRig | null
  rigAvatar: string
  rigFilled: boolean
  hitGroup: THREE.Group
}

export interface VisitorSnapshot {
  id: string
  name: string
  x: number
  y: number
}

/**
 * Builds the canonical `2048 × 1408` NavGrid with exact room perimeter & `PLACEMENTS` footprints.
 * Guaranteed to keep all 4 server-side bot walkable corridors 100% obstacle-free.
 */
export function buildFloorNavGrid(): NavGrid {
  const nav = new NavGrid(WORLD_W, WORLD_H, NAV_CELL)
  nav.blockRect(0, 0, WORLD_W, WALL_H + 36)
  nav.blockRect(0, 0, SIDE + 14, WORLD_H)
  nav.blockRect(WORLD_W - SIDE - 14, 0, SIDE + 14, WORLD_H)
  nav.blockRect(0, WORLD_H - SIDE - 10, WORLD_W, SIDE + 10)
  for (const p of PLACEMENTS) {
    if (p.foot) {
      nav.blockRect(
        p.x - p.foot[0] / 2,
        p.y - p.foot[1],
        p.foot[0],
        p.foot[1]
      )
    }
  }
  return nav
}

function cloneRepeatedTexture(
  base: THREE.Texture,
  repeatX: number,
  repeatY: number
): THREE.Texture {
  const tex = base.clone()
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.needsUpdate = true
  return tex
}

/** Batches static architectural parts by material into merged BufferGeometries to minimize draw calls. */
class StaticGeometryBatcher {
  private readonly buckets = new Map<
    string,
    { material: THREE.Material; castShadow: boolean; receiveShadow: boolean; geos: THREE.BufferGeometry[] }
  >()

  registerMaterial(
    key: string,
    material: THREE.Material,
    opts?: { castShadow?: boolean; receiveShadow?: boolean }
  ): void {
    this.buckets.set(key, {
      material,
      castShadow: opts?.castShadow ?? false,
      receiveShadow: opts?.receiveShadow ?? true,
      geos: [],
    })
  }

  addBox(
    key: string,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number
  ): void {
    const bucket = this.buckets.get(key)
    if (!bucket) return
    const geo = new THREE.BoxGeometry(w, h, d)
    const nonIdx = geo.index ? geo.toNonIndexed() : geo
    if (nonIdx !== geo) geo.dispose()
    nonIdx.translate(x, y, z)
    bucket.geos.push(nonIdx)
  }

  addCylinder(
    key: string,
    rt: number,
    rb: number,
    h: number,
    segs: number,
    x: number,
    y: number,
    z: number
  ): void {
    const bucket = this.buckets.get(key)
    if (!bucket) return
    const geo = new THREE.CylinderGeometry(rt, rb, h, segs)
    const nonIdx = geo.index ? geo.toNonIndexed() : geo
    if (nonIdx !== geo) geo.dispose()
    nonIdx.translate(x, y, z)
    bucket.geos.push(nonIdx)
  }

  addSphere(
    key: string,
    r: number,
    wSegs: number,
    hSegs: number,
    x: number,
    y: number,
    z: number
  ): void {
    const bucket = this.buckets.get(key)
    if (!bucket) return
    const geo = new THREE.SphereGeometry(r, wSegs, hSegs)
    const nonIdx = geo.index ? geo.toNonIndexed() : geo
    if (nonIdx !== geo) geo.dispose()
    nonIdx.translate(x, y, z)
    bucket.geos.push(nonIdx)
  }

  flush(parent: THREE.Object3D): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.geos.length === 0) {
        bucket.material.dispose()
        continue
      }
      const merged = mergeGeometries(bucket.geos, false)
      for (const g of bucket.geos) g.dispose()
      bucket.geos.length = 0
      if (!merged) {
        bucket.material.dispose()
        continue
      }
      const mesh = new THREE.Mesh(merged, bucket.material)
      mesh.name = `arch-${key}`
      mesh.castShadow = bucket.castShadow
      mesh.receiveShadow = bucket.receiveShadow
      parent.add(mesh)
    }
    this.buckets.clear()
  }
}

/** Creates a soft radial contact-shadow texture on Canvas2D (AO blob shadow under props). */
function createContactShadowTexture(kind: "oval" | "box" | "strip"): THREE.Texture {
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = safeGet2DContext(canvas)
  if (ctx) {
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
      grad.addColorStop(0, "rgba(14, 20, 34, 0.36)")
      grad.addColorStop(0.55, "rgba(14, 20, 34, 0.18)")
      grad.addColorStop(1, "rgba(14, 20, 34, 0)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)
    } else if (kind === "box") {
      // Soft rounded-rectangle ambient occlusion shadow
      const pad = 18
      const inner = size - pad * 2
      ctx.save()
      ctx.shadowColor = "rgba(12, 18, 32, 0.34)"
      ctx.shadowBlur = 18
      ctx.fillStyle = "rgba(12, 18, 32, 0.30)"
      ctx.beginPath()
      ctx.roundRect?.(pad, pad, inner, inner, 18)
      if (!ctx.roundRect) {
        ctx.rect(pad, pad, inner, inner)
      }
      ctx.fill()
      ctx.restore()
    } else {
      // Wall-base ambient occlusion fade (dark at v=0, transparent by v=1)
      const grad = ctx.createLinearGradient(0, 0, 0, size)
      grad.addColorStop(0, "rgba(12, 18, 32, 0.28)")
      grad.addColorStop(0.45, "rgba(12, 18, 32, 0.10)")
      grad.addColorStop(1, "rgba(12, 18, 32, 0)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)
    }
  }
  const tex: THREE.Texture = ctx
    ? new THREE.CanvasTexture(canvas)
    : new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Creates a warm radial overhead ceiling-light glow pool texture for the marble floor. */
function createGlowPoolTexture(hexInner: string): THREE.Texture {
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = safeGet2DContext(canvas)
  if (ctx) {
    ctx.clearRect(0, 0, size, size)
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      2,
      size / 2,
      size / 2,
      size * 0.48
    )
    grad.addColorStop(0, hexInner)
    grad.addColorStop(0.5, "rgba(255, 224, 152, 0.28)")
    grad.addColorStop(1, "rgba(255, 224, 152, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }
  const tex: THREE.Texture = ctx
    ? new THREE.CanvasTexture(canvas)
    : new THREE.DataTexture(new Uint8Array([255, 232, 170, 0]), 1, 1, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Paints the live scrolling stock ticker strip shown below the LED wall board. */
function drawTickerStrip(
  canvas: HTMLCanvasElement,
  indices: readonly IndexQuote[] | null,
  vn30: readonly Quote[] | null
): void {
  if (canvas.width <= 0) canvas.width = 1024
  if (canvas.height <= 0) canvas.height = 48
  const ctx = safeGet2DContext(canvas)
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = "#080d18"
  ctx.fillRect(0, 0, w, h)

  // Subtle gold hairline dividers top & bottom
  ctx.fillStyle = "rgba(233, 185, 73, 0.42)"
  ctx.fillRect(0, 0, w, 2)
  ctx.fillRect(0, h - 2, w, 2)

  interface TickerItem {
    label: string
    value: string
    pct: string
    color: string
  }
  const items: TickerItem[] = []
  if (indices?.length) {
    for (const idx of indices.slice(0, 3)) {
      items.push({
        label: idx.code,
        value: formatIndex(idx.value),
        pct: formatPercent(idx.pct),
        color: PRICE_COLORS[indexTone(idx)],
      })
    }
  }
  if (vn30?.length) {
    for (const q of vn30.slice(0, 8)) {
      const p = q.price ?? q.ref
      const pct = q.pct ?? 0
      items.push({
        label: q.symbol,
        value: heatPrice(p),
        pct: heatPct(pct),
        color:
          pct > 0.05
            ? "#34d399"
            : pct < -0.05
              ? "#f87171"
              : "#facc15",
      })
    }
  }
  if (!items.length) {
    items.push(
      { label: "VNINDEX", value: "IQX LIVE", pct: "TRADING HALL", color: "#f6d27a" },
      { label: "VN30", value: "30 MÃ DẪN DẮT", pct: "HOSE", color: "#34d399" },
      { label: "SACO", value: "NHẬN ĐỊNH", pct: "MỖI PHIÊN", color: "#60a5fa" }
    )
  }

  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  let x = 18
  const cy = h / 2 + 1
  for (let i = 0; i < items.length && x < w - 10; i += 1) {
    const it = items[i]!
    ctx.font = `800 18px ${FONT_STACK}`
    ctx.fillStyle = "#f1f5f9"
    ctx.fillText(it.label, x, cy)
    x += ctx.measureText(it.label).width + 8

    ctx.font = `700 17px ${FONT_STACK}`
    ctx.fillStyle = it.color
    const valStr = `${it.value} ${it.pct}`
    ctx.fillText(valStr, x, cy)
    x += ctx.measureText(valStr).width + 14

    ctx.fillStyle = "rgba(233, 185, 73, 0.5)"
    ctx.fillRect(x, 15, 2, h - 30)
    x += 16
  }
}

export class FloorWorld3D {
  readonly group: THREE.Group
  readonly hotspots: FloorHotspot[] = []
  readonly interacts: Interact[] = []

  private readonly lite: boolean
  private readonly props: DisposableProp[] = []
  private readonly ledCanvas: HTMLCanvasElement
  private readonly sacoCanvas: HTMLCanvasElement
  private readonly tickerCanvas: HTMLCanvasElement
  private readonly tickerTexture: THREE.Texture
  private readonly ledBoard: LiveBoardProp
  private readonly sacoBoard: LiveBoardProp
  private readonly aoTextures: THREE.Texture[] = []

  private readonly deityRig: ChibiRig
  private readonly deityLogical = { x: 1024, y: 360 }
  private readonly shrineLight: THREE.PointLight | null
  private readonly shrineSparkGeo: THREE.OctahedronGeometry
  private readonly shrineSparks: ShrineSpark[] = []
  private shrineSparkAccum = 0
  private deityWaveUntilS = 0
  private shrinePulseS = 0
  private readonly nearDeity = new Set<string>()
  private greetQueue: string[] = []
  private deityFreeAtMs = 0

  private readonly receptionistRig: ChibiRig
  private readonly statues: StatueSlot[] = []
  private disposed = false

  constructor(
    scene: THREE.Scene,
    overlay: OverlayLayer,
    opts?: FloorWorld3DOptions
  ) {
    this.lite = opts?.lite ?? false
    this.group = new THREE.Group()
    this.group.name = "trading-floor-world-3d"
    scene.add(this.group)

    this.shrineSparkGeo = new THREE.OctahedronGeometry(0.07, 0)

    this.buildArchitecture()
    this.buildZoneDecals()

    // Live VN30 LED wall board + architectural surround + live scrolling ticker strip
    this.ledCanvas = document.createElement("canvas")
    this.ledCanvas.width = 1024
    this.ledCanvas.height = 280
    drawLedMarketBoard(this.ledCanvas, null, null)
    this.ledBoard = createWallBoardFrame(10.8, 2.86, this.ledCanvas, "#e9b949")
    const ledPt = logicalToWorld(BOARDS.led.x, WALL_H, FLOOR_WORLD_CONFIG)
    this.ledBoard.group.position.set(ledPt.x, 2.6, ledPt.z + 0.14)
    this.group.add(this.ledBoard.group)
    this.props.push(this.ledBoard)
    this.registerHotspot(this.ledBoard.group, BOARDS.led.interact, 10)

    this.tickerCanvas = document.createElement("canvas")
    this.tickerCanvas.width = 1024
    this.tickerCanvas.height = 48
    drawTickerStrip(this.tickerCanvas, null, null)
    this.tickerTexture = this.mountTickerStrip(ledPt.x, ledPt.z + 0.17, 10.95)

    // Live SACO Nhận định wall board
    this.sacoCanvas = document.createElement("canvas")
    this.sacoCanvas.width = 768
    this.sacoCanvas.height = 288
    drawSacoBoard(this.sacoCanvas, [])
    this.sacoBoard = createWallBoardFrame(7.4, 2.74, this.sacoCanvas, "#e9b949")
    const sacoPt = logicalToWorld(BOARDS.saco.x, WALL_H, FLOOR_WORLD_CONFIG)
    this.sacoBoard.group.position.set(sacoPt.x, 2.58, sacoPt.z + 0.14)
    this.group.add(this.sacoBoard.group)
    this.props.push(this.sacoBoard)
    this.registerHotspot(this.sacoBoard.group, BOARDS.saco.interact, 10)

    // Mount contact shadows under props & wall edges
    const ovalShadowTex = createContactShadowTexture("oval")
    const boxShadowTex = createContactShadowTexture("box")
    this.aoTextures.push(ovalShadowTex, boxShadowTex)

    // Mount all static furniture props & shrine from PLACEMENTS
    for (const p of PLACEMENTS) {
      if (p.id.startsWith("statue-") || p.id === "thantai") continue
      this.placeFurniture(p, ovalShadowTex, boxShadowTex)
    }

    // Mount Thần Tài Shrine archway + animated Thần Tài NPC + dais contact shadow
    const thanTaiPlacement = PLACEMENTS.find((p) => p.id === "thantai")!
    const shrineOpts: ShrineOptionsWithLite = {
      includeAltar: false,
      lite: this.lite,
    }
    const shrineProp = createThanTaiShrine(shrineOpts)
    const shrinePt = logicalToWorld(1024, 344, FLOOR_WORLD_CONFIG)
    shrineProp.group.position.set(shrinePt.x, 0, shrinePt.z)
    shrineProp.group.scale.setScalar(1.06)
    this.group.add(shrineProp.group)
    this.props.push(shrineProp)
    this.addContactShadow(shrinePt.x, shrinePt.z - 0.25, 5.1, 2.25, boxShadowTex, 0.72)

    const deitySpec: CharacterSpecWithLite = {
      avatarId: "thantai",
      isThanTai: true,
      scale: 0.9,
      lite: this.lite,
    }
    this.deityRig = createChibiCharacter(deitySpec)
    const deityPt = logicalToWorld(
      this.deityLogical.x,
      this.deityLogical.y,
      FLOOR_WORLD_CONFIG
    )
    this.deityRig.root.position.set(deityPt.x, 0.19, deityPt.z)
    this.group.add(this.deityRig.root)

    if (thanTaiPlacement.interact) {
      this.registerHotspot(shrineProp.group, thanTaiPlacement.interact, 372)
      this.registerHotspot(this.deityRig.root, thanTaiPlacement.interact, 375)
    }

    if (!this.lite) {
      this.shrineLight = new THREE.PointLight(0xffcf6e, 2.2, 11.5, 1.5)
      this.shrineLight.position.set(deityPt.x, 2.55, deityPt.z + 0.7)
      this.group.add(this.shrineLight)

      // Subtle cool-cyan trading-hall bounce light near the LED wall
      const ledBounce = new THREE.PointLight(0x8ecaff, 0.55, 10, 1.6)
      ledBounce.position.set(ledPt.x, 2.4, ledPt.z + 2.4)
      this.group.add(ledBounce)
    } else {
      this.shrineLight = null
    }

    // Mount Receptionist NPC behind reception desk
    const recSpec: CharacterSpecWithLite = {
      avatarId: RECEPTIONIST.art,
      scale: 1,
      lite: this.lite,
    }
    this.receptionistRig = createChibiCharacter(recSpec)
    const recPt = logicalToWorld(
      RECEPTIONIST.x,
      RECEPTIONIST.y,
      FLOOR_WORLD_CONFIG
    )
    this.receptionistRig.root.position.set(recPt.x, 0, recPt.z)
    this.group.add(this.receptionistRig.root)
    overlay.setNameplate({
      id: "npc:reception",
      name: RECEPTIONIST.name,
      kind: "npc",
      badges: [],
    })
    const receptionPlacement = PLACEMENTS.find((p) => p.id === "reception")
    if (receptionPlacement?.interact) {
      this.registerHotspot(
        this.receptionistRig.root,
        receptionPlacement.interact,
        RECEPTIONIST.y
      )
    }

    // Mount 3 Hall of Fame podiums & initial empty statues
    this.buildStatues(overlay, boxShadowTex)
  }

  private addContactShadow(
    wx: number,
    wz: number,
    w: number,
    d: number,
    tex: THREE.Texture,
    opacity = 0.65
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(wx, 0.009, wz)
    this.group.add(mesh)
  }

  private mountTickerStrip(wx: number, wz: number, width: number): THREE.Texture {
    let tex: THREE.Texture
    try {
      const canvasTex = new THREE.CanvasTexture(this.tickerCanvas)
      canvasTex.colorSpace = THREE.SRGBColorSpace
      canvasTex.wrapS = THREE.RepeatWrapping
      canvasTex.wrapT = THREE.ClampToEdgeWrapping
      canvasTex.anisotropy = this.lite ? 2 : 6
      canvasTex.needsUpdate = true
      tex = canvasTex
    } catch {
      tex = new THREE.DataTexture(new Uint8Array([8, 13, 24, 255]), 1, 1)
      tex.needsUpdate = true
    }

    const tickerHeight = 0.36
    const tickerY = 0.72
    const housingMat = createMatteMaterial("#0d1526", {
      roughness: 0.42,
      metalness: 0.38,
    })
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.16, tickerHeight + 0.08, 0.1),
      housingMat
    )
    housing.position.set(wx, tickerY, wz - 0.05)
    this.group.add(housing)

    const screenMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tex,
      emissiveIntensity: 0.52,
      roughness: 0.28,
      metalness: 0.05,
    })
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, tickerHeight),
      screenMat
    )
    screen.position.set(wx, tickerY, wz + 0.01)
    this.group.add(screen)
    return tex
  }

  private registerHotspot(
    root: THREE.Object3D,
    interact: Interact,
    depth: number
  ): void {
    this.hotspots.push({ root, interact, depth })
    if (
      !this.interacts.some(
        (i) =>
          i.kind === interact.kind &&
          i.access.x === interact.access.x &&
          i.access.y === interact.access.y
      )
    ) {
      this.interacts.push(interact)
    }
  }

  private buildArchitecture(): void {
    const roomW = WORLD_W * FLOOR_WORLD_CONFIG.scale // 32
    const roomH = WORLD_H * FLOOR_WORLD_CONFIG.scale // 22
    const wallZ = logicalToWorld(0, WALL_H, FLOOR_WORLD_CONFIG).z // -7.5
    const southZ = roomH / 2 // +11
    const floorDepth = southZ - wallZ // 18.5
    const floorCenterZ = (wallZ + southZ) / 2 // +1.75

    // 1. Luminous cream marble floor
    const marbleTex = cloneRepeatedTexture(
      createFloorTexture("marble_cream"),
      8,
      4.625
    )
    marbleTex.anisotropy = this.lite ? 2 : 8
    const floorMat = new THREE.MeshStandardMaterial({
      map: marbleTex,
      roughness: 0.42,
      metalness: 0.07,
    })
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, floorDepth),
      floorMat
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0, floorCenterZ)
    floor.receiveShadow = true
    this.group.add(floor)

    // Architectural dark-navy surround apron so shakes/ultrawide edges never reveal harsh seams
    const surroundApron = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW + 24, roomH + 24),
      createMatteMaterial("#101829", { roughness: 0.92 })
    )
    surroundApron.rotation.x = -Math.PI / 2
    surroundApron.position.set(0, -0.04, 0)
    this.group.add(surroundApron)

    const northBase = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomH - floorDepth),
      createMatteMaterial("#131d34", { roughness: 0.9 })
    )
    northBase.rotation.x = -Math.PI / 2
    northBase.position.set(0, -0.01, -roomH / 2 + (roomH - floorDepth) / 2)
    this.group.add(northBase)

    // 2. Royal crimson red carpet (x=960..1088, y=470..1384) with subtle brass edge inlay
    const carpetW = 128 * FLOOR_WORLD_CONFIG.scale // 2.0
    const carpetLen = (1384 - 470) * FLOOR_WORLD_CONFIG.scale // 14.28
    const carpetPt = logicalToWorld(1024, (470 + 1384) / 2, FLOOR_WORLD_CONFIG)
    const carpetTex = cloneRepeatedTexture(
      createFloorTexture("red_carpet"),
      1,
      6.5
    )
    carpetTex.anisotropy = this.lite ? 2 : 8
    const carpetMat = new THREE.MeshStandardMaterial({
      map: carpetTex,
      roughness: 0.78,
      metalness: 0.04,
    })
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(carpetW, carpetLen),
      carpetMat
    )
    carpet.rotation.x = -Math.PI / 2
    carpet.position.set(carpetPt.x, 0.014, carpetPt.z)
    carpet.receiveShadow = true
    this.group.add(carpet)

    // 3. Soft ambient-occlusion wall-floor edge strips
    const stripAoTex = createContactShadowTexture("strip")
    this.aoTextures.push(stripAoTex)
    const wallAoMat = new THREE.MeshBasicMaterial({
      map: stripAoTex,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    })
    const northAo = new THREE.Mesh(new THREE.PlaneGeometry(roomW, 0.85), wallAoMat)
    northAo.rotation.x = -Math.PI / 2
    northAo.position.set(0, 0.007, wallZ + 0.425)
    this.group.add(northAo)

    const sideThick = SIDE * FLOOR_WORLD_CONFIG.scale // 0.375
    for (const side of [-1, 1] as const) {
      const sideAo = new THREE.Mesh(
        new THREE.PlaneGeometry(floorDepth, 0.65),
        wallAoMat
      )
      sideAo.rotation.x = -Math.PI / 2
      sideAo.rotation.z = side === -1 ? Math.PI / 2 : -Math.PI / 2
      sideAo.position.set(
        side * (roomW / 2 - sideThick - 0.32),
        0.007,
        floorCenterZ
      )
      this.group.add(sideAo)
    }

    // 4. Overhead ceiling-light warm glow pools on the marble floor
    const glowPoolTex = createGlowPoolTexture("rgba(255, 234, 178, 0.55)")
    this.aoTextures.push(glowPoolTex)
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowPoolTex,
      transparent: true,
      opacity: this.lite ? 0.14 : 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const lightPools: [number, number, number, number][] = [
      [1024, 560, 7.2, 5.2], // Shrine & central lobby chandelier glow
      [1024, 980, 6.4, 6.0], // Mid red-carpet ceiling downlight
      [420, 780, 7.4, 5.6], // Lounge warm ceiling light
      [1650, 860, 8.6, 5.8], // Hall of Fame gallery ceiling glow
    ]
    for (const [lx, ly, pw, pd] of lightPools) {
      const pt = logicalToWorld(lx, ly, FLOOR_WORLD_CONFIG)
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), poolMat)
      pool.rotation.x = -Math.PI / 2
      pool.position.set(pt.x, 0.013, pt.z)
      this.group.add(pool)
    }

    // 5. Batched static architecture: walls, skirting baseboards, recessed dado trims,
    //    fluted columns, brass sconces, cornice light cove, LED/SACO header beams, floor brass inlays.
    const batcher = new StaticGeometryBatcher()
    batcher.registerMaterial(
      "upper-wall",
      createMatteMaterial("#ece4d6", { roughness: 0.66 })
    )
    batcher.registerMaterial(
      "navy-dado",
      createMatteMaterial("#18274a", { roughness: 0.46 })
    )
    batcher.registerMaterial(
      "skirting",
      createMatteMaterial("#0f1a33", { roughness: 0.44, metalness: 0.16 })
    )
    batcher.registerMaterial(
      "pilaster",
      createMatteMaterial("#e2d7c5", { roughness: 0.54 })
    )
    batcher.registerMaterial(
      "pilaster-flute",
      createMatteMaterial("#cfc1aa", { roughness: 0.62 })
    )
    batcher.registerMaterial(
      "gold-trim",
      createMetalMaterial("#e9b949", { roughness: 0.25, metalness: 0.84 })
    )
    batcher.registerMaterial(
      "brass-dark",
      createMetalMaterial("#a67c2e", { roughness: 0.34, metalness: 0.72 })
    )
    batcher.registerMaterial(
      "obsidian",
      createMatteMaterial("#0c1324", { roughness: 0.38, metalness: 0.32 })
    )
    batcher.registerMaterial(
      "warm-glow",
      createGlowMaterial("#ffe4a3", this.lite ? 0.85 : 1.05)
    )
    batcher.registerMaterial(
      "led-green",
      createGlowMaterial("#34d399", 1.1)
    )
    batcher.registerMaterial(
      "lantern-red",
      createGlowMaterial("#ef4444", 0.75)
    )

    const northH = 4.55
    const wallThick = 0.46
    const cylSegs = this.lite ? 8 : 14
    const sphSegs = this.lite ? 8 : 12

    // North main wall & multi-layer skirting + wainscoting dado + crown cornice
    batcher.addBox("upper-wall", roomW, northH, wallThick, 0, northH / 2, wallZ - wallThick / 2)
    batcher.addBox("navy-dado", roomW, 1.06, 0.08, 0, 0.53, wallZ + 0.02)
    // Skirting baseboard + brushed gold kick strip
    batcher.addBox("skirting", roomW, 0.22, 0.12, 0, 0.11, wallZ + 0.05)
    batcher.addBox("gold-trim", roomW, 0.035, 0.135, 0, 0.23, wallZ + 0.055)
    // Gold chair rail & layered crown cornice
    batcher.addBox("gold-trim", roomW, 0.075, 0.12, 0, 1.08, wallZ + 0.035)
    batcher.addBox("navy-dado", roomW + 0.24, 0.24, wallThick + 0.18, 0, northH + 0.08, wallZ - wallThick / 2 + 0.05)
    batcher.addBox("gold-trim", roomW + 0.28, 0.075, 0.14, 0, northH - 0.03, wallZ + 0.08)
    // Recessed ceiling-light cove glowing strip beneath the north cornice
    batcher.addBox("warm-glow", roomW - 0.6, 0.055, 0.08, 0, northH - 0.14, wallZ + 0.07)

    // Recessed dado molding frames along the north lower wall
    const dadoBays: [number, number][] = [
      [140, 810],
      [1235, 1955],
    ]
    for (const [x0, x1] of dadoBays) {
      const mid = logicalToWorld((x0 + x1) / 2, WALL_H, FLOOR_WORLD_CONFIG).x
      const span = (x1 - x0) * FLOOR_WORLD_CONFIG.scale
      batcher.addBox("skirting", span, 0.54, 0.03, mid, 0.64, wallZ + 0.065)
      batcher.addBox("brass-dark", span + 0.08, 0.03, 0.04, mid, 0.92, wallZ + 0.07)
      batcher.addBox("brass-dark", span + 0.08, 0.03, 0.04, mid, 0.36, wallZ + 0.07)
    }

    // Trading-hall LED & SACO board architectural header beams + status indicator lights
    const ledX = logicalToWorld(BOARDS.led.x, WALL_H, FLOOR_WORLD_CONFIG).x
    batcher.addBox("obsidian", 11.1, 0.24, 0.22, ledX, 4.18, wallZ + 0.12)
    batcher.addBox("gold-trim", 11.16, 0.045, 0.24, ledX, 4.3, wallZ + 0.13)
    for (let i = 0; i < 3; i += 1) {
      batcher.addSphere(
        i === 0 ? "led-green" : "warm-glow",
        0.045,
        sphSegs,
        sphSegs,
        ledX - 5.1 + i * 0.22,
        4.18,
        wallZ + 0.24
      )
    }

    const sacoX = logicalToWorld(BOARDS.saco.x, WALL_H, FLOOR_WORLD_CONFIG).x
    batcher.addBox("obsidian", 7.66, 0.2, 0.2, sacoX, 4.12, wallZ + 0.12)
    batcher.addBox("warm-glow", 5.8, 0.045, 0.06, sacoX, 4.0, wallZ + 0.24)

    // 4 Grand Fluted North Wall Columns (flanking LED board, Shrine, SACO board) + warm brass wall sconces
    for (const lx of [36, 864, 1184, 2012]) {
      const px = logicalToWorld(lx, WALL_H, FLOOR_WORLD_CONFIG).x
      // Tiered navy & gold plinth base
      batcher.addBox("skirting", 0.56, 0.32, 0.32, px, 0.16, wallZ + 0.1)
      batcher.addBox("gold-trim", 0.52, 0.07, 0.3, px, 0.34, wallZ + 0.1)
      // Fluted cream shaft
      batcher.addBox("pilaster", 0.44, northH - 0.52, 0.24, px, 0.36 + (northH - 0.52) / 2, wallZ + 0.08)
      batcher.addBox("pilaster-flute", 0.08, northH - 1.1, 0.04, px - 0.1, northH / 2 + 0.1, wallZ + 0.2)
      batcher.addBox("pilaster-flute", 0.08, northH - 1.1, 0.04, px + 0.1, northH / 2 + 0.1, wallZ + 0.2)
      // Gold capital rings
      batcher.addBox("gold-trim", 0.54, 0.11, 0.3, px, northH - 0.2, wallZ + 0.1)
      batcher.addBox("gold-trim", 0.58, 0.07, 0.34, px, northH - 0.08, wallZ + 0.11)
      // Warm glowing brass wall sconce
      batcher.addBox("brass-dark", 0.12, 0.24, 0.08, px, 3.22, wallZ + 0.22)
      batcher.addCylinder("warm-glow", 0.075, 0.065, 0.34, cylSegs, px, 3.28, wallZ + 0.3)
      batcher.addCylinder("gold-trim", 0.09, 0.09, 0.045, cylSegs, px, 3.46, wallZ + 0.3)
      batcher.addCylinder("gold-trim", 0.085, 0.085, 0.045, cylSegs, px, 3.1, wallZ + 0.3)
    }

    // Twin ceremonial red-gold shrine hanging lanterns tucked beside the shrine archway
    for (const side of [-1, 1] as const) {
      const lx = side * 2.18
      const lz = wallZ + 1.85
      batcher.addBox("gold-trim", 0.04, 0.28, 0.04, lx, 3.45, lz)
      batcher.addSphere("lantern-red", 0.18, sphSegs, sphSegs, lx, 3.18, lz)
      batcher.addCylinder("gold-trim", 0.11, 0.11, 0.05, cylSegs, lx, 3.35, lz)
      batcher.addCylinder("gold-trim", 0.1, 0.1, 0.05, cylSegs, lx, 3.01, lz)
      batcher.addCylinder("gold-trim", 0.02, 0.045, 0.2, cylSegs, lx, 2.88, lz)
    }

    // West & East cutaway walls with skirting, chair rail, top trim, and periodic decorative ribs
    const sideH = 1.48
    const sideDepth = floorDepth
    for (const side of [-1, 1] as const) {
      const sx = side * (roomW / 2 - sideThick / 2)
      const innerFaceX = side * (roomW / 2 - sideThick)
      batcher.addBox("navy-dado", sideThick, sideH, sideDepth, sx, sideH / 2, floorCenterZ)
      // Skirting along inside of side wall
      batcher.addBox("skirting", 0.08, 0.22, sideDepth, innerFaceX - side * 0.04, 0.11, floorCenterZ)
      batcher.addBox("gold-trim", 0.09, 0.035, sideDepth, innerFaceX - side * 0.045, 0.23, floorCenterZ)
      // Chair rail & top gold cap
      batcher.addBox("brass-dark", 0.07, 0.05, sideDepth, innerFaceX - side * 0.035, 0.88, floorCenterZ)
      batcher.addBox("gold-trim", sideThick + 0.09, 0.09, sideDepth + 0.09, sx, sideH + 0.045, floorCenterZ)

      // Slim vertical accent piers along West & East walls (zero walkable intrusion)
      for (const zOff of [-3.5, 1.5, 6.5, 10.6]) {
        batcher.addBox("pilaster", 0.1, sideH + 0.04, 0.28, innerFaceX - side * 0.04, sideH / 2, zOff)
        batcher.addBox("gold-trim", 0.14, 0.08, 0.34, innerFaceX - side * 0.04, sideH + 0.06, zOff)
      }
    }

    // South cutaway wall with skirting, gold trim & grand entrance door frame (936..1112)
    const southH = 0.44
    const leftSpanW = 936 * FLOOR_WORLD_CONFIG.scale
    const rightSpanW = (WORLD_W - 1112) * FLOOR_WORLD_CONFIG.scale
    const leftX = -roomW / 2 + leftSpanW / 2
    const rightX = roomW / 2 - rightSpanW / 2
    const southWallZ = southZ - sideThick / 2

    for (const [cx, spanW] of [
      [leftX, leftSpanW],
      [rightX, rightSpanW],
    ] as const) {
      batcher.addBox("navy-dado", spanW, southH, sideThick, cx, southH / 2, southWallZ)
      batcher.addBox("skirting", spanW, 0.16, 0.08, cx, 0.08, southWallZ - sideThick / 2 - 0.03)
      batcher.addBox("gold-trim", spanW + 0.04, 0.075, sideThick + 0.07, cx, southH + 0.035, southWallZ)
    }

    // Entrance threshold & twin illuminated brass-and-navy entry bollards at x=936 and x=1112
    const doorW = (1112 - 936) * FLOOR_WORLD_CONFIG.scale
    batcher.addBox("skirting", doorW, 0.05, sideThick + 0.08, 0, 0.025, southWallZ)
    batcher.addBox("gold-trim", doorW - 0.16, 0.015, 0.08, 0, 0.052, southWallZ - 0.1)
    for (const lx of [936, 1112]) {
      const dx = logicalToWorld(lx, WORLD_H, FLOOR_WORLD_CONFIG).x
      batcher.addBox("navy-dado", 0.28, 0.96, sideThick + 0.12, dx, 0.48, southWallZ)
      batcher.addBox("gold-trim", 0.34, 0.09, sideThick + 0.16, dx, 0.98, southWallZ)
      batcher.addSphere("warm-glow", 0.11, sphSegs, sphSegs, dx, 1.12, southWallZ)
    }

    // Subtle brass floor inlay strips framing the red carpet edges (flat at y=0.012)
    for (const side of [-1, 1] as const) {
      batcher.addBox(
        "brass-dark",
        0.045,
        0.008,
        carpetLen + 0.16,
        carpetPt.x + side * (carpetW / 2 + 0.08),
        0.012,
        carpetPt.z
      )
    }

    batcher.flush(this.group)
  }

  private buildZoneDecals(): void {
    for (const label of ZONE_LABELS) {
      const tex = createFloorDecalTexture(label.text, "#7a5324")
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
      const w = label.text.length > 14 ? 5.8 : 4.1
      const h = w * 0.25
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      plane.rotation.x = -Math.PI / 2
      const pt = logicalToWorld(label.x, label.y, FLOOR_WORLD_CONFIG)
      plane.position.set(pt.x, 0.018, pt.z)
      this.group.add(plane)
    }
  }

  private placeFurniture(
    p: Placement,
    ovalShadowTex: THREE.Texture,
    boxShadowTex: THREE.Texture
  ): void {
    const s = FLOOR_WORLD_CONFIG.scale
    let prop: DisposableProp | null = null
    let centerY = p.foot ? p.y - p.foot[1] / 2 : p.y - p.h / 2
    let shadowSpec: { w: number; d: number; tex: THREE.Texture; opacity: number } | null = null

    if (p.id === "offering") {
      prop = createOfferingAltar(3.05, 1.05)
      centerY = p.y - (p.foot ? p.foot[1] / 2 : 35)
      shadowSpec = { w: 3.65, d: 1.55, tex: boxShadowTex, opacity: 0.7 }
    } else if (p.id === "rug") {
      const rugOpts: RugOptionsWithLite = {
        shape: "oval",
        colorHex: "#efe2cc",
        borderHex: "#243760",
        borderWidth: 0.22,
        lite: this.lite,
      }
      prop = createRug(p.w * s, p.h * s, rugOpts)
      centerY = 790
    } else if (p.id === "rug-fame") {
      const rugOpts: RugOptionsWithLite = {
        shape: "rounded",
        colorHex: "#f2e5ce",
        borderHex: "#9b1c26",
        borderWidth: 0.26,
        lite: this.lite,
      }
      prop = createRug(p.w * s, p.h * s, rugOpts)
      centerY = 885
    } else if (p.id === "sofa") {
      prop = createSofa(p.w * s, 1.15, "#23395d")
      shadowSpec = { w: p.w * s + 0.55, d: 1.65, tex: boxShadowTex, opacity: 0.65 }
    } else if (p.id === "coffee-table") {
      prop = createCoffeeTable(p.w * s, 0.92)
      shadowSpec = { w: p.w * s + 0.45, d: 1.38, tex: boxShadowTex, opacity: 0.55 }
    } else if (p.id === "pantry") {
      prop = createPantryCounter(p.w * s, 0.92)
      shadowSpec = { w: p.w * s + 0.5, d: 1.4, tex: boxShadowTex, opacity: 0.65 }
    } else if (p.id === "reception") {
      prop = createReceptionDesk(p.w * s, 0.86)
      shadowSpec = { w: p.w * s + 0.55, d: 1.38, tex: boxShadowTex, opacity: 0.68 }
    } else if (p.placeholder === "plant" || p.art === "plant_tall") {
      prop = createPottedPlant("tall")
      shadowSpec = { w: 1.05, d: 1.05, tex: ovalShadowTex, opacity: 0.62 }
    } else if (p.placeholder === "plant-small" || p.art === "plant_small") {
      prop = createPottedPlant("small")
      shadowSpec = { w: 0.78, d: 0.78, tex: ovalShadowTex, opacity: 0.58 }
    }

    if (!prop) return
    const pt = logicalToWorld(p.x, centerY, FLOOR_WORLD_CONFIG)
    prop.group.position.set(pt.x, 0, pt.z)
    this.group.add(prop.group)
    this.props.push(prop)

    if (shadowSpec) {
      this.addContactShadow(
        pt.x,
        pt.z,
        shadowSpec.w,
        shadowSpec.d,
        shadowSpec.tex,
        shadowSpec.opacity
      )
    }

    if (p.interact) {
      this.registerHotspot(prop.group, p.interact, p.y)
    }
  }

  private buildStatues(
    overlay: OverlayLayer,
    boxShadowTex: THREE.Texture
  ): void {
    const podiumHeights: Readonly<Record<1 | 2 | 3, number>> = {
      1: 0.77,
      2: 0.61,
      3: 0.53,
    }
    const ringColors: Readonly<Record<1 | 2 | 3, number>> = {
      1: 0xf3c64a,
      2: 0xcfd5de,
      3: 0xc98a52,
    }
    for (const rank of [1, 2, 3] as const) {
      const p = PLACEMENTS.find((item) => item.id === `statue-${rank}`)!
      const centerY = p.foot ? p.y - p.foot[1] / 2 : p.y - 30
      const pt = logicalToWorld(p.x, centerY, FLOOR_WORLD_CONFIG)
      const hitGroup = new THREE.Group()
      hitGroup.position.set(pt.x, 0, pt.z)
      this.group.add(hitGroup)

      const podium = createStatuePodium(rank, 1.85, 1.05)
      hitGroup.add(podium.group)
      this.props.push(podium)

      // Contact shadow + subtle metallic rank accent floor ring beneath each podium
      this.addContactShadow(pt.x, pt.z, 2.4, 1.55, boxShadowTex, 0.68)
      const glowRingMat = new THREE.MeshBasicMaterial({
        color: ringColors[rank],
        transparent: true,
        opacity: rank === 1 ? 0.34 : 0.22,
        depthWrite: false,
      })
      const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(1.06, 1.15, this.lite ? 20 : 32),
        glowRingMat
      )
      glowRing.rotation.x = -Math.PI / 2
      glowRing.position.set(pt.x, 0.022, pt.z)
      this.group.add(glowRing)

      if (p.interact) {
        this.registerHotspot(hitGroup, p.interact, p.y)
      }

      const slot: StatueSlot = {
        rank,
        placement: p,
        podiumTopY: podiumHeights[rank],
        wx: pt.x,
        wz: pt.z,
        rig: null,
        rigAvatar: "",
        rigFilled: false,
        hitGroup,
      }
      this.statues.push(slot)
      this.mountStatueRig(slot, "male01", false)
      overlay.setStatuePlaque(rank, "Chưa có", null, false)
    }
  }

  private mountStatueRig(
    slot: StatueSlot,
    avatarId: string,
    filled: boolean
  ): void {
    if (
      slot.rig &&
      slot.rigAvatar === avatarId &&
      slot.rigFilled === filled
    ) {
      return
    }
    if (slot.rig) {
      slot.hitGroup.remove(slot.rig.root)
      slot.rig.dispose()
    }
    const spec: CharacterSpecWithLite = {
      avatarId,
      statueRank: filled ? slot.rank : "empty",
      scale: slot.rank === 1 ? 1.08 : 0.96,
      lite: this.lite,
    }
    const rig = createChibiCharacter(spec)
    rig.root.position.set(0, slot.podiumTopY, 0)
    slot.hitGroup.add(rig.root)
    slot.rig = rig
    slot.rigAvatar = avatarId
    slot.rigFilled = filled
  }

  /** Re-flags dynamic canvas textures after a WebGL context restore. */
  refreshDynamicTextures(): void {
    if (this.disposed) return
    this.ledBoard.update()
    this.sacoBoard.update()
    this.tickerTexture.needsUpdate = true
  }

  /** Repaints the VN30 10×3 LED wall board and live ticker strip canvas textures. */
  updateMarket(
    indices: readonly IndexQuote[] | null,
    vn30: readonly Quote[] | null
  ): void {
    if (this.disposed) return
    drawLedMarketBoard(this.ledCanvas, indices, vn30)
    this.ledBoard.update()
    drawTickerStrip(this.tickerCanvas, indices, vn30)
    this.tickerTexture.needsUpdate = true
  }

  /** Repaints the SACO Nhận định wall board canvas texture. */
  updatePosts(posts: readonly PostCard[]): void {
    if (this.disposed) return
    drawSacoBoard(this.sacoCanvas, posts)
    this.sacoBoard.update()
  }

  /** Syncs the 3 Hall of Fame metallic Chibi statues and plaques with `world.leaderboard`. */
  updateLeaderboard(
    board: ThanTaiLeaderboard | null,
    overlay: OverlayLayer
  ): void {
    if (this.disposed) return
    for (const slot of this.statues) {
      const row = board?.rows.find(
        (r) => r.rank === slot.rank && r.correct > 0
      )
      if (row) {
        const avatarId = normalizeAvatarId(row.avatar) ?? "male01"
        this.mountStatueRig(slot, avatarId, true)
        const shortName =
          row.name.length > 18 ? `${row.name.slice(0, 17)}…` : row.name
        overlay.setStatuePlaque(
          slot.rank,
          shortName,
          `${row.correct}/${row.total} lần đúng`,
          true
        )
      } else {
        this.mountStatueRig(slot, "male01", false)
        overlay.setStatuePlaque(slot.rank, "Chưa có", null, false)
      }
    }
  }

  /** Celebrates a ritual or Khấn: Thần Tài waves, golden sparks explode, shrine light pulses. */
  celebrate(luck: number, elapsedS: number): void {
    if (this.disposed) return
    const reduced = prefersReducedMotion()
    this.deityWaveUntilS = Math.max(
      this.deityWaveUntilS,
      elapsedS + (reduced ? 1.2 : 2.3)
    )
    this.shrinePulseS = reduced ? 0 : 0.65
    const baseBurst = 18 + Math.max(1, Math.min(5, luck)) * 8
    const burst = Math.max(
      4,
      Math.round(baseBurst * (this.lite ? 0.45 : 1) * (reduced ? 0.45 : 1))
    )
    const pt = logicalToWorld(
      this.deityLogical.x,
      this.deityLogical.y,
      FLOOR_WORLD_CONFIG
    )
    for (let i = 0; i < burst; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = 0.3 + Math.random() * 1.4
      this.spawnShrineSpark(
        pt.x + Math.cos(a) * r,
        0.7 + Math.random() * 1.5,
        pt.z + Math.sin(a) * r * 0.6,
        Math.cos(a) * (0.6 + Math.random() * 1.4),
        1.1 + Math.random() * 2.0,
        Math.sin(a) * (0.4 + Math.random() * 0.9),
        (1.2 + Math.random() * 1.0) * (reduced ? 0.6 : 1),
        1.35
      )
    }
  }

  /**
   * Auto-greets visitors stepping into Thần Tài's greeting circle (`r=210`, `leave=260`, `2600ms` cooldown).
   */
  greetVisitors(
    nowMs: number,
    elapsedS: number,
    visitors: readonly VisitorSnapshot[],
    overlay: OverlayLayer
  ): void {
    if (this.disposed) return
    const present = new Set<string>()
    for (const v of visitors) {
      present.add(v.id)
      const d = Math.hypot(v.x - GREET.x, v.y - GREET.y)
      if (d < GREET.r && !this.nearDeity.has(v.id)) {
        this.nearDeity.add(v.id)
        this.greetQueue.push(v.name)
      } else if (d > GREET.leave) {
        this.nearDeity.delete(v.id)
      }
    }
    for (const id of [...this.nearDeity]) {
      if (!present.has(id)) this.nearDeity.delete(id)
    }
    const deityActing = elapsedS < this.deityWaveUntilS
    if (!this.greetQueue.length || nowMs < this.deityFreeAtMs || deityActing) {
      return
    }
    const names = [...new Set(this.greetQueue)]
    this.greetQueue = []
    const who =
      names.length > 3
        ? `${names.slice(0, 3).join(", ")} và mọi người`
        : names.join(", ")
    const tpl = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]!
    this.deityWaveUntilS = elapsedS + 2.0
    overlay.showBubble("npc:deity", tpl(who), "right", nowMs)
    this.deityFreeAtMs = nowMs + GREET.gapMs
  }

  private spawnShrineSpark(
    wx: number,
    wy: number,
    wz: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    baseScale = 1
  ): void {
    const cap = this.lite ? 14 : 48
    if (this.shrineSparks.length >= cap) {
      const oldest = this.shrineSparks.shift()
      if (oldest) {
        this.group.remove(oldest.mesh)
        oldest.mat.dispose()
      }
    }
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() < 0.5 ? 0xfff3b0 : 0xffcf40,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(this.shrineSparkGeo, mat)
    mesh.position.set(wx, wy, wz)
    mesh.scale.setScalar(baseScale)
    this.group.add(mesh)
    this.shrineSparks.push({
      mesh,
      mat,
      vx,
      vy,
      vz,
      age: 0,
      life,
      baseScale,
    })
  }

  update(
    dt: number,
    elapsedS: number,
    projectLogical: (
      lx: number,
      ly: number,
      heightWorld: number
    ) => ProjectedPoint,
    overlay: OverlayLayer
  ): void {
    if (this.disposed) return
    const reduced = prefersReducedMotion()

    // Smooth UV scroll on the live trading-hall ticker strip (0 Canvas2D work per frame)
    if (!reduced && dt > 0) {
      this.tickerTexture.offset.x =
        (this.tickerTexture.offset.x + dt * 0.045) % 1
    }

    // 1. Animate Thần Tài NPC & shrine light
    const waving = elapsedS < this.deityWaveUntilS
    this.deityRig.update(dt, {
      anim: waving ? "wave" : "idle",
      facingRad: facingToRadians("s"),
      animTime: reduced && !waving ? 0 : elapsedS,
    })

    if (this.shrinePulseS > 0) {
      this.shrinePulseS = Math.max(0, this.shrinePulseS - dt)
    }
    if (this.shrineLight) {
      const pulseBoost = Math.sin((this.shrinePulseS / 0.65) * Math.PI) * 2.2
      const breathe = reduced ? 0 : Math.sin(elapsedS * 2.4) * 0.3
      this.shrineLight.intensity = 2.2 + breathe + Math.max(0, pulseBoost)
    }

    // Continuous rising shrine gold sparkles (disabled under reduced-motion, slower in lite)
    if (!reduced) {
      const sparkInterval = this.lite ? 0.55 : 0.24
      this.shrineSparkAccum += dt
      if (this.shrineSparkAccum >= sparkInterval) {
        this.shrineSparkAccum = 0
        const pt = logicalToWorld(
          this.deityLogical.x,
          this.deityLogical.y,
          FLOOR_WORLD_CONFIG
        )
        this.spawnShrineSpark(
          pt.x + (Math.random() * 2 - 1) * 1.4,
          0.55 + Math.random() * 0.45,
          pt.z + (Math.random() * 2 - 1) * 0.7,
          (Math.random() * 2 - 1) * 0.16,
          0.45 + Math.random() * 0.5,
          (Math.random() * 2 - 1) * 0.12,
          1.8 + Math.random() * 1.2,
          0.75
        )
      }
    }

    for (let i = this.shrineSparks.length - 1; i >= 0; i -= 1) {
      const sp = this.shrineSparks[i]!
      sp.age += dt
      if (sp.age >= sp.life) {
        this.group.remove(sp.mesh)
        sp.mat.dispose()
        this.shrineSparks.splice(i, 1)
        continue
      }
      const t = sp.age / sp.life
      sp.mesh.position.x += sp.vx * dt
      sp.mesh.position.y += sp.vy * dt
      sp.mesh.position.z += sp.vz * dt
      sp.mesh.rotation.y += dt * 3.2
      sp.mesh.scale.setScalar(sp.baseScale * (1 - t * 0.85))
      sp.mat.opacity = 0.92 * (1 - t)
    }

    // Position Thần Tài speech bubble right beside his head
    overlay.positionBubble(
      "npc:deity",
      projectLogical(this.deityLogical.x + 56, this.deityLogical.y, 2.35)
    )

    // 2. Animate Receptionist NPC & project her nameplate
    this.receptionistRig.update(dt, {
      anim: "idle",
      facingRad: facingToRadians(RECEPTIONIST.facing),
      animTime: reduced ? 0 : elapsedS + 1.3,
    })
    overlay.positionNameplate(
      "npc:reception",
      projectLogical(
        RECEPTIONIST.x,
        RECEPTIONIST.y,
        this.receptionistRig.headHeight + 0.14
      ),
      RECEPTIONIST.y
    )

    // 3. Animate Hall of Fame statues (rotating floating medals) & project plaques
    for (const slot of this.statues) {
      slot.rig?.update(dt, {
        anim: "statue",
        facingRad: facingToRadians("s"),
        animTime: reduced ? 0 : elapsedS + slot.rank * 0.7,
      })
      overlay.positionStatuePlaque(
        slot.rank,
        projectLogical(slot.placement.x, slot.placement.y + 12, 0.08)
      )
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const sp of this.shrineSparks.splice(0)) {
      this.group.remove(sp.mesh)
      sp.mat.dispose()
    }
    this.shrineSparkGeo.dispose()
    this.tickerTexture.dispose()
    for (const tex of this.aoTextures.splice(0)) {
      tex.dispose()
    }
    this.deityRig.dispose()
    this.receptionistRig.dispose()
    for (const slot of this.statues) {
      slot.rig?.dispose()
      slot.rig = null
    }
    for (const prop of this.props.splice(0)) {
      prop.dispose()
    }
    disposeObject3D(this.group)
    this.group.parent?.remove(this.group)
  }
}
