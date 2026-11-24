/**
 * Single-route shell (`/khu-giao-dich`) owning both Khu giao dịch and Khu Văn phòng (`?phong=van-phong`).
 *
 * - Switching rooms tears down the previous room completely (stopping its render loop, disposing its
 *   WebGL scene host with `forceContextLoss`, closing its socket and pollers) before booting the next,
 *   while keeping shared chibi-3d module caches alive across the switch.
 * - Covers every boot with the chibi `SpaceLoadingScreen`: "enter" mode on first entry, "door" mode
 *   (double doors close, then open on the new room) for door walks and Back/Forward. Progress and stage
 *   come from the room engine (`onRoomProgress`); the screen leaves only once the room reports ready
 *   (scene built, shaders warmed up, first real frame), or after a safety timeout so nobody is trapped.
 * - Enforces Floor -> Office access rules (guest LoginPrompt / cached `officeKeys.me()` non-member toast).
 * - Uses `pushState` (`replace: false`) on room changes so browser Back/Forward works cleanly.
 */
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import { officeApi } from "@/pages/office/api.ts"
import { officeKeys } from "@/pages/office/hooks.ts"
import { OfficePage } from "@/pages/office/office-page.tsx"
import type { OfficeMe } from "@/pages/office/types.ts"
import { Store, needLogin, toast, ui } from "@/pages/trading-floor/bridge.ts"
import { TradingFloorPage } from "@/pages/trading-floor/trading-floor-page.tsx"

import {
  DOOR_FADE_OUT_MS,
  DOOR_REDUCED_FADE_MS,
  FLOOR_GUEST_OFFICE_PROMPT,
  OFFICE_NON_MEMBER_TOAST,
  prefersReducedMotion,
  type RoomDoorHandle,
} from "./door-transition.ts"
import { SpaceLoadingScreen } from "./loading/SpaceLoadingScreen.tsx"
import { buildSpaceUrl, resolveSpaceRoom, type SpaceRoom } from "./spaces-url.ts"
import "./spaces.css"
import { afterFramesSettle } from "./after-frames-settle"

const ROOM_HANDOFF_DELAY_MS = 24
/** Longest the loading screen may cover a room that never reports ready (errors, stuck gates). */
export const LOADING_SAFETY_TIMEOUT_MS = 15_000

export interface SpaceLoadingState {
  visible: boolean
  /** Increments for every new loading session (remounts the screen so door panels replay). */
  session: number
  room: SpaceRoom
  mode: "enter" | "door"
  progress: number
  stage: string | undefined
  done: boolean
}

/** Loading-screen layer: subscribes to its own store so progress updates never re-render the rooms. */
function SpaceLoadingLayer({
  store,
  onExited,
}: {
  store: Store<SpaceLoadingState>
  onExited: () => void
}) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get)
  const queryClient = useQueryClient()
  if (!state.visible) return null
  const teamName =
    state.room === "office"
      ? (queryClient.getQueryData<OfficeMe>(officeKeys.me())?.team?.name ??
        undefined)
      : undefined
  return (
    <SpaceLoadingScreen
      key={state.session}
      room={state.room}
      mode={state.mode}
      progress={state.progress}
      stage={state.stage}
      done={state.done}
      teamName={teamName}
      onExited={onExited}
    />
  )
}


export function SpacesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isAuthenticated } = useAuth()

  const urlRoom = resolveSpaceRoom(searchParams)
  const [mountedRoom, setMountedRoom] = useState<SpaceRoom | null>(urlRoom)
  const [arrival, setArrival] = useState<{
    room: SpaceRoom
    viaDoor: boolean
    nonce: number
  } | null>(null)
  const [loadingStore] = useState(
    () =>
      new Store<SpaceLoadingState>({
        visible: true,
        session: 1,
        room: urlRoom,
        mode: "enter",
        progress: 0,
        stage: undefined,
        done: false,
      })
  )

  const floorDoorHandleRef = useRef<RoomDoorHandle | null>(null)
  const officeDoorHandleRef = useRef<RoomDoorHandle | null>(null)
  // True while any room is booting behind the loading screen (blocks door requests).
  const transitioningRef = useRef(true)
  const accessCheckRef = useRef(false)
  const lastCheckedUserIdRef = useRef<string | null>(null)
  const pendingTargetRef = useRef<SpaceRoom | null>(null)
  const urlRoomRef = useRef<SpaceRoom>(urlRoom)
  const mountedRoomRef = useRef<SpaceRoom | null>(urlRoom)
  const mountedRef = useRef(true)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const arrivalNonceRef = useRef(0)

  useEffect(() => {
    urlRoomRef.current = urlRoom
  }, [urlRoom])

  useEffect(() => {
    mountedRoomRef.current = mountedRoom
  }, [mountedRoom])

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

  const showLoading = useCallback(
    (room: SpaceRoom, mode: "enter" | "door") => {
      const prev = loadingStore.get()
      loadingStore.set({
        visible: true,
        session: prev.session + 1,
        room,
        mode,
        progress: 0,
        stage: undefined,
        done: false,
      })
    },
    [loadingStore]
  )

  /** Lets the loading screen play its exit; the new room is already mounted and interactive. */
  const finishLoading = useCallback(
    (session?: number) => {
      const cur = loadingStore.get()
      if (!cur.visible || cur.done) return
      if (session !== undefined && cur.session !== session) return
      clearAllTimers()
      transitioningRef.current = false
      pendingTargetRef.current = null
      loadingStore.set({ ...cur, progress: 1, done: true })
    },
    [clearAllTimers, loadingStore]
  )

  const handleLoadingExited = useCallback(() => {
    const cur = loadingStore.get()
    if (cur.done) loadingStore.set({ ...cur, visible: false })
  }, [loadingStore])

  const isLoadingRoom = useCallback(
    (room: SpaceRoom): boolean => {
      const cur = loadingStore.get()
      return (
        cur.visible &&
        !cur.done &&
        cur.room === room &&
        mountedRoomRef.current === room
      )
    },
    [loadingStore]
  )

  const handleRoomProgress = useCallback(
    (room: SpaceRoom, progress: number, stage: string) => {
      if (!isLoadingRoom(room)) return
      const cur = loadingStore.get()
      if (cur.progress === progress && cur.stage === stage) return
      loadingStore.set({ ...cur, progress, stage })
    },
    [isLoadingRoom, loadingStore]
  )

  const handleRoomReady = useCallback(
    (room: SpaceRoom) => {
      if (!isLoadingRoom(room)) return
      const cur = loadingStore.get()
      const session = cur.session
      if (cur.progress !== 1) loadingStore.set({ ...cur, progress: 1 })
      // Start the exit fade only once the first frames and the HUD mount have settled, so the
      // compositor fade is not starved by main-thread work (that looked like a flash on fast Macs).
      afterFramesSettle(() => finishLoading(session))
    },
    [finishLoading, isLoadingRoom, loadingStore]
  )

  const handleFloorReady = useCallback(
    () => handleRoomReady("floor"),
    [handleRoomReady]
  )
  const handleOfficeReady = useCallback(
    () => handleRoomReady("office"),
    [handleRoomReady]
  )
  const handleFloorProgress = useCallback(
    (progress: number, stage: string) =>
      handleRoomProgress("floor", progress, stage),
    [handleRoomProgress]
  )
  const handleOfficeProgress = useCallback(
    (progress: number, stage: string) =>
      handleRoomProgress("office", progress, stage),
    [handleRoomProgress]
  )

  const armSafetyTimeout = useCallback(() => {
    const session = loadingStore.get().session
    schedule(() => finishLoading(session), LOADING_SAFETY_TIMEOUT_MS)
  }, [finishLoading, loadingStore, schedule])

  // First entry: never let the enter-mode screen outlive a room that fails to report ready.
  useEffect(() => {
    armSafetyTimeout()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- armed once per shell mount
  }, [])

  const unmountAndBootRoom = useCallback(
    (targetRoom: SpaceRoom, viaDoor: boolean, pushHistory: boolean) => {
      clearAllTimers()
      const cur = loadingStore.get()
      if (!(cur.visible && !cur.done && cur.room === targetRoom)) {
        showLoading(targetRoom, "door")
      }
      pendingTargetRef.current = targetRoom
      transitioningRef.current = true

      // 1. Unmount current room completely so its WebGL context, rAF, sockets & pollers dispose cleanly.
      mountedRoomRef.current = null
      setMountedRoom(null)

      if (pushHistory && urlRoomRef.current !== targetRoom) {
        urlRoomRef.current = targetRoom
        navigate(buildSpaceUrl(targetRoom), { replace: false })
      }

      // 2. Mount next room after unmount commits so zero WebGL contexts overlap across the switch.
      schedule(() => {
        arrivalNonceRef.current += 1
        setArrival({
          room: targetRoom,
          viaDoor,
          nonce: arrivalNonceRef.current,
        })
        mountedRoomRef.current = targetRoom
        setMountedRoom(targetRoom)
        armSafetyTimeout()
      }, ROOM_HANDOFF_DELAY_MS)
    },
    [
      armSafetyTimeout,
      clearAllTimers,
      loadingStore,
      navigate,
      schedule,
      showLoading,
    ]
  )

  const beginFadeAndSwitch = useCallback(
    (targetRoom: SpaceRoom, viaDoor: boolean) => {
      clearAllTimers()
      const fadeOutMs = prefersReducedMotion()
        ? DOOR_REDUCED_FADE_MS
        : DOOR_FADE_OUT_MS
      transitioningRef.current = true
      pendingTargetRef.current = targetRoom
      // Door panels close over the old room, then the switch happens behind them.
      showLoading(targetRoom, "door")

      schedule(() => {
        unmountAndBootRoom(targetRoom, viaDoor, true)
      }, fadeOutMs)
    },
    [clearAllTimers, schedule, showLoading, unmountAndBootRoom]
  )

  // Synchronize external URL changes (browser Back/Forward, Header link, Notification Bell).
  useEffect(() => {
    if (urlRoom === mountedRoom || urlRoom === pendingTargetRef.current) {
      return
    }
    // Our own pushState may commit a render after `setMountedRoom(null)`: the stale URL is not a
    // navigation request (it would replay the door screen for the room being left).
    if (urlRoom !== urlRoomRef.current) {
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
          onRoomReady={handleFloorReady}
          onRoomProgress={handleFloorProgress}
          onDoorHandleReady={handleFloorDoorHandle}
        />
      )}

      {mountedRoom === "office" && (
        <OfficePage
          key={`office-${arrival?.room === "office" ? arrival.nonce : 0}`}
          arrivedViaDoor={officeArrivedViaDoor}
          onRequestTradingFloor={handleRequestTradingFloor}
          onRoomReady={handleOfficeReady}
          onRoomProgress={handleOfficeProgress}
          onDoorHandleReady={handleOfficeDoorHandle}
        />
      )}

      <SpaceLoadingLayer store={loadingStore} onExited={handleLoadingExited} />
    </div>
  )
}
