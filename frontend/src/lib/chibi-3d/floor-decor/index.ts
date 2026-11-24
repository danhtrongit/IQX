import * as THREE from "three"

import type { BuildSteps } from "../chunked-build.ts"
import { logicalToWorld, mergeIndexedGeometries } from "../types.ts"

import {
  addFramedStockChart,
  addLanternBracket,
  addWorldClocksFixture,
  buildBambooPlanterSpecs,
  buildBlossomCrownSpecs,
  buildBlossomTreeBaseSpecs,
  buildGoldCoinPileSpecs,
  buildLuckyCatSpecs,
  buildRedLanternSpecs,
} from "./builders-festive.ts"
import {
  buildBearStatueSpecs,
  buildBullStatueSpecs,
  buildCoffeeBarSpecs,
  buildGalleryBenchSpecs,
  buildInfoKioskSpecs,
  buildKoiFountain,
  buildNewsstandSpecs,
  buildPlanterDividerSpecs,
  buildTradingDeskIslandSpecs,
} from "./builders-props.ts"
import {
  DECOR_COLORS as C,
  DecorMeshBatcher,
  createAtlasPlaneGeometry,
  createFloorDecorPalette,
  disposePartSpecs,
  mountInstancedSpecs,
  type InstancePlacement,
  type MergedPartSpec,
} from "./helpers.ts"
import {
  createDecalsAndWaterAtlasTexture,
  createDecorVisualAtlasTexture,
  createSecondaryTickerTexture,
} from "./textures.ts"
import {
  FLOOR_DECOR_LAYOUT,
  FLOOR_DECOR_OBSTACLES,
  type DecorContactShadowSpec,
  type FloorDecorMount,
  type FloorDecorOptions,
} from "./types.ts"

export { FLOOR_DECOR_LAYOUT, FLOOR_DECOR_OBSTACLES }
export type {
  DecorContactShadowSpec,
  FloorDecorMount,
  FloorDecorObstacle,
  FloorDecorOptions,
} from "./types.ts"

/**
 * Builds the entire Khu Giao Dịch decorative world in time-sliced generator steps (`BuildSteps`).
 *
 * Budget summary:
 * - Only 3 textures total (all <= 1024px, static atlases auto-release CPU canvas backing store)
 * - Vertex-colored master PBR materials + merged static geometry + InstancedMesh repeats (~22 total draw calls)
 * - 0 per-frame heap allocations in `update()`
 */
export function* createFloorDecorSteps(
  opts: FloorDecorOptions,
  outRef: { mount: FloorDecorMount | null }
): BuildSteps {
  const { world, lite, wallH, side } = opts
  const staticGroup = new THREE.Group()
  staticGroup.name = "floor-decor-static"

  const pal = createFloorDecorPalette()
  const ownedTextures: THREE.Texture[] = []
  const ownedMaterials: THREE.Material[] = []
  const ownedGeometries: THREE.BufferGeometry[] = []
  const ownedInstanced: THREE.InstancedMesh[] = []
  const contactShadows: DecorContactShadowSpec[] = []
  let animatedGroupRef: THREE.Group | null = null
  let mounted = false

  const trackTex = <T extends THREE.Texture>(t: T): T => {
    ownedTextures.push(t)
    return t
  }
  const trackMat = <T extends THREE.Material>(m: T): T => {
    ownedMaterials.push(m)
    return m
  }

  let disposed = false
  const disposeAll = (): void => {
    if (disposed) return
    disposed = true
    for (const inst of ownedInstanced.splice(0)) inst.dispose()
    for (const geo of ownedGeometries.splice(0)) geo.dispose()
    if (animatedGroupRef) {
      animatedGroupRef.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.isMesh && mesh.geometry) {
          mesh.geometry.dispose()
        }
      })
      animatedGroupRef.parent?.remove(animatedGroupRef)
    }
    for (const mat of ownedMaterials.splice(0)) mat.dispose()
    for (const tex of ownedTextures.splice(0)) tex.dispose()
    pal.dispose()
    staticGroup.parent?.remove(staticGroup)
  }

  try {
    // Step 1: 3 Compact Procedural Canvas2D Textures (all <= 1024px)
    const visualAtlasTex = trackTex(createDecorVisualAtlasTexture(lite))
    const decalsWaterTex = trackTex(createDecalsAndWaterAtlasTexture(lite))
    const secondaryTicker = createSecondaryTickerTexture(lite)
    trackTex(secondaryTicker.texture)

    const visualAtlasMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: visualAtlasTex,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: visualAtlasTex,
        emissiveIntensity: 0.36,
        roughness: 0.28,
        metalness: 0.06,
      })
    )
    const decalsMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: decalsWaterTex,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      })
    )
    const secondaryTickerMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: secondaryTicker.texture,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: secondaryTicker.texture,
        emissiveIntensity: 0.52,
        roughness: 0.28,
        metalness: 0.05,
      })
    )

    yield 0.08

    const mainBatcher = new DecorMeshBatcher()

    // Step 2: Koi Pond & Wishing Fountain + Bull & Bear Chibi Statues
    const koi = buildKoiFountain(pal, decalsWaterTex, lite)
    animatedGroupRef = koi.animatedGroup
    trackMat(koi.waterMat)
    trackMat(koi.rippleMat)
    const koiPt = logicalToWorld(
      FLOOR_DECOR_LAYOUT.koiFountain.cx,
      FLOOR_DECOR_LAYOUT.koiFountain.cy,
      world
    )
    mainBatcher.addPlaced(koi.staticSpecs, koiPt.x, 0, koiPt.z, 0)
    disposePartSpecs(koi.staticSpecs)
    koi.animatedGroup.position.set(koiPt.x, 0, koiPt.z)
    contactShadows.push({ wx: koiPt.x, wz: koiPt.z, w: 2.35, d: 2.25, kind: "oval", opacity: 0.6 })

    const bullSpecs = buildBullStatueSpecs(pal, lite)
    const bullPt = logicalToWorld(
      FLOOR_DECOR_LAYOUT.bullStatue.cx,
      FLOOR_DECOR_LAYOUT.bullStatue.cy,
      world
    )
    mainBatcher.addPlaced(bullSpecs, bullPt.x, 0, bullPt.z, FLOOR_DECOR_LAYOUT.bullStatue.rotY ?? 0)
    disposePartSpecs(bullSpecs)
    contactShadows.push({ wx: bullPt.x, wz: bullPt.z, w: 1.45, d: 1.15, kind: "box", opacity: 0.65 })

    const bearSpecs = buildBearStatueSpecs(pal, lite)
    const bearPt = logicalToWorld(
      FLOOR_DECOR_LAYOUT.bearStatue.cx,
      FLOOR_DECOR_LAYOUT.bearStatue.cy,
      world
    )
    mainBatcher.addPlaced(bearSpecs, bearPt.x, 0, bearPt.z, FLOOR_DECOR_LAYOUT.bearStatue.rotY ?? 0)
    disposePartSpecs(bearSpecs)
    contactShadows.push({ wx: bearPt.x, wz: bearPt.z, w: 1.45, d: 1.15, kind: "box", opacity: 0.65 })

    yield 0.24

    // Step 3: Coffee/Tea Bar Corner, Financial Newsstand, Info Kiosks, Benches, Planter Dividers
    const coffeeSpecs = buildCoffeeBarSpecs(pal, visualAtlasMat, lite)
    const coffeePt = logicalToWorld(
      FLOOR_DECOR_LAYOUT.coffeeBar.cx,
      FLOOR_DECOR_LAYOUT.coffeeBar.cy,
      world
    )
    mainBatcher.addPlaced(coffeeSpecs, coffeePt.x, 0, coffeePt.z, FLOOR_DECOR_LAYOUT.coffeeBar.rotY ?? 0)
    disposePartSpecs(coffeeSpecs)
    contactShadows.push({ wx: coffeePt.x, wz: coffeePt.z, w: 3.15, d: 1.55, kind: "box", opacity: 0.65 })

    const newsSpecs = buildNewsstandSpecs(pal, visualAtlasMat, lite)
    const newsPt = logicalToWorld(
      FLOOR_DECOR_LAYOUT.newsstand.cx,
      FLOOR_DECOR_LAYOUT.newsstand.cy,
      world
    )
    mainBatcher.addPlaced(newsSpecs, newsPt.x, 0, newsPt.z, FLOOR_DECOR_LAYOUT.newsstand.rotY ?? 0)
    disposePartSpecs(newsSpecs)
    contactShadows.push({ wx: newsPt.x, wz: newsPt.z, w: 2.05, d: 1.25, kind: "box", opacity: 0.65 })

    const kioskSpecs = buildInfoKioskSpecs(pal, visualAtlasMat, lite)
    for (const k of FLOOR_DECOR_LAYOUT.infoKiosks) {
      const pt = logicalToWorld(k.cx, k.cy, world)
      mainBatcher.addPlaced(kioskSpecs, pt.x, 0, pt.z, k.rotY ?? 0)
      contactShadows.push({ wx: pt.x, wz: pt.z, w: 1.0, d: 0.9, kind: "box", opacity: 0.65 })
    }
    disposePartSpecs(kioskSpecs)

    const benchSpecs = buildGalleryBenchSpecs(pal, lite)
    for (const bn of FLOOR_DECOR_LAYOUT.benches) {
      const pt = logicalToWorld(bn.cx, bn.cy, world)
      mainBatcher.addPlaced(benchSpecs, pt.x, 0, pt.z, bn.rotY ?? 0)
      contactShadows.push({ wx: pt.x, wz: pt.z, w: 2.15, d: 0.96, kind: "box", opacity: 0.65 })
    }
    disposePartSpecs(benchSpecs)

    const dividerSpecs = buildPlanterDividerSpecs(pal, lite)
    for (const dv of FLOOR_DECOR_LAYOUT.planterDividers) {
      const pt = logicalToWorld(dv.cx, dv.cy, world)
      const rotY = dv.rotY ?? 0
      mainBatcher.addPlaced(dividerSpecs, pt.x, 0, pt.z, rotY)
      const isVert = Math.abs(Math.sin(rotY)) > 0.5
      contactShadows.push({
        wx: pt.x,
        wz: pt.z,
        w: isVert ? 0.78 : 1.56,
        d: isVert ? 1.56 : 0.78,
        kind: "box",
        opacity: 0.65,
      })
    }
    disposePartSpecs(dividerSpecs)

    yield 0.44

    // Step 4: Gold Coin Piles + Wall Fixtures (World Clocks, 4 Framed Charts, 2nd LED Ticker, Lantern Brackets)
    const coinSpecs = buildGoldCoinPileSpecs(pal, lite)
    for (const cp of FLOOR_DECOR_LAYOUT.goldCoinPiles) {
      const pt = logicalToWorld(cp.cx, cp.cy, world)
      mainBatcher.addPlaced(coinSpecs, pt.x, 0, pt.z, cp.rotY ?? 0)
      contactShadows.push({ wx: pt.x, wz: pt.z, w: 0.76, d: 0.76, kind: "oval", opacity: 0.6 })
    }
    disposePartSpecs(coinSpecs)

    const wallZ = logicalToWorld(0, wallH, world).z
    const westInnerX = logicalToWorld(side, 0, world).x
    const eastInnerX = logicalToWorld(world.logicalW - side, 0, world).x

    const clockX = logicalToWorld(1254, wallH, world).x
    addWorldClocksFixture(mainBatcher, pal, visualAtlasMat, clockX, 2.66, wallZ + 0.04, lite)

    const chartNeX = logicalToWorld(1904, wallH, world).x
    addFramedStockChart(mainBatcher, pal, visualAtlasMat, {
      wx: chartNeX,
      wy: 2.55,
      wz: wallZ + 0.08,
      rotY: 0,
      width: 1.92,
      height: 1.32,
      quadrant: 0,
      lite,
    })
    const chartW1Z = logicalToWorld(side, 442, world).z
    addFramedStockChart(mainBatcher, pal, visualAtlasMat, {
      wx: westInnerX + 0.06,
      wy: 2.15,
      wz: chartW1Z,
      rotY: Math.PI / 2,
      width: 1.48,
      height: 1.0,
      quadrant: 1,
      stanchionFromY: 1.5,
      lite,
    })
    const chartE1Z = logicalToWorld(world.logicalW - side, 566, world).z
    addFramedStockChart(mainBatcher, pal, visualAtlasMat, {
      wx: eastInnerX - 0.06,
      wy: 2.15,
      wz: chartE1Z,
      rotY: -Math.PI / 2,
      width: 1.56,
      height: 1.04,
      quadrant: 2,
      stanchionFromY: 1.5,
      lite,
    })
    const chartE2Z = logicalToWorld(world.logicalW - side, 1140, world).z
    addFramedStockChart(mainBatcher, pal, visualAtlasMat, {
      wx: eastInnerX - 0.06,
      wy: 2.15,
      wz: chartE2Z,
      rotY: -Math.PI / 2,
      width: 1.56,
      height: 1.04,
      quadrant: 3,
      stanchionFromY: 1.5,
      lite,
    })

    // Second Smaller LED Ticker Strip mounted cleanly beneath SACO Nhận Định board
    const sacoX = logicalToWorld(1560, wallH, world).x
    const secTickerW = 7.3
    const secTickerH = 0.34
    const secTickerY = 0.72
    mainBatcher.add(new THREE.BoxGeometry(secTickerW + 0.16, secTickerH + 0.08, 0.1), pal.matte, [sacoX, secTickerY, wallZ + 0.12], {
      color: C.obsidian,
    })
    mainBatcher.add(new THREE.BoxGeometry(secTickerW + 0.2, 0.024, 0.12), pal.metal, [sacoX, secTickerY + secTickerH / 2 + 0.045, wallZ + 0.12], {
      color: C.gold,
    })
    mainBatcher.add(new THREE.PlaneGeometry(secTickerW, secTickerH), secondaryTickerMat, [sacoX, secTickerY, wallZ + 0.18], {
      castShadow: false,
      receiveShadow: false,
    })

    const lanternPlacements: InstancePlacement[] = []
    for (const lx of [84, 834, 1824]) {
      const wx = logicalToWorld(lx, wallH, world).x
      addLanternBracket(mainBatcher, pal, wx, 3.24, wallZ + 0.04, 0, undefined, lite)
      lanternPlacements.push({ x: wx, y: 3.28, z: wallZ + 0.46 })
    }
    for (const ly of [356, 868, 1176]) {
      const wz = logicalToWorld(side, ly, world).z
      addLanternBracket(mainBatcher, pal, westInnerX - 0.1, 2.38, wz, Math.PI / 2, 1.5, lite)
      lanternPlacements.push({ x: westInnerX + 0.32, y: 2.42, z: wz })
    }
    for (const ly of [392, 742, 1052, 1280]) {
      const wz = logicalToWorld(world.logicalW - side, ly, world).z
      addLanternBracket(mainBatcher, pal, eastInnerX + 0.1, 2.38, wz, -Math.PI / 2, 1.5, lite)
      lanternPlacements.push({ x: eastInnerX - 0.32, y: 2.42, z: wz })
    }

    yield 0.62

    // Flush merged static batcher (only ~7 draw calls for all unique & wall fixtures!)
    const mergedMeshes = mainBatcher.flushInto(staticGroup, "floor-decor-merged")
    for (const m of mergedMeshes) ownedGeometries.push(m.geometry)

    // Step 5: InstancedMesh repeats (Trading Islands ×3, Blossom Trees ×4, Bamboo ×6, Lucky Cats ×3, Lanterns ×10)
    const addInstancedGroup = (
      name: string,
      specs: readonly MergedPartSpec[],
      placements: readonly InstancePlacement[]
    ): void => {
      for (const s of specs) ownedGeometries.push(s.geometry)
      const meshes = mountInstancedSpecs(staticGroup, name, specs, placements)
      for (const m of meshes) ownedInstanced.push(m)
    }

    const islandPlacements: InstancePlacement[] = FLOOR_DECOR_LAYOUT.tradingIslands.map((o) => {
      const pt = logicalToWorld(o.cx, o.cy, world)
      contactShadows.push({ wx: pt.x, wz: pt.z, w: 2.1, d: 2.1, kind: "oval", opacity: 0.6 })
      return { x: pt.x, z: pt.z, rotY: o.rotY ?? 0 }
    })
    addInstancedGroup(
      "decor-trading-islands",
      buildTradingDeskIslandSpecs(pal, visualAtlasMat, lite),
      islandPlacements
    )

    yield 0.74

    // All 4 blossom trees share 1 base InstancedMesh + 1 tinted blossom crown InstancedMesh (Hoa Đào pink + Hoa Mai gold)
    const allBlossomPlacements: InstancePlacement[] = [
      ...FLOOR_DECOR_LAYOUT.peachTrees.map((o) => {
        const pt = logicalToWorld(o.cx, o.cy, world)
        contactShadows.push({ wx: pt.x, wz: pt.z, w: 0.96, d: 0.96, kind: "oval", opacity: 0.6 })
        return { x: pt.x, z: pt.z, rotY: o.rotY ?? 0, colorHex: C.blossomPink }
      }),
      ...FLOOR_DECOR_LAYOUT.apricotTrees.map((o) => {
        const pt = logicalToWorld(o.cx, o.cy, world)
        contactShadows.push({ wx: pt.x, wz: pt.z, w: 0.96, d: 0.96, kind: "oval", opacity: 0.6 })
        return { x: pt.x, z: pt.z, rotY: o.rotY ?? 0, colorHex: C.blossomApricot }
      }),
    ]
    const blossomBasePlacements: InstancePlacement[] = allBlossomPlacements.map(({ x, z, rotY }) => ({
      x,
      z,
      rotY,
    }))
    addInstancedGroup(
      "decor-blossom-trunks",
      buildBlossomTreeBaseSpecs(pal, lite),
      blossomBasePlacements
    )
    addInstancedGroup(
      "decor-blossom-crowns",
      buildBlossomCrownSpecs(pal, lite),
      allBlossomPlacements
    )

    const bambooPlacements: InstancePlacement[] = FLOOR_DECOR_LAYOUT.bambooPlanters.map((o) => {
      const pt = logicalToWorld(o.cx, o.cy, world)
      contactShadows.push({ wx: pt.x, wz: pt.z, w: 0.82, d: 0.82, kind: "oval", opacity: 0.6 })
      return { x: pt.x, z: pt.z, rotY: o.rotY ?? 0 }
    })
    addInstancedGroup("decor-bamboo-groves", buildBambooPlanterSpecs(pal, lite), bambooPlacements)

    yield 0.86

    const catPlacements: InstancePlacement[] = FLOOR_DECOR_LAYOUT.luckyCats.map((o) => {
      const pt = logicalToWorld(o.cx, o.cy, world)
      contactShadows.push({ wx: pt.x, wz: pt.z, w: 0.86, d: 0.8, kind: "box", opacity: 0.65 })
      return { x: pt.x, z: pt.z, rotY: o.rotY ?? 0 }
    })
    addInstancedGroup("decor-lucky-cats", buildLuckyCatSpecs(pal, lite), catPlacements)
    addInstancedGroup("decor-red-lanterns", buildRedLanternSpecs(pal, lite), lanternPlacements)

    // Step 6: Flat Gold Floor Decals (Compass Rose IQX Inlays + Right-Side-Up Directional Arrows) -> 1 merged draw call!
    const decalGeos: THREE.BufferGeometry[] = []
    const stampDecal = (
      lx: number,
      ly: number,
      w: number,
      h: number,
      yHeight: number,
      yaw: number,
      u0: number,
      vTop: number,
      u1: number,
      vBot: number
    ): void => {
      const pt = logicalToWorld(lx, ly, world)
      const geo = createAtlasPlaneGeometry(w, h, u0, vTop, u1, vBot)
      geo.rotateX(-Math.PI / 2)
      if (yaw !== 0) geo.rotateY(yaw)
      geo.translate(pt.x, yHeight, pt.z)
      decalGeos.push(geo)
    }

    // Grand Gold Compass Rose & IQX Medallion framing the central atrium cleanly beneath the red carpet (y=0.011 < 0.014)
    stampDecal(1024, 628, 4.4, 4.4, 0.011, 0, 0.005, 0.005, 0.495, 0.995)
    // Secondary IQX Gold Floor Medallions in SW & SE open walkable plazas (zero obstacles!)
    stampDecal(410, 1116, 2.75, 2.75, 0.012, 0, 0.005, 0.005, 0.495, 0.995)
    stampDecal(1650, 1240, 2.75, 2.75, 0.012, 0, 0.005, 0.005, 0.495, 0.995)

    // 4 Directional Gold Floor Arrows (top-right of decalsWaterTex, 4 rows in v [0..0.5])
    stampDecal(196, 695, 1.54, 0.44, 0.015, 0, 0.508, 0.008, 0.992, 0.118)
    stampDecal(1255, 865, 1.54, 0.44, 0.015, 0, 0.508, 0.133, 0.992, 0.243)
    stampDecal(748, 530, 1.54, 0.44, 0.015, -0.32, 0.508, 0.258, 0.992, 0.368)
    stampDecal(822, 816, 1.54, 0.44, 0.015, 0, 0.508, 0.383, 0.992, 0.493)

    const mergedDecals = mergeIndexedGeometries(decalGeos, { disposeInputs: true })
    if (mergedDecals) {
      ownedGeometries.push(mergedDecals)
      const decalMesh = new THREE.Mesh(mergedDecals, decalsMat)
      decalMesh.name = "floor-decor-inlays"
      staticGroup.add(decalMesh)
    }

    const koiNodes = koi.koiNodes
    const rippleMesh = koi.rippleMesh
    const rippleMat = koi.rippleMat

    const update = (dt: number, elapsedS: number, reducedMotion: boolean): void => {
      if (disposed) return
      if (!reducedMotion && dt > 0) {
        secondaryTicker.texture.offset.x =
          (secondaryTicker.texture.offset.x + dt * 0.052) % 1
      }
      const t = reducedMotion ? 0 : elapsedS
      for (let i = 0; i < koiNodes.length; i += 1) {
        const fish = koiNodes[i]!
        const phase = t * (0.72 + i * 0.22) + i * Math.PI
        const rad = 0.44 + i * 0.13
        fish.position.set(Math.cos(phase) * rad, 0.278, Math.sin(phase) * rad)
        fish.rotation.y = -phase + Math.sin(t * 7 + i * 2) * 0.12
      }
      if (!reducedMotion) {
        const rp = (elapsedS * 0.45) % 1
        const sc = 0.78 + rp * 1.15
        rippleMesh.scale.set(sc, sc, 1)
        rippleMat.opacity = (1 - rp) * 0.42
      } else {
        rippleMesh.scale.set(1, 1, 1)
        rippleMat.opacity = 0.26
      }
    }

    const refreshDynamicTextures = (): void => {
      if (disposed) return
      secondaryTicker.texture.needsUpdate = true
    }

    outRef.mount = {
      staticGroup,
      animatedGroup: koi.animatedGroup,
      contactShadows,
      fountainSparkPos: { x: koiPt.x, y: 0.46, z: koiPt.z },
      update,
      refreshDynamicTextures,
      dispose: disposeAll,
    }
    mounted = true

    yield 1
  } finally {
    if (!mounted) {
      disposeAll()
    }
  }
}
