import * as THREE from "three"
import { describe, expect, it } from "vitest"

import { runBuildSync } from "../chunked-build.ts"
import {
  FLOOR_WORLD_CONFIG,
  buildFloorNavGrid,
} from "@/pages/trading-floor/engine/floor-world-3d.ts"
import {
  BOARDS,
  FLOOR_OFFICE_DOOR,
  PLACEMENTS,
  SIDE,
  SPAWN,
  WALL_H,
} from "@/pages/trading-floor/engine/layout.ts"

import {
  FLOOR_DECOR_LAYOUT,
  FLOOR_DECOR_OBSTACLES,
  createFloorDecorSteps,
  type FloorDecorMount,
} from "./index.ts"

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

function countMeshes(root: THREE.Object3D): {
  total: number
  instanced: number
  textures: THREE.Texture[]
} {
  let total = 0
  let instanced = 0
  const texSet = new Set<THREE.Texture>()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    total += 1
    if (node instanceof THREE.InstancedMesh) instanced += 1
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (!m) continue
      const std = m as THREE.MeshStandardMaterial
      for (const t of [std.map, std.emissiveMap, std.alphaMap]) {
        if (t) texSet.add(t)
      }
    }
  })
  return { total, instanced, textures: [...texSet] }
}

function assertAllVerticesFinite(root: THREE.Object3D): number {
  let verts = 0
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.getAttribute("position")
    if (!pos) return
    verts += pos.count
    for (let i = 0; i < pos.count; i += 1) {
      expect(Number.isFinite(pos.getX(i))).toBe(true)
      expect(Number.isFinite(pos.getY(i))).toBe(true)
      expect(Number.isFinite(pos.getZ(i))).toBe(true)
    }
  })
  return verts
}

describe("Khu Giao Dịch procedural chibi floor decor", () => {
  it("builds cleanly in normal & lite modes with compact draw calls, InstancedMesh repeats, finite vertices, <=1024px textures, and idempotent disposal", () => {
    const build = (lite: boolean) => {
      const outRef: { mount: FloorDecorMount | null } = { mount: null }
      runBuildSync(
        createFloorDecorSteps(
          { world: FLOOR_WORLD_CONFIG, lite, wallH: WALL_H, side: SIDE },
          outRef
        )
      )
      expect(outRef.mount).not.toBeNull()
      return outRef.mount!
    }

    const hi = build(false)
    const lite = build(true)

    const hiVerts = assertAllVerticesFinite(hi.staticGroup)
    expect(hiVerts).toBeGreaterThan(1000)
    expect(assertAllVerticesFinite(hi.animatedGroup)).toBeGreaterThan(20)

    const hiTris = countTriangles(hi.staticGroup) + countTriangles(hi.animatedGroup)
    const liteTris = countTriangles(lite.staticGroup) + countTriangles(lite.animatedGroup)
    expect(liteTris).toBeLessThan(hiTris)
    // Stay well inside the +250k triangle budget
    expect(hiTris).toBeLessThan(200_000)

    const hiStats = countMeshes(hi.staticGroup)
    const animStats = countMeshes(hi.animatedGroup)
    // Stay strictly under the +60 draw-call increase budget
    expect(hiStats.total + animStats.total).toBeLessThanOrEqual(58)
    // Repeated hero props use InstancedMesh
    expect(hiStats.instanced).toBeGreaterThanOrEqual(8)
    // Compact atlas texture count & <= 1024px max dimension
    expect(hiStats.textures.length).toBeLessThanOrEqual(8)
    for (const tex of hiStats.textures) {
      const img = tex.image as { width?: number; height?: number } | undefined
      if (img?.width && img?.height) {
        expect(img.width).toBeLessThanOrEqual(1024)
        expect(img.height).toBeLessThanOrEqual(1024)
      }
    }

    // Contact shadows generated for floor props
    expect(hi.contactShadows.length).toBeGreaterThanOrEqual(20)

    // Cheap frame update works in both normal and reducedMotion modes
    hi.update(0.016, 1.25, false)
    hi.update(0.016, 2.5, true)
    hi.refreshDynamicTextures()

    hi.dispose()
    expect(() => hi.dispose()).not.toThrow()
    lite.dispose()
    expect(() => lite.dispose()).not.toThrow()
  })

  it("blocks every new decor prop in NavGrid while keeping all 4 bot corridors free and all interactive destinations reachable from SPAWN and the Office portal door", () => {
    const nav = buildFloorNavGrid()
    const doorObs = FLOOR_OFFICE_DOOR.obstacle
    nav.blockRect(doorObs.x, doorObs.y, doorObs.w, doorObs.h)

    // 1. Every new decor obstacle center is solid / non-walkable
    expect(FLOOR_DECOR_OBSTACLES.length).toBeGreaterThanOrEqual(24)
    for (const obs of FLOOR_DECOR_OBSTACLES) {
      expect(
        nav.free({ x: obs.cx, y: obs.cy }),
        `decor obstacle ${obs.id} should block walkability at (${obs.cx}, ${obs.cy})`
      ).toBe(false)
    }

    // 2. All 4 backend bot corridors stay 100% obstacle-free
    const BOT_CORRIDORS = [
      { name: "FLOOR_CENTRAL", minX: 800, maxX: 1320, minY: 560, maxY: 1270 },
      { name: "NORTH_WALKWAY", minX: 260, maxX: 1800, minY: 500, maxY: 560 },
      { name: "SW_LOUNGE_CLEARANCE", minX: 110, maxX: 700, minY: 1030, maxY: 1200 },
      { name: "SE_FAME_CLEARANCE", minX: 1390, maxX: 1940, minY: 1190, maxY: 1290 },
    ] as const
    for (const c of BOT_CORRIDORS) {
      for (let y = c.minY; y <= c.maxY; y += 16) {
        for (let x = c.minX; x <= c.maxX; x += 16) {
          expect(
            nav.free({ x, y }),
            `${c.name} must stay free at (${x}, ${y})`
          ).toBe(true)
        }
      }
    }

    // 3. Every interactive target remains reachable via NavGrid A* from both SPAWN and door arrival
    const altar = PLACEMENTS.find((p) => p.id === "offering")!.interact!.access
    const reception = PLACEMENTS.find((p) => p.id === "reception")!.interact!.access
    const statue1 = PLACEMENTS.find((p) => p.id === "statue-1")!.interact!.access
    const statue2 = PLACEMENTS.find((p) => p.id === "statue-2")!.interact!.access
    const statue3 = PLACEMENTS.find((p) => p.id === "statue-3")!.interact!.access

    const targets: readonly { name: string; pt: { x: number; y: number } }[] = [
      { name: "Thần Tài altar", pt: altar },
      { name: "LED board", pt: BOARDS.led.interact.access },
      { name: "SACO nhận định board", pt: BOARDS.saco.interact.access },
      { name: "Văn phòng 3D door", pt: FLOOR_OFFICE_DOOR.access },
      { name: "Reception desk", pt: reception },
      { name: "Vinh danh statue-1", pt: statue1 },
      { name: "Vinh danh statue-2", pt: statue2 },
      { name: "Vinh danh statue-3", pt: statue3 },
    ]

    for (const start of [
      { name: "SPAWN", pt: SPAWN },
      { name: "DOOR_SPAWN", pt: FLOOR_OFFICE_DOOR.spawnInside },
    ]) {
      expect(nav.free(start.pt), `${start.name} must be walkable`).toBe(true)
      for (const target of targets) {
        expect(nav.free(target.pt), `${target.name} access must be walkable`).toBe(true)
        const path = nav.findPath(start.pt, target.pt)
        expect(
          path.length,
          `${start.name} -> ${target.name} must be reachable`
        ).toBeGreaterThan(0)
        const end = path.at(-1)!
        expect(Math.hypot(end.x - target.pt.x, end.y - target.pt.y)).toBeLessThan(20)
      }
    }

    // 4. Verify key themed zones are represented
    expect(FLOOR_DECOR_LAYOUT.tradingIslands.length).toBe(3)
    expect(FLOOR_DECOR_LAYOUT.benches.length).toBe(3)
    expect(FLOOR_DECOR_LAYOUT.planterDividers.length).toBe(4)
    expect(FLOOR_DECOR_LAYOUT.bambooPlanters.length).toBe(6)
    expect(FLOOR_DECOR_LAYOUT.luckyCats.length).toBe(3)
  })
})
