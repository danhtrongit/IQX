import { render } from "@testing-library/react"
import { createElement } from "react"
import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"

import type {
  IndexQuote,
  Quote,
} from "@/pages/trading-floor/net/market/types.ts"
import {
  AVATARS,
  OUTFIT_COLORS,
  type Facing,
  type PostCard,
} from "@/pages/trading-floor/net/types.ts"

import { ChibiAvatar3DPreview } from "./ChibiAvatar3DPreview.tsx"
import { createChibiCharacter } from "./character-builder.ts"
import {
  createAchievementStandee,
  createBookshelf,
  createCoffeeTable,
  createConferenceTable,
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
  type DisposableProp,
  type LiveBoardProp,
} from "./furniture-builder.ts"
import {
  PREVIEW_INITIAL_YAW,
  buildAllChibiPortraits,
  computePreviewYaw,
  renderChibiPortraitDataUrl,
} from "./portrait-renderer.ts"
import { computeCameraClampBounds } from "./scene-host.ts"
import {
  createChibiFaceTexture,
  createFloorDecalTexture,
  createFloorTexture,
  createSignTexture,
  drawLedMarketBoard,
  drawOfficeMeetingScreen,
  drawOfficeStandee,
  drawSacoBoard,
} from "./textures.ts"
import {
  CHIBI_SHADOW_PROXY_LAYER,
  OUTFIT_COLOR_HEX,
  SCENE_HOST_BRIDGE_KEY,
  SHADOW_PROXY_ROOT_FLAG,
  SHARED_RESOURCE_FLAG,
  splitMaterialProgramVariants,
  type ChibiSceneHostBridge,
  facingToRadians,
  logicalToWorld,
  resolveOutfitHex,
  worldToLogical,
  type ChibiAnimMode,
  type ChibiStatueRank,
  type FloorTextureStyle,
  type WorldTransformConfig,
} from "./types.ts"

function assertAllTransformsFinite(root: THREE.Object3D): void {
  root.traverse((obj) => {
    expect(Number.isFinite(obj.position.x)).toBe(true)
    expect(Number.isFinite(obj.position.y)).toBe(true)
    expect(Number.isFinite(obj.position.z)).toBe(true)
    expect(Number.isFinite(obj.rotation.x)).toBe(true)
    expect(Number.isFinite(obj.rotation.y)).toBe(true)
    expect(Number.isFinite(obj.rotation.z)).toBe(true)
    expect(Number.isFinite(obj.scale.x)).toBe(true)
    expect(Number.isFinite(obj.scale.y)).toBe(true)
    expect(Number.isFinite(obj.scale.z)).toBe(true)
  })
}

describe("chibi-3d coordinate transforms & facing", () => {
  const cfg: WorldTransformConfig = {
    logicalW: 2048,
    logicalH: 1408,
    scale: 1 / 64,
  }

  it("round-trips logicalToWorld and worldToLogical cleanly", () => {
    const samples: [number, number][] = [
      [0, 0],
      [1024, 704],
      [1024, 540],
      [2048, 1408],
      [460, 114],
    ]
    for (const [x, y] of samples) {
      const w = logicalToWorld(x, y, cfg)
      const back = worldToLogical(w.x, w.z, cfg)
      expect(back.x).toBeCloseTo(x, 6)
      expect(back.y).toBeCloseTo(y, 6)
    }

    // Center maps to origin; East is +X, South is +Z
    expect(logicalToWorld(1024, 704, cfg)).toEqual({ x: 0, z: 0 })
    expect(logicalToWorld(1088, 704, cfg).x).toBeCloseTo(1, 6)
    expect(logicalToWorld(1024, 768, cfg).z).toBeCloseTo(1, 6)
  })

  it("maps all 8 facings accurately to Three.js Y-rotation radians", () => {
    const expected: Record<Facing, number> = {
      s: 0,
      se: Math.PI / 4,
      e: Math.PI / 2,
      ne: (3 * Math.PI) / 4,
      n: Math.PI,
      nw: (-3 * Math.PI) / 4,
      w: -Math.PI / 2,
      sw: -Math.PI / 4,
    }
    for (const [dir, rad] of Object.entries(expected)) {
      const actual = facingToRadians(dir as Facing)
      expect(actual).toBeCloseTo(rad, 6)
    }
  })

  it("keeps OUTFIT_COLOR_HEX in sync with OUTFIT_COLORS", () => {
    for (const entry of OUTFIT_COLORS) {
      expect(OUTFIT_COLOR_HEX[entry.id]).toBe(entry.hex)
      expect(resolveOutfitHex(entry.id)).toBe(entry.hex)
    }
    expect(resolveOutfitHex("#c2417d")).toBe("#c2417d")
    expect(resolveOutfitHex("invalid")).toBeNull()
  })
})

describe("chibi-3d character builder", () => {
  const animModes: ChibiAnimMode[] = [
    "idle",
    "walk",
    "wave",
    "bow",
    "hop",
    "statue",
  ]

  it("builds all 11 canonical avatars cleanly, updates outfit colors, and runs all 6 animations", () => {
    for (const avatar of AVATARS) {
      const rig = createChibiCharacter({ avatarId: avatar.id })
      expect(rig.root).toBeInstanceOf(THREE.Group)
      expect(rig.headHeight).toBeGreaterThan(1)

      // Update outfit color immediately
      rig.setOutfitColor("#2458b8")
      let foundUpdatedHex = false
      rig.root.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (
          mesh.isMesh &&
          mesh.material instanceof THREE.MeshStandardMaterial &&
          mesh.material.color.getHexString() === "2458b8"
        ) {
          foundUpdatedHex = true
        }
      })
      expect(foundUpdatedHex).toBe(true)

      // Reset back to default color & dim toggle
      rig.setOutfitColor(null)
      rig.setDimmed(true)
      rig.setDimmed(false)

      // Exercise all 6 animation modes
      for (const anim of animModes) {
        rig.update(0.016, {
          anim,
          facingRad: facingToRadians("se"),
          moveFactor: 1,
          animTime: 0.42,
        })
        assertAllTransformsFinite(rig.root)
      }

      expect(() => rig.dispose()).not.toThrow()
    }
  })

  it("builds Thần Tài at ~1.75x scale and animates cleanly", () => {
    const tt = createChibiCharacter({ avatarId: "thantai", isThanTai: true })
    expect(tt.headHeight).toBeGreaterThan(2.8)
    for (const anim of animModes) {
      tt.update(0.016, { anim, facingRad: 0, animTime: 0.5 })
      assertAllTransformsFinite(tt.root)
    }
    expect(() => tt.dispose()).not.toThrow()
  })

  it("builds all 4 Hall of Fame statue ranks (1, 2, 3, empty) and office boss", () => {
    const ranks: ChibiStatueRank[] = [1, 2, 3, "empty"]
    for (const rank of ranks) {
      const statue = createChibiCharacter({
        avatarId: "female03",
        statueRank: rank,
      })
      statue.update(0.016, { anim: "statue", facingRad: 0, animTime: 1.2 })
      assertAllTransformsFinite(statue.root)
      expect(() => statue.dispose()).not.toThrow()
    }

    const boss = createChibiCharacter({
      avatarId: "unknown-office-id",
      genderHint: "male",
      isBoss: true,
      outfitColorHex: "#0f3d3e",
    })
    boss.update(0.016, { anim: "walk", facingRad: Math.PI / 2 })
    assertAllTransformsFinite(boss.root)
    expect(() => boss.dispose()).not.toThrow()
  })

  it("keeps front face, eyebrows, and eyes 100% unobstructed by hair on all 11 avatars, boss, and statues ([U-H1]/[U-H2])", () => {
    const specs = [
      ...AVATARS.map((a) => ({ label: a.id, spec: { avatarId: a.id } })),
      {
        label: "boss",
        spec: { avatarId: "male04", isBoss: true },
      },
      {
        label: "statue-1-female01",
        spec: { avatarId: "female01", statueRank: 1 as ChibiStatueRank },
      },
      {
        label: "statue-2-female03",
        spec: { avatarId: "female03", statueRank: 2 as ChibiStatueRank },
      },
      {
        label: "statue-3-danhtrongit",
        spec: { avatarId: "danhtrongit", statueRank: 3 as ChibiStatueRank },
      },
    ]

    const tmp = new THREE.Vector3()
    for (const { label, spec } of specs) {
      const rig = createChibiCharacter(spec)
      rig.root.updateMatrixWorld(true)

      const hairGroup = rig.root.getObjectByName("chibi-hair")
      expect(hairGroup, `${label} missing chibi-hair`).toBeTruthy()
      const headPivot = hairGroup!.parent!
      const invHead = new THREE.Matrix4().copy(headPivot.matrixWorld).invert()
      const meshToHead = new THREE.Matrix4()

      let blockingCount = 0
      hairGroup!.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const pos = mesh.geometry.getAttribute("position")
        if (!pos) return
        meshToHead.multiplyMatrices(invHead, mesh.matrixWorld)
        for (let i = 0; i < pos.count; i += 1) {
          tmp.fromBufferAttribute(pos, i).applyMatrix4(meshToHead)
          // Front eyebrow/eye/mouth safe zone on +Z face (eyebrow top ~+0.106, eyes ~+0.015)
          if (
            Math.abs(tmp.x) <= 0.17 &&
            tmp.y >= -0.14 &&
            tmp.y <= 0.12 &&
            tmp.z >= 0.2
          ) {
            blockingCount += 1
          }
        }
      })

      expect(
        blockingCount,
        `${label} has ${blockingCount} hair vertices intruding into front face eye/eyebrow band`
      ).toBe(0)

      // Glasses lenses must disable depthWrite to prevent alpha sorting artifacts over eyes ([U-L1])
      const glasses = rig.root.getObjectByName("chibi-glasses")
      if (glasses) {
        glasses.traverse((node) => {
          const mesh = node as THREE.Mesh
          if (
            mesh.isMesh &&
            mesh.material instanceof THREE.MeshStandardMaterial &&
            mesh.material.transparent
          ) {
            expect(mesh.material.depthWrite).toBe(false)
          }
        })
      }

      rig.dispose()
    }
  })

  it("synchronizes hop stomp impact to 260ms and bow to 3 clean cycles over 2.7s ([U-M12])", () => {
    const rig = createChibiCharacter({ avatarId: "male01" })
    // bodyPivot is child[1] (child[0] is ground shadowDisc)
    const bodyPivot = rig.root.children[1]!
    const hipsPivot = bodyPivot.children[0]!
    const torsoPivot = hipsPivot.children[2]!

    // Hop mid-air near 160ms
    rig.update(0.016, { anim: "hop", facingRad: 0, animTime: 0.16 })
    expect(bodyPivot.position.y).toBeGreaterThan(0.35)

    // Hop stomp peak right at 260ms (egg shatter instant)
    rig.update(0.016, { anim: "hop", facingRad: 0, animTime: 0.26 })
    expect(bodyPivot.position.y).toBeCloseTo(0, 5)
    expect(bodyPivot.scale.y).toBeLessThanOrEqual(0.78)
    expect(bodyPivot.scale.x).toBeGreaterThanOrEqual(1.18)

    // Bow starts upright at 0s, peaks at 0.45s / 1.35s / 2.25s, returns upright at 0.9s / 1.8s / 2.7s
    for (const uprightAt of [0, 0.9, 1.8, 2.7]) {
      rig.update(0.016, { anim: "bow", facingRad: 0, animTime: uprightAt })
      expect(torsoPivot.rotation.x).toBeLessThan(0.05)
    }
    for (const peakAt of [0.45, 1.35, 2.25]) {
      rig.update(0.016, { anim: "bow", facingRad: 0, animTime: peakAt })
      expect(torsoPivot.rotation.x).toBeGreaterThan(0.5)
    }

    rig.dispose()
  })
})

describe("chibi-3d camera frustum clamping & dynamic room sizing ([R2-U-H1]/[L-H4])", () => {
  function projectGroundScreenX(opts: {
    targetX: number
    targetZ: number
    pointX: number
    pointZ: number
    baseDistance: number
    zoom: number
    fovDeg: number
    pitchDeg: number
    aspect: number
  }): number {
    const cam = new THREE.PerspectiveCamera(opts.fovDeg, opts.aspect, 0.2, 220)
    const pitchRad = (opts.pitchDeg * Math.PI) / 180
    const dist = opts.baseDistance / opts.zoom
    cam.position.set(
      opts.targetX,
      dist * Math.sin(pitchRad),
      opts.targetZ + dist * Math.cos(pitchRad)
    )
    cam.lookAt(opts.targetX, 0, opts.targetZ)
    cam.updateMatrixWorld()
    const v = new THREE.Vector3(opts.pointX, 0, opts.pointZ).project(cam)
    return v.x * 0.5 + 0.5
  }

  it("frames Office Desk #1, Lounge Sofa, and Achievement Standee comfortably inside [15%..85%] screen X at 1440×900 & 1920×1080 and supports 0.55× zoom-out", () => {
    const officeWorld: WorldTransformConfig = {
      logicalW: 2400,
      logicalH: 1560,
      scale: 1 / 100,
    }
    const roomW = officeWorld.logicalW * officeWorld.scale // 24.0
    const roomH = officeWorld.logicalH * officeWorld.scale // 15.6
    const stations = [
      { name: "Desk #1", lx: 245, ly: 870 },
      { name: "Lounge Sofa", lx: 230, ly: 1375 },
      { name: "Achievement Standee", lx: 2195, ly: 1080 },
    ] as const

    for (const vp of [
      { label: "1440×900", w: 1440, h: 844 },
      { label: "1920×1080", w: 1920, h: 1024 },
    ]) {
      const aspect = vp.w / vp.h
      const bounds = computeCameraClampBounds({
        roomW,
        roomH,
        baseDistance: 13.8,
        zoom: 1.0,
        fovDeg: 35,
        pitchRad: (52 * Math.PI) / 180,
        aspect,
        boundsMargin: 0.5,
      })

      for (const st of stations) {
        const pt = logicalToWorld(st.lx, st.ly, officeWorld)
        const followPt = logicalToWorld(st.lx, st.ly - 25, officeWorld)
        const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, followPt.x))
        const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, followPt.z))
        const screenX = projectGroundScreenX({
          targetX: clampedX,
          targetZ: clampedZ,
          pointX: pt.x,
          pointZ: pt.z,
          baseDistance: 13.8,
          zoom: 1.0,
          fovDeg: 35,
          pitchDeg: 52,
          aspect,
        })
        expect(
          screenX,
          `${st.name} at ${vp.label} projected to ${(screenX * 100).toFixed(1)}%`
        ).toBeGreaterThanOrEqual(0.15)
        expect(
          screenX,
          `${st.name} at ${vp.label} projected to ${(screenX * 100).toFixed(1)}%`
        ).toBeLessThanOrEqual(0.85)
      }

      // Full 0.55× zoom-out works without override and smoothly centers horizontally when room fits
      const zoomedOut = computeCameraClampBounds({
        roomW,
        roomH,
        baseDistance: 13.8,
        zoom: 0.55,
        fovDeg: 35,
        pitchRad: (52 * Math.PI) / 180,
        aspect,
        boundsMargin: 0.5,
      })
      expect(zoomedOut.minX).toBe(0)
      expect(zoomedOut.maxX).toBe(0)
      expect(zoomedOut.minZ).toBeCloseTo(zoomedOut.maxZ, 5)
    }
  })

  it("computes asymmetric North/South frustum bounds for Trading Floor that keep Shrine unclipped and Reception clear of bottom HUD", () => {
    const bounds = computeCameraClampBounds({
      roomW: 32,
      roomH: 22,
      baseDistance: 17.5,
      zoom: 1.0,
      fovDeg: 34,
      pitchRad: (52 * Math.PI) / 180,
      aspect: 1440 / 844,
      boundsMargin: 0.6,
    })

    // Perspective foreshortening makes North span much larger than South span
    expect(bounds.northSpan).toBeGreaterThan(bounds.southSpan * 1.5)
    // Spawn near Thần Tài (y=540 -> z=-2.5625) is unclamped so Shrine archway banner never clips top edge
    expect(bounds.minZ).toBeLessThanOrEqual(-2.6)
    // At maxZ, Reception player (y=1352 -> z=+10.125) sits comfortably above bottom edge
    expect(bounds.maxZ + bounds.southSpan - 10.125).toBeGreaterThan(1.5)
    // Horizontal bounds leave generous room to frame corner hotspots
    expect(bounds.maxX).toBeGreaterThan(8)
  })

  it("expands vertical clamp range cleanly when Office room height grows past 12 staff (1560 -> 2220)", () => {
    const base = computeCameraClampBounds({
      roomW: 24,
      roomH: 15.6,
      baseDistance: 13.8,
      zoom: 1.0,
      fovDeg: 35,
      pitchRad: (52 * Math.PI) / 180,
      aspect: 1440 / 844,
      boundsMargin: 0.5,
    })
    const expanded = computeCameraClampBounds({
      roomW: 24,
      roomH: 22.2,
      baseDistance: 13.8,
      zoom: 1.0,
      fovDeg: 35,
      pitchRad: (52 * Math.PI) / 180,
      aspect: 1440 / 844,
      boundsMargin: 0.5,
    })

    expect(expanded.maxZ).toBeGreaterThan(base.maxZ + 3.0)
    expect(expanded.minZ).toBeLessThan(base.minZ - 3.0)
  })
})

describe("chibi-3d furniture & prop builder", () => {
  it("constructs and disposes every Trading Floor and Office prop cleanly", () => {
    const boardCanvas = document.createElement("canvas")
    boardCanvas.width = 512
    boardCanvas.height = 180

    const props: (DisposableProp | LiveBoardProp)[] = [
      createPottedPlant("tall"),
      createPottedPlant("small"),
      createSofa(2.4, 0.9, "#24365e"),
      createCoffeeTable(1.4, 0.7),
      createPantryCounter(2.2, 0.75),
      createReceptionDesk(3.2, 0.85),
      createThanTaiShrine({ includeAltar: true }),
      createOfferingAltar(3.2, 1.1),
      createStatuePodium(1),
      createStatuePodium(2),
      createStatuePodium(3),
      createWallBoardFrame(5.2, 1.8, boardCanvas, "#e9b949"),
      createOfficeDesk({
        variant: "boss",
        width: 2.8,
        depth: 1.0,
        dualMonitor: true,
        hasMug: true,
        withChair: true,
        nameplate: "Bàn sếp · Lê Huy",
        highlightGold: true,
      }),
      createOfficeDesk({
        variant: "staff",
        width: 1.9,
        depth: 0.84,
        withChair: true,
        nameplate: "Lê Ngọc Hạnh",
      }),
      createOfficeDesk({ variant: "reading", width: 2.0, depth: 0.9 }),
      createBookshelf(2.2, 1.9, 0.5),
      createConferenceTable(4.2, 1.5, 8),
      createAchievementStandee(boardCanvas),
      createRug(3.2, 1.8, { shape: "oval" }),
      createRug(3.6, 2.0, { shape: "rounded" }),
    ]

    for (const prop of props) {
      expect(prop.group).toBeInstanceOf(THREE.Group)
      expect(prop.group.children.length).toBeGreaterThan(0)
      assertAllTransformsFinite(prop.group)
      if ("update" in prop) {
        expect(() => prop.update()).not.toThrow()
      }
      expect(() => prop.dispose()).not.toThrow()
    }
  })
})

describe("chibi-3d portraits & procedural textures", () => {
  it("generates valid data URLs for all 11 avatars and custom outfit colors", () => {
    const allDefault = buildAllChibiPortraits()
    expect(Object.keys(allDefault)).toHaveLength(AVATARS.length)
    for (const avatar of AVATARS) {
      const url = allDefault[avatar.id]
      expect(url.startsWith("data:image/")).toBe(true)
      const tinted = renderChibiPortraitDataUrl(avatar.id, "#7c1f2c")
      expect(tinted.startsWith("data:image/")).toBe(true)
      expect(tinted).not.toBe(url)
    }
  })

  it("creates floor, decal, face, and sign textures safely in jsdom", () => {
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
      expect(tex).toBeInstanceOf(THREE.Texture)
    }

    expect(createChibiFaceTexture("male_warm")).toBeInstanceOf(THREE.Texture)
    expect(createChibiFaceTexture("thantai")).toBeInstanceOf(THREE.Texture)
    expect(createChibiFaceTexture("statue_gold")).toBeInstanceOf(THREE.Texture)

    const decal = createFloorDecalTexture("PHÒNG CHỜ", "#7c5c32")
    expect(decal).toBeInstanceOf(THREE.Texture)
    decal.dispose()

    const sign = createSignTexture("Thần Tài · Khấn trước 11:30", {
      style: "gold_banner",
    })
    expect(sign).toBeInstanceOf(THREE.Texture)
    sign.dispose()
  })

  it("runs LED, SACO, Meeting Screen, and Office Standee canvas painters safely in jsdom", () => {
    const ledCanvas = document.createElement("canvas")
    ledCanvas.width = 1024
    ledCanvas.height = 280
    const sampleIndices: IndexQuote[] = [
      {
        code: "VNINDEX",
        name: "VN-Index",
        value: 1285.42,
        ref: 1272.1,
        change: 13.32,
        pct: 1.05,
        volume: 820_000_000,
        turnover: 19_500_000_000_000,
        advances: 280,
        declines: 140,
        unchanged: 60,
        ceilings: 12,
        floors: 2,
        time: Date.now(),
      },
    ]
    const sampleQuotes: Quote[] = [
      {
        symbol: "FPT",
        exchange: "HOSE",
        ref: 132000,
        ceiling: 141200,
        floor: 122800,
        open: 133000,
        high: 136500,
        low: 132500,
        price: 136200,
        traded: true,
        change: 4200,
        pct: 3.18,
        volume: 4_500_000,
        value: 612_000_000_000,
        bid: [],
        ask: [],
        foreignBuy: null,
        foreignSell: null,
      },
    ]
    expect(() =>
      drawLedMarketBoard(ledCanvas, sampleIndices, sampleQuotes)
    ).not.toThrow()
    expect(() => drawLedMarketBoard(ledCanvas, null, null)).not.toThrow()

    const sacoCanvas = document.createElement("canvas")
    sacoCanvas.width = 768
    sacoCanvas.height = 288
    const samplePosts: PostCard[] = [
      {
        id: "p1",
        sacoId: "s1",
        sacoName: "Lê Huy",
        headline: "Nhóm ngân hàng dẫn dắt nhịp tăng vượt 1,285 điểm",
        publishedAt: Date.now(),
        editedAt: null,
        hearts: 12,
        comments: 4,
        hearted: false,
      },
    ]
    expect(() => drawSacoBoard(sacoCanvas, samplePosts)).not.toThrow()
    expect(() => drawSacoBoard(sacoCanvas, [])).not.toThrow()

    const meetCanvas = document.createElement("canvas")
    meetCanvas.width = 640
    meetCanvas.height = 160
    expect(() =>
      drawOfficeMeetingScreen(
        meetCanvas,
        "Họp nhóm tuần",
        "Thứ Hai 23/11 · 09:00 · Google Meet"
      )
    ).not.toThrow()

    const standeeCanvas = document.createElement("canvas")
    standeeCanvas.width = 460
    standeeCanvas.height = 748
    expect(() =>
      drawOfficeStandee(standeeCanvas, {
        teamTitle: "IQX · NHÓM LÊ HUY",
        monthLabel: "Thành tích tháng 11",
        top3: [
          { rank: 1, name: "Lê Ngọc Hạnh", points: 240 },
          { rank: 2, name: "Nguyễn Văn An", points: 195 },
          { rank: 3, name: "Trần Thị Bình", points: 160 },
        ],
        personalRank: { rank: 4, points: 120 },
      })
    ).not.toThrow()
    expect(() =>
      drawOfficeStandee(standeeCanvas, {
        teamTitle: "IQX · NHÓM LÊ HUY",
        monthLabel: "Thành tích tháng 12",
        top3: [],
      })
    ).not.toThrow()
  })

  it("renders ChibiAvatar3DPreview cleanly in jsdom with responsive sizing and front-facing idle sway", () => {
    const { container, unmount } = render(
      createElement(ChibiAvatar3DPreview, {
        avatarId: "danhtrongit",
        colorHex: "#2458b8",
        size: 184,
        label: "Nam · IT ngầu ngầu",
      })
    )
    const root = container.firstElementChild as HTMLElement | null
    expect(root?.style.width).toBe("min(100%, 184px)")
    expect(root?.style.height).toBe("min(100%, 184px)")

    // JoinScreen 3D preview starts at charming 3/4 front and stays front-facing throughout idle sway
    expect(PREVIEW_INITIAL_YAW).toBeCloseTo(0.22, 4)
    for (let t = 0; t <= 30; t += 0.5) {
      const yaw = computePreviewYaw(PREVIEW_INITIAL_YAW, t)
      expect(Math.abs(yaw)).toBeLessThan(0.6)
    }

    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("src")?.startsWith("data:image/")).toBe(true)
    expect(() => unmount()).not.toThrow()
  })

  it("executes Canvas2D drawing paths cleanly when a 2D context is provided", () => {
    const calls: string[] = []
    const stubGrad = { addColorStop: () => undefined }
    const fakeCtx = {
      clearRect: () => calls.push("clearRect"),
      fillRect: () => calls.push("fillRect"),
      strokeRect: () => calls.push("strokeRect"),
      beginPath: () => undefined,
      closePath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      arc: () => undefined,
      arcTo: () => undefined,
      ellipse: () => undefined,
      quadraticCurveTo: () => undefined,
      bezierCurveTo: () => undefined,
      fill: () => calls.push("fill"),
      stroke: () => calls.push("stroke"),
      fillText: () => calls.push("fillText"),
      measureText: (t: string) => ({ width: t.length * 10 }),
      createLinearGradient: () => stubGrad,
      createRadialGradient: () => stubGrad,
      save: () => undefined,
      restore: () => undefined,
      scale: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
    } as unknown as CanvasRenderingContext2D

    const canvas = document.createElement("canvas")
    canvas.width = 768
    canvas.height = 288
    canvas.getContext = (() =>
      fakeCtx) as unknown as typeof canvas.getContext

    drawLedMarketBoard(canvas, null, null)
    drawSacoBoard(canvas, [
      {
        id: "1",
        sacoId: "s1",
        sacoName: "SACO Minh",
        headline: "Cổ phiếu công nghệ dẫn sóng cuối phiên chiều",
        publishedAt: Date.now(),
        editedAt: null,
        hearts: 5,
        comments: 1,
        hearted: false,
      },
    ])
    drawOfficeMeetingScreen(canvas, "Họp nhóm tuần", "Thứ Hai · 09:00")
    drawOfficeStandee(canvas, {
      teamTitle: "IQX · NHÓM LÊ HUY",
      monthLabel: "Thành tích tháng 11",
      top3: [{ rank: 1, name: "Lê Ngọc Hạnh", points: 240 }],
      personalRank: { rank: 2, points: 180 },
    })

    expect(calls).toContain("fillRect")
    expect(calls).toContain("fillText")
  })
})

describe("render batching helpers", () => {
  it("gives plain, instanced and instance-coloured users of one material their own program variant", () => {
    const root = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: "#ff0000", roughness: 0.4 })
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const plain = new THREE.Mesh(geo, mat)
    const inst = new THREE.InstancedMesh(geo, mat, 2)
    const inst2 = new THREE.InstancedMesh(geo, mat, 2)
    const tinted = new THREE.InstancedMesh(geo, mat, 2)
    tinted.setColorAt(0, new THREE.Color("#00ff00"))
    root.add(plain, inst, inst2, tinted)

    const release = splitMaterialProgramVariants(root)
    expect(plain.material).toBe(mat)
    expect(inst.material).not.toBe(mat)
    expect(inst2.material).toBe(inst.material)
    expect(tinted.material).not.toBe(inst.material)
    const clone = inst.material as THREE.MeshStandardMaterial
    expect(clone.color.getHex()).toBe(mat.color.getHex())
    expect(clone.roughness).toBe(mat.roughness)
    expect((clone.userData as Record<string, unknown>)[SHARED_RESOURCE_FLAG]).toBe(true)
    const disposed = vi.fn()
    clone.addEventListener("dispose", disposed)
    release()
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it("registers a character as a dynamic shadow caster on its first motion, with per-pivot proxies", () => {
    const scene = new THREE.Scene()
    const bridge: ChibiSceneHostBridge = {
      markActive: vi.fn(),
      requestFrame: vi.fn(),
      markShadowDirty: vi.fn(),
      markAmbient: vi.fn(),
      setDynamicShadowCaster: vi.fn(),
      markDynamicShadowDirty: vi.fn(),
    }
    ;(scene.userData as Record<string, unknown>)[SCENE_HOST_BRIDGE_KEY] = bridge
    const rig = createChibiCharacter({ avatarId: "male01", lite: false })
    scene.add(rig.root)

    // First pose: static bake only, no proxies yet.
    rig.update(0.016, { anim: "idle", facingRad: 0 })
    expect(bridge.setDynamicShadowCaster).not.toHaveBeenCalled()
    let proxies = 0
    rig.root.traverse((o) => {
      if (o.name === "chibi-shadow-proxy") proxies += 1
    })
    expect(proxies).toBe(0)

    // Remote walking: dynamic caster + ambient pacing, never the full display rate.
    rig.root.position.x += 0.3
    rig.update(0.016, { anim: "walk", facingRad: 0, moveFactor: 1, ambient: true })
    expect(bridge.setDynamicShadowCaster).toHaveBeenCalledWith(rig.root, true)
    expect(bridge.markDynamicShadowDirty).toHaveBeenCalled()
    expect(bridge.markAmbient).toHaveBeenCalled()
    expect(bridge.markActive).toHaveBeenCalledTimes(1)
    expect((rig.root.userData as Record<string, unknown>)[SHADOW_PROXY_ROOT_FLAG]).toBe(true)

    let casters = 0
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if (o.name === "chibi-shadow-proxy") {
        proxies += 1
        expect(o.layers.mask).toBe(1 << CHIBI_SHADOW_PROXY_LAYER)
        expect(mesh.castShadow).toBe(true)
      } else if (mesh.castShadow) {
        casters += 1
      }
    })
    expect(proxies).toBeGreaterThan(0)
    expect(proxies).toBeLessThan(casters)

    rig.dispose()
    expect(bridge.setDynamicShadowCaster).toHaveBeenLastCalledWith(rig.root, false)
  })
})
