/**
 * Procedural Cute & Crisp Chibi 3D World for Khu Văn phòng.
 *
 * 100% procedural Three.js built on `frontend/src/lib/chibi-3d/` (zero .webp or external models):
 * - 4 distinct floor zones (`parquet`, `carpet_slate`, `stone_sand`, `ceramic_cream`) + floor decals
 * - Cutaway architectural walls with 3 open doorways (`y = 540`) & glass corridor accents
 * - Phòng Sếp (dual-monitor walnut desk, bookshelf, guest sofa, 2 plants)
 * - Phòng Họp (live Wall Screen, pill conference table + 8 swivel chairs, 2 plants)
 * - Phòng Tài Liệu (3 north + 1 east bookshelves, reading desk)
 * - Khu Nhân Viên (dynamic staff desks with swivel chairs & gold self-nameplate, Coffee Corner,
 *   Lounge oval rug + sofa, 5 plants, and freestanding Gold-Trimmed Achievement Standee)
 * - Glowing golden click-to-move destination ring
 */
import * as THREE from "three"

import {
  createAchievementStandee,
  createBookshelf,
  createConferenceTable,
  createOfficeDesk,
  createPantryCounter,
  createPottedPlant,
  createRug,
  createSofa,
  createWallBoardFrame,
  type DisposableProp,
  type LiveBoardProp,
} from "@/lib/chibi-3d/furniture-builder.ts"
import {
  createFloorDecalTexture,
  createFloorTexture,
  drawOfficeMeetingScreen,
  drawOfficeStandee,
} from "@/lib/chibi-3d/textures.ts"
import {
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  disposeObject3D,
  logicalToWorld,
  type OfficeStandeeEntry,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

import type { OfficeLeaderboard, OfficeMeeting } from "../types.ts"
import { formatMeetingScheduleVi } from "../utils.ts"
import {
  OFFICE_BASE_W,
  OFFICE_DIVIDER_Y,
  OFFICE_DOORWAYS,
  OFFICE_WALL_THICK,
  OFFICE_WORLD_SCALE,
  getLoungePositions,
  getOfficePlants,
  getOfficeZones,
  type OfficeDeskPlacement,
} from "./office-layout.ts"

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

function addWallBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  cast = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = cast
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

export class OfficeWorld3D {
  readonly group: THREE.Group
  private readonly world: WorldTransformConfig
  private readonly archGroup: THREE.Group
  private readonly teamPropsGroup: THREE.Group
  private readonly staticProps: DisposableProp[] = []
  private readonly teamProps: DisposableProp[] = []

  private readonly meetingCanvas: HTMLCanvasElement
  private readonly standeeCanvas: HTMLCanvasElement
  private readonly meetingBoard: LiveBoardProp
  private readonly standeeBoard: LiveBoardProp

  private readonly targetRing: THREE.Mesh
  private readonly targetRingMat: THREE.MeshStandardMaterial
  private targetRingAge = 1
  private targetRingActive = false

  private currentWorldH: number
  private disposed = false

  constructor(scene: THREE.Scene, world: WorldTransformConfig) {
    this.world = world
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
    this.meetingBoard = createWallBoardFrame(
      3.2,
      0.96,
      this.meetingCanvas,
      "#e9b949"
    )
    const meetScreenPt = logicalToWorld(1160, 26, this.world)
    this.meetingBoard.group.position.set(meetScreenPt.x, 1.56, meetScreenPt.z)
    this.group.add(this.meetingBoard.group)

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
    this.standeeBoard = createAchievementStandee(this.standeeCanvas, 2.3, 3.65)
    const standeePt = logicalToWorld(2195, 1066, this.world)
    this.standeeBoard.group.position.set(standeePt.x, 0, standeePt.z)
    this.group.add(this.standeeBoard.group)

    // Golden click-to-move destination ring
    this.targetRingMat = createGlowMaterial("#f6d27a", 1.1, 0)
    this.targetRingMat.side = THREE.DoubleSide
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, 28),
      this.targetRingMat
    )
    this.targetRing.rotation.x = -Math.PI / 2
    this.targetRing.position.set(0, 0.03, 0)
    this.targetRing.visible = false
    this.group.add(this.targetRing)

    this.buildArchitectureAndStaticProps(this.currentWorldH)
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
  }

  private buildArchitectureAndStaticProps(worldH: number): void {
    this.clearStaticProps()
    const s = OFFICE_WORLD_SCALE
    const zones = getOfficeZones(worldH)

    // 1. Exterior architectural studio surround apron (+24u beyond all 4 walls) + framing plinth
    const staffFloorW = OFFICE_BASE_W * s
    const staffFloorH = worldH * s
    const staffFloorCenter = this.toWorldCenter(0, 0, OFFICE_BASE_W, worldH)
    const surroundApron = new THREE.Mesh(
      new THREE.PlaneGeometry(staffFloorW + 48, staffFloorH + 48),
      createMatteMaterial("#141D32", { roughness: 0.92 })
    )
    surroundApron.rotation.x = -Math.PI / 2
    surroundApron.position.set(staffFloorCenter.x, -0.05, staffFloorCenter.z)
    this.archGroup.add(surroundApron)

    const outerTrimMat = createMatteMaterial("#2A3D63", { roughness: 0.72 })
    const plinthMat = createMatteMaterial("#1B2846", { roughness: 0.78 })
    addWallBox(
      this.archGroup,
      staffFloorW + 1.08,
      0.014,
      staffFloorH + 1.08,
      outerTrimMat,
      staffFloorCenter.x,
      -0.042,
      staffFloorCenter.z,
      false
    )
    addWallBox(
      this.archGroup,
      staffFloorW + 0.92,
      0.04,
      staffFloorH + 0.92,
      plinthMat,
      staffFloorCenter.x,
      -0.025,
      staffFloorCenter.z,
      false
    )

    // 1b. Base Khu Nhân Viên floor (cream ceramic grid)
    const ceramicTex = cloneRepeatedTexture(
      createFloorTexture("ceramic_cream"),
      OFFICE_BASE_W / 256,
      worldH / 256
    )
    const baseFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(staffFloorW, staffFloorH),
      new THREE.MeshStandardMaterial({
        map: ceramicTex,
        roughness: 0.52,
        metalness: 0.04,
      })
    )
    baseFloor.rotation.x = -Math.PI / 2
    baseFloor.position.set(staffFloorCenter.x, 0, staffFloorCenter.z)
    baseFloor.receiveShadow = true
    this.archGroup.add(baseFloor)

    // 2. Three upper room floors (parquet, slate carpet, warm sand tiles)
    const roomMaterials: Record<
      "boss" | "meet" | "docs",
      { style: "parquet" | "carpet_slate" | "stone_sand"; rough: number; tilePx: number }
    > = {
      boss: { style: "parquet", rough: 0.48, tilePx: 220 },
      meet: { style: "carpet_slate", rough: 0.85, tilePx: 180 },
      docs: { style: "stone_sand", rough: 0.62, tilePx: 192 },
    }

    for (const zone of zones) {
      if (zone.id === "staff") continue
      const cfg = roomMaterials[zone.id]
      const tex = cloneRepeatedTexture(
        createFloorTexture(cfg.style),
        zone.w / cfg.tilePx,
        zone.h / cfg.tilePx
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
      plane.position.set(pt.x, 0.008, pt.z)
      plane.receiveShadow = true
      this.archGroup.add(plane)
    }

    // 3. Crisp Floor Zone Decals
    const decals: readonly {
      text: string
      x: number
      y: number
      w: number
      h: number
      color: string
    }[] = [
      { text: "PHÒNG SẾP", x: 185, y: 486, w: 2.8, h: 0.7, color: "rgba(255,250,240,0.72)" },
      { text: "PHÒNG HỌP", x: 935, y: 486, w: 2.8, h: 0.7, color: "rgba(255,255,255,0.68)" },
      { text: "PHÒNG TÀI LIỆU", x: 1755, y: 486, w: 3.4, h: 0.72, color: "rgba(92,62,24,0.65)" },
      { text: "KHU NHÂN VIÊN", x: 245, y: 616, w: 3.4, h: 0.75, color: "rgba(120,80,30,0.52)" },
      { text: "GÓC CÀ PHÊ", x: 1945, y: 604, w: 2.1, h: 0.5, color: "rgba(110,72,26,0.62)" },
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
      mesh.position.set(pt.x, 0.016, pt.z)
      this.archGroup.add(mesh)
    }

    // 4. Cutaway Architectural Walls
    const wallMat = createMatteMaterial("#263554", { roughness: 0.52 })
    const wallUpperMat = createMatteMaterial("#e8dfd1", { roughness: 0.68 })
    const woodTrimMat = createMatteMaterial("#7a5230", { roughness: 0.56 })
    const goldMat = createMetalMaterial("#e9b949", {
      roughness: 0.28,
      metalness: 0.8,
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: "#a8d4f8",
      transparent: true,
      opacity: 0.28,
      roughness: 0.14,
      metalness: 0.12,
    })

    const t = OFFICE_WALL_THICK * s // 0.16u
    const northH = 2.6
    const sideH = 2.0
    const innerH = 1.8
    const southH = 0.32

    // North outer wall (2.6u tall, warm cream upper + navy dado + gold rail)
    const northPt = this.toWorldCenter(0, 0, OFFICE_BASE_W, OFFICE_WALL_THICK)
    addWallBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      northH,
      t,
      wallUpperMat,
      northPt.x,
      northH / 2,
      northPt.z,
      false
    )
    addWallBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      0.78,
      t + 0.04,
      wallMat,
      northPt.x,
      0.39,
      northPt.z,
      false
    )
    addWallBox(
      this.archGroup,
      OFFICE_BASE_W * s + 0.08,
      0.07,
      t + 0.08,
      goldMat,
      northPt.x,
      northH + 0.02,
      northPt.z,
      false
    )

    // West & East outer walls (2.0u cutaway)
    const westPt = this.toWorldCenter(0, 0, OFFICE_WALL_THICK, worldH)
    const eastPt = this.toWorldCenter(
      OFFICE_BASE_W - OFFICE_WALL_THICK,
      0,
      OFFICE_WALL_THICK,
      worldH
    )
    for (const pt of [westPt, eastPt]) {
      addWallBox(
        this.archGroup,
        t,
        sideH,
        worldH * s,
        wallMat,
        pt.x,
        sideH / 2,
        pt.z,
        false
      )
      addWallBox(
        this.archGroup,
        t + 0.06,
        0.06,
        worldH * s,
        goldMat,
        pt.x,
        sideH + 0.02,
        pt.z,
        false
      )
    }

    // Low South cutaway curb (0.32u) so camera never occludes avatars
    const southPt = this.toWorldCenter(
      0,
      worldH - OFFICE_WALL_THICK,
      OFFICE_BASE_W,
      OFFICE_WALL_THICK
    )
    addWallBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      southH,
      t,
      wallMat,
      southPt.x,
      southH / 2,
      southPt.z,
      false
    )
    addWallBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      0.045,
      t + 0.05,
      goldMat,
      southPt.x,
      southH + 0.02,
      southPt.z,
      false
    )

    // Vertical interior room dividers (x = 740 and x = 1560)
    for (const vx of [740, 1560]) {
      const pt = this.toWorldCenter(vx, 16, OFFICE_WALL_THICK, 524)
      addWallBox(
        this.archGroup,
        t,
        innerH,
        524 * s,
        wallMat,
        pt.x,
        innerH / 2,
        pt.z
      )
      addWallBox(
        this.archGroup,
        t + 0.05,
        0.055,
        524 * s,
        goldMat,
        pt.x,
        innerH + 0.02,
        pt.z,
        false
      )
    }

    // Horizontal corridor divider at y = 540 (4 solid segments around 3 doorways)
    const corridorSegments: readonly [number, number][] = [
      [16, 304],
      [450, 640],
      [1230, 680],
      [2040, 344],
    ]
    for (const [sx, sw] of corridorSegments) {
      const pt = this.toWorldCenter(sx, OFFICE_DIVIDER_Y, sw, OFFICE_WALL_THICK)
      // Lower navy wainscoting (0.95u) + modern glass office window band (0.75u) + top rail
      addWallBox(
        this.archGroup,
        sw * s,
        0.95,
        t,
        wallMat,
        pt.x,
        0.475,
        pt.z
      )
      addWallBox(
        this.archGroup,
        sw * s,
        0.76,
        t * 0.45,
        glassMat,
        pt.x,
        0.95 + 0.38,
        pt.z,
        false
      )
      addWallBox(
        this.archGroup,
        sw * s,
        0.09,
        t + 0.04,
        wallMat,
        pt.x,
        innerH - 0.045,
        pt.z,
        false
      )
      addWallBox(
        this.archGroup,
        sw * s,
        0.045,
        t + 0.06,
        goldMat,
        pt.x,
        innerH + 0.02,
        pt.z,
        false
      )
    }

    // Doorway jambs & low floor threshold strips for all 3 doorways
    for (const door of OFFICE_DOORWAYS) {
      for (const edgeX of [door.x1, door.x2]) {
        const jambPt = logicalToWorld(edgeX, door.y + OFFICE_WALL_THICK / 2, this.world)
        addWallBox(
          this.archGroup,
          0.09,
          innerH + 0.04,
          t + 0.08,
          woodTrimMat,
          jambPt.x,
          (innerH + 0.04) / 2,
          jambPt.z
        )
      }
      const threshPt = this.toWorldCenter(
        door.x1,
        door.y,
        door.x2 - door.x1,
        OFFICE_WALL_THICK
      )
      addWallBox(
        this.archGroup,
        (door.x2 - door.x1) * s,
        0.022,
        t + 0.04,
        goldMat,
        threshPt.x,
        0.011,
        threshPt.z,
        false
      )
    }

    // 5. Static Furniture Props across all 4 zones

    // Phòng Sếp: Bookshelf + Guest Sofa + Warm Accent Light
    const bossShelf = createBookshelf(2.0, 1.82, 0.46)
    const bossShelfPt = this.toWorldCenter(40, 40, 200, 46)
    bossShelf.group.position.set(bossShelfPt.x, 0, bossShelfPt.z)
    this.mountStaticProp(bossShelf)

    const bossSofa = createSofa(1.5, 0.7, "#24365e")
    const bossSofaPt = this.toWorldCenter(560, 330, 150, 70)
    bossSofa.group.position.set(bossSofaPt.x, 0, bossSofaPt.z)
    this.mountStaticProp(bossSofa)

    const bossLamp = new THREE.PointLight(0xffe7bd, 1.25, 10, 1.5)
    const bossLightPt = logicalToWorld(440, 230, this.world)
    bossLamp.position.set(bossLightPt.x, 3.2, bossLightPt.z)
    this.archGroup.add(bossLamp)

    // Phòng Họp: Pill Conference Table + 8 Swivel Chairs
    const confTable = createConferenceTable(4.2, 1.5, 8)
    const confPt = this.toWorldCenter(948, 200, 420, 150)
    confTable.group.position.set(confPt.x, 0, confPt.z)
    this.mountStaticProp(confTable)

    // Phòng Tài Liệu: 3 North Bookshelves + 1 East Bookshelf + Reading Desk
    for (const bx of [1610, 1860, 2110]) {
      const shelf = createBookshelf(2.2, 1.88, 0.6)
      const pt = this.toWorldCenter(bx, 40, 220, 60)
      shelf.group.position.set(pt.x, 0, pt.z)
      this.mountStaticProp(shelf)
    }
    const eastShelf = createBookshelf(2.4, 1.88, 0.6)
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
    })
    const readPt = this.toWorldCenter(1840, 240, 200, 90)
    readingDesk.group.position.set(readPt.x, 0, readPt.z)
    this.mountStaticProp(readingDesk)

    // Góc Cà Phê: Pantry Counter + Metallic Espresso Machine + Warm Cafe Light
    const coffeeBar = createPantryCounter(1.7, 0.6)
    const coffeePt = this.toWorldCenter(1860, 640, 170, 60)
    coffeeBar.group.position.set(coffeePt.x, 0, coffeePt.z)
    this.mountStaticProp(coffeeBar)

    const cafeLamp = new THREE.PointLight(0xffdfb0, 1.0, 8, 1.6)
    cafeLamp.position.set(coffeePt.x, 2.8, coffeePt.z + 0.4)
    this.archGroup.add(cafeLamp)

    // Lounge: Cream Oval Rug w/ Navy Border + Deep Navy Sofa
    const lounge = getLoungePositions(worldH)
    const rug = createRug(lounge.rug.w * s, lounge.rug.h * s, {
      shape: "oval",
      colorHex: "#f1e6d2",
      borderHex: "#22325a",
      borderWidth: 0.14,
    })
    const rugPt = this.toWorldCenter(
      lounge.rug.x,
      lounge.rug.y,
      lounge.rug.w,
      lounge.rug.h
    )
    rug.group.position.set(rugPt.x, 0, rugPt.z)
    this.mountStaticProp(rug)

    const loungeSofa = createSofa(lounge.sofa.w * s, lounge.sofa.h * s, "#24365e")
    const sofaPt = this.toWorldCenter(
      lounge.sofa.x,
      lounge.sofa.y,
      lounge.sofa.w,
      lounge.sofa.h
    )
    loungeSofa.group.position.set(sofaPt.x, 0, sofaPt.z)
    this.mountStaticProp(loungeSofa)

    // All 9 Potted Plants across rooms
    for (const plantSpec of getOfficePlants(worldH)) {
      const plant = createPottedPlant(plantSpec.tall ? "tall" : "small")
      const pt = logicalToWorld(plantSpec.x + 28, plantSpec.y + 52, this.world)
      plant.group.position.set(pt.x, 0, pt.z)
      this.mountStaticProp(plant)
    }
  }

  private mountStaticProp(prop: DisposableProp): void {
    this.archGroup.add(prop.group)
    this.staticProps.push(prop)
  }

  /** Rebuilds Boss Desk + Staff Desks (and expands architecture if `worldH` grew for >12 staff). */
  rebuildTeamProps(
    bossName: string,
    desks: readonly OfficeDeskPlacement[],
    selfUserId: string | null,
    worldH: number
  ): void {
    if (this.disposed) return

    if (worldH !== this.currentWorldH) {
      this.currentWorldH = worldH
      this.world.logicalH = worldH
      const meetScreenPt = logicalToWorld(1160, 26, this.world)
      this.meetingBoard.group.position.set(meetScreenPt.x, 1.56, meetScreenPt.z)
      const standeePt = logicalToWorld(2195, 1066, this.world)
      this.standeeBoard.group.position.set(standeePt.x, 0, standeePt.z)
      this.buildArchitectureAndStaticProps(worldH)
    }

    for (const prop of this.teamProps) {
      prop.dispose()
    }
    this.teamProps.length = 0
    while (this.teamPropsGroup.children.length > 0) {
      const child = this.teamPropsGroup.children[0]
      if (!child) break
      this.teamPropsGroup.remove(child)
    }

    // Boss Desk with dual monitors, coffee mug, swivel chair & walnut nameplate
    const bossLabel = bossName.trim() ? `Bàn sếp · ${bossName.trim()}` : "Bàn sếp"
    const bossDesk = createOfficeDesk({
      variant: "boss",
      width: 2.8,
      depth: 1.0,
      dualMonitor: true,
      hasMug: true,
      withChair: true,
      nameplate: bossLabel,
      highlightGold: false,
    })
    const bossPt = this.toWorldCenter(300, 180, 280, 100)
    bossDesk.group.position.set(bossPt.x, 0, bossPt.z)
    this.teamPropsGroup.add(bossDesk.group)
    this.teamProps.push(bossDesk)

    // Staff Desks with ergonomic swivel chairs & gold highlight on self's desk
    const s = OFFICE_WORLD_SCALE
    for (const desk of desks) {
      const staffDesk = createOfficeDesk({
        variant: "staff",
        width: desk.w * s,
        depth: desk.h * s,
        dualMonitor: false,
        hasMug: desk.hasMug,
        withChair: true,
        nameplate: desk.displayName,
        highlightGold: Boolean(selfUserId && desk.userId === selfUserId),
      })
      const pt = this.toWorldCenter(desk.x, desk.y, desk.w, desk.h)
      staffDesk.group.position.set(pt.x, 0, pt.z)
      this.teamPropsGroup.add(staffDesk.group)
      this.teamProps.push(staffDesk)
    }
  }

  /** Repaints the live Meeting Room Wall Screen canvas texture. */
  updateMeetingScreen(meeting: OfficeMeeting | null): void {
    if (this.disposed) return
    if (!meeting) {
      drawOfficeMeetingScreen(
        this.meetingCanvas,
        "Phòng họp nhóm",
        "Chưa có lịch họp sắp tới"
      )
    } else {
      drawOfficeMeetingScreen(
        this.meetingCanvas,
        meeting.title,
        formatMeetingScheduleVi(
          meeting.startsAt,
          meeting.durationMinutes,
          meeting.platform
        )
      )
    }
    this.meetingBoard.update()
  }

  /** Repaints the live Freestanding Achievement Standee canvas texture. */
  updateStandee(
    leaderboard: OfficeLeaderboard | null,
    fallbackTeamName: string,
    isStaff: boolean
  ): void {
    if (this.disposed) return
    if (!leaderboard) {
      drawOfficeStandee(this.standeeCanvas, {
        teamTitle: fallbackTeamName
          ? `IQX · ${fallbackTeamName.toUpperCase()}`
          : "IQX · VĂN PHÒNG",
        monthLabel: "Thành tích tháng",
        top3: [],
        emptyText: "Chưa có ai ghi điểm tháng này",
        footerText: "Reset ngày 01 hằng tháng",
      })
      this.standeeBoard.update()
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

    drawOfficeStandee(this.standeeCanvas, {
      teamTitle: `IQX · ${(leaderboard.teamName || fallbackTeamName).toUpperCase()}`,
      monthLabel: `Thành tích tháng ${leaderboard.monthNumber}`,
      subtitle: "Top 3 điểm nhiệm vụ",
      top3,
      personalRank,
      emptyText: "Chưa có ai ghi điểm tháng này",
      footerText: "Reset ngày 01 hằng tháng",
    })
    this.standeeBoard.update()
  }

  /** Triggers the golden pulsing destination ring on click/tap-to-move. */
  showTargetRing(lx: number, ly: number): void {
    if (this.disposed) return
    const pt = logicalToWorld(lx, ly, this.world)
    this.targetRing.position.set(pt.x, 0.03, pt.z)
    this.targetRing.scale.setScalar(0.5)
    this.targetRingMat.opacity = 0.95
    this.targetRing.visible = true
    this.targetRingAge = 0
    this.targetRingActive = true
  }

  update(dt: number): void {
    if (!this.targetRingActive || this.disposed) return
    this.targetRingAge += dt
    const duration = 0.6
    if (this.targetRingAge >= duration) {
      this.targetRingActive = false
      this.targetRing.visible = false
      this.targetRingMat.opacity = 0
      return
    }
    const t = this.targetRingAge / duration
    const ease = 1 - (1 - t) * (1 - t)
    this.targetRing.scale.setScalar(0.45 + ease * 1.15)
    this.targetRingMat.opacity = Math.max(0, (1 - t) * 0.95)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearStaticProps()
    for (const prop of this.teamProps) {
      prop.dispose()
    }
    this.teamProps.length = 0
    this.meetingBoard.dispose()
    this.standeeBoard.dispose()
    disposeObject3D(this.group)
  }
}
