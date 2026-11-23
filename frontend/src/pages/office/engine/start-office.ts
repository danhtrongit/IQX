/**
 * Boots the Procedural Chibi Three.js 3D Engine for Khu Văn phòng inside `container`.
 *
 * - Waits briefly for "Be Vietnam Pro" so procedural canvas textures (Wall Screen, Standee,
 *   Desk Nameplates, Zone Decals) render with sharp Vietnamese glyphs.
 * - Buffers `updateTeam`, `updateOnlinePeers`, `updateAttendance`, `updateMeeting`,
 *   `updateStandee`, and `setModalOpen` calls made before async boot completes.
 * - Configures camera framing so desktop fills the viewport cleanly with the office at 1.0x
 *   and phones center closely on the player; zoom range stays 0.55x–1.5x (Spec §3.3).
 * - Releases the WebGL context cleanly on dispose (`renderer.forceContextLoss()`).
 * - Survives React StrictMode double-mount & reports WebGL unavailability cleanly via `onError`.
 */
import * as THREE from "three"

import {
  createChibiSceneHost,
  type ChibiSceneHost,
} from "@/lib/chibi-3d/scene-host.ts"

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
  OFFICE_WORLD_SCALE,
  computeOfficeDimensions,
} from "./office-layout.ts"

export interface OfficeEngineCallbacks extends OfficeControllerCallbacks {
  initialStaffCount?: number
  onReady?: () => void
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
  let controller: OfficeController | null = null

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
    await fontsReady()
    if (disposed) return

    const staffCount = buffered.team
      ? buffered.team.members.filter((member) => member.role === "staff").length
      : (callbacks.initialStaffCount ?? 11)
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
      onResize: (width) => {
        controller?.handleViewportResize(width)
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

    controller = new OfficeController(host, container, callbacks)
    controller.setModalOpen(buffered.modalOpen)
    if (buffered.team) {
      controller.updateTeam(buffered.team)
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

    callbacks.onReady?.()

    if (import.meta.env.DEV) {
      Object.assign(window, { __iqxOffice: { host, controller } })
    }
  })().catch((error: unknown) => {
    if (!disposed) callbacks.onError?.(error)
  })

  return {
    setZoomDelta: (delta) => {
      controller?.setZoomDelta(delta)
    },
    updateTeam: (me) => {
      buffered.team = me
      controller?.updateTeam(me)
    },
    updateOnlinePeers: (peers) => {
      buffered.peers = peers
      controller?.updateOnlinePeers(peers)
    },
    updateAttendance: (attendance) => {
      buffered.attendance = attendance
      controller?.updateAttendance(attendance)
    },
    updateMeeting: (meeting) => {
      buffered.meeting = meeting
      controller?.updateMeeting(meeting)
    },
    updateStandee: (leaderboard) => {
      buffered.standee = leaderboard
      controller?.updateStandee(leaderboard)
    },
    setModalOpen: (open) => {
      buffered.modalOpen = open
      controller?.setModalOpen(open)
    },
    resendSelfState: () => {
      if (controller) {
        controller.resendSelfState()
      } else {
        buffered.resendSelf = true
      }
    },
    dispose: () => {
      disposed = true
      controller?.dispose()
      controller = null
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
