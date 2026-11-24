import * as fs from "node:fs"
import * as THREE from "three"
import { describe, expect, it } from "vitest"

import { createChibiCharacter } from "@/lib/chibi-3d/character-builder.ts"
import { computeCameraClampBounds } from "@/lib/chibi-3d/scene-host.ts"
import {
  logicalToWorld,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"
import { createChibiPortalDoor } from "@/pages/spaces/door-3d.ts"

import type { OfficeMember } from "../types.ts"
import {
  OFFICE_CAMERA_BASE_DISTANCE,
  OFFICE_CAMERA_FOV,
  OFFICE_CAMERA_NORTH_MARGIN,
  OFFICE_CAMERA_PITCH_DEG,
  OFFICE_CAMERA_SOUTH_MARGIN,
  computeOfficeCoverMinZoom,
  computeOfficeResponsiveZoom,
} from "./office-controller.ts"
import {
  MAX_STAFF_DESKS,
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_WORLD_SCALE,
  buildDeskPositions,
  getOfficeExitDoor,
} from "./office-layout.ts"
import { OfficeWorld3D } from "./office-world-3d.ts"

function countGeometryTriangles(geo: THREE.BufferGeometry): number {
  if (geo.index) return Math.floor(geo.index.count / 3)
  const pos = geo.attributes.position
  return pos ? Math.floor(pos.count / 3) : 0
}

function measureScene(
  root: THREE.Object3D,
  camera?: THREE.PerspectiveCamera
): {
  totalDrawCalls: number
  totalTriangles: number
  visibleDrawCalls: number
  visibleTriangles: number
  uniqueGeometries: number
  uniqueMaterials: number
  uniqueTextures: number
  instancedMeshes: number
} {
  root.updateMatrixWorld(true)
  let frustum: THREE.Frustum | null = null
  if (camera) {
    camera.updateMatrixWorld(true)
    const projScreen = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
    frustum = new THREE.Frustum().setFromProjectionMatrix(projScreen)
  }

  let totalDrawCalls = 0
  let totalTriangles = 0
  let visibleDrawCalls = 0
  let visibleTriangles = 0
  let instancedMeshes = 0
  const geos = new Set<THREE.BufferGeometry>()
  const mats = new Set<THREE.Material>()
  const texs = new Set<THREE.Texture>()
  const box = new THREE.Box3()
  const sphere = new THREE.Sphere()

  root.traverse((obj) => {
    if (!obj.visible) return
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    const isInst = mesh instanceof THREE.InstancedMesh
    const instanceCount = isInst ? mesh.count : 1
    if (instanceCount <= 0) return

    const tris = countGeometryTriangles(mesh.geometry) * instanceCount
    totalDrawCalls += 1
    totalTriangles += tris
    if (isInst) instancedMeshes += 1

    geos.add(mesh.geometry)
    const rawMats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    for (const m of rawMats) {
      if (!m) continue
      mats.add(m)
      const std = m as THREE.MeshStandardMaterial
      for (const t of [std.map, std.emissiveMap, std.alphaMap]) {
        if (t) texs.add(t)
      }
    }

    let inView = true
    if (frustum && mesh.frustumCulled) {
      if (isInst) {
        if (!mesh.boundingSphere) mesh.computeBoundingSphere()
        if (mesh.boundingSphere) {
          sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld)
          inView = frustum.intersectsSphere(sphere)
        }
      } else {
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
        if (mesh.geometry.boundingSphere) {
          sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld)
          inView = frustum.intersectsSphere(sphere)
        } else {
          box.setFromObject(mesh)
          inView = frustum.intersectsBox(box)
        }
      }
    }
    if (inView) {
      visibleDrawCalls += 1
      visibleTriangles += tris
    }
  })

  return {
    totalDrawCalls,
    totalTriangles,
    visibleDrawCalls,
    visibleTriangles,
    uniqueGeometries: geos.size,
    uniqueMaterials: mats.size,
    uniqueTextures: texs.size,
    instancedMeshes,
  }
}

describe("Office 3D performance budget (1440x900 default cover zoom)", () => {
  it("stays well under 260 draw calls and 700k triangles with 24 desks + exit door + avatar", () => {
    const scene = new THREE.Scene()
    const worldCfg: WorldTransformConfig = {
      logicalW: OFFICE_BASE_W,
      logicalH: OFFICE_BASE_H,
      scale: OFFICE_WORLD_SCALE,
    }
    const members: OfficeMember[] = Array.from(
      { length: MAX_STAFF_DESKS },
      (_, idx) => ({
        id: `m-${idx + 1}`,
        userId: `u-${idx + 1}`,
        role: "staff",
        displayName: `Nhân viên ${idx + 1}`,
        avatar: null,
        avatarColor: null,
        deskIndex: idx,
        accentColor: "#1D6FE8",
        online: idx < 2,
      })
    )
    const desks = buildDeskPositions(members)
    const office = new OfficeWorld3D(scene, worldCfg, false)
    office.rebuildTeamProps("Lê Huy", desks, "u-1", OFFICE_BASE_H, MAX_STAFF_DESKS)

    const door = createChibiPortalDoor({
      signText: "KHU GIAO DỊCH",
      signSubtext: "LỐI RA",
      openingWidth: 1.24,
      openingHeight: 1.72,
      frameDepth: 0.34,
      doubleSidedSign: false,
      lite: false,
    })
    const doorSpec = getOfficeExitDoor(OFFICE_BASE_H)
    const doorPt = logicalToWorld(doorSpec.x, doorSpec.y, worldCfg)
    door.group.position.set(doorPt.x, 0, doorPt.z)
    scene.add(door.group)

    const avatar = createChibiCharacter({
      avatarId: "male01",
      outfitColorHex: "#1D6FE8",
      lite: false,
    })
    const desk0 = desks[0]!
    const avPt = logicalToWorld(desk0.home.x, desk0.home.y, worldCfg)
    avatar.root.position.set(avPt.x, 0, avPt.z)
    scene.add(avatar.root)

    // 1440x900 camera at default cover zoom
    const aspect = 1440 / 900
    const coverMinZoom = computeOfficeCoverMinZoom(1440, 900)
    const defaultZoom = computeOfficeResponsiveZoom(1.0, 1440, 900, coverMinZoom)
    expect(defaultZoom).toBeGreaterThanOrEqual(coverMinZoom)

    const camera = new THREE.PerspectiveCamera(
      OFFICE_CAMERA_FOV,
      aspect,
      0.2,
      220
    )
    const pitchRad = (OFFICE_CAMERA_PITCH_DEG * Math.PI) / 180
    const bounds = computeCameraClampBounds({
      roomW: OFFICE_BASE_W * OFFICE_WORLD_SCALE,
      roomH: OFFICE_BASE_H * OFFICE_WORLD_SCALE,
      baseDistance: OFFICE_CAMERA_BASE_DISTANCE,
      zoom: defaultZoom,
      fovDeg: OFFICE_CAMERA_FOV,
      pitchRad,
      aspect,
      boundsMargin: 0.6,
      northMargin: OFFICE_CAMERA_NORTH_MARGIN,
      southMargin: OFFICE_CAMERA_SOUTH_MARGIN,
    })
    const dist = OFFICE_CAMERA_BASE_DISTANCE / defaultZoom
    const cx = Math.max(bounds.minX, Math.min(bounds.maxX, avPt.x))
    const cz = Math.max(bounds.minZ, Math.min(bounds.maxZ, avPt.z))
    camera.position.set(
      cx,
      dist * Math.sin(pitchRad),
      cz + dist * Math.cos(pitchRad)
    )
    camera.lookAt(cx, 0, cz)
    camera.updateProjectionMatrix()

    const worldOnly = measureScene(office.group, camera)
    const fullScene = measureScene(scene, camera)

    if (process.env.OFFICE_PERF_OUT) {
      fs.writeFileSync(
        process.env.OFFICE_PERF_OUT,
        JSON.stringify({ defaultZoom, coverMinZoom, worldOnly, fullScene }, null, 2)
      )
    }

    expect(worldOnly.totalDrawCalls).toBeLessThanOrEqual(245)
    expect(worldOnly.uniqueTextures).toBeLessThanOrEqual(60)
    expect(fullScene.visibleDrawCalls).toBeLessThanOrEqual(260)
    expect(fullScene.totalTriangles).toBeLessThanOrEqual(700_000)

    avatar.dispose()
    door.dispose()
    office.dispose()
  })
})
