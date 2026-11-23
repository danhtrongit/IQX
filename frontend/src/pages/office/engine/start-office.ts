/**
 * Boots the Procedural Chibi Three.js 3D Engine for Khu Văn phòng inside `container`.
 *
 * - Waits briefly for "Be Vietnam Pro" so procedural canvas textures (Wall Screen, Standee,
 *   Desk Nameplates, Zone Decals) render with sharp Vietnamese glyphs.
 * - Buffers `updateTeam`, `updateOnlinePeers`, `updateAttendance`, `updateMeeting`,
 *   `updateStandee`, and `setModalOpen` calls made before async boot completes.
 * - Survives React StrictMode double-mount & reports WebGL unavailability cleanly via `onError`.
 */
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

    host = createChibiSceneHost({
      container,
      world: {
        logicalW: dims.width,
        logicalH: dims.height,
        scale: OFFICE_WORLD_SCALE,
      },
      backgroundHex: 0x141d32,
      fov: 35,
      pitchDeg: 52,
      baseDistance: 13.8,
      minZoom: 0.55,
      maxZoom: 1.5,
      initialZoom: 1.0,
      cameraLerp: 0.18,
      boundsMargin: 0.5,
    })

    if (disposed) {
      host.dispose()
      host = null
      return
    }

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
      host?.dispose()
      host = null
      if (import.meta.env.DEV) {
        Reflect.deleteProperty(window, "__iqxOffice")
      }
    },
  }
}
