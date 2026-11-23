import * as THREE from "three"

import { createChibiFaceTexture, createSignTexture } from "./textures.ts"
import {
  createClothMaterial,
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  disposeObject3D,
  getAvatarStylePreset,
  resolveOutfitHex,
  shortestAngleDiff,
  type AvatarStylePreset,
  type ChibiCharacterSpec,
  type ChibiFaceVariant,
  type ChibiHairStyle,
  type ChibiRig,
  type ChibiStatueRank,
  type ChibiUpdateState,
} from "./types.ts"

function enableShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) {
      const noShadow =
        mesh.name === "chibi-face" || mesh.userData.noShadow === true
      mesh.castShadow = noShadow ? false : cast
      mesh.receiveShadow = noShadow ? false : receive
    }
  })
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  pos?: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number]
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  if (pos) mesh.position.set(pos[0], pos[1], pos[2])
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2])
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2])
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function buildHairMesh(
  headPivot: THREE.Group,
  style: ChibiHairStyle,
  hairMat: THREE.MeshStandardMaterial,
  accentMat: THREE.MeshStandardMaterial,
  highlightMat?: THREE.MeshStandardMaterial
): void {
  const hair = new THREE.Group()
  hair.name = "chibi-hair"
  headPivot.add(hair)

  // Base rounded hair cap tilted backward so the front hairline ends cleanly at y >= +0.175
  // (well above eyebrows at y=+0.106 and eyes at y=+0.015) while hugging the crown and back skull.
  addMesh(
    hair,
    new THREE.SphereGeometry(0.372, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.48),
    hairMat,
    [0, 0.015, -0.035],
    [-0.38, 0, 0],
    [1.06, 0.99, 1.02]
  )

  // Back skull hemisphere strictly behind the ears (z <= +0.02) so back silhouette is full
  // while keeping 0 hair vertices inside or in front of the +Z face plane.
  const backShellMat = hairMat.clone()
  backShellMat.side = THREE.DoubleSide
  addMesh(
    hair,
    new THREE.SphereGeometry(
      0.368,
      20,
      16,
      Math.PI * 0.95,
      Math.PI * 1.1,
      0,
      Math.PI
    ),
    backShellMat,
    [0, -0.015, -0.04],
    undefined,
    [1.03, 0.96, 0.96]
  )

  if (style === "side_part" || style === "neat_part") {
    // Sweeping front bangs parted neatly above the eyebrows
    addMesh(
      hair,
      new THREE.SphereGeometry(0.175, 14, 12),
      hairMat,
      [-0.13, 0.26, 0.235],
      [0.12, 0.18, -0.22],
      [1.18, 0.4, 0.54]
    )
    addMesh(
      hair,
      new THREE.SphereGeometry(0.155, 14, 12),
      hairMat,
      [0.135, 0.265, 0.225],
      [0.12, -0.22, 0.2],
      [1.04, 0.38, 0.52]
    )
    // Crisp sideburns framing the temples behind the face plane
    for (const side of [-1, 1] as const) {
      addMesh(
        hair,
        new THREE.CapsuleGeometry(0.052, 0.13, 6, 10),
        hairMat,
        [side * 0.345, 0.02, 0.055],
        [0, 0, side * 0.08]
      )
    }
  } else if (style === "swept_back") {
    // Voluminous swept-back executive wave
    addMesh(
      hair,
      new THREE.SphereGeometry(0.195, 16, 12),
      hairMat,
      [0, 0.295, 0.15],
      [-0.35, 0, 0],
      [1.42, 0.62, 0.96]
    )
    addMesh(
      hair,
      new THREE.SphereGeometry(0.135, 12, 10),
      hairMat,
      [-0.15, 0.255, 0.21],
      [0, 0.3, -0.28],
      [0.95, 0.46, 0.6]
    )
  } else if (style === "spiky") {
    // Energetic chibi spikes around crown & upper forehead
    const spikes: [number, number, number, number, number, number][] = [
      [0, 0.38, 0.13, 0.4, 0, 0],
      [-0.17, 0.35, 0.11, 0.32, 0.2, 0.44],
      [0.17, 0.35, 0.11, 0.32, -0.2, -0.44],
      [-0.22, 0.28, 0.18, 0.48, 0.28, 0.56],
      [0.22, 0.28, 0.18, 0.48, -0.28, -0.56],
      [0, 0.39, -0.08, -0.35, 0, 0],
    ]
    for (const [x, y, z, rx, ry, rz] of spikes) {
      addMesh(
        hair,
        new THREE.ConeGeometry(0.088, 0.2, 10),
        hairMat,
        [x, y, z],
        [rx, ry, rz]
      )
    }
  } else if (style === "slicked") {
    // Clean sculpted executive pompadour
    addMesh(
      hair,
      new THREE.CapsuleGeometry(0.125, 0.23, 8, 14),
      hairMat,
      [0.025, 0.31, 0.12],
      [Math.PI / 2 - 0.25, 0, -0.18],
      [1.32, 0.82, 0.82]
    )
  } else if (style === "bob") {
    // Cute rounded chin-length bob with back-only drape (theta=0 is +Z front in Three.js,
    // so [0.44π..1.56π] sweeps symmetrically across back & sides with zero front occlusion).
    for (const side of [-1, 1] as const) {
      addMesh(
        hair,
        new THREE.CapsuleGeometry(0.095, 0.31, 8, 14),
        hairMat,
        [side * 0.335, -0.09, 0.015],
        [0.06, 0, -side * 0.1]
      )
    }
    const bobBackMat = hairMat.clone()
    bobBackMat.side = THREE.DoubleSide
    addMesh(
      hair,
      new THREE.CylinderGeometry(
        0.365,
        0.395,
        0.35,
        22,
        1,
        true,
        Math.PI * 0.44,
        Math.PI * 1.12
      ),
      bobBackMat,
      [0, -0.11, -0.05]
    )
    // Soft curved forehead bangs well above eyebrows
    for (const bx of [-0.155, 0, 0.155]) {
      addMesh(
        hair,
        new THREE.SphereGeometry(0.11, 12, 10),
        hairMat,
        [bx, 0.245, 0.265],
        [0.14, 0, 0],
        [1.12, 0.46, 0.48]
      )
    }
  } else if (style === "ponytail") {
    // Forehead bangs + cute side framing locks + bouncy high ponytail + gold scrunchie
    for (const bx of [-0.15, 0.015, 0.17]) {
      addMesh(
        hair,
        new THREE.SphereGeometry(0.11, 12, 10),
        hairMat,
        [bx, 0.25, 0.26],
        [0.14, 0, 0],
        [1.08, 0.44, 0.46]
      )
    }
    for (const side of [-1, 1] as const) {
      addMesh(
        hair,
        new THREE.CapsuleGeometry(0.058, 0.19, 6, 10),
        hairMat,
        [side * 0.335, -0.02, 0.085],
        [0.08, 0, -side * 0.08]
      )
    }
    // Gold scrunchie band
    addMesh(
      hair,
      new THREE.TorusGeometry(0.085, 0.032, 10, 18),
      accentMat,
      [0, 0.16, -0.38],
      [0.45, 0, 0]
    )
    // Bouncy ponytail volume
    addMesh(
      hair,
      new THREE.SphereGeometry(0.16, 16, 14),
      hairMat,
      [0, 0.04, -0.5],
      undefined,
      [0.85, 1.35, 0.82]
    )
    addMesh(
      hair,
      new THREE.ConeGeometry(0.13, 0.28, 14),
      hairMat,
      [0, -0.22, -0.52],
      [Math.PI + 0.15, 0, 0]
    )
  } else if (style === "long_wavy") {
    // Long flowing back waves + framing side strands + gold pearl headband
    for (const side of [-1, 1] as const) {
      addMesh(
        hair,
        new THREE.CapsuleGeometry(0.09, 0.5, 8, 14),
        hairMat,
        [side * 0.335, -0.19, 0.025],
        [0.05, 0, -side * 0.06]
      )
    }
    addMesh(
      hair,
      new THREE.SphereGeometry(0.36, 18, 16),
      hairMat,
      [0, -0.23, -0.18],
      undefined,
      [1.06, 1.24, 0.6]
    )
    for (const bx of [-0.155, 0.155]) {
      addMesh(
        hair,
        new THREE.SphereGeometry(0.125, 12, 10),
        hairMat,
        [bx, 0.26, 0.245],
        [0.14, 0, bx < 0 ? -0.2 : 0.2],
        [1.12, 0.42, 0.48]
      )
    }
    // Gold headband + pearl centerpiece
    addMesh(
      hair,
      new THREE.TorusGeometry(0.385, 0.022, 10, 28, Math.PI * 1.05),
      accentMat,
      [0, 0.05, 0.04],
      [0.12, 0, -0.025]
    )
    addMesh(
      hair,
      new THREE.SphereGeometry(0.042, 12, 10),
      createMatteMaterial("#fffaf0", { roughness: 0.22, metalness: 0.15 }),
      [0.14, 0.39, 0.09]
    )
  } else if (style === "layered_clips") {
    // Shoulder-length layered locks + twin gold hairclips
    for (const side of [-1, 1] as const) {
      addMesh(
        hair,
        new THREE.CapsuleGeometry(0.095, 0.41, 8, 12),
        hairMat,
        [side * 0.34, -0.14, 0.025],
        [0.05, 0, -side * 0.09]
      )
    }
    addMesh(
      hair,
      new THREE.SphereGeometry(0.34, 16, 14),
      hairMat,
      [0, -0.16, -0.16],
      undefined,
      [1.06, 1.05, 0.62]
    )
    for (const bx of [-0.145, 0.14]) {
      addMesh(
        hair,
        new THREE.SphereGeometry(0.125, 12, 10),
        hairMat,
        [bx, 0.26, 0.245],
        [0.14, 0, bx < 0 ? -0.18 : 0.2],
        [1.12, 0.42, 0.48]
      )
    }
    // Twin gold hairclips on right temple
    addMesh(
      hair,
      new THREE.BoxGeometry(0.11, 0.024, 0.028),
      accentMat,
      [0.23, 0.215, 0.265],
      [0, 0.55, -0.22]
    )
    addMesh(
      hair,
      new THREE.BoxGeometry(0.1, 0.022, 0.026),
      accentMat,
      [0.255, 0.175, 0.25],
      [0, 0.58, -0.2]
    )
  } else if (style === "chignon") {
    // Sleek advisor low chignon bun + curved side bangs above glasses
    for (const bx of [-0.155, 0.155]) {
      addMesh(
        hair,
        new THREE.SphereGeometry(0.125, 12, 10),
        hairMat,
        [bx, 0.26, 0.245],
        [0.14, 0, bx < 0 ? -0.22 : 0.22],
        [1.12, 0.42, 0.48]
      )
    }
    addMesh(
      hair,
      new THREE.SphereGeometry(0.155, 16, 14),
      hairMat,
      [0, -0.05, -0.4],
      undefined,
      [1.15, 0.92, 0.85]
    )
    addMesh(
      hair,
      new THREE.TorusGeometry(0.11, 0.02, 8, 18),
      accentMat,
      [0, -0.05, -0.34]
    )
  } else {
    // "tousled_cool" (danhtrongit): layered stylish cool bangs + signature electric-blue highlight lock
    const tufts: [number, number, number, number, number, number, boolean][] = [
      [-0.17, 0.295, 0.215, 0.24, 0.15, 0.3, false],
      [0.015, 0.315, 0.225, 0.28, 0, -0.1, false],
      [0.18, 0.29, 0.215, 0.24, -0.2, -0.34, true],
      [-0.23, 0.355, 0.08, 0.2, 0.2, 0.46, false],
      [0.21, 0.36, 0.08, 0.2, -0.2, -0.44, false],
      [0, 0.385, 0.05, 0.12, 0, 0.15, false],
    ]
    for (const [x, y, z, rx, ry, rz, isHi] of tufts) {
      addMesh(
        hair,
        new THREE.ConeGeometry(0.085, 0.18, 10),
        isHi && highlightMat ? highlightMat : hairMat,
        [x, y, z],
        [rx, ry, rz]
      )
    }
    for (const side of [-1, 1] as const) {
      addMesh(
        hair,
        new THREE.CapsuleGeometry(0.055, 0.15, 6, 10),
        hairMat,
        [side * 0.345, 0.02, 0.055]
      )
    }
  }
}

function buildGlasses(
  headPivot: THREE.Group,
  frameColor: string,
  coolTint: boolean
): void {
  const glasses = new THREE.Group()
  glasses.name = "chibi-glasses"
  const frameMat = createMetalMaterial(frameColor, {
    roughness: 0.25,
    metalness: 0.7,
  })
  const lensMat = new THREE.MeshStandardMaterial({
    color: coolTint ? "#38bdf8" : "#e0f2fe",
    transparent: true,
    opacity: coolTint ? 0.24 : 0.16,
    depthWrite: false,
    roughness: 0.1,
    metalness: 0.2,
  })

  for (const side of [-1, 1] as const) {
    const lx = side * 0.108
    addMesh(
      glasses,
      new THREE.TorusGeometry(0.078, 0.012, 10, 22),
      frameMat,
      [lx, 0.012, 0.368],
      [0, side * 0.24, 0]
    )
    const lens = addMesh(
      glasses,
      new THREE.CircleGeometry(0.074, 18),
      lensMat,
      [lx, 0.012, 0.365],
      [0, side * 0.24, 0]
    )
    lens.userData.noShadow = true
    lens.castShadow = false
    lens.receiveShadow = false
    // Temple arm
    addMesh(
      glasses,
      new THREE.BoxGeometry(0.014, 0.015, 0.28),
      frameMat,
      [side * 0.228, 0.014, 0.225],
      [0, -side * 0.26, 0]
    )
  }
  // Bridge
  addMesh(
    glasses,
    new THREE.BoxGeometry(0.068, 0.014, 0.014),
    frameMat,
    [0, 0.018, 0.382]
  )
  headPivot.add(glasses)
}

function buildThanTaiVisuals(
  hipsPivot: THREE.Group,
  torsoPivot: THREE.Group,
  headPivot: THREE.Group,
  leftArmPivot: THREE.Group,
  rightArmPivot: THREE.Group,
  leftLegPivot: THREE.Group,
  rightLegPivot: THREE.Group
): {
  haloRing: THREE.Mesh
  ingotGroup: THREE.Group
} {
  const crimsonMat = createClothMaterial("#b91c1c")
  const deepRedMat = createClothMaterial("#88131a")
  const goldMat = createMetalMaterial("#f5c542", {
    roughness: 0.24,
    metalness: 0.82,
    emissive: "#a16207",
    emissiveIntensity: 0.15,
  })
  const brightGoldMat = createMetalMaterial("#fde047", {
    roughness: 0.2,
    metalness: 0.86,
    emissive: "#ca8a04",
    emissiveIntensity: 0.25,
  })
  const skinMat = createMatteMaterial("#fde0c2", { roughness: 0.58 })
  const beardMat = createMatteMaterial("#f8fafc", { roughness: 0.72 })
  const rubyMat = createGlowMaterial("#ef4444", 0.9)
  const jadeMat = createMetalMaterial("#10b981", {
    roughness: 0.22,
    metalness: 0.35,
  })
  const bootMat = createMatteMaterial("#261913", { roughness: 0.6 })

  // Plump imperial robe skirt & boots
  for (const [legPivot, sx] of [
    [leftLegPivot, -0.11],
    [rightLegPivot, 0.11],
  ] as const) {
    legPivot.position.set(sx, 0, 0)
    addMesh(
      legPivot,
      new THREE.CapsuleGeometry(0.085, 0.12, 8, 12),
      deepRedMat,
      [0, -0.15, 0]
    )
    addMesh(
      legPivot,
      new THREE.SphereGeometry(0.105, 14, 12),
      bootMat,
      [0, -0.27, 0.04],
      undefined,
      [0.95, 0.65, 1.35]
    )
  }

  // Wide celebratory crimson robe torso
  addMesh(
    torsoPivot,
    new THREE.CylinderGeometry(0.24, 0.34, 0.6, 22),
    crimsonMat,
    [0, 0.27, 0]
  )
  // Golden robe bottom hem trim
  addMesh(
    torsoPivot,
    new THREE.TorusGeometry(0.335, 0.026, 10, 26),
    goldMat,
    [0, -0.02, 0],
    [Math.PI / 2, 0, 0]
  )
  // Golden front vertical brocade panel
  addMesh(
    torsoPivot,
    new THREE.BoxGeometry(0.14, 0.54, 0.05),
    goldMat,
    [0, 0.26, 0.27]
  )
  // Imperial gold waist belt + jade center medallion
  addMesh(
    torsoPivot,
    new THREE.TorusGeometry(0.275, 0.032, 10, 24),
    goldMat,
    [0, 0.24, 0],
    [Math.PI / 2, 0, 0]
  )
  addMesh(
    torsoPivot,
    new THREE.CylinderGeometry(0.068, 0.068, 0.035, 16),
    jadeMat,
    [0, 0.24, 0.285],
    [Math.PI / 2, 0, 0]
  )

  // Wide flared imperial sleeves + cute plump hands
  for (const [armPivot, side] of [
    [leftArmPivot, -1],
    [rightArmPivot, 1],
  ] as const) {
    armPivot.position.set(side * 0.28, 0.46, 0.04)
    addMesh(
      armPivot,
      new THREE.CylinderGeometry(0.085, 0.13, 0.28, 14),
      crimsonMat,
      [0, -0.14, 0.04],
      [-0.35, 0, side * 0.16]
    )
    addMesh(
      armPivot,
      new THREE.TorusGeometry(0.125, 0.018, 8, 18),
      goldMat,
      [side * 0.02, -0.25, 0.1],
      [Math.PI / 2 - 0.35, 0, 0]
    )
    addMesh(
      armPivot,
      new THREE.SphereGeometry(0.075, 12, 10),
      skinMat,
      [side * 0.02, -0.29, 0.12]
    )
  }

  // Gleaming 3D Kim Nguyên Bảo (Gold Sycee Ingot) held proudly in front
  const ingotGroup = new THREE.Group()
  ingotGroup.position.set(0, 0.32, 0.36)
  // Curved boat body
  addMesh(
    ingotGroup,
    new THREE.CylinderGeometry(0.17, 0.11, 0.11, 18),
    brightGoldMat,
    [0, 0, 0],
    undefined,
    [1.35, 1.0, 0.78]
  )
  // Raised boat side tips
  for (const side of [-1, 1] as const) {
    addMesh(
      ingotGroup,
      new THREE.SphereGeometry(0.072, 12, 10),
      brightGoldMat,
      [side * 0.17, 0.055, 0],
      undefined,
      [1.0, 0.75, 0.85]
    )
  }
  // Signature central gold mound
  addMesh(
    ingotGroup,
    new THREE.SphereGeometry(0.095, 16, 14),
    brightGoldMat,
    [0, 0.065, 0],
    undefined,
    [1.1, 0.82, 0.9]
  )
  torsoPivot.add(ingotGroup)

  // Oversized jolly chibi head
  headPivot.position.set(0, 0.88, 0)
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.36, 26, 22),
    skinMat,
    [0, 0, 0],
    undefined,
    [1.08, 0.98, 1.02]
  )
  for (const side of [-1, 1] as const) {
    addMesh(
      headPivot,
      new THREE.SphereGeometry(0.085, 12, 10),
      skinMat,
      [side * 0.37, -0.02, -0.01]
    )
  }

  // Jolly crescent smiling face visor
  const faceMat = new THREE.MeshStandardMaterial({
    map: createChibiFaceTexture("thantai"),
    transparent: true,
    depthWrite: false,
    roughness: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.365,
      24,
      18,
      Math.PI * 0.5 - 0.68,
      1.36,
      Math.PI * 0.24,
      Math.PI * 0.5
    ),
    faceMat
  )
  faceMesh.name = "chibi-face"
  faceMesh.scale.set(1.08, 0.98, 1.02)
  faceMesh.castShadow = false
  faceMesh.receiveShadow = false
  headPivot.add(faceMesh)

  // Fluffy cloud-like white chibi beard + twin moustache puffs
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.16, 14, 12),
    beardMat,
    [0, -0.28, 0.25],
    undefined,
    [1.45, 0.9, 0.72]
  )
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.125, 12, 10),
    beardMat,
    [0, -0.39, 0.22],
    undefined,
    [1.15, 0.95, 0.68]
  )
  for (const side of [-1, 1] as const) {
    addMesh(
      headPivot,
      new THREE.SphereGeometry(0.1, 12, 10),
      beardMat,
      [side * 0.14, -0.17, 0.32],
      [0, 0, -side * 0.22],
      [1.25, 0.62, 0.58]
    )
  }

  // Ornate Golden-Winged Imperial Mandarin Hat (Mũ cánh chuồn)
  const hat = new THREE.Group()
  hat.position.set(0, 0.25, 0)
  // Crimson velvet crown
  addMesh(
    hat,
    new THREE.CylinderGeometry(0.32, 0.37, 0.22, 22),
    crimsonMat,
    [0, 0.06, -0.01]
  )
  addMesh(
    hat,
    new THREE.SphereGeometry(0.32, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    crimsonMat,
    [0, 0.16, -0.01],
    undefined,
    [1.0, 0.62, 1.0]
  )
  // Gold brim band + upper ridge
  addMesh(
    hat,
    new THREE.TorusGeometry(0.375, 0.032, 10, 28),
    goldMat,
    [0, -0.04, 0],
    [Math.PI / 2, 0, 0]
  )
  // Glowing ruby forehead medallion
  addMesh(
    hat,
    new THREE.CylinderGeometry(0.088, 0.088, 0.04, 18),
    brightGoldMat,
    [0, 0.05, 0.36],
    [Math.PI / 2, 0, 0]
  )
  addMesh(
    hat,
    new THREE.SphereGeometry(0.056, 14, 12),
    rubyMat,
    [0, 0.05, 0.385]
  )
  // Twin curved mandarin hat wings (Cánh chuồn)
  for (const side of [-1, 1] as const) {
    addMesh(
      hat,
      new THREE.CapsuleGeometry(0.036, 0.24, 6, 12),
      goldMat,
      [side * 0.48, 0.06, -0.02],
      [0, 0, side * (Math.PI / 2 - 0.18)]
    )
    addMesh(
      hat,
      new THREE.SphereGeometry(0.085, 14, 12),
      brightGoldMat,
      [side * 0.64, 0.09, -0.02],
      undefined,
      [1.25, 0.58, 0.38]
    )
  }
  headPivot.add(hat)

  // Floating luminous Golden Halo Ring behind head
  const haloMat = createGlowMaterial("#fbbf24", 0.95, 0.88)
  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.56, 0.024, 12, 36),
    haloMat
  )
  haloRing.position.set(0, 0.08, -0.26)
  haloRing.castShadow = false
  headPivot.add(haloRing)

  hipsPivot.position.set(0, 0.34, 0)
  return { haloRing, ingotGroup }
}

function createStatueMaterial(
  rank: ChibiStatueRank
): THREE.MeshStandardMaterial {
  if (rank === 1) {
    return createMetalMaterial("#f3c64a", {
      roughness: 0.24,
      metalness: 0.82,
      emissive: "#854d0e",
      emissiveIntensity: 0.12,
    })
  }
  if (rank === 2) {
    return createMetalMaterial("#cfd5de", {
      roughness: 0.26,
      metalness: 0.78,
      emissive: "#334155",
      emissiveIntensity: 0.08,
    })
  }
  if (rank === 3) {
    return createMetalMaterial("#c98a52", {
      roughness: 0.32,
      metalness: 0.74,
      emissive: "#5c2d0c",
      emissiveIntensity: 0.08,
    })
  }
  return createMatteMaterial("#64748b", {
    roughness: 0.82,
    metalness: 0.08,
    transparent: true,
    opacity: 0.76,
  })
}

function buildStandardChibiVisuals(
  preset: AvatarStylePreset,
  outfitHex: string,
  isBoss: boolean,
  statueRank: ChibiStatueRank | undefined,
  hipsPivot: THREE.Group,
  torsoPivot: THREE.Group,
  headPivot: THREE.Group,
  leftArmPivot: THREE.Group,
  rightArmPivot: THREE.Group,
  leftLegPivot: THREE.Group,
  rightLegPivot: THREE.Group
): {
  outfitMaterials: THREE.MeshStandardMaterial[]
  medalGroup: THREE.Group | null
} {
  const isStatue = statueRank !== undefined
  const statueBaseMat = isStatue ? createStatueMaterial(statueRank) : null
  const statueShadeMat = isStatue
    ? createMetalMaterial(
        statueRank === 1
          ? "#d4a024"
          : statueRank === 2
            ? "#94a3b8"
            : statueRank === 3
              ? "#9c6232"
              : "#475569",
        {
          roughness: statueRank === "empty" ? 0.86 : 0.34,
          metalness: statueRank === "empty" ? 0.06 : 0.72,
          transparent: statueRank === "empty",
          opacity: statueRank === "empty" ? 0.72 : 1,
        }
      )
    : null

  const skinMat =
    statueBaseMat ?? createMatteMaterial(preset.skinColor, { roughness: 0.56 })
  const hairMat =
    statueShadeMat ??
    createMatteMaterial(preset.hairColor, { roughness: 0.52, metalness: 0.08 })
  const hairHighlightMat =
    !isStatue && preset.hairHighlight
      ? createMatteMaterial(preset.hairHighlight, {
          roughness: 0.42,
          metalness: 0.14,
        })
      : undefined
  const outfitMat = statueBaseMat ?? createClothMaterial(outfitHex)
  const bottomMat = statueShadeMat ?? createClothMaterial(preset.bottomHex)
  const shirtMat =
    statueBaseMat ??
    createMatteMaterial(preset.innerShirtHex, { roughness: 0.62 })
  const accentMat =
    statueShadeMat ??
    createMetalMaterial(preset.tieOrAccentHex, {
      roughness: 0.35,
      metalness: 0.35,
    })
  const shoeMat =
    statueShadeMat ??
    createMatteMaterial(preset.shoeHex, { roughness: 0.55, metalness: 0.12 })
  const goldTrimMat =
    statueBaseMat ??
    createMetalMaterial("#f5c542", { roughness: 0.26, metalness: 0.8 })

  const outfitMaterials: THREE.MeshStandardMaterial[] = isStatue
    ? []
    : [outfitMat]

  // Legs + cute chibi shoes
  const isSkirtOrDress =
    preset.outfitStyle === "skirt_blouse" || preset.outfitStyle === "dress_belt"
  const legMat = isSkirtOrDress ? skinMat : bottomMat

  for (const [legPivot, sx] of [
    [leftLegPivot, -0.105],
    [rightLegPivot, 0.105],
  ] as const) {
    legPivot.position.set(sx, 0, 0)
    addMesh(
      legPivot,
      new THREE.CapsuleGeometry(0.072, 0.15, 8, 12),
      legMat,
      [0, -0.14, 0]
    )
    // Cute rounded chibi shoe
    addMesh(
      legPivot,
      new THREE.SphereGeometry(0.088, 14, 12),
      shoeMat,
      [0, -0.275, 0.032],
      undefined,
      [0.95, 0.64, 1.32]
    )
  }

  // Torso sculpted to match outfit style
  if (preset.outfitStyle === "dress_belt") {
    addMesh(
      torsoPivot,
      new THREE.CylinderGeometry(0.185, 0.31, 0.54, 20),
      outfitMat,
      [0, 0.25, 0]
    )
    // Gold waist belt
    addMesh(
      torsoPivot,
      new THREE.TorusGeometry(0.225, 0.022, 8, 22),
      goldTrimMat,
      [0, 0.24, 0],
      [Math.PI / 2, 0, 0]
    )
  } else if (preset.outfitStyle === "skirt_blouse") {
    // Upper blouse / vest
    addMesh(
      torsoPivot,
      new THREE.CylinderGeometry(0.19, 0.215, 0.34, 18),
      outfitMat,
      [0, 0.36, 0]
    )
    // Flared pleated skirt
    addMesh(
      torsoPivot,
      new THREE.CylinderGeometry(0.21, 0.3, 0.25, 20),
      bottomMat,
      [0, 0.08, 0]
    )
  } else {
    // Tailored suit / blazer / shirt / polo torso
    addMesh(
      torsoPivot,
      new THREE.CylinderGeometry(0.21, 0.235, 0.5, 20),
      outfitMat,
      [0, 0.27, 0]
    )
    // Rounded waist hip cap
    addMesh(
      torsoPivot,
      new THREE.CylinderGeometry(0.232, 0.225, 0.12, 18),
      bottomMat,
      [0, 0.02, 0]
    )
  }

  // Crisp inner white shirt V-collar + tie / ribbon / lapel accents
  addMesh(
    torsoPivot,
    new THREE.ConeGeometry(0.115, 0.22, 12),
    shirtMat,
    [0, 0.42, 0.165],
    [Math.PI, 0, 0],
    [1.0, 1.0, 0.45]
  )
  if (
    preset.outfitStyle === "suit_tie" ||
    preset.outfitStyle === "blazer_pin"
  ) {
    // Tie knot + blade
    addMesh(
      torsoPivot,
      new THREE.BoxGeometry(0.044, 0.24, 0.025),
      accentMat,
      [0, 0.33, 0.225]
    )
    addMesh(
      torsoPivot,
      new THREE.ConeGeometry(0.036, 0.07, 4),
      accentMat,
      [0, 0.18, 0.225],
      [Math.PI, Math.PI / 4, 0]
    )
  } else if (preset.outfitStyle === "skirt_blouse") {
    // Cute ribbon bow at collar
    addMesh(
      torsoPivot,
      new THREE.SphereGeometry(0.034, 10, 8),
      accentMat,
      [0, 0.44, 0.215]
    )
    for (const side of [-1, 1] as const) {
      addMesh(
        torsoPivot,
        new THREE.ConeGeometry(0.035, 0.075, 8),
        accentMat,
        [side * 0.048, 0.44, 0.21],
        [0, 0, side * (Math.PI / 2)]
      )
    }
  } else if (preset.outfitStyle === "tech_blazer" && preset.hasItEmblem) {
    // Glowing gold chest IT badge + cyan inner crew tee
    addMesh(
      torsoPivot,
      new THREE.BoxGeometry(0.09, 0.055, 0.025),
      goldTrimMat,
      [0.105, 0.39, 0.215]
    )
  }

  // Boss or executive gold lapel pin
  if (isBoss || preset.outfitStyle === "blazer_pin") {
    addMesh(
      torsoPivot,
      new THREE.SphereGeometry(0.028, 10, 8),
      goldTrimMat,
      [-0.105, 0.41, 0.218]
    )
  }

  // Cute rounded chibi arms (sleeves follow dynamic outfit color!)
  for (const [armPivot, side] of [
    [leftArmPivot, -1],
    [rightArmPivot, 1],
  ] as const) {
    armPivot.position.set(side * 0.255, 0.45, 0)
    addMesh(
      armPivot,
      new THREE.CapsuleGeometry(0.068, 0.2, 8, 12),
      outfitMat,
      [0, -0.14, 0],
      [0, 0, side * 0.08]
    )
    // Plump cute hand sphere
    addMesh(
      armPivot,
      new THREE.SphereGeometry(0.066, 12, 10),
      skinMat,
      [side * 0.014, -0.28, 0.01]
    )
  }

  // Tiny neck connector
  addMesh(
    torsoPivot,
    new THREE.CylinderGeometry(0.085, 0.095, 0.1, 14),
    skinMat,
    [0, 0.54, 0]
  )

  // Oversized rounded chibi head (~44% of total height!)
  headPivot.position.set(0, 0.87, 0)
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.35, 28, 22),
    skinMat,
    [0, 0, 0],
    undefined,
    [1.06, 0.98, 1.0]
  )

  // Cute rounded ears
  for (const side of [-1, 1] as const) {
    addMesh(
      headPivot,
      new THREE.SphereGeometry(0.072, 12, 10),
      skinMat,
      [side * 0.355, -0.02, -0.01]
    )
  }

  // High-DPI curved front face visor (zero polar distortion!)
  const faceVariant: ChibiFaceVariant = isStatue
    ? statueRank === 1
      ? "statue_gold"
      : statueRank === 2
        ? "statue_silver"
        : statueRank === 3
          ? "statue_bronze"
          : "statue_empty"
    : preset.faceVariant

  const faceMat = new THREE.MeshStandardMaterial({
    map: createChibiFaceTexture(faceVariant),
    transparent: true,
    depthWrite: false,
    roughness: 0.32,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  const faceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.356,
      24,
      18,
      Math.PI * 0.5 - 0.68,
      1.36,
      Math.PI * 0.24,
      Math.PI * 0.5
    ),
    faceMat
  )
  faceMesh.name = "chibi-face"
  faceMesh.scale.set(1.06, 0.98, 1.0)
  faceMesh.castShadow = false
  faceMesh.receiveShadow = false
  headPivot.add(faceMesh)

  // Sculpted hairstyle unique to each AvatarId
  buildHairMesh(
    headPivot,
    preset.hairStyle,
    hairMat,
    goldTrimMat,
    hairHighlightMat
  )

  // Sleek 3D glasses for specialist & owner avatars
  if (preset.hasGlasses && !isStatue) {
    buildGlasses(
      headPivot,
      preset.glassesColor ?? "#1f2937",
      preset.id === "danhtrongit"
    )
  }

  // Floating metallic rank medal disc for Hall of Fame statues
  let medalGroup: THREE.Group | null = null
  if (isStatue) {
    medalGroup = new THREE.Group()
    medalGroup.position.set(0, 0.56, 0)
    const label = statueRank === "empty" ? "?" : String(statueRank)
    const accent =
      statueRank === 1
        ? "#f3c64a"
        : statueRank === 2
          ? "#cfd5de"
          : statueRank === 3
            ? "#c98a52"
            : "#64748b"
    const medalTex = createSignTexture(label, {
      style: "medal",
      accentColor: accent,
      textColor: statueRank === "empty" ? "#e2e8f0" : "#261804",
    })
    const rimMat = createMetalMaterial(accent, {
      roughness: 0.25,
      metalness: 0.8,
    })
    addMesh(
      medalGroup,
      new THREE.CylinderGeometry(0.16, 0.16, 0.036, 24),
      rimMat,
      [0, 0, 0],
      [Math.PI / 2, 0, 0]
    )
    const facePlaneMat = new THREE.MeshStandardMaterial({
      map: medalTex,
      transparent: true,
      roughness: 0.3,
      metalness: 0.2,
    })
    for (const side of [-1, 1] as const) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.145, 22),
        facePlaneMat
      )
      disc.position.set(0, 0, side * 0.02)
      if (side < 0) disc.rotation.y = Math.PI
      disc.castShadow = false
      medalGroup.add(disc)
    }
    headPivot.add(medalGroup)
  }

  hipsPivot.position.set(0, 0.34, 0)
  return { outfitMaterials, medalGroup }
}

/**
 * Builds an articulated, razor-sharp 3D Chibi character rig with live color swapping
 * and smooth procedural animations (`idle`, `walk`, `wave`, `bow`, `hop`, `statue`).
 */
export function createChibiCharacter(spec: ChibiCharacterSpec): ChibiRig {
  const isThanTai = spec.isThanTai === true || spec.avatarId === "thantai"
  const isBoss = spec.isBoss === true
  const preset = getAvatarStylePreset(spec.avatarId, spec.genderHint)
  const initialOutfitHex =
    resolveOutfitHex(spec.outfitColorHex) ?? preset.defaultOutfitHex

  const baseScale = isThanTai
    ? 1.75 * (spec.scale ?? 1)
    : (isBoss ? 1.06 : 1.0) * (spec.scale ?? 1)

  const root = new THREE.Group()
  root.name = `chibi-${spec.avatarId}`
  root.scale.setScalar(baseScale)

  // Soft ground contact shadow disc (stays pinned to floor during hops)
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x0d111a,
    transparent: true,
    opacity: spec.statueRank === "empty" ? 0.14 : 0.26,
    depthWrite: false,
  })
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(isThanTai ? 0.42 : 0.34, 24),
    shadowMat
  )
  shadowDisc.rotation.x = -Math.PI / 2
  shadowDisc.position.y = 0.012
  shadowDisc.renderOrder = 1
  root.add(shadowDisc)

  const bodyPivot = new THREE.Group()
  const hipsPivot = new THREE.Group()
  const torsoPivot = new THREE.Group()
  const headPivot = new THREE.Group()
  const leftArmPivot = new THREE.Group()
  const rightArmPivot = new THREE.Group()
  const leftLegPivot = new THREE.Group()
  const rightLegPivot = new THREE.Group()

  root.add(bodyPivot)
  bodyPivot.add(hipsPivot)
  hipsPivot.add(leftLegPivot, rightLegPivot, torsoPivot)
  torsoPivot.add(leftArmPivot, rightArmPivot, headPivot)

  let outfitMaterials: THREE.MeshStandardMaterial[] = []
  let medalGroup: THREE.Group | null = null
  let haloRing: THREE.Mesh | null = null
  let ingotGroup: THREE.Group | null = null

  if (isThanTai) {
    const built = buildThanTaiVisuals(
      hipsPivot,
      torsoPivot,
      headPivot,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot
    )
    haloRing = built.haloRing
    ingotGroup = built.ingotGroup
  } else {
    const built = buildStandardChibiVisuals(
      preset,
      initialOutfitHex,
      isBoss,
      spec.statueRank,
      hipsPivot,
      torsoPivot,
      headPivot,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot
    )
    outfitMaterials = built.outfitMaterials
    medalGroup = built.medalGroup
  }

  // Keep face visor crisp & free of self-shadow acne while body still casts floor shadows
  enableShadows(bodyPivot, true, true)
  const faceNode = headPivot.getObjectByName("chibi-face")
  if (faceNode instanceof THREE.Mesh) {
    faceNode.castShadow = false
    faceNode.receiveShadow = false
  }

  const baseHipsY = hipsPivot.position.y
  let internalTime = 0
  let currentFacing = 0
  let facingInitialized = false
  let dimmedState = spec.statueRank === "empty"

  const dimmableMaterials = new Set<THREE.MeshStandardMaterial>()
  bodyPivot.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material
    if (mat instanceof THREE.MeshStandardMaterial) {
      dimmableMaterials.add(mat)
    }
  })
  const baseOpacities = new Map<THREE.MeshStandardMaterial, number>()
  for (const mat of dimmableMaterials) {
    baseOpacities.set(mat, mat.opacity)
  }

  const setOutfitColor = (hex: string | null): void => {
    const resolved = resolveOutfitHex(hex) ?? preset.defaultOutfitHex
    for (const mat of outfitMaterials) {
      mat.color.set(resolved)
    }
  }

  const setDimmed = (dimmed: boolean): void => {
    dimmedState = dimmed
    for (const mat of dimmableMaterials) {
      const orig = baseOpacities.get(mat) ?? 1
      if (dimmed) {
        mat.transparent = true
        mat.opacity = Math.min(orig, 0.56)
      } else {
        mat.opacity = orig
        if (orig >= 1 && !mat.map) {
          mat.transparent = false
        }
      }
      mat.needsUpdate = true
    }
    shadowMat.opacity = dimmed ? 0.14 : 0.26
  }

  const update = (dt: number, state: ChibiUpdateState): void => {
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0
    internalTime += safeDt
    const t =
      state.animTime !== undefined && Number.isFinite(state.animTime)
        ? state.animTime
        : internalTime
    const targetFacing = Number.isFinite(state.facingRad) ? state.facingRad : 0
    const moveFactor = Math.max(
      0,
      Math.min(1, Number.isFinite(state.moveFactor) ? (state.moveFactor ?? 1) : 1)
    )

    if (!facingInitialized || state.anim === "statue") {
      currentFacing = targetFacing
      facingInitialized = true
    } else {
      const delta = shortestAngleDiff(currentFacing, targetFacing)
      const alpha = 1 - Math.exp(-15 * safeDt)
      currentFacing += delta * alpha
    }
    bodyPivot.rotation.y = currentFacing

    // Reset articulated transforms cleanly before applying active mode
    bodyPivot.position.set(0, 0, 0)
    bodyPivot.scale.set(1, 1, 1)
    hipsPivot.position.y = baseHipsY
    hipsPivot.rotation.set(0, 0, 0)
    torsoPivot.rotation.set(0, 0, 0)
    torsoPivot.scale.set(1, 1, 1)
    headPivot.rotation.set(0, 0, 0)
    leftArmPivot.rotation.set(0, 0, 0)
    rightArmPivot.rotation.set(0, 0, 0)
    leftLegPivot.rotation.set(0, 0, 0)
    rightLegPivot.rotation.set(0, 0, 0)
    shadowDisc.scale.setScalar(1)

    if (haloRing) {
      haloRing.rotation.z = t * (state.anim === "wave" ? 2.4 : 0.7)
    }
    if (ingotGroup) {
      ingotGroup.position.y = 0.32 + Math.sin(t * 2.8) * 0.015
    }
    if (medalGroup) {
      medalGroup.position.y = 0.56 + Math.sin(t * 2.4) * 0.032
      medalGroup.rotation.y = t * 1.15
    }

    switch (state.anim) {
      case "idle": {
        const breath = Math.sin(t * 2.6)
        torsoPivot.scale.set(1 + breath * 0.014, 1 + breath * 0.022, 1)
        headPivot.rotation.z = Math.sin(t * 1.3) * 0.035
        headPivot.rotation.x = Math.sin(t * 2.6 - 0.5) * 0.025
        leftArmPivot.rotation.z = 0.06 + breath * 0.03
        rightArmPivot.rotation.z = -0.06 - breath * 0.03
        break
      }
      case "walk": {
        const phase = t * 10.5
        const stride = Math.sin(phase) * moveFactor
        const bounce = Math.abs(Math.sin(phase)) * 0.075 * moveFactor
        hipsPivot.position.y = baseHipsY + bounce
        hipsPivot.rotation.z = Math.sin(phase) * 0.055 * moveFactor
        torsoPivot.rotation.x = 0.09 * moveFactor
        headPivot.rotation.z = -Math.sin(phase) * 0.04 * moveFactor
        leftLegPivot.rotation.x = stride * 0.62
        rightLegPivot.rotation.x = -stride * 0.62
        leftArmPivot.rotation.x = -stride * 0.52
        rightArmPivot.rotation.x = stride * 0.52
        leftArmPivot.rotation.z = 0.08
        rightArmPivot.rotation.z = -0.08
        shadowDisc.scale.setScalar(1 - bounce * 1.4)
        break
      }
      case "wave": {
        const wave = Math.sin(t * 11)
        const hop = Math.abs(Math.sin(t * 4.2)) * 0.045
        hipsPivot.position.y = baseHipsY + hop
        headPivot.rotation.z = -0.1 + wave * 0.06
        headPivot.rotation.x = -0.04
        rightArmPivot.rotation.z = -2.35 + wave * 0.34
        rightArmPivot.rotation.x = -0.25
        leftArmPivot.rotation.z = 0.18
        if (ingotGroup) {
          ingotGroup.position.y = 0.35 + Math.abs(wave) * 0.04
        }
        break
      }
      case "bow": {
        // Polite rhythmic bow cycle: 3 clean bows of 0.9s each over 2.7s (peaks at 0.45s, 1.35s, 2.25s)
        const bowT = Math.max(0, t)
        const bowCycle = (bowT % 0.9) / 0.9
        const bowAmt = Math.pow(Math.sin(bowCycle * Math.PI), 1.35)
        torsoPivot.rotation.x = bowAmt * 0.58
        headPivot.rotation.x = bowAmt * 0.24
        leftArmPivot.rotation.x = -0.45 - bowAmt * 0.22
        rightArmPivot.rotation.x = -0.45 - bowAmt * 0.22
        leftArmPivot.rotation.z = -0.18
        rightArmPivot.rotation.z = 0.18
        break
      }
      case "hop": {
        // Energetic hop & stomp squash-stretch (0.52s cycle; stomp impact peaks at t=0.26s with egg shatter)
        const hopT = Math.max(0, t)
        const cycle = (hopT / 0.52) % 1
        if (cycle < 0.14) {
          const s = cycle / 0.14
          bodyPivot.scale.set(1 + s * 0.12, 1 - s * 0.16, 1 + s * 0.12)
        } else if (cycle < 0.48) {
          const u = (cycle - 0.14) / 0.34
          const jump = Math.sin(u * Math.PI)
          bodyPivot.position.y = jump * 0.44
          bodyPivot.scale.set(1 - jump * 0.08, 1 + jump * 0.12, 1 - jump * 0.08)
          leftArmPivot.rotation.z = 0.55 + jump * 0.9
          rightArmPivot.rotation.z = -0.55 - jump * 0.9
          leftLegPivot.rotation.x = -jump * 0.38
          rightLegPivot.rotation.x = jump * 0.22
          shadowDisc.scale.setScalar(Math.max(0.55, 1 - jump * 0.42))
        } else if (cycle < 0.76) {
          // Stomp impact peaks right at cycle=0.50 (t=0.26s) then rebounds cleanly
          const impact =
            cycle <= 0.5
              ? (cycle - 0.48) / 0.02
              : Math.max(0, 1 - (cycle - 0.5) / 0.26)
          bodyPivot.scale.set(
            1 + impact * 0.2,
            1 - impact * 0.26,
            1 + impact * 0.2
          )
          leftArmPivot.rotation.z = 0.32 * impact
          rightArmPivot.rotation.z = -0.32 * impact
        } else {
          const settle = Math.sin(((cycle - 0.76) / 0.24) * Math.PI)
          bodyPivot.scale.set(
            1 - settle * 0.03,
            1 + settle * 0.04,
            1 - settle * 0.03
          )
        }
        break
      }
      case "statue": {
        // Dignified stillness; subtle heroic arm poise
        leftArmPivot.rotation.z = 0.08
        rightArmPivot.rotation.z = -0.08
        break
      }
    }

    // Preserve shadow opacity consistency with dimmed state
    if (dimmedState) {
      shadowMat.opacity = 0.14
    }
  }

  const headHeight = (isThanTai ? 1.82 : spec.statueRank ? 1.98 : 1.72) * baseScale

  return {
    root,
    headHeight,
    setOutfitColor,
    setDimmed,
    update,
    dispose: () => {
      disposeObject3D(root)
    },
  }
}
