/**
 * Boots the Procedural Chibi Three.js 3D Engine for Khu Văn phòng inside `container`.
 *
 * - Waits briefly for "Be Vietnam Pro" so procedural canvas textures (Wall Screen, Standee,
 *   Desk Nameplates, Team Banner Rug, Zone Decals) render with sharp Vietnamese glyphs.
 * - Buffers `updateTeam`, `updateOnlinePeers`, `updateAttendance`, `updateMeeting`,
 *   `updateStandee`, and `setModalOpen` calls made before async boot completes.
 * - Configures HUD-aware camera framing across desktop (`>= 1101px`), tablet (`721–1100px`),
 *   and phones (`<= 720px`) with zoom range strictly `0.55×–1.5×` (Spec §3.3).
 * - Releases the WebGL context cleanly on dispose (`renderer.forceContextLoss()`).
 * - Survives React StrictMode double-mount & reports WebGL unavailability cleanly via `onError`.
 * - Boots behind the loading screen without long stalls: architecture and desk pods are built in
 *   ~10 ms slices, shaders compile in parallel and textures upload before the visible loop starts
 *   (`host.prepare()`); `onReady` fires after the first real frame, `onProgress` reports 0..1 + stage.
 */
import * as THREE from "three"

import { yieldToMain } from "@/lib/chibi-3d/chunked-build.ts"
import {
  createChibiSceneHost,
  type ChibiSceneHost,
} from "@/lib/chibi-3d/scene-host.ts"
import {
  BOOT_RANGES,
  BOOT_STAGES,
  createBootReporter,
  phaseProgress,
  type BootProgressFn,
} from "@/pages/spaces/loading/boot-progress.ts"

import type {
  OfficeAttendanceToday,
  OfficeLeaderboard,
  OfficeMe,
  OfficeMeeting,
  OfficeOnlinePeer,
} from "../types.ts"
import {
  OFFICE_CAMERA_BASE_DISTANCE,
  OFFICE_CAMERA_FOV,
  OFFICE_CAMERA_PITCH_DEG,
  OFFICE_DEFAULT_DESKTOP_ZOOM,
  OFFICE_DEFAULT_MOBILE_ZOOM,
  OFFICE_MOBILE_BREAKPOINT_PX,
  OfficeController,
  type OfficeControllerCallbacks,
} from "./office-controller.ts"
import {
  MAX_STAFF_DESKS,
  OFFICE_WORLD_SCALE,
  computeOfficeDimensions,
} from "./office-layout.ts"
import { OfficeWorld3D } from "./office-world-3d.ts"

export interface OfficeEngineCallbacks extends OfficeControllerCallbacks {
  initialStaffCount?: number
  /** Fires once the office is built, warmed up and its first visible frame has rendered. */
  onReady?: () => void
  /** Boot progress 0..1 with a Vietnamese stage label (for the loading screen). */
  onProgress?: BootProgressFn
}

export interface OfficeEngineHandle {
  setZoomDelta: (delta: 1 | -1) => void
  updateTeam: (me: OfficeMe) => void
  updateOnlinePeers: (peers: readonly OfficeOnlinePeer[]) => void
  updateAttendance: (attendance: OfficeAttendanceToday | null) => void
  updateMeeting: (meeting: OfficeMeeting | null) => void
  updateStandee: (leaderboard: OfficeLeaderboard | null) => void
  setModalOpen: (open: boolean) => void
  resendSelfState: () => void
  beginDoorExit?: (onFadeStart: () => void) => void
  dispose: () => void
}

async function fontsReady(): Promise<void> {
  if (
    typeof document === "undefined" ||
    !("fonts" in document) ||
    typeof document.fonts?.load !== "function"
  ) {
    return
  }
  await Promise.race([
    Promise.all(
      ["600 14px", "700 18px", "800 24px"].map((weight) =>
        document.fonts.load(`${weight} "Be Vietnam Pro"`).catch(() => undefined)
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ])
}

function disposeHostAndContext(host: ChibiSceneHost): void {
  const renderer = host.renderer
  host.dispose()
  try {
    const gl =
      typeof renderer.getContext === "function" ? renderer.getContext() : null
    if (!gl || !gl.isContextLost?.()) {
      renderer.forceContextLoss()
    }
  } catch {
    // WebGL context may already be lost or unavailable (e.g. jsdom).
  }
}

export function startOffice(
  container: HTMLElement,
  callbacks: OfficeEngineCallbacks = {}
): OfficeEngineHandle {
  let disposed = false
  let host: ChibiSceneHost | null = null
  // Owned for disposal as soon as it exists; handle calls reach it only once `live` (boot finished
  // building), so a React push can never start a synchronous rebuild in the middle of the sliced one.
  let controller: OfficeController | null = null
  let live = false
  let pendingWorld: OfficeWorld3D | null = null
  const progress = createBootReporter(callbacks.onProgress)
  const isDisposed = (): boolean => disposed
  const liveController = (): OfficeController | null => (live ? controller : null)

  // Buffer pre-ready snapshots so React effects can push state immediately on mount
  const buffered: {
    team: OfficeMe | null
    peers: readonly OfficeOnlinePeer[] | null
    attendance: OfficeAttendanceToday | null | undefined
    meeting: OfficeMeeting | null | undefined
    standee: OfficeLeaderboard | null | undefined
    modalOpen: boolean
    resendSelf: boolean
  } = {
    team: null,
    peers: null,
    attendance: undefined,
    meeting: undefined,
    standee: undefined,
    modalOpen: false,
    resendSelf: false,
  }

  void (async () => {
    progress.report(BOOT_RANGES.fonts[0], BOOT_STAGES.fonts)
    await fontsReady()
    if (disposed) return
    progress.report(BOOT_RANGES.gpu[0], BOOT_STAGES.gpu)

    const staffCount = buffered.team
      ? buffered.team.members.filter((member) => member.role === "staff").length
      : (callbacks.initialStaffCount ?? MAX_STAFF_DESKS)
    const dims = computeOfficeDimensions(staffCount)
    const initialW =
      container.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 1280)
    const initialZoom =
      initialW <= OFFICE_MOBILE_BREAKPOINT_PX
        ? OFFICE_DEFAULT_MOBILE_ZOOM
        : OFFICE_DEFAULT_DESKTOP_ZOOM

    host = createChibiSceneHost({
      container,
      world: {
        logicalW: dims.width,
        logicalH: dims.height,
        scale: OFFICE_WORLD_SCALE,
      },
      backgroundHex: 0x141d32,
      fov: OFFICE_CAMERA_FOV,
      pitchDeg: OFFICE_CAMERA_PITCH_DEG,
      baseDistance: OFFICE_CAMERA_BASE_DISTANCE,
      minZoom: 0.55,
      maxZoom: 1.5,
      initialZoom,
      cameraLerp: 0.18,
      boundsMargin: 0.5,
      holdUntilPrepared: true,
      onResize: (width) => {
        controller?.handleViewportResize(width)
      },
      onContextRestored: () => {
        if (!disposed) controller?.handleContextRestored()
      },
    })

    if (disposed) {
      disposeHostAndContext(host)
      host = null
      return
    }

    // Tone mapping & warm studio lighting consistent with Khu giao dịch
    host.renderer.toneMapping = THREE.ACESFilmicToneMapping
    host.renderer.toneMappingExposure = 1.08
    host.lights.hemi.intensity = 1.22
    host.lights.sun.intensity = 1.65
    host.lights.rim.intensity = 0.72

    // Time-sliced architecture build (walls, rooms, decor) behind the loading screen.
    progress.report(BOOT_RANGES.build[0], BOOT_STAGES.officeBuild)
    pendingWorld = new OfficeWorld3D(host.scene, host.world, host.lite, {
      deferBuild: true,
    })
    const built = await pendingWorld.buildAsync({
      onProgress: (f) =>
        progress.report(phaseProgress(BOOT_RANGES.build, f), BOOT_STAGES.officeBuild),
      isCancelled: isDisposed,
    })
    if (disposed || !built) return

    progress.report(BOOT_RANGES.actors[0], BOOT_STAGES.officeActors)
    await yieldToMain()
    if (disposed) return

    controller = new OfficeController(host, container, callbacks, pendingWorld)
    pendingWorld = null
    controller.setModalOpen(buffered.modalOpen)
    // Desk pods + boss desk + team banner, time-sliced too.
    const bootTeam = buffered.team
    if (bootTeam) {
      const teamBuilt = await controller.updateTeamAsync(bootTeam, {
        onProgress: (f) =>
          progress.report(
            phaseProgress(BOOT_RANGES.actors, f),
            BOOT_STAGES.officeActors
          ),
        isCancelled: isDisposed,
      })
      if (disposed || !teamBuilt) return
    }
    live = true
    controller.setModalOpen(buffered.modalOpen)
    if (buffered.team) {
      // Same snapshot as the sliced build is a no-op for the layout; a newer one applies normally.
      if (buffered.team !== bootTeam) controller.updateTeam(buffered.team)
      buffered.resendSelf = false
    } else if (buffered.resendSelf) {
      controller.resendSelfState()
      buffered.resendSelf = false
    }
    if (buffered.peers) controller.updateOnlinePeers(buffered.peers)
    if (buffered.attendance !== undefined) {
      controller.updateAttendance(buffered.attendance)
    }
    if (buffered.meeting !== undefined) {
      controller.updateMeeting(buffered.meeting)
    }
    if (buffered.standee !== undefined) {
      controller.updateStandee(buffered.standee)
    }

    if (import.meta.env.DEV) {
      Object.assign(window, { __iqxOffice: { host, controller } })
    }

    // Parallel shader compile + texture upload + hidden shadow frame, then the visible loop starts.
    progress.report(BOOT_RANGES.lights[0], BOOT_STAGES.lights)
    await host.prepare({
      onProgress: progress.reportPrepare,
      isCancelled: isDisposed,
    })
    if (disposed) return
    await host.waitForFirstFrame()
    if (disposed) return
    progress.report(BOOT_RANGES.images[1], BOOT_STAGES.images)
    callbacks.onReady?.()
  })().catch((error: unknown) => {
    if (!disposed) callbacks.onError?.(error)
  })

  return {
    setZoomDelta: (delta) => {
      liveController()?.setZoomDelta(delta)
    },
    updateTeam: (me) => {
      buffered.team = me
      liveController()?.updateTeam(me)
    },
    updateOnlinePeers: (peers) => {
      buffered.peers = peers
      liveController()?.updateOnlinePeers(peers)
    },
    updateAttendance: (attendance) => {
      buffered.attendance = attendance
      liveController()?.updateAttendance(attendance)
    },
    updateMeeting: (meeting) => {
      buffered.meeting = meeting
      liveController()?.updateMeeting(meeting)
    },
    updateStandee: (leaderboard) => {
      buffered.standee = leaderboard
      liveController()?.updateStandee(leaderboard)
    },
    setModalOpen: (open) => {
      buffered.modalOpen = open
      liveController()?.setModalOpen(open)
    },
    resendSelfState: () => {
      const ctrl = liveController()
      if (ctrl) {
        ctrl.resendSelfState()
      } else {
        buffered.resendSelf = true
      }
    },
    beginDoorExit: (onFadeStart) => {
      const ctrl = liveController()
      if (ctrl) {
        ctrl.beginDoorExit(onFadeStart)
      } else {
        onFadeStart()
      }
    },
    dispose: () => {
      disposed = true
      live = false
      controller?.dispose()
      controller = null
      pendingWorld?.dispose()
      pendingWorld = null
      if (host) {
        disposeHostAndContext(host)
        host = null
      }
      if (import.meta.env.DEV) {
        Reflect.deleteProperty(window, "__iqxOffice")
      }
    },
  }
}
