import { render } from "@testing-library/react"
import { createElement } from "react"
import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AVATARS } from "@/pages/trading-floor/net/types.ts"

import { ChibiAvatar3DPreview } from "./ChibiAvatar3DPreview.tsx"
import {
  createChibiCharacter,
  getCharacterCacheStats,
  prefersReducedMotion,
} from "./character-builder.ts"
import {
  PORTRAIT_MIN_DPR,
  renderChibiPortraitDataUrl,
} from "./portrait-renderer.ts"

function countMeshes(root: THREE.Object3D): number {
  let count = 0
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) count += 1
  })
  return count
}

function countVertices(root: THREE.Object3D): number {
  let total = 0
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) {
      const pos = mesh.geometry.getAttribute("position")
      if (pos) total += pos.count
    }
  })
  return total
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) out.push(mesh)
  })
  return out
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("chibi character graphics upgrade, caching, lite mode & reduced motion", () => {
  it("keeps every avatar, Thần Tài, boss, and statue within the merged draw-call budget (<= 40 meshes)", () => {
    const specs = [
      ...AVATARS.map((a) => ({ label: a.id, spec: { avatarId: a.id } })),
      { label: "thantai", spec: { avatarId: "thantai", isThanTai: true } },
      { label: "boss", spec: { avatarId: "male04", isBoss: true } },
      {
        label: "statue-1",
        spec: { avatarId: "female03", statueRank: 1 as const },
      },
    ]

    for (const { label, spec } of specs) {
      const rig = createChibiCharacter(spec)
      const drawCalls = countMeshes(rig.root)
      expect(
        drawCalls,
        `${label} draw calls (${drawCalls}) exceeded budget`
      ).toBeLessThanOrEqual(40)
      expect(
        drawCalls,
        `${label} draw calls (${drawCalls}) unexpectedly sparse`
      ).toBeGreaterThanOrEqual(12)
      rig.dispose()
    }

    // All ref-counted caches must drain back to 0 when every rig is disposed
    expect(getCharacterCacheStats()).toEqual({
      geometryBundles: 0,
      materialPalettes: 0,
    })
  })

  it("shares geometries and materials across instances of the same variant + color, isolates recolors/dimming, and disposes cleanly", () => {
    const rigA = createChibiCharacter({
      avatarId: "male05",
      outfitColorHex: "#2458b8",
    })
    const rigB = createChibiCharacter({
      avatarId: "male05",
      outfitColorHex: "#2458b8",
    })

    // Exact 1 shared geometry bundle & 1 shared material palette
    expect(getCharacterCacheStats()).toEqual({
      geometryBundles: 1,
      materialPalettes: 1,
    })

    const meshesA = collectMeshes(rigA.root)
    const meshesB = collectMeshes(rigB.root)
    expect(meshesA.length).toBe(meshesB.length)
    for (let i = 0; i < meshesA.length; i += 1) {
      expect(meshesA[i].geometry).toBe(meshesB[i].geometry)
      expect(meshesA[i].material).toBe(meshesB[i].material)
    }

    // Recoloring rigA acquires a new palette and NEVER mutates rigB
    rigA.setOutfitColor("#7c1f2c")
    expect(getCharacterCacheStats()).toEqual({
      geometryBundles: 1,
      materialPalettes: 2,
    })
    const hasHex = (root: THREE.Object3D, hex: string): boolean =>
      collectMeshes(root).some(
        (m) =>
          m.material instanceof THREE.MeshStandardMaterial &&
          m.material.color.getHexString() === hex
      )
    expect(hasHex(rigA.root, "7c1f2c")).toBe(true)
    expect(hasHex(rigB.root, "2458b8")).toBe(true)
    expect(hasHex(rigB.root, "7c1f2c")).toBe(false)

    // Dimming rigA isolates rigB completely
    rigA.setDimmed(true)
    const isDimmed = (root: THREE.Object3D): boolean =>
      collectMeshes(root).some(
        (m) =>
          m.material instanceof THREE.MeshStandardMaterial &&
          m.material.opacity <= 0.6 &&
          !m.userData.noShadow
      )
    expect(isDimmed(rigA.root)).toBe(true)
    expect(isDimmed(rigB.root)).toBe(false)

    // Disposing rigA keeps rigB's shared bundle & palette alive
    rigA.dispose()
    rigA.dispose() // idempotent double dispose
    expect(getCharacterCacheStats()).toEqual({
      geometryBundles: 1,
      materialPalettes: 1,
    })

    // Disposing rigB cleans up everything cleanly
    rigB.dispose()
    expect(getCharacterCacheStats()).toEqual({
      geometryBundles: 0,
      materialPalettes: 0,
    })
  })

  it("reduces vertex complexity cleanly in lite mode while preserving hair clearance & recoloring", () => {
    const full = createChibiCharacter({ avatarId: "female03", lite: false })
    const lite = createChibiCharacter({ avatarId: "female03", lite: true })

    const fullVerts = countVertices(full.root)
    const liteVerts = countVertices(lite.root)
    expect(liteVerts).toBeLessThan(fullVerts * 0.72)

    // Verify hair obstruction constraint still holds in lite mode
    lite.root.updateMatrixWorld(true)
    const hairGroup = lite.root.getObjectByName("chibi-hair")!
    const headPivot = hairGroup.parent!
    const invHead = new THREE.Matrix4().copy(headPivot.matrixWorld).invert()
    const meshToHead = new THREE.Matrix4()
    const tmp = new THREE.Vector3()
    let blocked = 0
    hairGroup.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const pos = mesh.geometry.getAttribute("position")
      meshToHead.multiplyMatrices(invHead, mesh.matrixWorld)
      for (let i = 0; i < pos.count; i += 1) {
        tmp.fromBufferAttribute(pos, i).applyMatrix4(meshToHead)
        if (
          Math.abs(tmp.x) <= 0.17 &&
          tmp.y >= -0.14 &&
          tmp.y <= 0.12 &&
          tmp.z >= 0.2
        ) {
          blocked += 1
        }
      }
    })
    expect(blocked).toBe(0)

    lite.setOutfitColor("#1d6b73")
    expect(
      collectMeshes(lite.root).some(
        (m) =>
          m.material instanceof THREE.MeshStandardMaterial &&
          m.material.color.getHexString() === "1d6b73"
      )
    ).toBe(true)

    full.dispose()
    lite.dispose()
    expect(getCharacterCacheStats()).toEqual({
      geometryBundles: 0,
      materialPalettes: 0,
    })
  })

  it("builds glasses for SACO expert (male05), advisor (female05), and owner (danhtrongit), plus blinkable 3D eyes", () => {
    for (const id of ["male05", "female05", "danhtrongit"]) {
      const rig = createChibiCharacter({ avatarId: id })
      const glasses = rig.root.getObjectByName("chibi-glasses")
      expect(glasses, `${id} should have 3D glasses`).toBeTruthy()
      const eyesPivot = rig.root.getObjectByName("chibi-face")
      expect(eyesPivot, `${id} should have blinkable eyes pivot`).toBeTruthy()
      // Verify vertex-colored jewel iris exists inside eyesPivot
      const hasVertexColorIris = collectMeshes(eyesPivot!).some((m) =>
        Boolean(m.geometry.getAttribute("color"))
      )
      expect(hasVertexColorIris).toBe(true)
      rig.dispose()
    }
  })

  it("animates periodic eye blink, idle sway, and walk bob normally, and suppresses them under prefers-reduced-motion", () => {
    // 1. Normal motion: verify idle breathing, head sway, periodic blink, and walk bounce
    const rig = createChibiCharacter({ avatarId: "female02" })
    const bodyPivot = rig.root.children[1]!
    const hipsPivot = bodyPivot.children[0]!
    const leftLegPivot = hipsPivot.children[0]!
    const torsoPivot = hipsPivot.children[2]!
    const headPivot = torsoPivot.children[2]!
    const eyesPivot = rig.root.getObjectByName("chibi-face")!
    const baseHipsY = hipsPivot.position.y

    // Sample idle across 6 seconds to observe a natural blink (< 0.35) and open eyes (1.0)
    let minEyeScaleY = 1
    let maxEyeScaleY = 0
    let maxHeadSway = 0
    for (let t = 0; t <= 6; t += 0.025) {
      rig.update(0.016, {
        anim: "idle",
        facingRad: 0,
        animTime: t,
        reducedMotion: false,
      })
      minEyeScaleY = Math.min(minEyeScaleY, eyesPivot.scale.y)
      maxEyeScaleY = Math.max(maxEyeScaleY, eyesPivot.scale.y)
      maxHeadSway = Math.max(maxHeadSway, Math.abs(headPivot.rotation.z))
    }
    expect(minEyeScaleY).toBeLessThan(0.35)
    expect(maxEyeScaleY).toBeCloseTo(1, 5)
    expect(maxHeadSway).toBeGreaterThan(0.02)

    // Normal walk has vertical body bob and strong leg swing
    rig.update(0.016, {
      anim: "walk",
      facingRad: 0,
      moveFactor: 1,
      animTime: 0.15,
      reducedMotion: false,
    })
    expect(hipsPivot.position.y).toBeGreaterThan(baseHipsY + 0.02)
    expect(Math.abs(leftLegPivot.rotation.x)).toBeGreaterThan(0.35)

    // 2. Reduced motion via window.matchMedia('(prefers-reduced-motion: reduce)')
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    })
    expect(prefersReducedMotion()).toBe(true)

    // Idle under reduced motion: no head sway, no torso breathing scale
    rig.update(0.016, { anim: "idle", facingRad: 0, animTime: 1.25 })
    expect(headPivot.rotation.z).toBe(0)
    expect(headPivot.rotation.x).toBe(0)
    expect(torsoPivot.scale.y).toBe(1)

    // Walk under reduced motion: zero vertical body bounce & zero sway, calm leg stride only
    rig.update(0.016, {
      anim: "walk",
      facingRad: 0,
      moveFactor: 1,
      animTime: 0.15,
    })
    expect(hipsPivot.position.y).toBe(baseHipsY)
    expect(hipsPivot.rotation.z).toBe(0)
    expect(headPivot.rotation.z).toBe(0)
    expect(torsoPivot.rotation.x).toBe(0)
    expect(Math.abs(leftLegPivot.rotation.x)).toBeGreaterThan(0.05)
    expect(Math.abs(leftLegPivot.rotation.x)).toBeLessThan(0.3)

    rig.dispose()
  })

  it("renders HiDPI 2x portraits cleanly at devicePixelRatio 2 with distinct hairstyles & outfits", () => {
    const originalDpr = window.devicePixelRatio
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    })

    let capturedCanvasWidth = 0
    let capturedCanvasHeight = 0
    const origCreateElement = document.createElement.bind(document)
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
      rect: () => undefined,
      roundRect: () => undefined,
      quadraticCurveTo: () => undefined,
      bezierCurveTo: () => undefined,
      fill: () => undefined,
      stroke: () => undefined,
      fillText: () => undefined,
      createLinearGradient: () => stubGrad,
      createRadialGradient: () => stubGrad,
      save: () => undefined,
      restore: () => undefined,
      scale: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
    } as unknown as CanvasRenderingContext2D

    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = origCreateElement(tag)
      if (tag === "canvas") {
        const c = el as HTMLCanvasElement
        c.getContext = (() => fakeCtx) as unknown as typeof c.getContext
        c.toDataURL = () => {
          capturedCanvasWidth = c.width
          capturedCanvasHeight = c.height
          return `data:image/png;base64,${c.width}x${c.height}`
        }
      }
      return el
    }) as typeof document.createElement)

    const url = renderChibiPortraitDataUrl("male05", "#23395d", 160)
    expect(url).toBe("data:image/png;base64,320x320")
    expect(capturedCanvasWidth).toBe(160 * PORTRAIT_MIN_DPR)
    expect(capturedCanvasHeight).toBe(160 * PORTRAIT_MIN_DPR)

    // Restore spies & check SVG fallback distinctness across all 11 avatars
    vi.restoreAllMocks()
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: originalDpr,
    })

    const svgUrls = new Set(
      AVATARS.map((a) => renderChibiPortraitDataUrl(a.id, null, 128))
    )
    expect(svgUrls.size).toBe(AVATARS.length)

    // ChibiAvatar3DPreview works cleanly with lite prop
    const { unmount } = render(
      createElement(ChibiAvatar3DPreview, {
        avatarId: "male05",
        size: 168,
        lite: true,
      })
    )
    expect(() => unmount()).not.toThrow()
  })
})
