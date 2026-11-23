import * as THREE from "three"

import { createSignTexture } from "./textures.ts"
import {
  createClothMaterial,
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  disposeObject3D,
} from "./types.ts"

export interface DisposableProp {
  group: THREE.Group
  dispose: () => void
}

export interface LiveBoardProp extends DisposableProp {
  texture: THREE.CanvasTexture | THREE.Texture
  update: () => void
}

export interface OfficeDeskOptions {
  variant: "boss" | "staff" | "reading"
  width: number
  depth: number
  dualMonitor?: boolean
  hasMug?: boolean
  withChair?: boolean
  nameplate?: string
  highlightGold?: boolean
}

export interface RugOptions {
  shape?: "oval" | "rounded"
  colorHex?: string
  borderHex?: string
  borderWidth?: number
}

function addPart(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  pos: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number],
  cast = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(pos[0], pos[1], pos[2])
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2])
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2])
  mesh.castShadow = cast
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function wrapProp(group: THREE.Group): DisposableProp {
  return {
    group,
    dispose: () => disposeObject3D(group),
  }
}

function createSwivelChair(colorHex = "#283654"): THREE.Group {
  const chair = new THREE.Group()
  const fabricMat = createClothMaterial(colorHex)
  const darkMat = createMatteMaterial("#182032", {
    roughness: 0.55,
    metalness: 0.25,
  })
  const chromeMat = createMetalMaterial("#94a3b8", {
    roughness: 0.28,
    metalness: 0.8,
  })

  // 5-star caster hub + stem
  addPart(chair, new THREE.CylinderGeometry(0.04, 0.04, 0.26, 10), chromeMat, [
    0, 0.16, 0,
  ])
  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5
    addPart(
      chair,
      new THREE.BoxGeometry(0.24, 0.035, 0.045),
      darkMat,
      [Math.cos(a) * 0.11, 0.04, Math.sin(a) * 0.11],
      [0, -a, 0]
    )
  }

  // Plump rounded seat cushion
  addPart(
    chair,
    new THREE.CylinderGeometry(0.24, 0.22, 0.09, 18),
    fabricMat,
    [0, 0.34, 0],
    undefined,
    [1.06, 1, 1.0]
  )
  // Ergonomic curved backrest
  addPart(
    chair,
    new THREE.BoxGeometry(0.42, 0.42, 0.09),
    fabricMat,
    [0, 0.58, -0.2],
    [-0.1, 0, 0]
  )
  // Rounded top crest on backrest
  addPart(
    chair,
    new THREE.CapsuleGeometry(0.048, 0.34, 6, 12),
    fabricMat,
    [0, 0.79, -0.22],
    [0, 0, Math.PI / 2]
  )
  // Armrests
  for (const side of [-1, 1] as const) {
    addPart(
      chair,
      new THREE.BoxGeometry(0.055, 0.045, 0.3),
      darkMat,
      [side * 0.24, 0.49, -0.02]
    )
    addPart(
      chair,
      new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8),
      darkMat,
      [side * 0.24, 0.41, -0.02]
    )
  }
  return chair
}

// ---------- 1. Potted Plant ----------

export function createPottedPlant(size: "tall" | "small"): DisposableProp {
  const group = new THREE.Group()
  group.name = `prop-plant-${size}`
  const isTall = size === "tall"

  const potMat = createMatteMaterial(isTall ? "#2c2f38" : "#b86b4b", {
    roughness: 0.62,
  })
  const soilMat = createMatteMaterial("#3a281d", { roughness: 0.92 })
  const trunkMat = createMatteMaterial("#6b4423", { roughness: 0.85 })
  const leafDark = createMatteMaterial("#2f7a32", { roughness: 0.65 })
  const leafMid = createMatteMaterial("#4aa449", { roughness: 0.6 })
  const leafLight = createMatteMaterial("#6ec25c", { roughness: 0.58 })

  const potH = isTall ? 0.44 : 0.3
  const potTopR = isTall ? 0.26 : 0.21
  const potBotR = isTall ? 0.19 : 0.15

  addPart(
    group,
    new THREE.CylinderGeometry(potTopR, potBotR, potH, 16),
    potMat,
    [0, potH / 2, 0]
  )
  addPart(
    group,
    new THREE.TorusGeometry(potTopR, 0.025, 8, 20),
    potMat,
    [0, potH - 0.015, 0],
    [Math.PI / 2, 0, 0]
  )
  addPart(
    group,
    new THREE.CylinderGeometry(potTopR * 0.92, potTopR * 0.92, 0.02, 14),
    soilMat,
    [0, potH - 0.01, 0],
    undefined,
    undefined,
    false
  )

  if (isTall) {
    addPart(
      group,
      new THREE.CylinderGeometry(0.045, 0.065, 0.72, 10),
      trunkMat,
      [0, potH + 0.34, 0]
    )
    const canopy: [number, number, number, number, THREE.Material][] = [
      [0, 1.38, 0, 0.36, leafMid],
      [-0.22, 1.18, 0.14, 0.26, leafDark],
      [0.24, 1.2, 0.1, 0.25, leafDark],
      [0.05, 1.22, -0.22, 0.27, leafDark],
      [-0.14, 1.54, 0.08, 0.22, leafLight],
      [0.16, 1.5, -0.06, 0.21, leafLight],
    ]
    for (const [x, y, z, r, mat] of canopy) {
      addPart(group, new THREE.SphereGeometry(r, 16, 14), mat, [x, y, z])
    }
  } else {
    const tufts: [number, number, number, number, THREE.Material][] = [
      [0, 0.55, 0, 0.25, leafMid],
      [-0.16, 0.45, 0.11, 0.18, leafDark],
      [0.16, 0.46, 0.08, 0.17, leafDark],
      [0.02, 0.47, -0.15, 0.18, leafDark],
      [0.06, 0.67, 0.04, 0.15, leafLight],
    ]
    for (const [x, y, z, r, mat] of tufts) {
      addPart(group, new THREE.SphereGeometry(r, 14, 12), mat, [x, y, z])
    }
  }

  return wrapProp(group)
}

// ---------- 2. Plush Sofa ----------

export function createSofa(
  width: number,
  depth: number,
  colorHex = "#24365e"
): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-sofa"
  const fabricMat = createClothMaterial(colorHex)
  const darkBaseMat = createMatteMaterial("#17233f", { roughness: 0.72 })
  const woodLegMat = createMatteMaterial("#5a3a20", { roughness: 0.65 })
  const pillowGoldMat = createClothMaterial("#e9b949")
  const pillowCreamMat = createClothMaterial("#f3ead8")

  const seatH = 0.42
  const armW = Math.min(0.24, width * 0.12)
  const backD = Math.min(0.24, depth * 0.28)
  const innerW = Math.max(0.4, width - armW * 2)

  // Tapered wooden legs
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      addPart(
        group,
        new THREE.CylinderGeometry(0.04, 0.028, 0.14, 10),
        woodLegMat,
        [sx * (width / 2 - 0.14), 0.07, sz * (depth / 2 - 0.12)]
      )
    }
  }

  // Lower deck frame
  addPart(
    group,
    new THREE.BoxGeometry(width, 0.16, depth),
    darkBaseMat,
    [0, 0.2, 0]
  )

  // Plump seat cushions (2 or 3 depending on width)
  const count = width > 2.4 ? 3 : 2
  const cushW = innerW / count - 0.03
  for (let i = 0; i < count; i += 1) {
    const cx = -innerW / 2 + (i + 0.5) * (innerW / count)
    addPart(
      group,
      new THREE.BoxGeometry(cushW, 0.18, depth - backD * 0.85),
      fabricMat,
      [cx, seatH - 0.04, backD * 0.35]
    )
  }

  // Rounded backrest
  addPart(
    group,
    new THREE.BoxGeometry(width - 0.04, 0.56, backD),
    fabricMat,
    [0, 0.56, -depth / 2 + backD / 2]
  )
  addPart(
    group,
    new THREE.CapsuleGeometry(backD * 0.52, Math.max(0.2, width - backD), 8, 14),
    fabricMat,
    [0, 0.84, -depth / 2 + backD / 2],
    [0, 0, Math.PI / 2]
  )

  // Rolled armrests
  for (const side of [-1, 1] as const) {
    const ax = side * (width / 2 - armW / 2)
    addPart(
      group,
      new THREE.BoxGeometry(armW, 0.42, depth - 0.04),
      fabricMat,
      [ax, 0.44, 0.02]
    )
    addPart(
      group,
      new THREE.CapsuleGeometry(armW * 0.52, Math.max(0.15, depth - armW), 8, 12),
      fabricMat,
      [ax, 0.64, 0.02],
      [Math.PI / 2, 0, 0]
    )
  }

  // Cute accent throw pillows
  addPart(
    group,
    new THREE.BoxGeometry(0.28, 0.26, 0.11),
    pillowGoldMat,
    [-innerW * 0.35, 0.58, -depth / 2 + backD + 0.08],
    [-0.18, 0.28, 0.14]
  )
  addPart(
    group,
    new THREE.BoxGeometry(0.26, 0.24, 0.1),
    pillowCreamMat,
    [innerW * 0.35, 0.57, -depth / 2 + backD + 0.08],
    [-0.16, -0.32, -0.12]
  )

  return wrapProp(group)
}

// ---------- 3. Coffee Table ----------

export function createCoffeeTable(width: number, depth: number): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-coffee-table"
  const woodMat = createMatteMaterial("#7a5230", { roughness: 0.58 })
  const topMat = createMatteMaterial("#f3ece0", {
    roughness: 0.25,
    metalness: 0.08,
  })
  const cupMat = createMatteMaterial("#ffffff", { roughness: 0.28 })
  const coffeeMat = createMatteMaterial("#4a2511", { roughness: 0.3 })
  const magMat = createMatteMaterial("#1d4ed8", { roughness: 0.55 })

  const tableH = 0.46
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      addPart(
        group,
        new THREE.CylinderGeometry(0.036, 0.026, tableH - 0.06, 10),
        woodMat,
        [sx * (width / 2 - 0.14), (tableH - 0.06) / 2, sz * (depth / 2 - 0.12)]
      )
    }
  }
  addPart(
    group,
    new THREE.BoxGeometry(width * 0.94, 0.06, depth * 0.92),
    woodMat,
    [0, tableH - 0.05, 0]
  )
  addPart(
    group,
    new THREE.BoxGeometry(width, 0.05, depth),
    topMat,
    [0, tableH, 0]
  )

  // Cute miniature cups on saucers
  for (const [cx, cz] of [
    [-width * 0.22, depth * 0.08],
    [width * 0.18, -depth * 0.1],
  ] as const) {
    addPart(
      group,
      new THREE.CylinderGeometry(0.085, 0.07, 0.015, 14),
      cupMat,
      [cx, tableH + 0.032, cz]
    )
    addPart(
      group,
      new THREE.CylinderGeometry(0.055, 0.045, 0.075, 14),
      cupMat,
      [cx, tableH + 0.072, cz]
    )
    addPart(
      group,
      new THREE.CylinderGeometry(0.046, 0.046, 0.01, 12),
      coffeeMat,
      [cx, tableH + 0.106, cz],
      undefined,
      undefined,
      false
    )
  }

  // Neat finance magazine stack
  addPart(
    group,
    new THREE.BoxGeometry(0.28, 0.024, 0.2),
    magMat,
    [0, tableH + 0.036, 0.04],
    [0, 0.14, 0]
  )

  return wrapProp(group)
}

// ---------- 4. Pantry / Coffee Bar Counter ----------

export function createPantryCounter(
  width: number,
  depth: number
): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-pantry-counter"
  const cabinetMat = createMatteMaterial("#6b4a2b", { roughness: 0.62 })
  const doorMat = createMatteMaterial("#55381e", { roughness: 0.65 })
  const topMat = createMatteMaterial("#f4efe6", { roughness: 0.3 })
  const steelMat = createMetalMaterial("#cbd5e1", {
    roughness: 0.25,
    metalness: 0.82,
  })
  const darkSteelMat = createMetalMaterial("#334155", {
    roughness: 0.35,
    metalness: 0.72,
  })
  const ledMat = createGlowMaterial("#34c38f", 1.1)
  const mugMat = createMatteMaterial("#ffffff", { roughness: 0.28 })
  const goldMat = createMetalMaterial("#e9b949", {
    roughness: 0.28,
    metalness: 0.78,
  })

  const h = 0.92
  addPart(group, new THREE.BoxGeometry(width, h, depth), cabinetMat, [
    0,
    h / 2,
    0,
  ])
  addPart(
    group,
    new THREE.BoxGeometry(width + 0.08, 0.07, depth + 0.08),
    topMat,
    [0, h + 0.035, 0]
  )

  // Cabinet door panels & gold knobs
  const doors = Math.max(2, Math.round(width / 0.75))
  const doorW = (width - 0.16) / doors - 0.04
  for (let i = 0; i < doors; i += 1) {
    const dx = -width / 2 + 0.08 + (i + 0.5) * ((width - 0.16) / doors)
    addPart(
      group,
      new THREE.BoxGeometry(doorW, h - 0.18, 0.03),
      doorMat,
      [dx, h / 2, depth / 2 + 0.005]
    )
    addPart(
      group,
      new THREE.SphereGeometry(0.024, 10, 8),
      goldMat,
      [dx + doorW * 0.32, h * 0.66, depth / 2 + 0.032]
    )
  }

  // Metallic Espresso Machine
  const ex = -width * 0.26
  const ez = -depth * 0.05
  addPart(group, new THREE.BoxGeometry(0.46, 0.42, 0.34), steelMat, [
    ex,
    h + 0.28,
    ez,
  ])
  addPart(group, new THREE.BoxGeometry(0.42, 0.12, 0.2), darkSteelMat, [
    ex,
    h + 0.13,
    ez + 0.12,
  ])
  addPart(group, new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12), darkSteelMat, [
    ex,
    h + 0.34,
    ez + 0.18,
  ])
  addPart(group, new THREE.SphereGeometry(0.018, 8, 8), ledMat, [
    ex + 0.16,
    h + 0.42,
    ez + 0.175,
  ])

  // Stacked white ceramic mugs + electric kettle
  for (let i = 0; i < 3; i += 1) {
    addPart(group, new THREE.CylinderGeometry(0.055, 0.048, 0.085, 12), mugMat, [
      width * 0.08 + i * 0.13,
      h + 0.11,
      0.04,
    ])
  }
  addPart(
    group,
    new THREE.CylinderGeometry(0.085, 0.115, 0.24, 14),
    darkSteelMat,
    [width * 0.34, h + 0.19, -0.02]
  )

  return wrapProp(group)
}

// ---------- 5. Reception Desk ----------

export function createReceptionDesk(
  width: number,
  depth: number
): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-reception-desk"
  const navyMat = createMatteMaterial("#152445", { roughness: 0.48 })
  const woodMat = createMatteMaterial("#8a5d36", { roughness: 0.52 })
  const goldMat = createMetalMaterial("#e9b949", {
    roughness: 0.25,
    metalness: 0.82,
  })
  const screenMat = createGlowMaterial("#38bdf8", 0.55)
  const darkMat = createMatteMaterial("#0f172a", { roughness: 0.4 })

  const deskH = 0.88
  const riserH = 1.12

  // Main counter body
  addPart(group, new THREE.BoxGeometry(width, deskH, depth), navyMat, [
    0,
    deskH / 2,
    0,
  ])
  // Transaction top ledge along front
  addPart(
    group,
    new THREE.BoxGeometry(width + 0.08, 0.08, depth * 0.52),
    woodMat,
    [0, riserH, depth * 0.22]
  )
  // Front upper modesty wall
  addPart(
    group,
    new THREE.BoxGeometry(width, riserH - deskH, depth * 0.35),
    navyMat,
    [0, deskH + (riserH - deskH) / 2, depth * 0.32]
  )
  // Gold accent horizontal rails on front
  addPart(group, new THREE.BoxGeometry(width + 0.03, 0.045, 0.03), goldMat, [
    0,
    0.2,
    depth / 2 + 0.01,
  ])
  addPart(group, new THREE.BoxGeometry(width + 0.03, 0.045, 0.03), goldMat, [
    0,
    riserH - 0.06,
    depth / 2 + 0.01,
  ])

  // Glowing crisp "IQX" front emblem plaque
  const emblemTex = createSignTexture("IQX", {
    style: "emblem",
    width: 320,
    height: 140,
  })
  const emblemMat = new THREE.MeshStandardMaterial({
    map: emblemTex,
    emissive: new THREE.Color("#d9a03a"),
    emissiveMap: emblemTex,
    emissiveIntensity: 0.35,
    roughness: 0.32,
  })
  addPart(
    group,
    new THREE.PlaneGeometry(Math.min(1.1, width * 0.36), 0.48),
    emblemMat,
    [0, 0.62, depth / 2 + 0.025],
    undefined,
    undefined,
    false
  )

  // Receptionist monitor on inner surface
  addPart(group, new THREE.BoxGeometry(0.46, 0.3, 0.035), darkMat, [
    width * 0.22,
    deskH + 0.24,
    -depth * 0.14,
  ])
  addPart(
    group,
    new THREE.PlaneGeometry(0.41, 0.25),
    screenMat,
    [width * 0.22, deskH + 0.24, -depth * 0.12],
    undefined,
    undefined,
    false
  )

  return wrapProp(group)
}

// ---------- 6. Thần Tài Shrine Archway + Offering Altar ----------

export function createOfferingAltar(
  width = 3.2,
  depth = 1.1
): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-offering-altar"
  const crimsonMat = createMatteMaterial("#8f161f", { roughness: 0.42 })
  const darkWoodMat = createMatteMaterial("#4a1114", { roughness: 0.5 })
  const goldMat = createMetalMaterial("#f3c64a", {
    roughness: 0.22,
    metalness: 0.84,
    emissive: "#a16207",
    emissiveIntensity: 0.16,
  })
  const emberMat = createGlowMaterial("#ff6b35", 1.5)
  const lotusMat = createGlowMaterial("#fde047", 1.15)
  const orangeMat = createMatteMaterial("#f97316", { roughness: 0.42 })
  const peachMat = createMatteMaterial("#fb7185", { roughness: 0.45 })

  const h = 0.86
  // Carved crimson lacquer altar body & overhanging top
  addPart(group, new THREE.BoxGeometry(width * 0.92, h - 0.08, depth * 0.86), crimsonMat, [
    0,
    (h - 0.08) / 2,
    0,
  ])
  addPart(group, new THREE.BoxGeometry(width, 0.1, depth), darkWoodMat, [
    0,
    h,
    0,
  ])
  // Gold front carved trim frame
  addPart(
    group,
    new THREE.BoxGeometry(width * 0.82, 0.06, 0.04),
    goldMat,
    [0, h - 0.12, depth * 0.44]
  )
  addPart(
    group,
    new THREE.BoxGeometry(width * 0.82, 0.05, 0.04),
    goldMat,
    [0, 0.18, depth * 0.44]
  )

  // Central Golden Incense Urn (Lư hương) + 3 lit incense sticks
  addPart(
    group,
    new THREE.CylinderGeometry(0.18, 0.13, 0.24, 18),
    goldMat,
    [0, h + 0.17, 0.04]
  )
  addPart(
    group,
    new THREE.TorusGeometry(0.18, 0.025, 10, 20),
    goldMat,
    [0, h + 0.28, 0.04],
    [Math.PI / 2, 0, 0]
  )
  for (const sx of [-0.055, 0, 0.055]) {
    addPart(
      group,
      new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8),
      darkWoodMat,
      [sx, h + 0.42, 0.04]
    )
    addPart(group, new THREE.SphereGeometry(0.022, 8, 8), emberMat, [
      sx,
      h + 0.6,
      0.04,
    ])
  }

  // Twin Glowing Golden Lotus Lamps
  for (const side of [-1, 1] as const) {
    const lx = side * (width * 0.37)
    addPart(
      group,
      new THREE.CylinderGeometry(0.06, 0.1, 0.2, 14),
      goldMat,
      [lx, h + 0.15, -0.04]
    )
    addPart(
      group,
      new THREE.SphereGeometry(0.11, 14, 12),
      lotusMat,
      [lx, h + 0.3, -0.04],
      undefined,
      [1, 1.2, 1]
    )
  }

  // Fruit tray (left) with miniature oranges & peaches
  const fx = -width * 0.21
  addPart(
    group,
    new THREE.CylinderGeometry(0.22, 0.12, 0.08, 16),
    goldMat,
    [fx, h + 0.09, 0.05]
  )
  addPart(group, new THREE.SphereGeometry(0.065, 12, 10), orangeMat, [
    fx - 0.07,
    h + 0.17,
    0.08,
  ])
  addPart(group, new THREE.SphereGeometry(0.065, 12, 10), peachMat, [
    fx + 0.07,
    h + 0.17,
    0.08,
  ])
  addPart(group, new THREE.SphereGeometry(0.068, 12, 10), orangeMat, [
    fx,
    h + 0.22,
    0.01,
  ])

  // Stacked Gold Ingots tray (right)
  const ix = width * 0.21
  addPart(
    group,
    new THREE.CylinderGeometry(0.2, 0.12, 0.07, 16),
    goldMat,
    [ix, h + 0.085, 0.05]
  )
  for (const [dx, dy, dz] of [
    [-0.07, 0.15, 0.06],
    [0.07, 0.15, 0.06],
    [0, 0.22, 0.04],
  ] as const) {
    addPart(
      group,
      new THREE.CylinderGeometry(0.065, 0.045, 0.055, 12),
      goldMat,
      [ix + dx, h + dy, dz],
      undefined,
      [1.3, 1, 0.8]
    )
  }

  return wrapProp(group)
}

export function createThanTaiShrine(opts?: {
  includeAltar?: boolean
}): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-thantai-shrine"
  const crimsonMat = createMatteMaterial("#9b1620", { roughness: 0.42 })
  const roofMat = createMatteMaterial("#7c1018", { roughness: 0.46 })
  const goldMat = createMetalMaterial("#f3c64a", {
    roughness: 0.22,
    metalness: 0.84,
    emissive: "#a16207",
    emissiveIntensity: 0.18,
  })
  const backPanelMat = createMatteMaterial("#540c12", { roughness: 0.55 })

  // Raised ceremonial crimson dais under shrine (trimmed cleanly behind offering altar)
  addPart(group, new THREE.BoxGeometry(4.2, 0.16, 1.56), crimsonMat, [
    0, 0.08, -0.26,
  ])
  addPart(group, new THREE.BoxGeometry(4.32, 0.05, 1.66), goldMat, [
    0, 0.16, -0.26,
  ])

  // Back lacquered wall screen
  addPart(group, new THREE.BoxGeometry(3.6, 3.2, 0.18), backPanelMat, [
    0, 1.76, -0.82,
  ])

  // Twin crimson lacquer pillars with golden collars
  for (const side of [-1, 1] as const) {
    const px = side * 1.85
    addPart(group, new THREE.CylinderGeometry(0.14, 0.16, 3.4, 16), crimsonMat, [
      px, 1.84, -0.68,
    ])
    addPart(group, new THREE.CylinderGeometry(0.2, 0.22, 0.18, 16), goldMat, [
      px, 0.25, -0.68,
    ])
    addPart(group, new THREE.CylinderGeometry(0.21, 0.17, 0.2, 16), goldMat, [
      px, 3.42, -0.68,
    ])
  }

  // Ornate upturned pagoda eave canopy
  addPart(group, new THREE.BoxGeometry(4.4, 0.22, 1.15), roofMat, [
    0, 3.62, -0.58,
  ])
  addPart(group, new THREE.BoxGeometry(4.64, 0.12, 1.28), goldMat, [
    0, 3.74, -0.58,
  ])
  // Upturned golden roof tips
  for (const side of [-1, 1] as const) {
    addPart(
      group,
      new THREE.ConeGeometry(0.16, 0.42, 8),
      goldMat,
      [side * 2.34, 3.9, -0.58],
      [0, 0, -side * 0.55]
    )
  }

  // Crisp gold-bordered wall banner "Thần Tài · Khấn trước 11:30"
  const bannerTex = createSignTexture("Thần Tài · Khấn trước 11:30", {
    style: "gold_banner",
    width: 640,
    height: 140,
  })
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    emissive: new THREE.Color("#f3c64a"),
    emissiveMap: bannerTex,
    emissiveIntensity: 0.28,
    roughness: 0.34,
  })
  addPart(
    group,
    new THREE.PlaneGeometry(3.2, 0.7),
    bannerMat,
    [0, 3.16, -0.42],
    undefined,
    undefined,
    false
  )

  if (opts?.includeAltar) {
    const altar = createOfferingAltar(3.2, 1.1)
    altar.group.position.set(0, 0, 1.25)
    group.add(altar.group)
  }

  return wrapProp(group)
}

// ---------- 7. Hall of Fame Statue Podium ----------

export function createStatuePodium(
  rank: 1 | 2 | 3,
  width = 1.75,
  depth = 1.05
): DisposableProp {
  const group = new THREE.Group()
  group.name = `prop-podium-${rank}`
  const marbleMat = createMatteMaterial("#f3ede2", {
    roughness: 0.32,
    metalness: 0.06,
  })
  const trimHex = rank === 1 ? "#f3c64a" : rank === 2 ? "#cfd5de" : "#c98a52"
  const metalMat = createMetalMaterial(trimHex, {
    roughness: 0.24,
    metalness: 0.82,
  })
  const velvetMat = createClothMaterial(
    rank === 1 ? "#8b1d27" : rank === 2 ? "#1e3a5f" : "#4a2c18"
  )

  const h = rank === 1 ? 0.72 : rank === 2 ? 0.56 : 0.48

  // Lower step plinth
  addPart(group, new THREE.BoxGeometry(width, 0.14, depth), marbleMat, [
    0, 0.07, 0,
  ])
  addPart(group, new THREE.BoxGeometry(width + 0.04, 0.04, depth + 0.04), metalMat, [
    0, 0.15, 0,
  ])
  // Main marble body
  addPart(
    group,
    new THREE.BoxGeometry(width * 0.86, h - 0.18, depth * 0.84),
    marbleMat,
    [0, 0.16 + (h - 0.18) / 2, 0]
  )
  // Top metallic collar + velvet pad
  addPart(
    group,
    new THREE.BoxGeometry(width * 0.92, 0.05, depth * 0.9),
    metalMat,
    [0, h, 0]
  )
  addPart(
    group,
    new THREE.BoxGeometry(width * 0.84, 0.03, depth * 0.82),
    velvetMat,
    [0, h + 0.035, 0]
  )

  // Front rank medal badge
  const medalTex = createSignTexture(String(rank), {
    style: "medal",
    accentColor: trimHex,
  })
  const medalMat = new THREE.MeshStandardMaterial({
    map: medalTex,
    transparent: true,
    roughness: 0.28,
    metalness: 0.25,
  })
  addPart(
    group,
    new THREE.PlaneGeometry(0.32, 0.32),
    medalMat,
    [0, h * 0.56, depth * 0.43],
    undefined,
    undefined,
    false
  )

  return wrapProp(group)
}

// ---------- 8. Crisp Emissive Wall Board Frame (LED / SACO / Meeting) ----------

export function createWallBoardFrame(
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
  borderColor = "#e9b949"
): LiveBoardProp {
  const group = new THREE.Group()
  group.name = "prop-wall-board"
  const cabinetMat = createMatteMaterial("#131d33", {
    roughness: 0.42,
    metalness: 0.35,
  })
  const trimMat = createMetalMaterial(borderColor, {
    roughness: 0.28,
    metalness: 0.78,
  })

  const frameDepth = 0.16
  const border = 0.09
  addPart(
    group,
    new THREE.BoxGeometry(width + border * 2, height + border * 2, frameDepth),
    cabinetMat,
    [0, 0, -frameDepth / 2]
  )
  // Metallic outer trim rails
  addPart(
    group,
    new THREE.BoxGeometry(width + border * 2.2, 0.06, frameDepth + 0.03),
    trimMat,
    [0, height / 2 + border, -frameDepth / 2 + 0.01]
  )
  addPart(
    group,
    new THREE.BoxGeometry(width + border * 2.2, 0.06, frameDepth + 0.03),
    trimMat,
    [0, -height / 2 - border, -frameDepth / 2 + 0.01]
  )
  for (const side of [-1, 1] as const) {
    addPart(
      group,
      new THREE.BoxGeometry(0.06, height + border * 2.2, frameDepth + 0.03),
      trimMat,
      [side * (width / 2 + border), 0, -frameDepth / 2 + 0.01]
    )
  }

  let texture: THREE.Texture
  try {
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
    texture = tex
  } catch {
    texture = new THREE.DataTexture(new Uint8Array([15, 24, 48, 255]), 1, 1)
    texture.needsUpdate = true
  }

  const screenMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: texture,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.05,
  })
  addPart(
    group,
    new THREE.PlaneGeometry(width, height),
    screenMat,
    [0, 0, 0.015],
    undefined,
    undefined,
    false
  )

  return {
    group,
    texture,
    update: () => {
      texture.needsUpdate = true
    },
    dispose: () => {
      disposeObject3D(group)
    },
  }
}

// ---------- 9. Office Desk (Boss / Staff / Reading) ----------

export function createOfficeDesk(opts: OfficeDeskOptions): DisposableProp {
  const { width, depth, variant } = opts
  const group = new THREE.Group()
  group.name = `prop-desk-${variant}`

  const woodTopHex = variant === "boss" ? "#8b5c34" : "#b88a58"
  const woodEdgeHex = variant === "boss" ? "#5a3a20" : "#876139"
  const topMat = createMatteMaterial(woodTopHex, { roughness: 0.48 })
  const edgeMat = createMatteMaterial(woodEdgeHex, { roughness: 0.58 })
  const legMat = createMetalMaterial("#273248", {
    roughness: 0.36,
    metalness: 0.65,
  })
  const bezelMat = createMatteMaterial("#182135", { roughness: 0.38 })
  const screenMat = createGlowMaterial(
    variant === "boss" ? "#38bdf8" : "#60a5fa",
    0.52
  )
  const keyMat = createMatteMaterial("#e5e9f0", { roughness: 0.55 })
  const mugMat = createMatteMaterial("#ffffff", { roughness: 0.25 })
  const mugRimMat = createMatteMaterial("#c0392b", { roughness: 0.35 })

  const deskH = 0.76
  // Sturdy legs + modesty panel
  for (const side of [-1, 1] as const) {
    addPart(
      group,
      new THREE.BoxGeometry(0.08, deskH - 0.06, depth * 0.86),
      variant === "boss" ? edgeMat : legMat,
      [side * (width / 2 - 0.1), (deskH - 0.06) / 2, 0]
    )
  }
  addPart(
    group,
    new THREE.BoxGeometry(width - 0.22, deskH * 0.62, 0.05),
    edgeMat,
    [0, deskH * 0.45, depth * 0.32]
  )
  // Beveled desktop
  addPart(group, new THREE.BoxGeometry(width, 0.075, depth), topMat, [
    0,
    deskH,
    0,
  ])

  // Monitor(s)
  const showMonitors = variant !== "reading"
  const dual = opts.dualMonitor ?? variant === "boss"
  if (showMonitors) {
    const xs = dual ? [-0.34, 0.34] : [0]
    for (const mx of xs) {
      const yaw = dual ? (mx < 0 ? 0.14 : -0.14) : 0
      const monGroup = new THREE.Group()
      monGroup.position.set(mx, deskH + 0.04, -depth * 0.16)
      monGroup.rotation.y = yaw
      addPart(monGroup, new THREE.BoxGeometry(0.18, 0.025, 0.14), bezelMat, [
        0, 0.012, 0,
      ])
      addPart(monGroup, new THREE.BoxGeometry(0.045, 0.18, 0.035), bezelMat, [
        0, 0.1, -0.02,
      ])
      addPart(monGroup, new THREE.BoxGeometry(0.56, 0.34, 0.032), bezelMat, [
        0, 0.28, 0,
      ])
      addPart(
        monGroup,
        new THREE.PlaneGeometry(0.51, 0.29),
        screenMat,
        [0, 0.28, 0.02],
        undefined,
        undefined,
        false
      )
      group.add(monGroup)
    }
  }

  // Keyboard & mouse
  addPart(group, new THREE.BoxGeometry(0.42, 0.022, 0.14), keyMat, [
    0,
    deskH + 0.05,
    depth * 0.14,
  ])
  addPart(group, new THREE.SphereGeometry(0.038, 10, 8), keyMat, [
    0.3,
    deskH + 0.05,
    depth * 0.14,
  ])

  // Cute coffee mug
  if (opts.hasMug ?? variant === "boss") {
    const mx = width * 0.34
    const mz = depth * 0.14
    addPart(group, new THREE.CylinderGeometry(0.048, 0.042, 0.095, 12), mugMat, [
      mx,
      deskH + 0.085,
      mz,
    ])
    addPart(
      group,
      new THREE.TorusGeometry(0.047, 0.008, 8, 14),
      mugRimMat,
      [mx, deskH + 0.13, mz],
      [Math.PI / 2, 0, 0]
    )
  }

  // Desk nameplate facing front (+Z)
  if (opts.nameplate) {
    const plateTex = createSignTexture(opts.nameplate, {
      style: opts.highlightGold ? "gold_plate" : "navy_gold",
      width: 440,
      height: 112,
    })
    const plateMat = new THREE.MeshStandardMaterial({
      map: plateTex,
      roughness: 0.34,
      metalness: 0.15,
    })
    const plateW = Math.min(width * 0.62, 1.05)
    addPart(
      group,
      new THREE.BoxGeometry(plateW, 0.22, 0.045),
      createMatteMaterial("#182238", { roughness: 0.45 }),
      [0, deskH + 0.11, depth * 0.42],
      [-0.22, 0, 0]
    )
    addPart(
      group,
      new THREE.PlaneGeometry(plateW - 0.04, 0.19),
      plateMat,
      [0, deskH + 0.115, depth * 0.448],
      [-0.22, 0, 0],
      undefined,
      false
    )
  }

  // Ergonomic swivel chair tucked behind desk
  if (opts.withChair ?? variant !== "reading") {
    const chair = createSwivelChair(variant === "boss" ? "#1e2e52" : "#2f3e60")
    chair.position.set(0, 0, -depth * 0.56)
    group.add(chair)
  }

  return wrapProp(group)
}

// ---------- 10. Bookshelf with Procedural Colorful Books ----------

export function createBookshelf(
  width: number,
  height: number,
  depth: number
): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-bookshelf"
  const woodMat = createMatteMaterial("#6b4a2b", { roughness: 0.62 })
  const backMat = createMatteMaterial("#4a321c", { roughness: 0.72 })
  const bookPalette = [
    "#c0392b",
    "#2e86c1",
    "#f1c40f",
    "#27ae60",
    "#8e44ad",
    "#e67e22",
    "#ecf0f1",
  ]
  const bookMats = bookPalette.map((hex) =>
    createMatteMaterial(hex, { roughness: 0.55 })
  )

  const thick = 0.06
  // Frame sides, back, top crown & base
  addPart(group, new THREE.BoxGeometry(width, height, 0.04), backMat, [
    0,
    height / 2,
    -depth / 2 + 0.02,
  ])
  for (const side of [-1, 1] as const) {
    addPart(group, new THREE.BoxGeometry(thick, height, depth), woodMat, [
      side * (width / 2 - thick / 2),
      height / 2,
      0,
    ])
  }
  addPart(
    group,
    new THREE.BoxGeometry(width + 0.06, thick * 1.4, depth + 0.04),
    woodMat,
    [0, height - thick / 2, 0]
  )

  const shelves = Math.max(2, Math.min(5, Math.round(height / 0.42)))
  const innerW = Math.max(0.24, width - thick * 2 - 0.06)
  const shelfStep = (height - 0.14) / shelves

  for (let s = 0; s < shelves; s += 1) {
    const sy = 0.07 + s * shelfStep
    addPart(group, new THREE.BoxGeometry(width - thick, 0.045, depth), woodMat, [
      0,
      sy,
      0,
    ])

    // Fill shelf cleanly with deterministic colorful book spines
    let cursor = -innerW / 2 + 0.03
    let idx = s * 7
    while (cursor < innerW / 2 - 0.09) {
      const bw = 0.065 + ((idx * 17) % 5) * 0.012
      const bh = Math.min(
        shelfStep - 0.08,
        shelfStep * (0.64 + ((idx * 29) % 4) * 0.06)
      )
      const bd = depth * 0.72
      const mat = bookMats[idx % bookMats.length]
      addPart(group, new THREE.BoxGeometry(bw, bh, bd), mat, [
        cursor + bw / 2,
        sy + 0.022 + bh / 2,
        0.02,
      ])
      cursor += bw + 0.012
      idx += 1
    }
  }

  return wrapProp(group)
}

// ---------- 11. Conference Table + Swivel Chairs ----------

export function createConferenceTable(
  width: number,
  depth: number,
  chairCount = 8
): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-conference-table"
  const topMat = createMatteMaterial("#f4f1ea", { roughness: 0.34 })
  const lipMat = createMatteMaterial("#b4aa97", { roughness: 0.5 })
  const baseMat = createMetalMaterial("#2e3a55", {
    roughness: 0.4,
    metalness: 0.55,
  })
  const trayMat = createMetalMaterial("#475569", {
    roughness: 0.32,
    metalness: 0.75,
  })

  const tableH = 0.76
  const endR = depth / 2
  const straightW = Math.max(0.1, width - depth)

  // Pill-shaped tabletop (center box + rounded cylinder endcaps)
  addPart(group, new THREE.BoxGeometry(straightW, 0.07, depth), topMat, [
    0,
    tableH,
    0,
  ])
  addPart(group, new THREE.BoxGeometry(straightW, 0.045, depth + 0.03), lipMat, [
    0,
    tableH - 0.035,
    0,
  ])
  for (const side of [-1, 1] as const) {
    addPart(
      group,
      new THREE.CylinderGeometry(endR, endR, 0.07, 22),
      topMat,
      [side * (straightW / 2), tableH, 0]
    )
    addPart(
      group,
      new THREE.CylinderGeometry(endR + 0.015, endR + 0.015, 0.045, 22),
      lipMat,
      [side * (straightW / 2), tableH - 0.035, 0]
    )
    // Sturdy pedestal leg
    addPart(
      group,
      new THREE.CylinderGeometry(0.16, 0.24, tableH - 0.06, 16),
      baseMat,
      [side * Math.max(0.3, straightW * 0.34), (tableH - 0.06) / 2, 0]
    )
  }

  // Central power/cable recessed tray
  addPart(
    group,
    new THREE.BoxGeometry(Math.max(0.4, straightW * 0.55), 0.018, 0.2),
    trayMat,
    [0, tableH + 0.04, 0]
  )

  // Swivel chairs arranged neatly along north & south sides
  const perSide = Math.max(1, Math.floor(chairCount / 2))
  const span = Math.max(0.4, width - 0.9)
  for (let i = 0; i < perSide; i += 1) {
    const t = perSide === 1 ? 0.5 : i / (perSide - 1)
    const cx = -span / 2 + t * span
    // North row facing South (+Z)
    const northChair = createSwivelChair("#283654")
    northChair.position.set(cx, 0, -depth / 2 - 0.34)
    group.add(northChair)
    // South row facing North (-Z)
    const southChair = createSwivelChair("#283654")
    southChair.position.set(cx, 0, depth / 2 + 0.34)
    southChair.rotation.y = Math.PI
    group.add(southChair)
  }

  return wrapProp(group)
}

// ---------- 12. Freestanding Office Achievement Standee ----------

export function createAchievementStandee(
  canvas: HTMLCanvasElement,
  width = 2.15,
  height = 3.45
): LiveBoardProp {
  const group = new THREE.Group()
  group.name = "prop-achievement-standee"
  const frameMat = createMatteMaterial("#0e1830", {
    roughness: 0.38,
    metalness: 0.25,
  })
  const goldMat = createMetalMaterial("#e9b949", {
    roughness: 0.24,
    metalness: 0.84,
    emissive: "#a16207",
    emissiveIntensity: 0.14,
  })
  const legMat = createMetalMaterial("#2e3a55", {
    roughness: 0.34,
    metalness: 0.72,
  })

  const legH = 0.42
  const boardH = height - legH
  const boardY = legH + boardH / 2

  // Weighted baseplate + twin sleek support legs
  addPart(group, new THREE.BoxGeometry(width * 0.92, 0.09, 0.62), legMat, [
    0, 0.045, 0,
  ])
  addPart(group, new THREE.BoxGeometry(width * 0.94, 0.03, 0.64), goldMat, [
    0, 0.095, 0,
  ])
  for (const side of [-1, 1] as const) {
    addPart(group, new THREE.CylinderGeometry(0.045, 0.055, legH + 0.12, 12), legMat, [
      side * (width * 0.34),
      legH / 2 + 0.06,
      0,
    ])
  }

  // Dark-navy standee cabinet + metallic gold outer bezel
  addPart(group, new THREE.BoxGeometry(width, boardH, 0.12), frameMat, [
    0,
    boardY,
    0,
  ])
  addPart(group, new THREE.BoxGeometry(width + 0.08, 0.06, 0.15), goldMat, [
    0,
    legH + boardH,
    0,
  ])
  addPart(group, new THREE.BoxGeometry(width + 0.08, 0.06, 0.15), goldMat, [
    0,
    legH,
    0,
  ])
  for (const side of [-1, 1] as const) {
    addPart(group, new THREE.BoxGeometry(0.06, boardH + 0.06, 0.15), goldMat, [
      side * (width / 2 + 0.02),
      boardY,
      0,
    ])
  }

  let texture: THREE.Texture
  try {
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
    texture = tex
  } catch {
    texture = new THREE.DataTexture(new Uint8Array([14, 24, 48, 255]), 1, 1)
    texture.needsUpdate = true
  }

  const faceMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: texture,
    emissiveIntensity: 0.34,
    roughness: 0.28,
  })
  addPart(
    group,
    new THREE.PlaneGeometry(width - 0.08, boardH - 0.08),
    faceMat,
    [0, boardY, 0.072],
    undefined,
    undefined,
    false
  )

  return {
    group,
    texture,
    update: () => {
      texture.needsUpdate = true
    },
    dispose: () => {
      disposeObject3D(group)
    },
  }
}

// ---------- 13. Plush Rounded / Oval Rug ----------

export function createRug(
  width: number,
  depth: number,
  opts?: RugOptions
): DisposableProp {
  const group = new THREE.Group()
  group.name = "prop-rug"
  const shape = opts?.shape ?? "oval"
  const colorHex = opts?.colorHex ?? "#f1e6d2"
  const borderHex = opts?.borderHex ?? "#22325a"
  const borderW = opts?.borderWidth ?? 0.14

  const fillMat = createClothMaterial(colorHex)
  const borderMat = createClothMaterial(borderHex)

  if (shape === "oval") {
    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.022, 36),
      borderMat
    )
    outer.scale.set(width, 1, depth)
    outer.position.y = 0.011
    outer.receiveShadow = true
    group.add(outer)

    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.026, 36),
      fillMat
    )
    inner.scale.set(
      Math.max(0.1, width - borderW * 2),
      1,
      Math.max(0.1, depth - borderW * 2)
    )
    inner.position.y = 0.014
    inner.receiveShadow = true
    group.add(inner)
  } else {
    addPart(
      group,
      new THREE.BoxGeometry(width, 0.022, depth),
      borderMat,
      [0, 0.011, 0],
      undefined,
      undefined,
      false
    )
    addPart(
      group,
      new THREE.BoxGeometry(
        Math.max(0.1, width - borderW * 2),
        0.026,
        Math.max(0.1, depth - borderW * 2)
      ),
      fillMat,
      [0, 0.014, 0],
      undefined,
      undefined,
      false
    )
  }

  return wrapProp(group)
}
