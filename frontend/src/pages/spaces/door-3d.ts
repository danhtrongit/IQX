/**
 * Procedural 3D Chibi Portal Door builder shared between Khu giao dịch and Khu Văn phòng.
 *
 * - 100% procedural three.js (RoundedBoxGeometry + Canvas2D signage), zero external assets.
 * - Wooden + frosted-glass door leaf on a true vertical hinge pivot (`setOpenProgress(0..1)`).
 * - Sculpted walnut & gold archway frame, warm lit portal interior, welcome mat, brass lever handle
 *   on both sides, overhead framed Vietnamese sign ("VĂN PHÒNG NHÓM" / "KHU GIAO DỊCH"), warm brass
 *   sconce light, and animated glowing golden arrow beacon.
 * - Respects `lite` mode (fewer geometry segments) and `reducedMotion` (static beacon).
 * - Full GPU resource cleanup via `dispose()`.
 */
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

import { safeGet2DContext } from "@/lib/chibi-3d/textures.ts"
import {
  createGlowMaterial,
  createMatteMaterial,
  createMetalMaterial,
  disposeObject3D,
} from "@/lib/chibi-3d/types.ts"

const FONT_STACK =
  '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const MAX_OPEN_RAD = (100 * Math.PI) / 180

export interface ChibiPortalDoorOptions {
  /** Primary sign text above the door, e.g. "VĂN PHÒNG NHÓM" or "KHU GIAO DỊCH". */
  signText: string
  /** Optional eyebrow/subtext on the sign plaque. */
  signSubtext?: string
  /** Inner doorway width in Three.js world units. */
  openingWidth?: number
  /** Inner doorway height in Three.js world units. */
  openingHeight?: number
  /** Architectural frame depth in Three.js world units. */
  frameDepth?: number
  /** Accent hex color for the glowing arrow & doorway glow. */
  accentHex?: string
  /** Lower segment count for mobile/lite devices. */
  lite?: boolean
  /** Mount sign faces on both front (+Z) and back (-Z) sides for cutaway south walls. */
  doubleSidedSign?: boolean
}

export interface ChibiPortalDoor {
  readonly group: THREE.Group
  readonly hitTarget: THREE.Object3D
  readonly setOpenProgress: (progress: number) => void
  readonly getOpenProgress: () => number
  readonly update: (
    dt: number,
    elapsedS: number,
    reducedMotion: boolean
  ) => void
  readonly dispose: () => void
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t)
  return 1 - u * u * u
}

function createRoundedGeo(
  w: number,
  h: number,
  d: number,
  radius: number,
  lite: boolean
): THREE.BufferGeometry {
  const safeR = Math.max(0.004, Math.min(radius, Math.min(w, h, d) * 0.38))
  return new RoundedBoxGeometry(w, h, d, lite ? 1 : 2, safeR)
}

function createDoorSignTexture(
  title: string,
  subtext: string | undefined,
  accentHex: string,
  lite: boolean
): THREE.Texture {
  const width = lite ? 384 : 512
  const height = lite ? 128 : 168
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = safeGet2DContext(canvas)

  if (!ctx) {
    const fallback = new THREE.DataTexture(
      new Uint8Array([21, 37, 70, 255]),
      1,
      1,
      THREE.RGBAFormat
    )
    fallback.colorSpace = THREE.SRGBColorSpace
    fallback.needsUpdate = true
    return fallback
  }

  // Deep IQX navy background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height)
  grad.addColorStop(0, "#192d57")
  grad.addColorStop(0.55, "#112040")
  grad.addColorStop(1, "#0c162e")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  // Soft warm gold glow across top edge
  const glow = ctx.createRadialGradient(
    width / 2,
    height * 0.25,
    8,
    width / 2,
    height * 0.45,
    width * 0.48
  )
  glow.addColorStop(0, "rgba(246, 210, 122, 0.22)")
  glow.addColorStop(1, "rgba(246, 210, 122, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // Double gold plaque border
  const pad = Math.round(height * 0.08)
  ctx.strokeStyle = accentHex
  ctx.lineWidth = Math.max(3, Math.round(height * 0.04))
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2)

  const innerPad = pad + Math.round(height * 0.06)
  ctx.strokeStyle = "rgba(246, 210, 122, 0.38)"
  ctx.lineWidth = 1.5
  ctx.strokeRect(
    innerPad,
    innerPad,
    width - innerPad * 2,
    height - innerPad * 2
  )

  // Corner brass rivets
  ctx.fillStyle = accentHex
  const rivet = Math.max(3, height * 0.025)
  for (const rx of [innerPad + 8, width - innerPad - 8]) {
    for (const ry of [innerPad + 8, height - innerPad - 8]) {
      ctx.beginPath()
      ctx.arc(rx, ry, rivet, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  if (subtext) {
    ctx.fillStyle = accentHex
    ctx.font = `700 ${Math.round(height * 0.145)}px ${FONT_STACK}`
    ctx.fillText(subtext.toUpperCase(), width / 2, height * 0.3)
  }

  // Fit headline text crisply inside sign width
  const maxTextW = width - innerPad * 2 - 28
  let fontSize = Math.round(height * (subtext ? 0.29 : 0.33))
  ctx.font = `800 ${fontSize}px ${FONT_STACK}`
  while (fontSize > 14 && ctx.measureText(title).width > maxTextW) {
    fontSize -= 2
    ctx.font = `800 ${fontSize}px ${FONT_STACK}`
  }

  ctx.fillStyle = "#f1f5f9"
  ctx.fillText(title, width / 2, height * (subtext ? 0.65 : 0.52), maxTextW)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = lite ? 2 : 8
  tex.needsUpdate = true
  return tex
}

/**
 * Builds a complete chibi-style wooden/glass portal door facing `+Z` in local space.
 * Position & rotate `door.group` onto any room wall; raycast against `door.hitTarget`.
 */
export function createChibiPortalDoor(
  options: ChibiPortalDoorOptions
): ChibiPortalDoor {
  const lite = options.lite ?? false
  const openW = options.openingWidth ?? 1.18
  const openH = options.openingHeight ?? 1.72
  const frameD = options.frameDepth ?? 0.34
  const accentHex = options.accentHex ?? "#f6d27a"
  const doubleSidedSign = options.doubleSidedSign ?? false

  const jambW = 0.16
  const lintelH = 0.2
  const totalW = openW + jambW * 2
  const totalH = openH + lintelH
  const segs = lite ? 8 : 14

  const group = new THREE.Group()
  group.name = "chibi-portal-door"

  // Materials
  const walnutMat = createMatteMaterial("#6b442a", {
    roughness: 0.56,
    metalness: 0.06,
  })
  const woodDarkMat = createMatteMaterial("#4a2d1b", {
    roughness: 0.62,
    metalness: 0.05,
  })
  const leafWoodMat = createMatteMaterial("#8a5a38", {
    roughness: 0.52,
    metalness: 0.05,
  })
  const leafPanelMat = createMatteMaterial("#72472b", {
    roughness: 0.58,
    metalness: 0.05,
  })
  const navyMat = createMatteMaterial("#152546", {
    roughness: 0.48,
    metalness: 0.12,
  })
  const goldMat = createMetalMaterial("#e9b949", {
    roughness: 0.25,
    metalness: 0.82,
  })
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#cde6ff",
    emissive: "#6bb4ff",
    emissiveIntensity: 0.18,
    roughness: 0.16,
    metalness: 0.12,
    transparent: true,
    opacity: 0.52,
  })
  const portalGlowMat = createGlowMaterial(
    "#ffe4a8",
    0.72,
    doubleSidedSign ? 0.14 : 0.96
  )
  if (doubleSidedSign) {
    portalGlowMat.side = THREE.DoubleSide
    portalGlowMat.depthWrite = false
  }
  const lampGlowMat = createGlowMaterial("#fff0be", 1.15)
  const arrowGlowMat = createGlowMaterial(accentHex, 1.05)

  // 1. Frame: left/right rounded jambs, navy plinths, gold capitals, top lintel & crown
  const plinthGeo = createRoundedGeo(
    jambW + 0.06,
    0.22,
    frameD + 0.08,
    0.025,
    lite
  )
  const jambGeo = createRoundedGeo(jambW, openH, frameD, 0.03, lite)
  const goldRingGeo = createRoundedGeo(
    jambW + 0.05,
    0.06,
    frameD + 0.06,
    0.015,
    lite
  )
  for (const side of [-1, 1] as const) {
    const jx = side * (openW / 2 + jambW / 2)

    const plinth = new THREE.Mesh(plinthGeo, navyMat)
    plinth.position.set(jx, 0.11, 0)
    plinth.castShadow = !lite
    plinth.receiveShadow = true
    group.add(plinth)

    const jamb = new THREE.Mesh(jambGeo, walnutMat)
    jamb.position.set(jx, openH / 2, 0)
    jamb.castShadow = !lite
    jamb.receiveShadow = true
    group.add(jamb)

    const goldRing = new THREE.Mesh(goldRingGeo, goldMat)
    goldRing.position.set(jx, openH - 0.02, 0)
    group.add(goldRing)
  }

  const lintel = new THREE.Mesh(
    createRoundedGeo(totalW + 0.12, lintelH, frameD + 0.08, 0.04, lite),
    walnutMat
  )
  lintel.position.set(0, openH + lintelH / 2, 0)
  lintel.castShadow = !lite
  lintel.receiveShadow = true
  group.add(lintel)

  const crown = new THREE.Mesh(
    createRoundedGeo(totalW + 0.18, 0.055, frameD + 0.12, 0.02, lite),
    goldMat
  )
  crown.position.set(0, totalH + 0.02, 0)
  group.add(crown)

  // Brass threshold plate + cozy welcome mat extending into +Z
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(openW + 0.06, 0.026, frameD + 0.08),
    goldMat
  )
  threshold.position.set(0, 0.013, 0)
  threshold.receiveShadow = true
  group.add(threshold)

  const matBase = new THREE.Mesh(
    createRoundedGeo(openW + 0.16, 0.02, 0.56, 0.01, lite),
    navyMat
  )
  matBase.position.set(0, 0.01, frameD / 2 + 0.3)
  matBase.receiveShadow = true
  group.add(matBase)

  const matBorder = new THREE.Mesh(
    new THREE.BoxGeometry(openW + 0.04, 0.023, 0.44),
    goldMat
  )
  matBorder.position.set(0, 0.011, frameD / 2 + 0.3)
  group.add(matBorder)

  const matInner = new THREE.Mesh(
    new THREE.BoxGeometry(openW - 0.04, 0.025, 0.36),
    navyMat
  )
  matInner.position.set(0, 0.012, frameD / 2 + 0.3)
  group.add(matInner)

  // 2. Warm glowing portal interior backdrop (revealed as the door leaf swings open).
  // Cutaway South-wall doors (`doubleSidedSign`) omit the opaque outer back-cap so the wooden/glass
  // door leaf, brass handle, and glowing open portal remain unobstructed from the camera side (-Z).
  const portalBack = new THREE.Mesh(
    new THREE.PlaneGeometry(openW - 0.02, openH - 0.02),
    portalGlowMat
  )
  portalBack.name = "door-portal-glow"
  portalBack.position.set(0, openH / 2, -frameD * 0.24)
  group.add(portalBack)

  if (!doubleSidedSign) {
    // Solid dark outer back-cap behind portal glow for full-height side walls
    const portalOuterCap = new THREE.Mesh(
      new THREE.PlaneGeometry(openW + 0.02, openH + 0.02),
      woodDarkMat
    )
    portalOuterCap.name = "door-outer-cap"
    portalOuterCap.rotation.y = Math.PI
    portalOuterCap.position.set(0, openH / 2, -frameD * 0.32)
    group.add(portalOuterCap)
  }

  // 3. Animated Door Leaf on a vertical hinge pivot at the +X jamb (swings into +Z cleanly)
  const leafW = openW - 0.04
  const leafH = openH - 0.04
  const leafD = 0.075
  const lowerPanelH = leafH * 0.46
  const glassH = leafH * 0.41
  const glassW = leafW - 0.22
  const glassCenterY = lowerPanelH + glassH / 2 + 0.03

  const hingePivot = new THREE.Group()
  hingePivot.name = "door-hinge-pivot"
  hingePivot.position.set(openW / 2 - 0.02, 0, frameD * 0.14)
  group.add(hingePivot)

  // Solid lower wood half + side/top stiles around frosted glass upper half
  const lowerLeaf = new THREE.Mesh(
    createRoundedGeo(leafW, lowerPanelH, leafD, 0.018, lite),
    leafWoodMat
  )
  lowerLeaf.position.set(-leafW / 2, lowerPanelH / 2 + 0.02, 0)
  lowerLeaf.castShadow = !lite
  lowerLeaf.receiveShadow = true
  hingePivot.add(lowerLeaf)

  // Raised decorative recessed panel on both front & back of lower leaf
  const insetGeo = createRoundedGeo(
    leafW - 0.24,
    lowerPanelH - 0.22,
    0.02,
    0.01,
    lite
  )
  for (const faceSign of [-1, 1] as const) {
    const inset = new THREE.Mesh(insetGeo, leafPanelMat)
    inset.position.set(
      -leafW / 2,
      lowerPanelH / 2 + 0.02,
      faceSign * (leafD / 2 + 0.005)
    )
    hingePivot.add(inset)
  }

  // Left & right upper wooden stiles flanking the glass window
  const stileW = (leafW - glassW) / 2
  const upperH = leafH - lowerPanelH
  const stileGeo = createRoundedGeo(stileW, upperH, leafD, 0.014, lite)
  for (const sx of [-stileW / 2, -(leafW - stileW / 2)]) {
    const stile = new THREE.Mesh(stileGeo, leafWoodMat)
    stile.position.set(sx, lowerPanelH + upperH / 2 + 0.02, 0)
    stile.castShadow = !lite
    hingePivot.add(stile)
  }

  // Top rail above glass window
  const topRailH = Math.max(0.1, leafH - lowerPanelH - glassH - 0.03)
  const topRail = new THREE.Mesh(
    createRoundedGeo(glassW + 0.04, topRailH, leafD, 0.014, lite),
    leafWoodMat
  )
  topRail.position.set(-leafW / 2, leafH - topRailH / 2 + 0.02, 0)
  hingePivot.add(topRail)

  // Frosted glass pane + crisp wooden cross-mullions
  const glassPane = new THREE.Mesh(
    new THREE.BoxGeometry(glassW, glassH, leafD * 0.35),
    glassMat
  )
  glassPane.position.set(-leafW / 2, glassCenterY, 0)
  hingePivot.add(glassPane)

  const mullionV = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, glassH, leafD * 0.72),
    woodDarkMat
  )
  mullionV.position.set(-leafW / 2, glassCenterY, 0)
  hingePivot.add(mullionV)

  const mullionH = new THREE.Mesh(
    new THREE.BoxGeometry(glassW, 0.036, leafD * 0.72),
    woodDarkMat
  )
  mullionH.position.set(-leafW / 2, glassCenterY, 0)
  hingePivot.add(mullionH)

  // Brass hinges along pivot edge
  const hingeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.11, segs)
  for (const hy of [0.36, leafH - 0.36]) {
    const hinge = new THREE.Mesh(hingeGeo, goldMat)
    hinge.position.set(0.01, hy, leafD * 0.45)
    hingePivot.add(hinge)
  }

  // Brass push-plate + chibi lever handle on both front (+Z) and back (-Z) faces
  const handleX = -leafW + 0.15
  const handleY = lowerPanelH + 0.02
  const plateGeo = createRoundedGeo(0.08, 0.22, 0.02, 0.008, lite)
  const stemGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.07, segs)
  const leverGeo = createRoundedGeo(0.14, 0.036, 0.034, 0.012, lite)
  for (const faceSign of [-1, 1] as const) {
    const plate = new THREE.Mesh(plateGeo, goldMat)
    plate.position.set(handleX, handleY, faceSign * (leafD / 2 + 0.01))
    hingePivot.add(plate)

    const stem = new THREE.Mesh(stemGeo, goldMat)
    stem.rotation.x = Math.PI / 2
    stem.position.set(handleX, handleY, faceSign * (leafD / 2 + 0.045))
    hingePivot.add(stem)

    const lever = new THREE.Mesh(leverGeo, goldMat)
    lever.position.set(handleX + 0.055, handleY, faceSign * (leafD / 2 + 0.075))
    hingePivot.add(lever)
  }

  // 4. Overhead Framed Sign ("VĂN PHÒNG NHÓM" / "KHU GIAO DỊCH")
  const signW = Math.max(1.54, totalW * 1.06)
  const signH = 0.48
  const signD = 0.09
  const signCenterY = totalH + 0.34

  // Twin brass stanchions connecting crown to sign frame
  const postGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.22, segs)
  for (const sx of [-signW * 0.32, signW * 0.32]) {
    const post = new THREE.Mesh(postGeo, goldMat)
    post.position.set(sx, totalH + 0.12, 0)
    group.add(post)
  }

  const signBox = new THREE.Mesh(
    createRoundedGeo(signW + 0.08, signH + 0.07, signD, 0.028, lite),
    goldMat
  )
  signBox.position.set(0, signCenterY, 0)
  signBox.castShadow = !lite
  group.add(signBox)

  const signTexture = createDoorSignTexture(
    options.signText,
    options.signSubtext,
    accentHex,
    lite
  )
  const signFaceMat = new THREE.MeshStandardMaterial({
    map: signTexture,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: signTexture,
    emissiveIntensity: 0.35,
    roughness: 0.34,
    metalness: 0.06,
  })

  const signFaceGeo = new THREE.PlaneGeometry(signW, signH)
  const signFront = new THREE.Mesh(signFaceGeo, signFaceMat)
  signFront.position.set(0, signCenterY, signD / 2 + 0.006)
  group.add(signFront)

  if (doubleSidedSign) {
    const signBack = new THREE.Mesh(signFaceGeo, signFaceMat)
    signBack.rotation.y = Math.PI
    signBack.position.set(0, signCenterY, -(signD / 2 + 0.006))
    group.add(signBack)
  }

  // 5. Overhead warm brass doorway sconce lamp(s) + floating glowing arrow beacon
  const lampGeo = new THREE.SphereGeometry(0.075, segs, segs)
  const lampOrb = new THREE.Mesh(lampGeo, lampGlowMat)
  lampOrb.name = "door-sconce-front"
  lampOrb.position.set(0, openH + lintelH * 0.45, frameD / 2 + 0.08)
  group.add(lampOrb)

  if (doubleSidedSign) {
    const lampOrbBack = new THREE.Mesh(lampGeo, lampGlowMat)
    lampOrbBack.name = "door-sconce-back"
    lampOrbBack.position.set(0, openH + lintelH * 0.45, -(frameD / 2 + 0.08))
    group.add(lampOrbBack)
  }

  const beaconGroup = new THREE.Group()
  beaconGroup.name = "door-arrow-beacon"
  const beaconBaseY = signCenterY + signH / 2 + 0.24
  beaconGroup.position.set(0, beaconBaseY, 0.06)
  group.add(beaconGroup)

  const arrowCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.2, lite ? 4 : 8),
    arrowGlowMat
  )
  arrowCone.rotation.x = Math.PI // points down toward the doorway
  beaconGroup.add(arrowCone)

  const arrowStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.12, lite ? 4 : 8),
    arrowGlowMat
  )
  arrowStem.position.set(0, 0.14, 0)
  beaconGroup.add(arrowStem)

  // 6. Invisible click/tap hit target spanning doorway & sign (transparent + opacity 0 so Raycaster hits it)
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const hitTarget = new THREE.Mesh(
    new THREE.BoxGeometry(totalW + 0.35, totalH + 0.85, frameD + 0.65),
    hitMat
  )
  hitTarget.name = "chibi-portal-door-hit"
  hitTarget.position.set(0, (totalH + 0.75) / 2, 0.1)
  group.add(hitTarget)

  let openProgress = 0
  let disposed = false

  const setOpenProgress = (progress: number): void => {
    openProgress = clamp01(progress)
    const eased = easeOutCubic(openProgress)
    hingePivot.rotation.y = eased * MAX_OPEN_RAD
    portalGlowMat.emissiveIntensity = 0.68 + eased * 0.62
    if (doubleSidedSign) {
      portalGlowMat.opacity = 0.14 + eased * 0.56
    }
  }

  const update = (
    _dt: number,
    elapsedS: number,
    reducedMotion: boolean
  ): void => {
    if (disposed) return
    if (reducedMotion) {
      beaconGroup.position.y = beaconBaseY
      beaconGroup.rotation.y = 0
      arrowGlowMat.emissiveIntensity = 0.95
      lampGlowMat.emissiveIntensity = 1.05
      return
    }
    const wave = Math.sin(elapsedS * 3.1)
    beaconGroup.position.y = beaconBaseY + wave * 0.065
    beaconGroup.rotation.y = elapsedS * 1.15
    arrowGlowMat.emissiveIntensity = 0.9 + 0.35 * (0.5 + 0.5 * wave)
    lampGlowMat.emissiveIntensity = 1.0 + 0.18 * Math.sin(elapsedS * 2.2)
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    disposeObject3D(group)
    signTexture.dispose()
  }

  return {
    group,
    hitTarget,
    setOpenProgress,
    getOpenProgress: () => openProgress,
    update,
    dispose,
  }
}
