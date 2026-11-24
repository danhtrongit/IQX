/**
 * Procedural Cute & Crisp Chibi 3D Open-Floor World for Khu Văn phòng (KGD style).
 *
 * 100% procedural Three.js built on `frontend/src/lib/chibi-3d/` & `office-decor/`:
 * - Open luminous cream stone/marble tile floor (extending seamlessly past playable bounds so
 *   zero empty dark margins ever appear), brass floor perimeter trim, soft AO contact shadows,
 *   and warm overhead ceiling-light glow pools.
 * - ONE grand North back wall (KGD architecture: warm ivory plaster, navy wainscoting dado,
 *   brushed gold skirting/chair rail/crown cornice, fluted pilasters with warm brass wall sconces,
 *   recessed light cove) carrying:
 *   - Grand live Team LED Board ("IQX · {Tên nhóm}" + live monthly Top 3 Leaderboard / KPI strip)
 *   - Stock-Ticker LED Ribbon below the Team Board
 *   - 3 World Market Wall Clocks (VN · TYO · NYC)
 *   - Panoramic City-Skyline Window Strips with warm floor sunlight pools
 *   - Live Meeting Room Wall Screen + acoustic slat backdrop
 *   - Award & Archive Bookshelves against the back wall + framed corporate wall art
 *   - Ceiling-less hanging pendant lamp silhouettes near the north wall
 * - 6 open zones marked by bordered KGD-style rugs + painted bronze floor decals:
 *   - "BÀN SẾP": executive walnut dual-monitor desk, guest sofa, award shelf, standing lamp
 *   - "PHÒNG HỌP": pill conference table + 8 chairs, mobile whiteboard easel, low planter soft border (no glass!)
 *   - "TÀI LIỆU": archive bookshelves + reading desk with banker's lamp
 *   - "KHU LÀM VIỆC": 24-desk open-plan pod grid (InstancedMesh, dynamic >24 expansion),
 *     candlestick chart monitors, cable-free chibi desk clutter (mugs, mini succulents, sticky
 *     notes, stacked folders, pen cups), packed 1-atlas member nameplates, "Bàn trống" plates,
 *     and woven "IQX · NHÓM {TÊN SẾP}" Team Banner Rug
 *   - "GÓC NGHỈ": cozy sofa + coffee table + floor lamp, espresso bar, water cooler, snack shelf,
 *     chibi foosball table & mini arcade cabinet
 *   - "GÓC THÀNH TÍCH": 3 tiered marble/gold trophy pedestals, twin framed certificate easels,
 *     and live Achievement Standee with brass stanchions
 * - 3 distinct instanced plant varieties (fiddle-leaf corner trees, monstera bushes, snake plants)
 * - Step-wise chunked build (`buildAsync`, `rebuildTeamPropsSteps`) + static shadow baking
 */
import * as THREE from "three"

import {
  runBuildChunked,
  runBuildSync,
  type BuildSteps,
  type ChunkedBuildOptions,
} from "@/lib/chibi-3d/chunked-build.ts"

import { prefersReducedMotion } from "@/lib/chibi-3d/character-builder.ts"
import {
  createAchievementStandee,
  createBookshelf,
  createCoffeeTable,
  createConferenceTable,
  createOfficeDesk,
  createPantryCounter,
  createSofa,
  createWallBoardFrame,
  type DisposableProp,
  type LiveBoardProp,
} from "@/lib/chibi-3d/furniture-builder.ts"
import {
  ContactShadowBatcher,
  OFFICE_DECOR_FONT_STACK,
  OfficeDecorBatcher,
  addCertificateEasel,
  addFoosballTableToBatch,
  addHangingPendantsToBatch,
  addLowPlanterToBatch,
  addMiniArcadeCabinet,
  addPrinterCredenzaToBatch,
  addSkylineWindowToBatch,
  addSnackShelfToBatch,
  addStandingLampToBatch,
  addTrophyPedestalsToBatch,
  addWaterCoolerToBatch,
  addWhiteboardEasel,
  addWorldClocks,
  chibiBevelBox,
  createCandlestickMonitorTexture,
  createCitySkylineTexture,
  createDecorCanvasTexture,
  createOfficeContactShadowTexture,
  createOfficeDecorPalette,
  createOfficeGlowPoolTexture,
  createOfficeStockTickerTexture,
  createVertexColorProxy,
  createWallArtPrintTexture,
  drawTeamLedBoard,
  mountBorderedZoneRug,
  mountInstancedDeskClutter,
  mountInstancedOfficePlants,
  type DeskClutterSlot,
  type MergedSpec,
  type OfficePlantTransform,
} from "@/lib/chibi-3d/office-decor/index.ts"
import {
  cloneSharedRepeatedTexture,
  createFabricSurfaceTexture,
  createFloorDecalTexture,
  createFloorTexture,
  createNameplateAtlasTexture,
  createSignTexture,
  createWoodSurfaceTexture,
  drawOfficeMeetingScreen,
  drawOfficeStandee,
  releaseCachedTexture,
  retainCachedTexture,
  type NameplateAtlasEntry,
} from "@/lib/chibi-3d/textures.ts"
import {
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
  OFFICE_AWARDS_PROPS,
  OFFICE_BASE_W,
  OFFICE_DESK_H,
  OFFICE_DESK_W,
  OFFICE_LOUNGE_PROPS,
  OFFICE_NORTH_PROPS,
  OFFICE_NORTH_WALL_Y,
  OFFICE_POD_DIVIDER_H,
  OFFICE_POD_W,
  OFFICE_WORLD_SCALE,
  buildAllDeskSlots,
  computeOfficeDimensions,
  getMeetingPlanters,
  getOfficeFloorLabels,
  getOfficeNorthWindows,
  getOfficePlants,
  getOfficePodDividers,
  getPrinterStationRect,
  getTeamBannerRugRect,
  getZoneRugs,
  type OfficeDeskPlacement,
  type OfficeDeskSlot,
} from "./office-layout.ts"

const NORTH_WALL_H = 4.35
const NORTH_WALL_EXTEND_U = 10.0

const scratchMatrix = new THREE.Matrix4()
const scratchPos = new THREE.Vector3()
const scratchQuat = new THREE.Quaternion()
const scratchEuler = new THREE.Euler()
const scratchScale = new THREE.Vector3()

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

/** High-DPI woven Team Banner Rug texture (`"IQX · NHÓM {TÊN SẾP}"`). */
function createTeamBannerRugTexture(
  bossName: string,
  lite: boolean
): THREE.Texture {
  const cleanBoss = bossName.trim()
  const title = cleanBoss
    ? `IQX · NHÓM ${cleanBoss.toUpperCase()}`
    : "IQX · VĂN PHÒNG"

  return createDecorCanvasTexture(
    lite ? 512 : 1024,
    lite ? 96 : 192,
    (ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, w, h)
      bg.addColorStop(0, "#152546")
      bg.addColorStop(0.5, "#1c315a")
      bg.addColorStop(1, "#152546")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      ctx.fillStyle = "rgba(255, 255, 255, 0.035)"
      const step = lite ? 4 : 6
      for (let y = 0; y < h; y += step) {
        ctx.fillRect(0, y, w, 1)
      }
      for (let x = 0; x < w; x += step * 2) {
        ctx.fillRect(x, 0, 1, h)
      }

      const padOuter = h * 0.08
      const padInner = h * 0.16
      ctx.strokeStyle = "#e9b949"
      ctx.lineWidth = Math.max(2, h * 0.035)
      ctx.strokeRect(padOuter, padOuter, w - padOuter * 2, h - padOuter * 2)

      ctx.strokeStyle = "rgba(246, 210, 122, 0.55)"
      ctx.lineWidth = Math.max(1, h * 0.014)
      ctx.strokeRect(padInner, padInner, w - padInner * 2, h - padInner * 2)

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

      const maxTextW = w * 0.74
      let fontSize = Math.round(h * 0.42)
      ctx.font = `800 ${fontSize}px ${OFFICE_DECOR_FONT_STACK}`
      while (fontSize > 16 && ctx.measureText(title).width > maxTextW) {
        fontSize -= 2
        ctx.font = `800 ${fontSize}px ${OFFICE_DECOR_FONT_STACK}`
      }
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "rgba(7, 13, 28, 0.55)"
      ctx.fillText(title, w / 2, h * 0.52 + 2)
      ctx.fillStyle = "#f6d27a"
      ctx.fillText(title, w / 2, h * 0.51)
    },
    lite ? 4 : 8
  )
}

/** Shared neutral "Bàn trống" plate texture for all unassigned staff desks. */
function createEmptyDeskPlateTexture(lite: boolean): THREE.Texture {
  return createDecorCanvasTexture(
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
      ctx.font = `700 ${Math.round(h * 0.42)}px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText("Bàn trống", w / 2, h * 0.52)
    },
    lite ? 4 : 8
  )
}

/** Builds merged prototype geometry specs for an instanced open-plan staff desk (3 draw calls total!). */
function createStaffDeskPrototypeSpecs(
  width: number,
  depth: number,
  lite: boolean,
  retainTex: (tex: THREE.Texture) => void
): MergedSpec[] {
  const batcher = new OfficeDecorBatcher()
  const oakTex = createWoodSurfaceTexture("oak")
  retainTex(oakTex)
  const topWoodMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: oakTex,
    roughness: 0.46,
    metalness: 0.05,
  })
  const vcMatte = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.54,
    metalness: 0.08,
  })
  const vcMetal = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.72,
  })
  const drawerBodyMat = createVertexColorProxy(vcMatte, "#8a633b")
  const drawerFaceMat = createVertexColorProxy(vcMatte, "#a3784a")
  const legMat = createVertexColorProxy(vcMetal, "#27334a")
  const handleMat = createVertexColorProxy(vcMetal, "#b8c4d4")
  const bezelMat = createVertexColorProxy(vcMatte, "#161f33")
  const blotterMat = createVertexColorProxy(vcMatte, "#253147")
  const keyMat = createVertexColorProxy(vcMatte, "#eef2f7")

  const deskH = 0.76
  const topThick = 0.064
  const topSurfaceY = deskH + topThick / 2

  const pedW = Math.min(0.4, width * 0.22)
  const pedH = deskH - 0.08
  const pedD = depth * 0.82
  const pedX = width / 2 - pedW / 2 - 0.05
  batcher.addBox(pedW - 0.04, 0.04, pedD - 0.04, legMat, pedX, 0.02, 0, true)
  batcher.addBevelBox(pedW, pedH, pedD, 0.018, drawerBodyMat, pedX, 0.04 + pedH / 2, 0, lite, true)
  const slotH = (pedH - 0.08) / 3
  for (let i = 0; i < 3; i += 1) {
    const dy = 0.08 + (i + 0.5) * slotH
    batcher.addBox(pedW - 0.05, slotH - 0.024, 0.022, drawerFaceMat, pedX, dy, pedD / 2 + 0.008, true)
    batcher.addBox(pedW * 0.34, 0.016, 0.02, handleMat, pedX, dy + slotH * 0.14, pedD / 2 + 0.022, true)
  }

  const leftX = -width / 2 + 0.085
  batcher.addBox(0.05, 0.04, depth * 0.84, legMat, leftX, 0.02, 0, true)
  for (const sz of [-1, 1] as const) {
    batcher.addBox(0.05, deskH - 0.05, 0.05, legMat, leftX, deskH / 2, sz * (depth * 0.36), true)
  }
  batcher.addBox(width - pedW - 0.18, deskH * 0.54, 0.036, drawerBodyMat, -pedW * 0.44, deskH * 0.48, -depth * 0.34, true)
  batcher.addBevelBox(width, topThick, depth, 0.02, topWoodMat, 0, deskH, 0, lite, true)
  batcher.addBox(Math.min(width * 0.54, 1.02), 0.008, Math.min(depth * 0.44, 0.36), blotterMat, 0, topSurfaceY + 0.004, depth * 0.1, true)

  const mz = -depth * 0.24
  batcher.addBox(0.2, 0.016, 0.13, handleMat, 0, topSurfaceY + 0.008, mz, true)
  batcher.addBox(0.046, 0.155, 0.03, handleMat, 0, topSurfaceY + 0.088, mz - 0.02, true, true, [-0.08, 0, 0])
  batcher.addBevelBox(0.56, 0.33, 0.032, 0.012, bezelMat, 0, topSurfaceY + 0.255, mz, lite, true)

  const kz = depth * 0.14
  batcher.addBox(0.39, 0.016, 0.125, keyMat, -0.04, topSurfaceY + 0.012, kz, true, true, [0.08, 0, 0])
  batcher.addBevelBox(0.056, 0.024, 0.09, 0.01, keyMat, 0.24, topSurfaceY + 0.014, kz + 0.01, lite, true)

  for (const p of [drawerBodyMat, drawerFaceMat, legMat, handleMat, bezelMat, blotterMat, keyMat]) {
    p.dispose()
  }
  return batcher.flushToSpecs()
}

/** Builds merged prototype geometry specs for an instanced ergonomic swivel chair (2 draw calls total!). */
function createSwivelChairPrototypeSpecs(
  lite: boolean,
  retainTex: (tex: THREE.Texture) => void
): MergedSpec[] {
  const batcher = new OfficeDecorBatcher()
  const fabricTex = createFabricSurfaceTexture("#2f3e60", "weave")
  retainTex(fabricTex)
  const fabricMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: fabricTex,
    roughness: 0.76,
    metalness: 0.03,
  })
  const vcFrame = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.48,
  })
  const darkMat = createVertexColorProxy(vcFrame, "#182032")
  const chromeMat = createVertexColorProxy(vcFrame, "#a4b3c6")
  const seg = lite ? 6 : 8

  batcher.addCylinder(0.03, 0.034, 0.22, seg, chromeMat, 0, 0.19, 0, false, true)
  batcher.addCylinder(0.052, 0.064, 0.085, seg, darkMat, 0, 0.095, 0, false, true)
  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    batcher.addBox(0.22, 0.032, 0.038, darkMat, cos * 0.12, 0.068, sin * 0.12, false, true, [0, -a, -0.14])
    batcher.addCylinder(0.022, 0.022, 0.024, 6, darkMat, cos * 0.22, 0.022, sin * 0.22, false, true, [Math.PI / 2, 0, -a])
  }

  batcher.addBox(0.43, 0.032, 0.41, darkMat, 0, 0.32, 0.01, false, true)
  batcher.addBevelBox(0.45, 0.082, 0.43, 0.028, fabricMat, 0, 0.368, 0.01, lite, true)
  batcher.addBox(0.065, 0.32, 0.04, darkMat, 0, 0.47, -0.225, false, true, [-0.14, 0, 0])
  batcher.addBevelBox(0.41, 0.39, 0.076, 0.026, fabricMat, 0, 0.59, -0.2, lite, true, true, [-0.12, 0, 0])
  for (const side of [-1, 1] as const) {
    const ax = side * 0.24
    batcher.addBox(0.03, 0.19, 0.034, darkMat, ax, 0.42, -0.04, false, true)
    batcher.addBox(0.056, 0.03, 0.26, darkMat, ax, 0.515, -0.01, false, true)
  }

  darkMat.dispose()
  chromeMat.dispose()
  return batcher.flushToSpecs()
}

/** Builds merged prototype geometry specs for an instanced low acoustic pod divider spine. */
function createPodDividerPrototypeSpecs(
  width: number,
  depth: number,
  lite: boolean,
  retainTex: (tex: THREE.Texture) => void
): MergedSpec[] {
  const batcher = new OfficeDecorBatcher()
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

  batcher.addBox(width - 0.06, 0.72, depth * 0.58, metalMat, 0, 0.36, 0, false)
  batcher.addBevelBox(
    width - 0.02,
    0.33,
    depth * 0.54,
    0.014,
    feltMat,
    0,
    0.93,
    0,
    lite
  )
  batcher.addBevelBox(
    width + 0.02,
    0.038,
    depth * 0.74,
    0.01,
    railMat,
    0,
    1.11,
    0,
    lite,
    false
  )
  batcher.addBox(width, 0.014, depth * 0.42, goldMat, 0, 1.132, 0, false)
  for (const px of [-width / 2 + 0.01, 0, width / 2 - 0.01]) {
    batcher.addBox(0.044, 0.38, depth * 0.72, metalMat, px, 0.93, 0, false)
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

  private readonly teamBoardCanvas: HTMLCanvasElement
  private readonly teamBoard: LiveBoardProp
  private readonly meetingCanvas: HTMLCanvasElement
  private readonly standeeCanvas: HTMLCanvasElement
  private readonly meetingBoard: LiveBoardProp
  private readonly standeeBoard: LiveBoardProp
  private lastTeamBoardSig = ""
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

    // 1. Grand North Back Wall Team LED Board ("IQX · {Tên nhóm}" + live Top 3 / KPI strip)
    this.teamBoardCanvas = document.createElement("canvas")
    this.teamBoardCanvas.width = 1024
    this.teamBoardCanvas.height = 320
    drawTeamLedBoard(this.teamBoardCanvas, {
      teamTitle: "IQX · VĂN PHÒNG",
      monthLabel: "Mục tiêu tháng",
      top3: [],
    })
    this.lastTeamBoardSig = "init:empty"
    this.teamBoard = createWallBoardFrame(
      4.7,
      1.5,
      this.teamBoardCanvas,
      "#e9b949",
      { lite }
    )
    this.teamBoard.group.name = "office-team-led-board"
    this.group.add(this.teamBoard.group)

    // 2. Live Meeting Room Wall Screen (640x160) mounted on North wall behind PHÒNG HỌP
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
      3.05,
      1.0,
      this.meetingCanvas,
      "#e9b949",
      { lite }
    )
    this.meetingBoard.group.name = "office-meeting-screen"
    this.group.add(this.meetingBoard.group)

    // 3. Live Freestanding Gold-Trimmed Achievement Standee (460x748) in GÓC THÀNH TÍCH
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
      2.15,
      3.45,
      { lite }
    )
    this.standeeBoard.group.name = "office-achievement-standee"
    this.group.add(this.standeeBoard.group)

    this.positionLiveBoards()
    freezeStaticSubtree(this.teamBoard.group)
    freezeStaticSubtree(this.meetingBoard.group)
    freezeStaticSubtree(this.standeeBoard.group)

    // Golden click-to-move destination ring
    this.targetRingMat = createGlowMaterial("#f6d27a", 1.1, 0)
    this.targetRingMat.side = THREE.DoubleSide
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, lite ? 16 : 24),
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

  private positionLiveBoards(): void {
    const wallFaceZ = logicalToWorld(0, OFFICE_NORTH_WALL_Y, this.world).z
    const teamPt = logicalToWorld(1040, OFFICE_NORTH_WALL_Y, this.world)
    this.teamBoard.group.position.set(teamPt.x, 2.55, wallFaceZ + 0.14)
    this.teamBoard.group.updateMatrix()
    this.teamBoard.group.updateMatrixWorld(true)

    const meetPt = logicalToWorld(1470, OFFICE_NORTH_WALL_Y, this.world)
    this.meetingBoard.group.position.set(meetPt.x, 2.08, wallFaceZ + 0.14)
    this.meetingBoard.group.updateMatrix()
    this.meetingBoard.group.updateMatrixWorld(true)

    const standeePt = this.toWorldCenter(
      OFFICE_AWARDS_PROPS.standee.x,
      OFFICE_AWARDS_PROPS.standee.y,
      OFFICE_AWARDS_PROPS.standee.w,
      OFFICE_AWARDS_PROPS.standee.h
    )
    this.standeeBoard.group.position.set(standeePt.x, 0, standeePt.z)
    this.standeeBoard.group.updateMatrix()
    this.standeeBoard.group.updateMatrixWorld(true)
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

  private toWorldCenter(
    x: number,
    y: number,
    w: number,
    h: number
  ): { x: number; z: number } {
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
    const roomW = OFFICE_BASE_W * s // 24.0u
    const roomH = worldH * s // 15.6u+
    const wallFaceZ = logicalToWorld(0, OFFICE_NORTH_WALL_Y, this.world).z
    const southZ = roomH / 2
    const seg = this.lite ? 8 : 12

    const palette = createOfficeDecorPalette(this.lite, (t) =>
      this.retainArchTex(t)
    )
    const archBatch = new OfficeDecorBatcher()
    const shadows = new ContactShadowBatcher()
    const ovalShadowTex = createOfficeContactShadowTexture("oval")
    const boxShadowTex = createOfficeContactShadowTexture("box")
    const stripAoTex = createOfficeContactShadowTexture("strip")

    yield 0.06

    // 1. Open luminous cream marble/stone tile floor (KGD quality!) extending seamlessly beyond
    //    playable bounds on West, East & South so ultrawide or edge camera angles NEVER show dark void.
    const floorExtendX = NORTH_WALL_EXTEND_U * 2
    const floorExtendSouth = 12.0
    const floorTotalW = roomW + floorExtendX
    const floorDepth = southZ - wallFaceZ + floorExtendSouth
    const floorCenterZ = wallFaceZ + floorDepth / 2

    const baseMarbleTex = this.retainArchTex(createFloorTexture("marble_cream"))
    const marbleTex = cloneSharedRepeatedTexture(
      baseMarbleTex,
      floorTotalW / 3.4,
      floorDepth / 3.4,
      this.lite ? 2 : 8
    )
    const openFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorTotalW, floorDepth),
      new THREE.MeshStandardMaterial({
        map: marbleTex,
        roughness: 0.44,
        metalness: 0.06,
      })
    )
    openFloor.name = "office-open-stone-floor"
    openFloor.rotation.x = -Math.PI / 2
    openFloor.position.set(0, 0, floorCenterZ)
    openFloor.receiveShadow = true
    this.archGroup.add(openFloor)

    // Subtle brushed-brass floor inlay border framing the playable open-floor perimeter (flat, walkable!)
    const playMinX = logicalToWorld(28, 0, this.world).x
    const playMaxX = logicalToWorld(OFFICE_BASE_W - 28, 0, this.world).x
    const playMaxZ = logicalToWorld(0, worldH - 22, this.world).z
    const playSpanW = playMaxX - playMinX
    const playSpanD = playMaxZ - wallFaceZ
    const playMidZ = (wallFaceZ + playMaxZ) / 2
    archBatch.addBox(playSpanW, 0.008, 0.045, palette.brassDark, 0, 0.005, playMaxZ, false)
    archBatch.addBox(0.045, 0.008, playSpanD, palette.brassDark, playMinX, 0.005, playMidZ, false)
    archBatch.addBox(0.045, 0.008, playSpanD, palette.brassDark, playMaxX, 0.005, playMidZ, false)

    // Dark exterior cap strictly behind the North back wall
    const northBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(floorTotalW + 8, 12),
      createMatteMaterial("#101829", { roughness: 0.92 })
    )
    northBackdrop.rotation.x = -Math.PI / 2
    northBackdrop.position.set(0, -0.02, wallFaceZ - 6)
    this.archGroup.add(northBackdrop)

    // Soft ambient-occlusion strip along the base of the North back wall
    const northAoGeo = new THREE.PlaneGeometry(floorTotalW, 0.9)
    northAoGeo.rotateX(-Math.PI / 2)
    northAoGeo.translate(0, 0.007, wallFaceZ + 0.45)
    const northAoMesh = new THREE.Mesh(
      northAoGeo,
      new THREE.MeshBasicMaterial({
        map: stripAoTex,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      })
    )
    northAoMesh.name = "office-north-wall-ao"
    this.archGroup.add(northAoMesh)

    yield 0.14

    // 2. Warm overhead ceiling-light glow pools on the cream stone floor (merged into 1 draw call!)
    const glowPoolTex = createOfficeGlowPoolTexture()
    const poolGeos: THREE.BufferGeometry[] = []
    const lightPools: readonly [number, number, number, number][] = [
      [440, 290, 5.4, 4.2], // Bàn sếp
      [1210, 310, 6.2, 4.6], // Phòng họp
      [930, 820, 9.6, 5.2], // Khu làm việc Band 0
      [930, 1200, 9.6, 5.2], // Khu làm việc Band 1
      [2060, 760, 5.4, 4.8], // Góc nghỉ
      [2070, 1240, 5.2, 4.4], // Góc thành tích
    ]
    for (const [lx, ly, pw, pd] of lightPools) {
      const pt = logicalToWorld(lx, ly, this.world)
      const geo = new THREE.PlaneGeometry(pw, pd)
      geo.rotateX(-Math.PI / 2)
      geo.translate(pt.x, 0.014, pt.z)
      poolGeos.push(geo)
    }
    const mergedPools = mergeIndexedGeometries(poolGeos, { disposeInputs: true })
    if (mergedPools) {
      const poolMesh = new THREE.Mesh(
        mergedPools,
        new THREE.MeshBasicMaterial({
          map: glowPoolTex,
          transparent: true,
          opacity: this.lite ? 0.12 : 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      poolMesh.name = "office-glow-pools"
      this.archGroup.add(poolMesh)
    }

    yield 0.2

    // 3. Large Bordered Zone Rugs (KGD style) + Painted Floor Zone Decals
    for (const rug of getZoneRugs(worldH)) {
      const pt = this.toWorldCenter(rug.x, rug.y, rug.w, rug.h)
      mountBorderedZoneRug(this.archGroup, {
        wx: pt.x,
        wz: pt.z,
        widthU: rug.w * s,
        depthU: rug.h * s,
        shape: rug.shape,
        fillHex: rug.colorHex,
        borderHex: rug.borderHex,
        innerBorderHex: rug.innerBorderHex,
        y: 0.011,
        lite: this.lite,
      })
    }

    for (const label of getOfficeFloorLabels()) {
      const tex = createFloorDecalTexture(label.text, "#7a5324")
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(label.widthU, label.heightU),
        mat
      )
      mesh.name = `office-zone-label-${label.id}`
      mesh.rotation.x = -Math.PI / 2
      const pt = logicalToWorld(label.x, label.y, this.world)
      mesh.position.set(pt.x, 0.022, pt.z)
      this.archGroup.add(mesh)
    }

    yield 0.28

    // 4. ONE Grand North Back Wall (matching KGD architectural detailing: cream plaster,
    //    navy wainscoting dado, dark skirting, gold chair rail & crown cornice, fluted pilasters,
    //    warm brass wall sconces, recessed light cove, extended wings past ±roomW/2).
    const wallSpanW = roomW + NORTH_WALL_EXTEND_U * 2
    const wallThick = 0.44
    const wallCenterZ = wallFaceZ - wallThick / 2

    archBatch.addBox(wallSpanW, NORTH_WALL_H, wallThick, palette.wallCream, 0, NORTH_WALL_H / 2, wallCenterZ, false)
    archBatch.addBox(wallSpanW, 0.96, 0.08, palette.wallDadoNavy, 0, 0.48, wallFaceZ + 0.02, false)
    archBatch.addBox(wallSpanW, 0.2, 0.12, palette.skirtingDark, 0, 0.1, wallFaceZ + 0.05, false)
    archBatch.addBox(wallSpanW, 0.032, 0.135, palette.gold, 0, 0.21, wallFaceZ + 0.055, false)
    archBatch.addBox(wallSpanW, 0.068, 0.12, palette.gold, 0, 0.98, wallFaceZ + 0.035, false)
    archBatch.addBox(wallSpanW + 0.2, 0.22, wallThick + 0.16, palette.wallDadoNavy, 0, NORTH_WALL_H + 0.07, wallCenterZ + 0.04, false)
    archBatch.addBox(wallSpanW + 0.24, 0.07, 0.14, palette.gold, 0, NORTH_WALL_H - 0.03, wallFaceZ + 0.08, false)
    // Recessed ceiling-light cove glow strip beneath the north cornice
    archBatch.addBox(wallSpanW - 0.8, 0.05, 0.08, palette.warmGlow, 0, NORTH_WALL_H - 0.14, wallFaceZ + 0.07, false)

    // Recessed dado molding frames along lower north wall bays
    for (const [x0, x1] of [
      [270, 710],
      [810, 1260],
      [1310, 1650],
    ] as const) {
      const mid = logicalToWorld((x0 + x1) / 2, OFFICE_NORTH_WALL_Y, this.world).x
      const span = (x1 - x0) * s
      archBatch.addBox(span, 0.48, 0.03, palette.skirtingDark, mid, 0.58, wallFaceZ + 0.065, false)
      archBatch.addBox(span + 0.06, 0.028, 0.04, palette.brassDark, mid, 0.83, wallFaceZ + 0.07, false)
      archBatch.addBox(span + 0.06, 0.028, 0.04, palette.brassDark, mid, 0.33, wallFaceZ + 0.07, false)
    }

    // 5 Fluted Cream Pilasters with tiered plinths, gold capitals & warm brass wall sconces
    for (const lx of [24, 748, 1292, 1666, 2376]) {
      const px = logicalToWorld(lx, OFFICE_NORTH_WALL_Y, this.world).x
      archBatch.addBox(0.5, 0.3, 0.28, palette.skirtingDark, px, 0.15, wallFaceZ + 0.09, false)
      archBatch.addBox(0.46, 0.065, 0.26, palette.gold, px, 0.32, wallFaceZ + 0.09, false)
      archBatch.addBox(0.38, NORTH_WALL_H - 0.52, 0.22, palette.pilasterCream, px, 0.34 + (NORTH_WALL_H - 0.52) / 2, wallFaceZ + 0.07, false)
      archBatch.addBox(0.065, NORTH_WALL_H - 1.1, 0.04, palette.pilasterFlute, px - 0.09, NORTH_WALL_H / 2 + 0.08, wallFaceZ + 0.18, false)
      archBatch.addBox(0.065, NORTH_WALL_H - 1.1, 0.04, palette.pilasterFlute, px + 0.09, NORTH_WALL_H / 2 + 0.08, wallFaceZ + 0.18, false)
      archBatch.addBox(0.48, 0.1, 0.28, palette.gold, px, NORTH_WALL_H - 0.2, wallFaceZ + 0.09, false)
      archBatch.addBox(0.52, 0.065, 0.32, palette.gold, px, NORTH_WALL_H - 0.08, wallFaceZ + 0.1, false)
      // Warm glowing brass sconce
      archBatch.addBox(0.11, 0.22, 0.08, palette.brassDark, px, 3.05, wallFaceZ + 0.2, false)
      archBatch.addCylinder(0.068, 0.06, 0.3, seg, palette.warmGlow, px, 3.1, wallFaceZ + 0.27, false)
      archBatch.addCylinder(0.082, 0.082, 0.04, seg, palette.gold, px, 3.26, wallFaceZ + 0.27, false)
      archBatch.addCylinder(0.078, 0.078, 0.04, seg, palette.gold, px, 2.94, wallFaceZ + 0.27, false)
    }

    yield 0.36

    // 5. North Back Wall Features:
    //    - Team LED Board header beam + live status LEDs + Stock-Ticker LED Ribbon below it
    //    - 3 World Market Clocks (VN · TYO · NYC)
    //    - Panoramic City-Skyline Window Strips + sunlit floor pools
    //    - Framed Wall Art & Acoustic wood slats behind Meeting Screen
    //    - Ceiling-less Hanging Pendant Lamp silhouettes near North wall
    const teamX = logicalToWorld(1040, OFFICE_NORTH_WALL_Y, this.world).x
    archBatch.addBox(4.92, 0.18, 0.2, palette.obsidian, teamX, 3.4, wallFaceZ + 0.12, false)
    archBatch.addBox(4.98, 0.04, 0.22, palette.gold, teamX, 3.5, wallFaceZ + 0.13, false)
    for (let i = 0; i < 3; i += 1) {
      archBatch.addSphere(
        0.036,
        seg,
        seg,
        i === 0 ? palette.ledGreen : palette.warmGlow,
        teamX - 2.2 + i * 0.18,
        3.4,
        wallFaceZ + 0.23,
        false
      )
    }

    // Small Stock-Ticker LED Ribbon directly below the Team Board (zero per-frame work!)
    const tickerW = 4.78
    const tickerH = 0.28
    const tickerY = 1.54
    archBatch.addBox(tickerW + 0.14, tickerH + 0.07, 0.1, palette.obsidian, teamX, tickerY, wallFaceZ + 0.09, false)
    const tickerTex = createOfficeStockTickerTexture(this.lite)
    const tickerMat = new THREE.MeshStandardMaterial({
      map: tickerTex,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tickerTex,
      emissiveIntensity: 0.52,
      roughness: 0.28,
      metalness: 0.05,
    })
    const tickerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(tickerW, tickerH),
      tickerMat
    )
    tickerMesh.name = "office-stock-ticker-ribbon"
    tickerMesh.position.set(teamX, tickerY, wallFaceZ + 0.15)
    this.archGroup.add(tickerMesh)

    // 3 World Market Clocks above the Team Board
    addWorldClocks(archBatch, palette, this.archGroup, teamX, wallFaceZ, 3.84, this.lite)

    // Panoramic City-Skyline Window Strips along the North back wall
    const skylineTex = createCitySkylineTexture(this.lite)
    const skylineMat = new THREE.MeshStandardMaterial({
      map: skylineTex,
      emissive: new THREE.Color("#fff7e8"),
      emissiveMap: skylineTex,
      emissiveIntensity: 0.34,
      roughness: 0.24,
      metalness: 0.08,
    })
    for (const win of getOfficeNorthWindows()) {
      const wx = logicalToWorld(win.x, OFFICE_NORTH_WALL_Y, this.world).x
      addSkylineWindowToBatch(archBatch, palette, skylineMat, {
        wx,
        wallFaceZ,
        widthU: win.span * s,
        heightU: win.heightU,
        centerY: win.centerY,
        mullions: win.mullions,
        sunPool: win.sunPool,
      })
    }

    // Framed Wall Art above Boss Award Shelf & Archive Bookshelves
    const bossArtX = logicalToWorld(168, OFFICE_NORTH_WALL_Y, this.world).x
    archBatch.addBox(1.42, 0.88, 0.04, palette.gold, bossArtX, 2.66, wallFaceZ + 0.04, false)
    const crestMat = new THREE.MeshStandardMaterial({
      map: createWallArtPrintTexture("crest"),
      roughness: 0.36,
    })
    const crestFace = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.78), crestMat)
    crestFace.position.set(bossArtX, 2.66, wallFaceZ + 0.068)
    this.archGroup.add(crestFace)

    const docsSignX = logicalToWorld(1888, OFFICE_NORTH_WALL_Y, this.world).x
    const docsSignTex = createSignTexture("KHO TÀI LIỆU IQX", {
      style: "navy_gold",
      subtext: "Quy trình · Báo cáo · KPI",
      width: 384,
      height: 112,
    })
    archBatch.addBox(1.78, 0.56, 0.04, palette.gold, docsSignX, 2.54, wallFaceZ + 0.04, false)
    const docsSignFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.48),
      new THREE.MeshStandardMaterial({ map: docsSignTex, roughness: 0.35 })
    )
    docsSignFace.position.set(docsSignX, 2.54, wallFaceZ + 0.068)
    this.archGroup.add(docsSignFace)

    // Acoustic wood slat backdrop behind the Meeting Room Live Screen
    const meetX = logicalToWorld(1470, OFFICE_NORTH_WALL_Y, this.world).x
    const slatCount = this.lite ? 9 : 15
    for (let i = 0; i < slatCount; i += 1) {
      const offset = -1.68 + (i * 3.36) / Math.max(1, slatCount - 1)
      archBatch.addBox(0.068, 1.85, 0.035, palette.slatWood, meetX + offset, 2.02, wallFaceZ + 0.035, false)
    }

    // Ceiling-less Hanging Pendant Lamps near the North back wall
    const pendantXs = [440, 1040, 1470, 1890].map(
      (lx) => logicalToWorld(lx, OFFICE_NORTH_WALL_Y, this.world).x
    )
    addHangingPendantsToBatch(archBatch, palette, pendantXs, wallFaceZ + 1.1, this.lite)

    yield 0.46

    // 6. North-Zone Furniture (ZERO walls or glass partitions between them!):
    //    - BÀN SẾP: Award Bookshelf (w/ golden trophy & globe), Guest Sofa, Standing Floor Lamp
    const bossShelf = createBookshelf(1.84, 1.82, 0.48, { lite: this.lite })
    const bossShelfPt = this.toWorldCenter(
      OFFICE_NORTH_PROPS.bossShelf.x,
      OFFICE_NORTH_PROPS.bossShelf.y,
      OFFICE_NORTH_PROPS.bossShelf.w,
      OFFICE_NORTH_PROPS.bossShelf.h
    )
    bossShelf.group.position.set(bossShelfPt.x, 0, bossShelfPt.z)
    this.mountStaticProp(bossShelf)
    shadows.add(bossShelfPt.x, bossShelfPt.z + 0.06, 2.1, 0.8, boxShadowTex, 0.55)

    // Trophy & Blue Globe perched atop Boss Award Shelf
    archBatch.addCylinder(0.1, 0.055, 0.16, seg, palette.gold, bossShelfPt.x - 0.42, 1.96, bossShelfPt.z, false)
    archBatch.addBox(0.15, 0.055, 0.15, palette.skirtingDark, bossShelfPt.x - 0.42, 1.85, bossShelfPt.z, false)
    archBatch.addSphere(0.1, seg, seg, palette.blueAccent, bossShelfPt.x + 0.42, 1.99, bossShelfPt.z, false)
    archBatch.addBox(0.14, 0.045, 0.14, palette.gold, bossShelfPt.x + 0.42, 1.85, bossShelfPt.z, false)

    const bossSofa = createSofa(1.32, 0.64, "#24365e", { lite: this.lite })
    const bossSofaPt = this.toWorldCenter(
      OFFICE_NORTH_PROPS.bossSofa.x,
      OFFICE_NORTH_PROPS.bossSofa.y,
      OFFICE_NORTH_PROPS.bossSofa.w,
      OFFICE_NORTH_PROPS.bossSofa.h
    )
    bossSofa.group.position.set(bossSofaPt.x, 0, bossSofaPt.z)
    this.mountStaticProp(bossSofa)
    shadows.add(bossSofaPt.x, bossSofaPt.z, 1.62, 0.96, boxShadowTex, 0.58)

    const bossLampPt = logicalToWorld(744, 344, this.world)
    addStandingLampToBatch(archBatch, palette, bossLampPt.x, bossLampPt.z, this.lite)

    yield 0.54

    //    - PHÒNG HỌP: AV Credenza, Pill Conference Table + 8 Chairs, Low Planter Soft Border, Whiteboard Easel
    const credPt = this.toWorldCenter(
      OFFICE_NORTH_PROPS.meetCredenza.x,
      OFFICE_NORTH_PROPS.meetCredenza.y,
      OFFICE_NORTH_PROPS.meetCredenza.w,
      OFFICE_NORTH_PROPS.meetCredenza.h
    )
    archBatch.addBevelBox(2.7, 0.54, 0.46, 0.02, palette.wallDadoNavy, credPt.x, 0.27, credPt.z, this.lite)
    archBatch.addBox(2.76, 0.048, 0.5, palette.oakWood, credPt.x, 0.564, credPt.z, false)
    archBatch.addBox(1.05, 0.07, 0.11, palette.obsidian, credPt.x, 0.625, credPt.z + 0.08, false)

    const confTable = createConferenceTable(4.1, 1.46, 8, { lite: this.lite })
    const confPt = this.toWorldCenter(
      OFFICE_NORTH_PROPS.conferenceTable.x,
      OFFICE_NORTH_PROPS.conferenceTable.y,
      OFFICE_NORTH_PROPS.conferenceTable.w,
      OFFICE_NORTH_PROPS.conferenceTable.h
    )
    confTable.group.position.set(confPt.x, 0, confPt.z)
    this.mountStaticProp(confTable)
    shadows.add(confPt.x, confPt.z, 4.5, 1.9, boxShadowTex, 0.6)

    // Low wooden planter boxes forming a soft green open-floor border around PHÒNG HỌP
    for (const pl of getMeetingPlanters()) {
      const pt = this.toWorldCenter(pl.x, pl.y, pl.w, pl.h)
      addLowPlanterToBatch(archBatch, palette, pt.x, pt.z, pl.w * s, pl.h * s, this.lite)
      shadows.add(pt.x, pt.z, pl.w * s + 0.2, pl.h * s + 0.2, boxShadowTex, 0.48)
    }

    const wbPt = this.toWorldCenter(
      OFFICE_NORTH_PROPS.whiteboard.x,
      OFFICE_NORTH_PROPS.whiteboard.y,
      OFFICE_NORTH_PROPS.whiteboard.w,
      OFFICE_NORTH_PROPS.whiteboard.h
    )
    addWhiteboardEasel(archBatch, palette, this.archGroup, wbPt.x, wbPt.z, -Math.PI / 2, this.lite)

    yield 0.62

    //    - TÀI LIỆU: 2 Archive Bookshelves flush against North wall + Reading Desk
    for (const sh of [OFFICE_NORTH_PROPS.docsShelf1, OFFICE_NORTH_PROPS.docsShelf2]) {
      const shelf = createBookshelf(sh.w * s, 1.86, sh.h * s, { lite: this.lite })
      const pt = this.toWorldCenter(sh.x, sh.y, sh.w, sh.h)
      shelf.group.position.set(pt.x, 0, pt.z)
      this.mountStaticProp(shelf)
      shadows.add(pt.x, pt.z + 0.06, sh.w * s + 0.24, sh.h * s + 0.3, boxShadowTex, 0.55)
    }
    const readingDesk = createOfficeDesk({
      variant: "reading",
      width: OFFICE_NORTH_PROPS.readingDesk.w * s,
      depth: OFFICE_NORTH_PROPS.readingDesk.h * s,
      withChair: false,
      hasMug: false,
      lite: this.lite,
    })
    const readPt = this.toWorldCenter(
      OFFICE_NORTH_PROPS.readingDesk.x,
      OFFICE_NORTH_PROPS.readingDesk.y,
      OFFICE_NORTH_PROPS.readingDesk.w,
      OFFICE_NORTH_PROPS.readingDesk.h
    )
    readingDesk.group.position.set(readPt.x, 0, readPt.z)
    this.mountStaticProp(readingDesk)
    shadows.add(readPt.x, readPt.z, 2.25, 1.15, boxShadowTex, 0.56)

    yield 0.7

    // 7. GÓC NGHỈ (East Break Zone: Espresso Bar, Water Cooler, Snack Shelf, Sofa, Coffee Table,
    //    Standing Lamp, Chibi Foosball Table & Mini Retro Arcade Cabinet!)
    const coffeeBar = createPantryCounter(
      OFFICE_LOUNGE_PROPS.coffeeBar.w * s,
      OFFICE_LOUNGE_PROPS.coffeeBar.h * s,
      { lite: this.lite }
    )
    const coffeePt = this.toWorldCenter(
      OFFICE_LOUNGE_PROPS.coffeeBar.x,
      OFFICE_LOUNGE_PROPS.coffeeBar.y,
      OFFICE_LOUNGE_PROPS.coffeeBar.w,
      OFFICE_LOUNGE_PROPS.coffeeBar.h
    )
    coffeeBar.group.position.set(coffeePt.x, 0, coffeePt.z)
    this.mountStaticProp(coffeeBar)
    shadows.add(coffeePt.x, coffeePt.z, 1.95, 0.9, boxShadowTex, 0.56)

    const coolerPt = this.toWorldCenter(
      OFFICE_LOUNGE_PROPS.waterCooler.x,
      OFFICE_LOUNGE_PROPS.waterCooler.y,
      OFFICE_LOUNGE_PROPS.waterCooler.w,
      OFFICE_LOUNGE_PROPS.waterCooler.h
    )
    addWaterCoolerToBatch(archBatch, palette, coolerPt.x, coolerPt.z, this.lite)
    shadows.add(coolerPt.x, coolerPt.z, 0.72, 0.72, ovalShadowTex, 0.52)

    const snackPt = this.toWorldCenter(
      OFFICE_LOUNGE_PROPS.snackShelf.x,
      OFFICE_LOUNGE_PROPS.snackShelf.y,
      OFFICE_LOUNGE_PROPS.snackShelf.w,
      OFFICE_LOUNGE_PROPS.snackShelf.h
    )
    addSnackShelfToBatch(
      archBatch,
      palette,
      snackPt.x,
      snackPt.z,
      OFFICE_LOUNGE_PROPS.snackShelf.w * s,
      OFFICE_LOUNGE_PROPS.snackShelf.h * s,
      this.lite
    )
    shadows.add(snackPt.x, snackPt.z, 1.9, 0.8, boxShadowTex, 0.52)

    const loungeSofa = createSofa(
      OFFICE_LOUNGE_PROPS.sofa.w * s,
      OFFICE_LOUNGE_PROPS.sofa.h * s,
      "#23395d",
      { lite: this.lite }
    )
    const loungeSofaPt = this.toWorldCenter(
      OFFICE_LOUNGE_PROPS.sofa.x,
      OFFICE_LOUNGE_PROPS.sofa.y,
      OFFICE_LOUNGE_PROPS.sofa.w,
      OFFICE_LOUNGE_PROPS.sofa.h
    )
    loungeSofa.group.position.set(loungeSofaPt.x, 0, loungeSofaPt.z)
    this.mountStaticProp(loungeSofa)
    shadows.add(loungeSofaPt.x, loungeSofaPt.z, 2.2, 1.0, boxShadowTex, 0.58)

    const loungeTable = createCoffeeTable(
      OFFICE_LOUNGE_PROPS.coffeeTable.w * s,
      OFFICE_LOUNGE_PROPS.coffeeTable.h * s,
      { lite: this.lite }
    )
    const loungeTablePt = this.toWorldCenter(
      OFFICE_LOUNGE_PROPS.coffeeTable.x,
      OFFICE_LOUNGE_PROPS.coffeeTable.y,
      OFFICE_LOUNGE_PROPS.coffeeTable.w,
      OFFICE_LOUNGE_PROPS.coffeeTable.h
    )
    loungeTable.group.position.set(loungeTablePt.x, 0, loungeTablePt.z)
    this.mountStaticProp(loungeTable)
    shadows.add(loungeTablePt.x, loungeTablePt.z, 1.4, 0.78, boxShadowTex, 0.5)

    const loungeLampPt = logicalToWorld(2052, 756, this.world)
    addStandingLampToBatch(archBatch, palette, loungeLampPt.x, loungeLampPt.z, this.lite)

    const foosPt = this.toWorldCenter(
      OFFICE_LOUNGE_PROPS.foosball.x,
      OFFICE_LOUNGE_PROPS.foosball.y,
      OFFICE_LOUNGE_PROPS.foosball.w,
      OFFICE_LOUNGE_PROPS.foosball.h
    )
    addFoosballTableToBatch(
      archBatch,
      palette,
      foosPt.x,
      foosPt.z,
      OFFICE_LOUNGE_PROPS.foosball.w * s,
      OFFICE_LOUNGE_PROPS.foosball.h * s,
      this.lite
    )
    shadows.add(foosPt.x, foosPt.z, 1.78, 1.15, boxShadowTex, 0.55)

    const arcPt = this.toWorldCenter(
      OFFICE_LOUNGE_PROPS.arcade.x,
      OFFICE_LOUNGE_PROPS.arcade.y,
      OFFICE_LOUNGE_PROPS.arcade.w,
      OFFICE_LOUNGE_PROPS.arcade.h
    )
    addMiniArcadeCabinet(archBatch, palette, this.archGroup, arcPt.x, arcPt.z, this.lite)
    shadows.add(arcPt.x, arcPt.z, 0.8, 0.8, boxShadowTex, 0.55)

    yield 0.78

    // 8. GÓC THÀNH TÍCH (3 Tiered Marble/Gold Trophy Pedestals, Twin Framed Certificate Easels,
    //    and Brass Stanchions flanking the Live Achievement Standee!)
    const pedPt = this.toWorldCenter(
      OFFICE_AWARDS_PROPS.pedestals.x,
      OFFICE_AWARDS_PROPS.pedestals.y,
      OFFICE_AWARDS_PROPS.pedestals.w,
      OFFICE_AWARDS_PROPS.pedestals.h
    )
    addTrophyPedestalsToBatch(archBatch, palette, pedPt.x, pedPt.z, this.lite)
    shadows.add(pedPt.x, pedPt.z, 2.35, 0.9, boxShadowTex, 0.58)

    const standeeCenter = this.toWorldCenter(
      OFFICE_AWARDS_PROPS.standee.x,
      OFFICE_AWARDS_PROPS.standee.y,
      OFFICE_AWARDS_PROPS.standee.w,
      OFFICE_AWARDS_PROPS.standee.h
    )
    for (const side of [-1, 1] as const) {
      const px = standeeCenter.x + side * 1.24
      const pz = standeeCenter.z + 0.14
      archBatch.addCylinder(0.095, 0.11, 0.04, seg, palette.gold, px, 0.02, pz, false)
      archBatch.addCylinder(0.024, 0.028, 0.68, 7, palette.gold, px, 0.36, pz, true)
      archBatch.addSphere(0.044, 7, 6, palette.gold, px, 0.72, pz, false)
    }
    shadows.add(standeeCenter.x, standeeCenter.z, 2.3, 0.82, boxShadowTex, 0.6)

    const easelWPt = this.toWorldCenter(
      OFFICE_AWARDS_PROPS.easelWest.x,
      OFFICE_AWARDS_PROPS.easelWest.y,
      OFFICE_AWARDS_PROPS.easelWest.w,
      OFFICE_AWARDS_PROPS.easelWest.h
    )
    addCertificateEasel(
      archBatch,
      palette,
      this.archGroup,
      easelWPt.x,
      easelWPt.z,
      "CHỨNG NHẬN",
      "NHÓM XUẤT SẮC QUÝ",
      0.32,
      this.lite
    )

    const easelEPt = this.toWorldCenter(
      OFFICE_AWARDS_PROPS.easelEast.x,
      OFFICE_AWARDS_PROPS.easelEast.y,
      OFFICE_AWARDS_PROPS.easelEast.w,
      OFFICE_AWARDS_PROPS.easelEast.h
    )
    addCertificateEasel(
      archBatch,
      palette,
      this.archGroup,
      easelEPt.x,
      easelEPt.z,
      "VINH DANH KPI",
      "SACO TIÊU BIỂU",
      -0.32,
      this.lite
    )

    // South tidy supply & copier credenza
    const printer = getPrinterStationRect(worldH)
    const prPt = this.toWorldCenter(printer.x, printer.y, printer.w, printer.h)
    addPrinterCredenzaToBatch(
      archBatch,
      palette,
      prPt.x,
      prPt.z,
      printer.w * s,
      printer.h * s,
      this.lite
    )
    shadows.add(prPt.x, prPt.z, printer.w * s + 0.32, printer.h * s + 0.32, boxShadowTex, 0.54)

    // Subtle warm accent lights (desktop only to keep mobile shader/fill light fast)
    if (!this.lite) {
      const teamGlow = new THREE.PointLight(0xffe6b3, 1.05, 11, 1.55)
      teamGlow.position.set(teamX, 3.1, wallFaceZ + 2.2)
      this.archGroup.add(teamGlow)

      const loungeGlow = new THREE.PointLight(0xffdfb0, 0.85, 9.5, 1.6)
      loungeGlow.position.set(loungeSofaPt.x + 0.5, 2.8, loungeSofaPt.z)
      this.archGroup.add(loungeGlow)
    }

    yield 0.86

    // Flush batched architecture & zone props into minimal merged draw calls, disposing unused palette mats
    const usedMats = archBatch.flushInto(this.archGroup)
    palette.disposeUnused(usedMats)

    // Merge static furniture-builder props per material
    mergeStaticPropsInto(this.staticProps, this.archGroup)

    yield 0.94

    // 9. Instanced Potted Plants & Corner Trees (3 distinct varieties: fiddle, monstera, snake!)
    const plantTransforms: OfficePlantTransform[] = []
    for (const p of getOfficePlants(worldH)) {
      const pt = logicalToWorld(p.x, p.y, this.world)
      plantTransforms.push({
        x: pt.x,
        z: pt.z,
        kind: p.kind,
        scale: p.scale,
      })
      const r = p.kind === "fiddle" ? 0.92 : p.kind === "monstera" ? 0.82 : 0.66
      shadows.add(pt.x, pt.z, r, r, ovalShadowTex, 0.54)
    }
    mountInstancedOfficePlants(this.archGroup, plantTransforms, this.lite)

    // Flush all contact shadows into 1–2 merged draw calls
    shadows.flushInto(this.archGroup)

    freezeStaticSubtree(this.archGroup)
    this.hostBridge?.markShadowDirty()
  }

  private mountStaticProp(prop: DisposableProp): void {
    this.archGroup.add(prop.group)
    this.staticProps.push(prop)
  }

  /**
   * Builds all open-plan staff desk pods (`totalDesks >= 24`) via `InstancedMesh`:
   * - Shared beveled oak desks, ergonomic swivel chairs, candlestick chart monitors (ON/OFF),
   *   low acoustic pod dividers, rich cable-free desk clutter (mugs, mini succulents, stacked
   *   folders, pastel sticky notes, pen cups), "Bàn trống" plates, and ONE packed atlas for all
   *   member nameplates!
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

    // 1. Instanced Desk Bodies
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

    yield 0.54

    // 2. Instanced Ergonomic Swivel Chairs
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
    const clutterSlots: DeskClutterSlot[] = []

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

      clutterSlots.push({
        wx: pt.x,
        wz: pt.z,
        deskW,
        deskD,
        topY: topSurfaceY,
        facingSouth: isSouth,
        index: slot.index,
        occupied: slot.occupied,
        hasMug: Boolean(slot.member?.hasMug),
      })

      if (slot.occupied) {
        occupiedSlots.push(slot)
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

    // 3. Instanced Monitor Screens (Candlestick Charts ON vs dark standby OFF) + Status LEDs
    const screenGeo = new THREE.PlaneGeometry(0.51, 0.28)
    const ledGeo = new THREE.SphereGeometry(0.0085, 6, 5)
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
      const candleTex = createCandlestickMonitorTexture(this.lite)
      const monitorOnMat = new THREE.MeshStandardMaterial({
        map: candleTex,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: candleTex,
        emissiveIntensity: 0.56,
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

    // 4. Instanced Cable-Free Chibi Desk Clutter (mugs, mini succulents, folders, sticky notes, pen cups)
    mountInstancedDeskClutter(this.teamPropsGroup, clutterSlots, this.lite)

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

    // 6. Instanced Neutral "Bàn trống" Nameplates on all empty desks
    const plateW = 0.96
    const plateH = 0.2

    if (emptySlots.length > 0) {
      const emptyBaseMat = createMatteMaterial("#6f5234", { roughness: 0.56 })
      const emptyBezelMat = createMatteMaterial("#161f33", {
        roughness: 0.34,
        metalness: 0.22,
      })
      const holderBatch = new OfficeDecorBatcher()
      holderBatch.addBox(plateW + 0.04, 0.024, 0.088, emptyBaseMat, 0, 0.012, 0, false)
      holderBatch.addBevelBox(
        plateW,
        plateH,
        0.036,
        0.01,
        emptyBezelMat,
        0,
        0.1,
        0,
        this.lite,
        false,
        true,
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

    // 7. Member Desk Nameplates packed into ONE atlas texture (self + others share `.material`)
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

        const memberHolderBatch = new OfficeDecorBatcher()
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

          memberHolderBatch.addBox(
            plateW + 0.05,
            0.026,
            0.092,
            (isSelf ? plateGoldBaseMat : plateBaseMat)!,
            pt.x,
            topSurfaceY + 0.013,
            plateZ,
            false
          )
          memberHolderBatch.add(
            chibiBevelBox(plateW + 0.02, plateH + 0.01, 0.04, 0.01, this.lite),
            (isSelf ? plateGoldBaseMat : plateBezelMat)!,
            [pt.x, topSurfaceY + 0.105, plateZ],
            [-0.24, 0, 0],
            undefined,
            false
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
   * Rebuilds Boss Desk, Team Banner Rug ("IQX · NHÓM {TÊN SẾP}"), and ALL furnished
   * open-plan staff desk pods (expanding architecture if `worldH` grew).
   */
  rebuildTeamProps(
    bossName: string,
    desks: readonly OfficeDeskPlacement[],
    selfUserId: string | null,
    worldH: number,
    totalDesks?: number
  ): void {
    runBuildSync(
      this.rebuildTeamPropsSteps(
        bossName,
        desks,
        selfUserId,
        worldH,
        totalDesks
      )
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
      this.positionLiveBoards()
      yield* this.buildArchitectureSteps(worldH)
    }

    this.clearTeamProps()
    yield 0.1

    // 1. Boss Executive Desk with dual monitors, mug, swivel chair & walnut nameplate
    const bossLabel = bossName.trim()
      ? `Bàn sếp · ${bossName.trim()}`
      : "Bàn sếp"
    const bossDesk = createOfficeDesk({
      variant: "boss",
      width: OFFICE_NORTH_PROPS.bossDesk.w * OFFICE_WORLD_SCALE,
      depth: OFFICE_NORTH_PROPS.bossDesk.h * OFFICE_WORLD_SCALE,
      dualMonitor: true,
      hasMug: true,
      withChair: true,
      nameplate: bossLabel,
      highlightGold: false,
      lite: this.lite,
    })
    const bossPt = this.toWorldCenter(
      OFFICE_NORTH_PROPS.bossDesk.x,
      OFFICE_NORTH_PROPS.bossDesk.y,
      OFFICE_NORTH_PROPS.bossDesk.w,
      OFFICE_NORTH_PROPS.bossDesk.h
    )
    bossDesk.group.position.set(bossPt.x, 0, bossPt.z)
    this.teamPropsGroup.add(bossDesk.group)
    this.teamProps.push(bossDesk)
    mergeStaticPropsInto([bossDesk], this.teamPropsGroup)
    yield 0.28

    // 2. Walkable Team Banner Rug ("IQX · NHÓM {TÊN SẾP}") centered on the Staff Promenade
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
    const bannerFace = new THREE.Mesh(
      new THREE.PlaneGeometry(bannerRect.w * s, bannerRect.h * s),
      bannerMat
    )
    bannerFace.name = "office-team-banner-rug"
    bannerFace.rotation.x = -Math.PI / 2
    bannerFace.position.set(bannerPt.x, 0.018, bannerPt.z)
    bannerFace.receiveShadow = true
    this.teamPropsGroup.add(bannerFace)

    // 3. Full Open-Plan Staff Desk Pod Grid (occupied + empty desks via InstancedMesh!)
    const dims = computeOfficeDimensions(desks.length)
    const resolvedTotal = totalDesks ?? dims.totalDesks
    const podBands = Math.max(dims.podBands, Math.ceil(resolvedTotal / 12))
    const allSlots = buildAllDeskSlots(desks, resolvedTotal)
    yield 0.44
    yield* this.buildInstancedStaffPodsSteps(allSlots, podBands, selfUserId)

    freezeStaticSubtree(this.teamPropsGroup)
    this.hostBridge?.markShadowDirty()
    this.hostBridge?.requestFrame()
  }

  /** Re-flags dynamic canvas textures after a WebGL context restore. */
  refreshDynamicTextures(): void {
    if (this.disposed) return
    this.teamBoard.update()
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

  /**
   * Repaints both the live Freestanding Achievement Standee AND the Grand North-Wall Team LED Board
   * ("IQX · {Tên nhóm}" + monthly Top 3 / KPI strip) only on content change.
   */
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
      if (sig !== this.lastTeamBoardSig) {
        this.lastTeamBoardSig = sig
        drawTeamLedBoard(this.teamBoardCanvas, {
          teamTitle,
          monthLabel: "Mục tiêu tháng",
          top3: [],
        })
        this.teamBoard.update()
      }
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
    const boardSig = `${teamTitle}|${monthLabel}|${top3.map((e) => `${e.rank}:${e.name}:${e.points}`).join(",")}`
    const standeeSig = `${boardSig}|${personalRank ? `${personalRank.rank}:${personalRank.points}` : ""}`

    if (boardSig !== this.lastTeamBoardSig) {
      this.lastTeamBoardSig = boardSig
      drawTeamLedBoard(this.teamBoardCanvas, {
        teamTitle,
        monthLabel: `Tháng ${leaderboard.monthNumber}`,
        top3,
        totalRanked: leaderboard.totalRanked,
      })
      this.teamBoard.update()
    }

    if (standeeSig === this.lastStandeeSig) return
    this.lastStandeeSig = standeeSig

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
    if (this.buildSteps) {
      this.buildSteps.return()
      this.buildSteps = null
    }
    this.clearStaticProps()
    this.clearTeamProps()
    this.teamBoard.dispose()
    this.meetingBoard.dispose()
    this.standeeBoard.dispose()
    disposeObject3D(this.group)
    this.group.parent?.remove(this.group)
  }
}
