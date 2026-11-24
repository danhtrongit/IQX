import * as THREE from "three"

import {
  DECOR_COLORS as C,
  DecorMeshBatcher,
  createAtlasPlaneGeometry,
  createBoatIngotGeometry,
  createLatheLanternBodyGeometry,
  createLathePotGeometry,
  createSculptedLeafGeometry,
  roundedBox,
  type FloorDecorPalette,
  type MergedPartSpec,
} from "./helpers.ts"

const BLOSSOM_BRANCHES: readonly {
  pts: readonly [number, number, number][]
  r: number
  puffs: number
}[] = [
  {
    pts: [
      [0, 0.4, 0],
      [-0.04, 0.78, 0.03],
      [0.05, 1.16, -0.02],
      [0.02, 1.5, 0.01],
    ],
    r: 0.036,
    puffs: 8,
  },
  {
    pts: [
      [-0.02, 0.66, 0.02],
      [-0.18, 0.96, 0.1],
      [-0.31, 1.24, 0.12],
    ],
    r: 0.023,
    puffs: 6,
  },
  {
    pts: [
      [0.02, 0.72, -0.01],
      [0.2, 1.0, -0.09],
      [0.32, 1.3, -0.1],
    ],
    r: 0.022,
    puffs: 6,
  },
]

/**
 * 1a. Shared Blossom Tree pot, soil, curved branches, and lucky lì xì envelopes (instanced ×4).
 */
export function buildBlossomTreeBaseSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const potH = 0.42
  const cyl = lite ? 8 : 12

  b.add(new THREE.CylinderGeometry(0.2, 0.18, 0.028, cyl), pal.metal, [0, 0.014, 0], { color: C.gold, castShadow: false })
  b.add(createLathePotGeometry(0.17, 0.24, potH - 0.02, lite), pal.matte, [0, 0.02, 0], { color: C.crimsonLacquer, castShadow: false })
  b.add(new THREE.TorusGeometry(0.235, 0.014, 5, cyl), pal.metal, [0, potH * 0.84, 0], { color: C.gold, rot: [Math.PI / 2, 0, 0], castShadow: false })
  b.add(
    new THREE.SphereGeometry(0.21, cyl, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    pal.matte,
    [0, potH - 0.03, 0],
    { color: C.soil, scale: [1, 0.25, 1], castShadow: false }
  )

  for (let bi = 0; bi < BLOSSOM_BRANCHES.length; bi += 1) {
    const br = BLOSSOM_BRANCHES[bi]!
    const curve = new THREE.CatmullRomCurve3(
      br.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    )
    b.add(new THREE.TubeGeometry(curve, lite ? 4 : 7, br.r, 5, false), pal.matte, [0, 0, 0], {
      color: C.darkWood,
      castShadow: false,
    })

    if (bi > 0) {
      const tip = br.pts[br.pts.length - 1]!
      const envX = tip[0] * 0.72
      const envY = tip[1] - 0.18
      const envZ = tip[2] * 0.72
      b.add(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 4), pal.metal, [envX, envY + 0.075, envZ], { color: C.gold, castShadow: false })
      b.add(roundedBox(0.065, 0.095, 0.014, 0.005, lite), pal.matte, [envX, envY, envZ], {
        color: C.crimsonLacquer,
        rot: [0, bi * 0.6, 0.06],
        castShadow: false,
      })
      b.add(roundedBox(0.04, 0.022, 0.018, 0.004, lite), pal.metal, [envX, envY + 0.012, envZ], {
        color: C.gold,
        rot: [0, bi * 0.6, 0.06],
        castShadow: false,
      })
    }
  }

  return b.flushToSpecs()
}

/**
 * 1b. Blossom cloud crown (white vertex color tinted per-instance to Hoa Đào pink or Hoa Mai gold).
 */
export function buildBlossomCrownSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const puffSeg = lite ? 5 : 7
  for (let bi = 0; bi < BLOSSOM_BRANCHES.length; bi += 1) {
    const br = BLOSSOM_BRANCHES[bi]!
    const tip = br.pts[br.pts.length - 1]!
    const puffCount = lite ? 4 : Math.max(5, br.puffs - 1)
    for (let p = 0; p < puffCount; p += 1) {
      const a = (p * Math.PI * 2) / puffCount + bi * 0.9
      const ringR = p === 0 ? 0 : 0.1 + (p % 2) * 0.08
      const yOff = p === 0 ? 0.1 : ((p % 3) - 1) * 0.065
      const rad = p === 0 ? 0.145 : 0.09 + (p % 2) * 0.026
      b.add(
        new THREE.SphereGeometry(rad, puffSeg, Math.max(4, puffSeg - 1)),
        pal.matte,
        [tip[0] + Math.cos(a) * ringR, tip[1] + yOff, tip[2] + Math.sin(a) * ringR],
        { color: "#ffffff", castShadow: false }
      )
    }
  }
  return b.flushToSpecs()
}

/**
 * 2. Potted Lucky Bamboo Grove (Chậu Trúc Phú Quý) — collapses into just 2 InstancedMeshes for all 6 groves.
 */
export function buildBambooPlanterSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const cyl = lite ? 7 : 10
  const potH = 0.46

  b.add(createLathePotGeometry(0.15, 0.21, potH, lite), pal.matte, [0, 0, 0], { color: C.celadonCeramic, castShadow: false })
  b.add(new THREE.TorusGeometry(0.205, 0.012, 5, cyl), pal.metal, [0, potH * 0.86, 0], { color: C.gold, rot: [Math.PI / 2, 0, 0], castShadow: false })
  b.add(new THREE.CylinderGeometry(0.18, 0.18, 0.03, cyl), pal.matte, [0, potH - 0.02, 0], { color: C.soil, castShadow: false })

  const stalks: readonly [number, number, number][] = [
    [0, 0, 1.28],
    [-0.07, 0.04, 1.08],
    [0.07, 0.05, 1.16],
    [-0.06, -0.06, 0.96],
    [0.06, -0.05, 1.04],
  ]
  const leafGeo = createSculptedLeafGeometry(lite)
  for (let i = 0; i < stalks.length; i += 1) {
    const [sx, sz, h] = stalks[i]!
    const segs = 3
    const segH = h / segs
    for (let k = 0; k < segs; k += 1) {
      const cy = potH + k * segH + segH / 2
      b.add(new THREE.CylinderGeometry(0.022, 0.025, segH - 0.012, lite ? 5 : 7), pal.matte, [sx, cy, sz], {
        color: C.bambooGreen,
        castShadow: false,
      })
      b.add(new THREE.TorusGeometry(0.026, 0.006, 4, lite ? 5 : 7), pal.matte, [sx, potH + (k + 1) * segH, sz], {
        color: C.leafDark,
        rot: [Math.PI / 2, 0, 0],
        castShadow: false,
      })
    }
    const topY = potH + h
    const tuftN = lite ? 3 : 4
    for (let lf = 0; lf < tuftN; lf += 1) {
      const yaw = (lf * Math.PI * 2) / tuftN + i * 0.9
      b.add(leafGeo, pal.matte, [sx, topY - 0.04, sz], {
        color: lf % 2 === 0 ? C.leafMid : C.bambooGreen,
        rot: [0.82, yaw, 0],
        scale: [0.44, 0.68, 0.44],
        castShadow: false,
        disposeRaw: false,
      })
    }
  }
  leafGeo.dispose()

  b.add(new THREE.TorusGeometry(0.11, 0.016, 5, cyl), pal.matte, [0, potH + 0.32, 0], {
    color: C.crimsonLacquer,
    rot: [Math.PI / 2, 0, 0],
    castShadow: false,
  })
  b.add(new THREE.SphereGeometry(0.026, 6, 5), pal.metal, [0, potH + 0.32, 0.115], { color: C.gold, castShadow: false })

  return b.flushToSpecs()
}

/**
 * 3. Glossy Golden Lucky Cat Statue (Mèo Thần Tài / Maneki-Neko) — 2 InstancedMeshes for all 3 statues.
 */
export function buildLuckyCatSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const seg = lite ? 7 : 10

  b.add(roundedBox(0.56, 0.07, 0.5, 0.018, lite), pal.matte, [0, 0.035, 0], { color: C.obsidian, castShadow: false })
  b.add(roundedBox(0.48, 0.46, 0.42, 0.022, lite), pal.matte, [0, 0.3, 0], { color: C.crimsonLacquer, castShadow: false })
  b.add(roundedBox(0.52, 0.045, 0.46, 0.014, lite), pal.metal, [0, 0.545, 0], { color: C.gold, castShadow: false })
  b.add(roundedBox(0.42, 0.06, 0.38, 0.024, lite), pal.matte, [0, 0.595, 0], { color: C.crimsonLacquer, castShadow: false })
  const topY = 0.625

  b.add(new THREE.SphereGeometry(0.19, seg, seg), pal.metal, [0, topY + 0.17, 0], {
    color: C.goldBright,
    scale: [1.02, 1.05, 0.94],
    castShadow: false,
  })
  b.add(new THREE.TorusGeometry(0.135, 0.024, 5, seg), pal.matte, [0, topY + 0.32, 0.01], {
    color: C.crimsonLacquer,
    rot: [Math.PI / 2, 0, 0],
    castShadow: false,
  })
  b.add(new THREE.SphereGeometry(0.036, 7, 5), pal.metal, [0, topY + 0.31, 0.155], { color: C.goldBright, castShadow: false })

  const hy = topY + 0.48
  b.add(new THREE.SphereGeometry(0.2, seg, seg), pal.metal, [0, hy, 0.01], {
    color: C.goldBright,
    scale: [1.1, 0.96, 0.96],
    castShadow: false,
  })
  for (const side of [-1, 1] as const) {
    b.add(new THREE.ConeGeometry(0.072, 0.14, 6), pal.metal, [side * 0.13, hy + 0.18, 0], {
      color: C.goldBright,
      rot: [0, 0, -side * 0.24],
      castShadow: false,
    })
    b.add(new THREE.ConeGeometry(0.042, 0.095, 5), pal.matte, [side * 0.13, hy + 0.175, 0.034], {
      color: C.crimsonLacquer,
      rot: [0, 0, -side * 0.24],
      castShadow: false,
    })
    b.add(new THREE.SphereGeometry(0.024, 6, 5), pal.matte, [side * 0.075, hy + 0.02, 0.182], {
      color: C.obsidian,
      scale: [1.2, 0.85, 0.6],
      castShadow: false,
    })
    b.add(new THREE.SphereGeometry(0.026, 6, 5), pal.matte, [side * 0.125, hy - 0.025, 0.165], {
      color: C.blossomPink,
      scale: [1.2, 0.7, 0.5],
      castShadow: false,
    })
  }
  b.add(new THREE.SphereGeometry(0.02, 6, 5), pal.matte, [0, hy - 0.015, 0.198], { color: C.crimsonLacquer, castShadow: false })

  b.add(new THREE.CapsuleGeometry(0.046, 0.14, 3, 7), pal.metal, [-0.19, topY + 0.43, 0.08], {
    color: C.goldBright,
    rot: [-0.25, 0, 0.26],
    castShadow: false,
  })
  b.add(new THREE.CapsuleGeometry(0.044, 0.1, 3, 7), pal.metal, [0.14, topY + 0.2, 0.13], {
    color: C.goldBright,
    rot: [0.45, 0, -0.35],
    castShadow: false,
  })
  b.add(new THREE.CylinderGeometry(0.065, 0.065, 0.018, seg), pal.metal, [0.06, topY + 0.17, 0.2], {
    color: C.gold,
    rot: [Math.PI / 2, 0, 0.12],
    scale: [0.75, 1, 1.35],
    castShadow: false,
  })

  return b.flushToSpecs()
}

/** 4. Gold Coin & Sycee Ingot Prosperity Bowl. */
export function buildGoldCoinPileSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const cyl = lite ? 10 : 16

  b.add(new THREE.CylinderGeometry(0.16, 0.13, 0.035, cyl), pal.metal, [0, 0.018, 0], { color: C.gold })
  b.add(createLathePotGeometry(0.13, 0.22, 0.16, lite), pal.matte, [0, 0.03, 0], { color: C.crimsonLacquer })
  b.add(new THREE.TorusGeometry(0.225, 0.014, 6, cyl), pal.metal, [0, 0.175, 0], { color: C.gold, rot: [Math.PI / 2, 0, 0] })
  b.add(
    new THREE.SphereGeometry(0.18, cyl, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    pal.metal,
    [0, 0.14, 0],
    { color: C.gold, scale: [1, 0.55, 1] }
  )

  const ingotGeo = createBoatIngotGeometry(lite)
  const ingots: readonly [number, number, number, number][] = [
    [-0.07, 0.19, 0.05, 0.3],
    [0.075, 0.19, 0.04, -0.35],
    [0, 0.195, -0.065, 0.1],
    [0, 0.25, 0.01, -0.15],
  ]
  for (const [ix, iy, iz, yaw] of ingots) {
    b.add(ingotGeo, pal.metal, [ix, iy, iz], {
      color: C.goldBright,
      rot: [0, yaw, 0],
      scale: [1.15, 1.15, 1.15],
      disposeRaw: false,
    })
    b.add(new THREE.SphereGeometry(0.034, 7, 6), pal.metal, [ix, iy + 0.042, iz], {
      color: C.goldBright,
      scale: [1.25, 0.78, 0.9],
    })
  }
  ingotGeo.dispose()

  const stacks: readonly [number, number, number][] = [
    [-0.22, 0.1, 3],
    [0.23, 0.08, 4],
    [0.12, 0.22, 2],
  ]
  for (const [cx, cz, count] of stacks) {
    for (let k = 0; k < count; k += 1) {
      b.add(new THREE.CylinderGeometry(0.042, 0.042, 0.014, 10), pal.metal, [cx, 0.007 + k * 0.015, cz], {
        color: C.goldBright,
      })
    }
  }

  return b.flushToSpecs()
}

/** 5. Glowing Ribbed Red Silk Lantern — 2 InstancedMeshes for all 10 lanterns! */
export function buildRedLanternSpecs(
  pal: FloorDecorPalette,
  lite: boolean
): MergedPartSpec[] {
  const b = new DecorMeshBatcher()
  const cyl = lite ? 8 : 14

  b.add(new THREE.CylinderGeometry(0.012, 0.026, 0.13, 6), pal.redSilk, [0, -0.56, 0], { castShadow: false })
  b.add(new THREE.SphereGeometry(0.02, 6, 5), pal.metal, [0, -0.48, 0], { color: C.goldBright, castShadow: false })
  b.add(new THREE.CylinderGeometry(0.062, 0.05, 0.032, cyl), pal.metal, [0, -0.45, 0], { color: C.gold, castShadow: false })
  b.add(createLatheLanternBodyGeometry(lite), pal.redSilk, [0, -0.435, 0], { castShadow: false })
  if (!lite) {
    for (let i = 0; i < 3; i += 1) {
      b.add(new THREE.TorusGeometry(0.18, 0.006, 4, 12), pal.metal, [0, -0.26, 0], {
        color: C.gold,
        rot: [0, (i * Math.PI) / 3, 0],
        castShadow: false,
      })
    }
  }
  b.add(new THREE.CylinderGeometry(0.054, 0.068, 0.036, cyl), pal.metal, [0, -0.075, 0], { color: C.gold, castShadow: false })
  b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), pal.metal, [0, -0.02, 0], { color: C.gold, castShadow: false })

  return b.flushToSpecs()
}

/** 6. World Clocks Cabinet (`HÀ NỘI · NEW YORK · TOKYO`) reading bottom-left quadrant of visualAtlas. */
export function addWorldClocksFixture(
  batcher: DecorMeshBatcher,
  pal: FloorDecorPalette,
  visualAtlasMat: THREE.Material,
  wx: number,
  wy: number,
  wz: number,
  lite: boolean
): void {
  const w = 1.54
  const h = 1.66
  const d = 0.11

  batcher.add(roundedBox(w + 0.14, h + 0.14, d, 0.028, lite), pal.metal, [wx, wy, wz + d / 2], { color: C.gold })
  batcher.add(roundedBox(w + 0.04, h + 0.04, d + 0.02, 0.018, lite), pal.matte, [wx, wy, wz + d / 2 + 0.01], {
    color: C.obsidian,
  })

  // Bottom-left quadrant of visualAtlas: u [0.004, 0.496], vTop [0.504, 0.996]
  const faceGeo = createAtlasPlaneGeometry(w, h, 0.004, 0.504, 0.496, 0.996)
  batcher.add(faceGeo, visualAtlasMat, [wx, wy, wz + d + 0.026], { castShadow: false, receiveShadow: false })

  const ringSeg = lite ? 14 : 24
  const dials: readonly [number, number, number][] = [
    [0, h * (0.5 - 154 / 512), (74 / 512) * w],
    [w * (138 / 512 - 0.5), h * (0.5 - 366 / 512), (64 / 512) * w],
    [w * (374 / 512 - 0.5), h * (0.5 - 366 / 512), (64 / 512) * w],
  ]
  for (const [dx, dy, rad] of dials) {
    batcher.add(new THREE.TorusGeometry(rad, 0.018, 6, ringSeg), pal.metal, [wx + dx, wy + dy, wz + d + 0.036], {
      color: C.goldBright,
    })
  }
}

/** 7. Gold-Framed Stock Chart Artwork reading top half (2×2 grid) of visualAtlas. */
export function addFramedStockChart(
  batcher: DecorMeshBatcher,
  pal: FloorDecorPalette,
  visualAtlasMat: THREE.Material,
  opts: {
    wx: number
    wy: number
    wz: number
    rotY: number
    width: number
    height: number
    quadrant: 0 | 1 | 2 | 3
    stanchionFromY?: number
    lite: boolean
  }
): void {
  const { wx, wy, wz, rotY, width, height, quadrant, stanchionFromY, lite } = opts
  const local = new DecorMeshBatcher()

  local.add(roundedBox(width + 0.18, height + 0.18, 0.09, 0.024, lite), pal.metal, [0, 0, 0], { color: C.gold })
  local.add(roundedBox(width + 0.06, height + 0.06, 0.105, 0.014, lite), pal.matte, [0, 0, 0.008], { color: C.obsidian })

  const col = quadrant % 2
  const row = quadrant >= 2 ? 1 : 0
  const u0 = col * 0.5 + 0.005
  const u1 = (col + 1) * 0.5 - 0.005
  const vTop = row * 0.25 + 0.005
  const vBot = (row + 1) * 0.25 - 0.005
  const artGeo = createAtlasPlaneGeometry(width, height, u0, vTop, u1, vBot)
  local.add(artGeo, visualAtlasMat, [0, 0, 0.064], { castShadow: false, receiveShadow: false })

  local.add(roundedBox(width * 0.45, 0.036, 0.07, 0.01, lite), pal.metal, [0, height / 2 + 0.13, 0.06], { color: C.gold })
  local.add(roundedBox(width * 0.36, 0.018, 0.03, 0.006, lite), pal.warmGlow, [0, height / 2 + 0.11, 0.08], {
    castShadow: false,
    receiveShadow: false,
  })

  if (stanchionFromY !== undefined) {
    const postH = Math.max(0.2, wy - height / 2 - stanchionFromY + 0.05)
    const postY = -height / 2 - postH / 2 + 0.02
    for (const side of [-1, 1] as const) {
      local.add(new THREE.CylinderGeometry(0.024, 0.028, postH, 8), pal.metal, [side * (width * 0.32), postY, -0.02], {
        color: C.gold,
      })
    }
  }

  const specs = local.flushToSpecs()
  batcher.addPlaced(specs, wx, wy, wz, rotY)
  for (const s of specs) s.geometry.dispose()
}

/** 8. Wall bracket / side-wall stanchion for hanging Red Silk Lanterns. */
export function addLanternBracket(
  batcher: DecorMeshBatcher,
  pal: FloorDecorPalette,
  wx: number,
  wy: number,
  wz: number,
  rotY: number,
  stanchionFromY: number | undefined,
  lite: boolean
): void {
  const local = new DecorMeshBatcher()
  local.add(roundedBox(0.08, 0.22, 0.05, 0.014, lite), pal.metal, [0, 0, 0.02], { color: C.gold })
  local.add(roundedBox(0.034, 0.034, 0.42, 0.01, lite), pal.metal, [0, 0.05, 0.22], { color: C.gold })
  local.add(new THREE.SphereGeometry(0.032, 6, 6), pal.metal, [0, 0.05, 0.43], { color: C.goldBright })

  if (stanchionFromY !== undefined) {
    const postH = Math.max(0.2, wy - stanchionFromY + 0.08)
    local.add(new THREE.CylinderGeometry(0.024, 0.03, postH, 8), pal.metal, [0, -postH / 2 + 0.04, 0], { color: C.gold })
    local.add(new THREE.CylinderGeometry(0.052, 0.058, 0.04, 8), pal.matte, [0, -postH + 0.04, 0], { color: C.obsidian })
  }

  const specs = local.flushToSpecs()
  batcher.addPlaced(specs, wx, wy, wz, rotY)
  for (const s of specs) s.geometry.dispose()
}
