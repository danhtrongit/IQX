/**
 * Single-route shell (`/khu-giao-dich`) owning both Khu giao dịch and Khu Văn phòng (`?phong=van-phong`).
 *
 * - Switching rooms tears down the previous room completely (stopping its render loop, disposing its
 *   WebGL scene host with `forceContextLoss`, closing its socket and pollers) before booting the next,
 *   while keeping shared chibi-3d module caches alive across the switch.
 * - Orchestrates door walk + swing + fade-to-dark + short loading veil + spawn-inside-door + fade-in
 *   (and quick cross-fade only under `prefers-reduced-motion`).
 * - Enforces Floor -> Office access rules (guest LoginPrompt / cached `officeKeys.me()` non-member toast).
 * - Uses `pushState` (`replace: false`) on room changes so browser Back/Forward works cleanly.
 */
import { useQueryClient } from "@tanstack/react-query"
import { DoorOpen } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import { officeApi } from "@/pages/office/api.ts"
import { officeKeys } from "@/pages/office/hooks.ts"
import { OfficePage } from "@/pages/office/office-page.tsx"
import { needLogin, toast, ui } from "@/pages/trading-floor/bridge.ts"
import { TradingFloorPage } from "@/pages/trading-floor/trading-floor-page.tsx"

import {
  DOOR_FADE_IN_MS,
  DOOR_FADE_OUT_MS,
  DOOR_REDUCED_FADE_MS,
  FLOOR_GUEST_OFFICE_PROMPT,
  OFFICE_NON_MEMBER_TOAST,
  prefersReducedMotion,
  type RoomDoorHandle,
} from "./door-transition.ts"
import { buildSpaceUrl, resolveSpaceRoom, type SpaceRoom } from "./spaces-url.ts"
import "./spaces.css"

type VeilPhase = "idle" | "to-dark" | "switching" | "to-clear"

const ROOM_HANDOFF_DELAY_MS = 24
const REVEAL_SAFETY_TIMEOUT_MS = 900

export function SpacesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isAuthenticated } = useAuth()

  const urlRoom = resolveSpaceRoom(searchParams)
  const [mountedRoom, setMountedRoom] = useState<SpaceRoom | null>(urlRoom)
  const [veilPhase, setVeilPhase] = useState<VeilPhase>("idle")
  const [veilTarget, setVeilTarget] = useState<SpaceRoom>(urlRoom)
  const [veilReduced, setVeilReduced] = useState(false)
  const [arrival, setArrival] = useState<{
    room: SpaceRoom
    viaDoor: boolean
    nonce: number
  } | null>(null)

  const floorDoorHandleRef = useRef<RoomDoorHandle | null>(null)
  const officeDoorHandleRef = useRef<RoomDoorHandle | null>(null)
  const transitioningRef = useRef(false)
  const accessCheckRef = useRef(false)
  const lastCheckedUserIdRef = useRef<string | null>(null)
  const pendingTargetRef = useRef<SpaceRoom | null>(null)
  const veilPhaseRef = useRef<VeilPhase>("idle")
  const mountedRef = useRef(true)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const arrivalNonceRef = useRef(0)

  const updateVeilPhase = useCallback((next: VeilPhase) => {
    veilPhaseRef.current = next
    setVeilPhase(next)
  }, [])

  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      clearTimeout(id)
    }
    timersRef.current.clear()
  }, [])

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id)
      if (mountedRef.current) fn()
    }, ms)
    timersRef.current.add(id)
    return id
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearAllTimers()
    }
  }, [clearAllTimers])

  const revealRoom = useCallback(() => {
    clearAllTimers()
    const reduced = prefersReducedMotion()
    const fadeInMs = reduced ? DOOR_REDUCED_FADE_MS : DOOR_FADE_IN_MS
    // New room is already mounted & interactive as the veil clears; allow immediate next action.
    transitioningRef.current = false
    pendingTargetRef.current = null
    setVeilReduced(reduced)
    updateVeilPhase("to-clear")
    schedule(() => {
      updateVeilPhase("idle")
    }, fadeInMs)
  }, [clearAllTimers, schedule, updateVeilPhase])

  const handleRoomReady = useCallback(() => {
    if (veilPhaseRef.current === "switching") {
      revealRoom()
    }
  }, [revealRoom])

  const unmountAndBootRoom = useCallback(
    (targetRoom: SpaceRoom, viaDoor: boolean, pushHistory: boolean) => {
      clearAllTimers()
      const reduced = prefersReducedMotion()
      setVeilReduced(reduced)
      setVeilTarget(targetRoom)
      updateVeilPhase("switching")
      pendingTargetRef.current = targetRoom
      transitioningRef.current = true

      // 1. Unmount current room completely so its WebGL context, rAF, sockets & pollers dispose cleanly.
      setMountedRoom(null)

      if (pushHistory) {
        navigate(buildSpaceUrl(targetRoom), { replace: false })
      }

      // 2. Mount next room after unmount commits so zero WebGL contexts overlap across the switch.
      schedule(() => {
        arrivalNonceRef.current += 1
        setArrival({
          room: targetRoom,
          viaDoor: viaDoor && !reduced,
          nonce: arrivalNonceRef.current,
        })
        setMountedRoom(targetRoom)
        // Safety fallback so veil always clears even if a gate or fallback UI skips onRoomReady.
        schedule(() => {
          if (veilPhaseRef.current === "switching") {
            revealRoom()
          }
        }, REVEAL_SAFETY_TIMEOUT_MS)
      }, ROOM_HANDOFF_DELAY_MS)
    },
    [clearAllTimers, navigate, revealRoom, schedule, updateVeilPhase]
  )

  const beginFadeAndSwitch = useCallback(
    (targetRoom: SpaceRoom, viaDoor: boolean) => {
      clearAllTimers()
      const reduced = prefersReducedMotion()
      const fadeOutMs = reduced ? DOOR_REDUCED_FADE_MS : DOOR_FADE_OUT_MS
      transitioningRef.current = true
      pendingTargetRef.current = targetRoom
      setVeilReduced(reduced)
      setVeilTarget(targetRoom)
      updateVeilPhase("to-dark")

      schedule(() => {
        unmountAndBootRoom(targetRoom, viaDoor, true)
      }, fadeOutMs)
    },
    [clearAllTimers, schedule, unmountAndBootRoom, updateVeilPhase]
  )

  // Synchronize external URL changes (browser Back/Forward, Header link, Notification Bell).
  useEffect(() => {
    if (urlRoom === mountedRoom || urlRoom === pendingTargetRef.current) {
      return
    }
    unmountAndBootRoom(urlRoom, false, false)
  }, [mountedRoom, unmountAndBootRoom, urlRoom])

  // Floor -> Office access check & transition trigger
  const handleRequestOffice = useCallback(async () => {
    if (transitioningRef.current || accessCheckRef.current) return

    if (!isAuthenticated || !user) {
      if (!needLogin(FLOOR_GUEST_OFFICE_PROMPT)) {
        ui.loginPrompt.set(FLOOR_GUEST_OFFICE_PROMPT)
      }
      return
    }

    accessCheckRef.current = true
    try {
      if (
        lastCheckedUserIdRef.current !== null &&
        lastCheckedUserIdRef.current !== user.id
      ) {
        queryClient.removeQueries({ queryKey: officeKeys.me() })
      }
      lastCheckedUserIdRef.current = user.id

      const me = await queryClient.fetchQuery({
        queryKey: officeKeys.me(),
        queryFn: ({ signal }) => officeApi.me(signal),
        staleTime: 20_000,
      })
      if (!mountedRef.current) return

      if (!me || !me.member || !me.self || !me.team) {
        toast(OFFICE_NON_MEMBER_TOAST, "warn", 5000)
        return
      }

      if (floorDoorHandleRef.current) {
        transitioningRef.current = true
        floorDoorHandleRef.current.beginDoorExit(() => {
          beginFadeAndSwitch("office", true)
        })
      } else {
        beginFadeAndSwitch("office", false)
      }
    } catch (error) {
      if (!mountedRef.current) return
      if (error instanceof ApiError && error.status === 401) {
        ui.loginPrompt.set(FLOOR_GUEST_OFFICE_PROMPT)
      } else {
        toast(
          "Không kiểm tra được quyền vào Văn phòng nhóm. Vui lòng thử lại.",
          "warn",
          4200
        )
      }
    } finally {
      accessCheckRef.current = false
    }
  }, [beginFadeAndSwitch, isAuthenticated, queryClient, user])

  // Office -> Floor transition trigger
  const handleRequestTradingFloor = useCallback(
    (viaDoor = true) => {
      if (transitioningRef.current) return
      if (viaDoor && officeDoorHandleRef.current) {
        transitioningRef.current = true
        officeDoorHandleRef.current.beginDoorExit(() => {
          beginFadeAndSwitch("floor", true)
        })
      } else {
        beginFadeAndSwitch("floor", false)
      }
    },
    [beginFadeAndSwitch]
  )

  const handleFloorDoorHandle = useCallback((handle: RoomDoorHandle | null) => {
    floorDoorHandleRef.current = handle
  }, [])

  const handleOfficeDoorHandle = useCallback(
    (handle: RoomDoorHandle | null) => {
      officeDoorHandleRef.current = handle
    },
    []
  )

  const floorArrivedViaDoor = Boolean(
    arrival && arrival.room === "floor" && arrival.viaDoor
  )
  const officeArrivedViaDoor = Boolean(
    arrival && arrival.room === "office" && arrival.viaDoor
  )

  const veilVisible = veilPhase !== "idle"
  const veilClass = [
    "sp-veil",
    veilPhase === "to-dark" || veilPhase === "switching" ? "is-dark" : "",
    veilPhase === "to-clear" ? "is-fading-in" : "",
    veilReduced ? "is-reduced" : "",
  ]
    .filter(Boolean)
    .join(" ")

  const veilTitle =
    veilTarget === "office"
      ? "Đang bước vào Văn phòng nhóm…"
      : "Đang quay về Khu Giao Dịch…"

  return (
    <div
      className="sp-shell"
      data-testid="spaces-shell"
      data-space-room={mountedRoom ?? "switching"}
    >
      {mountedRoom === "floor" && (
        <TradingFloorPage
          key={`floor-${arrival?.room === "floor" ? arrival.nonce : 0}`}
          arrivedViaDoor={floorArrivedViaDoor}
          onRequestOffice={() => {
            void handleRequestOffice()
          }}
          onRoomReady={handleRoomReady}
          onDoorHandleReady={handleFloorDoorHandle}
        />
      )}

      {mountedRoom === "office" && (
        <OfficePage
          key={`office-${arrival?.room === "office" ? arrival.nonce : 0}`}
          arrivedViaDoor={officeArrivedViaDoor}
          onRequestTradingFloor={handleRequestTradingFloor}
          onRoomReady={handleRoomReady}
          onDoorHandleReady={handleOfficeDoorHandle}
        />
      )}

      {veilVisible && (
        <div
          className={veilClass}
          role="status"
          aria-live="polite"
          data-testid="spaces-transition-veil"
        >
          <div className="sp-veil-icon" aria-hidden="true">
            <DoorOpen size={26} />
          </div>
          <p className="sp-veil-title">{veilTitle}</p>
          <p className="sp-veil-sub">IQX · Không gian 3D</p>
        </div>
      )}
    </div>
  )
}
