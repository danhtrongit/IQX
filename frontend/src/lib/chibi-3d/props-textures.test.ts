import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { IndexQuote, Quote } from "@/pages/trading-floor/net/market/types.ts"
import type { PostCard } from "@/pages/trading-floor/net/types.ts"

import {
  createAchievementStandee,
  createBookshelf,
  createCoffeeTable,
  createConferenceTable,
  createDocumentShelf,
  createLantern,
  createOfferingAltar,
  createOfficeDesk,
  createPantryCounter,
  createPottedPlant,
  createReceptionDesk,
  createRug,
  createSofa,
  createStatuePodium,
  createThanTaiShrine,
  createWallBoardFrame,
  disposeFurnitureCaches,
  isFurnitureLiteMode,
  setFurnitureLiteMode,
  type DisposableProp,
  type LiveBoardProp,
} from "./furniture-builder.ts"
import {
  createAltarClothTexture,
  createFabricSurfaceTexture,
  createFloorDecalTexture,
  createFloorTexture,
  createMarbleSurfaceTexture,
  createMonitorScreenTexture,
  createSignTexture,
  createWallTexture,
  createWoodSurfaceTexture,
  drawLedMarketBoard,
  drawOfficeMeetingScreen,
  drawOfficeStandee,
  drawSacoBoard,
  formatStandeePersonalRank,
  type WallTextureStyle,
  type WoodSurfaceTone,
} from "./textures.ts"
import { disposeObject3D, type FloorTextureStyle } from "./types.ts"

function countTriangles(root: THREE.Object3D): number {
  let tris = 0
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const index = mesh.geometry.index
    const pos = mesh.geometry.getAttribute("position")
    const baseTris = index ? index.count / 3 : pos ? pos.count / 3 : 0
    const count = node instanceof THREE.InstancedMesh ? node.count : 1
    tris += baseTris * count
  })
  return Math.round(tris)
}

function countDrawCalls(root: THREE.Object3D): number {
  let meshes = 0
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes += 1
  })
  return meshes
}

function assertAllVerticesFinite(root: THREE.Object3D, label: string): void {
  let badVertices = 0
  let totalVertices = 0
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.getAttribute("position")
    if (!pos) return
    totalVertices += pos.count
    for (let i = 0; i < pos.count; i += 1) {
      if (
        !Number.isFinite(pos.getX(i)) ||
        !Number.isFinite(pos.getY(i)) ||
        !Number.isFinite(pos.getZ(i))
      ) {
        badVertices += 1
      }
    }
  })
  expect(totalVertices, `${label} must contain vertices`).toBeGreaterThan(0)
  expect(badVertices, `${label} has non-finite vertices`).toBe(0)
}

function createRecordingCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement
  texts: string[]
} {
  const texts: string[] = []
  const stubGrad = { addColorStop: () => undefined }
  const fakeCtx = {
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    ellipse: () => undefined,
    quadraticCurveTo: () => undefined,
    bezierCurveTo: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillText: (text: string) => {
      texts.push(String(text))
    },
    measureText: (t: string) => ({ width: t.length * 9 }),
    createLinearGradient: () => stubGrad,
    createRadialGradient: () => stubGrad,
    save: () => undefined,
    restore: () => undefined,
    scale: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
  } as unknown as CanvasRenderingContext2D

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext = (() => fakeCtx) as unknown as typeof canvas.getContext
  return { canvas, texts }
}

afterEach(() => {
  setFurnitureLiteMode(false)
})

describe("shared props & geometry upgrade (furniture-builder)", () => {
  it("builds all upgraded props with finite vertices, grounded bases, and preserved footprints", () => {
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 180

    const specs: {
      name: string
      prop: DisposableProp | LiveBoardProp
      maxW?: number
      maxD?: number
      exactTopY?: number
    }[] = [
      { name: "plant-tall", prop: createPottedPlant("tall") },
      { name: "plant-small", prop: createPottedPlant("small") },
      { name: "sofa", prop: createSofa(2.4, 0.9, "#24365e"), maxW: 2.55, maxD: 1.05 },
      { name: "coffee-table", prop: createCoffeeTable(1.4, 0.7), maxW: 1.5, maxD: 0.8 },
      { name: "pantry", prop: createPantryCounter(2.2, 0.75), maxW: 2.35, maxD: 0.95 },
      { name: "reception", prop: createReceptionDesk(3.2, 0.86), maxW: 3.35, maxD: 1.05 },
      { name: "altar", prop: createOfferingAltar(3.05, 1.05) },
      { name: "shrine", prop: createThanTaiShrine({ includeAltar: true }) },
      { name: "lantern", prop: createLantern() },
      { name: "podium-1", prop: createStatuePodium(1, 1.85, 1.05), exactTopY: 0.77 },
      { name: "podium-2", prop: createStatuePodium(2, 1.85, 1.05), exactTopY: 0.61 },
      { name: "podium-3", prop: createStatuePodium(3, 1.85, 1.05), exactTopY: 0.53 },
      { name: "desk-boss", prop: createOfficeDesk({ variant: "boss", width: 2.8, depth: 1.0, dualMonitor: true, hasMug: true, withChair: true, nameplate: "Bàn sếp · Lê Huy" }) },
      { name: "desk-staff", prop: createOfficeDesk({ variant: "staff", width: 1.9, depth: 0.84, withChair: true, nameplate: "Lê Minh Saco", highlightGold: true }) },
      { name: "desk-reading", prop: createOfficeDesk({ variant: "reading", width: 2.0, depth: 0.9, withChair: false }) },
      { name: "bookshelf", prop: createBookshelf(2.0, 1.82, 0.46) },
      { name: "doc-shelf", prop: createDocumentShelf(2.2, 1.88, 0.6) },
      { name: "conference", prop: createConferenceTable(4.2, 1.5, 8) },
      { name: "standee", prop: createAchievementStandee(canvas, 2.3, 3.65) },
      { name: "rug-oval", prop: createRug(3.2, 1.8, { shape: "oval" }) },
      { name: "rug-rounded", prop: createRug(3.6, 2.0, { shape: "rounded" }) },
    ]

    for (const item of specs) {
      item.prop.group.updateMatrixWorld(true)
      assertAllVerticesFinite(item.prop.group, item.name)

      const box = new THREE.Box3().setFromObject(item.prop.group)
      expect(box.min.y, `${item.name} must rest on floor y=0`).toBeGreaterThanOrEqual(-0.02)
      expect(box.min.y, `${item.name} must not float above floor`).toBeLessThanOrEqual(0.06)

      if (item.maxW !== undefined) {
        expect(box.max.x - box.min.x, `${item.name} width`).toBeLessThanOrEqual(item.maxW)
      }
      if (item.maxD !== undefined) {
        expect(box.max.z - box.min.z, `${item.name} depth`).toBeLessThanOrEqual(item.maxD)
      }
      if (item.exactTopY !== undefined) {
        expect(box.max.y, `${item.name} statue pad topY`).toBeCloseTo(item.exactTopY, 2)
      }

      item.prop.dispose()
      // Idempotent second dispose
      expect(() => item.prop.dispose()).not.toThrow()
    }
  })

  it("uses InstancedMesh for bookshelf books/binders and conference chairs to keep draw calls low", () => {
    const bookshelf = createBookshelf(2.0, 1.82, 0.46)
    const docShelf = createDocumentShelf(2.2, 1.88, 0.6)
    const conf = createConferenceTable(4.2, 1.5, 8)

    const countInstanced = (root: THREE.Object3D): number => {
      let n = 0
      root.traverse((node) => {
        if (node instanceof THREE.InstancedMesh) n += 1
      })
      return n
    }

    expect(countInstanced(bookshelf.group)).toBeGreaterThanOrEqual(1)
    expect(countInstanced(docShelf.group)).toBeGreaterThanOrEqual(2)
    expect(countInstanced(conf.group)).toBeGreaterThanOrEqual(2)

    // Merging + instancing keeps total draw calls very compact
    expect(countDrawCalls(bookshelf.group)).toBeLessThanOrEqual(8)
    expect(countDrawCalls(docShelf.group)).toBeLessThanOrEqual(10)
    expect(countDrawCalls(conf.group)).toBeLessThanOrEqual(14)

    bookshelf.dispose()
    docShelf.dispose()
    conf.dispose()
  })

  it("reduces triangle budget noticeably when lite=true (per-call and global toggle)", () => {
    const plantHi = createPottedPlant("tall", { lite: false })
    const plantLite = createPottedPlant("tall", { lite: true })
    expect(countTriangles(plantLite.group)).toBeLessThan(countTriangles(plantHi.group))

    const deskHi = createOfficeDesk({ variant: "boss", width: 2.8, depth: 1.0, lite: false })
    const deskLite = createOfficeDesk({ variant: "boss", width: 2.8, depth: 1.0, lite: true })
    expect(countTriangles(deskLite.group)).toBeLessThan(countTriangles(deskHi.group))

    const altarHi = createOfferingAltar(3.2, 1.1, { lite: false })
    const altarLite = createOfferingAltar(3.2, 1.1, { lite: true })
    expect(countTriangles(altarLite.group)).toBeLessThan(countTriangles(altarHi.group))

    setFurnitureLiteMode(true)
    expect(isFurnitureLiteMode()).toBe(true)
    const sofaGlobalLite = createSofa(2.4, 0.9)
    setFurnitureLiteMode(false)
    const sofaHi = createSofa(2.4, 0.9)
    expect(countTriangles(sofaGlobalLite.group)).toBeLessThan(countTriangles(sofaHi.group))

    for (const p of [plantHi, plantLite, deskHi, deskLite, altarHi, altarLite, sofaGlobalLite, sofaHi]) {
      p.dispose()
    }
  })

  it("shares cached geometries/materials across props and protects them when one prop disposes", () => {
    const p1 = createPottedPlant("tall")
    const p2 = createPottedPlant("tall")

    const m1 = p1.group.children[0] as THREE.Mesh
    const m2 = p2.group.children[0] as THREE.Mesh
    expect(m1.geometry).toBe(m2.geometry)
    expect(m1.material).toBe(m2.material)

    // Disposing p1 (including via scene-level disposeObject3D) must not throw or break p2
    p1.dispose()
    expect(() => disposeObject3D(p1.group)).not.toThrow()
    expect(m2.geometry.getAttribute("position").count).toBeGreaterThan(0)

    // Non-shared board textures ARE disposed cleanly when their prop is disposed
    const boardCanvas = document.createElement("canvas")
    boardCanvas.width = 512
    boardCanvas.height = 180
    const board = createWallBoardFrame(4.0, 1.4, boardCanvas)
    const disposeSpy = vi.spyOn(board.texture, "dispose")
    board.dispose()
    expect(disposeSpy).toHaveBeenCalledTimes(1)

    p2.dispose()
    expect(() => disposeFurnitureCaches()).not.toThrow()
  })
})

describe("procedural textures & standee spec §10 copy (textures.ts)", () => {
  it("sets SRGBColorSpace and anisotropy across all floor, wall, and furniture surface textures", () => {
    const floorStyles: FloorTextureStyle[] = [
      "marble_cream",
      "parquet",
      "carpet_slate",
      "stone_sand",
      "ceramic_cream",
      "red_carpet",
    ]
    for (const style of floorStyles) {
      const tex = createFloorTexture(style)
      expect(tex.colorSpace).toBe(THREE.SRGBColorSpace)
      expect(tex.anisotropy).toBeGreaterThanOrEqual(8)
      expect(tex.wrapS).toBe(THREE.RepeatWrapping)
      expect(tex.wrapT).toBe(THREE.RepeatWrapping)
    }

    const wallStyles: WallTextureStyle[] = [
      "ivory_plaster",
      "navy_wainscot",
      "cream_paint",
    ]
    for (const style of wallStyles) {
      const tex = createWallTexture(style)
      expect(tex.colorSpace).toBe(THREE.SRGBColorSpace)
      expect(tex.anisotropy).toBeGreaterThanOrEqual(8)
      expect(createWallTexture(style)).toBe(tex)
    }

    const woodTones: WoodSurfaceTone[] = ["walnut", "oak", "rosewood", "honey"]
    for (const tone of woodTones) {
      const tex = createWoodSurfaceTexture(tone)
      expect(tex.colorSpace).toBe(THREE.SRGBColorSpace)
      expect(createWoodSurfaceTexture(tone)).toBe(tex)
    }

    const fab = createFabricSurfaceTexture("#24365e", "weave")
    expect(fab.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(createMarbleSurfaceTexture("cream").colorSpace).toBe(THREE.SRGBColorSpace)
    expect(createMonitorScreenTexture("boss").colorSpace).toBe(THREE.SRGBColorSpace)
    expect(createMonitorScreenTexture("staff").colorSpace).toBe(THREE.SRGBColorSpace)
    expect(createMonitorScreenTexture("reception").colorSpace).toBe(THREE.SRGBColorSpace)
    expect(createAltarClothTexture().colorSpace).toBe(THREE.SRGBColorSpace)

    const decal = createFloorDecalTexture("PHÒNG HỌP", "#7c5c32")
    expect(decal.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(decal.anisotropy).toBeGreaterThanOrEqual(8)
    decal.dispose()

    const plate = createSignTexture("Lê Minh Saco", { style: "gold_plate" })
    expect(plate.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(plate.anisotropy).toBeGreaterThanOrEqual(8)
    plate.dispose()
  })

  it("renders exact spec §10 copy on the Office Achievement Standee including 'Hạng của bạn #{rank} · {points} điểm'", () => {
    expect(formatStandeePersonalRank(3, 120)).toBe("Hạng của bạn #3 · 120 điểm")

    const filled = createRecordingCanvas(460, 748)
    drawOfficeStandee(filled.canvas, {
      teamTitle: "IQX · NHÓM LÊ HUY",
      monthLabel: "Thành tích tháng 11",
      top3: [
        { rank: 1, name: "Lê Ngọc Hạnh", points: 240 },
        { rank: 2, name: "Nguyễn Văn An", points: 195 },
        { rank: 3, name: "Trần Thị Bình", points: 160 },
      ],
      personalRank: { rank: 3, points: 120 },
    })

    expect(filled.texts).toContain("IQX · NHÓM LÊ HUY")
    expect(filled.texts).toContain("Thành tích tháng 11")
    expect(filled.texts).toContain("Top 3 điểm nhiệm vụ")
    expect(filled.texts).toContain("Hạng của bạn #3 · 120 điểm")
    expect(filled.texts).toContain("Reset ngày 01 hằng tháng")
    expect(filled.texts.some((t) => t.includes("Hạng của bạn:"))).toBe(false)
    expect(filled.texts.some((t) => /(^|\s)\d+\s+đ($|\s|[.,·])/.test(t))).toBe(
      false
    )

    const empty = createRecordingCanvas(460, 748)
    drawOfficeStandee(empty.canvas, {
      teamTitle: "IQX · NHÓM LÊ HUY",
      monthLabel: "Thành tích tháng 12",
      top3: [],
    })
    expect(empty.texts).toContain("Chưa có ai ghi điểm tháng này")
    expect(empty.texts).toContain("Reset ngày 01 hằng tháng")
  })

  it("renders crisp LED wall, SACO board, and Meeting screen text cleanly with 2D context", () => {
    const led = createRecordingCanvas(1024, 280)
    const idx: IndexQuote[] = [
      {
        code: "VNINDEX",
        name: "VN-Index",
        value: 1697.14,
        ref: 1688.79,
        change: 8.35,
        pct: 0.49,
        volume: 800_000_000,
        turnover: 18_000_000_000_000,
        advances: 250,
        declines: 140,
        unchanged: 50,
        ceilings: 8,
        floors: 1,
        time: Date.now(),
      },
    ]
    const quotes: Quote[] = [
      {
        symbol: "HPG",
        exchange: "HOSE",
        ref: 28000,
        ceiling: 29950,
        floor: 26050,
        open: 28100,
        high: 28600,
        low: 28000,
        price: 28500,
        traded: true,
        change: 500,
        pct: 1.79,
        volume: 25_000_000,
        value: 710_000_000_000,
        bid: [],
        ask: [],
        foreignBuy: null,
        foreignSell: null,
      },
    ]
    drawLedMarketBoard(led.canvas, idx, quotes)
    expect(led.texts).toContain("IQX · BẢNG ĐIỆN VN30")
    expect(led.texts).toContain("HPG")

    const saco = createRecordingCanvas(768, 288)
    const posts: PostCard[] = [
      {
        id: "p1",
        sacoId: "s1",
        sacoName: "Lê Huy",
        headline: "Dòng tiền tập trung nhóm chứng khoán",
        publishedAt: Date.now(),
        editedAt: null,
        hearts: 10,
        comments: 2,
        hearted: false,
      },
    ]
    drawSacoBoard(saco.canvas, posts)
    expect(saco.texts).toContain("SACO NHẬN ĐỊNH")

    const meet = createRecordingCanvas(640, 160)
    drawOfficeMeetingScreen(meet.canvas, "Họp chiến lược tuần", "Thứ Hai · 09:00")
    expect(meet.texts).toContain("PHÒNG HỌP · IQX")
    expect(meet.texts).toContain("Họp chiến lược tuần")
  })
})
