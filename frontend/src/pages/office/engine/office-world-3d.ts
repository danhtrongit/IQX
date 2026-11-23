/**
 * Procedural Cute & Crisp Chibi 3D World for Khu Văn phòng.
 *
 * 100% procedural Three.js built on `frontend/src/lib/chibi-3d/` (zero external models/images):
 * - 4 distinct floor zones (`parquet`, `carpet_slate`, `stone_sand`, `ceramic_cream`),
 *   per-zone rugs, corridor runner, VIP standee carpet & floor decals
 * - Cutaway architectural walls with baseboards, navy wainscoting, gold chair/crown rails,
 *   pilasters, sunlit windows with light pools, ceiling light coves & wall sconces
 * - Framed glass partitions (corridor + interior dividers) with metallic mullions, privacy
 *   frosting bands, and open wooden/glass doorway doors with brass hardware & room plaques
 * - Phòng Sếp (dual-monitor walnut desk, bookshelf, sofa, executive rug, wall frames,
 *   standing floor lamp, trophy shelf)
 * - Phòng Họp (live Wall Screen w/ acoustic slat backdrop & AV credenza, pill conference
 *   table + 8 chairs w/ notebooks & speakerphone, wall whiteboard, meeting rug)
 * - Phòng Tài Liệu (3 north + 1 east bookshelves, reading desk w/ brass banker's lamp &
 *   archive binders, library step-stool, archive wall plaque, documents rug)
 * - Khu Nhân Viên (dynamic staff desks w/ gold self-nameplate, work mat, lounge sofa +
 *   coffee table + oval rug, wall posters, Coffee Corner w/ pantry counter, espresso,
 *   water cooler, bistro table + stools, Cafe menu chalkboard & Achievement Standee)
 * - Click-to-move golden target ring (respects `prefers-reduced-motion`)
 */
import * as THREE from "three"

import {
  createAchievementStandee,
  createBookshelf,
  createCoffeeTable,
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
  createSignTexture,
  drawOfficeMeetingScreen,
  drawOfficeStandee,
  safeGet2DContext,
} from "@/lib/chibi-3d/textures.ts"
import {
  createClothMaterial,
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
  OFFICE_COFFEE_COOLER_RECT,
  OFFICE_COFFEE_TABLE_RECT,
  OFFICE_DIVIDER_Y,
  OFFICE_DOORWAYS,
  OFFICE_WALL_THICK,
  OFFICE_WORLD_SCALE,
  getLoungePositions,
  getOfficePlants,
  getOfficeWindows,
  getOfficeZones,
  getZoneRugs,
  prefersReducedMotion,
  type OfficeDeskPlacement,
} from "./office-layout.ts"

const FONT_STACK =
  '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

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

function addBox(
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

function createCanvasTextureSafe(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
): THREE.Texture {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = safeGet2DContext(canvas)
  if (ctx) {
    draw(ctx, w, h)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
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

    // Subtle grid lines
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

    // Header bar
    ctx.fillStyle = "#16244a"
    ctx.font = `800 18px ${FONT_STACK}`
    ctx.fillText("KẾ HOẠCH TUẦN · KPI", 22, 34)

    // Mini bullish line chart
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

    // Accent bar chart markers
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

    // Sticky note accents on board
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

function createArtFrameTexture(variant: "chart" | "crest" | "mountain"): THREE.Texture {
  return createCanvasTextureSafe(256, 192, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    if (variant === "crest") {
      grad.addColorStop(0, "#142244")
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
      ctx.font = `900 44px ${FONT_STACK}`
      ctx.fillText("IQX", w / 2, h * 0.44)
      ctx.fillStyle = "#c9d6e4"
      ctx.font = `700 16px ${FONT_STACK}`
      ctx.fillText("CHỨNG NHẬN XUẤT SẮC", w / 2, h * 0.74)
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
      ctx.moveTo(26, 148)
      ctx.lineTo(74, 128)
      ctx.lineTo(118, 134)
      ctx.lineTo(164, 86)
      ctx.lineTo(226, 48)
      ctx.stroke()
      ctx.fillStyle = "#f6d27a"
      ctx.beginPath()
      ctx.arc(226, 48, 7, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Minimalist warm sunrise over stylized hills
      ctx.fillStyle = "#f59e0b"
      ctx.beginPath()
      ctx.arc(178, 62, 26, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#2b426d"
      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(76, 92)
      ctx.lineTo(156, h)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = "#1b2d52"
      ctx.beginPath()
      ctx.moveTo(96, h)
      ctx.lineTo(188, 102)
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()
    }
  })
}

export class OfficeWorld3D {
  readonly group: THREE.Group
  private readonly world: WorldTransformConfig
  private readonly lite: boolean
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
  private targetRingStatic = false

  private currentWorldH: number
  private disposed = false

  constructor(scene: THREE.Scene, world: WorldTransformConfig, lite = false) {
    this.world = world
    this.lite = lite
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
    this.meetingBoard.group.position.set(meetScreenPt.x, 1.58, meetScreenPt.z)
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
      new THREE.RingGeometry(0.16, 0.24, lite ? 18 : 28),
      this.targetRingMat
    )
    this.targetRing.rotation.x = -Math.PI / 2
    this.targetRing.position.set(0, 0.035, 0)
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
    addBox(
      this.archGroup,
      staffFloorW + 1.08,
      0.014,
      staffFloorH + 1.08,
      outerTrimMat,
      staffFloorCenter.x,
      -0.044,
      staffFloorCenter.z,
      false
    )
    addBox(
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
        roughness: 0.5,
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
      plane.position.set(pt.x, 0.006, pt.z)
      plane.receiveShadow = true
      this.archGroup.add(plane)
    }

    // 2b. Per-zone rugs & corridor runner (composed from furniture-builder.ts)
    for (const rugSpec of getZoneRugs(worldH)) {
      const rug = createRug(rugSpec.w * s, rugSpec.h * s, {
        shape: rugSpec.shape,
        colorHex: rugSpec.colorHex,
        borderHex: rugSpec.borderHex,
        borderWidth: rugSpec.borderWidth,
      })
      const pt = this.toWorldCenter(rugSpec.x, rugSpec.y, rugSpec.w, rugSpec.h)
      rug.group.position.set(pt.x, 0.008, pt.z)
      this.mountStaticProp(rug)
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
        y: 662,
        w: 3.2,
        h: 0.68,
        color: "rgba(110,72,28,0.58)",
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

    // 4. Cutaway Architectural Walls with Baseboards, Dado, Chair Rails & Crown Trims
    const t = OFFICE_WALL_THICK * s // 0.16u
    const northH = 2.68
    const sideH = 2.04
    const innerH = 1.84
    const southH = 0.34

    // North outer wall: warm cream upper + navy dado + baseboard + gold chair rail + crown cornice
    const northPt = this.toWorldCenter(0, 0, OFFICE_BASE_W, OFFICE_WALL_THICK)
    addBox(
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
    addBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      0.82,
      t + 0.04,
      wallNavyMat,
      northPt.x,
      0.41,
      northPt.z,
      false
    )
    addBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      0.14,
      t + 0.07,
      wallDarkBaseMat,
      northPt.x,
      0.07,
      northPt.z,
      false
    )
    addBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      0.05,
      t + 0.08,
      goldMat,
      northPt.x,
      0.84,
      northPt.z,
      false
    )
    addBox(
      this.archGroup,
      OFFICE_BASE_W * s + 0.1,
      0.14,
      t + 0.1,
      wallNavyMat,
      northPt.x,
      northH + 0.05,
      northPt.z,
      false
    )
    addBox(
      this.archGroup,
      OFFICE_BASE_W * s + 0.14,
      0.06,
      t + 0.12,
      goldMat,
      northPt.x,
      northH - 0.02,
      northPt.z,
      false
    )

    // Architectural pilasters along the North wall framing rooms cleanly
    for (const pxLogical of [24, 740, 1560, 2376]) {
      const px = logicalToWorld(pxLogical, OFFICE_WALL_THICK, this.world)
      addBox(
        this.archGroup,
        0.26,
        northH,
        0.16,
        pilasterMat,
        px.x,
        northH / 2,
        px.z + 0.04,
        false
      )
      addBox(
        this.archGroup,
        0.3,
        0.08,
        0.2,
        goldMat,
        px.x,
        northH - 0.14,
        px.z + 0.05,
        false
      )
    }

    // West & East cutaway walls with cream upper band, navy dado, baseboard & gold rails
    const westPt = this.toWorldCenter(0, 0, OFFICE_WALL_THICK, worldH)
    const eastPt = this.toWorldCenter(
      OFFICE_BASE_W - OFFICE_WALL_THICK,
      0,
      OFFICE_WALL_THICK,
      worldH
    )
    for (const pt of [westPt, eastPt]) {
      addBox(
        this.archGroup,
        t,
        sideH,
        worldH * s,
        wallUpperMat,
        pt.x,
        sideH / 2,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t + 0.04,
        0.82,
        worldH * s,
        wallNavyMat,
        pt.x,
        0.41,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t + 0.07,
        0.13,
        worldH * s,
        wallDarkBaseMat,
        pt.x,
        0.065,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t + 0.07,
        0.045,
        worldH * s,
        goldMat,
        pt.x,
        0.84,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t + 0.08,
        0.07,
        worldH * s,
        goldMat,
        pt.x,
        sideH + 0.03,
        pt.z,
        false
      )
    }

    // Low South cutaway curb so camera never occludes avatars
    const southPt = this.toWorldCenter(
      0,
      worldH - OFFICE_WALL_THICK,
      OFFICE_BASE_W,
      OFFICE_WALL_THICK
    )
    addBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      southH,
      t,
      wallNavyMat,
      southPt.x,
      southH / 2,
      southPt.z,
      false
    )
    addBox(
      this.archGroup,
      OFFICE_BASE_W * s,
      0.05,
      t + 0.06,
      goldMat,
      southPt.x,
      southH + 0.025,
      southPt.z,
      false
    )

    // 4b. Framed Glass Interior Dividers (vertical x = 740, 1560 & horizontal y = 540)
    const mullionGeo = new THREE.BoxGeometry(0.055, 0.84, t * 0.78)
    const verticalMullionGeo = new THREE.BoxGeometry(t * 0.78, 0.84, 0.055)

    // Vertical interior room dividers with framed upper glass band
    for (const vx of [740, 1560]) {
      const spanLen = 524 * s
      const pt = this.toWorldCenter(vx, 16, OFFICE_WALL_THICK, 524)
      addBox(this.archGroup, t, 0.92, spanLen, wallNavyMat, pt.x, 0.46, pt.z)
      addBox(
        this.archGroup,
        t + 0.05,
        0.11,
        spanLen,
        wallDarkBaseMat,
        pt.x,
        0.055,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t + 0.04,
        0.045,
        spanLen,
        woodTrimMat,
        pt.x,
        0.94,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t * 0.36,
        0.78,
        spanLen,
        glassMat,
        pt.x,
        1.35,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t * 0.4,
        0.16,
        spanLen,
        glassFrostMat,
        pt.x,
        1.32,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t + 0.04,
        0.08,
        spanLen,
        frameMetalMat,
        pt.x,
        innerH - 0.04,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        t + 0.06,
        0.045,
        spanLen,
        goldMat,
        pt.x,
        innerH + 0.02,
        pt.z,
        false
      )
      // Vertical glass partition frames (mullions)
      const frameCount = 4
      for (let i = 0; i <= frameCount; i += 1) {
        const mz = pt.z - spanLen / 2 + 0.08 + (i * (spanLen - 0.16)) / frameCount
        const mullion = new THREE.Mesh(verticalMullionGeo, frameMetalMat)
        mullion.position.set(pt.x, 1.36, mz)
        mullion.castShadow = false
        mullion.receiveShadow = true
        this.archGroup.add(mullion)
      }
    }

    // Horizontal corridor glass partition at y = 540 (4 solid segments around 3 doorways)
    const corridorSegments: readonly [number, number][] = [
      [16, 304],
      [450, 640],
      [1230, 680],
      [2040, 344],
    ]
    for (const [sx, sw] of corridorSegments) {
      const segW = sw * s
      const pt = this.toWorldCenter(sx, OFFICE_DIVIDER_Y, sw, OFFICE_WALL_THICK)
      addBox(this.archGroup, segW, 0.92, t, wallNavyMat, pt.x, 0.46, pt.z)
      addBox(
        this.archGroup,
        segW,
        0.11,
        t + 0.05,
        wallDarkBaseMat,
        pt.x,
        0.055,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        segW,
        0.045,
        t + 0.05,
        woodTrimMat,
        pt.x,
        0.94,
        pt.z,
        false
      )
      // Framed glass band + frosted executive privacy stripe
      addBox(
        this.archGroup,
        segW,
        0.78,
        t * 0.36,
        glassMat,
        pt.x,
        1.35,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        segW,
        0.18,
        t * 0.42,
        glassFrostMat,
        pt.x,
        1.32,
        pt.z,
        false
      )
      // Top frame rail + gold cap
      addBox(
        this.archGroup,
        segW,
        0.085,
        t + 0.04,
        frameMetalMat,
        pt.x,
        innerH - 0.04,
        pt.z,
        false
      )
      addBox(
        this.archGroup,
        segW,
        0.045,
        t + 0.06,
        goldMat,
        pt.x,
        innerH + 0.02,
        pt.z,
        false
      )
      // Metallic glass mullions along segment
      const bays = Math.max(2, Math.round(segW / 1.55))
      for (let i = 0; i <= bays; i += 1) {
        const mx = pt.x - segW / 2 + 0.06 + (i * (segW - 0.12)) / bays
        const mullion = new THREE.Mesh(mullionGeo, frameMetalMat)
        mullion.position.set(mx, 1.36, pt.z)
        mullion.castShadow = false
        mullion.receiveShadow = true
        this.archGroup.add(mullion)
      }
    }

    // 4c. Doorway Frames, Thresholds, Swung-Open Wood/Glass Doors & Room Plaques
    const doorNames: Record<"boss" | "meet" | "docs", string> = {
      boss: "PHÒNG SẾP",
      meet: "PHÒNG HỌP",
      docs: "PHÒNG TÀI LIỆU",
    }
    for (const door of OFFICE_DOORWAYS) {
      const doorW = (door.x2 - door.x1) * s
      for (const edgeX of [door.x1, door.x2]) {
        const jambPt = logicalToWorld(
          edgeX,
          door.y + OFFICE_WALL_THICK / 2,
          this.world
        )
        addBox(
          this.archGroup,
          0.1,
          innerH + 0.06,
          t + 0.1,
          woodTrimMat,
          jambPt.x,
          (innerH + 0.06) / 2,
          jambPt.z
        )
        addBox(
          this.archGroup,
          0.12,
          0.06,
          t + 0.12,
          goldMat,
          jambPt.x,
          innerH + 0.06,
          jambPt.z,
          false
        )
      }

      // Low gold threshold strip
      const threshPt = this.toWorldCenter(
        door.x1,
        door.y,
        door.x2 - door.x1,
        OFFICE_WALL_THICK
      )
      addBox(
        this.archGroup,
        doorW,
        0.022,
        t + 0.06,
        goldMat,
        threshPt.x,
        0.011,
        threshPt.z,
        false
      )

      // Open wood & glass door leaf swung 78° inward on the right jamb (100% passable)
      const leafW = Math.min(0.86, doorW * 0.68)
      const leafH = innerH - 0.06
      const hingePt = logicalToWorld(
        door.x2 - 4,
        door.y + OFFICE_WALL_THICK * 0.2,
        this.world
      )
      const doorPivot = new THREE.Group()
      doorPivot.position.set(hingePt.x, 0, hingePt.z)
      doorPivot.rotation.y = Math.PI * 0.43 // Swung neatly inward (-Z) into the room
      addBox(
        doorPivot,
        leafW,
        0.74,
        0.055,
        woodTrimMat,
        -leafW / 2,
        0.37,
        0,
        false
      )
      addBox(
        doorPivot,
        leafW,
        0.1,
        0.055,
        woodTrimMat,
        -leafW / 2,
        leafH - 0.05,
        0,
        false
      )
      addBox(
        doorPivot,
        0.08,
        leafH - 0.74,
        0.055,
        woodTrimMat,
        -0.04,
        0.74 + (leafH - 0.74) / 2,
        0,
        false
      )
      addBox(
        doorPivot,
        0.08,
        leafH - 0.74,
        0.055,
        woodTrimMat,
        -leafW + 0.04,
        0.74 + (leafH - 0.74) / 2,
        0,
        false
      )
      addBox(
        doorPivot,
        leafW - 0.16,
        leafH - 0.84,
        0.025,
        glassMat,
        -leafW / 2,
        0.74 + (leafH - 0.84) / 2,
        0,
        false
      )
      // Brass door lever handle
      addBox(
        doorPivot,
        0.12,
        0.028,
        0.11,
        goldMat,
        -leafW + 0.12,
        0.84,
        0,
        false
      )
      this.archGroup.add(doorPivot)

      // Room nameplate plaque mounted on corridor side left of doorway
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
      addBox(
        this.archGroup,
        0.92,
        0.24,
        0.03,
        frameMetalMat,
        plaquePt.x,
        1.14,
        plaquePt.z + 0.015,
        false
      )
      const plaqueFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.86, 0.2),
        plaqueMat
      )
      plaqueFace.position.set(plaquePt.x, 1.14, plaquePt.z + 0.034)
      this.archGroup.add(plaqueFace)
    }

    // 4d. Architectural Windows with Warm Sunlight Pools
    for (const win of getOfficeWindows(worldH)) {
      const spanU = win.span * s
      if (win.wall === "north") {
        const pt = logicalToWorld(win.pos, OFFICE_WALL_THICK, this.world)
        // Outer wooden/metal window frame + sill
        addBox(
          this.archGroup,
          spanU + 0.14,
          win.heightU + 0.14,
          0.08,
          frameMetalMat,
          pt.x,
          win.centerY,
          pt.z + 0.02,
          false
        )
        addBox(
          this.archGroup,
          spanU + 0.22,
          0.06,
          0.16,
          woodTrimMat,
          pt.x,
          win.centerY - win.heightU / 2 - 0.05,
          pt.z + 0.06,
          false
        )
        // Sunlit glass pane + center mullion cross
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(spanU, win.heightU),
          windowGlassMat
        )
        pane.position.set(pt.x, win.centerY, pt.z + 0.064)
        this.archGroup.add(pane)
        addBox(
          this.archGroup,
          0.045,
          win.heightU,
          0.04,
          frameMetalMat,
          pt.x,
          win.centerY,
          pt.z + 0.065,
          false
        )
        if (win.heightU > 0.7) {
          addBox(
            this.archGroup,
            spanU,
            0.04,
            0.04,
            frameMetalMat,
            pt.x,
            win.centerY + 0.08,
            pt.z + 0.065,
            false
          )
        }
        if (win.sunPool) {
          const pool = new THREE.Mesh(
            new THREE.PlaneGeometry(spanU * 1.08, 1.75),
            sunPoolMat
          )
          pool.rotation.x = -Math.PI / 2
          pool.position.set(pt.x, 0.025, pt.z + 1.05)
          this.archGroup.add(pool)
        }
      } else {
        const isWest = win.wall === "west"
        const pt = logicalToWorld(
          isWest ? OFFICE_WALL_THICK : OFFICE_BASE_W - OFFICE_WALL_THICK,
          win.pos,
          this.world
        )
        const dir = isWest ? 1 : -1
        addBox(
          this.archGroup,
          0.08,
          win.heightU + 0.14,
          spanU + 0.14,
          frameMetalMat,
          pt.x + dir * 0.02,
          win.centerY,
          pt.z,
          false
        )
        addBox(
          this.archGroup,
          0.14,
          0.055,
          spanU + 0.22,
          woodTrimMat,
          pt.x + dir * 0.06,
          win.centerY - win.heightU / 2 - 0.05,
          pt.z,
          false
        )
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(spanU, win.heightU),
          windowGlassMat
        )
        pane.rotation.y = isWest ? Math.PI / 2 : -Math.PI / 2
        pane.position.set(pt.x + dir * 0.065, win.centerY, pt.z)
        this.archGroup.add(pane)
        addBox(
          this.archGroup,
          0.04,
          win.heightU,
          0.045,
          frameMetalMat,
          pt.x + dir * 0.065,
          win.centerY,
          pt.z,
          false
        )
        if (win.sunPool) {
          const pool = new THREE.Mesh(
            new THREE.PlaneGeometry(1.55, spanU * 1.04),
            sunPoolMat
          )
          pool.rotation.x = -Math.PI / 2
          pool.position.set(pt.x + dir * 0.95, 0.025, pt.z)
          this.archGroup.add(pool)
        }
      }
    }

    // 4e. Ceiling Light Coves (North Wall Soffits) & Warm Brass Wall Sconces
    const ceilingBars: readonly { x: number; w: number }[] = [
      { x: 380, w: 3.4 },
      { x: 1160, w: 4.2 },
      { x: 1960, w: 3.6 },
    ]
    for (const bar of ceilingBars) {
      const pt = logicalToWorld(bar.x, OFFICE_WALL_THICK + 12, this.world)
      addBox(
        this.archGroup,
        bar.w + 0.16,
        0.09,
        0.24,
        frameMetalMat,
        pt.x,
        northH - 0.12,
        pt.z + 0.12,
        false
      )
      addBox(
        this.archGroup,
        bar.w,
        0.045,
        0.16,
        ceilingLightMat,
        pt.x,
        northH - 0.17,
        pt.z + 0.14,
        false
      )
    }

    // Warm corridor brass sconces along the south face of the corridor partition
    const sconceXs = [170, 620, 910, 1400, 1740, 2220]
    const sconceBaseGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.05, seg)
    const sconceGlobeGeo = new THREE.SphereGeometry(0.075, seg, Math.max(6, seg - 4))
    for (const sx of sconceXs) {
      const pt = logicalToWorld(sx, OFFICE_DIVIDER_Y + OFFICE_WALL_THICK, this.world)
      const base = new THREE.Mesh(sconceBaseGeo, goldMat)
      base.rotation.x = Math.PI / 2
      base.position.set(pt.x, 1.62, pt.z + 0.03)
      this.archGroup.add(base)
      const globe = new THREE.Mesh(sconceGlobeGeo, ceilingLightMat)
      globe.position.set(pt.x, 1.62, pt.z + 0.09)
      this.archGroup.add(globe)
    }

    // 5. Room Decorations & Static Furniture Props across all 4 zones

    // ----- PHÒNG SẾP -----
    const bossShelf = createBookshelf(2.0, 1.82, 0.46)
    const bossShelfPt = this.toWorldCenter(40, 40, 200, 46)
    bossShelf.group.position.set(bossShelfPt.x, 0, bossShelfPt.z)
    this.mountStaticProp(bossShelf)

    // Golden executive trophy & mini globe atop Boss Bookshelf
    const trophyCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.06, 0.18, seg),
      goldMat
    )
    trophyCup.position.set(bossShelfPt.x - 0.45, 1.98, bossShelfPt.z)
    this.archGroup.add(trophyCup)
    addBox(
      this.archGroup,
      0.16,
      0.06,
      0.16,
      wallDarkBaseMat,
      bossShelfPt.x - 0.45,
      1.86,
      bossShelfPt.z,
      false
    )
    const globeMat = createMatteMaterial("#3b82f6", { roughness: 0.42 })
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.11, seg, seg), globeMat)
    globe.position.set(bossShelfPt.x + 0.48, 2.02, bossShelfPt.z)
    this.archGroup.add(globe)
    addBox(
      this.archGroup,
      0.14,
      0.05,
      0.14,
      goldMat,
      bossShelfPt.x + 0.48,
      1.86,
      bossShelfPt.z,
      false
    )

    // Framed wall art on North wall behind Boss Desk (IQX crest + growth chart)
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
      addBox(
        this.archGroup,
        f.w + 0.1,
        f.h + 0.1,
        0.04,
        goldMat,
        fPt.x,
        1.64,
        fPt.z + 0.02,
        false
      )
      const artTex = createArtFrameTexture(f.variant)
      const artMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(f.w, f.h),
        new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.36 })
      )
      artMesh.position.set(fPt.x, 1.64, fPt.z + 0.044)
      this.archGroup.add(artMesh)
    }

    const bossSofa = createSofa(1.5, 0.7, "#24365e")
    const bossSofaPt = this.toWorldCenter(560, 330, 150, 70)
    bossSofa.group.position.set(bossSofaPt.x, 0, bossSofaPt.z)
    this.mountStaticProp(bossSofa)

    // Standing brass floor lamp neatly tucked by Boss Sofa's corner
    const lampPt = logicalToWorld(716, 355, this.world)
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.04, seg),
      goldMat
    )
    lampBase.position.set(lampPt.x, 0.02, lampPt.z)
    this.archGroup.add(lampBase)
    const lampStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.026, 1.42, 8),
      goldMat
    )
    lampStem.position.set(lampPt.x, 0.73, lampPt.z)
    this.archGroup.add(lampStem)
    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 0.28, seg),
      lampShadeMat
    )
    lampShade.position.set(lampPt.x, 1.48, lampPt.z)
    this.archGroup.add(lampShade)

    const bossLamp = new THREE.PointLight(0xffe7bd, 1.25, 11, 1.5)
    const bossLightPt = logicalToWorld(440, 230, this.world)
    bossLamp.position.set(bossLightPt.x, 3.2, bossLightPt.z)
    this.archGroup.add(bossLamp)

    // ----- PHÒNG HỌP -----
    // Acoustic warm wood slat accent wall panel behind the Wall Screen
    const slatCenter = logicalToWorld(1160, OFFICE_WALL_THICK + 3, this.world)
    const slatCount = this.lite ? 10 : 18
    for (let i = 0; i < slatCount; i += 1) {
      const offset = -1.9 + (i * 3.8) / Math.max(1, slatCount - 1)
      addBox(
        this.archGroup,
        0.07,
        1.56,
        0.035,
        woodSlatMat,
        slatCenter.x + offset,
        1.58,
        slatCenter.z + 0.01,
        false
      )
    }

    // Sleek AV Credenza Cabinet tucked directly under Meeting Wall Screen (inside meet-screen obstacle)
    const credenzaPt = this.toWorldCenter(1015, 22, 290, 52)
    addBox(
      this.archGroup,
      2.9,
      0.56,
      0.48,
      wallNavyMat,
      credenzaPt.x,
      0.28,
      credenzaPt.z
    )
    addBox(
      this.archGroup,
      2.96,
      0.05,
      0.52,
      woodTrimMat,
      credenzaPt.x,
      0.585,
      credenzaPt.z,
      false
    )
    // Soundbar on top of credenza
    addBox(
      this.archGroup,
      1.1,
      0.075,
      0.11,
      wallDarkBaseMat,
      credenzaPt.x,
      0.65,
      credenzaPt.z + 0.08,
      false
    )

    // Wall-mounted Meeting Whiteboard on interior West partition (x = 756)
    const wbPt = logicalToWorld(758, 275, this.world)
    addBox(
      this.archGroup,
      0.05,
      0.92,
      1.68,
      frameMetalMat,
      wbPt.x + 0.03,
      1.26,
      wbPt.z,
      false
    )
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

    // Pill Conference Table + 8 Swivel Chairs + miniature tabletop props
    const confTable = createConferenceTable(4.2, 1.5, 8)
    const confPt = this.toWorldCenter(948, 200, 420, 150)
    confTable.group.position.set(confPt.x, 0, confPt.z)
    this.mountStaticProp(confTable)

    // Conference tabletop speakerphone puck + miniature notebooks + water carafe
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.045, seg),
      wallDarkBaseMat
    )
    puck.position.set(confPt.x, 0.82, confPt.z)
    this.archGroup.add(puck)
    const puckLed = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.01, 6, seg),
      createGlowMaterial("#34c38f", 1.1)
    )
    puckLed.rotation.x = Math.PI / 2
    puckLed.position.set(confPt.x, 0.845, confPt.z)
    this.archGroup.add(puckLed)

    const notebookColors = ["#3b82f6", "#e9b949", "#ef4444", "#10b981"]
    const notebookCoords: readonly [number, number, number][] = [
      [-1.15, -0.38, 0.08],
      [-0.25, -0.4, -0.06],
      [0.85, 0.36, -0.1],
      [-0.75, 0.38, 0.05],
    ]
    notebookCoords.forEach(([nx, nz, rotY], idx) => {
      const nb = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.02, 0.3),
        createMatteMaterial(notebookColors[idx % notebookColors.length]!, {
          roughness: 0.55,
        })
      )
      nb.position.set(confPt.x + nx, 0.81, confPt.z + nz)
      nb.rotation.y = rotY
      this.archGroup.add(nb)
    })

    if (!this.lite) {
      const meetLight = new THREE.PointLight(0xf6f8ff, 0.9, 10, 1.6)
      meetLight.position.set(confPt.x, 3.2, confPt.z)
      this.archGroup.add(meetLight)
    }

    // ----- PHÒNG TÀI LIỆU -----
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

    // Classic green-shaded brass banker's reading lamp & neat archive binders on reading desk
    const bLampX = readPt.x - 0.64
    const bLampZ = readPt.z - 0.16
    const bLampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.035, seg),
      goldMat
    )
    bLampBase.position.set(bLampX, 0.815, bLampZ)
    this.archGroup.add(bLampBase)
    const bLampNeck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.34, 8),
      goldMat
    )
    bLampNeck.position.set(bLampX, 0.99, bLampZ)
    this.archGroup.add(bLampNeck)
    const bLampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.24, seg),
      createGlowMaterial("#1f9d68", 0.55)
    )
    bLampShade.rotation.z = Math.PI / 2
    bLampShade.position.set(bLampX + 0.03, 1.15, bLampZ)
    this.archGroup.add(bLampShade)

    // Stacked colorful document folders on reading desk
    const binderMats = [
      createMatteMaterial("#2563eb", { roughness: 0.52 }),
      createMatteMaterial("#d97706", { roughness: 0.52 }),
      createMatteMaterial("#dc2626", { roughness: 0.52 }),
    ]
    binderMats.forEach((mat, idx) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.24), mat)
      b.position.set(readPt.x + 0.56, 0.82 + idx * 0.046, readPt.z - 0.08)
      b.rotation.y = (idx - 1) * 0.1
      this.archGroup.add(b)
    })

    // Framed archive plaque on west divider of Documents Room
    const docsSignPt = logicalToWorld(1578, 275, this.world)
    const docsSignTex = createSignTexture("KHO TÀI LIỆU IQX", {
      style: "navy_gold",
      subtext: "Quy trình · Báo cáo · KPI",
      width: 384,
      height: 128,
    })
    addBox(
      this.archGroup,
      0.04,
      0.56,
      1.36,
      goldMat,
      docsSignPt.x + 0.02,
      1.32,
      docsSignPt.z,
      false
    )
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

    // ----- GÓC CÀ PHÊ & STANDEE -----
    const coffeeBar = createPantryCounter(1.7, 0.6)
    const coffeePt = this.toWorldCenter(1860, 640, 170, 60)
    coffeeBar.group.position.set(coffeePt.x, 0, coffeePt.z)
    this.mountStaticProp(coffeeBar)

    // Cafe Menu Chalkboard on the corridor divider behind Coffee Counter
    const menuPt = logicalToWorld(1945, OFFICE_DIVIDER_Y + OFFICE_WALL_THICK + 2, this.world)
    addBox(
      this.archGroup,
      1.26,
      0.76,
      0.04,
      woodTrimMat,
      menuPt.x,
      1.32,
      menuPt.z + 0.02,
      false
    )
    const menuFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.16, 0.68),
      new THREE.MeshStandardMaterial({
        map: createCafeMenuTexture(),
        roughness: 0.42,
      })
    )
    menuFace.position.set(menuPt.x, 1.32, menuPt.z + 0.045)
    this.archGroup.add(menuFace)

    // Sleek Water Dispenser Cooler right next to Coffee Bar
    const coolerPt = this.toWorldCenter(
      OFFICE_COFFEE_COOLER_RECT.x,
      OFFICE_COFFEE_COOLER_RECT.y,
      OFFICE_COFFEE_COOLER_RECT.w,
      OFFICE_COFFEE_COOLER_RECT.h
    )
    const coolerMat = createMatteMaterial("#eef2f7", { roughness: 0.34 })
    const waterJugMat = new THREE.MeshStandardMaterial({
      color: "#60a5fa",
      transparent: true,
      opacity: 0.78,
      roughness: 0.16,
      metalness: 0.1,
    })
    addBox(
      this.archGroup,
      0.44,
      0.92,
      0.44,
      coolerMat,
      coolerPt.x,
      0.46,
      coolerPt.z
    )
    addBox(
      this.archGroup,
      0.34,
      0.2,
      0.06,
      wallDarkBaseMat,
      coolerPt.x,
      0.7,
      coolerPt.z + 0.2,
      false
    )
    const jug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.42, seg),
      waterJugMat
    )
    jug.position.set(coolerPt.x, 1.13, coolerPt.z)
    jug.castShadow = true
    this.archGroup.add(jug)

    // Cafe Bistro Table (from furniture-builder) + 2 cute high stools
    const bistroPt = this.toWorldCenter(
      OFFICE_COFFEE_TABLE_RECT.x,
      OFFICE_COFFEE_TABLE_RECT.y,
      OFFICE_COFFEE_TABLE_RECT.w,
      OFFICE_COFFEE_TABLE_RECT.h
    )
    const bistroTable = createCoffeeTable(0.95, 0.72)
    bistroTable.group.position.set(bistroPt.x, 0, bistroPt.z)
    this.mountStaticProp(bistroTable)

    const stoolSeatMat = createClothMaterial("#2c416b")
    const stoolTopGeo = new THREE.CylinderGeometry(0.17, 0.16, 0.07, seg)
    const stoolLegGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.34, 8)
    for (const side of [-1, 1] as const) {
      const sx = bistroPt.x + side * 0.68
      const leg = new THREE.Mesh(stoolLegGeo, frameMetalMat)
      leg.position.set(sx, 0.17, bistroPt.z)
      leg.castShadow = true
      this.archGroup.add(leg)
      const seat = new THREE.Mesh(stoolTopGeo, stoolSeatMat)
      seat.position.set(sx, 0.36, bistroPt.z)
      seat.castShadow = true
      this.archGroup.add(seat)
    }

    const cafeLamp = new THREE.PointLight(0xffdfb0, 1.05, 9, 1.55)
    cafeLamp.position.set(coffeePt.x + 0.6, 2.8, coffeePt.z + 0.6)
    this.archGroup.add(cafeLamp)

    // Twin Brass Stanchions flanking the Achievement Standee
    const standeeCenter = logicalToWorld(2195, 1066, this.world)
    const postGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.72, 8)
    const postBaseGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.04, seg)
    const postCapGeo = new THREE.SphereGeometry(0.048, 8, 8)
    for (const side of [-1, 1] as const) {
      const px = standeeCenter.x + side * 1.42
      const pz = standeeCenter.z + 0.16
      const pBase = new THREE.Mesh(postBaseGeo, goldMat)
      pBase.position.set(px, 0.02, pz)
      this.archGroup.add(pBase)
      const post = new THREE.Mesh(postGeo, goldMat)
      post.position.set(px, 0.38, pz)
      this.archGroup.add(post)
      const cap = new THREE.Mesh(postCapGeo, goldMat)
      cap.position.set(px, 0.76, pz)
      this.archGroup.add(cap)
    }

    if (!this.lite) {
      const standeeLight = new THREE.PointLight(0xffdf9a, 0.9, 7.5, 1.6)
      standeeLight.position.set(standeeCenter.x, 3.1, standeeCenter.z + 1.0)
      this.archGroup.add(standeeLight)
    }

    // ----- KHU NHÂN VIÊN: LOUNGE + WALL ART -----
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
    rug.group.position.set(rugPt.x, 0.01, rugPt.z)
    this.mountStaticProp(rug)

    const loungeSofa = createSofa(
      lounge.sofa.w * s,
      lounge.sofa.h * s,
      "#24365e"
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
      lounge.table.h * s
    )
    const loungeTablePt = this.toWorldCenter(
      lounge.table.x,
      lounge.table.y,
      lounge.table.w,
      lounge.table.h
    )
    loungeTable.group.position.set(loungeTablePt.x, 0, loungeTablePt.z)
    this.mountStaticProp(loungeTable)

    // Cute framed motivational artwork on West outer wall in Staff Area
    const westPosterPt = logicalToWorld(OFFICE_WALL_THICK + 2, 995, this.world)
    addBox(
      this.archGroup,
      0.04,
      0.78,
      1.12,
      goldMat,
      westPosterPt.x + 0.02,
      1.36,
      westPosterPt.z,
      false
    )
    const westPoster = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, 0.7),
      new THREE.MeshStandardMaterial({
        map: createArtFrameTexture("mountain"),
        roughness: 0.38,
      })
    )
    westPoster.rotation.y = Math.PI / 2
    westPoster.position.set(westPosterPt.x + 0.046, 1.36, westPosterPt.z)
    this.archGroup.add(westPoster)

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
      this.meetingBoard.group.position.set(meetScreenPt.x, 1.58, meetScreenPt.z)
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
