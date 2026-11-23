/**
 * Procedural Cute & Crisp Chibi 3D World for Khu Giao Dịch (`2048 × 1408` logical space -> `32u × 22u`).
 * Preserves 100% of `layout.ts` footprints & all 4 backend bot corridors, mounts live VN30 LED & SACO boards,
 * animated Thần Tài NPC with sparkles/greetings/celebrate, Receptionist NPC, and 3 Hall of Fame statues.
 */
import * as THREE from "three"

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
} from "@/lib/chibi-3d/furniture-builder.ts"
import {
  createFloorDecalTexture,
  createFloorTexture,
  drawLedMarketBoard,
  drawSacoBoard,
} from "@/lib/chibi-3d/textures.ts"
import {
  createMatteMaterial,
  createMetalMaterial,
  disposeObject3D,
  facingToRadians,
  logicalToWorld,
  type ChibiRig,
  type ProjectedPoint,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

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

export const FLOOR_WORLD_CONFIG: WorldTransformConfig = {
  logicalW: WORLD_W,
  logicalH: WORLD_H,
  scale: 1 / 64,
}

/** Thần Tài auto-greeting zone (matches original OfficeScene contract). */
const GREET = { x: 1024, y: 500, r: 210, leave: 260, gapMs: 2600 }
const GREETINGS: readonly ((who: string) => string)[] = [
  (n) => `Chào ${n}! Chúc danh mục xanh rực, lệnh nào cũng khớp!`,
  (n) => `${n} đến rồi! Thần Tài chúc tiền vô như nước!`,
  (n) => `Chào ${n}, chúc phát tài phát lộc!`,
  (n) => `A, ${n}! Gieo một quẻ lấy hên đầu phiên nhé!`,
]

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

function addWallPart(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  cast = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.castShadow = cast
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
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

export class FloorWorld3D {
  readonly group: THREE.Group
  readonly hotspots: FloorHotspot[] = []
  readonly interacts: Interact[] = []

  private readonly props: DisposableProp[] = []
  private readonly ledCanvas: HTMLCanvasElement
  private readonly sacoCanvas: HTMLCanvasElement
  private readonly ledBoard: LiveBoardProp
  private readonly sacoBoard: LiveBoardProp

  private readonly deityRig: ChibiRig
  private readonly deityLogical = { x: 1024, y: 360 }
  private readonly shrineLight: THREE.PointLight
  private readonly shrineSparkGeo = new THREE.OctahedronGeometry(0.07, 0)
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

  constructor(scene: THREE.Scene, overlay: OverlayLayer) {
    this.group = new THREE.Group()
    this.group.name = "trading-floor-world-3d"
    scene.add(this.group)

    this.buildArchitecture()
    this.buildZoneDecals()

    // Live VN30 LED & SACO wall boards
    this.ledCanvas = document.createElement("canvas")
    this.ledCanvas.width = 1024
    this.ledCanvas.height = 280
    drawLedMarketBoard(this.ledCanvas, null, null)
    this.ledBoard = createWallBoardFrame(11.4, 3.05, this.ledCanvas, "#e9b949")
    const ledPt = logicalToWorld(BOARDS.led.x, WALL_H, FLOOR_WORLD_CONFIG)
    this.ledBoard.group.position.set(ledPt.x, 2.38, ledPt.z + 0.14)
    this.group.add(this.ledBoard.group)
    this.props.push(this.ledBoard)
    this.registerHotspot(this.ledBoard.group, BOARDS.led.interact, 10)

    this.sacoCanvas = document.createElement("canvas")
    this.sacoCanvas.width = 768
    this.sacoCanvas.height = 288
    drawSacoBoard(this.sacoCanvas, [])
    this.sacoBoard = createWallBoardFrame(7.4, 2.75, this.sacoCanvas, "#e9b949")
    const sacoPt = logicalToWorld(BOARDS.saco.x, WALL_H, FLOOR_WORLD_CONFIG)
    this.sacoBoard.group.position.set(sacoPt.x, 2.38, sacoPt.z + 0.14)
    this.group.add(this.sacoBoard.group)
    this.props.push(this.sacoBoard)
    this.registerHotspot(this.sacoBoard.group, BOARDS.saco.interact, 10)

    // Mount all static furniture props & shrine from PLACEMENTS
    for (const p of PLACEMENTS) {
      if (p.id.startsWith("statue-") || p.id === "thantai") continue
      this.placeFurniture(p)
    }

    // Mount Thần Tài Shrine archway + animated Thần Tài NPC
    const thanTaiPlacement = PLACEMENTS.find((p) => p.id === "thantai")!
    const shrineProp = createThanTaiShrine({ includeAltar: false })
    const shrinePt = logicalToWorld(1024, 344, FLOOR_WORLD_CONFIG)
    shrineProp.group.position.set(shrinePt.x, 0, shrinePt.z)
    shrineProp.group.scale.setScalar(1.06)
    this.group.add(shrineProp.group)
    this.props.push(shrineProp)

    this.deityRig = createChibiCharacter({
      avatarId: "thantai",
      isThanTai: true,
      scale: 0.9,
    })
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

    this.shrineLight = new THREE.PointLight(0xffcf6e, 2.4, 12, 1.5)
    this.shrineLight.position.set(deityPt.x, 2.55, deityPt.z + 0.7)
    this.group.add(this.shrineLight)

    // Mount Receptionist NPC behind reception desk
    this.receptionistRig = createChibiCharacter({
      avatarId: RECEPTIONIST.art,
      scale: 1,
    })
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
    this.buildStatues(overlay)
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
    const floorMat = new THREE.MeshStandardMaterial({
      map: marbleTex,
      roughness: 0.44,
      metalness: 0.06,
    })
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, floorDepth),
      floorMat
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0, floorCenterZ)
    floor.receiveShadow = true
    this.group.add(floor)

    // Architectural dark-navy surround apron so camera shakes or ultrawide edges never reveal harsh void seams
    const surroundApron = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW + 24, roomH + 24),
      createMatteMaterial("#101829", { roughness: 0.92 })
    )
    surroundApron.rotation.x = -Math.PI / 2
    surroundApron.position.set(0, -0.04, 0)
    this.group.add(surroundApron)

    // Warm outer skirt under north wall so no dark seam ever shows
    const northBase = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomH - floorDepth),
      createMatteMaterial("#131d34", { roughness: 0.9 })
    )
    northBase.rotation.x = -Math.PI / 2
    northBase.position.set(0, -0.01, -roomH / 2 + (roomH - floorDepth) / 2)
    this.group.add(northBase)

    // 2. Royal crimson red carpet (x=960..1088, y=470..1384)
    const carpetW = 128 * FLOOR_WORLD_CONFIG.scale // 2.0
    const carpetLen = (1384 - 470) * FLOOR_WORLD_CONFIG.scale // 14.28
    const carpetPt = logicalToWorld(1024, (470 + 1384) / 2, FLOOR_WORLD_CONFIG)
    const carpetTex = cloneRepeatedTexture(
      createFloorTexture("red_carpet"),
      1,
      6.5
    )
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

    // 3. Architectural Walls (warm ivory upper + IQX navy dado + metallic gold trim)
    const upperWallMat = createMatteMaterial("#e8dfd1", { roughness: 0.68 })
    const navyTrimMat = createMatteMaterial("#18274a", { roughness: 0.48 })
    const darkTrimMat = createMatteMaterial("#101b34", { roughness: 0.55 })
    const goldMat = createMetalMaterial("#e9b949", {
      roughness: 0.26,
      metalness: 0.82,
    })
    const pilasterMat = createMatteMaterial("#dfd3c0", { roughness: 0.58 })

    const northH = 4.45
    const wallThick = 0.46
    // North wall main backing
    addWallPart(
      this.group,
      new THREE.BoxGeometry(roomW, northH, wallThick),
      upperWallMat,
      0,
      northH / 2,
      wallZ - wallThick / 2,
      false
    )
    // North lower navy wainscoting
    addWallPart(
      this.group,
      new THREE.BoxGeometry(roomW, 1.05, 0.08),
      navyTrimMat,
      0,
      0.525,
      wallZ + 0.02,
      false
    )
    // Gold chair rail & crown cornice
    addWallPart(
      this.group,
      new THREE.BoxGeometry(roomW, 0.08, 0.12),
      goldMat,
      0,
      1.08,
      wallZ + 0.03,
      false
    )
    addWallPart(
      this.group,
      new THREE.BoxGeometry(roomW + 0.2, 0.22, wallThick + 0.16),
      navyTrimMat,
      0,
      northH + 0.06,
      wallZ - wallThick / 2 + 0.04,
      false
    )
    addWallPart(
      this.group,
      new THREE.BoxGeometry(roomW + 0.24, 0.07, 0.12),
      goldMat,
      0,
      northH - 0.04,
      wallZ + 0.06,
      false
    )
    // Architectural pilasters framing LED wall, Shrine, and SACO board
    for (const lx of [36, 868, 1180, 2012]) {
      const px = logicalToWorld(lx, WALL_H, FLOOR_WORLD_CONFIG).x
      addWallPart(
        this.group,
        new THREE.BoxGeometry(0.42, northH, 0.22),
        pilasterMat,
        px,
        northH / 2,
        wallZ + 0.06,
        false
      )
      addWallPart(
        this.group,
        new THREE.BoxGeometry(0.48, 0.12, 0.26),
        goldMat,
        px,
        northH - 0.16,
        wallZ + 0.07,
        false
      )
    }

    // West & East cutaway walls (low enough to never occlude Chibis, rich navy & gold trim)
    const sideH = 1.45
    const sideThick = SIDE * FLOOR_WORLD_CONFIG.scale // 0.375
    const sideDepth = floorDepth
    for (const side of [-1, 1] as const) {
      const sx = side * (roomW / 2 - sideThick / 2)
      addWallPart(
        this.group,
        new THREE.BoxGeometry(sideThick, sideH, sideDepth),
        navyTrimMat,
        sx,
        sideH / 2,
        floorCenterZ,
        false
      )
      addWallPart(
        this.group,
        new THREE.BoxGeometry(sideThick + 0.08, 0.09, sideDepth + 0.08),
        goldMat,
        sx,
        sideH + 0.04,
        floorCenterZ,
        false
      )
    }

    // South cutaway wall with grand entrance door frame (936..1112)
    const southH = 0.42
    const leftSpanW = 936 * FLOOR_WORLD_CONFIG.scale
    const rightSpanW = (WORLD_W - 1112) * FLOOR_WORLD_CONFIG.scale
    const leftX = -roomW / 2 + leftSpanW / 2
    const rightX = roomW / 2 - rightSpanW / 2
    const southWallZ = southZ - sideThick / 2

    for (const [cx, spanW] of [
      [leftX, leftSpanW],
      [rightX, rightSpanW],
    ] as const) {
      addWallPart(
        this.group,
        new THREE.BoxGeometry(spanW, southH, sideThick),
        navyTrimMat,
        cx,
        southH / 2,
        southWallZ,
        false
      )
      addWallPart(
        this.group,
        new THREE.BoxGeometry(spanW + 0.04, 0.07, sideThick + 0.06),
        goldMat,
        cx,
        southH + 0.03,
        southWallZ,
        false
      )
    }

    // Entrance threshold & twin golden entry bollards at x=936 and x=1112
    const doorW = (1112 - 936) * FLOOR_WORLD_CONFIG.scale
    addWallPart(
      this.group,
      new THREE.BoxGeometry(doorW, 0.05, sideThick + 0.06),
      darkTrimMat,
      0,
      0.025,
      southWallZ,
      false
    )
    for (const lx of [936, 1112]) {
      const dx = logicalToWorld(lx, WORLD_H, FLOOR_WORLD_CONFIG).x
      addWallPart(
        this.group,
        new THREE.BoxGeometry(0.24, 0.92, sideThick + 0.1),
        navyTrimMat,
        dx,
        0.46,
        southWallZ,
        false
      )
      addWallPart(
        this.group,
        new THREE.BoxGeometry(0.3, 0.1, sideThick + 0.14),
        goldMat,
        dx,
        0.95,
        southWallZ,
        false
      )
    }
  }

  private buildZoneDecals(): void {
    for (const label of ZONE_LABELS) {
      const tex = createFloorDecalTexture(label.text, "#7a5324")
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.62,
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

  private placeFurniture(p: Placement): void {
    const s = FLOOR_WORLD_CONFIG.scale
    let prop: DisposableProp | null = null
    let centerY = p.foot ? p.y - p.foot[1] / 2 : p.y - p.h / 2

    if (p.id === "offering") {
      prop = createOfferingAltar(3.05, 1.05)
      centerY = p.y - (p.foot ? p.foot[1] / 2 : 35)
    } else if (p.id === "rug") {
      prop = createRug(p.w * s, p.h * s, {
        shape: "oval",
        colorHex: "#efe2cc",
        borderHex: "#243760",
        borderWidth: 0.22,
      })
      centerY = 790
    } else if (p.id === "rug-fame") {
      prop = createRug(p.w * s, p.h * s, {
        shape: "rounded",
        colorHex: "#f2e5ce",
        borderHex: "#9b1c26",
        borderWidth: 0.26,
      })
      centerY = 885
    } else if (p.id === "sofa") {
      prop = createSofa(p.w * s, 1.15, "#23395d")
    } else if (p.id === "coffee-table") {
      prop = createCoffeeTable(p.w * s, 0.92)
    } else if (p.id === "pantry") {
      prop = createPantryCounter(p.w * s, 0.92)
    } else if (p.id === "reception") {
      prop = createReceptionDesk(p.w * s, 0.86)
    } else if (p.placeholder === "plant" || p.art === "plant_tall") {
      prop = createPottedPlant("tall")
    } else if (p.placeholder === "plant-small" || p.art === "plant_small") {
      prop = createPottedPlant("small")
    }

    if (!prop) return
    const pt = logicalToWorld(p.x, centerY, FLOOR_WORLD_CONFIG)
    prop.group.position.set(pt.x, 0, pt.z)
    this.group.add(prop.group)
    this.props.push(prop)

    if (p.interact) {
      this.registerHotspot(prop.group, p.interact, p.y)
    }
  }

  private buildStatues(overlay: OverlayLayer): void {
    const podiumHeights: Readonly<Record<1 | 2 | 3, number>> = {
      1: 0.77,
      2: 0.61,
      3: 0.53,
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
    const rig = createChibiCharacter({
      avatarId,
      statueRank: filled ? slot.rank : "empty",
      scale: slot.rank === 1 ? 1.08 : 0.96,
    })
    rig.root.position.set(0, slot.podiumTopY, 0)
    slot.hitGroup.add(rig.root)
    slot.rig = rig
    slot.rigAvatar = avatarId
    slot.rigFilled = filled
  }

  /** Repaints the VN30 10×3 LED wall board canvas texture. */
  updateMarket(
    indices: readonly IndexQuote[] | null,
    vn30: readonly Quote[] | null
  ): void {
    if (this.disposed) return
    drawLedMarketBoard(this.ledCanvas, indices, vn30)
    this.ledBoard.update()
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
    this.deityWaveUntilS = Math.max(this.deityWaveUntilS, elapsedS + 2.3)
    this.shrinePulseS = 0.65
    const burst = 18 + Math.max(1, Math.min(5, luck)) * 8
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
        1.2 + Math.random() * 1.0,
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

    // 1. Animate Thần Tài NPC & shrine light
    const waving = elapsedS < this.deityWaveUntilS
    this.deityRig.update(dt, {
      anim: waving ? "wave" : "idle",
      facingRad: facingToRadians("s"),
      animTime: elapsedS,
    })

    if (this.shrinePulseS > 0) {
      this.shrinePulseS = Math.max(0, this.shrinePulseS - dt)
    }
    const pulseBoost = Math.sin((this.shrinePulseS / 0.65) * Math.PI) * 2.4
    this.shrineLight.intensity =
      2.3 + Math.sin(elapsedS * 2.4) * 0.35 + Math.max(0, pulseBoost)

    // Continuous rising shrine gold sparkles
    this.shrineSparkAccum += dt
    if (this.shrineSparkAccum >= 0.24) {
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
      animTime: elapsedS + 1.3,
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
        animTime: elapsedS + slot.rank * 0.7,
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
