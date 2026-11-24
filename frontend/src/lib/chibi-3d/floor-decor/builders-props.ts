import * as THREE from "three"

import {
  DECOR_COLORS as C,
  DecorMeshBatcher,
  createAtlasCircleGeometry,
  createAtlasPlaneGeometry,
  createSculptedLeafGeometry,
  roundedBox,
  type FloorDecorPalette,
  type MergedPartSpec,
} from "./helpers.ts"

/**
 * 1. Round High-Top Trading Desk Island with dual angled mini candlestick monitors
 *    and 3 cushioned bar stools (uses vertex-colored matte + metal + visualAtlas -> 3 draw calls total!).
 */
export function buildTradingDeskIslandSpecs(
  pal: FloorDecorPalette,
  visualAtlasMat: THREE.Material,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const cyl = lite ? 10 : 18
  const stoolCyl = lite ? 8 : 14
  const tableH = 0.94
  const tableR = 0.56

  b.add(new THREE.CylinderGeometry(0.32, 0.36, 0.045, cyl), pal.matte, [0, 0.022, 0], { color: C.obsidian })
  b.add(new THREE.CylinderGeometry(0.28, 0.3, 0.025, cyl), pal.metal, [0, 0.055, 0], { color: C.gold })
  b.add(new THREE.CylinderGeometry(0.085, 0.11, tableH - 0.08, cyl), pal.matte, [0, tableH * 0.5, 0], { color: C.walnut })
  b.add(new THREE.TorusGeometry(0.11, 0.015, 6, cyl), pal.metal, [0, 0.34, 0], { color: C.gold, rot: [Math.PI / 2, 0, 0] })
  b.add(new THREE.CylinderGeometry(tableR * 0.95, tableR * 0.88, 0.045, cyl), pal.matte, [0, tableH - 0.032, 0], { color: C.walnut })
  b.add(new THREE.CylinderGeometry(tableR, tableR, 0.042, cyl), pal.matte, [0, tableH + 0.008, 0], { color: C.marbleCream })
  b.add(new THREE.TorusGeometry(tableR, 0.014, 6, cyl), pal.metal, [0, tableH + 0.012, 0], { color: C.gold, rot: [Math.PI / 2, 0, 0] })

  const topY = tableH + 0.03
  b.add(new THREE.CylinderGeometry(0.05, 0.065, 0.03, stoolCyl), pal.matte, [0, topY + 0.015, 0], { color: C.obsidian })
  b.add(new THREE.CylinderGeometry(0.026, 0.026, 0.28, stoolCyl), pal.metal, [0, topY + 0.15, 0], { color: C.chrome })

  // Trading Monitor UV in visualAtlas: sub-TL of BR quadrant -> u [0.506, 0.744], vTop 0.506..0.744
  const screenGeo = createAtlasPlaneGeometry(0.36, 0.22, 0.506, 0.506, 0.744, 0.744)
  for (const side of [-1, 1] as const) {
    const mz = side * 0.06
    const rotY = side === 1 ? 0 : Math.PI
    const tilt = side === 1 ? -0.14 : 0.14
    b.add(roundedBox(0.41, 0.26, 0.028, 0.012, lite), pal.matte, [0, topY + 0.28, mz], { color: C.obsidian, rot: [tilt, rotY, 0] })
    b.add(screenGeo, visualAtlasMat, [0, topY + 0.28, mz + side * 0.017], {
      rot: [tilt, rotY, 0],
      castShadow: false,
      receiveShadow: false,
      disposeRaw: false,
    })
    b.add(roundedBox(0.24, 0.014, 0.09, 0.005, lite), pal.matte, [0, topY + 0.008, side * 0.3], {
      color: C.porcelain,
      rot: [0, rotY, 0],
    })
  }
  screenGeo.dispose()

  b.add(new THREE.CylinderGeometry(0.032, 0.028, 0.064, 8), pal.matte, [0.32, topY + 0.032, 0.06], { color: C.porcelain })
  b.add(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 8), pal.matte, [0.32, topY + 0.062, 0.06], { color: C.darkWood })

  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 6
    const sx = Math.cos(a) * 0.64
    const sz = Math.sin(a) * 0.64
    const stoolH = 0.62
    b.add(new THREE.CylinderGeometry(0.14, 0.16, 0.025, stoolCyl), pal.metal, [sx, 0.012, sz], { color: C.chrome })
    b.add(new THREE.CylinderGeometry(0.024, 0.028, stoolH - 0.06, stoolCyl), pal.metal, [sx, stoolH * 0.48, sz], { color: C.chrome })
    b.add(new THREE.TorusGeometry(0.125, 0.011, 5, stoolCyl), pal.metal, [sx, 0.24, sz], { color: C.gold, rot: [Math.PI / 2, 0, 0] })
    b.add(new THREE.CylinderGeometry(0.17, 0.14, 0.04, stoolCyl), pal.matte, [sx, stoolH - 0.03, sz], { color: C.walnut })
    b.add(new THREE.CylinderGeometry(0.18, 0.175, 0.075, stoolCyl), pal.matte, [sx, stoolH + 0.025, sz], { color: C.navyVelvet })
    b.add(
      new THREE.SphereGeometry(0.175, stoolCyl, lite ? 5 : 8, 0, Math.PI * 2, 0, Math.PI / 2),
      pal.matte,
      [sx, stoolH + 0.058, sz],
      { color: C.navyVelvet, scale: [1, 0.24, 1] }
    )
  }

  return b.flushToSpecs()
}

/**
 * 2. Koi Pond & Prosperity Lotus Wishing Fountain (static masonry + animated koi/ripple).
 */
export function buildKoiFountain(
  pal: FloorDecorPalette,
  decalsWaterTex: THREE.Texture,
  lite: boolean
): {
  staticSpecs: MergedPartSpec[]
  animatedGroup: THREE.Group
  waterMat: THREE.MeshStandardMaterial
  rippleMat: THREE.MeshBasicMaterial
  koiNodes: THREE.Object3D[]
  rippleMesh: THREE.Mesh
} {
  const b = new DecorMeshBatcher()
  const sides = 8
  const outerR = 0.94
  const innerR = 0.78
  const wallH = 0.34

  b.add(new THREE.CylinderGeometry(outerR + 0.08, outerR + 0.11, 0.07, sides), pal.matte, [0, 0.035, 0], { color: C.marbleCream })
  b.add(new THREE.CylinderGeometry(outerR + 0.05, outerR + 0.05, 0.022, sides), pal.metal, [0, 0.078, 0], { color: C.gold })

  const segLen = 2 * ((outerR + innerR) / 2) * Math.tan(Math.PI / sides) + 0.07
  const wallThick = outerR - innerR
  const midR = (outerR + innerR) / 2
  for (let i = 0; i < sides; i += 1) {
    const a = (i * Math.PI * 2) / sides + Math.PI / sides
    const wx = Math.cos(a) * midR
    const wz = Math.sin(a) * midR
    b.add(roundedBox(wallThick, wallH - 0.05, segLen, 0.024, lite), pal.matte, [wx, 0.08 + (wallH - 0.05) / 2, wz], {
      color: C.marbleLight,
      rot: [0, -a, 0],
    })
    b.add(roundedBox(wallThick + 0.05, 0.045, segLen + 0.03, 0.016, lite), pal.matte, [wx, wallH + 0.035, wz], {
      color: C.marbleCream,
      rot: [0, -a, 0],
    })
    b.add(roundedBox(0.035, 0.018, segLen, 0.006, lite), pal.metal, [Math.cos(a) * (outerR + 0.01), wallH + 0.06, Math.sin(a) * (outerR + 0.01)], {
      color: C.gold,
      rot: [0, -a, 0],
    })
  }

  const cyl = lite ? 10 : 18
  b.add(new THREE.CylinderGeometry(0.16, 0.24, 0.26, cyl), pal.matte, [0, 0.2, 0], { color: C.marbleCream })
  b.add(new THREE.CylinderGeometry(0.32, 0.14, 0.12, cyl), pal.matte, [0, 0.38, 0], { color: C.marbleLight })
  b.add(new THREE.TorusGeometry(0.31, 0.022, 6, cyl), pal.metal, [0, 0.44, 0], { color: C.gold, rot: [Math.PI / 2, 0, 0] })
  b.add(new THREE.CylinderGeometry(0.09, 0.12, 0.26, cyl), pal.matte, [0, 0.56, 0], { color: C.marbleCream })
  b.add(new THREE.CylinderGeometry(0.18, 0.08, 0.09, cyl), pal.metal, [0, 0.72, 0], { color: C.gold })

  const leafGeo = createSculptedLeafGeometry(lite)
  const petalN = lite ? 5 : 8
  for (let i = 0; i < petalN; i += 1) {
    const yaw = (i * Math.PI * 2) / petalN
    b.add(leafGeo, pal.metal, [0, 0.75, 0], {
      color: C.goldBright,
      rot: [0.78, yaw, 0],
      scale: [0.38, 0.36, 0.38],
      disposeRaw: false,
    })
  }
  b.add(new THREE.CylinderGeometry(0.11, 0.11, 0.03, cyl), pal.metal, [0, 0.94, 0], { color: C.goldBright, rot: [Math.PI / 2, 0, 0] })
  b.add(roundedBox(0.055, 0.055, 0.036, 0.006, lite), pal.matte, [0, 0.94, 0], { color: C.crimsonLacquer })

  if (!lite) {
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2 + Math.PI / 4
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 0.16, 0.74, Math.sin(a) * 0.16),
        new THREE.Vector3(Math.cos(a) * 0.34, 0.64, Math.sin(a) * 0.34),
        new THREE.Vector3(Math.cos(a) * 0.46, 0.27, Math.sin(a) * 0.46),
      ])
      b.add(new THREE.TubeGeometry(c, 8, 0.013, 5, false), pal.glassDome, [0, 0, 0], {
        castShadow: false,
        receiveShadow: false,
      })
    }
  }

  const pads: readonly [number, number, number, boolean][] = [
    [-0.48, 0.34, 0.15, true],
    [0.5, -0.32, 0.14, true],
    [-0.36, -0.46, 0.12, false],
    [0.44, 0.42, 0.13, false],
  ]
  for (const [px, pz, r, hasFlower] of pads) {
    b.add(
      new THREE.CylinderGeometry(r, r, 0.014, lite ? 8 : 14, 1, false, 0, Math.PI * 1.82),
      pal.matte,
      [px, 0.285, pz],
      { color: C.leafMid, rot: [0, px * 3, 0] }
    )
    if (hasFlower) {
      for (let k = 0; k < 5; k += 1) {
        b.add(leafGeo, pal.matte, [px, 0.295, pz], {
          color: C.blossomPink,
          rot: [0.65, (k * Math.PI * 2) / 5, 0],
          scale: [0.2, 0.2, 0.2],
          disposeRaw: false,
        })
      }
    }
  }
  leafGeo.dispose()

  const waterMat = new THREE.MeshStandardMaterial({
    map: decalsWaterTex,
    emissive: new THREE.Color("#22b8cf"),
    emissiveIntensity: 0.18,
    roughness: 0.14,
    metalness: 0.18,
  })
  // Pond water maps into Bottom-Right square (512..768, 256..512) of decalsAndWaterAtlas
  const waterGeo = createAtlasCircleGeometry(innerR + 0.02, sides, 0.505, 0.505, 0.745, 0.995)
  b.add(waterGeo, waterMat, [0, 0.278, 0], { castShadow: false, receiveShadow: true })

  // Animated group: 2 merged vertex-colored chibi koi fish + 1 water ripple ring (3 draw calls total!)
  const animatedGroup = new THREE.Group()
  animatedGroup.name = "floor-decor-koi-animated"

  const koiNodes: THREE.Object3D[] = []
  const koiColors = [C.koiOrange, C.goldBright] as const
  for (let i = 0; i < 2; i += 1) {
    const koiBatch = new DecorMeshBatcher()
    const bodyHex = koiColors[i]!
    koiBatch.add(new THREE.SphereGeometry(0.055, lite ? 7 : 10, lite ? 5 : 8), pal.matte, [0, 0, 0], {
      color: bodyHex,
      scale: [0.85, 0.72, 1.85],
      castShadow: false,
      receiveShadow: false,
    })
    koiBatch.add(new THREE.SphereGeometry(0.036, 6, 5), pal.matte, [0, 0.024, 0.025], {
      color: C.porcelain,
      scale: [0.9, 0.55, 1.05],
      castShadow: false,
      receiveShadow: false,
    })
    koiBatch.add(new THREE.ConeGeometry(0.048, 0.095, 4), pal.matte, [0, 0, -0.12], {
      color: bodyHex,
      rot: [Math.PI / 2, 0, 0],
      scale: [0.42, 1, 1.1],
      castShadow: false,
      receiveShadow: false,
    })
    const koiMeshes = koiBatch.flushInto(animatedGroup, `koi-fish-${i}`)
    if (koiMeshes[0]) koiNodes.push(koiMeshes[0])
  }

  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xe0f7fa,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })
  const rippleMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.36, lite ? 16 : 24),
    rippleMat
  )
  rippleMesh.name = "koi-ripple-ring"
  rippleMesh.rotation.x = -Math.PI / 2
  rippleMesh.position.y = 0.288
  animatedGroup.add(rippleMesh)

  return {
    staticSpecs: b.flushToSpecs(),
    animatedGroup,
    waterMat,
    rippleMat,
    koiNodes,
    rippleMesh,
  }
}

function addSculpturePedestal(
  b: DecorMeshBatcher,
  pal: FloorDecorPalette,
  accentHex: string,
  lite: boolean
): number {
  b.add(roundedBox(1.06, 0.09, 0.78, 0.022, lite), pal.matte, [0, 0.045, 0], { color: C.obsidian })
  b.add(roundedBox(0.96, 0.04, 0.68, 0.014, lite), pal.metal, [0, 0.105, 0], { color: accentHex })
  b.add(roundedBox(0.86, 0.36, 0.58, 0.024, lite), pal.matte, [0, 0.305, 0], { color: C.marbleCream })
  b.add(roundedBox(0.94, 0.05, 0.66, 0.016, lite), pal.metal, [0, 0.51, 0], { color: accentHex })
  b.add(roundedBox(0.84, 0.036, 0.56, 0.012, lite), pal.matte, [0, 0.553, 0], { color: C.obsidian })
  b.add(roundedBox(0.42, 0.14, 0.022, 0.008, lite), pal.metal, [0, 0.31, 0.296], { color: accentHex })
  return 0.57
}

/** 3a. Golden Charging Chibi Bull Statue near Vinh danh. */
export function buildBullStatueSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const topY = addSculpturePedestal(b, pal, C.gold, lite)
  const seg = lite ? 8 : 14

  b.add(new THREE.SphereGeometry(0.24, seg, seg), pal.metal, [0, topY + 0.32, -0.02], {
    color: C.goldBright,
    rot: [0.14, 0, 0],
    scale: [0.95, 0.92, 1.28],
  })
  b.add(new THREE.SphereGeometry(0.19, seg, seg), pal.metal, [0, topY + 0.42, 0.08], {
    color: C.goldBright,
    scale: [1.08, 0.95, 0.9],
  })

  const legs: readonly [number, number, number, number][] = [
    [-0.14, 0.13, 0.15, -0.18],
    [0.14, 0.14, 0.2, 0.28],
    [-0.14, 0.13, -0.17, 0.16],
    [0.14, 0.13, -0.17, 0.12],
  ]
  for (const [lx, ly, lz, pitch] of legs) {
    b.add(new THREE.CapsuleGeometry(0.062, 0.12, 4, lite ? 6 : 10), pal.metal, [lx, topY + ly, lz], {
      color: C.gold,
      rot: [pitch, 0, 0],
    })
    b.add(new THREE.CylinderGeometry(0.068, 0.072, 0.04, 8), pal.matte, [lx, topY + 0.02, lz + pitch * 0.06], {
      color: C.obsidian,
    })
  }

  const hy = topY + 0.52
  const hz = 0.27
  b.add(new THREE.SphereGeometry(0.21, seg, seg), pal.metal, [0, hy, hz], {
    color: C.goldBright,
    scale: [1.05, 0.95, 0.98],
  })
  b.add(roundedBox(0.24, 0.14, 0.14, 0.055, lite), pal.metal, [0, hy - 0.05, hz + 0.16], { color: C.gold })
  b.add(new THREE.TorusGeometry(0.048, 0.011, 6, 12), pal.metal, [0, hy - 0.11, hz + 0.235], {
    color: C.goldBright,
    rot: [0.25, 0, 0],
  })
  for (const side of [-1, 1] as const) {
    b.add(new THREE.SphereGeometry(0.028, 7, 6), pal.matte, [side * 0.09, hy + 0.045, hz + 0.175], { color: C.obsidian })
    b.add(new THREE.SphereGeometry(0.058, 7, 6), pal.metal, [side * 0.21, hy + 0.04, hz - 0.02], {
      color: C.gold,
      rot: [0, 0, -side * 0.35],
      scale: [1.2, 0.55, 0.7],
    })
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.12, hy + 0.14, hz + 0.01),
      new THREE.Vector3(side * 0.28, hy + 0.2, hz + 0.07),
      new THREE.Vector3(side * 0.31, hy + 0.34, hz + 0.15),
    ])
    b.add(new THREE.TubeGeometry(hornCurve, lite ? 5 : 9, 0.032, lite ? 5 : 8, false), pal.metal, [0, 0, 0], {
      color: C.goldBright,
    })
    b.add(new THREE.ConeGeometry(0.03, 0.075, 6), pal.metal, [side * 0.31, hy + 0.37, hz + 0.16], {
      color: C.goldBright,
      rot: [0.25, 0, -side * 0.1],
    })
  }

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, topY + 0.34, -0.3),
    new THREE.Vector3(0.05, topY + 0.42, -0.39),
    new THREE.Vector3(0.08, topY + 0.28, -0.43),
  ])
  b.add(new THREE.TubeGeometry(tailCurve, 6, 0.018, 5, false), pal.metal, [0, 0, 0], { color: C.gold })
  b.add(new THREE.SphereGeometry(0.035, 6, 6), pal.metal, [0.08, topY + 0.26, -0.43], { color: C.goldBright })

  return b.flushToSpecs()
}

/** 3b. Obsidian-Bronze Chibi Bear Statue companion near Vinh danh. */
export function buildBearStatueSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const topY = addSculpturePedestal(b, pal, C.bronze, lite)
  const seg = lite ? 8 : 14

  b.add(new THREE.SphereGeometry(0.24, seg, seg), pal.metal, [0, topY + 0.31, 0], {
    color: C.bronze,
    scale: [1.06, 1.15, 0.96],
  })
  b.add(new THREE.SphereGeometry(0.15, seg, seg), pal.metal, [0, topY + 0.29, 0.13], {
    color: C.gold,
    scale: [0.95, 1.05, 0.55],
  })

  for (const side of [-1, 1] as const) {
    b.add(new THREE.CapsuleGeometry(0.078, 0.12, 4, lite ? 6 : 10), pal.metal, [side * 0.14, topY + 0.11, 0.06], {
      color: C.bronze,
      rot: [0.18, 0, 0],
    })
    b.add(new THREE.CapsuleGeometry(0.066, 0.16, 4, lite ? 6 : 10), pal.metal, [side * 0.24, topY + 0.42, 0.09], {
      color: C.bronze,
      rot: [-0.55, 0, side * 0.45],
    })
  }

  const hy = topY + 0.69
  b.add(new THREE.SphereGeometry(0.23, seg, seg), pal.metal, [0, hy, 0.03], {
    color: C.bronze,
    scale: [1.06, 0.98, 0.98],
  })
  b.add(new THREE.SphereGeometry(0.095, seg, seg), pal.metal, [0, hy - 0.04, 0.22], {
    color: C.gold,
    scale: [1.12, 0.85, 0.78],
  })
  b.add(new THREE.SphereGeometry(0.034, 7, 6), pal.matte, [0, hy - 0.005, 0.295], {
    color: C.obsidian,
    scale: [1.2, 0.82, 0.8],
  })

  for (const side of [-1, 1] as const) {
    b.add(new THREE.SphereGeometry(0.078, seg, seg), pal.metal, [side * 0.17, hy + 0.18, 0.01], { color: C.bronze })
    b.add(new THREE.SphereGeometry(0.046, 7, 6), pal.metal, [side * 0.17, hy + 0.18, 0.055], {
      color: C.gold,
      scale: [1, 1, 0.55],
    })
    b.add(new THREE.SphereGeometry(0.028, 7, 6), pal.matte, [side * 0.088, hy + 0.04, 0.22], { color: C.obsidian })
  }
  b.add(new THREE.SphereGeometry(0.06, 7, 6), pal.metal, [0, topY + 0.18, -0.23], { color: C.bronze })

  return b.flushToSpecs()
}

/** 4. Coffee & Tea Bar Corner (counter, espresso brewer, pastry dome, tea service, menu board, 2 stools). */
export function buildCoffeeBarSpecs(
  pal: FloorDecorPalette,
  visualAtlasMat: THREE.Material,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const w = 2.6
  const d = 0.78
  const h = 0.92
  const cyl = lite ? 8 : 14

  b.add(roundedBox(w - 0.06, 0.09, d - 0.06, 0.012, lite), pal.matte, [0, 0.045, 0], { color: C.obsidian })
  b.add(roundedBox(w, h - 0.09, d, 0.028, lite), pal.matte, [0, 0.09 + (h - 0.09) / 2, 0], { color: C.walnut })
  b.add(roundedBox(w + 0.04, 0.036, 0.03, 0.01, lite), pal.metal, [0, 0.16, d / 2 + 0.008], { color: C.gold })
  b.add(roundedBox(w + 0.04, 0.036, 0.03, 0.01, lite), pal.metal, [0, h - 0.05, d / 2 + 0.008], { color: C.gold })
  b.add(roundedBox(w + 0.12, 0.068, d + 0.14, 0.022, lite), pal.matte, [0, h + 0.034, 0.03], { color: C.marbleLight })

  const slatStep = lite ? 0.24 : 0.15
  for (let sx = -w / 2 + 0.18; sx <= w / 2 - 0.18; sx += slatStep) {
    b.add(roundedBox(0.05, h - 0.28, 0.024, 0.01, true), pal.matte, [sx, 0.18 + (h - 0.28) / 2, d / 2 + 0.008], {
      color: C.honeyWood,
    })
  }

  const topY = h + 0.068

  const ex = -0.82
  b.add(roundedBox(0.42, 0.36, 0.3, 0.03, lite), pal.metal, [ex, topY + 0.2, -0.04], { color: C.chrome })
  b.add(roundedBox(0.4, 0.055, 0.18, 0.014, lite), pal.matte, [ex, topY + 0.028, 0.08], { color: C.obsidian })
  b.add(new THREE.SphereGeometry(0.016, 6, 6), pal.warmGlow, [ex + 0.13, topY + 0.32, 0.11], {
    castShadow: false,
    receiveShadow: false,
  })

  b.add(new THREE.CylinderGeometry(0.22, 0.2, 0.028, cyl), pal.matte, [-0.12, topY + 0.014, 0.04], { color: C.honeyWood })
  for (const [px, pz] of [[-0.18, 0.08], [-0.06, 0.08], [-0.12, -0.02]] as const) {
    b.add(new THREE.SphereGeometry(0.052, 8, 6), pal.matte, [px, topY + 0.058, pz], {
      color: C.pastryGold,
      scale: [1.25, 0.72, 0.9],
    })
  }
  b.add(
    new THREE.SphereGeometry(0.21, cyl, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2),
    pal.glassDome,
    [-0.12, topY + 0.028, 0.04],
    { castShadow: false, receiveShadow: false }
  )
  b.add(new THREE.SphereGeometry(0.026, 7, 6), pal.metal, [-0.12, topY + 0.245, 0.04], { color: C.gold })

  const tx = 0.54
  b.add(roundedBox(0.46, 0.022, 0.3, 0.008, lite), pal.matte, [tx, topY + 0.011, 0.02], { color: C.darkWood })
  b.add(new THREE.SphereGeometry(0.095, cyl, lite ? 6 : 10), pal.matte, [tx - 0.09, topY + 0.1, 0], {
    color: C.celadonCeramic,
    scale: [1.05, 0.85, 1.05],
  })
  b.add(new THREE.SphereGeometry(0.025, 7, 6), pal.metal, [tx - 0.09, topY + 0.188, 0], { color: C.gold })
  b.add(new THREE.CylinderGeometry(0.016, 0.024, 0.11, 7), pal.matte, [tx - 0.2, topY + 0.12, 0], {
    color: C.celadonCeramic,
    rot: [0, 0, 0.72],
  })
  for (const [cx, cz] of [[0.09, -0.06], [0.15, 0.05], [0.04, 0.07]] as const) {
    b.add(new THREE.CylinderGeometry(0.032, 0.024, 0.045, 8), pal.matte, [tx + cx, topY + 0.044, cz], { color: C.porcelain })
  }

  // Menu board (`TRÀ & CÀ PHÊ IQX`, visualAtlas sub-BL of BR quadrant: u [0.506, 0.744], vTop [0.756, 0.994])
  const mx = 1.04
  b.add(roundedBox(0.42, 0.5, 0.038, 0.014, lite), pal.matte, [mx, topY + 0.25, -0.06], {
    color: C.darkWood,
    rot: [-0.18, -0.18, 0],
  })
  const menuGeo = createAtlasPlaneGeometry(0.36, 0.44, 0.506, 0.756, 0.744, 0.994)
  b.add(menuGeo, visualAtlasMat, [mx - 0.004, topY + 0.254, -0.038], {
    rot: [-0.18, -0.18, 0],
    castShadow: false,
    receiveShadow: false,
  })

  for (const sx of [-0.62, 0.52]) {
    const sz = d / 2 + 0.26
    b.add(new THREE.CylinderGeometry(0.13, 0.15, 0.024, cyl), pal.metal, [sx, 0.012, sz], { color: C.chrome })
    b.add(new THREE.CylinderGeometry(0.022, 0.026, 0.56, cyl), pal.metal, [sx, 0.3, sz], { color: C.chrome })
    b.add(new THREE.TorusGeometry(0.115, 0.01, 5, cyl), pal.metal, [sx, 0.22, sz], { color: C.gold, rot: [Math.PI / 2, 0, 0] })
    b.add(new THREE.CylinderGeometry(0.165, 0.155, 0.07, cyl), pal.matte, [sx, 0.61, sz], { color: C.crimsonLacquer })
  }

  return b.flushToSpecs()
}

/** 5. Financial Newsstand with striped navy-and-gold awning and tiered rows of tiny newspapers. */
export function buildNewsstandSpecs(
  pal: FloorDecorPalette,
  visualAtlasMat: THREE.Material,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const w = 1.56
  const d = 0.78

  b.add(roundedBox(w - 0.04, 0.07, d - 0.04, 0.012, lite), pal.matte, [0, 0.035, 0], { color: C.obsidian })
  b.add(roundedBox(w, 0.56, d, 0.024, lite), pal.matte, [0, 0.35, 0], { color: C.walnut })
  b.add(roundedBox(w + 0.04, 0.036, 0.03, 0.01, lite), pal.metal, [0, 0.62, d / 2 + 0.006], { color: C.gold })

  // Miniature newspaper front page UV (visualAtlas BR sub-BR lower portion)
  const paperGeo = createAtlasPlaneGeometry(0.24, 0.18, 0.758, 0.812, 0.992, 0.992)
  for (let tier = 0; tier < 3; tier += 1) {
    const ty = 0.68 + tier * 0.2
    const tz = 0.22 - tier * 0.2
    b.add(roundedBox(w - 0.08, 0.036, 0.22, 0.01, lite), pal.matte, [0, ty, tz], { color: C.honeyWood, rot: [0.22, 0, 0] })
    b.add(roundedBox(w - 0.08, 0.045, 0.022, 0.006, lite), pal.metal, [0, ty - 0.01, tz + 0.1], { color: C.gold, rot: [0.22, 0, 0] })
    for (let col = 0; col < 4; col += 1) {
      const nx = -w * 0.35 + col * (w * 0.235)
      b.add(roundedBox(0.26, 0.032, 0.19, 0.006, lite), pal.matte, [nx, ty + 0.03, tz + 0.01], {
        color: col % 2 === 0 ? C.paperCream : C.marbleLight,
        rot: [0.24, (col - 1.5) * 0.03, 0],
      })
      b.add(paperGeo, visualAtlasMat, [nx, ty + 0.049, tz + 0.015], {
        rot: [-Math.PI / 2 + 0.24, 0, (col - 1.5) * 0.03],
        castShadow: false,
        receiveShadow: false,
        disposeRaw: false,
      })
    }
  }
  paperGeo.dispose()

  b.add(roundedBox(w, 0.86, 0.06, 0.018, lite), pal.matte, [0, 1.04, -d / 2 + 0.04], { color: C.walnut })
  for (const side of [-1, 1] as const) {
    b.add(roundedBox(0.065, 1.18, 0.065, 0.015, lite), pal.matte, [side * (w / 2 - 0.05), 1.2, d / 2 - 0.05], { color: C.darkWood })
    b.add(roundedBox(0.065, 1.28, 0.065, 0.015, lite), pal.matte, [side * (w / 2 - 0.05), 1.26, -d / 2 + 0.05], { color: C.darkWood })
  }

  const stripes = 6
  const stripeW = (w + 0.14) / stripes
  for (let i = 0; i < stripes; i += 1) {
    const sx = -(w + 0.14) / 2 + (i + 0.5) * stripeW
    const isNavy = i % 2 === 0
    b.add(roundedBox(stripeW - 0.006, 0.042, d + 0.24, 0.012, lite), isNavy ? pal.matte : pal.metal, [sx, 1.84, 0.06], {
      color: isNavy ? C.navyVelvet : C.gold,
      rot: [0.22, 0, 0],
    })
    b.add(roundedBox(stripeW - 0.012, 0.11, 0.032, 0.01, lite), isNavy ? pal.matte : pal.metal, [sx, 1.71, d / 2 + 0.15], {
      color: isNavy ? C.navyVelvet : C.gold,
    })
  }

  // Top sign banner (`QUẦY BÁO TÀI CHÍNH`, visualAtlas BR top bar)
  b.add(roundedBox(w * 0.86, 0.22, 0.05, 0.014, lite), pal.metal, [0, 2.02, -0.02], { color: C.gold })
  const signGeo = createAtlasPlaneGeometry(w * 0.8, 0.17, 0.754, 0.754, 0.996, 0.804)
  b.add(signGeo, visualAtlasMat, [0, 2.02, 0.009], { castShadow: false, receiveShadow: false })

  return b.flushToSpecs()
}

/** 6. Sleek IQX Touchscreen Info Kiosk (angled directory display + brochure pocket). */
export function buildInfoKioskSpecs(
  pal: FloorDecorPalette,
  visualAtlasMat: THREE.Material,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()

  b.add(roundedBox(0.66, 0.055, 0.54, 0.018, lite), pal.matte, [0, 0.028, 0], { color: C.obsidian })
  b.add(roundedBox(0.58, 0.024, 0.46, 0.01, lite), pal.metal, [0, 0.065, 0], { color: C.gold })
  b.add(roundedBox(0.46, 0.92, 0.18, 0.026, lite), pal.matte, [0, 0.52, -0.04], { color: C.obsidian })
  b.add(roundedBox(0.036, 0.86, 0.2, 0.01, lite), pal.metal, [-0.24, 0.52, -0.04], { color: C.gold })
  b.add(roundedBox(0.036, 0.86, 0.2, 0.01, lite), pal.metal, [0.24, 0.52, -0.04], { color: C.gold })

  b.add(roundedBox(0.64, 0.56, 0.09, 0.024, lite), pal.metal, [0, 1.16, 0.03], { color: C.gold, rot: [-0.42, 0, 0] })
  b.add(roundedBox(0.58, 0.5, 0.095, 0.016, lite), pal.matte, [0, 1.16, 0.036], { color: C.obsidian, rot: [-0.42, 0, 0] })
  // Info Kiosk UV in visualAtlas: sub-TR of BR quadrant -> u [0.756, 0.994], vTop [0.506, 0.744]
  const screenGeo = createAtlasPlaneGeometry(0.52, 0.44, 0.756, 0.506, 0.994, 0.744)
  b.add(screenGeo, visualAtlasMat, [0, 1.168, 0.088], { rot: [-0.42, 0, 0], castShadow: false, receiveShadow: false })

  b.add(roundedBox(0.44, 0.022, 0.026, 0.008, lite), pal.warmGlow, [0, 1.41, -0.08], {
    rot: [-0.42, 0, 0],
    castShadow: false,
    receiveShadow: false,
  })
  b.add(roundedBox(0.32, 0.18, 0.07, 0.012, lite), pal.metal, [0, 0.56, 0.08], { color: C.gold })
  b.add(roundedBox(0.26, 0.22, 0.03, 0.006, lite), pal.matte, [0, 0.6, 0.082], { color: C.paperCream })

  return b.flushToSpecs()
}

/** 7. Plush Walnut & Navy Velvet Gallery Bench. */
export function buildGalleryBenchSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const w = 1.78
  const d = 0.58
  const cyl = lite ? 7 : 12

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const lx = sx * (w / 2 - 0.16)
      const lz = sz * (d / 2 - 0.1)
      b.add(new THREE.CylinderGeometry(0.03, 0.02, 0.28, cyl), pal.matte, [lx, 0.14, lz], {
        color: C.walnut,
        rot: [sz * 0.06, 0, -sx * 0.06],
      })
      b.add(new THREE.CylinderGeometry(0.024, 0.022, 0.04, cyl), pal.metal, [lx + sx * 0.006, 0.02, lz + sz * 0.006], {
        color: C.gold,
      })
    }
  }
  b.add(roundedBox(w - 0.36, 0.026, 0.026, 0.008, lite), pal.metal, [0, 0.14, 0], { color: C.gold })
  b.add(roundedBox(w, 0.075, d, 0.022, lite), pal.matte, [0, 0.31, 0], { color: C.walnut })
  b.add(roundedBox(w - 0.04, 0.135, d - 0.04, 0.048, lite), pal.matte, [0, 0.41, 0], { color: C.navyVelvet })
  for (const bx of [-0.46, 0, 0.46]) {
    b.add(new THREE.SphereGeometry(0.018, 6, 5), pal.metal, [bx, 0.478, 0], { color: C.gold, scale: [1, 0.45, 1] })
  }
  for (const side of [-1, 1] as const) {
    b.add(
      new THREE.CapsuleGeometry(0.068, d - 0.22, 4, lite ? 7 : 12),
      pal.matte,
      [side * (w / 2 - 0.12), 0.52, 0],
      { color: C.crimsonLacquer, rot: [Math.PI / 2, 0, 0] }
    )
    b.add(new THREE.SphereGeometry(0.022, 6, 5), pal.metal, [side * (w / 2 - 0.12), 0.52, d / 2 - 0.06], { color: C.gold })
  }

  return b.flushToSpecs()
}

/** 8. Rectangular Trough Planter Soft Divider. */
export function buildPlanterDividerSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const w = 1.24
  const d = 0.42
  const h = 0.4

  b.add(roundedBox(w - 0.04, 0.05, d - 0.04, 0.01, lite), pal.matte, [0, 0.025, 0], { color: C.obsidian })
  b.add(roundedBox(w, h - 0.05, d, 0.022, lite), pal.matte, [0, 0.05 + (h - 0.05) / 2, 0], { color: C.marbleCream })
  b.add(roundedBox(w + 0.03, 0.035, d + 0.03, 0.012, lite), pal.metal, [0, h - 0.04, 0], { color: C.gold })
  b.add(roundedBox(w - 0.1, 0.04, d - 0.1, 0.01, lite), pal.matte, [0, h - 0.01, 0], { color: C.soil })

  const leafGeo = createSculptedLeafGeometry(lite)
  const leafCount = lite ? 5 : 8
  for (const cx of [-0.38, 0, 0.38]) {
    const scaleBase = cx === 0 ? 0.78 : 0.68
    for (let i = 0; i < leafCount; i += 1) {
      const yaw = (i * Math.PI * 2) / leafCount + cx * 2.2
      b.add(leafGeo, pal.matte, [cx, h + 0.01, 0], {
        color: i % 2 === 0 ? C.leafDark : C.leafMid,
        rot: [0.85 - (i % 2) * 0.34, yaw, 0],
        scale: [scaleBase, scaleBase, scaleBase],
        disposeRaw: false,
      })
    }
    b.add(new THREE.SphereGeometry(0.036, 7, 6), pal.matte, [cx, h + 0.24, 0], { color: C.blossomApricot })
  }
  leafGeo.dispose()

  return b.flushToSpecs()
}
